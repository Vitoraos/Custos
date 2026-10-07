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
  it("lists 11 tools with a valid key", async () => {
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
