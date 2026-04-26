import { NextResponse } from 'next/server';
import { payInvoice } from '@/lib/lightning';
import { getJob, listChildren, updateJob } from '@/lib/store';
import { broadcast } from '@/lib/feed';
import { aggregateResults } from '@/lib/llm';
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

  // ── Aggregation trigger ──────────────────────────────────────────────────
  // If this was a child of a decomposed parent and all siblings are now
  // completed, synthesize the parent's final answer. Run synchronously so the
  // UI sees the parent transition before the deliver call returns; the LLM
  // call adds ~1-2s but only on the LAST sibling.
  if (completed && completed.parent_job_id) {
    const parentId = completed.parent_job_id;
    const parent = getJob(parentId);
    if (parent && parent.is_decomposed && parent.status !== 'completed') {
      const siblings = listChildren(parentId);
      const allDone =
        siblings.length > 0 &&
        siblings.every((s) => s.status === 'completed' && s.result);
      if (allDone) {
        try {
          const aggregated = await aggregateResults(
            { title: parent.title, input: parent.input, category: parent.category },
            siblings.map((s) => ({ title: s.title, result: s.result ?? '' })),
          );
          const now = Date.now();
          updateJob(parentId, {
            status: 'completed',
            result: aggregated,
            completed_at: now,
            // Use the last delivering worker as the parent's worker_id so the
            // result modal can show "Completed by …" without inventing fields.
            worker_id,
            claimed_at: parent.claimed_at ?? now,
          });
          broadcast({
            id: crypto.randomUUID(),
            type: 'job_completed',
            sats: parent.reward_sats,
            direction: 'out',
            job_id: parentId,
            agent_id: worker_id,
            timestamp: now,
          });
        } catch (err) {
          console.error(
            `[deliver] aggregation failed for parent ${parentId}: ${(err as Error).message}`,
          );
          // Best-effort: leave parent in 'open' state. UI can still render
          // children individually. Demo isn't blocked.
        }
      }
    }
  }

  return NextResponse.json(completed as Job, { status: 200 });
}
