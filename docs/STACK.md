# ContextForge: Free Tools & SDK Schema (v3)

> Every tool/SDK in the build is free. Source of truth for packages, free-tier
> limits, and the exact API surface we depend on. Owner: Vitoraos.
> Verified against upstream docs Oct 5, 2026 (FastMCP README, ntfy publishing
> docs, Devpost Rules). Live spikes (§4.2 of plan) still required where marked ⚑.

## 1. MCP server — FastMCP (`fastmcp`, repo has ^4.22.1)

- Purpose: entire `/mcp` product surface. Built on the official MCP SDK.
- Spec: MCP `2025-11-25` and earlier (matches hackathon requirement).
- Use: `new FastMCP({ name, version, instructions })` → `addTool()` →
  `start({ transportType: "httpStream", httpStream: { port, endpoint: "/mcp",
  stateless: true, cors: { origin: ALLOWLIST } } })`, `health: { path }`.
- Auth: `authenticate: (req: IncomingMessage) => SessionData | undefined`
  (e.g. Bearer `cf_…` → sha256 → `api_keys` lookup → `{ userId, mode }`).
  Tools read it via `execute(args, { session })`. `canAccess` gates tools per
  session. ⚑ live-spike: auth + session read in **stateless** mode (per-request
  temp session; nothing persists).
- Custom routes (simulator + static in one process): **no `addRoute`** —
  use `server.getApp()` (Hono). SSE via Hono `streamSSE`; static via Hono
  `serveStatic`. ⚑ live-spike.
- Tool output: `outputSchema` (any Standard-Schema lib) → MCP
  `structuredContent` + JSON text fallback, validated (violations → tool error).
- Errors/timeouts: throw `UserError` for user-facing errors; `timeoutMs` +
  `context.signal` for per-tool timeouts.
- Tests: in-memory transport (no port) for unit/integration speed.
- Cost: free, MIT.

## 2. MCP client — `@modelcontextprotocol/sdk`

- Purpose: integration tests, benchmark harness (`bench/run.ts`), smoke script,
  simulator agent transport (`StreamableHTTPClientTransport`).
- Use: `new StreamableHTTPClientTransport(url, { requestInit: { headers: {
  Authorization: "Bearer cf_…" } } })`. ⚑ live-spike: header passing via
  Strands `McpClient`.
- Cost: free.

## 3. Manual testing — MCP Inspector (`npx @modelcontextprotocol/inspector`)

- Purpose: poke `/mcp` tools without writing code; demo beat (§7, 2:20–2:45).
- Cost: free.

## 4. Simulator agent — Strands Agents TS SDK (`@strands-agents/sdk`, ^1.19.0)

- Purpose: simulator agent loop + `McpClient` (AWS Builder mini-challenge
  surface, OpenRouter-backed — no Bedrock per owner decision).
- Use: `Agent({ model: OpenAIModel-compatible, tools: McpClient tools })`,
  system prompt = plan §5.G verbatim, temperature 0, max 8 iterations/turn,
  per-session (30 turns) + daily budget caps → Replay mode on exhaustion.
- Proven live (Oct 9, L2): `McpClient({ url, headers: { Authorization } })`
  forwards the key; `agent.stream()` yields token/tool/final events. Caveat
  found: McpClient drops `structuredContent` — agent-layer tool results carry
  text (`say`) only, so L2 scores finals + ground truth, not outcomes.
- Cost: free SDK; model calls on OpenRouter free tier (20/min, 50/day).

## 5. LLM — OpenRouter free models only (no Bedrock)

- Purpose: simulator agent + L2 benchmark model. Dev + demo.
- Existing: `src/agent/providers.ts` (OpenRouter via `OpenAIModel`,
  `baseURL: https://openrouter.ai/api/v1`). Reused in `simulator/api/agent.ts`.
- Env: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` (default `openrouter/free`).
- Limits: 50 req/day free; budget guard + recorded replays cover judges/demo.
- Honest note for submission: no AWS-service compute in path; Strands SDK is
  the AWS-adjacent surface; say so in product feedback.

## 6. DB — Supabase (`@supabase/supabase-js` ^2)

- Purpose: `memories`, `action_receipts`, `device_state`, `fault_config`,
  `list_items`, `api_keys` (plan §3.5, `infra/migrations/001_v3.sql`).
- Access: service-role key server-side only; RLS enabled, no policies
  (defense in depth; app scopes every query by `userId`).
- Keepalive: `/health/deep` (`select 1`) pinged by cron-job.org → also
  prevents free-project pause. ⚑ live-spike: pause behavior/latency.
- Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Cost: free tier.

## 7. Hosting + keepalive — Render free + cron-job.org

- Purpose: one always-on Node process (`/mcp`, `/health`, `/health/deep`,
  `/sim/*`, static `/`). `infra/render.yaml` (`plan:free`,
  `healthCheckPath: /health`, `PORT`-bound).
- Keepalive: two external cron-job.org pings (`/health`, `/health/deep`,
  every ~10 min). No code. Free: 750 h/mo; sleeps after 15 min idle.

## 8. Reminders — ntfy.sh (no account)

- Publish: `POST https://ntfy.sh/<topic>` + headers `Title`, `Priority`,
  `Tags`; schedule via `Delay:` (unix-ts) / `In:` (`30min`, `2h`) /
  `At:` (`tomorrow, 10am`). Limits: **min 10 s, max 3 days**.
- Response: JSON with `id` (+`sequence_id`) → used for verification + cancel.
- Verify (no `sched=1` — doesn't exist): cache API `GET /<topic>?since=<ts>&poll=1`,
  match id/text+time (±5 s).
- Cancel/update: `DELETE /<topic>/<sequence_id>`; re-`POST` same id to update.
- Topics: random unguessable per user, charset `[-_A-Za-z0-9]`, ≤64 chars
  (e.g. `cf_<32 hex>`); mention subscribe QR/link in simulator.
- Env: `NTFY_BASE_URL=https://ntfy.sh`. Cost: free.

## 9. Weather — Open-Meteo (no key)

- Use: geocoding → forecast, Zod-validate, attach `source` + `fetchedAt`,
  10-min cache; failure → `outcome: "error"` + honest `say`.
- Cost: free non-commercial.

## 10. Recipes — TheMealDB (free test key `1`)

- Use: filter → ≤8 parallel lookups → parse real `strIngredient1..20` lists →
  policy-check against rules; excluded candidates returned with reasons;
  `data/recipes.fallback.json` (~30) marked `source: "fallback"` if API down.
- Cost: free tier.

## 11. News — `rss-parser` + one pinned public feed

- Use: headlines flagged `untrusted: true`, never written to memory
  (poisoning guard §5.E). Env: `RSS_FEED_URL`. Cost: free.

## 12. Validation — Zod (^4.1.12, in repo)

- Use: every tool input/output + `constraints.ts` + `ToolResult` envelope;
  Standard-Schema compatible with FastMCP `parameters`/`outputSchema`.
  Note: repo friction log already records Zod v4-vs-v3 idioms — write v4 style.
- Cost: free.

## 13. Tests — Vitest | Lint/format — Biome | Logs — pino

- Vitest: `test/unit|integration/`, 90%+ on `src/core`; FastMCP's own repo
  uses Vitest. `npm run check` = typecheck + lint + test.
- Biome: replaces ESLint+Prettier. pino with redaction (keys, tokens).
- Cost: free.

## 14. CI/security — GitHub Actions + Dependabot + gitleaks (+ secret scanning)

- Workflows: `check` (typecheck/lint/test), `gitleaks`; Dependabot;
  repo public under **Vitoraos**. Cost: free for public repos.

## 15. Frontend — Vite + React + Tailwind (simulator `simulator/web/`)

- One page: A/B columns, Ground Truth panel, chaos panel, mode switch, replay
  player. Served from the same process via Hono static. Cost: free.

## 16. Voice — Web Speech API (default) | `kokoro-js` (P2)

- Default: `speechSynthesis`, sentence queue, "Start" gesture, mute + captions.
  P2: `kokoro-js` (Kokoro-82M, WASM/WebGPU) behind the same `Voice` interface.
  ⚑ live-spike S7: voice quality + Kokoro load time. Cost: free.

## 17. Diagrams/video — Mermaid + OBS + DaVinci Resolve/CapCut

- Architecture in markdown (renders on GitHub); 1080p demo <3 min, no Amazon
  logos, no copyrighted music, burned-in captions. Cost: free.
