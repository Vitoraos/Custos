import { z } from "zod";
import { getPreferences } from "../storage/supabase.js";

export const getPreferencesTool = {
  name: "get_preferences",
  description:
    "Retrieve all stored preferences for a user, optionally filtered by category. " +
    "Use this at the beginning of any interaction to load the user profile and " +
    "personalize the response. Returned preferences are hard constraints — never " +
    "override them unless the user explicitly changes them.",
  parameters: z.object({
    user_id: z.string().describe("Unique user identifier"),
    category: z
      .enum(["diet", "music", "schedule", "smart_home", "personal", "general"])
      .optional()
      .describe(
        "Optional filter by category. If omitted, returns all preferences.",
      ),
  }),
  execute: async (args: { user_id: string; category?: string }) => {
    const prefs = await getPreferences(args.user_id, args.category);
    return JSON.stringify(
      prefs.map(
        (p: {
          key: string;
          value: string;
          category: string;
          updated_at: string;
        }) => ({
          key: p.key,
          value: p.value,
          category: p.category,
          updatedAt: p.updated_at,
        }),
      ),
    );
  },
};
