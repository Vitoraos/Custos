# Product feedback

Feedback on every tool, API and SDK used to build Custos, written for the Amazon *Build, Ship, Shape* hackathon. For each one: what I used it for, what worked, what needs work, how onboarding felt, and whether I would build with it again.

Problems that cost time are logged separately, with steps and severity, in the [friction log](FRICTION_LOG.md). Entry numbers below point to it.

> **Before submitting:** lines tagged **[confirm]** are drafted from what the repository shows, not from first-hand notes. Replace each one with your own experience, or delete the tag if it already matches.

## Summary

| Tool | Used for | Build with it again? |
|---|---|---|
| [FastMCP](#fastmcp) | The MCP server and its 13 tools | Yes **[confirm]** |
| [MCP (Streamable HTTP)](#model-context-protocol) | The protocol between the simulator, other clients and the server | Yes **[confirm]** |
| [Strands Agents SDK](#strands-agents-sdk-aws) | The simulator's model-driven agent (AWS Builder challenge) | Yes, with caveats **[confirm]** |
| [OpenRouter](#openrouter) | Free model access for the simulator | For development only |
| [Supabase](#supabase) | Memories, receipts, device twin, lists, schedules, API keys | Yes **[confirm]** |
| [Render](#render) | Hosting the API, MCP endpoint and server-served UI | Yes **[confirm]** |
| [Vercel](#vercel) | Hosting the simulator UI | Yes **[confirm]** |
| [ntfy](#ntfy) | Real push notifications | Yes, for prototypes |
| [Open-Meteo](#open-meteo) | Weather reads | Yes **[confirm]** |
| [TheMealDB](#themealdb) | Recipe reads | Yes, with a fallback |
| [Zod](#zod) | Input and output validation | Yes |
| [Alexa+ MCP add-on](#alexa-mcp-add-on) | The intended integration target | Not yet evaluated end to end |

---

## FastMCP

- **Used for:** Hosting the MCP server and registering all 13 tools, with annotations (read-only, destructive, idempotent) and typed output schemas.
- **What worked:** Strict `outputSchema` validation produced a precise error that named the mismatched field, which caught a real evidence-shape bug early ([entry 8](FRICTION_LOG.md#8-fastmcps-strict-output-schema-errors-saved-time)). The server exposes the Hono app through `getApp()`, so one process serves `/mcp`, `/health`, `/sim/*` and the static UI.
- **What needs work:** No log of the resolved bind address at startup. On Windows, `127.0.0.1` refused connections while `localhost` worked ([entry 6](FRICTION_LOG.md#6-fastmcp-on-windows-127001-refused-localhost-worked)).
- **Onboarding:** Smooth once the transport rules were clear. **[confirm]**
- **Build again:** Yes. **[confirm]**

## Model Context Protocol

- **Used for:** The contract between clients and the server: Streamable HTTP, stateless, spec 2025-11-25, Bearer authentication and a result envelope with `structuredContent`.
- **What worked:** A single endpoint lets the simulator's agent and any other client use the same tools. Tool annotations map cleanly onto read-only, destructive and idempotent behaviour.
- **What needs work:** The docs lack a minimal raw HTTP example. A plain JSON-RPC `POST` fails with `-32000 Not Acceptable` unless the client accepts both JSON and an event stream, and the error does not name the missing header ([entry 4](FRICTION_LOG.md#4-mcp-streamable-http-rejects-requests-without-the-right-accept-header)).
- **Onboarding:** Clear for the concepts, thin for hand-written clients.
- **Build again:** Yes. **[confirm]**

## Strands Agents SDK (AWS)

- **Used for:** The simulator's agent loop over the same `/mcp` endpoint, with a model reached through an OpenAI-compatible base URL. This is the AWS service for the AWS Builder mini challenge.
- **What worked:** The agent consumed MCP tools directly, so the simulator needed no private tool path. **[confirm]**
- **What needs work:** The TypeScript SDK requires Zod v4, which broke an install that pinned v3 ([entry 1](FRICTION_LOG.md#1-strands-needs-zod-v4-my-spec-pinned-zod-v3)). `createHarness()` and a LiteLLM provider path that I expected were not in the installed TypeScript SDK ([entry 2](FRICTION_LOG.md#2-createharness-and-a-litellm-path-were-not-in-the-strands-typescript-sdk)). The OpenAI-compatible base-URL pattern deserves a prominent docs page.
- **Onboarding:** The slowest of the stack, mostly from version and API-surface mismatches.
- **Build again:** Yes, once pinned to the installed version's real types. **[confirm]**

## OpenRouter

- **Used for:** Free model access (`openrouter/free`) for the simulator's live mode.
- **What worked:** An OpenAI-compatible API meant no custom client code. Limits are documented clearly enough to plan around.
- **What needs work:** 20 requests a minute and 50 a day made repeated live runs expensive, and quota ran out during end-to-end testing ([entry 9](FRICTION_LOG.md#9-openrouter-free-tier-limits-changed-how-i-rehearse)). A quota indicator would help.
- **Onboarding:** Quick. **[confirm]**
- **Build again:** For development, yes. For a recorded demo I would not depend on it, which is why replay mode exists.

## Supabase

- **Used for:** PostgreSQL storage for memories, receipts, the device twin, list items, scheduled actions and hashed API keys, with row-level security enabled and a server-side service-role key.
- **What worked:** Plain SQL migrations (`001_v3.sql`, `002_atomic_list_ops.sql`, `003_scheduled_actions.sql`) kept the schema reviewable. The server falls back to an in-memory store when credentials are absent, so contributors can run it with no account.
- **What needs work:** Nothing logged. **[confirm]**
- **Onboarding:** **[confirm]**
- **Build again:** Yes. **[confirm]**

## Render

- **Used for:** Hosting the Node service that serves the API, `/mcp` and the built UI, configured in `infra/render.yaml`.
- **What worked:** A Node service with environment variables was enough. The backend never runs the UI build.
- **What needs work:** Free-tier services can be slow to wake. **[confirm]**
- **Onboarding:** **[confirm]**
- **Build again:** Yes. **[confirm]**

## Vercel

- **Used for:** Hosting the simulator UI from `simulator/web`, with `VITE_API_BASE` pointing at the Render backend.
- **What worked:** Static Vite deploys were straightforward once configured.
- **What needs work:** The build failed with `The specified Root Directory "<x>" does not exist` until Root Directory was set to `simulator/web`. The error should name the setting ([entry 11](FRICTION_LOG.md#11-vercel-build-failed-with-a-missing-root-directory)).
- **Onboarding:** Fast for a single app, less obvious for a monorepo.
- **Build again:** Yes. **[confirm]**

## ntfy

- **Used for:** Real push notifications for reminders and shopping-list summaries, with no API key.
- **What worked:** Keyless and quick to test. Messages reached a phone, which made the demo concrete.
- **What needs work:** The JSON poll endpoint returns newline-delimited JSON, so `res.json()` fails on multiple events ([entry 7](FRICTION_LOG.md#7-ntfys-json-poll-endpoint-returns-newline-delimited-json)). Delivery of a scheduled message cannot be observed before it fires, so Custos can only attest acceptance ([entry 10](FRICTION_LOG.md#10-ntfy-cannot-confirm-delivery-of-a-scheduled-message-before-it-fires)).
- **Onboarding:** Very easy.
- **Build again:** Yes, for prototypes. A product that must prove delivery needs a channel with delivery receipts.

## Open-Meteo

- **Used for:** Weather reads, including the forecast for a specific hour. Results are validated and cached, with `fetchedAt` and `source` attached.
- **What worked:** A keyless API with simple parameters. **[confirm]**
- **What needs work:** Nothing logged. I did write a malformed request URL early on, which review caught ([entry 13](FRICTION_LOG.md#13-my-own-spec-had-mistakes-that-review-caught)). **[confirm]**
- **Onboarding:** **[confirm]**
- **Build again:** Yes. **[confirm]**

## TheMealDB

- **Used for:** Real recipe ingredient lists, filtered by the policy engine against household rules.
- **What worked:** Real ingredient data let the allergen matcher be tested against realistic names. **[confirm]**
- **What needs work:** Ingredient names are free text, so matching depends on heuristics and is not allergen-safety grade. Availability is not guaranteed, so a clearly marked fallback dataset is used if the API is down.
- **Onboarding:** **[confirm]**
- **Build again:** Yes, with the fallback. **[confirm]**

## Zod

- **Used for:** Input limits, tool output schemas, adapter response validation and the typed rule union.
- **What worked:** One schema language across tools, adapters and storage. v4 caught malformed external data at the boundary.
- **What needs work:** The v3 to v4 change broke snippets from older material ([entry 3](FRICTION_LOG.md#3-zod-v4-changed-zrecord)), and Strands requires v4 ([entry 1](FRICTION_LOG.md#1-strands-needs-zod-v4-my-spec-pinned-zod-v3)).
- **Onboarding:** Easy.
- **Build again:** Yes.

## Alexa+ MCP add-on

- **Used for:** It was the intended integration target. I built a self-hosted, stateless Streamable HTTP MCP server with Bearer authentication so the same endpoint could be called by Alexa+.
- **What worked:** Amazon documents an MCP add-on pathway, and a standard MCP server is a sensible shape for it.
- **What needs work:** I could not validate onboarding or compatibility end to end ([entry 12](FRICTION_LOG.md#12-the-alexa-mcp-add-on-path-could-not-be-validated-end-to-end)). A developer sandbox or conformance checklist covering authentication, transport and schema constraints would let builders test before submitting.
- **Onboarding:** Not completed, so I have no basis to rate it. **[confirm]**
- **Build again:** Yes. The product premise, assistants that prove what they did, depends on this surface.

---

## Overall

The stack was cheap and fast to assemble. Most lost time came from version mismatches and under-documented edges, not from missing capabilities. The three changes that would have saved me the most time:

1. A raw `curl` example in the MCP docs, with the required `Accept` header and a sample SSE response.
2. A clear TypeScript install page for Strands, with the Zod v4 requirement and the OpenAI-compatible provider pattern.
3. An Alexa+ MCP add-on sandbox or conformance checklist, so builders can validate end to end.
