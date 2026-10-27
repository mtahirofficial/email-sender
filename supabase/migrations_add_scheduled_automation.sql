-- Per-account limits + scheduled, paced automation. Safe to run more than once.

alter table public.outreach_settings
  add column if not exists filter_col text,
  add column if not exists filter_value text,
  add column if not exists schedule_enabled boolean not null default false,
  add column if not exists schedule_time text not null default '10:00',
  add column if not exists pause_seconds integer not null default 90,
  add column if not exists last_scheduled_day date,
  add column if not exists schedule_retry_at timestamptz,
  add column if not exists schedule_error text;

alter table public.outreach_sends
  add column if not exists account_id uuid references public.connected_accounts (id) on delete set null;

-- One row per connected account: how many emails it may send per day.
create table if not exists public.outreach_senders (
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.connected_accounts (id) on delete cascade,
  daily_limit integer not null default 20 check (daily_limit between 0 and 500),
  enabled boolean not null default true,
  primary key (user_id, account_id)
);

-- Emails written for a scheduled run, each with the time it may be sent.
-- The message body is cleared once an email has been sent.
create table if not exists public.outreach_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.connected_accounts (id) on delete cascade,
  spreadsheet_id text not null,
  day date not null,
  row_number integer not null,
  website text,
  email text not null,
  subject text not null,
  body text not null,
  send_after timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists outreach_queue_due_idx on public.outreach_queue (status, send_after);
create index if not exists outreach_queue_user_day_idx on public.outreach_queue (user_id, day);

alter table public.outreach_senders enable row level security;
alter table public.outreach_queue enable row level security;

drop policy if exists "outreach_senders_own" on public.outreach_senders;
create policy "outreach_senders_own"
  on public.outreach_senders for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The queue is written by the server only; users may read their own rows.
drop policy if exists "outreach_queue_select_own" on public.outreach_queue;
create policy "outreach_queue_select_own"
  on public.outreach_queue for select
  using (auth.uid() = user_id);
