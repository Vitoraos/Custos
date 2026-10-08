-- ContextForge v3 schema. Apply once via Supabase dashboard SQL editor
-- (supabase-js has no DDL path; this file is the authoritative migration).
-- Service-role key bypasses RLS; anon/authenticated roles get no policies
-- (deny by default). App scopes every query by user_id.

create table memories (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null,
  profile      text not null default 'household',
  kind         text not null check (kind in ('constraint','fact','instruction')),
  payload      jsonb not null,
  source       text not null check (source in ('user_voice','explicit','inferred','external')),
  status       text not null default 'active' check (status in ('active','pending_confirmation','revoked')),
  evidence     text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at   timestamptz,
  revoked_at   timestamptz
);
create index memories_user_status on memories (user_id, status);

create table action_receipts (
  id              uuid primary key default gen_random_uuid(),
  user_id         text not null,
  tool            text not null,
  idempotency_key text not null,
  args            jsonb not null,
  decision        jsonb,
  expectation     jsonb,
  observed        jsonb,
  outcome         text not null,
  attempts        int  not null default 1,
  latency_ms      int,
  created_at      timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index receipts_user_created on action_receipts (user_id, created_at desc);

create table device_state (
  user_id text not null, device text not null, state jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, device)
);

create table fault_config (
  user_id text primary key, profile text not null default 'none', params jsonb not null default '{}'
);

create table list_items (
  id uuid primary key default gen_random_uuid(), user_id text not null, list text not null default 'shopping',
  item text not null, dedupe_key text not null, created_at timestamptz default now(),
  unique (user_id, list, dedupe_key)
);

create table api_keys (
  key_hash text primary key,
  user_id  text not null,
  mode     text not null default 'forge' check (mode in ('forge','baseline')),
  label    text, created_at timestamptz default now(), revoked_at timestamptz
);
create index api_keys_user on api_keys (user_id);

alter table memories enable row level security;
alter table action_receipts enable row level security;
alter table device_state enable row level security;
alter table fault_config enable row level security;
alter table list_items enable row level security;
alter table api_keys enable row level security;
