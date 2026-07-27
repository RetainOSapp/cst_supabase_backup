-- Fail-closed rollback for Pipeline production-rollout foundation.
--
-- If operational evidence exists, this rollback intentionally keeps the
-- evidence-bearing schema in place while permanently pausing and unscheduling
-- the new renewal scheduler. Raising an exception here would undo those safety
-- writes in the surrounding migration transaction.

update public.pipeline_scheduler_controls
set scheduler_paused = true, renewal_materialization_paused = true,
    updated_at = now()
where singleton;

update public.pipeline_renewal_rollout_settings
set first_backfill_enabled = false, recurring_enabled = false, updated_at = now()
where first_backfill_enabled or recurring_enabled;

do $do$
declare
  v_job_id bigint;
  v_has_evidence boolean;
begin
  if to_regclass('cron.job') is not null then
    select jobid into v_job_id
    from cron.job
    where jobname = 'retainos-pipeline-renewal-scheduler'
    limit 1;
    if v_job_id is not null then
      perform cron.unschedule(v_job_id);
    end if;
  end if;

  select
    exists (select 1 from public.pipeline_scheduler_runs)
    or exists (
      select 1
      from public.pipeline_automation_runs
      where run_type in ('first_backfill', 'recurring')
         or scheduler_run_id is not null
    )
    or exists (
      select 1
      from public.pipeline_renewal_rollout_settings
      where first_backfill_completed_at is not null
    )
  into v_has_evidence;

  if v_has_evidence then
    raise warning 'Pipeline scheduler paused and unscheduled; destructive schema teardown skipped because operational evidence exists.';
    return;
  end if;

  execute 'drop function if exists public.run_due_pipeline_scheduler(timestamptz, integer, integer)';
  execute 'drop function if exists public.get_pipeline_automation_status(uuid)';
  execute 'drop function if exists public.materialize_renewal_pipeline_window(uuid, uuid, timestamptz, timestamptz, timestamptz, integer, text, text, uuid)';

  execute 'alter table public.pipeline_automation_runs drop constraint if exists pipeline_automation_runs_scheduler_run_fkey';
  execute 'alter table public.pipeline_automation_runs drop constraint if exists pipeline_automation_runs_run_type_check';
  execute 'alter table public.pipeline_automation_runs drop constraint if exists pipeline_automation_runs_window_check';
  execute 'alter table public.pipeline_automation_runs drop constraint if exists pipeline_automation_runs_max_create_check';
  execute 'alter table public.pipeline_automation_runs drop column if exists requested_by_source,
    drop column if exists scheduler_run_id, drop column if exists max_create,
    drop column if exists window_end_at, drop column if exists window_start_at, drop column if exists run_type';
  execute 'drop table if exists public.pipeline_scheduler_runs';
  execute 'drop table if exists public.pipeline_renewal_rollout_settings';
  execute 'drop table if exists public.pipeline_scheduler_controls';
end;
$do$;

notify pgrst, 'reload schema';
