import { NextResponse } from 'next/server';
import { payInvoiceAsAgent } from '@/lib/lightning';
import { createJob, rotateAssignWorker } from '@/lib/store';
import { broadcast } from '@/lib/feed';
import type { JobCategory } from '@/lib/types';

const FREE_MODE = process.env.DEMO_FREE_JOBS === 'true';
const FEE_PERCENT = Number(process.env.MARKETPLACE_FEE_PERCENT ?? '10');
const EXPIRY_MS = Number(process.env.JOB_EXPIRY_MINUTES ?? '30') * 60_000;

interface L402ChallengeBody {
  invoice: string;
  macaroon: string;
  payment_hash: string;
}

interface DemoStep {
  title: string;
  response: string;
}

export async function POST(req: Request): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // Optional input only; defaults are used below.
  }

  const rewardSats =
    Number.isInteger(body.reward_sats) && (body.reward_sats as number) > 0
      ? (body.reward_sats as number)
      : 10;

  const createBody = {
    title: typeof body.title === 'string' ? body.title : 'Demo job',
    category:
      typeof body.category === 'string'
        ? (body.category as JobCategory)
        : 'summarize',
    input:
      typeof body.input === 'string'
        ? body.input
        : 'https://en.wikipedia.org/wiki/Bitcoin',
    requester_id:
      typeof body.requester_id === 'string'
        ? body.requester_id
        : 'judge-demo',
  };

  const targetUrl = new URL(`/api/jobs?reward_sats=${rewardSats}`, req.url);
  const steps: DemoStep[] = [];

  if (FREE_MODE) {
    const feeSats = Math.ceil(rewardSats * FEE_PERCENT / 100);
    const now = Date.now();
    const job = createJob({
      id: crypto.randomUUID(),
      title: createBody.title,
      category: createBody.category,
      input: createBody.input,
      reward_sats: rewardSats,
      fee_sats: feeSats,
      status: 'open',
      requester_id: createBody.requester_id,
      assigned_worker_id: rotateAssignWorker(),
      worker_id: null,
      result: null,
      created_at: now,
      claimed_at: null,
      completed_at: null,
      expires_at: now + EXPIRY_MS,
      parent_job_id: null,
      is_decomposed: false,
    });
    broadcast({
      id: crypto.randomUUID(),
      type: 'job_posted',
      sats: job.reward_sats + job.fee_sats,
      direction: 'in',
      job_id: job.id,
      agent_id: job.requester_id,
      timestamp: now,
    });
    return NextResponse.json({
      ok: true,
      steps: [
        { title: 'Request the API', response: `HTTP 402 (simulated)\nWWW-Authenticate: L402 macaroon="demo", invoice="demo"\n\n{"invoice":"demo","macaroon":"demo","payment_hash":"demo-free-mode"}` },
        { title: 'Pay the Invoice', response: 'DEMO_FREE_JOBS=true — payment skipped.\nPayment hash: demo-free-mode' },
        { title: 'Retry with Proof of Payment', response: `HTTP 201 (simulated)\n\n${JSON.stringify(job, null, 2)}` },
      ],
      created_job_id: job.id,
      payment_hash: 'demo-free-mode',
    });
  }

  const first = await fetch(targetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createBody),
  });
  const firstBody = await first.json().catch(() => ({}));
  const wwwAuth = first.headers.get('WWW-Authenticate') ?? '';
  const challenge = firstBody as Partial<L402ChallengeBody>;
  const challengeInvoice = typeof challenge.invoice === 'string' ? challenge.invoice : '';
  const challengeMacaroon = typeof challenge.macaroon === 'string' ? challenge.macaroon : '';
  const challengePaymentHash = typeof challenge.payment_hash === 'string' ? challenge.payment_hash : '';

  steps.push({
    title: 'Request the API',
    response: `HTTP ${first.status}\nWWW-Authenticate: ${wwwAuth || '(none)'}\n\n${JSON.stringify(firstBody, null, 2)}`,
  });

  if (first.status !== 402 || !challengeInvoice || !challengeMacaroon || !challengePaymentHash) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to get a valid L402 challenge from /api/jobs',
        steps,
      },
      { status: 502 },
    );
  }

  try {
    await payInvoiceAsAgent(challengeInvoice);
    steps.push({
      title: 'Pay the Invoice',
      response: `Paid invoice with agent wallet.\nPayment hash: ${challengePaymentHash}`,
    });
  } catch (err) {
    steps.push({
      title: 'Pay the Invoice',
      response: `Payment failed: ${(err as Error).message}`,
    });
    return NextResponse.json(
      {
        ok: false,
        error: 'Failed while paying challenge invoice',
        steps,
      },
      { status: 502 },
    );
  }

  // Lightning settlement lag: the agent wallet has dispatched the payment,
  // but the marketplace daemon needs a moment to observe the inbound payment
  // before /api/jobs's L402 verify will pass. Retry until 200 (or non-402).
  // 12 × 2.5s = 30s window — same pattern as /api/demo/post-job.
  const maxReplays = 12;
  let replayBody: Record<string, unknown> = {};
  let lastStatus = 0;
  for (let i = 0; i < maxReplays; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const replay = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `L402 ${challengeMacaroon}:${challengePaymentHash}`,
      },
      body: JSON.stringify(createBody),
    });
    replayBody = (await replay.json().catch(() => ({}))) as Record<string, unknown>;
    lastStatus = replay.status;
    if (replay.ok) {
      steps.push({
        title: 'Retry with Proof of Payment',
        response: `HTTP ${replay.status}\n\n${JSON.stringify(replayBody, null, 2)}`,
      });
      return NextResponse.json({
        ok: true,
        steps,
        created_job_id: typeof replayBody.id === 'string' ? replayBody.id : null,
        payment_hash: challengePaymentHash,
      });
    }
    if (replay.status !== 402) break;
  }

  steps.push({
    title: 'Retry with Proof of Payment',
    response: `HTTP ${lastStatus}\n\n${JSON.stringify(replayBody, null, 2)}`,
  });

  return NextResponse.json(
    {
      ok: false,
      error: 'Replay failed',
      steps,
    },
    { status: 502 },
  );
}
