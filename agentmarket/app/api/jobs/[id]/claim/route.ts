import { NextResponse } from 'next/server';
import { withL402 } from '@/lib/lightning';
import { getJob, updateJob } from '@/lib/store';
import { broadcast } from '@/lib/feed';
import type { Job } from '@/lib/types';

const DEPOSIT_SATS = Number(process.env.CLAIM_DEPOSIT_SATS ?? '2');
const FREE_MODE = process.env.DEMO_FREE_JOBS === 'true';

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
    // Idempotent: if THIS worker has already claimed it, return 200 so the
    // worker can proceed to deliver. (Demo-mode children are claim-free, so
    // duplicate ticks against the same job were silently 409'ing the rightful
    // worker.) Only block if a DIFFERENT worker holds it.
    if (job.worker_id === worker_id) {
      return NextResponse.json(job as Job, { status: 200 });
    }
    return NextResponse.json({ error: 'Job already claimed', code: 'already_claimed' }, { status: 409 });
  }
  if (job.status === 'completed') {
    return NextResponse.json({ error: 'Job already completed', code: 'already_completed' }, { status: 409 });
  }
  if (job.status === 'expired') {
    return NextResponse.json({ error: 'Job expired', code: 'expired' }, { status: 410 });
  }
  // Round-robin enforcement: when the marketplace has assigned the job to a
  // specific worker (via the queue), only that worker may claim. If no worker
  // is assigned (no fleet registered, single-worker dev), fall through.
  if (job.assigned_worker_id !== null && job.assigned_worker_id !== worker_id) {
    return NextResponse.json(
      { error: 'Job assigned to a different worker', code: 'not_assigned' },
      { status: 403 },
    );
  }

  const updated = updateJob(id, { status: 'claimed', worker_id, claimed_at: Date.now() });
  if (!updated) {
    return NextResponse.json({ error: 'Update failed', code: 'UPDATE_FAILED' }, { status: 500 });
  }

  broadcast({
    id: crypto.randomUUID(),
    type: 'job_claimed',
    sats: DEPOSIT_SATS,
    direction: 'in',
    job_id: updated.id,
    agent_id: worker_id,
    timestamp: Date.now(),
  });

  return NextResponse.json(updated as Job, { status: 200 });
};

const _handler = withL402(claimHandler, { sats: DEPOSIT_SATS });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  if (FREE_MODE) return claimHandler(req, ctx);

  // Decomposed children skip L402 — they're orchestrated by the marketplace
  // and the user already paid for the parent. Real money still moves on
  // delivery (marketplace pays out child.reward_sats to the worker).
  const { id } = await ctx.params;
  const peek = getJob(id);
  if (peek && peek.parent_job_id !== null) {
    return claimHandler(req, { params: Promise.resolve({ id }) });
  }

  return _handler(req, ctx);
}
