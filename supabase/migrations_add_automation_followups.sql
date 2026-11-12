-- Per sheet automatic follow-up settings. Disabled by default.
alter table public.outreach_settings
  add column if not exists auto_follow_up boolean not null default false,
  add column if not exists auto_follow_up_ai_notes text not null default '',
  add column if not exists follow_up_after_days integer not null default 4 check (follow_up_after_days between 1 and 30),
  add column if not exists max_follow_ups integer not null default 2 check (max_follow_ups between 0 and 5);

-- Prevent overlapping cron and page-driven ticks from sending the same follow-up twice.
alter table public.conversations
  add column if not exists auto_follow_up_claimed_at timestamptz,
  add column if not exists auto_follow_up_sending_at timestamptz;
