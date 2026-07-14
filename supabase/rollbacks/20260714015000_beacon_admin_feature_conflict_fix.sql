-- Restore the original Beacon management RPC conflict target.

do $$
begin
  if exists (
    select 1
    from public.security_rollout_history rollout
    where rollout.version > '20260714015000'
      and (
        rollout.migration_name like 'beacon_%'
        or rollout.migration_name like 'ai_feature_%'
      )
  ) then
    raise exception 'Roll back later Beacon/AI slices before the management RPC correction';
  end if;
end $$;

delete from public.security_rollout_history
where version = '20260714015000';

do $$
declare
  v_definition text;
  v_ambiguous constant text := 'on conflict (company_id, feature_key) do update';
  v_fixed constant text :=
    'on conflict on constraint company_ai_feature_entitlements_pkey do update';
begin
  select pg_get_functiondef(
    'public.beacon_admin_update_ai_feature(uuid,uuid,text,text,jsonb)'::regprocedure
  )
  into strict v_definition;

  if position(v_fixed in v_definition) = 0 then
    raise exception using
      errcode = '55000',
      message = 'Expected corrected Beacon management RPC conflict target was not found';
  end if;

  execute replace(v_definition, v_fixed, v_ambiguous);
end;
$$;

notify pgrst, 'reload schema';
