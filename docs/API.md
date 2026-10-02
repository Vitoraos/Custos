# ContextForge MCP Tool API

Endpoint: `POST /mcp` (Streamable HTTP, spec `2025-11-25`, stateless).
Headers: `Content-Type: application/json`, `Accept: application/json, text/event-stream`.
Every tool returns a `text` content item; JSON payloads below are the text body.

Conventions: `user_id` is the Alexa device/account ID (demo: `amzn1.account.DEMO-USER-001`).
All memory tools require `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; `execute_workflow` additionally
needs at least one LLM provider key.

---

## `store_preference`

Persist a preference across sessions.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `user_id` | string | ✓ | |
| `key` | string | ✓ | e.g. `diet`, `music_taste`, `wake_time` |
| `value` | string | ✓ | e.g. `vegan`, `jazz`, `07:00` |
| `category` | enum | ✓ | `diet` `music` `schedule` `smart_home` `personal` `general` |
| `source` | enum | | `voice` (default) `explicit` `inferred` |

Request: `{"user_id":"amzn1.account.DEMO-USER-001","key":"diet","value":"vegan","category":"diet","source":"explicit"}`
Response: `"Preference stored: diet = vegan. This will be remembered for all future interactions."`

---

## `get_preferences`

Load the profile (optionally by category). Treat results as hard constraints.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `user_id` | string | ✓ | |
| `category` | enum | | Same enum as above; omit = all |

Request: `{"user_id":"amzn1.account.DEMO-USER-001","category":"diet"}`
Response: `"[{\"key\":\"diet\",\"value\":\"vegan\",\"category\":\"diet\",\"updatedAt\":\"2026-10-01T14:30:00Z\"},{\"key\":\"allergies\",\"value\":\"peanuts\",\"category\":\"diet\",\"updatedAt\":\"2026-10-01T14:32:00Z\"}]"`

---

## `store_context`

Save conversation context; `kind: 'instruction'` saves a standing rule instead.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `user_id` | string | ✓ | |
| `context` | string | ✓ | Natural language |
| `priority` | enum | | `low` `medium` (default) `high` |
| `expires_in_hours` | number | | TTL; omit = permanent |
| `related_task_id` | string | | Workflow execution reference |
| `kind` | enum | | `note` (default) `instruction` → stored in `user_instructions`, priority mapped low→nice_to_have, medium→important, high→critical |

Request: `{"user_id":"amzn1.account.DEMO-USER-001","context":"Dinner plan: Vegan Pasta Primavera for 4.","priority":"medium","expires_in_hours":24}`
Response: `"Context stored (priority: medium, expires in 24h)."`
Instruction variant: `{"user_id":"…","context":"Keep answers short.","priority":"high","kind":"instruction"}`
→ `"Instruction stored (critical): Keep answers short."`

---

## `get_context`

Load active (non-expired) context, priority-first, recency-second.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `user_id` | string | ✓ | |
| `limit` | number | | Default 10 |
| `priority_filter` | enum | | `low` `medium` `high` — returns that priority or higher |

Response: JSON array of `{context, priority, priority_rank, expires_at, …}` rows.

---

## `execute_workflow`

Plan and execute a multi-step task (planner LLM → deterministic executor → rule check → verifier LLM).

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `user_id` | string | ✓ | Memory is loaded automatically |
| `task` | string | ✓ | Natural language, e.g. `"Plan dinner for 4 vegans, check weather, add groceries"` |
| `max_steps` | number | | Default 10 (runaway guard) |
| `max_retries_per_step` | number | | Default 2 (800ms × attempt backoff) |

Response (abridged):

```json
{
  "status": "completed",
  "steps": [
    {"step": 1, "tool": "find_recipe", "attempt": 1, "status": "success", "output": "{…Vegan Pasta Primavera…}"},
    {"step": 2, "tool": "add_to_shopping_list", "attempt": 1, "status": "success", "output": "Added 6 items…"},
    {"step": 3, "tool": "get_weather", "attempt": 1, "status": "success", "output": "Lagos: 22C, clear sky"}
  ],
  "verdict": {"overall_status": "completed", "gaps_found": [], "retry_suggestions": [], "summary": "…"},
  "modelEvents": [],
  "durationMs": 8400,
  "usage": {"groq": 2}
}
```

Side effects: execution log appended to `workflow_executions`; on success a 72h follow-up context is stored.
If rule violations survive remediation, `status` is forced to `"failed"` with reasons in the trace.

---

## `get_memory_summary`

"Everything you know about me" as prose.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `user_id` | string | ✓ | |

Response:

```
Here's what I know about you:

PREFERENCES:
- diet: vegan
- allergies: peanuts
…

STANDING INSTRUCTIONS:
- Keep answers short. No jokes or upselling.

RECENT CONTEXT:
- You planned a vegan dinner for 4 yesterday using Pasta Primavera…

RECENT TASKS:
- Add dinner ingredients… (completed)

I will respect all of these in future interactions.
```

---

## Executor tools (agent-internal, not MCP)

Used by `execute_workflow`'s deterministic executor; useful context when reading traces:

| Tool | Input | Notes |
|------|-------|-------|
| `get_weather` | `{city, units?}` | Live: `wttr.in/?format=3&m\|u`. DEMO: fixtures |
| `check_calendar` | `{date, duration_minutes?}` | Stub slots `09:00…18:00` |
| `add_to_shopping_list` | `{items[], list_name?}` | `CHAOS=shopping_503` throws once |
| `find_recipe` | `{dietary_restrictions[], servings, meal_type, cuisine?, exclude?}` | Always reports `contains[]`; `CHAOS=bad_recipe` returns Chicken Alfredo once |
| `control_smart_home` | `{device, action, value?}` | Stub acknowledgement |
| `set_reminder` | `{message, time, recurring?}` | Stub acknowledgement |
| `get_news` | `{count?}` | DEMO: 3 fictional headlines |

## Errors

| Condition | Result |
|-----------|--------|
| Missing `SUPABASE_URL` / key | Tool error `Missing SUPABASE_URL (see .env.example)` (server stays up) |
| No LLM keys | `All LLM providers failed:` |
| Provider 429/5xx mid-run | Silent fallback; attempts listed in `modelEvents` |
| Upstream tool 503 | Retried with backoff, then recorded as error trace |
| Bad client `Accept` header | HTTP `4002 Not Acceptable` (transport-level, before tools) |
