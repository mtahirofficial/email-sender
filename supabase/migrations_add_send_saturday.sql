-- "Also send on Saturday" for the daily schedule. Off by default: Saturday and Sunday are skipped.
-- (Sunday is always skipped.) Safe to run more than once.
alter table public.outreach_settings add column if not exists send_saturday boolean not null default false;
