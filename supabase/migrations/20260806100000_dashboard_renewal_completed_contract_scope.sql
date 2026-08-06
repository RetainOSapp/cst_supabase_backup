-- Restore normally completed contracts to selected-period renewal reporting.
--
-- The 2026-08-04 performance scope correctly removed archived,
-- analytics-excluded, Paused, Suspended/MIA, and early-churn records, but it
-- also removed every currently Offboarded client before the existing
-- contract-level eligibility rule could distinguish:
--
--   * normal completion: actual offboard date >= contract end (eligible)
--   * early offboard/drop-off: actual offboard date < contract end (excluded)
--
-- Keep the early filtered-client performance boundary, but admit only dated
-- Offboarded records within the same 120-day decision window used to match
-- late retention events to contract ends. The downstream eligible_contracts
-- CTE remains authoritative for the exact contract-level comparison.

do $renewal_completed_scope_patch$
declare
  function_definition text;
  old_scope constant text := $old$
  from public.clients client
  join selected_company company
    on company.id = client.company_id
  where client.archived_at is null
    and client.exclude_from_dashboard_analytics = false
    and client.program_status_value in ('front-end', 'back-end')
    and (
      p_assigned_team_member_id is null
$old$;
  new_scope constant text := $new$
  from public.clients client
  join selected_company company
    on company.id = client.company_id
  where client.archived_at is null
    and client.exclude_from_dashboard_analytics = false
    and (
      client.program_status_value in ('front-end', 'back-end')
      or (
        client.program_status_value = 'off-boarded'
        and coalesce(
          client.client_age_date_offboarded,
          client.client_age_date_offboarded_for_filtering
        ) is not null
        and (
          p_date_range_start is null
          or coalesce(
            client.client_age_date_offboarded,
            client.client_age_date_offboarded_for_filtering
          ) >= p_date_range_start - interval '120 days'
        )
      )
    )
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
      'Expected one active-only renewal scope, found %',
      replacement_count;
  end if;

  execute replace(function_definition, old_scope, new_scope);
end;
$renewal_completed_scope_patch$;

comment on function public.dashboard_renewal_cohort_counts_fast is
  'Returns analytics-included renewal decisions for active clients and normally completed contracts. Paused, Suspended/MIA, early churn, undated offboards, archived records, and analytics exclusions do not contribute.';

notify pgrst, 'reload schema';
