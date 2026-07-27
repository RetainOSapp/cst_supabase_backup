-- Enable only Moves Method's capped daily Renewal cohort. No first backfill is
-- enrolled; the already-approved 12-card cohort covers the immediate QA set.

do $gate$
declare
  v_company_id constant uuid := '21586391-9a84-4072-9ae6-20436b27bea9';
  v_pipeline_id constant uuid := '70bb9fe9-759d-4594-a8c3-e129d984893f';
begin
  if not exists (
    select 1
    from public.company_settings settings
    join public.companies company on company.id = settings.company_id
    where company.id = v_company_id
      and company.name = 'Moves Method'
      and company.legacy_glide_row_id = 'wd7vy0vaQK2hgB3IRqy17w'
      and settings.enable_pipeline
      and settings.enable_pipeline_director_access
      and not settings.enable_pipeline_support_access
      and not settings.enable_pipeline_csm_access
      and not settings.enable_pipeline_viewer_access
  ) then
    raise exception 'Moves Method role/access binding changed';
  end if;
  if (select count(*) from public.pipeline_renewal_rollout_settings) <> 0 then
    raise exception 'Another company or pipeline is already enrolled';
  end if;
  if (
    select count(*)
    from public.client_pipeline_items
    where company_id = v_company_id
      and pipeline_id = v_pipeline_id
      and archived_at is null
      and source_contract_id is not null
      and owner_member_id is not null
  ) <> 12 then
    raise exception 'The approved 12-card MM cohort is not fully owner-assigned';
  end if;

  update public.company_pipelines
  set auto_create_renewal_items = true,
      automation_settings = coalesce(automation_settings, '{}'::jsonb)
        || jsonb_build_object(
          'automation_paused', false,
          'renewal_generation_enabled', true,
          'offboard_sync_enabled', false,
          'stage_task_creation_enabled', false
        ),
      updated_at = now()
  where id = v_pipeline_id
    and company_id = v_company_id
    and pipeline_type = 'renewal'
    and is_enabled
    and archived_at is null;
  if not found then
    raise exception 'Moves Method Renewal pipeline binding changed';
  end if;

  insert into public.pipeline_renewal_rollout_settings(
    pipeline_id,
    company_id,
    first_backfill_enabled,
    recurring_enabled,
    recurring_next_run_at,
    recurring_window_days
  ) values (
    v_pipeline_id,
    v_company_id,
    false,
    true,
    now(),
    1
  );

  update public.pipeline_scheduler_controls
  set scheduler_paused = false,
      renewal_materialization_paused = false,
      per_company_max_create = 25,
      max_total_create = 100,
      updated_at = now()
  where singleton
    and scheduler_paused
    and renewal_materialization_paused;
  if not found then
    raise exception 'Global Pipeline scheduler controls were not in the reviewed paused state';
  end if;

  insert into public.app_audit_events(
    company_id,
    event_type,
    source,
    entity_table,
    entity_id,
    title,
    summary,
    metadata
  ) values (
    v_company_id,
    'pipeline_recurring_enabled',
    'pipeline_release_gate',
    'company_pipelines',
    v_pipeline_id,
    'Daily Renewal cohort enabled',
    'Moves Method only; daily calendar-day cohort with a hard 25-item company cap.',
    jsonb_build_object(
      'first_backfill_enabled', false,
      'recurring_enabled', true,
      'per_company_max_create', 25,
      'stage_task_creation_enabled', false,
      'offboard_sync_enabled', false
    )
  );
end;
$gate$;
