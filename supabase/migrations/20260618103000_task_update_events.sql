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
      'task_updated',
      'contract_created',
      'contract_updated',
      'contract_archived',
      'client_status_changed',
      'client_milestone_started',
      'client_milestone_completed',
      'client_pathway_changed',
      'client_retention_recorded',
      'client_outcomes_updated',
      'call_summary_webhook',
      'client_update_webhook'
    )
  );
