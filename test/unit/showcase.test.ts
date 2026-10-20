import { describe, expect, it } from "vitest";
import { runShowcase } from "../../simulator/api/showcase.js";
import { MemoryStore } from "../../src/storage/store.js";

describe("one-run showcase", () => {
  it("persists two schedules, enforces Maya's beef allergy, and discloses simulation", async () => {
    const result = await runShowcase(new MemoryStore());
    expect(result.prompt).toContain("hall light 5 minutes");
    expect(result.disclosure).toContain("not a live Alexa+ integration");
    expect(result.rules.map((r) => r.summary)).toContain(
      "School ends at 1:30 PM",
    );
    expect(result.custos.actions[0].status).toBe("scheduled");
    expect(result.custos.actions[1].localTime?.endsWith("T13:25")).toBe(true);
    expect(result.custos.actions[2].status).toBe("policy verified");
    expect(result.custos.receipts).toHaveLength(4);
    expect(result.deviceTruth.custos.hall_light.power).toBe("off");
    expect(result.note).toContain(
      "Executed and verified device state are separate",
    );
  });

  it("creates a clean run on repeat", async () => {
    const store = new MemoryStore();
    const first = await runShowcase(store);
    const second = await runShowcase(store);
    expect(second.runId).not.toBe(first.runId);
    expect(second.custos.actions[0].recordId).not.toBe(
      first.custos.actions[0].recordId,
    );
  });
});
