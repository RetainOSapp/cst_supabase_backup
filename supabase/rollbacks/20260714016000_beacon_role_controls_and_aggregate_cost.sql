do $$
begin
  if exists (
    select 1 from public.security_rollout_history rollout
    where rollout.version > '20260714016000'
      and (rollout.migration_name like 'beacon_%'
        or rollout.migration_name like 'ai_feature_%')
  ) then
    raise exception 'Roll back later Beacon/AI slices first';
  end if;
end $$;

delete from public.security_rollout_history where version = '20260714016000';

do $$
declare
  v_definition text;
  v_old_consumed constant text :=
    'select (coalesce(sum(event.actual_cost_micros), 0) + 9999) / 10000';
  v_new_consumed constant text := 'select sum(event.actual_meter_value)';
  v_old_reserved constant text :=
    'select (coalesce(sum(reservation.reserved_cost_micros), 0) + 9999) / 10000';
  v_new_reserved constant text := 'select sum(reservation.reserved_meter_value)';
begin
  select pg_get_functiondef(
    'public.beacon_allowance_usage_snapshot(uuid,timestamptz)'::regprocedure
  ) into strict v_definition;
  execute replace(
    replace(v_definition, v_old_consumed, v_new_consumed),
    v_old_reserved, v_new_reserved
  );
end;
$$;

do $$
declare
  v_definition text;
  v_gate constant text := $gate$
  if not public.beacon_role_access_allowed(
    p_company_id,
    p_feature_key,
    v_actor_role
  ) then
    return query select false, null::uuid, 'role_not_allowed'::text, null::integer;
    return;
  end if;

$gate$;
begin
  select pg_get_functiondef(
    'public.beacon_reserve_usage(uuid,text,uuid,uuid,uuid,text,bigint,integer,text)'::regprocedure
  ) into strict v_definition;
  execute replace(v_definition, v_gate, '');
end;
$$;

drop function if exists public.beacon_admin_update_ai_feature_access(uuid, uuid, text, text[]);
drop function if exists public.beacon_admin_get_ai_feature_access(uuid, uuid, text);
drop function if exists public.beacon_role_access_allowed(uuid, text, text);

alter table public.company_ai_feature_entitlements
  drop constraint if exists company_ai_feature_entitlements_allowed_roles_check;
alter table public.company_ai_feature_entitlements
  drop column if exists allowed_roles;

notify pgrst, 'reload schema';
