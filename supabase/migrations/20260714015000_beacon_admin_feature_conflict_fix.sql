-- Fix a PL/pgSQL output-column ambiguity in the Beacon management RPC.
--
-- The function returns a column named feature_key. PostgreSQL therefore treats
-- the unqualified feature_key in ON CONFLICT (company_id, feature_key) as
-- ambiguous. Target the existing primary-key constraint explicitly instead.

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

  if position(v_ambiguous in v_definition) = 0 then
    raise exception using
      errcode = '55000',
      message = 'Expected Beacon management RPC conflict target was not found';
  end if;

  execute replace(v_definition, v_ambiguous, v_fixed);
end;
$$;

notify pgrst, 'reload schema';
