/**
 * payments.test.ts
 * Tests for Stripe Connect onboarding, checkout, deposit-only flow, and webhook.
 */
import request from 'supertest';
import app from '../index';
import { prisma } from '../lib/prisma';
import Stripe from 'stripe';

jest.mock('stripe');
jest.mock('../lib/prisma', () => ({
  prisma: {
    marina: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    reservation: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
  },
}));
jest.mock('../middleware/auth', () => ({
  requireAuth: (_req: any, _res: any, next: any) => { _req.marinaId = 'marina1'; _req.staffRole = 'owner'; next(); },
  requireMarinaOwner: (_req: any, _res: any, next: any) => next(),
  requireMarinaManager: (_req: any, _res: any, next: any) => next(),
  requireMarinaStaff: (_req: any, _res: any, next: any) => next(),
}));

const mockStripe = Stripe as jest.MockedClass<typeof Stripe>;

describe('POST /api/payments/onboard', () => {
  it('creates a Stripe Connect account and returns onboarding URL', async () => {
    const mockCreate = jest.fn().mockResolvedValue({ id: 'acct_real123' });
    const mockLink   = jest.fn().mockResolvedValue({ url: 'https://connect.stripe.com/onboard/acct_real123' });
    (mockStripe as any).mockImplementation(() => ({
      accounts:     { create: mockCreate, retrieve: jest.fn() },
      accountLinks: { create: mockLink },
    }));

    (prisma.marina.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      id: 'marina1', name: 'Test Marina', stripeAccountId: null,
    });
    (prisma.marina.update as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post('/api/payments/onboard')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/stripe\.com/);
    expect(res.body.accountId).toBe('acct_real123');
    expect(res.body.accountId).not.toBe('test-account'); // ensures stub is gone
  });

  it('reuses existing Stripe account if already created', async () => {
    const mockCreate = jest.fn();
    const mockLink   = jest.fn().mockResolvedValue({ url: 'https://connect.stripe.com/onboard/acct_existing' });
    (mockStripe as any).mockImplementation(() => ({
      accounts:     { create: mockCreate, retrieve: jest.fn() },
      accountLinks: { create: mockLink },
    }));

    (prisma.marina.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      id: 'marina1', name: 'Test Marina', stripeAccountId: 'acct_existing',
    });

    const res = await request(app)
      .post('/api/payments/onboard')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(mockCreate).not.toHaveBeenCalled(); // should not create a new account
    expect(res.body.url).toMatch(/stripe\.com/);
  });
});

describe('POST /api/payments/checkout', () => {
  it('creates full-payment checkout session', async () => {
    const mockSessionCreate = jest.fn().mockResolvedValue({ id: 'cs_test_123', url: 'https://checkout.stripe.com/cs_test_123' });
    (mockStripe as any).mockImplementation(() => ({
      checkout: { sessions: { create: mockSessionCreate } },
    }));

    (prisma.reservation.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      id: 'res1', userId: 'user1', paymentStatus: 'unpaid', totalAmount: 400,
      rentalAmount: 350, depositAmount: 100,
      boat: { name: 'Sunset', dailyRate: 350, marina: { stripeAccountId: 'acct_123' } },
      user: { email: 'test@example.com' },
      addons: [],
      startDate: new Date(),
    });
    (prisma.reservation.update as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post('/api/payments/checkout')
      .set('Authorization', 'Bearer test-token')
      .send({ reservationId: 'res1', depositOnly: false });

    expect(res.status).toBe(200);
    expect(res.body.url).toContain('checkout.stripe.com');
  });

  it('creates deposit-only checkout with smaller amount', async () => {
    const mockSessionCreate = jest.fn().mockResolvedValue({ id: 'cs_dep_123', url: 'https://checkout.stripe.com/cs_dep_123' });
    (mockStripe as any).mockImplementation(() => ({
      checkout: { sessions: { create: mockSessionCreate } },
    }));

    (prisma.reservation.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      id: 'res2', userId: 'user1', paymentStatus: 'unpaid', totalAmount: 400,
      depositAmount: 100, rentalAmount: 350,
      boat: { name: 'Sunset', dailyRate: 350, marina: { stripeAccountId: 'acct_123' } },
      user: { email: 'test@example.com' },
      addons: [],
      startDate: new Date(),
    });
    (prisma.reservation.update as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post('/api/payments/checkout')
      .set('Authorization', 'Bearer test-token')
      .send({ reservationId: 'res2', depositOnly: true });

    expect(res.status).toBe(200);
    // Deposit session should use depositAmount (10000 cents), not totalAmount (40000 cents)
    const call = mockSessionCreate.mock.calls[0][0];
    expect(call.line_items[0].price_data.unit_amount).toBe(10000);
    expect(call.metadata.depositOnly).toBe('true');
  });
});
