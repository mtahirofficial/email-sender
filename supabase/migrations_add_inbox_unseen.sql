-- Highlights a new reply that arrives on a conversation you marked "done". Safe to run more than once.
alter table public.conversations add column if not exists reply_unseen boolean not null default false;
