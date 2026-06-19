import { Router } from 'express';
import { z } from 'zod';
import Stripe from 'stripe';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

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

  let hasCompletedOnboarding: boolean | undefined;
  if (staffMember?.marina?.id) {
    const boatCount = await prisma.boat.count({ where: { marinaId: staffMember.marina.id, isActive: true } });
    hasCompletedOnboarding = boatCount > 0;
  }

  res.json({
    user,
    staff: staffMember ? { role: staffMember.role, marina: staffMember.marina } : null,
    hasCompletedOnboarding,
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

// ─── PATCH /api/auth/me/profile ───────────────────────────────────────────────
// Update name, phone, and emergency contact fields.
const ProfileSchema = z.object({
  name:                    z.string().min(1).optional(),
  phone:                   z.string().optional(),
  emergencyContactName:    z.string().optional(),
  emergencyContactPhone:   z.string().optional(),
  emergencyContactRelation: z.string().optional(),
});

router.patch('/me/profile', requireAuth, async (req: AuthRequest, res) => {
  if (!req.userId) return res.status(403).json({ error: 'Consumer account required' });
  const data = ProfileSchema.parse(req.body);
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

// ─── GET /api/auth/me/payment-methods ────────────────────────────────────────
// Returns saved Stripe payment methods for the authenticated consumer.
router.get('/me/payment-methods', requireAuth, async (req: AuthRequest, res) => {
  if (!req.userId) return res.status(403).json({ error: 'Consumer account required' });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId } });
  if (!user.stripeCustomerId) return res.json({ paymentMethods: [] });

  const methods = await stripe.paymentMethods.list({
    customer: user.stripeCustomerId,
    type: 'card',
  });

  res.json({
    paymentMethods: methods.data.map(pm => ({
      id:   pm.id,
      brand: pm.card?.brand,
      last4: pm.card?.last4,
      expMonth: pm.card?.exp_month,
      expYear:  pm.card?.exp_year,
    })),
  });
});

// ─── POST /api/auth/me/payment-methods/setup ─────────────────────────────────
// Creates a Stripe SetupIntent so the client can save a card without charging.
router.post('/me/payment-methods/setup', requireAuth, async (req: AuthRequest, res) => {
  if (!req.userId) return res.status(403).json({ error: 'Consumer account required' });

  let user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId } });

  // Lazily create a Stripe Customer record the first time
  if (!user.stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name:  user.name,
      metadata: { lakePassUserId: user.id },
    });
    user = await prisma.user.update({
      where: { id: req.userId },
      data:  { stripeCustomerId: customer.id },
    });
  }

  const setupIntent = await stripe.setupIntents.create({
    customer: user.stripeCustomerId!,
    payment_method_types: ['card'],
  });

  res.json({ clientSecret: setupIntent.client_secret });
});

// ─── DELETE /api/auth/me/payment-methods/:pmId ───────────────────────────────
router.delete('/me/payment-methods/:pmId', requireAuth, async (req: AuthRequest, res) => {
  if (!req.userId) return res.status(403).json({ error: 'Consumer account required' });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId } });

  // Verify this PM belongs to our customer before detaching
  const pm = await stripe.paymentMethods.retrieve(req.params.pmId);
  if (pm.customer !== user.stripeCustomerId) throw new AppError(403, 'Payment method not owned by this account');

  await stripe.paymentMethods.detach(req.params.pmId);
  res.json({ detached: true });
});

// ─── POST /api/auth/me/request-deletion (GDPR/CCPA) ─────────────────────────
router.post('/me/request-deletion', requireAuth, async (req: AuthRequest, res) => {
  if (!req.userId) return res.status(403).json({ error: 'Consumer account required' });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId } });
  if (user.deletedAt) return res.json({ message: 'Deletion already requested', deletedAt: user.deletedAt });

  await prisma.$transaction(async (tx) => {
    await tx.reservation.updateMany({
      where: {
        userId: req.userId!,
        status: { in: ['pending', 'confirmed'] },
        startDate: { gt: new Date() },
      },
      data: { status: 'cancelled' },
    });

    await tx.user.update({
      where: { id: req.userId! },
      data: {
        name:        'Deleted User',
        email:       `deleted_${req.userId}@lakepass.deleted`,
        phone:       null,
        licenseUrl:  null,
        insuranceUrl: null,
        pushToken:   null,
        emergencyContactName:     null,
        emergencyContactPhone:    null,
        emergencyContactRelation: null,
        deletedAt:   new Date(),
      },
    });

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

// ─── GET /api/auth/me/export (GDPR/CCPA) ─────────────────────────────────────
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

  res.json({ exportedAt: new Date().toISOString(), profile: user, reservations, reviews, favorites });
});

export default router;
