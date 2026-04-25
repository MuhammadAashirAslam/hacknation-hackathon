// MDK cloud webhook endpoint — not used in custom L402 mode.
// Kept as a no-op so the route exists if MDK's next-plugin tries to call it.
export async function POST(): Promise<Response> {
  return new Response(JSON.stringify({ error: 'not used', code: 'disabled' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}
