# The Problem ContextForge Solves — and Where It Came From

> Every claim below traces to user-reported Alexa+ failures gathered during research
> (Wirecutter reviews, Hacker News threads, PCMag, Amazon Forums, and leaked internal
> Amazon testing reports — see full links in `docs/spec/ContextForge v2.md` §14).
> The failure dialogues in this file and in the demo are an **illustrative simulation of
> reported failure patterns, not recordings of real Alexa+ output** — the demo labels them as such.

---

## 1. What users kept reporting

Four complaints surfaced across every source, in roughly this order of frequency:

### 1.1 "It can't remember me" — preference amnesia (the #1 complaint)

Users state a preference — diet, music taste, wake time, thermostat setting — and Alexa+ behaves as if
the sentence was never spoken. Not just across weeks: **within the same conversation**. The demo's F1
scene compresses dozens of such reports into thirty seconds:

> **User:** "Alexa, I'm vegan. Plan dinner for 4 people."
> **Alexa+:** "Great! How about a juicy steak dinner for 4? I can add ribeyes to your cart."
> **User:** "I said I'm vegan."
> **Alexa+:** "Sorry about that! How about grilled lemon-herb chicken?"

The second suggestion proves the failure is architectural, not a speech-recognition hiccup: the correction
itself is also forgotten one turn later. Forum threads describe the same loop with allergies — where the
stakes are medical, not just annoying — plus music taste, preferred units, and smart-home defaults.

### 1.2 "Every session starts from zero" — no cross-session memory (the #2 complaint)

Ask the next day what was discussed yesterday and the answer is a flat denial (demo scene F2):

> **User:** "Alexa, what did I ask you to remember yesterday?"
> **Alexa+:** "I don't have any stored preferences."

No other mainstream assistant ships this way in 2026. Users compare Alexa+ unfavorably not only with rival
assistants but with **classic Alexa**, which at least remembered alarms, lists, and routines. Internal
testing leaks describe the behavior as "unbearably erratic" — the system behaves as if each utterance arrives
in a vacuum.

### 1.3 "It does one thing and stops" — no multi-step orchestration

A morning routine — *wake me at 7, start the coffee maker, read the headlines, tell me the weather* — is a
single sentence for a human and four coordinated actions for a machine. Alexa+ performs the first and stalls
(demo scene F3):

> **User:** "Alexa, plan my morning: wake me at 7, start the coffee maker, read me the top 3 headlines, and tell me the weather."
> **Alexa+:** "I can set an alarm for 7 AM. What else would you like?"

Follow-ups fare no better: asked to start the coffee maker, it offers *a reminder to make coffee* instead of
acting. Users report the same ceiling on shopping lists, trip planning, and smart-home scenes — anything that
requires chaining two or more capabilities.

### 1.4 "Let me finish a sentence in peace" — verbosity and upselling

Unprompted commentary, jokes, and Prime/product pitches ride along with answers. Our seed data carries a
standing instruction — *"Keep answers short. No jokes or upselling"* — precisely because users kept asking for
a way to say exactly that, and there was nowhere for such an instruction to live.

---

## 2. The pattern underneath

Complaints 1.1–1.4 look unrelated, but they share one root cause: **Alexa+ interactions are stateless**.
Nothing the user says is written to durable memory with a schema, so nothing can be recalled, constrained
against, or chained across:

| Complaint | Missing capability |
|-----------|--------------------|
| Forgets preferences mid-conversation | Durable key-value memory with categories |
| No cross-session recall | Timestamped context + standing instructions that outlive the session |
| One-step ceiling | A planner that decomposes requests and an executor that runs each step |
| Verbosity no one can switch off | A stored instruction the responder is forced to respect |

Any fix that addresses only one row — a "remember my diet" toggle, a bigger context window — leaves the other
three standing. The fix has to be a **memory + orchestration layer**, not a feature.

## 3. How ContextForge answers each complaint

| User complaint | ContextForge mechanism | Demo proof |
|----------------|------------------------|------------|
| "I'm vegan" ignored | `store_preference` persists `diet=vegan`; the planner receives all preferences as **hard constraints**; a rule-checker rejects any recipe whose `contains[]` violates them | S1: Pasta Primavera planned, peanut-free confirmed |
| "It remembers nothing" | Preferences + timestamped `conversation_context` (optional TTL) + `user_instructions` in Supabase; `get_memory_summary` reads all three plus recent runs | S3 (next day, fresh session): diet, allergy, jazz, 7 AM, yesterday's dinner — all recalled |
| "One step and stops" | `execute_workflow`: planner → deterministic executor (retries + backoff) → rule check → verifier; results persisted back to memory | S4: one sentence → alarm + coffee + 3 headlines + weather, all verified |
| "Too chatty" | Standing instruction stored once (`kind: 'instruction'`), loaded into every plan and summary | Seed: *"Keep answers short. No jokes or upselling."* (critical priority) |
| "What if it still gets it wrong?" | Resilience scenes: verifier rejects bad output and forces a retry (R1); transient 503/429 retried silently (R2) | R1: Chicken Alfredo rejected → Chickpea Curry; R2: 9 items added after 1 retry |

## 4. Why this matters beyond the hackathon

- **Audience**: every Alexa+ user who has repeated a preference twice — measured in the millions across the cited sources, not a niche.
- **Deployability**: the fix is a self-hosted MCP server, not a fork of Alexa+. It can ship as an Alexa+ Agent Skill or MCP endpoint, adoptable without retraining anything.
- **Cost**: the entire layer runs on free tiers ($0.00/month, no payment method), so "memory for everyone" is an operational choice, not a pricing tier.
- **Trust**: preference enforcement is deterministic code (the `contains[]` rule check), not a prompt wish. The LLM proposes; the rules dispose. Allergy handling in particular should never depend on a model's mood.

---

*Research sources: `docs/spec/ContextForge v2.md` §14 · Failure/success fixtures: `demo/public/demo-fixtures.json` ·
Live memory schema: `infra/schema.sql` · Recall demo: scenes S1–S4 in `demo/public/index.html`.*
