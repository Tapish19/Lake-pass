-- Staff push notification token (Expo) for new-booking / maintenance alerts
ALTER TABLE "staff_members" ADD COLUMN "pushToken" TEXT;

-- External calendar feeds (iCal / Google Calendar import)
CREATE TABLE "calendar_feeds" (
    "id" TEXT NOT NULL,
    "marinaId" TEXT NOT NULL,
    "boatId" TEXT,
    "label" TEXT,
    "sourceType" TEXT NOT NULL,
    "url" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_feeds_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "calendar_feeds_marinaId_idx" ON "calendar_feeds"("marinaId");

ALTER TABLE "calendar_feeds" ADD CONSTRAINT "calendar_feeds_marinaId_fkey" FOREIGN KEY ("marinaId") REFERENCES "marinas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calendar_feeds" ADD CONSTRAINT "calendar_feeds_boatId_fkey" FOREIGN KEY ("boatId") REFERENCES "boats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reusable signed waivers (one per user per waiver version)
CREATE TABLE "signed_waivers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "textSnapshot" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signed_waivers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "signed_waivers_userId_version_key" ON "signed_waivers"("userId", "version");

ALTER TABLE "signed_waivers" ADD CONSTRAINT "signed_waivers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
