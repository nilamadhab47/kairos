import { prisma } from '@kairo/db';

/**
 * Push delivery job.
 *
 * Expo's push pipeline is two-phase:
 *   1. POST /--/api/v2/push/send returns "tickets" — Expo has accepted (or
 *      rejected) the message for its own queue. This is what we handle here.
 *   2. POST /--/api/v2/push/getReceipts (>=15 min later) returns the actual
 *      FCM/APNS-side outcome. That's done by `check-push-receipts.ts`.
 *
 * Both phases can independently mark the notification as failed or drop the
 * device token. We persist per-device outcomes in `deliveryAttempts` so the
 * alerts tab (and any future debugging) can show which device got what.
 */

export type DeliverPushJobData = {
  notificationId: string;
};

type ExpoTicket = {
  status: 'ok' | 'error';
  id?: string;
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
  // Filled in later by check-push-receipts.
  receiptStatus?: 'ok' | 'error';
  receiptError?: string | null;
};

// Ticket-time errors that mean the token is dead and we must deactivate the device.
const DEACTIVATE_ERRORS = new Set([
  'DeviceNotRegistered',
  'InvalidCredentials',
  'MismatchSenderId',
]);

function expoAccessToken(): string | undefined {
  const t = process.env.EXPO_ACCESS_TOKEN?.trim();
  return t || undefined;
}

async function sendExpoPush(
  messages: Array<{
    to: string;
    title: string;
    body?: string;
    data?: Record<string, unknown>;
    sound?: 'default' | null;
    priority?: 'default' | 'normal' | 'high';
    channelId?: string;
  }>,
): Promise<ExpoTicket[]> {
  if (messages.length === 0) return [];

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };
  const token = expoAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers,
    body: JSON.stringify(messages),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Expo push failed: ${res.status} ${res.statusText} ${text}`);
  }

  const body = (await res.json()) as { data?: ExpoTicket[]; errors?: unknown };
  return body.data ?? [];
}

export async function processDeliverPushJob(
  data: DeliverPushJobData,
): Promise<{ sent: number; failed: number; dropped: number }> {
  const notification = await prisma.notification.findUnique({
    where: { id: data.notificationId },
  });

  if (!notification) {
    console.warn('[push.send.missing]', { notificationId: data.notificationId });
    return { sent: 0, failed: 0, dropped: 0 };
  }

  // Idempotent: never re-fire a notification that already moved past `pending`.
  if (notification.status !== 'pending') {
    console.info('[push.send.skip]', {
      notificationId: notification.id,
      status: notification.status,
    });
    return { sent: 0, failed: 0, dropped: 0 };
  }

  if (notification.channel !== 'push') {
    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: 'failed',
        errorMsg: `unsupported channel: ${notification.channel}`,
      },
    });
    return { sent: 0, failed: 1, dropped: 0 };
  }

  const devices = await prisma.userDevice.findMany({
    where: { userId: notification.userId, isActive: true },
  });

  if (devices.length === 0) {
    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: 'failed',
        errorMsg: 'no active push devices',
        attemptCount: { increment: 1 },
      },
    });
    console.warn('[push.send.no_devices]', {
      notificationId: notification.id,
      userId: notification.userId,
    });
    return { sent: 0, failed: 1, dropped: 0 };
  }

  let tickets: ExpoTicket[] = [];
  let sendError: string | null = null;
  try {
    tickets = await sendExpoPush(
      devices.map((d) => ({
        to: d.expoPushToken,
        title: notification.title,
        body: notification.body ?? undefined,
        sound: 'default',
        priority: 'high',
        channelId: d.platform === 'android' ? 'default' : undefined,
        data: {
          notificationId: notification.id,
          eventId: notification.eventId,
          type: notification.type,
        },
      })),
    );
  } catch (err) {
    sendError = err instanceof Error ? err.message : String(err);
    console.error('[push.send.transport_error]', {
      notificationId: notification.id,
      error: sendError,
    });
  }

  if (sendError) {
    // Whole-batch transport failure (Expo unreachable, 5xx, etc.). BullMQ
    // will retry via `attempts`, so leave status='pending' — the retry re-runs
    // this whole function. Bump attemptCount for observability.
    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        attemptCount: { increment: 1 },
        errorMsg: sendError,
      },
    });
    throw new Error(sendError);
  }

  const attempts: DeliveryAttempt[] = [];
  const deactivateIds: string[] = [];
  let firstOkTicketId: string | null = null;
  let anyOk = false;

  for (let i = 0; i < devices.length; i += 1) {
    const device = devices[i];
    const ticket = tickets[i];
    if (!device) continue;

    if (!ticket) {
      attempts.push({
        deviceId: device.id,
        platform: device.platform,
        ticketId: null,
        ticketStatus: 'error',
        ticketError: 'no_ticket_returned',
        ticketMessage: null,
      });
      continue;
    }

    const errCode = ticket.details?.error ?? null;

    attempts.push({
      deviceId: device.id,
      platform: device.platform,
      ticketId: ticket.id ?? null,
      ticketStatus: ticket.status,
      ticketError: errCode,
      ticketMessage: ticket.message ?? null,
    });

    if (ticket.status === 'ok') {
      anyOk = true;
      if (!firstOkTicketId && ticket.id) firstOkTicketId = ticket.id;
    } else {
      console.warn('[push.send.ticket_error]', {
        notificationId: notification.id,
        deviceId: device.id,
        code: errCode,
        message: ticket.message,
      });
      if (errCode && DEACTIVATE_ERRORS.has(errCode)) {
        deactivateIds.push(device.id);
      }
    }
  }

  if (deactivateIds.length > 0) {
    await prisma.userDevice.updateMany({
      where: { id: { in: deactivateIds } },
      data: { isActive: false },
    });
    console.info('[push.device.deactivate]', {
      notificationId: notification.id,
      deviceIds: deactivateIds,
    });
  }

  // Rollup status: at least one OK ticket ⇒ 'sent' (device-level outcome
  // arrives later via receipts). Everything errored and every error was a
  // dead-token code ⇒ 'dropped'. Otherwise 'failed'.
  const allErrors = attempts.every((a) => a.ticketStatus === 'error');
  const allDeactivated =
    allErrors &&
    attempts.every(
      (a) => a.ticketError !== null && DEACTIVATE_ERRORS.has(a.ticketError),
    );

  const nextStatus = anyOk ? 'sent' : allDeactivated ? 'dropped' : 'failed';
  const failedCount = attempts.filter((a) => a.ticketStatus === 'error').length;

  const errorSummary = anyOk
    ? null
    : attempts
        .filter((a) => a.ticketStatus === 'error')
        .map((a) => a.ticketError ?? a.ticketMessage ?? 'error')
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .slice(0, 4)
        .join('; ');

  await prisma.notification.update({
    where: { id: notification.id },
    data: {
      status: nextStatus,
      sentAt: anyOk ? new Date() : notification.sentAt,
      ticketId: firstOkTicketId,
      ticketStatus: anyOk ? 'ok' : 'error',
      ticketError: anyOk
        ? null
        : attempts.find((a) => a.ticketError)?.ticketError ?? null,
      errorMsg: errorSummary,
      attemptCount: { increment: 1 },
      deliveryAttempts: attempts as unknown as object,
    },
  });

  console.info('[push.send.ok]', {
    notificationId: notification.id,
    devices: devices.length,
    ok: attempts.length - failedCount,
    errors: failedCount,
    dropped: deactivateIds.length,
    status: nextStatus,
  });

  return {
    sent: attempts.length - failedCount,
    failed: failedCount,
    dropped: deactivateIds.length,
  };
}
