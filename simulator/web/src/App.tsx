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
  raw?: unknown;
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
type ProcessStatus = "pending" | "running" | "done" | "failed";
type ProcessTask = { goal: string; subtask: string; status: ProcessStatus; detail: string };
async function runShowcase(): Promise<Showcase> {
  const response = await fetch(`${API}/sim/showcase`, { method: "POST" });
  const body: unknown = await response.json();

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error?: unknown }).error ?? "Showcase run failed")
        : "Showcase run failed";
    throw new Error(message);
  }

  // The API response is a runtime boundary. TypeScript types do not validate
  // JSON received over HTTP, because apparently the network has no type checker.
  if (!body || typeof body !== "object") {
    throw new Error("Showcase API returned an invalid response.");
  }

  const result = body as Partial<Showcase>;
  if (
    !result.baseline ||
    !result.custos ||
    !Array.isArray(result.rules) ||
    !result.notification ||
    !result.deviceTruth ||
    !result.recipe ||
    typeof result.recipe.name !== "string" ||
    !Array.isArray(result.recipe.ingredients) ||
    !Array.isArray(result.recipe.instructions) ||
    !Array.isArray(result.recipe.missingIngredients)
  ) {
    throw new Error(
      "Showcase API response is missing required data (especially recipe.name). Check that the API deployment matches the web app.",
    );
  }

  return result as Showcase;
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

function ProcessPanel({
  mode,
  stage,
  state,
}: {
  mode: "baseline" | "custos";
  stage: number;
  state: RunState;
}) {
  const tasks: Omit<ProcessTask, "status">[] = mode === "baseline"
    ? [
        { goal: "Answer the household request", subtask: "Interpret the requested actions", detail: "Request understood" },
        { goal: "Prepare the requested actions", subtask: "Acknowledge coffee and lights", detail: "No persisted device write or schedule created" },
        { goal: "Plan dinner", subtask: "Select a meal without checking Maya's allergy", detail: "Standing rule not checked" },
        { goal: "Finish the request", subtask: "Claim completion", detail: "No independent verification or audit receipt" },
      ]
    : [
        { goal: "Understand the request", subtask: "Extract immediate actions, scheduled actions, and dinner goal", detail: "Five outcomes identified" },
        { goal: "Apply household rules", subtask: "Load Maya's allergy and school-return time", detail: "Rules checked before acting" },
        { goal: "Act on devices", subtask: "Turn on coffee maker and kitchen light; persist coffee and hall-light schedules", detail: "Device read-back and schedule persistence checked" },
        { goal: "Plan a safe dinner", subtask: "Reject beef recipe and choose a compatible alternative", detail: "Recipe passes the allergy policy" },
        { goal: "Complete useful follow-through", subtask: "Compare recipe ingredients with pantry and shopping list", detail: "Only missing items added; duplicates avoided" },
        { goal: "Inform the user", subtask: "Send recipe, ingredients, cooking steps, and shopping changes", detail: "Provider acceptance reported separately from delivery" },
        { goal: "Prove what happened", subtask: "Read back state, inspect schedules, and write receipts", detail: "Each outcome labelled by evidence, not assumption" },
      ];
  const completionStage = mode === "baseline"
    ? [1, 2, 3, 4]
    : [1, 3, 5, 6, 7, 8, 9];
  return (
    <section className={`process-panel process-${mode}`} aria-label={mode === "baseline" ? "Baseline task progress" : "Custos task progress"}>
      <div className="process-heading">
        <div>
          <p className="eyebrow">{mode === "baseline" ? "BASELINE EXECUTION" : "CUSTOS EXECUTION"}</p>
          <h3>{mode === "baseline" ? "Plan and progress" : "Goal, subtasks and evidence"}</h3>
        </div>
        <State value={state === "done" ? "done" : state === "error" ? "failed" : "running"} />
      </div>
      <p className="process-final-goal">
        <strong>Final goal:</strong> {mode === "baseline"
          ? "Respond to the household request."
          : "Complete the authorized tasks safely, handle the obvious follow-through, and prove what actually happened."}
      </p>
      <div className="process-list">
        {tasks.map((task, index) => {
          const threshold = completionStage[index] ?? 99;
          const status: ProcessStatus =
            stage > threshold || (state === "done" && stage >= threshold)
              ? "done"
              : stage === threshold && state === "running"
                ? "running"
                : "pending";
          return (
            <article className={`process-task process-${status}`} key={task.subtask}>
              <span className={`process-status${status === "running" ? " is-spinning" : ""}`} aria-label={status}>
                {status === "done" ? "✓" : status === "running" ? <span className="process-spinner" aria-hidden="true" /> : "○"}
              </span>
              <div className="process-task-copy">
                <div className="process-task-top">
                  <strong>{task.goal}</strong>
                  <State value={status} />
                </div>
                <p>{task.subtask}</p>
                <small>{task.detail}</small>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function humanize(value: string): string {
  const labels: Record<string, string> = {
    set_device_state: "Set device state",
    schedule_device_action: "Schedule device action",
    evaluate_recipe_policy: "Check recipe against household rules",
    update_shopping_list: "Update shopping list",
    set_reminder: "Send dinner notification",
    coffee_maker: "Coffee maker",
    kitchen_light: "Kitchen light",
    hall_light: "Hall light",
  };
  return labels[value] ?? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ReceiptCard({ receipt }: { receipt: Receipt }) {
  return (
    <article className="show-receipt">
      <div className="receipt-topline">
        <div>
          <p className="eyebrow">ACTION RECEIPT</p>
          <h3>{humanize(receipt.target)}</h3>
        </div>
        <State value={receipt.outcome} />
      </div>
      <p className="receipt-tool">{humanize(receipt.tool)} · {humanize(receipt.status)}</p>
      <p className="receipt-say">
        {String((receipt.evidence as { say?: unknown })?.say ?? "Evidence recorded for this action.")}
      </p>
      <p className="receipt-explainer">{receipt.outcome === "verified" ? "What this means: the expected state was read back or the record was persisted and checked." : receipt.outcome === "blocked" ? "What this means: a standing rule prevented this action." : "What this means: this result is not confirmed as successful."}</p>
      <details>
        <summary>View raw JSON evidence</summary>
        <pre>{JSON.stringify(receipt.raw ?? receipt, null, 2)}</pre>
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
      // Pace the visible task flow like an agent trace. The API has returned
      // the completed scenario already; these delays are presentation only,
      // never a claim that a tool is still executing.
      // Finish the baseline sequence completely before starting Custos.
      // Stages 1–4 belong to the baseline; stages 5–14 belong to Custos.
      const stageDelays = [850, 1250, 1550, 900, 1050, 1850, 1650, 1450, 1300, 1750, 950, 1250, 1550, 900];
      for (let index = 0; index < stageDelays.length; index += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, stageDelays[index]));
        setStage(index + 1);
      }
      setState("done");
      if (!muted) {
        void voice.speak(
          "The coffee maker and kitchen light are on in the simulated device twin. Coffee and the hall light are scheduled. Dinner avoids beef, missing ingredients were added to the shopping list, and the recipe notification was accepted by the provider. Scheduled actions have not run yet.",
        );
      }
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  }

  const baselineStage = Math.min(stage, 4);
  const custosStage = Math.max(0, stage - 4);
  const baselineVisible = baselineStage >= 3 ? 5 : baselineStage >= 2 ? 2 : baselineStage >= 1 ? 1 : 0;
  const custosVisible = custosStage >= 9 ? 5 : custosStage >= 8 ? 4 : custosStage >= 7 ? 3 : custosStage >= 5 ? 2 : custosStage >= 3 ? 1 : 0;

  return (
    <main className="showcase-app">
      <header className="app showcase-header">
        <div className="brand-block">
          <p className="eyebrow">ACCOUNTABILITY FOR AI ASSISTANTS</p>
          <h1>Custos</h1>
        </div>
        <div className="controls">
          <button type="button" onClick={() => void play()} disabled={state === "running"}>
            {state === "running" ? "Executing comparison…" : state === "done" ? "↻ Run again" : "▶ Play comparison"}
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
          Turn on the coffee maker and kitchen light now, schedule coffee for 8am, turn on the hall light 5 minutes before my daughter is back from school, and prepare dinner for me and my daughter.
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
          <p className="show-disclosure">{data.disclosure}</p>

          <section className="comparison-grid sequential-comparison" aria-label="Sequential assistant comparison">
            {stage <= 4 ? (
              <section className="panel show-column baseline-column active-run">
                <div className="show-column-head">
                  <div>
                    <p className="eyebrow">RUN 1 OF 2 · CONTROLLED BASELINE</p>
                    <h2>Alexa+ without Custos</h2>
                    <p>Raw acknowledgements · no independent verification</p>
                  </div>
                  {baselineStage >= 4 ? <State value={data.baseline.status} /> : <State value={state === "running" ? "running" : "waiting"} />}
                </div>
                {baselineStage >= 1 ? <blockquote className="reveal-item">{data.baseline.summary}</blockquote> : <p className="waiting-copy">Baseline is preparing the response…</p>}
                <ProcessPanel mode="baseline" stage={baselineStage} state={baselineStage >= 4 ? "done" : state} />
                <ActionList actions={data.baseline.actions} visible={baselineVisible} />
                {baselineStage >= 4 ? (
                  <div className="show-proof-empty reveal-item">
                    <strong>No receipts</strong>
                    <p>The baseline says it is done, but has no persisted schedule or policy evidence to support that claim.</p>
                  </div>
                ) : null}
                {baselineStage >= 4 ? <p className="phase-transition">Baseline finished. Custos starts next.</p> : null}
              </section>
            ) : (
              <section className="panel show-column custos-column active-run">
                <div className="show-column-head">
                  <div>
                    <p className="eyebrow">RUN 2 OF 2 · POLICY · ACTION · VERIFICATION</p>
                    <h2>Your MCP · Custos</h2>
                    <p>Standing rules · useful follow-through · evidence</p>
                  </div>
                  {custosStage >= 10 ? <State value={data.custos.status} /> : <State value="running" />}
                </div>
                {custosStage >= 1 ? <blockquote className="reveal-item">{data.custos.summary}</blockquote> : <p className="waiting-copy">Custos is starting after the baseline run…</p>}
                <ProcessPanel mode="custos" stage={custosStage} state={custosStage >= 10 ? "done" : state} />
                <ActionList actions={data.custos.actions} visible={custosVisible} />
                {custosStage >= 7 ? (
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
            )}
          </section>

          {stage >= 8 ? (
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

          {stage >= 3 ? (
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

          {stage >= 10 ? (
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

          {stage >= 9 ? (
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
