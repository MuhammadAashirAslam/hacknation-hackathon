import { NextResponse } from 'next/server';
import { listRegisteredWorkers, registerWorker } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RegisterBody {
  worker_id: string;
}

export async function POST(req: Request): Promise<Response> {
  let body: Partial<RegisterBody>;
  try {
    body = (await req.json()) as Partial<RegisterBody>;
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
  const { queue, added } = registerWorker(body.worker_id);
  return NextResponse.json({ added, queue }, { status: added ? 201 : 200 });
}

export async function GET(): Promise<Response> {
  return NextResponse.json({ queue: listRegisteredWorkers() });
}
