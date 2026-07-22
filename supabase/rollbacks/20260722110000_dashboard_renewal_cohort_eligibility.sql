do $rollback$
declare
  function_definition text;
  new_cohort constant text := $new$
renewal_cohort_candidates as (
  select
    candidate.client_id,
    max(candidate.contract_end_date) as contract_end_date
  from candidate_contract_ends candidate
  where (p_date_range_start is null or candidate.contract_end_date >= p_date_range_start)
    and (p_date_range_end is null or candidate.contract_end_date < p_date_range_end + interval '1 day')
  group by candidate.client_id
),
renewal_cohort as (
  select candidate.client_id, candidate.contract_end_date
  from renewal_cohort_candidates candidate
  join selected_company sc on true
  join public.clients client
    on client.company_id = sc.id
   and client.glide_row_id = candidate.client_id
  where client.program_status_value <> 'paused'
    and (
      client.program_status_value <> 'off-boarded'
      or (
        coalesce(
          client.client_age_date_offboarded,
          client.client_age_date_offboarded_for_filtering
        ) is not null
        and coalesce(
          client.client_age_date_offboarded,
          client.client_age_date_offboarded_for_filtering
        )::date >= candidate.contract_end_date::date
      )
    )
),
$new$;
  old_cohort constant text := $old$
renewal_cohort as (
  select
    candidate.client_id,
    max(candidate.contract_end_date) as contract_end_date
  from candidate_contract_ends candidate
  where (p_date_range_start is null or candidate.contract_end_date >= p_date_range_start)
    and (p_date_range_end is null or candidate.contract_end_date < p_date_range_end + interval '1 day')
  group by candidate.client_id
),
$old$;
  replacement_count integer;
begin
  select pg_get_functiondef(
    'public._dashboard_renewal_cohort_counts_fast_unchecked(text,text,text,text[],text,timestamptz,timestamptz,timestamptz,timestamptz,text)'::regprocedure
  ) into function_definition;

  replacement_count :=
    (length(function_definition) - length(replace(function_definition, new_cohort, '')))
    / length(new_cohort);

  if replacement_count <> 1 then
    raise exception
      'Expected one renewal eligibility definition, found %',
      replacement_count;
  end if;

  execute replace(function_definition, new_cohort, old_cohort);
end;
$rollback$;

comment on function public.dashboard_renewal_cohort_counts_fast is
  'Returns the selected contract-end cohort and only those retained outcomes corroborated by a successor contract or explicit RetainOS retention event.';

notify pgrst, 'reload schema';
