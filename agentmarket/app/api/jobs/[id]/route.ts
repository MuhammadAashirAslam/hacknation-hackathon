import { NextResponse } from 'next/server';
import type { ApiError, Job } from '@/lib/types';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _req: Request,
  ctx: RouteContext,
): Promise<NextResponse<Job | ApiError>> {
  void await ctx.params;
  throw new Error('Not implemented');
}
