import { describe, expect, it } from "vitest";
import { MemoryReceipts } from "../../src/core/receipts.js";

async function seed(n: number): Promise<MemoryReceipts> {
  const r = new MemoryReceipts();
  for (let i = 0; i < n; i++) {
    await r.insert({
      userId: "u",
      tool: `tool_${i % 3}`,
      idempotencyKey: `k${i}`,
      args: {},
      decision: {},
      expectation: {},
      observed: {},
      outcome: "ok",
      say: `${i}`,
      attempts: 1,
      latencyMs: i,
    });
  }
  return r;
}

describe("recent", () => {
  it("returns newest-first capped at the limit", async () => {
    const r = await seed(25);
    const got = await r.recent("u", 20);
    expect(got).toHaveLength(20);
    expect(got[0].say).toBe("24");
    expect(got[19].say).toBe("5");
  });
  it("scopes by user and tolerates small stores", async () => {
    const r = await seed(2);
    expect(await r.recent("u", 20)).toHaveLength(2);
    expect(await r.recent("other", 20)).toEqual([]);
  });
});
