// SSE stream of Transaction events. Must run on the Node runtime — edge has
// short timeouts and breaks long-lived streams.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request): Promise<Response> {
  throw new Error('Not implemented');
}
