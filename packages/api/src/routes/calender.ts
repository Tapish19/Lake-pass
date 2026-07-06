/**
 * Calendar import/export.
 *
 * IMPORT: marinas paste an .ics URL (Google Calendar "Secret address in
 * iCal format", Airbnb export, Outlook, etc.) or paste raw .ics text, and
 * each VEVENT is imported as a Blockout on the chosen boat so it can't be
 * double-booked. A CalendarFeed row remembers the source so it can be
 * re-synced later (POST /calendar/feeds/:id/sync).
 *
 * EXPORT: GET /calendar/export/:boatId.ics returns a live .ics feed of a
 * boat's confirmed reservations + blockouts — marinas/customers can
 * subscribe to this URL from Google Calendar ("Other calendars → From URL")
 * to get Lake Pass bookings in their own calendar.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireMarinaManager, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { parseIcs, generateIcs } from '../lib/ics';

const router = Router();
const MAX_IMPORT_EVENTS = 500;

async function fetchIcsFromUrl(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'text/calendar, text/plain, */*' } });
  } catch {
    throw new AppError(400, 'Could not reach that calendar URL');
  }
  if (!res.ok) throw new AppError(400, `Calendar URL returned HTTP ${res.status}`);
  return res.text();
}

async function importEventsAsBlockouts(boatId: string, events: { start: Date; end: Date; summary?: string }[]) {
  let imported = 0;
  for (const ev of events.slice(0, MAX_IMPORT_EVENTS)) {
    // Skip if an identical blockout already exists (idempotent re-sync)
    const existing = await prisma.blockout.findFirst({
      where: { boatId, startDate: ev.start, endDate: ev.end },
    });
    if (existing) continue;
    await prisma.blockout.create({
      data: {
        boatId,
        startDate: ev.start,
        endDate:   ev.end,
        reason:    ev.summary ? `Imported: ${ev.summary}` : 'Imported from external calendar',
      },
    });
    imported++;
  }
  return imported;
}

// ── POST /calendar/import — import from a URL or pasted .ics text ───────────
const ImportSchema = z.object({
  boatId:     z.string(),
  label:      z.string().optional(),
  sourceType: z.enum(['ics_url', 'ics_upload', 'google']),
  url:        z.string().url().optional(),
  icsText:    z.string().optional(),
}).refine(d => d.url || d.icsText, { message: 'Provide either a URL or .ics file contents' });

router.post('/import', requireAuth, requireMarinaManager, async (req: AuthRequest, res) => {
  const data = ImportSchema.parse(req.body);

  const boat = await prisma.boat.findFirst({ where: { id: data.boatId, marinaId: req.marinaId! } });
  if (!boat) throw new AppError(404, 'Boat not found');

  const feed = await prisma.calendarFeed.create({
    data: {
      marinaId:   req.marinaId!,
      boatId:     data.boatId,
      label:      data.label ?? (data.sourceType === 'google' ? 'Google Calendar' : 'iCal feed'),
      sourceType: data.sourceType,
      url:        data.url,
    },
  });

  try {
    const icsText = data.icsText ?? await fetchIcsFromUrl(data.url!);
    const events  = parseIcs(icsText);
    const imported = await importEventsAsBlockouts(data.boatId, events);

    const updated = await prisma.calendarFeed.update({
      where: { id: feed.id },
      data:  {
        lastSyncedAt: new Date(),
        lastSyncStatus: 'success',
        lastSyncError: null,
        importedCount: { increment: imported },
      },
    });
    res.status(201).json({ feed: updated, eventsFound: events.length, imported });
  } catch (err: any) {
    await prisma.calendarFeed.update({
      where: { id: feed.id },
      data:  { lastSyncedAt: new Date(), lastSyncStatus: 'error', lastSyncError: String(err?.message ?? err) },
    });
    throw err instanceof AppError ? err : new AppError(400, 'Failed to parse calendar feed');
  }
});

// ── GET /calendar/feeds — list feeds for this marina ─────────────────────────
router.get('/feeds', requireAuth, requireMarinaManager, async (req: AuthRequest, res) => {
  const feeds = await prisma.calendarFeed.findMany({
    where:   { marinaId: req.marinaId! },
    include: { boat: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(feeds);
});

// ── POST /calendar/feeds/:id/sync — re-pull a URL-based feed ────────────────
router.post('/feeds/:id/sync', requireAuth, requireMarinaManager, async (req: AuthRequest, res) => {
  const feed = await prisma.calendarFeed.findUniqueOrThrow({ where: { id: req.params.id } });
  if (feed.marinaId !== req.marinaId) throw new AppError(403, 'Forbidden');
  if (!feed.url || !feed.boatId) throw new AppError(400, 'This feed has no URL to re-sync');

  try {
    const icsText  = await fetchIcsFromUrl(feed.url);
    const events   = parseIcs(icsText);
    const imported = await importEventsAsBlockouts(feed.boatId, events);
    const updated  = await prisma.calendarFeed.update({
      where: { id: feed.id },
      data:  {
        lastSyncedAt: new Date(),
        lastSyncStatus: 'success',
        lastSyncError: null,
        importedCount: { increment: imported },
      },
    });
    res.json({ feed: updated, eventsFound: events.length, imported });
  } catch (err: any) {
    await prisma.calendarFeed.update({
      where: { id: feed.id },
      data:  { lastSyncedAt: new Date(), lastSyncStatus: 'error', lastSyncError: String(err?.message ?? err) },
    });
    throw err instanceof AppError ? err : new AppError(400, 'Failed to re-sync calendar feed');
  }
});

// ── DELETE /calendar/feeds/:id ───────────────────────────────────────────────
router.delete('/feeds/:id', requireAuth, requireMarinaManager, async (req: AuthRequest, res) => {
  const feed = await prisma.calendarFeed.findUniqueOrThrow({ where: { id: req.params.id } });
  if (feed.marinaId !== req.marinaId) throw new AppError(403, 'Forbidden');
  await prisma.calendarFeed.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// ── GET /calendar/export/:boatId.ics — public subscribable feed ─────────────
// No auth — this is meant to be pasted into Google Calendar's "From URL"
// import, which can't supply auth headers. The boatId acts as the capability.
router.get('/export/:boatId.ics', async (req, res) => {
  const boat = await prisma.boat.findUnique({
    where:   { id: req.params.boatId },
    include: { marina: true },
  });
  if (!boat) throw new AppError(404, 'Boat not found');

  const [reservations, blockouts] = await Promise.all([
    prisma.reservation.findMany({
      where:  { boatId: boat.id, status: { in: ['pending', 'confirmed', 'checked_in', 'checked_out'] } },
      select: { id: true, startDate: true, endDate: true, status: true, walkInName: true, user: { select: { name: true } } },
    }),
    prisma.blockout.findMany({ where: { boatId: boat.id } }),
  ]);

  const events = [
    ...reservations.map(r => ({
      uid:     `reservation-${r.id}@lakepass`,
      summary: `${boat.name} — ${r.walkInName ?? r.user?.name ?? 'Reserved'} (${r.status})`,
      start:   r.startDate,
      end:     r.endDate,
    })),
    ...blockouts.map(b => ({
      uid:     `blockout-${b.id}@lakepass`,
      summary: `${boat.name} — Blocked${b.reason ? `: ${b.reason}` : ''}`,
      start:   b.startDate,
      end:     b.endDate,
    })),
  ];

  const ics = generateIcs(`${boat.marina.name} — ${boat.name}`, events);
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `inline; filename="${boat.name.replace(/[^a-z0-9]/gi, '-')}.ics"`);
  res.send(ics);
});

export default router;
