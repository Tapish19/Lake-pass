/**
 * aiQueryEngine.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Orchestrates the AI Analytics Copilot pipeline:
 *
 *   question (+ history) ──▶ LLM (generate SQL) ──▶ validate ──▶ execute
 *        ▲                                                          │
 *        └──────────────── LLM (explain results) ◀───────────────────┘
 *
 * Design decisions:
 *  - We call the OpenAI Chat Completions API directly via fetch rather than
 *    pulling in the full `openai` SDK, to keep the dependency footprint of
 *    this feature small and auditable. Swap in the SDK if you prefer.
 *  - We use "tool calling" (function calling) to force the model to return
 *    SQL in a structured field (`generate_sql`) rather than free text. This
 *    is far more reliable to parse than asking the model to "return only
 *    SQL" in prose, and lets us keep a `reasoning` field separate from the
 *    `sql` field so nothing except the sql field is ever executed.
 *  - Every query is tenant-scoped: the authenticated marina's ID is injected
 *    into the prompt AND enforced with a lightweight guard
 *    (see `assertTenantScoped`) so one marina's manager can never see
 *    another marina's data, regardless of what the LLM generates.
 *  - Queries execute inside a READ ONLY Postgres transaction as extra
 *    insurance beyond the keyword-based SQL validation.
 */

import { prisma } from './prisma';
import { ANALYTICS_SCHEMA_DESCRIPTION } from './aiSchema';
import { validateSql } from './aiSqlGuard';
import { AppError } from '../middleware/errorHandler';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const SQL_MODEL = process.env.AI_SQL_MODEL ?? 'gpt-4o-mini';
const EXPLAIN_MODEL = process.env.AI_EXPLAIN_MODEL ?? 'gpt-4o-mini';
interface OpenAIChatResponse {
  choices: {
    message: {
      content?: string | null;
      tool_calls?: {
        function: {
          arguments: string;
        };
      }[];
    };
  }[];
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiQueryResult {
  answer: string;
  sql: string;
  rows: Record<string, unknown>[];
  chartData?: Record<string, unknown>[] | null;
  chartType?: 'line' | 'bar' | null;
}

// ── Tool schema the model must use to return SQL ──────────────────────────
const GENERATE_SQL_TOOL = {
  type: 'function',
  function: {
    name: 'generate_sql',
    description: 'Return the PostgreSQL SELECT query that answers the question.',
    parameters: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: 'A single read-only PostgreSQL SELECT statement. No comments, no semicolons, no DDL/DML.',
        },
        assumptions: {
          type: 'string',
          description: 'Any assumptions made (e.g. definition of "revenue" or the date range used), in one short sentence. Empty string if none.',
        },
      },
      required: ['sql', 'assumptions'],
    },
  },
} as const;

async function callOpenAI(
  messages: unknown[],
  opts: {
    tools?: unknown[];
    toolChoice?: unknown;
    model: string;
  }
): Promise<OpenAIChatResponse> {  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AppError(500, 'AI Copilot is not configured (missing OPENAI_API_KEY).');
  }

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages,
      temperature: 0,
      ...(opts.tools ? { tools: opts.tools, tool_choice: opts.toolChoice ?? 'auto' } : {}),
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new AppError(502, `AI provider error (${response.status}): ${errText.slice(0, 300)}`);
  }

  return (await response.json()) as OpenAIChatResponse;
}

/**
 * Builds the system prompt that constrains the SQL-generation step.
 * This is the primary prompt-injection defense: rules are restated in the
 * system message (highest priority) and reinforced in aiSqlGuard.ts with
 * hard code-level enforcement — never rely on prompt instructions alone.
 */
function buildSqlSystemPrompt(marinaId: string) {
  return `
You are a SQL generation assistant for a marina booking platform's analytics copilot.

${ANALYTICS_SCHEMA_DESCRIPTION}

MULTI-TENANCY (CRITICAL):
The user is a manager of exactly one marina, with id = '${marinaId}'.
Every query MUST be scoped to this marina. Concretely:
  - Queries against "marinas" must filter: marinas.id = '${marinaId}'
  - Queries against "boats" must filter (directly or via join): boats."marinaId" = '${marinaId}'
  - Queries against "reservations", "reviews", "maintenance_logs", "reservation_addons"
    must join back to "boats" and filter boats."marinaId" = '${marinaId}'
Never return data belonging to a different marina, even if the user asks for
"all marinas" or "compare marinas" — in that case, explain in the sql that
only their own marina's data is accessible (i.e. the filter still applies).

STRICT RULES:
1. Generate ONLY a single PostgreSQL SELECT statement (a read-only WITH/CTE
   that ends in SELECT is also fine).
2. NEVER generate UPDATE, DELETE, INSERT, DROP, ALTER, TRUNCATE, CREATE, GRANT,
   or any statement that modifies data or schema.
3. NEVER call external functions, never use dblink, COPY, pg_read_file, or
   similar. NEVER call external APIs — you only have access to the schema above.
4. NEVER use SELECT *; always name columns explicitly.
5. Always include a reasonable LIMIT (<= 500) for row-returning queries.
6. Use double-quoted camelCase identifiers exactly as given in the schema.
7. Return your result ONLY by calling the generate_sql tool — do not write
   SQL in the chat message itself.
8. If the question cannot be answered with the given schema, call
   generate_sql with an empty "sql" string and explain why in "assumptions".
  `.trim();
}

function buildExplainSystemPrompt() {
  return `
You are a business analytics assistant for a marina booking platform.
You will be given the user's question and the JSON rows returned from a SQL
query that answers it. Write a concise, friendly, business-focused answer
(1-4 sentences). Use concrete numbers from the data (format currency as
$X,XXX and percentages naturally). Do not mention SQL, tables, or the
database. If the rows are empty, say so plainly and suggest a likely reason
(e.g. no bookings in that period).
  `.trim();
}

/**
 * Detects whether the result rows look like a numeric/time-series shape
 * suitable for chart rendering, and infers a reasonable chart type.
 * Purely heuristic — the frontend chart component treats this as a hint.
 */
function inferChartShape(rows: Record<string, unknown>[]): { chartData: Record<string, unknown>[] | null; chartType: 'line' | 'bar' | null } {
  if (!rows.length || rows.length < 2) return { chartData: null, chartType: null };

  const sample = rows[0];
  const keys = Object.keys(sample);
  const numericKeys = keys.filter((k) => typeof sample[k] === 'number' || (!isNaN(Number(sample[k])) && sample[k] !== null && sample[k] !== ''));
  const labelKeys = keys.filter((k) => !numericKeys.includes(k));

  if (numericKeys.length === 0 || labelKeys.length === 0) return { chartData: null, chartType: null };

  const labelKey = labelKeys[0];
  const looksLikeTimeSeries = /month|date|week|day|year|period/i.test(labelKey);

  return {
    chartData: rows,
    chartType: looksLikeTimeSeries ? 'line' : 'bar',
  };
}

/**
 * Defensive additional tenant-scoping check: for any query that touches a
 * tenant-owned table, require the marinaId literal to appear as the target
 * of an EQUALITY comparison against a marinaId-ish column, not merely
 * present *somewhere* in the SQL text.
 *
 * The previous version only checked `sql.includes(marinaId)`, which a
 * generated query could satisfy without actually filtering by it — e.g.
 *   SELECT '<marinaId>' AS note, * FROM boats
 *   SELECT * FROM boats WHERE "marinaId" != '<marinaId>'
 * Both "contain" the id but return other marinas' data. This check instead
 * requires the id to sit on one side of `=` opposite an identifier that
 * looks like an id/marinaId column, and rejects negated comparisons. It's
 * still a heuristic (not a full SQL parse) — the real backstop remains the
 * DB-level READ ONLY transaction plus, ideally, Postgres row-level security
 * on the tenant tables. Treat this as defense-in-depth, not a sole guarantee.
 */
function assertTenantScoped(sql: string, marinaId: string) {
  const tenantTables = ['marinas', 'boats', 'reservations', 'reviews', 'maintenance_logs', 'reservation_addons'];
  const lower = sql.toLowerCase();
  const touchesTenantTable = tenantTables.some((t) => lower.includes(t));
  if (!touchesTenantTable) return;

  const escapedId = marinaId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Reject if the id is ever compared with != / <> — that's an exclusion
  // filter, not a scoping filter.
  const negatedComparison = new RegExp(`(!=|<>)\\s*'${escapedId}'|'${escapedId}'\\s*(!=|<>)`, 'i');
  if (negatedComparison.test(sql)) {
    throw new AppError(400, 'Generated query excluded your marina instead of scoping to it and was rejected for safety.');
  }

  // Require a real equality comparison: <ident ending in id/marinaId> = 'id'
  // (or reversed), tolerating optional table/alias qualification and quoting.
  const idColumn = `(?:[\\w"]+\\.)?"?(?:marinaId|marina_id|id)"?`;
  const equalsLeft = new RegExp(`${idColumn}\\s*=\\s*'${escapedId}'`, 'i');
  const equalsRight = new RegExp(`'${escapedId}'\\s*=\\s*${idColumn}`, 'i');

  if (!equalsLeft.test(sql) && !equalsRight.test(sql)) {
    throw new AppError(400, 'Generated query did not scope results to your marina and was rejected for safety.');
  }
}

export async function generateSql(question: string, history: ChatTurn[], marinaId: string): Promise<{ sql: string; assumptions: string }> {
  const messages = [
    { role: 'system', content: buildSqlSystemPrompt(marinaId) },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: question },
  ];

  const completion = await callOpenAI(messages, {
    model: SQL_MODEL,
    tools: [GENERATE_SQL_TOOL],
    toolChoice: { type: 'function', function: { name: 'generate_sql' } },
  });

  const toolCall = completion.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    throw new AppError(502, 'The AI did not return a query. Try rephrasing your question.');
  }

  let args: { sql: string; assumptions: string };
  try {
    args = JSON.parse(toolCall.function.arguments);
  } catch {
    throw new AppError(502, 'The AI returned a malformed response.');
  }

  return args;
}

/**
 * Executes validated, tenant-scoped SQL inside a read-only transaction.
 */
export async function executeAnalyticsSql(sql: string): Promise<Record<string, unknown>[]> {
  try {
    const rows = await prisma.$transaction(
      async (tx) => {
        // Belt-and-suspenders: mark the transaction read-only at the DB level
        // so even a successful validation bypass cannot mutate data.
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        return tx.$queryRawUnsafe(sql) as Promise<Record<string, unknown>[]>;
      },
      { timeout: 10_000 },
    );
    return rows as unknown as Record<string, unknown>[];
  } catch (error: any) {
    // Surface a clean, user-safe error — never leak raw DB errors (which can
    // include schema details) back to the client.
    throw new AppError(400, `The query could not be executed: ${error?.message?.split('\n')[0] ?? 'unknown error'}`);
  }
}

export async function explainResults(question: string, rows: Record<string, unknown>[]): Promise<string> {
  const messages = [
    { role: 'system', content: buildExplainSystemPrompt() },
    {
      role: 'user',
      content: `Question: ${question}\n\nResult rows (JSON):\n${JSON.stringify(rows).slice(0, 8000)}`,
    },
  ];

  const completion = await callOpenAI(messages, { model: EXPLAIN_MODEL });
  const text = completion.choices?.[0]?.message?.content?.trim();
  return text || 'Here are the results for your question.';
}

/**
 * Full pipeline used by the /api/ai/query route.
 */
export async function runAnalyticsQuery(question: string, history: ChatTurn[], marinaId: string): Promise<AiQueryResult> {
  const { sql: rawSql, assumptions } = await generateSql(question, history, marinaId);

  if (!rawSql) {
    return {
      answer: assumptions || "I couldn't find a way to answer that with the available data. Could you rephrase your question?",
      sql: '',
      rows: [],
    };
  }

  const validation = validateSql(rawSql);
  if (!validation.valid || !validation.sanitizedSql) {
    throw new AppError(400, `The generated query was rejected for safety reasons: ${validation.reason}`);
  }

  assertTenantScoped(validation.sanitizedSql, marinaId);

  const rows = await executeAnalyticsSql(validation.sanitizedSql);
  const answer = await explainResults(question, rows);
  const { chartData, chartType } = inferChartShape(rows);

  return { answer, sql: validation.sanitizedSql, rows, chartData, chartType };
}
