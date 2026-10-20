import { describe, expect, it } from "vitest";
import {
  MCP_INSTRUCTIONS,
  PLANNER_SYSTEM_PROMPT,
} from "../../src/core/assistantPrompt.js";

describe("household assistant prompt", () => {
  it("keeps host instructions compact and aligned with the enforcement boundary", () => {
    expect(MCP_INSTRUCTIONS.length).toBeLessThan(1_500);
    expect(MCP_INSTRUCTIONS).toContain("get_standing_rules");
    expect(MCP_INSTRUCTIONS).toContain("verified_after_retry");
    expect(MCP_INSTRUCTIONS).toContain("untrusted");
  });

  it("retrieves context selectively before planning and executing", () => {
    expect(PLANNER_SYSTEM_PROMPT.length).toBeLessThan(5_000);
    expect(PLANNER_SYSTEM_PROMPT).toContain("call get_standing_rules first");
    expect(PLANNER_SYSTEM_PROMPT).toContain("smallest sufficient context");
    expect(PLANNER_SYSTEM_PROMPT).toContain(
      "Execute authorized steps with tools",
    );
    expect(PLANNER_SYSTEM_PROMPT).toContain("Never infer success");
    expect(PLANNER_SYSTEM_PROMPT).toContain("Do not invent preferences");
  });

  it("distinguishes future schedules from completed and verified actions", () => {
    expect(PLANNER_SYSTEM_PROMPT).toContain(
      "A schedule being saved does not mean",
    );
    expect(PLANNER_SYSTEM_PROMPT).toContain("Follow confirmation gates");
  });
});
