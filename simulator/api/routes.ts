// Simulator HTTP surface (NOT MCP): guest issue, A/B chat SSE, ground truth, faults.
import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { TWIN_DEVICES } from "../../src/adapters/devices/twin.js";
import { listStandingRules } from "../../src/storage/memories.js";
import type { Deps } from "../../src/tools/context.js";
import type { Store } from "../../src/storage/store.js";
import { runAB } from "./agent.js";
import { budgetCheck, budgetSpend, getGuest, guestKeys, issueGuest } from "./guest.js";

export function mountSim(app: Hono, store: Store, deps: Deps, mcpUrl: string): void {
  app.post("/sim/guest", async (c) => {
    const g = await issueGuest(store);
    return c.json({ guestId: g.id, createdAt: g.createdAt });
  });

  app.post("/sim/chat", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { guestId?: string; text?: string } | null;
    const g = body?.guestId ? getGuest(body.guestId) : null;
    const k = body?.guestId ? guestKeys(body.guestId) : null;
    const text = body?.text?.slice(0, 500) ?? "";
    if (!g || !k || !text) return c.json({ error: "need guestId + text (POST /sim/guest first)" }, 400);
    const budget = budgetCheck(g.id);
    if (!budget.ok) return c.json({ error: budget.reason, replay: true }, 429);
    budgetSpend(g.id);
    return streamSSE(c, async (stream) => {
      for await (const ev of runAB(mcpUrl, k, g.id, text)) {
        await stream.writeSSE({ data: JSON.stringify(ev) });
      }
    });
  });

  // Ground truth: independent of anything the assistants SAY.
  app.get("/sim/truth", async (c) => {
    const g = getGuest(c.req.query("guestId") ?? "");
    if (!g) return c.json({ error: "unknown guest" }, 404);
    const devices: Record<string, unknown> = {};
    for (const d of TWIN_DEVICES) devices[d] = await store.getDevice(g.userId, d);
    const faults = await store.getFaults(g.userId);
    const shopping = await store.listItems(g.userId, "shopping");
    const rules = await listStandingRules(store, g.userId);
    const last = await deps.receipts.latest(g.userId);
    return c.json({ devices, faults, shopping, rules, lastReceipt: last });
  });

  // Chaos panel. Admin endpoint — never an MCP tool, so the LLM can't flip it.
  app.post("/sim/faults", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      guestId?: string;
      profile?: string;
      params?: Record<string, unknown>;
    } | null;
    const g = body?.guestId ? getGuest(body.guestId) : null;
    if (!g) return c.json({ error: "unknown guest" }, 404);
    const allowed = ["none", "lost_ack", "delayed", "offline", "flaky"];
    if (!body?.profile || !allowed.includes(body.profile)) {
      return c.json({ error: `profile must be one of ${allowed.join(", ")}` }, 400);
    }
    await store.setFaults(g.userId, { profile: body.profile, params: body.params ?? {} });
    return c.json({ ok: true });
  });
}
