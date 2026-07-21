-- A reporting-period renewal cohort is different from the active renewal work
-- queue.  Keep the latter unchanged, but report historical retention only
-- against the contracts that actually ended in the selected period.
--
-- This is deliberately read-only over migrated CST source data.  Legacy
-- status transitions must be corroborated by a successor contract/current
-- contract summary before they count as a retention outcome.

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
  select c.id, c.legacy_glide_row_id
  from public.companies c
  where c.id::text = p_company_id
     or c.legacy_glide_row_id = p_company_id
  limit 1
),
filtered_clients as (
  select
    c.glide_row_id,
    c.program_status_value,
    c.current_contract_start_date,
    c.current_contract_of_days,
    c.current_contract_end_date,
    c.current_contract_end_date_for_filtering
  from public.clients c
  join selected_company sc on sc.legacy_glide_row_id = c.company_glide_row_id
  where (
      p_assigned_team_member_id is null
      or c.csm_team_member_id = p_assigned_team_member_id
      or c.csm_secondary_assignee_id = p_assigned_team_member_id
    )
    and (
      p_assigned_team_member_id is not null
      or p_csm_id is null
      or c.csm_team_member_id = p_csm_id
    )
    and (p_secondary_assignee_id is null or c.csm_secondary_assignee_id = p_secondary_assignee_id)
    and (p_program_values is null or cardinality(p_program_values) = 0 or c.program_status_value = any(p_program_values))
    and (p_offer_id is null or c.offer_milestones_current_offer_id = p_offer_id)
    and (p_client_start_date_from is null or c.client_age_date_onboarded >= p_client_start_date_from)
    and (p_client_start_date_to is null or c.client_age_date_onboarded < p_client_start_date_to + interval '1 day')
    and (p_date_range_end is null or c.client_age_date_onboarded is null or c.client_age_date_onboarded < p_date_range_end + interval '1 day')
),
summary_contract_ends as (
  select
    fc.glide_row_id as client_id,
    coalesce(
      fc.current_contract_end_date_for_filtering,
      fc.current_contract_end_date,
      case
        when fc.current_contract_start_date is not null
         and fc.current_contract_of_days is not null
          then fc.current_contract_start_date
            + make_interval(days => fc.current_contract_of_days::integer)
      end
    ) as contract_end_date
  from filtered_clients fc
),
candidate_contract_ends as (
  select sce.client_id, sce.contract_end_date
  from summary_contract_ends sce
  where sce.contract_end_date is not null

  union

  select cc.client_id, cc.end_date as contract_end_date
  from public.client_contracts cc
  join selected_company sc on sc.id = cc.company_id
  join filtered_clients fc on fc.glide_row_id = cc.client_id
  where cc.archived_at is null
    and coalesce(cc.status, '') <> 'archived'
    and cc.end_date is not null
),
renewal_cohort as (
  select
    candidate.client_id,
    max(candidate.contract_end_date) as contract_end_date
  from candidate_contract_ends candidate
  where (p_date_range_start is null or candidate.contract_end_date >= p_date_range_start)
    and (p_date_range_end is null or candidate.contract_end_date < p_date_range_end + interval '1 day')
  group by candidate.client_id
),
successor_contract_evidence as (
  select cohort.client_id
  from renewal_cohort cohort
  join filtered_clients fc on fc.glide_row_id = cohort.client_id
  where (
      coalesce(
        fc.current_contract_end_date_for_filtering,
        fc.current_contract_end_date
      ) > cohort.contract_end_date
      and fc.current_contract_start_date >= cohort.contract_end_date - interval '1 day'
    )
    or exists (
      select 1
      from public.client_contracts successor
      join selected_company sc on sc.id = successor.company_id
      where successor.client_id = cohort.client_id
        and successor.archived_at is null
        and coalesce(successor.status, '') <> 'archived'
        and successor.start_date >= cohort.contract_end_date - interval '1 day'
        and successor.start_date <= cohort.contract_end_date + interval '120 days'
        and successor.end_date > cohort.contract_end_date
    )
),
retention_settings as (
  select coalesce(settings.allow_status_change_retention, false) as allow_status_change_retention
  from selected_company sc
  left join public.company_settings settings on settings.company_id = sc.id
),
app_retention_matches as (
  select
    cohort.client_id,
    cohort.contract_end_date,
    min(
      coalesce(
        (event.payload->'contract'->>'start_date')::timestamptz,
        (event.payload->'contract'->>'startDate')::timestamptz,
        (event.payload->>'retention_date')::timestamptz,
        event.created_at
      )
    ) as retained_at
  from renewal_cohort cohort
  join public.client_history_events event
    on event.legacy_client_glide_row_id = cohort.client_id
  join selected_company sc on sc.id = event.company_id
  cross join retention_settings settings
  where (
      event.event_type = 'client_retention_recorded'
      or (
        settings.allow_status_change_retention
        and event.event_type = 'client_status_changed'
        and (event.payload->>'from_status', event.payload->>'to_status') in (
          ('front-end', 'front-end'),
          ('front-end', 'back-end'),
          ('back-end', 'back-end')
        )
      )
    )
    and coalesce(
      (event.payload->'contract'->>'start_date')::timestamptz,
      (event.payload->'contract'->>'startDate')::timestamptz,
      (event.payload->>'retention_date')::timestamptz,
      event.created_at
    ) between cohort.contract_end_date - interval '120 days'
      and cohort.contract_end_date + interval '120 days'
    and (
      event.event_type = 'client_retention_recorded'
      or exists (
        select 1
        from successor_contract_evidence successor
        where successor.client_id = cohort.client_id
      )
    )
  group by cohort.client_id, cohort.contract_end_date
),
legacy_retention_matches as (
  select
    cohort.client_id,
    cohort.contract_end_date,
    min(history.modified_date) as retained_at
  from renewal_cohort cohort
  join successor_contract_evidence successor on successor.client_id = cohort.client_id
  join public.backup_company_clients_history history
    on history.client_id = cohort.client_id
  where history.change_type_code = 'program-status'
    and (history.original_value, history.value) in (
      ('front-end', 'front-end'),
      ('front-end', 'back-end'),
      ('back-end', 'back-end')
    )
    and history.modified_date between cohort.contract_end_date - interval '120 days'
      and cohort.contract_end_date + interval '120 days'
  group by cohort.client_id, cohort.contract_end_date
),
retained_cohort as (
  select
    match.client_id,
    match.contract_end_date,
    min(match.retained_at) as retained_at
  from (
    select * from app_retention_matches
    union all
    select * from legacy_retention_matches
  ) match
  group by match.client_id, match.contract_end_date
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
          'contract_end_date', contract_end_date
        ) order by contract_end_date desc, client_id
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
          'retained_at', retained_at
        ) order by contract_end_date desc, client_id
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

create or replace function public.dashboard_renewal_cohort_counts_fast(
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
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_scope_role text;
  v_scope_member_id uuid;
  v_scope_member_legacy_id text;
  v_effective_assignee_id text := p_assigned_team_member_id;
begin
  select company.id
    into v_company_id
  from public.companies company
  where company.id::text = p_company_id
     or company.legacy_glide_row_id = p_company_id
  limit 1;

  if v_company_id is null then
    raise insufficient_privilege using message = 'Company access denied';
  end if;

  if (select auth.role()) <> 'service_role'
     and not public.is_retainos_super_admin_bound() then
    select
      scope.scope_role,
      scope.scope_member_id,
      scope.scope_member_legacy_id
    into
      v_scope_role,
      v_scope_member_id,
      v_scope_member_legacy_id
    from public.current_actor_app_scope() scope
    where scope.scope_company_id = v_company_id;

    if v_scope_role is null
       or v_scope_role not in ('director', 'support', 'csm') then
      raise insufficient_privilege using message = 'Company access denied';
    end if;

    if v_scope_role = 'csm' then
      v_effective_assignee_id := coalesce(
        v_scope_member_legacy_id,
        v_scope_member_id::text
      );
      if v_effective_assignee_id is null then
        raise insufficient_privilege using message = 'Client assignment required';
      end if;
    end if;
  end if;

  return query
  select result.*
  from public._dashboard_renewal_cohort_counts_fast_unchecked(
    p_company_id,
    p_csm_id,
    p_secondary_assignee_id,
    p_program_values,
    p_offer_id,
    p_client_start_date_from,
    p_client_start_date_to,
    p_date_range_start,
    p_date_range_end,
    v_effective_assignee_id
  ) result;
end;
$$;

revoke all on function public.dashboard_renewal_cohort_counts_fast(
  text, text, text, text[], text, timestamptz, timestamptz, timestamptz,
  timestamptz, text
) from public, anon;
grant execute on function public.dashboard_renewal_cohort_counts_fast(
  text, text, text, text[], text, timestamptz, timestamptz, timestamptz,
  timestamptz, text
) to authenticated, service_role;

comment on function public.dashboard_renewal_cohort_counts_fast is
  'Returns the selected contract-end cohort and only those retained outcomes corroborated by a successor contract or explicit RetainOS retention event.';

notify pgrst, 'reload schema';
