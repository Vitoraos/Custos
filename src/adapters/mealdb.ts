// TheMealDB: real ingredient lists (free test key 1). Lookup per candidate
// (filter returns id/name only). <=8 parallel, cached. Fallback dataset used
// ONLY when the API is down, marked source "fallback".
import { z } from "zod";
import fallbackJson from "./data/recipes.fallback.json" with { type: "json" };
import { fetchJson, TtlCache } from "./http.js";

const searchSchema = z.object({
  meals: z
    .array(
      z.object({
        idMeal: z.string(),
        strMeal: z.string(),
        strCategory: z.string().nullable().optional(),
        strArea: z.string().nullable().optional(),
      }),
    )
    .nullable(),
});
const lookupSchema = z.object({
  meals: z
    .array(z.record(z.string(), z.union([z.string(), z.null()])))
    .nullable(),
});

export interface Recipe {
  id: string;
  name: string;
  ingredients: string[];
  source: "themealdb" | "fallback";
}
const BASE = "https://www.themealdb.com/api/json/v1/1";
const cache = new TtlCache<Recipe[]>();

function parseIngredients(meal: Record<string, string | null>): string[] {
  const out: string[] = [];
  for (let i = 1; i <= 20; i++) {
    const ing = meal[`strIngredient${i}`]?.trim();
    const meas = meal[`strMeasure${i}`]?.trim();
    if (ing) out.push(meas ? `${meas} ${ing}` : ing);
  }
  return out;
}

export async function findRecipes(query: string, max = 8): Promise<Recipe[]> {
  const key = query.toLowerCase().trim();
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const search = await fetchJson(
      `${BASE}/search.php?s=${encodeURIComponent(query)}`,
      searchSchema,
    );
    const meals = (search.meals ?? []).slice(0, Math.min(Math.max(max, 1), 8));
    if (meals.length === 0) throw new Error("no candidates");
    const lookups = await Promise.all(
      meals.map((m) =>
        fetchJson(`${BASE}/lookup.php?i=${m.idMeal}`, lookupSchema).catch(
          () => null,
        ),
      ),
    );
    const out: Recipe[] = [];
    lookups.forEach((l, i) => {
      const meal = l?.meals?.[0];
      if (meal)
        out.push({
          id: meals[i].idMeal,
          name: meals[i].strMeal,
          ingredients: parseIngredients(meal),
          source: "themealdb",
        });
    });
    if (out.length === 0) throw new Error("no ingredient lists");
    cache.set(key, out);
    return out;
  } catch {
    const fb = (
      fallbackJson as { name: string; ingredients: string[] }[]
    ).filter((r) =>
      `${r.name} ${r.ingredients.join(" ")}`
        .toLowerCase()
        .includes(key.split(" ")[0] ?? ""),
    );
    const pool =
      fb.length > 0
        ? fb
        : (fallbackJson as { name: string; ingredients: string[] }[]);
    return pool.slice(0, 8).map((r, i) => ({
      id: `fallback-${i}`,
      name: r.name,
      ingredients: r.ingredients,
      source: "fallback" as const,
    }));
  }
}
