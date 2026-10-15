import { describe, expect, it } from "vitest";
import { foldSteps } from "../../simulator/web/src/steps.js";

const call = (name: string, args: unknown = {}) => ({
  type: "tool_call",
  name,
  args,
});
const res = (name: string, outcome?: string, say?: string) => ({
  type: "tool_result",
  name,
  outcome,
  say,
});

describe("foldSteps", () => {
  it("tracks working -> done", () => {
    const steps = foldSteps([
      call("get_standing_rules"),
      res("get_standing_rules", "ok"),
    ]);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      tool: "get_standing_rules",
      state: "done",
      attempt: 1,
    });
  });
  it("marks blocked/error/unverified as failed with notes", () => {
    const steps = foldSteps([
      call("find_recipe"),
      res("find_recipe", "blocked", "peanuts!"),
      call("set_device_state"),
      res("set_device_state", "unverified"),
      call("get_weather"),
      res("get_weather", "error"),
    ]);
    expect(steps.map((s) => s.state)).toEqual(["failed", "failed", "failed"]);
    expect(steps[0].note).toBe("peanuts!");
    expect(steps[1].note).toBe("admitted unconfirmed");
  });
  it("detects retry on repeated tool+args, keeps attempt count", () => {
    const a = { device: "kitchen_light" };
    const steps = foldSteps([
      call("set_device_state", a),
      res("set_device_state", "unverified"),
      call("set_device_state", a),
      res("set_device_state", "verified_after_retry"),
    ]);
    expect(steps).toHaveLength(2); // attempt history preserved
    expect(steps[0]).toMatchObject({
      state: "failed",
      attempt: 1,
      note: "admitted unconfirmed",
    });
    expect(steps[1]).toMatchObject({ state: "done", attempt: 2 });
  });
  it("needs_confirmation stays pending waiting on you", () => {
    const steps = foldSteps([
      call("set_device_state"),
      res("set_device_state", "needs_confirmation"),
    ]);
    expect(steps[0]).toMatchObject({
      state: "pending",
      note: "waiting on you",
    });
  });
  it("same tool with different args are separate steps", () => {
    const steps = foldSteps([
      call("remember_rule", { a: 1 }),
      res("remember_rule", "ok"),
      call("remember_rule", { a: 2 }),
    ]);
    expect(steps).toHaveLength(2);
    expect(steps[1].state).toBe("working");
  });
  it("ignores tokens, finals, and orphan results", () => {
    const steps = foldSteps([
      { type: "token", text: "hi" },
      res("ghost", "ok"),
      { type: "final", text: "done" },
    ]);
    expect(steps).toHaveLength(0);
  });
});
