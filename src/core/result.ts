// ToolResult envelope (§3.4). Every action/read tool returns this.
// `say` (<=25 words) is safe to read aloud verbatim.
import { z } from "zod";

export const outcomeSchema = z.enum([
  "ok",
  "verified",
  "verified_after_retry",
  "unverified",
  "blocked",
  "needs_confirmation",
  "unsupported",
  "error",
]);
export type Outcome = z.infer<typeof outcomeSchema>;

export interface Evidence {
  expected: unknown;
  observed: unknown;
  source: string;
  checkedAt: string;
}
export interface ReasonRef {
  constraintId: string;
  text: string;
}
export interface ToolResult<T = unknown> {
  outcome: Outcome;
  say: string;
  data?: T;
  evidence?: Evidence;
  reasons?: ReasonRef[];
  receiptId?: string;
  confirmToken?: string;
  untrusted?: boolean;
}

export function ok<T>(say: string, data?: T): ToolResult<T> {
  return { outcome: "ok", say, data };
}
export function toolError(say: string): ToolResult {
  return { outcome: "error", say };
}
