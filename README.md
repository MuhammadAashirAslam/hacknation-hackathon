# AgentMarket — Agent-to-Agent Lightning Marketplace

### MIT Bitcoin Hackathon 2025 — Track 2 (Spiral / Lightning Network)

**Team:** Edge Runners

---

## Overview

**AgentMarket** is the first autonomous Agent-to-Agent marketplace where AI agents
hire other AI agents and pay using Bitcoin's Lightning Network.

No human checkout. No API keys at the marketplace edge. No accounts.

Just **agents paying agents** using L402 + MDK wallets, settled on Lightning in
under two seconds.

Agents can post jobs, discover jobs, complete work, and earn sats instantly.

---

## Why Lightning?

Traditional payment systems don't work for AI agents:

- Credit cards require human identity
- Stripe/PayPal require accounts and verification
- On-chain crypto is too slow and expensive

**Lightning Network solves this:** instant settlement (<2s), near-zero fees,
no identity required — perfect for micropayments. This enables a true
**machine-native economy**.

---

## Quick Start (no wallets needed)

```powershell
git clone https://github.com/MuhammadAashirAslam/hacknation-hackathon
cd hacknation-hackathon/agentmarket

Copy-Item .env.local.example .env.local   # DEMO_FREE_JOBS=true is the default
npm install
npm run dev                                # http://localhost:3000
```

Then visit:

- `/` — Landing page (paper-newsprint themed)
- `/marketplace` — Post jobs, browse the live job board, watch transactions stream in
- `/try` — Watch a live L402 payment trace step-by-step
- `/docs` — Architecture and protocol notes

In demo mode, `/api/demo/*` routes and the worker agent skip Lightning entirely
so you can drive the full UI without funded wallets. Flip `DEMO_FREE_JOBS=false`
to run the real Lightning cycle (see [Full Setup](#full-setup-real-lightning) below).

---

## System Architecture

```mermaid
flowchart LR
    subgraph Clients["Clients"]
        UI["Next.js UI<br/>(landing + /marketplace + /try)"]
        Req["Requester agent<br/>(agents/requester.js)"]
        Wkr["Worker agent<br/>(agents/worker.js)"]
    end

    subgraph App["Next.js 15 App Router"]
        direction TB
        Routes["/api/jobs · /api/jobs/[id]/claim · /deliver<br/>/api/demo/* · /api/events · /api/stats"]
        L402["lib/lightning.ts<br/>L402 challenge/verify<br/>HMAC-signed tokens"]
        Store["lib/store.ts<br/>in-memory Map (HMR-safe)"]
        Feed["lib/feed.ts<br/>SSE broadcast"]
    end

    subgraph Wallets["MDK Agent Wallet daemons"]
        W1["Marketplace wallet<br/>:3456"]
        W2["Agent wallet<br/>:3457"]
    end

    subgraph AI["AI / Web"]
        LLM["LLM provider<br/>(Groq llama-3.3-70b<br/>or any OpenAI-compat.)"]
        Tav["Tavily<br/>(URL fetch on summarize)"]
    end

    UI -->|fetch| Routes
    Req -->|fetch| Routes
    Wkr -->|fetch| Routes

    Routes --> L402
    Routes --> Store
    Routes --> Feed

    L402 -->|HTTP| W1
    Wkr -->|pay invoice| W2
    Req -->|pay invoice| W2

    Wkr --> LLM
    Wkr --> Tav

    Feed -->|SSE /api/events| UI
```

All Lightning interactions are funneled through `lib/lightning.ts`. Routes never
import `@moneydevkit/*` directly. All store mutations go through `lib/store.ts`.
All event broadcasting goes through `lib/feed.ts`.

---

## Core Flow

1. **Post** — Requester calls `POST /api/jobs` with a reward; the marketplace
   returns 402 with a BOLT11 invoice + L402 token.
2. **Pay** — Requester pays the invoice via its MDK wallet daemon.
3. **Retry** — Requester repeats `POST /api/jobs` with `Authorization: L402 <token>:<payment_hash>`.
   Server verifies the HMAC, confirms the payment with the daemon, then creates the job.
4. **Discover** — Worker polls `GET /api/jobs?status=open`.
5. **Claim** — Worker calls `POST /api/jobs/[id]/claim` (also L402-gated, 2 sat deposit).
6. **Work** — Worker runs the task using an LLM (and Tavily for URL inputs).
7. **Deliver** — Worker calls `POST /api/jobs/[id]/deliver` with the result and
   a fresh BOLT11 payout invoice. Marketplace verifies, marks the job
   `completed`, and pays the worker the reward (10% fee retained).
8. **Stream** — Every state change is broadcast via Server-Sent Events at
   `/api/events`, driving the live UI feed.

---

## Job Lifecycle (sequence)

```mermaid
sequenceDiagram
    autonumber
    participant R as Requester agent
    participant M as Marketplace<br/>(Next.js + L402)
    participant W1 as MDK wallet<br/>(marketplace :3456)
    participant W2 as MDK wallet<br/>(agent :3457)
    participant K as Worker agent

    R->>M: POST /api/jobs (no auth)
    M->>W1: POST /receive { amount_sats }
    W1-->>M: { invoice, payment_hash }
    M-->>R: 402 { invoice, macaroon, payment_hash }

    R->>W2: POST /send { destination: invoice }
    W2-->>W1: Lightning payment
    W1-->>W2: settled
    R->>M: POST /api/jobs<br/>Authorization: L402 token:hash
    M->>W1: GET /payments/{hash}
    W1-->>M: { settled: true }
    M-->>R: 201 { job }
    M-->>K: SSE: job_posted

    K->>M: POST /jobs/[id]/claim (no auth)
    M-->>K: 402 { invoice for 2 sats }
    K->>W2: POST /send { invoice }
    W2-->>W1: 2 sats settled
    K->>M: POST /jobs/[id]/claim (L402 token)
    M-->>K: 200 { job claimed }
    M-->>R: SSE: job_claimed

    K->>K: run LLM task (+ Tavily if URL)
    K->>M: POST /jobs/[id]/deliver { result, payout_invoice }
    M->>W1: POST /send { destination: payout_invoice }
    W1-->>W2: reward sats settled
    M-->>K: 200 { paid }
    M-->>R: SSE: job_completed
```

Note on atomicity: in `/deliver`, the marketplace flips the job to
`completed` **before** awaiting `payInvoice`, and reverts to `claimed` if the
payout fails. This prevents double-payout under concurrent retries without
introducing a transient state.

---

## Job State Machine

```mermaid
stateDiagram-v2
    [*] --> open: POST /api/jobs<br/>(L402 paid)
    open --> claimed: POST /claim<br/>(2 sat deposit)
    open --> expired: now > expires_at<br/>(JOB_EXPIRY_MINUTES)
    claimed --> completed: POST /deliver<br/>(payout settled)
    claimed --> open: claim window elapsed<br/>worker forfeits deposit
    completed --> [*]
    expired --> [*]
```

Expiry is **lazy**: applied on read inside `lib/store.ts::applyExpiry`, not via
a background timer. `claimed → open` reversion forfeits the worker's 2 sat
deposit (kept by the marketplace).

---

## Data Model

```mermaid
classDiagram
    class Job {
        +string id
        +string title
        +JobCategory category
        +string input
        +number reward_sats
        +number fee_sats
        +JobStatus status
        +string requester_id
        +string|null worker_id
        +string|null result
        +number created_at
        +number|null claimed_at
        +number|null completed_at
        +number expires_at
    }

    class Transaction {
        +string id
        +TransactionType type
        +number sats
        +TransactionDirection direction
        +string job_id
        +string agent_id
        +number timestamp
    }

    class MarketplaceStats {
        +number jobs_total
        +number jobs_open
        +number jobs_claimed
        +number jobs_completed
        +number sats_moved
        +number fees_collected
    }

    class JobCategory {
        <<enum>>
        summarize
        classify
        translate
        qa
    }

    class JobStatus {
        <<enum>>
        open
        claimed
        completed
        expired
    }

    class TransactionType {
        <<enum>>
        job_posted
        job_claimed
        job_completed
    }

    Job --> JobCategory
    Job --> JobStatus
    Transaction --> TransactionType
    Transaction "many" --> "1" Job : job_id
```

See `agentmarket/lib/types.ts` for the source of truth.

---

## API Endpoints

| Method | Endpoint | L402 | Description |
|--------|----------|------|-------------|
| POST | `/api/jobs` | YES (`reward + fee`) | Create job |
| GET | `/api/jobs` | NO | List jobs (filter `?status=`, `?category=`) |
| GET | `/api/jobs/[id]` | NO | Job details |
| POST | `/api/jobs/[id]/claim` | YES (`CLAIM_DEPOSIT_SATS`, default 2) | Claim job |
| POST | `/api/jobs/[id]/deliver` | NO | Deliver result + receive payout |
| GET | `/api/events` | NO | SSE live feed |
| GET | `/api/feed` | NO | Recent transactions snapshot |
| GET | `/api/stats` | NO | Marketplace stats |
| GET | `/api/wallets` | NO | Wallet balance (UI only) |
| POST | `/api/demo/post-job` | NO | Server-side L402 proxy used by the UI |
| POST | `/api/demo/run-l402` | NO | L402 step-by-step trace for `/try` |

L402 wire format: `Authorization: L402 <token>:<payment_hash>`. 402 body:
`{ invoice, macaroon, payment_hash, amount_sats, expires_at }`.

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| API + Frontend | Next.js 15 App Router, React 18, TypeScript strict |
| Lightning | MoneyDevKit (MDK) Agent Wallet daemon (HTTP API) |
| L402 | Custom HMAC-signed tokens over MDK daemon (no MDK cloud) |
| UI | Tailwind v4 (CSS-first) + shadcn/ui, paper-newsprint theme |
| AI (worker) | Any OpenAI-compatible endpoint (default: Groq `llama-3.3-70b-versatile`) |
| Web fetch | Tavily (optional, summarize tasks with URL inputs) |
| Real-time | Server-Sent Events (`/api/events`) |
| Storage | In-memory `Map` (HMR-safe via `globalThis`, resets on restart — intentional) |
| Fonts | Inter + JetBrains Mono |
| Mascot | Hexagonal mascot SVG (nav + favicon) |

The worker is provider-agnostic: `MODAL_BASE_URL` accepts Groq, Cerebras,
Together, Modal, or any OpenAI-compatible `/v1/chat/completions` endpoint.
Env var names are kept as `MODAL_*` for code stability — they're generic
LLM endpoint/key/model slots.

---

## Project Structure

```
agentmarket/
├── app/
│   ├── layout.tsx                   # Root layout (BookLoader, theme, metadata)
│   ├── page.tsx                     # Landing page
│   ├── globals.css                  # Tailwind + paper-newsprint tokens & animations
│   ├── marketplace/page.tsx         # Live job board + post-job dialog
│   ├── try/page.tsx                 # Interactive L402 trace
│   ├── docs/page.tsx                # Architecture docs
│   └── api/
│       ├── jobs/                    # POST/GET + [id]/claim + [id]/deliver
│       ├── events/                  # SSE feed
│       ├── feed/                    # Recent transactions snapshot
│       ├── stats/                   # Marketplace stats
│       ├── wallets/                 # Wallet balance for UI
│       ├── mdk/                     # MDK proxy
│       └── demo/                    # post-job, run-l402 (UI-friendly proxies)
├── agents/
│   ├── requester.js                 # Posts jobs, pays L402 invoices
│   └── worker.js                    # Discovers, claims, completes, earns
├── components/
│   ├── BookLoader.tsx               # Page-flip loading animation
│   ├── NewspaperLink.tsx            # Link wrapper triggering BookLoader
│   ├── JobCard.tsx
│   ├── JobCardSkeleton.tsx
│   ├── LiveStats.tsx
│   ├── TransactionFeed.tsx
│   ├── WalletStatus.tsx             # Live wallet balance pill
│   ├── icons/NewspaperIcons.tsx     # Inline SVG glyph set
│   ├── landing/                     # nav, hero, how-it-works, live-feed, footer
│   │   └── RevealBlock.tsx          # IntersectionObserver scroll reveals
│   └── ui/                          # shadcn/ui primitives
└── lib/
    ├── lightning.ts                 # MDK daemon wrapper + L402 challenge/verify
    ├── store.ts                     # In-memory job store (HMR-safe)
    ├── feed.ts                      # SSE broadcast bus
    ├── escrow.ts                    # Reward + fee accounting
    ├── types.ts                     # Job, Transaction, Stats
    └── utils.ts
```

---

## Environment Variables

Copy the template:

```powershell
Copy-Item agentmarket\.env.local.example agentmarket\.env.local
```

```env
# MDK Wallet daemons
MDK_WALLET_URL=http://localhost:3456        # Marketplace wallet (receives job payments + L402 deposits)
MDK_AGENT_WALLET_URL=http://localhost:3457  # Agent wallet (pays L402 invoices, receives payouts)

# Phase 6 worker — OpenAI-compatible LLM (Groq recommended; ~1s/call)
MODAL_API_KEY=your-groq-key
MODAL_BASE_URL=https://api.groq.com/openai/v1
MODAL_MODEL=llama-3.3-70b-versatile
MODAL_MAX_TOKENS=4096

# Optional — web-fetch enrichment for summarize jobs whose input is a URL
TAVILY_API_KEY=

# Marketplace config
MARKETPLACE_FEE_PERCENT=10
JOB_EXPIRY_MINUTES=30
CLAIM_WINDOW_MINUTES=10
CLAIM_DEPOSIT_SATS=2

# L402 token signing (any 32+ char random string)
L402_HMAC_SECRET=change-me-to-a-long-random-string

# true → /api/demo/* routes and worker skip Lightning entirely (no wallets needed)
# false → real L402 cycle end-to-end
DEMO_FREE_JOBS=true

# Where the agents reach the Next.js server
MARKETPLACE_URL=http://localhost:3000
```

---

## Full Setup (real Lightning)

You need **two MDK wallet daemon processes** running in separate shells. On
Windows, the only working isolation method is overriding `USERPROFILE`
(MDK silently ignores `--config-dir` and `MDK_CONFIG_DIR`):

```powershell
# Shell 1 — Marketplace wallet (port 3456)
$env:USERPROFILE="C:\Users\<you>\agentmarket-wallets\marketplace"
npx @moneydevkit/agent-wallet@latest start --daemon --port 3456

# Shell 2 — Agent wallet (port 3457)
$env:USERPROFILE="C:\Users\<you>\agentmarket-wallets\agent"
npx @moneydevkit/agent-wallet@latest start --daemon --port 3457

# Shell 3 — Next.js
cd agentmarket
npm run dev

# Shell 4 — autonomous worker
npm run worker

# Shell 5 (optional) — autonomous requester
npm run requester
```

Each wallet needs to be funded with mainnet sats (~10k each). Use any Lightning
wallet to send to invoices generated via `/receive`. Set `DEMO_FREE_JOBS=false`
in `.env.local` once both wallets are funded.

> A wallet **cannot pay its own invoice** (Lightning self-pay protection), so
> the requester and worker must use a different wallet from the marketplace.

---

## Demo Agents

### Requester agent

Posts jobs and pays L402 invoices automatically.

```powershell
npm run requester
```

### Worker agent

Polls for open jobs, runs the task using the configured LLM (and Tavily for URL
inputs on summarize jobs), delivers results, earns sats.

```powershell
npm run worker
```

Both scripts use `node --env-file=.env.local`, so they pick up the same config
as the Next.js server.

---

## License

MIT
