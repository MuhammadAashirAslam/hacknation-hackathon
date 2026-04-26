import { NextResponse } from 'next/server';
import { addAssessment, getJob, listAssessments } from '@/lib/store';
import type { Assessment } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AssessBody {
  worker_id: string;
  note: string;
}

const MAX_NOTE_CHARS = 400;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;

  let body: Partial<AssessBody>;
  try {
    body = (await req.json()) as Partial<AssessBody>;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' },
      { status: 400 },
    );
  }

  if (!body.worker_id || typeof body.worker_id !== 'string') {
    return NextResponse.json(
      { error: 'worker_id is required', code: 'MISSING_WORKER_ID' },
      { status: 400 },
    );
  }
  if (!body.note || typeof body.note !== 'string') {
    return NextResponse.json(
      { error: 'note is required', code: 'MISSING_NOTE' },
      { status: 400 },
    );
  }

  const job = getJob(id);
  if (!job) {
    return NextResponse.json({ error: 'Job not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  const assessment: Assessment = {
    id: crypto.randomUUID(),
    job_id: id,
    worker_id: body.worker_id,
    note: body.note.slice(0, MAX_NOTE_CHARS),
    assigned: job.assigned_worker_id === body.worker_id,
    created_at: Date.now(),
  };
  addAssessment(assessment);
  return NextResponse.json(assessment, { status: 201 });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) {
    return NextResponse.json({ error: 'Job not found', code: 'NOT_FOUND' }, { status: 404 });
  }
  return NextResponse.json({
    job_id: id,
    assigned_worker_id: job.assigned_worker_id,
    assessments: listAssessments(id),
  });
}
