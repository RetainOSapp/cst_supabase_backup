-- Some migrated clients received their new app-owned contract immediately
-- before the status was restored from Offboarded. In those events, the normal
-- before-snapshot already contains the new contract, while source_snapshot
-- still preserves the prior CST contract end. Add that prior end as a
-- candidate without altering any client or contract data.

do $migration$
declare
  function_definition text;
  old_candidate_start constant text := $old$
candidate_contract_ends as (
$old$;
  new_candidate_start constant text := $new$
migrated_source_snapshot_contract_ends as (
  select
    event.legacy_client_glide_row_id as client_id,
    nullif(
      event.payload -> 'before' -> 'source_snapshot'
        ->> 'current_contract_end_date',
      ''
    )::timestamptz as contract_end_date
  from public.client_history_events event
  join selected_company company on company.id = event.company_id
  join filtered_clients client
    on client.glide_row_id = event.legacy_client_glide_row_id
  where event.event_type = 'client_status_changed'
    and nullif(
      event.payload -> 'before' -> 'source_snapshot'
        ->> 'current_contract_end_date',
      ''
    ) is not null
),
candidate_contract_ends as (
$new$;
  old_candidate_end constant text := $old$
  select client_id, contract_end_date
  from migrated_snapshot_contract_ends
),
successor_contract_evidence as (
$old$;
  new_candidate_end constant text := $new$
  select client_id, contract_end_date
  from migrated_snapshot_contract_ends

  union

  select client_id, contract_end_date
  from migrated_source_snapshot_contract_ends
),
successor_contract_evidence as (
$new$;
  replacement_count integer;
begin
  select pg_get_functiondef(
    'public._dashboard_renewal_cohort_counts_fast_unchecked(text,text,text,text[],text,timestamptz,timestamptz,timestamptz,timestamptz,text)'::regprocedure
  ) into function_definition;

  replacement_count :=
    (
      length(function_definition)
      - length(replace(function_definition, old_candidate_start, ''))
    ) / length(old_candidate_start);
  if replacement_count <> 1 then
    raise exception
      'Expected one renewal candidate start, found %',
      replacement_count;
  end if;
  function_definition := replace(
    function_definition,
    old_candidate_start,
    new_candidate_start
  );

  replacement_count :=
    (
      length(function_definition)
      - length(replace(function_definition, old_candidate_end, ''))
    ) / length(old_candidate_end);
  if replacement_count <> 1 then
    raise exception
      'Expected one renewal candidate end, found %',
      replacement_count;
  end if;
  function_definition := replace(
    function_definition,
    old_candidate_end,
    new_candidate_end
  );

  execute function_definition;
end;
$migration$;

revoke all on function public._dashboard_renewal_cohort_counts_fast_unchecked(
  text, text, text, text[], text, timestamptz, timestamptz, timestamptz,
  timestamptz, text
) from public, anon, authenticated;
grant execute on function public._dashboard_renewal_cohort_counts_fast_unchecked(
  text, text, text, text[], text, timestamptz, timestamptz, timestamptz,
  timestamptz, text
) to service_role;

notify pgrst, 'reload schema';
