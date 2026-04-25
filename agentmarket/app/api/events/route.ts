import { subscribe, getRecentTransactions } from '@/lib/feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send recent backlog so new connections catch up immediately.
      for (const tx of getRecentTransactions(20)) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(tx)}\n\n`));
      }

      // Subscribe to live events.
      const unsubscribe = subscribe((tx) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(tx)}\n\n`));
        } catch {
          // Stream already closed; abort handler will clean up.
        }
      });

      // Keepalive — prevents proxies and browsers from dropping idle connections.
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          clearInterval(ping);
        }
      }, 15_000);

      req.signal.addEventListener('abort', () => {
        unsubscribe();
        clearInterval(ping);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
