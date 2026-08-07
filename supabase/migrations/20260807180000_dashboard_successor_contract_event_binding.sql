-- Bind synthetic successor-contract events to the contract that produced them.
--
-- A non-explicit legacy status event may use any valid successor as
-- corroboration. A synthetic successor event is different: its retained_at
-- must be the start of the specific successor that extends the candidate.
-- Without this binding, an older contract's own start could be treated as the
-- renewal date once a later successor existed.

do $successor_contract_event_binding$
declare
  function_definition text;
  old_candidate_filter constant text := $old$
  where event.is_explicit
     or exists (
       select 1
       from successor_contract_evidence successor
       where successor.client_id = candidate.client_id
         and successor.contract_end_date = candidate.contract_end_date
     )
$old$;
  new_candidate_filter constant text := $new$
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
$new$;
  candidate_filter_count integer;
begin
  select pg_get_functiondef(
    'public._dashboard_renewal_cohort_counts_fast_unchecked(text,text,text,text[],text,timestamptz,timestamptz,timestamptz,timestamptz,text)'::regprocedure
  ) into function_definition;

  candidate_filter_count :=
    (
      length(function_definition)
      - length(replace(function_definition, old_candidate_filter, ''))
    ) / length(old_candidate_filter);

  if candidate_filter_count <> 1 then
    raise exception
      'Successor event binding shape mismatch: candidate filter %',
      candidate_filter_count;
  end if;

  function_definition := replace(
    function_definition,
    old_candidate_filter,
    new_candidate_filter
  );
  execute function_definition;
end;
$successor_contract_event_binding$;

comment on function public.dashboard_renewal_cohort_counts_fast is
  'Returns analytics-included renewal decisions using candidate-bound non-add-on successor contracts first, explicit RetainOS events second, and corroborated legacy status inference last. Contracts cannot renew themselves.';

notify pgrst, 'reload schema';
