# PROJECT SPECIFICATION: ContextForge
### A Persistent-Memory Agentic MCP Server for Alexa+

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
- **Multi-agent orchestration** — a Planner → Executor → Verifier pipeline using Strands Agents SDK
- **OpenRouter LLM integration** — free models for reasoning, tool use, and natural language understanding

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
| 3 | Create Render account | 5 min | Free hosting for MCP server — see Section 1.5.3 |
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

**Important:** Free models can get 429s from upstream providers when saturated. Always use a fallback list of 2-3 models from different providers. Use `:exacto` suffix for models optimized for tool-calling quality.

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
| LLM | OpenRouter (free models) | $0 | No |
| Database | Supabase (PostgreSQL) | $0 | No |
| Hosting | Render (web service) | $0 | No |
| MCP Server | FastMCP (open source) | $0 | No |
| Agent Framework | Strands SDK (open source) | $0 | No |
| MCP Testing | MCP Inspector | $0 | No |
| AWS Builder Qualification | Kiro Crew (free dev tool) | $0 | No |
| **Total** | | **$0** | **No payment method needed** |

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
│  │  MEMORY LAYER  │  │  AGENT LAYER  │  │  OPENROUTER INTEGRATION │   │
│  │                │  │               │  │                        │   │
│  │  Supabase     │  │  Strands SDK  │  │  Free models          │   │
│  │  (PostgreSQL) │  │  createHarness│  │  (via OpenRouter)     │   │
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
│  │  S3 session storage (Strands built-in)                      │    │
│  │  OpenTelemetry tracing                                     │    │
│  │  Conversation summarization (Strands built-in)              │    │
│  │  Sliding window context management (Strands built-in)       │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      AWS FREE TIER INFRASTRUCTURE                    │
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
   → Strands harness agent receives task:
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
    "node": ">=20.0.0"
  },
  "dependencies": {
    "fastmcp": "^4.21.1",
    "@strands-agents/sdk": "latest",
    "@strands-agents/harness": "latest",
    "@supabase/supabase-js": "^2.0.0",
    "zod": "^3.0.0"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "@types/node": "^20.0.0"
  },
  "scripts": {
    "dev": "tsx src/index.ts",
    "start": "node dist/index.js",
    "build": "tsc",
    "test": "tsx tests/all.test.ts"
  }
}
```

### 3.2 Stack Justification

| Layer | Technology | Why This Choice | Cost |
|-------|-----------|----------------|------|
| MCP Server Framework | FastMCP (TypeScript) | Reduces MCP server to tool definitions only; handles Streamable HTTP transport, sessions, CORS, auth, stateless mode automatically; implements spec 2025-11-25 (hackathon minimum) | $0 (open source) |
| Agent Framework | Strands Agents SDK (TypeScript) | `createHarness()` gives pre-configured agent with model, memory, sessions, context management, guardrails, tracing — all benchmarked defaults; native MCP support; multi-agent orchestration (Graph, Swarm, agent-as-tool) | $0 (open source, Apache 2.0) |
| LLM | OpenRouter (free models) | 20+ free models from multiple providers; single API key; OpenAI-compatible endpoint; no credit card required; 50 requests/day (1000 with $10 top-up) | $0 |
| Database | Supabase (PostgreSQL) | Free tier with 500MB storage; full SQL access; real-time subscriptions; row-level security; you already know Supabase | $0 |
| Hosting | Render (web service) | Free tier with 750 instance hours/month; automatic HTTPS; auto-deploy from Git; supports Node.js natively | $0 |
| Session Storage | In-memory (Strands SDK) | Strands SDK handles session management in-memory by default; sufficient for hackathon demo | $0 |
| Validation | Zod | Runtime input validation; TypeScript-native; used by both FastMCP and Strands | $0 |
| Runtime | Node.js 20+ | User's primary language; required by FastMCP and Strands TypeScript SDK | $0 |
| AWS Builder Qualification | Kiro Crew + Strands SDK | Kiro Crew (free AWS dev tool) qualifies for AWS Builder Mini Challenge per rules; Strands SDK is an AWS open-source tool used at runtime | $0 |

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
  expires_at TIMESTAMPTZ,
  related_task_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_context_user ON conversation_context(user_id);
CREATE INDEX idx_context_user_priority ON conversation_context(user_id, priority DESC, created_at DESC);

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

CREATE INDEX idx_executions_user ON workflow_executions(user_id, created_at DESC);

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
    .order('priority', { ascending: false })
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
  output: "Confirmation with stored context ID"
}
```

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

**Internal execution flow:**

```
1. Load user preferences (get_preferences)
2. Load active context (get_context)
3. PLANNER AGENT:
   - Receives task + preferences + context
   - Breaks task into ordered steps
   - Each step has: description, required_tool, expected_input
4. EXECUTOR AGENT:
   - For each step:
     a. Execute the tool with the planned input
     b. Capture the output
     c. If failed: retry up to max_retries_per_step
     d. If still failed: log error, continue to next step or abort
5. VERIFIER AGENT:
   - Review all step results
   - Check if overall task was completed
   - Identify any gaps or failures
   - Suggest remediation if needed
6. Store execution log in Supabase
7. Store relevant context from execution
8. Return structured result
```

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

### 6.1 Strands Harness Configuration

> **Known Gap:** The Strands TypeScript SDK lists memory, sessions, S3 session storage, conversation summarization, and sliding window context management as features. `createHarness()` provides benchmarked defaults for all of these. However, the actual configuration code for customizing these (session storage backend, conversation window size, summarization strategy) is not in any public blog post or README. The defaults are benchmarked and should work for a hackathon demo.
>
> **Workaround:** Use `createHarness()` with defaults. Only customize if a specific limitation is hit during testing. For advanced configuration, read the SDK source code on [GitHub](https://github.com/strands-agents/harness-sdk) under `strands-ts/` or check the [strandsagents.com documentation site](https://strandsagents.com).

```typescript
import { createHarness } from '@strands-agents/harness'

// OpenRouter is used as the model provider (free tier, no credit card)
// Strands SDK supports OpenRouter via LiteLLM provider

// createHarness() provides:
// - Default model: OpenRouter free models (configurable)
// - Memory: sliding window + summarization
// - Sessions: S3-backed persistence
// - Context management: automatic
// - Guardrails: built-in
// - Tracing: OpenTelemetry
// - Token tracking: built-in
// - Execution limits: turn limits + token budgets

const harness = await createHarness({
  model: {
    provider: 'litellm',
    modelId: 'openrouter/free',
    // Or specify a particular free model:
    // modelId: 'nvidia/nemotron-3-super-120b-a12b:free',
    // Or use :exacto variant for tool-calling quality:
    // modelId: 'nvidia/nemotron-3-super-120b-a12b:exacto',
    apiKey: process.env.OPENROUTER_API_KEY!,
    baseUrl: 'https://openrouter.ai/api/v1',
  },
  // Strands SDK provides via createHarness() defaults:
  // - Memory: sliding window + summarization
  // - Sessions: in-memory (sufficient for hackathon demo)
  // - Context management: automatic
  // - Guardrails: built-in
  // - Tracing: OpenTelemetry
  // - Token tracking: built-in
  // - Execution limits: turn limits + token budgets
})
```

### 6.2 Multi-Agent Graph Architecture

```typescript
import { Agent } from '@strands-agents/sdk'
import { Graph } from '@strands-agents/sdk/multiagent'
// OpenRouter used via LiteLLM provider (no BedrockModel import needed)

// Agent 1: PLANNER
// Receives the task + user preferences + context
// Outputs a structured plan as an array of steps
const planner = new Agent({
  id: 'planner',
  name: 'planner',
  description: 'Breaks complex tasks into actionable, ordered steps',
  systemPrompt: `You are a task planner for an Alexa+ assistant.
    
    You receive:
    1. A user's task in natural language
    2. The user's stored preferences (hard constraints)
    3. Active conversation context
    
    Your job:
    - Break the task into concrete, ordered steps
    - For each step, specify: description, required tool, expected input
    - Respect ALL user preferences — never plan a step that violates them
    - If the task is ambiguous, make reasonable assumptions based on preferences
    - Limit to a maximum of {max_steps} steps
    
    Output a JSON array of step objects.`,
  model: {
    provider: 'litellm',
    modelId: 'openrouter/free',
    apiKey: process.env.OPENROUTER_API_KEY!,
    baseUrl: 'https://openrouter.ai/api/v1',
  }
})

// Agent 2: EXECUTOR
// Runs each step using available tools
// Handles errors and retries
const executor = new Agent({
  id: 'executor',
  name: 'executor',
  description: 'Executes individual task steps using available tools',
  systemPrompt: `You are a task executor for an Alexa+ assistant.
    
    You receive:
    1. A single step from a plan
    2. The user's preferences (hard constraints)
    3. The results of previous steps
    
    Your job:
    - Execute the step using the appropriate tool
    - Capture the output
    - If the step fails, try an alternative approach
    - Never violate user preferences
    - Report success or failure with detailed output
    
    Be precise and factual. Do not add commentary.`,
  model: {
    provider: 'litellm',
    modelId: 'openrouter/free',
    apiKey: process.env.OPENROUTER_API_KEY!,
    baseUrl: 'https://openrouter.ai/api/v1',
  },
  tools: [
    weatherTool,
    calendarTool,
    shoppingTool,
    recipeTool,
    smartHomeTool,
    reminderTool
  ]
})

// Agent 3: VERIFIER
// Reviews all step results
// Checks for completeness and correctness
const verifier = new Agent({
  id: 'verifier',
  name: 'verifier',
  description: 'Verifies that all steps were completed correctly',
  systemPrompt: `You are a verifier for an Alexa+ assistant.
    
    You receive:
    1. The original task
    2. The plan (all steps)
    3. The execution results for each step
    
    Your job:
    - Check if each step was completed successfully
    - Identify any gaps, missing steps, or failures
    - Verify that user preferences were respected throughout
    - If any step failed, suggest a retry strategy
    - Determine overall task completion status
    
    Output a verification report with: overall_status, step_results, 
    gaps_found, retry_suggestions, summary.`,
  model: {
    provider: 'litellm',
    modelId: 'openrouter/free',
    apiKey: process.env.OPENROUTER_API_KEY!,
    baseUrl: 'https://openrouter.ai/api/v1',
  }
})

// Create the execution graph: Planner → Executor → Verifier
export const workflowGraph = new Graph({
  nodes: [planner, executor, verifier],
  edges: [
    ['planner', 'executor'],
    ['executor', 'verifier']
  ]
})
```

### 6.3 Custom Tools for the Executor Agent

```typescript
import { tool } from '@strands-agents/sdk'
import { z } from 'zod'

// WEATHER TOOL
export const weatherTool = tool({
  name: 'get_weather',
  description: 'Get current weather for a city',
  inputSchema: z.object({
    city: z.string().describe('City name'),
    units: z.enum(['celsius', 'fahrenheit']).optional()
  }),
  callback: async (input) => {
    const units = input.units === 'fahrenheit' ? 'u' : 'm'
    const res = await fetch(
      `https://wttr.in/${encodeURIComponent(input.city)}?format=${units}3`
    )
    return await res.text()
  }
})

// CALENDAR TOOL
export const calendarTool = tool({
  name: 'check_calendar',
  description: 'Check available time slots for a given date',
  inputSchema: z.object({
    date: z.string().describe('ISO date string (YYYY-MM-DD)'),
    duration_minutes: z.number().optional()
      .describe('Required duration in minutes')
  }),
  callback: async (input) => {
    // Integrate with real calendar API or mock
    return JSON.stringify({
      date: input.date,
      available_slots: ['09:00', '11:00', '14:00', '16:00', '18:00']
    })
  }
})

// SHOPPING LIST TOOL
export const shoppingTool = tool({
  name: 'add_to_shopping_list',
  description: 'Add items to the user shopping list',
  inputSchema: z.object({
    items: z.array(z.string()).describe('List of items to add'),
    list_name: z.string().optional()
      .describe('Optional list name. Defaults to "shopping".')
  }),
  callback: async (input) => {
    // Integrate with Alexa shopping list API or Supabase
    return `Added ${input.items.length} items to ${input.list_name || 'shopping'} list: ${input.items.join(', ')}`
  }
})

// RECIPE TOOL
export const recipeTool = tool({
  name: 'find_recipe',
  description: 'Find a recipe matching dietary preferences and serving size',
  inputSchema: z.object({
    dietary_restrictions: z.array(z.string())
      .describe('Dietary restrictions (e.g., ["vegan", "gluten-free"])'),
    servings: z.number().describe('Number of servings'),
    meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'dessert'])
      .describe('Type of meal'),
    cuisine: z.string().optional().describe('Preferred cuisine (e.g., "Italian")')
  }),
  callback: async (input) => {
    // Use a recipe API or OpenRouter to generate a recipe
    return JSON.stringify({
      recipe_name: 'Vegan Pasta Primavera',
      servings: input.servings,
      ingredients: ['pasta', 'tomatoes', 'basil', 'olive oil', 'garlic', 'zucchini'],
      instructions: ['Boil pasta', 'Sauté vegetables', 'Combine and serve'],
      dietary_compliance: input.dietary_restrictions
    })
  }
})

// SMART HOME TOOL
export const smartHomeTool = tool({
  name: 'control_smart_home',
  description: 'Control a smart home device (lights, thermostat, etc.)',
  inputSchema: z.object({
    device: z.string().describe('Device name or ID'),
    action: z.string().describe('Action to perform (e.g., "turn_on", "set_temperature")'),
    value: z.string().optional().describe('Value for the action (e.g., "21" for temperature)')
  }),
  callback: async (input) => {
    // Integrate with Alexa smart home API
    return `Successfully ${input.action} on ${input.device}${input.value ? ` (set to ${input.value})` : ''}`
  }
})

// REMINDER TOOL
export const reminderTool = tool({
  name: 'set_reminder',
  description: 'Set a reminder for the user',
  inputSchema: z.object({
    message: z.string().describe('Reminder message'),
    time: z.string().describe('ISO datetime or natural language time'),
    recurring: z.enum(['none', 'daily', 'weekly', 'monthly']).optional()
      .describe('Recurrence pattern. Defaults to "none".')
  }),
  callback: async (input) => {
    // Integrate with Alexa reminders API
    return `Reminder set: "${input.message}" at ${input.time}${input.recurring && input.recurring !== 'none' ? ` (${input.recurring})` : ''}`
  }
})
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
   Strands Agents SDK for multi-agent orchestration, OpenRouter
   free models for reasoning, and Supabase for persistent memory.
   
   The Planner-Executor-Verifier graph ensures tasks are broken down,
   executed reliably, and verified before completion.
   
   It runs entirely on free tiers: Render, Supabase, and OpenRouter
   — zero infrastructure cost, no payment method required."

[2:30 - 2:45] CALL TO ACTION
- "ContextForge gives Alexa+ the memory and intelligence it's missing."
- GitHub repo link appears
- "Built for the Amazon Build, Ship, Shape Hackathon"
- End card
```

### 7.3 Simulator Implementation

```typescript
// src/demo/simulator.ts
import express from 'express'
import { FastMCP } from 'fastmcp'

const app = express()
app.use(express.json())
app.use(express.static('public'))

// Two modes: without ContextForge (simulates broken Alexa+) 
// and with ContextForge (simulates fixed Alexa+)

app.post('/api/chat', async (req, res) => {
  const { message, userId, mode } = req.body
  // mode: 'without' = simulate Alexa+ failures
  // mode: 'with' = route through ContextForge MCP server

  if (mode === 'without') {
    // Simulate Alexa+ failures based on research:
    // - Forgets preferences
    // - Can't chain tasks
    // - Suggests non-vegan food
    // - Says "I don't have any stored preferences"
    const failureResponse = simulateAlexaFailure(message)
    res.json({
      response: failureResponse.text,
      toolCalls: [],
      memoryState: { preferences: [], contexts: [] }
    })
  } else {
    // Route through ContextForge MCP server
    const response = await callContextForge(message, userId)
    res.json({
      response: response.text,
      toolCalls: response.toolCalls,
      memoryState: response.memoryState
    })
  }
})

app.listen(3001, () => {
  console.log('Demo simulator running on http://localhost:3001')
})
```

```html
<!-- public/index.html -->
<!-- Single-page demo with two panels:
     Left: "Alexa+ WITHOUT ContextForge" (shows failures)
     Right: "Alexa+ WITH ContextForge" (shows success)
     Bottom: Memory state visualization (Supabase contents) -->
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
│   │   └── supabase.ts              # Supabase client + all storage functions
│   │
│   ├── tools/                      # MCP tool definitions (registered with FastMCP)
│   │   ├── store_preference.ts     # Tool 1: Store user preference
│   │   ├── get_preferences.ts      # Tool 2: Retrieve user preferences
│   │   ├── store_context.ts        # Tool 3: Store conversation context
│   │   ├── get_context.ts          # Tool 4: Retrieve active context
│   │   ├── execute_workflow.ts     # Tool 5: Multi-step agentic execution
│   │   └── get_memory_summary.ts   # Tool 6: Return full user profile
│   │
│   ├── agent/                      # Strands agent configuration
│   │   ├── harness.ts              # createHarness() configuration
│   │   ├── multi-agent.ts          # Graph: Planner → Executor → Verifier
│   │   └── tools/                  # Custom tools for the executor agent
│   │       ├── weather.ts
│   │       ├── calendar.ts
│   │       ├── shopping.ts
│   │       ├── recipe.ts
│   │       ├── smart_home.ts
│   │       └── reminder.ts
│   │
│   ├── demo/                       # Demo simulator
│   │   ├── simulator.ts            # Express app serving the demo
│   │   ├── failure_simulator.ts    # Simulates Alexa+ failures
│   │   └── public/
│   │       ├── index.html          # Demo page
│   │       ├── style.css
│   │       └── app.js              # Demo interaction logic
│   │
│   └── utils/
│       ├── logger.ts               # Structured logging
│       └── errors.ts               # Error types
│
├── tests/
│   ├── tools.test.ts               # Unit tests for each MCP tool
│   ├── storage.test.ts             # Supabase storage tests
│   ├── agent.test.ts               # Agent workflow tests
│   └── integration.test.ts          # End-to-end integration tests
│
├── docs/
│   ├── README.md                   # Setup and run instructions
│   ├── ARCHITECTURE.md             # Architecture documentation
│   ├── API.md                      # MCP tool API documentation
│   └── FRICTION_LOG.md            # Developer friction log (10% judging bonus)
│
├── infra/
│   ├── render.yaml                # Render deployment configuration
│   └── schema.sql                 # Supabase SQL schema for table creation
│
├── package.json
├── tsconfig.json
├── .env.example                    # Environment variable template
├── .gitignore
└── LICENSE                         # Open-source license (MIT)
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

# OpenRouter (Free LLM)
OPENROUTER_API_KEY=sk-or-your-key-here

# Supabase (Free Database)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# MCP Server
MCP_SERVER_PORT=3000
MCP_TRANSPORT_TYPE=http-stream
MCP_STATELESS=true

# Demo
DEMO_PORT=3001
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
      - key: MCP_SERVER_PORT
        value: 3000
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

**Qualification basis:** The hackathon rules state: "Kiro Crew qualifies on its own as a development tool used during the Hackathon." Additionally, Strands SDK is listed as a qualifying AWS service/tool. Using Strands SDK at runtime (even with OpenRouter as the model provider) counts as incorporating AWS services, as Strands SDK is an AWS open-source project.

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
| 5. Strands harness + agent tools | 1 | Sept 30-Oct 1 | createHarness configured, 6 agent tools working |
| 6. Multi-agent Graph | 1 | Oct 1-2 | Planner → Executor → Verifier pipeline |
| 7. execute_workflow tool | 1 | Oct 2-3 | End-to-end multi-step execution working |
| 8. Render deployment | 0.5 | Oct 3-4 | MCP server live on Render free tier |
| 9. Demo simulator | 2 | Oct 4-6 | Web page with before/after comparison |
| 10. Integration testing | 1 | Oct 6-7 | All tools, storage, and agent working together |
| 11. Demo video recording | 2 | Oct 7-9 | 3-minute video on YouTube |
| 12. Documentation | 1 | Oct 9-10 | README, friction log, product feedback |
| 13. Polish + buffer | 3 | Oct 10-13 | Bug fixes, edge cases, final testing |
| 14. Submit | 1 | Oct 14 | Final submission on Devpost |
| **Buffer** | **9** | **Oct 14-23** | Extra time for unexpected issues |

---

## 12. JUDGING CRITERIA MAPPING

### 12.1 Stage One: Viability Pass/Fail

| Criterion | How ContextForge Passes |
|-----------|------------------------|
| Meets baseline viability | Working MCP server with 6 functional tools |
| Reasonably fits hackathon theme | Built for Alexa+ track — MCP server for Alexa+ |
| Reasonably applies required APIs/SDKs | FastMCP (MCP protocol), Strands SDK (agents), OpenRouter (LLM), Supabase (storage) |

### 12.2 Stage Two: Equally Weighted Criteria

#### Criterion 1: Tech Implementation (25%)

| Sub-criterion | Evidence |
|---------------|----------|
| How well the Project is built | Clean architecture: MCP server → storage layer → agent layer → tool layer. TypeScript throughout. Type-safe with Zod. |
| How effectively it uses required technology | MCP protocol (Streamable HTTP, spec 2025-11-25), Supabase (PostgreSQL with RLS), OpenRouter (free LLM with tool use), Strands SDK (multi-agent Graph) |
| Whether implementation is effective for Alexa+ track | Directly addresses Alexa+'s two biggest failures (memory + multi-step execution). The runtime technology hook is genuine — FastMCP is imported and actively handles MCP requests. Strands SDK orchestrates multi-agent workflows. |

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
| Creative use of required tools | Combines MCP protocol + multi-agent orchestration + persistent memory + OpenRouter free LLM in a novel way. Not a single-turn Q&A bot or basic MCP wrapper. |
| Genuine understanding of developer ecosystem | Built on FastMCP (MCP framework), Strands SDK (AWS agent framework), Supabase (PostgreSQL), OpenRouter (LLM gateway). Deep ecosystem integration. |
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
| Generic AI wrapper | Not a single-turn chatbot. Multi-agent orchestration with persistent state is architecturally distinct from a generic AI wrapper. |
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
