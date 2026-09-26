-- Run this in the Supabase SQL Editor (Project -> SQL Editor -> New query)

create table if not exists public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  email text not null,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, provider, email)
);

alter table public.connected_accounts enable row level security;

-- A user can only ever see, insert, update or delete their own connected accounts.
create policy "connected_accounts_select_own"
  on public.connected_accounts for select
  using (auth.uid() = user_id);

create policy "connected_accounts_insert_own"
  on public.connected_accounts for insert
  with check (auth.uid() = user_id);

create policy "connected_accounts_update_own"
  on public.connected_accounts for update
  using (auth.uid() = user_id);

create policy "connected_accounts_delete_own"
  on public.connected_accounts for delete
  using (auth.uid() = user_id);

-- Log of every send attempt, used to show a "Sent" list in the dashboard.
create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid references public.connected_accounts (id) on delete set null,
  from_email text not null,
  to_email text not null,
  subject text not null,
  status text not null check (status in ('sent', 'failed')),
  error text,
  sent_at timestamptz not null default now()
);

alter table public.email_logs enable row level security;

create index if not exists email_logs_user_id_sent_at_idx
  on public.email_logs (user_id, sent_at desc);

create policy "email_logs_select_own"
  on public.email_logs for select
  using (auth.uid() = user_id);

create policy "email_logs_insert_own"
  on public.email_logs for insert
  with check (auth.uid() = user_id);

-- ---- Email HTML Tracking Element Test module ----
-- See migrations_add_email_tracking_test.sql for the full comments.

create table if not exists public.email_tracking_tests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  public_test_id text not null unique,
  label text,
  subject text not null,
  element_tokens jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.email_tracking_tests enable row level security;

create policy "email_tracking_tests_select_own"
  on public.email_tracking_tests for select
  using (auth.uid() = user_id);

create policy "email_tracking_tests_insert_own"
  on public.email_tracking_tests for insert
  with check (auth.uid() = user_id);

create policy "email_tracking_tests_delete_own"
  on public.email_tracking_tests for delete
  using (auth.uid() = user_id);

create table if not exists public.email_tracking_events (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.email_tracking_tests (id) on delete cascade,
  element_type text not null,
  occurred_at timestamptz not null default now(),
  method text not null,
  user_agent text,
  ip text,
  headers jsonb,
  query jsonb,
  referer text,
  status_code integer not null
);

alter table public.email_tracking_events enable row level security;

create index if not exists email_tracking_events_test_id_idx
  on public.email_tracking_events (test_id, element_type, occurred_at);

create policy "email_tracking_events_select_via_test_owner"
  on public.email_tracking_events for select
  using (
    exists (
      select 1 from public.email_tracking_tests t
      where t.id = email_tracking_events.test_id
        and t.user_id = auth.uid()
    )
  );
