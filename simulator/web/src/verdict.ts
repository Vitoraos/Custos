// Verdict badges: tool-layer outcomes + ground-truth cross-check, pure logic.
// Text + icon, never colour-alone. Tested in test/unit/verdict.test.ts.
export type Tone = "ok" | "warn" | "bad" | "info" | "pending";
export interface Badge {
  icon: string;
  label: string;
  tone: Tone;
}
export interface ToolTrace {
  name: string;
  args?: unknown;
  outcome?: string;
  say?: string;
  done: boolean;
}

function normDevice(d: unknown): string {
  return String(d ?? "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function deviceClaims(
  traces: ToolTrace[],
): { device: string; attr: string; value: unknown }[] {
  const out: { device: string; attr: string; value: unknown }[] = [];
  for (const t of traces) {
    if (t.name !== "set_device_state" || !t.done) continue;
    const a = t.args as
      | { device?: unknown; attr?: unknown; value?: unknown }
      | undefined;
    if (a && a.device !== undefined) {
      out.push({
        device: normDevice(a.device),
        attr: String(a.attr ?? "power"),
        value: a.value,
      });
    }
  }
  return out;
}

export function badgeFor(
  traces: ToolTrace[],
  opts: { finished: boolean; truthDevices?: Record<string, unknown> },
): Badge | null {
  if (!opts.finished) {
    return traces.length > 0
      ? { icon: "❔", label: "working", tone: "pending" }
      : null;
  }
  if (traces.length === 0) return null;
  if (traces.some((t) => t.done && t.outcome === "error")) {
    return { icon: "❌", label: "error", tone: "bad" };
  }
  if (traces.some((t) => t.done && t.outcome === "blocked")) {
    return { icon: "🛡️", label: "blocked by rule", tone: "info" };
  }
  if (traces.some((t) => t.done && t.outcome === "unverified")) {
    return { icon: "⚠️", label: "admitted unconfirmed", tone: "warn" };
  }
  // Ground-truth cross-check for device claims (the false-claim detector).
  const claims = deviceClaims(traces);
  if (claims.length > 0 && opts.truthDevices) {
    const results = claims.map((c) => {
      const state = opts.truthDevices?.[c.device] as
        | Record<string, unknown>
        | null
        | undefined;
      if (state == null) return "unknown";
      return state[c.attr] === c.value ? "match" : "mismatch";
    });
    if (results.every((r) => r === "match"))
      return { icon: "✅", label: "verified vs truth", tone: "ok" };
    if (results.some((r) => r === "mismatch"))
      return { icon: "❌", label: "false claim", tone: "bad" };
  }
  if (
    traces.some(
      (t) =>
        t.done &&
        (t.outcome === "verified" || t.outcome === "verified_after_retry"),
    )
  ) {
    return { icon: "✅", label: "verified", tone: "ok" };
  }
  if (traces.some((t) => t.done && t.outcome === "needs_confirmation")) {
    return { icon: "❔", label: "needs confirmation", tone: "pending" };
  }
  if (traces.some((t) => t.done && t.outcome === "ok")) {
    return { icon: "❔", label: "unconfirmed", tone: "info" };
  }
  return null;
}
