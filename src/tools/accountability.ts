// Accountability: explain_last_action + confirm_action.
// confirm_action consumes a token and re-runs the bound action via the
// server-wired runner map, passing proof (authorized) so runAction proceeds.
import { z } from "zod";
import type { ToolResult } from "../core/result.js";
import type { RunContext } from "../core/verify.js";
import { envelope, envelopeSchema, runCtx, sessionOf, type Deps } from "./context.js";

export type Runner = (args: Record<string, unknown>, ctx: RunContext) => Promise<ToolResult>;

function summarizeReceipt(r: {
  tool: string;
  outcome: string;
  decision: unknown;
  observed: unknown;
  attempts: number;
  latencyMs: number;
  createdAt?: string;
}): string {
  const d = r.decision as { reasons?: { text: string }[]; checked?: string[] } | null;
  const bits = [`${r.tool} ended ${r.outcome} after ${r.attempts} attempt${r.attempts === 1 ? "" : "s"}`];
  if (d?.checked?.length) bits.push(`checked ${d.checked.length} rules`);
  if (d?.reasons?.length) bits.push(d.reasons.slice(0, 2).map((x) => x.text.replace(/\.$/, "")).join("; "));
  return `${bits.join(". ")}.`;
}

export function accountabilityTools(deps: Deps, runners: Record<string, Runner>) {
  return [
    {
      name: "explain_last_action",
      description: "Explain the last action: what was done, which rules were checked, what was observed. The receipt.",
      annotations: { readOnlyHint: true, openWorldHint: false, title: "Explain last action" },
      parameters: z.object({ tool: z.string().max(60).optional() }),
      outputSchema: envelopeSchema,
      execute: async (args: { tool?: string }, ctx: unknown) => {
        const s = sessionOf(ctx);
        // MemoryReceipts is the store here; Supabase receipts expose latest() too.
        const latest = await (deps.receipts as { latest(u: string, t?: string): Promise<unknown> }).latest(s.userId, args.tool);
        if (!latest) return envelope({ outcome: "ok", say: "No actions recorded yet." });
        const r = latest as Parameters<typeof summarizeReceipt>[0];
        return envelope({ outcome: "ok", say: summarizeReceipt(r), data: r });
      },
    },
    {
      name: "confirm_action",
      description: "Second step for high-risk actions: pass the confirmToken from needs_confirmation to proceed.",
      annotations: { readOnlyHint: false, idempotentHint: true, title: "Confirm action" },
      parameters: z.object({ confirmToken: z.string().min(16).max(64) }),
      outputSchema: envelopeSchema,
      execute: async (args: { confirmToken: string }, ctx: unknown) => {
        const s = sessionOf(ctx);
        const binding = await deps.confirms.consume(s.userId, args.confirmToken);
        if (!binding) {
          return envelope({ outcome: "error", say: "That confirmation has expired. Please start over." });
        }
        const runner = runners[binding.tool];
        if (!runner) {
          return envelope({ outcome: "error", say: "That confirmation is not valid here. Please start over." });
        }
        const rc = await runCtx(deps, s);
        return envelope(
          await runner(binding.args as Record<string, unknown>, {
            ...rc,
            authorized: { tool: binding.tool, argsHash: binding.argsHash },
          }),
        );
      },
    },
  ];
}
