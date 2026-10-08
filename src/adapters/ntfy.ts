// ntfy.sh: real push reminders with scheduled delivery. No account.
// Publish -> { id, time }; poll (since + poll=1) for read-back; DELETE cancels.
// Proven live (S5): `sched=1` does not exist; scheduled messages are NOT
// visible before delivery, so verification attests ACCEPTANCE (ntfy's id +
// scheduled time vs requested), not delivery. Stated in evidence + docs.
import { createHash } from "node:crypto";
import { z } from "zod";
import type { ActionAdapter } from "../core/verify.js";
import { httpTimeoutMs } from "./http.js";

const BASE = process.env.NTFY_BASE_URL ?? "https://ntfy.sh";
const publishSchema = z.object({
  id: z.string(),
  time: z.number(),
  topic: z.string(),
});
const pollSchema = z.object({
  id: z.string(),
  event: z.string().optional(),
  message: z.string().optional(),
  title: z.string().optional(),
  time: z.number(),
});

export function topicFor(userId: string): string {
  return `cf_${createHash("sha256").update(userId).digest("hex").slice(0, 32)}`;
}

async function raw<T>(
  url: string,
  schema: z.ZodType<T>,
  init: RequestInit,
): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), httpTimeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { "User-Agent": "ContextForge/3", ...(init.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`ntfy HTTP ${res.status}`);
    const body: unknown = await res.json().catch(() => null);
    if (body === null) throw new Error("ntfy non-JSON response");
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new Error("ntfy schema mismatch");
    return parsed.data;
  } finally {
    clearTimeout(t);
  }
}

export interface ScheduleRequest {
  topic: string;
  text: string;
  title?: string;
  /** ms from now. Clamped to ntfy limits (10s..3d); <10s sends immediately. */
  delayMs: number;
}
export interface ScheduleConfirmation {
  id: string;
  deliverAtMs: number;
  text: string;
}

export async function scheduleReminder(
  req: ScheduleRequest,
): Promise<ScheduleConfirmation> {
  const clamped = Math.min(Math.max(req.delayMs, 0), 3 * 24 * 3600 * 1000);
  const headers: Record<string, string> = {
    Title: req.title ?? "ContextForge reminder",
  };
  if (clamped >= 10_000) headers.In = `${Math.round(clamped / 1000)}s`;
  const pub = await raw(`${BASE}/${req.topic}`, publishSchema, {
    method: "POST",
    headers,
    body: req.text,
  });
  return {
    id: pub.id,
    deliverAtMs: pub.time * 1000 + (clamped >= 10_000 ? clamped : 0),
    text: req.text,
  };
}

export async function pollTopic(
  topic: string,
  sinceMs: number,
): Promise<{ id: string; text: string; timeMs: number }[]> {
  const since = Math.floor(sinceMs / 1000);
  // NDJSON: one object per line; poll=1 closes the stream after a message.
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), httpTimeoutMs);
  try {
    const res = await fetch(`${BASE}/${topic}/json?since=${since}&poll=1`, {
      signal: ctrl.signal,
      headers: { "User-Agent": "ContextForge/3" },
    });
    if (!res.ok) throw new Error(`ntfy HTTP ${res.status}`);
    const out: { id: string; text: string; timeMs: number }[] = [];
    for (const line of (await res.text()).split("\n")) {
      const s = line.trim();
      if (!s) continue;
      let body: unknown;
      try {
        body = JSON.parse(s);
      } catch {
        continue;
      }
      const parsed = pollSchema.safeParse(body);
      if (parsed.success && parsed.data.event !== "message_delete") {
        out.push({
          id: parsed.data.id,
          text: parsed.data.message ?? "",
          timeMs: parsed.data.time * 1000,
        });
      }
    }
    return out;
  } finally {
    clearTimeout(t);
  }
}

export async function cancelReminder(
  topic: string,
  id: string,
): Promise<boolean> {
  const res = await fetch(`${BASE}/${topic}/${id}`, {
    method: "DELETE",
    headers: { "User-Agent": "ContextForge/3" },
  });
  return res.ok;
}

export interface ReminderCmd extends ScheduleRequest {
  requestedAtMs?: number;
}
export interface ReminderState {
  confirmation: ScheduleConfirmation | null;
  delivered: { id: string; text: string; timeMs: number }[];
}

// Acceptance attestations, keyed by topic+text (the verify target).
// Topic is already user-bound (topicFor); identical text redelivers nothing
// new, matching runAction's idempotency.
const confirmations = new Map<string, ScheduleConfirmation>();

export class NtfyReminders
  implements ActionAdapter<ReminderCmd, ReminderState>
{
  name = "ntfy";
  async write(
    _userId: string,
    cmd: ReminderCmd,
    _idemKey: string,
  ): Promise<{ ackId?: string }> {
    const c = await scheduleReminder(cmd);
    if (confirmations.size > 200)
      confirmations.delete(confirmations.keys().next().value as string);
    confirmations.set(`${cmd.topic}|${cmd.text}`, c);
    return { ackId: c.id };
  }
  async read(_userId: string, target: string): Promise<ReminderState> {
    const [topic] = target.split("|");
    const confirmation = confirmations.get(target) ?? null;
    let delivered: ReminderState["delivered"] = [];
    try {
      delivered = await pollTopic(topic, Date.now() - 10 * 60 * 1000);
    } catch {
      // Poll failure must not mask an acceptance attestation.
    }
    return { confirmation, delivered };
  }
}
