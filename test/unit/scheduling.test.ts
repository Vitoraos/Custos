import { describe, expect, it } from "vitest";
import { localToInstant } from "../../src/tools/scheduling.js";
import { MemoryStore } from "../../src/storage/store.js";

describe("localToInstant", () => {
  it("normalizes Lagos wall time to UTC", () => {
    expect(
      localToInstant("2026-10-20T13:25", "Africa/Lagos")?.toISOString(),
    ).toBe("2026-10-20T12:25:00.000Z");
  });
  it("supports a different timezone", () => {
    expect(
      localToInstant("2026-01-15T09:00", "Europe/London")?.toISOString(),
    ).toBe("2026-01-15T09:00:00.000Z");
  });
  it("rejects malformed dates, impossible dates, invalid zones and DST gaps", () => {
    expect(localToInstant("not-a-date", "UTC")).toBeNull();
    expect(localToInstant("2026-02-30T09:00", "UTC")).toBeNull();
    expect(localToInstant("2026-01-15T09:00", "Not/AZone")).toBeNull();
    expect(localToInstant("2026-03-29T01:30", "Europe/London")).toBeNull();
  });
});

describe("scheduled action storage", () => {
  const record = (userId: string, key: string) => ({
    userId,
    runId: "run-1",
    idempotencyKey: key,
    target: "hall_light",
    desiredState: { power: "on" },
    timezone: "Africa/Lagos",
    localScheduledAt: "2026-10-20T13:25",
    scheduledAt: "2026-10-20T12:25:00.000Z",
    status: "scheduled" as const,
    evidence: { persisted: true },
  });

  it("is tenant-scoped and idempotent for identical requests", async () => {
    const store = new MemoryStore();
    const first = await store.createScheduledAction(
      record("tenant-a", "stable-key-123"),
    );
    const retry = await store.createScheduledAction(
      record("tenant-a", "stable-key-123"),
    );
    expect(retry.id).toBe(first.id);
    expect(await store.listScheduledActions("tenant-a")).toHaveLength(1);
    expect(await store.listScheduledActions("tenant-b")).toHaveLength(0);
  });

  it("rejects reusing an idempotency key for a different action", async () => {
    const store = new MemoryStore();
    await store.createScheduledAction(record("tenant-a", "stable-key-123"));
    await expect(
      store.createScheduledAction({
        ...record("tenant-a", "stable-key-123"),
        target: "coffee_maker",
      }),
    ).rejects.toThrow("idempotency key reused");
  });

  it("keeps scheduled, executed and verified as distinct statuses", async () => {
    const store = new MemoryStore();
    const created = await store.createScheduledAction(
      record("tenant-a", "stable-key-123"),
    );
    expect(created.status).toBe("scheduled");
    const executed = await store.updateScheduledAction(
      "tenant-a",
      created.id,
      "executed",
      { deviceState: { power: "on" } },
    );
    expect(executed?.status).toBe("executed");
    expect(executed?.evidence.deviceState).toEqual({ power: "on" });
    expect(
      await store.updateScheduledAction("other-tenant", created.id, "verified"),
    ).toBeNull();
  });
});
