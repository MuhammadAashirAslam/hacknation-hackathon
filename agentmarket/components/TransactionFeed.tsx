'use client';

import type { Transaction } from '@/lib/types';

export interface TransactionFeedProps {
  initialTransactions?: Transaction[];
  maxItems?: number;
}

export function TransactionFeed(props: TransactionFeedProps): JSX.Element {
  throw new Error('Not implemented');
}
