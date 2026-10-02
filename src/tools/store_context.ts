import { z } from 'zod';
import { storeContext, storeInstruction } from '../storage/supabase.js';

const priorityToInstruction = {
  low: 'nice_to_have',
  medium: 'important',
  high: 'critical',
} as const;

export const storeContextTool = {
  name: 'store_context',
  description:
    'Store a piece of conversation context or instruction for later recall. Use this ' +
    "to remember what was discussed so future interactions can reference it. Use high priority for instructions the user explicitly wants remembered. Pass kind='instruction' for standing rules (stored in user_instructions).",
  parameters: z.object({
    user_id: z.string().describe('Unique user identifier'),
    context: z.string().describe('The context or instruction to remember, in natural language.'),
    priority: z.enum(['low', 'medium', 'high']).optional().describe('Defaults to medium.'),
    expires_in_hours: z
      .number()
      .optional()
      .describe('Optional TTL in hours. Omit for permanent storage.'),
    related_task_id: z.string().optional().describe('Optional workflow execution ID reference.'),
    kind: z
      .enum(['note', 'instruction'])
      .optional()
      .describe(
        "'instruction' = standing rule for every future interaction (e.g. 'keep answers short'). Stored in user_instructions. Defaults to 'note'."
      ),
  }),
  execute: async (args: {
    user_id: string;
    context: string;
    priority?: 'low' | 'medium' | 'high';
    expires_in_hours?: number;
    related_task_id?: string;
    kind?: 'note' | 'instruction';
  }) => {
    const priority = args.priority ?? 'medium';
    if (args.kind === 'instruction') {
      await storeInstruction(args.user_id, args.context, priorityToInstruction[priority]);
      return `Instruction stored (${priorityToInstruction[priority]}): ${args.context}`;
    }
    await storeContext(
      args.user_id,
      args.context,
      priority,
      args.expires_in_hours,
      args.related_task_id
    );
    return `Context stored (priority: ${priority}${args.expires_in_hours ? `, expires in ${args.expires_in_hours}h` : ''}).`;
  },
};
