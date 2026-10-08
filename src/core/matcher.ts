// Ingredient-name heuristics against the EU-14 + diet ontology.
// NOT medical advice: fails closed for `severe` allergens (ambiguous -> block),
// reports honestly, and documents its limits (see B5 labelled set + BENCHMARK.md).

import type { Allergen } from "./constraints.js";
import allergensJson from "./ontology/allergens.json" with { type: "json" };
import dietsJson from "./ontology/diets.json" with { type: "json" };

export type DietValue =
  | "vegan"
  | "vegetarian"
  | "pescatarian"
  | "gluten_free"
  | "dairy_free";
export interface MatchOptions {
  coconutIsTreeNut?: boolean; // the coconut debate; default true (FDA lists coconut as tree nut)
}

const ALLERGENS = allergensJson as Record<Allergen, string[]>;
// Phrases that must never count as dairy (plan §5.B compound exclusions).
const NEVER_DAIRY = [
  "peanut butter",
  "cocoa butter",
  "shea butter",
  "coconut milk",
  "coconut cream",
];
// Vague terms that fail closed for `severe` allergens, ignored for `avoid`.
const AMBIGUOUS = [
  "natural flavor",
  "natural flavors",
  "artificial flavor",
  "artificial flavors",
  "flavor",
  "flavoring",
  "flavorings",
  "spice",
  "spices",
  "seasoning",
  "seasonings",
  "starch",
  "modified starch",
  "modified food starch",
  "vegetable oil",
  "lecithin",
  "emulsifier",
  "emulsifiers",
  "hydrolyzed protein",
  "hydrolyzed vegetable protein",
];

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Whole-word/phrase match with simple plural tolerance (term, term+s, term+es).
function termHit(haystack: string, term: string): boolean {
  return new RegExp(`\\b${escapeRegExp(term)}(?:s|es)?\\b`).test(haystack);
}

// Terms negated by "-free" labels: "peanut-free", "dairy free", "gluten-free", ...
function negatedTerms(haystack: string): string[] {
  const out: string[] = [];
  for (const m of haystack.matchAll(/([a-z]+)-free\b/g)) out.push(m[1]);
  for (const m of haystack.matchAll(/\b([a-z]+) free\b/g)) out.push(m[1]);
  return out;
}

// A "-free" label exempts whole groups, not just the named term:
// "dairy-free cheese" (vegan cheese), "nut-free" (peanut + tree nuts), ...
const NEGATION_EXEMPTS: Record<string, Allergen[]> = {
  dairy: ["milk"],
  milk: ["milk"],
  gluten: ["gluten"],
  wheat: ["gluten"],
  nut: ["peanut", "tree_nuts"],
  nuts: ["peanut", "tree_nuts"],
  peanut: ["peanut"],
  egg: ["egg"],
  eggs: ["egg"],
  soy: ["soy"],
  soya: ["soy"],
  fish: ["fish"],
  shellfish: ["crustaceans", "molluscs"],
  sesame: ["sesame"],
  mustard: ["mustard"],
  celery: ["celery"],
  lupin: ["lupin"],
  lupine: ["lupin"],
  sulfite: ["sulphites"],
  sulfites: ["sulphites"],
  sulphite: ["sulphites"],
};
// "rice noodles" / "rice flour" / "corn tortilla": qualified staples that are gluten-free.
const QUALIFIED_CLEAN: Record<string, string[]> = {
  noodles: [
    "rice",
    "glass",
    "cellophane",
    "mung",
    "sweet potato",
    "shirataki",
    "kelp",
  ],
  flour: [
    "rice",
    "almond",
    "coconut",
    "chickpea",
    "buckwheat",
    "tapioca",
    "potato",
    "corn",
    "lupin",
  ],
  tortilla: ["corn"],
  broth: ["vegetable", "mushroom"],
  stock: ["vegetable", "mushroom"],
  milk: ["oat", "almond", "soy", "rice", "coconut", "cashew", "hemp", "pea"],
};

function exemptAllergens(haystack: string): Set<Allergen> {
  const out = new Set<Allergen>();
  for (const n of negatedTerms(haystack)) {
    for (const a of NEGATION_EXEMPTS[n] ?? []) out.add(a);
  }
  return out;
}

function qualifiedClean(haystack: string, term: string): boolean {
  // The qualifier must directly modify the staple ("rice flour", "corn tortilla")
  // — mere co-occurrence ("almonds ... flour") does NOT exempt.
  const quals = QUALIFIED_CLEAN[term];
  return !!quals && quals.some((q) => termHit(haystack, `${q} ${term}`));
}

export interface IngredientHit {
  allergen: Allergen;
  term: string; // the ontology term that matched (or "ambiguous:<phrase>")
  ambiguous: boolean;
}

export function matchAllergens(
  ingredient: string,
  allergens: Allergen[],
  opts: MatchOptions = {},
): IngredientHit[] {
  const coconutIsTreeNut = opts.coconutIsTreeNut ?? true;
  const hay = normalize(ingredient);
  const negated = new Set(negatedTerms(hay));
  const exempt = exemptAllergens(hay);
  // Strip never-dairy compounds before the milk check.
  let milkHay = hay;
  for (const p of NEVER_DAIRY) milkHay = milkHay.replaceAll(p, " ");
  const hits: IngredientHit[] = [];
  for (const a of allergens) {
    if (exempt.has(a)) continue;
    const terms = (ALLERGENS[a] ?? []).filter((t) => {
      if (t === "coconut" && !coconutIsTreeNut) return false;
      if (qualifiedClean(hay, normalize(t))) return false;
      const stem = t.split(" ")[0];
      return !negated.has(stem) && !negated.has(t.replace(/ /g, ""));
    });
    const text = a === "milk" ? milkHay : hay;
    const hit = terms.find((t) => termHit(text, normalize(t)));
    if (hit) {
      hits.push({ allergen: a, term: hit, ambiguous: false });
      continue;
    }
    // Fail closed: vague ingredient + severe rule checked by caller via `severe` flag below.
    const amb = AMBIGUOUS.find((t) => termHit(hay, t));
    if (amb)
      hits.push({ allergen: a, term: `ambiguous:${amb}`, ambiguous: true });
  }
  return hits;
}

const DIETS = dietsJson as {
  meat: string[];
  shellfish: string[];
  vegan: { excludeGroups: string[]; extraTerms: string[] };
  vegetarian: { excludeGroups: string[]; extraTerms: string[] };
  pescatarian: { excludeGroups: string[]; extraTerms: string[] };
  gluten_free: { excludeGroups: string[]; extraTerms: string[] };
  dairy_free: { excludeGroups: string[]; extraTerms: string[] };
};

function groupTerms(group: string): string[] {
  if (group === "meat") return DIETS.meat;
  if (group === "shellfish") return DIETS.shellfish;
  return ALLERGENS[group as Allergen] ?? [];
}

// Returns the offending terms (empty = compliant). Negation + never-dairy apply.
export function matchDiet(
  ingredient: string,
  diet: DietValue,
  opts: MatchOptions = {},
): string[] {
  const spec = DIETS[diet];
  const hay = normalize(ingredient);
  // A certified diet label exempts the dish ("vegan cheese", "gluten-free bread").
  const labelExempt =
    (diet === "vegan" && /\bvegan\b/.test(hay)) ||
    (diet === "vegetarian" && /\bvegetarian\b/.test(hay)) ||
    (diet === "gluten_free" && negatedTerms(hay).includes("gluten")) ||
    (diet === "dairy_free" && negatedTerms(hay).includes("dairy"));
  if (labelExempt) return [];
  // "-free" group labels exempt whole groups ("dairy-free X" skips milk terms).
  const exempt = exemptAllergens(hay);
  const negated = new Set(negatedTerms(hay));
  let text = hay;
  for (const p of NEVER_DAIRY) text = text.replaceAll(p, " ");
  const bad: string[] = [];
  const groups = spec.excludeGroups.filter(
    (g) => g === "meat" || !exempt.has(g as Allergen),
  );
  const terms = [...groups.flatMap(groupTerms), ...spec.extraTerms].filter(
    (t) => {
      if (t === "coconut" && !(opts.coconutIsTreeNut ?? true)) return false;
      if (qualifiedClean(hay, normalize(t))) return false;
      return !negated.has(t.split(" ")[0]);
    },
  );
  for (const t of terms) {
    const nt = normalize(t);
    // Milk-group terms see the never-dairy-stripped text; everything else
    // sees the raw text (so "coconut milk" still flags tree_nuts when enabled).
    const isMilkGroup =
      spec.excludeGroups.includes("milk") && groupTerms("milk").includes(t);
    if (termHit(isMilkGroup ? text : hay, nt)) bad.push(t);
  }
  return [...new Set(bad)];
}
