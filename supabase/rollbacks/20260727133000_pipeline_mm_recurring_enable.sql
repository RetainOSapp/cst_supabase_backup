-- Immediate MM recurrence stop. Existing Pipeline items and audit evidence stay.

update public.pipeline_scheduler_controls
set scheduler_paused = true,
    renewal_materialization_paused = true,
    updated_at = now()
where singleton;

update public.pipeline_renewal_rollout_settings
set recurring_enabled = false,
    first_backfill_enabled = false,
    updated_at = now()
where company_id = '21586391-9a84-4072-9ae6-20436b27bea9'::uuid
  and pipeline_id = '70bb9fe9-759d-4594-a8c3-e129d984893f'::uuid;

update public.company_pipelines
set auto_create_renewal_items = false,
    automation_settings = coalesce(automation_settings, '{}'::jsonb)
      || jsonb_build_object(
        'automation_paused', true,
        'renewal_generation_enabled', false
      ),
    updated_at = now()
where company_id = '21586391-9a84-4072-9ae6-20436b27bea9'::uuid
  and id = '70bb9fe9-759d-4594-a8c3-e129d984893f'::uuid;
