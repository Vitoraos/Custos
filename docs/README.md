# ContextForge — Persistent-Memory Agentic MCP Server for Alexa+

> A self-hosted [Model Context Protocol](https://modelcontextprotocol.io) server that gives Alexa+ the two
> capabilities it critically lacks: **persistent memory** and **multi-step agentic workflow orchestration**.
> Built for the Amazon **Build, Ship, Shape Hackathon** (Alexa+ Track + AWS Builder Mini Challenge).
> **Total infrastructure cost: $0.00/month. No payment method required.**

- MCP spec `2025-11-25` · Streamable HTTP (`POST /mcp`) · stateless mode
- 6 MCP tools · Plan → Execute → Verify pipeline (2 LLM calls per workflow)
- Free-tier stack: FastMCP · Strands Agents SDK · Groq / Cloudflare Workers AI / Gemini / OpenRouter ·
  Supabase PostgreSQL · Render · Cloudflare (keep-alive + tunnel + static demo)
- Deterministic demo replay: zero LLM calls while recording, so rate limits and cold starts can never ruin a take

---

## Table of contents

1. [The problem](#1-the-problem)
2. [The solution](#2-the-solution)
3. [Demo (2:45)](#3-demo-245)
4. [Architecture at a glance](#4-architecture-at-a-glance)
5. [Prerequisites](#5-prerequisites)
6. [Quickstart (local)](#6-quickstart-local)
7. [Environment variables](#7-environment-variables)
8. [Database setup](#8-database-setup)
9. [Running the MCP server](#9-running-the-mcp-server)
10. [Testing with MCP Inspector](#10-testing-with-mcp-inspector)
11. [MCP tools](#11-mcp-tools)
12. [LLM budget and provider pool](#12-llm-budget-and-provider-pool)
13. [Deployment (Render + Cloudflare)](#13-deployment-render--cloudflare)
14. [Project structure](#14-project-structure)
15. [Testing](#15-testing)
16. [Recording the demo video](#16-recording-the-demo-video)
17. [Submission checklist mapping](#17-submission-checklist-mapping)
18. [Troubleshooting](#18-troubleshooting)
19. [Friction log](#19-friction-log)
20. [License](#20-license)
21. [Sources and acknowledgments](#21-sources-and-acknowledgments)

---

## 1. The problem

Research across Wirecutter, Hacker News, PCMag, Amazon Forums, and leaked internal Amazon testing reports
surfaced the same top Alexa+ complaints again and again:

| # | Complaint | What the user experiences |
|---|-----------|---------------------------|
| 1 | **No persistent memory** | Alexa+ forgets dietary restrictions, music tastes, and personal instructions across sessions |
| 2 | **No multi-turn context** | Every interaction is stateless; it cannot chain steps or reference prior conversation |
| 3 | **Regressions vs. classic Alexa** | Routines, alarms, and music playback that used to work now break |
| 4 | **Excessive verbosity** | Unwanted commentary, jokes, and upselling interrupt every interaction |

The demo makes this visceral: say *"I'm vegan, plan dinner for 4"* and simulated Alexa+ suggests
a juicy steak — then grilled chicken when corrected. Ask what it remembers from yesterday: *"I don't have
any stored preferences."* Ask for a 4-step morning routine: it does step one and asks *"What else would
you like?"*

## 2. The solution

ContextForge is an MCP server that Alexa+ connects to as a tool source. It provides:

- **Persistent preference storage** — Supabase-backed, survives across sessions (`store_preference`,
  `get_preferences`)
- **Conversation context memory** — natural-language context with priority and TTL expiry (`store_context`,
  `get_context`, including `kind: 'instruction'` for standing rules)
- **Agentic multi-step execution** — a Strands-powered planner breaks tasks into steps, a deterministic
  TypeScript executor runs them with retries, and a rule check + Strands verifier confirms completion
  (`execute_workflow`)
- **Full-profile recall** — one call returns preferences, instructions, context, and recent tasks
  (`get_memory_summary`)
- **Pooled free LLM access** — Groq → Cloudflare Workers AI → Gemini → OpenRouter with automatic fallback,
  so no single free-tier quota can block development

**Why it wins:** it matches *both* "creative" examples in the official rules — *"agentic workflow that
autonomously orchestrates across services"* **and** *"context-aware add-on that maintains state across
sessions"* — and it uses the Strands SDK at runtime plus Kiro during development for the AWS Builder
Mini Challenge.

## 3. Demo (2:45)

The simulator at `demo/public/index.html` replays `demo-fixtures.json` **entirely in the browser** —
no backend, no LLM, no network flakiness.

| Time | Scene | What the judges see |
|------|-------|---------------------|
| 0:00–0:15 | Title card | "Alexa+ can't remember you. We built ContextForge to fix that." |
| 0:15–0:45 | F1, F2, F3 | Without ContextForge: ignored preference, zero recall, 1 of 4 steps (with the *"simulated behavior"* caption) |
| 0:45–1:15 | S1, S2 | With ContextForge: vegan stored + Pasta Primavera planned; follow-up "Yes" just works via remembered context |
| 1:15–1:40 | S3 | Next day, fresh session: full recall |
| 1:40–2:00 | S4 | One sentence → 4 tools → verified morning routine |
| 2:00–2:30 | Architecture + R1 | Planner/Executor/Verifier; verifier rejects a non-vegan recipe and forces a retry |
| 2:30–2:45 | End card | "ContextForge gives Alexa+ the memory it's missing." + repo link |

Optional resilience scenes R1 (verifier catches violation) and R2 (503 + 429 with silent retry) are included
in the fixtures. Serve locally with `npm run demo` (or any static server) and open
`http://localhost:3001` — append `?speed=2` for faster retakes.

## 4. Architecture at a glance

```
Voice → Alexa+ → POST https://<render-app>.onrender.com/mcp  (Streamable HTTP)
                        │
              ┌─────────▼──────────┐
              │  FastMCP (6 tools) │
              └─────────┬──────────┘
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
   Supabase          Agent           Tool registry
   (memory)     Plan→Exec→Verify    (7 executor tools)
```

A full walkthrough with the vegan-dinner example, the data model, and every v2 design decision is in
[`ARCHITECTURE.md`](./ARCHITECTURE.md). Tool-by-tool API reference is in [`API.md`](./API.md).

## 5. Prerequisites

All free, none require a payment method:

| # | Action | Time | Notes |
|---|--------|------|-------|
| 1 | OpenRouter API key (`sk-or-…`) | 5 min | Last-resort fallback; see §12 |
| 2 | Groq API key | 5 min | Primary planner/verifier provider |
| 3 | Cloudflare account + API token (Workers AI) + account ID | 10 min | Extra quota + keep-alive cron + tunnel |
| 4 | Gemini API key (AI Studio) | 5 min | Check current free models in AI Studio |
| 5 | Supabase project (URL + `service_role` key) | 5 min | 500 MB free PostgreSQL |
| 6 | Render account | 5 min | 750 free instance hours/month |
| 7 | Node.js **22.19+** (`node -v`) | 5 min | Required by MCP Inspector and Strands TS |

> **Quota warning:** OpenRouter `:free` models allow ~20 req/min and **50 req/day**
> (1,000/day after a one-time $10 purchase; failed requests count). Treat OpenRouter as the *last*
> fallback — see §12.

## 6. Quickstart (local)

```bash
git clone https://github.com/<you>/contextforge.git
cd contextforge
npm install
cp .env.example .env   # fill in keys (deferred to deploy is fine for DEMO-only work)
```

Then set up the database (§8), then:

```bash
npm run dev    # MCP server on http://localhost:3000/mcp
npm run demo   # replay page on http://localhost:3001  (append ?speed=2 for retakes)
```

Things that work **without any API keys**: `npm run demo`, the full fixture replay, `tsc`, and every
`DEMO_MODE=true` tool/workflow test. You only need keys for live LLM planning and live Supabase access.

## 7. Environment variables

| Variable | Required for | Default |
|----------|--------------|---------|
| `GROQ_API_KEY` / `GROQ_MODEL` | Live planning (primary) | `openai/gpt-oss-120b` |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` / `CF_MODEL` | Live planning (fallback 1) | `@cf/openai/gpt-oss-120b` — verify with `npx wrangler ai models list` |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Live planning (fallback 2) | `gemini-2.5-flash` — verify in AI Studio |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | Live planning (last resort) | `openrouter/free` |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | All memory tools (server-side only — never ship to browsers) | — |
| `PORT` | Server bind (Render injects it; code uses `process.env.PORT ?? 3000`) | `3000` |
| `MCP_TRANSPORT_TYPE` / `MCP_STATELESS` | Informational (server is `httpStream` + stateless by construction) | `http-stream` / `true` |
| `DEMO_MODE` | `true` = tools return fixture data (repeatable recordings/tests) | `false` |
| `CHAOS` | Comma list: `bad_recipe`, `shopping_503` (R1/R2 failure injection, fires once each) | empty |

## 8. Database setup

In the Supabase SQL Editor, run **in this order**:

1. `infra/schema.sql` — creates `preferences`, `conversation_context` (with generated `priority_rank`
   so high > medium > low sorts correctly), `workflow_executions` (indexed on `started_at`, *not* the
   non-existent `created_at` from the v1 draft), and `user_instructions`, with RLS enabled
   (the `service_role` key used server-side bypasses RLS — no extra policies needed).
2. `infra/seed.sql` **Section A** — baseline demo state (5 preferences, 1 instruction, 1 context,
   1 past execution). Vegan is deliberately *not* seeded: scene S1 stores it live on camera.
3. `infra/seed.sql` **Section B** — only for retakes: jumps straight to the day-2 state
   (as if S1 + S2 already happened) for recording scene S3.

Each file ends with a `COUNT(*)` check — expect `preferences:5, context:1, executions:1, instructions:1`
after Section A.

## 9. Running the MCP server

```bash
npm run dev      # tsx src/index.ts — http://localhost:3000/mcp, health :3000/health
npm run build    # tsc → dist/
npm start        # node dist/index.js (what Render runs)
```

The server starts in **stateless Streamable HTTP** mode on `endpoint: '/mcp'` with a `/health` endpoint
(`ok`, 200) for Render health checks and the Cloudflare keep-alive cron. Tool calls arrive as
`POST /mcp` with `Accept: application/json, text/event-stream` (both values are required by the
Streamable HTTP transport — responses stream back as SSE `event: message` frames).

## 10. Testing with MCP Inspector

```bash
# Browser UI
npx @modelcontextprotocol/inspector node dist/index.js
# Scripted: list tools
npx @modelcontextprotocol/inspector --cli node dist/index.js --method tools/list
# No browser available
npx @modelcontextprotocol/inspector --tui node dist/index.js
```

`tools/list` must show all six tools with their input schemas. For `tools/call` against memory tools,
set `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` first; without them the server returns a clean
`Missing SUPABASE_URL (see .env.example)` error instead of crashing.

## 11. MCP tools

| Tool | Purpose | Needs |
|------|---------|-------|
| `store_preference` | Persist a preference (`diet`, `music`, `schedule`, `smart_home`, `personal`, `general`) | Supabase |
| `get_preferences` | Load profile, optional category filter; results are hard constraints | Supabase |
| `store_context` | Save context with priority/TTL; `kind: 'instruction'` writes a standing rule | Supabase |
| `get_context` | Load active context, priority-filtered, recency-sorted | Supabase |
| `execute_workflow` | Plan (LLM#1) → Execute (code) → rule-check → remediate → Verify (LLM#2); persists log + follow-up context | Supabase + LLM pool |
| `get_memory_summary` | "What do you remember about me?" — preferences + instructions + context + recent tasks | Supabase |

Signatures, constraints, and worked examples: [`API.md`](./API.md).

## 12. LLM budget and provider pool

Free quotas are the binding constraint on this build (re-check before relying on them — they change):

| Provider | Free allowance | Notes |
|----------|---------------|-------|
| Groq | 30 req/min, 1,000 req/day, 200K tokens/day (per model) | Primary. Token cap binds before request count |
| Cloudflare Workers AI | 10,000 neurons/day (shared, resets 00:00 UTC) | Model-dependent burn; models deprecate — run `wrangler ai models list` |
| Gemini API | Free tier on Flash models | Check AI Studio; free-tier content trains Google models |
| OpenRouter `:free` | 20 req/min, 50/day (1,000/day after $10 lifetime purchase) | Failed requests count; negative balance blocks free models |

Design rules that follow:

1. **Two LLM calls per workflow** (planner, verifier); the executor is plain code. One remediation = one extra verifier pass, no extra LLM call for the retry itself.
2. **Fallback order** Groq → Workers AI → Gemini → OpenRouter, rotating on 429/5xx. Per-request `usage{}`
   counts show which quota is burning.
3. **Recordings never touch LLMs**: `DEMO_MODE=true` + the static replay page.
4. **Budget math**: 2 calls × ~15 test runs/hour ≈ 30 calls/hour, spread over four providers — comfortable.

## 13. Deployment (Render + Cloudflare)

**Render** (free web service, auto-deploys from Git):

- Build: `npm install && npm run build` · Start: `npm start` · plan: free · `healthCheckPath: /health`
- Set all §7 secrets as env vars in the dashboard (or `infra/render.yaml` as code).
- Caveats: sleeps after 15 min idle (~1 min wake); ephemeral filesystem; ~744 of 750 monthly hours if
  kept permanently warm — run only one free service per workspace during judging.

**Cloudflare** (free plan, `infra/cloudflare/keepalive/`):

- **Cron keep-alive**: `*/10 * * * *` pings `/health` so judges never hit a cold start.
  Deploy with `npx wrangler deploy` from that folder; keep it running until judging ends.
- **Dev tunnel**: `cloudflared tunnel --url http://localhost:3000` gives localhost a public https URL
  for Alexa+ testing without deploying.
- **Demo hosting**: publish `demo/public` as static assets for a public replay URL in the submission.

## 14. Project structure

```
├── src/
│   ├── index.ts                 # entry — httpStream :PORT/mcp, stateless, /health
│   ├── server.ts                # FastMCP wiring + 6 tool registrations
│   ├── config.ts                # env accessors (lazy — imports never throw without keys)
│   ├── storage/supabase.ts      # 7 storage fns (incl. storeInstruction)
│   ├── agent/
│   │   ├── providers.ts         # Groq→WorkersAI→Gemini→OpenRouter + runWithFallback + usage{}
│   │   ├── workflow.ts          # Plan→Execute→Verify (Zod-validated, rule-check + remediation)
│   │   └── tools.ts             # 7 executor tools (weather/calendar/shopping/recipe/home/reminder/news)
│   └── tools/                   # 6 MCP tool defs (FastMCP {name, description, parameters, execute})
├── demo/public/                 # static replay: index.html, app.js, style.css, demo-fixtures.json
├── infra/
│   ├── schema.sql               # v2 schema (priority_rank, started_at index, RLS)
│   ├── seed.sql                 # §A baseline + §B day-2 retake state
│   ├── render.yaml              # Render IaC
│   └── cloudflare/keepalive/    # cron Worker (wrangler.toml + src/index.ts)
├── tests/                       # (Phase 9) tools/storage/workflow/integration
├── docs/
│   ├── README.md (this file) · ARCHITECTURE.md · API.md · FRICTION_LOG.md
│   ├── plans/plan.md            # master build plan with checkboxes
│   └── spec/                    # v1 (archived) + v2 (canonical)
├── tools/generate_v2_spec.py    # v1→v2 spec migration (already applied)
└── package.json · tsconfig.json · .env.example · LICENSE (MIT)
```

## 15. Testing

```bash
npx tsc --noEmit                                  # types (must exit 0)
npm run build                                     # dist/ emit (what Render runs)
DEMO_MODE=true npx tsx --test tests/*.test.ts     # deterministic, no keys needed
CHAOS=bad_recipe,shopping_503 DEMO_MODE=true ...  # R1/R2 paths
```

Verified so far: all 7 executor tools in DEMO mode; chaos fires once then heals (Chicken Alfredo →
Chickpea Curry; shopping 503 → success); rule-checker edge cases (peanut, bad JSON, error steps,
non-recipe tools — zero false positives); server boot + `/health` + `tools/list` (all 6 schemas) over
real Streamable HTTP; `dist/` build.

## 16. Recording the demo video

1. Run Section A seed (fresh baseline), `npm run demo`, open `?speed=1`.
2. Record F1–F3 (left panel), S1–S2, then S3 ("next day" — or run Section B and record S3 as a retake), S4.
3. Optionally record R1 (verifier retry) for the 2:00–2:30 technical segment.
4. Keep takes while `DEMO_MODE` replay is deterministic — no LLM or network in the loop.

## 17. Submission checklist mapping

- **Alexa+ Track**: MCP `2025-11-25` ✓ · Streamable HTTP ✓ · self-hosted server on Render ✓ ·
  FastMCP imported and serving at runtime ✓ · public GitHub repo + MIT license ✓ · setup instructions
  (this file) ✓ · <3 min video ✓ · product feedback (from `FRICTION_LOG.md`) ✓ · English ✓
- **AWS Builder Mini**: primary-track submission ✓ · Strands SDK used at runtime (planner + verifier agents) ✓ ·
  Kiro used in development ✓ · integrations documented in submission + `ARCHITECTURE.md` §decisions ✓
- **Bonuses**: `FRICTION_LOG.md` (10% friction-log bonus) ✓

## 18. Troubleshooting

| Symptom | Cause → fix |
|---------|-------------|
| `Missing SUPABASE_URL (see .env.example)` on tool calls | Env not set in this process → export vars or add `.env` (server boots fine without them by design) |
| `All LLM providers failed:` (empty) | No provider keys set → add at least one (§7) |
| OpenRouter `429` / daily cap hit | 50/day free cap → wait for UTC reset, add fallback keys, or the $10 lifetime top-up (→1,000/day) |
| `4002 Not Acceptable: must accept application/json and text/event-stream` | HTTP client missing the SSE Accept value → send `Accept: application/json, text/event-stream` |
| Render cold start (~1 min) during demo | Free tier slept → deploy the keep-alive cron (§13) and warm `/health` before recording |
| `npx serve` → `ERR_MODULE_NOT_FOUND eastasianwidth` | Corrupt npx cache (environmental) → clear npx cache or `npm i -D serve`; any static server works |
| `ERESOLVE zod` on install | Old lockfile/spec pins `zod@^3`, Strands 1.19 needs `^4` → use the committed `package-lock.json` |
| `z.record` type errors | Zod v4 requires `z.record(z.string(), value)` (two-arg) — already applied in `workflow.ts` |

## 19. Friction log

Every obstacle hit during this build — with workarounds, time lost, and upstream feedback — is recorded
in [`FRICTION_LOG.md`](./FRICTION_LOG.md). It doubles as the draft for the submission's "product feedback
for every tool/API/SDK used" section (and the 10% judging bonus).

## 20. License

MIT — see [`../LICENSE`](../LICENSE). Permissive, commercial-friendly, and instantly recognized by judges:
use it, fork it, ship it.

## 21. Sources and acknowledgments

- OpenRouter free-tier guide · OpenRouter rate limits (`/docs/api_reference/limits`)
- Groq / Cloudflare Workers AI / Gemini free-tier docs (re-verify quotas — they change often)
- FastMCP (`punkpeye/fastmcp`) · MCP TypeScript SDK · Streamable HTTP transport spec · MCP Inspector
- Strands Agents TS SDK (`strandsagents.com`) — OpenAI provider, `Agent`/`OpenAIModel` reference
- Supabase JS v2 (`upsert` + RLS/service_role) · Render free-tier + health-check docs ·
  Cloudflare Workers cron triggers + static assets
- Pain-point research: Wirecutter Alexa+ reviews, PCMag, Hacker News, Amazon Forums, OpenRouter/Stripe
  free-LLM comparisons (2026)
- Full spec history: `docs/spec/` (v1 archived, v2 canonical) and `tools/generate_v2_spec.py`
