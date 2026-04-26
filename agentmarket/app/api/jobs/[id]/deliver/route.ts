import { NextResponse } from 'next/server';
import { payInvoice } from '@/lib/lightning';
import { getJob, updateJob } from '@/lib/store';
import { broadcast } from '@/lib/feed';
import type { Job } from '@/lib/types';

interface RouteContext {
  params: Promise<{ id: string }>;
}
const FREE_MODE = process.env.DEMO_FREE_JOBS === 'true';

export async function POST(req: Request, ctx: RouteContext): Promise<Response> {
  const { id } = await ctx.params;

  let rawBody: Record<string, unknown>;
  try {
    rawBody = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body', code: 'INVALID_BODY' }, { status: 400 });
  }

  const { worker_id, result, payout_invoice } = rawBody;

  if (!worker_id || typeof worker_id !== 'string') {
    return NextResponse.json({ error: 'worker_id is required', code: 'MISSING_WORKER_ID' }, { status: 400 });
  }
  if (!result || typeof result !== 'string') {
    return NextResponse.json({ error: 'result is required', code: 'MISSING_RESULT' }, { status: 400 });
  }
  if (result.length > 50_000) {
    return NextResponse.json({ error: 'result exceeds 50,000 characters', code: 'RESULT_TOO_LONG' }, { status: 400 });
  }
  if (!payout_invoice || typeof payout_invoice !== 'string' || !payout_invoice.startsWith('lnbc')) {
    return NextResponse.json({ error: 'payout_invoice must be a valid BOLT11 (starts with lnbc)', code: 'INVALID_INVOICE' }, { status: 400 });
  }

  const job = getJob(id);
  if (!job) {
    return NextResponse.json({ error: 'Job not found', code: 'not_found' }, { status: 404 });
  }
  if (job.status !== 'claimed') {
    return NextResponse.json(
      { error: `Job is not in claimed state (current: ${job.status})`, code: 'invalid_state', status: job.status },
      { status: 409 },
    );
  }
  if (job.worker_id !== worker_id) {
    return NextResponse.json({ error: 'This job belongs to a different worker', code: 'not_your_job' }, { status: 403 });
  }

  // ATOMIC PRE-LOCK: write status='completed' before any await.
  // Concurrent retries will see 'completed' and hit the 409 guard above.
  // No await between the guard read above and this write — JS event loop guarantees exclusivity.
  const locked = updateJob(id, { status: 'completed' });
  if (!locked) {
    return NextResponse.json({ error: 'Update failed', code: 'UPDATE_FAILED' }, { status: 500 });
  }

  if (!FREE_MODE) {
    try {
      await payInvoice(payout_invoice);
    } catch {
      // Revert: daemon rejected the payment; put job back so worker can retry deliver.
      updateJob(id, { status: 'claimed' });
      return NextResponse.json({ error: 'Payout failed', code: 'PAYMENT_FAILED' }, { status: 502 });
    }
  }

  const completed = updateJob(id, { result, completed_at: Date.now() });

  broadcast({
    id: crypto.randomUUID(),
    type: 'job_completed',
    sats: job.reward_sats,
    direction: 'out',
    job_id: job.id,
    agent_id: worker_id,
    timestamp: Date.now(),
  });

  return NextResponse.json(completed as Job, { status: 200 });
}
