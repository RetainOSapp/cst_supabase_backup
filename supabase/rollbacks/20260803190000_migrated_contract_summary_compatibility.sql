-- Restore the pre-compatibility active-only contract selection.

do $rollback$
declare
  function_definition text;
  compatibility_predicate constant text :=
    $$lower(coalesce(contract.status, 'active')) in ('active', 'current_summary')$$;
  active_only_predicate constant text :=
    $$lower(coalesce(contract.status, 'active')) = 'active'$$;
begin
  select pg_get_functiondef(
    'public.refresh_client_contract_summary(uuid,uuid,timestamptz)'::regprocedure
  ) into function_definition;

  if position(compatibility_predicate in function_definition) = 0 then
    raise exception 'Migrated contract compatibility predicate was not found.';
  end if;

  execute replace(
    function_definition,
    compatibility_predicate,
    active_only_predicate
  );
end;
$rollback$;

notify pgrst, 'reload schema';
