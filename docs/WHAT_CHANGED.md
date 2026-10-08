# What changed in the hackathon window

The repo existed before Aug 31, 2026 as a v2 prototype: 6 MCP tools with an
LLM planner **inside** the server (`execute_workflow`), mock/fixture adapters
(`DEMO_MODE`, `CHAOS`, `demo-fixtures.json`), no auth (`user_id` was a
free-form tool argument), 4 Supabase tables, and a static replay demo.
Tagged `v2-baseline` in git; the v2 tree is untouched there.

Everything below was built in the window (branch `v3`, then merged):

- ** product**: LLM-free MCP server (11 tools) — typed rule engine (EU-14
  ontology + matcher + `evaluate()`, 62 table tests), closed-loop verifier
  (`runAction`: guard -> act -> read-back -> retry -> receipt, 10 fault-
  injection tests), real adapters (Open-Meteo, TheMealDB, ntfy, RSS, Supabase
  lists, seeded device twin), Bearer auth + tenant isolation, receipts +
  `explain_last_action` + `confirm_action` + verified `forget_memory`.
- ** window**: one-process simulator — guest keys + budget guard, Strands +
  OpenRouter agent over the same `/mcp`, A/B SSE columns, Ground Truth panel,
  chaos panel, voice out, replay recorder/player, one-page React UI.
- ** proof**: seeded L1 benchmark (oracle agent, Wilson CIs, committed JSON +
  report + chart), 60 hand-labelled recipes, live-adapter tests, 9 MCP
  integration tests (auth, isolation, faults, confirm flow).
- ** hygiene**: Vitest + Biome + `npm run check`, CI + gitleaks + Dependabot,
  `001_v3.sql` migration, MIT license (holder: Vitoraos), archived v2 specs.

Removed in the window: the in-server LLM planner, all mocks/fixtures in
`src/`, the static `demo/` page, `check_calendar`. `run_routine`,
halal/kosher, spend cap, and Kokoro voice were cut per the plan's cut lines.
