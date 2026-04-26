import { NextResponse } from 'next/server';
import { withL402 } from '@/lib/lightning';
import { createJob, listJobs, rotateAssignWorker } from '@/lib/store';
import { broadcast } from '@/lib/feed';
import type { ApiError, Job, JobCategory } from '@/lib/types';

const FEE_PERCENT = Number(process.env.MARKETPLACE_FEE_PERCENT ?? '10');
const EXPIRY_MS = Number(process.env.JOB_EXPIRY_MINUTES ?? '30') * 60_000;
const VALID_CATEGORIES = new Set<JobCategory>(['summarize', 'classify', 'translate', 'qa']);

export async function GET(): Promise<NextResponse<Job[] | ApiError>> {
  try {
    return NextResponse.json(listJobs());
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to list jobs', code: 'LIST_FAILED' },
      { status: 500 },
    );
  }
}

// Handler runs only after MDK has verified the L402 payment.
const createJobHandler = async (req: Request): Promise<Response> => {
  try {
    const url = new URL(req.url);
    const rewardSats = Number(url.searchParams.get('reward_sats'));

    if (!Number.isInteger(rewardSats) || rewardSats < 1) {
      return NextResponse.json(
        { error: 'reward_sats must be a positive integer', code: 'INVALID_REWARD' },
        { status: 400 },
      );
    }

    let rawBody: Record<string, unknown>;
    try {
      rawBody = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body', code: 'INVALID_BODY' },
        { status: 400 },
      );
    }

    const { title, category, input, requester_id } = rawBody;

    if (!title || typeof title !== 'string') {
      return NextResponse.json(
        { error: 'title is required', code: 'MISSING_TITLE' },
        { status: 400 },
      );
    }
    if (!category || typeof category !== 'string' || !VALID_CATEGORIES.has(category as JobCategory)) {
      return NextResponse.json(
        { error: `category must be one of: ${[...VALID_CATEGORIES].join(', ')}`, code: 'INVALID_CATEGORY' },
        { status: 400 },
      );
    }
    if (!input || typeof input !== 'string') {
      return NextResponse.json(
        { error: 'input is required', code: 'MISSING_INPUT' },
        { status: 400 },
      );
    }
    if (!requester_id || typeof requester_id !== 'string') {
      return NextResponse.json(
        { error: 'requester_id is required', code: 'MISSING_REQUESTER' },
        { status: 400 },
      );
    }

    const feeSats = Math.ceil(rewardSats * FEE_PERCENT / 100);
    const now = Date.now();

    const job = createJob({
      id: crypto.randomUUID(),
      title,
      category: category as JobCategory,
      input,
      reward_sats: rewardSats,
      fee_sats: feeSats,
      status: 'open',
      requester_id,
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
      timestamp: Date.now(),
    });

    return NextResponse.json(job, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to create job', code: 'CREATE_FAILED' },
      { status: 500 },
    );
  }
};

// Price = reward_sats + fee_sats, derived from URL query param.
// Reading req.url is safe to call twice (invoice creation + token verification).
const _postHandler = withL402(createJobHandler, {
  sats: (req: Request) => {
    const reward = Number(new URL(req.url).searchParams.get('reward_sats') ?? '0');
    return reward + Math.ceil(reward * FEE_PERCENT / 100);
  },
});

export async function POST(req: Request): Promise<Response> {
  return _postHandler(req);
}
