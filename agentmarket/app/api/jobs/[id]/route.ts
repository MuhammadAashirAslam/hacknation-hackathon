import { NextResponse } from 'next/server';
import { getJob } from '@/lib/store';
import type { ApiError, Job } from '@/lib/types';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<Job | ApiError>> {
  try {
    const { id } = await ctx.params;
    const job = getJob(id);

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found', code: 'NOT_FOUND' },
        { status: 404 },
      );
    }

    return NextResponse.json(job);
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch job', code: 'FETCH_FAILED' },
      { status: 500 },
    );
  }
}
