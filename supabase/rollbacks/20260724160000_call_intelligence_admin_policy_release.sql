-- Re-close Call Intelligence policy management while preserving existing
-- entitlement, allowance, usage, and audit rows for an explicit operational
-- rollback.

do $$
declare
  v_definition text;
  v_released constant text :=
    $released$if p_feature_key not in ('beacon', 'call_analysis') then
    raise exception using
      errcode = '22023',
      message = 'Only released AI features may be configured';
  end if;$released$;
  v_beacon_only constant text :=
    $beacon$if p_feature_key <> 'beacon' then
    raise exception using
      errcode = '22023',
      message = 'Only Beacon may be configured in Phase 1';
  end if;$beacon$;
begin
  select pg_get_functiondef(
    'public.beacon_admin_update_ai_feature(uuid,uuid,text,text,jsonb)'::regprocedure
  )
  into strict v_definition;

  if position(v_released in v_definition) = 0 then
    raise exception using
      errcode = '55000',
      message = 'Expected Call Intelligence AI Features release was not found';
  end if;

  execute replace(v_definition, v_released, v_beacon_only);
end;
$$;

comment on function public.beacon_admin_update_ai_feature(
  uuid, uuid, text, text, jsonb
) is
  'SuperAdmin-only company AI feature policy management. Beacon is the only released feature.';

notify pgrst, 'reload schema';
