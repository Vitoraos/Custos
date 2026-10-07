import { z } from "zod";
import { getContexts } from "../storage/supabase.js";

export const getContextTool = {
  name: "get_context",
  description:
    "Retrieve active conversation context and instructions for a user. Returns all " +
    "non-expired context entries, sorted by priority (high first) and then recency. " +
    "Use at the start of an interaction to load what was previously discussed.",
  parameters: z.object({
    user_id: z.string().describe("Unique user identifier"),
    limit: z
      .number()
      .optional()
      .describe("Max entries to return. Defaults to 10."),
    priority_filter: z
      .enum(["low", "medium", "high"])
      .optional()
      .describe(
        "Optional filter to return only contexts of a given priority or higher.",
      ),
  }),
  execute: async (args: {
    user_id: string;
    limit?: number;
    priority_filter?: "low" | "medium" | "high";
  }) => {
    const rank = { low: 1, medium: 2, high: 3 } as const;
    const rows = await getContexts(args.user_id, args.limit ?? 10);
    const filtered = args.priority_filter
      ? rows.filter(
          (r: { priority_rank: number }) =>
            r.priority_rank >= rank[args.priority_filter!],
        )
      : rows;
    return JSON.stringify(filtered);
  },
};
