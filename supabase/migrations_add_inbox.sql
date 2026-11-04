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
