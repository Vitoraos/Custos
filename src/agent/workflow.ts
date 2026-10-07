// src/agent/workflow.ts — Plan → Execute → Verify pipeline (spec §6.2 v2)
// Planner and verifier are Strands agents. The executor is plain code.
import { z } from "zod";
import { runWithFallback } from "./providers.js";
import { TOOLS } from "./tools.js";

const Plan = z.array(
  z.object({
    order: z.number(),
    description: z.string(),
    required_tool: z.string().nullable(),
    expected_input: z.record(z.string(), z.any()).default({}),
  }),
);

const Verdict = z.object({
  overall_status: z.enum(["completed", "failed"]),
  gaps_found: z.array(z.string()).default([]),
  retry_suggestions: z.array(z.string()).default([]),
  summary: z.string(),
});

const PLANNER = (
  maxSteps: number,
) => `You are a task planner for an Alexa+ assistant.
You receive JSON with: task, preferences (hard constraints), instructions, context, tools (names).
Break the task into at most ${maxSteps} ordered steps. Respect ALL preferences.
Reply with ONLY a JSON array, no markdown. Each item:
{"order":1,"description":"...","required_tool":"<tool name or null>","expected_input":{...}}`;

const VERIFIER = `You are a verifier for an Alexa+ assistant.
You receive JSON with: task, plan, trace (what each step returned) and rule_violations.
Decide if the task was completed and every preference respected.
Reply with ONLY JSON: {"overall_status":"completed|failed","gaps_found":[],"retry_suggestions":[],"summary":"one short sentence"}`;

const parse = <T>(schema: z.ZodType<T>, text: string): T =>
  schema.parse(JSON.parse(text.replace(/```json|```/g, "").trim()));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type Step = z.infer<typeof Plan>[number];
export type Trace = {
  step: number;
  tool: string | null;
  attempt: number;
  status: "success" | "error";
  output: unknown;
};

// Deterministic rules first: cheap, and they make "verifier catches a violation" reliable on free models.
export function checkPreferences(
  prefs: { key: string; value: string }[],
  trace: Trace[],
) {
  const diet = prefs.find((p) => p.key === "diet")?.value;
  const allergies = (prefs.find((p) => p.key === "allergies")?.value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const violations: { step: number; reason: string; exclude: string[] }[] = [];
  for (const t of trace) {
    if (t.tool !== "find_recipe" || t.status !== "success") continue;
    let r: any;
    try {
      r = JSON.parse(String(t.output));
    } catch {
      continue;
    }
    const contains: string[] = r.contains ?? [];
    if (
      diet === "vegan" &&
      contains.some((c) => ["meat", "dairy", "eggs", "fish"].includes(c))
    )
      violations.push({
        step: t.step,
        reason: `${r.recipe_name} contains ${contains.join(", ")}; violates diet=vegan`,
        exclude: ["meat", "dairy", "eggs", "fish"],
      });
    for (const a of allergies)
      if (contains.includes(a))
        violations.push({
          step: t.step,
          reason: `${r.recipe_name} contains ${a}`,
          exclude: [a],
        });
  }
  return violations;
}

async function runStep(
  step: Step,
  maxRetries: number,
  extra: Record<string, unknown> = {},
): Promise<Trace[]> {
  const out: Trace[] = [];
  if (!step.required_tool) {
    return [
      {
        step: step.order,
        tool: null,
        attempt: 1,
        status: "success",
        output: step.description,
      },
    ];
  }
  const tool = TOOLS[step.required_tool];
  if (!tool) {
    return [
      {
        step: step.order,
        tool: step.required_tool,
        attempt: 1,
        status: "error",
        output: `unknown tool: ${step.required_tool}`,
      },
    ];
  }
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const input = tool.schema.parse({ ...step.expected_input, ...extra });
      out.push({
        step: step.order,
        tool: step.required_tool,
        attempt,
        status: "success",
        output: await tool.run(input),
      });
      return out;
    } catch (e) {
      out.push({
        step: step.order,
        tool: step.required_tool,
        attempt,
        status: "error",
        output: (e as Error).message,
      });
      await sleep(800 * attempt);
    }
  }
  return out;
}

export async function runWorkflow(ctx: {
  task: string;
  preferences: { key: string; value: string }[];
  instructions: string[];
  context: string[];
  maxSteps?: number;
  maxRetries?: number;
}) {
  const t0 = Date.now();
  const maxSteps = ctx.maxSteps ?? 10;
  const maxRetries = ctx.maxRetries ?? 2;
  const modelEvents: string[] = [];

  // 1. PLANNER (LLM call #1)
  const planRes = await runWithFallback(
    PLANNER(maxSteps),
    JSON.stringify({ ...ctx, tools: Object.keys(TOOLS) }),
  );
  modelEvents.push(...planRes.fallbacks);
  const plan = parse(Plan, planRes.text).slice(0, maxSteps);

  // 2. EXECUTOR (no LLM)
  const trace: Trace[] = [];
  for (const step of plan) trace.push(...(await runStep(step, maxRetries)));

  // 3. VERIFIER: rules, then one remediation pass if needed, then LLM
  let violations = checkPreferences(ctx.preferences, trace);
  if (violations.length) {
    for (const v of violations) {
      const step = plan.find((s) => s.order === v.step)!;
      trace.push(...(await runStep(step, maxRetries, { exclude: v.exclude })));
    }
    // keep only the latest successful attempt per step for the final check
    const latest = new Map(
      trace.filter((t) => t.status === "success").map((t) => [t.step, t]),
    );
    violations = checkPreferences(ctx.preferences, [...latest.values()]);
  }
  const verdictRes = await runWithFallback(
    VERIFIER,
    JSON.stringify({
      task: ctx.task,
      plan,
      trace,
      rule_violations: violations,
    }),
  );
  modelEvents.push(...verdictRes.fallbacks);
  const verdict = parse(Verdict, verdictRes.text);

  return {
    status: violations.length ? "failed" : verdict.overall_status,
    steps: trace,
    verdict,
    modelEvents,
    durationMs: Date.now() - t0,
  };
}
