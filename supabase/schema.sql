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

-- A user's own AI key (Groq), stored encrypted. Only the server (service role) can read it.
create table if not exists public.user_ai_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  provider text not null default 'groq',
  api_key text not null,
  key_hint text,
  created_at timestamptz not null default now()
);
alter table public.user_ai_keys enable row level security;


-- ---- Outreach automation ----
-- Google Sheets outreach automation. Safe to run more than once.

-- Which connected Google accounts also granted Google Sheets access.
alter table public.connected_accounts add column if not exists sheets_enabled boolean not null default false;

-- One independent configuration per linked spreadsheet.
create table if not exists public.outreach_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid references public.connected_accounts (id) on delete set null,
  spreadsheet_id text not null,
  sheet_title text not null,
  website_col text not null default 'B',
  email_col text not null default 'C',
  sent_col text not null default 'D',
  daily_limit integer not null default 20 check (daily_limit between 1 and 200),
  prompt text not null default '',
  auto_follow_up boolean not null default false,
  auto_follow_up_ai_notes text not null default '',
  follow_up_after_days integer not null default 4 check (follow_up_after_days between 1 and 30),
  max_follow_ups integer not null default 2 check (max_follow_ups between 0 and 5),
  ai_notes text not null default '',
  timezone text not null default 'UTC',
  updated_at timestamptz not null default now()
);

create unique index if not exists outreach_settings_user_sheet_idx
  on public.outreach_settings (user_id, spreadsheet_id);

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
  user_id uuid not null references auth.users (id) on delete cascade,
  spreadsheet_id text not null,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, spreadsheet_id)
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

-- ---- Scheduled automation ----
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

-- Per automation and connected account: how many emails that sheet may send per day.
create table if not exists public.outreach_senders (
  user_id uuid not null references auth.users (id) on delete cascade,
  automation_id uuid not null references public.outreach_settings (id) on delete cascade,
  account_id uuid not null references public.connected_accounts (id) on delete cascade,
  daily_limit integer not null default 20 check (daily_limit between 0 and 500),
  enabled boolean not null default true,
  primary key (automation_id, account_id)
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

-- ---- Scheduler heartbeat ----
-- Remembers when the background scheduler last called the app, so the UI can show whether it is running.
create table if not exists public.scheduler_heartbeat (
  id integer primary key default 1 check (id = 1),
  last_tick_at timestamptz not null default now()
);

-- No policies on purpose: only the server (service role) reads or writes it.
alter table public.scheduler_heartbeat enable row level security;

-- "Also send on Saturday" for the daily schedule (off by default; Sunday is always skipped).
alter table public.outreach_settings add column if not exists send_saturday boolean not null default false;

-- Live sending log: when a queued email was picked up for sending.
alter table public.outreach_queue add column if not exists sending_at timestamptz;
-- Inbox: replies to the emails Outbox sent, and follow-ups for the ones nobody answered. Safe to run more than once.

-- Which Gmail accounts allowed Outbox to read replies (an optional, separate permission).
alter table public.connected_accounts add column if not exists inbox_enabled boolean not null default false;

-- One row per person emailed from a connected account. Message bodies are NOT stored here:
-- they are read from Gmail only when you open a conversation.
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.connected_accounts (id) on delete cascade,
  to_email text not null,
  subject text not null,
  sent_at timestamptz not null,
  thread_id text,
  status text not null default 'waiting' check (status in ('waiting', 'replied', 'answered', 'bounced', 'closed')),
  reply_from text,
  reply_snippet text,
  reply_at timestamptz,
  follow_up_count integer not null default 0,
  last_follow_up_at timestamptz,
  auto_follow_up_claimed_at timestamptz,
  auto_follow_up_sending_at timestamptz,
  ai_intent text,
  ai_summary text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, account_id, to_email)
);

create index if not exists conversations_user_status_idx on public.conversations (user_id, status);
alter table public.conversations enable row level security;

drop policy if exists "conversations_own" on public.conversations;
create policy "conversations_own" on public.conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.inbox_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  follow_up_after_days integer not null default 4 check (follow_up_after_days between 1 and 30),
  max_follow_ups integer not null default 2 check (max_follow_ups between 0 and 5),
  instructions text not null default '',
  last_sync_at timestamptz
);

alter table public.inbox_settings enable row level security;

drop policy if exists "inbox_settings_own" on public.inbox_settings;
create policy "inbox_settings_own" on public.inbox_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Highlights a new reply on a conversation marked done.
alter table public.conversations add column if not exists reply_unseen boolean not null default false;

-- Optional extra sheet columns for the automation (their values are given to the AI).
alter table public.outreach_settings add column if not exists extra_cols jsonb not null default '[]'::jsonb;
alter table public.outreach_settings add column if not exists ai_notes text not null default '';
