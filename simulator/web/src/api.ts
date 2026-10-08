// API client: guest issue, A/B chat SSE, truth poll, faults.
export interface SimEvent {
  col: "forge" | "baseline";
  type: "token" | "tool_call" | "tool_result" | "final" | "error";
  text?: string;
  name?: string;
  args?: unknown;
  outcome?: string;
  say?: string;
}

export async function issueGuest(): Promise<{ guestId: string }> {
  const r = await fetch("/sim/guest", { method: "POST" });
  if (!r.ok) throw new Error("guest issue failed");
  return r.json();
}

export async function* chat(
  guestId: string,
  text: string,
): AsyncGenerator<SimEvent, void, void> {
  const r = await fetch("/sim/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guestId, text }),
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
  const r = await fetch(`/sim/truth?guestId=${encodeURIComponent(guestId)}`);
  return r.json();
}

export async function setFaults(
  guestId: string,
  profile: string,
  params: Record<string, unknown> = {},
): Promise<void> {
  await fetch("/sim/faults", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guestId, profile, params }),
  });
}
