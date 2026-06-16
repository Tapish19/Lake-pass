import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '@clerk/backend';
import { AppError } from './errorHandler';
import { prisma } from '../lib/prisma';
import type { StaffRole } from '@lake-pass/shared';

export interface AuthRequest extends Request {
  userId?:    string;
  clerkId?:    string;
  clerkEmail?: string;
  marinaId?:   string;
  staffRole?: StaffRole;
}

/**
 * Verifies the Clerk session token and resolves it to a consumer User
 * (sets req.userId) and/or a marina StaffMember (sets req.marinaId +
 * req.staffRole).
 *
 * IMPORTANT: we do NOT throw when neither row exists yet.  The POST
 * /auth/sync endpoint is called by new users to CREATE their User row —
 * it runs after requireAuth and therefore must be allowed through even
 * when the DB row doesn't exist yet.  Downstream handlers that truly
 * require a persisted user (e.g. POST /reservations) check req.userId
 * themselves and throw 403.
 */
export async function requireAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) throw new AppError(401, 'Unauthorized — no Bearer token');

  let clerkId: string;
  let clerkEmail: string | undefined;
  try {
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! });
    clerkId = payload.sub;
    clerkEmail = typeof payload.email === 'string' ? payload.email : undefined;
  } catch {
    throw new AppError(401, 'Invalid or expired session token');
  }

  req.clerkId = clerkId;
  req.clerkEmail = clerkEmail;

  const [staffMember, user] = await Promise.all([
    prisma.staffMember.findUnique({ where: { clerkId } }),
    prisma.user.findUnique({ where: { clerkId } }),
  ]);

  if (staffMember) {
    req.marinaId  = staffMember.marinaId;
    req.staffRole = staffMember.role;
  }
  if (user) {
    req.userId = user.id;
  }

  // Allow through even if no DB row exists — POST /auth/sync handles first-time users.
  next();
}

/**
 * Optional production bootstrap: set MARINA_OWNER_CLERK_IDS or
 * MARINA_OWNER_EMAILS (comma-separated) to let the configured account claim
 * the single active marina even if a stale staff row already exists.
 */
function parseEnvList(value: string | undefined) {
  return new Set(
    (value ?? '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isConfiguredOwner(req: AuthRequest) {
  if (!req.clerkId) return false;

  const ownerClerkIds = parseEnvList(process.env.MARINA_OWNER_CLERK_IDS);
  if (ownerClerkIds.has(req.clerkId.toLowerCase())) return true;

  const ownerEmails = parseEnvList(process.env.MARINA_OWNER_EMAILS);
  return !!req.clerkEmail && ownerEmails.has(req.clerkEmail.toLowerCase());
}

async function bootstrapFirstMarinaOwner(req: AuthRequest) {
  if (!req.clerkId || req.marinaId) return;

  const [staffCount, marinas] = await Promise.all([
    prisma.staffMember.count(),
    prisma.marina.findMany({
      where: { isActive: true },
      select: { id: true },
      take: 2,
    }),
  ]);

  const canClaimOnlyMarina = staffCount === 0 && marinas.length === 1;
  const canUseConfiguredOwner = isConfiguredOwner(req) && marinas.length === 1;
  if (!canClaimOnlyMarina && !canUseConfiguredOwner) return;

  let staffMember;
  try {
    staffMember = await prisma.staffMember.upsert({
  where:  { clerkId: req.clerkId },
  create: { clerkId: req.clerkId!, marinaId: marinas[0].id, role: 'owner' },
  update: {},
});
  } catch (error: any) {
    if (error?.code !== 'P2002') {
      throw error;
    }

    staffMember = await prisma.staffMember.findUnique({ where: { clerkId: req.clerkId } });
  }

  if (!staffMember) return;

  req.marinaId  = staffMember.marinaId;
  req.staffRole = staffMember.role;
}

/** Ensures the authenticated principal is staff for a marina. */
export async function requireMarinaStaff(req: AuthRequest, _res: Response, next: NextFunction) {
  await bootstrapFirstMarinaOwner(req);
  if (!req.marinaId) throw new AppError(403, 'Marina staff access required');
  next();
}

/** Ensures the authenticated principal is an owner of their marina. */
export async function requireMarinaOwner(req: AuthRequest, _res: Response, next: NextFunction) {
  await bootstrapFirstMarinaOwner(req);
  if (!req.marinaId || req.staffRole !== 'owner') throw new AppError(403, 'Marina owner access required');
  next();
}
