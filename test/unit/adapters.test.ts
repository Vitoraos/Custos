import { describe, expect, it } from "vitest";
import { DeviceTwin } from "../../src/adapters/devices/twin.js";
import { ShoppingLists } from "../../src/adapters/lists.js";
import { MemoryStore } from "../../src/storage/store.js";

describe("DeviceTwin", () => {
  it("applies writes and reads them back", async () => {
    const t = new DeviceTwin(new MemoryStore());
    await t.write(
      "u",
      { device: "kitchen_light", attr: "power", value: "on" },
      "k1",
    );
    expect(await t.read("u", "kitchen_light")).toEqual({ power: "on" });
  });
  it("lost_ack acks without applying", async () => {
    const store = new MemoryStore();
    await store.setFaults("u", {
      profile: "lost_ack",
      params: { p: 1, seed: 7 },
    });
    const t = new DeviceTwin(store);
    const ack = await t.write(
      "u",
      { device: "kitchen_light", attr: "power", value: "on" },
      "k1",
    );
    expect(ack.ackId).toBeDefined();
    expect(await t.read("u", "kitchen_light")).toEqual({});
  });
  it("offline throws", async () => {
    const store = new MemoryStore();
    await store.setFaults("u", {
      profile: "offline",
      params: { p: 1, seed: 7 },
    });
    await expect(
      new DeviceTwin(store).write(
        "u",
        { device: "kitchen_light", attr: "power", value: "on" },
        "k1",
      ),
    ).rejects.toThrow();
  });
  it("delayed applies after ms", async () => {
    const store = new MemoryStore();
    await store.setFaults("u", { profile: "delayed", params: { ms: 100 } });
    const t = new DeviceTwin(store);
    await t.write(
      "u",
      { device: "kitchen_light", attr: "power", value: "on" },
      "k1",
    );
    expect(await t.read("u", "kitchen_light")).toEqual({});
    await new Promise((r) => setTimeout(r, 250));
    expect(await t.read("u", "kitchen_light")).toEqual({ power: "on" });
  });
  it("isolates users", async () => {
    const t = new DeviceTwin(new MemoryStore());
    await t.write(
      "a",
      { device: "kitchen_light", attr: "power", value: "on" },
      "k1",
    );
    expect(await t.read("b", "kitchen_light")).toEqual({});
  });
});

describe("ShoppingLists", () => {
  it("adds idempotently, removes, dedupes case/punctuation", async () => {
    const l = new ShoppingLists(new MemoryStore());
    await l.write(
      "u",
      {
        list: "shopping",
        ops: [
          { op: "add", item: "Peanut Oil!" },
          { op: "add", item: "peanut oil" },
        ],
      },
      "k1",
    );
    expect(await l.read("u", "shopping")).toEqual(["Peanut Oil!"]);
    await l.write(
      "u",
      { list: "shopping", ops: [{ op: "remove", item: "PEANUT oil" }] },
      "k2",
    );
    expect(await l.read("u", "shopping")).toEqual([]);
  });
});
