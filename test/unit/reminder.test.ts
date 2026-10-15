import { describe, expect, it } from "vitest";
import { delayUntil } from "../../src/tools/actions.js";

// 2026-10-09T20:00:00Z = 21:00 in Africa/Lagos (UTC+1).
const NOW = new Date("2026-10-09T20:00:00Z");
const H = 3600000;

describe("delayUntil", () => {
  it("computes later-today and tomorrow delays in home tz", () => {
    expect(delayUntil("Africa/Lagos", "today", "22:00", NOW)).toBe(H);
    expect(delayUntil("Africa/Lagos", "tomorrow", "07:00", NOW)).toBe(10 * H);
  });
  it("rolls past times forward a day", () => {
    // 21:00 Lagos, "today 20:00" is past -> tomorrow 20:00 = 23h.
    expect(delayUntil("Africa/Lagos", "today", "20:00", NOW)).toBe(23 * H);
  });
  it("rejects bad input and bad zones", () => {
    expect(delayUntil("Africa/Lagos", "today", "9pm", NOW)).toBeNull();
    expect(delayUntil("Africa/Lagos", "today", "25:00", NOW)).toBeNull();
    expect(delayUntil("Nope/Nowhere", "today", "22:00", NOW)).toBeNull();
  });
});
