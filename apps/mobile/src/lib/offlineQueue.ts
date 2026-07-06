/**
 * Generic offline mutation queue.
 *
 * Used for actions that are safe to retry/replay automatically when
 * connectivity returns (e.g. toggling a favorite, saving an emergency
 * contact) — NOT for payments or anything where a duplicate send would be
 * harmful. Each queued action is a plain HTTP-ish description so it can be
 * serialized to AsyncStorage and replayed with the live authed axios
 * instance later.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';

const QUEUE_KEY = 'lake-pass-offline-queue';

export interface QueuedAction {
  id:     string;
  method: 'post' | 'patch' | 'delete' | 'put';
  url:    string;
  body?:  any;
  createdAt: number;
}

async function readQueue(): Promise<QueuedAction[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedAction[]) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueueAction(action: Omit<QueuedAction, 'id' | 'createdAt'>) {
  const queue = await readQueue();
  queue.push({ ...action, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, createdAt: Date.now() });
  await writeQueue(queue);
}

export async function getQueueLength(): Promise<number> {
  return (await readQueue()).length;
}

/** Call once on app start (and whenever connectivity is regained) with an authed axios instance to flush queued actions. */
export async function flushQueue(authedApi: { post: Function; patch: Function; delete: Function; put: Function }) {
  const state = await Network.getNetworkStateAsync().catch(() => null);
  if (state && (state.isConnected === false || state.isInternetReachable === false)) return { flushed: 0, remaining: (await readQueue()).length };

  const queue = await readQueue();
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
  await writeQueue(remaining);
  return { flushed, remaining: remaining.length };
}
