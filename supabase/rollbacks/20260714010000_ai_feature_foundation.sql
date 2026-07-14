-- Roll back the secure AI feature foundation.
-- Apply only after all later Beacon/AI migrations have been rolled back.

do $$
begin
  if exists (
    select 1
    from public.security_rollout_history rollout
    where rollout.version > '20260714010000'
      and (
        rollout.migration_name like 'beacon_%'
        or rollout.migration_name like 'ai_feature_%'
      )
  ) then
    raise exception 'Roll back later Beacon/AI slices before the foundation';
  end if;
end $$;

delete from public.security_rollout_history
where version = '20260714010000';

drop trigger if exists ai_feature_global_controls_set_updated_at
  on public.ai_feature_global_controls;
drop trigger if exists company_ai_entitlements_set_updated_at
  on public.company_ai_feature_entitlements;
drop trigger if exists company_ai_allowances_guard_update
  on public.company_ai_feature_allowances;
drop trigger if exists ai_usage_events_append_only
  on public.ai_usage_events;
drop trigger if exists ai_usage_events_validate_insert
  on public.ai_usage_events;
drop trigger if exists ai_usage_period_totals_validate_write
  on public.ai_usage_period_totals;

drop function if exists public.ai_feature_validate_period_total_write();
drop function if exists public.ai_feature_validate_usage_event_insert();
drop function if exists public.ai_feature_guard_allowance_update();
drop function if exists public.ai_feature_reject_append_only_mutation();

drop table if exists public.ai_usage_period_totals;
drop table if exists public.ai_usage_events;
drop table if exists public.ai_feature_global_controls;
drop table if exists public.company_ai_feature_allowances;
drop table if exists public.company_ai_feature_entitlements;

notify pgrst, 'reload schema';
