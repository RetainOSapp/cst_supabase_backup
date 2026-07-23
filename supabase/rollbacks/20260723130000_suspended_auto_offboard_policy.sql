-- Fail closed once automated offboarding evidence exists.

do $rollback$
declare
  v_job_id bigint;
begin
  if exists (
    select 1
    from public.client_history_events
    where source = 'suspended_auto_offboard'
  ) then
    raise exception
      'Rollback refused: automated Suspended/MIA offboarding evidence exists.';
  end if;

  if to_regclass('cron.job') is not null then
    execute 'select jobid from cron.job where jobname = $1 limit 1'
      into v_job_id using 'retainos-suspended-auto-offboards';
    if v_job_id is not null then
      execute 'select cron.unschedule($1)' using v_job_id;
    end if;
  end if;
end;
$rollback$;

drop function if exists public.process_due_suspended_auto_offboards(
  timestamptz,
  integer
);

drop index if exists public.clients_suspended_auto_offboard_due_idx;

delete from public.company_churn_reasons
where value = 'auto_suspended_timeout'
  and metadata ->> 'automation' = 'suspended_timeout';

alter table public.company_settings
  drop constraint if exists company_settings_suspended_auto_offboard_days_check,
  drop column if exists suspended_auto_offboard_days,
  drop column if exists enable_suspended_auto_offboard;

notify pgrst, 'reload schema';
