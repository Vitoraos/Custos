import { describe, expect, it } from "vitest";
import type { Allergen, Constraint } from "../../src/core/constraints.js";
import {
  type EvalContext,
  evaluate,
  type ProposedAction,
} from "../../src/core/policy.js";

const NOW = new Date("2026-10-06T20:00:00Z"); // 21:00 Lagos, 22:00 Berlin
const ctx = (profiles: string[] = ["household"]): EvalContext => ({
  now: NOW,
  profiles,
});
const recipe = (
  ingredients: string[],
  servingFor: string[] = ["household"],
): ProposedAction => ({
  type: "recipe",
  name: "test dish",
  ingredients,
  servingFor,
});

let n = 0;
const base = (kind: Constraint): Constraint =>
  ({ ...kind, id: `c${++n}` }) as Constraint;
const allergen = (
  a: Allergen,
  profile = "household",
  severity: "avoid" | "severe" = "avoid",
): Constraint =>
  base({
    kind: "allergen",
    allergen: a,
    severity,
    profile,
    source: "user_voice",
    createdAt: NOW.toISOString(),
  } as unknown as Constraint);
const diet = (
  value: "vegan" | "vegetarian" | "pescatarian" | "gluten_free" | "dairy_free",
  profile = "household",
): Constraint =>
  base({
    kind: "diet",
    value,
    profile,
    source: "user_voice",
    createdAt: NOW.toISOString(),
  } as unknown as Constraint);

const verdict = (rules: Constraint[], action: ProposedAction, c = ctx()) =>
  evaluate(rules, action, c).verdict;

describe("allergen blocks (EU-14)", () => {
  const cases: [Allergen, string][] = [
    ["celery", "celery soup"],
    ["gluten", "wheat bread"],
    ["crustaceans", "garlic shrimp pasta"],
    ["egg", "egg fried rice"],
    ["fish", "grilled salmon"],
    ["lupin", "lupin flour pancakes"],
    ["milk", "cheddar omelette"],
    ["molluscs", "fried calamari"],
    ["mustard", "dijon mustard dressing"],
    ["peanut", "peanut satay sauce"],
    ["sesame", "tahini dip"],
    ["soy", "miso soup with tofu"],
    ["sulphites", "dried apricots with sulphur dioxide"],
    ["tree_nuts", "almond cake"],
  ];
  for (const [a, ing] of cases) {
    it(`blocks ${a} in "${ing}"`, () => {
      expect(verdict([allergen(a)], recipe([ing, "salt"]))).toBe("block");
    });
  }
  it("derived terms: butter/cheese/whey hit milk; soy sauce hits soy AND gluten", () => {
    expect(verdict([allergen("milk")], recipe(["buttered toast"]))).toBe(
      "block",
    );
    expect(verdict([allergen("milk")], recipe(["whey protein shake"]))).toBe(
      "block",
    );
    expect(verdict([allergen("soy")], recipe(["soy sauce noodles"]))).toBe(
      "block",
    );
    expect(verdict([allergen("gluten")], recipe(["soy sauce noodles"]))).toBe(
      "block",
    );
  });
});

describe("compound exclusions + negation", () => {
  it.each([
    ["peanut butter sandwich"],
    ["cocoa butter cake"],
    ["shea butter lotion food"],
    ["coconut milk curry"],
  ])("does not flag dairy in %s", (ing) =>
    expect(verdict([allergen("milk")], recipe([ing]))).toBe("allow"),
  );
  it("coconut milk still flags tree_nuts by default", () => {
    expect(
      verdict([allergen("tree_nuts")], recipe(["coconut milk curry"])),
    ).toBe("block");
  });
  it.each([
    ["peanut-free cookies"],
    ["dairy-free cheese"],
    ["gluten-free bread"],
  ])("negation label %s does not trigger", (ing) =>
    expect(
      verdict(
        [allergen("peanut"), allergen("milk"), allergen("gluten")],
        recipe([ing]),
      ),
    ).toBe("allow"),
  );
});

describe("fail-closed severity", () => {
  it("severe blocks ambiguous 'natural flavors'; avoid allows it", () => {
    expect(
      verdict(
        [allergen("peanut", "household", "severe")],
        recipe(["chips with natural flavors"]),
      ),
    ).toBe("block");
    expect(
      verdict([allergen("peanut")], recipe(["chips with natural flavors"])),
    ).toBe("allow");
  });
});

describe("diets", () => {
  it.each([
    ["vegan", "chicken salad"],
    ["vegan", "cheese pizza"],
    ["vegan", "scrambled eggs"],
    ["vegan", "grilled salmon"],
    ["vegan", "honey cake"],
    ["vegetarian", "beef stew"],
    ["vegetarian", "tuna sandwich"],
    ["pescatarian", "pork ribs"],
    ["gluten_free", "barley soup"],
    ["dairy_free", "cream sauce pasta"],
  ] as const)("blocks %s for %s", (value, ing) => {
    expect(verdict([diet(value)], recipe([ing]))).toBe("block");
  });
  it.each([
    ["vegetarian", "cheese pizza"],
    ["vegetarian", "scrambled eggs"],
    ["pescatarian", "grilled salmon"],
    ["pescatarian", "cheese pizza"],
    ["vegan", "lentil soup with olive oil"],
    ["gluten_free", "rice noodles"],
  ] as const)("allows %s for %s", (value, ing) => {
    expect(verdict([diet(value)], recipe([ing]))).toBe("allow");
  });
});

describe("profiles", () => {
  it("Maya peanut rule blocks Maya servings, not Dad-only", () => {
    const rules = [allergen("peanut", "Maya", "severe")];
    expect(
      verdict(rules, recipe(["peanut satay"], ["Maya"]), ctx(["Maya"])),
    ).toBe("block");
    expect(
      verdict(rules, recipe(["peanut satay"], ["Dad"]), ctx(["Dad"])),
    ).toBe("allow");
  });
  it("household rules apply to everyone", () => {
    expect(
      verdict([diet("vegan")], recipe(["chicken"], ["Dad"]), ctx(["Dad"])),
    ).toBe("block");
  });
  it("multi-person serving checks every profile", () => {
    const rules = [allergen("peanut", "Maya", "severe"), diet("vegan", "Dad")];
    const c = ctx(["Maya", "Dad"]);
    expect(verdict(rules, recipe(["peanut satay"], ["Maya", "Dad"]), c)).toBe(
      "block",
    );
    expect(verdict(rules, recipe(["chicken"], ["Maya", "Dad"]), c)).toBe(
      "block",
    );
    expect(verdict(rules, recipe(["lentil soup"], ["Maya", "Dad"]), c)).toBe(
      "allow",
    );
  });
});

describe("dormant rules", () => {
  it("expired and external-source rules are ignored", () => {
    const expired = {
      ...allergen("peanut"),
      expiresAt: new Date("2026-01-01T00:00:00Z").toISOString(),
    } as Constraint;
    const external = {
      ...allergen("peanut"),
      source: "external",
    } as unknown as Constraint;
    expect(verdict([expired, external], recipe(["peanut satay"]))).toBe(
      "allow",
    );
    const e = evaluate([expired, external], recipe(["peanut satay"]), ctx());
    expect(e.checked).toEqual([]);
  });
});

describe("quiet hours", () => {
  const q = (
    start: string,
    end: string,
    tz: string,
    applies: ("lights" | "notifications" | "audio")[],
  ): Constraint =>
    base({
      kind: "quiet_hours",
      start,
      end,
      tz,
      applies,
      profile: "household",
      source: "explicit",
      createdAt: NOW.toISOString(),
    } as unknown as Constraint);
  const light = (device = "hall_light"): ProposedAction => ({
    type: "device_set",
    device,
    attr: "power",
    value: "on",
    at: NOW,
  });
  it("blocks inside window, allows outside", () => {
    expect(
      verdict([q("20:00", "07:00", "Africa/Lagos", ["lights"])], light()),
    ).toBe("block"); // 21:00 Lagos
    expect(
      verdict([q("23:00", "07:00", "Africa/Lagos", ["lights"])], light()),
    ).toBe("allow");
  });
  it("handles overnight wrap and time zones", () => {
    // 20:00Z = 22:00 Berlin inside 21:30–06:00; 20:00Z = 21:00 Lagos outside it
    expect(
      verdict([q("21:30", "06:00", "Europe/Berlin", ["lights"])], light()),
    ).toBe("block");
    expect(
      verdict([q("21:30", "06:00", "Africa/Lagos", ["lights"])], light()),
    ).toBe("allow");
  });
  it("only applies to covered domains", () => {
    expect(verdict([q("00:00", "23:59", "UTC", ["audio"])], light())).toBe(
      "allow",
    );
  });
  it("reminder quiet hours use the reminder time, not now", () => {
    const rules = [q("22:00", "07:00", "Africa/Lagos", ["notifications"])];
    const night = new Date("2026-10-06T22:30:00+01:00");
    const day = new Date("2026-10-06T10:00:00+01:00");
    expect(verdict(rules, { type: "reminder", at: night, text: "oven" })).toBe(
      "block",
    );
    expect(verdict(rules, { type: "reminder", at: day, text: "oven" })).toBe(
      "allow",
    );
  });
});

describe("confirm_required + device_limit", () => {
  const confirm = (action: "unlock" | "purchase"): Constraint =>
    base({
      kind: "confirm_required",
      action,
      profile: "household",
      source: "explicit",
      createdAt: NOW.toISOString(),
    } as unknown as Constraint);
  it("unlocking the front door needs confirmation; lights do not", () => {
    const rules = [confirm("unlock")];
    expect(
      verdict(rules, {
        type: "device_set",
        device: "front_door_lock",
        attr: "locked",
        value: "unlock",
        at: NOW,
      }),
    ).toBe("confirm");
    expect(
      verdict(rules, {
        type: "device_set",
        device: "kitchen_light",
        attr: "power",
        value: "on",
        at: NOW,
      }),
    ).toBe("allow");
  });
  it("shopping_add needs confirmation under a purchase rule", () => {
    expect(
      verdict([confirm("purchase")], {
        type: "shopping_add",
        items: ["peanut oil"],
      }),
    ).toBe("confirm");
  });
  it("thermostat outside min/max blocks", () => {
    const rules = [
      base({
        kind: "device_limit",
        device: "thermostat",
        attr: "temp_c",
        min: 18,
        max: 26,
        profile: "household",
        source: "explicit",
        createdAt: NOW.toISOString(),
      } as unknown as Constraint),
    ];
    const set = (v: number): ProposedAction => ({
      type: "device_set",
      device: "thermostat",
      attr: "temp_c",
      value: v,
      at: NOW,
    });
    expect(verdict(rules, set(30))).toBe("block");
    expect(verdict(rules, set(22))).toBe("allow");
  });
});

describe("label + qualifier edges", () => {
  it("nut-free exempts peanut and tree_nuts", () => {
    const rules = [allergen("peanut", "Maya", "severe"), allergen("tree_nuts")];
    expect(verdict(rules, recipe(["nut-free trail mix"]))).toBe("allow");
  });
  it("wheat-free exempts gluten", () => {
    expect(verdict([allergen("gluten")], recipe(["wheat-free crackers"]))).toBe(
      "allow",
    );
  });
  it("rice flour is gluten-free; plain flour is not", () => {
    expect(verdict([allergen("gluten")], recipe(["rice flour pancakes"]))).toBe(
      "allow",
    );
    expect(verdict([allergen("gluten")], recipe(["flour tortillas"]))).toBe(
      "block",
    );
  });
  it("coconut flag off: coconut milk flags neither dairy nor tree_nuts", async () => {
    const { matchAllergens } = await import("../../src/core/matcher.js");
    expect(
      matchAllergens("coconut milk curry", ["tree_nuts"], {
        coconutIsTreeNut: false,
      }),
    ).toEqual([]);
    expect(matchAllergens("coconut milk curry", ["tree_nuts"])).not.toEqual([]);
  });
  it("vegan label exempts vegan diet; vegetarian label exempts vegetarian", () => {
    expect(verdict([diet("vegan")], recipe(["vegan cheese toast"]))).toBe(
      "allow",
    );
    expect(
      verdict([diet("vegetarian")], recipe(["vegetarian black bean burger"])),
    ).toBe("allow");
  });
  it("shopping_add checks items against allergens", () => {
    const c = ctx(["Maya"]);
    expect(
      verdict(
        [allergen("peanut", "Maya", "severe")],
        { type: "shopping_add", items: ["peanut oil"] },
        c,
      ),
    ).toBe("block");
    expect(
      verdict(
        [allergen("peanut", "Maya", "severe")],
        { type: "shopping_add", items: ["olive oil"] },
        c,
      ),
    ).toBe("allow");
  });
  it("block wins over confirm when both apply", () => {
    const rules = [
      base({
        kind: "confirm_required",
        action: "purchase",
        profile: "household",
        source: "explicit",
        createdAt: NOW.toISOString(),
      } as unknown as Constraint),
      allergen("peanut", "Maya", "severe"),
    ];
    const e = evaluate(
      rules,
      { type: "shopping_add", items: ["peanut oil"] },
      ctx(["Maya"]),
    );
    expect(e.verdict).toBe("block");
  });
  it("no rules: allow with empty checked", () => {
    const e = evaluate([], recipe(["anything"]), ctx());
    expect(e.verdict).toBe("allow");
    expect(e.checked).toEqual([]);
  });
  it("quiet hours boundary: start is inclusive, end is exclusive", () => {
    const q: Constraint = base({
      kind: "quiet_hours",
      start: "21:00",
      end: "22:00",
      tz: "Africa/Lagos",
      applies: ["lights"],
      profile: "household",
      source: "explicit",
      createdAt: NOW.toISOString(),
    } as unknown as Constraint);
    const at = (iso: string): EvalContext => ({
      now: new Date(iso),
      profiles: ["household"],
    });
    const light: ProposedAction = {
      type: "device_set",
      device: "hall_light",
      attr: "power",
      value: "on",
      at: NOW,
    };
    expect(evaluate([q], light, at("2026-10-06T20:00:00Z")).verdict).toBe(
      "block",
    ); // 21:00 Lagos
    expect(evaluate([q], light, at("2026-10-06T21:00:00Z")).verdict).toBe(
      "allow",
    ); // 22:00 Lagos
  });
  it("device_limit max-only and min-only ranges", () => {
    const maxOnly = base({
      kind: "device_limit",
      device: "thermostat",
      attr: "temp_c",
      max: 26,
      profile: "household",
      source: "explicit",
      createdAt: NOW.toISOString(),
    } as unknown as Constraint);
    const set = (v: number): ProposedAction => ({
      type: "device_set",
      device: "thermostat",
      attr: "temp_c",
      value: v,
      at: NOW,
    });
    expect(verdict([maxOnly], set(26))).toBe("allow");
    expect(verdict([maxOnly], set(27))).toBe("block");
  });
});

describe("reasons + checked", () => {
  it("block carries constraint ids and speakable text", () => {
    const rules = [allergen("peanut", "Maya", "severe")];
    const e = evaluate(
      rules,
      recipe(["peanut satay"], ["Maya"]),
      ctx(["Maya"]),
    );
    expect(e.verdict).toBe("block");
    expect(e.checked).toEqual([rules[0].id]);
    expect(e.reasons[0].constraintId).toBe(rules[0].id);
    expect(e.reasons[0].text).toContain("Maya");
    expect(e.reasons[0].text).toContain("peanut");
  });
});
