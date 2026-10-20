-- Durable scheduled actions. Apply after 001_v3.sql.
create table if not exists scheduled_actions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  run_id text not null,
  idempotency_key text not null,
  target text not null,
  desired_state jsonb not null,
  timezone text not null,
  local_scheduled_at text not null,
  scheduled_at timestamptz not null,
  status text not null check (status in ('planned','scheduled','executed','verified','unverified','blocked','failed','cancelled')),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, idempotency_key)
);
create index if not exists scheduled_actions_due on scheduled_actions(status, scheduled_at);
create index if not exists scheduled_actions_user_run on scheduled_actions(user_id, run_id, scheduled_at);
alter table scheduled_actions enable row level security;
