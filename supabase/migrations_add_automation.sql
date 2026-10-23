-- Google Sheets outreach automation. Safe to run more than once.

-- Which connected Google accounts also granted Google Sheets access.
alter table public.connected_accounts add column if not exists sheets_enabled boolean not null default false;

-- One linked sheet per user.
create table if not exists public.outreach_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  account_id uuid references public.connected_accounts (id) on delete set null,
  spreadsheet_id text not null,
  sheet_title text not null,
  website_col text not null default 'B',
  email_col text not null default 'C',
  sent_col text not null default 'D',
  daily_limit integer not null default 20 check (daily_limit between 1 and 200),
  prompt text not null default '',
  timezone text not null default 'UTC',
  updated_at timestamptz not null default now()
);

-- Every address emailed through the automation. Prevents duplicate sends even
-- if writing the tick back to the sheet fails, and powers the daily count.
create table if not exists public.outreach_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  spreadsheet_id text not null,
  row_number integer not null,
  website text,
  email text not null,
  sent_day date not null,
  sent_at timestamptz not null default now(),
  unique (user_id, spreadsheet_id, email)
);

create index if not exists outreach_sends_day_idx on public.outreach_sends (user_id, spreadsheet_id, sent_day);

alter table public.outreach_settings enable row level security;
alter table public.outreach_sends enable row level security;

drop policy if exists "outreach_settings_own" on public.outreach_settings;
create policy "outreach_settings_own"
  on public.outreach_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "outreach_sends_select_own" on public.outreach_sends;
create policy "outreach_sends_select_own"
  on public.outreach_sends for select
  using (auth.uid() = user_id);

drop policy if exists "outreach_sends_insert_own" on public.outreach_sends;
create policy "outreach_sends_insert_own"
  on public.outreach_sends for insert
  with check (auth.uid() = user_id);
