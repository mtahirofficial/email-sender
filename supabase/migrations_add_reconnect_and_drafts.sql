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
