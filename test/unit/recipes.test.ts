import { describe, expect, it } from "vitest";
import { pickRecipe } from "../../simulator/api/recipes.js";

const envelope = (recipes: unknown) => ({
  content: [{ type: "text", text: "Pasta." }],
  structuredContent: { outcome: "ok", say: "Pasta.", data: { recipes } },
});

describe("pickRecipe", () => {
  it("returns name + ingredients of the first recipe", () => {
    expect(
      pickRecipe(
        envelope([{ name: "Pasta Primavera", ingredients: ["pasta", "peas"] }]),
      ),
    ).toEqual({ name: "Pasta Primavera", ingredients: ["pasta", "peas"] });
  });
  it("returns null when there is no usable recipe", () => {
    expect(pickRecipe(null)).toBeNull();
    expect(pickRecipe({})).toBeNull();
    expect(pickRecipe(envelope([]))).toBeNull();
    expect(pickRecipe(envelope([{ name: "X" }]))).toBeNull();
    expect(pickRecipe(envelope([{ ingredients: ["x"] }]))).toBeNull();
  });
  it("drops non-string ingredients", () => {
    expect(
      pickRecipe(envelope([{ name: "X", ingredients: ["a", 1, null] }])),
    ).toEqual({ name: "X", ingredients: ["a"] });
  });
});
