# Custos World-Class Hackathon Demo Plan

## Product thesis

**An assistant saying “Done” is not evidence that the job was done.** Assistants can forget persistent context, violate standing rules, or confidently report success when the underlying system did not change. Custos should make that failure visible, then demonstrate a better contract: remember the rule, check it before acting, execute through tools, verify the result, and leave an auditable receipt.

The demo should sell the pain before selling the implementation. A judge should understand the consequence of unreliable automation in seconds, then see how Custos closes the gap.

## Desired end state

One request, one run, one side-by-side comparison. No staged “beats”, introductory greeting, manual prompt-pasting, or narrator explaining what the interface should already make obvious.

Prompt:

> Make coffee for me at 8am, turn on the hall light 5 minutes before my daughter is back from school, and prepare dinner for me and my daughter.

Standing rules visible throughout:

- Maya's school ends at 1:30 PM, so the hall-light schedule must be 1:25 PM.
- Maya has a beef allergy, so the dinner plan must exclude beef.

Baseline (clearly labeled as a controlled simulation, not a validated Alexa+ integration): forgets or misapplies relevant context, completes only part of the request, claims “Done!” without adequate proof, and provides no meaningful receipt trail.

Custos: applies stored rules, handles each task or clearly reports a limitation, verifies what the simulator can actually verify, records receipts, and summarizes only supported outcomes.

Target spoken summary, only when all underlying outcomes support it:

> Coffee scheduled 8am, hall light 1:25pm, dinner planned — beef excluded.

If an action fails or remains unverified, the summary must say so instead of using this success line.

## Principles that cannot be traded away

1. **Truth over theatre.** Never present a plan as executed, a scheduling acknowledgement as device-state verification, or a simulated device as physical.
2. **One shared request, equivalent starting conditions.** Baseline and Custos need separate state snapshots seeded from the same fixture.
3. **Evidence close to the claim.** Show each action, status, relevant rule, verification result, and receipt together.
4. **Fast comprehension.** The first viewport should explain the pain, rules, and contrast without a walkthrough.
5. **No competitor overclaim.** Label baseline behavior as scripted/simulated. Do not imply a live Alexa+ integration or empirical benchmark unless one exists.
6. **Keep the product real.** Preserve MCP tools, policy enforcement, adapters, receipts, and ground-truth reads. Do not replace core behavior with frontend-only success states.

## Multi-phase execution plan

### Phase 0 — Safety and UI foundation (started in this branch)

- [x] Fail closed when a tool returns an unknown or missing outcome; unknown is not success.
- [x] Add regression tests for unknown/missing tool outcomes.
- [x] Remove opacity-based fading from important result content.
- [x] Give the header a viewport-wide surface while aligning contents to the page grid.
- [x] Put ground truth/standing rules adjacent to assistant columns.
- [x] Apply consistent restrained shadows to requested card surfaces.
- [x] Give each demo browser session an isolated guest identity instead of seeding the shared `demo` user.
- [ ] Run tests, lint, typecheck, and build in a local checkout; GitHub API editing cannot execute them.

### Phase 1 — Canonical showcase scenario and policy coverage

- Create a dedicated showcase fixture rather than silently breaking existing theater fixtures.
- Represent Maya's beef allergy in the typed constraint model and ingredient ontology; test direct terms and compounds such as beef, ground beef, beef broth, and beef-free labels.
- Persist Maya's school end time and five-minute lead-time rule as explicit, inspectable household context.
- Test that the seeded rule is actually loaded by policy. Displayed facts must not be described as enforced constraints.
- Keep existing peanut/thermostat theater scenarios as regression fixtures until the new scenario passes end-to-end tests.

### Phase 2 — Real scheduling semantics

- Add a typed scheduled-action model with tenant-scoped Store interface, MemoryStore implementation, Supabase implementation, and migration.
- Add a tool for future device actions. A reminder notification is not a device schedule.
- Persist target, desired state, timezone, local scheduled time, normalized instant, status, idempotency key, creator/run ID, and creation time.
- Verify schedule persistence immediately; when a simulated scheduled action runs, verify the device twin's resulting state separately.
- Model statuses explicitly: planned, scheduled, executed, verified, unverified, blocked, failed, and cancelled.
- Test timezone conversion, invalid/past times, duplicates, policy enforcement, tenant isolation, and schedule-vs-execution-vs-verification.
- Never claim a physical light or coffee maker changed state. Label the twin as simulated.

### Phase 3 — Single-run A/B orchestration

- Replace the multi-beat play sequence with one primary “Run comparison” action.
- Create isolated demo users from the same fixture: one for baseline and one for Custos. Never reset one mutable household between runs.
- Execute both paths from the same prompt and collect independent transcripts, state, assertions, and receipts.
- Make reruns clean: new run ID, fresh fixture state, no leftover receipts.
- Add loading, timeout, partial failure, retry, and cancellation states.
- Keep a visible disclosure that the baseline is a controlled simulation.

### Phase 4 — Evidence-first interface

Desktop:
- Full-width header with brand, run control, and compact status.
- One shared prompt card.
- Three-column workspace: standing rules, baseline, Custos.
- Custos receipts and verification evidence inside its column; independent ground truth remains available.
- Outcome first, task rows second, receipts and raw traces expandable.

Mobile:
- Shared prompt, rules, Custos result first, baseline second.
- No horizontal overflow, clipped receipts, or critical hover-only information.

Visual system:
- Deep-ink text throughout; no faint metadata or opacity-based dimming.
- Neutral surfaces, restrained accent, clear borders, consistent spacing/radii, and subtle card shadows.
- Status colors always accompanied by text/icons.
- Motion remains reduced-motion aware and never creates decorative wait time.

### Phase 5 — Storytelling and judge experience

1. **Pain:** “The assistant says it is done. Did it remember the rule? Did the action happen?”
2. **Contrast:** show the baseline's missed constraint, incomplete task, or unsupported success claim.
3. **Mechanism:** show the exact standing rule and derive 1:25 PM visibly.
4. **Proof:** show the schedule record, execution/verification status, and receipt.
5. **Payoff:** give a short spoken summary that matches evidence.

Avoid invented metrics, success rates, or unsupported claims about commercial assistants. A reproducible controlled scenario is more credible than a fake benchmark.

### Phase 6 — Verification and release gate

- Unit tests: constraints, matcher, policy, schedule semantics, state folding, verdicts, receipt mapping.
- Integration tests: seed fixture, execute scenario, inspect state and receipts, rerun cleanly.
- Multi-session test: visitors cannot see or overwrite each other's data.
- UI checks: desktop, mobile, loading, success, blocked, failed, unverified, backend unavailable.
- Production build and deployment smoke test.
- Review final diff and retain baseline-simulation disclosures.

## Acceptance criteria

- One click runs the full scenario without manually pasting prompts.
- Both columns start from equivalent but isolated state.
- Rules are visible beside the outcomes.
- The light schedule is 1:25 PM and its derivation is inspectable.
- Dinner excludes beef through a tested policy path.
- Future scheduling is a persisted schedule record, not a reminder or text-only claim.
- UI differentiates scheduled, executed, and verified.
- Receipts come from execution and cross-check against independent state.
- Spoken summary is generated from observed results and never overclaims.
- Baseline is labeled simulated; no real Alexa+ integration is implied.
- Tests and build pass in an executable checkout.

## Risk register

| Risk | Mitigation |
|---|---|
| UI claims a schedule exists when only a reminder was created | Dedicated scheduled-action model and tool |
| Displayed rules are not enforced | Typed schema, fixture seeding, policy assertions |
| Baseline and Custos contaminate each other's state | Isolated tenants and equivalent fixture fingerprints |
| Unknown outcomes look successful | Fail-closed state folding and regression tests |
| Demo overstates Alexa+ behavior | Simulation disclosure; no empirical claims |
| Polished demo fails on stage | Deterministic fixture, smoke test, graceful error state |

## Scope control

Do not rewrite the whole app, replace MCP with a mock UI, add unrelated analytics, or polish decorative animation before scheduling and evidence paths are correct. Fix behavior and story first; finish visual polish after.
