-- Remembers when the background scheduler last called the app, so the UI can show whether it is running.
create table if not exists public.scheduler_heartbeat (
  id integer primary key default 1 check (id = 1),
  last_tick_at timestamptz not null default now()
);

-- No policies on purpose: only the server (service role) reads or writes it.
alter table public.scheduler_heartbeat enable row level security;
