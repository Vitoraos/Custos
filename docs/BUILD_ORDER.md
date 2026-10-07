# ContextForge: Build Order (v3 execution)

> How we actually build. Differs from `docs/plans/plan.md` §6 (which assumes
> ~5 h/day human pace, Bedrock, and `addRoute`). Owner: **Vitoraos**.
> Standing decisions: agent-speed execution (no upfront cuts); **OpenRouter-only**
> (no Bedrock); Vitest; Hono `getApp()` (no `addRoute`); ntfy poll-based
> verification (no `sched=1`).

## Phase 0 — Spikes (base of everything; each ≤1 h, can change the plan)

Status (Oct 5, live-verified unless noted):

| ID | Prove | Verdict |
|---|---|---|
| S1 | `authenticate` (Bearer `cf_…` → `{ userId, mode }`) works in **stateless** mode; `execute` reads `context.session` | ✅ PROVEN — no key → 401 (`Unauthorized: Authentication failed`); key → session `{ userId, mode }` in `execute`. Fail-closed on missing session required in code (`session: T \| undefined`) |
| S2 | `server.getApp()` serves SSE (`streamSSE`) + static frontend in one process | ✅ PROVEN — `getApp(): Hono` (no `addRoute` in 4.22.1); JSON route + `streamSSE` + `serveStatic` + `/mcp` coexist. Note: binds IPv6 localhost on Windows — use `localhost`, set `httpStream.host` on Render |
| S3 | `outputSchema` → `structuredContent` + text fallback for `ToolResult` envelope | ✅ PROVEN — response carries both; violations → tool error per docs |
| S4 | Strands `Agent` streams events; `McpClient` forwards `Authorization` header (OpenRouter model) | ✅ API-PROVEN — `agent.stream()` → `AsyncGenerator<AgentStreamEvent, AgentResult>`; `McpClient({ url, headers })` accepts `Authorization`. ⏳ Full agent→tool runtime needs `OPENROUTER_API_KEY` (absent) |
| S5 | ntfy publish (`In:`) → JSON `id` → poll (`since=`+`poll=1`) match → `DELETE` cancel | ✅ PROVEN LIVE — publish → id; poll match by id; `In: 20s` accepted; `DELETE` → `message_delete`. `sched=1` does not exist — poll-based read-back is the design |
| S6 | Supabase pause/latency Render→Supabase; `/health/deep` pattern | ⏳ BLOCKED — no `.env` (no `SUPABASE_URL`); needs owner keys |
| S7 | `speechSynthesis` voices OK on recording machine; Kokoro q8 load time | ⏳ DEFERRED — needs the recording-machine browser |

Original spike table (kept for reference):

| ID | Prove | Done when |
|---|---|---|
| S1 | `authenticate` (Bearer `cf_…` → `{ userId, mode }`) works in **stateless** mode; `execute` reads `context.session` | test script prints userId from a tool |
| S2 | `server.getApp()` serves SSE (`streamSSE`) + static frontend in one process | `/sim/ping` streams + `/` serves a file |
| S3 | `outputSchema` → `structuredContent` + text fallback for `ToolResult` envelope | Inspector shows both |
| S4 | Strands `Agent` streams events; `McpClient` forwards `Authorization` header (OpenRouter model) | agent calls a tool authed |
| S5 | ntfy publish (`In:`) → JSON `id` → poll (`since=`+`poll=1`) match → `DELETE` cancel | round-trip script green |
| S6 | Supabase pause/latency Render→Supabase; `/health/deep` pattern | measured, noted |
| S7 | `speechSynthesis` voices OK on recording machine; Kokoro q8 load time | keep/drop Kokoro decided |

Log every spike result in `docs/FRICTION_LOG.md` (Amazon format: task /
steps / expected-vs-actual / severity / workaround / suggestion).

## Phase 1 — Foundation A1–A5 (nothing else starts until green)

1. Tag `v2-baseline`, branch `v3`.
2. Restructure to plan §5.A tree (`src/core|adapters|tools|storage`,
   `simulator/api|web`, `bench/`, `test/`, `infra/migrations/`, `docs/`);
   move `docs/spec/*` + `tools/generate_v2_spec.py` → `docs/archive/`.
3. Vitest in, `tests/` → `test/`; `npm run check` (typecheck + lint + test);
   TS `strict`; Biome; Actions + gitleaks + Dependabot; `.editorconfig`.
4. `infra/migrations/001_v3.sql` (§3.5) applied; `npm run db:seed` (TS, not SQL).
5. Exit: `npm run check` green, CI green.

## Phase 2 — Auth + skeleton (F1–F3, A6–A8)

1. `auth.ts` + `api_keys` + `keys:create` (prints once); strip `user_id` from
   all tool schemas; scope all repos by `userId`; isolation tests (A×B).
2. Origin/CORS allow-list, rate limiter, size caps, tool timeouts
   (`UserError`, `timeoutMs`); guest issuer + 24 h purge.
3. One real tool end-to-end (`get_weather` via Open-Meteo) → deploy Render +
   cron-job.org pings → Inspector over public URL (key → tools, no key → 401).
4. Repo public as **Vitoraos**; LICENSE holder `Vitoraos`; `docs/SECURITY.md`.
5. Exit: acceptance in plan §5.A + §5.F.

## Phase 3 — Policy + adapters + verification (B, C, D)

1. `constraints.ts` (Zod) → `ontology/*.json` + `matcher.ts` → `policy.ts`
   `evaluate()`; 60+ table tests; hand-labelled `bench/data/recipes.labeled.json`.
2. `ActionAdapter` + HTTP helper → Open-Meteo, TheMealDB (+fallback),
   ntfy (**poll** read-back), lists, device twin + faults, RSS (`untrusted`).
   Delete `check_calendar`; purge `DEMO_MODE`/`CHAOS`/fixtures from `src/`.
3. `verify.ts` runner (guard → act → read-back ≤4 s → retry once → `say` →
   receipt) + `say.ts` + `receipts.ts`; fake adapters; D3 test battery;
   `ForgeMode` vs `PassthroughMode` (`baseline` key mode).
4. Exit: zero `verified`-on-mismatch under 30% `lost_ack`; per-tool integration.

## Phase 4 — Accountability (E: P0 core, then P1)

`remember_rule` / `get_standing_rules` / `explain_last_action` /
`confirm_action` → poisoning guard + injection test → `forget_memory` +
profiles → server `instructions`. Exit: peanut-allergy E2E in §5.E.

## Phase 5 — Simulator (G, OpenRouter-only)

Guest keys (`forge`+`baseline`) → Strands+OpenRouter agent → SSE
(`token|tool_call|tool_result|final|error`) → React A/B + Ground Truth +
chaos + voice → replay recorder/player → serve from one process → 8 scenario
buttons (§7). Exit: one-URL demo; columns diverge under faults.

## Phase 6 — Benchmark (H)

Metrics + scenario spec first (`docs/BENCHMARK.md`) → L1 seeded harness
(oracle agent, thousands of runs) → hand-labelled set → L2 (~40–60 tasks,
OpenRouter, budget-guarded) → report (table + SVG + Wilson CIs) → final run
on deployed config, results committed. At-risk lever: L1-only + ~20-task L2.

## Phase 7 — Docs + submission (I)

README (≤250 lines, order per §5.I) → ARCHITECTURE/API/SECURITY/BENCHMARK/
PROBLEM rewrites → structured friction log + feature requests → Open Source PR
(FastMCP/Strands, from real friction) → `docs/WHAT_CHANGED.md` → video (<3 min,
storyboard §7) → fresh-clone QA → **submit Wed Oct 21** (buffer to Fri Oct 23
12:00 PM PDT). Never-cut list (§6) holds.

## Cut levers (in order, only if behind)

1. End Phase 3: drop `run_routine`, halal/kosher, spend cap, Home Assistant.
2. End Phase 5: drop profiles, `forget_memory` (keep confirm flow if cheap),
   Kokoro, `export_memory`. 3. Benchmark at risk: L1-only + small L2.
