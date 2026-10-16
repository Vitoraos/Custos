// Recipe card data: re-runs find_recipe deterministically through the real
// MCP tool (same guard, same lists) and returns name + ingredients only.
import { McpClient } from "@strands-agents/sdk";

export interface RecipeCard {
  name: string;
  ingredients: string[];
}

/** Pure parse of a raw find_recipe CallToolResult. Unit-tested. */
export function pickRecipe(result: unknown): RecipeCard | null {
  if (!result || typeof result !== "object") return null;
  const sc = (result as { structuredContent?: unknown }).structuredContent;
  const data =
    sc && typeof sc === "object" ? (sc as { data?: unknown }).data : undefined;
  const recipes =
    data && typeof data === "object"
      ? (data as { recipes?: unknown }).recipes
      : undefined;
  if (!Array.isArray(recipes) || recipes.length === 0) return null;
  const first = recipes[0] as { name?: unknown; ingredients?: unknown };
  if (typeof first?.name !== "string" || !Array.isArray(first?.ingredients)) {
    return null;
  }
  return {
    name: first.name,
    ingredients: first.ingredients.filter(
      (i): i is string => typeof i === "string",
    ),
  };
}

export async function fetchRecipe(
  mcpUrl: string,
  key: string,
  query: string,
): Promise<RecipeCard | null> {
  const client = new McpClient({
    url: mcpUrl,
    headers: { Authorization: `Bearer ${key}` },
  });
  const tools = await client.listTools({ prefix: "" });
  const tool = tools.find((t) => t.name === "find_recipe");
  if (!tool) return null;
  try {
    const result = await client.callTool(tool, {
      query,
      servingFor: ["household"],
      max: 5,
    });
    return pickRecipe(result);
  } finally {
    await client.disconnect().catch(() => undefined);
  }
}
