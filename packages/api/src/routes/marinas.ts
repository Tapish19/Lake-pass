import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireMarinaStaff, requireMarinaManager, requireMarinaOwner, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

const CreateMarinaSchema = z.object({
  name:      z.string().min(1),
  lake:      z.string().min(1),
  address:   z.string(),
  city:      z.string(),
  state:     z.string(),
  latitude:  z.number().nullable().optional(),
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
  latitude:    z.number().nullable().optional(),
  longitude:   z.number().nullable().optional(),
  phone:       z.string().optional(),
  website:     z.string().url().optional(),
  logoUrl:     z.string().url().nullable().optional(),
  widgetColor: z.string().optional(),
  widgetFont:  z.string().optional(),
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

// ── GET /marinas/:id/reports (manager+) ──────────────────────────────────────
router.get('/:id/reports', requireAuth, requireMarinaManager, async (req: AuthRequest, res) => {
  if (req.params.id !== req.marinaId) throw new AppError(403, 'You do not manage this marina');

  const [boats, reservations] = await Promise.all([
    prisma.boat.findMany({ where: { marinaId: req.marinaId!, isActive: true } }),
    prisma.reservation.findMany({
      where:   { boat: { marinaId: req.marinaId! } },
      include: {
        boat: true,
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { startDate: 'desc' },
    }),
  ]);

  const paid         = reservations.filter(r => r.paymentStatus === 'paid');
  const totalRevenue = paid.reduce((s, r) => s + (r.totalAmount ?? 0), 0);

  const utilization = boats.map(boat => {
    const bookings  = reservations.filter(r => r.boatId === boat.id && r.status !== 'cancelled');
    const bookedDays = bookings.reduce((s, r) => {
      return s + Math.max(1, Math.round((new Date(r.endDate).getTime() - new Date(r.startDate).getTime()) / 86_400_000));
    }, 0);
    return { boatId: boat.id, boatName: boat.name, bookedDays, bookingCount: bookings.length };
  });

  // ── Peak-time analysis ────────────────────────────────────────────────────
  // Count non-cancelled bookings by day-of-week (0=Sun…6=Sat)
  const dowCounts = Array(7).fill(0);
  const dowLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (const r of reservations.filter(r => r.status !== 'cancelled')) {
    dowCounts[new Date(r.startDate).getDay()]++;
  }
  const peakByDow = dowLabels.map((label, i) => ({ label, bookings: dowCounts[i] }));

  // Count bookings by calendar month (last 12 months)
  const monthCounts: Record<string, number> = {};
  const now = new Date();
  for (let m = 11; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthCounts[key] = 0;
  }
  for (const r of reservations.filter(r => r.status !== 'cancelled')) {
    const d   = new Date(r.startDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (key in monthCounts) monthCounts[key]++;
  }
  const peakByMonth = Object.entries(monthCounts).map(([month, bookings]) => ({ month, bookings }));

  res.json({
    totalRevenue:       Math.round(totalRevenue * 100) / 100,
    totalBookings:      reservations.filter(r => r.status !== 'cancelled').length,
    activeBoats:        boats.length,
    utilization,
    peakByDow,
    peakByMonth,
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
router.patch('/:id', requireAuth, requireMarinaOwner, async (req: AuthRequest, res) => {
  if (req.params.id !== req.marinaId) throw new AppError(403, 'You do not manage this marina');
  const data   = UpdateMarinaSchema.parse(req.body);
  const marina = await prisma.marina.update({ where: { id: req.params.id }, data });
  res.json(marina);
});

// ── POST /marinas/:id/staff ───────────────────────────────────────────────────
const AddStaffSchema = z.object({
  clerkId: z.string().min(1),
  role:    z.enum(['manager', 'staff']),
});

router.post('/:id/staff', requireAuth, requireMarinaOwner, async (req: AuthRequest, res) => {
  if (req.params.id !== req.marinaId) throw new AppError(403, 'You do not manage this marina');
  const { clerkId, role } = AddStaffSchema.parse(req.body);

  const existing = await prisma.staffMember.findUnique({ where: { clerkId } });
  if (existing) throw new AppError(409, 'A staff member with that Clerk ID already exists');

  const member = await prisma.staffMember.create({
    data: { clerkId, marinaId: req.params.id, role },
  });
  res.status(201).json(member);
});

// ── DELETE /marinas/:id/staff/:clerkId ────────────────────────────────────────
router.delete('/:id/staff/:clerkId', requireAuth, requireMarinaOwner, async (req: AuthRequest, res) => {
  if (req.params.id !== req.marinaId) throw new AppError(403, 'You do not manage this marina');
  if (req.params.clerkId === req.clerkId) throw new AppError(400, 'You cannot remove yourself');

  const member = await prisma.staffMember.findUnique({ where: { clerkId: req.params.clerkId } });
  if (!member || member.marinaId !== req.marinaId) throw new AppError(404, 'Staff member not found');

  await prisma.staffMember.delete({ where: { clerkId: req.params.clerkId } });
  res.status(204).send();
});

// ── PATCH /marinas/:id/staff/:clerkId ─────────────────────────────────────────
const UpdateStaffSchema = z.object({ role: z.enum(['manager', 'staff']) });

router.patch('/:id/staff/:clerkId', requireAuth, requireMarinaOwner, async (req: AuthRequest, res) => {
  if (req.params.id !== req.marinaId) throw new AppError(403, 'You do not manage this marina');
  if (req.params.clerkId === req.clerkId) throw new AppError(400, 'You cannot change your own role');

  const member = await prisma.staffMember.findUnique({ where: { clerkId: req.params.clerkId } });
  if (!member || member.marinaId !== req.marinaId) throw new AppError(404, 'Staff member not found');

  const { role } = UpdateStaffSchema.parse(req.body);
  const updated  = await prisma.staffMember.update({ where: { clerkId: req.params.clerkId }, data: { role } });
  res.json(updated);
});

// ── GET /marinas/:id/staff ────────────────────────────────────────────────────
router.get('/:id/staff', requireAuth, requireMarinaManager, async (req: AuthRequest, res) => {
  if (req.params.id !== req.marinaId) throw new AppError(403, 'You do not manage this marina');
  const members = await prisma.staffMember.findMany({ where: { marinaId: req.params.id } });
  res.json(members);
});

export default router;
