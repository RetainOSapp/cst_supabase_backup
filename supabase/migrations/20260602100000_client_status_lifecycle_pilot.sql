-- RetainOS client status lifecycle pilot.
-- Adds app-owned status metadata and allows status-change history events.

alter table public.clients
  add column if not exists program_status_reason text,
  add column if not exists program_paused_return_date timestamptz,
  add column if not exists program_latest_suspended_date timestamptz,
  add column if not exists program_latest_pause_extension_days numeric;

create index if not exists clients_program_paused_return_date_idx
  on public.clients (program_paused_return_date);

alter table public.client_history_events
  drop constraint if exists client_history_events_event_type_check;

alter table public.client_history_events
  add constraint client_history_events_event_type_check
  check (
    event_type in (
      'quick_update',
      'profile_update',
      'client_created',
      'client_offboarded',
      'task_created',
      'contract_created',
      'client_status_changed'
    )
  );
