import { NextResponse } from 'next/server';
import type { ApiError, Job } from '@/lib/types';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Not L402-protected. Worker submits result + payout_invoice; on validation
// success, marketplace releases reward_sats from escrow to that invoice.
export async function POST(
  req: Request,
  ctx: RouteContext,
): Promise<NextResponse<Job | ApiError>> {
  throw new Error('Not implemented');
}
