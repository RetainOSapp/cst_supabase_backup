-- Guarded rollback for Pipeline Phase 3-4 workflows.
-- Evidence-bearing workflow data is never discarded by this rollback.

update public.company_pipelines
set auto_create_renewal_items = false,
    automation_settings = coalesce(automation_settings,'{}'::jsonb)
      || jsonb_build_object(
        'renewal_generation_enabled', false,
        'offboard_sync_enabled', false,
        'stage_task_creation_enabled', false,
        'automation_paused', true
      )
where auto_create_renewal_items
   or coalesce(automation_settings->>'renewal_generation_enabled','false')='true'
   or coalesce(automation_settings->>'offboard_sync_enabled','false')='true'
   or coalesce(automation_settings->>'stage_task_creation_enabled','false')='true';

drop trigger if exists clients_close_renewal_pipeline_on_offboard on public.clients;
drop function if exists public.close_renewal_pipeline_items_on_offboard();
drop trigger if exists client_pipeline_stage_events_create_template_tasks on public.client_pipeline_stage_events;
drop function if exists public.create_pipeline_tasks_after_stage_event();
drop function if exists public.create_expansion_pipeline_item_with_target(uuid,uuid,uuid,uuid,uuid,text,text,text,text,bigint,text,timestamptz,timestamptz,text,jsonb,text,uuid,uuid,text);
drop function if exists public.set_pipeline_item_target_offer_with_evidence(uuid,uuid,text,uuid,uuid,text);
drop function if exists public.configure_pipeline_automation_with_audit(uuid,uuid,boolean,boolean,uuid,integer,boolean,boolean,boolean,uuid,uuid,text);
drop function if exists public.generate_due_renewal_pipeline_items(uuid,timestamptz,text,uuid,uuid);
drop function if exists public.preview_due_renewal_pipeline_items(uuid,uuid,timestamptz);
drop function if exists public.create_contract_and_close_pipeline_item(uuid,uuid,timestamptz,timestamptz,numeric,numeric,numeric,boolean,text,text,uuid,uuid,text,text,boolean);
drop function if exists public.resolve_pipeline_item_lost(uuid,uuid,text,text,text,uuid,uuid,text);
drop function if exists public.create_pipeline_tasks_for_stage_event(uuid,uuid,uuid,timestamptz);

do $$
begin
  if exists(select 1 from public.pipeline_automation_runs) then
    raise exception 'Rollback refused: pipeline_automation_runs contains operational evidence.';
  end if;
  if exists(select 1 from public.client_tasks where pipeline_item_id is not null or pipeline_stage_event_id is not null or task_template_id is not null) then
    raise exception 'Rollback refused: client_tasks contains durable Pipeline links.';
  end if;
  if exists(select 1 from public.company_task_templates where trigger_type='pipeline_stage_entered' or applies_to_pipeline_id is not null or applies_to_pipeline_stage_id is not null) then
    raise exception 'Rollback refused: Pipeline task templates exist.';
  end if;
  if exists(select 1 from public.client_pipeline_items where result_contract_id is not null or target_offer_id is not null or automation_key is not null) then
    raise exception 'Rollback refused: Pipeline item workflow links exist.';
  end if;
  if exists(select 1 from public.client_contracts where origin_pipeline_item_id is not null or contract_type<>'standard' or billing_cadence<>'unknown' or currency_code<>'USD') then
    raise exception 'Rollback refused: contract workflow classifications or links exist.';
  end if;
end $$;

drop policy if exists "pipeline_automation_runs_authenticated_read" on public.pipeline_automation_runs;
drop policy if exists "pipeline_automation_runs_no_anon_access" on public.pipeline_automation_runs;
drop table if exists public.pipeline_automation_runs;

alter table public.client_tasks drop constraint if exists client_tasks_stage_event_template_unique;
alter table public.client_tasks drop constraint if exists client_tasks_task_template_fkey;
alter table public.client_tasks drop constraint if exists client_tasks_pipeline_stage_event_fkey;
alter table public.client_tasks drop constraint if exists client_tasks_pipeline_item_fkey;
drop index if exists public.client_tasks_pipeline_item_idx;
alter table public.client_tasks
  drop column if exists task_template_id,
  drop column if exists pipeline_stage_event_id,
  drop column if exists pipeline_item_id;

alter table public.company_task_templates drop constraint if exists company_task_templates_pipeline_stage_fkey;
alter table public.company_task_templates drop constraint if exists company_task_templates_pipeline_fkey;
alter table public.company_task_templates drop constraint if exists company_task_templates_pipeline_due_source_check;
alter table public.company_task_templates drop constraint if exists company_task_templates_trigger_type_check;
alter table public.company_task_templates add constraint company_task_templates_trigger_type_check
  check (trigger_type in ('manual','client_created','milestone_completed'));
alter table public.company_task_templates drop constraint if exists company_task_templates_assign_to_type_check;
alter table public.company_task_templates add constraint company_task_templates_assign_to_type_check
  check (assign_to_type in ('assigned_csm','director','support','specific_member','unassigned'));
alter table public.company_task_templates
  drop column if exists pipeline_due_date_source,
  drop column if exists applies_to_pipeline_stage_id,
  drop column if exists applies_to_pipeline_id;

drop index if exists public.company_pipelines_one_active_auto_renewal_idx;
alter table public.company_pipelines drop column if exists auto_create_renewal_items;

drop index if exists public.client_pipeline_items_active_automation_key_unique_idx;
drop index if exists public.client_pipeline_items_active_source_contract_unique_idx;
alter table public.client_pipeline_items drop constraint if exists client_pipeline_items_target_offer_fkey;
alter table public.client_pipeline_items drop constraint if exists client_pipeline_items_result_contract_fkey;
alter table public.client_contracts drop constraint if exists client_contracts_origin_pipeline_item_fkey;
alter table public.client_pipeline_items
  drop column if exists automation_key,
  drop column if exists target_offer_id,
  drop column if exists result_contract_id;
create unique index if not exists client_pipeline_items_pipeline_contract_unique_idx
  on public.client_pipeline_items(pipeline_id,source_contract_id)
  where source_contract_id is not null and archived_at is null;

alter table public.client_contracts drop constraint if exists client_contracts_currency_code_check;
alter table public.client_contracts drop constraint if exists client_contracts_billing_cadence_check;
alter table public.client_contracts drop constraint if exists client_contracts_contract_type_check;
alter table public.client_contracts
  drop column if exists origin_pipeline_item_id,
  drop column if exists currency_code,
  drop column if exists billing_cadence,
  drop column if exists contract_type;

notify pgrst, 'reload schema';
