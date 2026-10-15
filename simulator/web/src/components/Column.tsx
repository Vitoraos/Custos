import { foldSteps, type SimEventLike, type Step } from "../steps";
import { badgeFor, type ToolTrace } from "../verdict";

export interface Turn {
  id: number;
  col: "forge" | "baseline";
  text: string;
  traces: ToolTrace[];
  finished: boolean;
}
export interface UserMsg {
  id: number;
  text: string;
}
export type Stage = "idle" | "running" | "done";

// Reconstruct the event stream a turn's traces imply, then fold to steps.
// (Turns store landed traces; foldSteps recovers order, retries, states.)
function stepsForTurn(turn: Turn): Step[] {
  const events: SimEventLike[] = [];
  for (const t of turn.traces) {
    events.push({ type: "tool_call", name: t.name, args: t.args });
    if (t.done) {
      events.push({
        type: "tool_result",
        name: t.name,
        outcome: t.outcome,
        say: t.say,
      });
    }
  }
  return foldSteps(events);
}

const STEP_ICON: Record<Step["state"], string> = {
  working: "⟳",
  done: "✓",
  failed: "✗",
  pending: "…",
};

function PlanView({ steps }: { steps: Step[] }) {
  if (steps.length === 0) return null;
  return (
    <ol className="plan">
      {steps.map((s, i) => (
        <li key={`${s.tool}-${s.attempt}`} className={`step ${s.state}`}>
          <span aria-hidden="true">{STEP_ICON[s.state]}</span>{" "}
          <code>{s.tool}</code>
          {s.attempt > 1 ? (
            <span className="sub">retry {s.attempt}</span>
          ) : null}{" "}
          <span className="sub">{s.state}</span>
          {s.note ? <span className="sub"> — {s.note}</span> : null}
          {i === steps.length - 1 && s.args !== undefined ? (
            <details className="trace">
              <summary>args</summary>
              <pre>{JSON.stringify(s.args, null, 1)}</pre>
            </details>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function TraceView({ t }: { t: ToolTrace }) {
  return (
    <details className="trace">
      <summary>
        ⚙ {t.name}
        {t.done && t.outcome ? ` → ${t.outcome}` : t.done ? " → done" : " …"}
      </summary>
      <pre>{JSON.stringify({ args: t.args, say: t.say }, null, 1)}</pre>
    </details>
  );
}

export default function Column({
  name,
  title,
  sub,
  userMsgs,
  turns,
  truthDevices,
  stage,
}: {
  name: "forge" | "baseline";
  title: string;
  sub: string;
  userMsgs: UserMsg[];
  turns: Turn[];
  truthDevices?: Record<string, unknown>;
  stage: Stage;
}) {
  const counts: Record<string, number> = {};
  let stepsDone = 0;
  let stepsFailed = 0;
  for (const t of turns) {
    const label = badgeFor(t.traces, {
      finished: t.finished,
      truthDevices,
    })?.label;
    if (label) counts[label] = (counts[label] ?? 0) + 1;
    for (const s of stepsForTurn(t)) {
      if (s.state === "done") stepsDone++;
      else if (s.state === "failed") stepsFailed++;
    }
  }
  const verdictTally = Object.entries(counts)
    .map(([l, n]) => `${n} ${l}`)
    .join(" · ");
  const stepTally =
    stepsDone + stepsFailed > 0
      ? `${stepsDone} done · ${stepsFailed} failed`
      : "";
  const tally = [verdictTally, stepTally]
    .filter((s) => s.length > 0)
    .join(" — ");
  // Interleave user messages and turns in id order.
  const items: (
    | { kind: "you"; msg: UserMsg }
    | { kind: "turn"; turn: Turn }
  )[] = [
    ...userMsgs.map((msg) => ({ kind: "you" as const, msg })),
    ...turns.map((turn) => ({ kind: "turn" as const, turn })),
  ].sort(
    (a, b) =>
      (a.kind === "you" ? a.msg.id : a.turn.id) -
      (b.kind === "you" ? b.msg.id : b.turn.id),
  );
  const stageNote =
    stage === "running" ? (
      <span className="badge pending">⟳ working</span>
    ) : stage === "done" ? (
      <span className="badge info">done</span>
    ) : (
      <span className="sub">up next</span>
    );

  return (
    <section
      className={`panel col-${name}`}
      aria-label={title}
      data-stage={stage}
    >
      <div className="col-head">
        <h2>
          {title}
          <span className="sub">{sub}</span>
        </h2>
        {stageNote} {tally ? <span className="tally">{tally}</span> : null}
      </div>
      <div className="feed">
        {items.map((it) =>
          it.kind === "you" ? (
            <div key={it.msg.id} className="bubble you">
              <span className="who">you: </span>
              {it.msg.text}
            </div>
          ) : (
            <div key={it.turn.id} className="turn">
              <div className="bubble asst">
                <span className="who">asst: </span>
                {it.turn.text}
                {(() => {
                  const b = badgeFor(it.turn.traces, {
                    finished: it.turn.finished,
                    truthDevices,
                  });
                  return b ? (
                    <span className={`badge ${b.tone}`}>
                      {b.icon} {b.label}
                    </span>
                  ) : null;
                })()}
              </div>
              <PlanView steps={stepsForTurn(it.turn)} />
              {it.turn.traces.map((t) => (
                <TraceView key={`${t.name}-${t.outcome ?? "open"}`} t={t} />
              ))}
            </div>
          ),
        )}
      </div>
    </section>
  );
}
