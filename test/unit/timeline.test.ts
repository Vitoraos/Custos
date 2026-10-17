import { describe, expect, it } from "vitest";
import { stateWord, toolLabel } from "../../simulator/web/src/humanize.js";

describe("toolLabel", () => {
  it("maps known tools to plain English", () => {
    expect(toolLabel("find_recipe")).toBe("Finding a safe recipe");
    expect(toolLabel("set_device_state")).toBe("Setting the device");
    expect(toolLabel("update_shopping_list")).toBe(
      "Updating the shopping list",
    );
  });

  it("falls back to a title-cased, de-underscored name", () => {
    expect(toolLabel("some_new_tool")).toBe("Some new tool");
  });
});

describe("stateWord", () => {
  it("renders every state as readable words", () => {
    expect(stateWord("working")).toBe("working…");
    expect(stateWord("done")).toBe("done");
    expect(stateWord("failed")).toBe("couldn't do it");
    expect(stateWord("pending")).toBe("needs your OK");
  });
});
