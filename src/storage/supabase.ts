// src/storage/supabase.ts — Supabase client + all storage functions (spec §4.2 v2)
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from '../config.js';

let _client: SupabaseClient | null = null;

// Lazy so importing this module never throws when env is unset (tests, DEMO_MODE).
export function getSupabase(): SupabaseClient {
  if (!_client) {
    _client = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false },
    });
  }
  return _client;
}

// Back-compat with spec snippets that import { supabase } — prefer getSupabase().
export const supabaseProxy = new Proxy({} as SupabaseClient, {
  get: (_t, p) => (getSupabase() as unknown as Record<string | symbol, unknown>)[p],
});

// Store a preference
export async function storePreference(
  userId: string,
  key: string,
  value: string,
  category: string,
  source: string = 'voice'
) {
  const { data, error } = await getSupabase()
    .from('preferences')
    .upsert(
      { user_id: userId, key, value, category, source },
      { onConflict: 'user_id,key,category' }
    )
    .select();
  if (error) throw error;
  return data[0];
}

// Retrieve all preferences for a user
export async function getPreferences(userId: string, category?: string) {
  let query = getSupabase().from('preferences').select('*').eq('user_id', userId);
  if (category) query = query.eq('category', category);
  const { data, error } = await query.order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

// Store conversation context
export async function storeContext(
  userId: string,
  context: string,
  priority: string = 'medium',
  expiresInHours?: number,
  relatedTaskId?: string
) {
  const expiresAt = expiresInHours
    ? new Date(Date.now() + expiresInHours * 3600000).toISOString()
    : null;
  const { data, error } = await getSupabase()
    .from('conversation_context')
    .insert({
      user_id: userId,
      context,
      priority,
      expires_at: expiresAt,
      related_task_id: relatedTaskId,
    })
    .select();
  if (error) throw error;
  return data[0];
}

// Retrieve active (non-expired) contexts
export async function getContexts(userId: string, limit: number = 10) {
  const { data, error } = await getSupabase()
    .from('conversation_context')
    .select('*')
    .eq('user_id', userId)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('priority_rank', { ascending: false }) // v2: high first
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

// Store execution log
export async function storeExecution(
  userId: string,
  task: string,
  steps: unknown[],
  status: string,
  result?: string
) {
  const { data, error } = await getSupabase()
    .from('workflow_executions')
    .insert({
      user_id: userId,
      task,
      steps,
      status,
      result,
      completed_at:
        status === 'completed' || status === 'failed' ? new Date().toISOString() : null,
    })
    .select();
  if (error) throw error;
  return data[0];
}

// Get active instructions
export async function getActiveInstructions(userId: string) {
  const { data, error } = await getSupabase()
    .from('user_instructions')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .order('priority', { ascending: true }); // critical first
  if (error) throw error;
  return data;
}

// v2: write path for standing instructions (see store_context `kind`, Section 5.3)
export async function storeInstruction(
  userId: string,
  instruction: string,
  priority: 'critical' | 'important' | 'nice_to_have' = 'important'
) {
  const { data, error } = await getSupabase()
    .from('user_instructions')
    .insert({ user_id: userId, instruction, priority })
    .select();
  if (error) throw error;
  return data[0];
}
