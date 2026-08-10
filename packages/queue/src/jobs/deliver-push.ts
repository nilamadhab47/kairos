import { prisma } from '@kairo/db';

export type DeliverPushJobData = {
  notificationId: string;
};

type ExpoTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

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
  }>,
): Promise<ExpoTicket[]> {
  if (messages.length === 0) return [];

  const headers: Record<string, string> = {
    Accept: 'application/json',
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
    throw new Error(`Expo push failed: ${res.status} ${res.statusText}`);
  }

  const body = (await res.json()) as { data?: ExpoTicket[] };
  return body.data ?? [];
}

export async function processDeliverPushJob(
  data: DeliverPushJobData,
): Promise<{ sent: number; failed: number }> {
  const notification = await prisma.notification.findUnique({
    where: { id: data.notificationId },
  });

  if (!notification) {
    return { sent: 0, failed: 0 };
  }

  if (notification.status === 'sent') {
    return { sent: 0, failed: 0 };
  }

  if (notification.channel !== 'push') {
    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: 'failed',
        errorMsg: `unsupported channel: ${notification.channel}`,
      },
    });
    return { sent: 0, failed: 1 };
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
      },
    });
    return { sent: 0, failed: 1 };
  }

  const tickets = await sendExpoPush(
    devices.map((d) => ({
      to: d.expoPushToken,
      title: notification.title,
      body: notification.body ?? undefined,
      data: {
        notificationId: notification.id,
        eventId: notification.eventId,
        type: notification.type,
      },
    })),
  );

  const deactivateIds: string[] = [];
  for (let i = 0; i < tickets.length; i += 1) {
    const ticket = tickets[i];
    const device = devices[i];
    if (!ticket || !device || ticket.status !== 'error') continue;
    const code = ticket.details?.error;
    if (code && DEACTIVATE_ERRORS.has(code)) {
      deactivateIds.push(device.id);
    }
  }

  if (deactivateIds.length > 0) {
    await prisma.userDevice.updateMany({
      where: { id: { in: deactivateIds } },
      data: { isActive: false },
    });
  }

  const failed = tickets.filter((t) => t.status === 'error').length;
  const sent = tickets.length - failed;

  await prisma.notification.update({
    where: { id: notification.id },
    data: {
      status: failed === tickets.length ? 'failed' : 'sent',
      sentAt: new Date(),
      errorMsg:
        failed > 0
          ? tickets
              .filter((t) => t.status === 'error')
              .map((t) => t.message ?? t.details?.error ?? 'error')
              .join('; ')
          : null,
    },
  });

  return { sent, failed };
}
