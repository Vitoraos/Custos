// Truth panel: human-readable ground truth (tiles, pills, receipt).
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
  const last = (ground.lastReceipt as Receipt | undefined) ?? null;
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
        <div className="truth-grid">
          <div>
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
          </div>
          <div>
            <h3>Standing rules</h3>
            <div className="pills">
              {rules.length === 0 ? (
                <span className="sub">none stored</span>
              ) : (
                rules.map((r) => (
                  <span key={r.id} className="pill">
                    {r.summary} · {r.profile}
                  </span>
                ))
              )}
            </div>
            <h3>Shopping list</h3>
            {shopping.length === 0 ? (
              <span className="sub">empty</span>
            ) : (
              <ul>
                {shopping.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </div>
          <div>
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
          </div>
        </div>
      )}
      <details>
        <summary>raw JSON (debug)</summary>
        <pre>{JSON.stringify(ground, null, 1)}</pre>
      </details>
    </section>
  );
}
