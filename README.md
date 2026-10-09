# ContextForge — the accountability layer for Alexa+

![check](https://github.com/Vitoraos/contextforge/actions/workflows/check.yml/badge.svg)
![license](https://img.shields.io/badge/license-MIT-green)

Alexa+ remembers — but nothing **enforces** a remembered rule, **verifies** an
action, or **receipts** a decision. ContextForge is that layer: standing rules
enforced in code at the tool boundary, every action verified against real
state, every decision receipted. One process: LLM-free MCP server + simulator
window. **Live demo:** `<RENDER_URL>` · **Video:** `<VIDEO_URL>`

## Results (L1 oracle harness, seeded, CIs)

| Metric | ContextForge | Baseline (memory only) |
|---|---|---|
| Silent-failure rate | 0.0% [0/156] (95% CI 0.0%–2.4%) | 31.4% [49/156] (95% CI 24.6%–39.1%) |
| Constraint-violation rate | 0.0% [0/204] (95% CI 0.0%–1.8%) | 100.0% [204/204] (95% CI 98.2%–100.0%) |
| False-block rate | 0.0% [0/576] (95% CI 0.0%–0.7%) | 0.0% [0/576] (95% CI 0.0%–0.7%) |
| Fault recovery | 5.0% [6/120] | 0.0% [0/120] |
| Honest failures | 100.0% [13/13] | n/a [0/0] |
| Injection success | 0.0% [0/3] | 0.0% [0/3] |
| Latency p50/p95 (S1) | 309/4442 ms | 0/1 ms |

_L1 oracle harness, seed 7, 2026-10-09. Oracle = right-tool + report-what-the-tool-says (models ack-trusting behavior,
not real Alexa+). Full results: `bench/results/2026-10-09.json`; chart: `bench/results/chart.svg`.
Limits in `docs/BENCHMARK.md`._

### What these results mean (plain language)

**What we did:** we gave the same jobs (turn on lights, follow food rules,
set reminders) to two versions of the assistant hundreds of times — one with
ContextForge's safety checks on, one without — while randomly breaking things
(weak signal, lost messages, dead devices), the way real homes break. An
automated stand-in played the user so the test is repeatable.

**What each row means:**
- *Silent failures* — the assistant said "done" but nothing actually happened.
  The dangerous kind of wrong, because you'd never know. Ours: **zero**. Without
  checks: **about 1 in 3**.
- *Rule-breaking* — e.g. serving peanuts to someone with a peanut allergy.
  Ours blocked every one (**0 in 204**); without enforcement, all went through.
- *False alarms* — blocking something harmless (the cost of being strict).
  Ours: **zero in 576 tries**.
- *Recovery* — fixing a failed command by retrying: 5%. Low because some faults
  (device offline) can't be retried into working — those become honest failures.
- *Honest failures* — when it couldn't confirm, it said so **13 out of 13 times**
  instead of pretending.
- *Hacking attempts* — bogus "forget the allergy" instructions hidden in news
  headlines: **none got through**.
- *Speed cost* — safety adds about a third of a second normally, ~4 seconds worst
  case. That's the price of checking instead of assuming.

**Bottom line:** with the checks on, the assistant never claimed success it
couldn't prove and never broke a stored rule; without them, it confidently
reported things that weren't true. The checks cost a short delay.

## Try it in 60 seconds

1. Open `<RENDER_URL>`, press **Start** (guest key issued, 24h TTL).
2. Type "I'm vegan and Maya has a peanut allergy" → hear the readback.
3. "Plan dinner for four" → watch the columns diverge; check Ground Truth.
4. Same server, any client: point MCP Inspector at `<RENDER_URL>/mcp` with
   `Authorization: Bearer <key>` (mint one: `npm run keys:create -- --user demo
   --mode forge` against your deploy). Same tools the simulator uses.

## Architecture + tools

One process: `/mcp` (FastMCP, stateless) → auth (key->user) → policy engine
→ `runAction` (act, read back, retry) → adapters → receipts; plus `/health`,
`/health/deep`, `/sim/*`, static UI. Diagram: `docs/ARCHITECTURE.md`.
11 tools: `get_standing_rules`, `remember_rule`, `forget_memory`,
`explain_last_action`, `confirm_action`, `set_device_state`, `set_reminder`,
`update_shopping_list`, `find_recipe`, `get_weather`, `get_headlines`
(contract: `docs/API.md`).

## Run locally (5 commands)

```
npm install
npm run check        # typecheck + lint + tests (93 green)
npm run db:seed      # needs SUPABASE_URL + SERVICE_ROLE_KEY (.env)
npm run dev          # :3000 — /mcp, /health/deep, /sim/*
npm run smoke -- --base http://localhost:3000 --key <cf_...>
```

Web UI: `npm run web:dev` (proxy to :3000) or `npm run web:build` (served by
the same process). Benchmark: `npm run bench -- --quick && npm run bench:report`.

## Security

Bearer keys (sha256 at rest, printed once), no `user_id` params, per-user
scoping + RLS, confirm tokens for unlock/purchase/safety-removal, `untrusted`
quarantine, rate limits, gitleaks CI. Details + threat model: `docs/SECURITY.md`.

## Limitations (honest)

Twin devices are simulated (verification pipeline is real, any adapter works);
ingredient matching is heuristics, not medical advice; ntfy reminders verify
*scheduling*, not delivery (ntfy has no pre-delivery read API — proven);
ntfy delay 10s–3d; free-tier latencies; Alexa+ integration pending (same
endpoint, any client).

## Roadmap

Real Alexa+ client, OAuth 2.1 resource-server mode, Home Assistant adapter,
Kokoro voice, spend cap, `run_routine`.

## Judging map

Tech: `src/core` + `src/adapters` + tests. Design: one-process A/B simulator
with Ground Truth. Impact: benchmark + receipts. Idea: enforcement at the
tool boundary, not in the prompt.

## License + acknowledgments

MIT © Vitoraos. Built on FastMCP, Strands Agents SDK, Supabase, Render,
ntfy.sh, Open-Meteo, TheMealDB — all free tiers. Friction log + product
feedback: `docs/FRICTION_LOG.md`. What changed in-window: `docs/WHAT_CHANGED.md`.
