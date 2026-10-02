# Friction Log — ContextForge (10% judging bonus + Product Feedback source)

> Append-only. Newest on top. One entry per friction. 30 seconds per entry.
> Template at bottom. Log everything that costs >5 min, every workaround, every version pin.

## 2026-10-02 — Demo — `npx serve` broken by corrupt npx cache (environmental)
- **Expected:** `npx serve demo/public -l 3001` serves replay page.
- **Actual:** `ERR_MODULE_NOT_FOUND eastasianwidth` from `string-width` inside the cached `serve` install; nothing listens on :3001.
- **Workaround:** Verified all 4 assets (index.html/app.js/style.css/demo-fixtures.json) serve 200 via a Node built-in static server. If `serve` still fails at record time: clear npx cache or `npm i -D serve`.
- **Time lost:** 10m | **Severity:** minor

## 2026-10-02 — FastMCP — Streamable HTTP requires `Accept: application/json, text/event-stream`
- **Expected:** Plain JSON POST works for MCP calls.
- **Actual:** `4002/-32000 "Not Acceptable: Client must accept both application/json and text/event-stream"` when the Accept header is missing (my smoke-test bug, not server bug). Responses arrive as SSE `event: message` frames.
- **Workaround:** Always send both Accept values; parse the SSE `data:` line. Alexa+ clients already do this.
- **Time lost:** 5m | **Severity:** minor

## 2026-10-02 — Workflow — exported `Step`/`Trace`/`checkPreferences` + unknown-tool guard
- **Expected:** Spec `workflow.ts` verbatim.
- **Actual:** `runStep` is private (untestable), planner on free models can hallucinate tool names (would TypeError), `z.record(z.any())` is Zod v3 style.
- **Workaround:** Exported types + `checkPreferences`, `unknown tool` returns error trace instead of crashing, `z.record(z.string(), z.any())` for Zod v4. Verified: vegan violation 1 → retry 0, peanut/allergy + bad-JSON + error-step edge cases all 0 false positives.
- **Time lost:** 5m | **Severity:** minor

## 2026-10-02 — Strands — confirmed `AgentResult.toString()` text accessor on SDK 1.19.0
- **Expected:** Spec marked VERIFY: how to read text from `invoke()` result.
- **Actual:** `AgentResult` has `toString()` (interrupts → structuredOutput → textBlock/reasoning/citations joined) + `lastMessage: Message`. `String(result)` calls it, so spec code was right.
- **Workaround:** `src/agent/providers.ts` uses `result.toString()` explicitly; comment records SDK version.
- **Time lost:** 10m | **Severity:** minor

## 2026-10-01 — Deps — `@strands-agents/sdk@1.19.0` requires `zod@^4.1.12`, spec pins `zod@^3.0.0`
- **Expected:** `npm install` resolves with spec manifest.
- **Actual:** `ERESOLVE Could not resolve dependency: peer zod@"^4.1.12" from @strands-agents/sdk@1.19.0` (+2 more from `@modelcontextprotocol/sdk`, `openai`).
- **Workaround:** Bumped `zod` to `^4.1.12` (installed `4.6.5`), pinned `fastmcp ^4.22.1 / sdk ^1.19.0 / openai ^6.49.0 / supabase-js 2.117.2 / tsx 4.23.15 / ts 5.9.3` via `npm ls`. Zod v4 is largely back-compat for our `z.object` schemas; verify at Phase 4 tool-registry tests.
- **Time lost:** 8m + slow install (~3m, first run hit 120s timeout, retry took 37s) | **Severity:** major

## 2026-10-01 — Setup — Windows filename with em dash broke `update_spec.py` paths
- **Expected:** `update_spec.py` runs as-is, SRC/DST resolve.
- **Actual:** `FileNotFoundError` — script hardcoded `/mnt/user-data/...`; real file is `docs/spec/ContextForge — ... .md` (em dash U+2014, shows as `�` in cp1252).
- **Workaround:** `tools/generate_v2_spec.py` now auto-detects first non-v2 `*.md` in `docs/spec/`, outputs `docs/spec/ContextForge v2.md`. Run: `python tools/generate_v2_spec.py` → `written 1729 lines, MISSING: []`.
- **Time lost:** 10m | **Severity:** major
- **Feedback for:** hackathon starter (paths must be relative, filenames ASCII-safe).

## 2026-10-01 — Spec v1 — `workflow_executions` index references non-existent `created_at`
- **Expected:** `CREATE INDEX idx_executions_user ON workflow_executions(user_id, created_at DESC);` runs.
- **Actual:** Table has `started_at`, no `created_at` — index creation fails.
- **Workaround (v2):** `CREATE INDEX idx_executions_user ON workflow_executions(user_id, started_at DESC);` — see `infra/schema.sql`.
- **Time lost:** 0m (caught by `seed.sql` comment + `update_spec.py`) | **Severity:** blocker if uncaught

## 2026-10-01 — Spec v1 — `conversation_context.priority` sorts alphabetically
- **Expected:** `ORDER BY priority DESC` → high, medium, low.
- **Actual:** Text sort → medium > low > high (wrong order).
- **Workaround (v2):** Generated `priority_rank SMALLINT ... CASE priority WHEN 'high' THEN 3 ...`, index + queries order on `priority_rank DESC`.
- **Time lost:** 0m (caught pre-build) | **Severity:** major

## 2026-10-01 — Spec v1 — `wttr.in` units URL wrong
- **Expected:** `?format=u3` / `?format=m3` switches units.
- **Actual:** Units are a separate flag (`?format=3&u` vs `&m`), format string is layout only.
- **Workaround (v2):** `fetch(...?format=3&${units==='fahrenheit'?'u':'m'})` in `src/agent/tools.ts`.
- **Time lost:** 0m | **Severity:** minor

## 2026-10-01 — Spec v1 — Strands `createHarness` / `litellm` provider does not exist in TS SDK
- **Expected:** `import { createHarness } from '@strands-agents/harness'`, `provider: 'litellm'`.
- **Actual:** LiteLLM is Python-only. TS SDK uses `Agent` + `OpenAIModel` with `clientConfig: { baseURL }` for OpenAI-compatible endpoints (verified: strandsagents.com OpenAI provider page).
- **Workaround (v2):** `src/agent/providers.ts` — one `OpenAIModel` class for Groq/Workers AI/Gemini/OpenRouter + `runWithFallback()`.
- **Time lost:** research 20m | **Severity:** blocker

## 2026-10-01 — Free LLM quota — OpenRouter 50/day too small for dev
- **Expected:** Single OpenRouter key covers build + demo.
- **Actual:** 20 req/min, 50/day (1000/day after $10 lifetime purchase); failed requests count; one v1 workflow ≈ 8–10 calls.
- **Workaround (v2):** Provider pool Groq (30/min, 1000/day, 200K tok/day) → Workers AI (10k neurons/day) → Gemini → OpenRouter last; executor is plain code (2 calls/workflow); `DEMO_MODE` + static replay for recording.
- **Time lost:** research 15m | **Severity:** blocker

---

## Template (copy for new entry)
### YYYY-MM-DD HH:MM — <tool> — <short title>
- **Expected:** ...
- **Actual:** (error verbatim + log/screenshot link)
- **Workaround:** ...
- **Time lost:** Xm | **Severity:** blocker/major/minor
- **Upstream issue/feedback:** link
