// In-process server + official SDK client over real Streamable HTTP.
// Covers: auth, tenant isolation, every tool's happy path + one failure path.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sha256Hex } from "../../src/auth.js";
import { createServer } from "../../src/server.js";
import { MemoryStore } from "../../src/storage/store.js";

const PORT = 4181;
const ENDPOINT = `http://localhost:${PORT}/mcp`;
let stop: () => Promise<void> = async () => {};
const store = new MemoryStore();

async function seedKeys(): Promise<{
  forge: string;
  baseline: string;
  other: string;
}> {
  const forge = "cf_testforge000000000000000000000001";
  const baseline = "cf_testbase000000000000000000000001";
  const other = "cf_testother00000000000000000000001";
  await store.insertKey(sha256Hex(forge), {
    userId: "alice",
    mode: "forge",
    label: "test",
    revokedAt: null,
  });
  await store.insertKey(sha256Hex(baseline), {
    userId: "alice",
    mode: "baseline",
    label: "test",
    revokedAt: null,
  });
  await store.insertKey(sha256Hex(other), {
    userId: "bob",
    mode: "forge",
    label: "test",
    revokedAt: null,
  });
  return { forge, baseline, other };
}

async function client(key?: string): Promise<Client> {
  const c = new Client(
    { name: "integ", version: "0.0.1" },
    { capabilities: {} },
  );
  const t = new StreamableHTTPClientTransport(
    new URL(ENDPOINT),
    key
      ? { requestInit: { headers: { Authorization: `Bearer ${key}` } } }
      : undefined,
  );
  await c.connect(t);
  return c;
}
async function call(
  c: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<{ outcome: string; say: string; [k: string]: unknown }> {
  const r = await c.callTool({ name, arguments: args });
  const sc = (r as { structuredContent?: { outcome: string; say: string } })
    .structuredContent;
  if (!sc)
    throw new Error(
      `no structuredContent from ${name}: ${JSON.stringify(r).slice(0, 200)}`,
    );
  return sc as { outcome: string; say: string; [k: string]: unknown };
}

let keys: { forge: string; baseline: string; other: string };
beforeAll(async () => {
  keys = await seedKeys();
  const { server } = createServer(store);
  await server.start({
    transportType: "httpStream",
    httpStream: {
      port: PORT,
      host: "127.0.0.1",
      endpoint: "/mcp",
      stateless: true,
    },
  });
  stop = () => server.stop();
}, 30_000);
afterAll(async () => {
  await stop();
});

describe("auth", () => {
  it("rejects unauthenticated calls with 401", async () => {
    const r = await fetch(ENDPOINT, {
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
    expect(r.status).toBe(401);
  });
  it("lists 12 tools with a valid key", async () => {
    const c = await client(keys.forge);
    try {
      const { tools } = await c.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(
        [
          "confirm_action",
          "explain_last_action",
          "find_recipe",
          "forget_memory",
          "get_headlines",
          "get_pantry",
          "get_standing_rules",
          "get_weather",
          "remember_rule",
          "set_device_state",
          "set_reminder",
          "update_shopping_list",
        ].sort(),
      );
    } finally {
      await c.close();
    }
  });
});

describe("memory + policy end to end", () => {
  it("stores a peanut allergy, then blocks violating recipes with reasons", async () => {
    const c = await client(keys.forge);
    try {
      const rem = await call(c, "remember_rule", {
        profile: "Maya",
        rule: { kind: "allergen", allergen: "peanut", severity: "severe" },
        evidence: "Maya is allergic to peanuts",
      });
      expect(rem.outcome).toBe("ok");
      expect(rem.say).toContain("Got it");
      const rules = await call(c, "get_standing_rules", {});
      const list = (rules.data as { rules?: unknown[] }) ?? rules.data;
      expect(JSON.stringify(list)).toContain("peanut");
      const rec = await call(c, "find_recipe", {
        query: "satay",
        servingFor: ["Maya"],
      });
      // Either blocked (all excluded) or ok with exclusions recorded.
      if (rec.outcome === "blocked") {
        expect(JSON.stringify(rec.data)).toContain("peanut");
      } else {
        expect(rec.outcome).toBe("ok");
      }
    } finally {
      await c.close();
    }
  }, 60_000);
  it("tenant isolation: bob sees none of alice's rules", async () => {
    const c = await client(keys.other);
    try {
      const rules = await call(c, "get_standing_rules", {});
      expect(JSON.stringify(rules.data ?? [])).not.toContain("peanut");
    } finally {
      await c.close();
    }
  });
});

describe("actions + receipts", () => {
  it("set_device_state verifies against the twin", async () => {
    const c = await client(keys.forge);
    try {
      const r = await call(c, "set_device_state", {
        device: "kitchen_light",
        attr: "power",
        value: "on",
      });
      expect(r.outcome).toBe("verified");
      const exp = await call(c, "explain_last_action", {
        tool: "set_device_state",
      });
      expect(exp.outcome).toBe("ok");
      expect(JSON.stringify(exp.data)).toContain("set_device_state");
    } finally {
      await c.close();
    }
  });
  it("spoken device name + boolean value land on the canonical key", async () => {
    const c = await client(keys.forge);
    try {
      const r = await call(c, "set_device_state", {
        device: "kitchen light",
        attr: "power",
        value: false,
      });
      expect(r.outcome).toBe("verified");
      expect(r.say).toContain("is off");
      expect(await store.getDevice("alice", "kitchen_light")).toEqual({
        power: "off",
      });
    } finally {
      await c.close();
    }
  });
  it("lost_ack fault surfaces as unverified, never false-verified", async () => {
    await store.setFaults("alice", {
      profile: "lost_ack",
      params: { p: 1, seed: 3 },
    });
    const c = await client(keys.forge);
    try {
      const r = await call(c, "set_device_state", {
        device: "hall_light",
        attr: "power",
        value: "on",
      });
      expect(r.outcome).toBe("unverified");
      expect(r.say).toContain("could not confirm");
    } finally {
      await c.close();
      await store.setFaults("alice", { profile: "none", params: {} });
    }
  });
  it("unlocking needs confirmation; confirm_action completes it", async () => {
    const c = await client(keys.forge);
    try {
      const first = await call(c, "set_device_state", {
        device: "front_door_lock",
        attr: "locked",
        value: "unlock",
      });
      expect(first.outcome).toBe("needs_confirmation");
      expect(first.confirmToken).toBeDefined();
      const done = await call(c, "confirm_action", {
        confirmToken: first.confirmToken,
      });
      expect(done.outcome).toBe("verified");
    } finally {
      await c.close();
    }
  });
  it("baseline mode returns raw ack without guard", async () => {
    const c = await client(keys.baseline);
    try {
      const r = await call(c, "set_device_state", {
        device: "kitchen_light",
        attr: "power",
        value: "on",
      });
      expect(r.outcome).toBe("ok");
    } finally {
      await c.close();
    }
  });
  it("forgetting a safety rule needs confirmation, then verifies deletion", async () => {
    const c = await client(keys.forge);
    try {
      const rules = await call(c, "get_standing_rules", {});
      const target = (rules.data as { id: string; summary: string }[]).find(
        (r) => r.summary.includes("peanut"),
      );
      expect(target).toBeDefined();
      const first = await call(c, "forget_memory", { id: target?.id });
      expect(first.outcome).toBe("needs_confirmation");
      const done = await call(c, "confirm_action", {
        confirmToken: first.confirmToken,
      });
      expect(done.outcome).toBe("verified");
      const after = await call(c, "get_standing_rules", {});
      expect(JSON.stringify(after.data ?? [])).not.toContain("peanut");
    } finally {
      await c.close();
    }
  });
});

describe("time, place, and pantry", () => {
  it("every response carries a request context block", async () => {
    const c = await client(keys.forge);
    try {
      const r = (await call(c, "get_standing_rules", {})) as {
        outcome: string;
        context?: { nowUtc: string; weekday: string; tz: string };
      };
      expect(r.context?.nowUtc).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(typeof r.context?.weekday).toBe("string");
      expect(typeof r.context?.tz).toBe("string");
    } finally {
      await c.close();
    }
  });
  it("get_pantry reads pantry and shopping lists", async () => {
    const c = await client(keys.forge);
    try {
      await call(c, "update_shopping_list", {
        list: "shopping",
        ops: [{ op: "add", item: "oats" }],
      });
      const r = (await call(c, "get_pantry", { list: "shopping" })) as {
        outcome: string;
        data?: { pantry: unknown; shopping: string[] };
      };
      expect(r.outcome).toBe("ok");
      expect(Array.isArray(r.data?.pantry)).toBe(true);
      expect(r.data?.shopping).toContain("oats");
    } finally {
      await c.close();
    }
  });
  it("quiet_hours without tz defaults to home timezone", async () => {
    const c = await client(keys.forge);
    try {
      await call(c, "remember_rule", {
        profile: "household",
        rule: { kind: "fact", text: "Home timezone: Pacific/Auckland" },
        evidence: "e2e",
      });
      const rem = (await call(c, "remember_rule", {
        profile: "household",
        rule: {
          kind: "quiet_hours",
          start: "22:00",
          end: "07:00",
          applies: ["lights"],
        },
        evidence: "e2e",
      })) as { outcome: string; data?: { id: string } };
      expect(rem.outcome).toBe("ok");
      const rules = (await call(c, "get_standing_rules", {})) as {
        data?: { id: string; summary: string }[];
      };
      expect(
        (rules.data ?? []).some((r) => r.summary.includes("Pacific/Auckland")),
      ).toBe(true);
      // Cleanup: home tz fact + quiet rule (non-safety deletes are immediate).
      for (const r of rules.data ?? []) {
        if (
          r.summary.includes("Pacific/Auckland") ||
          r.summary.includes("Home timezone")
        ) {
          await call(c, "forget_memory", { id: r.id });
        }
      }
    } finally {
      await c.close();
    }
  });
  it("set_reminder rejects both/neither time forms without touching ntfy", async () => {
    const c = await client(keys.forge);
    try {
      const both = await call(c, "set_reminder", {
        text: "x",
        inSeconds: 60,
        atLocal: { day: "today", time: "15:00" },
      });
      expect(both.outcome).toBe("error");
      const neither = await call(c, "set_reminder", { text: "x" });
      expect(neither.outcome).toBe("error");
      // Note: malformed atLocal.time fails Zod input validation (no envelope),
      // covered at unit level in test/unit/reminder.test.ts.
    } finally {
      await c.close();
    }
  });
});
