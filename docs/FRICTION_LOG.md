# Developer friction log

I kept this log to remember where the tools got in my way, what I learned, and what I'd tell their maintainers. I focus on problems that cost real time or changed a design decision, rather than recording every routine command.

## Summary

| Date | Tool or dependency | What happened | How I handled it |
|---|---|---|---|
| 9 Oct | FastMCP 4.22.1 | Strict `outputSchema` validation caught a real mismatch between raw device state and the expected evidence shape. | I kept output schemas strict across the tools. The error was specific enough to locate the bug quickly. |
| 8 Oct | ntfy polling API | The JSON endpoint returned newline-delimited JSON for multiple events, so calling `res.json()` on the whole response failed. | I parse each line separately, validate each event, and skip delete events. Clearer documentation of the stream format would help. |
| 5 Oct | FastMCP on Windows | A request to `127.0.0.1:4123` failed with `ECONNREFUSED`, while `localhost:4123` worked against the same process. | I switched local clients to `localhost` and set the host explicitly for deployment. A startup log that names the resolved bind address would have saved debugging time. |
| 2 Oct | `npx serve` | The local cached package failed with `ERR_MODULE_NOT_FOUND: eastasianwidth`; the server never started. | I stopped debugging the app and used Node's built-in server to verify the static files. This looked like a damaged local cache, not a project bug. |
| 2 Oct | MCP Streamable HTTP | My raw HTTP test got `4002 / -32000 Not Acceptable` because I omitted the required `Accept` header. | I added `Accept: application/json, text/event-stream` and parsed the SSE `data:` frame. The server was right; my test client was incomplete. |
| 2 Oct | Zod v4 | The older `z.record(z.any())` form from the draft did not match the installed Zod v4 API. | I updated schemas to the v4 form and checked the project against the installed package version. |
| 2 Oct | OpenRouter free tier | The 20 requests/minute and 50 requests/day limits made repeated live demo runs expensive in quota. | I kept a single provider and made replay mode the fallback for quota-free rehearsals. |
| 1 Oct | npm dependency resolution | Install failed because Strands required Zod v4 while the initial project spec pinned Zod v3. | I followed the installed SDK's peer requirements, upgraded Zod, and checked the resolved dependency tree. This was the biggest setup delay. |
| 1 Oct | Initial spec / Strands TypeScript SDK | The draft depended on `createHarness()` and a LiteLLM provider path that were not available in the installed TypeScript SDK. | I checked the actual SDK docs and types, then used `OpenAIModel` with a custom OpenAI-compatible base URL. I should have verified the proposed imports before treating the spec as implementation-ready. |
| 1 Oct | Initial spec / local scripts | A script used fixed Linux paths and a Unicode filename that did not survive the Windows shell's encoding cleanly. | I changed the script to resolve paths relative to itself and discover the target Markdown file instead of hard-coding the full filename. |
| 1 Oct | Initial schema and adapter assumptions | Reviewing the initial spec exposed a nonexistent `created_at` column in an index, priority sorting that would be alphabetically wrong, and a malformed weather URL. | I fixed these before the affected paths shipped. They were cheap to catch in review and would have been more expensive after deployment. |

## Notes from the build

### FastMCP: the error message was useful

The schema validator caught a real output-shape bug early. I expected to spend time tracing a vague tool failure, but the message pointed to the mismatched field. I left `outputSchema` validation enabled rather than loosening the contract to get past the test.

### Windows networking: `localhost` and `127.0.0.1` were not interchangeable

My first instinct was to look for an application bug. The same server answered on `localhost`, which narrowed the issue to how the server bound its interface. I now use `localhost` for local testing and configure the host explicitly when deploying. FastMCP could make this easier to diagnose by printing the resolved address clearly at startup.

### MCP's `Accept` header is easy to miss in a hand-written test

The server rejected my first raw HTTP request because I had not declared that the client accepted both JSON and event streams. This was a client-side mistake, not a server defect. I added the header and parsed the SSE frame properly. A short raw-`curl` example in the docs would help people building their own smoke tests.

### Free model quotas changed how I rehearse

OpenRouter's free tier is fine for development, but repeated runs burn through the daily cap quickly. I stopped treating live model calls as the only demo path and kept deterministic replays available. That gives me a predictable fallback for recording and judging without hiding the quota limitation.

### The spec needed verification against the actual SDK

The early draft assumed a Strands TypeScript API that was not present in the installed package. Checking the types and documentation took less time than debugging code written against an imaginary import would have. I also caught the Zod major-version mismatch during installation. My takeaway: resolve the dependency tree and verify critical imports before expanding a long implementation plan.

## Feedback I'd give the maintainers

- **FastMCP:** keep the precise output-schema errors; log the resolved bind address at startup and document the default host behavior.
- **ntfy:** make the newline-delimited response format and polling behavior more obvious in the API docs.
- **MCP documentation:** include a minimal raw HTTP example with the required `Accept` header and an SSE response parser.
- **OpenRouter:** the free-tier limits are clear enough to plan around, but a simple quota indicator would make repeated development runs easier to manage.
- **Project/spec workflow:** verify package names, exports, peer dependencies and OS-specific paths against the installed toolchain before treating a proposed architecture as build-ready.

## Adding an entry

When a tool costs me meaningful time or forces a design change, I add the date, the expectation, what actually happened, the fix, and any feedback that might help the next developer. I keep the original error when it makes the issue reproducible.
