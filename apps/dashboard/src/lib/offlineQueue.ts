/**
 * Generic offline mutation queue for the marina dashboard.
 *
 * Mirrors apps/mobile/src/lib/offlineQueue.ts — same idea, browser storage.
 * Used for staff actions that are safe to retry/replay automatically when
 * connectivity returns (check-in/out, walk-in bookings, blockouts, notes)
 * — NEVER for payment endpoints, where a duplicate send would be harmful.
 * Payment routes must keep failing loudly offline, not get queued.
 */

const QUEUE_KEY = 'lake-pass-dashboard-offline-queue';

// Endpoints that must never be queued, even if a caller asks to. Matched as
// a substring against the request URL.
const NEVER_QUEUE = ['/payments', '/stripe', '/checkout', '/refund'];

export interface QueuedAction {
  id: string;
  method: 'post' | 'patch' | 'delete' | 'put';
  url: string;
  body?: any;
  createdAt: number;
  description: string; // shown in the pending-sync UI, e.g. "Check in booking #A213"
}

function readQueue(): QueuedAction[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedAction[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  // Let any listening UI (e.g. the pending-sync badge) know the count changed.
  window.dispatchEvent(new CustomEvent('lake-pass-offline-queue-change'));
}

export function isQueueable(url: string): boolean {
  return !NEVER_QUEUE.some((fragment) => url.includes(fragment));
}

export function enqueueAction(action: Omit<QueuedAction, 'id' | 'createdAt'>) {
  if (!isQueueable(action.url)) {
    throw new Error(`Refusing to queue a payment-related request offline: ${action.url}`);
  }
  const queue = readQueue();
  queue.push({
    ...action,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: Date.now(),
  });
  writeQueue(queue);
}

export function getQueue(): QueuedAction[] {
  return readQueue();
}

export function getQueueLength(): number {
  return readQueue().length;
}

/**
 * Call on app start and whenever the browser regains connectivity, with the
 * live authed axios instance from useApi(). Replays queued actions in the
 * order they were created; anything that still fails stays queued.
 */
export async function flushQueue(authedApi: {
  post: Function;
  patch: Function;
  delete: Function;
  put: Function;
}) {
  if (typeof window !== 'undefined' && window.navigator && !window.navigator.onLine) {
    return { flushed: 0, remaining: readQueue().length };
  }

  const queue = readQueue();
  if (!queue.length) return { flushed: 0, remaining: 0 };

  const remaining: QueuedAction[] = [];
  let flushed = 0;
  for (const action of queue) {
    try {
      await (authedApi as any)[action.method](action.url, action.body);
      flushed++;
    } catch {
      remaining.push(action); // keep it queued, try again next time
    }
  }
  writeQueue(remaining);
  return { flushed, remaining: remaining.length };
}
