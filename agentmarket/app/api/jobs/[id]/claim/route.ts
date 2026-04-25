import { NextResponse } from 'next/server';
import type { ApiError, Job } from '@/lib/types';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// L402-protected. Fixed price = CLAIM_DEPOSIT_SATS (2).
export async function POST(
  req: Request,
  ctx: RouteContext,
): Promise<NextResponse<Job | ApiError>> {
  throw new Error('Not implemented');
}
