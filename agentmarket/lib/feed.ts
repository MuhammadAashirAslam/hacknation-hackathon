import type { Transaction } from './types';

export type FeedSubscriber = (tx: Transaction) => void;

// Active SSE subscribers. Each /api/feed connection registers one.
const subscribers = new Set<FeedSubscriber>();
void subscribers;

// Bounded ring buffer of recent transactions for replay on new subscribers.
const recent: Transaction[] = [];
void recent;

export function subscribe(subscriber: FeedSubscriber): () => void {
  throw new Error('Not implemented');
}

export function broadcast(tx: Transaction): void {
  throw new Error('Not implemented');
}

export function getRecentTransactions(limit?: number): Transaction[] {
  throw new Error('Not implemented');
}
