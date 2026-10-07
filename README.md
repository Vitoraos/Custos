# ContextForge — Persistent-Memory Agentic MCP Server for Alexa+

> A self-hosted [Model Context Protocol](https://modelcontextprotocol.io) server that gives Alexa+ the two
> capabilities it critically lacks: **persistent memory** and **multi-step agentic workflow orchestration**.
> Built for the Amazon **Build, Ship, Shape Hackathon** (Alexa+ Track + AWS Builder Mini Challenge).
> **Total infrastructure cost: $0.00/month. No payment method required.**

At a glance: MCP spec `2025-11-25` over Streamable HTTP (`POST /mcp`, stateless mode), six MCP tools,
a Plan → Execute → Verify pipeline that spends just two LLM calls per workflow, and a stack of
FastMCP, the Strands Agents SDK, OpenRouter free models, Supabase PostgreSQL, and Render — all on free tiers. The demo
replays deterministically with zero LLM calls, so rate limits and cold starts can never ruin a take.

---

## Contents

1. [The problem](#1-the-problem)
2. [The solution](#2-the-solution)
3. [Architecture at a glance](#3-architecture-at-a-glance)
4. [Quickstart (local)](#4-quickstart-local)
5. [Database setup](#5-database-setup)
6. [Running the MCP server](#6-running-the-mcp-server)
7. [Testing with MCP Inspector](#7-testing-with-mcp-inspector)
8. [MCP tools](#8-mcp-tools)
9. [Deployment (Render · Vercel · Supabase + external keep-alive)](#9-deployment-render--vercel--supabase--external-keep-alive)
10. [Project structure](#10-project-structure)
11. [Testing](#11-testing)
12. [Submission checklist mapping](#12-submission-checklist-mapping)
13. [Troubleshooting](#13-troubleshooting)
14. [Friction log](#14-friction-log)
15. [License](#15-license)
16. [Sources and acknowledgments](#16-sources-and-acknowledgments)

---

## 1. The problem

Reading across Wirecutter, Hacker News, PCMag, Amazon Forums, and leaked internal Amazon testing reports,
the same Alexa+ complaints come up everywhere. First, it has no persistent memory — it forgets dietary
restrictions, music tastes, and personal instructions across sessions. Second, it has no multi-turn
context — every interaction is stateless, unable to chain steps or reference prior conversation. Third,
things that worked on classic Alexa (routines, alarms, music playback) now break. And fourth, it won't stop
talking — unwanted commentary, jokes, and upselling interrupt every interaction.

The demo makes this visceral. Say *"I'm vegan, plan dinner for 4"* and the simulated Alexa+ suggests a
juicy steak — then grilled chicken when you correct it. Ask what it remembers from yesterday: *"I don't have
any stored preferences."* Ask for a four-step morning routine and it does step one, then asks *"What else
would you like?"* The full story, with sources and the reasoning that ties all four complaints to one root
cause, lives in [`PROBLEM.md`](./PROBLEM.md).

## 2. The solution

ContextForge is an MCP server that Alexa+ connects to as a tool source. It stores your preferences in
Supabase so they survive across sessions (`store_preference`, `get_preferences`). It keeps conversation
context in natural language, with priorities and expiry times — including standing rules like *"keep answers
short"* that every future interaction must respect (`store_context`, `get_context`). When a request needs
several steps, a Strands-powered planner breaks it down, a deterministic TypeScript executor runs each step
with retries, a rule checker makes sure preferences weren't violated, and a Strands verifier confirms the
whole thing worked (`execute_workflow`). And when you ask *"what do you remember about me?"*, one call
assembles preferences, instructions, context, and recent tasks into an answer (`get_memory_summary`).

Why it wins: it matches *both* "creative" examples in the official rules — *"agentic workflow that
autonomously orchestrates across services"* **and** *"context-aware add-on that maintains state across
sessions."* The Strands SDK runs the planner and verifier agents at runtime, which is our AWS Builder
Mini Challenge qualifying technology.

## 3. Architecture at a glance

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

Voice goes in, a plan comes out, memory persists everything worth keeping. A full walkthrough with the
vegan-dinner example, the data model, and every design decision behind the v2 architecture is in
[`ARCHITECTURE.md`](./ARCHITECTURE.md), and the tool-by-tool API reference is in [`API.md`](./API.md).

## 4. Quickstart (local)

```bash
git clone https://github.com/Vitoraos/ContextForge.git
cd ContextForge
npm install
cp .env.example .env   # fill in keys (deferred to deploy is fine for DEMO-only work)
```

Then set up the database (§5), then:

```bash
npm run dev    # MCP server on http://localhost:3000/mcp
npm run demo   # replay page on http://localhost:3001 (append ?speed=2 for retakes)
```

The pleasant surprise of this stack: a lot works with **no API keys at all** — the replay page, the full
fixture set, the type checker, and every `DEMO_MODE=true` tool and workflow test. You only need real keys
for live LLM planning and live Supabase access.

## 5. Database setup

In the Supabase SQL Editor, run **in this order**:

1. `infra/schema.sql` — creates `preferences`, `conversation_context` (with a generated `priority_rank`
   so high genuinely sorts above medium above low), `workflow_executions` (indexed on `started_at` — the
   v1 draft pointed at a `created_at` column that never existed), and `user_instructions`, with row-level
   security enabled. The server uses the `service_role` key, which bypasses RLS, so no extra policies
   are needed.
2. `infra/seed.sql` **Section A** — the baseline demo state: five preferences, one instruction, one piece
   of context, one past execution. Vegan is deliberately *not* seeded, because scene S1 stores it live on
   camera.
3. `infra/seed.sql` **Section B** — retakes only. It jumps straight to the day-2 state, as if scenes S1 and
   S2 already happened, for recording scene S3.

Both files end with a `COUNT(*)` check. After Section A you should see
`preferences:5, context:1, executions:1, instructions:1`.

## 6. Running the MCP server

```bash
npm run dev      # tsx src/index.ts — http://localhost:3000/mcp, health :3000/health
npm run build    # tsc → dist/
npm start        # node dist/index.js (what Render runs)
```

The server starts in **stateless Streamable HTTP** mode on `endpoint: '/mcp'`, with a `/health` endpoint
answering `ok` with a 200 for Render health checks and the external keep-alive ping. One transport
gotcha worth knowing up front: tool calls arrive as `POST /mcp` with
`Accept: application/json, text/event-stream` — both values are required, and responses stream back as
SSE `event: message` frames. Miss the header and FastMCP answers `4002 Not Acceptable` before your code
ever runs.

## 7. Testing with MCP Inspector

```bash
# Browser UI
npx @modelcontextprotocol/inspector node dist/index.js
# Scripted: list tools
npx @modelcontextprotocol/inspector --cli node dist/index.js --method tools/list
# No browser available
npx @modelcontextprotocol/inspector --tui node dist/index.js
```

`tools/list` should show all six tools with their input schemas. Calling memory tools needs
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the environment; without them the server answers with
a clean `Missing SUPABASE_URL (see .env.example)` error instead of crashing — that graceful failure is
deliberate and tested.

## 8. MCP tools

Six tools, each doing exactly one job. `store_preference` persists things like diet, music taste, or wake
time by category, and `get_preferences` loads them back — treat what comes back as hard constraints, never
to be overridden unless the user says so. `store_context` saves conversation context with a priority and
an optional time-to-live, and passing `kind: 'instruction'` files it as a standing rule instead of a note.
`get_context` reloads the active context, highest priority and most recent first. `execute_workflow` is
where the agency lives: it loads memory, plans with the first LLM call, executes deterministically with
retries, checks the rules, verifies with the second LLM call, then writes the run back to memory.
`get_memory_summary` answers *"what do you remember about me?"* with preferences, instructions, context,
and recent tasks in one breath.

Every signature, constraint, and a worked example for each tool: [`API.md`](./API.md).

## 9. Deployment (Render · Vercel · Supabase + external keep-alive)

Two things ship independently: the **backend** (MCP server + database) and the **frontend** (static replay
page). Here is exactly what goes where:

| Piece | Folder to point at | Render | Vercel | Supabase |
|-------|--------------------|--------|--------|----------|
| Backend: MCP server | repo root (`npm run build` → `dist/`, start `npm start`) | ✅ Web Service (recommended) | ⚠️ possible, not recommended — see below | n/a (no compute) |
| Backend: database | `infra/schema.sql`, then `infra/seed.sql` | n/a | n/a | ✅ SQL Editor |
| Backend: keep-alive ping | no code — external cron (see below) | n/a (the thing being pinged) | n/a | n/a |
| Frontend: replay page | `demo/public/` | ✅ Static Site | ✅ Project (root = `demo/public`) | n/a |

### Backend → Render (recommended home for the MCP server)

Render is the only listed platform that runs our server as-is, because FastMCP's `httpStream` transport
expects a long-lived Node process, which is exactly what a Render Web Service is. Create it from the repo
root (it must see `package.json` and `src/`): build command `npm install && npm run build`, start command
`npm start`, free plan, health check path `/health`. Secrets go in the dashboard as environment variables
(or commit them as code in `infra/render.yaml`). Once live, the MCP endpoint is
`https://<your-app>.onrender.com/mcp`.

Three free-tier realities to plan around: the service sleeps after fifteen idle minutes and takes about a
minute to wake, its filesystem is ephemeral, and a permanently-warmed service consumes roughly 744 of your
750 monthly hours — so run exactly one free service in that workspace through judging.

### Backend → Supabase (the database — SQL files, not a deploy)

Supabase hosts no code here, only data. Open the SQL Editor on your project and run **in order**:
first the contents of `infra/schema.sql` (tables, indexes, RLS), then `infra/seed.sql` Section A
(baseline demo state; Section B is retakes only). Both files end with a `COUNT(*)` check — expect
`preferences:5, context:1, executions:1, instructions:1`. The server reaches the database over the network
using `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, so no Supabase-side deploy step exists; just make sure
those two values are set wherever the backend runs.

### Keep-alive: external ping (no code, no Cloudflare)

Render's free tier sleeps after fifteen idle minutes, so something must ping
`https://<your-app>.onrender.com/health` every ten minutes or judges eat a one-minute cold start. We do
this with a free [cron-job.org](https://cron-job.org) job rather than code: create the job, point it at
the `/health` URL, set the interval to 10 minutes, title it `contextforge-keepalive`. It takes two minutes
in their dashboard, costs nothing, and gets deleted after judging.

Why not a GitHub Actions cron or a Cloudflare Worker? A 10-minute Actions schedule burns roughly 4,300
billed minutes a month against this private repo's 2,000-minute free allowance — dead by mid-month — and
a Worker is a deployment to maintain for a job that is literally one HTTP GET. The external pinger has no
repo footprint at all, which is why no keep-alive code exists in this project.

### Backend → Vercel (possible, not recommended)

Vercel's model is serverless functions, not long-lived streaming processes, so the `httpStream` server
fights the platform: cold starts per invocation, function-duration caps, and stateful-session assumptions
all work against it. If you must, the folder is still the repo root with `npm run build`, wrapped so
`src/index.ts` becomes a function handler — expect transport surgery and test `tools/list` over SSE
fallback carefully. Honest advice: keep the backend on Render and let Vercel do what it's good at (below).

### Frontend → Vercel (ideal replay host)

The replay page is four dependency-free files, so Vercel is arguably its happiest home. Point a Vercel
project's **root directory at `demo/public/`** (or run `vercel --prod` from inside that folder): no build
command, no output directory, `index.html` serves at `/` with `app.js`, `style.css`, and
`demo-fixtures.json` beside it. Append `?speed=2` for faster retakes. Use this URL in the submission.

### Frontend → Render (Static Site)

Same folder, `demo/public/`: create a **Static Site** (not a Web Service) pointed at that publish
directory, no build command. Free, instant, and keeps everything on one provider if you prefer.

## 10. Project structure

```
├── src/
│   ├── index.ts                 # entry — httpStream :PORT/mcp, stateless, /health
│   ├── server.ts                # FastMCP wiring + 6 tool registrations
│   ├── config.ts                # env accessors (lazy — imports never throw without keys)
│   ├── storage/supabase.ts      # 7 storage functions (including storeInstruction)
│   ├── agent/
│   │   ├── providers.ts         # LLM pool + runWithFallback + usage accounting
│   │   ├── workflow.ts          # Plan→Execute→Verify (Zod-validated, rule-check + remediation)
│   │   └── tools.ts             # 7 executor tools (weather, calendar, shopping, recipe, home, reminder, news)
│   └── tools/                   # 6 MCP tool definitions (FastMCP name/description/parameters/execute)
├── demo/public/                 # static replay: index.html, app.js, style.css, demo-fixtures.json
├── infra/
│   ├── schema.sql               # v2 schema (priority_rank, started_at index, RLS)
│   ├── seed.sql                 # Section A baseline + Section B day-2 retake state
│   └── render.yaml              # Render infrastructure as code
├── tests/                       # tool, storage, workflow, and integration tests
├── docs/
│   ├── README.md (this file) · PROBLEM.md · ARCHITECTURE.md · API.md · FRICTION_LOG.md
│   ├── plans/plan.md            # master build plan with checkboxes
│   └── spec/                    # v1 (archived) + v2 (canonical)
├── tools/generate_v2_spec.py    # v1→v2 spec migration (already applied)
└── package.json · tsconfig.json · .env.example · LICENSE (MIT)
```

## 11. Testing

```bash
npx tsc --noEmit                                  # types (must exit 0)
npm run build                                     # dist/ emit (what Render runs)
DEMO_MODE=true npx tsx --test tests/*.test.ts     # deterministic, no keys needed
CHAOS=bad_recipe,shopping_503 DEMO_MODE=true ...  # resilience paths
```

What's already been proven: all seven executor tools in demo mode; chaos that fires once and then heals
(a non-vegan recipe rejected and replaced, a 503'd shopping call succeeding on retry); a rule checker with
zero false positives across peanut, bad-JSON, error-step, and non-recipe edge cases; a real server boot
with `/health` answering `ok` and `tools/list` returning all six schemas over actual Streamable HTTP; and a
clean `dist/` build.

## 12. Submission checklist mapping

- **Alexa+ Track**: MCP spec `2025-11-25` ✓ · Streamable HTTP ✓ · self-hosted server on Render ✓ ·
  FastMCP imported and serving at runtime ✓ · GitHub repo with MIT license ✓ · setup instructions
  (this file) ✓ · demo video under three minutes ✓ · product feedback drawn from
  [`FRICTION_LOG.md`](./FRICTION_LOG.md) ✓ · everything in English ✓
- **AWS Builder Mini Challenge**: submitted to a primary track ✓ · Strands SDK agents (planner +
  verifier) running at runtime ✓ · integrations documented here and in
  [`ARCHITECTURE.md`](./ARCHITECTURE.md) ✓
- **Bonus**: [`FRICTION_LOG.md`](./FRICTION_LOG.md) for the friction-log bonus ✓

## 13. Troubleshooting

The server boots fine without any keys by design, so a tool call answering
`Missing SUPABASE_URL (see .env.example)` just means that process has no Supabase credentials — export
them or add a `.env`. An `All LLM providers failed:` error with nothing after it means no provider keys
are set at all. OpenRouter `429`s mean the 50-request daily free cap is spent; wait for the UTC reset or
lean on the fallback providers. A `4002 Not Acceptable` from the transport means the client's `Accept`
header is missing the event-stream value. A minute-long first request on Render is the free tier waking
up — the keep-alive cron (§9) exists precisely for that. And if `npx serve` dies with
`ERR_MODULE_NOT_FOUND eastasianwidth`, that's a corrupted local npx cache, not this project — clear the
cache or use any other static server. The `ERESOLVE zod` install failure and Zod v4's two-argument
`z.record` are both already resolved in the committed lockfile and code.

## 14. Friction log

Every obstacle this build hit — with workarounds, time lost, and notes to upstream authors — is told in
full in [`FRICTION_LOG.md`](./FRICTION_LOG.md). It doubles as the draft for the submission's product
feedback section, and it carries the friction-log judging bonus.

## 15. License

MIT — see [`../LICENSE`](../LICENSE). Permissive, commercial-friendly, and instantly recognized by
judges: use it, fork it, ship it.

## 16. Sources and acknowledgments

The pain-point research (Wirecutter's Alexa+ reviews, PCMag, Hacker News threads, Amazon Forums, and the
OpenRouter free-LLM comparisons from 2026), the protocol and framework docs (MCP spec and Inspector,
FastMCP, the Strands Agents SDK's OpenAI provider page), and the platform docs (Supabase JS v2, Render's
free tier and health checks, Cloudflare cron triggers and static assets) are all linked from the
specification in `docs/spec/`, which is preserved here in both its v1 (archived) and v2 (canonical)
forms alongside the script that migrated one to the other.
