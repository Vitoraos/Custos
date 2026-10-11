import { describe, expect, it } from "vitest";
import { loadConstraints } from "../../src/storage/memories.js";
import { MemoryStore } from "../../src/storage/store.js";

// Regression: Postgres timestamptz comes back "+00:00", not "Z". A stricter
// datetime schema silently dropped EVERY production row (policy saw no rules).
describe("loadConstraints with real PG timestamps", () => {
  it("loads rows whose createdAt uses +00:00 offset + fractional seconds", async () => {
    const store = new MemoryStore();
    // Bypass insertMemory (which stamps Z-time) to mimic a real PG row.
    const pgRow = {
      id: "pg1",
      userId: "u",
      profile: "household",
      kind: "constraint",
      payload: {
        kind: "device_limit",
        device: "thermostat",
        attr: "temp_c",
        min: 18,
        max: 26,
      },
      source: "user_voice",
      status: "active",
      evidence: null,
      createdAt: "2026-10-09T14:38:30.23423+00:00",
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
    } as const;
    // @ts-expect-error test seam: MemoryStore keeps rows in a private map keyed user|id
    store.memories.set("u|pg1", { ...pgRow });
    const rules = await loadConstraints(store, "u");
    expect(rules).toHaveLength(1);
    expect(rules[0].kind).toBe("device_limit");
  });
});
