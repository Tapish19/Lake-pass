/**
 * aiSqlGuard.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Defense-in-depth validation for LLM-generated SQL before it is ever
 * executed against the database.
 *
 * This is NOT the only safety layer:
 *   1. The DB role used for analytics queries should ALSO be a read-only
 *      Postgres user (see README section "Security best practices").
 *   2. Every query additionally runs inside a Prisma `$transaction` opened
 *      as READ ONLY (see aiQueryEngine.ts), so even a validation bypass
 *      cannot mutate data.
 *   3. A LIMIT is force-appended so a runaway query can't return the whole
 *      table.
 *
 * The checks here are deliberately conservative — reject first, ask
 * questions later. False positives (rejecting a safe query) are an
 * acceptable trade-off for a feature that turns free-text into SQL.
 */

const FORBIDDEN_KEYWORDS = [
  'UPDATE', 'DELETE', 'INSERT', 'DROP', 'ALTER', 'TRUNCATE', 'CREATE',
  'GRANT', 'REVOKE', 'EXECUTE', 'CALL', 'MERGE', 'REPLACE', 'VACUUM',
  'COPY', 'DO', 'ATTACH', 'DETACH', 'LOCK', 'REINDEX', 'COMMENT',
  // UNION/INTERSECT/EXCEPT can be used to splice in rows from a second,
  // unscoped SELECT within the same single statement — banning these closes
  // off the easiest way to defeat tenant-scoping (see assertTenantScoped in
  // aiQueryEngine.ts) without touching the semicolon/keyword checks above.
  'UNION', 'INTERSECT', 'EXCEPT',
];

// Postgres functions/statements that can be used to exfiltrate data,
// read local files, or otherwise escape the "SELECT for analytics" box.
const FORBIDDEN_SUBSTRINGS = [
  'pg_read_file', 'pg_ls_dir', 'pg_read_binary_file', 'lo_import', 'lo_export',
  'dblink', 'copy ', 'into outfile', 'pg_sleep', 'pg_terminate_backend',
  'current_setting', 'set_config', 'pg_reload_conf',
];

export interface SqlValidationResult {
  valid: boolean;
  reason?: string;
  sanitizedSql?: string;
}

/**
 * Strips a leading/trailing markdown code fence the LLM sometimes wraps
 * around SQL (```sql ... ```), and trims whitespace/trailing semicolons.
 */
export function extractSql(raw: string): string {
  let sql = raw.trim();
  sql = sql.replace(/^```(sql)?/i, '').replace(/```$/, '').trim();
  // If the model added a trailing semicolon, strip it — we re-add exactly one.
  sql = sql.replace(/;+\s*$/g, '').trim();
  return sql;
}

export function validateSql(rawSql: string): SqlValidationResult {
  const sql = extractSql(rawSql);

  if (!sql) {
    return { valid: false, reason: 'The model did not return any SQL.' };
  }

  // ── 1. Must be a single statement ─────────────────────────────────────
  // A semicolon anywhere in the middle (after stripping a single trailing
  // one above) indicates multiple statements — reject stacked queries.
  if (sql.includes(';')) {
    return { valid: false, reason: 'Multiple SQL statements are not allowed.' };
  }

  // ── 2. Must start with SELECT (or a read-only CTE that ends in SELECT) ──
  const normalized = sql.trim().toUpperCase();
  const startsWithSelect = normalized.startsWith('SELECT');
  const startsWithReadOnlyCte = normalized.startsWith('WITH') && !/\b(INSERT|UPDATE|DELETE)\b/.test(normalized);
  if (!startsWithSelect && !startsWithReadOnlyCte) {
    return { valid: false, reason: 'Only SELECT statements are allowed.' };
  }

  // ── 3. Reject forbidden DDL/DML keywords anywhere in the statement ─────
  // Word-boundary match so we don't false-positive on e.g. a column named
  // "updatedAt" (case-insensitive check against the raw SQL, not identifiers
  // in quotes would ideally be excluded, but rejecting is the safe default).
  for (const keyword of FORBIDDEN_KEYWORDS) {
    const pattern = new RegExp(`\\b${keyword}\\b`, 'i');
    if (pattern.test(sql)) {
      return { valid: false, reason: `Forbidden keyword detected: ${keyword}` };
    }
  }

  // ── 4. Reject dangerous functions / exfiltration vectors ───────────────
  const lowerSql = sql.toLowerCase();
  for (const bad of FORBIDDEN_SUBSTRINGS) {
    if (lowerSql.includes(bad)) {
      return { valid: false, reason: `Forbidden operation detected: ${bad.trim()}` };
    }
  }

  // ── 5. Reject comments (used to hide payloads / bypass keyword checks) ──
  if (sql.includes('--') || sql.includes('/*')) {
    return { valid: false, reason: 'SQL comments are not allowed.' };
  }

  // ── 6. Reject semicolons hidden via unicode/whitespace tricks ──────────
  // (defense-in-depth; the raw check above covers the common case)
  if (/[\u0000-\u0008\u000E-\u001F]/.test(sql)) {
    return { valid: false, reason: 'Invalid control characters in SQL.' };
  }

  // ── 7. Enforce a hard row cap ────────────────────────────────────────
  const MAX_ROWS = 500;
  let sanitizedSql = sql;
  if (!/\bLIMIT\s+\d+/i.test(sanitizedSql)) {
    sanitizedSql = `${sanitizedSql} LIMIT ${MAX_ROWS}`;
  } else {
    // Cap an existing LIMIT down to MAX_ROWS if the model asked for more.
    sanitizedSql = sanitizedSql.replace(
      /\bLIMIT\s+(\d+)/i,
      (_match, n) => `LIMIT ${Math.min(parseInt(n, 10), MAX_ROWS)}`,
    );
  }

  return { valid: true, sanitizedSql };
}
