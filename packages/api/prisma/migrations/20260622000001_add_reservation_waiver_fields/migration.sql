-- Waiver signing metadata captured at booking time, reused on rebook via signed_waivers
ALTER TABLE "reservations" ADD COLUMN "waiverSignedAt" TIMESTAMP(3);
ALTER TABLE "reservations" ADD COLUMN "waiverIpAddress" TEXT;
ALTER TABLE "reservations" ADD COLUMN "waiverSignerName" TEXT;
ALTER TABLE "reservations" ADD COLUMN "waiverVersion" TEXT;
ALTER TABLE "reservations" ADD COLUMN "waiverTextSnapshot" TEXT;
