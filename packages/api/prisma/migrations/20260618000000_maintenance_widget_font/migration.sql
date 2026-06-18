-- Add widgetFont to marinas
ALTER TABLE "marinas" ADD COLUMN IF NOT EXISTS "widgetFont" TEXT DEFAULT 'system-ui';

-- Create maintenance_logs table
CREATE TABLE IF NOT EXISTS "maintenance_logs" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "boatId"      TEXT NOT NULL REFERENCES "boats"("id") ON DELETE CASCADE,
  "type"        TEXT NOT NULL,
  "notes"       TEXT,
  "cost"        DOUBLE PRECISION,
  "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "performedBy" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "maintenance_logs_boatId_idx" ON "maintenance_logs"("boatId");
