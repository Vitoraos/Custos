// npm run sim:record -- --base http://localhost:3000 --out dinner-ab -- 'text one' 'text two'
// Captures REAL live /sim/chat SSE streams (events + timings) to
// simulator/web/public/replays/<out>.json. Needs a running server + model key.
import { arg } from "./args.js";

const base = (arg("base", "http://localhost:3000") as string).replace(
  /\/$/,
  "",
);
const out = arg("out", "session") as string;
const texts = process.argv
  .filter(
    (a) =>
      !a.startsWith("--") &&
      !a.endsWith("sim-record.ts") &&
      a !== process.argv[1],
  )
  .slice(1);
if (texts.length === 0) {
  console.error("sim:record: pass scenario texts after --");
  process.exit(1);
}
const { writeFileSync, mkdirSync } = await import("node:fs");
mkdirSync("simulator/web/public/replays", { recursive: true });

const guestRes = (await fetch(`${base}/sim/guest`, { method: "POST" }).then(
  (r) => r.json(),
)) as { guestId: string };
const guest = guestRes.guestId;
console.log(`sim:record: guest ${guest}`);
for (const [i, text] of texts.entries()) {
  const res = await fetch(`${base}/sim/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guestId: guest, text }),
  });
  if (!res.ok || !res.body) {
    console.error(`sim:record: chat failed: ${res.status}`);
    process.exit(1);
  }
  const events: { at: number; ev: unknown }[] = [];
  const t0 = Date.now();
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
            events.push({
              at: Date.now() - t0,
              ev: JSON.parse(t.slice(5).trim()),
            });
          } catch {
            // keep-alive
          }
        }
      }
    }
  }
  const file = `simulator/web/public/replays/${out}-${i}.json`;
  writeFileSync(file, JSON.stringify(events));
  console.log(`sim:record: ${events.length} events -> ${file}`);
}
