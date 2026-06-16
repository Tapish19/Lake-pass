import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// ─── POST /api/auth/sync ────────────────────────────────────────────────────
// Called by the mobile app immediately after Clerk sign-up / sign-in to
// create or update the backend User row.  Without this row, requireAuth
// can't resolve req.userId and every consumer endpoint returns 403.
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

// ─── GET /api/auth/me ───────────────────────────────────────────────────────
// Returns the consumer profile and/or marina-staff membership for the current
// Clerk session.  Both the mobile app and the marina dashboard call this after
// sign-in to figure out which experience to render.
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  const [user, staffMember] = await Promise.all([
    req.userId
      ? prisma.user.findUnique({ where: { id: req.userId } })
      : null,
    req.marinaId
      ? prisma.staffMember.findFirst({
          where: { clerkId: req.clerkId },
          include: { marina: true },
        })
      : null,
  ]);

  res.json({
    user,
    staff: staffMember
      ? { role: staffMember.role, marina: staffMember.marina }
      : null,
  });
});

// ─── PATCH /api/auth/me/documents ──────────────────────────────────────────
// Lets consumers store their driver-licence and insurance S3 URLs.
const DocsSchema = z.object({
  licenseUrl:   z.string().url().optional(),
  insuranceUrl: z.string().url().optional(),
});

router.patch('/me/documents', requireAuth, async (req: AuthRequest, res) => {
  if (!req.userId) {
    return res.status(403).json({ error: 'Consumer account required' });
  }
  const data = DocsSchema.parse(req.body);
  const user = await prisma.user.update({ where: { id: req.userId }, data });
  res.json(user);
});

export default router;

// ── PATCH /api/auth/me/push-token ────────────────────────────────────────────
// Mobile apps call this after obtaining an Expo push token so the server can
// send targeted notifications.
router.patch('/me/push-token', requireAuth, async (req: AuthRequest, res) => {
  if (!req.userId) return res.status(403).json({ error: 'Consumer account required' });
  const { token } = z.object({ token: z.string().min(1) }).parse(req.body);
  // Store on the user row (pushToken field added to schema below)
  const user = await prisma.user.update({ where: { id: req.userId }, data: { pushToken: token } });
  res.json({ ok: true });
});
