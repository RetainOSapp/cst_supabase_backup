-- Restore the 2026-08-04 active-only renewal scope.

do $renewal_completed_scope_rollback$
declare
  function_definition text;
  corrected_scope constant text := $corrected$
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
$corrected$;
  active_only_scope constant text := $active$
  from public.clients client
  join selected_company company
    on company.id = client.company_id
  where client.archived_at is null
    and client.exclude_from_dashboard_analytics = false
    and client.program_status_value in ('front-end', 'back-end')
    and (
      p_assigned_team_member_id is null
$active$;
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
      'Expected one completed-contract renewal scope, found %',
      replacement_count;
  end if;

  execute replace(function_definition, corrected_scope, active_only_scope);
end;
$renewal_completed_scope_rollback$;

comment on function public.dashboard_renewal_cohort_counts_fast is
  'Returns active, analytics-included contracts in the selected renewal decision period and retained outcomes matched to those contracts.';

notify pgrst, 'reload schema';
