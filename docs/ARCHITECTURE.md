# ContextForge Architecture

Companion to [`README.md`](./README.md) (start there) and [`API.md`](./API.md) (tool reference).
Spec: `docs/spec/ContextForge v2.md` (canonical; v1 archived beside it).

---

## 1. System overview

```
┌──────────────────────────────────────────────────────────────────┐
│ USER: "Remember I'm vegan, plan dinner for 4, check weather,    │
│        add groceries" → Alexa+ → POST /mcp (Streamable HTTP)      │
└──────────────────────────────┬───────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│ CONTEXTFORGE (FastMCP, stateless, Render)                        │
│                                                                  │
│  6 MCP tools: store_preference · get_preferences · store_context │
│               get_context · execute_workflow · get_memory_summary│
│                          │                                       │
│      ┌───────────────────┼───────────────────┐                   │
│      ▼                   ▼                   ▼                   │
│  MEMORY (Supabase)   AGENT PIPELINE      TOOL REGISTRY           │
│  preferences         Planner (LLM #1)    7 executor tools:       │
│  conversation_ctx    Executor (code!)    weather, calendar,      │
│  user_instructions   Rule check          shopping, recipe,       │
│  workflow_execs      Verifier (LLM #2)    home, reminder, news   │
└──────────────────────────────────────────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
         Groq → Workers AI → Gemini → OpenRouter (fallback chain)
```

Three layers, one direction of dependence: **MCP tools → agent pipeline → (memory + LLM pool)**.
The executor tools never touch the network except `get_weather` (live `wttr.in`); everything else is
local logic or Supabase.

## 2. Request lifecycle (worked example)

User: *"Remember I'm vegan, plan dinner for 4, check weather, add groceries."*

1. `store_preference {user_id, key: diet, value: vegan, category: diet}` → upserted; future plans treat it as a hard constraint.
2. `execute_workflow {user_id, task}`:
   - **Load** (no LLM): preferences + active instructions + non-expired context, in parallel.
   - **Plan** (LLM call #1): Strands `Agent` + `OpenAIModel` receives task + prefs + instructions + context + tool names; returns a Zod-validated `[{order, description, required_tool, expected_input}]`, sliced to `maxSteps`.
   - **Execute** (no LLM): for each step, validate input against the tool's Zod schema, run it, retry transient errors (`maxRetries`, 800ms × attempt backoff). Unknown tool names (free-model hallucinations) become error traces, not crashes.
   - **Rule check** (no LLM): `checkPreferences` scans `find_recipe` outputs' `contains` lists against `diet`/`allergies`. Violations trigger one remediation pass: re-run the offending step with an `exclude` hint (e.g. `['meat','dairy','eggs','fish']`).
   - **Verify** (LLM call #2): Strands verifier receives task + plan + trace + rule violations, returns `{overall_status, gaps_found, retry_suggestions, summary}`. If rule violations survive remediation, status is forced to `failed`.
   - **Persist**: execution log to `workflow_executions`; on success, a 72h follow-up context so "Yes, and…" follow-ups resolve.
3. Alexa+ speaks the summary. Next session, `get_memory_summary` recalls everything.

Typical cost: **2 LLM calls**. Worst case with remediation: still 2 (the retry is code).

## 3. Memory model

| Table | Rows | Expiry | Read path |
|-------|------|--------|-----------|
| `preferences` | One per `(user_id, key, category)` (upsert) | Never | `get_preferences`, loaded into every plan |
| `conversation_context` | Append-only notes with `priority` + generated `priority_rank` (high=3) | Optional `expires_at` TTL; reads filter `expires_at IS NULL OR > now()` | `get_context`, newest `limit` |
| `user_instructions` | Standing rules (`critical`/`important`/`nice_to_have`), `active` flag | Until deactivated | `getActiveInstructions`, into every plan |
| `workflow_executions` | Append-only run log (`steps` JSONB, `completed`/`failed`) | Never | `get_memory_summary` (latest 5) |

`store_context` with `kind: 'instruction'` is the only write path for standing rules (maps
low/medium/high → nice_to_have/important/critical). RLS is enabled on all four tables; the server uses
the `service_role` key server-side, which bypasses RLS — no per-user policies needed for this architecture.

## 4. LLM provider pool

One class covers all four providers because every endpoint is OpenAI-compatible:

```ts
new OpenAIModel({ api: 'chat', apiKey, clientConfig: { baseURL }, modelId })
```

`runWithFallback(systemPrompt, prompt)` tries Groq → Workers AI → Gemini → OpenRouter, catching **any**
error (429, 5xx, bad key, deprecated model) and recording fallbacks + per-provider `usage{}` counts so you
can see which quota is burning. Providers without a key are filtered at startup; with zero keys the
function throws `All LLM providers failed:` immediately (verified — imports never throw).

`AgentResult.toString()` is the confirmed text accessor on SDK 1.19.0 (interrupts → structuredOutput →
text blocks joined).

## 5. Failure handling

| Failure | Layer | Behavior |
|---------|-------|----------|
| Tool 503 / transient | Executor | Retry to `maxRetries` with backoff; error trace recorded |
| Hallucinated tool name | Executor | Error trace (`unknown tool`), plan continues |
| Non-vegan / allergen recipe | Rule check | Remediation re-run with `exclude`, then re-checked |
| Planner 429 (R2) | Provider pool | Silent fallback to next provider; user never notices |
| Bad JSON from LLM | `parse()` | Zod throws → surfaces as tool error (retried at MCP layer) |
| Missing env keys | Config/storage | Clean `Missing X (see .env.example)`; server still boots |
| Missing `Accept: …text/event-stream` | Transport | FastMCP 4002 — clients must send both Accept values |

## 6. Decision records (v1 → v2)

| # | Decision | Why |
|---|----------|-----|
| 1 | Pooled providers instead of OpenRouter-only | 50/day cap with failures counting; one v1 workflow burned ~8–10 calls |
| 2 | Deterministic TS executor, LLM only plans/verifies | 2 calls/workflow, deterministic tool calls, reliable on weak free models |
| 3 | `Agent` + `OpenAIModel`, no `createHarness`/`litellm` | LiteLLM is Python-only; OpenAI provider with `baseURL` is the documented TS route |
| 4 | Static fixture replay instead of Express + live LLM demo | Recordings immune to quotas and Render cold starts |
| 5 | In-memory sessions, no S3 | S3 needs a paid AWS account — contradicts the $0 claim |
| 6 | `priority_rank` generated column; `started_at` index | Text priority mis-sorts; v1 index referenced a non-existent column |
| 7 | `storeInstruction` + `store_context.kind` | `user_instructions` had no write path at all |
| 8 | Zod v4 (`z.record(z.string(), …)`) | Strands 1.19 requires `zod@^4`; two-arg record is the v4 form |

Strands-vs-Vercel-AI-SDK was decided for Strands: the Vercel SDK would be marginally quicker to learn but
likely forfeits the AWS Builder prize, and with 2 LLM calls per workflow the framework choice barely
affects build time.

## 7. Limits and non-goals

- Free-tier quotas bind throughput (~30 workflows/hour across the pool); the demo never touches them.
- Sessions are in-memory: a Render restart drops Strands session state (Supabase memory survives — that is the durable layer).
- Single-region, single-instance; no auth on the MCP endpoint yet (Alexa+ auth story unverified — see spec changelog).
- Voice I/O, Alexa+ skill packaging, and multi-user tenancy beyond `user_id` scoping are out of scope for the hackathon slice.
