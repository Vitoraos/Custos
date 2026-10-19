// Truth panel: human-readable ground truth (tiles, rules, receipt).
// Raw JSON hides behind a native <details> disclosure for debugging.

interface Rule {
  id: string;
  profile: string;
  kind: string;
  summary: string;
}
interface Receipt {
  tool: string;
  outcome: string;
  attempts: number;
  latencyMs: number;
  createdAt?: string;
  rulesChecked?: number;
  decision?: { checked?: string[]; reasons?: { text: string }[] };
}

function deviceState(v: unknown): { cls: string; label: string } {
  if (v == null || typeof v !== "object")
    return { cls: "unknown", label: "unknown" };
  const entries = Object.entries(v as Record<string, unknown>);
  if (entries.length === 0) return { cls: "unknown", label: "unknown" };
  const text = entries.map(([k, val]) => `${k}=${String(val)}`).join(" ");
  const vals = entries.map(([, val]) => String(val).toLowerCase());
  const on = vals.some((s) => ["on", "true", "unlocked", "open"].includes(s));
  const off = vals.every((s) =>
    ["off", "false", "locked", "closed"].includes(s),
  );
  return { cls: on ? "on" : off ? "off" : "unknown", label: text };
}

export default function TruthPanel({
  ground,
}: {
  ground: Record<string, unknown>;
}) {
  const devices = (ground.devices as Record<string, unknown> | undefined) ?? {};
  const rules = (ground.rules as Rule[] | undefined) ?? [];
  const shopping = (ground.shopping as string[] | undefined) ?? [];
  const pantry = (ground.pantry as string[] | undefined) ?? [];
  const last = (ground.lastReceipt as Receipt | undefined) ?? null;
  const log = ((ground.receipts as Receipt[] | undefined) ?? []).slice(0, 20);
  const notifyTopic =
    typeof ground.notifyTopic === "string" ? ground.notifyTopic : null;
  const empty =
    Object.keys(devices).length === 0 &&
    rules.length === 0 &&
    shopping.length === 0 &&
    !last;
  return (
    <section className="panel truth" aria-label="Ground truth">
      <h2>
        GROUND TRUTH <span className="sub">independent of the assistants</span>
      </h2>
      {empty ? (
        <p className="sub">Send a message to populate.</p>
      ) : (
        <>
          <h3>Devices</h3>
          <div className="tiles">
            {Object.entries(devices).map(([name, v]) => {
              const s = deviceState(v);
              return (
                <div key={name} className={`tile ${s.cls}`}>
                  <div>{name}</div>
                  <div className="state">{s.label}</div>
                </div>
              );
            })}
          </div>
          <h3>Standing rules</h3>
          {rules.length === 0 ? (
            <span className="sub">none stored</span>
          ) : (
            <ul>
              {rules.map((r) => (
                <li key={r.id}>
                  {r.summary} <span className="sub">· {r.profile}</span>
                </li>
              ))}
            </ul>
          )}
          <h3>Last receipt</h3>
          {!last ? (
            <span className="sub">no actions yet</span>
          ) : (
            <div className="receipt">
              <div>
                <strong>{last.tool}</strong> → {last.outcome}
              </div>
              <div className="sub">
                {last.attempts} attempt{last.attempts === 1 ? "" : "s"} ·{" "}
                {last.latencyMs} ms
                {last.decision?.checked
                  ? ` · ${last.decision.checked.length} rules checked`
                  : ""}
              </div>
              {(last.decision?.reasons ?? []).slice(0, 2).map((r) => (
                <div key={r.text}>{r.text}</div>
              ))}
            </div>
          )}
          <div className="truth-cards">
            <div className="tcard">
              <h3>Receipts log</h3>
              {log.length === 0 ? (
                <span className="sub">no actions yet this session</span>
              ) : (
                <ol className="receipt-log">
                  {log.map((r, i) => (
                    <li key={`${r.tool}-${r.createdAt ?? i}`}>
                      <strong>{r.tool}</strong> → {r.outcome}{" "}
                      <span className="sub">
                        {r.attempts} attempt{r.attempts === 1 ? "" : "s"} ·{" "}
                        {r.latencyMs} ms
                        {typeof r.rulesChecked === "number"
                          ? ` · ${r.rulesChecked} rules`
                          : r.decision?.checked
                            ? ` · ${r.decision.checked.length} rules`
                            : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className="tcard">
              <h3>Phone notifications</h3>
              {notifyTopic ? (
                <>
                  <p className="sub">
                    Reminders + shopping updates buzz your phone via ntfy.
                  </p>
                  <p>
                    <a
                      href={`https://ntfy.sh/${notifyTopic}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Check notification
                    </a>
                  </p>
                  <p className="sub mono">{notifyTopic}</p>
                </>
              ) : (
                <span className="sub">start a session to get a topic</span>
              )}
            </div>
            {shopping.length > 0 && (
              <div className="tcard">
                <h3>Shopping list</h3>
                <ul>
                  {shopping.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {pantry.length > 0 && (
              <div className="tcard">
                <h3>Pantry</h3>
                <ul>
                  {pantry.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
      <details>
        <summary>raw JSON (debug)</summary>
        <pre>{JSON.stringify(ground, null, 1)}</pre>
      </details>
    </section>
  );
}
