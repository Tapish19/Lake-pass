-- Reconciles schema drift: these columns existed in schema.prisma but were
-- never captured in a tracked migration.

-- Soft-delete + GDPR export tracking on users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dataExportRequestedAt" TIMESTAMP(3);

-- Staff invite expiry
ALTER TABLE "staff_invites" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);

-- Stripe security deposit hold reference on reservations
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "securityDepositHoldId" TEXT;

-- Compliance requests (GDPR/CCPA export + deletion tracking) — table was
-- never created in any prior migration
CREATE TABLE IF NOT EXISTS "compliance_requests" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "type"        TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'pending',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "notes"       TEXT,

    CONSTRAINT "compliance_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "compliance_requests_userId_idx" ON "compliance_requests"("userId");
