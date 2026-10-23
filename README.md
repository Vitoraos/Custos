# Custos


![License: MIT](https://img.shields.io/badge/license-MIT-green)

**Make “done” mean something.**

Custos is an accountability layer for tool-using AI assistants. It retrieves structured household rules, checks proposed actions with deterministic application code, executes through tools, verifies observable outcomes where read-back is available, and records receipts. A model's confident sentence is not evidence. Custos separates what an assistant says from what the application can actually check.

**[Architecture](docs/ARCHITECTURE.md) · [Benchmark and limitations](docs/BENCHMARK.md) · [Security notes](docs/SECURITY.md) · [Core policy engine](src/core/policy.ts)**

> Custos was previously named ContextForge. Some package names and deployment labels still use the earlier name.

## The problem

Tool-using assistants can lose track of durable constraints, mistake a tool acknowledgement for a completed action, or make it difficult to understand why an action was allowed. These are distinct problems, so a longer prompt alone is not a sufficient accountability mechanism.

Custos separates the work into inspectable stages:

1. **Remember** relevant household rules as typed records.
2. **Evaluate** a proposed action against those rules in application code.
3. **Execute** an allowed action through the configured adapter.
4. **Verify** the resulting state when the adapter supports read-back.
5. **Record** the decision, expected state, observation, outcome, and receipt.

The goal is not to claim that an assistant never fails. It is to make guarded decisions and reported outcomes easier to inspect.

## The demo

The simulator presents the same household request through two paths:

- **Baseline:** an unguarded path that trusts raw tool acknowledgements.
- **Custos:** policy checks, action execution, state read-back, bounded retry where appropriate, and receipts.

The Ground Truth panel shows simulated device state and evidence recorded by the application. Reviewers can compare the paths without setting up an MCP client.

**Important:** this is a controlled demonstration using a simulated device twin. It is not a live Alexa+ integration and does not prove that physical hardware changed state.

**[Open the hosted simulator](https://custos-one-black.vercel.app)**

## What is implemented

| Capability | What the code does |
|---|---|
| Typed standing memory | Stores constraints, facts, and instructions with profile, provenance metadata, status, evidence, and expiry fields. |
| Deterministic policy checks | Evaluates supported actions against constraints such as allergens, diets, quiet hours, device limits, and confirmation requirements. Invalid policy input fails closed. |
| Action execution | Routes supported operations through application tools and adapters. |
| Read-back verification | Compares expected outcomes with adapter-observed state, with a bounded retry path for supported actions. |
| Receipts | Records policy decision, expected state, observed result, outcome, attempts, and latency. Durable persistence depends on configured storage. |
| Scheduled actions | Persists future device actions when the database migration and worker are configured; scheduled does not mean already executed. |
| Tenant-scoped access | Derives user scope from the authenticated API key/session and scopes storage queries by user. |
| MCP interface | Exposes tools through an MCP endpoint; compatibility with a particular host still needs to be validated separately. |

Inspect the main path in [src/core/policy.ts](src/core/policy.ts), [src/core/verify.ts](src/core/verify.ts), and [src/core/receipts.ts](src/core/receipts.ts).

## Evidence, not hype

The benchmark compares the Custos guard-and-verification path with a deliberately simplified, memory-only baseline under a seeded test harness.

In the recorded L1 run, the harness observed fewer silent failures and constraint violations in the guarded path. Those numbers describe the test setup, not Alexa+'s actual behavior or the performance of general-purpose assistants. The baseline's 100% constraint-violation result is true by construction because the oracle executes violating actions without a guard.

The security-injection sample is only three attempts. It is too small to establish robust resistance to prompt injection, and it does not prove that model-originated memory writes are authenticated as user intent.

**[Read the full benchmark report](docs/BENCHMARK.md)** for definitions, raw results, reproduction steps, and limitations.

## How it works

```text
User request / MCP client
          |
          v
Authentication and user scope
          |
          v
Relevant standing rules
          |
          v
Deterministic policy evaluation
          |
          v
Action runner -------> Adapter
     |                    |
     v                    v
  Receipt <--------- State read-back
```

The simulator uses the same application-side tool and policy path to make behavior visible. The UI is a demonstration client, not the enforcement boundary.

### Memory provenance: an explicit limitation

Memory records carry provenance metadata, and the policy engine ignores constraints whose stored source is `external`. However, the current `remember_rule` tool assigns `user_voice` in application code when a model invokes it. That label is **not proof** that the current user personally authorized the write. The tool boundary does not independently authenticate the origin of every proposed memory write.

For that reason, Custos should not be described as having a complete, deterministic defense against memory poisoning. The prompt instructs the assistant not to treat external content as authority, but prompt instructions are not a substitute for a trusted write-authorization mechanism. This is a known security limitation, not something the benchmark resolves.

## Run locally (optional)

Reviewers do not need to run the simulator to evaluate the design. Contributors need Node.js **22.19.0 or newer** and npm.

```bash
git clone https://github.com/Vitoraos/Custos.git
cd Custos
npm ci
npm ci --prefix simulator/web
npm run web:build
npm run dev
```

Open **http://localhost:3000**. The server serves the API and built simulator UI from one process. Use **Reset demo data** to restore the known demo state.

For UI hot reload, run `npm run web:dev` in a second terminal. Vite uses port 5173 and proxies API calls to port 3000.

### Optional services

The project can use in-memory storage and replay mode for local exploration. To enable persistent storage or model-driven conversations:

1. Copy `.env.example` to `.env`.
2. Configure Supabase using server-side credentials only. Never expose the service-role key in browser code.
3. Configure an OpenRouter API key for live model calls; otherwise use Replay mode.
4. Apply [the base migration](infra/migrations/001_v3.sql) and [the scheduled-actions migration](infra/migrations/003_scheduled_actions.sql).
5. Run `npm run db:seed` if you need database seed data.

### Checks

```bash
npm run check       # TypeScript, Biome, and tests
npm run web:build   # Build the simulator UI
npm run web:tokens  # Check design-token discipline
```

These are the repository's verification commands; their presence here is not a claim that they were run for every commit. Live adapters and external services may require credentials or network access.

## Architecture and stack

| Layer | Technology | Role |
|---|---|---|
| Runtime | Node.js, TypeScript | Server and typed application logic |
| MCP server | FastMCP / MCP SDK | Exposes tools to MCP-compatible hosts |
| Agent simulation | Strands Agents TypeScript SDK | Runs the model-driven comparison path |
| Model provider | OpenRouter, OpenAI-compatible API | Optional live model calls |
| Policy and verification | In-repository TypeScript | Constraint evaluation, read-back, outcomes, receipts |
| Persistence | Supabase / PostgreSQL or in-memory store | Memories, device state, API keys, receipts, schedules |
| Simulator | React, Vite, CSS | Side-by-side comparison and Ground Truth |
| Adapters | Device twin, ntfy, Open-Meteo, TheMealDB, RSS | Demo device actions and external data |
| Quality checks | Vitest, Biome, GitHub Actions, gitleaks | Tests, formatting/linting, CI, secret scanning |

See [the architecture document](docs/ARCHITECTURE.md) for the request lifecycle and [the API contract](docs/API.md) for tool details.

## Boundaries and limitations

- **No validated Alexa+ integration:** the repository exposes an MCP endpoint, but live Alexa+ add-on integration, onboarding, and end-to-end compatibility have not been validated.
- **Simulated devices:** state read-back verifies the configured adapter's state. In the demo, that state belongs to a device twin, not physical hardware.
- **Memory-write provenance:** the current model-invoked memory tool does not independently authenticate whether a proposed write originated from a trusted user instruction.
- **Food matching:** ingredient matching is heuristic and is not medical advice or a certified allergen-safety system.
- **Notifications:** acceptance by a notification adapter does not prove final delivery.
- **Benchmarks:** the recorded L1 benchmark uses a deterministic oracle and seeded scenarios. It is not a live Alexa+ comparison or a field study.
- **External services:** model providers, recipe data, weather, RSS, and notification services can be unavailable, slow, or rate-limited.

## Suggested reviewer path

1. Read [the architecture](docs/ARCHITECTURE.md).
2. Inspect [the policy engine](src/core/policy.ts).
3. Trace [verification and retry](src/core/verify.ts).
4. Review [receipt recording](src/core/receipts.ts).
5. Read [the benchmark methodology and caveats](docs/BENCHMARK.md).
6. Treat the [hosted simulator](https://custos-one-black.vercel.app) as visual context, not as proof of real-device integration.

## Contributing

Before submitting a change:

- Keep authorization and policy enforcement in application code, not only in prompts.
- Add tests for safety constraints, error paths, and tenant isolation where relevant.
- Never claim an action is verified unless the configured adapter provides evidence.
- Label device-twin behavior as simulation.
- State which checks were actually run and disclose checks blocked by missing credentials or external services.

See [security notes](docs/SECURITY.md) before changing authentication, memory provenance, or tool boundaries.

## License

MIT. © Vitoraos.
