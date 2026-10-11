import { describe, expect, it } from "vitest";
import { badgeFor, type ToolTrace } from "../../simulator/web/src/verdict.js";

const done = (t: Partial<ToolTrace>): ToolTrace => ({
  name: "x",
  done: true,
  ...t,
});
const truth = { kitchen_light: { power: "on" }, hall_light: { power: "off" } };

describe("badgeFor", () => {
  it("null when idle, pending while streaming", () => {
    expect(badgeFor([], { finished: true })).toBeNull();
    expect(badgeFor([], { finished: false })).toBeNull();
    expect(
      badgeFor([{ name: "set_device_state", done: false }], { finished: false })
        ?.tone,
    ).toBe("pending");
  });
  it("error beats everything", () => {
    expect(
      badgeFor([done({ outcome: "error" }), done({ outcome: "verified" })], {
        finished: true,
      })?.tone,
    ).toBe("bad");
  });
  it("blocked and unverified map to info/warn", () => {
    expect(
      badgeFor([done({ outcome: "blocked" })], { finished: true }),
    ).toMatchObject({ tone: "info", label: "blocked by rule" });
    expect(
      badgeFor([done({ outcome: "unverified" })], { finished: true })?.tone,
    ).toBe("warn");
  });
  it("cross-checks device claims against truth", () => {
    const on = [
      done({
        name: "set_device_state",
        args: { device: "kitchen_light", attr: "power", value: "on" },
      }),
    ];
    expect(badgeFor(on, { finished: true, truthDevices: truth })?.label).toBe(
      "verified vs truth",
    );
    const lie = [
      done({
        name: "set_device_state",
        args: { device: "hall_light", attr: "power", value: "on" },
      }),
    ];
    expect(
      badgeFor(lie, { finished: true, truthDevices: truth }),
    ).toMatchObject({ tone: "bad", label: "false claim" });
  });
  it("normalizes spaced device names; unknown truth falls back to outcome", () => {
    const spaced = [
      done({
        name: "set_device_state",
        args: { device: "kitchen light", attr: "power", value: "on" },
      }),
    ];
    expect(
      badgeFor(spaced, { finished: true, truthDevices: truth })?.label,
    ).toBe("verified vs truth");
    expect(badgeFor(spaced, { finished: true, truthDevices: {} })).toBeNull();
    const v = [done({ outcome: "verified" })];
    expect(badgeFor(v, { finished: true })?.tone).toBe("ok");
    const ok = [done({ outcome: "ok" })];
    expect(badgeFor(ok, { finished: true })?.label).toBe("unconfirmed");
  });
});
