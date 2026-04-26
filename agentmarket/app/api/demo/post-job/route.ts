import { NextResponse } from 'next/server';
import { payInvoiceAsAgent } from '@/lib/lightning';
import { createJob, rotateAssignWorker, updateJob } from '@/lib/store';
import { broadcast } from '@/lib/feed';
import { decomposeJob, type SubTask } from '@/lib/llm';
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

// Marketplace charges the user the full reward+fee for the parent. That money
// funds N children at this much each (rest stays in marketplace).
function childRewardFor(parentReward: number): number {
  return Math.max(1, Math.floor(parentReward / 3));
}

function createChildren(parent: Job, subtasks: SubTask[]): Job[] {
  const childReward = childRewardFor(parent.reward_sats);
  const created: Job[] = [];
  for (let i = 0; i < subtasks.length; i++) {
    const st = subtasks[i];
    const child = createJob({
      id: crypto.randomUUID(),
      title: st.title,
      category: parent.category,
      input: st.input,
      reward_sats: childReward,
      fee_sats: 0,
      status: 'open',
      requester_id: parent.requester_id,
      // Round-robin: each child gets the next worker in queue. With 3 scouts
      // + 3 children, every job sees work spread across the entire fleet.
      assigned_worker_id: rotateAssignWorker(),
      worker_id: null,
      result: null,
      created_at: Date.now() + i,
      claimed_at: null,
      completed_at: null,
      expires_at: parent.expires_at,
      parent_job_id: parent.id,
      is_decomposed: false,
    });
    created.push(child);
    broadcast({
      id: crypto.randomUUID(),
      type: 'job_posted',
      sats: 0,
      direction: 'in',
      job_id: child.id,
      agent_id: parent.requester_id,
      timestamp: child.created_at,
    });
  }
  return created;
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
  const cat = category as JobCategory;

  // ── Decomposition (best effort) ────────────────────────────────────────────
  // Run decomposer BEFORE any Lightning payment so a decomposer failure costs
  // nothing. On success → 3 children get created. On failure → fall back to a
  // standard single-leaf job and the demo still works.
  let subtasks: SubTask[] | null = null;
  try {
    subtasks = await decomposeJob({ title, category: cat, input });
    console.log(`[post-job] decomposed into ${subtasks.length} sub-tasks`);
  } catch (err) {
    console.warn(
      `[post-job] decomposition failed, falling back to single-job: ${(err as Error).message}`,
    );
    subtasks = null;
  }

  // ── FREE_MODE: skip Lightning entirely ─────────────────────────────────────
  if (FREE_MODE) {
    const feeSats = Math.ceil(reward * FEE_PERCENT / 100);
    const now = Date.now();
    const isDecomposed = subtasks !== null;
    const parent = createJob({
      id: crypto.randomUUID(),
      title,
      category: cat,
      input,
      reward_sats: reward,
      fee_sats: feeSats,
      status: 'open',
      requester_id: requesterId,
      // Decomposed parents are orchestration nodes — workers must skip them.
      // Plain (non-decomposed) jobs go through normal round-robin.
      assigned_worker_id: isDecomposed ? null : rotateAssignWorker(),
      worker_id: null,
      result: null,
      created_at: now,
      claimed_at: null,
      completed_at: null,
      expires_at: now + EXPIRY_MS,
      parent_job_id: null,
      is_decomposed: isDecomposed,
    });
    broadcast({
      id: crypto.randomUUID(),
      type: 'job_posted',
      sats: parent.reward_sats + parent.fee_sats,
      direction: 'in',
      job_id: parent.id,
      agent_id: parent.requester_id,
      timestamp: now,
    });
    const children = subtasks ? createChildren(parent, subtasks) : [];
    return NextResponse.json(
      { job: parent, children, payment_hash: 'demo-free-mode' },
      { status: 201 },
    );
  }

  // ── Real Lightning flow ────────────────────────────────────────────────────
  const targetUrl = new URL(`/api/jobs?reward_sats=${reward}`, req.url);
  const createBody: PostJobDemoBody = {
    title,
    category: cat,
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
  // Retry the replay several times to absorb the gap. 12 × 2.5s = 30s window.
  const maxReplays = 12;
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
      const parent = replayBody;
      // Promote to orchestration role if decomposition succeeded. Workers will
      // see is_decomposed=true and skip the parent in their assess+claim loops.
      if (subtasks) {
        const promoted = updateJob(parent.id, {
          is_decomposed: true,
          assigned_worker_id: null,
        });
        const finalParent = promoted ?? parent;
        const children = createChildren(finalParent, subtasks);
        return NextResponse.json(
          { job: finalParent, children, payment_hash: challenge.payment_hash },
          { status: 201 },
        );
      }
      return NextResponse.json(
        { job: parent, children: [], payment_hash: challenge.payment_hash },
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
