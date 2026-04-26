// @ts-check
/**
 * Autonomous requester agent (Phase 6).
 *
 * Loop:
 *   1. Pick a job template (round-robin through TEMPLATES).
 *   2. POST /api/demo/post-job — server handles L402 dance, or skips it
 *      entirely when DEMO_FREE_JOBS=true. Either way we get back the created Job.
 *   3. Poll GET /api/jobs/:id every POLL_MS until status==='completed' or timeout.
 *   4. Log result. Sleep INTERVAL_MS, repeat.
 *
 * Required env: MARKETPLACE_URL.
 * Optional env: REQUESTER_ID, INTERVAL_MS, POLL_MS, JOB_TIMEOUT_MS, REWARD_SATS.
 */

const MARKETPLACE_URL = (process.env.MARKETPLACE_URL || 'http://localhost:3000').replace(/\/+$/, '');

const REQUESTER_ID = process.env.REQUESTER_ID || 'requester-demo-1';
const INTERVAL_MS = Number(process.env.INTERVAL_MS || '20000');
const POLL_MS = Number(process.env.POLL_MS || '3000');
const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS || '180000');
const REWARD_SATS = Number(process.env.REWARD_SATS || '10');

/** @typedef {'summarize'|'classify'|'translate'|'qa'} JobCategory */

/** @type {Array<{ title: string, category: JobCategory, input: string }>} */
const TEMPLATES = [
  {
    title: 'Summarize Bitcoin whitepaper page',
    category: 'summarize',
    input: 'https://en.wikipedia.org/wiki/Bitcoin',
  },
  {
    title: 'Summarize Lightning Network overview',
    category: 'summarize',
    input: 'https://en.wikipedia.org/wiki/Lightning_Network',
  },
  {
    title: 'Classify this user feedback',
    category: 'classify',
    input: 'The new dashboard is fast and the dark mode looks great, but logout sometimes throws a 500 error.',
  },
  {
    title: 'Translate to English',
    category: 'translate',
    input: 'El protocolo Lightning permite pagos instantáneos de bitcoin con tarifas mínimas. Target language: English.',
  },
  {
    title: 'Answer: what is L402?',
    category: 'qa',
    input: 'What is the L402 protocol and how does it relate to HTTP 402 and the Lightning Network? Give a 3-sentence answer.',
  },
];

/** @param {string} label @param {unknown} data */
function log(label, data) {
  const ts = new Date().toISOString().slice(11, 19);
  const val = typeof data === 'string' || typeof data === 'number' ? data : JSON.stringify(data);
  console.log(`[${ts}] [requester:${REQUESTER_ID}] [${label}] ${val}`);
}

/** @param {number} ms */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ────────────────────────── Marketplace HTTP ────────────────────────────── */

/**
 * @param {{ title: string, category: JobCategory, input: string }} tpl
 * @returns {Promise<{ id: string, reward_sats: number, fee_sats: number }>}
 */
async function postJob(tpl) {
  const res = await fetch(`${MARKETPLACE_URL}/api/demo/post-job`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: tpl.title,
      category: tpl.category,
      input: tpl.input,
      reward_sats: REWARD_SATS,
      requester_id: REQUESTER_ID,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`post-job failed ${res.status}: ${detail.slice(0, 300)}`);
  }
  const body = await res.json();
  if (!body || !body.job || typeof body.job.id !== 'string') {
    throw new Error(`post-job response missing job.id: ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body.job;
}

/**
 * @param {string} jobId
 * @returns {Promise<{ status: string, result: string|null, worker_id: string|null }>}
 */
async function getJob(jobId) {
  const res = await fetch(`${MARKETPLACE_URL}/api/jobs/${jobId}`);
  if (!res.ok) throw new Error(`GET /api/jobs/${jobId} failed: ${res.status}`);
  return res.json();
}

/**
 * Poll until completed/expired or timeout.
 * @param {string} jobId
 */
async function waitForCompletion(jobId) {
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  let lastStatus = '';
  while (Date.now() < deadline) {
    const job = await getJob(jobId);
    if (job.status !== lastStatus) {
      log('status', `${jobId.slice(0, 8)} → ${job.status}${job.worker_id ? ` (by ${job.worker_id})` : ''}`);
      lastStatus = job.status;
    }
    if (job.status === 'completed') return job;
    if (job.status === 'expired') throw new Error(`job ${jobId} expired before completion`);
    await sleep(POLL_MS);
  }
  throw new Error(`job ${jobId} did not complete within ${JOB_TIMEOUT_MS}ms`);
}

/* ──────────────────────────────── Loop ──────────────────────────────────── */

async function runOnce(/** @type {number} */ index) {
  const tpl = TEMPLATES[index % TEMPLATES.length];
  log('post', `${tpl.category} | ${tpl.title} | reward=${REWARD_SATS}`);

  const job = await postJob(tpl);
  log('posted', `id=${job.id.slice(0, 8)} fee=${job.fee_sats} total=${job.reward_sats + job.fee_sats}`);

  const completed = await waitForCompletion(job.id);
  const preview = (completed.result || '').slice(0, 400).replace(/\s+/g, ' ');
  log('completed', `id=${job.id.slice(0, 8)}`);
  console.log('---');
  console.log(completed.result || '(empty result)');
  console.log('---');
  if ((completed.result || '').length > 400) {
    log('truncated_preview', `(showed first 400 chars; full ${(completed.result || '').length} chars above)`);
  }
}

async function main() {
  log('startup', `marketplace=${MARKETPLACE_URL} interval=${INTERVAL_MS}ms reward=${REWARD_SATS}`);

  let running = true;
  process.on('SIGINT', () => {
    log('shutdown', 'SIGINT received');
    running = false;
  });

  let i = 0;
  while (running) {
    try {
      await runOnce(i);
    } catch (err) {
      log('cycle_error', /** @type {Error} */ (err).message);
    }
    i++;
    if (!running) break;
    await sleep(INTERVAL_MS);
  }

  log('exit', 'clean');
}

main().catch((err) => {
  console.error(`[requester:${REQUESTER_ID}] [fatal] ${/** @type {Error} */ (err).message}`);
  process.exit(1);
});
