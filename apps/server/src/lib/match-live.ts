import type { Prisma } from '@prisma/client';
import { liveWindowMs } from '@kairo/core';

const SPORTS = ['football', 'cricket', 'f1', 'tennis', 'basketball', 'hockey', 'baseball'] as const;

/**
 * Matches that should appear in the Live rail: kicked off within the
 * sport's in-play window and not already cancelled/postponed/finished.
 */
export function liveFeedWhere(now = new Date()): Prisma.MatchWhereInput {
  return {
    OR: SPORTS.map((sportId) => ({
      sportId,
      status: {
        notIn: ['cancelled', 'canceled', 'postponed', 'completed', 'complete', 'ft', 'finished'],
      },
      startsAt: { gte: new Date(now.getTime() - liveWindowMs(sportId)), lte: now },
    })),
  };
}
