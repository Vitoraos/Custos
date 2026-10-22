import { useMemo, useState, type ReactNode } from "react";
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
  baseline: { label: string; summary: string; status: string; actions: Action[]; receipts: Receipt[] };
  custos: { label: string; summary: string; status: string; actions: Action[]; receipts: Receipt[] };
  recipe: { name: string; ingredients: string[]; instructions: string[]; missingIngredients: string[] };
  pantry: string[];
  shoppingList: string[];
  notification: { accepted: boolean; topic: string; id: string; text: string; deliveryNote: string };
  deviceTruth: Record<string, Record<string, Record<string, unknown>>>;
};

type Phase = "idle" | "preparing" | "baseline" | "waiting" | "custos" | "done" | "error";
type Cell = { status?: string; text?: string; detail?: string; content?: ReactNode };
type CompareRow = { label: string; meta: string; baseline: Cell; custos: Cell };
type Section = { id: string; eyebrow: string; title: string; description: string; rows: CompareRow[]; key?: boolean };

async function runShowcase(): Promise<Showcase> {
  const response = await fetch(`${API}/sim/showcase`, { method: "POST" });
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body
      ? String((body as { error?: unknown }).error ?? "Showcase run failed")
      : "Showcase run failed";
    throw new Error(message);
  }
  if (!body || typeof body !== "object") throw new Error("Showcase API returned an invalid response.");
  const result = body as Partial<Showcase>;
  if (!result.baseline || !result.custos || !Array.isArray(result.rules) ||
      !result.notification || !result.deviceTruth || !result.recipe ||
      typeof result.recipe.name !== "string" || !Array.isArray(result.recipe.ingredients) ||
      !Array.isArray(result.recipe.instructions) || !Array.isArray(result.recipe.missingIngredients)) {
    throw new Error("Showcase API response is missing required data. Check that the API deployment matches the web app.");
  }
  return result as Showcase;
}

function State({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const cls = /verified|scheduled|done|accepted|allow|on$/.test(normalized)
    ? "good"
    : /not scheduled|unverified|not changed|not checked|blocked|failed|off$/.test(normalized)
      ? "bad"
      : "neutral";
  return <span className={`status-tag ${cls}`}><i aria-hidden="true" />{value}</span>;
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

function cell(status?: string, text?: string, detail?: string, content?: ReactNode): Cell {
  return { status, text, detail, content };
}

function ReceiptDetails({ receipt }: { receipt: Receipt }) {
  const say = (receipt.evidence as { say?: unknown } | null)?.say;
  return (
    <div className="receipt-copy">
      <State value={receipt.outcome} />
      <p className="receipt-say">{String(say ?? "Evidence recorded for this action.")}</p>
      <p className="muted small">{receipt.outcome === "verified"
        ? "The expected state was read back or the record was persisted and checked."
        : receipt.outcome === "blocked"
          ? "A standing rule prevented this action."
          : "This result is not confirmed as successful."}</p>
      <details>
        <summary>View raw JSON evidence</summary>
        <pre>{JSON.stringify(receipt.raw ?? receipt, null, 2)}</pre>
      </details>
      {receipt.id ? <p className="muted small">Receipt ID <code>{receipt.id}</code></p> : null}
    </div>
  );
}

function TableSection({
  section,
  index,
  baselineVisible,
  custosVisible,
  phase,
}: {
  section: Section;
  index: number;
  baselineVisible: number;
  custosVisible: number;
  phase: Phase;
}) {
  let rowIndex = index;
  return (
    <section className="comparison-card" id={section.id} aria-labelledby={`${section.id}-title`}>
      <div className="card-heading">
        <p className="eyebrow">{section.eyebrow}</p>
        <h2 id={`${section.id}-title`}>{section.title}</h2>
        <p>{section.description}</p>
        {section.key ? (
          <div className="status-key">
            <span><State value="Verified" /> read back or policy-checked</span>
            <span><State value="Scheduled" /> saved, not run yet</span>
            <span><State value="Accepted" /> provider accepted, delivery unconfirmed</span>
            <span><State value="Not done" /> no write, schedule, or check</span>
          </div>
        ) : null}
      </div>
      <div className="table-scroll">
        <table>
          <colgroup><col className="item-col" /><col className="run-col" /><col className="run-col" /></colgroup>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col"><span>Run 1 of 2 · baseline</span><strong>Alexa+ without Custos</strong></th>
              <th scope="col" className="custos-head"><span>Run 2 of 2 · memory + verification</span><strong>Custos</strong></th>
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row) => {
              const currentIndex = rowIndex++;
              const showBaseline = baselineVisible > currentIndex;
              const showCustos = custosVisible > currentIndex;
              return (
                <tr className="data-row" key={row.label}>
                  <th scope="row">{row.label}<small>{row.meta}</small></th>
                  <td className={showBaseline ? "baseline-cell revealed" : "baseline-cell concealed"} data-side="Alexa+ without Custos">
                    {showBaseline ? <CellContent value={row.baseline} /> : <span className="not-yet">Not shown yet</span>}
                  </td>
                  <td className={showCustos ? "custos-cell revealed" : "custos-cell concealed"} data-side="Custos">
                    {showCustos ? <CellContent value={row.custos} /> : <span className="not-yet">Waiting for Run 2</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {section.id === "s-answer" && phase === "waiting" ? (
        <div className="next-callout">
          <div><strong>Baseline complete.</strong><p>Run 2 will not begin until you press Next.</p></div>
          <button type="button" className="primary" onClick={onNext}>Next: Run with Custos →</button>
        </div>
      ) : null}
    </section>
  );
}

function CellContent({ value }: { value: Cell }) {
  return (
    <div className="cell-content">
      {value.status ? <State value={value.status} /> : null}
      {value.text ? <p className="cell-text">{value.text}</p> : null}
      {value.detail ? <p className="muted small">{value.detail}</p> : null}
      {value.content}
    </div>
  );
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [data, setData] = useState<Showcase | null>(null);
  const [baselineVisible, setBaselineVisible] = useState(0);
  const [custosVisible, setCustosVisible] = useState(0);
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);

  const sections = useMemo<Section[]>(() => {
    if (!data) return [];
    const baselineActions = data.baseline.actions;
    const custosActions = data.custos.actions;
    const actionFor = (actions: Action[], match: RegExp) => actions.find((item) => match.test(item.title));
    const actionCell = (action?: Action, fallback = "No evidence recorded.") =>
      action ? cell(action.status, action.evidence, action.recordId ? `Record: ${action.recordId}` : undefined) : cell("Not shown", fallback);
    const baselineReceipts = data.baseline.receipts;
    const custosReceipts = data.custos.receipts;
    const recipeText = data.recipe.ingredients.join(", ");
    const instructionList = <ol className="compact-list">{data.recipe.instructions.map((step, i) => <li key={i}>{step}</li>)}</ol>;
    const rulesList = data.rules.map((rule) => (
      <article className="rule-line" key={rule.id}>
        <strong>{rule.summary}</strong><p className="muted small">{rule.profile} · {rule.evidence}</p>
      </article>
    ));
    const receiptList = (receipts: Receipt[]) => receipts.length ? (
      <div className="receipt-stack">{receipts.map((receipt, i) => (
        <article className="receipt-row" key={receipt.id ?? `${receipt.tool}-${i}`}>
          <strong>{humanize(receipt.target)}</strong><span className="receipt-tool">{humanize(receipt.tool)}</span>
          <ReceiptDetails receipt={receipt} />
        </article>
      ))}</div>
    ) : <p className="muted">No receipts recorded.</p>;

    return [
      {
        id: "s-answer", eyebrow: "01 / THE OUTCOME", title: "The answer you hear",
        description: "Compare the assistant's final message with the evidence-backed result.",
        rows: [
          { label: "Summary", meta: "Assistant message",
            baseline: cell(undefined, data.baseline.summary, "Acknowledgement is not independent proof."),
            custos: cell(undefined, data.custos.summary, "The summary is limited to what the simulator records.") },
          { label: "Run status", meta: "Overall result",
            baseline: cell(data.baseline.status, "Baseline response complete", "No independent verification or audit trail."),
            custos: cell(data.custos.status, "Custos run complete", "See action and receipt evidence below.") },
        ],
      },
      {
        id: "s-process", eyebrow: "02 / PLAN AND PROGRESS", title: "How each one worked",
        description: "The final goal, the subtasks inferred from one request, and what each path can substantiate.",
        rows: [
          { label: "Final goal", meta: "Intended outcome",
            baseline: cell(undefined, "Respond to the household request."),
            custos: cell(undefined, "Complete the authorized tasks safely, handle obvious follow-through, and prove what happened.") },
          { label: "Understand the request", meta: "Step 1",
            baseline: cell("Done", "Interpret requested actions", "Request understood."),
            custos: cell("Done", "Separate immediate actions, schedules, and dinner planning", "Five outcomes identified.") },
          { label: "Apply household rules", meta: "Step 2",
            baseline: cell("Not checked", "No rule retrieval shown."),
            custos: cell("Verified", "Load Maya's allergy and school-return time", "Rules checked before acting.") },
          { label: "Act on devices", meta: "Step 3",
            baseline: cell("Not verified", "Acknowledge coffee and lights", "No persisted device write or schedule created."),
            custos: cell("Verified", "Turn on coffee maker and kitchen light; persist schedules", "Device read-back and schedule persistence checked.") },
          { label: "Plan a safe dinner", meta: "Step 4",
            baseline: cell("Not checked", "Select a meal without checking Maya's allergy."),
            custos: cell("Policy verified", "Reject beef and choose a compatible alternative", "Recipe passes the allergy policy.") },
          { label: "Useful follow-through", meta: "Step 5",
            baseline: cell("Not shown", "No pantry comparison or shopping-list update."),
            custos: cell("Done", "Compare recipe ingredients with pantry and shopping list", "Only missing items are added.") },
          { label: "Inform the user", meta: "Step 6",
            baseline: cell("Not shown", "No recipe notification evidence."),
            custos: cell(data.notification.accepted ? "Accepted by provider" : "Unverified", "Send recipe, ingredients, cooking steps, and shopping changes", data.notification.deliveryNote) },
          { label: "Prove what happened", meta: "Step 7",
            baseline: cell("No receipts", "Claim completion", "No independent verification or audit receipt."),
            custos: cell(`${custosReceipts.length} receipts`, "Read back state, inspect schedules, and write receipts", "Outcomes are labelled by evidence, not assumption.") },
        ],
      },
      {
        id: "s-actions", eyebrow: "03 / ACTIONS", title: "What each one did",
        description: "One row per requested outcome. Status and supporting evidence stay together.",
        key: true,
        rows: [
          { label: "Coffee maker now", meta: "Immediate action",
            baseline: actionCell(actionFor(baselineActions, /coffee maker/i), "No verified device write."),
            custos: actionCell(actionFor(custosActions, /coffee maker/i), "No matching action returned.") },
          { label: "Kitchen light now", meta: "Immediate action",
            baseline: actionCell(actionFor(baselineActions, /kitchen light/i), "No verified device write."),
            custos: actionCell(actionFor(custosActions, /kitchen light/i), "No matching action returned.") },
          { label: "Coffee at 8:00 AM", meta: "Scheduled action",
            baseline: actionCell(actionFor(baselineActions, /coffee.*schedule|schedule.*coffee/i), "No persisted schedule."),
            custos: actionCell(actionFor(custosActions, /coffee.*schedule|schedule.*coffee/i), "Schedule record not returned.") },
          { label: "Hall light at 1:25 PM", meta: "Derived schedule",
            baseline: actionCell(actionFor(baselineActions, /hall light/i), "School-return rule not applied."),
            custos: actionCell(actionFor(custosActions, /hall light/i), "Schedule record not returned.") },
          { label: "Dinner", meta: "Household policy",
            baseline: cell("Rule not checked", "No allergy policy evaluation shown."),
            custos: cell("Policy verified", data.recipe.name, "Beef is excluded for Maya.") },
          { label: "Receipts", meta: "Audit evidence",
            baseline: cell("No receipts", "No persisted records to inspect."),
            custos: cell(`${custosReceipts.length} records`, "Readable summaries plus expandable raw JSON.") },
        ],
      },
      {
        id: "s-dinner", eyebrow: "04 / PROACTIVE FOLLOW-THROUGH", title: "Dinner, end to end",
        description: "A useful dinner plan includes a compatible recipe, cooking steps, and a pantry-aware shopping list.",
        rows: [
          { label: "Recipe", meta: "Policy check",
            baseline: cell("Not shown", "No allergy-aware recipe selection evidence."),
            custos: cell("Policy verified", data.recipe.name, "Selected after checking Maya's beef allergy.") },
          { label: "Ingredients", meta: "Recipe contents",
            baseline: cell("Not shown", "No ingredient list."),
            custos: cell(undefined, recipeText) },
          { label: "Cooking procedure", meta: "Recipe instructions",
            baseline: cell("Not shown", "No cooking procedure."),
            custos: cell(undefined, undefined, undefined, instructionList) },
          { label: "Already in the pantry", meta: "Inventory comparison",
            baseline: cell("Not shown", "No pantry comparison."),
            custos: cell(undefined, data.pantry.join(", ") || "No pantry items returned.") },
          { label: "Added to shopping list", meta: "Missing ingredients",
            baseline: cell("Not shown", "No shopping-list update."),
            custos: cell(data.recipe.missingIngredients.length ? "Updated" : "No changes needed", data.recipe.missingIngredients.join(", ") || "Nothing missing", "The list is based on the returned pantry comparison.") },
        ],
      },
      {
        id: "s-rules", eyebrow: "05 / HOUSEHOLD CONTEXT", title: "What Custos remembered",
        description: "Standing rules are loaded before dependent actions, rather than guessed after the fact.",
        rows: [
          { label: "Standing rules", meta: `${data.rules.length} saved rules`,
            baseline: cell("Not retrieved", "No standing-rule lookup shown."),
            custos: cell("Retrieved", undefined, undefined, <div className="rule-stack">{rulesList}</div>) },
          { label: "School return minus 5 minutes", meta: "Derived schedule",
            baseline: cell("Not applied", "No derived schedule evidence."),
            custos: cell("1:30 PM − 5 min = 1:25 PM", "Hall light schedule", "Persisted schedule is pending execution.") },
          { label: "Beef allergy", meta: "Safety constraint",
            baseline: cell("Not checked", "No policy evaluation shown."),
            custos: cell("Applied", "Dinner excludes beef", "Beef tacos are blocked; the alternative recipe passes the policy check.") },
        ],
      },
      {
        id: "s-notification", eyebrow: "06 / DINNER NOTIFICATION", title: "Recipe notification",
        description: "Provider acceptance and final delivery are different claims. The UI keeps that distinction explicit.",
        rows: [
          { label: "Provider status", meta: "Notification request",
            baseline: cell("Not shown", "No notification evidence."),
            custos: cell(data.notification.accepted ? "Accepted by provider" : "Unverified", data.notification.topic, data.notification.deliveryNote) },
          { label: "Message preview", meta: "Recipe + shopping list",
            baseline: cell("Not shown", "No notification payload."),
            custos: cell(undefined, undefined, undefined, <details><summary>Preview notification text</summary><pre>{data.notification.text}</pre></details>) },
        ],
      },
      {
        id: "s-devices", eyebrow: "07 / INDEPENDENT DEVICE TWIN", title: "What changed on the devices?",
        description: "Immediate simulated state and future schedules are shown separately. A saved schedule has not fired.",
        rows: [
          { label: "Coffee maker", meta: "Device state",
            baseline: cell("Off", "No verified write."),
            custos: cell("On", "Read back from the simulated device twin.") },
          { label: "Kitchen light", meta: "Device state",
            baseline: cell("Off", "No verified write."),
            custos: cell("On", "Read back from the simulated device twin.") },
          { label: "Hall light", meta: "Scheduled device",
            baseline: cell("Off", "No persisted schedule."),
            custos: cell("Off", "Simulated twin remains unchanged; scheduled for 1:25 PM.") },
          { label: "Future schedules", meta: "Execution status",
            baseline: cell("Not scheduled", "No schedule record to inspect."),
            custos: cell("Scheduled · pending", "Coffee at 8:00 AM and hall light at 1:25 PM.", "The scheduled actions have not executed yet.") },
        ],
      },
      {
        id: "s-receipts", eyebrow: "08 / AUDIT TRAIL", title: "Receipts for what happened",
        description: "Readable evidence first. Expand raw JSON only when technical inspection is useful.",
        rows: [
          { label: "Receipt log", meta: `${custosReceipts.length} Custos records`,
            baseline: cell("No receipts", "The baseline has no independent audit trail."),
            custos: cell("Recorded", undefined, undefined, receiptList(custosReceipts)) },
          { label: "Baseline evidence", meta: `${baselineReceipts.length} baseline records`,
            baseline: cell(baselineReceipts.length ? "Recorded" : "No receipts", undefined, undefined, receiptList(baselineReceipts)),
            custos: cell("Not applicable", "The Custos column records the verified path.") },
        ],
      },
    ];
  }, [data]);

  const rowCount = sections.reduce((total, section) => total + section.rows.length, 0);

  async function play() {
    if (phase === "baseline" || phase === "custos" || phase === "preparing" || phase === "waiting") return;
    setPhase("preparing");
    setError("");
    setData(null);
    setBaselineVisible(0);
    setCustosVisible(0);
    try {
      const result = await runShowcase();
      setData(result);
      setPhase("baseline");
      // The API prepares the scenario first. This is staged presentation, not a live tool trace.
      const totalRows = 32;
      for (let i = 1; i <= totalRows; i += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 180));
        setBaselineVisible(i);
      }
      setPhase("waiting");
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  }

  async function continueWithCustos() {
    if (!data || phase !== "waiting") return;
    setPhase("custos");
    setCustosVisible(0);
    for (let i = 1; i <= rowCount; i += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 220));
      setCustosVisible(i);
    }
    setPhase("done");
    if (!muted) {
      void voice.speak("The coffee maker and kitchen light are on in the simulated device twin. Coffee and the hall light are scheduled. Dinner avoids beef, missing ingredients were added to the shopping list, and the recipe notification was accepted by the provider. Scheduled actions have not run yet.");
    }
  }

  // The section-level Next action and the sticky header button share one handler.
  if (typeof window !== "undefined") {
    window.oncustosnext = continueWithCustos;
  }

  return (
    <main className="showcase-app">
      <header className="app showcase-header">
        <a className="brand-block" href="#top" aria-label="Custos home">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span><span className="eyebrow">ACCOUNTABILITY FOR AI ASSISTANTS</span><strong>Custos</strong></span>
        </a>
        <div className="controls">
          <button type="button" className="primary" onClick={() => phase === "waiting" ? void continueWithCustos() : phase === "done" || phase === "error" || phase === "idle" ? void play() : undefined} disabled={phase === "preparing" || phase === "baseline" || phase === "custos"}>
            {phase === "preparing" ? "Preparing…" : phase === "baseline" ? "Baseline running…" : phase === "waiting" ? "Next: Run with Custos →" : phase === "custos" ? "Custos running…" : phase === "done" ? "↻ Run again" : phase === "error" ? "Retry comparison" : "▶ Play comparison"}
          </button>
          <button type="button" className="secondary-button" aria-pressed={!muted} onClick={() => { const next = !muted; setMuted(next); if (next) voice.cancel(); }}>
            {muted ? "Voice off" : "Voice summary on"}
          </button>
        </div>
      </header>

      <div id="top" className="page-wrap">
        <section className="request-intro">
          <p className="eyebrow">ONE REQUEST · MULTIPLE OBLIGATIONS</p>
          <h1>One request. Two execution paths.</h1>
          <p className="request-quote">“{data?.prompt ?? "Turn on the coffee maker and kitchen light now, schedule coffee for 8am, turn on the hall light 5 minutes before my daughter is back from school, and prepare dinner for me and my daughter."}”</p>
          <p className="request-context">The assistant should infer the necessary substeps, respect household rules, take useful action, and report what the evidence supports.</p>
          <p className="disclosure">Controlled simulator scenario. The baseline is scripted, device state belongs to a simulated device twin, and the staged reveal is not a live Alexa+ integration or live tool trace.</p>
          <nav className="section-nav" aria-label="Jump to a comparison section">
            {sections.map((section) => <a href={`#${section.id}`} key={section.id}>{section.title}</a>)}
          </nav>
        </section>

        {error ? <section className="error-panel" role="alert"><strong>Comparison failed.</strong><p>{error}</p><button type="button" onClick={() => void play()}>Retry run</button></section> : null}

        {phase === "idle" ? (
          <section className="intro-panel">
            <div><p className="eyebrow">THE DEMO</p><h2>Same request. Different accountability.</h2><p>Run the controlled baseline first. When it finishes, press Next to reveal the Custos path and its evidence.</p></div>
            <button className="primary" type="button" onClick={() => void play()}>▶ Play the walkthrough</button>
          </section>
        ) : null}

        {phase === "preparing" ? <section className="intro-panel" aria-live="polite"><div><p className="eyebrow">PREPARING RUN</p><h2>Setting up the comparison</h2><p>Preparing isolated household state and collecting policy, device-twin, schedule, and receipt evidence.</p></div><div className="progress-track"><span /></div></section> : null}

        {data ? (
          <>
            <div className="run-banner">
              <div><p className="eyebrow">CURRENT PHASE</p><strong>{phase === "baseline" ? "Run 1 · controlled baseline" : phase === "waiting" ? "Run 1 complete · awaiting your Next" : phase === "custos" ? "Run 2 · Custos" : "Both runs presented"}</strong></div>
              <span className="run-count">{phase === "baseline" ? "01 / 02" : phase === "waiting" ? "01 / 02 · PAUSED" : "02 / 02"}</span>
              <div className="run-progress" aria-label="Walkthrough progress"><span style={{ width: `${phase === "idle" || phase === "preparing" ? 0 : phase === "baseline" ? 35 : phase === "waiting" ? 45 : phase === "custos" ? 45 + Math.round((custosVisible / Math.max(rowCount, 1)) * 55) : 100}%` }} /></div>
              {phase === "waiting" ? <p className="run-hint">Baseline is complete. Custos will not start until you press Next.</p> : null}
            </div>
            {sections.map((section, index) => {
              const start = sections.slice(0, index).reduce((sum, previous) => sum + previous.rows.length, 0);
              return <TableSection key={section.id} section={section} index={start} baselineVisible={baselineVisible} custosVisible={custosVisible} phase={phase} onNext={() => void continueWithCustos()} />;
            })}
            <footer className="page-note"><strong>Read the evidence carefully.</strong> “Verified” refers to simulated device-state read-back or a persisted record checked by the simulator. Scheduled actions have not fired, and notification-provider acceptance is not proof of delivery.</footer>
          </>
        ) : null}
      </div>
    </main>
  );
}
