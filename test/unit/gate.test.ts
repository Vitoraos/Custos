import { describe, expect, it } from "vitest";
import { gateFinal, recipeOutcome } from "../../simulator/api/agent.js";
import type { Constraint } from "../../src/core/constraints.js";
import { evaluate, type ProposedAction } from "../../src/core/policy.js";

const BLOCK_SAY =
  'Every candidate conflicts with a standing rule. Household rule (vegan): "Beef" conflicts (beef).';
const OK_SAY = "Vegan Pasta Primavera. Checked against your rules.";

describe("recipeOutcome", () => {
  it("reads the picked recipe from the ok say", () => {
    expect(recipeOutcome(OK_SAY)).toEqual({
      blocked: false,
      picked: "Vegan Pasta Primavera",
      say: OK_SAY,
    });
  });
  it("flags the block say, with no pick", () => {
    const o = recipeOutcome(BLOCK_SAY);
    expect(o?.blocked).toBe(true);
    expect(o?.picked).toBeUndefined();
  });
  it("no signal on empty text (SDK dropped the say)", () => {
    expect(recipeOutcome("")).toBeNull();
    expect(recipeOutcome("   ")).toBeNull();
  });
});

describe("gateFinal — surfaced recipe must equal the tool's pick", () => {
  // The exact recorded failure: forge called find_recipe("Jiggs Dinner"),
  // the tool blocked it, yet the model voiced Jiggs Dinner anyway.
  it("overrides a confabulated blocked recipe (the Jiggs Dinner fault)", () => {
    const blocked = recipeOutcome(BLOCK_SAY) as NonNullable<
      ReturnType<typeof recipeOutcome>
    >;
    const model =
      "I found Jiggs Dinner, which serves four and fits your current rules. Would you like the ingredient list or instructions?";
    const out = gateFinal(model, blocked);
    expect(out).not.toContain("Jiggs Dinner");
    expect(out).toBe(BLOCK_SAY);
  });
  it("keeps a final that names the tool's picked recipe", () => {
    const ok = recipeOutcome(OK_SAY);
    const model =
      "I found one recipe that matches: Vegan Pasta Primavera. Want the ingredients?";
    expect(gateFinal(model, ok)).toBe(model);
  });
  it("overrides a final naming a different recipe than the pick", () => {
    const ok = recipeOutcome(OK_SAY);
    expect(gateFinal("How about Jiggs Dinner?", ok)).toBe(OK_SAY);
  });
  it("passes through when no recipe tool ran", () => {
    expect(gateFinal("Lights are on.", null)).toBe("Lights are on.");
  });
});

describe("engine: Jiggs Dinner is blocked for a vegan household", () => {
  const vegan = {
    kind: "diet",
    value: "vegan",
    profile: "household",
    source: "user_voice",
    createdAt: new Date("2026-10-06T20:00:00Z").toISOString(),
    id: "r1",
  } as unknown as Constraint;
  const jiggs: ProposedAction = {
    type: "recipe",
    name: "Jiggs Dinner",
    ingredients: ["Beef", "Potatoes", "Carrots", "Butter"],
    servingFor: ["household"],
  };
  it("returns block, so the candidate lands in excluded — never picked", () => {
    const e = evaluate([vegan], jiggs, {
      now: new Date("2026-10-06T20:00:00Z"),
      profiles: ["household"],
    });
    expect(e.verdict).toBe("block");
  });
});
