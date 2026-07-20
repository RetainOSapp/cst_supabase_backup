-- Permit the scheduled-activation evidence written by the Gate D functions.

alter table public.client_history_events
  drop constraint if exists client_history_events_event_type_check;

alter table public.client_history_events
  add constraint client_history_events_event_type_check
  check (
    event_type in (
      'quick_update', 'profile_update', 'client_created', 'client_offboarded',
      'client_outcomes_updated', 'client_retention_recorded', 'task_created',
      'task_updated', 'contract_created', 'contract_updated',
      'contract_archived', 'contract_deleted', 'client_status_changed',
      'client_milestone_started', 'client_milestone_completed',
      'client_pathway_changed', 'client_secondary_pathway_changed',
      'client_timed_checkpoint_completed', 'call_summary_webhook',
      'client_update_webhook', 'pipeline_activity',
      'scheduled_contract_activation_created',
      'scheduled_contract_activation_completed',
      'scheduled_contract_activation_blocked'
    )
  ) not valid;

alter table public.client_history_events
  validate constraint client_history_events_event_type_check;

notify pgrst, 'reload schema';
