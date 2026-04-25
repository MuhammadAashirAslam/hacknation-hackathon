import { NextResponse } from 'next/server';
import { withL402 } from '@/lib/lightning';
import { getJob, updateJob } from '@/lib/store';
import type { Job } from '@/lib/types';

const DEPOSIT_SATS = Number(process.env.CLAIM_DEPOSIT_SATS ?? '2');

const claimHandler = async (req: Request, context?: unknown): Promise<Response> => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;

  let rawBody: Record<string, unknown>;
  try {
    rawBody = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body', code: 'INVALID_BODY' }, { status: 400 });
  }

  const { worker_id } = rawBody;
  if (!worker_id || typeof worker_id !== 'string') {
    return NextResponse.json({ error: 'worker_id is required', code: 'MISSING_WORKER_ID' }, { status: 400 });
  }

  const job = getJob(id);
  if (!job) {
    return NextResponse.json({ error: 'Job not found', code: 'not_found' }, { status: 404 });
  }
  if (job.status === 'claimed') {
    return NextResponse.json({ error: 'Job already claimed', code: 'already_claimed' }, { status: 409 });
  }
  if (job.status === 'completed') {
    return NextResponse.json({ error: 'Job already completed', code: 'already_completed' }, { status: 409 });
  }
  if (job.status === 'expired') {
    return NextResponse.json({ error: 'Job expired', code: 'expired' }, { status: 410 });
  }

  const updated = updateJob(id, { status: 'claimed', worker_id, claimed_at: Date.now() });
  if (!updated) {
    return NextResponse.json({ error: 'Update failed', code: 'UPDATE_FAILED' }, { status: 500 });
  }
  return NextResponse.json(updated as Job, { status: 200 });
};

const _handler = withL402(claimHandler, { sats: DEPOSIT_SATS });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return _handler(req, ctx);
}
