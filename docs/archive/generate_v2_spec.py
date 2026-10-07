import re, shutil, sys

from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
_cands = [p for p in (ROOT / "docs" / "spec").glob("*.md") if "v2" not in p.name.lower()]
SRC = str(_cands[0]) if _cands else str(ROOT / "docs" / "spec" / "spec.md")
DST = str(ROOT / "docs" / "spec" / "ContextForge v2.md")

text = open(SRC, encoding="utf-8").read()
missing = []


def rep(old, new, regex=False, count=1):
    global text
    if regex:
        if not re.search(old, text, flags=re.S):
            missing.append(old[:70]); return
        text = re.sub(old, lambda m: new, text, count=count, flags=re.S)
    else:
        if old not in text:
            missing.append(old[:70]); return
        text = text.replace(old, new, count)


def between(start, end, new):
    """Replace from start marker (inclusive) up to end marker (exclusive)."""
    global text
    i = text.find(start)
    if i < 0:
        missing.append("START " + start[:60]); return
    j = text.find(end, i + len(start))
    if j < 0:
        missing.append("END " + end[:60]); return
    text = text[:i] + new + text[j:]


# ---------------------------------------------------------------- changelog
CHANGELOG = r"""
## CHANGELOG: v2 (Oct 1, 2026)

Stack revised for development speed and free-tier survival.

| # | Change | Why |
|---|--------|-----|
| 1 | LLM: single OpenRouter key → **free provider pool** (Groq, Cloudflare Workers AI, Gemini, OpenRouter) with automatic fallback | OpenRouter free = 50 requests/day (1,000 after a one-time $10 purchase) and failed requests count. One v1 workflow used ~8-10 calls. |
| 2 | Executor is now **plain TypeScript** (no LLM). Planner and verifier stay Strands agents; a rule-based preference check runs before the LLM verifier | 2 LLM calls per workflow instead of ~8-10; deterministic tool calls; much more reliable on free models |
| 3 | Strands code: `createHarness`, `@strands-agents/harness` and `provider: 'litellm'` removed → `Agent` + `OpenAIModel` pointed at OpenAI-compatible endpoints | LiteLLM is Python-only; the OpenAI provider is the documented route for OpenRouter-style endpoints |
| 4 | **Cloudflare added**: keep-warm cron, tunnel for local dev, static hosting for the demo, optional AI Gateway | Render free spins down after 15 min (~1 min cold start) |
| 5 | Demo simulator: Express + live LLM → **static fixture replay** (`demo-fixtures.json`) | Zero rate-limit or cold-start risk while recording |
| 6 | S3 session storage removed (in-memory sessions) | S3 needs an AWS account with a payment method, which contradicts the $0 claim |
| 7 | Schema fixes: `idx_executions_user` referenced a non-existent `created_at`; context priority sorted alphabetically (added `priority_rank`) | The first would fail; the second mis-orders results |
| 8 | Other fixes: wttr.in URL, missing `typescript` devDependency, missing `demo` npm script, Render `PORT`, undefined `get_news` tool, no write path for `user_instructions` | Sections 3, 4, 5.3, 6.3, 9 |

**Verify before relying on (not confirmed from docs):** FastMCP version and `health` option; how to read text from a Strands `invoke()` result in your SDK version; whether Strands runs on Cloudflare Workers; Alexa+ authentication support for custom MCP servers; current free-tier limits (they change often); official AWS Builder wording ("Kiro" vs "Kiro Crew").

---
"""
i = text.index("---\n")  # first horizontal rule, right after the title block
text = text[: i + 4] + CHANGELOG + text[i + 4:]

# ---------------------------------------------------------------- section 1
rep("- **Multi-agent orchestration** — a Planner → Executor → Verifier pipeline using Strands Agents SDK",
    "- **Plan → Execute → Verify pipeline** — Strands-powered planner and verifier agents around a deterministic executor")
rep("- **OpenRouter LLM integration** — free models for reasoning, tool use, and natural language understanding",
    "- **Free multi-provider LLM pool** — Groq, Cloudflare Workers AI, Gemini and OpenRouter free tiers with automatic fallback")

rep(r"(\| 3 \| Create Render account[^\n]*\n)",
    "\\1| 3b | Create Cloudflare account; get Groq and Gemini API keys | 15 min | Keep-warm cron, tunnel, demo hosting, extra free LLM quota. See Sections 1.5.6-1.5.7 |\n",
    regex=True)
rep(r"(Use `:exacto` suffix for models optimized for tool-calling quality\.)",
    "\\1\n\n**v2 warning:** 50 requests/day is far too little for development. Failed requests count against it. Treat OpenRouter as the *last* fallback and see Section 1.5.6.",
    regex=True)

between("### 1.5.5 Free Stack Cost Summary", "---\n\n## 2. TECHNICAL ARCHITECTURE", r"""### 1.5.5 Free Stack Cost Summary

| Layer | Service | Cost | Payment Required |
|-------|---------|------|------------------|
| LLM | Provider pool: Groq, Cloudflare Workers AI, Gemini, OpenRouter (free tiers) | $0 | No (OpenRouter's 1,000/day tier needs a one-time $10, optional) |
| Database | Supabase (PostgreSQL) | $0 | No |
| MCP hosting | Render free web service | $0 | No |
| Keep-warm, tunnel, demo hosting | Cloudflare (Workers cron, cloudflared, static assets) | $0 | No |
| MCP Server | FastMCP (open source) | $0 | No |
| Agent Framework | Strands SDK (open source) | $0 | No |
| MCP Testing | MCP Inspector | $0 | No |
| AWS Builder Qualification | Strands SDK + Kiro (confirm wording in the rules) | $0 | No |
| **Total** | | **$0** | **No payment method needed** |

### 1.5.6 LLM Budget and Provider Pool

Free LLM quota is the main constraint on this build. Re-check every number below before relying on it; free tiers change often.

| Provider | Free limit (as of Oct 2026 sources) | Notes |
|----------|-------------------------------------|-------|
| OpenRouter (`:free` models) | 20 req/min; 50 req/day, or 1,000/day after a lifetime $10 purchase | Failed requests count. Negative balance blocks free models. |
| Groq (`openai/gpt-oss-120b`) | 30 req/min, 1,000 req/day, 200K tokens/day | Limits are per model |
| Cloudflare Workers AI | 10,000 neurons/day, shared across models, resets 00:00 UTC | Large models burn neurons faster. Models get deprecated, so run `npx wrangler ai models list`. |
| Google Gemini API | Free tier on selected models | Check AI Studio for current limits and model names |

**Design rules that follow from this:**

1. **Two LLM calls per workflow** (planner, verifier). The executor is plain code. A retry adds one more verifier call.
2. **Fallback order:** Groq → Workers AI → Gemini → OpenRouter, rotating on 429 and 5xx.
3. **DEMO_MODE** (Section 6.3) and the static replay simulator (Section 7.3) mean the recorded demo never depends on a live model.
4. **Log provider usage** per request so you can see which quota you are burning.
5. **Budget math:** 2 calls × ~15 test runs/hour = ~30 calls/hour. Spread over four providers, that fits comfortably in a day of development.

### 1.5.7 Cloudflare Add-Ons (all free plan)

| Add-on | What it does | Dev time |
|--------|--------------|----------|
| Cron Trigger keep-alive | Pings Render's `/health` every 10 min so Alexa+ never hits a cold start (Section 9.4) | 10 min |
| `cloudflared` quick tunnel | Gives your localhost an https URL so you can test Alexa+ without deploying (Section 9.4) | 5 min |
| Static assets hosting | Hosts the replay demo page at a public URL | 10 min |
| Workers AI | Extra free LLM quota via an OpenAI-compatible endpoint (provider pool) | 15 min |
| AI Gateway (optional) | Request logging, caching and fallback in front of any provider. Confirm which features are free for you. | 20 min |
| Workers hosting for the MCP server (optional) | `createMcpHandler` serves Streamable HTTP on Workers with no cold starts. **Unverified:** whether Strands runs on Workers. Spend 30 minutes on a hello-world with `nodejs_compat` before committing. | 30 min spike |

"""  )

# ---------------------------------------------------------------- section 2
rep("S3 session storage (Strands built-in)", "In-memory sessions (Strands built-in)")
rep("createHarness", "Agent + loop ")
rep("(via OpenRouter)     ", "(provider pool)      ")
rep("Free models          ", "Free model pool      ")
rep("OPENROUTER INTEGRATION", "LLM PROVIDER POOL     ")
rep("AWS FREE TIER INFRASTRUCTURE", "FREE-TIER INFRASTRUCTURE     ")
rep("→ Strands harness agent receives task:", "→ Planner agent (Strands) receives task:")

# ---------------------------------------------------------------- section 3
between("### 3.1 Complete Dependency Manifest", "### 3.2 Stack Justification", r"""### 3.1 Complete Dependency Manifest

```json
{
  "name": "contextforge",
  "version": "1.0.0",
  "type": "module",
  "engines": {
    "node": ">=22.19.0"
  },
  "dependencies": {
    "fastmcp": "^4.21.1",
    "@strands-agents/sdk": "latest",
    "openai": "latest",
    "@supabase/supabase-js": "^2.0.0",
    "zod": "^3.0.0"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0"
  },
  "scripts": {
    "dev": "tsx src/index.ts",
    "start": "node dist/index.js",
    "build": "tsc",
    "demo": "npx serve demo/public -l 3001",
    "test": "tsx --test tests/*.test.ts"
  }
}
```

Notes:
- Run `npm ls` after the first install and **pin** the `latest` entries.
- `openai` is an optional dependency of the Strands OpenAI provider. It is what lets one class talk to Groq, Workers AI, Gemini and OpenRouter.
- `@strands-agents/harness` was removed. Use `Agent` from `@strands-agents/sdk`.
- Node 22.19+ is required by MCP Inspector (Section 1.5.4), so the engines field now matches.

""")

between("### 3.2 Stack Justification", "---\n\n## 4. DATA MODEL", r"""### 3.2 Stack Justification

| Layer | Technology | Why This Choice | Cost |
|-------|-----------|----------------|------|
| MCP Server Framework | FastMCP (TypeScript) | Reduces the MCP server to tool definitions; handles Streamable HTTP, sessions, CORS, auth and stateless mode; targets spec 2025-11-25 (hackathon minimum) | $0 |
| Agent Framework | Strands Agents SDK (TypeScript) | Explicitly listed as an AWS Builder qualifying tool; `Agent` + `OpenAIModel` works with any OpenAI-compatible endpoint; a `VercelModel` adapter accepts any Vercel AI SDK provider if you need one; `Graph` and `Swarm` available as stretch goals | $0 (Apache 2.0) |
| LLM | Free provider pool (Groq → Workers AI → Gemini → OpenRouter) | Each free tier is small, but pooled with fallback they cover development. See Section 1.5.6 | $0 |
| Database | Supabase (PostgreSQL) | 500MB free; full SQL; you already know it | $0 |
| MCP hosting | Render (web service) | Free tier, automatic HTTPS, auto-deploy from Git. Spins down after 15 min, so use the keep-alive in Section 9.4 | $0 |
| Edge helpers | Cloudflare (Workers cron, tunnel, static assets) | Keep-warm, localhost-to-https tunnel, demo hosting, extra LLM quota | $0 |
| Session Storage | In-memory (Strands) | Enough for a hackathon demo. S3 would need an AWS account with a payment method | $0 |
| Validation | Zod | Runtime validation shared by FastMCP, the planner/verifier output parsing and the tool registry | $0 |
| Runtime | Node.js 22.19+ | Required by MCP Inspector and Strands TS | $0 |
| AWS Builder Qualification | Strands SDK at runtime + Kiro during development | Confirm exact wording ("Kiro" vs "Kiro Crew") in the official rules | $0 |

#### Strands vs Vercel AI SDK (decision record)

| | Strands TS | Vercel AI SDK |
|---|---|---|
| AWS Builder prize ($5k) | Listed as qualifying | Not listed; would not qualify on its own |
| Maturity | 1.0 shipped ~5 months ago; thinner docs | v6 added `ToolLoopAgent` and MCP client support; larger community |
| OpenRouter / OpenAI-compatible | Yes, via the OpenAI provider with a custom baseURL | Yes, via `createOpenAI({ baseURL })` |
| Interop | `VercelModel` adapter accepts any AI SDK provider | No Strands adapter (open feature request) |

**Decision:** Strands. The Vercel SDK would be slightly quicker to learn, but it likely forfeits the AWS prize, and with only two LLM calls per workflow the framework choice barely affects build time.

""")

# ---------------------------------------------------------------- section 4
rep("  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),\n",
    "  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),\n"
    "  -- v2: text priority sorts alphabetically (high < low < medium). Sort on this column instead.\n"
    "  priority_rank SMALLINT GENERATED ALWAYS AS (\n"
    "    CASE priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END\n"
    "  ) STORED,\n")
rep("CREATE INDEX idx_context_user_priority ON conversation_context(user_id, priority DESC, created_at DESC);",
    "CREATE INDEX idx_context_user_priority ON conversation_context(user_id, priority_rank DESC, created_at DESC);")
rep("CREATE INDEX idx_executions_user ON workflow_executions(user_id, created_at DESC);",
    "-- v2 fix: this table has started_at, not created_at\nCREATE INDEX idx_executions_user ON workflow_executions(user_id, started_at DESC);")
rep("    .order('priority', { ascending: false })\n    .order('created_at', { ascending: false })",
    "    .order('priority_rank', { ascending: false }) // v2: high first\n    .order('created_at', { ascending: false })")

marker = "\n---\n\n## 5. MCP TOOLS SPECIFICATION"
k = text.index(marker)
head = text[:k].rstrip()
assert head.endswith("```")
head = head[:-3].rstrip() + r"""

// v2: write path for standing instructions (see store_context `kind`, Section 5.3)
export async function storeInstruction(
  userId: string,
  instruction: string,
  priority: 'critical' | 'important' | 'nice_to_have' = 'important'
) {
  const { data, error } = await supabase
    .from('user_instructions')
    .insert({ user_id: userId, instruction, priority })
    .select()
  if (error) throw error
  return data[0]
}
```
"""
text = head + "\n" + text[k:]

# ---------------------------------------------------------------- section 5
rep(r'(  output: "Confirmation with stored context ID"\n\}\n```\n)',
    "\\1\n**v2 addition: `kind` (gives `user_instructions` a write path).** Add this field to the schema:\n\n"
    "```typescript\n"
    "    kind: z.enum(['note', 'instruction']).optional()\n"
    "      .describe(\"'instruction' = standing rule for every future interaction \" +\n"
    "        \"(e.g. 'keep answers short'). Stored in user_instructions. Defaults to 'note'.\")\n"
    "```\n\n"
    "When `kind === 'instruction'`, call `storeInstruction()` and map priority low/medium/high to nice_to_have/important/critical. "
    "`get_memory_summary` and `execute_workflow` read active instructions with `getActiveInstructions()`.\n",
    regex=True)

between("**Internal execution flow:**", "**Example response:**", r"""**Internal execution flow (v2):**

```
1. Load preferences, instructions and active context from Supabase       (no LLM)
2. PLANNER (LLM call #1, Strands Agent)
   - Receives task + preferences + instructions + context + tool names
   - Returns a JSON array of steps, validated with Zod
3. EXECUTOR (plain TypeScript, no LLM)
   - For each step: validate input against the tool's Zod schema, run it,
     retry transient errors up to max_retries_per_step with backoff
4. VERIFIER
   a. Rule-based preference check (e.g. diet=vegan vs the recipe's `contains` list)
   b. LLM verification (LLM call #2, Strands Agent) with the rule violations attached
5. If a violation was found and retries remain: re-run the offending step with an
   `exclude` hint, then verify again (one extra LLM call)
6. Store the execution log in Supabase
7. Store relevant context from the execution
8. Return the structured result
```

Typical cost: 2 LLM calls. Worst case with one remediation: 3.

""")

# ---------------------------------------------------------------- section 6
between("### 6.1 Strands Harness Configuration", "### 6.3 Custom Tools for the Executor Agent", r"""### 6.1 Model Provider Pool (Strands `Agent` + `OpenAIModel`)

> **v2 note:** `createHarness()`, `@strands-agents/harness` and `provider: 'litellm'` were removed. LiteLLM is a Python-only provider. In TypeScript, Strands reaches OpenRouter and other OpenAI-compatible endpoints through its OpenAI provider with a custom `baseURL`. Strands also ships a built-in `VercelModel` adapter if you ever need an AI SDK provider.

```typescript
// src/agent/providers.ts
import { Agent } from '@strands-agents/sdk'
import { OpenAIModel } from '@strands-agents/sdk/models/openai'

type Provider = { name: string; baseURL: string; apiKey?: string; modelId: string }

// Order = preference. Every endpoint is OpenAI-compatible, so one class covers all.
const PROVIDERS: Provider[] = [
  { name: 'groq', baseURL: 'https://api.groq.com/openai/v1',
    apiKey: process.env.GROQ_API_KEY,
    modelId: process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b' },
  { name: 'workers-ai',
    baseURL: `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
    apiKey: process.env.CLOUDFLARE_API_TOKEN,
    modelId: process.env.CF_MODEL ?? '@cf/openai/gpt-oss-120b' },        // check `wrangler ai models list`
  { name: 'gemini', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    apiKey: process.env.GEMINI_API_KEY,
    modelId: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash' },            // check AI Studio for current free models
  { name: 'openrouter', baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
    modelId: process.env.OPENROUTER_MODEL ?? 'openrouter/free' },
].filter((p) => p.apiKey)

export const usage: Record<string, number> = {}   // log this to see which quota you are burning

function makeAgent(systemPrompt: string, p: Provider) {
  const model = new OpenAIModel({
    api: 'chat',
    apiKey: p.apiKey,
    clientConfig: { baseURL: p.baseURL },
    modelId: p.modelId,
  })
  return new Agent({ model, systemPrompt })
}

// One prompt, with provider fallback on any error (429, 5xx, bad key, deprecated model).
export async function runWithFallback(systemPrompt: string, prompt: string) {
  const errors: string[] = []
  for (const p of PROVIDERS) {
    try {
      const result = await makeAgent(systemPrompt, p).invoke(prompt)
      usage[p.name] = (usage[p.name] ?? 0) + 1
      // VERIFY: confirm how to read the text from invoke()'s result in your SDK version
      return { text: String(result), provider: p.name, fallbacks: errors }
    } catch (e) {
      errors.push(`${p.name}: ${(e as Error).message}`)
    }
  }
  throw new Error('All LLM providers failed: ' + errors.join(' | '))
}
```

### 6.2 Plan → Execute → Verify Pipeline

Planner and verifier are Strands agents. The executor is plain code. If you later want a visible multi-agent graph for the demo, Strands `Graph` and `Swarm` are available, but do not start there.

```typescript
// src/agent/workflow.ts
import { z } from 'zod'
import { runWithFallback } from './providers.js'
import { TOOLS } from './tools.js'

const Plan = z.array(z.object({
  order: z.number(),
  description: z.string(),
  required_tool: z.string().nullable(),
  expected_input: z.record(z.any()).default({}),
}))

const Verdict = z.object({
  overall_status: z.enum(['completed', 'failed']),
  gaps_found: z.array(z.string()).default([]),
  retry_suggestions: z.array(z.string()).default([]),
  summary: z.string(),
})

const PLANNER = (maxSteps: number) => `You are a task planner for an Alexa+ assistant.
You receive JSON with: task, preferences (hard constraints), instructions, context, tools (names).
Break the task into at most ${maxSteps} ordered steps. Respect ALL preferences.
Reply with ONLY a JSON array, no markdown. Each item:
{"order":1,"description":"...","required_tool":"<tool name or null>","expected_input":{...}}`

const VERIFIER = `You are a verifier for an Alexa+ assistant.
You receive JSON with: task, plan, trace (what each step returned) and rule_violations.
Decide if the task was completed and every preference respected.
Reply with ONLY JSON: {"overall_status":"completed|failed","gaps_found":[],"retry_suggestions":[],"summary":"one short sentence"}`

const parse = <T>(schema: z.ZodType<T>, text: string): T =>
  schema.parse(JSON.parse(text.replace(/```json|```/g, '').trim()))

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Step = z.infer<typeof Plan>[number]
type Trace = { step: number; tool: string | null; attempt: number; status: 'success' | 'error'; output: unknown }

async function runStep(step: Step, maxRetries: number, extra: Record<string, unknown> = {}): Promise<Trace[]> {
  const out: Trace[] = []
  if (!step.required_tool) {
    return [{ step: step.order, tool: null, attempt: 1, status: 'success', output: step.description }]
  }
  const tool = TOOLS[step.required_tool]
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const input = tool.schema.parse({ ...step.expected_input, ...extra })
      out.push({ step: step.order, tool: step.required_tool, attempt, status: 'success', output: await tool.run(input) })
      return out
    } catch (e) {
      out.push({ step: step.order, tool: step.required_tool, attempt, status: 'error', output: (e as Error).message })
      await sleep(800 * attempt)
    }
  }
  return out
}

// Deterministic rules first: cheap, and they make "verifier catches a violation" reliable on free models.
function checkPreferences(prefs: { key: string; value: string }[], trace: Trace[]) {
  const diet = prefs.find((p) => p.key === 'diet')?.value
  const allergies = (prefs.find((p) => p.key === 'allergies')?.value ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const violations: { step: number; reason: string; exclude: string[] }[] = []
  for (const t of trace) {
    if (t.tool !== 'find_recipe' || t.status !== 'success') continue
    let r: any; try { r = JSON.parse(String(t.output)) } catch { continue }
    const contains: string[] = r.contains ?? []
    if (diet === 'vegan' && contains.some((c) => ['meat', 'dairy', 'eggs', 'fish'].includes(c)))
      violations.push({ step: t.step, reason: `${r.recipe_name} contains ${contains.join(', ')}; violates diet=vegan`, exclude: ['meat', 'dairy', 'eggs', 'fish'] })
    for (const a of allergies)
      if (contains.includes(a))
        violations.push({ step: t.step, reason: `${r.recipe_name} contains ${a}`, exclude: [a] })
  }
  return violations
}

export async function runWorkflow(ctx: {
  task: string
  preferences: { key: string; value: string }[]
  instructions: string[]
  context: string[]
  maxSteps?: number
  maxRetries?: number
}) {
  const t0 = Date.now()
  const maxSteps = ctx.maxSteps ?? 10
  const maxRetries = ctx.maxRetries ?? 2
  const modelEvents: string[] = []

  // 1. PLANNER (LLM call #1)
  const planRes = await runWithFallback(PLANNER(maxSteps), JSON.stringify({ ...ctx, tools: Object.keys(TOOLS) }))
  modelEvents.push(...planRes.fallbacks)
  const plan = parse(Plan, planRes.text).slice(0, maxSteps)

  // 2. EXECUTOR (no LLM)
  let trace: Trace[] = []
  for (const step of plan) trace.push(...(await runStep(step, maxRetries)))

  // 3. VERIFIER: rules, then one remediation pass if needed, then LLM
  let violations = checkPreferences(ctx.preferences, trace)
  if (violations.length) {
    for (const v of violations) {
      const step = plan.find((s) => s.order === v.step)!
      trace.push(...(await runStep(step, maxRetries, { exclude: v.exclude })))
    }
    // keep only the latest successful attempt per step for the final check
    const latest = new Map(trace.filter((t) => t.status === 'success').map((t) => [t.step, t]))
    violations = checkPreferences(ctx.preferences, [...latest.values()])
  }
  const verdictRes = await runWithFallback(VERIFIER, JSON.stringify({ task: ctx.task, plan, trace, rule_violations: violations }))
  modelEvents.push(...verdictRes.fallbacks)
  const verdict = parse(Verdict, verdictRes.text)

  return {
    status: violations.length ? 'failed' : verdict.overall_status,
    steps: trace,
    verdict,
    modelEvents,
    durationMs: Date.now() - t0,
  }
}
```

""")

between("### 6.3 Custom Tools for the Executor Agent", "---\n\n## 7. DEMO SIMULATOR", r"""### 6.3 Tool Registry (executor tools)

Plain async functions with Zod schemas: no Strands `tool()` wrapper is needed because the executor is deterministic code. With `DEMO_MODE=true` every tool returns data from `demo/public/demo-fixtures.json`, so recordings are repeatable. `CHAOS` injects the failures used by scenes R1 and R2.

```typescript
// src/agent/tools.ts
import { z } from 'zod'
import { readFileSync } from 'node:fs'

const DEMO = process.env.DEMO_MODE === 'true'
const CHAOS = new Set((process.env.CHAOS ?? '').split(',').filter(Boolean)) // bad_recipe, shopping_503
const fx = DEMO ? JSON.parse(readFileSync(process.cwd() + '/demo/public/demo-fixtures.json', 'utf8')) : null
const fired = new Set<string>()
const once = (k: string) => CHAOS.has(k) && !fired.has(k) && (fired.add(k), true)

export type ToolDef = { description: string; schema: z.ZodTypeAny; run: (input: any) => Promise<string> }

export const TOOLS: Record<string, ToolDef> = {
  get_weather: {
    description: 'Get current weather for a city',
    schema: z.object({ city: z.string(), units: z.enum(['celsius', 'fahrenheit']).optional() }),
    run: async ({ city, units = 'celsius' }) => {
      if (DEMO) return fx.mock_tools.get_weather[`${city}|${units}`] ?? `${city}: 22C, clear sky`
      // v2 fix: units are a query flag (m = metric, u = US), not part of the format string
      const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=3&${units === 'fahrenheit' ? 'u' : 'm'}`)
      return await res.text()
    },
  },
  check_calendar: {
    description: 'Check available time slots for a date',
    schema: z.object({ date: z.string(), duration_minutes: z.number().optional() }),
    run: async ({ date }) => JSON.stringify({ date, available_slots: ['09:00', '11:00', '14:00', '16:00', '18:00'] }),
  },
  add_to_shopping_list: {
    description: 'Add items to the shopping list',
    schema: z.object({ items: z.array(z.string()), list_name: z.string().optional() }),
    run: async ({ items, list_name }) => {
      if (once('shopping_503')) throw new Error('503 shopping_service_unavailable')
      return `Added ${items.length} items to ${list_name ?? 'shopping'} list: ${items.join(', ')}`
    },
  },
  find_recipe: {
    description: 'Find a recipe for dietary restrictions and servings. Pass exclude to avoid ingredients.',
    schema: z.object({
      dietary_restrictions: z.array(z.string()),
      servings: z.number(),
      meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'dessert']),
      cuisine: z.string().optional(),
      exclude: z.array(z.string()).optional(),
    }),
    run: async (i) => {
      const vegan = i.dietary_restrictions.map((d: string) => d.toLowerCase()).includes('vegan')
      const good = fx?.mock_tools.find_recipe.good
      if (DEMO && once('bad_recipe')) return JSON.stringify(fx.mock_tools.find_recipe.bad_injected)
      if (DEMO && i.exclude?.length) return JSON.stringify(good['vegan|peanut-free|4|dinner|retry'])
      if (DEMO && vegan) return JSON.stringify(good['vegan|peanut-free|4|dinner'])
      // v2: every recipe now reports `contains`, which the rule-based verifier checks
      return JSON.stringify({
        recipe_name: 'Vegan Pasta Primavera', servings: i.servings,
        ingredients: ['pasta', 'tomatoes', 'basil', 'olive oil', 'garlic', 'zucchini'],
        instructions: ['Boil pasta', 'Saute vegetables', 'Combine and serve'],
        dietary_compliance: i.dietary_restrictions, contains: [],
      })
    },
  },
  control_smart_home: {
    description: 'Control a smart home device',
    schema: z.object({ device: z.string(), action: z.string(), value: z.string().optional() }),
    run: async ({ device, action, value }) => `Successfully ${action} on ${device}${value ? ` (set to ${value})` : ''}`,
  },
  set_reminder: {
    description: 'Set a reminder or alarm',
    schema: z.object({ message: z.string(), time: z.string(), recurring: z.enum(['none', 'daily', 'weekly', 'monthly']).optional() }),
    run: async ({ message, time, recurring }) =>
      `Reminder set: "${message}" at ${time}${recurring && recurring !== 'none' ? ` (${recurring})` : ''}`,
  },
  // v2: the demo script used a news tool that the spec never defined
  get_news: {
    description: 'Get the top news headlines',
    schema: z.object({ count: z.number().optional() }),
    run: async ({ count = 3 }) => JSON.stringify((fx?.mock_tools.get_news.count_3 ?? ['Headline unavailable']).slice(0, count)),
  },
}
```

""")

# ---------------------------------------------------------------- section 7
between("### 7.3 Simulator Implementation", "---\n\n## 8. PROJECT STRUCTURE", r"""### 7.3 Static Replay Simulator (v2)

The v1 plan was an Express app calling the live MCP server and an LLM. That makes the recording hostage to rate limits and Render cold starts. v2 replays `demo-fixtures.json` entirely in the browser: no backend, no LLM, hosted free as static files (Cloudflare static assets or any static host).

- **Fixtures:** `demo/public/demo-fixtures.json` holds the failure scenes (F1-F3), the success scenes (S1-S4), two optional resilience scenes (R1, R2), mock tool outputs and memory snapshots.
- **Two panels:** left = "Alexa+ WITHOUT ContextForge" (F scenes); right = "Alexa+ WITH ContextForge" (S scenes) with tool-call chips and a live memory panel.
- **Disclaimer:** show "Simulated Alexa+ behavior based on reported user issues" on the failure panel. The failure scenes illustrate reported problems; they are not recordings of real Alexa+ output.
- **Live mode (optional):** add a toggle that POSTs to your MCP endpoint with `DEMO_MODE=true`, if you want to prove the server is real on camera.

```html
<!-- demo/public/index.html: two .panel columns (#without, #with), a #memory panel, a Play button (#play) -->
```

```javascript
// demo/public/app.js: replays demo-fixtures.json (add ?speed=2 for faster retakes)
const $ = (id) => document.getElementById(id)
const SPEED = Number(new URLSearchParams(location.search).get('speed') || 1)
const wait = (ms) => new Promise((r) => setTimeout(r, ms / SPEED))
let fx

function bubble(panel, who, text, badge) {
  const el = document.createElement('div')
  el.className = `bubble ${who}${badge ? ' failed' : ''}`
  el.textContent = text
  if (badge) { const b = document.createElement('span'); b.className = 'badge'; b.textContent = badge; el.append(b) }
  $(panel).append(el)
}
function chip(call) {
  const el = document.createElement('div')
  el.className = 'chip'
  el.textContent = `${call.tool}(${JSON.stringify(call.args)})`
  $('with').append(el)
}
const speak = (t) => 'speechSynthesis' in window && speechSynthesis.speak(new SpeechSynthesisUtterance(t))
const showMemory = (name) => { $('memory').textContent = JSON.stringify(fx.memory_snapshots[name], null, 2) }

async function playFailure(scene) {
  for (const t of scene.turns) {
    await wait(t.delay_ms)
    bubble('without', t.speaker, t.text, t.badge)
  }
}
async function playSuccess(scene) {
  showMemory(scene.memory_before)
  bubble('with', 'user', scene.user_say)
  for (const call of scene.tool_calls) { await wait(call.ui_delay_ms); chip(call) }
  showMemory(scene.memory_after)
  bubble('with', 'alexa', scene.alexa_response)
  speak(scene.alexa_response)
  await wait(1500)
}
async function main() {
  fx = await (await fetch('./demo-fixtures.json')).json()
  $('play').onclick = async () => {
    for (const s of fx.scenes.without_contextforge) await playFailure(s)
    for (const s of fx.scenes.with_contextforge) await playSuccess(s)
  }
}
main()
```

""")

# ---------------------------------------------------------------- section 8
between("## 8. PROJECT STRUCTURE", "---\n\n## 9. DEPLOYMENT", r"""## 8. PROJECT STRUCTURE

```
contextforge/
├── src/
│   ├── index.ts                    # Entry point — starts FastMCP server
│   ├── server.ts                   # FastMCP server configuration + tool registration
│   ├── config.ts                   # Environment variables and configuration
│   │
│   ├── storage/
│   │   └── supabase.ts              # Supabase client + storage functions (incl. storeInstruction)
│   │
│   ├── tools/                      # MCP tool definitions (registered with FastMCP)
│   │   ├── store_preference.ts
│   │   ├── get_preferences.ts
│   │   ├── store_context.ts        # now also handles kind='instruction'
│   │   ├── get_context.ts
│   │   ├── execute_workflow.ts     # calls agent/workflow.ts
│   │   └── get_memory_summary.ts
│   │
│   ├── agent/                      # v2: no harness, no Graph
│   │   ├── providers.ts            # Free LLM provider pool + fallback (Strands Agent + OpenAIModel)
│   │   ├── workflow.ts             # Plan → Execute → Verify pipeline
│   │   └── tools.ts                # Tool registry (weather, calendar, shopping, recipe, smart home, reminder, news)
│   │
│   └── utils/
│       ├── logger.ts               # Structured logging (include provider usage)
│       └── errors.ts
│
├── demo/
│   └── public/                     # Static replay simulator (no backend)
│       ├── index.html
│       ├── style.css
│       ├── app.js
│       └── demo-fixtures.json      # Failure + success scenes, mock tool data
│
├── tests/
│   ├── tools.test.ts
│   ├── storage.test.ts
│   ├── workflow.test.ts            # run with DEMO_MODE=true and CHAOS=bad_recipe,shopping_503
│   └── integration.test.ts
│
├── docs/
│   ├── README.md
│   ├── ARCHITECTURE.md
│   ├── API.md
│   └── FRICTION_LOG.md             # Developer friction log (10% judging bonus)
│
├── infra/
│   ├── render.yaml
│   ├── schema.sql                  # Supabase schema
│   ├── seed.sql                    # Demo seed data (baseline + day-2 state)
│   └── cloudflare/
│       └── keepalive/              # Cron Worker that pings Render (Section 9.4)
│           ├── wrangler.toml
│           └── src/index.ts
│
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
└── LICENSE                         # MIT
```

""")

# ---------------------------------------------------------------- section 9
between("### 9.2 Environment Variables", "### 9.3 Render Deployment", r"""### 9.2 Environment Variables

```env
# .env.example

# LLM provider pool (any subset works; order = Groq, Workers AI, Gemini, OpenRouter)
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-120b
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=            # token with Workers AI permission
CF_MODEL=@cf/openai/gpt-oss-120b # check `npx wrangler ai models list`
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash    # check AI Studio for current free models
OPENROUTER_API_KEY=sk-or-your-key-here
OPENROUTER_MODEL=openrouter/free

# Supabase (Free Database)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# MCP Server
# Render injects PORT. Bind to it: process.env.PORT ?? 3000
PORT=3000
MCP_TRANSPORT_TYPE=http-stream
MCP_STATELESS=true

# Demo / failure injection
DEMO_MODE=false                  # true = tools return fixture data
CHAOS=                           # bad_recipe,shopping_503 (demo scenes R1/R2)
```

""")

rep("      - key: MCP_SERVER_PORT\n        value: 3000\n",
    "      - key: GROQ_API_KEY\n        sync: false\n"
    "      - key: CLOUDFLARE_ACCOUNT_ID\n        sync: false\n"
    "      - key: CLOUDFLARE_API_TOKEN\n        sync: false\n"
    "      - key: GEMINI_API_KEY\n        sync: false\n"
    "      # v2: no MCP_SERVER_PORT. Render provides PORT; bind to it in index.ts\n")

KEEP = r"""
### 9.4 Cloudflare Keep-Alive and Dev Tunnel (v2)

Render's free tier sleeps after 15 minutes. A Cloudflare Cron Trigger (free plan) pings `/health` every 10 minutes so Alexa+ and the judges never hit a cold start.

```toml
# infra/cloudflare/keepalive/wrangler.toml
name = "contextforge-keepalive"
main = "src/index.ts"
compatibility_date = "2026-10-01"

[triggers]
crons = ["*/10 * * * *"]

[vars]
TARGET_URL = "https://contextforge.onrender.com/health"
```

```typescript
// infra/cloudflare/keepalive/src/index.ts
export default {
  async scheduled(_event: ScheduledController, env: { TARGET_URL: string }) {
    const res = await fetch(env.TARGET_URL)
    console.log('keepalive', res.status)
  },
}
```

Deploy with `npx wrangler deploy` from that folder. Keep it running until judging ends.

**Caveats:**
- A permanently-awake service uses ~744 of the 750 free Render hours in a 31-day month, so run only one free web service in that workspace.
- Confirm FastMCP exposes `/health` (its `health` option) or add a tiny route.

**Local dev tunnel:** install `cloudflared`, run `cloudflared tunnel --url http://localhost:3000`, and use the temporary `https://*.trycloudflare.com/mcp` URL to test against Alexa+ without deploying.

**Demo hosting:** publish `demo/public` as static assets (Wrangler static assets or Pages) to get a public replay URL for the submission.

"""
j = text.index("\n---\n\n## 10. SUBMISSION REQUIREMENTS CHECKLIST")
text = text[:j].rstrip() + "\n" + KEEP + text[j:]

# ---------------------------------------------------------------- section 10 / 11 / 12
rep(r"(\*\*Qualification basis:\*\*[^\n]*\n)",
    "\\1\n**v2 notes:** (1) The official Devpost page says \"Kiro\"; your v1 text says \"Kiro Crew\". Confirm the exact wording in the official rules before writing the submission. "
    "(2) Strands must be genuinely used at runtime. In v2 the planner and verifier are Strands agents, so it is. "
    "(3) Document the integration in the Product Feedback section.\n",
    regex=True)

rep("| 5. Strands harness + agent tools | 1 | Sept 30-Oct 1 | createHarness configured, 6 agent tools working |",
    "| 5. Provider pool + tool registry | 1 | Sept 30-Oct 1 | providers.ts with fallback working, 7 tools in the registry |")
rep("| 6. Multi-agent Graph | 1 | Oct 1-2 | Planner → Executor → Verifier pipeline |",
    "| 6. Plan → Execute → Verify | 1 | Oct 1-2 | workflow.ts: planner agent, deterministic executor, rule + LLM verifier |")
rep("| 9. Demo simulator | 2 | Oct 4-6 | Web page with before/after comparison |",
    "| 9. Static replay simulator | 1 | Oct 4-6 | Fixture-driven before/after page; add Cloudflare keep-alive |")
j = text.index("\n---\n\n## 12. JUDGING CRITERIA MAPPING")
text = text[:j].rstrip() + "\n\n*Dates assume a Sept 26 start. Shift them to where you actually are; the order and the buffer matter more than the dates.*\n" + text[j:]

rep("OpenRouter (free LLM with tool use), Strands SDK (multi-agent Graph)",
    "a pooled free LLM layer (Groq, Workers AI, Gemini, OpenRouter), Strands SDK (planner and verifier agents)")
rep("Strands SDK orchestrates multi-agent workflows.", "Strands agents plan and verify every workflow.")
rep("FastMCP (MCP protocol), Strands SDK (agents), OpenRouter (LLM), Supabase (storage)",
    "FastMCP (MCP protocol), Strands SDK (agents), free LLM provider pool, Supabase (storage)")
rep("Combines MCP protocol + multi-agent orchestration + persistent memory + OpenRouter free LLM in a novel way.",
    "Combines MCP protocol + plan/execute/verify orchestration + persistent memory + a pooled free LLM layer in a novel way.")
rep("Strands SDK (AWS agent framework), Supabase (PostgreSQL), OpenRouter (LLM gateway).",
    "Strands SDK (AWS agent framework), Supabase (PostgreSQL), Groq / Workers AI / OpenRouter (LLMs).")
rep("Multi-agent orchestration with persistent state is architecturally distinct from a generic AI wrapper.",
    "Planner and verifier agents around a deterministic executor, with persistent state, are architecturally distinct from a generic AI wrapper.")

# demo script narration (multi-line, whitespace-tolerant)
rep(r"Strands Agents SDK for multi-agent orchestration, OpenRouter\s+free models for reasoning,",
    "Strands Agents SDK for planning and verification, a pool of free\n   LLM providers for reasoning,", regex=True)
rep("The Planner-Executor-Verifier graph ensures", "The Planner-Executor-Verifier pipeline ensures")
rep(r"Render, Supabase, and OpenRouter\s+— zero", "Render, Cloudflare, Supabase, and free LLM tiers\n   — zero", regex=True)

# ---------------------------------------------------------------- sources
text = text.rstrip() + r"""
- [Strands: OpenRouter via the OpenAI provider](https://strandsagents.com/docs/integrations/model-providers/openrouter/)
- [Strands: Vercel AI SDK model provider](https://strandsagents.com/docs/user-guide/concepts/model-providers/vercel/)
- [Cloudflare: MCP Streamable HTTP transport](https://developers.cloudflare.com/agents/model-context-protocol/protocol/transport/index.md)
- [OpenRouter Pricing and rate limits](https://openrouter.ai/pricing)
- [Free LLM API Comparison 2026 (Groq limits)](https://blogs.novita.ai/free-llm-api-comparison-2026/)
- [5 Free LLM API Providers 2026 (Workers AI, Gemini)](https://kdnuggets.com/5-free-llm-api-providers-you-can-use-in-2026)
- [Devpost: Resources (AWS Builder mini challenge)](https://amazonappdev2026.devpost.com/resources)
"""

import os
os.makedirs(os.path.dirname(DST), exist_ok=True)
open(DST, "w", encoding="utf-8").write(text)
print("written", len(text.splitlines()), "lines")
print("MISSING:", missing)
