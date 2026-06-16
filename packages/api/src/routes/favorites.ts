import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// GET /favorites — consumer's saved boats
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  if (!req.userId) throw new AppError(403, 'Consumer account required');
  const favs = await prisma.favorite.findMany({
    where:   { userId: req.userId },
    include: { boat: { include: { marina: { select: { name: true, lake: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(favs.map(f => f.boat));
});

// POST /favorites/:boatId — toggle (add if not exists, remove if exists)
router.post('/:boatId', requireAuth, async (req: AuthRequest, res) => {
  if (!req.userId) throw new AppError(403, 'Consumer account required');
  const existing = await prisma.favorite.findUnique({
    where: { userId_boatId: { userId: req.userId, boatId: req.params.boatId } },
  });
  if (existing) {
    await prisma.favorite.delete({ where: { id: existing.id } });
    return res.json({ favorited: false });
  }
  await prisma.favorite.create({ data: { userId: req.userId, boatId: req.params.boatId } });
  res.json({ favorited: true });
});

export default router;
