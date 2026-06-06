-- RetainOS client create pilot.
-- Allows app-owned client creation events in client history.

alter table public.client_history_events
  drop constraint if exists client_history_events_event_type_check;

alter table public.client_history_events
  add constraint client_history_events_event_type_check
  check (event_type in ('quick_update', 'profile_update', 'client_created'));
