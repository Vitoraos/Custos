# Friction log

Where the tools got in the way while building Custos for the Amazon *Build, Ship, Shape* hackathon (1 to 9 October 2026). Each entry follows the format the hackathon asks for: task, steps, expected, actual, severity, workaround and suggestion.

I only log problems that cost real time or changed a design decision. Routine commands are not recorded.

**Severity scale**

| Level | Meaning |
|---|---|
| **Blocker** | Stopped progress until resolved |
| **High** | Cost more than an hour or forced a design change |
| **Medium** | Cost 15 to 60 minutes, or needed a workaround |
| **Low** | A small papercut or a docs gap |
| **Positive** | Something that saved time and should be kept |

## At a glance

| # | Date | Tool | Problem | Severity |
|---|---|---|---|---|
| 1 | 1 Oct | npm, Strands SDK, Zod | Strands needs Zod v4, my spec pinned v3, install failed | High |
| 2 | 1 Oct | Strands Agents TypeScript SDK | `createHarness()` and a LiteLLM provider path were not in the installed SDK | High |
| 3 | 2 Oct | Zod v4 | `z.record(z.any())` form from the draft did not match v4 | Low |
| 4 | 2 Oct | MCP Streamable HTTP | Raw request rejected with `-32000 Not Acceptable` | Medium |
| 5 | 2 Oct | `npx serve` | Cached package crashed with `ERR_MODULE_NOT_FOUND` | Low |
| 6 | 5 Oct | FastMCP on Windows | `127.0.0.1` refused, `localhost` worked | Medium |
| 7 | 8 Oct | ntfy polling API | JSON endpoint returned newline-delimited JSON, `res.json()` failed | Medium |
| 8 | 9 Oct | FastMCP output schemas | Strict validation caught a real evidence-shape bug | Positive |
| 9 | 2 to 10 Oct | OpenRouter free tier | 50 requests a day made repeated live demos expensive | Medium |
| 10 | 5 Oct | ntfy scheduled delivery | Delivery of a scheduled message cannot be observed before it fires | Medium |
| 11 | Oct | Vercel | Build failed because Root Directory pointed at a missing folder | Medium |
| 12 | Oct | Alexa+ MCP add-on | Could not validate onboarding or compatibility end to end | High |
| 13 | 1 Oct | Planning spec (mine) | Schema, sort and URL mistakes found in review | Low |
| 14 | 1 Oct | Local scripts on Windows | Fixed Linux paths and a Unicode filename broke a script | Low |

---

## Entries

### 1. Strands needs Zod v4, my spec pinned Zod v3

- **Date:** 1 Oct
- **Task:** Install the dependencies for the project spec.
- **Steps:** Ran `npm install` against a `package.json` that pinned Zod v3 and included the Strands Agents SDK.
- **Expected:** A clean install.
- **Actual:** Dependency resolution failed. Strands requires Zod v4 as a peer dependency.
- **Severity:** High. This was the largest setup delay.
- **Workaround:** Followed the installed SDK's peer requirements, upgraded to Zod v4, and checked the resolved tree with `npm ls`.
- **Suggestion:** Surface the Zod peer requirement in the Strands TypeScript install instructions, next to the install command.

### 2. `createHarness()` and a LiteLLM path were not in the Strands TypeScript SDK

- **Date:** 1 Oct
- **Task:** Wire a model provider into the simulator's agent.
- **Steps:** Wrote the agent against the imports in my draft spec, then compiled.
- **Expected:** The draft's `createHarness()` and a LiteLLM provider to exist.
- **Actual:** Neither was available in the installed TypeScript SDK.
- **Severity:** High. It invalidated a section of the plan.
- **Workaround:** Read the SDK's real types and docs, then used `OpenAIModel` with a custom OpenAI-compatible base URL pointed at OpenRouter.
- **Suggestion:** Document the OpenAI-compatible base-URL pattern prominently in the TypeScript docs. Third-party providers are a common need, and the Python and TypeScript surfaces should be easy to tell apart.

### 3. Zod v4 changed `z.record`

- **Date:** 2 Oct
- **Task:** Define tool input schemas.
- **Steps:** Used `z.record(z.any())` from the draft.
- **Expected:** It to type-check.
- **Actual:** The single-argument form does not match the Zod v4 API.
- **Severity:** Low.
- **Workaround:** Moved the schemas to the v4 form and checked against the installed version.
- **Suggestion:** None for Zod. The lesson was to verify the installed API before copying snippets from older material.

### 4. MCP Streamable HTTP rejects requests without the right `Accept` header

- **Date:** 2 Oct
- **Task:** Smoke-test `/mcp` with a hand-written HTTP request.
- **Steps:** Sent a plain JSON-RPC `POST` with `Content-Type: application/json`.
- **Expected:** A JSON response.
- **Actual:** `-32000 Not Acceptable`. The transport requires the client to accept both JSON and an event stream.
- **Severity:** Medium. The server was right and my client was incomplete, but the error did not say which header was missing.
- **Workaround:** Added `Accept: application/json, text/event-stream` and parsed the SSE `data:` frame in the response.
- **Suggestion:** Add a minimal raw `curl` example to the MCP transport docs, with the required headers and a sample SSE response. Name the missing header in the error text.

### 5. `npx serve` failed from a damaged cache

- **Date:** 2 Oct
- **Task:** Serve the static frontend locally to check it.
- **Steps:** Ran `npx serve`.
- **Expected:** A local server.
- **Actual:** `ERR_MODULE_NOT_FOUND: eastasianwidth`. The server never started.
- **Severity:** Low.
- **Workaround:** Stopped debugging and used Node's built-in server to check the static files. This looked like a bad local cache, not a project bug.
- **Suggestion:** None. Recorded because it cost time and the cause was outside the project.

### 6. FastMCP on Windows: `127.0.0.1` refused, `localhost` worked

- **Date:** 5 Oct
- **Task:** Call the local MCP server from a test client.
- **Steps:** Started the server, then requested `127.0.0.1:4123`.
- **Expected:** A response.
- **Actual:** `ECONNREFUSED`. The same process answered on `localhost:4123`.
- **Severity:** Medium. My first instinct was to look for an application bug.
- **Workaround:** Switched local clients to `localhost` and set the host explicitly for deployment (`HOST`, default `0.0.0.0`).
- **Suggestion:** Print the resolved bind address at startup, and document the default host behaviour, especially on Windows where IPv4 and IPv6 loopback can differ.

### 7. ntfy's JSON poll endpoint returns newline-delimited JSON

- **Date:** 8 Oct
- **Task:** Poll ntfy to verify that a reminder was accepted.
- **Steps:** Called the polling endpoint with several events pending and ran `res.json()` on the body.
- **Expected:** One JSON document.
- **Actual:** Newline-delimited JSON. `res.json()` threw when there was more than one event.
- **Severity:** Medium.
- **Workaround:** Parse each line separately, validate each event, and skip delete events.
- **Suggestion:** State the NDJSON format and the polling behaviour clearly in the API docs for the `json` endpoint.

### 8. FastMCP's strict output-schema errors saved time

- **Date:** 9 Oct
- **Task:** Return a typed evidence object from a tool.
- **Steps:** Returned raw device state where the schema expected the evidence shape.
- **Expected:** A vague failure.
- **Actual:** A specific error that named the mismatched field.
- **Severity:** Positive.
- **Workaround:** None needed. I kept `outputSchema` validation on for every tool instead of loosening the contract.
- **Suggestion:** Keep this. It is a good example of an error that tells the developer what to fix.

### 9. OpenRouter free-tier limits changed how I rehearse

- **Date:** 2 to 10 Oct
- **Task:** Run the model-driven simulator repeatedly while rehearsing the demo.
- **Steps:** Ran live comparisons on the free tier.
- **Expected:** Enough headroom for a day of iteration.
- **Actual:** 20 requests a minute and 50 a day. Quota ran out mid-session during end-to-end testing.
- **Severity:** Medium.
- **Workaround:** Kept a single provider, added per-session (30 turns) and daily budget guards, and made deterministic replay mode the fallback for rehearsals and recording.
- **Suggestion:** Show remaining quota in a response header or the dashboard, so a developer can see it before the cap is hit.

### 10. ntfy cannot confirm delivery of a scheduled message before it fires

- **Date:** 5 Oct
- **Task:** Verify that a scheduled reminder will actually be delivered.
- **Steps:** Scheduled a push through ntfy and looked for a way to read back delivery state.
- **Expected:** Some observable delivery receipt.
- **Actual:** Before the message fires, the API shows acceptance and a scheduled time, not delivery.
- **Severity:** Medium. It limits what the verifier is allowed to claim.
- **Workaround:** The receipt reports acceptance (message id and scheduled time) and says explicitly that delivery is not independently confirmed. The `unverified` outcome exists for cases like this.
- **Suggestion:** Expose a delivery or acknowledgement status for scheduled messages if the service can support it.

### 11. Vercel build failed with a missing Root Directory

- **Date:** Oct
- **Task:** Deploy the simulator UI from the monorepo.
- **Steps:** Connected the repo and deployed with the default settings.
- **Expected:** A build of `simulator/web`.
- **Actual:** `The specified Root Directory "<x>" does not exist`.
- **Severity:** Medium.
- **Workaround:** Set Root Directory to `simulator/web` and `VITE_API_BASE` to the backend URL. The backend runs separately on Render and never runs the UI build.
- **Suggestion:** Name the Settings page and field in the error message, and detect a single Vite app in a subfolder.

### 12. The Alexa+ MCP add-on path could not be validated end to end

- **Date:** Oct
- **Task:** Connect the finished `/mcp` server to Alexa+ itself.
- **Steps:** Built a self-hosted, stateless Streamable HTTP server with Bearer authentication, then looked for a way to exercise it from Alexa+.
- **Expected:** A route to test the server against a real Alexa+ session.
- **Actual:** I did not complete add-on onboarding or a compatibility check. The repository's simulator stands in for Alexa+, and the README says so.
- **Severity:** High for the project's claims. It is why Custos is described as a simulation and not as an Alexa+ integration.
- **Workaround:** Built an Alexa+-style simulator that calls the same `/mcp` endpoint, and labelled the baseline as scripted.
- **Suggestion:** Publish a developer sandbox or a conformance checklist for the MCP add-on, covering auth, transport, tool-schema constraints and the required response shapes.

### 13. My own spec had mistakes that review caught

- **Date:** 1 Oct
- **Task:** Turn the initial spec into code.
- **Steps:** Reviewed the schema and adapters before building on them.
- **Expected:** A spec ready to implement.
- **Actual:** An index referencing a nonexistent `created_at` column, priority sorting that would be alphabetical instead of numeric, and a malformed weather URL.
- **Severity:** Low. They were cheap to fix at that stage.
- **Workaround:** Fixed all three before the affected paths shipped.
- **Suggestion:** For AI-assisted planning, verify package names, exports, peer dependencies and schema references against the installed toolchain before treating a plan as build-ready.

### 14. Local scripts assumed Linux paths and an ASCII filename

- **Date:** 1 Oct
- **Task:** Run a spec-generation script on Windows.
- **Steps:** Ran a script that used fixed Linux paths and a filename containing a Unicode character.
- **Expected:** It to run.
- **Actual:** The paths did not resolve and the filename did not survive the shell's encoding.
- **Severity:** Low.
- **Workaround:** Resolve paths relative to the script and discover the target Markdown file instead of hard-coding the full name.
- **Suggestion:** None. A cross-platform habit worth keeping.

---

## What I would tell the maintainers

| Tool | One-line feedback |
|---|---|
| FastMCP | Keep the precise output-schema errors. Log the resolved bind address at startup |
| MCP documentation | Add a raw HTTP example with the required `Accept` header and an SSE parser |
| Strands Agents SDK | Document the Zod v4 peer requirement and the OpenAI-compatible provider pattern |
| ntfy | Document the NDJSON poll format. Consider a delivery status for scheduled messages |
| OpenRouter | A quota indicator would make repeated development runs easier to manage |
| Vercel | Name the exact setting in the Root Directory error |
| Alexa+ MCP add-on | Publish a sandbox or conformance checklist so developers can validate end to end |

More detail on each tool, including onboarding and whether I would use it again, is in [PRODUCT_FEEDBACK.md](PRODUCT_FEEDBACK.md).

## Adding an entry

Add the date, the task, the steps, what you expected, what happened, a severity, the workaround and a suggestion. Keep the original error text when it makes the issue reproducible.
