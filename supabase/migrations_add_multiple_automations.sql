-- Allow each user to link several independent Google Sheets automations.
-- Safe to run once on existing installations; the existing sheet keeps its settings.

alter table public.outreach_settings
  add column if not exists id uuid default gen_random_uuid();

alter table public.outreach_settings alter column id set not null;
alter table public.outreach_settings drop constraint if exists outreach_settings_pkey;
alter table public.outreach_settings add constraint outreach_settings_pkey primary key (id);
create unique index if not exists outreach_settings_user_sheet_idx
  on public.outreach_settings (user_id, spreadsheet_id);

-- Preserve the existing saved draft under its associated sheet.
alter table public.outreach_drafts drop constraint if exists outreach_drafts_pkey;
alter table public.outreach_drafts add constraint outreach_drafts_pkey primary key (user_id, spreadsheet_id);

-- Sender limits belong to an automation. Copy existing limits to that user's current sheet.
alter table public.outreach_senders add column if not exists automation_id uuid;
update public.outreach_senders sender
set automation_id = settings.id
from public.outreach_settings settings
where sender.user_id = settings.user_id and sender.automation_id is null;

-- A sender row without a linked automation is stale and cannot be used.
delete from public.outreach_senders where automation_id is null;
alter table public.outreach_senders alter column automation_id set not null;
alter table public.outreach_senders drop constraint if exists outreach_senders_pkey;
alter table public.outreach_senders add constraint outreach_senders_pkey primary key (automation_id, account_id);
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.conrelid = 'public.outreach_senders'::regclass
      and c.contype = 'f'
      and a.attname = 'automation_id'
  ) then
    alter table public.outreach_senders
      add constraint outreach_senders_automation_fk foreign key (automation_id)
      references public.outreach_settings (id) on delete cascade;
  end if;
end $$;

