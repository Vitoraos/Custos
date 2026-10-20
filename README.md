# Custos

![CI](https://github.com/Vitoraos/Custos/actions/workflows/check.yml/badge.svg)
![License: MIT](https://img.shields.io/badge/license-MIT-green)

**Custos is an accountability layer for AI assistants.** It checks remembered rules before an assistant acts, verifies actions against observed state, and records receipts explaining what happened.

An assistant saying “done” is not proof. Custos moves enforcement out of the prompt and into the tool boundary, where policy checks and verification can run even when a model ignores its instructions.

**[Read the architecture](docs/ARCHITECTURE.md)** · **[Review benchmark evidence](docs/BENCHMARK.md)** · **[Inspect the implementation](src/core/policy.ts)

> Previously named ContextForge. Some package names, deployment labels, and older documents still use that name.

## The problem Custos solves

AI assistants can remember a preference without reliably applying it when they act. That leaves four gaps:

- **Rules are remembered but ignored:** a stored vegan preference or severe allergy can be missed when planning a meal.
- **Acknowledgements are mistaken for outcomes:** an assistant says a light is on because a tool returned an acknowledgement, even if the device state never changed.
- **Decisions are hard to explain:** users cannot easily see which rules were checked or why an action was allowed or blocked.
- **Untrusted content can influence behavior:** external text should not be allowed to rewrite standing household rules.

A longer prompt or a larger memory does not structurally solve these problems. Custos puts policy checks at the tool boundary, verifies action results against observed state, and records receipts that explain the decision. The examples above describe failure modes the project is designed to test, not claims that every commercial assistant exhibits each behavior.

## What reviewers should inspect

**Reviewers do not need to run the simulator or configure an MCP client.** The fastest way to evaluate Custos is to read the architecture, inspect the enforcement path, and review the benchmark methodology. The simulator is a supporting demonstration, not a prerequisite for understanding the project.

The simulator compares the same request across two paths:

- **Without Custos:** the baseline returns raw tool acknowledgements without the Custos policy guard and independent verification.
- **With Custos:** the policy engine evaluates the action, the execution path reads back state and retries where appropriate, and the system records a receipt.

The Ground Truth panel displays simulated device state, standing rules, and the latest receipt independently of what either assistant says. This is a controlled demonstration using a device twin, not a connection to real Alexa+ devices.

Suggested review order:

1. Read [How it works](#how-it-works) for the core idea.
2. Follow the [architecture and request lifecycle](docs/ARCHITECTURE.md).
3. Inspect [`src/core/policy.ts`](src/core/policy.ts), [`src/core/verify.ts`](src/core/verify.ts), and [`src/core/receipts.ts`](src/core/receipts.ts).
4. Read the [benchmark report](docs/BENCHMARK.md), including its assumptions and limitations.
5. Treat the [hosted simulator](https://custos-one-black.vercel.app) as optional visual context, not as a required judging step.

## Benchmark

Custos is evaluated against a baseline that has access to memory but lacks the Custos policy guard and verification path. The benchmark measures silent failures, rule violations, false blocks, recovery from injected faults, honest reporting of unverified outcomes, injection attempts, and latency overhead.

The current recorded L1 run uses a seeded deterministic oracle, not a real Alexa+ model. Its results demonstrate behavior under the harness's assumptions and should not be treated as proof of real-world safety. The baseline's 100% constraint-violation result is true by construction for that test setup.

**[Read the benchmark report](docs/BENCHMARK.md)** for metric definitions, confidence intervals, scenario coverage, reproduction steps, raw result links, and limitations.

## How it works

1. **Remember:** household rules and preferences are stored as structured memories.
2. **Evaluate:** a typed policy engine checks proposed actions against relevant constraints, including allergens, diets, quiet hours and confirmation requirements.
3. **Act:** allowed actions pass through the action runner and adapter.
4. **Verify:** the runner reads back the resulting state, retries once where appropriate, and distinguishes verified success from an unverified outcome.
5. **Receipt:** the decision, expected state and observation are recorded so the assistant can explain what happened.

The key design choice is that **policy enforcement is code at the tool boundary, not a sentence in the system prompt**.

## Run locally (optional)

Local setup is intended for contributors who want to modify or test the implementation. **Hackathon reviewers do not need to install dependencies, configure credentials, or run the simulator.**

You need **Node.js 22.19.0 or newer** and npm. A Supabase project and an OpenRouter API key are optional for local simulator development; without them, the server can use in-memory storage and the UI can use replay mode.

### Start the simulator

```bash
git clone https://github.com/Vitoraos/Custos.git
cd Custos
npm ci
npm ci --prefix simulator/web
npm run web:build
npm run dev
```

Open **http://localhost:3000**. The server serves the API and the built simulator UI from one process. Use **Reset demo data** in the UI if you want a known starting state. For frontend hot reload during UI development, use a second terminal and run `npm run web:dev` (Vite runs on port 5173 and proxies API calls to port 3000).

### Optional: enable persistent storage and live model calls

1. Copy `.env.example` to `.env`.
2. Add your Supabase project URL and **server-side service-role key** if you want persistent storage. Keep the service-role key private and never expose it in frontend code.
3. Add an OpenRouter API key if you want live model-driven conversations. Without it, select Replay mode; free-tier quotas can run out.
4. If using Supabase, apply [the base schema](infra/migrations/001_v3.sql), then apply [the scheduled-actions and receipt migration](infra/migrations/003_scheduled_actions.sql), and seed data as described below. Migration `003_scheduled_actions.sql` adds durable future-device schedules and stores the spoken receipt text needed for idempotent replay. Then run:

```bash
npm run db:seed
```

Then start the server with `npm run dev`.

### Verify your setup

```bash
npm run check       # TypeScript, Biome, and tests
npm run web:build   # Build the simulator UI
npm run web:tokens  # Check design-token discipline
```

For an API smoke test against a running server, create a key for the target deployment and use `npm run smoke -- --base http://localhost:3000 --key <cf_...>`. The key-creation command may require database configuration: `npm run keys:create -- --user demo --mode forge`.

### Setup simplification opportunity

A small `npm run setup` script could automate the Node version check, both installs, and the frontend build. It should preserve an existing `.env`, never fabricate credentials, and keep Supabase optional for replay mode. This is a proposed improvement; the command does not exist yet.

## Architecture

```text
Browser / MCP client
        |
        v
HTTP server: /sim/*, /health*, /mcp, static UI
        |
        v
Authentication and per-user scope
        |
        v
Policy engine -> action runner -> adapter
                    |                |
                    v                v
                 Receipt        State read-back
```

The server hosts the simulator and MCP endpoint in one process. The MCP interface exposes the same tools used by the simulator, so the UI is a demonstration client rather than the enforcement boundary itself. Although Amazon documents an Alexa+ MCP add-on pathway, this repository should not be treated as an Alexa+-ready integration: add-on onboarding and compatibility have not been validated.

### Technology stack

| Layer | Technology | Why it is here |
|---|---|---|
| Runtime | Node.js, TypeScript | One typed server process |
| MCP server | FastMCP | Exposes tools to MCP-compatible clients |
| Agent simulation | Strands Agents TypeScript SDK | Runs the model-driven comparison path |
| Model provider | OpenRouter, OpenAI-compatible API | Optional model calls; replay mode remains available |
| Policy and verification | In-repo TypeScript modules | Deterministic rule checks, state verification and receipts |
| Persistence | Supabase / PostgreSQL | Memories, device state, API keys and action receipts |
| Simulator UI | React, Vite, CSS | A/B comparison, ground truth and execution traces |
| Adapters | Device twin, ntfy, Open-Meteo, TheMealDB, RSS | Demo actions and external data |
| Quality checks | Vitest, Biome, GitHub Actions, gitleaks | Tests, linting and secret scanning |
| Hosting | Render-compatible Node service | API, MCP endpoint and server-served UI |

The stack is chosen to keep the demo inexpensive and inspectable. External services have free-tier constraints; the app can use in-memory storage and replay mode for local exploration.

### Hosted deployments

| Service | What it serves | Project settings |
|---|---|---|
| Render | API, MCP endpoint and server-served UI | `infra/render.yaml`; backend only, never runs the simulator build |
| Vercel | The A/B simulator UI (`simulator/web`) | **Root Directory `simulator/web`**, env `VITE_API_BASE` = the Render URL |

A Vercel build that fails with `The specified Root Directory "<x>" does not exist` means the project's Root Directory points at a folder that is not in the repo - set it to `simulator/web` under Settings -> Build and Deployment.

## Repository guide

| Path | What you'll find |
|---|---|
| `src/core/policy.ts` | Policy decisions and constraint enforcement |
| `src/core/verify.ts` | Action verification and recovery behavior |
| `src/core/receipts.ts` | In-memory test receipts and tenant-scoped durable Supabase receipts |
| `src/tools/scheduling.ts` | Timezone-aware, policy-checked future device scheduling |
| `src/core/scheduledWorker.ts` | Due-schedule execution and device-twin read-back verification |
| `src/tools/` | Tools exposed to the assistant |
| `src/adapters/` | Device twin and external-service adapters |
| `simulator/api/` | Simulator routes and agent orchestration |
| `simulator/web/` | A/B interface and Ground Truth panel |
| `test/` | Unit, integration and live adapter tests |
| `bench/` | Benchmark runner, report generator and recorded results |
| `infra/` | Database schema, migrations, seed data and hosting config |
| `infra/migrations/003_scheduled_actions.sql` | Durable schedules and receipt replay data |
| `docs/ARCHITECTURE.md` | Detailed architecture |
| `docs/API.md` | Tool/API contract |
| `docs/SECURITY.md` | Security model and threat considerations |
| `docs/DEMO_SCRIPT.md` | Suggested hackathon demo sequence |
| `docs/FRICTION_LOG.md` | Developer notes and feedback on tools used |

## Security and boundaries

- API keys are hashed at rest and shown only when created.
- User scope is derived from the authenticated key rather than a caller-supplied `user_id`.
- Sensitive actions such as unlocking, purchases and removing safety constraints require confirmation.
- External content is treated as untrusted and cannot directly rewrite standing rules.
- Rate limits and secret scanning are included.

Read the [security notes](docs/SECURITY.md) for implementation details. This is a hackathon prototype, not a certification or a claim that every threat has been eliminated.

## Current limitations

- Devices are simulated. The current repository does not include a completed or validated Alexa+ add-on integration; compatibility, onboarding, authentication requirements and end-to-end enforcement coverage remain to be verified.
- Ingredient matching uses heuristics and is not medical advice.
- Reminder verification confirms scheduling/acceptance, not final delivery.
- External services and free model tiers can be slow, unavailable or rate-limited.
- Benchmark results are from controlled harnesses and should not be generalized to real-world assistants without further evaluation.

## Judging guide

- **Problem and motivation:** [The problem Custos solves](#the-problem-custos-solves)
- **Core technical contribution:** `src/core/policy.ts`, `src/core/verify.ts`, and tests
- **Concept and mechanism:** [How it works](#how-it-works)
- **Core implementation:** [`src/core/policy.ts`](src/core/policy.ts), [`src/core/verify.ts`](src/core/verify.ts), [`src/core/receipts.ts`](src/core/receipts.ts)
- **Evidence and caveats:** [Benchmark methodology and results](docs/BENCHMARK.md)
- **System design:** [Architecture and request lifecycle](docs/ARCHITECTURE.md)
- **Optional visual context:** [Hosted simulator](https://custos-one-black.vercel.app)

## Contributing and license

Run `npm run check` before submitting changes. For UI work, also run `npm run web:build` and `npm run web:tokens`.

MIT License. © Vitoraos.

Built with FastMCP, Strands Agents SDK, Supabase, Render, ntfy, Open-Meteo and TheMealDB.
