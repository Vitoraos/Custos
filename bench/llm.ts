// L2 scaffold (LLM-in-the-loop): drives the simulator A/B over HTTP and scores
// each turn against ground truth. Skips cleanly without OPENROUTER_API_KEY.
// Usage: npx tsx bench/llm.ts --base http://localhost:3000 [--tasks S1,S2]
// Full L2 batch (40-60 tasks/condition) runs when the model key exists.
const base = (process.argv.find((a) => a.startsWith("--base="))?.slice(7) ?? "http://localhost:3000").replace(/\/$/, "");

if (!process.env.OPENROUTER_API_KEY) {
  console.log(JSON.stringify({ skipped: true, reason: "no OPENROUTER_API_KEY; L1 is the committed number" }));
  process.exit(0);
}

interface SimEvent {
  col: string;
  type: string;
  text?: string;
  name?: string;
  outcome?: string;
  say?: string;
}
const TASKS: { family: string; text: string; fault?: { profile: string; params: Record<string, unknown> } }[] = [
  { family: "S1", text: "Turn on the kitchen light.", fault: { profile: "lost_ack", params: { p: 1, seed: 42 } } },
  { family: "S1", text: "Turn on the hall light." },
  { family: "S2", text: "I am vegan and my daughter Maya has a severe peanut allergy. Remember that." },
  { family: "S2", text: "Plan dinner for four with Maya." },
  { family: "S4", text: "What is in the news?" },
  { family: "S5", text: "Unlock the front door." },
];

async function streamEvents(guestId: string, text: string): Promise<SimEvent[]> {
  const res = await fetch(`${base}/sim/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guestId, text }),
  });
  if (!res.ok || !res.body) throw new Error(`chat ${res.status}`);
  const out: SimEvent[] = [];
  const reader = res.body.getReader();
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
            out.push(JSON.parse(t.slice(5).trim()) as SimEvent);
          } catch {
            // keep-alive
          }
        }
      }
    }
  }
  return out;
}

async function main(): Promise<void> {
  const guest = (await fetch(`${base}/sim/guest`, { method: "POST" }).then((r) => r.json())) as { guestId: string };
  const rows: Record<string, unknown>[] = [];
  for (const task of TASKS) {
    if (task.fault) {
      await fetch(`${base}/sim/faults`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestId: guest.guestId, profile: task.fault.profile, params: task.fault.params }),
      });
    }
    const events = await streamEvents(guest.guestId, task.text);
    const truth = (await fetch(`${base}/sim/truth?guestId=${guest.guestId}`).then((r) => r.json())) as Record<string, unknown>;
    const finals = events.filter((e) => e.type === "final");
    rows.push({
      family: task.family,
      text: task.text,
      forgeFinal: finals.find((e) => e.col === "forge")?.text ?? null,
      baselineFinal: finals.find((e) => e.col === "baseline")?.text ?? null,
      forgeOutcomes: events.filter((e) => e.col === "forge" && e.type === "tool_result").map((e) => e.outcome),
      baselineOutcomes: events.filter((e) => e.col === "baseline" && e.type === "tool_result").map((e) => e.outcome),
      truth,
    });
    await fetch(`${base}/sim/faults`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestId: guest.guestId, profile: "none", params: {} }),
    });
  }
  console.log(JSON.stringify({ date: new Date().toISOString(), n: rows.length, rows }, null, 2));
}

await main();
