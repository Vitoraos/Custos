// Plan timeline: fold a SimEvent stream into per-tool steps with states.
// Pure logic (no React) — the UI renders Step[] as a checklist. Tested in
// test/unit/steps.test.ts. Event shape unchanged (replays keep working).
export type StepState = "working" | "done" | "failed" | "pending";
export interface Step {
  tool: string;
  args?: unknown;
  state: StepState;
  attempt: number;
  note?: string;
}
export interface SimEventLike {
  type: string;
  name?: string;
  args?: unknown;
  outcome?: string;
  say?: string;
  text?: string;
}

function key(tool: string, args: unknown): string {
  return `${tool}|${JSON.stringify(args ?? null)}`;
}

export function foldSteps(events: SimEventLike[]): Step[] {
  const steps: Step[] = [];
  const open = new Map<string, number>(); // key -> index in steps
  const attempts = new Map<string, number>(); // key -> calls so far
  for (const ev of events) {
    if (ev.type === "tool_call") {
      const name = ev.name ?? "?";
      const k = key(name, ev.args);
      const n = (attempts.get(k) ?? 0) + 1;
      attempts.set(k, n);
      const prev = open.get(k);
      if (prev !== undefined && steps[prev].state === "working") {
        // Same tool+args re-called mid-flight: previous attempt superseded.
        steps[prev] = {
          ...steps[prev],
          state: "failed",
          note: "superseded by retry",
        };
      }
      const idx = steps.length;
      steps.push({ tool: name, args: ev.args, state: "working", attempt: n });
      open.set(k, idx);
    } else if (ev.type === "tool_result") {
      const name = ev.name ?? "";
      // Match most recent open step: same name preferred, else latest working.
      let idx = -1;
      for (let i = steps.length - 1; i >= 0; i--) {
        if (
          steps[i].state === "working" &&
          (name === "" || steps[i].tool === name)
        ) {
          idx = i;
          break;
        }
      }
      if (idx < 0) continue;
      const s = steps[idx];
      switch (ev.outcome) {
        case "ok":
        case "verified":
        case "verified_after_retry":
          steps[idx] = { ...s, state: "done" };
          break;
        case "blocked":
          steps[idx] = {
            ...s,
            state: "failed",
            note: ev.say ?? "blocked by rule",
          };
          break;
        case "unverified":
          steps[idx] = { ...s, state: "failed", note: "admitted unconfirmed" };
          break;
        case "needs_confirmation":
          steps[idx] = { ...s, state: "pending", note: "waiting on you" };
          break;
        case "error":
          steps[idx] = { ...s, state: "failed", note: ev.say ?? "error" };
          break;
        default:
          // Unknown is not success. Fail closed until the outcome vocabulary
          // is deliberately extended and covered by a regression test.
          steps[idx] = {
            ...s,
            state: "failed",
            note: `unknown outcome "${String(ev.outcome ?? "missing")}" — not verified`,
          };
          break;
      }
      open.delete(key(s.tool, s.args));
    }
  }
  return steps;
}
