// Shared wiring for MCP tools: deps, fail-closed session, envelope output.
import { UserError } from "fastmcp";
import { z } from "zod";
import type { Session } from "../auth.js";
import { MemoryConfirms, type ConfirmStore, type RunContext } from "../core/verify.js";
import { MemoryReceipts, type ReceiptStore } from "../core/receipts.js";
import { outcomeSchema, type ToolResult } from "../core/result.js";
import { loadConstraints } from "../storage/memories.js";
import type { Store } from "../storage/store.js";

export interface Deps {
  store: Store;
  receipts: ReceiptStore;
  confirms: ConfirmStore;
}
export function createDeps(store: Store): Deps {
  return { store, receipts: new MemoryReceipts(), confirms: new MemoryConfirms() };
}

// user_id is NEVER a tool parameter — it comes from the Bearer session.
export function sessionOf(ctx: unknown): Session {
  const s = (ctx as { session?: Session }).session;
  if (!s?.userId) throw new UserError("Unauthorized: no session");
  return s;
}

export async function runCtx(
  deps: Deps,
  session: Session,
  profiles: string[] = ["household"],
  extra?: Partial<RunContext>,
): Promise<RunContext> {
  return {
    userId: session.userId,
    mode: session.mode,
    rules: await loadConstraints(deps.store, session.userId),
    profiles,
    now: new Date(),
    receipts: deps.receipts,
    confirms: deps.confirms,
    ...extra,
  };
}

// Every tool declares this outputSchema -> MCP structuredContent + text fallback.
export const envelopeSchema = z.object({
  outcome: outcomeSchema,
  say: z.string(),
  data: z.unknown().optional(),
  evidence: z
    .object({ expected: z.unknown(), observed: z.unknown(), source: z.string(), checkedAt: z.string() })
    .optional(),
  reasons: z.array(z.object({ constraintId: z.string(), text: z.string() })).optional(),
  receiptId: z.string().optional(),
  confirmToken: z.string().optional(),
  untrusted: z.boolean().optional(),
});
export type Envelope = z.infer<typeof envelopeSchema>;

// FastMCP return shape: explicit text (the say) + structured envelope.
export function envelope(r: ToolResult): { content: { type: "text"; text: string }[]; structuredContent: Envelope } {
  return {
    content: [{ type: "text", text: r.say }],
    structuredContent: {
      outcome: r.outcome,
      say: r.say,
      ...(r.data !== undefined ? { data: r.data } : {}),
      ...(r.evidence ? { evidence: r.evidence } : {}),
      ...(r.reasons ? { reasons: r.reasons } : {}),
      ...(r.receiptId ? { receiptId: r.receiptId } : {}),
      ...(r.confirmToken ? { confirmToken: r.confirmToken } : {}),
      ...(r.untrusted ? { untrusted: true } : {}),
    },
  };
}
