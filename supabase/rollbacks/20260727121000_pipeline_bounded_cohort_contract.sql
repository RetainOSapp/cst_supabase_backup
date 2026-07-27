-- Fail-closed rollback for bounded Pipeline renewal cohorts.
--
-- Revoke execution first. If consumed evidence exists, preserve the audit
-- records and schema but leave preview/run unreachable.

revoke execute on function public.preview_renewal_pipeline_cohort(uuid, uuid, date, date, integer, uuid, uuid)
  from service_role;
revoke execute on function public.consume_renewal_pipeline_cohort(uuid, uuid, date, date, integer, text, uuid, uuid)
  from service_role;

do $do$
declare
  v_has_evidence boolean;
begin
  select exists (
    select 1
    from public.pipeline_renewal_preview_tokens
    where consumed_at is not null or automation_run_id is not null
  ) into v_has_evidence;

  if v_has_evidence then
    raise warning 'Bounded cohort execution revoked; destructive schema teardown skipped because execution evidence exists.';
    return;
  end if;

  execute 'drop function if exists public.consume_renewal_pipeline_cohort(uuid, uuid, date, date, integer, text, uuid, uuid)';
  execute 'drop function if exists public.preview_renewal_pipeline_cohort(uuid, uuid, date, date, integer, uuid, uuid)';
  execute 'drop table if exists public.pipeline_renewal_preview_tokens';
end;
$do$;

notify pgrst, 'reload schema';
