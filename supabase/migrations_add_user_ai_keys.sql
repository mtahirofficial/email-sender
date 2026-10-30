-- A user's own AI key (Groq), so their drafts are written with their key instead of the shared free one.
-- The key is stored encrypted (AES-256-GCM, same TOKEN_ENCRYPTION_KEY as the Gmail/Outlook tokens).
-- Safe to run more than once.
create table if not exists public.user_ai_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  provider text not null default 'groq',
  api_key text not null,          -- encrypted
  key_hint text,                  -- last 4 characters, to show which key is saved
  created_at timestamptz not null default now()
);

-- No policies on purpose: only the server (service role) reads or writes this table,
-- so the key can never be read from the browser.
alter table public.user_ai_keys enable row level security;
