# Security — Custos

This document describes implemented controls and their residual risks. It is not a security certification.

| Asset / threat | Implemented control | Residual risk |
|---|---|---|
| Memories and receipts: cross-tenant access | API bearer keys are hashed at rest; user scope is derived from the authenticated session rather than a caller-supplied tool parameter; storage operations scope queries by user; database row-level security is configured. | A leaked server-side service-role key can bypass database row-level security. Validate every deployment configuration. |
| API keys: theft or replay | Random bearer keys are hashed at rest and shown only when created; revocation and guest-key expiry/purge are supported. | A stolen bearer key may be replayed until it expires or is revoked. Use HTTPS and rotate exposed keys. |
| Secrets: repository or browser leak | Environment-based configuration, placeholder examples, and secret scanning are used. | Rotate any credential that entered git history; scanning does not make leaked secrets safe. |
| High-risk actions: accidental execution | Supported high-risk action paths use short-lived, single-use, argument-bound confirmation tokens. | Confirmation can still be socially engineered. Coverage is tool-specific; do not assume every destructive operation or memory deletion has the same confirmation requirement. |
| External content: prompt injection and memory poisoning | The assistant instructions tell the model to treat external content as data. The policy engine ignores constraints explicitly tagged with source `external`. | **The current `remember_rule` tool assigns `user_voice` to model-invoked writes. The source label is not authenticated proof of user intent.** External content may influence a model into making a write call. There is not yet a complete deterministic, trusted-origin gate for memory writes. |
| MCP endpoint: abuse | Origin allow-listing, CORS configuration, rate limits, input validation, and tool timeouts are implemented in the server path. | Rate limits are modest and do not eliminate denial-of-service risk. Deployment-specific configuration matters. |
| Simulator guest isolation | Per-guest user/key scope and guest-data expiry are supported. | Bearer credentials must not be shared; confirm cleanup behavior in the deployed environment. |
| Model-provider cost and loops | Session/daily caps and iteration limits are configured; replay mode is available. | Provider quotas and pricing can change. |

## Memory provenance and confirmation

Memory records include a source field and status. The policy engine excludes records whose source is `external`, and storage logic places external constraints into `pending_confirmation`. However, provenance is not currently a trusted-origin guarantee: `remember_rule` assigns `source: "user_voice"` in application code whenever the model invokes the tool. A tool call does not independently prove that the user authorized the proposed memory.

Consequently, Custos must not be represented as fully resistant to memory poisoning. A future hardening step is to make memory writes a two-stage flow with authorization derived from a trusted user-confirmation event outside the model's control, then test adversarial prompt-injection cases against that boundary.

## High-risk actions

The action runner supports short-lived, single-use, argument-bound confirmation tokens for the guarded high-risk action path. `forget_memory` requires confirmation for severe allergen constraints and `confirm_required` rules; other memory deletion is not universally confirmation-gated. Shopping-list changes are not a real checkout or payment integration.

## Reporting

Open a GitHub issue titled `[security]` without posting exploit details publicly. Include a minimal description of the affected path and allow time for a fix before disclosure.
