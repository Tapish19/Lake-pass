/**
 * Team management routes — owner-only.
 *
 * GET    /marinas/:id/team            → list all staff members
 * POST   /marinas/:id/team/invite     → invite by email (creates pending invite)
 * PATCH  /marinas/:id/team/:memberId  → change role
 * DELETE /marinas/:id/team/:memberId  → remove member
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

const router = Router({ mergeParams: true }); // inherits :id from parent

// ─── helpers ────────────────────────────────────────────────────────────────

function guardMarina(req: AuthRequest) {
  if (req.params.id !== req.marinaId) {
    throw new AppError(403, 'You do not manage this marina');
  }
}

// ─── GET /marinas/:id/team ───────────────────────────────────────────────────
// Returns both confirmed staff members and pending invites so the UI can show
// one unified list.
router.get('/', requireAuth, requireMarinaStaff, async (req: AuthRequest, res) => {
  guardMarina(req);

  const [members, invites] = await Promise.all([
    prisma.staffMember.findMany({
      where: { marinaId: req.marinaId! },
      include: {
        // Pull display info from the linked User row when it exists.
        // StaffMember.clerkId → User.clerkId
      },
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
    expiresAt: inv.expiresAt,
  }));

  res.json({ members: enriched, invites: pendingInvites });
});

// ─── POST /marinas/:id/team/invite ──────────────────────────────────────────
const InviteSchema = z.object({
  email: z.string().email(),
  role:  z.enum(['manager', 'staff']),
});

router.post('/invite', requireAuth, requireMarinaOwner, async (req: AuthRequest, res) => {
  guardMarina(req);

  const { email, role } = InviteSchema.parse(req.body);

  // Prevent duplicate active invites for the same email.
  const existing = await prisma.staffInvite.findFirst({
    where: { marinaId: req.marinaId!, email },
  });
  if (existing) {
    throw new AppError(409, `An invite for ${email} is already pending`);
  }

  // Also prevent inviting someone who is already a staff member.
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

  const invite = await prisma.staffInvite.create({
    data: {
      marinaId: req.marinaId!,
      email,
      role,
      expiresAt,
    },
  });

  res.status(201).json(invite);
});

// ─── PATCH /marinas/:id/team/:memberId ──────────────────────────────────────
const UpdateRoleSchema = z.object({
  role: z.enum(['manager', 'staff']),
});

router.patch('/:memberId', requireAuth, requireMarinaOwner, async (req: AuthRequest, res) => {
  guardMarina(req);

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

// ─── DELETE /marinas/:id/team/:memberId ─────────────────────────────────────
router.delete('/:memberId', requireAuth, requireMarinaOwner, async (req: AuthRequest, res) => {
  guardMarina(req);

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
