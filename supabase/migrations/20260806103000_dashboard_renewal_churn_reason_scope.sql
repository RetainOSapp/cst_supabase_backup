-- Keep churn-coded offboards out of renewal eligibility.
--
-- A dated offboard on or after contract end can represent a normal program
-- completion, but a recorded churn reason is explicit evidence that the client
-- left rather than completed normally. This includes MIA auto-offboards, which
-- carry the `auto_suspended_timeout` reason.

do $renewal_churn_reason_scope_patch$
declare
  function_definition text;
  old_scope constant text := $old$
        client.program_status_value = 'off-boarded'
        and coalesce(
$old$;
  new_scope constant text := $new$
        client.program_status_value = 'off-boarded'
        and nullif(btrim(client.churn_reason_value), '') is null
        and coalesce(
$new$;
  replacement_count integer;
begin
  select pg_get_functiondef(
    'public._dashboard_renewal_cohort_counts_fast_unchecked(text,text,text,text[],text,timestamptz,timestamptz,timestamptz,timestamptz,text)'::regprocedure
  ) into function_definition;

  replacement_count :=
    (
      length(function_definition)
      - length(replace(function_definition, old_scope, ''))
    ) / length(old_scope);
  if replacement_count <> 1 then
    raise exception
      'Expected one offboarded renewal scope, found %',
      replacement_count;
  end if;

  execute replace(function_definition, old_scope, new_scope);
end;
$renewal_churn_reason_scope_patch$;

comment on function public.dashboard_renewal_cohort_counts_fast is
  'Returns analytics-included renewal decisions for active clients and normal, non-churned completions. Paused, Suspended/MIA, churn-coded or early offboards, undated offboards, archived records, and analytics exclusions do not contribute.';

notify pgrst, 'reload schema';
