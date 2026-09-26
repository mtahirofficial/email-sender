-- Run this in the Supabase SQL Editor AFTER schema.sql.
-- Adds a log of every send attempt so the app can show a "Sent" list.

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

-- A user can only ever see their own sent/failed history.
create policy "email_logs_select_own"
  on public.email_logs for select
  using (auth.uid() = user_id);

-- Inserts happen from the server using the signed-in user's own session,
-- so this mirrors the same "only your own rows" rule.
create policy "email_logs_insert_own"
  on public.email_logs for insert
  with check (auth.uid() = user_id);
