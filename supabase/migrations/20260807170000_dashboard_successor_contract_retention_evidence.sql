-- Treat a valid successor contract as first-class retention evidence.
--
-- The renewal cohort already understood how to use successor contracts to
-- corroborate legacy status-change retention events, but it still required a
-- separate event before marking the client retained. Migrated/reactivated
-- clients can have an authoritative successor contract without that event.
-- This left the prior contract in "active up for renewal" even though the
-- client had already re-signed.
--
-- Preserve the existing decision-month behavior:
--   * successor starts on/before the prior end -> prior contract-end month;
--   * successor starts after the prior end -> successor-start month;
--   * one successor is matched to the nearest contract end within 120 days;
--   * add-on contracts never establish renewal retention.

do $successor_contract_retention_patch$
declare
  function_definition text;
  old_successor_scope constant text := $old$
        and successor.archived_at is null
        and coalesce(successor.status, '') <> 'archived'
        and successor.start_date >= candidate.contract_end_date - interval '1 day'
$old$;
  new_successor_scope constant text := $new$
        and successor.archived_at is null
        and coalesce(successor.status, '') <> 'archived'
        and coalesce(successor.metadata ->> 'contract_type', 'standard') <> 'add_on'
        and successor.start_date >= candidate.contract_end_date - interval '1 day'
$new$;
  old_retention_events constant text := $old$
retention_events as (
  select * from app_retention_events

  union

  select * from legacy_retention_events
),
$old$;
  new_retention_events constant text := $new$
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
$new$;
  successor_scope_count integer;
  retention_events_count integer;
begin
  select pg_get_functiondef(
    'public._dashboard_renewal_cohort_counts_fast_unchecked(text,text,text,text[],text,timestamptz,timestamptz,timestamptz,timestamptz,text)'::regprocedure
  ) into function_definition;

  successor_scope_count :=
    (
      length(function_definition)
      - length(replace(function_definition, old_successor_scope, ''))
    ) / length(old_successor_scope);
  if successor_scope_count <> 1 then
    raise exception
      'Expected one successor-contract evidence scope, found %',
      successor_scope_count;
  end if;

  retention_events_count :=
    (
      length(function_definition)
      - length(replace(function_definition, old_retention_events, ''))
    ) / length(old_retention_events);
  if retention_events_count <> 1 then
    raise exception
      'Expected one renewal retention-event union, found %',
      retention_events_count;
  end if;

  function_definition := replace(
    function_definition,
    old_successor_scope,
    new_successor_scope
  );
  function_definition := replace(
    function_definition,
    old_retention_events,
    new_retention_events
  );
  execute function_definition;
end;
$successor_contract_retention_patch$;

revoke all on function public._dashboard_renewal_cohort_counts_fast_unchecked(
  text, text, text, text[], text, timestamptz, timestamptz, timestamptz,
  timestamptz, text
) from public, anon, authenticated;
grant execute on function public._dashboard_renewal_cohort_counts_fast_unchecked(
  text, text, text, text[], text, timestamptz, timestamptz, timestamptz,
  timestamptz, text
) to service_role;

comment on function public.dashboard_renewal_cohort_counts_fast is
  'Returns analytics-included renewal decisions using explicit events or a valid non-add-on successor contract as retention evidence. Early renewals stay with contract end; late renewals move to successor start.';

notify pgrst, 'reload schema';
