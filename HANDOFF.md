# AgentMarket — Team Handoff (Phase 5b complete, Phase 6 ready)

> **For:** any teammate picking up the project.
> **Last updated:** end of Phase 5b (data wiring + demo endpoints).
> **What you do with this file:** read it once, then paste it into a fresh
> Cursor chat with **Opus 4.7** as the model. That chat will use this
> context to generate a precise prompt you paste into a separate **Sonnet
> 4.6** chat where the actual code gets written.

---

## 1. Two-chat workflow (do not skip this)

We've been running with two parallel chats and it's the reason we move fast
without breaking what already works. Use the same pattern:

| Chat              | Model      | Job                                                                                                                                                                                                                  | Allowed to edit code?                                                               |
| ----------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Strategy chat** | Opus 4.7   | Holds full project context. Disambiguates "what's next?" Generates phase prompts. Updates the persistent rule at `.cursor/rules/agentmarket-context.mdc` when ground truth changes. Audits results after each phase. | Only meta files (rules, this HANDOFF.md, sometimes config). Never application code. |
| **Build chat**    | Sonnet 4.6 | Receives a single phase prompt. Executes it with verification loops. Reports binary pass/fail on success criteria.                                                                                                   | Yes — primary code editor.                                                          |

**Rules:**

1. Never build application code in the strategy chat. It burns Opus tokens on
   things Sonnet does cheaper, and it splits the source of truth.
2. Never strategize in the build chat. If the build chat is uncertain about
   scope or hits an unexpected design fork, stop, copy the question into the
   strategy chat, and bring back the answer as a follow-up prompt.
3. After each phase, paste the build chat's "I'm done, here are the test
   results" message back into the strategy chat. The strategy chat updates
   the persistent rule + tech-debt log + decides what's next.
4. The persistent rule at `.cursor/rules/agentmarket-context.mdc`
   (`alwaysApply: true`) auto-loads into **every chat in this workspace**.
   That's where ground truth lives. If you change something fundamental
   (new endpoint contract, new locked decision, new MDK gotcha), update the
   rule — don't rely on this HANDOFF.md.

---

## 2. 30-second project recap

**AgentMarket** = an Agent-to-Agent Lightning Network marketplace. AI agents
post jobs (e.g. "summarize this URL"), other AI agents claim them, do the
work, and get paid in real bitcoin sats over Lightning via L402.

- Stack: Next.js 15 App Router, TypeScript strict, Tailwind v4 (CSS-first),
  Anthropic Claude (worker brain), Tavily (web fetch), MoneyDevKit (MDK)
  Agent Wallet daemon for Lightning ops.
- Demo target: marketplace running, two MDK wallets exchanging real sats
  on mainnet, video showing autonomous agents transacting.
- Everything is local — in-memory `Map` store, no DB, no Supabase, no cloud.
  Resets on server restart. That's intentional for the hackathon.

Full ground truth: `.cursor/rules/agentmarket-context.mdc`. Read it next.

---

## 3. Where we are in the pipeline

| Phase  | Status                     | What it covered                                                                                                                                       |
| ------ | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | ✅ done                    | MDK two-wallet setup; `lib/lightning.ts` adapter; `scripts/test-payment.js` proves cross-wallet sats movement                                         |
| 2      | ✅ done                    | `lib/store.ts`, `lib/feed.ts`, `lib/types.ts`; `POST /api/jobs` with custom L402; `GET /api/jobs`, `GET /api/stats`                                   |
| 3      | ✅ done                    | `POST /api/jobs/[id]/claim` (with claim deposit), `POST /api/jobs/[id]/deliver` (atomic completion + payout); state machine + lazy expiry             |
| 4      | ✅ done                    | `GET /api/events` SSE feed; broadcast wiring; observability                                                                                           |
| **5a** | ✅ done                    | v0.dev mockup migrated into `agentmarket/`; UI renders at `/`, `/marketplace`, `/try`; dark theme; build green; APIs intact                           |
| **5b** | ✅ **done (this handoff)** | Marketplace data wiring; real post-job L402 flow; `/api/demo/*` endpoints; `/try` live trace; `DEMO_FREE_JOBS` bypass mode                           |
| 6      | 🟡 **next up**             | Autonomous `agents/requester.js` + `agents/worker.js` running against MDK daemons (GLM-5 via Z.ai OpenAI-compat + Tavily)                           |
| 7      | ⏳ pending                 | E2E testing, error states, polish                                                                                                                     |
| 8      | ⏳ pending                 | Demo video                                                                                                                                            |

---

## 4. What 5b actually delivered

**New routes:**

- `POST /api/demo/post-job` — server-side L402 challenge/pay/replay proxy. Gets 402 from `/api/jobs`, pays invoice from agent wallet (`:3457`), replays with token. Returns `{ job, payment_hash }`.
- `POST /api/demo/run-l402` — same flow, returns a structured 3-step trace `[{ title, response }]` for the `/try` page. Returns `{ ok, steps, created_job_id, payment_hash }`.

**`DEMO_FREE_JOBS=true` bypass mode (in both demo routes):**

- Set `DEMO_FREE_JOBS=true` in `.env.local` to skip real Lightning payments entirely.
- Routes write jobs directly to the store and broadcast feed events — no wallet daemon needed.
- Flip to `false` (or remove) on demo day when wallets are funded.
- See `.env.local.example` for the full variable list.

**`lib/lightning.ts` additions:**

- `payInvoiceAsAgent(bolt11)` — pays from agent wallet (`MDK_AGENT_WALLET_URL` / `AGENT_WALLET_URL`).
- `normalizeBaseUrl()` — strips trailing slash from wallet URLs (`.env.local` had trailing `/`).

**`app/marketplace/page.tsx` — now fully wired:**

- `fetchJobs()` + `fetchStats()` via `useCallback` called on mount — `isLoading` flips `false` after first load. No more infinite skeleton.
- Page-level `EventSource('/api/events')` subscription; refetches jobs + stats on any event.
- Stats polled every 3s.
- Post-job modal calls `POST /api/demo/post-job`; shows real job ID on success.

**`app/try/page.tsx` — live demo:**

- "Run Demo" button calls `POST /api/demo/run-l402`.
- Step response panels show real HTTP output (402 challenge, payment hash, 201 job JSON).
- Falls back to error display if payment fails; reset restores placeholder text.

**Workspace setup addition:**

- `.env.local.example` committed to repo — teammates copy it and run `npm run dev` with no wallet setup needed (`DEMO_FREE_JOBS=true`).

---

## 4a. What 5a actually delivered

**Server-side (untouched, still works):**

- `GET /api/jobs` → list (verified 200)
- `POST /api/jobs?reward_sats=N` → custom L402 challenge → 200 on payment
- `POST /api/jobs/[id]/claim`, `POST /api/jobs/[id]/deliver`
- `GET /api/stats` → live stats object
- `GET /api/events` → SSE stream with `: ping` keepalives

**Frontend (new):**

- Tailwind v3 → v4 migrated (`@tailwindcss/postcss`, no `tailwind.config.js`).
- Dark theme forced via `<html className="dark">` in `app/layout.tsx`. Light
  mode tokens still exist in `globals.css :root` but are never applied.
- Pages: `/`, `/marketplace`, `/try` all render.
- Components: `JobCard`, `JobCardSkeleton`, `LiveStats`, `TransactionFeed`,
  `landing/{footer,hero,how-it-works,live-feed,nav}.tsx`, full
  `components/ui/*` shadcn primitives (~60 files).
- Fonts: Inter + JetBrains Mono via `next/font/google` (NOT the editorial
  Instrument Serif scheme — see §8).
- Palette: original slate `#0F172A` / blue `#1A56DB` / amber `#F59E0B` /
  green `#10B981`. Theme swap deferred — see §8.

**Self-wiring components (already real, no work needed in 5b):**

- `TransactionFeed` opens `EventSource('/api/events')` on mount, with
  reconnect logic. Works as-is.
- `LiveStats` polls `/api/stats` on a configurable interval. Works as-is.

**Still mocked (5b targets):**

- `app/marketplace/page.tsx`: jobs list initialized to `[]`; `isLoading`
  starts `true`; never fetches `/api/jobs`. Shows skeletons forever.
- `app/marketplace/page.tsx` post-job modal: `handlePostJob` is a fake
  `setTimeout` chain. No real POST.
- `app/try/page.tsx`: 3 step cards rendered statically; no live demo.

**Dev port:** the build chat reported `:3007` (port 3000 was in use). On a
clean machine it'll be `:3000`. Don't hardcode the port anywhere.

---

## 5. Phase 5a fix log (READ before writing 5b)

The build chat had to make four root-cause fixes during migration. These
**change the integration contract** vs what v0 originally generated, so 5b
must respect them:

| File                       | Change                                                                                                                             | Why it matters                                                                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/marketplace/page.tsx` | Removed `MarketplacePageProps` interface and `initialJobs / initialStats / initialFeed` props                                      | Next App Router pages cannot accept arbitrary props. **5b must fetch initial data inside the component (useEffect on mount), not via SSR props.** |
| `app/marketplace/page.tsx` | Changed `<JobCard {...job} />` → `<JobCard job={job} />`                                                                           | Match real prop signature.                                                                                                                        |
| `app/marketplace/page.tsx` | `<TransactionFeed initialFeed={feed} onLiveStatusChange={...} />` → `<TransactionFeed initial={feed} />` (no `onLiveStatusChange`) | Match real prop signature. The status callback no longer exists.                                                                                  |
| `components/LiveStats.tsx` | Hoisted `formatNumber` to module scope                                                                                             | Was defined inside parent, used by child sub-components — broke during migration. Permanent fix, no action needed.                                |
| `components/ui/sonner.tsx` | Removed `next-themes` dep, hardcoded `theme="dark"`                                                                                | We deliberately did not install `next-themes`. **Do not re-introduce it; we are dark-only.**                                                      |
| `lib/lightning.ts`         | `L402VerifyResult.status` union extended `401 \| 402 \| 403`                                                                       | Pre-existing type bug surfaced during build. No behavior change.                                                                                  |

Confirmed prop signatures (use these in 5b):

```tsx
<JobCard job={job} onClaim={(id) => ...} onViewResult={(id) => ...} highlighted={false} />

<TransactionFeed initial={transactions} sseUrl="/api/events" maxItems={50} className="" />

<LiveStats apiUrl="/api/stats" pollMs={3000} />
```

---

## 6. Phase 5b — DONE ✅

All three sub-tasks shipped. See §4 for the full delivery log.

Quick contract summary for Phase 6 reference:

```
POST /api/demo/post-job
  body: { title, description, reward_sats }
  → 200 { job: Job, payment_hash: string }

POST /api/demo/run-l402
  body: { title?, description?, reward_sats? }
  → 200 { ok: bool, steps: [{title, response}], created_job_id?, payment_hash? }
```

## 6a. Phase 6 scope (next up)

**Goal:** autonomous requester + worker agents running end-to-end without human clicks.

**Stack clarification:** we use **GLM-5 via Z.ai** (OpenAI-compatible), NOT Anthropic. Env vars:

```
OPENAI_API_KEY=<your Z.ai key>
OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4
```

**`agents/requester.js`** — a Node script that:
1. Reads a task from argv or a config file.
2. Calls `POST /api/demo/post-job` (server does the L402 dance).
3. Polls `GET /api/jobs` until the job `status === 'completed'`.
4. Prints the result.

**`agents/worker.js`** — a Node script that:
1. Polls `GET /api/jobs` for `open` jobs.
2. Claims a job via `POST /api/jobs/[id]/claim` (pays claim deposit from agent wallet).
3. Calls GLM-5 via OpenAI SDK to actually do the work (`description` is the prompt).
4. Posts result via `POST /api/jobs/[id]/deliver` (receives reward payout).
5. Loops.

**Tavily** is optional enrichment for web-fetch tasks — check `TAVILY_API_KEY` is set before using.

**Locked decision for Phase 6:** agents call the real `/api/jobs/[id]/claim` and `/api/jobs/[id]/deliver` endpoints (NOT the `/api/demo/*` proxies). They must have funded wallets to cover the claim deposit + L402 payment. `DEMO_FREE_JOBS=true` must be `false` for a real end-to-end run.

---

## 7. Workspace setup for a fresh teammate

You need three things running before any of this works:

```powershell
# 1. Marketplace wallet daemon (port 3456)
$env:USERPROFILE="C:\Users\<you>\agentmarket-wallets\marketplace"
npx @moneydevkit/agent-wallet@latest start --daemon --port 3456

# 2. Agent wallet daemon (port 3457) — SEPARATE shell with different USERPROFILE
$env:USERPROFILE="C:\Users\<you>\agentmarket-wallets\agent"
npx @moneydevkit/agent-wallet@latest start --daemon --port 3457

# 3. Next.js dev server
cd agentmarket
npm install     # first time only
npm run dev     # boots on :3000 (or next free port)
```

`USERPROFILE` override is the **only** working way to run two MDK wallet
configs side-by-side on Windows. The documented `--config-dir` and
`MDK_CONFIG_DIR` env var are silently ignored. We discovered this in Phase 1.

To verify both wallets are actually different (not the same one on two
ports), check balances differ or check the wallet IDs.

The two wallets each need to be **funded with mainnet sats** to actually
move money during the demo. ~10k sats per wallet is plenty. Use any
Lightning wallet to send to invoices generated by `/receive`.

### `.env.local` — copy from `.env.local.example`

A committed `.env.local.example` has all variables with safe defaults.
Copy it and fill in secrets:

```powershell
Copy-Item agentmarket\.env.local.example agentmarket\.env.local
```

Full variable reference:

```
MDK_WALLET_URL=http://localhost:3456        # marketplace wallet
MDK_AGENT_WALLET_URL=http://localhost:3457  # agent wallet (pays L402 invoices)
OPENAI_API_KEY=                             # Z.ai GLM-5 key (Phase 6 worker)
OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4
TAVILY_API_KEY=                             # optional, Phase 6 web-fetch tasks
MARKETPLACE_FEE_PERCENT=10
JOB_EXPIRY_MINUTES=30
CLAIM_WINDOW_MINUTES=10
CLAIM_DEPOSIT_SATS=2
L402_HMAC_SECRET=                           # any 32+ char random string
DEMO_FREE_JOBS=true                         # set false on demo day with funded wallets
```

**`DEMO_FREE_JOBS=true`** — when set, `/api/demo/post-job` and `/api/demo/run-l402`
bypass real Lightning payments: jobs are written directly to the in-memory store.
No MDK daemons required. Flip to `false` (or remove) when doing the real money demo.

### Quick start (no wallets needed — DEMO_FREE_JOBS=true)

```powershell
# 1. Copy env template
Copy-Item agentmarket\.env.local.example agentmarket\.env.local

# 2. Start Next.js
cd agentmarket
npm install   # first time only
npm run dev   # → http://localhost:3000

# 3. Post a job via browser → http://localhost:3000/marketplace
#    Or test the L402 trace → http://localhost:3000/try
```

Both UI flows work without wallets in `DEMO_FREE_JOBS=true` mode.

### Full smoke tests (real wallets, demo day)

```powershell
# server up?
curl http://localhost:3000/api/jobs
curl http://localhost:3000/api/stats
curl.exe -N http://localhost:3000/api/events    # holds open, emits pings (use curl.exe in PowerShell)

# wallets up?
curl http://localhost:3456/balance
curl http://localhost:3457/balance

# end-to-end sats movement (Phase 1 test)
node scripts/test-payment.js                    # cross-wallet, verifies real money

# demo endpoint smoke (real L402, DEMO_FREE_JOBS=false)
curl -X POST http://localhost:3000/api/demo/run-l402 `
  -H "Content-Type: application/json" `
  -d '{"title":"test","description":"summarize bitcoin","reward_sats":5}'
```

If any of those fail, do not write code — fix the environment first.

> **PowerShell note:** `curl` in PowerShell is an alias for `Invoke-WebRequest`.
> Use `curl.exe` for the real curl binary, especially for SSE (`-N` flag).

---

## 8. Theme + font situation (deferred decision)

The mockup uses **Inter + JetBrains Mono** and the **slate/blue/amber**
palette. Earlier in the strategy chat we drafted an "editorial" re-theme
(cream `#FAF8F5`, deep navy `#0A1628`, electric blue accents, Instrument
Serif headlines + Geist body + Geist Mono numbers). v0 ignored it on the
re-export and we shipped the original to keep momentum.

**This is a 30-minute standalone task** done locally — no v0 round-trip:

1. Edit `app/globals.css`: swap the `.dark` block colors.
2. Edit `app/layout.tsx`: swap the `next/font/google` imports for
   `Instrument_Serif` and `Geist` / `Geist_Mono`.
3. Edit `JobCard.tsx` — it has hardcoded hex like `bg-[#1E293B]` instead of
   token classes. Migrate to `bg-card` etc. so future theme swaps are
   one-file.

Don't conflate this with 5b. Get money flowing through the UI first.

---

## 9. File ownership matrix

> Cross-reference `.cursor/rules/agentmarket-context.mdc` for the canonical version.

**Sacred (do not touch unless you have a server reason):**

- `lib/lightning.ts` — only place `@moneydevkit/*` is imported
- `lib/store.ts` — only place that mutates the in-memory store
- `lib/feed.ts` — only place that broadcasts SSE events
- `lib/types.ts` — shared types
- `app/api/**` — all route handlers
- `next.config.mjs` — wraps with `withMdkCheckout`
- `.env.local` — your secrets
- `scripts/test-payment.js`

**Frontend territory (5b will be here):**

- `app/page.tsx`, `app/marketplace/page.tsx`, `app/try/page.tsx`
- `app/layout.tsx`, `app/globals.css`
- `components/**`, `hooks/**`, `lib/utils.ts` (shadcn cn helper, not server)

**Phase 6 territory:**

- `agents/requester.js`, `agents/worker.js`

---

## 10. Quick command cheat-sheet

```powershell
# Dev loop
cd agentmarket && npm run dev

# Build verification (after any non-trivial change)
cd agentmarket && npm run build

# Full smoke (server + wallets)
node scripts/test-payment.js
curl http://localhost:3000/api/jobs
curl http://localhost:3000/api/stats

# MDK daemon control
npx @moneydevkit/agent-wallet@latest balance        # CLI uses default wallet
npx @moneydevkit/agent-wallet@latest start --daemon --port 3456    # start
# (no clean stop command — kill by PID or close the shell that owns the process)
```

---

## 11. Copy-paste opener for your strategy chat (Opus 4.7)

```
I'm picking up AgentMarket from a teammate. Phase 5a (UI migration) just
finished. I need to start Phase 5b.

Read .cursor/rules/agentmarket-context.mdc — that's the auto-loaded ground
truth. Read agentmarket/HANDOFF.md — that's the operational status of the
project including the 5a fix log.

Then verify Phase 5a is actually green:
  cd agentmarket && npm run build

If green, generate the Phase 5b prompt for my Sonnet 4.6 build chat. Use
the format you've used for previous phase prompts: scope, locked decisions,
sequence of steps, success criteria, first action, Karpathy guardrails.

If anything in HANDOFF.md or the rule contradicts what you find on disk,
flag it before writing the prompt.
```

## Copy-paste opener for your build chat (Sonnet 4.6)

```
You're the build chat for AgentMarket. The strategy chat (Opus) holds full
context and just generated this prompt for you. Read
.cursor/rules/agentmarket-context.mdc first — it auto-loads, so you should
already have it. Read agentmarket/HANDOFF.md for the current operational
state, including the Phase 5a fix log that changed component prop
signatures.

Karpathy guidelines apply: state assumptions before coding, surgical edits,
minimum code, goal-driven verification with binary success criteria, no
`any`, no narrating comments.

The Phase 5b prompt follows below. Execute it. Report results in the same
binary T1/T2/... format previous phases used.

---
[paste the prompt the strategy chat generated]
```

---

## 12. External ecosystem references (Spiral Discord, 25 Apr eve)

Useful context from the public `#earn-in-the-agent-economy` channel. Not
required for the build, but valuable for the pitch + ops:

**Reference L402 projects (study before filming the demo):**

- [origram.xyz](https://origram.xyz/) — agents pay sats via L402 to post +
  tip images. Built on MDK by matbalez (Spiral PM). 5 minutes clicking
  through it shows you "real" L402 UX from the client side — informs the
  `/try` page polish.
- [clank.money](https://clank.money/) — agents register human-readable
  Bitcoin addresses (`name@clank.money`) by paying ₿999 via L402. Same
  stack as us.

**Demo framing gift (use this in the pitch):**

- matbalez's hook is _"what will agents need to pay for once they're
  unleashed en masse to get stuff done for us?"_
- His own examples cover **content** (origram), **identity** (clank), and
  **physical goods** ([unhuman.coffee](https://unhuman.coffee/),
  [unhumans.shopping](https://unhumans.shopping/),
  [unhuman.design](https://unhuman.design/)).
- AgentMarket is one rung up: agents paying agents **for work**.
  Higher-order use case. Lead with this in the pitch.

**Discovery / directory:**

- [402index.io](https://402index.io/) — protocol-agnostic directory of
  paid APIs (L402 / x402 / MPP). 20K+ endpoints. Submit AgentMarket
  here post-hack — closing slide material.

**MDK humans (for live help during the build):**

- `@Nick Slaney`, `@sbddesign` (Stephen Delorme), `@Martin Saposnic` —
  MDK team. Will unblock you on Discord.
- `@moneyball` — runs the Spiral funding form.

**Funding ops (important):**

- The official sat-funding [Google form](https://docs.google.com/forms/d/e/1FAIpQLScNPJqZoc9rwVlApIemLsaJCh87QhNi8Xqk7ijOeLp_BNrqiA/viewform)
  is congested — multiple teams reported 3h+ waits.
- If a wallet runs dry during the demo, **DM Nick or Stephen directly
  with a Lightning invoice** — they're sending 1k sats inline in the
  channel. Other contestants are also exchanging sats casually in
  `#earn-in-the-agent-economy`. Don't get blocked on the form.

**MDK MCP (informational, NOT used by us):**

- `claude mcp add moneydevkit --transport http https://mcp.moneydevkit.com/mcp/account/`
- `codex mcp add moneydevkit --url https://mcp.moneydevkit.com/mcp/account/`
- This MCP is **build-time** tooling (lets your editor-agent scaffold MDK
  code). Our **runtime** agents (Phase 6 `requester.js` / `worker.js`)
  hit the agent-wallet daemon HTTP API directly. Listed only so you
  don't accidentally re-discover it as if it were required.

---

## 13. What else to share with teammates (besides this file)

**Definitely share:**

- This file (`agentmarket/HANDOFF.md`) — the operational handoff.
- `.cursor/rules/agentmarket-context.mdc` — auto-loads in the workspace,
  but if a teammate clones to a different folder structure, they may need
  to copy it manually.
- `.cursor/rules/karpathy-guidelines.mdc` — same reasoning.
- `.cursorrules` (workspace root) — same reasoning.
- The repo (obviously). Make sure they can `npm install` cleanly.
- Any **MDK wallet seed phrases** you've already funded — if the demo
  account state matters. Send via Signal / 1Password / similar. **NEVER in
  chat or commit history.**

**Share via secure channel only (not in chat or git):**

- `ANTHROPIC_API_KEY`
- `TAVILY_API_KEY`
- `L402_HMAC_SECRET` (any 32+ char random string is fine — but it must be
  the same across teammates if they're sharing wallet/server state)
- MDK wallet seeds (only if they need to pay from the same balance)

**Optional:**

- The Phase 1–5a chat transcripts (`C:\Users\Rehan\.cursor\projects\
c-Users-Rehan-Desktop-web-dev-hacknation\agent-transcripts\`) — they're
  the audit trail of every decision. Most teammates won't need them; this
  file should be enough.
- The original v0.dev project link if they want to re-export with the
  editorial theme (see §8).

**Don't bother sharing:**

- `node_modules/` (npm install handles it)
- `pnpm-lock.yaml` from `ui-mockup/` (we use npm in `agentmarket/`)
- The `ui-mockup/` folder itself — it's already in the repo as a backup
  reference. Teammates can read it but shouldn't edit.

---

## 14. If something feels off

The persistent rule + this file are designed to keep everyone aligned.
But if you notice:

- The build chat asking the same clarifying question twice → update the
  rule so the answer is auto-loaded next time.
- A "locked" decision that no longer fits → bring it to the strategy chat,
  amend the rule, log the migration in `Tech debt log` at the bottom of
  the rule.
- This HANDOFF.md going stale (e.g. you finished 5b but the file still says
  5a is current) → 30-second update at end of phase, otherwise the next
  teammate inherits a lie.

Move fast, but keep ground truth honest. That's how we hit demo time
without a 4am surprise.
