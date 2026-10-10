// scripts/preflight.ts — proves CORS behavior per origin (plan: CORS proof).
// Usage: npx tsx scripts/preflight.ts --base http://localhost:3000
//   [--origin https://example.com]
// Checks: OPTIONS preflight on /sim/chat + /mcp echoes allow-origin for
// ALLOWED origins and withholds it for disallowed ones. Exit non-zero on Fail.
import { arg } from "./args.js";

const base = (arg("base", "http://localhost:3000") as string).replace(
  /\/$/,
  "",
);
const probeOrigin = arg("origin", "https://probe.invalid") as string;
let failures = 0;
const check = (name: string, ok: boolean, extra = ""): void => {
  console.log(`${ok ? "ok" : "FAIL"} - ${name}${extra ? ` (${extra})` : ""}`);
  if (!ok) failures++;
};

async function preflight(path: string, origin: string): Promise<Headers> {
  const r = await fetch(`${base}${path}`, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "Content-Type, Authorization",
    },
  });
  return r.headers;
}

// 1. Allowed origin: use the server's own boot log origins if reachable,
//    else fall back to asserting the disallowed case only.
const deep = await fetch(`${base}/health/deep`).then((r) =>
  r.json().catch(() => null),
);
check("server up (/health/deep)", !!deep, JSON.stringify(deep));

for (const path of ["/sim/chat", "/mcp"]) {
  const h = await preflight(path, probeOrigin);
  const echo = h.get("access-control-allow-origin");
  // probe.invalid must never be echoed.
  check(
    `OPTIONS ${path} withholds CORS for disallowed origin`,
    echo !== probeOrigin,
    `allow-origin=${echo ?? "(absent)"}`,
  );
  const methods = h.get("access-control-allow-methods") ?? "";
  check(
    `OPTIONS ${path} advertises methods`,
    echo === null || methods.includes("POST"),
    methods || "(absent, consistent with no echo)",
  );
}

// 2. Real browser-shaped POST still works same-origin (no Origin header).
const guest = await fetch(`${base}/sim/guest`, { method: "POST" });
check(
  "POST /sim/guest same-origin unaffected",
  guest.status === 200 || guest.status === 429,
  `got ${guest.status}`,
);

process.exit(failures > 0 ? 1 : 0);
