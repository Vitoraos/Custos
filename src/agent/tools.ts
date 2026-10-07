// src/agent/tools.ts — executor tool registry (spec §6.3 v2)
// Plain async functions with Zod schemas: no Strands `tool()` wrapper is needed
// because the executor is deterministic code. With `DEMO_MODE=true` every tool
// returns data from `demo/public/demo-fixtures.json`. `CHAOS` injects R1/R2 failures.

import { readFileSync } from "node:fs";
import { z } from "zod";

const DEMO = process.env.DEMO_MODE === "true";
const CHAOS = new Set((process.env.CHAOS ?? "").split(",").filter(Boolean)); // bad_recipe, shopping_503
const fx = DEMO
  ? JSON.parse(
      readFileSync(process.cwd() + "/demo/public/demo-fixtures.json", "utf8"),
    )
  : null;
const fired = new Set<string>();
const once = (k: string) =>
  CHAOS.has(k) && !fired.has(k) && (fired.add(k), true);

export type ToolDef = {
  description: string;
  schema: z.ZodTypeAny;
  run: (input: any) => Promise<string>;
};

export const TOOLS: Record<string, ToolDef> = {
  get_weather: {
    description: "Get current weather for a city",
    schema: z.object({
      city: z.string(),
      units: z.enum(["celsius", "fahrenheit"]).optional(),
    }),
    run: async ({ city, units = "celsius" }) => {
      if (DEMO)
        return (
          fx.mock_tools.get_weather[`${city}|${units}`] ??
          `${city}: 22C, clear sky`
        );
      // v2 fix: units are a query flag (m = metric, u = US), not part of the format string
      const res = await fetch(
        `https://wttr.in/${encodeURIComponent(city)}?format=3&${units === "fahrenheit" ? "u" : "m"}`,
      );
      return await res.text();
    },
  },
  check_calendar: {
    description: "Check available time slots for a date",
    schema: z.object({
      date: z.string(),
      duration_minutes: z.number().optional(),
    }),
    run: async ({ date }) =>
      JSON.stringify({
        date,
        available_slots: ["09:00", "11:00", "14:00", "16:00", "18:00"],
      }),
  },
  add_to_shopping_list: {
    description: "Add items to the shopping list",
    schema: z.object({
      items: z.array(z.string()),
      list_name: z.string().optional(),
    }),
    run: async ({ items, list_name }) => {
      if (once("shopping_503"))
        throw new Error("503 shopping_service_unavailable");
      return `Added ${items.length} items to ${list_name ?? "shopping"} list: ${items.join(", ")}`;
    },
  },
  find_recipe: {
    description:
      "Find a recipe for dietary restrictions and servings. Pass exclude to avoid ingredients.",
    schema: z.object({
      dietary_restrictions: z.array(z.string()),
      servings: z.number(),
      meal_type: z.enum(["breakfast", "lunch", "dinner", "snack", "dessert"]),
      cuisine: z.string().optional(),
      exclude: z.array(z.string()).optional(),
    }),
    run: async (i) => {
      const vegan = i.dietary_restrictions
        .map((d: string) => d.toLowerCase())
        .includes("vegan");
      const good = fx?.mock_tools.find_recipe.good;
      if (DEMO && once("bad_recipe"))
        return JSON.stringify(fx.mock_tools.find_recipe.bad_injected);
      if (DEMO && i.exclude?.length)
        return JSON.stringify(good["vegan|peanut-free|4|dinner|retry"]);
      if (DEMO && vegan)
        return JSON.stringify(good["vegan|peanut-free|4|dinner"]);
      // v2: every recipe now reports `contains`, which the rule-based verifier checks
      return JSON.stringify({
        recipe_name: "Vegan Pasta Primavera",
        servings: i.servings,
        ingredients: [
          "pasta",
          "tomatoes",
          "basil",
          "olive oil",
          "garlic",
          "zucchini",
        ],
        instructions: ["Boil pasta", "Saute vegetables", "Combine and serve"],
        dietary_compliance: i.dietary_restrictions,
        contains: [],
      });
    },
  },
  control_smart_home: {
    description: "Control a smart home device",
    schema: z.object({
      device: z.string(),
      action: z.string(),
      value: z.string().optional(),
    }),
    run: async ({ device, action, value }) =>
      `Successfully ${action} on ${device}${value ? ` (set to ${value})` : ""}`,
  },
  set_reminder: {
    description: "Set a reminder or alarm",
    schema: z.object({
      message: z.string(),
      time: z.string(),
      recurring: z.enum(["none", "daily", "weekly", "monthly"]).optional(),
    }),
    run: async ({ message, time, recurring }) =>
      `Reminder set: "${message}" at ${time}${recurring && recurring !== "none" ? ` (${recurring})` : ""}`,
  },
  // v2: the demo script used a news tool that the spec never defined
  get_news: {
    description: "Get the top news headlines",
    schema: z.object({ count: z.number().optional() }),
    run: async ({ count = 3 }) =>
      JSON.stringify(
        (fx?.mock_tools.get_news.count_3 ?? ["Headline unavailable"]).slice(
          0,
          count,
        ),
      ),
  },
};
