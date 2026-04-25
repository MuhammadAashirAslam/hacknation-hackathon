// @ts-check

/**
 * Autonomous requester agent.
 *
 * Loop:
 *   1. Pick a random job template (title/category/input/reward).
 *   2. POST /api/jobs without auth → expect 402 + invoice.
 *   3. Pay invoice via Alby, capture preimage.
 *   4. Retry POST /api/jobs with `Authorization: L402 <macaroon>:<preimage>`.
 *   5. Poll GET /api/jobs/:id until status === 'completed', log result.
 *   6. Sleep `intervalMs`, repeat.
 *
 * Env: ALBY_ACCESS_TOKEN, MARKETPLACE_URL.
 */

/**
 * @typedef {Object} RequesterConfig
 * @property {string} marketplaceUrl
 * @property {string} requesterId
 * @property {number} intervalMs
 */

/** @param {RequesterConfig} config */
async function runRequester(config) {
  throw new Error('Not implemented');
}

async function main() {
  throw new Error('Not implemented');
}

main();
