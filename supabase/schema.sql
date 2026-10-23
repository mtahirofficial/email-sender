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
drop policy if exists "connected_accounts_select_own" on public.connected_accounts;
create policy "connected_accounts_select_own"
  on public.connected_accounts for select
  using (auth.uid() = user_id);

drop policy if exists "connected_accounts_insert_own" on public.connected_accounts;
create policy "connected_accounts_insert_own"
  on public.connected_accounts for insert
  with check (auth.uid() = user_id);

drop policy if exists "connected_accounts_update_own" on public.connected_accounts;
create policy "connected_accounts_update_own"
  on public.connected_accounts for update
  using (auth.uid() = user_id);

drop policy if exists "connected_accounts_delete_own" on public.connected_accounts;
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

drop policy if exists "email_logs_select_own" on public.email_logs;
create policy "email_logs_select_own"
  on public.email_logs for select
  using (auth.uid() = user_id);

drop policy if exists "email_logs_insert_own" on public.email_logs;
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

drop policy if exists "email_tracking_tests_select_own" on public.email_tracking_tests;
create policy "email_tracking_tests_select_own"
  on public.email_tracking_tests for select
  using (auth.uid() = user_id);

drop policy if exists "email_tracking_tests_insert_own" on public.email_tracking_tests;
create policy "email_tracking_tests_insert_own"
  on public.email_tracking_tests for insert
  with check (auth.uid() = user_id);

drop policy if exists "email_tracking_tests_delete_own" on public.email_tracking_tests;
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

drop policy if exists "email_tracking_events_select_via_test_owner" on public.email_tracking_events;
create policy "email_tracking_events_select_via_test_owner"
  on public.email_tracking_events for select
  using (
    exists (
      select 1 from public.email_tracking_tests t
      where t.id = email_tracking_events.test_id
        and t.user_id = auth.uid()
    )
  );

-- ---- Blog ----
create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text not null,
  content text not null,
  cover_image text,
  cover_alt text,
  tags text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.blog_posts enable row level security;

-- Anyone may read PUBLISHED posts. All writes go through server routes that
-- use the service role after an admin check, so no write policies exist.
drop policy if exists "blog_posts_public_read" on public.blog_posts;
create policy "blog_posts_public_read"
  on public.blog_posts for select
  using (status = 'published');

-- Public bucket: files are readable by URL (served on the site as /images/<name>).
-- Uploads happen server-side with the service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('blog-images', 'blog-images', true, 4194304, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

-- ---- Avatars + contact messages ----
-- Public bucket: profile photos are served on the site as /avatars/<file>.
-- Uploads happen server-side with the service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Messages from the public contact form. No policies on purpose: only the
-- server (service role) can read or write them, and only the admin page reads them.
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.contact_messages enable row level security;

create index if not exists contact_messages_created_idx on public.contact_messages (created_at desc);

-- ---- AI usage ----
-- Per-user daily counter for the "Generate with AI" feature.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count integer not null default 0,
  primary key (user_id, day)
);

-- No policies on purpose: only the server (service role) reads or writes this table.
alter table public.ai_usage enable row level security;

-- ---- Outreach automation ----
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

-- ---- Connection health + saved batches ----
-- Connection health + saved automation batches. Safe to run more than once.

-- Set when Google/Microsoft stops accepting a saved connection, so the app can show "Reconnect".
alter table public.connected_accounts add column if not exists needs_reconnect boolean not null default false;

-- The reviewed-but-unsent batch (AI-written subjects and messages), one per user,
-- so a connection problem never forces the AI to write everything again.
create table if not exists public.outreach_drafts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  spreadsheet_id text not null,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.outreach_drafts enable row level security;

drop policy if exists "outreach_drafts_own" on public.outreach_drafts;
create policy "outreach_drafts_own"
  on public.outreach_drafts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---- AI presets ----
-- Admin-editable presets for the "Write with AI" dialog. Safe to run more than once.
create table if not exists public.ai_presets (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  label text not null,
  prompt text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.ai_presets enable row level security;

-- Signed-in users can read the active presets. Only the server (service role,
-- after an admin check) can change them.
drop policy if exists "ai_presets_read" on public.ai_presets;
create policy "ai_presets_read"
  on public.ai_presets for select
  to authenticated
  using (active);
