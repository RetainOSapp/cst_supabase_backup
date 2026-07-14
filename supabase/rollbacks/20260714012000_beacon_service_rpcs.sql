-- Roll back Beacon server-only RPCs.

do $$
begin
  if exists (
    select 1
    from public.security_rollout_history rollout
    where rollout.version > '20260714012000'
      and (
        rollout.migration_name like 'beacon_%'
        or rollout.migration_name like 'ai_feature_%'
      )
  ) then
    raise exception 'Roll back later Beacon/AI slices before service RPCs';
  end if;
end $$;

delete from public.security_rollout_history
where version = '20260714012000';

drop function if exists public.beacon_admin_update_ai_feature(uuid, uuid, text, text, jsonb);
drop function if exists public.beacon_admin_list_ai_features(uuid, uuid);
drop function if exists public.beacon_expire_usage_reservations(uuid, text, integer);
drop function if exists public.beacon_finalize_usage(
  uuid, uuid, text, text, integer, integer, integer, integer, bigint,
  text[], integer, integer, integer, text, boolean, boolean, text
);
drop function if exists public.beacon_reserve_usage(
  uuid, text, uuid, uuid, uuid, text, bigint, integer, text
);
drop function if exists public.beacon_record_usage_denial(
  uuid, uuid, text, uuid, uuid, text, text, text, text, integer,
  text, integer, uuid, text, bigint, timestamptz, timestamptz
);
drop function if exists public.beacon_feature_gate_status(uuid, text);
drop function if exists public.beacon_resolve_access_context(uuid, text, text);
drop function if exists public.beacon_allowance_usage_snapshot(uuid, timestamptz);
drop function if exists public.beacon_allowance_period(uuid, timestamptz);

notify pgrst, 'reload schema';
