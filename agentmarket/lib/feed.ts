import type { Transaction } from './types';

export type FeedSubscriber = (tx: Transaction) => void;

// HMR-safe singletons — survive Next.js hot reloads.
const g = globalThis as unknown as {
  __feedListeners?: Set<FeedSubscriber>;
  __feedRecent?: Transaction[];
};
const listeners: Set<FeedSubscriber> =
  g.__feedListeners ?? (g.__feedListeners = new Set<FeedSubscriber>());
const recent: Transaction[] =
  g.__feedRecent ?? (g.__feedRecent = []);

const MAX_RECENT = 100;

export function subscribe(fn: FeedSubscriber): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function broadcast(tx: Transaction): void {
  if (recent.length >= MAX_RECENT) recent.shift();
  recent.push(tx);
  for (const fn of listeners) {
    try {
      fn(tx);
    } catch (err) {
      console.error('[feed] listener threw:', err);
    }
  }
}

export function getRecentTransactions(limit = 20): Transaction[] {
  return recent.slice(-limit);
}

