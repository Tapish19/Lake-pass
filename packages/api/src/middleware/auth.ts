import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '@clerk/backend';
import { AppError } from './errorHandler';
import { prisma } from '../lib/prisma';
import type { StaffRole } from '@lake-pass/shared';

export interface AuthRequest extends Request {
  userId?:    string;
  clerkId?:   string;
  marinaId?:  string;
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
  try {
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! });
    clerkId = payload.sub;
  } catch {
    throw new AppError(401, 'Invalid or expired session token');
  }

  req.clerkId = clerkId;

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

/** Ensures the authenticated principal is staff for a marina. */
export function requireMarinaStaff(req: AuthRequest, _res: Response, next: NextFunction) {
  if (!req.marinaId) throw new AppError(403, 'Marina staff access required');
  next();
}

/** Ensures the authenticated principal is an owner of their marina. */
export function requireMarinaOwner(req: AuthRequest, _res: Response, next: NextFunction) {
  if (!req.marinaId || req.staffRole !== 'owner') throw new AppError(403, 'Marina owner access required');
  next();
}
