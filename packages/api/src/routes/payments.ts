import { Router } from 'express';
import express from 'express';
import Stripe from 'stripe';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireMarinaStaff, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const PLATFORM_FEE_RATE = 0.1;
const CUSTOMER_WEB_URL = process.env.CUSTOMER_WEB_URL ?? 'http://localhost:3002';

// ── POST /payments/checkout ───────────────────────────────────────────────────
router.post('/checkout', requireAuth, async (req: AuthRequest, res) => {
  if (!req.userId) throw new AppError(403, 'Consumer account required');
  const { reservationId } = z.object({ reservationId: z.string() }).parse(req.body);

  const r = await prisma.reservation.findUniqueOrThrow({
    where:   { id: reservationId },
    include: { boat: { include: { marina: true } }, user: true, addons: true },
  });

  if (r.userId !== req.userId) throw new AppError(403, 'You do not own this reservation');
  if (r.paymentStatus === 'paid') throw new AppError(400, 'Already paid');
  if (!r.boat.marina.stripeAccountId) throw new AppError(400, 'Marina has not connected Stripe yet');

  // Use stored totalAmount (which includes add-ons) or recalculate
  const totalAmt   = r.totalAmount ?? r.boat.dailyRate;
  const unitAmount = Math.round(totalAmt * 100);
  const appFee     = Math.round(unitAmount * PLATFORM_FEE_RATE);

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      price_data: {
        currency: 'usd',
        product_data: { name: `${r.boat.name} — ${r.startDate.toDateString()}` },
        unit_amount: Math.round((r.rentalAmount ?? r.boat.dailyRate) * 100),
      },
      quantity: 1,
    },
  ];

  // Add individual add-on line items for transparency
  for (const addon of r.addons) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: { name: addon.name },
        unit_amount: Math.round(addon.price * 100),
      },
      quantity: 1,
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: r.user.email,
    line_items: lineItems,
    payment_intent_data: {
      application_fee_amount: appFee,
      transfer_data: { destination: r.boat.marina.stripeAccountId },
    },
    metadata: { reservationId: r.id },
    success_url: `${CUSTOMER_WEB_URL}/trips?payment=success`,
    cancel_url:  `${CUSTOMER_WEB_URL}/trips?payment=cancelled`,
  });

  await prisma.reservation.update({
    where: { id: r.id },
    data:  { stripeSessionId: session.id },
  });

  res.json({ url: session.url });
});

// ── POST /payments/webhook ────────────────────────────────────────────────────
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).send('Missing stripe-signature');

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return res.status(400).send('Webhook verification failed');
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.metadata?.reservationId) {
        await prisma.reservation.update({
          where: { id: s.metadata.reservationId },
          data:  { status: 'confirmed', paymentStatus: 'paid', stripeSessionId: s.id },
        });
      }
      break;
    }
    case 'charge.refunded': {
      const c = event.data.object as Stripe.Charge;
      if (c.payment_intent) {
        const sessions = await stripe.checkout.sessions.list({ payment_intent: String(c.payment_intent), limit: 1 });
        const rid = sessions.data[0]?.metadata?.reservationId;
        if (rid) {
          await prisma.reservation.update({
            where: { id: rid },
            data:  { paymentStatus: c.amount_refunded >= c.amount ? 'refunded' : 'partially_refunded' },
          });
        }
      }
      break;
    }
  }

  res.json({ received: true });
});

// ── POST /payments/onboard ────────────────────────────────────────────────────
router.post('/onboard', requireAuth, requireMarinaStaff, async (req: AuthRequest, res) => {
  const marina = await prisma.marina.findUniqueOrThrow({ where: { id: req.marinaId! } });
  let accountId = marina.stripeAccountId;
  if (!accountId) {
    const acct = await stripe.accounts.create({
      type: 'express',
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { marinaId: marina.id },
    });
    accountId = acct.id;
    await prisma.marina.update({ where: { id: marina.id }, data: { stripeAccountId: accountId } });
  }
  const link = await stripe.accountLinks.create({
    account:     accountId,
    refresh_url: `${process.env.DASHBOARD_URL}/settings?stripe=refresh`,
    return_url:  `${process.env.DASHBOARD_URL}/settings?stripe=connected`,
    type:        'account_onboarding',
  });
  res.json({ url: link.url, accountId });
});

// ── GET /payments/stripe-status ───────────────────────────────────────────────
router.get('/stripe-status', requireAuth, requireMarinaStaff, async (req: AuthRequest, res) => {
  const marina = await prisma.marina.findUniqueOrThrow({ where: { id: req.marinaId! } });
  if (!marina.stripeAccountId) return res.json({ connected: false });
  const acct = await stripe.accounts.retrieve(marina.stripeAccountId);
  res.json({ connected: true, chargesEnabled: acct.charges_enabled, payoutsEnabled: acct.payouts_enabled, detailsSubmitted: acct.details_submitted });
});

// ── GET /payments/summary ─────────────────────────────────────────────────────
router.get('/summary', requireAuth, requireMarinaStaff, async (req: AuthRequest, res) => {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const paid = await prisma.reservation.findMany({
    where: { boat: { marinaId: req.marinaId }, paymentStatus: { in: ['paid','partially_refunded'] } },
    select: { totalAmount: true, createdAt: true },
  });
  const monthRevenue = paid.filter(r => new Date(r.createdAt) >= monthStart).reduce((s, r) => s + (r.totalAmount ?? 0), 0);
  const totalGross   = paid.reduce((s, r) => s + (r.totalAmount ?? 0), 0);
  const pendingCount = await prisma.reservation.count({
    where: { boat: { marinaId: req.marinaId }, paymentStatus: 'unpaid', status: { in: ['pending','confirmed'] } },
  });
  res.json({
    monthRevenue:  Math.round(monthRevenue * 100) / 100,
    totalGross:    Math.round(totalGross * 100) / 100,
    platformFees:  Math.round(totalGross * PLATFORM_FEE_RATE * 100) / 100,
    pendingCount,
  });
});

// ── POST /payments/refund (staff) ─────────────────────────────────────────────
router.post('/refund', requireAuth, requireMarinaStaff, async (req: AuthRequest, res) => {
  const { reservationId, amountCents, reason } = z.object({
    reservationId: z.string(),
    amountCents:   z.number().int().positive().optional(), // omit = full refund
    reason:        z.string().optional(),
  }).parse(req.body);

  const r = await prisma.reservation.findUniqueOrThrow({
    where:   { id: reservationId },
    include: { boat: true },
  });
  if (r.boat.marinaId !== req.marinaId) throw new AppError(403, 'Forbidden');
  if (r.paymentStatus !== 'paid') throw new AppError(400, 'Reservation is not in paid status');
  if (!r.stripeSessionId) throw new AppError(400, 'No Stripe session found for this reservation');

  // Look up the payment intent from the checkout session
  const session = await stripe.checkout.sessions.retrieve(r.stripeSessionId);
  if (!session.payment_intent) throw new AppError(400, 'No payment intent found');

  const refund = await stripe.refunds.create({
    payment_intent: String(session.payment_intent),
    ...(amountCents ? { amount: amountCents } : {}),
    reason: 'requested_by_customer',
  });

  const isFullRefund = !amountCents || amountCents >= Math.round((r.totalAmount ?? 0) * 100);
  await prisma.reservation.update({
    where: { id: reservationId },
    data:  { status: isFullRefund ? 'cancelled' : r.status, paymentStatus: isFullRefund ? 'refunded' : 'partially_refunded' },
  });

  res.json({ refundId: refund.id, amount: refund.amount, status: refund.status });
});

// ── POST /payments/damage-fee (staff) ─────────────────────────────────────────
router.post('/damage-fee', requireAuth, requireMarinaStaff, async (req: AuthRequest, res) => {
  const { reservationId, amountCents, description } = z.object({
    reservationId: z.string(),
    amountCents:   z.number().int().positive(),
    description:   z.string().default('Damage fee'),
  }).parse(req.body);

  const r = await prisma.reservation.findUniqueOrThrow({
    where:   { id: reservationId },
    include: { boat: { include: { marina: true } }, user: true },
  });
  if (r.boat.marinaId !== req.marinaId) throw new AppError(403, 'Forbidden');
  if (!r.boat.marina.stripeAccountId) throw new AppError(400, 'Marina Stripe not connected');

  // Create a new payment link for the damage fee charged to the same customer
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: r.user.email,
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: description },
        unit_amount: amountCents,
      },
      quantity: 1,
    }],
    payment_intent_data: {
      application_fee_amount: Math.round(amountCents * PLATFORM_FEE_RATE),
      transfer_data: { destination: r.boat.marina.stripeAccountId },
    },
    metadata: { reservationId: r.id, type: 'damage_fee' },
    success_url: `${process.env.DASHBOARD_URL}/reservations`,
    cancel_url:  `${process.env.DASHBOARD_URL}/reservations`,
  });

  res.json({ url: session.url });
});

export default router;
