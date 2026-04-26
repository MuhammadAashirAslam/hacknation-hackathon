// @ts-check
/**
 * Autonomous worker agent (Phase 6).
 *
 * Loop:
 *   1. GET /api/jobs, filter status==='open' AND category in WORKER_CATEGORIES.
 *   2. For each candidate (oldest first):
 *        a. POST /api/jobs/:id/claim without auth → expect 402 + invoice + macaroon.
 *        b. Pay invoice from agent wallet (port 3457).
 *        c. Replay POST /api/jobs/:id/claim with `Authorization: L402 <macaroon>:<payment_hash>`.
 *        d. On 200, run the task:
 *             - if category==='summarize' AND input is a URL with TAVILY_API_KEY set,
 *               fetch page via Tavily /extract and prepend to the prompt.
 *             - call Modal GLM-5 chat/completions for the result.
 *        e. POST :3457/receive to mint a payout BOLT11 for `reward_sats`.
 *        f. POST /api/jobs/:id/deliver with { worker_id, result, payout_invoice }.
 *   3. Sleep POLL_MS, repeat.
 *
 * Required env: MARKETPLACE_URL, MDK_AGENT_WALLET_URL, MODAL_API_KEY,
 *               MODAL_BASE_URL, MODAL_MODEL.
 * Optional env: TAVILY_API_KEY, MODAL_MAX_TOKENS, WORKER_ID, WORKER_CATEGORIES,
 *               POLL_MS.
 */

const MARKETPLACE_URL = (process.env.MARKETPLACE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const AGENT_WALLET_URL = (process.env.MDK_AGENT_WALLET_URL || process.env.AGENT_WALLET_URL || 'http://localhost:3457').replace(/\/+$/, '');

const MODAL_API_KEY = process.env.MODAL_API_KEY || '';
const MODAL_BASE_URL = (process.env.MODAL_BASE_URL || 'https://api.us-west-2.modal.direct/v1').replace(/\/+$/, '');
const MODAL_MODEL = process.env.MODAL_MODEL || 'zai-org/GLM-5.1-FP8';
// GLM-5.1-FP8 is a reasoning model: it spends `completion_tokens` on
// `reasoning_content` (chain-of-thought) BEFORE producing `content`. Budget
// must cover both. 8192 leaves ~6k for the answer after typical reasoning.
const MODAL_MAX_TOKENS = Number(process.env.MODAL_MAX_TOKENS || '8192');

const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';

const WORKER_ID = process.env.WORKER_ID || 'worker-glm5-1';
const WORKER_CATEGORIES = (process.env.WORKER_CATEGORIES || 'summarize,classify,translate,qa')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const POLL_MS = Number(process.env.POLL_MS || '3000');
const DEMO_FREE_JOBS = process.env.DEMO_FREE_JOBS === 'true';

/** @typedef {'summarize'|'classify'|'translate'|'qa'} JobCategory */

/**
 * @typedef {Object} Job
 * @property {string} id
 * @property {string} title
 * @property {JobCategory} category
 * @property {string} input
 * @property {number} reward_sats
 * @property {number} fee_sats
 * @property {'open'|'claimed'|'completed'|'expired'} status
 * @property {string} requester_id
 * @property {string|null} worker_id
 * @property {string|null} result
 */

/** @param {string} label @param {unknown} data */
function log(label, data) {
  const ts = new Date().toISOString().slice(11, 19);
  const val = typeof data === 'string' || typeof data === 'number' ? data : JSON.stringify(data);
  console.log(`[${ts}] [worker:${WORKER_ID}] [${label}] ${val}`);
}

/** @param {number} ms */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isUrl = (s) => /^https?:\/\//i.test(s.trim());

/* ────────────────────────── MDK daemon (agent wallet) ───────────────────── */

/**
 * @template T
 * @param {string} path
 * @param {RequestInit=} init
 * @returns {Promise<T>}
 */
async function callAgentDaemon(path, init) {
  const res = await fetch(`${AGENT_WALLET_URL}${path}`, {
    ...(init || {}),
    headers: { 'Content-Type': 'application/json', ...((init && init.headers) || {}) },
  });
  /** @type {{ success: boolean, data?: T, error?: { code: string, message: string } }} */
  const body = await res.json();
  if (!body.success || body.data === undefined) {
    const code = (body.error && body.error.code) || `HTTP_${res.status}`;
    const msg = (body.error && body.error.message) || 'unknown';
    throw new Error(`agent-wallet ${path} failed [${code}]: ${msg}`);
  }
  return /** @type {T} */ (body.data);
}

/** @param {string} bolt11 */
async function payInvoiceFromAgent(bolt11) {
  return callAgentDaemon('/send', {
    method: 'POST',
    body: JSON.stringify({ destination: bolt11 }),
  });
}

/** @param {number} sats @param {string} memo */
async function generatePayoutInvoice(sats, memo) {
  /** @type {{ invoice: string, paymentHash: string }} */
  const data = await callAgentDaemon('/receive', {
    method: 'POST',
    body: JSON.stringify({ amount_sats: sats, description: memo }),
  });
  if (!data.invoice || !data.invoice.startsWith('lnbc')) {
    throw new Error(`agent-wallet /receive returned invalid invoice: ${data.invoice}`);
  }
  return data;
}

/* ─────────────────────────────── Tavily ─────────────────────────────────── */

/**
 * Extract page content via Tavily. Returns trimmed plain text, or null on failure.
 * @param {string} url
 * @returns {Promise<string|null>}
 */
async function tavilyExtract(url) {
  if (!TAVILY_API_KEY) return null;
  try {
    const res = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: TAVILY_API_KEY, urls: [url] }),
    });
    if (!res.ok) {
      log('tavily_http_error', `${res.status} ${await res.text().catch(() => '')}`);
      return null;
    }
    const body = await res.json();
    const first = body && body.results && body.results[0];
    const raw = first && (first.raw_content || first.content);
    if (typeof raw !== 'string' || raw.length === 0) return null;
    // Cap to keep prompt size sane.
    return raw.slice(0, 12_000);
  } catch (err) {
    log('tavily_error', /** @type {Error} */ (err).message);
    return null;
  }
}

/* ────────────────────────────── Modal LLM ───────────────────────────────── */

/**
 * @param {JobCategory} category
 * @param {string} input
 * @param {string|null} extracted
 */
function buildPrompt(category, input, extracted) {
  const source = extracted ? `\n\n--- BEGIN PAGE CONTENT ---\n${extracted}\n--- END PAGE CONTENT ---\n` : '';
  switch (category) {
    case 'summarize':
      return [
        'You are a concise technical summarizer. Produce a single tight summary in 4–8 bullet points.',
        'Focus on factual content. No preamble, no closing remarks. Output only the bullets.',
        `Input: ${input}${source}`,
      ].join('\n\n');
    case 'classify':
      return [
        'You are a classifier. Read the input and return ONLY a single short label that best categorizes it.',
        'No explanation, no quotes — just the label.',
        `Input:\n${input}`,
      ].join('\n\n');
    case 'translate':
      return [
        'You are a translator. If the input specifies a target language, translate to it.',
        'Otherwise, detect the source language and translate to fluent English.',
        'Return ONLY the translation, no commentary.',
        `Input:\n${input}`,
      ].join('\n\n');
    case 'qa':
      return [
        'You are an expert assistant. Answer the question precisely and concisely.',
        `Question:\n${input}`,
      ].join('\n\n');
  }
}

/**
 * @param {string} prompt
 * @returns {Promise<string>}
 */
async function callModal(prompt) {
  if (!MODAL_API_KEY) {
    throw new Error('MODAL_API_KEY is not set — cannot run inference');
  }
  const res = await fetch(`${MODAL_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MODAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODAL_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: MODAL_MAX_TOKENS,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Modal HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  const body = await res.json();
  const choice = body && body.choices && body.choices[0];
  const message = choice && choice.message;
  const content = message && message.content;
  const reasoning = message && message.reasoning_content;
  const finish = choice && choice.finish_reason;

  if (typeof content === 'string' && content.trim().length > 0) {
    return content.trim();
  }
  // GLM-5.1 burned the whole completion budget on reasoning. Surface the
  // reasoning as the answer rather than failing — the demo keeps flowing,
  // and the user sees the model's thinking. Increase MODAL_MAX_TOKENS to fix.
  if (typeof reasoning === 'string' && reasoning.trim().length > 0) {
    log('llm_truncated', `finish=${finish} — falling back to reasoning_content (raise MODAL_MAX_TOKENS)`);
    return `[truncated — increase MODAL_MAX_TOKENS]\n\n${reasoning.trim()}`;
  }
  throw new Error(`Modal returned no content (finish=${finish}): ${JSON.stringify(body).slice(0, 400)}`);
}

/* ─────────────────────────── Marketplace HTTP ───────────────────────────── */

/** @returns {Promise<Job[]>} */
async function listJobs() {
  const res = await fetch(`${MARKETPLACE_URL}/api/jobs`);
  if (!res.ok) throw new Error(`GET /api/jobs failed: ${res.status}`);
  return res.json();
}

/**
 * Full L402 dance against /api/jobs/:id/claim. Returns the claimed Job.
 * @param {string} jobId
 * @returns {Promise<Job>}
 */
async function claimJobWithL402(jobId) {
  const url = `${MARKETPLACE_URL}/api/jobs/${jobId}/claim`;
  const body = JSON.stringify({ worker_id: WORKER_ID });
  if (DEMO_FREE_JOBS) {
    const freeClaim = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!freeClaim.ok) {
      const detail = await freeClaim.text().catch(() => '');
      throw new Error(`demo claim failed ${freeClaim.status}: ${detail.slice(0, 300)}`);
    }
    return freeClaim.json();
  }

  const first = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (first.status === 409 || first.status === 410) {
    // Already claimed / completed / expired — race with another worker.
    const detail = await first.json().catch(() => ({}));
    throw new Error(`claim_race [${first.status}]: ${JSON.stringify(detail)}`);
  }

  if (first.status !== 402) {
    const detail = await first.text().catch(() => '');
    throw new Error(`expected 402 from claim, got ${first.status}: ${detail.slice(0, 300)}`);
  }

  /** @type {{ invoice: string, macaroon: string, payment_hash: string }} */
  const challenge = await first.json();
  if (!challenge.invoice || !challenge.macaroon || !challenge.payment_hash) {
    throw new Error(`malformed L402 challenge: ${JSON.stringify(challenge)}`);
  }

  log('claim_pay', `paying ${challenge.payment_hash.slice(0, 12)}…`);
  await payInvoiceFromAgent(challenge.invoice);

  // The marketplace daemon polls /payments to confirm settlement; allow a few retries.
  const maxReplays = 6;
  for (let i = 0; i < maxReplays; i++) {
    await sleep(2500);
    const replay = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `L402 ${challenge.macaroon}:${challenge.payment_hash}`,
      },
      body,
    });
    if (replay.ok) return replay.json();
    if (replay.status !== 402) {
      const detail = await replay.text().catch(() => '');
      throw new Error(`claim replay failed ${replay.status}: ${detail.slice(0, 300)}`);
    }
    log('claim_replay_pending', `attempt ${i + 1}/${maxReplays} — payment not yet visible`);
  }
  throw new Error('claim payment never confirmed by marketplace daemon');
}

/**
 * @param {string} jobId
 * @param {string} result
 * @param {string} payoutInvoice
 */
async function deliverJob(jobId, result, payoutInvoice) {
  const res = await fetch(`${MARKETPLACE_URL}/api/jobs/${jobId}/deliver`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ worker_id: WORKER_ID, result, payout_invoice: payoutInvoice }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`deliver failed ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.json();
}

/* ──────────────────────────── Job processing ────────────────────────────── */

/** Tracks IDs we've already attempted (or are processing) this run. */
const seen = new Set();

/** @param {Job} job */
async function processJob(job) {
  log('processing', `${job.id.slice(0, 8)}… category=${job.category} reward=${job.reward_sats}`);

  await claimJobWithL402(job.id);
  log('claimed', job.id.slice(0, 8));

  let extracted = null;
  if (job.category === 'summarize' && isUrl(job.input)) {
    log('tavily_extract', job.input);
    extracted = await tavilyExtract(job.input);
    log('tavily_extracted', extracted ? `${extracted.length} chars` : 'null (raw input only)');
  }

  const prompt = buildPrompt(job.category, job.input, extracted);
  log('llm_call', `model=${MODAL_MODEL} prompt_chars=${prompt.length}`);
  const result = await callModal(prompt);
  log('llm_result', `${result.length} chars`);

  let payoutInvoice = 'lnbc1demofreemode';
  if (!DEMO_FREE_JOBS) {
    const inv = await generatePayoutInvoice(
      job.reward_sats,
      `AgentMarket payout for job ${job.id.slice(0, 8)}`,
    );
    payoutInvoice = inv.invoice;
    log('payout_invoice', `${inv.invoice.slice(0, 30)}…`);
  }

  await deliverJob(job.id, result, payoutInvoice);
  log('delivered', `${job.id.slice(0, 8)} +${job.reward_sats} sats`);
}

async function tick() {
  let jobs;
  try {
    jobs = await listJobs();
  } catch (err) {
    log('list_error', /** @type {Error} */ (err).message);
    return;
  }

  const candidates = jobs.filter(
    (j) => j.status === 'open' && WORKER_CATEGORIES.includes(j.category) && !seen.has(j.id),
  );
  if (candidates.length === 0) return;

  // Oldest first — fairer competition with other workers.
  candidates.sort((a, b) => /** @type {any} */ (a).created_at - /** @type {any} */ (b).created_at);

  const job = candidates[0];
  seen.add(job.id);

  try {
    await processJob(job);
  } catch (err) {
    log('process_error', `${job.id.slice(0, 8)}: ${/** @type {Error} */ (err).message}`);
    // Don't un-seen on error — avoid hot-looping a doomed job.
  }
}

async function main() {
  log('startup', `marketplace=${MARKETPLACE_URL} agent_wallet=${AGENT_WALLET_URL} demo_free_jobs=${DEMO_FREE_JOBS} categories=[${WORKER_CATEGORIES.join(',')}]`);
  if (!MODAL_API_KEY) {
    console.error('[fatal] MODAL_API_KEY is not set');
    process.exit(1);
  }

  let running = true;
  process.on('SIGINT', () => {
    log('shutdown', 'SIGINT received');
    running = false;
  });

  while (running) {
    await tick();
    await sleep(POLL_MS);
  }

  log('exit', 'clean');
}

main().catch((err) => {
  console.error(`[worker:${WORKER_ID}] [fatal] ${/** @type {Error} */ (err).message}`);
  process.exit(1);
});
