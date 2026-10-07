import { z } from "zod";
import { storePreference } from "../storage/supabase.js";

export const storePreferenceTool = {
  name: "store_preference",
  description:
    "Store a user preference or instruction in persistent memory. " +
    "The preference persists across sessions and is available to all future " +
    "interactions. Use this when the user explicitly states a preference, " +
    "such as dietary restrictions, music tastes, schedule preferences, or " +
    "smart-home configurations.",
  parameters: z.object({
    user_id: z
      .string()
      .describe("Unique user identifier (Alexa device or account ID)"),
    key: z
      .string()
      .describe(
        "Preference key. Examples: 'diet', 'music_taste', 'wake_time', 'preferred_temperature', 'language'",
      ),
    value: z
      .string()
      .describe(
        "Preference value. Examples: 'vegan', 'jazz', '07:00', '21_celsius', 'English'",
      ),
    category: z
      .enum(["diet", "music", "schedule", "smart_home", "personal", "general"])
      .describe("Category for organizing the preference"),
    source: z
      .enum(["voice", "explicit", "inferred"])
      .optional()
      .describe("How the preference was captured. Defaults to 'voice'."),
  }),
  execute: async (args: {
    user_id: string;
    key: string;
    value: string;
    category: string;
    source?: string;
  }) => {
    await storePreference(
      args.user_id,
      args.key,
      args.value,
      args.category,
      args.source ?? "voice",
    );
    return `Preference stored: ${args.key} = ${args.value}. This will be remembered for all future interactions.`;
  },
};
