import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// ─── POST /api/auth/sync ─────────────────────────────────────────────────────
const SyncSchema = z.object({
  name:  z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
});

router.post('/sync', requireAuth, async (req: AuthRequest, res) => {
  const data = SyncSchema.parse(req.body);
  const user = await prisma.user.upsert({
    where:  { clerkId: req.clerkId! },
    create: { clerkId: req.clerkId!, ...data },
    update: data,
  });
  res.json(user);
});

// ─── GET /api/auth/me ────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  const [user, staffMember] = await Promise.all([
    req.userId
      ? prisma.user.findUnique({ where: { id: req.userId } })
      : null,
    req.marinaId
      ? prisma.staffMember.findFirst({
          where:   { clerkId: req.clerkId },
          include: { marina: true },
        })
      : null,
  ]);

  res.json({
    user,
    staff: staffMember ? { role: staffMember.role, marina: staffMember.marina } : null,
  });
});

// ─── PATCH /api/auth/me/documents ────────────────────────────────────────────
const DocsSchema = z.object({
  licenseUrl:   z.string().url().optional(),
  insuranceUrl: z.string().url().optional(),
});

router.patch('/me/documents', requireAuth, async (req: AuthRequest, res) => {
  if (!req.userId) return res.status(403).json({ error: 'Consumer account required' });
  const data = DocsSchema.parse(req.body);
  const user = await prisma.user.update({ where: { id: req.userId }, data });
  res.json(user);
});

// ─── PATCH /api/auth/me/push-token ───────────────────────────────────────────
router.patch('/me/push-token', requireAuth, async (req: AuthRequest, res) => {
  if (!req.userId) return res.status(403).json({ error: 'Consumer account required' });
  const { token } = z.object({ token: z.string().min(1) }).parse(req.body);
  await prisma.user.update({ where: { id: req.userId }, data: { pushToken: token } });
  res.json({ ok: true });
});

// ─── POST /api/auth/me/request-deletion (GDPR/CCPA Right to Erasure) ─────────
// Soft-deletes the user account: anonymises PII on the User row,
// cancels pending reservations, and logs the request for compliance audit.
router.post('/me/request-deletion', requireAuth, async (req: AuthRequest, res) => {
  if (!req.userId) return res.status(403).json({ error: 'Consumer account required' });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId } });
  if (user.deletedAt) return res.json({ message: 'Deletion already requested', deletedAt: user.deletedAt });

  await prisma.$transaction(async (tx) => {
    // Cancel any pending/confirmed reservations that haven't started yet
    await tx.reservation.updateMany({
      where: {
        userId: req.userId!,
        status: { in: ['pending', 'confirmed'] },
        startDate: { gt: new Date() },
      },
      data: { status: 'cancelled' },
    });

    // Anonymise the user row — keep the row for FK integrity but wipe PII
    await tx.user.update({
      where: { id: req.userId! },
      data: {
        name:        'Deleted User',
        email:       `deleted_${req.userId}@lakepass.deleted`,
        phone:       null,
        licenseUrl:  null,
        insuranceUrl: null,
        pushToken:   null,
        deletedAt:   new Date(),
      },
    });

    // Create compliance audit record
    await tx.complianceRequest.create({
      data: {
        userId:      req.userId!,
        type:        'deletion',
        status:      'completed',
        completedAt: new Date(),
        notes:       `Self-requested via API. Original email: ${user.email}`,
      },
    });
  });

  res.json({ message: 'Account deletion completed. Your PII has been removed.' });
});

// ─── GET /api/auth/me/export (GDPR/CCPA Right to Data Portability) ────────────
// Returns all data held for this user as JSON.
router.get('/me/export', requireAuth, async (req: AuthRequest, res) => {
  if (!req.userId) return res.status(403).json({ error: 'Consumer account required' });

  const [user, reservations, reviews, favorites] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.userId } }),
    prisma.reservation.findMany({
      where:   { userId: req.userId },
      include: { boat: { select: { name: true, type: true } }, addons: true },
    }),
    prisma.review.findMany({ where: { userId: req.userId } }),
    prisma.favorite.findMany({
      where:   { userId: req.userId },
      include: { boat: { select: { name: true, type: true } } },
    }),
  ]);

  await prisma.user.update({
    where: { id: req.userId },
    data:  { dataExportRequestedAt: new Date() },
  });

  await prisma.complianceRequest.create({
    data: { userId: req.userId, type: 'export', status: 'completed', completedAt: new Date() },
  });

  res.json({
    exportedAt: new Date().toISOString(),
    profile: user,
    reservations,
    reviews,
    favorites,
  });
});
