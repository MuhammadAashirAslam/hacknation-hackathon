# AgentMarket - Team Handoff (Phase 6 complete, real-money tested)

> **For:** any teammate picking up the project.
> **Last updated:** end of Phase 6 (real-money cycle verified on mainnet, Apr 26 2026).
> **What you do with this file:** read it once, then paste it into a fresh
> Cursor chat with **Opus 4.7** as the model. That chat will use this
> context to generate a precise prompt you paste into a separate **Sonnet
> 4.6** chat where the actual code gets written.

---

## 1. Two-chat workflow (do not skip this)

We run with two parallel chats. Use the same pattern:

| Chat              | Model      | Job                                                                                                                             | Allowed to edit code?                                               |
| ----------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Strategy chat** | Opus 4.7   | Holds full context. Disambiguates "what's next?". Generates phase prompts. Updates `.cursor/rules/agentmarket-context.mdc`.     | Only meta files (rules, HANDOFF.md, config). Never application code. |
| **Build chat**    | Sonnet 4.6 | Receives a single phase prompt. Executes it with verification loops. Reports binary pass/fail on success criteria.              | Yes - primary code editor.                                          |

**Rules:**

1. Never build application code in the strategy chat.
2. Never strategize in the build chat. If uncertain, stop and bring the question to the strategy chat.
3. After each phase, paste the build chat's results back into the strategy chat. Strategy chat updates the persistent rule + tech-debt log.
4. The persistent rule at `.cursor/rules/agentmarket-context.mdc` (`alwaysApply: true`) auto-loads into every chat. That is where ground truth lives.

---

## 2. 30-second project recap

**AgentMarket** = an Agent-to-Agent Lightning Network marketplace. AI agents
post jobs (e.g. "summarize this URL"), other AI agents claim them, do the
work, and get paid in real bitcoin sats over Lightning via L402.

- Stack: Next.js 15 App Router, TypeScript strict, Tailwind v4 (CSS-first),
  Groq llama-3.3-70b (worker brain), Tavily (web fetch), MoneyDevKit (MDK)
  Agent Wallet daemon for Lightning ops.
- Demo target: marketplace running, two MDK wallets exchanging real sats
  on mainnet, video showing autonomous agents transacting.
- Everything is local - in-memory `Map` store, no DB, no Supabase, no cloud.
  Resets on server restart. Intentional for the hackathon.

Full ground truth: `.cursor/rules/agentmarket-context.mdc`. Read it next.

---

## 3. Where we are in the pipeline

| Phase | Status         | What it covered                                                                                                                                     |
| ----- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | done           | MDK two-wallet setup; `lib/lightning.ts` adapter; `scripts/test-payment.js` proves cross-wallet sats movement                                       |
| 2     | done           | `lib/store.ts`, `lib/feed.ts`, `lib/types.ts`; `POST /api/jobs` with custom L402; `GET /api/jobs`, `GET /api/stats`                                 |
| 3     | done           | `POST /api/jobs/[id]/claim` (with claim deposit), `POST /api/jobs/[id]/deliver` (atomic completion + payout); state machine + lazy expiry           |
| 4     | done           | `GET /api/events` SSE feed; broadcast wiring; observability                                                                                         |
| 5a    | done           | v0.dev mockup migrated into `agentmarket/`; UI renders at `/`, `/marketplace`, `/try`; dark theme; build green; APIs intact                         |
| 5b    | done           | Wire marketplace job list fetch + SSE refresh; wire post-job modal to `POST /api/demo/post-job`; `/try` L402 demo                                   |
| **6** | **done**       | `agents/requester.js` + `agents/worker.js`; full L402 cycle (Groq + Tavily); real-money mainnet test passed (4 Lightning payments, 23s end-to-end)  |
| **7** | **next up**    | E2E testing, error states, polish                                                                                                                   |
| 8     | pending        | Demo video                                                                                                                                          |

---

## 4. What Phase 6 delivered

**New files:**

- `agents/requester.js` - autonomous requester loop. Picks a job template, calls `POST /api/demo/post-job`, polls `GET /api/jobs/:id` until `completed`. Env: `MARKETPLACE_URL`, `REWARD_SATS`, `INTERVAL_MS`.
- `agents/worker.js` - autonomous worker loop. Polls `GET /api/jobs`, performs the full L402 claim dance, calls Groq LLM (+ Tavily for summarize), mints payout invoice, calls `POST /api/jobs/:id/deliver`. Env: `MARKETPLACE_URL`, `MDK_AGENT_WALLET_URL`, `MODAL_API_KEY`, `MODAL_BASE_URL`, `MODAL_MODEL`, `TAVILY_API_KEY`.

**Bug fixed during real-money testing:**

`app/api/demo/post-job/route.ts` - added 6x2.5s retry loop on the L402 replay step. Lightning settlement from the agent wallet takes ~5-10s after `payInvoiceAsAgent` returns. Without this retry, the agent burns sats but no job is created. `worker.js/claimJobWithL402` already had the same pattern - now `demo/post-job` matches it.

**Real-money cycle verified:**

One full QA job (reward=10 sats) on mainnet mainnet, Apr 26 07:55 UTC:

| Step                        | Payment          | Settled |
| --------------------------- | ---------------- | ------- |
| requester posts job (L402)  | agent -> market  | 10 sats received (1 LSP fee) |
| worker claims job (L402)    | agent -> market  | 1 sat received (1 LSP fee) |
| worker calls Groq           | (off-chain)      | result="HELLO" in <1s |
| worker delivers + gets paid | market -> agent  | 9 sats received (1 LSP fee) |

Total elapsed: 23 seconds. Net: agent -3 sats, marketplace +1 sat, LSP +3 sats.

---

## 5. Workspace setup - CORRECT PROCEDURE (read carefully)

You need three things running before any of this works:

### Step 1 - Marketplace wallet daemon (port 3456)

On Rehan's machine, this wallet already exists and is funded. Just start it:

```powershell
# In a dedicated PowerShell terminal (leave it open)
npx @moneydevkit/agent-wallet@latest start --daemon
# Expected: {"started":true,"pid":<N>,"port":3456}

# Verify
curl.exe http://127.0.0.1:3456/balance
# Expected: {"success":true,"data":{"balanceSats":<N>}}
```

The default `USERPROFILE` (`C:\Users\Rehan`) points to the marketplace wallet.

### Step 2 - Agent wallet daemon (port 3457)

This wallet lives at `C:\Users\Rehan\agentmarket-wallets\agent`. It requires
`USERPROFILE` and `MDK_WALLET_PORT` overrides:

```powershell
# In a SEPARATE dedicated PowerShell terminal (leave it open)
$env:USERPROFILE = "C:\Users\Rehan\agentmarket-wallets\agent"
$env:MDK_WALLET_PORT = "3457"
npx @moneydevkit/agent-wallet@latest start --daemon
# Expected: {"started":true,"pid":<N>,"port":3457}

# Verify
curl.exe http://127.0.0.1:3457/balance
# Expected: {"success":true,"data":{"balanceSats":<N>}}
```

#### CRITICAL - MDK port flag is broken

`@moneydevkit/agent-wallet@0.16.0` ignores `--port` when starting a daemon.
The source calls `getPort()` which reads ONLY the `MDK_WALLET_PORT` env var.
**Always use `MDK_WALLET_PORT`, never `--port`.**

#### CRITICAL - init required for new machines

If you are on a fresh machine (no `.mdk-wallet/config.json` in the agent wallet root), run `init` FIRST:

```powershell
$env:USERPROFILE = "C:\Users\Rehan\agentmarket-wallets\agent"
$env:MDK_WALLET_PORT = "3457"
npx @moneydevkit/agent-wallet@latest init
# Save the mnemonic it prints. It controls real bitcoin.
npx @moneydevkit/agent-wallet@latest start --daemon
```

#### CRITICAL - channel reserve (fund the agent to 80+ sats)

A fresh agent wallet topped up via MDK's LSPS4 will show `balance=29` but
only ~1.4 sats of outbound capacity. The LSP opens a large channel and the
agent's local share must exceed the 1% channel reserve before it can send.

Symptom: `agent-wallet /send failed [SEND_FAILED]: insufficient outbound capacity: required 2000msat, available 1400msat`

Fix: fund the agent wallet to at least 80 sats before running agent scripts.
Generate an invoice from the agent side and pay from any funded wallet:

```powershell
# In the agent terminal (USERPROFILE + MDK_WALLET_PORT already set)
npx @moneydevkit/agent-wallet@latest receive 200

# In the marketplace terminal (default USERPROFILE, no MDK_WALLET_PORT)
npx @moneydevkit/agent-wallet@latest send <invoice-from-above>
```

### Step 3 - Next.js dev server

```powershell
cd agentmarket
npm install     # first time only
npm run dev     # boots on :3000 (or next free port)
```

### Smoke tests (run these before touching any code)

```powershell
# Wallets up?
curl.exe http://127.0.0.1:3456/balance    # marketplace
curl.exe http://127.0.0.1:3457/balance    # agent

# Server up?
curl.exe http://localhost:3000/api/jobs
curl.exe http://localhost:3000/api/stats

# SSE (Ctrl+C to stop):
curl.exe -N http://localhost:3000/api/events
```

If any of those fail, fix the environment before writing code.

---

## 6. Running the autonomous agents

Both agents load environment from the shell. On Windows you must source
`.env.local` manually (Node does not auto-load it):

```powershell
cd agentmarket

# Load env vars from .env.local into the current shell
Get-Content .\.env.local | ForEach-Object {
  if ($_ -match '^([A-Z_][A-Z0-9_]*)=(.*)$') {
    [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2])
  }
}

# Verify key vars loaded
Write-Host "MODAL_API_KEY is set: $([bool]$env:MODAL_API_KEY)"
Write-Host "DEMO_FREE_JOBS: $env:DEMO_FREE_JOBS"
```

Then, in separate terminals (each with env loaded):

```powershell
# Terminal A: worker (polls for open jobs, claims + delivers)
node agents/worker.js

# Terminal B: requester (posts jobs for the worker to pick up)
node agents/requester.js
```

**To run with real Lightning payments:** set `DEMO_FREE_JOBS=false` in
`.env.local` before loading env. Ensure both daemons are running and the
agent wallet has 80+ sats of outbound capacity. Revert to `true` when done.

**Expected worker log flow:**
```
[startup] marketplace=http://localhost:3000 ...
[processing] <job-id> category=qa reward=10
[claim_pay] paying <hash>...
[claim_replay_pending] attempt 1/6 - payment not yet visible   # normal, ~5-10s settle
[claimed] <job-id>
[llm_call] model=llama-3.3-70b-versatile prompt_chars=...
[llm_result] N chars
[payout_invoice] lnbc...
[delivered] <job-id> +10 sats
```

---

## 7. .env.local reference

```
MDK_WALLET_URL=http://localhost:3456
MDK_AGENT_WALLET_URL=http://localhost:3457
AGENT_WALLET_URL=http://localhost:3457

MDK_ACCESS_TOKEN=<your MDK token>
MDK_MNEMONIC=<marketplace wallet mnemonic — NEVER commit>

# LLM (Groq, OpenAI-compatible)
MODAL_API_KEY=<groq api key>
MODAL_BASE_URL=https://api.groq.com/openai/v1
MODAL_MODEL=llama-3.3-70b-versatile
MODAL_MAX_TOKENS=4096

TAVILY_API_KEY=<tavily api key>

MARKETPLACE_FEE_PERCENT=10
JOB_EXPIRY_MINUTES=30
CLAIM_WINDOW_MINUTES=10
CLAIM_DEPOSIT_SATS=2

L402_HMAC_SECRET=<32+ char random string, same across all teammates>

# true  = /api/demo/* routes skip Lightning entirely (fast browser demo)
# false = real L402 flow end-to-end (required for worker to earn real sats)
DEMO_FREE_JOBS=true

MARKETPLACE_URL=http://localhost:3000
```

---

## 8. Phase 5a fix log (prop signatures - still relevant)

The v0.dev migration changed component contracts. Use these signatures:

```tsx
<JobCard job={job} onClaim={(id) => ...} onViewResult={(id) => ...} highlighted={false} />

<TransactionFeed initial={transactions} sseUrl="/api/events" maxItems={50} className="" />

<LiveStats apiUrl="/api/stats" pollMs={3000} />
```

- `TransactionFeed` self-subscribes to `/api/events`. No parent wiring needed.
- `LiveStats` self-polls `/api/stats`. No parent wiring needed.
- `app/marketplace/page.tsx` cannot accept arbitrary props (App Router constraint). Initial data must be fetched inside the component with `useEffect`.
- Do NOT install `next-themes`. Dark mode is hardcoded. `components/ui/sonner.tsx` has `theme="dark"` hardcoded.

---

## 9. Quick command cheat-sheet

```powershell
# Dev loop
cd agentmarket && npm run dev

# Build verification
cd agentmarket && npm run build

# Start marketplace daemon (default USERPROFILE, port 3456)
npx @moneydevkit/agent-wallet@latest start --daemon

# Start agent daemon (USERPROFILE + port override required)
$env:USERPROFILE = "C:\Users\Rehan\agentmarket-wallets\agent"
$env:MDK_WALLET_PORT = "3457"
npx @moneydevkit/agent-wallet@latest start --daemon

# Check daemon is alive
npx @moneydevkit/agent-wallet@latest status
curl.exe http://127.0.0.1:3456/balance
curl.exe http://127.0.0.1:3457/balance

# Stop a daemon (no stop command - use PID from status output)
Stop-Process -Id <pid> -Force

# Generate invoice (for funding)
npx @moneydevkit/agent-wallet@latest receive 500

# Pay an invoice
npx @moneydevkit/agent-wallet@latest send lnbc...
```

---

## 10. File ownership matrix

**Sacred (do not touch without a server reason):**

- `lib/lightning.ts` - only place `@moneydevkit/*` is imported
- `lib/store.ts` - only place that mutates the in-memory store
- `lib/feed.ts` - only place that broadcasts SSE events
- `lib/types.ts` - shared types
- `app/api/**` - all route handlers
- `.env.local` - secrets

**Frontend:**

- `app/page.tsx`, `app/marketplace/page.tsx`, `app/try/page.tsx`
- `app/layout.tsx`, `app/globals.css`
- `components/**`, `hooks/**`, `lib/utils.ts`

**Agents:**

- `agents/requester.js`, `agents/worker.js`

---

## 11. Copy-paste opener for your strategy chat (Opus 4.7)

```
I'm picking up AgentMarket from a teammate. Phase 6 (autonomous agents + real
money) is done. I need to start Phase 7 (polish + error states).

Read .cursor/rules/agentmarket-context.mdc - that's the auto-loaded ground truth.
Read agentmarket/HANDOFF.md - current operational status.

Then verify the build is green:
  cd agentmarket && npm run build

If green, generate the Phase 7 prompt for my Sonnet 4.6 build chat. Use the
format from previous phase prompts: scope, locked decisions, sequence of steps,
success criteria, Karpathy guardrails.

If anything in HANDOFF.md or the rule contradicts what you find on disk,
flag it before writing the prompt.
```

---

## 12. External ecosystem references (Spiral Discord)

**Reference L402 projects:**

- [origram.xyz](https://origram.xyz/) - agents pay sats via L402 to post images. Built by Spiral PM on MDK.
- [clank.money](https://clank.money/) - agents register human-readable Bitcoin addresses by paying via L402.

**Demo framing (use in pitch):**

- matbalez's framing: _"what will agents need to pay for once they're unleashed en masse?"_
- His examples: content (origram), identity (clank), physical goods (unhuman.coffee).
- AgentMarket is one rung up: **agents paying agents for work**. Higher-order use case.

**Discovery directory:**

- [402index.io](https://402index.io/) - 20K+ paid API endpoints. Submit AgentMarket post-hack.

**MDK humans (for live help):**

- `@Nick Slaney`, `@sbddesign` (Stephen Delorme), `@Martin Saposnic` - MDK team on Discord.
- `@moneyball` - Spiral funding form. DM directly with a Lightning invoice if the form queue is slow.

---

## 13. What to share with teammates

**Share in the repo (already there):**

- This file, `.cursor/rules/agentmarket-context.mdc`, `.cursor/rules/karpathy-guidelines.mdc`, `.cursorrules`

**Share via secure channel only (Signal / 1Password, NEVER git or chat):**

- `MODAL_API_KEY`, `TAVILY_API_KEY`, `L402_HMAC_SECRET`
- MDK wallet mnemonics (marketplace at `~/.mdk-wallet/config.json`, agent at `C:\Users\Rehan\agentmarket-wallets\agent\.mdk-wallet\config.json`)

---

## 14. If something feels off

- Build chat asking the same question twice -> update the rule so the answer is auto-loaded.
- A "locked" decision that no longer fits -> bring to strategy chat, amend the rule, log in Tech debt log.
- This HANDOFF.md going stale -> 30-second update at end of phase.

Move fast, but keep ground truth honest.
