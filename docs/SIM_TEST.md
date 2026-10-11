# Simulator E2E test report — 2026-10-10 (production + live browser)

Method: fresh guest on `https://contextforge-8ssj.onrender.com` via the
deployed Vercel UI (browser tools) for UI flows; direct MCP calls with the
demo key for deterministic tool checks; backend SSE for agent flows. Quota
died mid-session (OpenRouter 50/day) — marked below where it blocked a check.

## Pass results

| # | Flow | Result |
|---|---|---|
| 1 | Start → guest issued, empty truth (devices unknown, no rules, no receipts) | ✅ |
| 2 | Remember vegan + Maya peanut allergy (both columns) | ✅ readbacks, 3 rules in truth (peanut stored twice — once per column, harmless dup) |
| 3 | Plan dinner for four | ✅ both columns consulted rules, served Vegan Pasta Primavera |
| 4 | Kitchen light under `lost_ack p=1` | ✅ textbook divergence — forge: "couldn't confirm, check manually"; baseline: "I've turned on the light" (false, truth null) |
| 5 | Oven reminder (20s) | ✅ both claimed set; real-phone delivery not observable from here |
| 6 | "Why did you pick that?" | ✅ forge cites rule verification; baseline cites diet fit |
| 7 | Forget Maya's allergy (rules exist) | ✅ forge demands confirmation, deletes nothing; rules intact after |
| 8 | News | ✅ headlines both columns (truth: untrusted path exercised) |
| 9 | Thermostat limit (direct MCP, fixed code vs prod DB) | ✅ 30 blocked with reason, 22 verified |
| 10 | Peanut shopping add (direct MCP) | ✅ blocked |
| 11 | Unlock confirm + quiet hours | ⚠️ not re-run live (covered by integration suite; quota dead) |

## Bugs found (fixed or filed)

1. **[CRITICAL, fixed in #11] Production enforcement was silently off.**
   Zod `datetime()` rejects Postgres `+00:00` timestamps, so `loadConstraints`
   dropped every Supabase row and the policy evaluated zero rules
   (`{"verdict":"allow","checked":[]}`). Local tests passed because
   MemoryStore stamps `Z`-time. Thermostat-to-30 verified instead of blocked.
   Fix: `datetime({ offset: true })` + regression test with a real PG-format
   timestamp. Proven fixed: 2/2 rules load, 30 blocked, 22 verified, peanut
   shopping blocked (live Supabase).
2. **[MINOR, open] Truth "Last receipt" mixes columns.** Both agents share one
   receipt stream, so `latest()` shows whichever column wrote last (observed:
   baseline `ok` right after a forge `verified`). Suggest per-column receipts.
3. **[MINOR, open] Baseline leaks "confirmToken" in speech** ("Could you
   provide the confirmToken?"). Implementation detail must never reach voice.
4. **[MINOR, open] Duplicate rules across columns.** Each column agent
   independently stores the same rule (2× peanut allergy). Harmless but noisy;
   consider dedupe on (profile, kind, payload).
5. **[MINOR, open] Free-form device names miss twin keys** ("kitchen light"
   vs `kitchen_light`) → truth shows unknown. Forge still reports honestly.
   Consider name normalization in the device tool.
6. **[ENV, not a bug] OpenRouter 50/day quota died mid-session** (`429
   free-models-per-day`). Replay mode is the cover; recordings exist.

## "No rules yet stored" verdict

**Not a bug.** The report came from a session where `remember_rule` had never
run — truth confirmed zero rules, and the assistants answered correctly. After
storing rules in a fresh session, both columns used them (dinner test) and
`forget_memory` found them. UX gap only: the empty-store reply doesn't invite
the user to store one ("tell me a rule to remember").

## Blocked on deploy

Production still runs pre-fix code: re-run flows 9–10 via `/mcp` after PR #11
merges + Render redeploys. `npm run smoke` covers the shape; the blocked-
thermostat assertion is the proof.
