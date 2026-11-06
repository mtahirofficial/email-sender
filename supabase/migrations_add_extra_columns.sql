-- Optional extra sheet columns for the automation: [{ "col": "F", "header": "Owner name" }, ...].
-- Their values are given to the AI for each recipient, so the prompt can use them. Safe to run more than once.
alter table public.outreach_settings add column if not exists extra_cols jsonb not null default '[]'::jsonb;
