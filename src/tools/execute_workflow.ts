import { z } from 'zod';
import {
  getActiveInstructions,
  getContexts,
  getPreferences,
  storeContext,
  storeExecution,
} from '../storage/supabase.js';
import { runWorkflow } from '../agent/workflow.js';

export const executeWorkflowTool = {
  name: 'execute_workflow',
  description:
    'Plan and execute a multi-step task. Breaks the task into concrete steps, executes ' +
    'each step using available tools, verifies results, and retries failed steps. Loads ' +
    "the user's preferences and context before execution so stored preferences are " +
    'respected. For simple single-step requests, use individual tools directly.',
  parameters: z.object({
    user_id: z.string().describe('Unique user identifier'),
    task: z.string().describe('Natural language description of the task to execute.'),
    max_steps: z.number().optional().describe('Max steps. Defaults to 10.'),
    max_retries_per_step: z.number().optional().describe('Max retries per step. Defaults to 2.'),
  }),
  execute: async (args: {
    user_id: string;
    task: string;
    max_steps?: number;
    max_retries_per_step?: number;
  }) => {
    // 1. Load memory (no LLM)
    const [prefs, instructions, contexts] = await Promise.all([
      getPreferences(args.user_id),
      getActiveInstructions(args.user_id),
      getContexts(args.user_id),
    ]);

    // 2-4. Plan → Execute → Verify (2 LLM calls, 3 with remediation)
    const result = await runWorkflow({
      task: args.task,
      preferences: prefs.map((p: { key: string; value: string }) => ({
        key: p.key,
        value: p.value,
      })),
      instructions: instructions.map((i: { instruction: string }) => i.instruction),
      context: contexts.map((c: { context: string }) => c.context),
      maxSteps: args.max_steps,
      maxRetries: args.max_retries_per_step,
    });

    // 5. Persist execution log + follow-up context (fire-and-forget safe: awaited)
    await storeExecution(
      args.user_id,
      args.task,
      result.steps as unknown[],
      result.status === 'completed' ? 'completed' : 'failed',
      result.verdict.summary
    );
    if (result.status === 'completed') {
      await storeContext(
        args.user_id,
        `Completed task "${args.task}": ${result.verdict.summary}`,
        'medium',
        72
      );
    }

    return JSON.stringify(result);
  },
};
