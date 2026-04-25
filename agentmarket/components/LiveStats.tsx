'use client';

import type { MarketplaceStats } from '@/lib/types';

export interface LiveStatsProps {
  pollIntervalMs?: number;
  initialStats?: MarketplaceStats;
}

export function LiveStats(props: LiveStatsProps): JSX.Element {
  throw new Error('Not implemented');
}
