import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireMarinaStaff, requireMarinaManager, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import {
  sendConfirmation, sendReminder, sendNoShowNotice, sendCancellationNotice,
} from '../lib/notifications';

const router = Router();

const WAIVER_VERSION = '2024-v1';
const WAIVER_TEXT = `
LAKE PASS RENTAL WAIVER AND RELEASE OF LIABILITY

By signing this waiver, the renter ("Renter") agrees to the following terms:

1. ASSUMPTION OF RISK: Renter voluntarily assumes all risks associated with boating activities, including but not limited to drowning, collision, capsizing, and adverse weather conditions.

2. RELEASE OF LIABILITY: Renter releases Lake Pass, the marina, and their respective agents from any and all liability for personal injury, property damage, or death arising from use of the rented vessel.

3. SAFE OPERATION: Renter agrees to operate the vessel in a safe and lawful manner, in compliance with all applicable state and federal boating laws. Renter confirms they hold any required boating license or certification.

4. VESSEL CONDITION: Renter agrees to return the vessel in the same condition as received, normal wear and tear excepted. Renter is financially responsible for any damage caused during the rental period.

5. ALCOHOL AND SUBSTANCE POLICY: Operating the vessel under the influence of alcohol or controlled substances is strictly prohibited.

6. LIFE JACKET REQUIREMENT: Renter agrees to ensure all passengers wear properly fitted life jackets at all times while on the water.

7. INDEMNIFICATION: Renter agrees to indemnify and hold harmless Lake Pass and the marina from any claims, demands, or actions arising from Renter's use of the vessel.

This waiver is legally binding. By agreeing, the Renter confirms they have read, understood, and voluntarily accepted these terms.

Waiver Version: ${WAIVER_VERSION}
`.trim();

const CreateReservationSchema = z.object({
  boatId:    z.string(),
  startDate: z.coerce.date(),
  endDate:   z.coerce.date(),
  addonIds:  z.array(z.string()).default([]),
  notes:     z.string().optional(),
});

const WalkInSchema = z.object({
  boatId:      z.string(),
  startDate:   z.coerce.date(),
  endDate:     z.coerce.date(),
  addonIds:    z.array(z.string()).default([]),
  notes:       z.string().optional(),
  walkInName:  z.string().min(1),
  walkInPhone: z.string().optional(),
  walkInEmail: z.string().email().optional(),
});

const WaiverSchema = z.object({
  reservationId: z.string(),
  signerName:    z.string().min(1),
  agreed:        z.literal(true, { errorMap: () => ({ message: 'You must agree to the waiver' }) }),
});

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * assertNoConflict checks reservations AND blockouts, and also respects each
 * boat's turnaroundBuffer (minutes). The buffer is applied symmetrically:
 * a new reservation must not start within `buffer` minutes of an existing
 * reservation's end, and must not end within `buffer` minutes of an existing
 * reservation's start.
 */
async function assertNoConflict(boatId: string, startDate: Date, endDate: Date, excludeId?: string) {
  const boat = await prisma.boat.findUniqueOrThrow({ where: { id: boatId }, select: { turnaroundBuffer: true } });
  const bufferMs = (boat.turnaroundBuffer ?? 0) * 60 * 1000;

  // Expand the window we're checking by the buffer on each side
  const windowStart = new Date(startDate.getTime() - bufferMs);
  const windowEnd   = new Date(endDate.getTime()   + bufferMs);

  const [res, blk] = await Promise.all([
    prisma.reservation.findFirst({
      where: {
        boatId, id: excludeId ? { not: excludeId } : undefined,
        status: { in: ['pending', 'confirmed', 'checked_in'] },
        AND: [{ startDate: { lt: windowEnd } }, { endDate: { gt: windowStart } }],
      },
    }),
    prisma.blockout.findFirst({
      where: { boatId, AND: [{ startDate: { lt: endDate } }, { endDate: { gt: startDate } }] },
    }),
  ]);
  if (res) throw new AppError(409, 'Boat is not available for the selected dates (including turnaround buffer)');
  if (blk) throw new AppError(409, 'Boat is blocked for maintenance during those dates');
}

function nights(start: Date, end: Date) {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

async function calcTotals(boatId: string, start: Date, end: Date, addonIds: string[]) {
  const boat = await prisma.boat.findUniqueOrThrow({ where: { id: boatId } });
  const addons = addonIds.length
    ? await prisma.addon.findMany({ where: { id: { in: addonIds } } })
    : [];

  const rentalAmount  = boat.dailyRate * nights(start, end);
  const addonAmount   = addons.reduce((s, a) => s + a.price, 0);
  const platformFee   = Math.round((rentalAmount + addonAmount) * 0.10 * 100) / 100;
  const totalAmount   = Math.round((rentalAmount + addonAmount + platformFee) * 100) / 100;
  const depositAmount = Math.round(totalAmount * 0.25 * 100) / 100;
  return { boat, addons, rentalAmount, addonAmount, platformFee, totalAmount, depositAmount };
}

async function getReservationForNotif(id: string) {
  return prisma.reservation.findUniqueOrThrow({
    where:   { id },
    include: { boat: { include: { marina: true } }, user: true },
  });
}

async function getOrCreateWalkInPlaceholder(marinaId: string): Promise<string> {
  const placeholderClerkId = `walkin_placeholder_${marinaId}`;
  const existing = await prisma.user.findUnique({ where: { clerkId: placeholderClerkId } });
  if (existing) return existing.id;

  const placeholder = await prisma.user.create({
    data: {
      clerkId: placeholderClerkId,
      name:    'Walk-in Customer',
      email:   `walkin_placeholder_${marinaId}@lakepass.internal`,
    },
  });
  return placeholder.id;
}

// ── POST /reservations ────────────────────────────────────────────────────────
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  if (!req.userId) throw new AppError(403, 'Only consumer accounts can create reservations');
  const data = CreateReservationSchema.parse(req.body);
  if (data.endDate <= data.startDate) throw new AppError(400, 'End date must be after start date');
  if (data.startDate < new Date(new Date().setHours(0,0,0,0))) throw new AppError(400, 'Start date cannot be in the past');

  await assertNoConflict(data.boatId, data.startDate, data.endDate);
  const { addons, rentalAmount, addonAmount, platformFee, totalAmount, depositAmount } =
    await calcTotals(data.boatId, data.startDate, data.endDate, data.addonIds);

  const reservation = await prisma.reservation.create({
    data: {
      boatId: data.boatId, userId: req.userId,
      startDate: data.startDate, endDate: data.endDate,
      notes: data.notes, status: 'pending',
      rentalAmount, addonAmount, platformFee, totalAmount, depositAmount,
      addons: {
        create: addons.map(a => ({ addonId: a.id, name: a.name, price: a.price })),
      },
    },
    include: { boat: { include: { marina: true } }, user: true, addons: true },
  });

  res.status(201).json(reservation);
});

// ── POST /reservations/walk-in ────────────────────────────────────────────────
router.post('/walk-in', requireAuth, requireMarinaManager, async (req: AuthRequest, res) => {
  const data = WalkInSchema.parse(req.body);
  if (data.endDate <= data.startDate) throw new AppError(400, 'End date must be after start date');

  let userId: string;
  if (data.walkInEmail) {
    const existing = await prisma.user.findUnique({ where: { email: data.walkInEmail } });
    userId = existing?.id ?? await getOrCreateWalkInPlaceholder(req.marinaId!);
  } else {
    userId = await getOrCreateWalkInPlaceholder(req.marinaId!);
  }

  await assertNoConflict(data.boatId, data.startDate, data.endDate);
  const { addons, rentalAmount, addonAmount, platformFee, totalAmount, depositAmount } =
    await calcTotals(data.boatId, data.startDate, data.endDate, data.addonIds);

  const reservation = await prisma.reservation.create({
    data: {
      boatId: data.boatId, userId,
      startDate: data.startDate, endDate: data.endDate,
      notes: data.notes,
      status: 'confirmed',
      walkInName: data.walkInName, walkInPhone: data.walkInPhone, walkInEmail: data.walkInEmail,
      rentalAmount, addonAmount, platformFee, totalAmount, depositAmount,
      addons: { create: addons.map(a => ({ addonId: a.id, name: a.name, price: a.price })) },
    },
    include: { boat: { include: { marina: true } }, user: true, addons: true },
  });

  res.status(201).json(reservation);
});

// ── GET /reservations/waiver-text ─────────────────────────────────────────────
router.get('/waiver-text', (_req, res) => {
  res.json({ version: WAIVER_VERSION, text: WAIVER_TEXT });
});

// ── POST /reservations/sign-waiver ────────────────────────────────────────────
router.post('/sign-waiver', requireAuth, async (req: AuthRequest, res) => {
  const { reservationId, signerName, agreed } = WaiverSchema.parse(req.body);

  const r = await prisma.reservation.findUniqueOrThrow({
    where:   { id: reservationId },
    include: { boat: true },
  });

  const canSign = r.userId === req.userId || r.boat.marinaId === req.marinaId;
  if (!canSign) throw new AppError(403, 'Forbidden');
  if (r.waiverSignedAt) return res.json({ message: 'Waiver already signed', signedAt: r.waiverSignedAt });

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    ?? req.socket.remoteAddress
    ?? 'unknown';

  const signedAt = new Date();

  const updated = await prisma.reservation.update({
    where: { id: reservationId },
    data:  {
      waiverSignedAt:     signedAt,
      waiverIpAddress:    ip,
      waiverSignerName:   signerName,
      waiverVersion:      WAIVER_VERSION,
      waiverTextSnapshot: WAIVER_TEXT,
    },
  });

  res.json({
    message:       'Waiver signed',
    signedAt:      updated.waiverSignedAt,
    ipAddress:     ip,
    signerName,
    waiverVersion: WAIVER_VERSION,
    agreed,
  });
});

// ── GET /reservations ─────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  if (!req.userId) throw new AppError(403, 'Consumer account required');
  const reservations = await prisma.reservation.findMany({
    where:   { userId: req.userId },
    include: { boat: { include: { marina: true } }, addons: true },
    orderBy: { startDate: 'asc' },
  });
  res.json(reservations);
});

// ── GET /reservations/marina ──────────────────────────────────────────────────
router.get('/marina', requireAuth, requireMarinaStaff, async (req: AuthRequest, res) => {
  const { status, from, to } = req.query;
  const reservations = await prisma.reservation.findMany({
    where: {
      boat: { marinaId: req.marinaId },
      ...(status ? { status: String(status) as any } : {}),
      ...(from   ? { startDate: { gte: new Date(String(from)) } } : {}),
      ...(to     ? { endDate:   { lte: new Date(String(to))   } } : {}),
    },
    include: {
      boat:   true,
      user:   { select: { id: true, name: true, email: true, phone: true } },
      addons: true,
    },
    orderBy: { startDate: 'asc' },
  });
  res.json(reservations);
});

// ── GET /reservations/:id ─────────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  const r = await prisma.reservation.findUniqueOrThrow({
    where:   { id: req.params.id },
    include: { boat: { include: { marina: true } }, user: true, addons: true },
  });
  if (r.userId !== req.userId && r.boat.marinaId !== req.marinaId) throw new AppError(403, 'Forbidden');
  res.json(r);
});

// ── status transitions ────────────────────────────────────────────────────────

router.patch('/:id/cancel', requireAuth, async (req: AuthRequest, res) => {
  const r = await prisma.reservation.findUniqueOrThrow({ where: { id: req.params.id }, include: { boat: true, user: true } });
  const isConsumerOwner   = r.userId === req.userId;
  const isManagerOrAbove  = !!req.marinaId && r.boat.marinaId === req.marinaId &&
    (req.staffRole === 'owner' || req.staffRole === 'manager');
  if (!isConsumerOwner && !isManagerOrAbove) throw new AppError(403, 'Forbidden');
  if (['cancelled','checked_out','no_show'].includes(r.status)) throw new AppError(400, 'Cannot cancel in current state');
  await prisma.reservation.update({ where: { id: req.params.id }, data: { status: 'cancelled' } });
  const full = await getReservationForNotif(req.params.id);
  await sendCancellationNotice(full).catch(() => {});
  res.json({ status: 'cancelled' });
});

router.patch('/:id/confirm', requireAuth, requireMarinaStaff, async (req: AuthRequest, res) => {
  const r = await prisma.reservation.findUniqueOrThrow({ where: { id: req.params.id }, include: { boat: true, user: true } });
  if (r.boat.marinaId !== req.marinaId) throw new AppError(403, 'Forbidden');
  await prisma.reservation.update({ where: { id: req.params.id }, data: { status: 'confirmed' } });
  const full = await getReservationForNotif(req.params.id);
  await sendConfirmation(full).catch(() => {});
  res.json({ status: 'confirmed' });
});

router.patch('/:id/check-in', requireAuth, requireMarinaStaff, async (req: AuthRequest, res) => {
  const r = await prisma.reservation.findUniqueOrThrow({ where: { id: req.params.id }, include: { boat: true } });
  if (r.boat.marinaId !== req.marinaId) throw new AppError(403, 'Forbidden');
  if (r.status !== 'confirmed') throw new AppError(400, 'Must be confirmed before check-in');
  if (!r.waiverSignedAt) throw new AppError(400, 'Waiver must be signed before check-in');
  const updated = await prisma.reservation.update({
    where: { id: req.params.id }, data: { status: 'checked_in', checkedInAt: new Date() },
  });
  res.json(updated);
});

router.patch('/:id/check-out', requireAuth, requireMarinaStaff, async (req: AuthRequest, res) => {
  const r = await prisma.reservation.findUniqueOrThrow({ where: { id: req.params.id }, include: { boat: true } });
  if (r.boat.marinaId !== req.marinaId) throw new AppError(403, 'Forbidden');
  if (r.status !== 'checked_in') throw new AppError(400, 'Reservation must be checked_in before check-out');
  const updated = await prisma.reservation.update({
    where: { id: req.params.id }, data: { status: 'checked_out', checkedOutAt: new Date() },
  });
  res.json(updated);
});

router.patch('/:id/no-show', requireAuth, requireMarinaManager, async (req: AuthRequest, res) => {
  const r = await prisma.reservation.findUniqueOrThrow({ where: { id: req.params.id }, include: { boat: true, user: true } });
  if (r.boat.marinaId !== req.marinaId) throw new AppError(403, 'Forbidden');
  if (!['pending','confirmed'].includes(r.status)) throw new AppError(400, 'Can only mark pending/confirmed as no-show');
  await prisma.reservation.update({ where: { id: req.params.id }, data: { status: 'no_show' } });
  const full = await getReservationForNotif(req.params.id);
  await sendNoShowNotice(full).catch(() => {});
  res.json({ status: 'no_show' });
});

export default router;
