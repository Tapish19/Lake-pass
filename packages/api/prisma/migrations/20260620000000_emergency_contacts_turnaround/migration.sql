-- Add emergency contacts to users
ALTER TABLE "users" ADD COLUMN "emergencyContactName" TEXT;
ALTER TABLE "users" ADD COLUMN "emergencyContactPhone" TEXT;
ALTER TABLE "users" ADD COLUMN "emergencyContactRelation" TEXT;

-- Add turnaround buffer to boats (minutes between reservations)
ALTER TABLE "boats" ADD COLUMN "turnaroundBuffer" INTEGER NOT NULL DEFAULT 0;

-- Add Stripe customer ID for saved payment methods
ALTER TABLE "users" ADD COLUMN "stripeCustomerId" TEXT;
