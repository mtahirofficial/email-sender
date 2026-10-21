-- Per-user daily counter for the "Generate with AI" feature. Safe to run more than once.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count integer not null default 0,
  primary key (user_id, day)
);

-- No policies on purpose: only the server (service role) reads or writes this table.
alter table public.ai_usage enable row level security;
