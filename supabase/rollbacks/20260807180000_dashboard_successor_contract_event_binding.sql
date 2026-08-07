-- Restore the broader non-explicit-event corroboration rule.

do $successor_contract_event_binding_rollback$
declare
  function_definition text;
  bound_candidate_filter constant text := $bound$
  where event.is_explicit
     or (
       event.event_key like 'successor-contract:%'
       and (
         exists (
           select 1
           from filtered_clients successor_client
           where successor_client.glide_row_id = candidate.client_id
             and successor_client.current_contract_start_date = event.retained_at
             and coalesce(
               successor_client.current_contract_end_date_for_filtering,
               successor_client.current_contract_end_date
             ) > candidate.contract_end_date
         )
         or exists (
           select 1
           from public.client_contracts successor_contract
           join selected_company company
             on company.id = successor_contract.company_id
           where successor_contract.client_id = candidate.client_id
             and successor_contract.archived_at is null
             and coalesce(successor_contract.status, '') <> 'archived'
             and coalesce(
               successor_contract.metadata ->> 'contract_type',
               'standard'
             ) <> 'add_on'
             and successor_contract.start_date = event.retained_at
             and successor_contract.end_date > candidate.contract_end_date
         )
       )
     )
     or (
       event.event_key not like 'successor-contract:%'
       and exists (
         select 1
         from successor_contract_evidence successor
         where successor.client_id = candidate.client_id
           and successor.contract_end_date = candidate.contract_end_date
       )
     )
$bound$;
  broad_candidate_filter constant text := $broad$
  where event.is_explicit
     or exists (
       select 1
       from successor_contract_evidence successor
       where successor.client_id = candidate.client_id
         and successor.contract_end_date = candidate.contract_end_date
     )
$broad$;
  candidate_filter_count integer;
begin
  select pg_get_functiondef(
    'public._dashboard_renewal_cohort_counts_fast_unchecked(text,text,text,text[],text,timestamptz,timestamptz,timestamptz,timestamptz,text)'::regprocedure
  ) into function_definition;

  candidate_filter_count :=
    (
      length(function_definition)
      - length(replace(function_definition, bound_candidate_filter, ''))
    ) / length(bound_candidate_filter);

  if candidate_filter_count <> 1 then
    raise exception
      'Successor event binding rollback shape mismatch: candidate filter %',
      candidate_filter_count;
  end if;

  function_definition := replace(
    function_definition,
    bound_candidate_filter,
    broad_candidate_filter
  );
  execute function_definition;
end;
$successor_contract_event_binding_rollback$;

comment on function public.dashboard_renewal_cohort_counts_fast is
  'Returns analytics-included renewal decisions using a candidate-validated non-add-on successor contract first, explicit RetainOS retention events second, and legacy status inference last. Contracts cannot renew themselves.';

notify pgrst, 'reload schema';
