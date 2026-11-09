-- Add per-sheet background notes used when AI writes automation emails.
-- Safe to run more than once.
alter table public.outreach_settings
  add column if not exists ai_notes text not null default '';
