-- Security Phase 1B: actor-scoped Dashboard aggregate authority.
--
-- This slice is additive. It gives Viewer and other company roles aggregate
-- reporting paths that never return raw client or client-child rows. Existing
-- app-owned read policies are replaced in later Phase 1B slices.

do $$
begin
  if to_regclass('public.security_rollout_history') is null
    or not exists (
      select 1
      from public.security_rollout_history rollout
      where rollout.version = '20260713010000'
    ) then
    raise exception 'Security Phase 1A authority must be applied first';
  end if;
end $$;

create or replace function public.dashboard_authorized_app_clients(
  p_company_id text,
  p_csm_id text default null,
  p_secondary_assignee_id text default null,
  p_program_values text[] default null,
  p_offer_id text default null,
  p_client_start_date_from timestamptz default null,
  p_client_start_date_to timestamptz default null,
  p_date_range_end timestamptz default null
)
returns table (
  company_id uuid,
  company_legacy_id text,
  glide_row_id text,
  program_status_value text,
  outcomes_buy_in_for_filtering text,
  outcomes_progress_for_filtering text,
  offer_milestones_current_offer_id text,
  offer_milestones_current_milestone_id text,
  csm_team_member_id text,
  csm_secondary_assignee_id text,
  client_age_date_onboarded timestamptz,
  client_age_date_offboarded timestamptz,
  client_age_date_offboarded_for_filtering timestamptz,
  current_contract_start_date timestamptz,
  current_contract_of_days numeric,
  current_contract_end_date timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with requested_company as (
    select
      company.id,
      company.legacy_glide_row_id
    from public.companies company
    where company.status <> 'archived'
      and company.archived_at is null
      and company.migration_status in ('pilot', 'migrated')
      and (
        company.id::text = p_company_id
        or company.legacy_glide_row_id = p_company_id
      )
    limit 1
  ),
  actor_scope as (
    select *
    from public.current_actor_app_scope()
  ),
  authorized_company as (
    select
      company.id,
      company.legacy_glide_row_id,
      coalesce(scope.scope_role, 'super_admin') as actor_role,
      array_remove(
        array[
          scope.scope_member_id::text,
          scope.scope_member_legacy_id
        ],
        null
      ) as actor_member_ids
    from requested_company company
    left join actor_scope scope
      on scope.scope_company_id = company.id
    where (select public.is_retainos_super_admin_bound())
      or scope.scope_company_id = company.id
  ),
  valid_filters as (
    select company.*
    from authorized_company company
    where (
        p_program_values is null
        or (
          cardinality(p_program_values) between 1 and 10
          and p_program_values <@ array[
            'front-end',
            'back-end',
            'paused',
            'suspended',
            'off-boarded'
          ]::text[]
        )
      )
      and (
        p_client_start_date_from is null
        or p_client_start_date_to is null
        or p_client_start_date_from <= p_client_start_date_to
      )
      and (
        p_offer_id is null
        or exists (
          select 1
          from public.company_offers offer
          where offer.company_id = company.id
            and offer.glide_row_id = p_offer_id
        )
      )
      and (
        p_csm_id is null
        or (
          company.actor_role = 'csm'
          and p_csm_id = any(company.actor_member_ids)
        )
        or (
          company.actor_role <> 'csm'
          and exists (
            select 1
            from public.company_members member
            where member.company_id = company.id
              and member.status = 'active'
              and member.archived_at is null
              and member.role <> 'viewer'
              and member.is_read_only = false
              and member.hide_from_csm_list = false
              and p_csm_id in (
                member.id::text,
                member.legacy_glide_row_id
              )
          )
        )
      )
      and (
        p_secondary_assignee_id is null
        or exists (
          select 1
          from public.company_members member
          where member.company_id = company.id
            and member.status = 'active'
            and member.archived_at is null
            and member.role <> 'viewer'
            and member.is_read_only = false
            and member.hide_from_csm_list = false
            and p_secondary_assignee_id in (
              member.id::text,
              member.legacy_glide_row_id
            )
        )
      )
  )
  select
    client.company_id,
    company.legacy_glide_row_id,
    client.glide_row_id,
    client.program_status_value,
    client.outcomes_buy_in_for_filtering,
    client.outcomes_progress_for_filtering,
    client.offer_milestones_current_offer_id,
    client.offer_milestones_current_milestone_id,
    client.csm_team_member_id,
    client.csm_secondary_assignee_id,
    client.client_age_date_onboarded,
    client.client_age_date_offboarded,
    client.client_age_date_offboarded_for_filtering,
    client.current_contract_start_date,
    client.current_contract_of_days,
    client.current_contract_end_date
  from public.clients client
  join valid_filters company
    on company.id = client.company_id
  where (
      company.actor_role <> 'csm'
      or client.csm_team_member_id = any(company.actor_member_ids)
      or client.csm_secondary_assignee_id = any(company.actor_member_ids)
    )
    and (
      p_csm_id is null
      or company.actor_role = 'csm'
      or client.csm_team_member_id = p_csm_id
    )
    and (
      p_secondary_assignee_id is null
      or client.csm_secondary_assignee_id = p_secondary_assignee_id
    )
    and (
      p_program_values is null
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
    );
$$;

revoke all on function public.dashboard_authorized_app_clients(
  text,
  text,
  text,
  text[],
  text,
  timestamptz,
  timestamptz,
  timestamptz
) from public, anon, authenticated;
grant execute on function public.dashboard_authorized_app_clients(
  text,
  text,
  text,
  text[],
  text,
  timestamptz,
  timestamptz,
  timestamptz
) to service_role;

create or replace function public.dashboard_kpi_counts_actor_scoped(
  p_company_id text,
  p_csm_id text default null,
  p_secondary_assignee_id text default null,
  p_program_values text[] default null,
  p_offer_id text default null,
  p_client_start_date_from timestamptz default null,
  p_client_start_date_to timestamptz default null,
  p_date_range_start timestamptz default null,
  p_date_range_end timestamptz default null
)
returns table (
  active_clients bigint,
  front_end_clients bigint,
  back_end_clients bigint,
  paused_clients bigint,
  suspended_clients bigint,
  off_boarded_clients bigint,
  churned_clients bigint,
  churn_percentage numeric,
  retained_clients bigint,
  renewing_clients bigint,
  active_renewing_clients bigint,
  retention_percentage numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_company_legacy_id text;
  v_migration_status text;
  v_mirror_company_id text;
  v_actor_role text;
  v_actor_member_id text;
  v_is_super_admin boolean := public.is_retainos_super_admin_bound();
begin
  if p_company_id is null or btrim(p_company_id) = '' then
    return;
  end if;

  if p_date_range_start is not null
    and p_date_range_end is not null
    and p_date_range_start > p_date_range_end then
    return;
  end if;

  if p_client_start_date_from is not null
    and p_client_start_date_to is not null
    and p_client_start_date_from > p_client_start_date_to then
    return;
  end if;

  if p_program_values is not null
    and (
      cardinality(p_program_values) not between 1 and 10
      or not p_program_values <@ array[
        'front-end',
        'back-end',
        'paused',
        'suspended',
        'off-boarded'
      ]::text[]
    ) then
    return;
  end if;

  select
    company.id,
    company.legacy_glide_row_id,
    company.migration_status
  into
    v_company_id,
    v_company_legacy_id,
    v_migration_status
  from public.companies company
  where company.status <> 'archived'
    and company.archived_at is null
    and (
      company.id::text = p_company_id
      or company.legacy_glide_row_id = p_company_id
    )
  limit 1;

  if v_company_id is not null
    and v_migration_status in ('pilot', 'migrated') then
    if not public.can_read_app_company(v_company_id) then
      return;
    end if;

    return query
    with filtered_clients as (
      select *
      from public.dashboard_authorized_app_clients(
        p_company_id,
        p_csm_id,
        p_secondary_assignee_id,
        p_program_values,
        p_offer_id,
        p_client_start_date_from,
        p_client_start_date_to,
        p_date_range_end
      )
    ),
    client_contract_dates as (
      select
        client.glide_row_id,
        coalesce(
          client.current_contract_end_date,
          case
            when client.current_contract_start_date is not null
              and client.current_contract_of_days is not null
            then client.current_contract_start_date
              + make_interval(days => client.current_contract_of_days::int)
            else null
          end
        ) as current_contract_end_date
      from filtered_clients client
    ),
    contract_history as (
      select contract.client_id, contract.end_date
      from public.client_contracts contract
      join filtered_clients client
        on client.company_id = contract.company_id
       and client.glide_row_id = contract.client_id
      where contract.archived_at is null
        and coalesce(contract.status, '') <> 'archived'

      union all

      select contract.client_id, contract.end_date
      from public.backup_company_clients_contracts contract
      join filtered_clients client
        on client.glide_row_id = contract.client_id
    ),
    retained_history as (
      select distinct history.legacy_client_glide_row_id as client_id
      from public.client_history_events history
      join filtered_clients client
        on client.company_id = history.company_id
       and client.glide_row_id = history.legacy_client_glide_row_id
      where (
          history.event_type = 'client_retention_recorded'
          or (
            history.event_type = 'client_status_changed'
            and (history.payload ->> 'to_status') in ('front-end', 'back-end')
            and (history.payload ->> 'from_status') in ('front-end', 'back-end')
          )
        )
        and (
          p_date_range_start is null
          or history.created_at >= p_date_range_start
        )
        and (
          p_date_range_end is null
          or history.created_at < p_date_range_end + interval '1 day'
        )

      union

      select distinct history.client_id
      from public.backup_company_clients_history history
      join filtered_clients client
        on client.glide_row_id = history.client_id
      where history.change_type_code = 'program-status'
        and history.value in ('front-end', 'back-end')
        and history.original_value in ('front-end', 'back-end')
        and (
          p_date_range_start is null
          or history.modified_date >= p_date_range_start
        )
        and (
          p_date_range_end is null
          or history.modified_date < p_date_range_end + interval '1 day'
        )
    ),
    offboarded_clients as (
      select client.glide_row_id
      from filtered_clients client
      where client.program_status_value = 'off-boarded'
        and (
          p_date_range_start is null
          or coalesce(
            client.client_age_date_offboarded,
            client.client_age_date_offboarded_for_filtering
          ) >= p_date_range_start
        )
        and (
          p_date_range_end is null
          or coalesce(
            client.client_age_date_offboarded,
            client.client_age_date_offboarded_for_filtering
          ) < p_date_range_end + interval '1 day'
        )
    ),
    churned_clients as (
      select client.glide_row_id
      from filtered_clients client
      join client_contract_dates contract
        on contract.glide_row_id = client.glide_row_id
      where client.program_status_value = 'off-boarded'
        and coalesce(
          client.client_age_date_offboarded,
          client.client_age_date_offboarded_for_filtering
        ) is not null
        and contract.current_contract_end_date is not null
        and coalesce(
          client.client_age_date_offboarded,
          client.client_age_date_offboarded_for_filtering
        ) < contract.current_contract_end_date
        and (
          p_date_range_start is null
          or coalesce(
            client.client_age_date_offboarded,
            client.client_age_date_offboarded_for_filtering
          ) >= p_date_range_start
        )
        and (
          p_date_range_end is null
          or coalesce(
            client.client_age_date_offboarded,
            client.client_age_date_offboarded_for_filtering
          ) < p_date_range_end + interval '1 day'
        )
    ),
    renewing_clients as (
      select distinct client.glide_row_id
      from filtered_clients client
      join client_contract_dates contract
        on contract.glide_row_id = client.glide_row_id
      where client.program_status_value not in ('paused', 'suspended')
        and not exists (
          select 1
          from churned_clients churn
          where churn.glide_row_id = client.glide_row_id
        )
        and contract.current_contract_end_date is not null
        and (
          p_date_range_start is null
          or contract.current_contract_end_date >= p_date_range_start
        )
        and (
          p_date_range_end is null
          or contract.current_contract_end_date < p_date_range_end + interval '1 day'
        )

      union

      select distinct client.glide_row_id
      from filtered_clients client
      join contract_history contract
        on contract.client_id = client.glide_row_id
      where client.program_status_value not in ('paused', 'suspended')
        and not exists (
          select 1
          from churned_clients churn
          where churn.glide_row_id = client.glide_row_id
        )
        and contract.end_date is not null
        and (
          p_date_range_start is null
          or contract.end_date >= p_date_range_start
        )
        and (
          p_date_range_end is null
          or contract.end_date < p_date_range_end + interval '1 day'
        )
    ),
    counts as (
      select
        count(*) filter (
          where program_status_value in ('front-end', 'back-end')
        ) as active_clients,
        count(*) filter (
          where program_status_value = 'front-end'
        ) as front_end_clients,
        count(*) filter (
          where program_status_value = 'back-end'
        ) as back_end_clients,
        count(*) filter (
          where program_status_value = 'paused'
        ) as paused_clients,
        count(*) filter (
          where program_status_value = 'suspended'
        ) as suspended_clients,
        (select count(*) from offboarded_clients) as off_boarded_clients,
        (select count(*) from churned_clients) as churned_clients,
        (
          select count(*)
          from retained_history retained
          join filtered_clients client
            on client.glide_row_id = retained.client_id
        ) as retained_clients,
        (select count(*) from renewing_clients) as renewing_clients,
        (
          select count(*)
          from renewing_clients renewing
          join filtered_clients client
            on client.glide_row_id = renewing.glide_row_id
          where client.program_status_value in ('front-end', 'back-end')
            and not exists (
              select 1
              from retained_history retained
              where retained.client_id = renewing.glide_row_id
            )
        ) as active_renewing_clients
      from filtered_clients
    )
    select
      counts.active_clients,
      counts.front_end_clients,
      counts.back_end_clients,
      counts.paused_clients,
      counts.suspended_clients,
      counts.off_boarded_clients,
      counts.churned_clients,
      case
        when counts.front_end_clients
          + counts.back_end_clients
          + counts.off_boarded_clients = 0
        then 0
        else round(
          counts.churned_clients::numeric
          / (
            counts.front_end_clients
            + counts.back_end_clients
            + counts.off_boarded_clients
          )::numeric
          * 100
        )
      end,
      counts.retained_clients,
      counts.renewing_clients,
      counts.active_renewing_clients,
      case
        when counts.renewing_clients = 0 then 0
        else round(
          counts.retained_clients::numeric
          / counts.renewing_clients::numeric
          * 100
        )
      end
    from counts;

    return;
  end if;

  v_mirror_company_id := coalesce(v_company_legacy_id, p_company_id);

  if not public.can_read_mirror_company(v_mirror_company_id) then
    return;
  end if;

  if not v_is_super_admin then
    select
      scope.scope_role,
      scope.scope_member_legacy_id
    into
      v_actor_role,
      v_actor_member_id
    from public.current_actor_mirror_scope() scope
    where scope.scope_company_legacy_id = v_mirror_company_id;

    if v_actor_role = 'csm'
      and (
        (p_csm_id is not null and p_csm_id <> v_actor_member_id)
        or (
          p_secondary_assignee_id is not null
          and p_secondary_assignee_id <> v_actor_member_id
        )
      ) then
      return;
    end if;
  end if;

  return query
  with filtered_clients as (
    select distinct on (client.glide_row_id)
      client.glide_row_id,
      client.program_status_value,
      client.client_age_date_onboarded,
      client.client_age_date_offboarded,
      client.client_age_date_offboarded_for_filtering,
      client.current_contract_start_date,
      client.current_contract_of_days,
      client.current_contract_end_date
    from public.backup_company_clients client
    where client.company_id = v_mirror_company_id
      and (
        v_is_super_admin
        or v_actor_role <> 'csm'
        or client.csm_team_member_id = v_actor_member_id
        or client.csm_secondary_assignee_id = v_actor_member_id
      )
      and (
        coalesce(v_actor_role, 'super_admin') = 'csm'
        or p_csm_id is null
        or client.csm_team_member_id = p_csm_id
      )
      and (
        coalesce(v_actor_role, 'super_admin') = 'csm'
        or p_secondary_assignee_id is null
        or client.csm_secondary_assignee_id = p_secondary_assignee_id
      )
      and (
        p_program_values is null
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
        or client.client_age_date_onboarded
          < p_client_start_date_to + interval '1 day'
      )
      and (
        p_date_range_end is null
        or client.client_age_date_onboarded is null
        or client.client_age_date_onboarded < p_date_range_end + interval '1 day'
      )
    order by
      client.glide_row_id,
      client.client_age_date_onboarded desc nulls last,
      client.current_contract_end_date desc nulls last,
      client.current_contract_start_date desc nulls last,
      client.current_contract_of_days desc nulls last,
      client.client_age_date_offboarded desc nulls last,
      client.client_age_date_offboarded_for_filtering desc nulls last,
      client.program_status_value asc nulls last
  ),
  client_contract_dates as (
    select
      client.glide_row_id,
      coalesce(
        client.current_contract_end_date,
        case
          when client.current_contract_start_date is not null
            and client.current_contract_of_days is not null
          then client.current_contract_start_date
            + make_interval(days => client.current_contract_of_days::int)
          else null
        end
      ) as current_contract_end_date
    from filtered_clients client
  ),
  contract_history as (
    select contract.client_id, contract.end_date
    from public.backup_company_clients_contracts contract
    join filtered_clients client
      on client.glide_row_id = contract.client_id
  ),
  retained_history as (
    select distinct history.client_id
    from public.backup_company_clients_history history
    join filtered_clients client
      on client.glide_row_id = history.client_id
    where history.change_type_code = 'program-status'
      and history.value in ('front-end', 'back-end')
      and history.original_value in ('front-end', 'back-end')
      and (
        p_date_range_start is null
        or history.modified_date >= p_date_range_start
      )
      and (
        p_date_range_end is null
        or history.modified_date < p_date_range_end + interval '1 day'
      )
  ),
  offboarded_clients as (
    select client.glide_row_id
    from filtered_clients client
    where client.program_status_value = 'off-boarded'
      and (
        p_date_range_start is null
        or coalesce(
          client.client_age_date_offboarded,
          client.client_age_date_offboarded_for_filtering
        ) >= p_date_range_start
      )
      and (
        p_date_range_end is null
        or coalesce(
          client.client_age_date_offboarded,
          client.client_age_date_offboarded_for_filtering
        ) < p_date_range_end + interval '1 day'
      )
  ),
  churned_clients as (
    select client.glide_row_id
    from filtered_clients client
    join client_contract_dates contract
      on contract.glide_row_id = client.glide_row_id
    where client.program_status_value = 'off-boarded'
      and coalesce(
        client.client_age_date_offboarded,
        client.client_age_date_offboarded_for_filtering
      ) is not null
      and contract.current_contract_end_date is not null
      and coalesce(
        client.client_age_date_offboarded,
        client.client_age_date_offboarded_for_filtering
      ) < contract.current_contract_end_date
      and (
        p_date_range_start is null
        or coalesce(
          client.client_age_date_offboarded,
          client.client_age_date_offboarded_for_filtering
        ) >= p_date_range_start
      )
      and (
        p_date_range_end is null
        or coalesce(
          client.client_age_date_offboarded,
          client.client_age_date_offboarded_for_filtering
        ) < p_date_range_end + interval '1 day'
      )
  ),
  renewing_clients as (
    select distinct client.glide_row_id
    from filtered_clients client
    join client_contract_dates contract
      on contract.glide_row_id = client.glide_row_id
    where client.program_status_value not in ('paused', 'suspended')
      and not exists (
        select 1
        from churned_clients churn
        where churn.glide_row_id = client.glide_row_id
      )
      and contract.current_contract_end_date is not null
      and (
        p_date_range_start is null
        or contract.current_contract_end_date >= p_date_range_start
      )
      and (
        p_date_range_end is null
        or contract.current_contract_end_date < p_date_range_end + interval '1 day'
      )

    union

    select distinct client.glide_row_id
    from filtered_clients client
    join contract_history contract
      on contract.client_id = client.glide_row_id
    where client.program_status_value not in ('paused', 'suspended')
      and not exists (
        select 1
        from churned_clients churn
        where churn.glide_row_id = client.glide_row_id
      )
      and contract.end_date is not null
      and (
        p_date_range_start is null
        or contract.end_date >= p_date_range_start
      )
      and (
        p_date_range_end is null
        or contract.end_date < p_date_range_end + interval '1 day'
      )
  ),
  counts as (
    select
      count(*) filter (
        where program_status_value in ('front-end', 'back-end')
      ) as active_clients,
      count(*) filter (
        where program_status_value = 'front-end'
      ) as front_end_clients,
      count(*) filter (
        where program_status_value = 'back-end'
      ) as back_end_clients,
      count(*) filter (
        where program_status_value = 'paused'
      ) as paused_clients,
      count(*) filter (
        where program_status_value = 'suspended'
      ) as suspended_clients,
      (select count(*) from offboarded_clients) as off_boarded_clients,
      (select count(*) from churned_clients) as churned_clients,
      (
        select count(*)
        from retained_history retained
        join filtered_clients client
          on client.glide_row_id = retained.client_id
      ) as retained_clients,
      (select count(*) from renewing_clients) as renewing_clients,
      (
        select count(*)
        from renewing_clients renewing
        join filtered_clients client
          on client.glide_row_id = renewing.glide_row_id
        where client.program_status_value in ('front-end', 'back-end')
          and not exists (
            select 1
            from retained_history retained
            where retained.client_id = renewing.glide_row_id
          )
      ) as active_renewing_clients
    from filtered_clients
  )
  select
    counts.active_clients,
    counts.front_end_clients,
    counts.back_end_clients,
    counts.paused_clients,
    counts.suspended_clients,
    counts.off_boarded_clients,
    counts.churned_clients,
    case
      when counts.front_end_clients
        + counts.back_end_clients
        + counts.off_boarded_clients = 0
      then 0
      else round(
        counts.churned_clients::numeric
        / (
          counts.front_end_clients
          + counts.back_end_clients
          + counts.off_boarded_clients
        )::numeric
        * 100
      )
    end,
    counts.retained_clients,
    counts.renewing_clients,
    counts.active_renewing_clients,
    case
      when counts.renewing_clients = 0 then 0
      else round(
        counts.retained_clients::numeric
        / counts.renewing_clients::numeric
        * 100
      )
    end
  from counts;
end;
$$;

create or replace function public.dashboard_overview_rollups_actor_scoped(
  p_company_id text,
  p_csm_id text default null,
  p_secondary_assignee_id text default null,
  p_program_values text[] default null,
  p_offer_id text default null,
  p_client_start_date_from timestamptz default null,
  p_client_start_date_to timestamptz default null,
  p_date_range_start timestamptz default null,
  p_date_range_end timestamptz default null
)
returns table (
  advocacy jsonb,
  ttv jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with selected_company as (
    select company.id
    from public.companies company
    where company.status <> 'archived'
      and company.archived_at is null
      and company.migration_status in ('pilot', 'migrated')
      and (
        company.id::text = p_company_id
        or company.legacy_glide_row_id = p_company_id
      )
      and public.can_read_app_company(company.id)
    limit 1
  ),
  authorized_clients as (
    select client.*
    from public.dashboard_authorized_app_clients(
      p_company_id,
      p_csm_id,
      p_secondary_assignee_id,
      p_program_values,
      p_offer_id,
      p_client_start_date_from,
      p_client_start_date_to,
      p_date_range_end
    ) client
  ),
  advocacy_types(advocacy_type) as (
    values
      ('review'::text),
      ('testimonial'::text),
      ('referral'::text),
      ('renewal_upsell'::text)
  ),
  advocacy_counts as (
    select
      event.advocacy_type,
      count(*) filter (where event.action = 'asked') as asked,
      count(*) filter (where event.action = 'received') as received
    from public.client_advocacy_events event
    join selected_company company
      on company.id = event.company_id
    join authorized_clients client
      on client.company_id = event.company_id
     and client.glide_row_id = event.client_legacy_id
    where (
        p_date_range_start is null
        or event.occurred_at >= p_date_range_start
      )
      and (
        p_date_range_end is null
        or event.occurred_at < p_date_range_end + interval '1 day'
      )
    group by event.advocacy_type
  ),
  advocacy_json as (
    select jsonb_agg(
      jsonb_build_object(
        'type', type.advocacy_type,
        'asked', coalesce(counts.asked, 0),
        'received', coalesce(counts.received, 0)
      )
      order by array_position(
        array['review', 'testimonial', 'referral', 'renewal_upsell']::text[],
        type.advocacy_type
      )
    ) as value
    from advocacy_types type
    left join advocacy_counts counts
      on counts.advocacy_type = type.advocacy_type
  ),
  ttv_milestones as (
    select milestone.glide_row_id
    from public.company_offer_milestones milestone
    join selected_company company
      on company.id = milestone.company_id
    where milestone.is_ttv_milestone = true
      and milestone.status = 'active'
      and milestone.archived_at is null
      and (
        p_offer_id is null
        or milestone.offer_id = p_offer_id
      )
  ),
  client_ttv_days as (
    select
      progress.client_id,
      min(
        coalesce(
          progress.time_to_hit_days,
          greatest(
            0,
            ceil(
              extract(
                epoch from (
                  progress.completion_date
                  - coalesce(
                    client.client_age_date_onboarded,
                    client.current_contract_start_date
                  )
                )
              ) / 86400
            )
          )
        )
      ) as days
    from public.client_milestones progress
    join selected_company company
      on company.id = progress.company_id
    join authorized_clients client
      on client.company_id = progress.company_id
     and client.glide_row_id = progress.client_id
    join ttv_milestones milestone
      on milestone.glide_row_id = progress.milestone_id
    where progress.archived_at is null
      and progress.completion_date is not null
      and coalesce(
        client.client_age_date_onboarded,
        client.current_contract_start_date
      ) is not null
      and (
        p_date_range_start is null
        or progress.completion_date >= p_date_range_start
      )
      and (
        p_date_range_end is null
        or progress.completion_date < p_date_range_end + interval '1 day'
      )
    group by progress.client_id
  ),
  ttv_json as (
    select jsonb_build_object(
      'average_days', round(avg(days)),
      'reached_count', count(days),
      'configured_milestones', (select count(*) from ttv_milestones)
    ) as value
    from client_ttv_days
  )
  select advocacy_json.value, ttv_json.value
  from selected_company
  cross join advocacy_json
  cross join ttv_json;
$$;

create or replace function public.dashboard_chart_rollups_actor_scoped(
  p_company_id text,
  p_csm_id text default null,
  p_secondary_assignee_id text default null,
  p_program_values text[] default null,
  p_offer_id text default null,
  p_client_start_date_from timestamptz default null,
  p_client_start_date_to timestamptz default null,
  p_date_range_end timestamptz default null
)
returns table (
  metric text,
  bucket_key text,
  bucket_label text,
  value bigint,
  capacity numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with selected_company as (
    select company.id
    from public.companies company
    where company.status <> 'archived'
      and company.archived_at is null
      and company.migration_status in ('pilot', 'migrated')
      and (
        company.id::text = p_company_id
        or company.legacy_glide_row_id = p_company_id
      )
      and public.can_read_app_company(company.id)
    limit 1
  ),
  actor_scope as (
    select *
    from public.current_actor_app_scope()
  ),
  authorized_clients as (
    select client.*
    from public.dashboard_authorized_app_clients(
      p_company_id,
      p_csm_id,
      p_secondary_assignee_id,
      p_program_values,
      p_offer_id,
      p_client_start_date_from,
      p_client_start_date_to,
      p_date_range_end
    ) client
  ),
  actor_member_ids as (
    select array_remove(
      array[
        scope.scope_member_id::text,
        scope.scope_member_legacy_id
      ],
      null
    ) as value
    from actor_scope scope
  ),
  task_rows as (
    select task.status_value
    from public.client_tasks task
    join selected_company company
      on company.id = task.company_id
    left join actor_scope scope
      on scope.scope_company_id = task.company_id
    where (
        (select public.is_retainos_super_admin_bound())
        or scope.scope_role <> 'csm'
        or task.assigned_to_id = any(
          coalesce(
            (select value from actor_member_ids),
            array[]::text[]
          )
        )
      )
      and (
        p_csm_id is null
        or scope.scope_role = 'csm'
        or task.assigned_to_id = p_csm_id
      )
  ),
  active_members as (
    select
      member.id,
      coalesce(member.legacy_glide_row_id, member.id::text) as member_key,
      coalesce(member.name, 'Unassigned') as member_name,
      member.capacity_number
    from public.company_members member
    join selected_company company
      on company.id = member.company_id
    where member.status = 'active'
      and member.archived_at is null
      and member.role <> 'viewer'
      and member.is_read_only = false
      and member.hide_from_csm_list = false
  ),
  program_buckets as (
    select
      'program'::text as metric,
      coalesce(nullif(client.program_status_value, ''), 'not-set') as bucket_key,
      case
        when coalesce(nullif(client.program_status_value, ''), 'not-set') = 'not-set'
        then 'Not set'
        else initcap(replace(client.program_status_value, '-', ' '))
      end as bucket_label,
      count(*)::bigint as value,
      null::numeric as capacity
    from authorized_clients client
    group by client.program_status_value
  ),
  buy_in_buckets as (
    select
      'buy_in'::text,
      coalesce(nullif(client.outcomes_buy_in_for_filtering, ''), 'not-set'),
      case
        when coalesce(nullif(client.outcomes_buy_in_for_filtering, ''), 'not-set') = 'not-set'
        then 'Not set'
        else initcap(
          replace(replace(client.outcomes_buy_in_for_filtering, '-', ' '), '_', ' ')
        )
      end,
      count(*)::bigint,
      null::numeric
    from authorized_clients client
    group by client.outcomes_buy_in_for_filtering
  ),
  progress_buckets as (
    select
      'progress'::text,
      coalesce(nullif(client.outcomes_progress_for_filtering, ''), 'not-set'),
      case
        when coalesce(nullif(client.outcomes_progress_for_filtering, ''), 'not-set') = 'not-set'
        then 'Not set'
        else initcap(
          replace(replace(client.outcomes_progress_for_filtering, '-', ' '), '_', ' ')
        )
      end,
      count(*)::bigint,
      null::numeric
    from authorized_clients client
    group by client.outcomes_progress_for_filtering
  ),
  journey_source as (
    select
      case
        when p_offer_id is null then
          coalesce(
            nullif(client.offer_milestones_current_offer_id, ''),
            'not-set'
          )
        when client.offer_milestones_current_milestone_id is null then 'not-set'
        when exists (
          select 1
          from public.company_offer_milestones milestone
          where milestone.company_id = client.company_id
            and milestone.offer_id = p_offer_id
            and milestone.glide_row_id = client.offer_milestones_current_milestone_id
        ) then client.offer_milestones_current_milestone_id
        else 'milestone-mismatch'
      end as bucket_key,
      client.company_id
    from authorized_clients client
  ),
  journey_buckets as (
    select
      case when p_offer_id is null then 'pathway' else 'milestone' end,
      source.bucket_key,
      case
        when source.bucket_key = 'not-set' then 'Not set'
        when source.bucket_key = 'milestone-mismatch' then 'Milestone mismatch'
        when p_offer_id is null then coalesce(offer.name, source.bucket_key)
        else coalesce(milestone.name, source.bucket_key)
      end,
      count(*)::bigint,
      null::numeric
    from journey_source source
    left join public.company_offers offer
      on p_offer_id is null
     and offer.company_id = source.company_id
     and offer.glide_row_id = source.bucket_key
    left join public.company_offer_milestones milestone
      on p_offer_id is not null
     and milestone.company_id = source.company_id
     and milestone.offer_id = p_offer_id
     and milestone.glide_row_id = source.bucket_key
    group by
      source.bucket_key,
      offer.name,
      milestone.name
  ),
  task_buckets as (
    select
      'task_status'::text,
      coalesce(nullif(task.status_value, ''), 'not-set'),
      case
        when coalesce(nullif(task.status_value, ''), 'not-set') = 'not-set'
        then 'Not set'
        else initcap(replace(replace(task.status_value, '-', ' '), '_', ' '))
      end,
      count(*)::bigint,
      null::numeric
    from task_rows task
    group by task.status_value
  ),
  workload_buckets as (
    select
      'csm_workload'::text,
      coalesce(nullif(client.csm_team_member_id, ''), 'not-set'),
      coalesce(member.member_name, 'Unassigned'),
      count(*)::bigint,
      null::numeric
    from authorized_clients client
    left join active_members member
      on client.csm_team_member_id in (
        member.id::text,
        member.member_key
      )
    where client.program_status_value in ('front-end', 'back-end')
    group by client.csm_team_member_id, member.member_name
  ),
  capacity_buckets as (
    select
      'csm_capacity'::text,
      member.member_key,
      member.member_name,
      count(client.glide_row_id)::bigint,
      member.capacity_number
    from active_members member
    left join authorized_clients client
      on client.program_status_value in ('front-end', 'back-end')
     and client.csm_team_member_id in (
       member.id::text,
       member.member_key
     )
    group by
      member.member_key,
      member.member_name,
      member.capacity_number
    having count(client.glide_row_id) > 0
      or member.capacity_number is not null
  )
  select * from program_buckets
  union all select * from buy_in_buckets
  union all select * from progress_buckets
  union all select * from journey_buckets
  union all select * from task_buckets
  union all select * from workload_buckets
  union all select * from capacity_buckets;
$$;

revoke all on function public.dashboard_kpi_counts_actor_scoped(
  text,
  text,
  text,
  text[],
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz
) from public, anon;
revoke all on function public.dashboard_overview_rollups_actor_scoped(
  text,
  text,
  text,
  text[],
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz
) from public, anon;
revoke all on function public.dashboard_chart_rollups_actor_scoped(
  text,
  text,
  text,
  text[],
  text,
  timestamptz,
  timestamptz,
  timestamptz
) from public, anon;

grant execute on function public.dashboard_kpi_counts_actor_scoped(
  text,
  text,
  text,
  text[],
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz
) to authenticated, service_role;
grant execute on function public.dashboard_overview_rollups_actor_scoped(
  text,
  text,
  text,
  text[],
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz
) to authenticated, service_role;
grant execute on function public.dashboard_chart_rollups_actor_scoped(
  text,
  text,
  text,
  text[],
  text,
  timestamptz,
  timestamptz,
  timestamptz
) to authenticated, service_role;

insert into public.security_rollout_history (
  version,
  migration_name,
  details
)
values (
  '20260713020000',
  'security_phase1b_dashboard_aggregates',
  jsonb_build_object(
    'scope', 'actor_scoped_dashboard_aggregate_authority',
    'raw_viewer_client_rows', false,
    'policy_changes', false,
    'legacy_rpc_grants_changed', false
  )
)
on conflict (version) do nothing;

notify pgrst, 'reload schema';
