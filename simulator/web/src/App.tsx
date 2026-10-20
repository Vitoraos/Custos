import { useState } from "react";
import { voice } from "./voice";
import "./theme.css";

const API =
  (import.meta as unknown as { env?: { VITE_API_BASE?: string } }).env
    ?.VITE_API_BASE?.replace(/\/$/, "") ?? "";

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
  recipe: { name: string; ingredients: string[]; instructions: string[]; missingIngredients: string[] };
  pantry: string[];
  shoppingList: string[];
  notification: { accepted: boolean; topic: string; id: string; text: string; deliveryNote: string };
  deviceTruth: Record<string, Record<string, Record<string, unknown>>>;
};

type RunState = "idle" | "running" | "done" | "error";
const STEPS = [
  "Understand the request",
  "Baseline schedules coffee",
  "Baseline misses the school context",
  "Baseline claims dinner is handled",
  "Custos schedules coffee",
  "Custos derives the hall-light time",
  "Custos plans dinner and updates the shopping list",
  "Inspect receipts and independent state",
];

async function runShowcase(): Promise<Showcase> {
  const response = await fetch(`${API}/sim/showcase`, { method: "POST" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Showcase run failed");
  return body as Showcase;
}

function State({ value }: { value: string }) {
  const cls =
    value === "scheduled" || value === "policy verified" || value === "verified"
      ? "show-state good"
      : value === "not scheduled" || value === "unverified" || value === "rule not checked"
        ? "show-state bad"
        : "show-state neutral";
  return <span className={cls}>{value}</span>;
}

function ActionList({ actions, visible }: { actions: Action[]; visible: number }) {
  return (
    <div className="show-actions">
      {actions.slice(0, visible).map((action) => (
        <article className="show-action reveal-item" key={action.title}>
          <div className="show-action-title">
            <strong>{action.title}</strong>
            <State value={action.status} />
          </div>
          {action.recipe ? <p className="show-recipe">{action.recipe}</p> : null}
          <p>{action.evidence}</p>
          {action.recordId ? (
            <details>
              <summary>View persisted schedule record</summary>
              <code>{action.recordId}</code>
            </details>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function ReceiptCard({ receipt }: { receipt: Receipt }) {
  return (
    <article className="show-receipt">
      <div className="receipt-topline">
        <div>
          <p className="eyebrow">ACTION RECEIPT</p>
          <h3>{receipt.target}</h3>
        </div>
        <State value={receipt.outcome} />
      </div>
      <p className="receipt-tool">{receipt.tool} · {receipt.status}</p>
      <p className="receipt-say">
        {String((receipt.evidence as { say?: unknown })?.say ?? "Evidence recorded for this action.")}
      </p>
      <details>
        <summary>Inspect verification evidence</summary>
        <pre>{JSON.stringify(receipt.evidence, null, 2)}</pre>
      </details>
      {receipt.id ? <p className="receipt-id">Receipt ID <code>{receipt.id}</code></p> : null}
    </article>
  );
}

export default function App() {
  const [state, setState] = useState<RunState>("idle");
  const [data, setData] = useState<Showcase | null>(null);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);

  async function play() {
    if (state === "running") return;
    setState("running");
    setError("");
    setData(null);
    setStage(0);
    try {
      const result = await runShowcase();
      setData(result);
      // Reveal the result as a paced walkthrough rather than dumping every
      // panel into the page at once. The underlying scenario has completed;
      // this is a presentation sequence, not a claim of live tool streaming.
      for (let next = 1; next <= STEPS.length; next += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 950));
        setStage(next);
      }
      setState("done");
      if (!muted) {
        void voice.speak(
          "Coffee and the hall light are scheduled. Dinner avoids beef. Missing ingredients were added to the shopping list, and the recipe notification was accepted by the notification provider. Scheduled devices have not physically changed yet.",
        );
      }
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  }

  const stepIndex = Math.max(0, Math.min(STEPS.length - 1, stage === 0 ? 0 : stage - 1));
  const baselineVisible = stage >= 4 ? 3 : stage >= 3 ? 2 : stage >= 2 ? 1 : 0;
  const custosVisible = stage >= 7 ? 3 : stage >= 6 ? 2 : stage >= 5 ? 1 : 0;

  return (
    <main className="showcase-app">
      <header className="app showcase-header">
        <div className="brand-block">
          <p className="eyebrow">ACCOUNTABILITY FOR AI ASSISTANTS</p>
          <h1>Custos</h1>
        </div>
        <div className="controls">
          <button type="button" onClick={() => void play()} disabled={state === "running"}>
            {state === "running" ? "Playing the walkthrough…" : state === "done" ? "↻ Run again" : "▶ Play comparison"}
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
          Make coffee for me at 8am, turn on the hall light 5 minutes before my daughter is back from school, and prepare dinner for me and my daughter.
        </p>
        <p className="prompt-context">
          The assistant should infer the necessary substeps, respect household rules, take useful action, and report what the evidence supports.
        </p>
      </section>

      {error ? (
        <section className="panel show-error" role="alert">
          <strong>Comparison failed.</strong>
          <p>{error}</p>
          <button type="button" onClick={() => void play()}>Retry run</button>
        </section>
      ) : null}

      {state === "idle" ? (
        <section className="show-start">
          <h2>One request. Two approaches.</h2>
          <p>Watch the same household request unfold with and without Custos. The baseline is a controlled simulation, not a live Alexa+ integration.</p>
          <button type="button" onClick={() => void play()}>▶ Play the walkthrough</button>
        </section>
      ) : null}

      {state === "running" && !data ? (
        <section className="show-start" aria-live="polite">
          <h2>Preparing the comparison</h2>
          <p>Creating isolated household state and checking the policy and persistence evidence.</p>
          <div className="show-progress"><span /></div>
        </section>
      ) : null}

      {data ? (
        <>
          <section className="walkthrough-bar" aria-live="polite">
            <div className="walkthrough-label">
              <p className="eyebrow">THE WALKTHROUGH</p>
              <strong>{stage === 0 ? "Request received" : STEPS[stepIndex]}</strong>
            </div>
            <span className="walkthrough-count">{Math.min(stage, STEPS.length)} of {STEPS.length}</span>
            <div className="walkthrough-track">
              <span style={{ width: `${(Math.min(stage, STEPS.length) / STEPS.length) * 100}%` }} />
            </div>
            {state === "running" ? <p className="walkthrough-hint">Each stage appears in sequence so the difference is easy to follow.</p> : null}
          </section>

          <p className="show-disclosure">{data.disclosure}</p>

          <section className="comparison-grid" aria-label="Assistant comparison">
            <section className="panel show-column baseline-column">
              <div className="show-column-head">
                <div>
                  <p className="eyebrow">CONTROLLED BASELINE</p>
                  <h2>Without Custos</h2>
                  <p>Raw acknowledgements · no independent verification</p>
                </div>
                {stage >= 2 ? <State value={data.baseline.status} /> : <State value="waiting" />}
              </div>
              {stage >= 1 ? <blockquote className="reveal-item">{data.baseline.summary}</blockquote> : <p className="waiting-copy">Waiting for the baseline run…</p>}
              <ActionList actions={data.baseline.actions} visible={baselineVisible} />
              {stage >= 3 ? (
                <div className="show-proof-empty reveal-item">
                  <strong>No receipts</strong>
                  <p>The baseline says it is done, but has no persisted schedule or policy evidence to support that claim.</p>
                </div>
              ) : null}
            </section>

            <section className="panel show-column custos-column">
              <div className="show-column-head">
                <div>
                  <p className="eyebrow">POLICY · ACTION · VERIFICATION</p>
                  <h2>With Custos</h2>
                  <p>Standing rules · useful follow-through · evidence</p>
                </div>
                {stage >= 4 ? <State value={data.custos.status} /> : <State value="working" />}
              </div>
              {stage >= 1 ? <blockquote className="reveal-item">{data.custos.summary}</blockquote> : <p className="waiting-copy">Custos is about to evaluate the request…</p>}
              <ActionList actions={data.custos.actions} visible={custosVisible} />
              {stage >= 5 ? (
                <div className="dinner-follow-through reveal-item">
                  <p className="eyebrow">PROACTIVE FOLLOW-THROUGH</p>
                  <h3>{data.recipe.name}</h3>
                  <p className="dinner-note">Selected after checking Maya’s beef allergy.</p>
                  <div className="dinner-columns">
                    <div>
                      <h4>Ingredients</h4>
                      <ul>{data.recipe.ingredients.map((item) => <li key={item}>{item}</li>)}</ul>
                    </div>
                    <div>
                      <h4>Cooking procedure</h4>
                      <ol>{data.recipe.instructions.map((item) => <li key={item}>{item}</li>)}</ol>
                    </div>
                  </div>
                  <div className="pantry-result">
                    <div>
                      <h4>Already in the pantry</h4>
                      <p>{data.pantry.join(", ")}</p>
                    </div>
                    <div>
                      <h4>Added to shopping list</h4>
                      <p className="missing-items">{data.recipe.missingIngredients.length ? data.recipe.missingIngredients.join(", ") : "Nothing missing"}</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          </section>

          {stage >= 5 ? (
            <section className="notification-panel reveal-item">
              <div className="notification-icon" aria-hidden="true">N</div>
              <div className="notification-copy">
                <p className="eyebrow">DINNER NOTIFICATION</p>
                <h2>{data.notification.accepted ? "Recipe notification accepted" : "Notification not confirmed"}</h2>
                <p>{data.notification.deliveryNote}</p>
                <details>
                  <summary>Preview the notification</summary>
                  <pre>{data.notification.text}</pre>
                </details>
              </div>
              <State value={data.notification.accepted ? "accepted by provider" : "unverified"} />
            </section>
          ) : null}

          {stage >= 5 ? (
            <section className="panel show-context reveal-item">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">HOUSEHOLD CONTEXT</p>
                  <h2>What Custos remembered</h2>
                </div>
                <span className="context-count">{data.rules.length} standing rules</span>
              </div>
              <div className="context-grid">
                {data.rules.map((rule) => (
                  <article className="show-rule" key={rule.id}>
                    <span className="rule-profile">{rule.profile}</span>
                    <strong>{rule.summary}</strong>
                    <p>{rule.evidence}</p>
                  </article>
                ))}
                <article className="show-rule time-rule">
                  <span className="rule-profile">DERIVED ACTION</span>
                  <strong>1:30 PM − 5 minutes = 1:25 PM</strong>
                  <p>Custos converted the school return time into the correct scheduled action.</p>
                </article>
              </div>
            </section>
          ) : null}

          {stage >= 5 ? (
            <section className="receipts-section reveal-item">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">AUDIT TRAIL</p>
                  <h2>Receipts for what actually happened</h2>
                  <p>Each receipt separates the intended action from the observed evidence. Open technical details only when needed.</p>
                </div>
                <span className="context-count">{data.custos.receipts.length} records</span>
              </div>
              <div className="receipt-grid">
                {data.custos.receipts.map((receipt, i) => <ReceiptCard key={receipt.id ?? receipt.tool + i} receipt={receipt} />)}
              </div>
            </section>
          ) : null}

          {stage >= 5 ? (
            <section className="panel show-truth reveal-item">
              <div>
                <p className="eyebrow">INDEPENDENT DEVICE TWIN</p>
                <h2>What changed on the devices?</h2>
                <p>These are future schedules, so the simulated devices remain off. Persisting a schedule is not the same as executing it.</p>
              </div>
              <div className="show-device-grid">
                {Object.entries(data.deviceTruth.custos ?? {}).map(([name, value]) => (
                  <article className="show-device" key={name}>
                    <strong>{name.replaceAll("_", " ")}</strong>
                    <span>{String(value.power ?? "unknown")}</span>
                    <small>Simulated device twin · unchanged</small>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
          <p className="show-footnote">{data.note}</p>
        </>
      ) : null}
    </main>
  );
}
