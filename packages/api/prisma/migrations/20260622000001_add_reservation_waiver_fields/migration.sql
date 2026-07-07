-- Waiver signing metadata captured at booking time, reused on rebook via signed_waivers
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "waiverSignedAt" TIMESTAMP(3);
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "waiverIpAddress" TEXT;
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "waiverSignerName" TEXT;
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "waiverVersion" TEXT;
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "waiverTextSnapshot" TEXT;
