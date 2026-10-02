# Friction Log — ContextForge

> A running diary of everything that slowed this build down, written for humans: what we expected,
> what actually happened, and how we got past it. Newest entries first. This log doubles as the draft
> for the submission's "product feedback for every tool/API/SDK used" section.

---

## Oct 2 — Simplification: OpenRouter-only, Cloudflare deleted, external keep-alive

Three cuts in one commit, all in the direction of less to own. First, the four-provider pool collapsed to
a single OpenRouter endpoint. The pool existed to dodge the 50-request daily free cap, but it quadrupled
key management and every take behaved slightly differently per provider; with twenty days for retakes, one
provider at ~25 live workflows a day plus the quota-free replay is the calmer setup. `providers.ts` shrank
to thirty lines, and `runWithFallback` kept its name and return shape so `workflow.ts` never noticed —
though the rename is now a small lie we kept deliberately to avoid churn. The `usage` export died with the
pool, which broke `execute_workflow.ts` exactly once (`TS2305`); removing the import and the `usage` spread
fixed it, and the type checker confirmed the rest.

Second, Cloudflare left the project entirely. Its API credentials existed only for Workers AI, which died
with the pool, so the whole `infra/cloudflare/` tree followed — and with it the `wrangler` and tunnel
references in the docs. The keep-alive cron moved to a free cron-job.org ping against `/health` instead of
code, because the GitHub Actions alternative bills a minute per run and would burn through this private
repo's 2,000 free minutes a month around day fourteen. No code, no minutes, no maintenance. Zero time lost
to bugs; the work was all deletion, which is the best kind.

---

## Oct 2 — `npx serve` refused to start (broken local cache, not our code)

I ran `npx serve demo/public -l 3001` to preview the replay page and got a wall of red:
`ERR_MODULE_NOT_FOUND eastasianwidth`, thrown from deep inside `string-width` in the cached `serve`
install. Nothing ever listened on port 3001. The demo files were fine — the package manager's local
cache had a corrupted copy of `serve`, so this was purely environmental.

Rather than fight the cache, I verified all four assets (index.html, app.js, style.css,
demo-fixtures.json) serve HTTP 200 using a small Node built-in static server. If `serve` still
misbehaves at recording time, clearing the npx cache or pinning `serve` as a dev dependency will fix it.
About ten minutes lost, minor severity.

## Oct 2 — Streamable HTTP rejected my test request (my bug, and a useful lesson)

My first raw-HTTP smoke test of the MCP server came back with
`4002/-32000 "Not Acceptable: Client must accept both application/json and text/event-stream"`.
For a moment I suspected the server — but no, I had simply forgotten the `Accept` header. Streamable HTTP
delivers responses as Server-Sent Events (`event: message` frames), so the server rightly insists clients
declare they accept both JSON and event streams.

The fix is a one-liner: always send `Accept: application/json, text/event-stream` and parse the `data:`
line out of the SSE frame. Real Alexa+ clients already do this, so it will never bite in production — but
anyone hand-rolling MCP HTTP calls will hit the same wall. Five minutes lost, minor.

## Oct 2 — Hardening the workflow runner beyond the spec

The v2 spec's `workflow.ts` worked as written, but reading it with adversarial eyes turned up three soft
spots. First, `runStep` was private, so the retry and remediation paths couldn't be tested. Second, a
planner running on a weak free model can hallucinate a tool name, which would have crashed the executor
with a TypeError instead of degrading gracefully. Third, the spec used the Zod v3 idiom
`z.record(z.any())`, and we had already moved to Zod v4.

I exported the `Step`/`Trace` types and `checkPreferences`, made unknown tool names produce an error trace
the verifier can see (instead of a crash), and switched to the v4 two-argument `z.record(z.string(), …)`
form. Verification was satisfying: a poisoned recipe produced exactly 1 violation, the retry produced 0,
and peanut, bad-JSON, error-step, and non-recipe edge cases all came back clean with zero false positives.
Five minutes, minor.

## Oct 2 — Resolving the spec's open question on reading Strands results

The v2 spec carried an honest `VERIFY` marker: nobody had confirmed how to extract text from a Strands
`invoke()` result in our SDK version — the draft used `String(result)` on faith. Digging into the
installed `@strands-agents/sdk` 1.19.0 type definitions settled it: `AgentResult` has a `toString()`
method that returns interrupts or structured output as JSON when present, and otherwise joins the text
blocks. So the spec's guess was right, and I made it explicit — `providers.ts` now calls
`result.toString()`, with a comment recording the SDK version so the next person doesn't re-derive it.
Ten minutes of reading type definitions, minor.

## Oct 1 — Dependency resolution blew up on install day

The very first `npm install` failed outright: `@strands-agents/sdk@1.19.0` requires `zod@^4.1.12` as a peer,
while our spec manifest pinned `zod@^3.0.0` — and `@modelcontextprotocol/sdk` and `openai` agreed with
Strands, not us. The resolver refused to proceed (`ERESOLVE`), so nothing installed at all.

The way forward was to side with the ecosystem over the spec: bump `zod` to `^4.1.12` (4.6.5 installed),
then run `npm ls` and pin everything the resolver settled on — fastmcp 4.22.1, SDK 1.19.0, openai 6.49.0,
supabase-js 2.117.2, tsx 4.23.15, TypeScript 5.9.3. Zod v4 stayed backward compatible for all our
`z.object` schemas, and the later tool-registry tests confirmed it. Between the conflict and a first
install attempt that hit the shell timeout (retry took 37 seconds), this cost about eleven minutes — the
only major-severity entry of the build, and a lesson in pinning versions early.

## Oct 1 — The spec's file paths didn't exist on Windows

`update_spec.py` arrived with hardcoded Linux paths (`/mnt/user-data/uploads/…`, `/mnt/user-data/outputs/…`),
and the spec file itself carries an em dash in its name (`ContextForge — …`), which shows up as a `�`
replacement character in this machine's default encoding. Running the script as-is died immediately with
`FileNotFoundError`.

I renamed it to `tools/generate_v2_spec.py`, made it resolve paths from its own location, and — since the
exact Unicode filename is a trap for every future script — made it auto-detect the first non-v2 Markdown
file in `docs/spec/` instead of naming the file at all. It now prints `written 1729 lines, MISSING: []`,
which is exactly what you want to see from a migration script. Ten minutes, major, and a standing rule for
hackathon starters: relative paths, ASCII-safe filenames.

## Oct 1 — Three spec bugs caught before they could bite (all pre-build)

The v1 spec, the seed file's own comments, and the migration script triangulated three defects before a
single line of project code existed — the cheapest possible time to find them:

**A phantom column.** The schema indexed `workflow_executions(user_id, created_at DESC)`, but the table
has `started_at` and no `created_at` at all. Running that `CREATE INDEX` would have failed on first
contact with Supabase. The v2 schema indexes `started_at` instead (`infra/schema.sql`). Would have been a
blocker; cost us zero minutes.

**Alphabetical priorities.** Ordering conversation context by the text column `priority DESC` sorts
*medium > low > high* — exactly backwards from intent. The v2 schema adds a generated `priority_rank`
column (high=3, medium=2, low=1) and sorts on that; a live query later confirmed `priority_rank=3` comes
back first. Major if uncaught; zero minutes.

**A wrong weather URL.** The original `wttr.in` call embedded units in the format string (`?format=u3`),
but units are a separate query flag (`?format=3&u` vs `&m`) — the format string only controls layout.
Fixed in `src/agent/tools.ts`. Minor; zero minutes.

## Oct 1 — The Strands TypeScript SDK had no `createHarness` (spec relied on it)

This was the highest-stakes discovery of the project. The v1 spec built everything around
`createHarness()` from `@strands-agents/harness` with `provider: 'litellm'` — but LiteLLM is a
Python-only provider, and that package and function simply don't exist in the TypeScript SDK. Had we
coded to the spec, nothing would have compiled.

About twenty minutes in the Strands docs (especially the OpenAI provider page) revealed the intended
route: the TypeScript SDK reaches any OpenAI-compatible endpoint through `OpenAIModel` with a custom
`clientConfig: { baseURL }`. So `src/agent/providers.ts` uses one model class pointed at four different
base URLs, with `runWithFallback()` rotating across them. Blocker severity, resolved by reading the
actual SDK instead of trusting the draft. Feedback for the spec authors: verify imports against the
installed package before finalizing.

## Oct 1 — OpenRouter's free tier couldn't carry a development cycle

The v1 plan assumed a single OpenRouter key would cover the whole build. The numbers say otherwise: 20
requests per minute, **50 per day** (1,000 only after a $10 lifetime purchase), failed requests counting
against the quota — while a single v1-style workflow burned roughly 8–10 LLM calls. One enthusiastic
afternoon of testing would have ended development for the day.

That constraint reshaped the architecture (the v2 redesign): a provider pool of Groq (30/min, 1,000/day)
→ Cloudflare Workers AI (10,000 neurons/day) → Gemini → OpenRouter last, with automatic fallback; a
deterministic executor that cut cost to 2 LLM calls per workflow; and `DEMO_MODE` plus the static replay
page so recording never spends a single LLM call. Fifteen minutes of quota research that paid for the
whole project. Blocker severity. Feedback for OpenRouter: the limits page is admirably precise — more
providers should document free tiers this clearly.

---

## How to add an entry

When something costs you more than five minutes, add a section at the top in this same voice: date and
tool as the heading, then what you expected, what actually happened (paste the error verbatim), how you
got past it, roughly how long it took, and — when the friction belongs to an upstream tool — what you'd
tell its authors. Future-you, the judges, and the submission's product-feedback section will all thank you.
