-- Restore event-only retention recognition while preserving all client and
-- contract data. This rollback does not modify customer records.

do $successor_contract_retention_rollback$
declare
  function_definition text;
  patched_successor_scope constant text := $patched$
        and successor.archived_at is null
        and coalesce(successor.status, '') <> 'archived'
        and coalesce(successor.metadata ->> 'contract_type', 'standard') <> 'add_on'
        and successor.start_date >= candidate.contract_end_date - interval '1 day'
$patched$;
  original_successor_scope constant text := $original$
        and successor.archived_at is null
        and coalesce(successor.status, '') <> 'archived'
        and successor.start_date >= candidate.contract_end_date - interval '1 day'
$original$;
  patched_retention_events constant text := $patched$
successor_contract_retention_events as (
  select
    concat(
      'successor-contract:',
      evidence.client_id,
      ':',
      extract(epoch from evidence.retained_at)::text,
      ':',
      extract(epoch from evidence.successor_end_date)::text
    ) as event_key,
    evidence.client_id,
    evidence.retained_at,
    false as is_explicit
  from (
    select
      client.glide_row_id as client_id,
      client.current_contract_start_date as retained_at,
      coalesce(
        client.current_contract_end_date_for_filtering,
        client.current_contract_end_date
      ) as successor_end_date
    from filtered_clients client
    where client.current_contract_start_date is not null
      and coalesce(
        client.current_contract_end_date_for_filtering,
        client.current_contract_end_date
      ) is not null

    union

    select
      contract.client_id,
      contract.start_date as retained_at,
      contract.end_date as successor_end_date
    from public.client_contracts contract
    join selected_company company on company.id = contract.company_id
    join filtered_clients client on client.glide_row_id = contract.client_id
    where contract.archived_at is null
      and coalesce(contract.status, '') <> 'archived'
      and coalesce(contract.metadata ->> 'contract_type', 'standard') <> 'add_on'
      and contract.start_date is not null
      and contract.end_date is not null
  ) evidence
  where evidence.successor_end_date > evidence.retained_at
),
retention_events as (
  select * from app_retention_events

  union

  select * from legacy_retention_events

  union

  select * from successor_contract_retention_events
),
$patched$;
  original_retention_events constant text := $original$
retention_events as (
  select * from app_retention_events

  union

  select * from legacy_retention_events
),
$original$;
  successor_scope_count integer;
  retention_events_count integer;
begin
  select pg_get_functiondef(
    'public._dashboard_renewal_cohort_counts_fast_unchecked(text,text,text,text[],text,timestamptz,timestamptz,timestamptz,timestamptz,text)'::regprocedure
  ) into function_definition;

  successor_scope_count :=
    (
      length(function_definition)
      - length(replace(function_definition, patched_successor_scope, ''))
    ) / length(patched_successor_scope);
  if successor_scope_count <> 1 then
    raise exception
      'Expected one patched successor-contract scope, found %',
      successor_scope_count;
  end if;

  retention_events_count :=
    (
      length(function_definition)
      - length(replace(function_definition, patched_retention_events, ''))
    ) / length(patched_retention_events);
  if retention_events_count <> 1 then
    raise exception
      'Expected one successor-contract retention union, found %',
      retention_events_count;
  end if;

  function_definition := replace(
    function_definition,
    patched_successor_scope,
    original_successor_scope
  );
  function_definition := replace(
    function_definition,
    patched_retention_events,
    original_retention_events
  );
  execute function_definition;
end;
$successor_contract_retention_rollback$;

comment on function public.dashboard_renewal_cohort_counts_fast is
  'Returns analytics-included renewal decisions for active clients and normal, non-churned completions. Paused, Suspended/MIA, churn-coded or early offboards, undated offboards, archived records, and analytics exclusions do not contribute.';

notify pgrst, 'reload schema';
