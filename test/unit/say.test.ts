import { describe, expect, it } from "vitest";
import {
  sayBlocked,
  sayNeedsConfirmation,
  sayReadback,
  sayUnverified,
  sayUnsupported,
  sayVerified,
} from "../../src/core/say.js";

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

describe("spoken summaries", () => {
  it("keeps success, retry, confirmation, and unsupported messages within 25 words", () => {
    expect(words(sayVerified("The kitchen light is on"))).toBeLessThanOrEqual(25);
    expect(words(sayNeedsConfirmation("Unlock the front door"))).toBeLessThanOrEqual(25);
    expect(words(sayUnsupported("A very long unsupported operation description ".repeat(10)))).toBeLessThanOrEqual(25);
  });

  it("caps long readbacks and verification failures", () => {
    expect(words(sayReadback("important detail ".repeat(40)))).toBeLessThanOrEqual(25);
    expect(words(sayUnverified("important action ".repeat(20), "the device ".repeat(20)))).toBeLessThanOrEqual(25);
  });

  it("caps long policy explanations without losing the blocked outcome", () => {
    const result = sayBlocked([
      { constraintId: "c1", text: "A detailed safety explanation ".repeat(30) },
      { constraintId: "c2", text: "Another detailed safety explanation ".repeat(30) },
    ]);
    expect(result.startsWith("I did not do that.")).toBe(true);
    expect(words(result)).toBeLessThanOrEqual(25);
  });
});
