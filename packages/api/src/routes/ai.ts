import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireAuth, requireMarinaManager, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { runAnalyticsQuery, ChatTurn } from '../lib/aiQueryEngine';

const router = Router();

// ── Rate limiting ────────────────────────────────────────────────────────
// LLM calls are expensive (latency + $) — keep this tighter than the global
// limiter. 30 questions per 15 minutes per IP is generous for a human typing
// questions but stops runaway scripts / abuse.
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI Copilot requests, please slow down.' },
});

// ── In-memory conversation history (per marina) ─────────────────────────
// Keeps follow-up questions ("What about last year?") working without a DB
// migration. This is intentionally simple:
//   - Capped length (last N turns) to bound prompt size / cost.
//   - Capped total sessions to bound memory usage.
//   - Not persisted — a server restart clears history, which is an
//     acceptable trade-off for a v1. For multi-instance deployments, swap
//     this Map for Redis (see README "Caching recommendations").
const MAX_HISTORY_TURNS = 8; // 4 user + 4 assistant turns
const MAX_SESSIONS = 5000;
const conversationStore = new Map<string, ChatTurn[]>();

function getHistory(sessionKey: string): ChatTurn[] {
  return conversationStore.get(sessionKey) ?? [];
}

function appendHistory(sessionKey: string, question: string, answer: string) {
  if (conversationStore.size >= MAX_SESSIONS && !conversationStore.has(sessionKey)) {
    // Evict the oldest entry (Map preserves insertion order).
    const oldestKey = conversationStore.keys().next().value;
    if (oldestKey) conversationStore.delete(oldestKey);
  }
  const history = getHistory(sessionKey);
  history.push({ role: 'user', content: question }, { role: 'assistant', content: answer });
  conversationStore.set(sessionKey, history.slice(-MAX_HISTORY_TURNS));
}

const QuerySchema = z.object({
  question: z.string().min(3, 'Question is too short').max(500, 'Question is too long'),
  // Optional client-supplied session id to isolate multiple concurrent chat
  // threads for the same manager (e.g. two browser tabs). Falls back to the
  // marina id, which keeps a single running conversation per marina.
  sessionId: z.string().max(100).optional(),
  resetHistory: z.boolean().optional(),
});

// ── POST /api/ai/query ───────────────────────────────────────────────────
router.post('/query', aiLimiter, requireAuth, requireMarinaManager, async (req: AuthRequest, res: Response) => {
  const parsed = QuerySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.errors[0]?.message ?? 'Invalid request body');
  }

  const { question, sessionId, resetHistory } = parsed.data;
  const marinaId = req.marinaId!;
  const sessionKey = `${marinaId}:${sessionId ?? 'default'}`;

  if (resetHistory) conversationStore.delete(sessionKey);

  const history = getHistory(sessionKey);
  const result = await runAnalyticsQuery(question, history, marinaId);

  appendHistory(sessionKey, question, result.answer);

  res.json({
    answer: result.answer,
    sql: result.sql,
    rows: result.rows,
    chart: result.chartData ? { type: result.chartType, data: result.chartData } : null,
  });
});

// ── DELETE /api/ai/query/history ─────────────────────────────────────────
router.delete('/query/history', requireAuth, requireMarinaManager, async (req: AuthRequest, res: Response) => {
  const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : 'default';
  conversationStore.delete(`${req.marinaId}:${sessionId}`);
  res.json({ ok: true });
});

export default router;
