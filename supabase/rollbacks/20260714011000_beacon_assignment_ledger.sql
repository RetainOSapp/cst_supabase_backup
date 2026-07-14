-- Roll back the additive Beacon assignment ledger.

do $$
begin
  if exists (
    select 1
    from public.security_rollout_history rollout
    where rollout.version > '20260714011000'
      and (
        rollout.migration_name like 'beacon_%'
        or rollout.migration_name like 'ai_feature_%'
      )
  ) then
    raise exception 'Roll back later Beacon/AI slices before the assignment ledger';
  end if;
end $$;

delete from public.security_rollout_history
where version = '20260714011000';

drop trigger if exists clients_capture_beacon_assignment
  on public.clients;
drop trigger if exists clients_capture_beacon_assignment_insert
  on public.clients;
drop trigger if exists clients_capture_beacon_assignment_update
  on public.clients;
drop trigger if exists clients_forbid_company_change
  on public.clients;
drop trigger if exists client_assignment_intervals_validate_insert
  on public.client_assignment_intervals;
drop trigger if exists client_assignment_intervals_append_only
  on public.client_assignment_intervals;

drop function if exists public.beacon_assignment_ledger_readiness(uuid);
drop function if exists public.beacon_capture_client_assignment_change();
drop function if exists public.beacon_forbid_client_company_change();
drop function if exists public.beacon_validate_assignment_interval_insert();
drop table if exists public.client_assignment_intervals;

notify pgrst, 'reload schema';
