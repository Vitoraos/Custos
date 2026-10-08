# Security — ContextForge

Threat model (asset / threat / mitigation / residual risk):

| Asset | Threat | Mitigation | Residual risk |
|---|---|---|---|
| Memories, receipts (`memories`, `action_receipts`) | Cross-tenant read/write | Bearer `cf_…` -> sha256 -> `api_keys`; `user_id` from session only (never a tool param); every query scoped by `userId`; RLS on with no policies; A×B isolation test | Service-role key leak would bypass all of this — see secrets |
| API keys | Theft, replay | 256-bit random keys, sha256-hashed at rest, printed once; revocation via `revoked_at`; guest keys 24h TTL + purge | Bearer replay within TTL if intercepted — use HTTPS in production |
| Secrets (service role, model keys) | Commit / browser leak | `.env` only, `.env.example` placeholders, gitleaks in CI, secret scanning on the public repo; service-role key never leaves the server | A key that touched git history must be rotated |
| High-risk actions (unlock, purchase, safety-rule removal) | Accidental or prompted execution | Two-step `confirm_token` (2-min TTL, single-use, arg-bound) via `confirm_action` or action re-call | Social-engineering the user into confirming — receipt records it |
| External content (headlines, recipes) | Prompt injection -> rule writes | `untrusted` flag; no memory writes from external sources; `source: "external"` rules land `pending_confirmation` and are ignored by policy; S4 benchmark measures it | A model that disobeys `say`/instructions — receipts give the independent record |
| `/mcp` endpoint | DNS rebinding, CSRF, abuse | Origin allow-list (`ALLOWED_ORIGINS`), CORS config, per-key/per-IP token bucket, Zod length/range caps, tool timeouts, request-size discipline | Free-tier DoS tolerance is low — rate limits are modest by design |
| Simulator guests | Data leak between judges | Random `user_id` + key pair per guest; 24h purge; faults per-guest only | Guest keys are bearer — don't share URLs mid-demo |
| LLM budget | Runaway spend / quota exhaustion | Per-session (30 turns) + daily caps; over budget -> Replay mode; temperature 0, 8-iteration cap | Free-tier 50/day still binds L2 sample size |

Responsible disclosure: open a GitHub issue titled `[security]` (no exploit
details) or contact the repo owner; please allow 7 days before any disclosure.
See `docs/STACK.md` for the full tool surface and `docs/BENCHMARK.md` for the
injection (S4) numbers.
