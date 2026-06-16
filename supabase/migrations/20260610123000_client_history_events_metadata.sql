-- Allows history events to store structured change metadata such as custom fields.

alter table public.client_history_events
  add column if not exists metadata jsonb not null default '{}'::jsonb;
