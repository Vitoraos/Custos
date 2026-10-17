// Plain-language rendering of tool steps: turn machinery into words anyone
// can read. Pure functions (no React) — tested in test/unit/timeline.test.ts.
import type { StepState } from "./steps.js";

const LABELS: Record<string, string> = {
  find_recipe: "Finding a safe recipe",
  get_pantry: "Checking the pantry",
  get_weather: "Checking the weather",
  get_headlines: "Checking the news",
  get_standing_rules: "Reading the standing rules",
  set_device_state: "Setting the device",
  set_reminder: "Setting a reminder",
  update_shopping_list: "Updating the shopping list",
  remember_rule: "Remembering a rule",
  forget_memory: "Forgetting a memory",
  confirm_action: "Confirming an action",
  explain_last_action: "Checking the record",
};

export function toolLabel(tool: string): string {
  if (LABELS[tool]) return LABELS[tool];
  const words = tool.replaceAll("_", " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function stateWord(state: StepState): string {
  switch (state) {
    case "working":
      return "working…";
    case "done":
      return "done";
    case "failed":
      return "couldn't do it";
    case "pending":
      return "needs your OK";
  }
}
