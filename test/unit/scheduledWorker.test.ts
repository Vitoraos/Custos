import { describe, expect, it } from "vitest";
import { runDueScheduledActions } from "../../src/core/scheduledWorker.js";
import { MemoryStore } from "../../src/storage/store.js";

describe("scheduled action worker", () => {
  it("executes due twin actions and verifies the observed state", async () => {
    const store = new MemoryStore();
    await store.setDevice("tenant-a", "hall_light", { power: "off" });
    const scheduled = await store.createScheduledAction({
      userId: "tenant-a",
      runId: "run-worker",
      idempotencyKey: "worker-test-key-123",
      target: "hall_light",
      desiredState: { power: "on" },
      timezone: "Africa/Lagos",
      localScheduledAt: "2026-10-20T13:25",
      scheduledAt: "2026-10-20T12:25:00.000Z",
      status: "scheduled",
      evidence: {},
    });
    const result = await runDueScheduledActions(
      store,
      new Date("2026-10-20T12:26:00.000Z"),
    );
    expect(result).toEqual({
      claimed: 1,
      verified: 1,
      unverified: 0,
      failed: 0,
    });
    expect((await store.getDevice("tenant-a", "hall_light"))?.power).toBe("on");
    const saved = await store.listScheduledActions("tenant-a", "run-worker");
    expect(saved[0].id).toBe(scheduled.id);
    expect(saved[0].status).toBe("verified");
    expect(saved[0].evidence.observed).toEqual({ power: "on" });
  });

  it("keeps execution state isolated by tenant", async () => {
    const store = new MemoryStore();
    await store.setDevice("tenant-a", "hall_light", { power: "off" });
    await store.setDevice("tenant-b", "hall_light", { power: "off" });
    await store.createScheduledAction({
      userId: "tenant-b",
      runId: "run-worker",
      idempotencyKey: "other-tenant-key-123",
      target: "hall_light",
      desiredState: { power: "on" },
      timezone: "Africa/Lagos",
      localScheduledAt: "2026-10-20T13:25",
      scheduledAt: "2026-10-20T12:25:00.000Z",
      status: "scheduled",
      evidence: {},
    });
    const result = await runDueScheduledActions(
      store,
      new Date("2026-10-20T12:26:00.000Z"),
    );
    expect(result.claimed).toBe(1);
    expect((await store.getDevice("tenant-a", "hall_light"))?.power).toBe(
      "off",
    );
    expect((await store.getDevice("tenant-b", "hall_light"))?.power).toBe("on");
    expect((await store.listScheduledActions("tenant-b"))[0].status).toBe(
      "verified",
    );
  });
});
