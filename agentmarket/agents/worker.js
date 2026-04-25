// @ts-check

/**
 * Autonomous worker agent.
 *
 * Loop:
 *   1. GET /api/jobs?status=open, filter by `categories`.
 *   2. For each candidate, POST /api/jobs/:id/claim without auth → 402 + invoice.
 *   3. Pay 2-sat invoice via Alby, retry with L402 header.
 *   4. On 200, prepare task input:
 *        - if category === 'summarize' AND input is a URL, fetch page content
 *          via Tavily search API first, pass extracted content to Claude.
 *        - otherwise pass raw input.
 *   5. Run task via Anthropic Claude (model: claude-sonnet-4-6).
 *   6. Generate fresh BOLT11 payout invoice via Alby for `reward_sats`.
 *   7. POST /api/jobs/:id/deliver with { worker_id, result, payout_invoice }.
 *   8. Sleep `pollMs`, repeat.
 *
 * Env: ALBY_ACCESS_TOKEN, ANTHROPIC_API_KEY, TAVILY_API_KEY, MARKETPLACE_URL.
 */

/**
 * @typedef {Object} WorkerConfig
 * @property {string} marketplaceUrl
 * @property {string} workerId
 * @property {Array<'summarize'|'classify'|'translate'|'qa'>} categories
 * @property {number} pollMs
 */

/** @param {WorkerConfig} config */
async function runWorker(config) {
  throw new Error('Not implemented');
}

async function main() {
  throw new Error('Not implemented');
}

main();
