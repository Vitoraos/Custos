// Simulator agent: Strands Agent + McpClient over Streamable HTTP, OpenRouter.
// The agent sees ONLY the MCP tools + server instructions — same as real Alexa+.
// No ContextForge knowledge in the prompt.
import { Agent, McpClient } from "@strands-agents/sdk";
import { OpenAIModel } from "@strands-agents/sdk/models/openai";
import { PLANNER_SYSTEM_PROMPT } from "../../src/core/assistantPrompt.js";

export const SYSTEM_PROMPT = PLANNER_SYSTEM_PROMPT;

export type Column = "forge" | "baseline";
export interface SimEvent {
  col: Column;
  type:
    | "token"
    | "tool_call"
    | "tool_result"
    | "final"
    | "error"
    | "column_start"
    | "column_done";
  text?: string;
  name?: string;
  args?: unknown;
  outcome?: string;
  say?: string;
}

function model() {
  return new OpenAIModel({
    api: "chat",
    apiKey: process.env.OPENROUTER_API_KEY,
    clientConfig: { baseURL: "https://openrouter.ai/api/v1" },
    modelId: process.env.OPENROUTER_MODEL ?? "openrouter/free",
  });
}

interface ColumnAgent {
  ready: Promise<Agent>;
}
const agents = new Map<string, ColumnAgent>();

async function columnAgent(
  mcpUrl: string,
  key: string,
  guestId: string,
  col: Column,
): Promise<Agent> {
  const id = `${guestId}:${col}`;
  const hit = agents.get(id);
  if (hit) return hit.ready;
  const ready = (async () => {
    const client = new McpClient({
      url: mcpUrl,
      headers: { Authorization: `Bearer ${key}` },
    });
    const tools = await client.listTools({ prefix: "" });
    return new Agent({ model: model(), tools, systemPrompt: SYSTEM_PROMPT });
  })();
  agents.set(id, { ready });
  return ready;
}

// Agent-boundary recipe gate.
// The SDK's McpTool drops structuredContent, so the tool's `say` text is the
// only authoritative signal that survives at this layer. find_recipe's `say`
// shapes (src/tools/reads.ts):
//   ok:      "<name>. Checked against your rules."
//   blocked: "Every candidate conflicts with a standing rule. <reason>"
// The model has been observed confabulating a blocked recipe ("Jiggs Dinner")
// into its final answer, so we never surface a recipe the tool did not pick.
export interface RecipeOutcome {
  blocked: boolean;
  picked?: string;
  say: string;
}

const RECIPE_MARKER = ". Checked against your rules.";
const RECIPE_BLOCKED = "Every candidate conflicts";

/** Pure parse of a find_recipe `say` into the tool's authoritative outcome. */
export function recipeOutcome(say: string): RecipeOutcome | null {
  const s = say.trim();
  if (!s) return null;
  if (s.startsWith(RECIPE_BLOCKED)) return { blocked: true, say: s };
  const i = s.indexOf(RECIPE_MARKER);
  const picked = (i >= 0 ? s.slice(0, i) : s).trim();
  return { blocked: false, picked: picked || undefined, say: s };
}

/** Pure gate: the surfaced recipe must equal the tool's `picked`, never free-text. */
export function gateFinal(
  modelText: string,
  recipe?: RecipeOutcome | null,
): string {
  if (!recipe) return modelText;
  if (recipe.blocked) return recipe.say;
  if (recipe.picked && modelText.includes(recipe.picked)) return modelText;
  return recipe.say;
}

function deltaText(ev: { event?: unknown }): string {
  // Defensive walk of ModelStreamEvent shapes -> text delta, else "".
  const stack: unknown[] = [ev.event];
  while (stack.length > 0) {
    const cur = stack.pop() as Record<string, unknown> | null;
    if (!cur || typeof cur !== "object") continue;
    if (
      typeof cur.text === "string" &&
      (cur.type === undefined || /delta/i.test(String(cur.type)))
    ) {
      // Only bare text deltas; completed blocks come via final AgentResult.
      return cur.text as string;
    }
    const d = cur.delta as Record<string, unknown> | undefined;
    if (d && typeof d.text === "string") return d.text as string;
    for (const v of Object.values(cur)) {
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return "";
}

function toolResultOutcome(result: unknown): {
  outcome?: string;
  say?: string;
  text: string;
} {
  // McpTool maps MCP content[] to SDK blocks and DROPS structuredContent —
  // at the agent layer only text survives (our `say`). Outcome is therefore
  // unavailable here; L2 scores finals + ground truth instead.
  try {
    const r = result as {
      content?: { type?: string; text?: string }[];
      structuredContent?: { outcome?: string; say?: string };
    };
    if (r?.structuredContent?.outcome) {
      return {
        outcome: r.structuredContent.outcome,
        say: r.structuredContent.say,
        text: JSON.stringify(r.structuredContent).slice(0, 500),
      };
    }
    const text = (r?.content ?? [])
      .map((b) => (typeof b?.text === "string" ? b.text : ""))
      .join(" ")
      .slice(0, 500);
    try {
      const env = JSON.parse(text) as { outcome?: string; say?: string };
      if (env.outcome) return { outcome: env.outcome, say: env.say, text };
    } catch {
      // Not an envelope — plain text (say-only, or baseline ack).
    }
    return { say: text || undefined, text };
  } catch {
    return { text: "" };
  }
}

export async function* runColumn(
  mcpUrl: string,
  key: string,
  guestId: string,
  col: Column,
  text: string,
): AsyncGenerator<SimEvent, void, void> {
  let agent: Agent;
  try {
    agent = await columnAgent(mcpUrl, key, guestId, col);
  } catch (e) {
    yield {
      col,
      type: "error",
      text: `agent setup failed: ${(e as Error).message}`,
    };
    return;
  }
  // Last authoritative recipe outcome this turn (see gateFinal above).
  let recipe: RecipeOutcome | null = null;
  try {
    for await (const ev of agent.stream(text) as AsyncGenerator<
      { type?: string } & Record<string, unknown>,
      unknown,
      void
    >) {
      const t = (ev as { type?: string }).type ?? "";
      if (t === "modelStreamUpdateEvent") {
        const tok = deltaText(ev as { event?: unknown });
        if (tok) yield { col, type: "token", text: tok };
      } else if (t === "beforeToolCallEvent") {
        const use = (ev as { toolUse?: { name?: string; input?: unknown } })
          .toolUse;
        yield {
          col,
          type: "tool_call",
          name: use?.name ?? "?",
          args: use?.input,
        };
      } else if (t === "toolResultEvent" || t === "afterToolCallEvent") {
        const raw = (ev as { result?: unknown }).result;
        const { outcome, say, text: full } = toolResultOutcome(raw);
        const use = (ev as { toolUse?: { name?: string } }).toolUse;
        if (use?.name === "find_recipe") {
          const parsed = recipeOutcome(say ?? full);
          if (parsed) recipe = parsed;
        }
        yield {
          col,
          type: "tool_result",
          name: use?.name,
          outcome,
          say,
          text: full,
        };
      } else if (t === "agentResultEvent") {
        const res = (ev as { result?: { toString(): string } }).result;
        const text = String(res?.toString?.() ?? res ?? "");
        yield { col, type: "final", text: gateFinal(text, recipe) };
      }
    }
  } catch (e) {
    yield { col, type: "error", text: (e as Error).message.slice(0, 300) };
  }
}

export async function* runAB(
  mcpUrl: string,
  keys: { forgeKey: string; baselineKey: string },
  guestId: string,
  text: string,
  cols: ("forge" | "baseline")[] = ["baseline", "forge"],
): AsyncGenerator<SimEvent, void, void> {
  // Sequential (not parallel): free-tier rate limits punish parallel model calls.
  // Baseline first: the naive expectation streams to completion, then Custos
  // answers it. Boundary events let the UI stage the columns.
  if (cols.includes("baseline")) {
    yield { col: "baseline", type: "column_start" };
    yield* runColumn(mcpUrl, keys.baselineKey, guestId, "baseline", text);
    yield { col: "baseline", type: "column_done" };
  }
  if (cols.includes("forge")) {
    yield { col: "forge", type: "column_start" };
    yield* runColumn(mcpUrl, keys.forgeKey, guestId, "forge", text);
    yield { col: "forge", type: "column_done" };
  }
}
