import { NextResponse } from 'next/server';
import { listJobs } from '@/lib/store';
import type { ApiError, MarketplaceStats } from '@/lib/types';

const DEPOSIT_SATS = Number(process.env.CLAIM_DEPOSIT_SATS ?? '2');

export async function GET(): Promise<NextResponse<MarketplaceStats | ApiError>> {
  const jobs = listJobs();
  const completed = jobs.filter((j) => j.status === 'completed');
  const claimed   = jobs.filter((j) => j.status === 'claimed');

  const sats_moved =
    completed.reduce((sum, j) => sum + j.reward_sats + j.fee_sats + DEPOSIT_SATS, 0) +
    claimed.reduce(  (sum, j) => sum + DEPOSIT_SATS, 0);

  return NextResponse.json({
    jobs_total:     jobs.length,
    jobs_open:      jobs.filter((j) => j.status === 'open').length,
    jobs_claimed:   claimed.length,
    jobs_completed: completed.length,
    sats_moved,
    fees_collected: completed.reduce((sum, j) => sum + j.fee_sats, 0),
  });
}
