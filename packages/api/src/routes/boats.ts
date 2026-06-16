import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireMarinaStaff, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

const CreateBoatSchema = z.object({
  name:        z.string().min(1),
  type:        z.string().min(1),
  capacity:    z.number().int().positive(),
  dailyRate:   z.number().positive(),
  hourlyRate:  z.number().positive().optional(),
  description: z.string().optional(),
  amenities:   z.array(z.string()).default([]),
  photoUrls:   z.array(z.string()).default([]),
});

const UpdateBoatSchema = CreateBoatSchema.partial().extend({
  status: z.enum(['available', 'booked', 'maintenance']).optional(),
});

// ─── GET /boats ─────────────────────────────────────────────────────────────
// Public. Supports ?marinaId, ?type, ?date, ?guests query params.
// When ?date is given, boats with a conflicting reservation OR blockout are
// excluded so the result reflects true real-time availability.
router.get('/', async (req, res) => {
  const { marinaId, type, date, guests } = req.query;

  let unavailableIds: string[] = [];

  if (date) {
    const day       = new Date(String(date));
    const startOfDay = new Date(day); startOfDay.setHours(0,  0,  0, 0);
    const endOfDay   = new Date(day); endOfDay.setHours(23, 59, 59, 999);

    const [conflicts, blockouts] = await Promise.all([
      prisma.reservation.findMany({
        where: {
          status:    { in: ['pending', 'confirmed', 'checked_in'] },
          startDate: { lt: endOfDay },
          endDate:   { gt: startOfDay },
        },
        select: { boatId: true },
      }),
      // ← blockout table is now checked here
      prisma.blockout.findMany({
        where: {
          startDate: { lt: endOfDay },
          endDate:   { gt: startOfDay },
        },
        select: { boatId: true },
      }),
    ]);

    unavailableIds = [
      ...conflicts.map((r: { boatId: string }) => r.boatId),
      ...blockouts.map((b: { boatId: string }) => b.boatId),
    ];
  }

  const boats = await prisma.boat.findMany({
    where: {
      ...(marinaId ? { marinaId: String(marinaId) } : {}),
      ...(type     ? { type: String(type) }         : {}),
      ...(guests   ? { capacity: { gte: Number(guests) } } : {}),
      ...(unavailableIds.length ? { id: { notIn: unavailableIds } } : {}),
      isActive: true,
    },
    include: {
      marina:  { select: { id: true, name: true, lake: true } },
      reviews: { select: { rating: true } },
    },
    orderBy: { dailyRate: 'asc' },
  });

  // Attach computed avg rating so the mobile search card can display stars.
  const enriched = boats.map((b: any) => ({
    ...b,
    rating:      b.reviews.length
      ? Math.round((b.reviews.reduce((s: number, r: { rating: number }) => s + r.rating, 0) / b.reviews.length) * 10) / 10
      : null,
    reviewCount: b.reviews.length,
    reviews:     undefined,
  }));

  res.json(enriched);
});

// ─── GET /boats/mine ─────────────────────────────────────────────────────────
// Staff-only: all boats belonging to the requester's marina.
router.get('/mine', requireAuth, requireMarinaStaff, async (req: AuthRequest, res) => {
  const boats = await prisma.boat.findMany({
    where:   { marinaId: req.marinaId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(boats);
});

// ─── GET /boats/:id ──────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const boat = await prisma.boat.findUniqueOrThrow({
    where:   { id: req.params.id },
    include: {
      marina:   true,
      reviews:  { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, take: 20 },
      blockouts: { where: { endDate: { gte: new Date() } }, orderBy: { startDate: 'asc' } },
    },
  });
  res.json(boat);
});

// ─── POST /boats ─────────────────────────────────────────────────────────────
router.post('/', requireAuth, requireMarinaStaff, async (req: AuthRequest, res) => {
  const data = CreateBoatSchema.parse(req.body);
  const boat = await prisma.boat.create({ data: { ...data, marinaId: req.marinaId! } });
  res.status(201).json(boat);
});

// ─── PATCH /boats/:id ────────────────────────────────────────────────────────
router.patch('/:id', requireAuth, requireMarinaStaff, async (req: AuthRequest, res) => {
  const existing = await prisma.boat.findUniqueOrThrow({ where: { id: req.params.id } });
  if (existing.marinaId !== req.marinaId) throw new AppError(403, 'You do not manage this boat');
  const data = UpdateBoatSchema.parse(req.body);
  const boat = await prisma.boat.update({ where: { id: req.params.id }, data });
  res.json(boat);
});

// ─── DELETE /boats/:id ───────────────────────────────────────────────────────
router.delete('/:id', requireAuth, requireMarinaStaff, async (req: AuthRequest, res) => {
  const existing = await prisma.boat.findUniqueOrThrow({ where: { id: req.params.id } });
  if (existing.marinaId !== req.marinaId) throw new AppError(403, 'You do not manage this boat');
  await prisma.boat.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.status(204).send();
});

// ─── POST /boats/:id/blockouts ───────────────────────────────────────────────
// Staff creates a maintenance / blocked window.
const BlockoutSchema = z.object({
  startDate: z.coerce.date(),
  endDate:   z.coerce.date(),
  reason:    z.string().optional(),
});

router.post('/:id/blockouts', requireAuth, requireMarinaStaff, async (req: AuthRequest, res) => {
  const existing = await prisma.boat.findUniqueOrThrow({ where: { id: req.params.id } });
  if (existing.marinaId !== req.marinaId) throw new AppError(403, 'You do not manage this boat');

  const data = BlockoutSchema.parse(req.body);
  if (data.endDate <= data.startDate) throw new AppError(400, 'endDate must be after startDate');

  const blockout = await prisma.blockout.create({
    data: { boatId: req.params.id, ...data },
  });
  res.status(201).json(blockout);
});

// ─── DELETE /boats/:id/blockouts/:blockoutId ─────────────────────────────────
router.delete('/:id/blockouts/:blockoutId', requireAuth, requireMarinaStaff, async (req: AuthRequest, res) => {
  const blockout = await prisma.blockout.findUniqueOrThrow({ where: { id: req.params.blockoutId } });
  const boat     = await prisma.boat.findUniqueOrThrow({ where: { id: blockout.boatId } });
  if (boat.marinaId !== req.marinaId) throw new AppError(403, 'You do not manage this boat');

  await prisma.blockout.delete({ where: { id: req.params.blockoutId } });
  res.status(204).send();
});

// ─── POST /boats/:id/reviews ─────────────────────────────────────────────────
const ReviewSchema = z.object({
  rating:  z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

router.post('/:id/reviews', requireAuth, async (req: AuthRequest, res) => {
  if (!req.userId) throw new AppError(403, 'Consumer account required');

  // Consumer must have a completed reservation for this boat.
  const completed = await prisma.reservation.findFirst({
    where: {
      boatId: req.params.id,
      userId: req.userId,
      status: 'checked_out',
    },
  });
  if (!completed) throw new AppError(403, 'You can only review boats you have rented');

  const data   = ReviewSchema.parse(req.body);
  const review = await prisma.review.create({
    data: { boatId: req.params.id, userId: req.userId, ...data },
  });
  res.status(201).json(review);
});

export default router;
