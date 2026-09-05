import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@kairo/db';
import { effectiveMatchStatus } from '@kairo/core';
import { personalizedMatchWhere } from '../lib/subscriptions.js';
import { buildIcsCalendar, type IcsEvent } from '../lib/ics.js';
import { loadEnv } from '../config/env.js';

/** How far back / ahead the subscription feed materializes fixtures. */
const FEED_PAST_DAYS = 30;
const FEED_FUTURE_DAYS = 180;

function publicBaseUrl(): string {
  const env = loadEnv();
  // API_URL is the browser/calendar-reachable origin in prod; fall back to
  // the auth URL, then localhost for dev.
  return (env.API_URL || env.BETTER_AUTH_URL || 'http://localhost:4000').replace(/\/$/, '');
}

function feedUrls(token: string) {
  const base = publicBaseUrl();
  const icsUrl = `${base}/api/calendar/${token}.ics`;
  const webcalUrl = icsUrl.replace(/^https?:\/\//, 'webcal://');
  // Google Calendar "add by URL" deep link.
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;
  return { icsUrl, webcalUrl, googleUrl };
}

function newToken(): string {
  // URL-safe, unguessable. 24 bytes ≈ 32 base64url chars.
  return randomBytes(24).toString('base64url');
}

function icsStatus(status: string): IcsEvent['status'] {
  const s = status.toLowerCase();
  if (s === 'cancelled' || s === 'postponed') return 'CANCELLED';
  if (s === 'scheduled' || s === 'upcoming' || s === 'ns' || s === 'not_started') {
    return 'CONFIRMED';
  }
  return 'CONFIRMED';
}

export async function registerCalendarFeedRoutes(app: FastifyInstance): Promise<void> {
  // ---- Authenticated management --------------------------------------------

  app.get(
    '/api/me/calendar-feed',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['me'],
        security: [{ bearerAuth: [] }],
        summary: 'Current calendar-subscription feed status + URLs (if enabled).',
      },
    },
    async (req) => {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.sessionUser!.id },
        select: { calendarToken: true },
      });
      if (!user.calendarToken) return { connected: false as const };
      return { connected: true as const, ...feedUrls(user.calendarToken) };
    },
  );

  app.post(
    '/api/me/calendar-feed',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['me'],
        security: [{ bearerAuth: [] }],
        summary:
          'Enable (or rotate) the personal calendar-subscription feed. Returns the ICS / webcal / Google URLs.',
      },
    },
    async (req) => {
      const token = newToken();
      await prisma.user.update({
        where: { id: req.sessionUser!.id },
        data: { calendarToken: token },
      });
      return { connected: true as const, ...feedUrls(token) };
    },
  );

  app.delete(
    '/api/me/calendar-feed',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['me'],
        security: [{ bearerAuth: [] }],
        summary: 'Disable the calendar-subscription feed (revokes the URL).',
      },
    },
    async (req) => {
      await prisma.user.update({
        where: { id: req.sessionUser!.id },
        data: { calendarToken: null },
      });
      return { connected: false as const };
    },
  );

  // ---- Public ICS feed (no auth — the token IS the credential) -------------

  app.get(
    '/api/calendar/:token.ics',
    {
      schema: {
        tags: ['calendar'],
        summary:
          'Personal iCalendar feed of followed fixtures. Subscribe by URL in Google/Apple/Outlook.',
        params: {
          type: 'object',
          required: ['token'],
          properties: { token: { type: 'string' } },
        },
      },
    },
    async (req, reply) => {
      const { token } = req.params as { token: string };
      // Tolerate clients that append a second `.ics`.
      const clean = token.replace(/\.ics$/i, '');
      if (!clean || clean.length < 16) {
        return reply.code(404).send({ error: 'not_found' });
      }

      const user = await prisma.user.findFirst({
        where: { calendarToken: clean },
        select: { id: true, name: true, timezone: true },
      });
      if (!user) return reply.code(404).send({ error: 'not_found' });

      const base = await personalizedMatchWhere(user.id);

      let events: IcsEvent[] = [];
      if (base) {
        const from = new Date(Date.now() - FEED_PAST_DAYS * 24 * 60 * 60 * 1000);
        const to = new Date(Date.now() + FEED_FUTURE_DAYS * 24 * 60 * 60 * 1000);
        const matches = await prisma.match.findMany({
          where: { AND: [base, { startsAt: { gte: from, lt: to } }] },
          select: {
            id: true,
            sportId: true,
            startsAt: true,
            status: true,
            venue: true,
            round: true,
            lastSyncedAt: true,
            competition: { select: { name: true, displayName: true } },
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
          },
          orderBy: { startsAt: 'asc' },
          take: 1000,
        });

        events = matches.map((m) => {
          const compLabel = m.competition.displayName ?? m.competition.name;
          const status = effectiveMatchStatus(m.status, m.startsAt, m.sportId);
          const hasSides = Boolean(m.homeTeam && m.awayTeam);
          const title = hasSides
            ? `${m.homeTeam!.name} v ${m.awayTeam!.name}`
            : m.round
              ? `${compLabel} — ${m.round}`
              : compLabel;
          const descParts = [
            compLabel,
            hasSides && m.round ? m.round : null,
            `Status: ${status}`,
          ].filter(Boolean) as string[];
          return {
            uid: m.id,
            start: m.startsAt,
            summary: title,
            description: descParts.join('\n'),
            location: m.venue,
            status: icsStatus(m.status),
            updatedAt: m.lastSyncedAt,
          } satisfies IcsEvent;
        });
      }

      const ics = buildIcsCalendar(events, {
        name: `Kairo — ${user.name}'s sports`,
        timezone: user.timezone,
      });

      reply
        .header('Content-Type', 'text/calendar; charset=utf-8')
        .header('Content-Disposition', 'inline; filename="kairo.ics"')
        // Let Google/Apple cache briefly but re-poll for score/time updates.
        .header('Cache-Control', 'public, max-age=900')
        .send(ics);
    },
  );
}
