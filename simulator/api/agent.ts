// Simulator agent: Strands Agent + McpClient over Streamable HTTP, OpenRouter.
// The agent sees ONLY the MCP tools + server instructions — same as real Alexa+.
// No ContextForge knowledge in the prompt.
import { Agent, McpClient } from "@strands-agents/sdk";
import { OpenAIModel } from "@strands-agents/sdk/models/openai";

export const SYSTEM_PROMPT =
  "You are a voice assistant on a smart speaker. Reply in at most two short sentences of plain speech: no markdown, no lists. Use tools to take actions. Report what the tools tell you.";

export type Column = "forge" | "baseline";
export interface SimEvent {
  col: Column;
  type: "token" | "tool_call" | "tool_result" | "final" | "error";
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

async function columnAgent(mcpUrl: string, key: string, guestId: string, col: Column): Promise<Agent> {
  const id = `${guestId}:${col}`;
  const hit = agents.get(id);
  if (hit) return hit.ready;
  const ready = (async () => {
    const client = new McpClient({ url: mcpUrl, headers: { Authorization: `Bearer ${key}` } });
    const tools = await client.listTools({ prefix: "" });
    return new Agent({ model: model(), tools, systemPrompt: SYSTEM_PROMPT });
  })();
  agents.set(id, { ready });
  return ready;
}

function deltaText(ev: { event?: unknown }): string {
  // Defensive walk of ModelStreamEvent shapes -> text delta, else "".
  const stack: unknown[] = [ev.event];
  while (stack.length > 0) {
    const cur = stack.pop() as Record<string, unknown> | null;
    if (!cur || typeof cur !== "object") continue;
    if (typeof cur.text === "string" && (cur.type === undefined || /delta/i.test(String(cur.type)))) {
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

function toolResultOutcome(result: unknown): { outcome?: string; say?: string; text: string } {
  // McpTool result blocks carry MCP content (+ structuredContent when present).
  try {
    const r = result as {
      content?: { type?: string; text?: string }[];
      structuredContent?: { outcome?: string; say?: string };
    };
    if (r?.structuredContent?.outcome) {
      return { outcome: r.structuredContent.outcome, say: r.structuredContent.say, text: JSON.stringify(r.structuredContent).slice(0, 500) };
    }
    const text = (r?.content ?? [])
      .map((b) => (b.type === "text" ? (b.text ?? "") : ""))
      .join(" ")
      .slice(0, 500);
    try {
      const env = JSON.parse(text) as { outcome?: string; say?: string };
      if (env.outcome) return { outcome: env.outcome, say: env.say, text };
    } catch {
      // Not an envelope — plain text ack (baseline).
    }
    return { text };
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
    yield { col, type: "error", text: `agent setup failed: ${(e as Error).message}` };
    return;
  }
  try {
    for await (const ev of agent.stream(text) as AsyncGenerator<{ type?: string } & Record<string, unknown>, unknown, void>) {
      const t = (ev as { type?: string }).type ?? "";
      if (t === "modelStreamUpdateEvent") {
        const tok = deltaText(ev as { event?: unknown });
        if (tok) yield { col, type: "token", text: tok };
      } else if (t === "beforeToolCallEvent") {
        const use = (ev as { toolUse?: { name?: string; input?: unknown } }).toolUse;
        yield { col, type: "tool_call", name: use?.name ?? "?", args: use?.input };
      } else if (t === "toolResultEvent" || t === "afterToolCallEvent") {
        const raw = (ev as { result?: unknown }).result;
        const { outcome, say, text: full } = toolResultOutcome(raw);
        const use = (ev as { toolUse?: { name?: string } }).toolUse;
        yield { col, type: "tool_result", name: use?.name, outcome, say, text: full };
      } else if (t === "agentResultEvent") {
        const res = (ev as { result?: { toString(): string } }).result;
        yield { col, type: "final", text: String(res?.toString?.() ?? res ?? "") };
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
): AsyncGenerator<SimEvent, void, void> {
  // Sequential (not parallel): free-tier rate limits punish parallel model calls.
  yield* runColumn(mcpUrl, keys.forgeKey, guestId, "forge", text);
  yield* runColumn(mcpUrl, keys.baselineKey, guestId, "baseline", text);
}
