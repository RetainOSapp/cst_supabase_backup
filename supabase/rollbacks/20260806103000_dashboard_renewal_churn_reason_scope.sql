-- Restore the completed-contract scope without explicit churn-reason filtering.

do $renewal_churn_reason_scope_rollback$
declare
  function_definition text;
  corrected_scope constant text := $corrected$
        client.program_status_value = 'off-boarded'
        and nullif(btrim(client.churn_reason_value), '') is null
        and coalesce(
$corrected$;
  previous_scope constant text := $previous$
        client.program_status_value = 'off-boarded'
        and coalesce(
$previous$;
  replacement_count integer;
begin
  select pg_get_functiondef(
    'public._dashboard_renewal_cohort_counts_fast_unchecked(text,text,text,text[],text,timestamptz,timestamptz,timestamptz,timestamptz,text)'::regprocedure
  ) into function_definition;

  replacement_count :=
    (
      length(function_definition)
      - length(replace(function_definition, corrected_scope, ''))
    ) / length(corrected_scope);
  if replacement_count <> 1 then
    raise exception
      'Expected one churn-filtered renewal scope, found %',
      replacement_count;
  end if;

  execute replace(function_definition, corrected_scope, previous_scope);
end;
$renewal_churn_reason_scope_rollback$;

comment on function public.dashboard_renewal_cohort_counts_fast is
  'Returns analytics-included renewal decisions for active clients and normally completed contracts. Paused, Suspended/MIA, early churn, undated offboards, archived records, and analytics exclusions do not contribute.';

notify pgrst, 'reload schema';
