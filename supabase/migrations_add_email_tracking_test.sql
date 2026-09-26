-- Run this in the Supabase SQL Editor. Adds the tables for the
-- experimental "Email HTML Tracking Element Test" module.
-- Safe to run on top of schema.sql + migrations_add_email_logs.sql.

-- One row per test you create. `public_test_id` and `element_tokens` are the
-- only things ever embedded in the outgoing tracking URLs — the internal
-- `id` (uuid) is never exposed to a recipient's mail client.
create table if not exists public.email_tracking_tests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  public_test_id text not null unique,
  label text,
  subject text not null,
  -- { "img": "<random token>", "background": "<random token>", ... }
  -- one unguessable token per element type, generated at creation time.
  element_tokens jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.email_tracking_tests enable row level security;

create policy "email_tracking_tests_select_own"
  on public.email_tracking_tests for select
  using (auth.uid() = user_id);

create policy "email_tracking_tests_insert_own"
  on public.email_tracking_tests for insert
  with check (auth.uid() = user_id);

create policy "email_tracking_tests_delete_own"
  on public.email_tracking_tests for delete
  using (auth.uid() = user_id);

-- One row per resource request the tracking endpoint receives. Written by
-- the server using the service-role client (the request comes from an
-- anonymous mail client, not a signed-in user), so no insert policy is
-- defined here — the service role bypasses RLS by design. Reading is
-- restricted to the owner of the parent test.
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

create policy "email_tracking_events_select_via_test_owner"
  on public.email_tracking_events for select
  using (
    exists (
      select 1 from public.email_tracking_tests t
      where t.id = email_tracking_events.test_id
        and t.user_id = auth.uid()
    )
  );
