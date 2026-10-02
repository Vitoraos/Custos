-- ContextForge schema v2. Run in Supabase SQL Editor BEFORE seed.sql.
-- Fixes vs v1: started_at index, priority_rank generated column.

CREATE TABLE preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('diet', 'music', 'schedule', 'smart_home', 'personal', 'general')),
  source TEXT DEFAULT 'voice' CHECK (source IN ('voice', 'explicit', 'inferred')),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, key, category)
);
CREATE INDEX idx_preferences_user ON preferences(user_id);
CREATE INDEX idx_preferences_user_category ON preferences(user_id, category);

CREATE TABLE conversation_context (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  context TEXT NOT NULL,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  priority_rank SMALLINT GENERATED ALWAYS AS (
    CASE priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END
  ) STORED,
  expires_at TIMESTAMPTZ,
  related_task_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_context_user ON conversation_context(user_id);
CREATE INDEX idx_context_user_priority ON conversation_context(user_id, priority_rank DESC, created_at DESC);

CREATE TABLE workflow_executions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  task TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]',
  status TEXT DEFAULT 'planning' CHECK (status IN ('planning', 'executing', 'verifying', 'completed', 'failed')),
  result TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX idx_executions_user ON workflow_executions(user_id, started_at DESC);

CREATE TABLE user_instructions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  instruction TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('critical', 'important', 'nice_to_have')),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ
);
CREATE INDEX idx_instructions_user_active ON user_instructions(user_id) WHERE active = true;

ALTER TABLE preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_instructions ENABLE ROW LEVEL SECURITY;
-- MCP server uses service_role key which bypasses RLS. No extra policies needed.
