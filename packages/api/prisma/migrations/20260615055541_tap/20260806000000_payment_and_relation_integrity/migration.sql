ALTER TABLE "reservations"
  ADD COLUMN IF NOT EXISTS "stripePaymentIntentId" TEXT;

UPDATE "reservations"
SET
  "stripePaymentIntentId" = "stripeSessionId",
  "stripeSessionId" = NULL
WHERE
  "stripePaymentIntentId" IS NULL
  AND "stripeSessionId" LIKE 'pi_%';

ALTER TABLE "staff_members"
  ADD COLUMN IF NOT EXISTS "pushToken" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'addons_marinaId_fkey'
  ) THEN
    ALTER TABLE "addons"
      ADD CONSTRAINT "addons_marinaId_fkey"
      FOREIGN KEY ("marinaId")
      REFERENCES "marinas"("id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'compliance_requests_userId_fkey'
  ) THEN
    ALTER TABLE "compliance_requests"
      ADD CONSTRAINT
        "compliance_requests_userId_fkey"
      FOREIGN KEY ("userId")
      REFERENCES "users"("id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS
  "boats_marinaId_idx"
  ON "boats"("marinaId");

CREATE INDEX IF NOT EXISTS
  "staff_members_marinaId_idx"
  ON "staff_members"("marinaId");

CREATE INDEX IF NOT EXISTS
  "addons_marinaId_idx"
  ON "addons"("marinaId");

CREATE INDEX IF NOT EXISTS
  "reservations_boatId_startDate_endDate_idx"
  ON "reservations"(
    "boatId",
    "startDate",
    "endDate"
  );

CREATE INDEX IF NOT EXISTS
  "reservations_userId_idx"
  ON "reservations"("userId");

CREATE INDEX IF NOT EXISTS
  "reservations_stripePaymentIntentId_idx"
  ON "reservations"("stripePaymentIntentId");

CREATE INDEX IF NOT EXISTS
  "reservation_addons_reservationId_idx"
  ON "reservation_addons"("reservationId");

CREATE INDEX IF NOT EXISTS
  "reservation_addons_addonId_idx"
  ON "reservation_addons"("addonId");

CREATE INDEX IF NOT EXISTS
  "reviews_userId_idx"
  ON "reviews"("userId");

CREATE INDEX IF NOT EXISTS
  "blockouts_boatId_startDate_endDate_idx"
  ON "blockouts"(
    "boatId",
    "startDate",
    "endDate"
  );

CREATE INDEX IF NOT EXISTS
  "favorites_boatId_idx"
  ON "favorites"("boatId");

CREATE INDEX IF NOT EXISTS
  "notification_logs_reservationId_idx"
  ON "notification_logs"("reservationId");

CREATE INDEX IF NOT EXISTS
  "maintenance_logs_boatId_idx"
  ON "maintenance_logs"("boatId");

CREATE INDEX IF NOT EXISTS
  "calendar_feeds_boatId_idx"
  ON "calendar_feeds"("boatId");
