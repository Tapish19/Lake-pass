/**
 * Team management routes — scoped to the authenticated owner/staff's own
 * marina (req.marinaId, set by requireAuth) rather than a URL param, the
 * same convention used by boats/reservations/payments routes.
 *
 * GET    /team            → list all staff members + pending invites
 * POST   /team/invite     → invite by email (creates or refreshes a pending invite)
 * PATCH  /team/:memberId  → change a member's role
 * DELETE /team/:memberId  → remove a member OR cancel a pending invite (same id space)
 *
 * We keep "invites" lightweight: instead of a full invite-token flow (which
 * would require an email-delivery service), we store a StaffInvite row with
 * the target email + role.  When that email signs in via Clerk and hits
 * GET /auth/me, the requireAuth middleware checks for a pending invite and
 * auto-promotes them to a StaffMember.  The invite row is then deleted.
 *
 * That promotion hook is wired in auth.ts (see the comment there).
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireMarinaOwner, requireMarinaStaff, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// ─── GET /team ───────────────────────────────────────────────────────────────
// Returns both confirmed staff members and pending invites so the UI can show
// one unified list.
router.get('/', requireAuth, requireMarinaStaff, async (req: AuthRequest, res) => {
  const [members, invites] = await Promise.all([
    prisma.staffMember.findMany({
      where: { marinaId: req.marinaId! },
    }),
    prisma.staffInvite.findMany({
      where: { marinaId: req.marinaId! },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  // Enrich staff members with user profile data (name / email) when available.
  const clerkIds = members.map((m) => m.clerkId);
  const users = clerkIds.length
    ? await prisma.user.findMany({
        where: { clerkId: { in: clerkIds } },
        select: { clerkId: true, name: true, email: true },
      })
    : [];

  const userByClerkId = Object.fromEntries(users.map((u) => [u.clerkId, u]));

  const enriched = members.map((m) => ({
    id:      m.id,
    clerkId: m.clerkId,
    role:    m.role,
    name:    userByClerkId[m.clerkId]?.name  ?? null,
    email:   userByClerkId[m.clerkId]?.email ?? null,
    status:  'active' as const,
  }));

  const pendingInvites = invites.map((inv) => ({
    id:        inv.id,
    clerkId:   null,
    role:      inv.role,
    name:      null,
    email:     inv.email,
    status:    'invited' as const,
    createdAt: inv.createdAt,
    expiresAt: inv.expiresAt,
  }));

  res.json({ members: enriched, invites: pendingInvites });
});

// ─── POST /team/invite ───────────────────────────────────────────────────────
const InviteSchema = z.object({
  email: z.string().email(),
  role:  z.enum(['manager', 'staff']),
});

router.post('/invite', requireAuth, requireMarinaOwner, async (req: AuthRequest, res) => {
  const { email, role } = InviteSchema.parse(req.body);

  // Block inviting someone who is already an active staff member.
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const alreadyStaff = await prisma.staffMember.findFirst({
      where: { marinaId: req.marinaId!, clerkId: existingUser.clerkId },
    });
    if (alreadyStaff) {
      throw new AppError(409, `${email} is already a team member`);
    }
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // If this email already has a pending invite, treat this submission as a
  // resend: update the role/expiry in place instead of erroring out. That
  // lets an owner fix a mis-typed role or refresh a stale invite right from
  // the same form, without first having to cancel it.
  const existingInvite = await prisma.staffInvite.findFirst({
    where: { marinaId: req.marinaId!, email },
  });

  if (existingInvite) {
    const updated = await prisma.staffInvite.update({
      where: { id: existingInvite.id },
      data:  { role, expiresAt },
    });
    return res.status(200).json({ ...updated, resent: true });
  }

  const invite = await prisma.staffInvite.create({
    data: {
      marinaId: req.marinaId!,
      email,
      role,
      expiresAt,
    },
  });

  res.status(201).json({ ...invite, resent: false });
});

// ─── PATCH /team/:memberId ───────────────────────────────────────────────────
const UpdateRoleSchema = z.object({
  role: z.enum(['manager', 'staff']),
});

router.patch('/:memberId', requireAuth, requireMarinaOwner, async (req: AuthRequest, res) => {
  const { role } = UpdateRoleSchema.parse(req.body);
  const member = await prisma.staffMember.findUniqueOrThrow({
    where: { id: req.params.memberId },
  });

  if (member.marinaId !== req.marinaId) {
    throw new AppError(403, 'Member does not belong to your marina');
  }
  if (member.role === 'owner') {
    throw new AppError(400, 'Cannot change the role of the marina owner');
  }

  const updated = await prisma.staffMember.update({
    where: { id: req.params.memberId },
    data:  { role },
  });
  res.json(updated);
});

// ─── DELETE /team/:memberId ──────────────────────────────────────────────────
router.delete('/:memberId', requireAuth, requireMarinaOwner, async (req: AuthRequest, res) => {
  // Could be a confirmed member or a pending invite — check both.
  const member = await prisma.staffMember.findUnique({
    where: { id: req.params.memberId },
  });

  if (member) {
    if (member.marinaId !== req.marinaId) {
      throw new AppError(403, 'Member does not belong to your marina');
    }
    if (member.role === 'owner') {
      throw new AppError(400, 'Cannot remove the marina owner');
    }
    await prisma.staffMember.delete({ where: { id: req.params.memberId } });
    return res.json({ ok: true });
  }

  // Try pending invite.
  const invite = await prisma.staffInvite.findUnique({
    where: { id: req.params.memberId },
  });
  if (invite) {
    if (invite.marinaId !== req.marinaId) {
      throw new AppError(403, 'Invite does not belong to your marina');
    }
    await prisma.staffInvite.delete({ where: { id: req.params.memberId } });
    return res.json({ ok: true });
  }

  throw new AppError(404, 'Team member or invite not found');
});

export default router;
