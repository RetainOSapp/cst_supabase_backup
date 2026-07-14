-- Roll back Beacon Phase A service-only actor-bound read RPCs.

do $$
begin
  if exists (
    select 1
    from public.security_rollout_history rollout
    where rollout.version > '20260714013000'
      and (
        rollout.migration_name like 'beacon_%'
        or rollout.migration_name like 'ai_feature_%'
      )
  ) then
    raise exception 'Roll back later Beacon/AI slices before Phase A read RPCs';
  end if;
end $$;

delete from public.security_rollout_history
where version = '20260714013000';

drop function if exists public.beacon_get_client_brief(uuid, uuid, uuid, uuid);
drop function if exists public.beacon_list_csm_books(uuid, uuid, uuid, uuid, integer);
drop function if exists public.beacon_list_referral_ready(uuid, uuid, uuid, integer);
drop function if exists public.beacon_list_health_signals(uuid, uuid, uuid, text, text, integer);
drop function if exists public.beacon_list_contract_gaps(uuid, uuid, uuid, integer);
drop function if exists public.beacon_list_renewals(uuid, uuid, uuid, integer, integer);
drop function if exists public.beacon_list_clients(
  uuid, uuid, uuid, text, text, text, uuid, text, text, integer
);
drop function if exists public.beacon_company_metrics(uuid, uuid, uuid);
drop function if exists public.beacon_authorized_client_ids(uuid, uuid, uuid);
drop function if exists public.beacon_actor_company_scope(uuid, uuid, uuid);

notify pgrst, 'reload schema';
