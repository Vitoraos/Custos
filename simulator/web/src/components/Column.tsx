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
}: {
  name: "forge" | "baseline";
  title: string;
  sub: string;
  userMsgs: UserMsg[];
  turns: Turn[];
  truthDevices?: Record<string, unknown>;
}) {
  const counts: Record<string, number> = {};
  for (const t of turns) {
    const label = badgeFor(t.traces, {
      finished: t.finished,
      truthDevices,
    })?.label;
    if (label) counts[label] = (counts[label] ?? 0) + 1;
  }
  const tally = Object.entries(counts)
    .map(([l, n]) => `${n} ${l}`)
    .join(" · ");
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

  return (
    <section className={`panel col-${name}`} aria-label={title}>
      <div className="col-head">
        <h2>
          {title}
          <span className="sub">{sub}</span>
        </h2>
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
