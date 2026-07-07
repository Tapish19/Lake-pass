-- Soft-delete + GDPR export tracking on users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dataExportRequestedAt" TIMESTAMP(3);

-- Staff invite expiry
ALTER TABLE "staff_invites" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);

-- Stripe security deposit hold reference on reservations
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "securityDepositHoldId" TEXT;

-- Compliance request completion timestamp
ALTER TABLE "compliance_requests" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
