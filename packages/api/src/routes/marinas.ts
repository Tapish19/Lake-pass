import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireMarinaStaff, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

const CreateMarinaSchema = z.object({
  name:      z.string().min(1),
  lake:      z.string().min(1),
  address:   z.string(),
  city:      z.string(),
  state:     z.string(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  phone:     z.string().optional(),
  website:   z.string().url().optional(),
});

const UpdateMarinaSchema = z.object({
  name:        z.string().min(1).optional(),
  lake:        z.string().min(1).optional(),
  address:     z.string().optional(),
  city:        z.string().optional(),
  state:       z.string().optional(),
  latitude:    z.number().optional(),
  longitude:   z.number().optional(),
  phone:       z.string().optional(),
  website:     z.string().url().optional(),
  logoUrl:     z.string().url().optional(),
  widgetColor: z.string().optional(),
});

// ── GET /marinas ─────────────────────────────────────────────────────────────
router.get('/', async (_req, res) => {
  const marinas = await prisma.marina.findMany({
    where:  { isActive: true },
    select: { id: true, name: true, lake: true, city: true, state: true, latitude: true, longitude: true, logoUrl: true },
  });
  res.json(marinas);
});

// ── GET /marinas/:id ─────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const marina = await prisma.marina.findUniqueOrThrow({
    where:   { id: req.params.id },
    include: { boats: { where: { isActive: true } } },
  });
  res.json(marina);
});

// ── GET /marinas/:id/reports (staff) ─────────────────────────────────────────
// Revenue and utilisation data consumed by the Reports dashboard page.
router.get('/:id/reports', requireAuth, requireMarinaStaff, async (req: AuthRequest, res) => {
  if (req.params.id !== req.marinaId) throw new AppError(403, 'You do not manage this marina');

  const [boats, reservations] = await Promise.all([
    prisma.boat.findMany({ where: { marinaId: req.marinaId!, isActive: true } }),
    prisma.reservation.findMany({
      where:   { boat: { marinaId: req.marinaId! } },
      include: { boat: true, user: { select: { id: true, name: true, email: true } } },
      orderBy: { startDate: 'desc' },
    }),
  ]);

  const paid        = reservations.filter(r => r.paymentStatus === 'paid');
  const totalRevenue = paid.reduce((s, r) => s + (r.totalAmount ?? 0), 0);

  const utilization = boats.map(boat => {
    const bookings = reservations.filter(r => r.boatId === boat.id && r.status !== 'cancelled');
    const bookedDays = bookings.reduce((s, r) => {
      return s + Math.max(1, Math.round((new Date(r.endDate).getTime() - new Date(r.startDate).getTime()) / 86_400_000));
    }, 0);
    return { boatId: boat.id, boatName: boat.name, bookedDays, bookingCount: bookings.length };
  });

  res.json({
    totalRevenue:       Math.round(totalRevenue * 100) / 100,
    totalBookings:      reservations.filter(r => r.status !== 'cancelled').length,
    activeBoats:        boats.length,
    utilization,
    recentReservations: reservations.slice(0, 20),
  });
});

// ── POST /marinas ─────────────────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  const data   = CreateMarinaSchema.parse(req.body);
  const marina = await prisma.marina.create({ data });
  res.status(201).json(marina);
});

// ── PATCH /marinas/:id ────────────────────────────────────────────────────────
router.patch('/:id', requireAuth, requireMarinaStaff, async (req: AuthRequest, res) => {
  if (req.params.id !== req.marinaId) throw new AppError(403, 'You do not manage this marina');
  const data   = UpdateMarinaSchema.parse(req.body);
  const marina = await prisma.marina.update({ where: { id: req.params.id }, data });
  res.json(marina);
});

export default router;
