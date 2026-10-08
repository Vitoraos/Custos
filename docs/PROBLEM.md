# The problem (corrected)

Alexa+ **does** have memory — Amazon documents "Remember This" ("I'm
vegetarian" sticks). What it lacks is everything that makes memory
trustworthy. All failure patterns below are **illustrations** of widely
reported behaviors (review press, forums, social threads), not recordings.

## What memory without enforcement looks like

1. **Remembered but not obeyed.** "I'm vegan" is stored; dinner for four comes
   back with chicken alfredo. Nothing at the tool boundary checks the rule, so
   obedience depends on the model's mood that turn —Silent correction loops
   ("I said vegan" -> chicken again) are the signature.
2. **"Done!" while the light is still off.** The assistant reports the ack, not
   the world. No read-back, no retry, no receipt — the failure is silent and
   the user finds out by walking into a dark kitchen.
3. **No receipt, no recourse.** Why this recipe? Which rules were checked? No
   record exists. There is no voice-forget of a single entry ("forget my
   peanut allergy" goes nowhere precise), and notes are visible to anyone
   signed into the device.
4. **No quarantine for untrusted content.** A headline or recipe blog can
   plausibly talk the assistant into relaxing a rule, and nothing structural
   stops it.

## The pattern underneath

All four share one root cause: **memory without enforcement, action without
verification, decisions without receipts.** A bigger context window or another
"remember this" toggle fixes none of them — the fix has to sit at the tool
boundary, in code, not in the prompt.

## How ContextForge answers

| Gap | Mechanism (all in `src/`, tested) |
|---|---|
| Not obeyed | Policy engine: typed constraints (EU-14 allergens, diets, quiet hours, limits, confirm-required) evaluated on every action; violating tools return `blocked` + reasons even if the LLM ignores memory |
| "Done!" while off | `runAction`: act -> independent read-back -> one retry -> `verified` / `verified_after_retry` / honest `unverified` |
| No receipt/recourse | Every action persists decision + expectation + observation; `explain_last_action` reads it back; `forget_memory` deletes with verified re-query; high-risk steps need `confirm_action` |
| Untrusted content | `untrusted` flag; external content can never write rules (`pending_confirmation`, ignored by policy); measured in benchmark family S4 (injection success 0/3) |

Numbers: `bench/results/report.md` (L1 oracle harness, seeded, CIs published,
limits documented in `docs/BENCHMARK.md`).
