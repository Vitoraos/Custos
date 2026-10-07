import { z } from "zod";
import {
  getActiveInstructions,
  getContexts,
  getPreferences,
  getSupabase,
} from "../storage/supabase.js";

export const getMemorySummaryTool = {
  name: "get_memory_summary",
  description:
    "Return a comprehensive summary of everything ContextForge knows about the user: " +
    "stored preferences, active conversation context, standing instructions, and recent " +
    "workflow history. Use when the user asks 'what do you remember about me?'",
  parameters: z.object({
    user_id: z.string().describe("Unique user identifier"),
  }),
  execute: async (args: { user_id: string }) => {
    const [prefs, contexts, instructions] = await Promise.all([
      getPreferences(args.user_id),
      getContexts(args.user_id),
      getActiveInstructions(args.user_id),
    ]);
    const { data: recent } = await getSupabase()
      .from("workflow_executions")
      .select("task,status,started_at")
      .eq("user_id", args.user_id)
      .order("started_at", { ascending: false })
      .limit(5);

    const lines = ["Here's what I know about you:", "", "PREFERENCES:"];
    for (const p of prefs as { key: string; value: string }[])
      lines.push(`- ${p.key}: ${p.value}`);
    if (instructions.length) {
      lines.push("", "STANDING INSTRUCTIONS:");
      for (const i of instructions as { instruction: string }[])
        lines.push(`- ${i.instruction}`);
    }
    if (contexts.length) {
      lines.push("", "RECENT CONTEXT:");
      for (const c of contexts as { context: string }[])
        lines.push(`- ${c.context}`);
    }
    if (recent?.length) {
      lines.push("", "RECENT TASKS:");
      for (const r of recent as { task: string; status: string }[])
        lines.push(`- ${r.task} (${r.status})`);
    }
    lines.push("", "I will respect all of these in future interactions.");
    return lines.join("\n");
  },
};
