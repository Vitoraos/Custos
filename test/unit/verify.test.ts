import { describe, expect, it } from "vitest";
import type { Constraint } from "../../src/core/constraints.js";
import { MemoryReceipts } from "../../src/core/receipts.js";
import {
  type ActionSpec,
  MemoryConfirms,
  type RunContext,
  runAction,
} from "../../src/core/verify.js";
import { type FakeDeviceCmd, FakeDeviceTwin } from "../fakes/devices.js";

interface LightArgs {
  device: string;
  value: string;
}
function spec(
  twin: FakeDeviceTwin,
  risk: "low" | "high" = "low",
): ActionSpec<LightArgs, FakeDeviceCmd, { power: string }> {
  return {
    name: "set_device_state",
    risk,
    adapter: twin,
    toPolicyAction: (a) => ({
      type: "device_set",
      device: a.device,
      attr: "power",
      value: a.value,
      at: new Date(),
    }),
    toCommand: (a) => ({ device: a.device, value: a.value }),
    target: (a) => a.device,
    expected: (a) => (s) => s.power === a.value,
    verifiedWhat: (a) => `The ${a.device} is ${a.value}`,
    unverifiedObserved: (a) => `the ${a.device} still shows otherwise`,
    confirmWhat: (a) => `Set the ${a.device} to ${a.value}`,
  };
}
const base = (
  rules: Constraint[] = [],
  twin?: FakeDeviceTwin,
): { ctx: RunContext; twin: FakeDeviceTwin } => {
  const t = twin ?? new FakeDeviceTwin();
  return {
    twin: t,
    ctx: {
      userId: "u1",
      mode: "forge",
      rules,
      profiles: ["household"],
      now: new Date(),
      receipts: new MemoryReceipts(),
      confirms: new MemoryConfirms(),
    },
  };
};
const peanutRule = {
  id: "c1",
  profile: "household",
  kind: "allergen",
  allergen: "peanut",
  severity: "severe",
  source: "user_voice",
  createdAt: new Date().toISOString(),
} as unknown as Constraint;

describe("runAction", () => {
  it("verified happy path with receipt", async () => {
    const { ctx, twin } = base();
    const r = await runAction(
      spec(twin),
      { device: "kitchen_light", value: "on" },
      ctx,
    );
    expect(r.outcome).toBe("verified");
    expect(r.say).toContain("kitchen_light is on");
    expect(r.receiptId).toBeDefined();
    expect(r.evidence?.source).toBe("fake-twin");
  });
  it("delayed device verifies within the poll budget", async () => {
    const { ctx, twin } = base([], new FakeDeviceTwin("ok", 1, 500));
    const r = await runAction(
      spec(twin),
      { device: "kitchen_light", value: "on" },
      ctx,
    );
    expect(r.outcome).toBe("verified");
  });
  it("lost_ack recovers via the single retry", async () => {
    const twin = new FakeDeviceTwin("lost_ack");
    // First write is lost; make the retry stick by healing after one write.
    const orig = twin.write.bind(twin);
    let calls = 0;
    twin.write = async (u, c, k) => {
      calls++;
      if (calls === 1) return orig(u, c, k); // lost
      twin.set(c.device, c.value);
      return { ackId: "ack-healed" };
    };
    const { ctx } = base([], twin);
    const r = await runAction(
      spec(twin),
      { device: "kitchen_light", value: "on" },
      ctx,
    );
    expect(r.outcome).toBe("verified_after_retry");
    expect(r.say).toContain("retry");
  });
  it("persistent failure reports unverified honestly", async () => {
    const { ctx, twin } = base([], new FakeDeviceTwin("lost_ack"));
    const r = await runAction(
      spec(twin),
      { device: "kitchen_light", value: "on" },
      ctx,
    );
    expect(r.outcome).toBe("unverified");
    expect(r.say).toContain("could not confirm");
  });
  it("offline adapter reports error", async () => {
    const { ctx, twin } = base([], new FakeDeviceTwin("offline"));
    const r = await runAction(
      spec(twin),
      { device: "kitchen_light", value: "on" },
      ctx,
    );
    expect(r.outcome).toBe("error");
  });
  it("policy block short-circuits before any write", async () => {
    const writes = { count: 0 };
    const shopping: ActionSpec<
      { items: string[] },
      { items: string[] },
      { count: number }
    > = {
      name: "update_shopping_list",
      risk: "low",
      adapter: {
        name: "fake-lists",
        write: async () => {
          writes.count++;
          return { ackId: "x" };
        },
        read: async () => ({ count: 0 }),
      },
      toPolicyAction: (a) => ({ type: "shopping_add", items: a.items }),
      toCommand: (a) => ({ items: a.items }),
      target: () => "shopping",
      expected: () => () => true,
      verifiedWhat: () => "Shopping list updated",
      unverifiedObserved: () => "the list is unchanged",
      confirmWhat: () => "Update the shopping list",
    };
    const { ctx } = base([peanutRule]);
    const r = await runAction(shopping, { items: ["peanut oil"] }, ctx);
    expect(r.outcome).toBe("blocked");
    expect(r.reasons?.[0].constraintId).toBe("c1");
    expect(writes.count).toBe(0);
  });
  it("high-risk needs confirmation; token is single-use and arg-bound", async () => {
    const twin = new FakeDeviceTwin();
    const { ctx } = base([], twin);
    const s = spec(twin, "high");
    const args = { device: "front_door_lock", value: "unlock" };
    const first = await runAction(s, args, { ...ctx, minuteBucket: "b1" });
    expect(first.outcome).toBe("needs_confirmation");
    expect(first.confirmToken).toBeDefined();
    const second = await runAction(s, args, {
      ...ctx,
      minuteBucket: "b1",
      confirmToken: first.confirmToken,
    });
    expect(second.outcome).toBe("verified");
    // Same token, fresh idempotency scope: single-use, so it is rejected.
    const replay = await runAction(s, args, {
      ...ctx,
      minuteBucket: "b2",
      confirmToken: first.confirmToken,
    });
    expect(replay.outcome).toBe("needs_confirmation");
    // Token minted for other args does not authorize this call.
    const other = await runAction(
      s,
      { device: "kitchen_light", value: "on" },
      { ...ctx, minuteBucket: "b3" },
    );
    const cross = await runAction(s, args, {
      ...ctx,
      minuteBucket: "b4",
      confirmToken: other.confirmToken,
    });
    expect(cross.outcome).toBe("needs_confirmation");
  });
  it("idempotent replay returns the same receipt without re-writing", async () => {
    const twin = new FakeDeviceTwin();
    const { ctx } = base([], twin);
    const s = spec(twin);
    const args = { device: "kitchen_light", value: "on" };
    const first = await runAction(s, args, { ...ctx, minuteBucket: "fixed" });
    const writes = twin.writes;
    const second = await runAction(s, args, { ...ctx, minuteBucket: "fixed" });
    expect(second.outcome).toBe("verified");
    expect(second.receiptId).toBe(first.receiptId);
    expect(second.say).toBe(first.say);
    expect(twin.writes).toBe(writes);
  });
  it("concurrent identical calls create a single receipt", async () => {
    const twin = new FakeDeviceTwin();
    const { ctx } = base([], twin);
    const s = spec(twin);
    const args = { device: "kitchen_light", value: "on" };
    const shared = { ...ctx, minuteBucket: "shared" };
    const [a, b] = await Promise.all([
      runAction(s, args, shared),
      runAction(s, args, shared),
    ]);
    expect(a.receiptId).toBe(b.receiptId);
  });
  it("baseline mode returns raw ack without guard or verification", async () => {
    const twin = new FakeDeviceTwin("lost_ack"); // would be unverified in forge
    const { ctx } = base([peanutRule], twin);
    const r = await runAction(
      spec(twin),
      { device: "kitchen_light", value: "on" },
      { ...ctx, mode: "baseline" },
    );
    expect(r.outcome).toBe("ok");
  });
});
