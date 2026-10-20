import { describe, expect, it } from "vitest";
import { loadConstraints, remember } from "../../src/storage/memories.js";
import { MemoryStore } from "../../src/storage/store.js";

// Regression: Postgres timestamptz comes back "+00:00", not "Z". A stricter
// datetime schema silently dropped EVERY production row (policy saw no rules).
describe("loadConstraints with real PG timestamps", () => {
  it("loads rows whose createdAt uses +00:00 offset + fractional seconds", async () => {
    const store = new MemoryStore();
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
    // @ts-expect-error test seam: exercise a PostgreSQL-shaped legacy row.
    store.memories.set(JSON.stringify(["u", "pg1"]), { ...pgRow });
    const rules = await loadConstraints(store, "u");
    expect(rules).toHaveLength(1);
    expect(rules[0].kind).toBe("device_limit");
  });

  it("does not load expired constraints", async () => {
    const store = new MemoryStore();
    await remember(store, "u", {
      profile: "household",
      kind: "constraint",
      payload: {
        kind: "allergen",
        allergen: "peanut",
        severity: "severe",
      },
      source: "explicit",
      evidence: null,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    expect(await loadConstraints(store, "u")).toHaveLength(0);
  });

  it("rejects malformed memory payloads before persistence", async () => {
    const store = new MemoryStore();
    await expect(
      remember(store, "u", {
        profile: "household",
        kind: "constraint",
        payload: {
          kind: "allergen",
          allergen: "peanuts-not-in-schema",
          severity: "severe",
        },
        source: "explicit",
        evidence: null,
      }),
    ).rejects.toThrow("memory: invalid constraint payload");

    expect(await store.listMemories("u")).toHaveLength(0);
  });
});

describe("corrupt active constraints", () => {
  it("fails closed instead of silently dropping an invalid active rule", async () => {
    const store = new MemoryStore();
    const row = {
      id: "broken-rule",
      userId: "u",
      profile: "household",
      kind: "constraint",
      payload: {
        kind: "quiet_hours",
        start: "99:99",
        end: "07:00",
        tz: "Africa/Lagos",
        applies: ["lights"],
      },
      source: "explicit",
      status: "active",
      evidence: null,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
    };
    // @ts-expect-error test seam: simulate a corrupt persisted row.
    store.memories.set(JSON.stringify(["u", "broken-rule"]), row);

    await expect(loadConstraints(store, "u")).rejects.toThrow(
      "active constraint broken-rule failed validation",
    );
  });

  it("rejects invalid clock values and time zones before persistence", async () => {
    const store = new MemoryStore();
    await expect(
      remember(store, "u", {
        profile: "household",
        kind: "constraint",
        payload: {
          kind: "quiet_hours",
          start: "99:99",
          end: "07:00",
          tz: "Africa/Lagos",
          applies: ["lights"],
        },
        source: "explicit",
        evidence: null,
      }),
    ).rejects.toThrow("memory: invalid constraint payload");

    await expect(
      remember(store, "u", {
        profile: "household",
        kind: "constraint",
        payload: {
          kind: "quiet_hours",
          start: "20:00",
          end: "07:00",
          tz: "Mars/Olympus",
          applies: ["lights"],
        },
        source: "explicit",
        evidence: null,
      }),
    ).rejects.toThrow("memory: invalid constraint payload");
  });
});
