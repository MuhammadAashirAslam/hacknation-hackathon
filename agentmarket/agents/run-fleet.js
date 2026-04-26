// @ts-check
/**
 * Fleet launcher: spawns N named workers in one terminal, all sharing the
 * same agent wallet (port 3457). Each worker registers with the marketplace
 * and gets round-robin assignment for new jobs.
 *
 * Usage:
 *   node --env-file=.env.local agents/run-fleet.js
 *
 * Env (optional):
 *   FLEET_NAMES   comma-separated worker IDs (default: scout-alpha,scout-beta,scout-gamma)
 *   FLEET_STAGGER milliseconds between worker starts (default: 400)
 *
 * All other env vars (MARKETPLACE_URL, MODAL_API_KEY, TAVILY_API_KEY, etc.)
 * are inherited by each child process.
 */

const { spawn } = require("node:child_process");
const path = require("node:path");

const FLEET_NAMES = (
    process.env.FLEET_NAMES || "scout-alpha,scout-beta,scout-gamma"
)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// Per-worker LLM provider + model overrides. Index aligns with FLEET_NAMES.
// Missing entries inherit the global env (typically Groq).
const FLEET_PROVIDERS = (
    process.env.FLEET_PROVIDERS || "groq,gemini,groq"
)
    .split(",")
    .map((s) => s.trim());
// Note: llama-3.1-8b-instant has a 6000-TPM limit on the free tier — too small
// for ~12k-char Tavily-extracted prompts. Defaulting all Groq workers to the
// 70b-versatile model. Override via FLEET_MODELS for paid-tier diversity.
const FLEET_MODELS = (
    process.env.FLEET_MODELS ||
    "llama-3.3-70b-versatile,gemini-2.5-flash,llama-3.3-70b-versatile"
)
    .split(",")
    .map((s) => s.trim());

const STAGGER_MS = Number(process.env.FLEET_STAGGER || "400");

const WORKER_PATH = path.resolve(__dirname, "worker.js");

const ANSI_RESET = "\x1b[0m";
const COLORS = ["\x1b[36m", "\x1b[33m", "\x1b[35m", "\x1b[32m", "\x1b[34m"];

/**
 * Prefix every line of a stream with the worker's color tag.
 * @param {NodeJS.ReadableStream} stream
 * @param {string} prefix
 * @param {string} color
 * @param {NodeJS.WriteStream} dest
 */
function pipeWithPrefix(stream, prefix, color, dest) {
    let buf = "";
    stream.on("data", (chunk) => {
        buf += chunk.toString();
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
            dest.write(`${color}[${prefix}]${ANSI_RESET} ${line}\n`);
        }
    });
}

/** @type {import('node:child_process').ChildProcess[]} */
const children = [];

function shutdown() {
    console.log("\n[fleet] shutting down workers…");
    for (const child of children) {
        if (!child.killed) child.kill("SIGINT");
    }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function main() {
    console.log(`[fleet] launching ${FLEET_NAMES.length} workers: ${FLEET_NAMES.join(", ")}`);

    for (let i = 0; i < FLEET_NAMES.length; i++) {
        const name = FLEET_NAMES[i];
        const color = COLORS[i % COLORS.length];
        const provider = FLEET_PROVIDERS[i] || "groq";
        const model = FLEET_MODELS[i] || "";

        console.log(`[fleet] ${name} → provider=${provider} model=${model || "(default)"}`);

        const child = spawn(process.execPath, [WORKER_PATH], {
            env: {
                ...process.env,
                WORKER_ID: name,
                LLM_PROVIDER: provider,
                LLM_MODEL: model,
            },
            stdio: ["ignore", "pipe", "pipe"],
        });

        pipeWithPrefix(child.stdout, name, color, process.stdout);
        pipeWithPrefix(child.stderr, name, color, process.stderr);

        child.on("exit", (code, signal) => {
            console.log(`[fleet] worker ${name} exited (code=${code} signal=${signal})`);
        });

        children.push(child);

        if (i < FLEET_NAMES.length - 1 && STAGGER_MS > 0) {
            await new Promise((r) => setTimeout(r, STAGGER_MS));
        }
    }

    console.log("[fleet] all workers spawned. ctrl-c to stop.");
}

main().catch((err) => {
    console.error(`[fleet] fatal: ${err.message}`);
    process.exit(1);
});
