import { describe, expect, it } from "vitest";
import { MemoryStore } from "../../src/storage/store.js";

describe("MemoryStore isolation and copy semantics", () => {
  it("does not expose mutable device state", async () => {
    const store = new MemoryStore();
    const original = { nested: { value: 1 } };
    await store.setDevice("user", "drone", original);
    original.nested.value = 2;

    const read = await store.getDevice("user", "drone");
    expect(read?.nested).toEqual({ value: 1 });
    (read?.nested as { value: number }).value = 3;
    expect(await store.getDevice("user", "drone")).toEqual({
      nested: { value: 1 },
    });
  });

  it("does not collide when tuple components contain delimiters", async () => {
    const store = new MemoryStore();
    await store.setDevice("a|b", "c", { owner: "first" });
    await store.setDevice("a", "b|c", { owner: "second" });

    expect(await store.getDevice("a|b", "c")).toEqual({ owner: "first" });
    expect(await store.getDevice("a", "b|c")).toEqual({ owner: "second" });
  });

  it("removes normalized duplicates and supports adding the item again", async () => {
    const store = new MemoryStore();
    await store.applyListOps("u", "shopping", [
      { op: "add", item: "Oat Milk" },
      { op: "add", item: "oat milk" },
    ]);
    expect(await store.listItems("u", "shopping")).toEqual(["Oat Milk"]);

    await store.applyListOps("u", "shopping", [
      { op: "remove", item: "OAT MILK" },
      { op: "add", item: "Oat Milk" },
    ]);
    expect(await store.listItems("u", "shopping")).toEqual(["Oat Milk"]);
  });

  it("returns independent memory records and rejects duplicate key hashes", async () => {
    const store = new MemoryStore();
    const record = await store.insertMemory({
      userId: "u",
      profile: "household",
      kind: "fact",
      payload: { kind: "fact", text: "prefers tea" },
      source: "explicit",
      status: "active",
      evidence: null,
      expiresAt: null,
    });
    (record.payload as { text: string }).text = "corrupted";
    expect((await store.getMemory("u", record.id)?.then((m) => m?.payload)) as {
      kind: string;
      text: string;
    }).toEqual({ kind: "fact", text: "prefers tea" });

    const key = {
      userId: "u",
      mode: "forge" as const,
      label: null,
      revokedAt: null,
    };
    await store.insertKey("hash", key);
    await expect(store.insertKey("hash", key)).rejects.toThrow(
      "API key hash already exists",
    );
  });
});
