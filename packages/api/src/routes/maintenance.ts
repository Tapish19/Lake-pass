import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireMarinaStaff, requireMarinaManager, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

const CreateLogSchema = z.object({
  boatId:      z.string(),
  type:        z.enum(['maintenance', 'inspection', 'repair', 'fuel', 'cleaning']),
  notes:       z.string().optional(),
  cost:        z.number().optional(),
  performedAt: z.coerce.date().optional(),
  performedBy: z.string().optional(),
});

// ── GET /maintenance?boatId=xxx — list logs for a boat ───────────────────────
router.get('/', requireAuth, requireMarinaStaff, async (req: AuthRequest, res) => {
  const { boatId } = req.query;
  if (!boatId) throw new AppError(400, 'boatId query param required');

  // Verify boat belongs to this marina
  const boat = await prisma.boat.findFirst({
    where: { id: String(boatId), marinaId: req.marinaId! },
  });
  if (!boat) throw new AppError(404, 'Boat not found');

  const logs = await prisma.maintenanceLog.findMany({
    where:   { boatId: String(boatId) },
    orderBy: { performedAt: 'desc' },
  });
  res.json(logs);
});

// ── POST /maintenance — create log entry ─────────────────────────────────────
router.post('/', requireAuth, requireMarinaStaff, async (req: AuthRequest, res) => {
  const data = CreateLogSchema.parse(req.body);

  const boat = await prisma.boat.findFirst({
    where: { id: data.boatId, marinaId: req.marinaId! },
  });
  if (!boat) throw new AppError(404, 'Boat not found');

  // If type is maintenance, also update boat status
  if (data.type === 'maintenance' || data.type === 'repair') {
    await prisma.boat.update({
      where: { id: data.boatId },
      data:  { status: 'maintenance' },
    });
  }

  const log = await prisma.maintenanceLog.create({
    data: {
      boatId:      data.boatId,
      type:        data.type,
      notes:       data.notes,
      cost:        data.cost,
      performedAt: data.performedAt ?? new Date(),
      performedBy: data.performedBy,
    },
  });
  res.status(201).json(log);
});

// ── DELETE /maintenance/:id (manager+) ───────────────────────────────────────
router.delete('/:id', requireAuth, requireMarinaManager, async (req: AuthRequest, res) => {
  const log = await prisma.maintenanceLog.findUniqueOrThrow({ where: { id: req.params.id }, include: { boat: true } });
  if (log.boat.marinaId !== req.marinaId) throw new AppError(403, 'Forbidden');
  await prisma.maintenanceLog.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
