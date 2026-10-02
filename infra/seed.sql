-- ContextForge demo seed. Run AFTER your schema.sql, in the Supabase SQL Editor.
-- All timestamps are relative to NOW(), so it works whichever day you record.
-- Matches the spec schema (preferences, conversation_context, workflow_executions, user_instructions).
--
-- SPEC FIX: the spec's index on workflow_executions uses created_at, but that table
-- has started_at (no created_at). Use this instead:
--   CREATE INDEX idx_executions_user ON workflow_executions(user_id, started_at DESC);

-- ============================================================
-- SECTION A: BASELINE (run before scene S1; vegan is NOT seeded, S1 stores it live)
-- ============================================================
DELETE FROM preferences          WHERE user_id = 'amzn1.account.DEMO-USER-001';
DELETE FROM conversation_context WHERE user_id = 'amzn1.account.DEMO-USER-001';
DELETE FROM workflow_executions  WHERE user_id = 'amzn1.account.DEMO-USER-001';
DELETE FROM user_instructions    WHERE user_id = 'amzn1.account.DEMO-USER-001';

INSERT INTO preferences (user_id, key, value, category, source, updated_at) VALUES
  ('amzn1.account.DEMO-USER-001', 'allergies',             'peanuts',    'diet',       'explicit', NOW() - INTERVAL '3 days'),
  ('amzn1.account.DEMO-USER-001', 'music_taste',           'jazz',       'music',      'voice',    NOW() - INTERVAL '3 days'),
  ('amzn1.account.DEMO-USER-001', 'wake_time',             '07:00',      'schedule',   'explicit', NOW() - INTERVAL '3 days'),
  ('amzn1.account.DEMO-USER-001', 'preferred_temperature', '21_celsius', 'smart_home', 'voice',    NOW() - INTERVAL '2 days'),
  ('amzn1.account.DEMO-USER-001', 'home_city',             'Lagos',      'personal',   'explicit', NOW() - INTERVAL '3 days');

INSERT INTO user_instructions (user_id, instruction, priority, active, created_at) VALUES
  ('amzn1.account.DEMO-USER-001', 'Keep answers short. No jokes or upselling.', 'critical', true, NOW() - INTERVAL '3 days');

INSERT INTO conversation_context (user_id, context, priority, expires_at, related_task_id, created_at) VALUES
  ('amzn1.account.DEMO-USER-001', 'User asked to be reminded about medication at 8pm daily.', 'high', NULL, NULL, NOW() - INTERVAL '3 days');

INSERT INTO workflow_executions (user_id, task, steps, status, result, started_at, completed_at) VALUES
  ('amzn1.account.DEMO-USER-001',
   'Set up morning routine',
   '[{"order":1,"description":"Set wake-up alarm","toolUsed":"set_reminder","status":"success"},
     {"order":2,"description":"Check weather","toolUsed":"get_weather","status":"success"}]'::jsonb,
   'completed',
   'Morning routine set.',
   NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days' + INTERVAL '8 seconds');

-- ============================================================
-- SECTION B: DAY-2 STATE (run to jump straight to scene S3 for a retake;
-- equivalent to the state after S1 + S2)
-- ============================================================
INSERT INTO preferences (user_id, key, value, category, source, updated_at) VALUES
  ('amzn1.account.DEMO-USER-001', 'diet', 'vegan', 'diet', 'explicit', NOW() - INTERVAL '1 day')
ON CONFLICT (user_id, key, category) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;

INSERT INTO conversation_context (user_id, context, priority, expires_at, related_task_id, created_at) VALUES
  ('amzn1.account.DEMO-USER-001',
   'User planned vegan dinner for 4 using Pasta Primavera; 6 ingredients added to shopping list.',
   'medium', NOW() + INTERVAL '2 days', 'exec_demo_001', NOW() - INTERVAL '1 day');

INSERT INTO workflow_executions (user_id, task, steps, status, result, started_at, completed_at) VALUES
  ('amzn1.account.DEMO-USER-001',
   'Plan vegan dinner for 4',
   '[{"order":1,"description":"Find vegan, peanut-free recipe","toolUsed":"find_recipe","status":"success","output":"Vegan Pasta Primavera"}]'::jsonb,
   'completed',
   'Found Vegan Pasta Primavera for 4.',
   NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' + INTERVAL '3 seconds'),
  ('amzn1.account.DEMO-USER-001',
   'Add the dinner ingredients to my shopping list and check the weather',
   '[{"order":1,"description":"Add ingredients","toolUsed":"add_to_shopping_list","status":"success","output":"6 items added"},
     {"order":2,"description":"Check weather","toolUsed":"get_weather","status":"success","output":"Lagos: 22C, clear sky"}]'::jsonb,
   'completed',
   '6 items added. Lagos: 22C, clear sky.',
   NOW() - INTERVAL '1 day' + INTERVAL '2 minutes', NOW() - INTERVAL '1 day' + INTERVAL '2 minutes 4 seconds');

-- Quick check
SELECT 'preferences' AS tbl, COUNT(*) FROM preferences          WHERE user_id = 'amzn1.account.DEMO-USER-001'
UNION ALL SELECT 'context',      COUNT(*) FROM conversation_context WHERE user_id = 'amzn1.account.DEMO-USER-001'
UNION ALL SELECT 'executions',   COUNT(*) FROM workflow_executions  WHERE user_id = 'amzn1.account.DEMO-USER-001'
UNION ALL SELECT 'instructions', COUNT(*) FROM user_instructions    WHERE user_id = 'amzn1.account.DEMO-USER-001';
