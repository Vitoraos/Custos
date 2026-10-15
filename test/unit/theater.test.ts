import { describe, expect, it } from "vitest";
import {
  applyBeatFault,
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
  it("lists beats with captions and inputs", () => {
    const beats = listBeats();
    expect(beats.map((b) => b.id)).toEqual([
      "both-pass",
      "alexa-fails",
      "dinner-showcase",
      "receipt",
      "end-card",
    ]);
    expect(THEATER_DISCLAIMER).toMatch(/simulated/i);
  });

  it("scripted Alexa replies are fixed verbatim", () => {
    const beat = getBeat("alexa-fails");
    expect(beat?.alexa.map((e) => e.text).join("")).toContain(
      "Done! Kitchen light is on",
    );
    expect(getBeat("nope")).toBeUndefined();
  });

  it("applyBeatFault sets and clears faults", async () => {
    const d = deps();
    await applyBeatFault(d.store, "u", "alexa-fails");
    expect(await d.store.getFaults("u")).toMatchObject({ profile: "lost_ack" });
    await applyBeatFault(d.store, "u", "both-pass");
    expect(await d.store.getFaults("u")).toMatchObject({ profile: "none" });
  });
});

describe("assertBeat", () => {
  it("device assertions pass/fail against ground state", async () => {
    const d = deps();
    await d.store.setDevice("u", "hall_light", { power: "on" });
    const pass = await assertBeat(d.store, d, "u", "both-pass", "left");
    expect(pass).toHaveLength(1);
    expect(pass[0]).toMatchObject({ pass: true });
    // unequals holds vacuously when nothing was ever written…
    const vacuous = await assertBeat(d.store, d, "u", "alexa-fails", "left");
    expect(vacuous[0].pass).toBe(true);
    // …and fails honestly once the light really is on.
    await d.store.setDevice("u", "kitchen_light", { power: "on" });
    const fail = await assertBeat(d.store, d, "u", "alexa-fails", "left");
    expect(fail[0].pass).toBe(false);
    expect(fail[0].detail).toContain("on");
  });

  it("receipt assertions read latest receipt by tool", async () => {
    const d = deps();
    const none = await assertBeat(d.store, d, "u", "dinner-showcase", "right");
    expect(none.find((r) => r.description.startsWith("latest"))).toMatchObject({
      pass: false,
      detail: "no receipt yet",
    });
    await d.receipts.insert({
      userId: "u",
      tool: "find_recipe",
      idempotencyKey: "k",
      args: {},
      decision: {},
      expectation: {},
      observed: {},
      outcome: "ok",
      say: "pasta",
      attempts: 1,
      latencyMs: 1,
    });
    const now = await assertBeat(d.store, d, "u", "dinner-showcase", "right");
    expect(now.find((r) => r.description.startsWith("latest"))).toMatchObject({
      pass: true,
    });
  });

  it("shopping-excludes fails when a violating item is present", async () => {
    const d = deps();
    const clean = await assertBeat(d.store, d, "u", "dinner-showcase", "right");
    const excludes = clean.find((r) =>
      r.description.startsWith("shopping excludes"),
    );
    expect(excludes?.pass).toBe(true); // empty list excludes everything
    await d.store.applyListOps("u", "shopping", [
      { op: "add", item: "Peanut Oil" },
    ]);
    const dirty = await assertBeat(d.store, d, "u", "dinner-showcase", "right");
    expect(
      dirty.find((r) => r.description.startsWith("shopping excludes")),
    ).toMatchObject({
      pass: false,
    });
  });

  it("rejects unknown beats and phases", async () => {
    const d = deps();
    await expect(assertBeat(d.store, d, "u", "nope", "left")).rejects.toThrow(
      /unknown beat/,
    );
  });
});
