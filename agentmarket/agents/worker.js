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

const MARKETPLACE_URL = (
    process.env.MARKETPLACE_URL || "http://localhost:3000"
).replace(/\/+$/, "");
const AGENT_WALLET_URL = (
    process.env.MDK_AGENT_WALLET_URL ||
    process.env.AGENT_WALLET_URL ||
    "http://localhost:3457"
).replace(/\/+$/, "");

// LLM_PROVIDER selects the brain: 'groq' (default) | 'gemini' | 'glm'.
// Each provider falls back to Groq on missing key so the fleet always boots.
const LLM_PROVIDER = (process.env.LLM_PROVIDER || "groq").toLowerCase();
const LLM_MODEL = process.env.LLM_MODEL || "";

// Groq config (existing path; MODAL_* names retained for backward compat).
const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.MODAL_API_KEY || "";
const GROQ_BASE_URL = (
    process.env.GROQ_BASE_URL ||
    process.env.MODAL_BASE_URL ||
    "https://api.groq.com/openai/v1"
).replace(/\/+$/, "");
const GROQ_DEFAULT_MODEL =
    process.env.MODAL_MODEL || "llama-3.3-70b-versatile";

// Gemini config. gemini-1.5-flash was retired from the v1beta endpoint in
// 2026; gemini-2.0-flash is the current free-tier default. Verify with
// `GET /v1beta/models?key=...` if this 404s on a new key.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_DEFAULT_MODEL =
    process.env.GEMINI_MODEL || "gemini-2.5-flash";

// GLM config (uses Modal endpoint per existing setup).
const GLM_API_KEY = process.env.GLM_API_KEY || "";
const GLM_BASE_URL = (
    process.env.GLM_BASE_URL || "https://api.us-west-2.modal.direct/v1"
).replace(/\/+$/, "");
const GLM_DEFAULT_MODEL = process.env.GLM_MODEL || "zai-org/GLM-5.1-FP8";

const MODAL_MAX_TOKENS = Number(process.env.MODAL_MAX_TOKENS || "4096");

const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";

const WORKER_ID = process.env.WORKER_ID || "worker-glm5-1";
const WORKER_CATEGORIES = (
    process.env.WORKER_CATEGORIES || "summarize,classify,translate,qa"
)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const POLL_MS = Number(process.env.POLL_MS || "3000");
const DEMO_FREE_JOBS = process.env.DEMO_FREE_JOBS === "true";

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
    const val =
        typeof data === "string" || typeof data === "number"
            ? data
            : JSON.stringify(data);
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
        headers: {
            "Content-Type": "application/json",
            ...((init && init.headers) || {}),
        },
    });
    /** @type {{ success: boolean, data?: T, error?: { code: string, message: string } }} */
    const body = await res.json();
    if (!body.success || body.data === undefined) {
        const code = (body.error && body.error.code) || `HTTP_${res.status}`;
        const msg = (body.error && body.error.message) || "unknown";
        throw new Error(`agent-wallet ${path} failed [${code}]: ${msg}`);
    }
    return /** @type {T} */ (body.data);
}

/** @param {string} bolt11 */
async function payInvoiceFromAgent(bolt11) {
    return callAgentDaemon("/send", {
        method: "POST",
        body: JSON.stringify({ destination: bolt11 }),
    });
}

/** @param {number} sats @param {string} memo */
async function generatePayoutInvoice(sats, memo) {
    /** @type {{ invoice: string, paymentHash: string }} */
    const data = await callAgentDaemon("/receive", {
        method: "POST",
        body: JSON.stringify({ amount_sats: sats, description: memo }),
    });
    if (!data.invoice || !data.invoice.startsWith("lnbc")) {
        throw new Error(
            `agent-wallet /receive returned invalid invoice: ${data.invoice}`,
        );
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
        const res = await fetch("https://api.tavily.com/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: TAVILY_API_KEY, urls: [url] }),
        });
        if (!res.ok) {
            log(
                "tavily_http_error",
                `${res.status} ${await res.text().catch(() => "")}`,
            );
            return null;
        }
        const body = await res.json();
        const first = body && body.results && body.results[0];
        const raw = first && (first.raw_content || first.content);
        if (typeof raw !== "string" || raw.length === 0) return null;
        // Cap to keep prompt size sane.
        return raw.slice(0, 12_000);
    } catch (err) {
        log("tavily_error", /** @type {Error} */ (err).message);
        return null;
    }
}

/**
 * Lightweight Tavily search for non-URL inputs. Returns top result content
 * snippet, or null on failure.
 * @param {string} query
 * @returns {Promise<{title: string, url: string, snippet: string}|null>}
 */
async function tavilySearch(query) {
    if (!TAVILY_API_KEY) return null;
    try {
        const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: TAVILY_API_KEY,
                query: query.slice(0, 400),
                search_depth: "basic",
                max_results: 3,
            }),
        });
        if (!res.ok) return null;
        const body = await res.json();
        const first = body && body.results && body.results[0];
        if (!first) return null;
        return {
            title: typeof first.title === "string" ? first.title : "",
            url: typeof first.url === "string" ? first.url : "",
            snippet:
                typeof first.content === "string"
                    ? first.content.slice(0, 280)
                    : "",
        };
    } catch (err) {
        log("tavily_search_error", /** @type {Error} */ (err).message);
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
    const source = extracted
        ? `\n\n--- BEGIN PAGE CONTENT ---\n${extracted}\n--- END PAGE CONTENT ---\n`
        : "";
    switch (category) {
        case "summarize":
            return [
                "You are a concise technical summarizer. Produce a single tight summary in 4–8 bullet points.",
                "Focus on factual content. No preamble, no closing remarks. Output only the bullets.",
                `Input: ${input}${source}`,
            ].join("\n\n");
        case "classify":
            return [
                "You are a classifier. Read the input and return ONLY a single short label that best categorizes it.",
                "No explanation, no quotes — just the label.",
                `Input:\n${input}`,
            ].join("\n\n");
        case "translate":
            return [
                "You are a translator. If the input specifies a target language, translate to it.",
                "Otherwise, detect the source language and translate to fluent English.",
                "Return ONLY the translation, no commentary.",
                `Input:\n${input}`,
            ].join("\n\n");
        case "qa":
            return [
                "You are an expert assistant. Answer the question precisely and concisely.",
                `Question:\n${input}`,
            ].join("\n\n");
    }
}

/**
 * Calls a Groq-compatible OpenAI chat/completions endpoint.
 * @param {string} prompt @param {string} model @param {string} apiKey @param {string} baseUrl
 * @returns {Promise<string>}
 */
async function callOpenAICompat(prompt, model, apiKey, baseUrl) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            max_tokens: MODAL_MAX_TOKENS,
        }),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 500)}`);
    }
    const body = await res.json();
    const choice = body && body.choices && body.choices[0];
    const message = choice && choice.message;
    const content = message && message.content;
    const reasoning = message && message.reasoning_content;
    const finish = choice && choice.finish_reason;

    if (typeof content === "string" && content.trim().length > 0) {
        return content.trim();
    }
    if (typeof reasoning === "string" && reasoning.trim().length > 0) {
        log(
            "llm_truncated",
            `finish=${finish} — falling back to reasoning_content`,
        );
        return `[truncated — raise MODAL_MAX_TOKENS]\n\n${reasoning.trim()}`;
    }
    throw new Error(
        `LLM returned no content (finish=${finish}): ${JSON.stringify(body).slice(0, 400)}`,
    );
}

/**
 * Calls Google Gemini's generateContent endpoint.
 * @param {string} prompt @param {string} model @param {string} apiKey
 * @returns {Promise<string>}
 */
async function callGemini(prompt, model, apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model,
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: MODAL_MAX_TOKENS },
        }),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Gemini HTTP ${res.status}: ${text.slice(0, 500)}`);
    }
    const body = await res.json();
    const cand = body && body.candidates && body.candidates[0];
    const parts = cand && cand.content && cand.content.parts;
    const text =
        Array.isArray(parts) && parts.length > 0 && typeof parts[0].text === "string"
            ? parts[0].text
            : "";
    if (text.trim().length === 0) {
        throw new Error(
            `Gemini returned no text: ${JSON.stringify(body).slice(0, 400)}`,
        );
    }
    return text.trim();
}

/**
 * Provider-agnostic LLM call with automatic Groq fallback when the configured
 * provider is missing credentials. Returns the resolved provider+model used.
 * @param {string} prompt
 * @returns {Promise<{ text: string, provider_used: string, model_used: string }>}
 */
async function callLLM(prompt) {
    const wantedProvider = LLM_PROVIDER;

    if (wantedProvider === "gemini" && GEMINI_API_KEY) {
        const model = LLM_MODEL || GEMINI_DEFAULT_MODEL;
        const text = await callGemini(prompt, model, GEMINI_API_KEY);
        return { text, provider_used: "gemini", model_used: model };
    }

    if (wantedProvider === "glm" && GLM_API_KEY) {
        const model = LLM_MODEL || GLM_DEFAULT_MODEL;
        const text = await callOpenAICompat(prompt, model, GLM_API_KEY, GLM_BASE_URL);
        return { text, provider_used: "glm", model_used: model };
    }

    // Groq path or fallback.
    if (!GROQ_API_KEY) {
        throw new Error(
            "GROQ_API_KEY (or MODAL_API_KEY) is not set — cannot run inference",
        );
    }
    if (wantedProvider !== "groq") {
        log(
            "llm_fallback",
            `provider=${wantedProvider} key missing → falling back to groq`,
        );
    }
    // When falling back across providers, LLM_MODEL is from the original
    // provider (e.g. "gemini-1.5-flash-latest") and won't exist on Groq. Only
    // honor LLM_MODEL when the wanted provider was already groq.
    const model =
        wantedProvider === "groq" && LLM_MODEL
            ? LLM_MODEL
            : GROQ_DEFAULT_MODEL;
    const text = await callOpenAICompat(prompt, model, GROQ_API_KEY, GROQ_BASE_URL);
    return { text, provider_used: "groq", model_used: model };
}

/* ─────────────────────────── Marketplace HTTP ───────────────────────────── */

/** @returns {Promise<Job[]>} */
async function listJobs() {
    const res = await fetch(`${MARKETPLACE_URL}/api/jobs`);
    if (!res.ok) throw new Error(`GET /api/jobs failed: ${res.status}`);
    return res.json();
}

/**
 * Register this worker with the marketplace queue. Idempotent: server returns
 * 200 if already registered, 201 if newly added.
 * @returns {Promise<{queue: string[], added: boolean}>}
 */
async function registerWithMarketplace() {
    const res = await fetch(`${MARKETPLACE_URL}/api/workers/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worker_id: WORKER_ID }),
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(
            `register failed ${res.status}: ${detail.slice(0, 200)}`,
        );
    }
    return res.json();
}

/**
 * POST our Tavily-derived assessment for a job. Returns the saved Assessment.
 * Idempotent server-side per (job, worker).
 * @param {string} jobId
 * @param {string} note
 */
async function postAssessment(jobId, note) {
    const res = await fetch(
        `${MARKETPLACE_URL}/api/jobs/${jobId}/assess`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ worker_id: WORKER_ID, note }),
        },
    );
    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(
            `assess failed ${res.status}: ${detail.slice(0, 200)}`,
        );
    }
    return res.json();
}

/**
 * Claim a job. Falls back to the free path when:
 *   - DEMO_FREE_JOBS is set, OR
 *   - the job is a decomposed child (the marketplace already collected
 *     payment from the user when posting the parent).
 * @param {Job} job
 * @returns {Promise<Job>}
 */
async function claimJobWithL402(job) {
    const jobId = job.id;
    const url = `${MARKETPLACE_URL}/api/jobs/${jobId}/claim`;
    const body = JSON.stringify({ worker_id: WORKER_ID });
    const isChild =
        /** @type {any} */ (job).parent_job_id !== null &&
        /** @type {any} */ (job).parent_job_id !== undefined;
    if (DEMO_FREE_JOBS || isChild) {
        const freeClaim = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
        });
        if (!freeClaim.ok) {
            const detail = await freeClaim.text().catch(() => "");
            throw new Error(
                `demo claim failed ${freeClaim.status}: ${detail.slice(0, 300)}`,
            );
        }
        return freeClaim.json();
    }

    const first = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
    });

    if (first.status === 409 || first.status === 410) {
        // Already claimed / completed / expired — race with another worker.
        const detail = await first.json().catch(() => ({}));
        throw new Error(
            `claim_race [${first.status}]: ${JSON.stringify(detail)}`,
        );
    }

    if (first.status !== 402) {
        const detail = await first.text().catch(() => "");
        throw new Error(
            `expected 402 from claim, got ${first.status}: ${detail.slice(0, 300)}`,
        );
    }

    /** @type {{ invoice: string, macaroon: string, payment_hash: string }} */
    const challenge = await first.json();
    if (!challenge.invoice || !challenge.macaroon || !challenge.payment_hash) {
        throw new Error(
            `malformed L402 challenge: ${JSON.stringify(challenge)}`,
        );
    }

    log("claim_pay", `paying ${challenge.payment_hash.slice(0, 12)}…`);
    await payInvoiceFromAgent(challenge.invoice);

    // The marketplace daemon polls /payments to confirm settlement; allow a few retries.
    const maxReplays = 6;
    for (let i = 0; i < maxReplays; i++) {
        await sleep(2500);
        const replay = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `L402 ${challenge.macaroon}:${challenge.payment_hash}`,
            },
            body,
        });
        if (replay.ok) return replay.json();
        if (replay.status !== 402) {
            const detail = await replay.text().catch(() => "");
            throw new Error(
                `claim replay failed ${replay.status}: ${detail.slice(0, 300)}`,
            );
        }
        log(
            "claim_replay_pending",
            `attempt ${i + 1}/${maxReplays} — payment not yet visible`,
        );
    }
    throw new Error("claim payment never confirmed by marketplace daemon");
}

/**
 * @param {string} jobId
 * @param {string} result
 * @param {string} payoutInvoice
 */
async function deliverJob(jobId, result, payoutInvoice) {
    const res = await fetch(`${MARKETPLACE_URL}/api/jobs/${jobId}/deliver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            worker_id: WORKER_ID,
            result,
            payout_invoice: payoutInvoice,
        }),
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(
            `deliver failed ${res.status}: ${detail.slice(0, 300)}`,
        );
    }
    return res.json();
}

/* ──────────────────────────── Job processing ────────────────────────────── */

/** Tracks IDs we've already attempted (or are processing) this run. */
const seen = new Set();
/** Tracks IDs we've already submitted an assessment for this run. */
const assessed = new Set();

/**
 * Run a quick Tavily lookup so the user sees real research evidence per agent,
 * then post the note back to the marketplace. Failures fall back to a generic
 * note so the demo still shows something for every agent.
 * @param {Job} job
 */
async function assessJob(job) {
    let note;
    if (isUrl(job.input)) {
        const extract = await tavilyExtract(job.input);
        if (extract && extract.length > 0) {
            const preview = extract.slice(0, 200).replace(/\s+/g, " ").trim();
            note = `Tavily extracted ${extract.length} chars from ${job.input}. Preview: ${preview}…`;
        } else {
            note = `Tavily extract failed for ${job.input}; will fall back to raw input on delivery.`;
        }
    } else {
        const hit = await tavilySearch(job.input);
        if (hit) {
            note = `Tavily top hit: "${hit.title}" (${hit.url}). Snippet: ${hit.snippet}`;
        } else {
            note = `Plain-text ${job.category} input (${job.input.length} chars). No external lookup needed.`;
        }
    }
    try {
        await postAssessment(job.id, note);
        log("assessed", `${job.id.slice(0, 8)} note=${note.slice(0, 60)}…`);
    } catch (err) {
        log(
            "assess_error",
            `${job.id.slice(0, 8)}: ${/** @type {Error} */ (err).message}`,
        );
    }
}

/** @param {Job} job */
async function processJob(job) {
    log(
        "processing",
        `${job.id.slice(0, 8)}… category=${job.category} reward=${job.reward_sats}`,
    );

    await claimJobWithL402(job);
    log("claimed", job.id.slice(0, 8));

    let extracted = null;
    if (job.category === "summarize" && isUrl(job.input)) {
        log("tavily_extract", job.input);
        extracted = await tavilyExtract(job.input);
        log(
            "tavily_extracted",
            extracted ? `${extracted.length} chars` : "null (raw input only)",
        );
    }

    const prompt = buildPrompt(job.category, job.input, extracted);
    log("llm_call", `provider=${LLM_PROVIDER} prompt_chars=${prompt.length}`);
    const llm = await callLLM(prompt);
    log(
        "llm_result",
        `provider=${llm.provider_used} model=${llm.model_used} chars=${llm.text.length}`,
    );
    const result = llm.text;

    let payoutInvoice = "lnbc1demofreemode";
    if (!DEMO_FREE_JOBS) {
        const inv = await generatePayoutInvoice(
            job.reward_sats,
            `AgentMarket payout for job ${job.id.slice(0, 8)}`,
        );
        payoutInvoice = inv.invoice;
        log("payout_invoice", `${inv.invoice.slice(0, 30)}…`);
    }

    await deliverJob(job.id, result, payoutInvoice);
    log("delivered", `${job.id.slice(0, 8)} +${job.reward_sats} sats`);
}

async function tick() {
    let jobs;
    try {
        jobs = await listJobs();
    } catch (err) {
        log("list_error", /** @type {Error} */ (err).message);
        return;
    }

    const openInCategory = jobs.filter(
        (j) =>
            j.status === "open" &&
            WORKER_CATEGORIES.includes(j.category) &&
            // Decomposed parents are orchestration nodes — they're not real
            // work, the children are. Skip them in both assess + claim phases.
            /** @type {any} */ (j).is_decomposed !== true,
    );

    // Phase 1: assessment — every worker assesses every job they see, once.
    const toAssess = openInCategory.filter((j) => !assessed.has(j.id));
    for (const job of toAssess) {
        assessed.add(job.id);
        // Fire-and-forget: don't block the processing phase on Tavily latency.
        assessJob(job).catch((err) => {
            log(
                "assess_unhandled",
                `${job.id.slice(0, 8)}: ${/** @type {Error} */ (err).message}`,
            );
        });
    }

    // Phase 2: processing — only jobs assigned to this worker (or unassigned,
    // for legacy single-worker mode where no fleet has registered).
    const mine = openInCategory.filter((j) => {
        const assigned = /** @type {any} */ (j).assigned_worker_id;
        return (
            !seen.has(j.id) &&
            (assigned === WORKER_ID || assigned === null || assigned === undefined)
        );
    });
    if (mine.length === 0) return;

    // Oldest first.
    mine.sort(
        (a, b) =>
            /** @type {any} */ (a).created_at -
            /** @type {any} */ (b).created_at,
    );

    const job = mine[0];
    seen.add(job.id);

    try {
        await processJob(job);
    } catch (err) {
        log(
            "process_error",
            `${job.id.slice(0, 8)}: ${/** @type {Error} */ (err).message}`,
        );
        // Don't un-seen on error — avoid hot-looping a doomed job.
    }
}

async function main() {
    log(
        "startup",
        `marketplace=${MARKETPLACE_URL} agent_wallet=${AGENT_WALLET_URL} demo_free_jobs=${DEMO_FREE_JOBS} provider=${LLM_PROVIDER} categories=[${WORKER_CATEGORIES.join(",")}]`,
    );
    if (!GROQ_API_KEY && LLM_PROVIDER === "groq") {
        console.error("[fatal] GROQ_API_KEY (or MODAL_API_KEY) is not set");
        process.exit(1);
    }
    if (!GROQ_API_KEY && LLM_PROVIDER !== "groq") {
        log(
            "key_warn",
            "GROQ_API_KEY is not set — provider fallback will fail if your provider's key is also missing",
        );
    }

    try {
        const reg = await registerWithMarketplace();
        log(
            "registered",
            `added=${reg.added} queue=[${(reg.queue || []).join(",")}]`,
        );
    } catch (err) {
        // Registration is best-effort: marketplace may be slow to boot. The
        // worker's processing-phase filter falls back to unassigned jobs, so
        // single-worker dev still functions even if registration fails here.
        log(
            "register_warn",
            /** @type {Error} */ (err).message,
        );
    }

    let running = true;
    process.on("SIGINT", () => {
        log("shutdown", "SIGINT received");
        running = false;
    });

    while (running) {
        await tick();
        await sleep(POLL_MS);
    }

    log("exit", "clean");
}

main().catch((err) => {
    console.error(
        `[worker:${WORKER_ID}] [fatal] ${/** @type {Error} */ (err).message}`,
    );
    process.exit(1);
});
