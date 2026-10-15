# Custos benchmark

**Purpose:** evaluate whether policy enforcement and action verification reduce silent failures and constraint violations compared with a memory-only baseline.

> **Interpretation first:** the published numbers below come from a seeded L1 oracle harness, not a live Alexa+ deployment. They establish behavior under the benchmark's assumptions; they do not establish real-world safety or generalization.

## Executive summary

Run: **L1 oracle harness · seed 7 · 9 October 2026**

| Metric | Custos: guard + verification + receipts | Baseline: memory + raw acknowledgements |
|---|---:|---:|
| Silent failures | 0 / 156 (0.0%) | 49 / 156 (31.4%) |
| Constraint violations | 0 / 204 (0.0%) | 204 / 204 (100.0%) |
| False blocks | 0 / 576 (0.0%) | 0 / 576 (0.0%) |
| Injected faults recovered by retry | 6 / 120 (5.0%) | 0 / 120 (0.0%) |
| Unverified outcomes reported honestly | 13 / 13 (100.0%) | Not applicable |
| Untrusted rule-write attempts accepted | 0 / 3 (0.0%) | 0 / 3 (0.0%) |
| S1 latency, p50 / p95 | 309 / 4,442 ms | 0 / 1 ms |

The rate estimates for silent failures, constraint violations and false blocks use Wilson 95% confidence intervals. The corresponding intervals for the Custos and baseline results are:

| Metric | Custos, 95% CI | Baseline, 95% CI |
|---|---:|---:|
| Silent-failure rate | 0.0–2.4% | 24.6–39.1% |
| Constraint-violation rate | 0.0–1.8% | 98.2–100.0% |
| False-block rate | 0.0–0.7% | 0.0–0.7% |

Raw run output: [`bench/results/2026-10-09.json`](../bench/results/2026-10-09.json) · [Earlier run](../bench/results/2026-10-08.json) · [Generated report](../bench/results/report.md) · [Chart](../bench/results/chart.svg)

## What the benchmark tests

We send the same simulated household tasks through two configurations using the same task definitions and fault seeds:

- **Custos:** policy checks at the tool boundary, action execution, independent state read-back, retry where appropriate, and an action receipt.
- **Baseline:** memory tools remain available, but actions return raw acknowledgements without the Custos guard and verification path.

The L1 oracle is deterministic: it calls the intended tool with the intended arguments and reports the tool's result. It models the failure mode where an assistant trusts an acknowledgement as proof of success. **It is not a simulation of Alexa+'s actual internal behavior, and it does not use a real LLM to choose tools.**

## Metric definitions

| Metric | Definition | Why it matters |
|---|---|---|
| Silent-failure rate (SFR) | Runs where the assistant reports success (`ok`, `verified`, or `verified_after_retry`) while observed ground truth does not match intent, divided by actionable-intent runs. | Measures false confidence after an action fails. |
| Constraint-violation rate (CVR) | Executed actions that violate a hand-labelled stored rule, divided by opportunities to violate that rule. | Measures whether enforcement prevents a forbidden action. |
| False-block rate (FBR) | Compliant actions incorrectly blocked, divided by compliant opportunities. | Measures the usability cost of fail-closed enforcement. |
| Recovery rate | Injected faults recovered by retry, divided by faults injected. | Measures the faults the retry path can actually repair. |
| Honest-failure rate | Unverified outcomes whose response explicitly discloses non-confirmation, divided by all unverified outcomes. | Measures whether the assistant admits uncertainty instead of claiming success. |
| Injection success | Rule writes from untrusted external content that take effect, divided by injection attempts. | Tests whether untrusted text can alter standing rules. |
| Latency overhead | Wall-clock latency distribution for Custos compared with baseline, reported by task family. | Shows the cost of checks and read-back. |

### Important reading notes

- In L1, the baseline CVR is 100% **by construction**: there is no guard, so the oracle executes every violating opportunity. This tests the structural difference between a guarded and unguarded tool boundary; it is not a measured claim that every real assistant violates every rule.
- The injection sample is only three attempts. Zero successes in three trials is preliminary evidence, not a robust security estimate.
- The 5% recovery rate is not necessarily a failure of the verifier. Some injected faults, such as an offline device, cannot be fixed by retrying. The intended behavior is to disclose an unverified outcome rather than fabricate success.
- Baseline latency near zero reflects the simplified oracle path, not a fair comparison of two equivalent LLM inference workloads.

## Scenario families

| Family | Coverage | Method |
|---|---|---|
| S1 · Device actuation | Device commands under injected faults | Seeded device twin; combinations of fault, device and seed |
| S2 · Constraint adherence | Recipe choices against household rules | Hand-labelled recipe/rule/household cases |
| S3 · Reminders | Scheduling and acceptance verification | Stub transport offline; approximately 20 real ntfy runs when the live benchmark flag is enabled |
| S4 · Untrusted content | Headlines or recipe text attempting to write rules | Attempts to introduce or change rules from untrusted sources |
| S5 · Time and confirmation | Quiet hours, time zones, unlock and purchase flows | Policy cases with time/zone and confirmation requirements |

The dinner-planning sequence that connects pantry, shopping list and weather is evaluated qualitatively in the L2 agent run; it is not a standalone quantitative metric family here.

## Reproduce the results

From the repository root, with Node.js 22.19.0 or newer:

```bash
npm ci
npm run bench -- --quick
npm run bench:report
```

The benchmark runner is `bench/run.ts`; report generation is `bench/report.ts`. Inspect the generated JSON and report alongside this document. For LLM-driven evaluation, see the `bench:llm` script and configure the model-provider environment variables; model-based runs are subject to provider quotas and variability.

> Re-run commands can generate new output. The table above describes the recorded 9 October 2026 run, not a guarantee that a fresh run will reproduce identical timings or counts.

## Limitations and next steps

1. **Oracle validity:** L1 evaluates a deterministic acknowledgement-trusting behavior, not a real assistant's full reasoning or tool selection.
2. **Device realism:** the device twin cannot reproduce all network, firmware or hardware failures.
3. **Small security sample:** three injection attempts are far too few to characterize adversarial robustness.
4. **Food constraints:** ingredient matching relies on names and heuristics; it is not a substitute for medical or allergen-safety systems.
5. **External services:** ntfy, weather, recipe and model-provider behavior may differ by network, quota and service state.
6. **L2 scope:** only a small number of model-driven runs have been evaluated; those results are qualitative and model-specific.

Next, the evaluation should expand the injection corpus, add more seeds and household combinations, publish repeated L2 results with model/version details, and compare latency against a baseline with equivalent model inference.

## Plain-language takeaway

In this controlled test, Custos prevented the oracle from reporting unverified actions as successful and blocked the labelled rule-violating actions. The unguarded baseline produced silent failures under the injected-fault scenarios and executed all violating opportunities by design. The trade-off is added time for policy checks and verification. These findings justify further testing; they do not prove that Custos makes a real-world assistant safe.
