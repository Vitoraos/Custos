import { describe, expect, it } from "vitest";
import {
  DEMO_RULE_COUNT,
  seedDemoHousehold,
} from "../../simulator/api/demo.js";
import { MemoryStore } from "../../src/storage/store.js";

// The demo household is the one bundle that must never drift: /sim/demo refuses
// to start a take if any seeded rule fails to load through the policy, and the
// beats assume the starting switch positions.
describe("demo household seed", () => {
  it("loads every seeded rule through the policy", async () => {
    const store = new MemoryStore();
    const s = await seedDemoHousehold(store, "demo");
    expect(s.rules).toBe(DEMO_RULE_COUNT);
    expect(s.constraintsLoaded).toBe(DEMO_RULE_COUNT);
    expect(s.items).toEqual([]);
    expect(s.pantry.length).toBeGreaterThan(0);
  });

  it("starts with the switches the beats expect", async () => {
    const store = new MemoryStore();
    await seedDemoHousehold(store, "demo");
    // Beat 1 switches both of these off; beat 2 switches the hall light on and
    // beat 4 fails to switch it off again.
    expect(await store.getDevice("demo", "coffee_maker")).toMatchObject({
      power: "on",
    });
    expect(await store.getDevice("demo", "kitchen_light")).toMatchObject({
      power: "on",
    });
    expect(await store.getDevice("demo", "hall_light")).toMatchObject({
      power: "off",
    });
    expect(await store.getFaults("demo")).toMatchObject({ profile: "none" });
  });
});
