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
  const cls = /not scheduled|unverified|not verified|not changed|not checked|not retrieved|not applied|blocked|failed|no receipts|off$/.test(normalized)
    ? "bad"
    : /accepted by provider|^accepted$/.test(normalized)
      ? "partial"
      : /verified|scheduled|done|allow|on$|retrieved|applied|recorded/.test(normalized)
        ? "good"
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

function WorkflowPanel({
  title, subtitle, rows, side, visible, phase, onNext,
}: {
  title: string; subtitle: string; rows: CompareRow[];
  side: "baseline" | "custos"; visible: number; phase: Phase; onNext?: () => void;
}) {
  const active = side === "baseline" ? phase === "baseline" : phase === "custos";
  const complete = side === "baseline" ? ["waiting", "custos", "done"].includes(phase) : phase === "done";
  return (
    <section className={"agent-panel " + (side === "custos" ? "agent-panel-custos" : "agent-panel-baseline")} aria-label={title}>
      <header className="agent-panel-header">
        <div className="agent-identity">
          <span className={"agent-avatar " + (side === "custos" ? "custos-avatar" : "")}>{side === "custos" ? "C" : "A"}</span>
          <div><p className="eyebrow">{side === "custos" ? "MEMORY + TOOLS + VERIFICATION" : "CONTROLLED BASELINE"}</p><h2>{title}</h2><p className="agent-subtitle">{subtitle}</p></div>
        </div>
        <span className={"agent-run-state " + (complete ? "state-complete" : active ? "state-running" : "state-pending")}><i aria-hidden="true" />{complete ? "Completed" : active ? "Working" : "Waiting"}</span>
      </header>
      <div className="agent-task-list">
        {rows.map((row, index) => {
          const isDone = complete || index < visible;
          const isRunning = active && index === visible && visible < rows.length;
          const value = side === "baseline" ? row.baseline : row.custos;
          return (
            <article className={"agent-task " + (isDone ? "task-done" : isRunning ? "task-running" : "task-pending")} key={row.label}>
              <div className="task-rail"><span className="task-marker" aria-hidden="true">{isDone ? "✓" : isRunning ? <span className="spinner" /> : String(index + 1).padStart(2, "0")}</span>{index < rows.length - 1 ? <span className="task-connector" /> : null}</div>
              <div className="task-main">
                <div className="task-title-row"><h3>{row.label}</h3><span className="task-state">{isDone ? "Complete" : isRunning ? "Running" : "Queued"}</span></div>
                <p className="task-meta">{row.meta}</p>
                {isDone ? <div className="task-output"><CellContent value={value} /></div> : isRunning ? <p className="task-live-copy">{side === "custos" ? "Checking context, choosing the next action, and recording evidence…" : "Processing the request…"}</p> : null}
              </div>
            </article>
          );
        })}
      </div>
      {side === "baseline" && phase === "waiting" ? (
        <div className="agent-next"><div><strong>Baseline run complete</strong><p>Custos is paused until you explicitly start the second run.</p></div><button type="button" className="primary" onClick={onNext}>Run with Custos <span aria-hidden="true">→</span></button></div>
      ) : null}
    </section>
  );
}

function EvidenceSection({ section }: { section: Section }) {
  return (
    <details className="evidence-group" id={section.id}>
      <summary><span className="evidence-heading"><span className="eyebrow">{section.eyebrow}</span><strong>{section.title}</strong><small>{section.description}</small></span><span className="evidence-toggle">View evidence <span aria-hidden="true">＋</span></span></summary>
      <div className="evidence-rows">
        {section.rows.map((row) => (
          <article className="evidence-row" key={row.label}>
            <header><h3>{row.label}</h3><p>{row.meta}</p></header>
            <div className="evidence-side"><span className="evidence-side-label">Alexa+ without Custos</span><CellContent value={row.baseline} /></div>
            <div className="evidence-side evidence-side-custos"><span className="evidence-side-label">Custos</span><CellContent value={row.custos} /></div>
          </article>
        ))}
      </div>
    </details>
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
    const actionFor = (actions: Action[], match: RegExp, scheduled = false) => actions.find((item) => match.test(item.title) && (!scheduled || (!/not scheduled|unscheduled|not changed/i.test(item.status) && (/schedul/i.test(item.status) || Boolean(item.localTime)))));
    const actionCell = (action?: Action, fallback = "No evidence recorded.") =>
      action ? cell(action.status, action.evidence, action.recordId ? `Record: ${action.recordId}` : action.localTime ? `Scheduled for ${action.localTime}` : undefined) : cell("Not shown", fallback);
    const baselineReceipts = data.baseline.receipts;
    const custosReceipts = data.custos.receipts;
    const baselineTruth = data.deviceTruth.baseline ?? {};
    const custosTruth = data.deviceTruth.custos ?? {};
    const deviceCell = (truth: Record<string, Record<string, unknown>>, name: string) => {
      const power = String(truth[name]?.power ?? "unknown");
      return cell(power === "unknown" ? "Unverified" : power, power === "unknown" ? "No device state returned." : `Device twin power state: ${power}.`);
    };
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
            baseline: actionCell(actionFor(baselineActions, /coffee/i, true), "No persisted schedule."),
            custos: actionCell(actionFor(custosActions, /coffee/i, true), "Schedule record not returned.") },
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
            custos: cell("Derived schedule", "1:30 PM − 5 min = 1:25 PM", "Hall-light schedule persisted; execution is pending.") },
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
            baseline: deviceCell(baselineTruth, "coffee_maker"),
            custos: deviceCell(custosTruth, "coffee_maker") },
          { label: "Kitchen light", meta: "Device state",
            baseline: deviceCell(baselineTruth, "kitchen_light"),
            custos: deviceCell(custosTruth, "kitchen_light") },
          { label: "Hall light", meta: "Scheduled device",
            baseline: deviceCell(baselineTruth, "hall_light"),
            custos: cell(String(custosTruth.hall_light?.power ?? "unknown"), "Future schedule: 1:25 PM.", "The hall light state remains separate from its persisted schedule.") },
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

  const workflowRows = sections.find((section) => section.id === "s-process")?.rows ?? [];
  const evidenceSections = sections.filter((section) => section.id !== "s-process");
  const rowCount = workflowRows.length;

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
      const totalRows = 8;
      for (let i = 1; i <= totalRows; i += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 420));
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
      await new Promise((resolve) => window.setTimeout(resolve, 620));
      setCustosVisible(i);
    }
    setPhase("done");
    if (!muted) {
      void voice.speak("The coffee maker and kitchen light are on in the simulated device twin. Coffee and the hall light are scheduled. Dinner avoids beef, missing ingredients were added to the shopping list, and the recipe notification was accepted by the provider. Scheduled actions have not run yet.");
    }
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
            <section className="workflow-area" aria-label="Agent workflow">
              <div className="workflow-heading"><div><p className="eyebrow">AGENT WORKFLOW</p><h2>From request to verified outcome</h2><p>Follow each subtask as it moves from queued to running to complete.</p></div><span className="workflow-count">{phase === "done" ? rowCount + " / " + rowCount + " steps complete" : phase === "waiting" ? rowCount + " / " + rowCount + " baseline steps complete" : phase === "custos" ? custosVisible + " / " + rowCount + " Custos steps complete" : baselineVisible + " / " + rowCount + " steps complete"}</span></div>
              <div className="agent-grid">
                <WorkflowPanel title="Alexa+ without Custos" subtitle="Acknowledgement without a reliable evidence trail." rows={workflowRows} side="baseline" visible={baselineVisible} phase={phase} onNext={() => void continueWithCustos()} />
                {phase === "custos" || phase === "done" ? <WorkflowPanel title="Custos" subtitle="Retrieve rules, execute the plan, verify state, and keep receipts." rows={workflowRows} side="custos" visible={custosVisible} phase={phase} /> : phase === "waiting" ? <section className="agent-panel agent-panel-placeholder"><div className="placeholder-mark">C</div><p className="eyebrow">RUN 2 · CUSTOS</p><h2>Ready when you are</h2><p>The baseline is complete. Custos will start only after you press the button on the left.</p><span className="agent-run-state state-pending"><i aria-hidden="true" />Waiting for approval</span></section> : null}
              </div>
            </section>
            {phase === "done" ? <section className="evidence-area"><div className="workflow-heading"><div><p className="eyebrow">INSPECTABLE EVIDENCE</p><h2>What backs up the result</h2><p>Expand a section to compare actions, household rules, dinner follow-through, device state, and receipts.</p></div></div><div className="evidence-stack">{evidenceSections.map((section) => <EvidenceSection key={section.id} section={section} />)}</div></section> : null}
            <footer className="page-note"><strong>Read the evidence carefully.</strong> “Verified” refers to simulated device-state read-back or a persisted record checked by the simulator. Scheduled actions have not fired, and notification-provider acceptance is not proof of delivery.</footer>
          </>
        ) : null}
      </div>
    </main>
  );
}
