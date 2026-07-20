-- Roll back the additive Pipeline Phase 0-2 foundation.
-- Operational rollback should normally stop after disabling the gates. Before
-- dropping tables in a pilot environment, preserve any required evidence.

update public.company_settings
set
  enable_pipeline = false,
  enable_pipeline_viewer_access = false
where enable_pipeline = true
   or enable_pipeline_viewer_access = true;

drop policy if exists client_pipeline_stage_events_authenticated_read
  on public.client_pipeline_stage_events;
drop policy if exists client_pipeline_items_authenticated_read
  on public.client_pipeline_items;
drop policy if exists company_pipeline_stages_authenticated_read
  on public.company_pipeline_stages;
drop policy if exists company_pipelines_authenticated_read
  on public.company_pipelines;

revoke all on function public.is_company_pipeline_viewer_access_enabled(uuid)
  from authenticated, service_role;
revoke all on function public.is_company_pipeline_enabled(uuid)
  from authenticated, service_role;
drop function if exists public.is_company_pipeline_viewer_access_enabled(uuid);
drop function if exists public.is_company_pipeline_enabled(uuid);

revoke all on function public.update_company_pipeline_gates_with_audit(
  uuid, boolean, boolean, uuid, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function public.apply_pipeline_configuration_with_audit(
  uuid, text, uuid, jsonb, uuid, uuid, text, text, text, text
) from public, anon, authenticated, service_role;
drop function if exists public.update_company_pipeline_gates_with_audit(
  uuid, boolean, boolean, uuid, uuid, text
);
drop function if exists public.apply_pipeline_configuration_with_audit(
  uuid, text, uuid, jsonb, uuid, uuid, text, text, text, text
);

-- The prior history constraint cannot be restored while Pipeline-only event
-- values remain. Preserve required pilot evidence before running this rollback.
delete from public.client_history_events
where event_type = 'pipeline_activity';

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
      'client_outcomes_updated',
      'client_retention_recorded',
      'task_created',
      'task_updated',
      'contract_created',
      'contract_updated',
      'contract_archived',
      'contract_deleted',
      'client_status_changed',
      'client_milestone_started',
      'client_milestone_completed',
      'client_pathway_changed',
      'client_secondary_pathway_changed',
      'client_timed_checkpoint_completed',
      'call_summary_webhook',
      'client_update_webhook'
    )
  );

drop trigger if exists client_pipeline_stage_events_append_only
  on public.client_pipeline_stage_events;
drop function if exists public.prevent_client_pipeline_stage_event_mutation();

revoke all on function public.mutate_pipeline_item_with_evidence(
  uuid, uuid, text, jsonb, uuid, uuid, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.create_pipeline_item_with_evidence(
  uuid, uuid, uuid, uuid, uuid, text, text, text, text, bigint, text,
  timestamptz, timestamptz, timestamptz, text, text, text, jsonb,
  uuid, uuid, text
) from public, anon, authenticated, service_role;
drop function if exists public.mutate_pipeline_item_with_evidence(
  uuid, uuid, text, jsonb, uuid, uuid, text, text
);
drop function if exists public.create_pipeline_item_with_evidence(
  uuid, uuid, uuid, uuid, uuid, text, text, text, text, bigint, text,
  timestamptz, timestamptz, timestamptz, text, text, text, jsonb,
  uuid, uuid, text
);

drop index if exists public.company_pipeline_stages_active_terminal_unique_idx;

drop table if exists public.client_pipeline_stage_events;
drop table if exists public.client_pipeline_items;
drop table if exists public.company_pipeline_stages;
drop table if exists public.company_pipelines;

drop index if exists public.pipeline_clients_id_company_unique_idx;

alter table public.company_settings
  drop column if exists enable_pipeline_viewer_access,
  drop column if exists enable_pipeline;

notify pgrst, 'reload schema';
