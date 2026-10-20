// Simulator HTTP surface (NOT MCP): guest issue, A/B chat SSE, ground truth, faults.
import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { TWIN_DEVICES } from "../../src/adapters/devices/twin.js";
import { topicFor } from "../../src/adapters/ntfy.js";
import { listStandingRules } from "../../src/storage/memories.js";
import type { Store } from "../../src/storage/store.js";
import type { Deps } from "../../src/tools/context.js";
import { runAB } from "./agent.js";
import { seedDemoHousehold } from "./demo.js";
import {
  budgetCheck,
  budgetSpend,
  getGuest,
  guestKeys,
  issueGuest,
} from "./guest.js";
import { fetchRecipe } from "./recipes.js";
import { runShowcase } from "./showcase.js";
import {
  applyBeatFault,
  applyNaiveEffects,
  assertBeat,
  getBeat,
  listBeats,
  THEATER_DISCLAIMER,
} from "./theater.js";

export function mountSim(
  app: Hono,
  store: Store,
  deps: Deps,
  mcpUrl: string,
): void {
  app.post("/sim/showcase", async (c) => {
    try {
      return c.json(await runShowcase(store, deps));
    } catch (e) {
      return c.json({ error: (e as Error).message.slice(0, 240) }, 500);
    }
  });

  app.post("/sim/guest", async (c) => {
    const g = await issueGuest(store);
    return c.json({ guestId: g.id, createdAt: g.createdAt });
  });

  app.post("/sim/chat", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      guestId?: string;
      text?: string;
      cols?: ("forge" | "baseline")[];
    } | null;
    const g = body?.guestId ? getGuest(body.guestId) : null;
    const k = body?.guestId ? guestKeys(body.guestId) : null;
    const text = body?.text?.slice(0, 500) ?? "";
    const cols =
      body?.cols?.length === 1 &&
      (body.cols[0] === "forge" || body.cols[0] === "baseline")
        ? [body.cols[0]]
        : (["baseline", "forge"] as ("forge" | "baseline")[]);
    if (!g || !k || !text)
      return c.json(
        { error: "need guestId + text (POST /sim/guest first)" },
        400,
      );
    const budget = budgetCheck(g.id);
    if (!budget.ok) return c.json({ error: budget.reason, replay: true }, 429);
    budgetSpend(g.id);
    return streamSSE(c, async (stream) => {
      for await (const ev of runAB(mcpUrl, k, g.id, text, cols)) {
        await stream.writeSSE({ data: JSON.stringify(ev) });
      }
    });
  });

  // Ground truth: independent of anything the assistants SAY.
  app.get("/sim/truth", async (c) => {
    const g = getGuest(c.req.query("guestId") ?? "");
    if (!g) return c.json({ error: "unknown guest" }, 404);
    const devices: Record<string, unknown> = {};
    for (const d of TWIN_DEVICES)
      devices[d] = await store.getDevice(g.userId, d);
    const faults = await store.getFaults(g.userId);
    const shopping = await store.listItems(g.userId, "shopping");
    const pantry = await store.listItems(g.userId, "pantry");
    const rules = await listStandingRules(store, g.userId);
    const last = await deps.receipts.latest(g.userId);
    const receipts = (await deps.receipts.recent(g.userId, 20)).map((r) => ({
      tool: r.tool,
      outcome: r.outcome,
      attempts: r.attempts,
      latencyMs: r.latencyMs,
      createdAt: r.createdAt,
      rulesChecked: Array.isArray(
        (r.decision as { checked?: unknown })?.checked,
      )
        ? ((r.decision as { checked?: unknown[] }).checked?.length ?? 0)
        : 0,
    }));
    return c.json({
      devices,
      faults,
      shopping,
      pantry,
      rules,
      lastReceipt: last,
      receipts,
      notifyTopic: topicFor(g.userId),
    });
  });

  // Recipe card data: re-runs find_recipe through the real MCP tool
  // (same guard, same lists) and returns name + ingredients only.
  app.get("/sim/recipe", async (c) => {
    const g = getGuest(c.req.query("guestId") ?? "");
    const query = (c.req.query("query") ?? "").slice(0, 100);
    const k = g ? guestKeys(g.id) : null;
    if (!g || !k || !query)
      return c.json({ error: "need guestId + query" }, 400);
    try {
      const card = await fetchRecipe(mcpUrl, k.forgeKey, query);
      if (!card) return c.json({ error: "no recipe found" }, 404);
      return c.json(card);
    } catch (e) {
      return c.json({ error: (e as Error).message.slice(0, 200) }, 502);
    }
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
      return c.json(
        { error: `profile must be one of ${allowed.join(", ")}` },
        400,
      );
    }
    await store.setFaults(g.userId, {
      profile: body.profile,
      params: body.params ?? {},
    });
    return c.json({ ok: true });
  });

  // Demo theater: scripted beats + ground-state assertions. The simulated
  // column plays fixtures; assertions prove what actually changed.
  app.get("/sim/theater", async (c) => {
    return c.json({ disclaimer: THEATER_DISCLAIMER, beats: listBeats() });
  });
  app.post("/sim/theater/fault", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      guestId?: string;
      beat?: string;
    } | null;
    const g = body?.guestId ? getGuest(body.guestId) : null;
    if (!g || !body?.beat) return c.json({ error: "need guestId + beat" }, 400);
    if (!getBeat(body.beat)) return c.json({ error: "unknown beat" }, 404);
    await applyBeatFault(store, g.userId, body.beat);
    return c.json({ ok: true });
  });
  app.post("/sim/theater/naive", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      guestId?: string;
      beat?: string;
    } | null;
    const g = body?.guestId ? getGuest(body.guestId) : null;
    if (!g || !body?.beat) return c.json({ error: "need guestId + beat" }, 400);
    if (!getBeat(body.beat)) return c.json({ error: "unknown beat" }, 404);
    await applyNaiveEffects(store, g.userId, body.beat);
    return c.json({ ok: true });
  });
  app.post("/sim/theater/assert", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      guestId?: string;
      beat?: string;
      phase?: "left" | "right";
    } | null;
    const g = body?.guestId ? getGuest(body.guestId) : null;
    if (
      !g ||
      !body?.beat ||
      (body.phase !== "left" && body.phase !== "right")
    ) {
      return c.json({ error: "need guestId + beat + phase (left|right)" }, 400);
    }
    try {
      return c.json({
        results: await assertBeat(store, deps, g.userId, body.beat, body.phase),
      });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 404);
    }
  });

  // Each browser receives a fresh tenant-scoped household. Never seed the
  // shared "demo" user: concurrent visitors and resets would overwrite state.
  app.post("/sim/demo", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      guestId?: string;
    } | null;
    const existing = body?.guestId ? getGuest(body.guestId) : null;
    if (body?.guestId && !existing) {
      return c.json({ error: "unknown guest session" }, 404);
    }
    const s = existing ?? (await issueGuest(store));
    const summary = await seedDemoHousehold(store, s.userId);
    if (summary.constraintsLoaded !== summary.rules) {
      return c.json(
        {
          error: `seeded ${summary.rules} rules but policy loads ${summary.constraintsLoaded} — bundle drifted from schema`,
        },
        500,
      );
    }
    return c.json({ guestId: s.id, userId: s.userId, summary });
  });
}
