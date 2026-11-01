-- Live sending log: remembers when a queued email was picked up for sending, so the log can show "Sending...".
-- Safe to run more than once. The app keeps working without it (the log just can't show the "Sending" moment).
alter table public.outreach_queue add column if not exists sending_at timestamptz;
