import { describe, expect, it } from "vitest";
import {
  applyBeatFault,
  applyNaiveEffects,
  assertBeat,
  getBeat,
  listBeats,
  THEATER_DISCLAIMER,
} from "../../simulator/api/theater.js";
import { MemoryReceipts } from "../../src/core/receipts.js";
import { MemoryConfirms } from "../../src/core/verify.js";
import { MemoryStore } from "../../src/storage/store.js";

function deps() {
  return {
    store: new MemoryStore(),
    receipts: new MemoryReceipts(),
    confirms: new MemoryConfirms(),
  };
}

describe("theater beats", () => {
  it("lists beats with captions, inputs and the canned replies", () => {
    const beats = listBeats();
    expect(beats.map((b) => b.id)).toEqual([
      "basic",
      "medium",
      "complex",
      "honest-failure",
      "end-card",
    ]);
    // The scripted column renders these verbatim - they must ship with the list.
    expect(beats[0].alexa.length).toBeGreaterThan(0);
    expect(THEATER_DISCLAIMER).toMatch(/simulated/i);
  });

  it("scripted replies are fixed verbatim", () => {
    const beat = getBeat("honest-failure");
    expect(beat?.alexa.map((e) => e.text).join("")).toContain(
      "Done! Hall light is off.",
    );
    expect(getBeat("nope")).toBeUndefined();
  });

  it("applyBeatFault sets and clears faults", async () => {
    const d = deps();
    await applyBeatFault(d.store, "u", "honest-failure");
    expect(await d.store.getFaults("u")).toMatchObject({ profile: "lost_ack" });
    await applyBeatFault(d.store, "u", "basic");
    expect(await d.store.getFaults("u")).toMatchObject({ profile: "none" });
  });
});

describe("the naive scripted run", () => {
  // The demo's whole argument: the memory-only column passes the easy beat,
  // half-fails the medium one, and leaves the house untouched on the big one.
  it("leaves exactly the damage the checks expect, beat by beat", async () => {
    const d = deps();
    const expected: Record<string, [number, number]> = {
      basic: [2, 2],
      medium: [1, 3],
      complex: [0, 5],
    };
    for (const id of ["basic", "medium", "complex"]) {
      await applyNaiveEffects(d.store, "u", id);
      const res = await assertBeat(d.store, d, "u", id, "left");
      const [pass, total] = expected[id];
      expect(res).toHaveLength(total);
      expect(res.filter((r) => r.pass)).toHaveLength(pass);
    }
  });

  it("writes ground state raw: no receipt, no proof", async () => {
    const d = deps();
    await applyNaiveEffects(d.store, "u", "basic");
    expect(await d.store.getDevice("u", "coffee_maker")).toMatchObject({
      power: "off",
    });
    expect(await d.receipts.latest("u", "set_device_state")).toBeFalsy();
  });

  it("adds shopping items without consulting rules", async () => {
    const d = deps();
    await applyNaiveEffects(d.store, "u", "medium");
    expect(await d.store.listItems("u", "shopping")).toEqual([
      "Oat Milk",
      "Peanut Butter",
    ]);
  });

  it("claims success and proves nothing on the honest-failure beat", async () => {
    const d = deps();
    await d.store.setDevice("u", "hall_light", { power: "on" });
    await applyNaiveEffects(d.store, "u", "honest-failure");
    // The light never moved; the canned reply says it is off.
    expect(await d.store.getDevice("u", "hall_light")).toMatchObject({
      power: "on",
    });
    const left = await assertBeat(d.store, d, "u", "honest-failure", "left");
    expect(left).toEqual([]);
  });
});

describe("assertBeat", () => {
  it("device assertions pass/fail against ground state", async () => {
    const d = deps();
    await d.store.setDevice("u", "coffee_maker", { power: "off" });
    await d.store.setDevice("u", "kitchen_light", { power: "off" });
    const pass = await assertBeat(d.store, d, "u", "basic", "left");
    expect(pass).toHaveLength(2);
    expect(pass.every((r) => r.pass)).toBe(true);
    // …and fails honestly once a light really is on.
    await d.store.setDevice("u", "kitchen_light", { power: "on" });
    const fail = await assertBeat(d.store, d, "u", "basic", "left");
    expect(fail.some((r) => !r.pass)).toBe(true);
    expect(fail[1].detail).toContain("on");
  });

  it("receipt assertions read latest receipt by tool", async () => {
    const d = deps();
    const none = await assertBeat(d.store, d, "u", "honest-failure", "right");
    expect(none[0]).toMatchObject({
      pass: false,
      detail: "no receipt yet",
    });
    await d.receipts.insert({
      userId: "u",
      tool: "set_device_state",
      idempotencyKey: "k",
      args: {},
      decision: {},
      expectation: {},
      observed: {},
      outcome: "unverified",
      say: "I could not confirm that.",
      attempts: 2,
      latencyMs: 1,
    });
    const now = await assertBeat(d.store, d, "u", "honest-failure", "right");
    expect(now[0]).toMatchObject({ pass: true, detail: "latest=unverified" });
  });

  it("shopping-excludes fails when a violating item is present", async () => {
    const d = deps();
    const clean = await assertBeat(d.store, d, "u", "medium", "left");
    const excludes = clean.find((r) =>
      r.description.startsWith("shopping excludes"),
    );
    expect(excludes?.pass).toBe(true); // empty list excludes everything
    await d.store.applyListOps("u", "shopping", [
      { op: "add", item: "Peanut Butter" },
    ]);
    const dirty = await assertBeat(d.store, d, "u", "medium", "left");
    expect(
      dirty.find((r) => r.description.startsWith("shopping excludes")),
    ).toMatchObject({ pass: false });
  });

  it("shopping-contains needs every item, not just one", async () => {
    const d = deps();
    await d.store.applyListOps("u", "shopping", [
      { op: "add", item: "Oat Milk" },
    ]);
    const res = await assertBeat(d.store, d, "u", "complex", "left");
    const contains = res.find((r) =>
      r.description.startsWith("shopping contains"),
    );
    expect(contains?.pass).toBe(false); // bread is still missing
  });

  it("rejects unknown beats and phases", async () => {
    const d = deps();
    await expect(assertBeat(d.store, d, "u", "nope", "left")).rejects.toThrow(
      /unknown beat/,
    );
  });
});
