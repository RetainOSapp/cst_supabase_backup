-- Release the reviewed Call Intelligence policy through the existing
-- SuperAdmin AI Features management RPC. All other unreleased AI features
-- remain fail closed.

do $$
declare
  v_definition text;
  v_old constant text :=
    $old$if p_feature_key <> 'beacon' then
    raise exception using
      errcode = '22023',
      message = 'Only Beacon may be configured in Phase 1';
  end if;$old$;
  v_new constant text :=
    $new$if p_feature_key not in ('beacon', 'call_analysis') then
    raise exception using
      errcode = '22023',
      message = 'Only released AI features may be configured';
  end if;$new$;
begin
  select pg_get_functiondef(
    'public.beacon_admin_update_ai_feature(uuid,uuid,text,text,jsonb)'::regprocedure
  )
  into strict v_definition;

  if position(v_old in v_definition) = 0 then
    raise exception using
      errcode = '55000',
      message = 'Expected AI Features release guard was not found';
  end if;
  if position(v_new in v_definition) > 0 then
    raise exception using
      errcode = '55000',
      message = 'Call Intelligence AI Features release is already installed';
  end if;

  execute replace(v_definition, v_old, v_new);
end;
$$;

comment on function public.beacon_admin_update_ai_feature(
  uuid, uuid, text, text, jsonb
) is
  'SuperAdmin-only company AI feature policy management. Released features: Beacon and Call Intelligence.';

notify pgrst, 'reload schema';
