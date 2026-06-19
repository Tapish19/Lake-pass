import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireMarinaStaff, requireMarinaManager, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

const CreateBoatSchema = z.object({
  name:             z.string().min(1),
  type:             z.string().min(1),
  capacity:         z.number().int().positive(),
  dailyRate:        z.number().positive(),
  hourlyRate:       z.number().positive().optional(),
  description:      z.string().optional(),
  amenities:        z.array(z.string()).default([]),
  photoUrls:        z.array(z.string()).default([]),
  // Minutes required between the end of one reservation and the start of the next
  turnaroundBuffer: z.number().int().min(0).default(0),
});

const UpdateBoatSchema = CreateBoatSchema.partial().extend({
  status: z.enum(['available', 'booked', 'maintenance']).optional(),
});

// ─── GET /boats ──────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { marinaId, type, date, guests } = req.query;
  let unavailableIds: string[] = [];

  if (date) {
    const day        = new Date(String(date));
    const startOfDay = new Date(day); startOfDay.setHours(0,  0,  0, 0);
    const endOfDay   = new Date(day); endOfDay.setHours(23, 59, 59, 999);

    const [conflicts, blockouts] = await Promise.all([
      prisma.reservation.findMany({
        where: {
          status: { in: ['pending', 'confirmed', 'checked_in'] },
          startDate: { lt: endOfDay },
          endDate:   { gt: startOfDay },
        },
        select: { boatId: true },
      }),
      prisma.blockout.findMany({
        where: { startDate: { lt: endOfDay }, endDate: { gt: startOfDay } },
        select: { boatId: true },
      }),
    ]);
    unavailableIds = [
      ...conflicts.map(r => r.boatId),
      ...blockouts.map(b => b.boatId),
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

  const enriched = boats.map(b => ({
    ...b,
    rating:      b.reviews.length
      ? Math.round((b.reviews.reduce((s, r) => s + r.rating, 0) / b.reviews.length) * 10) / 10
      : null,
    reviewCount: b.reviews.length,
    reviews:     undefined,
  }));

  res.json(enriched);
});

// ─── GET /boats/mine ─────────────────────────────────────────────────────────
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
      marina:    true,
      reviews:   { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, take: 20 },
      blockouts: { where: { endDate: { gte: new Date() } }, orderBy: { startDate: 'asc' } },
    },
  });
  res.json(boat);
});

// ─── POST /boats ─────────────────────────────────────────────────────────────
router.post('/', requireAuth, requireMarinaManager, async (req: AuthRequest, res) => {
  const data = CreateBoatSchema.parse(req.body);
  const boat = await prisma.boat.create({ data: { ...data, marinaId: req.marinaId! } });
  res.status(201).json(boat);
});

// ─── POST /boats/import-csv ───────────────────────────────────────────────────
const CsvRowSchema = z.object({
  name:             z.string().min(1),
  type:             z.string().min(1),
  capacity:         z.coerce.number().int().positive(),
  dailyRate:        z.coerce.number().positive(),
  hourlyRate:       z.coerce.number().positive().optional(),
  description:      z.string().optional(),
  amenities:        z.string().optional(),
  turnaroundBuffer: z.coerce.number().int().min(0).default(0),
});

router.post('/import-csv', requireAuth, requireMarinaManager, async (req: AuthRequest, res) => {
  const { rows } = z.object({ rows: z.array(z.record(z.string())) }).parse(req.body);

  if (!rows.length) throw new AppError(400, 'No rows provided');
  if (rows.length > 500) throw new AppError(400, 'Maximum 500 boats per import');

  const results: { success: boolean; name: string; error?: string }[] = [];

  for (const raw of rows) {
    try {
      const parsed = CsvRowSchema.parse(raw);
      await prisma.boat.create({
        data: {
          marinaId:        req.marinaId!,
          name:            parsed.name,
          type:            parsed.type,
          capacity:        parsed.capacity,
          dailyRate:       parsed.dailyRate,
          hourlyRate:      parsed.hourlyRate,
          description:     parsed.description,
          turnaroundBuffer: parsed.turnaroundBuffer,
          amenities:       parsed.amenities
            ? parsed.amenities.split(';').map(s => s.trim()).filter(Boolean)
            : [],
          photoUrls: [],
        },
      });
      results.push({ success: true, name: parsed.name });
    } catch (err: any) {
      results.push({ success: false, name: String(raw.name ?? '?'), error: err?.message ?? 'Unknown error' });
    }
  }

  const created = results.filter(r => r.success).length;
  const failed  = results.filter(r => !r.success).length;
  res.status(201).json({ created, failed, results });
});

// ─── PATCH /boats/:id ────────────────────────────────────────────────────────
router.patch('/:id', requireAuth, requireMarinaStaff, async (req: AuthRequest, res) => {
  const existing = await prisma.boat.findUniqueOrThrow({ where: { id: req.params.id } });
  if (existing.marinaId !== req.marinaId) throw new AppError(403, 'You do not manage this boat');

  const isManagerOrAbove = req.staffRole === 'owner' || req.staffRole === 'manager';
  if (!isManagerOrAbove) {
    const nonStatusKeys = Object.keys(req.body).filter(k => k !== 'status');
    if (nonStatusKeys.length > 0) throw new AppError(403, 'Staff may only update boat status');
    const { status } = z.object({ status: z.enum(['available', 'booked', 'maintenance']) }).parse(req.body);
    return res.json(await prisma.boat.update({ where: { id: req.params.id }, data: { status } }));
  }

  const data = UpdateBoatSchema.parse(req.body);
  res.json(await prisma.boat.update({ where: { id: req.params.id }, data }));
});

// ─── DELETE /boats/:id ───────────────────────────────────────────────────────
router.delete('/:id', requireAuth, requireMarinaManager, async (req: AuthRequest, res) => {
  const existing = await prisma.boat.findUniqueOrThrow({ where: { id: req.params.id } });
  if (existing.marinaId !== req.marinaId) throw new AppError(403, 'You do not manage this boat');
  await prisma.boat.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.status(204).send();
});

// ─── POST /boats/:id/blockouts ───────────────────────────────────────────────
const BlockoutSchema = z.object({
  startDate: z.coerce.date(),
  endDate:   z.coerce.date(),
  reason:    z.string().optional(),
});

router.post('/:id/blockouts', requireAuth, requireMarinaManager, async (req: AuthRequest, res) => {
  const existing = await prisma.boat.findUniqueOrThrow({ where: { id: req.params.id } });
  if (existing.marinaId !== req.marinaId) throw new AppError(403, 'You do not manage this boat');
  const data = BlockoutSchema.parse(req.body);
  if (data.endDate <= data.startDate) throw new AppError(400, 'endDate must be after startDate');
  const blockout = await prisma.blockout.create({ data: { boatId: req.params.id, ...data } });
  res.status(201).json(blockout);
});

// ─── DELETE /boats/:id/blockouts/:blockoutId ─────────────────────────────────
router.delete('/:id/blockouts/:blockoutId', requireAuth, requireMarinaManager, async (req: AuthRequest, res) => {
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
  const completed = await prisma.reservation.findFirst({
    where: { boatId: req.params.id, userId: req.userId, status: 'checked_out' },
  });
  if (!completed) throw new AppError(403, 'You can only review boats you have rented');
  const data   = ReviewSchema.parse(req.body);
  const review = await prisma.review.create({ data: { boatId: req.params.id, userId: req.userId, ...data } });
  res.status(201).json(review);
});

export default router;
