-- Renewal eligibility is operational work, not historical contract reporting.
-- An offboarded, paused, or suspended client must never inflate the renewal
-- denominator or appear in the Dashboard renewal drill-down.
do $$
declare
  function_definition text;
  old_predicate constant text :=
    'client.program_status_value not in (''paused'', ''suspended'')';
  new_predicate constant text :=
    'client.program_status_value in (''front-end'', ''back-end'')';
  replacement_count integer;
begin
  select pg_get_functiondef(
    'public.dashboard_kpi_counts_actor_scoped(text,text,text,text[],text,timestamptz,timestamptz,timestamptz,timestamptz)'::regprocedure
  )
  into function_definition;

  replacement_count :=
    (length(function_definition) - length(replace(function_definition, old_predicate, '')))
    / length(old_predicate);

  if replacement_count <> 4 then
    raise exception
      'Expected 4 renewal eligibility predicates in dashboard_kpi_counts_actor_scoped, found %',
      replacement_count;
  end if;

  execute replace(function_definition, old_predicate, new_predicate);
end;
$$;
