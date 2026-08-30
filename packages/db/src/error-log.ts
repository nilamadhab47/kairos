import { createHash } from 'node:crypto';
import { prisma } from './client.js';

const MAX_ROWS = 100;
const MIN_TOUCH_MS = 5 * 60_000;
const MSG_MAX = 400;
const STACK_MAX = 1200;

export type AppErrorSource = 'api' | 'worker' | 'mobile';

function fingerprint(source: string, name: string, message: string, path?: string): string {
  return createHash('sha256')
    .update([source, name, message.slice(0, 200), path ?? ''].join('|'))
    .digest('hex')
    .slice(0, 32);
}

function clip(value: string | undefined, max: number): string | null {
  if (!value) return null;
  const t = value.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * One row per unique error. Caps the table at 100 rows. Touches an existing
 * row at most once per 5 minutes so a tight loop cannot burn write units.
 * Never throws — logging must not take down the process that failed.
 */
export async function recordAppError(input: {
  source: AppErrorSource;
  name?: string;
  message: string;
  stack?: string;
  path?: string;
}): Promise<void> {
  try {
    const name = clip(input.name ?? 'Error', 80) ?? 'Error';
    const message = clip(input.message, MSG_MAX) ?? 'unknown';
    const path = clip(input.path, 180) ?? undefined;
    const fp = fingerprint(input.source, name, message, path);
    const now = new Date();

    const existing = await prisma.appError.findUnique({ where: { fingerprint: fp } });
    if (existing) {
      if (now.getTime() - existing.lastSeenAt.getTime() < MIN_TOUCH_MS) return;
      await prisma.appError.update({
        where: { fingerprint: fp },
        data: { count: { increment: 1 }, lastSeenAt: now },
      });
      return;
    }

    const total = await prisma.appError.count();
    if (total >= MAX_ROWS) {
      const oldest = await prisma.appError.findFirst({
        orderBy: { lastSeenAt: 'asc' },
        select: { id: true },
      });
      if (oldest) await prisma.appError.delete({ where: { id: oldest.id } });
    }

    await prisma.appError.create({
      data: {
        fingerprint: fp,
        source: input.source,
        name,
        message,
        stack: clip(input.stack, STACK_MAX),
        path: path ?? null,
        count: 1,
        firstSeenAt: now,
        lastSeenAt: now,
      },
    });
  } catch {
    // swallow
  }
}
