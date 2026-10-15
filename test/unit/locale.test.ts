import { describe, expect, it } from "vitest";
import { getLocale, requestContext } from "../../src/core/locale.js";
import { MemoryStore } from "../../src/storage/store.js";

async function storeWithFacts(texts: string[]): Promise<MemoryStore> {
  const s = new MemoryStore();
  for (const text of texts) {
    await s.insertMemory({
      userId: "u",
      profile: "household",
      kind: "fact",
      payload: { kind: "fact", text },
      source: "explicit",
      status: "active",
      evidence: null,
      expiresAt: null,
    });
  }
  return s;
}

describe("getLocale", () => {
  it("parses home city/timezone/coordinates facts", async () => {
    const s = await storeWithFacts([
      "Home city: Lagos, Nigeria",
      "Home timezone: Africa/Lagos",
      "Home coordinates: 6.5244, 3.3792",
    ]);
    expect(await getLocale(s, "u")).toEqual({
      city: "Lagos, Nigeria",
      tz: "Africa/Lagos",
      lat: 6.5244,
      lon: 3.3792,
    });
  });
  it("defaults safely on missing, invalid, or revoked facts", async () => {
    expect(await getLocale(new MemoryStore(), "nobody")).toEqual({
      city: null,
      tz: "UTC",
      lat: null,
      lon: null,
    });
    const s = await storeWithFacts([
      "Home timezone: Mars/Olympus",
      "Home coordinates: 999, abc",
    ]);
    expect(await getLocale(s, "u")).toEqual({
      city: null,
      tz: "UTC",
      lat: null,
      lon: null,
    });
  });
  it("ignores non-fact memories", async () => {
    const s = new MemoryStore();
    await s.insertMemory({
      userId: "u",
      profile: "household",
      kind: "constraint",
      payload: { kind: "diet", value: "vegan" },
      source: "user_voice",
      status: "active",
      evidence: null,
      expiresAt: null,
    });
    expect((await getLocale(s, "u")).city).toBeNull();
  });
});

describe("requestContext", () => {
  it("renders local wall time + weekday in home tz", () => {
    const c = requestContext(new Date("2026-10-09T20:00:00Z"), {
      city: "Lagos",
      tz: "Africa/Lagos",
      lat: null,
      lon: null,
    });
    expect(c.nowUtc).toBe("2026-10-09T20:00:00.000Z");
    expect(c.tz).toBe("Africa/Lagos");
    expect(c.city).toBe("Lagos");
    expect(c.weekday).toBe("Friday");
    expect(c.nowLocal).toContain("21:00");
  });
  it("falls back cleanly on bad tz", () => {
    const c = requestContext(new Date("2026-10-09T20:00:00Z"), {
      city: null,
      tz: "Nope/Nowhere",
      lat: null,
      lon: null,
    });
    expect(c.nowUtc).toBe("2026-10-09T20:00:00.000Z");
  });
});
