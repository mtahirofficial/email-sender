-- Avatars bucket + contact form messages. Safe to run more than once.

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
