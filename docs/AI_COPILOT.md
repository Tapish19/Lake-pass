# AI Analytics Copilot

Natural-language analytics for marina managers: ask a question in plain
English, get SQL generated + safely executed + explained in business terms.

## Folder structure (new/changed files)

```
packages/api/src/
  lib/
    aiSchema.ts        # Curated, LLM-facing schema description (allowlist)
    aiSqlGuard.ts       # SQL validation: single SELECT, no DDL/DML, LIMIT cap
    aiQueryEngine.ts    # Prompt templates + OpenAI calls + execution pipeline
  routes/
    ai.ts               # POST /api/ai/query, DELETE /api/ai/query/history
  index.ts               # registers the /ai router (changed)

apps/dashboard/src/
  components/ai/CopilotChat.tsx        # Chat UI: bubbles, charts, SQL viewer
  app/(dashboard)/copilot/page.tsx     # /copilot route
  components/layout/Sidebar.tsx        # nav link added (changed)

.env.example                            # OPENAI_API_KEY, AI_SQL_MODEL, AI_EXPLAIN_MODEL (changed)
```

## Request/response

`POST /api/ai/query` (auth: Clerk bearer token, requires manager/owner role)

```json
// request
{ "question": "Which marina generated the most revenue this month?", "sessionId": "optional-client-id" }

// response
{
  "answer": "Blue Lake Marina generated the highest revenue this month with $98,100 in completed payments.",
  "sql": "SELECT m.name, SUM(r.\"totalAmount\") AS revenue FROM marinas m JOIN boats b ON b.\"marinaId\" = m.id JOIN reservations r ON r.\"boatId\" = b.id WHERE m.id = '...' AND r.\"paymentStatus\" IN ('paid','deposit_paid') GROUP BY m.name LIMIT 500",
  "rows": [{ "name": "Blue Lake Marina", "revenue": 98100 }],
  "chart": { "type": "bar", "data": [{ "name": "Blue Lake Marina", "revenue": 98100 }] }
}
```

`DELETE /api/ai/query/history?sessionId=...` clears follow-up context.

## Pipeline

1. **Schema context** — instead of introspecting `information_schema` at
   request time, we ship a hand-curated schema description
   (`aiSchema.ts`). This is both a cost optimization (fewer tokens, cache
   friendly) and a security control: the LLM literally cannot reference a
   column it was never told about (e.g. `waiverIpAddress`, `stripeSessionId`,
   `clerkId` are excluded).
2. **SQL generation** — `generateSql()` calls OpenAI with **tool/function
   calling** (`generate_sql`), forcing structured output instead of parsing
   SQL out of prose. Temperature 0 for determinism.
3. **Validation** — `validateSql()` is a reject-first regex/keyword guard:
   single statement only, `SELECT`/read-only `WITH` only, blocklist of
   DDL/DML keywords and dangerous functions (`pg_read_file`, `dblink`,
   `pg_sleep`, ...), no comments, forced `LIMIT <= 500`.
4. **Tenant scoping** — `assertTenantScoped()` additionally requires the
   authenticated manager's `marinaId` literal to appear in any query that
   touches a tenant-owned table, so one marina can never see another's data
   even if the LLM "forgets" the instruction.
5. **Execution** — runs through Prisma's `$queryRawUnsafe` **inside a
   `SET TRANSACTION READ ONLY` transaction** with a 10s timeout. This is
   defense-in-depth: even if validation had a bug, Postgres itself refuses
   writes for the duration of the transaction.
6. **Explanation** — `explainResults()` sends the question + JSON rows back
   to the LLM with a second, narrower system prompt to produce a 1-4 sentence
   business-friendly answer.
7. **Chart hinting** — `inferChartShape()` heuristically detects
   numeric + label columns (2+ rows) and returns `{ type: 'line' | 'bar', data }`
   for the frontend to render with `recharts` — no LLM call needed.
8. **Conversation history** — per-marina, per-session in-memory buffer (last
   4 turns) is prepended to the SQL-generation prompt so "What about last
   year?" resolves against the prior question. See "Scaling" below.

## Security best practices (applied + recommended)

Applied here:
- Curated schema allowlist (never expose full DB introspection to the LLM).
- Keyword + statement-shape SQL validation, reject-first.
- Forced read-only transaction at the Postgres level.
- Hard row LIMIT.
- Tenant isolation enforced twice: in the prompt AND in code.
- Auth + manager/owner role required (`requireAuth`, `requireMarinaManager`).
- Dedicated rate limit (30 req / 15 min / IP) — LLM calls are costly.
- Generic, sanitized error messages — raw Postgres errors (which can leak
  schema/constraint names) are never returned to the client.
- Input length capped (3–500 chars) via zod.

Recommended for production hardening (not implemented here, described for
the next engineer):
- Create a **dedicated read-only Postgres role** (`GRANT SELECT ON ...` only,
  no `INSERT/UPDATE/DELETE/DDL`) and point a separate `DATABASE_URL_ANALYTICS`
  connection pool at it, so a validator bug can never be the only thing
  standing between a user and a write.
- Log every generated SQL statement (question, marinaId, sql, row count,
  latency) to an audit table for review/tuning.
- Add a per-marina daily token/spend budget check before calling OpenAI.
- Consider a Postgres `statement_timeout` at the role level in addition to
  the Prisma transaction timeout.

## Caching recommendations

- **Move conversation history to Redis** (`ai:history:<marinaId>:<sessionId>`,
  TTL ~30 min) once you run more than one API instance — the current
  in-memory `Map` is per-process and won't be shared across replicas.
- **Cache identical questions** for a short TTL (e.g. 5 min) keyed on
  `hash(marinaId + normalized question)` to avoid double-billing the LLM for
  "refresh" clicks — safe because analytics data doesn't change second to
  second.
- **Cache the schema prompt string** (already a static export, so it's
  effectively free — just don't rebuild it per-request).

## Example prompts

- "What was my revenue last month?"
- "Which boats are rarely booked?"
- "Show cancellation trends for the last 6 months"
- "Top 10 customers by revenue"
- "Compare occupancy between July and August"
- "Show bookings by city"
- "Which customers haven't booked in 6 months?"
- Follow-up: "What about last year?" (uses conversation history)

## Environment variables

```
OPENAI_API_KEY="sk-..."
AI_SQL_MODEL="gpt-4o-mini"      # optional, defaults shown
AI_EXPLAIN_MODEL="gpt-4o-mini"  # optional, defaults shown
```

## Known limitations / next steps

- Conversation history is in-memory (see Caching recommendations above).
- `occupancy` and `revenue` definitions are approximated via prompt
  instructions in `aiSchema.ts` — refine per business rules as needed.
- No streaming response yet; the chat UI shows a typing indicator while it
  waits for the full answer. Streaming would need SSE on the route and a
  `ReadableStream` consumer on the frontend — swap `callOpenAI` to
  `stream: true` and pipe chunks through.
