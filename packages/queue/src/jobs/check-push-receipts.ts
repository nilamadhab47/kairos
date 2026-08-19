import { prisma } from '@kairo/db';

/**
 * Second-phase push tracking.
 *
 * A ticket returned by /push/send only tells us Expo has queued the message.
 * The real FCM/APNS-side outcome comes from /push/getReceipts, which Expo
 * says to poll >=15 minutes after send. This job runs on a repeatable
 * schedule, collects every notification with an OK ticket that hasn't been
 * checked yet, and updates the row.
 *
 * Batching: Expo accepts up to 1000 receipt IDs per call.
 */

type ExpoReceipt = {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
};

type DeliveryAttempt = {
  deviceId: string;
  platform: string;
  ticketId: string | null;
  ticketStatus: 'ok' | 'error';
  ticketError: string | null;
  ticketMessage: string | null;
  receiptStatus?: 'ok' | 'error';
  receiptError?: string | null;
};

// Receipt-time errors that indicate a permanently dead token.
const DEACTIVATE_ERRORS = new Set([
  'DeviceNotRegistered',
  'InvalidCredentials',
  'MismatchSenderId',
]);

const BATCH = 900; // Expo's cap is 1000; leave headroom.
const MIN_AGE_MS = 15 * 60_000; // 15 min per Expo docs.

function expoAccessToken(): string | undefined {
  const t = process.env.EXPO_ACCESS_TOKEN?.trim();
  return t || undefined;
}

async function fetchReceipts(ids: string[]): Promise<Record<string, ExpoReceipt>> {
  if (ids.length === 0) return {};
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };
  const token = expoAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
    method: 'POST',
    headers,
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`getReceipts failed: ${res.status} ${res.statusText} ${text}`);
  }
  const body = (await res.json()) as { data?: Record<string, ExpoReceipt> };
  return body.data ?? {};
}

export type CheckPushReceiptsJobData = Record<string, never>;

export async function processCheckPushReceiptsJob(): Promise<{
  checked: number;
  delivered: number;
  failed: number;
  dropped: number;
}> {
  const cutoff = new Date(Date.now() - MIN_AGE_MS);

  // Notifications with at least one OK ticket that we haven't polled yet.
  // We include `dropped` and `failed` too when they had at least one OK
  // ticket — a partial send can still resolve device-side receipts.
  const rows = await prisma.notification.findMany({
    where: {
      channel: 'push',
      ticketId: { not: null },
      receiptCheckedAt: null,
      sentAt: { lt: cutoff },
      status: { in: ['sent', 'dropped', 'failed'] },
    },
    orderBy: { sentAt: 'asc' },
    take: BATCH,
  });

  if (rows.length === 0) {
    return { checked: 0, delivered: 0, failed: 0, dropped: 0 };
  }

  // Build the flat list of ticket ids to look up. We look up every OK ticket
  // across every device — not just the row's top-level ticketId — because a
  // multi-device push can have partial failures at the receipt stage.
  const rowsByTicket = new Map<string, { row: (typeof rows)[number]; deviceId: string }>();
  const idsToCheck: string[] = [];
  for (const row of rows) {
    const attempts = Array.isArray(row.deliveryAttempts)
      ? (row.deliveryAttempts as unknown as DeliveryAttempt[])
      : [];
    for (const a of attempts) {
      if (a.ticketStatus === 'ok' && a.ticketId) {
        rowsByTicket.set(a.ticketId, { row, deviceId: a.deviceId });
        idsToCheck.push(a.ticketId);
      }
    }
    // Fallback: if deliveryAttempts wasn't populated (older rows), use the
    // top-level ticketId — worst case we mark the whole notification.
    if (rowsByTicket.size === 0 && row.ticketId) {
      rowsByTicket.set(row.ticketId, { row, deviceId: '__unknown__' });
      idsToCheck.push(row.ticketId);
    }
  }

  let receipts: Record<string, ExpoReceipt>;
  try {
    receipts = await fetchReceipts(idsToCheck);
  } catch (err) {
    console.error('[push.receipt.transport_error]', {
      count: idsToCheck.length,
      error: err instanceof Error ? err.message : String(err),
    });
    // Don't mark checked — we'll retry on the next tick.
    throw err;
  }

  // Group updates by notification row.
  type Aggregate = {
    row: (typeof rows)[number];
    attempts: DeliveryAttempt[];
    deactivateDeviceIds: Set<string>;
    okCount: number;
    errorCount: number;
    firstError: string | null;
  };
  const byRow = new Map<string, Aggregate>();
  for (const row of rows) {
    const attempts = Array.isArray(row.deliveryAttempts)
      ? [...(row.deliveryAttempts as unknown as DeliveryAttempt[])]
      : [];
    byRow.set(row.id, {
      row,
      attempts,
      deactivateDeviceIds: new Set(),
      okCount: 0,
      errorCount: 0,
      firstError: null,
    });
  }

  for (const [ticketId, receipt] of Object.entries(receipts)) {
    const link = rowsByTicket.get(ticketId);
    if (!link) continue;
    const agg = byRow.get(link.row.id);
    if (!agg) continue;

    const attempt = agg.attempts.find((a) => a.ticketId === ticketId);
    if (attempt) {
      attempt.receiptStatus = receipt.status;
      attempt.receiptError = receipt.details?.error ?? null;
    }

    if (receipt.status === 'ok') {
      agg.okCount += 1;
    } else {
      agg.errorCount += 1;
      const code = receipt.details?.error ?? receipt.message ?? 'unknown';
      if (!agg.firstError) agg.firstError = code;
      if (
        receipt.details?.error &&
        DEACTIVATE_ERRORS.has(receipt.details.error) &&
        link.deviceId !== '__unknown__'
      ) {
        agg.deactivateDeviceIds.add(link.deviceId);
      }
    }
  }

  let delivered = 0;
  let failed = 0;
  let dropped = 0;

  const now = new Date();
  const devicesToDeactivate = new Set<string>();

  for (const agg of byRow.values()) {
    for (const id of agg.deactivateDeviceIds) devicesToDeactivate.add(id);

    // "Delivered" is a strong signal — we set it only when at least one
    // receipt came back OK. Everything erroring stays 'failed' (or moves to
    // 'dropped' when every error was a dead-token code).
    const anyOk = agg.okCount > 0;
    const anyReceipt = agg.okCount + agg.errorCount > 0;
    const allDropped =
      !anyOk &&
      agg.errorCount > 0 &&
      Object.entries(receipts).every(([ticketId, r]) => {
        if (rowsByTicket.get(ticketId)?.row.id !== agg.row.id) return true;
        return r.status === 'error' && r.details?.error && DEACTIVATE_ERRORS.has(r.details.error);
      });

    let nextStatus = agg.row.status;
    if (anyOk) {
      nextStatus = 'delivered';
      delivered += 1;
    } else if (anyReceipt) {
      nextStatus = allDropped ? 'dropped' : 'failed';
      if (allDropped) dropped += 1;
      else failed += 1;
    }

    await prisma.notification.update({
      where: { id: agg.row.id },
      data: {
        status: nextStatus,
        receiptStatus: anyOk ? 'ok' : anyReceipt ? 'error' : null,
        receiptError: anyOk ? null : agg.firstError,
        receiptCheckedAt: now,
        deliveryAttempts: agg.attempts as unknown as object,
      },
    });
  }

  if (devicesToDeactivate.size > 0) {
    await prisma.userDevice.updateMany({
      where: { id: { in: [...devicesToDeactivate] } },
      data: { isActive: false },
    });
    console.info('[push.receipt.device_deactivate]', {
      deviceIds: [...devicesToDeactivate],
    });
  }

  console.info('[push.receipt.batch]', {
    checked: rows.length,
    delivered,
    failed,
    dropped,
    devicesDeactivated: devicesToDeactivate.size,
  });

  return {
    checked: rows.length,
    delivered,
    failed,
    dropped,
  };
}
