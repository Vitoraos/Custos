import { useState } from "react";
import { voice } from "./voice";
import "./theme.css";

const API =
  (
    import.meta as unknown as { env?: { VITE_API_BASE?: string } }
  ).env?.VITE_API_BASE?.replace(/\/$/, "") ?? "";

type Action = {
  title: string;
  status: string;
  evidence: string;
  localTime?: string;
  recordId?: string;
  recipe?: string;
};
type Receipt = {
  tool: string;
  outcome: string;
  target: string;
  status: string;
  id?: string;
  evidence: unknown;
};
type Showcase = {
  runId: string;
  timezone: string;
  prompt: string;
  disclosure: string;
  note: string;
  rules: { id: string; profile: string; summary: string; evidence: string }[];
  baseline: {
    label: string;
    summary: string;
    status: string;
    actions: Action[];
    receipts: Receipt[];
  };
  custos: {
    label: string;
    summary: string;
    status: string;
    actions: Action[];
    receipts: Receipt[];
  };
  deviceTruth: Record<string, Record<string, Record<string, unknown>>>;
};
type RunState = "idle" | "running" | "done" | "error";

async function runShowcase(): Promise<Showcase> {
  const response = await fetch(`${API}/sim/showcase`, {
    method: "POST",
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Showcase run failed");
  return body as Showcase;
}

function State({ value }: { value: string }) {
  const cls =
    value === "scheduled" || value === "policy verified" || value === "verified"
      ? "show-state good"
      : value === "not scheduled" ||
          value === "unverified" ||
          value === "rule not checked"
        ? "show-state bad"
        : "show-state neutral";
  return <span className={cls}>{value}</span>;
}

function ActionList({ actions }: { actions: Action[] }) {
  return (
    <div className="show-actions">
      {actions.map((action) => (
        <article className="show-action" key={action.title}>
          <div className="show-action-title">
            <strong>{action.title}</strong>
            <State value={action.status} />
          </div>
          {action.recipe ? (
            <p className="show-recipe">{action.recipe}</p>
          ) : null}
          <p>{action.evidence}</p>
          {action.recordId ? (
            <details>
              <summary>Schedule record ID</summary>
              <code>{action.recordId}</code>
            </details>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<RunState>("idle");
  const [data, setData] = useState<Showcase | null>(null);
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);

  async function play() {
    if (state === "running") return;
    setState("running");
    setError("");
    setData(null);
    try {
      const result = await runShowcase();
      setData(result);
      setState("done");
      if (!muted) {
        void voice.speak(
          `${result.custos.summary} Schedule records were saved. The physical devices have not changed yet.`,
        );
      }
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  }

  return (
    <main className="showcase-app">
      <header className="app showcase-header">
        <div className="brand-block">
          <p className="eyebrow">ACCOUNTABILITY FOR AI ASSISTANTS</p>
          <h1>Custos</h1>
        </div>
        <div className="controls">
          <button
            type="button"
            onClick={() => void play()}
            disabled={state === "running"}
          >
            {state === "running"
              ? "Running comparison…"
              : state === "done"
                ? "↻ Run again"
                : "▶ Run comparison"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              const next = !muted;
              setMuted(next);
              if (next) voice.cancel();
            }}
          >
            {muted ? "Voice off" : "Voice summary on"}
          </button>
        </div>
      </header>

      <section className="prompt-card showcase-prompt">
        <p className="eyebrow">ONE REQUEST · THREE OBLIGATIONS</p>
        <p className="prompt-copy">
          Make coffee for me at 8am, turn on the hall light 5 minutes before my
          daughter is back from school, and prepare dinner for me and my
          daughter.
        </p>
        <p className="prompt-context">
          A confident “Done” is not proof. Compare standing rules, persisted
          schedules, policy decisions, and independent device state.
        </p>
      </section>

      {error ? (
        <section className="panel show-error" role="alert">
          <strong>Comparison failed.</strong>
          <p>{error}</p>
          <button type="button" onClick={() => void play()}>
            Retry run
          </button>
        </section>
      ) : null}

      {state === "idle" ? (
        <section className="show-start">
          <h2>Can the assistant prove it?</h2>
          <p>
            Run a deterministic scenario against isolated household state. The
            baseline is a controlled simulation, not a live Alexa+ integration.
          </p>
          <button type="button" onClick={() => void play()}>
            ▶ Run the full comparison
          </button>
        </section>
      ) : null}

      {state === "running" ? (
        <section className="show-start" aria-live="polite">
          <h2>Checking the evidence</h2>
          <p>
            Seeding isolated state, evaluating the dinner rule, and verifying
            schedule records.
          </p>
          <div className="show-progress">
            <span />
          </div>
        </section>
      ) : null}

      {data ? (
        <>
          <p className="show-disclosure">{data.disclosure}</p>
          <div className="show-workspace">
            <section className="panel show-rules" aria-label="Standing rules">
              <p className="eyebrow">HOUSEHOLD CONTEXT</p>
              <h2>Rules that must survive the request</h2>
              {data.rules.map((rule) => (
                <article className="show-rule" key={rule.id}>
                  <span className="rule-profile">{rule.profile}</span>
                  <strong>{rule.summary}</strong>
                  <p>{rule.evidence}</p>
                </article>
              ))}
              <div className="show-derivation">
                <span className="eyebrow">TIME DERIVATION</span>
                <strong>1:30 PM − 5 minutes = 1:25 PM</strong>
                <p>
                  School return time is context. The derived schedule is
                  persisted separately.
                </p>
              </div>
              <p className="show-small">
                Run ID <code>{data.runId}</code>
              </p>
            </section>

            <section className="panel show-column baseline-column">
              <div className="show-column-head">
                <div>
                  <p className="eyebrow">CONTROLLED SIMULATION</p>
                  <h2>Without Custos</h2>
                  <p>
                    Memory-only baseline · no guard or independent verification
                  </p>
                </div>
                <State value={data.baseline.status} />
              </div>
              <blockquote>{data.baseline.summary}</blockquote>
              <ActionList actions={data.baseline.actions} />
              <div className="show-proof-empty">
                <strong>No receipts</strong>
                <p>
                  There are no persisted schedule records or policy evidence
                  supporting the claim.
                </p>
              </div>
            </section>

            <section className="panel show-column custos-column">
              <div className="show-column-head">
                <div>
                  <p className="eyebrow">POLICY + PERSISTENCE + EVIDENCE</p>
                  <h2>With Custos</h2>
                  <p>
                    Same request · typed rule checks · durable schedule records
                  </p>
                </div>
                <State value={data.custos.status} />
              </div>
              <blockquote>{data.custos.summary}</blockquote>
              <ActionList actions={data.custos.actions} />
              <div className="show-receipts">
                <div className="show-receipts-head">
                  <h3>Evidence receipts</h3>
                  <span>{data.custos.receipts.length} records</span>
                </div>
                {data.custos.receipts.map((receipt, i) => (
                  <details
                    className="show-receipt"
                    key={receipt.id ?? receipt.tool + i}
                    open={i === 0}
                  >
                    <summary>
                      <strong>{receipt.tool}</strong>
                      <State value={receipt.outcome} />
                    </summary>
                    <p>
                      {receipt.target} · {receipt.status}
                    </p>
                    <pre>{JSON.stringify(receipt.evidence, null, 2)}</pre>
                  </details>
                ))}
              </div>
            </section>
          </div>

          <section className="panel show-truth">
            <div>
              <p className="eyebrow">INDEPENDENT DEVICE TWIN</p>
              <h2>What actually changed?</h2>
              <p>
                Nothing yet. Both devices remain off because these are future
                schedules, not completed executions.
              </p>
            </div>
            <div className="show-device-grid">
              {Object.entries(data.deviceTruth.custos ?? {}).map(
                ([name, value]) => (
                  <article className="show-device" key={name}>
                    <strong>{name.replace("_", " ")}</strong>
                    <span>{String(value.power ?? "unknown")}</span>
                    <small>Simulated twin · unchanged</small>
                  </article>
                ),
              )}
            </div>
          </section>
          <p className="show-footnote">{data.note}</p>
        </>
      ) : null}
    </main>
  );
}
