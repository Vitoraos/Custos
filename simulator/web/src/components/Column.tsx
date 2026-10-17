import { useState } from "react";
import { fetchRecipe, type RecipeCardData } from "../api";
import { stateWord, toolLabel } from "../humanize";
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

function queryOf(t: ToolTrace): string {
  const q = (t.args as { query?: unknown } | undefined)?.query;
  return typeof q === "string" ? q : "";
}

// One clean timeline per turn: human labels, friendly states, and a click to
// reveal what happened. Raw JSON hides under "Technical details".
function Timeline({ turn, guestId }: { turn: Turn; guestId: string }) {
  const steps = stepsForTurn(turn);
  if (steps.length === 0) return null;
  return (
    <ol className="timeline">
      {steps.map((s) => {
        const trace = [...turn.traces].reverse().find((t) => t.name === s.tool);
        const detail = s.note ?? trace?.say;
        return (
          <li key={`${s.tool}-${s.attempt}`} className={`tstep ${s.state}`}>
            <span className="dot" aria-hidden="true" />
            <details>
              <summary>
                <span className="tstep-label">{toolLabel(s.tool)}</span>
                {s.attempt > 1 ? (
                  <span className="sub"> · retry {s.attempt}</span>
                ) : null}
                <span className="tstep-state">{stateWord(s.state)}</span>
              </summary>
              <div className="tstep-body">
                {detail ? <p>{detail}</p> : null}
                {s.tool === "find_recipe" && trace?.done ? (
                  <RecipeCard guestId={guestId} query={queryOf(trace)} />
                ) : null}
                <details className="tech">
                  <summary>Technical details</summary>
                  <pre>
                    {JSON.stringify(
                      {
                        tool: s.tool,
                        args: trace?.args ?? s.args,
                        outcome: trace?.outcome,
                        say: trace?.say,
                      },
                      null,
                      1,
                    )}
                  </pre>
                </details>
              </div>
            </details>
          </li>
        );
      })}
    </ol>
  );
}

function RecipeCard({ guestId, query }: { guestId: string; query: string }) {
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState<RecipeCardData | null>(null);
  const [failed, setFailed] = useState(false);
  if (!query) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          setFailed(false);
          if (next && !card) {
            fetchRecipe(guestId, query).then(
              (c) => setCard(c),
              () => setFailed(true),
            );
          }
        }}
      >
        {open ? "Hide recipe" : "View recipe"}
      </button>
      {open ? (
        failed ? (
          <span className="sub">recipe unavailable</span>
        ) : card ? (
          <div className="recipe-card">
            <strong>{card.name}</strong>
            <ul>
              {card.ingredients.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : (
          <span className="sub">loading…</span>
        )
      ) : null}
    </div>
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
  guestId,
  disabled = false,
  disabledNote = "paused",
}: {
  name: "forge" | "baseline";
  title: string;
  sub: string;
  userMsgs: UserMsg[];
  turns: Turn[];
  truthDevices?: Record<string, unknown>;
  stage: Stage;
  guestId: string;
  disabled?: boolean;
  disabledNote?: string;
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
      <span className="badge pending">working</span>
    ) : stage === "done" ? (
      <span className="badge info">done</span>
    ) : (
      <span className="sub">up next</span>
    );

  return (
    <section
      className={`panel col-${name}${disabled ? " disabled" : ""}`}
      aria-label={title}
      aria-disabled={disabled || undefined}
      data-stage={stage}
    >
      <div className="col-head">
        <h2>
          {title}
          <span className="sub">{sub}</span>
        </h2>
        {disabled ? <span className="sub">{disabledNote}</span> : stageNote}{" "}
        {tally ? <span className="tally">{tally}</span> : null}
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
              <Timeline turn={it.turn} guestId={guestId} />
            </div>
          ),
        )}
      </div>
    </section>
  );
}
