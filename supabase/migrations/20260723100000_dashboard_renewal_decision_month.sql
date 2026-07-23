-- Renewal reporting follows the month in which the renewal decision belongs:
--   * an early renewal stays with the original contract-end month;
--   * a late renewal moves to the month the successor contract starts;
--   * paused and suspended/MIA clients are not renewal eligible;
--   * clients who churned before a contract end remain churn in the actual
--     offboarding month and never inflate that later renewal cohort.
--
-- App-owned contract rows are the primary evidence. Migrated clients can also
-- carry the prior contract end in the before-snapshot of a status change, so
-- include that read-only evidence when reconstructing historical cohorts.

create or replace function public._dashboard_renewal_cohort_counts_fast_unchecked(
  p_company_id text,
  p_csm_id text default null,
  p_secondary_assignee_id text default null,
  p_program_values text[] default null,
  p_offer_id text default null,
  p_client_start_date_from timestamptz default null,
  p_client_start_date_to timestamptz default null,
  p_date_range_start timestamptz default null,
  p_date_range_end timestamptz default null,
  p_assigned_team_member_id text default null
)
returns table (
  renewal_cohort_clients bigint,
  renewal_cohort_client_ids text[],
  renewal_cohort_events jsonb,
  retained_clients bigint,
  retained_client_ids text[],
  retained_events jsonb
)
language sql
stable
security definer
set search_path = public
as $$
with selected_company as (
  select company.id, company.legacy_glide_row_id
  from public.companies company
  where company.id::text = p_company_id
     or company.legacy_glide_row_id = p_company_id
  limit 1
),
filtered_clients as (
  select
    client.glide_row_id,
    client.program_status_value,
    client.client_age_date_offboarded,
    client.client_age_date_offboarded_for_filtering,
    client.current_contract_start_date,
    client.current_contract_of_days,
    client.current_contract_end_date,
    client.current_contract_end_date_for_filtering
  from public.clients client
  join selected_company company
    on company.legacy_glide_row_id = client.company_glide_row_id
  where (
      p_assigned_team_member_id is null
      or client.csm_team_member_id = p_assigned_team_member_id
      or client.csm_secondary_assignee_id = p_assigned_team_member_id
    )
    and (
      p_assigned_team_member_id is not null
      or p_csm_id is null
      or client.csm_team_member_id = p_csm_id
    )
    and (
      p_secondary_assignee_id is null
      or client.csm_secondary_assignee_id = p_secondary_assignee_id
    )
    and (
      p_program_values is null
      or cardinality(p_program_values) = 0
      or client.program_status_value = any(p_program_values)
    )
    and (
      p_offer_id is null
      or client.offer_milestones_current_offer_id = p_offer_id
    )
    and (
      p_client_start_date_from is null
      or client.client_age_date_onboarded >= p_client_start_date_from
    )
    and (
      p_client_start_date_to is null
      or client.client_age_date_onboarded < p_client_start_date_to + interval '1 day'
    )
    and (
      p_date_range_end is null
      or client.client_age_date_onboarded is null
      or client.client_age_date_onboarded < p_date_range_end + interval '1 day'
    )
),
summary_contract_ends as (
  select
    client.glide_row_id as client_id,
    coalesce(
      client.current_contract_end_date_for_filtering,
      client.current_contract_end_date,
      case
        when client.current_contract_start_date is not null
         and client.current_contract_of_days is not null
          then client.current_contract_start_date
            + make_interval(days => client.current_contract_of_days::integer)
      end
    ) as contract_end_date
  from filtered_clients client
),
stored_contract_ends as (
  select contract.client_id, contract.end_date as contract_end_date
  from public.client_contracts contract
  join selected_company company on company.id = contract.company_id
  join filtered_clients client on client.glide_row_id = contract.client_id
  where contract.archived_at is null
    and coalesce(contract.status, '') <> 'archived'
    and contract.end_date is not null
),
migrated_snapshot_contract_ends as (
  select
    event.legacy_client_glide_row_id as client_id,
    nullif(
      event.payload -> 'before' ->> 'current_contract_end_date',
      ''
    )::timestamptz as contract_end_date
  from public.client_history_events event
  join selected_company company on company.id = event.company_id
  join filtered_clients client
    on client.glide_row_id = event.legacy_client_glide_row_id
  where event.event_type = 'client_status_changed'
    and nullif(
      event.payload -> 'before' ->> 'current_contract_end_date',
      ''
    ) is not null
),
candidate_contract_ends as (
  select client_id, contract_end_date
  from summary_contract_ends
  where contract_end_date is not null

  union

  select client_id, contract_end_date
  from stored_contract_ends

  union

  select client_id, contract_end_date
  from migrated_snapshot_contract_ends
),
successor_contract_evidence as (
  select candidate.client_id, candidate.contract_end_date
  from candidate_contract_ends candidate
  join filtered_clients client on client.glide_row_id = candidate.client_id
  where (
      coalesce(
        client.current_contract_end_date_for_filtering,
        client.current_contract_end_date
      ) > candidate.contract_end_date
      and client.current_contract_start_date
        >= candidate.contract_end_date - interval '1 day'
    )
    or exists (
      select 1
      from public.client_contracts successor
      join selected_company company on company.id = successor.company_id
      where successor.client_id = candidate.client_id
        and successor.archived_at is null
        and coalesce(successor.status, '') <> 'archived'
        and successor.start_date >= candidate.contract_end_date - interval '1 day'
        and successor.start_date <= candidate.contract_end_date + interval '120 days'
        and successor.end_date > candidate.contract_end_date
    )
),
retention_settings as (
  select coalesce(
    settings.allow_status_change_retention,
    false
  ) as allow_status_change_retention
  from selected_company company
  left join public.company_settings settings
    on settings.company_id = company.id
),
app_retention_events as (
  select
    concat('app:', event.id::text) as event_key,
    event.legacy_client_glide_row_id as client_id,
    coalesce(
      (event.payload -> 'contract' ->> 'start_date')::timestamptz,
      (event.payload -> 'contract' ->> 'startDate')::timestamptz,
      (event.payload ->> 'retention_date')::timestamptz,
      event.created_at
    ) as retained_at,
    event.event_type = 'client_retention_recorded' as is_explicit
  from public.client_history_events event
  join selected_company company on company.id = event.company_id
  join filtered_clients client
    on client.glide_row_id = event.legacy_client_glide_row_id
  cross join retention_settings settings
  where event.event_type = 'client_retention_recorded'
     or (
       settings.allow_status_change_retention
       and event.event_type = 'client_status_changed'
       and (event.payload ->> 'from_status', event.payload ->> 'to_status') in (
         ('front-end', 'front-end'),
         ('front-end', 'back-end'),
         ('back-end', 'back-end')
       )
     )
),
legacy_retention_events as (
  select
    concat(
      'legacy:',
      history.client_id,
      ':',
      extract(epoch from history.modified_date)::text,
      ':',
      coalesce(history.original_value, ''),
      ':',
      coalesce(history.value, '')
    ) as event_key,
    history.client_id,
    history.modified_date as retained_at,
    false as is_explicit
  from public.backup_company_clients_history history
  join filtered_clients client on client.glide_row_id = history.client_id
  where history.change_type_code = 'program-status'
    and (history.original_value, history.value) in (
      ('front-end', 'front-end'),
      ('front-end', 'back-end'),
      ('back-end', 'back-end')
    )
),
retention_events as (
  select * from app_retention_events

  union

  select * from legacy_retention_events
),
retention_candidate_links as (
  select
    event.event_key,
    event.client_id,
    candidate.contract_end_date,
    event.retained_at,
    row_number() over (
      partition by event.event_key
      order by
        abs(
          extract(
            epoch from (event.retained_at - candidate.contract_end_date)
          )
        ),
        candidate.contract_end_date desc
    ) as match_rank
  from retention_events event
  join candidate_contract_ends candidate
    on candidate.client_id = event.client_id
   and event.retained_at
     between candidate.contract_end_date - interval '120 days'
       and candidate.contract_end_date + interval '120 days'
  where event.is_explicit
     or exists (
       select 1
       from successor_contract_evidence successor
       where successor.client_id = candidate.client_id
         and successor.contract_end_date = candidate.contract_end_date
     )
),
matched_retention as (
  select
    link.client_id,
    link.contract_end_date,
    min(link.retained_at) as retained_at
  from retention_candidate_links link
  where link.match_rank = 1
  group by link.client_id, link.contract_end_date
),
eligible_contracts as (
  select
    candidate.client_id,
    candidate.contract_end_date,
    retention.retained_at,
    greatest(
      candidate.contract_end_date,
      coalesce(retention.retained_at, candidate.contract_end_date)
    ) as reporting_date
  from candidate_contract_ends candidate
  join filtered_clients client on client.glide_row_id = candidate.client_id
  left join matched_retention retention
    on retention.client_id = candidate.client_id
   and retention.contract_end_date = candidate.contract_end_date
  where client.program_status_value not in ('paused', 'suspended')
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
period_contracts as (
  select eligible.*
  from eligible_contracts eligible
  where (
      p_date_range_start is null
      or eligible.reporting_date >= p_date_range_start
    )
    and (
      p_date_range_end is null
      or eligible.reporting_date < p_date_range_end + interval '1 day'
    )
),
renewal_cohort as (
  select
    contract.client_id,
    max(contract.contract_end_date) as contract_end_date,
    max(contract.reporting_date) as reporting_date,
    min(contract.retained_at) filter (
      where contract.retained_at is not null
    ) as retained_at
  from period_contracts contract
  group by contract.client_id
),
retained_cohort as (
  select *
  from renewal_cohort
  where retained_at is not null
)
select
  (select count(*)::bigint from renewal_cohort) as renewal_cohort_clients,
  coalesce(
    (select array_agg(client_id order by client_id) from renewal_cohort),
    array[]::text[]
  ) as renewal_cohort_client_ids,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'client_id', client_id,
          'contract_end_date', contract_end_date,
          'reporting_date', reporting_date
        )
        order by reporting_date desc, client_id
      )
      from renewal_cohort
    ),
    '[]'::jsonb
  ) as renewal_cohort_events,
  (select count(*)::bigint from retained_cohort) as retained_clients,
  coalesce(
    (select array_agg(client_id order by client_id) from retained_cohort),
    array[]::text[]
  ) as retained_client_ids,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'client_id', client_id,
          'contract_end_date', contract_end_date,
          'reporting_date', reporting_date,
          'retained_at', retained_at
        )
        order by reporting_date desc, client_id
      )
      from retained_cohort
    ),
    '[]'::jsonb
  ) as retained_events;
$$;

revoke all on function public._dashboard_renewal_cohort_counts_fast_unchecked(
  text, text, text, text[], text, timestamptz, timestamptz, timestamptz,
  timestamptz, text
) from public, anon, authenticated;
grant execute on function public._dashboard_renewal_cohort_counts_fast_unchecked(
  text, text, text, text[], text, timestamptz, timestamptz, timestamptz,
  timestamptz, text
) to service_role;

comment on function public.dashboard_renewal_cohort_counts_fast is
  'Returns renewal-eligible decisions in the later of the original contract-end or successor-start month. Paused, suspended/MIA, and pre-end churn are excluded from renewal eligibility.';

notify pgrst, 'reload schema';
