// @ts-check
/**
 * Phase 1 smoke test — cross-wallet Lightning payment via MDK Agent Wallet daemons.
 *
 * Requires TWO running daemon instances:
 *   MARKETPLACE wallet (wallet-1): MDK_WALLET_URL      (default http://localhost:3456)
 *   AGENT wallet     (wallet-2): AGENT_WALLET_URL    (default http://localhost:3457)
 *
 * What it tests:
 *   1. Both daemons are reachable and return valid balance JSON.
 *   2. Agent-wallet generates a BOLT11 with the correct amount encoded.
 *   3. Marketplace-wallet pays the agent-wallet invoice (real sats move).
 *   4. Both balances update correctly (marketplace -N, agent +N).
 *
 * Exit codes:
 *   0 = sats moved, all checks passed
 *   1 = fatal error (daemon unreachable, shape mismatch, payment failed)
 *
 * Setup:
 *   1. Marketplace daemon (wallet-1) already running on port 3456 with funds.
 *   2. Run scripts/setup-wallet2.ps1 to init wallet-2 on port 3457 and fund it
 *      with enough sats to route (the marketplace pays, not the agent — but the
 *      agent wallet still needs a small balance to pay Lightning routing fees
 *      on its own future sends).
 *   3. node agentmarket/scripts/test-payment.js
 */

const MARKETPLACE_URL = process.env.MDK_WALLET_URL    || 'http://localhost:3456';
const AGENT_URL        = process.env.AGENT_WALLET_URL || 'http://localhost:3457';
const TEST_AMOUNT_SATS = 5;

/**
 * @template T
 * @param {string} baseUrl
 * @param {string} path
 * @param {RequestInit=} init
 * @returns {Promise<T>}
 */
async function call(baseUrl, path, init) {
  let res;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...(init || {}),
      headers: { 'Content-Type': 'application/json', ...((init && init.headers) || {}) },
    });
  } catch (err) {
    throw new Error(`daemon unreachable at ${baseUrl}${path}: ${/** @type {Error} */(err).message}`);
  }
  /** @type {{ success: boolean, data?: T, error?: { code: string, message: string } }} */
  const body = await res.json();
  if (!body.success || body.data === undefined) {
    const code = (body.error && body.error.code) || `HTTP_${res.status}`;
    const msg  = (body.error && body.error.message) || 'unknown';
    const e = new Error(`${path} failed [${code}]: ${msg}`);
    /** @type {any} */(e).code = code;
    throw e;
  }
  return /** @type {T} */(body.data);
}

/** @param {string} url @returns {Promise<number>} */
async function getBalance(url) {
  /** @type {{ balanceSats: number }} */
  const data = await call(url, '/balance');
  if (typeof data.balanceSats !== 'number') {
    throw new Error(`/balance shape changed at ${url}: ${JSON.stringify(data)}`);
  }
  return data.balanceSats;
}

/**
 * Generate invoice on `url` daemon.
 * @param {string} url
 * @param {number} sats
 * @returns {Promise<{invoice: string, paymentHash: string, expiresAt: string}>}
 */
async function generateInvoice(url, sats) {
  /** @type {{ invoice: string, paymentHash: string, expiresAt: string }} */
  const data = await call(url, '/receive', {
    method: 'POST',
    body: JSON.stringify({ amount_sats: sats, description: 'agentmarket smoke test' }),
  });
  if (!data.invoice || !data.paymentHash) {
    throw new Error(`/receive shape changed at ${url}: ${JSON.stringify(data)}`);
  }
  return data;
}

/**
 * Pay a BOLT11 invoice from `url` daemon.
 * @param {string} url
 * @param {string} bolt11
 * @returns {Promise<unknown>}
 */
async function payInvoice(url, bolt11) {
  return call(url, '/send', {
    method: 'POST',
    body: JSON.stringify({ destination: bolt11 }),
  });
}

/**
 * Decode the amount from a BOLT11 invoice prefix.
 * Returns null for amount-less invoices (which would be a bug for our test).
 * @param {string} invoice
 * @returns {number | null}
 */
function decodeInvoiceSats(invoice) {
  const m = invoice.match(/^ln(?:bc|tb|tbs)(\d+)?([munp]?)1/);
  if (!m || !m[1]) return null;
  const num = Number(m[1]);
  switch (m[2]) {
    case 'm': return num * 100000;
    case 'u': return num * 100;
    case 'n': return num / 10;
    case 'p': return num / 10000;
    default:  return num * 100000000;
  }
}

/** @param {string} label @param {unknown} data */
function log(label, data) {
  const val = (typeof data === 'string' || typeof data === 'number') ? data : JSON.stringify(data);
  console.log(`[${label}] ${val}`);
}

async function main() {
  console.log(`Marketplace wallet : ${MARKETPLACE_URL}`);
  console.log(`Agent wallet       : ${AGENT_URL}`);
  console.log('');

  // ── Step 1: Both daemons alive ───────────────────────────────────────────
  log('STEP 1', 'GET /balance on both wallets');
  const mktBefore   = await getBalance(MARKETPLACE_URL);
  const agentBefore = await getBalance(AGENT_URL);
  log('marketplace_balance_before', `${mktBefore} sats`);
  log('agent_balance_before',       `${agentBefore} sats`);

  if (mktBefore < TEST_AMOUNT_SATS) {
    throw new Error(
      `Marketplace wallet has only ${mktBefore} sats — needs at least ${TEST_AMOUNT_SATS}. ` +
      `Fund wallet-1 first.`,
    );
  }

  // ── Step 2: Agent generates a receive invoice ────────────────────────────
  log('STEP 2', `Agent POST /receive amount_sats=${TEST_AMOUNT_SATS}`);
  const inv = await generateInvoice(AGENT_URL, TEST_AMOUNT_SATS);
  log('invoice',      `${inv.invoice.slice(0, 50)}...`);
  log('payment_hash', inv.paymentHash);
  log('expires_at',   inv.expiresAt);

  const encoded = decodeInvoiceSats(inv.invoice);
  if (encoded !== TEST_AMOUNT_SATS) {
    throw new Error(
      `BOLT11 amount mismatch: requested ${TEST_AMOUNT_SATS} sats, ` +
      `encoded ${encoded} sats. ` +
      `Possible cause: field name was not 'amount_sats' in /receive body.`,
    );
  }
  log('bolt11_check', `encodes ${encoded} sats (matches request)`);

  // ── Step 3: Marketplace pays the agent's invoice ─────────────────────────
  log('STEP 3', 'Marketplace POST /send → pays agent invoice');
  let payResult;
  try {
    payResult = await payInvoice(MARKETPLACE_URL, inv.invoice);
    log('pay_result', payResult);
  } catch (err) {
    const e = /** @type {Error} */(err);
    console.error(`[pay_failed] ${e.message}`);
    console.error('[ACTION] Confirm wallet-2 is running on port 3457 and funded.');
    console.error('[ACTION] Run: scripts/setup-wallet2.ps1');
    process.exit(1);
  }

  // ── Step 4: Confirm balance changes ──────────────────────────────────────
  // MDK daemon polls for incoming payments every 30 s; on mainnet, settlement
  // typically arrives in 5-15 s. 15 s is enough with comfortable headroom.
  await new Promise(r => setTimeout(r, 15000));

  log('STEP 4', 'GET /balance on both wallets (after)');
  const mktAfter   = await getBalance(MARKETPLACE_URL);
  const agentAfter = await getBalance(AGENT_URL);
  log('marketplace_balance_after', `${mktAfter} sats`);
  log('agent_balance_after',       `${agentAfter} sats`);

  const mktDelta   = mktAfter   - mktBefore;
  const agentDelta = agentAfter - agentBefore;
  log('marketplace_delta', `${mktDelta} sats`);
  log('agent_delta',       `${agentDelta} sats`);

  // Marketplace should be down by at least the test amount (could be more due to routing fee).
  if (mktDelta > -TEST_AMOUNT_SATS) {
    throw new Error(
      `Marketplace balance did not decrease by expected amount. ` +
      `Delta: ${mktDelta} (expected ≤ -${TEST_AMOUNT_SATS}). ` +
      `Payment may not have settled yet — try increasing the wait above.`,
    );
  }
  // Agent should be up by TEST_AMOUNT_SATS. Allow ≤2 sats of inbound-routing
  // fee from the MDK LSP (observed: 1 sat on mainnet). Sender pays routing;
  // receiver can still lose a small inbound-channel-opening fee.
  const INBOUND_FEE_TOLERANCE = 2;
  if (agentDelta < TEST_AMOUNT_SATS - INBOUND_FEE_TOLERANCE) {
    throw new Error(
      `Agent balance did not increase enough. Expected ≥${TEST_AMOUNT_SATS - INBOUND_FEE_TOLERANCE}, ` +
      `got delta ${agentDelta}. Payment may still be in-flight or an unexpected fee was charged.`,
    );
  }

  console.log('');
  console.log('[verdict] PASS — sats moved. Marketplace -' + Math.abs(mktDelta) + ', Agent +' + agentDelta);
  console.log('[Phase 1] SUCCESS. Proceed to Phase 2.');
  process.exit(0);
}

main().catch((err) => {
  console.error(`[fatal] ${/** @type {Error} */(err).message}`);
  process.exit(1);
});
