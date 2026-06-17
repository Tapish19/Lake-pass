import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { requireAuth, requireMarinaStaff, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import {
  sendConfirmation, sendReminder, sendNoShowNotice, sendCancellationNotice,
} from '../lib/notifications';

const router = Router();

// ── schemas ───────────────────────────────────────────────────────────────────

const CreateReservationSchema = z.object({
  boatId:    z.string(),
  startDate: z.coerce.date(),
  endDate:   z.coerce.date(),
  addonIds:  z.array(z.string()).default([]), // IDs from Addon catalog
  notes:     z.string().optional(),
});

// Staff-only: walk-in / phone booking (no consumer Clerk account required)
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
  // In production: front-end sends the signerName + agreement checkbox;
  // IP is captured server-side from the request.
  signerName:    z.string().min(1),
  agreed:        z.literal(true, { errorMap: () => ({ message: 'You must agree to the waiver' }) }),
});

// ── helpers ───────────────────────────────────────────────────────────────────

async function assertNoConflict(boatId: string, startDate: Date, endDate: Date, excludeId?: string) {
  const [res, blk] = await Promise.all([
    prisma.reservation.findFirst({
      where: {
        boatId, id: excludeId ? { not: excludeId } : undefined,
        status: { in: ['pending', 'confirmed', 'checked_in'] },
        AND: [{ startDate: { lt: endDate } }, { endDate: { gt: startDate } }],
      },
    }),
    prisma.blockout.findFirst({
      where: { boatId, AND: [{ startDate: { lt: endDate } }, { endDate: { gt: startDate } }] },
    }),
  ]);
  if (res) throw new AppError(409, 'Boat is not available for the selected dates');
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

// ── POST /reservations — consumer booking ─────────────────────────────────────
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

// ── POST /reservations/walk-in — staff manual booking ─────────────────────────
router.post('/walk-in', requireAuth, requireMarinaStaff, async (req: AuthRequest, res) => {
  const data = WalkInSchema.parse(req.body);
  if (data.endDate <= data.startDate) throw new AppError(400, 'End date must be after start date');

  // For walk-ins we need a User row to satisfy the FK. We either find an
  // existing account by email, or create a placeholder "walk-in" user.
  let userId: string;
  if (data.walkInEmail) {
    let user = await prisma.user.findUnique({ where: { email: data.walkInEmail } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          clerkId: `walkin_${randomUUID()}`, // UUID — safe under concurrent load
          name:    data.walkInName,
          email:   data.walkInEmail,
          phone:   data.walkInPhone,
        },
      });
    }
    userId = user.id;
  } else {
    // Create anonymous walk-in placeholder user
    const anon = await prisma.user.create({
      data: {
        clerkId: `walkin_${randomUUID()}`,
        name:    data.walkInName,
        email:   `walkin_${randomUUID()}@lakepass.local`,
        phone:   data.walkInPhone,
      },
    });
    userId = anon.id;
  }

  await assertNoConflict(data.boatId, data.startDate, data.endDate);
  const { addons, rentalAmount, addonAmount, platformFee, totalAmount, depositAmount } =
    await calcTotals(data.boatId, data.startDate, data.endDate, data.addonIds);

  const reservation = await prisma.reservation.create({
    data: {
      boatId: data.boatId, userId,
      startDate: data.startDate, endDate: data.endDate,
      notes: data.notes,
      // Staff manually confirmed walk-in bookings
      status: 'confirmed',
      walkInName: data.walkInName, walkInPhone: data.walkInPhone, walkInEmail: data.walkInEmail,
      rentalAmount, addonAmount, platformFee, totalAmount, depositAmount,
      addons: { create: addons.map(a => ({ addonId: a.id, name: a.name, price: a.price })) },
    },
    include: { boat: { include: { marina: true } }, user: true, addons: true },
  });

  res.status(201).json(reservation);
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

  const updated = await prisma.reservation.update({
    where: { id: reservationId },
    data:  { waiverSignedAt: new Date(), waiverIpAddress: ip },
  });

  res.json({ message: 'Waiver signed', signedAt: updated.waiverSignedAt, ipAddress: ip, signerName, agreed });
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

// ── status transition helpers ─────────────────────────────────────────────────

router.patch('/:id/cancel', requireAuth, async (req: AuthRequest, res) => {
  const r = await prisma.reservation.findUniqueOrThrow({ where: { id: req.params.id }, include: { boat: true, user: true } });
  const ok = r.userId === req.userId || (!!req.marinaId && r.boat.marinaId === req.marinaId);
  if (!ok) throw new AppError(403, 'Forbidden');
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
  if (r.status !== 'checked_in') throw new AppError(400, 'Reservation must be checked_in before check-out — cannot skip check-in');
  if (!r.checkedInAt) throw new AppError(400, 'No check-in timestamp found — use the check-in endpoint first');
  const updated = await prisma.reservation.update({
    where: { id: req.params.id }, data: { status: 'checked_out', checkedOutAt: new Date() },
  });
  res.json(updated);
});

router.patch('/:id/no-show', requireAuth, requireMarinaStaff, async (req: AuthRequest, res) => {
  const r = await prisma.reservation.findUniqueOrThrow({ where: { id: req.params.id }, include: { boat: true, user: true } });
  if (r.boat.marinaId !== req.marinaId) throw new AppError(403, 'Forbidden');
  if (!['pending','confirmed'].includes(r.status)) throw new AppError(400, 'Can only mark pending/confirmed as no-show');
  await prisma.reservation.update({ where: { id: req.params.id }, data: { status: 'no_show' } });
  const full = await getReservationForNotif(req.params.id);
  await sendNoShowNotice(full).catch(() => {});
  res.json({ status: 'no_show' });
});

export default router;
