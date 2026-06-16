import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireMarinaStaff, AuthRequest } from '../middleware/auth';

const router = Router();

const AddonSchema = z.object({
  name:        z.string().min(1),
  price:       z.number().positive(),
  description: z.string().optional(),
});

// ── GET /addons?marinaId= ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { marinaId } = req.query;
  const addons = await prisma.addon.findMany({
    where: marinaId ? { marinaId: String(marinaId) } : {},
    orderBy: { price: 'asc' },
  });
  res.json(addons);
});

// ── POST /addons (staff) ──────────────────────────────────────────────────────
router.post('/', requireAuth, requireMarinaStaff, async (req: AuthRequest, res) => {
  const data   = AddonSchema.parse(req.body);
  const addon  = await prisma.addon.create({ data: { ...data, marinaId: req.marinaId! } });
  res.status(201).json(addon);
});

// ── PATCH /addons/:id (staff) ─────────────────────────────────────────────────
router.patch('/:id', requireAuth, requireMarinaStaff, async (req: AuthRequest, res) => {
  const existing = await prisma.addon.findUniqueOrThrow({ where: { id: req.params.id } });
  if (existing.marinaId !== req.marinaId) return res.status(403).json({ error: 'Forbidden' });
  const data  = AddonSchema.partial().parse(req.body);
  const addon = await prisma.addon.update({ where: { id: req.params.id }, data });
  res.json(addon);
});

// ── DELETE /addons/:id (staff) ────────────────────────────────────────────────
router.delete('/:id', requireAuth, requireMarinaStaff, async (req: AuthRequest, res) => {
  const existing = await prisma.addon.findUniqueOrThrow({ where: { id: req.params.id } });
  if (existing.marinaId !== req.marinaId) return res.status(403).json({ error: 'Forbidden' });
  await prisma.addon.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
