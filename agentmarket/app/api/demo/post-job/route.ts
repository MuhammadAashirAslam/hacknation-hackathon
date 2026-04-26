import { NextResponse } from 'next/server';
import { payInvoiceAsAgent } from '@/lib/lightning';
import { createJob } from '@/lib/store';
import { broadcast } from '@/lib/feed';
import type { ApiError, Job, JobCategory } from '@/lib/types';

const FREE_MODE = process.env.DEMO_FREE_JOBS === 'true';
const FEE_PERCENT = Number(process.env.MARKETPLACE_FEE_PERCENT ?? '10');
const EXPIRY_MS = Number(process.env.JOB_EXPIRY_MINUTES ?? '30') * 60_000;

const VALID_CATEGORIES = new Set<JobCategory>(['summarize', 'classify', 'translate', 'qa']);

interface PostJobDemoBody {
  title: string;
  category: JobCategory;
  input: string;
  reward_sats: number;
  requester_id: string;
}

interface L402ChallengeBody {
  invoice: string;
  macaroon: string;
  payment_hash: string;
}

function isJob(value: unknown): value is Job {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    typeof v.category === 'string' &&
    typeof v.input === 'string' &&
    typeof v.reward_sats === 'number' &&
    typeof v.fee_sats === 'number' &&
    typeof v.status === 'string' &&
    typeof v.requester_id === 'string'
  );
}

export async function POST(req: Request): Promise<Response> {
  let rawBody: Record<string, unknown>;
  try {
    rawBody = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError, { status: 400 });
  }

  const title = rawBody.title;
  const category = rawBody.category;
  const input = rawBody.input;
  const requesterId = rawBody.requester_id;
  const rewardSats = rawBody.reward_sats;

  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'title is required', code: 'MISSING_TITLE' } satisfies ApiError, { status: 400 });
  }
  if (!category || typeof category !== 'string' || !VALID_CATEGORIES.has(category as JobCategory)) {
    return NextResponse.json({ error: 'Invalid category', code: 'INVALID_CATEGORY' } satisfies ApiError, { status: 400 });
  }
  if (!input || typeof input !== 'string') {
    return NextResponse.json({ error: 'input is required', code: 'MISSING_INPUT' } satisfies ApiError, { status: 400 });
  }
  if (!requesterId || typeof requesterId !== 'string') {
    return NextResponse.json({ error: 'requester_id is required', code: 'MISSING_REQUESTER' } satisfies ApiError, { status: 400 });
  }
  if (!Number.isInteger(rewardSats) || (rewardSats as number) < 1) {
    return NextResponse.json(
      { error: 'reward_sats must be a positive integer', code: 'INVALID_REWARD' } satisfies ApiError,
      { status: 400 },
    );
  }

  const reward = rewardSats as number;

  if (FREE_MODE) {
    const feeSats = Math.ceil(reward * FEE_PERCENT / 100);
    const now = Date.now();
    const job = createJob({
      id: crypto.randomUUID(),
      title,
      category: category as JobCategory,
      input,
      reward_sats: reward,
      fee_sats: feeSats,
      status: 'open',
      requester_id: requesterId,
      worker_id: null,
      result: null,
      created_at: now,
      claimed_at: null,
      completed_at: null,
      expires_at: now + EXPIRY_MS,
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
    return NextResponse.json({ job, payment_hash: 'demo-free-mode' }, { status: 201 });
  }

  const targetUrl = new URL(`/api/jobs?reward_sats=${reward}`, req.url);
  const createBody: PostJobDemoBody = {
    title,
    category: category as JobCategory,
    input,
    reward_sats: reward,
    requester_id: requesterId,
  };

  const first = await fetch(targetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createBody),
  });

  if (first.status !== 402) {
    const firstBody = await first.json().catch(() => ({}));
    return NextResponse.json(
      {
        error: 'Expected L402 challenge from /api/jobs',
        code: 'UNEXPECTED_FIRST_RESPONSE',
        upstream_status: first.status,
        upstream_body: firstBody,
      },
      { status: 502 },
    );
  }

  const challenge = (await first.json()) as Partial<L402ChallengeBody>;
  if (
    typeof challenge.invoice !== 'string' ||
    typeof challenge.macaroon !== 'string' ||
    typeof challenge.payment_hash !== 'string'
  ) {
    return NextResponse.json(
      { error: 'Invalid L402 challenge payload', code: 'INVALID_CHALLENGE' } satisfies ApiError,
      { status: 502 },
    );
  }

  try {
    await payInvoiceAsAgent(challenge.invoice);
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to pay challenge invoice: ${(err as Error).message}`,
        code: 'PAYMENT_FAILED',
      } satisfies ApiError,
      { status: 502 },
    );
  }

  // Lightning settlement is async: payInvoiceAsAgent returns once MDK has
  // dispatched the payment, but the marketplace daemon needs a moment to
  // observe the inbound payment before /api/jobs's L402 verify will pass.
  // Retry the replay a few times to absorb the gap. Mirrors worker.js pattern.
  const maxReplays = 6;
  let replayBody: Record<string, unknown> = {};
  let lastStatus = 0;
  for (let i = 0; i < maxReplays; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const replay = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `L402 ${challenge.macaroon}:${challenge.payment_hash}`,
      },
      body: JSON.stringify(createBody),
    });
    replayBody = (await replay.json().catch(() => ({}))) as Record<string, unknown>;
    lastStatus = replay.status;
    if (replay.ok) {
      if (!isJob(replayBody)) {
        return NextResponse.json(
          {
            error: 'Replay succeeded but job payload shape is invalid',
            code: 'INVALID_REPLAY_PAYLOAD',
            upstream_body: replayBody,
          },
          { status: 502 },
        );
      }
      return NextResponse.json(
        { job: replayBody, payment_hash: challenge.payment_hash },
        { status: 201 },
      );
    }
    if (replay.status !== 402) break;
  }

  return NextResponse.json(
    {
      error: 'Authorized replay failed',
      code: 'REPLAY_FAILED',
      upstream_status: lastStatus,
      upstream_body: replayBody,
    },
    { status: 502 },
  );
}
