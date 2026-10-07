# PROJECT SPECIFICATION: ContextForge
### A Persistent-Memory Agentic MCP Server for Alexa+

---

## CHANGELOG: v2 (Oct 1, 2026)

Stack revised for development speed and free-tier survival.

| # | Change | Why |
|---|--------|-----|
| 1 | LLM: single OpenRouter key → **free provider pool** (Groq, Cloudflare Workers AI, Gemini, OpenRouter) with automatic fallback | OpenRouter free = 50 requests/day (1,000 after a one-time $10 purchase) and failed requests count. One v1 workflow used ~8-10 calls. |
| 2 | Executor is now **plain TypeScript** (no LLM). Planner and verifier stay Strands agents; a rule-based preference check runs before the LLM verifier | 2 LLM calls per workflow instead of ~8-10; deterministic tool calls; much more reliable on free models |
| 3 | Strands code: `Agent + loop `, `@strands-agents/harness` and `provider: 'litellm'` removed → `Agent` + `OpenAIModel` pointed at OpenAI-compatible endpoints | LiteLLM is Python-only; the OpenAI provider is the documented route for OpenRouter-style endpoints |
| 4 | **Cloudflare added**: keep-warm cron, tunnel for local dev, static hosting for the demo, optional AI Gateway | Render free spins down after 15 min (~1 min cold start) |
| 5 | Demo simulator: Express + live LLM → **static fixture replay** (`demo-fixtures.json`) | Zero rate-limit or cold-start risk while recording |
| 6 | S3 session storage removed (in-memory sessions) | S3 needs an AWS account with a payment method, which contradicts the $0 claim |
| 7 | Schema fixes: `idx_executions_user` referenced a non-existent `created_at`; context priority sorted alphabetically (added `priority_rank`) | The first would fail; the second mis-orders results |
| 8 | Other fixes: wttr.in URL, missing `typescript` devDependency, missing `demo` npm script, Render `PORT`, undefined `get_news` tool, no write path for `user_instructions` | Sections 3, 4, 5.3, 6.3, 9 |

**Verify before relying on (not confirmed from docs):** FastMCP version and `health` option; how to read text from a Strands `invoke()` result in your SDK version; whether Strands runs on Cloudflare Workers; Alexa+ authentication support for custom MCP servers; current free-tier limits (they change often); official AWS Builder wording ("Kiro" vs "Kiro Crew").

---

## 1. EXECUTIVE SUMMARY

### 1.1 What Is ContextForge?

ContextForge is a self-hosted MCP (Model Context Protocol) server that gives Alexa+ two capabilities it critically lacks today: **persistent memory** and **multi-step agentic workflow orchestration**. It is built for the Amazon Build, Ship, Shape Hackathon (Alexa+ Track + AWS Builder Mini Challenge).

### 1.2 The Problem

Research across Wirecutter, Hacker News, PCMag, internal Amazon employee leaks, and Amazon Forums identified the top Alexa user pain points:

1. **Alexa+ cannot remember user preferences** — it forgets dietary restrictions, music tastes, and personal instructions across sessions
2. **Alexa+ has no multi-turn context** — every interaction is stateless; it cannot chain steps or reference prior conversation
3. **Alexa+ made things worse, not better** — core functions that worked on original Alexa now break (smart-home routines, alarms, music playback)
4. **Alexa+ is excessively verbose** — unwanted commentary, jokes, and upselling interrupt every interaction

### 1.3 The Solution

ContextForge is an MCP server that Alexa+ connects to as a tool source. It provides:

- **Persistent preference storage** — store and retrieve user preferences across sessions (Supabase PostgreSQL-backed)
- **Conversation context memory** — remember instructions, prior requests, and ongoing tasks with TTL-based expiry
- **Agentic multi-step workflow execution** — break complex requests into steps, execute each with tools, verify results, and retry failures
- **Plan → Execute → Verify pipeline** — Strands-powered planner and verifier agents around a deterministic executor
- **Free multi-provider LLM pool** — Groq, Cloudflare Workers AI, Gemini and OpenRouter free tiers with automatic fallback

### 1.4 Why It Wins

| Prize | Amount | How ContextForge Qualifies |
|-------|--------|---------------------------|
| Alexa+ Track 1st Place | $25,000 cash + $15,000 AWS credits | Matches both "creative" examples from the rules: "agentic workflow that autonomously orchestrates across services" AND "context-aware add-on that maintains state across sessions" |
| AWS Builder Mini Challenge | $5,000 cash + $5,000 AWS credits | Uses Strands SDK (AWS open-source agent framework) at runtime + Kiro Crew (AWS development tool) during development. Per rules: "Kiro Crew qualifies on its own as a development tool used during the Hackathon." |

---

## 1.5 Pre-Build Requirements (Do These First)

These items must be completed before writing any code. All are free and require no payment method.

| Priority | Action | Time | Why |
|----------|--------|------|-----|
| 1 | Get OpenRouter API key | 5 min | Free LLM access — see Section 1.5.1 |
| 2 | Create Supabase project | 5 min | Free PostgreSQL database — see Section 1.5.2 |
\1| 3b | Create Cloudflare account; get Groq and Gemini API keys | 15 min | Keep-warm cron, tunnel, demo hosting, extra free LLM quota. See Sections 1.5.6-1.5.7 |
| 4 | Install Node.js 22.19+ | 5 min | Required for FastMCP, Strands SDK, and MCP Inspector |
| 5 | (Optional) Download Kiro Crew | 10 min | AWS development tool — qualifies for AWS Builder Mini Challenge |

### 1.5.1 Get OpenRouter API Key (Free, No Credit Card)

OpenRouter provides a single API key that gives access to 20+ free models from multiple providers. No credit card required.

1. Go to [openrouter.ai](https://openrouter.ai) and sign up
2. Create a key under **Keys** in the dashboard. It starts with `sk-or-`
3. Point any OpenAI-compatible client at the OpenRouter endpoint:
   - Base URL: `https://openrouter.ai/api/v1`
4. Free tier limits:
   - 20 requests per minute on `:free` models
   - 50 requests per day (or 1,000/day after a one-time $10 top-up)
   - 20+ free text models including NVIDIA Nemotron 3, Cohere North Mini Code, Qwen 3.8 27B
5. Use `openrouter/free` as the model ID to let OpenRouter auto-pick an available free model, or specify a particular model like `nvidia/nemotron-3-super-120b-a12b:free`

**Important:** Free models can get 429s from upstream providers when saturated. Always use a fallback list of 2-3 models from different providers. \1

**v2 warning:** 50 requests/day is far too little for development. Failed requests count against it. Treat OpenRouter as the *last* fallback and see Section 1.5.6.

Source: [OpenRouter Free Tier](https://openrouter.ai/blog/tutorials/free-llm-apis-compared/)

### 1.5.2 Create Supabase Project (Free, No Credit Card)

Supabase provides a free PostgreSQL database with 500MB storage, up to 2 projects.

1. Go to [supabase.com](https://supabase.com) and sign up
2. Create a new project
3. Note your project URL and anon key from **Settings > API**
4. Free tier includes:
   - 500MB database storage
   - 2 projects
   - Real-time subscriptions
   - PostgreSQL with full SQL access
   - Row-level security

Source: [Supabase Pricing](https://supabase.com/pricing)

### 1.5.3 Create Render Account (Free, No Credit Card)

Render provides free web service hosting with automatic HTTPS.

1. Go to [render.com](https://render.com) and sign up (GitHub or GitLab login)
2. Create a new **Web Service** from your GitHub repository
3. Free tier includes:
   - 750 free instance hours per workspace per month
   - Automatic HTTPS
   - Auto-deploy from Git
   - 15-min inactivity spin-down (~1 min restart, acceptable for hackathon demo)

Source: [Render Free Tier](https://render.com/docs/free)

### 1.5.4 MCP Inspector (Local Testing Tool)

Test the MCP server locally before deploying to Render:

```bash
# Launch web UI in browser (requires Node 22.19+)
npx @modelcontextprotocol/inspector node dist/index.js

# Or use CLI mode for scripted testing
npx @modelcontextprotocol/inspector --cli node dist/index.js --method tools/list

# Or terminal UI if no browser available
npx @modelcontextprotocol/inspector --tui node dist/index.js
```

Source: [MCP Inspector Documentation](https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector)

### 1.5.5 Free Stack Cost Summary

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

---

## 2. TECHNICAL ARCHITECTURE

### 2.1 System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERACTION                             │
│                                                                     │
│  Voice Command → Alexa+ (Agent Skill / MCP Client)                  │
│       "Remember I'm vegan, then plan dinner for 4 and add groceries" │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               │ MCP Protocol (Streamable HTTP)
                               │ Spec version 2025-11-25
                               │ POST to https://your-server/mcp
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CONTEXTFORGE MCP SERVER                           │
│                    (FastMCP + Render)                                │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   TOOL REGISTRY                             │    │
│  │                                                             │    │
│  │  1. store_preference    4. get_context                      │    │
│  │  2. get_preferences     5. execute_workflow                 │    │
│  │  3. store_context       6. get_memory_summary               │    │
│  └──────────────────────────────┬──────────────────────────────┘    │
│                                 │                                   │
│              ┌──────────────────┼──────────────────┐                │
│              │                  │                   │                │
│              ▼                  ▼                   ▼                │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────┐   │
│  │  MEMORY LAYER  │  │  AGENT LAYER  │  │  LLM PROVIDER POOL      │   │
│  │                │  │               │  │                        │   │
│  │  Supabase     │  │  Strands SDK  │  │  Free model pool      │   │
│  │  (PostgreSQL) │  │  createHarness│  │  (provider pool)      │   │
│  │                │  │               │  │                        │   │
│  │  - Preferences │  │  - Planner    │  │  - Tool use            │   │
│  │  - Context     │  │  - Executor   │  │  - Streaming           │   │
│  │  - Instructions│  │  - Verifier   │  │  - Guardrails          │   │
│  │  - TTL expiry  │  │  - Retry      │  │  - Reasoning          │   │
│  └───────────────┘  └───────┬───────┘  └───────────────────────┘   │
│                             │                                       │
│                     ┌───────┴───────┐                                │
│                     │  TOOL LAYER   │                                │
│                     │               │                                │
│                     │  - Weather    │                                │
│                     │  - Calendar   │                                │
│                     │  - Shopping   │                                │
│                     │  - Recipes    │                                │
│                     │  - Smart Home │                                │
│                     └───────────────┘                                │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   SESSION & TRACING                          │    │
│  │                                                             │    │
│  │  In-memory sessions (Strands built-in)                      │    │
│  │  OpenTelemetry tracing                                     │    │
│  │  Conversation summarization (Strands built-in)              │    │
│  │  Sliding window context management (Strands built-in)       │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      FREE-TIER INFRASTRUCTURE                         │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────┐ │
│  │ Render       │  │ Supabase     │  │ (Sessions &  │  │OpenRouter│ │
│  │ (MCP Server  │  │ (PostgreSQL  │  │  Traces via  │  │ (LLM)   │ │
│  │  host)       │  │  Preferences │  │  Strands SDK)│  │         │ │
│  │              │  │  & Context)  │  │              │  │ Free    │ │
│  │ 750 hours/  │  │ 500MB        │  │ In-memory    │  │ models  │ │
│  │ month free   │  │ 2 projects   │  │              │  │ 20+     │ │
│  │              │  │ free         │  │              │  │         │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────┘ │
│                                                                     │
│  Total Monthly Cost: $0.00 (No payment method required)             │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow: Example Request

**User says:** "Alexa, remember I'm vegan, plan dinner for 4 people, check the weather, and add ingredients to my shopping list."

**Step-by-step execution:**

```
1. Alexa+ receives voice command
2. Alexa+ routes to ContextForge MCP server (Streamable HTTP POST)
3. ContextForge tool: store_preference
   → Stores { user_id, key: "diet", value: "vegan", category: "diet" }
   → Returns: "Preference stored: diet = vegan"

4. ContextForge tool: execute_workflow
   → Planner agent (Strands) receives task:
     "Plan dinner for 4 vegan people, check weather, add groceries"
   
   5a. PLANNER AGENT breaks task into steps:
       Step 1: Find a vegan dinner recipe for 4 people
       Step 2: Extract ingredients from recipe
       Step 3: Check current weather
       Step 4: Add ingredients to shopping list
       Step 5: Confirm completion to user
   
   5b. EXECUTOR AGENT runs each step:
       Step 1 → Calls recipe tool → "Vegan Pasta Primavera for 4"
       Step 2 → Extracts: [pasta, tomatoes, basil, olive oil, garlic, zucchini]
       Step 3 → Calls weather tool → "22°C, clear sky in Lagos"
       Step 4 → Calls shopping tool → "Added 6 items to shopping list"
       Step 5 → Returns summary
   
   5c. VERIFIER AGENT checks results:
       - Recipe found? Yes
       - All ingredients extracted? Yes (6 items)
       - Weather retrieved? Yes
       - Shopping list updated? Yes
       - All steps completed? Yes → Pass
   
   → Returns: {
       success: true,
       steps_completed: 5,
       recipe: "Vegan Pasta Primavera",
       ingredients: ["pasta", "tomatoes", "basil", "olive oil", "garlic", "zucchini"],
       weather: "22°C, clear sky in Lagos",
       shopping_list: "6 items added",
       summary: "I've planned a vegan dinner for 4, found Pasta Primavera, 
                 checked the weather (22°C, clear), and added 6 ingredients 
                 to your shopping list."
     }

6. Alexa+ speaks the summary to the user
7. ContextForge tool: store_context
   → Stores conversation context for future reference
   → "User planned vegan dinner for 4 on [date]. Used Pasta Primavera recipe."
```

---

## 3. TECHNOLOGY STACK

### 3.1 Complete Dependency Manifest

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

### 3.2 Stack Justification

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

---

## 4. DATA MODEL

### 4.1 Supabase PostgreSQL Schema

**Database:** Supabase free-tier PostgreSQL

Run this SQL in the Supabase SQL Editor to create all tables:

```sql
-- Preferences table
CREATE TABLE preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('diet', 'music', 'schedule', 'smart_home', 'personal', 'general')),
  source TEXT DEFAULT 'voice' CHECK (source IN ('voice', 'explicit', 'inferred')),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, key, category)
);

CREATE INDEX idx_preferences_user ON preferences(user_id);
CREATE INDEX idx_preferences_user_category ON preferences(user_id, category);

-- Conversation context table
CREATE TABLE conversation_context (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  context TEXT NOT NULL,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  -- v2: text priority sorts alphabetically (high < low < medium). Sort on this column instead.
  priority_rank SMALLINT GENERATED ALWAYS AS (
    CASE priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END
  ) STORED,
  expires_at TIMESTAMPTZ,
  related_task_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_context_user ON conversation_context(user_id);
CREATE INDEX idx_context_user_priority ON conversation_context(user_id, priority_rank DESC, created_at DESC);

-- Workflow execution log table
CREATE TABLE workflow_executions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  task TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]',
  status TEXT DEFAULT 'planning' CHECK (status IN ('planning', 'executing', 'verifying', 'completed', 'failed')),
  result TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- v2 fix: this table has started_at, not created_at
CREATE INDEX idx_executions_user ON workflow_executions(user_id, started_at DESC);

-- User instructions table
CREATE TABLE user_instructions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  instruction TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('critical', 'important', 'nice_to_have')),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ
);

CREATE INDEX idx_instructions_user_active ON user_instructions(user_id) WHERE active = true;

-- Enable Row Level Security
ALTER TABLE preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_instructions ENABLE ROW LEVEL SECURITY;

-- RLS policy: allow access via service role key (used by MCP server)
-- The MCP server uses the service_role key which bypasses RLS
-- No additional policies needed for server-side access
```

### 4.2 Supabase Client Configuration

```typescript
// src/storage/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
})

// Store a preference
export async function storePreference(
  userId: string,
  key: string,
  value: string,
  category: string,
  source: string = 'voice'
) {
  const { data, error } = await supabase
    .from('preferences')
    .upsert({ user_id: userId, key, value, category, source }, {
      onConflict: 'user_id,key,category'
    })
    .select()
  if (error) throw error
  return data[0]
}

// Retrieve all preferences for a user
export async function getPreferences(userId: string, category?: string) {
  let query = supabase.from('preferences').select('*').eq('user_id', userId)
  if (category) query = query.eq('category', category)
  const { data, error } = await query.order('updated_at', { ascending: false })
  if (error) throw error
  return data
}

// Store conversation context
export async function storeContext(
  userId: string,
  context: string,
  priority: string = 'medium',
  expiresInHours?: number,
  relatedTaskId?: string
) {
  const expiresAt = expiresInHours
    ? new Date(Date.now() + expiresInHours * 3600000).toISOString()
    : null
  const { data, error } = await supabase
    .from('conversation_context')
    .insert({
      user_id: userId,
      context,
      priority,
      expires_at: expiresAt,
      related_task_id: relatedTaskId
    })
    .select()
  if (error) throw error
  return data[0]
}

// Retrieve active (non-expired) contexts
export async function getContexts(userId: string, limit: number = 10) {
  const { data, error } = await supabase
    .from('conversation_context')
    .select('*')
    .eq('user_id', userId)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('priority_rank', { ascending: false }) // v2: high first
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data
}

// Store execution log
export async function storeExecution(userId: string, task: string, steps: any[], status: string, result?: string) {
  const { data, error } = await supabase
    .from('workflow_executions')
    .insert({
      user_id: userId,
      task,
      steps,
      status,
      result,
      completed_at: status === 'completed' || status === 'failed' ? new Date().toISOString() : null
    })
    .select()
  if (error) throw error
  return data[0]
}

// Get active instructions
export async function getActiveInstructions(userId: string) {
  const { data, error } = await supabase
    .from('user_instructions')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .order('priority', { ascending: true }) // critical first
  if (error) throw error
  return data
}

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


---

## 5. MCP TOOLS SPECIFICATION

### 5.1 Tool: `store_preference`

**Purpose:** Store a user preference in persistent memory. This is the core tool that fixes Alexa's inability to remember user preferences.

**Schema:**
```typescript
{
  name: "store_preference",
  description: "Store a user preference or instruction in persistent memory. " +
    "The preference persists across sessions and is available to all future " +
    "interactions. Use this when the user explicitly states a preference, " +
    "such as dietary restrictions, music tastes, schedule preferences, or " +
    "smart-home configurations.",
  inputSchema: z.object({
    user_id: z.string()
      .describe("Unique user identifier (Alexa device or account ID)"),
    key: z.string()
      .describe("Preference key. Examples: 'diet', 'music_taste', " +
        "'wake_time', 'preferred_temperature', 'language'"),
    value: z.string()
      .describe("Preference value. Examples: 'vegan', 'jazz', '07:00', " +
        "'21_celsius', 'English'"),
    category: z.enum([
      'diet', 'music', 'schedule', 'smart_home', 'personal', 'general'
    ]).describe("Category for organizing the preference"),
    source: z.enum(['voice', 'explicit', 'inferred'])
      .optional()
      .describe("How the preference was captured. 'voice' = stated in " +
        "conversation. 'explicit' = directly stated. 'inferred' = deduced " +
        "from behavior. Defaults to 'voice'.")
  }),
  output: "Confirmation message with stored preference details"
}
```

**Example invocation:**
```json
{
  "user_id": "amzn1.account.ABC123",
  "key": "diet",
  "value": "vegan",
  "category": "diet",
  "source": "explicit"
}
```

**Example response:**
```json
{
  "content": [{
    "type": "text",
    "text": "Preference stored: diet = vegan. This will be remembered for all future interactions."
  }]
}
```

---

### 5.2 Tool: `get_preferences`

**Purpose:** Retrieve stored preferences for a user. Used at the start of any interaction to load the user's profile into the agent's context.

**Schema:**
```typescript
{
  name: "get_preferences",
  description: "Retrieve all stored preferences for a user, optionally " +
    "filtered by category. Use this at the beginning of any interaction " +
    "to load the user's profile and personalize the response. The returned " +
    "preferences should be treated as hard constraints — never override " +
    "them unless the user explicitly changes them.",
  inputSchema: z.object({
    user_id: z.string()
      .describe("Unique user identifier"),
    category: z.enum([
      'diet', 'music', 'schedule', 'smart_home', 'personal', 'general'
    ]).optional()
      .describe("Optional filter by category. If omitted, returns all " +
        "preferences.")
  }),
  output: "JSON array of preference objects"
}
```

**Example invocation:**
```json
{
  "user_id": "amzn1.account.ABC123",
  "category": "diet"
}
```

**Example response:**
```json
{
  "content": [{
    "type": "text",
    "text": "[{\"key\":\"diet\",\"value\":\"vegan\",\"category\":\"diet\",\"updatedAt\":\"2026-10-01T14:30:00Z\"},{\"key\":\"allergies\",\"value\":\"peanuts\",\"category\":\"diet\",\"updatedAt\":\"2026-10-01T14:32:00Z\"}]"
  }]
}
```

---

### 5.3 Tool: `store_context`

**Purpose:** Store a piece of conversation context for later recall. This enables multi-turn conversations where Alexa remembers what was discussed previously.

**Schema:**
```typescript
{
  name: "store_context",
  description: "Store a piece of conversation context or instruction for " +
    "later recall. Use this to remember what was discussed in the current " +
    "session so future interactions can reference it. Context can have an " +
    "optional TTL for automatic expiry. Use high priority for instructions " +
    "the user explicitly wants remembered (e.g., 'always remind me to take " +
    "medication at 8pm').",
  inputSchema: z.object({
    user_id: z.string()
      .describe("Unique user identifier"),
    context: z.string()
      .describe("The context or instruction to remember. Write in natural " +
        "language. Examples: 'User planned vegan dinner for 4 people on " +
        "Oct 1. Used Pasta Primavera recipe.' or 'User asked to be reminded " +
        "about medication at 8pm daily.'"),
    priority: z.enum(['low', 'medium', 'high'])
      .optional()
      .describe("Priority of this context. 'high' = important instruction " +
        "that should always be loaded. 'medium' = relevant for near-term " +
        "interactions. 'low' = background context. Defaults to 'medium'."),
    expires_in_hours: z.number()
      .optional()
      .describe("Optional time-to-live in hours. After this duration, the " +
        "context is automatically deleted. Omit for permanent storage."),
    related_task_id: z.string()
      .optional()
      .describe("Optional reference to a workflow execution ID this context " +
        "relates to.")
  }),
\1
**v2 addition: `kind` (gives `user_instructions` a write path).** Add this field to the schema:

```typescript
    kind: z.enum(['note', 'instruction']).optional()
      .describe("'instruction' = standing rule for every future interaction " +
        "(e.g. 'keep answers short'). Stored in user_instructions. Defaults to 'note'.")
```

When `kind === 'instruction'`, call `storeInstruction()` and map priority low/medium/high to nice_to_have/important/critical. `get_memory_summary` and `execute_workflow` read active instructions with `getActiveInstructions()`.

---

### 5.4 Tool: `get_context`

**Purpose:** Retrieve active conversation context and instructions for a user. Loads prior conversation history into the agent's working memory.

**Schema:**
```typescript
{
  name: "get_context",
  description: "Retrieve active conversation context and instructions for a " +
    "user. Returns all non-expired context entries, sorted by priority " +
    "(high first) and then by recency. Use this at the start of an " +
    "interaction to load what was previously discussed.",
  inputSchema: z.object({
    user_id: z.string()
      .describe("Unique user identifier"),
    limit: z.number()
      .optional()
      .describe("Maximum number of context entries to return. Defaults to 10."),
    priority_filter: z.enum(['low', 'medium', 'high'])
      .optional()
      .describe("Optional filter to return only contexts of a given priority " +
        "or higher.")
  }),
  output: "JSON array of context objects, sorted by priority and recency"
}
```

---

### 5.5 Tool: `execute_workflow`

**Purpose:** Plan and execute a multi-step task by breaking it down, executing each step with available tools, verifying results, and retrying failures. This is the core agentic orchestration tool.

**Schema:**
```typescript
{
  name: "execute_workflow",
  description: "Plan and execute a multi-step task. Breaks the task into " +
    "concrete steps, executes each step using available tools, verifies " +
    "results, and retries failed steps. Loads the user's preferences and " +
    "context before execution to ensure the task respects stored " +
    "preferences. Returns a detailed execution log with the status of each " +
    "step. This tool is for complex, multi-step requests that require " +
    "orchestration across multiple services. For simple single-step " +
    "requests, use individual tools directly.",
  inputSchema: z.object({
    user_id: z.string()
      .describe("Unique user identifier"),
    task: z.string()
      .describe("Natural language description of the task to execute. " +
        "Examples: 'Plan dinner for 4 vegans, check weather, and add " +
        "ingredients to shopping list' or 'Set up a morning routine: " +
        "wake me at 7, start the coffee maker, and read me the news'"),
    max_steps: z.number()
      .optional()
      .describe("Maximum number of steps the agent can take. Defaults to " +
        "10. Use to prevent runaway execution."),
    max_retries_per_step: z.number()
      .optional()
      .describe("Maximum retry attempts per failed step. Defaults to 2.")
  }),
  output: "JSON object with execution status, steps, and results"
}
```

**Internal execution flow (v2):**

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

**Example response:**
```json
{
  "content": [{
    "type": "text",
    "text": "{\"status\":\"completed\",\"steps\":[{\"order\":1,\"description\":\"Find vegan dinner recipe for 4\",\"toolUsed\":\"recipe_finder\",\"status\":\"success\",\"output\":\"Vegan Pasta Primavera\"},{\"order\":2,\"description\":\"Extract ingredients\",\"toolUsed\":\"recipe_extractor\",\"status\":\"success\",\"output\":[\"pasta\",\"tomatoes\",\"basil\",\"olive oil\",\"garlic\",\"zucchini\"]},{\"order\":3,\"description\":\"Check weather\",\"toolUsed\":\"get_weather\",\"status\":\"success\",\"output\":\"22°C, clear sky in Lagos\"},{\"order\":4,\"description\":\"Add ingredients to shopping list\",\"toolUsed\":\"add_to_shopping_list\",\"status\":\"success\",\"output\":\"6 items added\"}],\"summary\":\"I planned a vegan dinner for 4 (Pasta Primavera), checked the weather (22°C, clear in Lagos), and added 6 ingredients to your shopping list.\",\"durationMs\":8400}"
  }]
}
```

---

### 5.6 Tool: `get_memory_summary`

**Purpose:** Return a natural-language summary of everything the system knows about the user — their preferences, active context, and recent task history. Useful for onboarding, debugging, and the demo.

**Schema:**
```typescript
{
  name: "get_memory_summary",
  description: "Return a comprehensive summary of everything ContextForge " +
    "knows about the user: all stored preferences, active conversation " +
    "context, and recent workflow execution history. Use this when the " +
    "user asks 'what do you remember about me?' or for the agent to " +
    "self-assess its knowledge before responding.",
  inputSchema: z.object({
    user_id: z.string()
      .describe("Unique user identifier")
  }),
  output: "Natural language summary of user profile"
}
```

**Example response:**
```json
{
  "content": [{
    "type": "text",
    "text": "Here's what I know about you:\n\nPREFERENCES:\n- Diet: Vegan\n- Allergies: Peanuts\n- Music taste: Jazz\n- Wake time: 07:00\n- Preferred temperature: 21°C\n\nRECENT CONTEXT:\n- You planned a vegan dinner for 4 people on October 1st using Pasta Primavera\n- You asked to be reminded about medication at 8pm daily\n\nRECENT TASKS:\n- Oct 1: Planned dinner + checked weather + added groceries (completed)\n- Sep 30: Set up morning routine (completed)\n\nI will respect all of these preferences in future interactions."
  }]
}
```

---

## 6. AGENT LAYER SPECIFICATION

### 6.1 Model Provider Pool (Strands `Agent` + `OpenAIModel`)

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

### 6.3 Tool Registry (executor tools)

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

---

## 7. DEMO SIMULATOR

### 7.1 Purpose

The hackathon FAQ states participants can simulate the Alexa+ experience in a web application. The demo simulator is a web page that shows the before/after comparison.

### 7.2 Demo Script

**Demo duration: 2 minutes 45 seconds**

```
[0:00 - 0:15] PROBLEM INTRODUCTION
- Title card: "Alexa+ can't remember you."
- Quick stats from research:
  "Millions of Alexa+ users report it forgets preferences,
   breaks routines, and ignores instructions."
- "We built ContextForge to fix this."

[0:15 - 0:45] BEFORE: Alexa+ WITHOUT ContextForge
- Screen recording of simulated Alexa+ interaction:
  
  User: "Alexa, I'm vegan. Plan dinner for 4 people."
  Alexa+: "Great! How about a juicy steak dinner for 4?"
  User: "I said I'm vegan."
  Alexa+: "Sorry! How about grilled chicken?"
  User: "..."
  
  User: "Alexa, what did I ask you to remember yesterday?"
  Alexa+: "I don't have any stored preferences."
  
  User: "Alexa, plan my morning: wake me at 7, start coffee, 
         read the news, and check the weather."
  Alexa+: "I can set an alarm for 7 AM. What else would you like?"
  (Cannot chain multi-step tasks)

[0:45 - 1:15] AFTER: Alexa+ WITH ContextForge
- Screen recording of same requests with ContextForge enabled:
  
  User: "Alexa, I'm vegan. Plan dinner for 4 people."
  Alexa+: (via ContextForge)
    - store_preference: diet = vegan
    - execute_workflow: 
      → Planner: "Find vegan recipe for 4"
      → Executor: recipeTool → "Vegan Pasta Primavera"
      → Verifier: "Dietary compliance: vegan ✓"
    - Response: "I've stored that you're vegan and found a 
                Vegan Pasta Primavera recipe for 4. Want me to 
                add the ingredients to your shopping list?"
  
  User: "Yes, and check the weather too."
  Alexa+: (via ContextForge)
    - execute_workflow continues:
      → Executor: shoppingTool → "6 items added"
      → Executor: weatherTool → "22°C, clear in Lagos"
      → Verifier: "All steps completed"
    - Response: "Done. I added pasta, tomatoes, basil, olive oil,
                garlic, and zucchini to your shopping list.
                It's 22°C and clear in Lagos."

[1:15 - 1:40] MEMORY DEMONSTRATION
- Next day simulation:
  
  User: "Alexa, what do you remember about me?"
  Alexa+: (via ContextForge get_memory_summary)
    "I know you're vegan, allergic to peanuts, enjoy jazz music,
     and wake up at 7 AM. Yesterday you planned a vegan dinner
     using Pasta Primavera. I'll always respect these preferences."

[1:40 - 2:00] MULTI-STEP ORCHESTRATION
  User: "Alexa, set up my morning: wake me at 7, start the coffee 
         maker, read me the top 3 news headlines, and tell me 
         the weather."
  Alexa+: (via ContextForge execute_workflow)
    - Planner: 4 steps
    - Executor: 
      Step 1: reminderTool → alarm set for 7 AM ✓
      Step 2: smartHomeTool → coffee maker started ✓
      Step 3: newsTool → 3 headlines retrieved ✓
      Step 4: weatherTool → "22°C, clear in Lagos" ✓
    - Verifier: "All 4 steps completed successfully"
    - Response: "Morning routine set. I'll wake you at 7, start the
                coffee, and have your news and weather ready.
                Here are today's top 3 headlines: [reads headlines]"

[2:00 - 2:30] TECHNICAL DEEP DIVE
- Architecture diagram appears on screen
- Brief narration:
  "ContextForge is a self-hosted MCP server using Streamable HTTP
   transport. It's built on FastMCP for the MCP protocol layer,
   Strands Agents SDK for planning and verification, a pool of free
   LLM providers for reasoning, and Supabase for persistent memory.
   
   The Planner-Executor-Verifier pipeline ensures tasks are broken down,
   executed reliably, and verified before completion.
   
   It runs entirely on free tiers: Render, Cloudflare, Supabase, and free LLM tiers
   — zero infrastructure cost, no payment method required."

[2:30 - 2:45] CALL TO ACTION
- "ContextForge gives Alexa+ the memory and intelligence it's missing."
- GitHub repo link appears
- "Built for the Amazon Build, Ship, Shape Hackathon"
- End card
```

### 7.3 Static Replay Simulator (v2)

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

---

## 8. PROJECT STRUCTURE

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

---

## 9. DEPLOYMENT

### 9.1 Local Development

```bash
# 1. Clone the repo
git clone https://github.com/yourusername/contextforge.git
cd contextforge

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your OpenRouter API key, Supabase URL, and Supabase service role key

# 4. Create database tables
# Run the SQL in infra/schema.sql in the Supabase SQL Editor

# 5. Run the MCP server
npm run dev
# Server starts on http://localhost:3000/mcp

# 6. Run the demo simulator
npm run demo
# Simulator starts on http://localhost:3001
```

### 9.2 Environment Variables

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

### 9.3 Render Deployment

Render hosts the FastMCP server as a free web service with automatic HTTPS and auto-deploy from Git.

#### Render Configuration

1. Push your code to GitHub
2. Go to [render.com](https://render.com) and create a new **Web Service** from your repository
3. Configure:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Environment Variables:** Set all variables from `.env.example`
   - **Instance Type:** Free
4. Deploy — Render auto-deploys on every Git push

#### Render `render.yaml` (Infrastructure as Code)

```yaml
# render.yaml
services:
  - type: web
    name: contextforge
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: OPENROUTER_API_KEY
        sync: false
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
      - key: GROQ_API_KEY
        sync: false
      - key: CLOUDFLARE_ACCOUNT_ID
        sync: false
      - key: CLOUDFLARE_API_TOKEN
        sync: false
      - key: GEMINI_API_KEY
        sync: false
      # v2: no MCP_SERVER_PORT. Render provides PORT; bind to it in index.ts
      - key: MCP_TRANSPORT_TYPE
        value: http-stream
      - key: MCP_STATELESS
        value: 'true'
    plan: free
    healthCheckPath: /health
```

#### Deploy Command

```bash
# After pushing to GitHub, Render auto-deploys
# Or manually deploy via Render CLI:
npm install -g @render/cli
render deploy

# After deployment, you get a URL like:
# https://contextforge.onrender.com
# MCP endpoint: https://contextforge.onrender.com/mcp
```

#### Render Free Tier Notes

- Service spins down after 15 minutes of inactivity
- Restart takes ~1 minute on first request after spin-down
- 750 free instance hours per workspace per month
- For the demo video, keep the service warm by pinging it periodically

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


---

## 10. SUBMISSION REQUIREMENTS CHECKLIST

### 10.1 Alexa+ Track Requirements

| Requirement | Status | Details |
|-------------|--------|---------|
| MCP spec version 2025-11-25 | ✓ | FastMCP implements this version |
| Streamable HTTP transport | ✓ | FastMCP `transportType: "http-stream"` |
| Working Agent Skill or self-hosted MCP server | ✓ | Self-hosted MCP server on Render |
| Runtime technology hook (MCP imported and called at runtime) | ✓ | FastMCP is imported and the server actively handles MCP requests |
| Code repository on GitHub | ✓ | Public repo with open-source license |
| Setup and run instructions | ✓ | docs/README.md |
| Demonstration video (< 3 minutes) | ✓ | YouTube, 2:45 runtime |
| Video shows project functioning | ✓ | Shows simulated Alexa+ experience with and without ContextForge |
| Product feedback for every tool/API/SDK used | ✓ | In submission form |
| All materials in English | ✓ | |

### 10.2 AWS Builder Mini Challenge Requirements

| Requirement | Status | Details |
|-------------|--------|---------|
| Submitted to a Primary Track | ✓ | Alexa+ Track |
| Incorporates AWS services | ✓ | Strands SDK (AWS open-source agent framework) used at runtime; Kiro Crew (AWS development tool) used during development |
| Documented integrations | ✓ | In Product Feedback section of submission — describe Strands SDK usage and Kiro Crew development experience |

\1
**v2 notes:** (1) The official Devpost page says "Kiro"; your v1 text says "Kiro Crew". Confirm the exact wording in the official rules before writing the submission. (2) Strands must be genuinely used at runtime. In v2 the planner and verifier are Strands agents, so it is. (3) Document the integration in the Product Feedback section.

### 10.3 Bonus Opportunities

| Bonus | Status | Details |
|-------|--------|---------|
| Friction log (up to 10% bonus) | ✓ | docs/FRICTION_LOG.md — documents development friction with MCP SDK, Strands SDK, OpenRouter, and Supabase |
| Open Source Mini Challenge | Optional | Could submit the ContextForge repo as an open-source contribution |

### 10.4 Repository Sharing (if private)

GitHub collaborators to add:
- `chris-trag`
- `knmeiss`
- `giolaq`
- `anishamalde`
- `mosesroth`
- `emersonsklar`
- `testing@devpost.com`

---

## 11. BUILD TIMELINE

| Phase | Days | Dates (Sept 26 - Oct 23) | Deliverable |
|-------|------|--------------------------|-------------|
| 0. Pre-build setup | 0.5 | Sept 26 | OpenRouter API key, Supabase project, Render account, Node 22.19+ installed |
| 1. Project scaffolding | 0.5 | Sept 26 | npm init, install deps, config files |
| 2. FastMCP server + tool stubs | 0.5 | Sept 26-27 | Working MCP server with 6 tool stubs, tested with MCP Inspector |
| 3. Supabase storage layer | 1 | Sept 27-28 | All 4 storage functions working |
| 4. Tool implementations | 1.5 | Sept 28-30 | All 6 MCP tools fully functional |
| 5. Provider pool + tool registry | 1 | Sept 30-Oct 1 | providers.ts with fallback working, 7 tools in the registry |
| 6. Plan → Execute → Verify | 1 | Oct 1-2 | workflow.ts: planner agent, deterministic executor, rule + LLM verifier |
| 7. execute_workflow tool | 1 | Oct 2-3 | End-to-end multi-step execution working |
| 8. Render deployment | 0.5 | Oct 3-4 | MCP server live on Render free tier |
| 9. Static replay simulator | 1 | Oct 4-6 | Fixture-driven before/after page; add Cloudflare keep-alive |
| 10. Integration testing | 1 | Oct 6-7 | All tools, storage, and agent working together |
| 11. Demo video recording | 2 | Oct 7-9 | 3-minute video on YouTube |
| 12. Documentation | 1 | Oct 9-10 | README, friction log, product feedback |
| 13. Polish + buffer | 3 | Oct 10-13 | Bug fixes, edge cases, final testing |
| 14. Submit | 1 | Oct 14 | Final submission on Devpost |
| **Buffer** | **9** | **Oct 14-23** | Extra time for unexpected issues |

*Dates assume a Sept 26 start. Shift them to where you actually are; the order and the buffer matter more than the dates.*

---

## 12. JUDGING CRITERIA MAPPING

### 12.1 Stage One: Viability Pass/Fail

| Criterion | How ContextForge Passes |
|-----------|------------------------|
| Meets baseline viability | Working MCP server with 6 functional tools |
| Reasonably fits hackathon theme | Built for Alexa+ track — MCP server for Alexa+ |
| Reasonably applies required APIs/SDKs | FastMCP (MCP protocol), Strands SDK (agents), free LLM provider pool, Supabase (storage) |

### 12.2 Stage Two: Equally Weighted Criteria

#### Criterion 1: Tech Implementation (25%)

| Sub-criterion | Evidence |
|---------------|----------|
| How well the Project is built | Clean architecture: MCP server → storage layer → agent layer → tool layer. TypeScript throughout. Type-safe with Zod. |
| How effectively it uses required technology | MCP protocol (Streamable HTTP, spec 2025-11-25), Supabase (PostgreSQL with RLS), a pooled free LLM layer (Groq, Workers AI, Gemini, OpenRouter), Strands SDK (planner and verifier agents) |
| Whether implementation is effective for Alexa+ track | Directly addresses Alexa+'s two biggest failures (memory + multi-step execution). The runtime technology hook is genuine — FastMCP is imported and actively handles MCP requests. Strands agents plan and verify every workflow. |

#### Criterion 2: Design (25%)

| Sub-criterion | Evidence |
|---------------|----------|
| Complete product experience | End-to-end: user speaks → Alexa+ routes to ContextForge → preferences loaded → task planned → executed → verified → response spoken. Full loop. |
| Coherent product experience | All 6 tools work together as a system. Memory layer feeds into agent layer. Execution results feed back into memory layer. |
| Intuitive interaction model | User speaks naturally. ContextForge handles complexity. No wizard incantations needed — the agent interprets natural language. |
| Well-considered for target platform | Designed for voice-first interaction. Responses are concise (no excessive verbosity). Memory is persistent across sessions. |

#### Criterion 3: Potential Impact (25%)

| Sub-criterion | Evidence |
|---------------|----------|
| Credible case for solving customer needs | Research-backed: top Alexa+ user complaints are memory failure and no multi-turn context. ContextForge directly solves both. |
| Could serve audience beyond hackathon | Millions of Alexa+ users experience these problems. The MCP server could be deployed as a public tool or integrated into Alexa+ natively. |
| Potential destinations | Could be published as an Alexa+ Agent Skill or MCP server in Amazon's ecosystem. |

#### Criterion 4: Quality of the Idea (25%)

| Sub-criterion | Evidence |
|---------------|----------|
| Creative use of required tools | Combines MCP protocol + plan/execute/verify orchestration + persistent memory + a pooled free LLM layer in a novel way. Not a single-turn Q&A bot or basic MCP wrapper. |
| Genuine understanding of developer ecosystem | Built on FastMCP (MCP framework), Strands SDK (AWS agent framework), Supabase (PostgreSQL), Groq / Workers AI / OpenRouter (LLMs). Deep ecosystem integration. |
| Understanding of end-user needs | Based on research across Wirecutter, Hacker News, PCMag, Amazon Forums, and internal Amazon employee leaks. Addresses documented, acute pain points. |
| Creative vs obvious | Matches BOTH "creative" examples from the official rules: "agentic workflow that autonomously orchestrates across services" AND "context-aware add-on that maintains state across sessions". |

---

## 13. ANTI-PATTERNS AVOIDED

Based on the hackathon-winning-project research, ContextForge avoids these documented failure patterns:

| Anti-Pattern | How ContextForge Avoids It |
|--------------|---------------------------|
| Overengineering | 6 focused tools, not 20 half-built features. Each tool does one thing well. |
| Too broad scope | Focused on Alexa+ track only. Not trying to support Fire TV, Bee, or Ring. |
| Weak problem | Addresses the #1 and #2 most acute Alexa user pain points with research evidence. |
| Poor explanation | Demo video shows clear before/after comparison. Problem is obvious in 30 seconds. |
| Unclear target user | Target: any Alexa+ user who has experienced preference amnesia or multi-step task failure. |
| Impressive technology with no useful application | The technology (MCP + multi-agent + persistent memory) directly serves the user need (remembering preferences + executing complex tasks). |
| Generic AI wrapper | Not a single-turn chatbot. Planner and verifier agents around a deterministic executor, with persistent state, are architecturally distinct from a generic AI wrapper. |
| Lack of differentiation | No existing Alexa+ MCP server provides persistent memory + multi-agent orchestration. This is novel. |
| Solving a problem judges don't care about | Amazon's own employee feedback documents these exact problems. Judges are Amazon employees. |
| Technical complexity that cannot be communicated | Demo shows the problem and solution in plain language. No jargon in the user-facing experience. |

---

## 14. SOURCES

- [OpenRouter Free Tier](https://openrouter.ai/blog/tutorials/free-llm-apis-compared/)
- [OpenRouter Free Models Details](https://klymentiev.com/blog/openrouter-free-tier)
- [Render Free Tier](https://render.com/docs/free)
- [Supabase Pricing](https://supabase.com/pricing)
- [MCP TypeScript SDK — First Server Guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/get-started/first-server.md)
- [MCP Streamable HTTP Transport Specification](https://modelcontextprotocol.io/specification/draft/basic/transports/streamable-http)
- [FastMCP TypeScript Framework](https://github.com/punkpeye/fastmcp)
- [FastMCP Serverless Deployment Guide (Lambda)](https://punkpeye-fastmcp.mintlify.app/deployment/serverless)
- [Strands Agents TypeScript 1.0](https://strandsagents.com/blog/strands-agents-typescript-v1/)
- [Strands Agents SDK — GitHub](https://github.com/strands-agents/harness-sdk)
- [Introducing Strands Agents (AWS Blog)](https://aws.amazon.com/blogs/opensource/introducing-strands-agents-an-open-source-ai-agents-sdk/)
- [Amazon Bedrock AgentCore](https://aws.amazon.com/bedrock/agentcore/) (reference only)
- [Build, Ship, Shape Hackathon Rules](https://amazonappdev2026.devpost.com/rules)
- [Build, Ship, Shape Hackathon FAQs](https://amazonappdev2026.devpost.com/details/faqs)
- [AI Agent Frameworks 2026 Comparison (Morph)](https://www.morphllm.com/ai-agent-framework)
- [MCP Inspector Documentation](https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector)
- [Wirecutter — Alexa+ Smart Speaker Review](https://www.nytimes.com/wirecutter/reviews/gen-ai-smart-speakers/)
- [Wirecutter — Alexa+ Long-Term Review](https://www.nytimes.com/wirecutter/reviews/amazon-alexa-plus-pros-cons/)
- [PCMag — 10 Most Annoying Things About Alexa](https://www.pcmag.com/how-to/most-annoying-things-about-amazon-alexa-how-to-fix-them)
- [Hacker News — Amazon Gutting Alexa](https://news.ycombinator.com/item?id=33680904)
- [Gadgets Now — Alexa+ Internal Testing Issues](https://gadgetsnow.indiatimes.com/appliances/inside-amazons-alexa-troubles-employees-report-unbearably-erratic-performance-during-internal-testing/articleshow/126359279.cms)
- [Strands: OpenRouter via the OpenAI provider](https://strandsagents.com/docs/integrations/model-providers/openrouter/)
- [Strands: Vercel AI SDK model provider](https://strandsagents.com/docs/user-guide/concepts/model-providers/vercel/)
- [Cloudflare: MCP Streamable HTTP transport](https://developers.cloudflare.com/agents/model-context-protocol/protocol/transport/index.md)
- [OpenRouter Pricing and rate limits](https://openrouter.ai/pricing)
- [Free LLM API Comparison 2026 (Groq limits)](https://blogs.novita.ai/free-llm-api-comparison-2026/)
- [5 Free LLM API Providers 2026 (Workers AI, Gemini)](https://kdnuggets.com/5-free-llm-api-providers-you-can-use-in-2026)
- [Devpost: Resources (AWS Builder mini challenge)](https://amazonappdev2026.devpost.com/resources)
