/**
 * aiSchema.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Produces a compact, LLM-friendly text description of the parts of the
 * database schema that the AI Analytics Copilot is allowed to query.
 *
 * WHY A HAND-MAINTAINED ALLOWLIST INSTEAD OF INTROSPECTING information_schema:
 *  1. Security — the LLM (and therefore the generated SQL) can only ever
 *     "see" tables/columns we explicitly expose. Sensitive columns
 *     (waiverIpAddress, stripeSessionId, clerkId, tokens, etc.) never enter
 *     the prompt, so the model cannot generate SQL that selects them even
 *     by accident.
 *  2. Determinism — schema text sent to the LLM is stable across deploys,
 *     which keeps prompt-caching effective and prevents drift-induced
 *     hallucination if a migration temporarily leaves the DB in a weird
 *     state.
 *  3. Cost — a full Prisma DMMF dump is large; a curated summary is a
 *     fraction of the tokens.
 *
 * If you add a table/column that should be queryable by the Copilot, add it
 * here explicitly.
 */

export const ANALYTICS_SCHEMA_DESCRIPTION = `
You are querying a PostgreSQL database for a marina (boat rental) booking platform.
Only the following tables/columns exist for analytics purposes. Do NOT reference
any table or column not listed here.

TABLE marinas (
  id            text PRIMARY KEY,
  name          text,
  lake          text,
  city          text,
  state         text,
  "isActive"    boolean,
  "createdAt"   timestamp
)

TABLE boats (
  id                 text PRIMARY KEY,
  "marinaId"         text REFERENCES marinas(id),
  name               text,
  type               text,
  capacity           integer,
  "dailyRate"        double precision,
  "hourlyRate"       double precision,
  status             text,        -- 'available' | 'booked' | 'maintenance'
  "isActive"         boolean,
  "createdAt"        timestamp
)

TABLE users (
  id           text PRIMARY KEY,
  name         text,
  email        text,
  "createdAt"  timestamp
)

TABLE reservations (
  id               text PRIMARY KEY,
  "boatId"         text REFERENCES boats(id),
  "userId"         text REFERENCES users(id),
  "startDate"      timestamp,
  "endDate"        timestamp,
  status           text,   -- 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show'
  "paymentStatus"  text,   -- 'unpaid' | 'deposit_paid' | 'paid' | 'refunded' | 'partially_refunded'
  "rentalAmount"   double precision,
  "addonAmount"    double precision,
  "platformFee"    double precision,
  "totalAmount"    double precision,
  "depositAmount"  double precision,
  "checkedInAt"    timestamp,
  "checkedOutAt"   timestamp,
  "createdAt"      timestamp,
  "updatedAt"      timestamp
)

TABLE reservation_addons (
  id               text PRIMARY KEY,
  "reservationId"  text REFERENCES reservations(id),
  "addonId"        text,
  name             text,
  price            double precision
)

TABLE reviews (
  id        text PRIMARY KEY,
  "boatId"  text REFERENCES boats(id),
  "userId"  text REFERENCES users(id),
  rating    integer,
  "createdAt" timestamp
)

TABLE maintenance_logs (
  id            text PRIMARY KEY,
  "boatId"      text REFERENCES boats(id),
  type          text,
  cost          double precision,
  "performedAt" timestamp
)

NOTES:
- "Revenue" generally means SUM("totalAmount") from reservations where "paymentStatus" IN ('paid', 'deposit_paid', 'partially_refunded') unless the user specifies otherwise.
- "Occupancy" can be approximated as booked nights / available nights for a boat or marina over a period; when exact formula is ambiguous, use a reasonable approximation based on confirmed/checked_out reservations and explain the assumption in your final answer.
- Cancellations are reservations where status = 'cancelled'.
- Always use double-quoted camelCase column names exactly as shown (PostgreSQL is case-sensitive with quoted identifiers).
- Use table aliases and explicit JOINs. Never use SELECT *; always select named columns.
`.trim();
