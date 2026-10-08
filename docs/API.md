# API — ContextForge v3 (`/mcp`, MCP 2025-11-25, Streamable HTTP, stateless)

Auth: `Authorization: Bearer cf_…` (sha256 -> `api_keys` -> `user_id` + mode).
No key -> 401. `user_id` is never a parameter. Server `instructions` tell
clients to call `get_standing_rules` first and read `say` verbatim.

Every tool returns a `ToolResult` envelope as `structuredContent` (+ `say` as
text): `outcome` = `ok | verified | verified_after_retry | unverified |
blocked | needs_confirmation | unsupported | error`; `say` (<=25 words,
speakable); plus `data?`, `evidence?` (expected/observed/source/checkedAt),
`reasons?`, `receiptId?`, `confirmToken?`, `untrusted?`.

## Memory (4)

| Tool | Annotations | Purpose |
|---|---|---|
| `get_standing_rules` `{profile?}` | read-only | Constraints, facts, instructions + provenance. Call first. |
| `remember_rule` `{profile, rule, evidence?, source?}` | write | Typed rule (`allergen{allergen,severity}`, `diet{value}`, `quiet_hours{...}`, `device_limit{...}`, `confirm_required{action}`, `fact/instruction{text}`). Returns spoken readback. `source: external` lands dormant. |
| `forget_memory` `{id?|query?, confirmToken?}` | destructive, idempotent | Deletes one entry; verified gone by re-query. Safety rules need confirmation. |
| `explain_last_action` `{tool?}` | read-only | The receipt: decision, rules checked, observation, attempts, latency. |

## Accountability (1)

| Tool | Purpose |
|---|---|
| `confirm_action` `{confirmToken}` | Second step for high-risk actions; consumes the token and runs the bound action. |

## Actions — guarded, verified, receipted (3, via `runAction`)

Guard -> act -> read back (3 reads, 300/700/1200ms) -> one idempotent retry ->
honest report (`verified` / `verified_after_retry` / `unverified`) -> receipt.
Idempotent per (user, mode, tool, args, minute). `mode=baseline` keys skip
guard+verification and return raw acks (the A/B control).

| Tool | Risk | Adapter (write/read-back) |
|---|---|---|
| `set_device_state` `{device, attr="power", value, confirmToken?}` | high for locks, else low | device twin (Supabase) / independent `read()` |
| `set_reminder` `{text, inSeconds 10..259200, title?, confirmToken?}` | low | ntfy.sh scheduled push / acceptance attestation (id + scheduled time). Delivery itself is not observable pre-fire (ntfy API limit, proven) — evidence says so. |
| `update_shopping_list` `{list="shopping", ops[{add\|remove,item}]×20, confirmToken?}` | low; `purchase` rule -> confirm | Supabase `list_items` (dedupe_key) / re-query |

## Reads (3)

| Tool | Notes |
|---|---|
| `find_recipe` `{query, servingFor, max≤8}` | Real TheMealDB ingredient lists, policy-filtered; excluded candidates with reasons. Fallback dataset (marked) if the API is down. |
| `get_weather` `{city}` | Open-Meteo, validated, `fetchedAt`+`source`, 10-min cache. |
| `get_headlines` `{limit≤10}` | RSS, flagged `untrusted: true` — never an instruction, never stored. |

Errors never leak stack traces: `{ outcome: "error", say }`. Input limits:
string max lengths, array caps (ops ≤20, servingFor ≤10), tool timeouts.
See `docs/ARCHITECTURE.md` for the pipeline and `docs/BENCHMARK.md` for numbers.
