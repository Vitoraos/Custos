import { describe, expect, it } from "vitest";
import type { Constraint } from "../../src/core/constraints.js";
import {
  shoppingSummaryText,
  shouldNotifyShopping,
} from "../../src/tools/actions.js";

// 2026-10-06T20:00:00Z = 21:00 Lagos.
const NOW = new Date("2026-10-06T20:00:00Z");

let n = 0;
const quietHours = (
  start: string,
  end: string,
  applies: ("lights" | "notifications" | "audio")[],
): Constraint =>
  ({
    id: `c${++n}`,
    kind: "quiet_hours",
    start,
    end,
    tz: "Africa/Lagos",
    applies,
    profile: "household",
    source: "explicit",
    createdAt: NOW.toISOString(),
  }) as unknown as Constraint;

describe("shoppingSummaryText", () => {
  it("summarizes the whole built list in one line", () => {
    expect(shoppingSummaryText(["pasta", "tomatoes"])).toBe(
      "Shopping list updated: pasta, tomatoes",
    );
  });
});

describe("shouldNotifyShopping", () => {
  it("notifies with no rules or outside quiet hours", () => {
    expect(shouldNotifyShopping([], NOW)).toBe(true);
    expect(
      shouldNotifyShopping(
        [quietHours("23:00", "07:00", ["notifications"])],
        NOW,
      ),
    ).toBe(true);
  });
  it("suppresses during notification quiet hours", () => {
    expect(
      shouldNotifyShopping(
        [quietHours("20:00", "07:00", ["notifications"])],
        NOW,
      ),
    ).toBe(false);
  });
  it("ignores quiet hours scoped to other domains", () => {
    expect(
      shouldNotifyShopping([quietHours("20:00", "07:00", ["lights"])], NOW),
    ).toBe(true);
  });
});
