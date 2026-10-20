// API client: guest issue, A/B chat SSE, truth poll, faults.
// Same-origin by default (served from the main process). Split deployments
// (frontend on Vercel, backend on Render) set VITE_API_BASE to the backend.
// Replays stay relative (served with the frontend).
const API: string =
  (
    import.meta as unknown as { env?: { VITE_API_BASE?: string } }
  ).env?.VITE_API_BASE?.replace(/\/$/, "") ?? "";

export interface SimEvent {
  col: "forge" | "baseline";
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

export async function issueGuest(): Promise<{ guestId: string }> {
  const r = await fetch(`${API}/sim/guest`, { method: "POST" });
  if (!r.ok) throw new Error("guest issue failed");
  return r.json();
}

export interface DemoSummary {
  userId: string;
  rules: number;
  constraintsLoaded: number;
}

export async function loadDemo(guestId?: string): Promise<{
  guestId: string;
  summary: DemoSummary;
}> {
  const r = await fetch(`${API}/sim/demo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(guestId ? { guestId } : {}),
  });
  if (!r.ok) {
    const err = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "demo load failed");
  }
  return r.json();
}

export async function* chat(
  guestId: string,
  text: string,
  cols?: ("forge" | "baseline")[],
  signal?: AbortSignal,
): AsyncGenerator<SimEvent, void, void> {
  const r = await fetch(`${API}/sim/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guestId, text, ...(cols ? { cols } : {}) }),
    ...(signal ? { signal } : {}),
  });
  if (!r.ok || !r.body) {
    const err = (await r.json().catch(() => ({ error: r.statusText }))) as {
      error?: string;
      replay?: boolean;
    };
    yield { col: "forge", type: "error", text: err.error ?? "chat failed" };
    return;
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const p of parts) {
      for (const line of p.split("\n")) {
        const t = line.trim();
        if (t.startsWith("data:")) {
          try {
            yield JSON.parse(t.slice(5).trim()) as SimEvent;
          } catch {
            // keep-alive frames
          }
        }
      }
    }
  }
}

export async function truth(guestId: string): Promise<Record<string, unknown>> {
  const r = await fetch(
    `${API}/sim/truth?guestId=${encodeURIComponent(guestId)}`,
  );
  return r.json();
}

export interface RecipeCardData {
  name: string;
  ingredients: string[];
}

export async function fetchRecipe(
  guestId: string,
  query: string,
): Promise<RecipeCardData> {
  const r = await fetch(
    `${API}/sim/recipe?guestId=${encodeURIComponent(guestId)}&query=${encodeURIComponent(query)}`,
  );
  if (!r.ok) throw new Error("recipe lookup failed");
  return r.json();
}

export interface TheaterBeat {
  id: string;
  caption: string;
  narration: string;
  input: string | null;
  alexa: { type: "token" | "final"; text: string }[];
}

export interface AssertResult {
  description: string;
  pass: boolean;
  detail: string;
}

export async function theater(): Promise<{
  disclaimer: string;
  beats: TheaterBeat[];
}> {
  const r = await fetch(`${API}/sim/theater`);
  if (!r.ok) throw new Error("theater listing failed");
  return r.json();
}

export async function theaterFault(
  guestId: string,
  beat: string,
): Promise<void> {
  const r = await fetch(`${API}/sim/theater/fault`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guestId, beat }),
  });
  if (!r.ok) throw new Error("theater fault failed");
}

export async function theaterAssert(
  guestId: string,
  beat: string,
  phase: "left" | "right",
): Promise<{ results: AssertResult[] }> {
  const r = await fetch(`${API}/sim/theater/assert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guestId, beat, phase }),
  });
  if (!r.ok) throw new Error("theater assert failed");
  return r.json();
}

// The scripted WITHOUT-Custos column's raw writes: applied to ground state
// with no guard, no read-back and no receipt.
export async function theaterNaive(
  guestId: string,
  beat: string,
): Promise<void> {
  const r = await fetch(`${API}/sim/theater/naive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guestId, beat }),
  });
  if (!r.ok) throw new Error("theater naive failed");
}
