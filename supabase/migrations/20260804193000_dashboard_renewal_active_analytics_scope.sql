-- Renewal and retention reporting is an active-client work queue.
--
-- Apply the same client eligibility boundary used by the rest of Dashboard
-- before the expensive contract/history CTEs run:
--   * archived and analytics-excluded clients never contribute;
--   * Paused, Suspended/MIA, and Offboarded clients never contribute;
--   * Front End and Back End remain eligible.
--
-- Besides aligning the renewal denominator with the approved product rules,
-- pushing these predicates into filtered_clients prevents the all-company
-- cohort from timing out and falling back to an unrelated legacy formula.

do $renewal_scope_patch$
declare
  function_definition text;
  old_scope constant text := $old$
  from public.clients client
  join selected_company company
    on company.legacy_glide_row_id = client.company_glide_row_id
  where (
      p_assigned_team_member_id is null
$old$;
  new_scope constant text := $new$
  from public.clients client
  join selected_company company
    on company.id = client.company_id
  where client.archived_at is null
    and client.exclude_from_dashboard_analytics = false
    and client.program_status_value in ('front-end', 'back-end')
    and (
      p_assigned_team_member_id is null
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
      'Expected one renewal filtered-client scope, found %',
      replacement_count;
  end if;

  execute replace(function_definition, old_scope, new_scope);
end;
$renewal_scope_patch$;

revoke all on function public._dashboard_renewal_cohort_counts_fast_unchecked(
  text, text, text, text[], text, timestamptz, timestamptz, timestamptz,
  timestamptz, text
) from public, anon, authenticated;
grant execute on function public._dashboard_renewal_cohort_counts_fast_unchecked(
  text, text, text, text[], text, timestamptz, timestamptz, timestamptz,
  timestamptz, text
) to service_role;

comment on function public.dashboard_renewal_cohort_counts_fast is
  'Returns active, analytics-included contracts in the selected renewal decision period and retained outcomes matched to those contracts.';

notify pgrst, 'reload schema';
