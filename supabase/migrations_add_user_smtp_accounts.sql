-- Adds per-user SMTP sending accounts beside Google and Microsoft accounts.
alter table public.connected_accounts
  drop constraint if exists connected_accounts_provider_check;

alter table public.connected_accounts
  add constraint connected_accounts_provider_check check (provider in ('google', 'microsoft', 'smtp'));

alter table public.connected_accounts
  add column if not exists smtp_host text,
  add column if not exists smtp_port integer,
  add column if not exists smtp_secure boolean not null default false;

create index if not exists connected_accounts_user_provider_idx
  on public.connected_accounts (user_id, provider);
