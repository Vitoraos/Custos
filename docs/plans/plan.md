# ContextForge Implementation Plan (master)

> For workers: implement phase-by-phase in this session, no subagents. Checkboxes track progress.

**Goal:** Ship v2 MCP server (Plan→Execute→Verify, 2 LLM calls) + static replay demo on $0 stack.

**Architecture:** FastMCP `httpStream` stateless → Supabase memory → Strands `Agent` planner/verifier + deterministic TS executor + provider-pool fallback.

**Tech Stack:** `fastmcp ^4.21.1`, `@strands-agents/sdk`, `openai`, `@supabase/supabase-js ^2`, `zod ^3`, Node `>=22.19.0`

**Spec:** `docs/spec/ContextForge v2.md` (generated from v1 via `python tools/generate_v2_spec.py`)

## Global Constraints
- MCP spec `2025-11-25`, endpoint `/mcp`, `stateless: true`
- Bind `process.env.PORT ?? 3000` (Render injects PORT)
- `service_role` key server-side only, bypasses RLS
- `DEMO_MODE=true` for recording; `CHAOS=bad_recipe,shopping_503` for R1/R2
- F-scenes caption: "Simulated Alexa+ behavior based on reported user issues"
- 2 LLM calls/workflow (3 with remediation)

## Docs index (verified 2026-10-01)
- FastMCP: `fastmcp-ts.docs.prefect.io`, `github.com/punkpeye/fastmcp` (2025-11-25 only, `httpStream`, health endpoint)
- Strands: `strandsagents.com/docs/api/typescript/Agent`, `/model-providers/openai` (`OpenAIModel` + `clientConfig.baseURL`), `/migrate/openai`
- Quotas: OpenRouter 20/min 50/day (1000 after $10) `openrouter.ai/docs/api_reference/limits` — sole provider
- Supabase: `.upsert(...,{onConflict}).select()`, service_role bypasses RLS
- Render: 15m sleep/1m wake, 750h/mo, `healthCheckPath: /health` 2xx/3xx in 5s
- Keep-alive: external cron-job.org ping every 10 min (no code)

## Phases
- [x] **Phase 1 — Reorg + scaffold:** dirs, moves, `tools/generate_v2_spec.py` fixed, v2 generated (1729 lines), package.json/tsconfig/.env.example/render.yaml/schema.sql/keepalive/FRICTION_LOG/plan.md
- [ ] **Phase 2 — Storage:** `src/storage/supabase.ts` (6 fns + `storeInstruction`), run `infra/schema.sql` then `infra/seed.sql` §A, verify counts
- [x] **Phase 3 — Providers:** `src/agent/providers.ts` (OpenRouter-only, `runWithFallback` shape kept for workflow compat)
- [x] **Phase 4 — Tools registry:** `src/agent/tools.ts` (7 tools, `DEMO_MODE`, `CHAOS`, `contains`/`exclude`), `wttr.in ?format=3&m/u` — verified all 7 outputs + R1/R2 chaos
- [x] **Phase 5 — Workflow:** `src/agent/workflow.ts` verified (rule check 1→0 on retry, edge cases clean)
- [x] **Phase 6 — MCP server:** 6 tools + `/health` + `PORT` binding; boot + `tools/list` (all 6 schemas) verified over Streamable HTTP; `npm run build` emits `dist/`
- [ ] **Phase 6 — MCP server:** `src/index.ts` (PORT + `/health`), `src/server.ts`, `src/tools/*.ts` (6 tools, `kind='instruction'`), Inspector `tools/list`
- [x] **Phase 7 — Replay demo:** `demo/public/{index.html,app.js,style.css}` verified (fixture keys OK, all assets 200; `npx serve` cache broken env-side, Node static fallback used)
- [x] **Phase 8 — Docs + license:** extensive README, ARCHITECTURE, API, MIT LICENSE
- [ ] **Phase 9 — Deploy:** Render Web Service + cron-job.org keep-alive + static demo host
- [ ] **Phase 9 — Tests/video/submit:** `tsx --test`, 2:45 video (S1-S4+R1), README/API/ARCHITECTURE, Devpost
