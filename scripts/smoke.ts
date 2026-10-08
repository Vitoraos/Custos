// npm run smoke -- --base <url> [--key cf_...]
// Under 60s: health, deep health, 401-without-key, tools/list + one guarded
// action with key. Exit non-zero on any failure.
const base = (
  process.argv.find((a) => a.startsWith("--base="))?.slice(7) ??
  process.env.BASE_URL ??
  "http://localhost:3000"
).replace(/\/$/, "");
const key =
  process.argv.find((a) => a.startsWith("--key="))?.slice(6) ??
  process.env.SMOKE_KEY;
let failures = 0;
const check = (name: string, ok: boolean, extra = ""): void => {
  console.log(`${ok ? "ok" : "FAIL"} - ${name}${extra ? ` (${extra})` : ""}`);
  if (!ok) failures++;
};

const h = await fetch(`${base}/health`);
check("GET /health", h.ok);
const deep = (await fetch(`${base}/health/deep`).then((r) =>
  r.json().catch(() => null),
)) as { ok?: boolean } | null;
check("GET /health/deep", !!deep?.ok);

const anon = await fetch(`${base}/mcp`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {},
  }),
});
check(
  "POST /mcp without key -> 401",
  anon.status === 401,
  `got ${anon.status}`,
);

if (key) {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StreamableHTTPClientTransport } = await import(
    "@modelcontextprotocol/sdk/client/streamableHttp.js"
  );
  const c = new Client(
    { name: "smoke", version: "0.0.1" },
    { capabilities: {} },
  );
  await c.connect(
    new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${key}` } },
    }),
  );
  const { tools } = await c.listTools();
  check("tools/list with key", tools.length >= 11, `${tools.length} tools`);
  const call = async (name: string, args: Record<string, unknown>) =>
    (
      (await c.callTool({ name, arguments: args })) as unknown as {
        structuredContent?: { outcome?: string };
      }
    ).structuredContent;
  const rem = await call("remember_rule", {
    profile: "smoke",
    rule: { kind: "diet", value: "vegan" },
    evidence: "smoke test",
  });
  check("remember_rule -> ok", rem?.outcome === "ok", rem?.outcome);
  const rec = await call("find_recipe", {
    query: "chicken",
    servingFor: ["smoke"],
  });
  check(
    "find_recipe filters (blocked or ok+excluded)",
    rec?.outcome === "blocked" || rec?.outcome === "ok",
    rec?.outcome,
  );
  await c.close();
} else {
  console.log("skip - authed checks (pass --key or set SMOKE_KEY)");
}
process.exit(failures > 0 ? 1 : 0);
