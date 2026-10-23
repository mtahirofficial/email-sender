-- Admin-editable presets for the "Write with AI" dialog. Safe to run more than once.
create table if not exists public.ai_presets (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  label text not null,
  prompt text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.ai_presets enable row level security;

-- Signed-in users can read the active presets. Only the server (service role,
-- after an admin check) can change them.
drop policy if exists "ai_presets_read" on public.ai_presets;
create policy "ai_presets_read"
  on public.ai_presets for select
  to authenticated
  using (active);
