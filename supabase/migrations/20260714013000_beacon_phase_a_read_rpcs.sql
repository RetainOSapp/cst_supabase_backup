-- Beacon Phase A fixed read capabilities.
--
-- Each service-only, actor-bound RPC is a closed, selected-column query. The
-- browser/model cannot choose a table, column, SQL fragment, or unbounded result.

create or replace function public.beacon_actor_company_scope(
  p_company_id uuid,
  p_actor_auth_user_id uuid,
  p_actor_member_id uuid
)
returns table (
  company_id uuid,
  company_legacy_id text,
  actor_role text,
  actor_member_id uuid,
  actor_member_legacy_id text
)
language sql
stable
security definer
set search_path = ''
as $$
  with eligible_company as (
    select company.id, company.legacy_glide_row_id
    from public.companies company
    join public.ai_feature_global_controls control
      on control.feature_key = 'beacon'
     and control.status = 'active'
    join public.company_ai_feature_entitlements entitlement
      on entitlement.company_id = company.id
     and entitlement.feature_key = 'beacon'
     and entitlement.status in ('pilot', 'enabled')
     and (entitlement.effective_from is null or entitlement.effective_from <= now())
     and (entitlement.effective_until is null or entitlement.effective_until > now())
    where company.id = p_company_id
      and company.status = 'active'
      and company.archived_at is null
      and company.migration_status in ('pilot', 'migrated')
  ),
  actor as (
    select auth_user.id, lower(coalesce(auth_user.email, '')) as verified_email
    from auth.users auth_user
    where auth_user.id = p_actor_auth_user_id
  ),
  super_admin as (
    select true as allowed
    from actor
    join public.retainos_super_admins admin
      on admin.auth_user_id = actor.id
     and admin.status = 'active'
    where p_actor_member_id is null
  ),
  member_scope as (
    select
      member.company_id,
      member.id,
      member.legacy_glide_row_id,
      case when member.is_read_only then 'viewer' else member.role end as role
    from actor
    join public.company_members member
      on member.id = p_actor_member_id
     and member.company_id = p_company_id
    where case when member.is_read_only then 'viewer' else member.role end
      in ('director', 'support', 'csm')
      and member.status = 'active'
      and member.archived_at is null
      and (
        member.auth_user_id = actor.id
        or (
          member.auth_user_id is null
          and actor.verified_email <> ''
          and lower(member.email) = actor.verified_email
        )
      )
  )
  select
    company.id,
    company.legacy_glide_row_id,
    'super_admin'::text,
    null::uuid,
    null::text
  from eligible_company company
  cross join super_admin

  union all

  select
    company.id,
    company.legacy_glide_row_id,
    scope.role,
    scope.id,
    scope.legacy_glide_row_id
  from eligible_company company
  join member_scope scope
    on scope.company_id = company.id
  where not exists (select 1 from super_admin)
    and (
      scope.role <> 'csm'
      or exists (
        select 1
        from public.beacon_assignment_ledger_readiness(company.id) readiness
        where readiness.company_id = company.id
          and readiness.ledger_ready
      )
    );
$$;

create or replace function public.beacon_authorized_client_ids(
  p_company_id uuid,
  p_actor_auth_user_id uuid,
  p_actor_member_id uuid
)
returns table (client_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with scope as (
    select
      actor.actor_role,
      actor.actor_member_id,
      actor.actor_member_legacy_id
    from public.beacon_actor_company_scope(
      p_company_id,
      p_actor_auth_user_id,
      p_actor_member_id
    ) actor
  )
  select client.id
  from public.clients client
  cross join scope
  where client.company_id = p_company_id
    and client.archived_at is null
    and (
      scope.actor_role in ('super_admin', 'director', 'support')
      or (
        scope.actor_role = 'csm'
        and (
          nullif(btrim(client.csm_team_member_id), '') = scope.actor_member_legacy_id
          or nullif(btrim(client.csm_secondary_assignee_id), '') = scope.actor_member_legacy_id
          or exists (
            select 1
            from public.client_assignment_intervals interval_row
            where interval_row.company_id = p_company_id
              and interval_row.client_id = client.id
              and interval_row.member_id = scope.actor_member_id
              and interval_row.assertion_status = 'verified'
              and not exists (
                select 1
                from public.client_assignment_intervals newer
                where newer.proof_key = interval_row.proof_key
                  and newer.revision > interval_row.revision
              )
          )
        )
      )
    );
$$;

create or replace function public.beacon_company_metrics(
  p_company_id uuid,
  p_actor_auth_user_id uuid,
  p_actor_member_id uuid
)
returns table (
  active_clients bigint,
  front_end_clients bigint,
  back_end_clients bigint,
  paused_clients bigint,
  suspended_clients bigint,
  off_boarded_clients bigint,
  churned_clients bigint,
  retained_clients bigint,
  renewing_clients bigint,
  contract_gap_clients bigint,
  referral_ready_clients bigint,
  active_contract_monthly_value numeric,
  renewal_monthly_value numeric,
  generated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with scope as (
    select actor.company_id
    from public.beacon_actor_company_scope(
      p_company_id,
      p_actor_auth_user_id,
      p_actor_member_id
    ) actor
  ),
  authorized as (
    select
      client.id,
      client.glide_row_id,
      client.program_status_value,
      client.client_age_date_offboarded,
      client.client_age_date_offboarded_for_filtering,
      client.current_contract_start_date,
      client.current_contract_end_date,
      client.current_contract_end_date_for_filtering,
      client.current_contract_monthly_value,
      coalesce(client.outcomes_success_value_for_filtering, client.outcomes_success_value) as success_status,
      coalesce(client.outcomes_progress_for_filtering, client.outcomes_progress_value) as progress_status,
      coalesce(client.outcomes_buy_in_for_filtering, client.outcomes_buy_in_value) as buy_in_status,
      client.advocacy_referral_status
    from public.clients client
    join public.beacon_authorized_client_ids(
      p_company_id,
      p_actor_auth_user_id,
      p_actor_member_id
    ) authorized_client
      on authorized_client.client_id = client.id
    where client.company_id = p_company_id
      and client.archived_at is null
  ),
  retained_history as (
    select distinct history.legacy_client_glide_row_id
    from public.client_history_events history
    join authorized client
      on client.glide_row_id = history.legacy_client_glide_row_id
    where history.company_id = p_company_id
      and (
        history.event_type = 'client_retention_recorded'
        or (
          history.event_type = 'client_status_changed'
          and history.payload ->> 'to_status' in ('front-end', 'back-end')
          and history.payload ->> 'from_status' in ('front-end', 'back-end')
        )
      )
  )
  select
    count(*) filter (where program_status_value in ('front-end', 'back-end')),
    count(*) filter (where program_status_value = 'front-end'),
    count(*) filter (where program_status_value = 'back-end'),
    count(*) filter (where program_status_value = 'paused'),
    count(*) filter (where program_status_value = 'suspended'),
    count(*) filter (where program_status_value = 'off-boarded'),
    count(*) filter (
      where program_status_value = 'off-boarded'
        and coalesce(client_age_date_offboarded, client_age_date_offboarded_for_filtering)
          < coalesce(current_contract_end_date_for_filtering, current_contract_end_date)
    ),
    (select count(*) from retained_history),
    count(*) filter (
      where program_status_value in ('front-end', 'back-end')
        and coalesce(current_contract_end_date_for_filtering, current_contract_end_date) >= now()
        and coalesce(current_contract_end_date_for_filtering, current_contract_end_date)
          < now() + interval '30 days'
    ),
    count(*) filter (
      where program_status_value in ('front-end', 'back-end')
        and (
          current_contract_start_date is null
          or coalesce(current_contract_end_date_for_filtering, current_contract_end_date) is null
          or coalesce(current_contract_end_date_for_filtering, current_contract_end_date) <= now()
        )
    ),
    count(*) filter (
      where program_status_value in ('front-end', 'back-end')
        and lower(coalesce(success_status, '')) = 'green'
        and lower(coalesce(progress_status, '')) = 'green'
        and lower(coalesce(buy_in_status, '')) = 'green'
        and advocacy_referral_status = 'not_asked'
    ),
    coalesce(sum(current_contract_monthly_value) filter (
      where program_status_value in ('front-end', 'back-end')
        and current_contract_start_date <= now()
        and coalesce(current_contract_end_date_for_filtering, current_contract_end_date) > now()
    ), 0),
    coalesce(sum(current_contract_monthly_value) filter (
      where program_status_value in ('front-end', 'back-end')
        and coalesce(current_contract_end_date_for_filtering, current_contract_end_date) >= now()
        and coalesce(current_contract_end_date_for_filtering, current_contract_end_date)
          < now() + interval '30 days'
    ), 0),
    statement_timestamp()
  from scope
  left join authorized on true
  group by scope.company_id;
$$;

create or replace function public.beacon_list_clients(
  p_company_id uuid,
  p_actor_auth_user_id uuid,
  p_actor_member_id uuid,
  p_program_status text,
  p_health_dimension text,
  p_health_state text,
  p_csm_member_id uuid,
  p_name_fragment text,
  p_sort text,
  p_limit integer
)
returns table (
  client_id uuid,
  client_name text,
  business_name text,
  program_status text,
  primary_csm_name text,
  secondary_csm_name text,
  success_status text,
  progress_status text,
  buy_in_status text,
  last_contact_at timestamptz,
  next_contact_at timestamptz,
  contract_end_date timestamptz,
  internal_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  with scope as (
    select actor.actor_role, actor.actor_member_id
    from public.beacon_actor_company_scope(
      p_company_id,
      p_actor_auth_user_id,
      p_actor_member_id
    ) actor
  ),
  target_csm as (
    select member.id, member.legacy_glide_row_id
    from public.company_members member
    cross join scope
    where member.id = p_csm_member_id
      and member.company_id = p_company_id
      and member.role = 'csm'
      and member.status = 'active'
      and member.archived_at is null
      and (scope.actor_role <> 'csm' or member.id = scope.actor_member_id)
  ),
  candidates as (
    select
      client.id,
      client.glide_row_id,
      client.client_name,
      client.client_business,
      client.program_status_value,
      client.csm_team_member_id,
      client.csm_secondary_assignee_id,
      primary_member.name as primary_csm_name,
      secondary_member.name as secondary_csm_name,
      coalesce(client.outcomes_success_value_for_filtering, client.outcomes_success_value) as success_status,
      coalesce(client.outcomes_progress_for_filtering, client.outcomes_progress_value) as progress_status,
      coalesce(client.outcomes_buy_in_for_filtering, client.outcomes_buy_in_value) as buy_in_status,
      client.csm_date_of_last_contact,
      client.csm_date_of_next_contact,
      coalesce(client.current_contract_end_date_for_filtering, client.current_contract_end_date) as contract_end_date
    from public.clients client
    join public.beacon_authorized_client_ids(
      p_company_id,
      p_actor_auth_user_id,
      p_actor_member_id
    ) authorized_client
      on authorized_client.client_id = client.id
    left join public.company_members primary_member
      on primary_member.company_id = client.company_id
     and primary_member.legacy_glide_row_id = nullif(btrim(client.csm_team_member_id), '')
    left join public.company_members secondary_member
      on secondary_member.company_id = client.company_id
     and secondary_member.legacy_glide_row_id = nullif(btrim(client.csm_secondary_assignee_id), '')
    where client.company_id = p_company_id
      and client.archived_at is null
  )
  select
    candidate.id,
    left(candidate.client_name, 256),
    left(candidate.client_business, 256),
    left(candidate.program_status_value, 128),
    left(candidate.primary_csm_name, 256),
    left(candidate.secondary_csm_name, 256),
    left(candidate.success_status, 64),
    left(candidate.progress_status, 64),
    left(candidate.buy_in_status, 64),
    candidate.csm_date_of_last_contact,
    candidate.csm_date_of_next_contact,
    candidate.contract_end_date,
    case
      when candidate.glide_row_id ~ '^[A-Za-z0-9_-]{1,128}$'
        then '/clients/' || candidate.glide_row_id
      else null
    end
  from candidates candidate
  where p_limit between 1 and 50
    and p_sort in ('name_asc', 'renewal_asc', 'last_contact_asc', 'health_risk_first')
    and (p_program_status is null or p_program_status in (
      'front-end', 'back-end', 'paused', 'suspended', 'off-boarded'
    ))
    and (p_program_status is null or candidate.program_status_value = p_program_status)
    and (
      (p_health_dimension is null and p_health_state is null)
      or (
        p_health_dimension in ('success', 'progress', 'buy_in')
        and p_health_state in ('green', 'yellow', 'red')
        and lower(coalesce(case p_health_dimension
          when 'success' then candidate.success_status
          when 'progress' then candidate.progress_status
          when 'buy_in' then candidate.buy_in_status
        end, '')) = p_health_state
      )
    )
    and (
      p_csm_member_id is null
      or exists (
        select 1
        from target_csm member
        where member.legacy_glide_row_id in (
          nullif(btrim(candidate.csm_team_member_id), ''),
          nullif(btrim(candidate.csm_secondary_assignee_id), '')
        )
      )
    )
    and (
      p_name_fragment is null
      or (
        length(btrim(p_name_fragment)) between 1 and 80
        and (
          position(lower(btrim(p_name_fragment)) in lower(candidate.client_name)) > 0
          or position(
            lower(btrim(p_name_fragment))
            in lower(coalesce(candidate.client_business, ''))
          ) > 0
        )
      )
    )
  order by
    case when p_sort = 'name_asc' then lower(candidate.client_name) end asc nulls last,
    case when p_sort = 'renewal_asc' then candidate.contract_end_date end asc nulls last,
    case when p_sort = 'last_contact_asc' then candidate.csm_date_of_last_contact end asc nulls last,
    case when p_sort = 'health_risk_first' then least(
      case lower(coalesce(candidate.success_status, '')) when 'red' then 0 when 'yellow' then 1 when 'green' then 2 else 3 end,
      case lower(coalesce(candidate.progress_status, '')) when 'red' then 0 when 'yellow' then 1 when 'green' then 2 else 3 end,
      case lower(coalesce(candidate.buy_in_status, '')) when 'red' then 0 when 'yellow' then 1 when 'green' then 2 else 3 end
    ) end asc nulls last,
    lower(candidate.client_name),
    candidate.id
  limit p_limit;
$$;

create or replace function public.beacon_list_renewals(
  p_company_id uuid,
  p_actor_auth_user_id uuid,
  p_actor_member_id uuid,
  p_days integer,
  p_limit integer
)
returns table (
  client_id uuid,
  client_name text,
  program_status text,
  primary_csm_name text,
  contract_end_date timestamptz,
  contract_monthly_value numeric,
  days_until_renewal integer,
  internal_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    client.id,
    left(client.client_name, 256),
    left(client.program_status_value, 128),
    left(member.name, 256),
    coalesce(client.current_contract_end_date_for_filtering, client.current_contract_end_date),
    client.current_contract_monthly_value,
    floor(extract(epoch from (
      coalesce(client.current_contract_end_date_for_filtering, client.current_contract_end_date) - now()
    )) / 86400)::integer,
    case
      when client.glide_row_id ~ '^[A-Za-z0-9_-]{1,128}$'
        then '/clients/' || client.glide_row_id
      else null
    end
  from public.clients client
  join public.beacon_authorized_client_ids(
    p_company_id,
    p_actor_auth_user_id,
    p_actor_member_id
  ) authorized_client
    on authorized_client.client_id = client.id
  left join public.company_members member
    on member.company_id = client.company_id
   and member.legacy_glide_row_id = nullif(btrim(client.csm_team_member_id), '')
  where p_days between 0 and 365
    and p_limit between 1 and 50
    and client.company_id = p_company_id
    and client.archived_at is null
    and client.program_status_value in ('front-end', 'back-end')
    and coalesce(client.current_contract_end_date_for_filtering, client.current_contract_end_date) >= now()
    and coalesce(client.current_contract_end_date_for_filtering, client.current_contract_end_date)
      < now() + make_interval(days => p_days + 1)
  order by
    coalesce(client.current_contract_end_date_for_filtering, client.current_contract_end_date),
    lower(client.client_name),
    client.id
  limit p_limit;
$$;

create or replace function public.beacon_list_contract_gaps(
  p_company_id uuid,
  p_actor_auth_user_id uuid,
  p_actor_member_id uuid,
  p_limit integer
)
returns table (
  client_id uuid,
  client_name text,
  program_status text,
  primary_csm_name text,
  onboarded_at timestamptz,
  internal_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    client.id,
    left(client.client_name, 256),
    left(client.program_status_value, 128),
    left(member.name, 256),
    client.client_age_date_onboarded,
    case
      when client.glide_row_id ~ '^[A-Za-z0-9_-]{1,128}$'
        then '/clients/' || client.glide_row_id
      else null
    end
  from public.clients client
  join public.beacon_authorized_client_ids(
    p_company_id,
    p_actor_auth_user_id,
    p_actor_member_id
  ) authorized_client
    on authorized_client.client_id = client.id
  left join public.company_members member
    on member.company_id = client.company_id
   and member.legacy_glide_row_id = nullif(btrim(client.csm_team_member_id), '')
  where p_limit between 1 and 50
    and client.company_id = p_company_id
    and client.archived_at is null
    and client.program_status_value in ('front-end', 'back-end')
    and (
      client.current_contract_start_date is null
      or coalesce(client.current_contract_end_date_for_filtering, client.current_contract_end_date) is null
      or coalesce(client.current_contract_end_date_for_filtering, client.current_contract_end_date) <= now()
    )
  order by client.client_age_date_onboarded nulls last, lower(client.client_name), client.id
  limit p_limit;
$$;

create or replace function public.beacon_list_health_signals(
  p_company_id uuid,
  p_actor_auth_user_id uuid,
  p_actor_member_id uuid,
  p_dimension text,
  p_state text,
  p_limit integer
)
returns table (
  client_id uuid,
  client_name text,
  program_status text,
  primary_csm_name text,
  success_status text,
  progress_status text,
  buy_in_status text,
  last_contact_at timestamptz,
  next_contact_at timestamptz,
  internal_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  with candidates as (
    select
      client.id,
      client.glide_row_id,
      client.client_name,
      client.program_status_value,
      member.name as primary_csm_name,
      coalesce(client.outcomes_success_value_for_filtering, client.outcomes_success_value) as success_status,
      coalesce(client.outcomes_progress_for_filtering, client.outcomes_progress_value) as progress_status,
      coalesce(client.outcomes_buy_in_for_filtering, client.outcomes_buy_in_value) as buy_in_status,
      client.csm_date_of_last_contact,
      client.csm_date_of_next_contact
    from public.clients client
    join public.beacon_authorized_client_ids(
      p_company_id,
      p_actor_auth_user_id,
      p_actor_member_id
    ) authorized_client
      on authorized_client.client_id = client.id
    left join public.company_members member
      on member.company_id = client.company_id
     and member.legacy_glide_row_id = nullif(btrim(client.csm_team_member_id), '')
    where client.company_id = p_company_id
      and client.archived_at is null
  )
  select
    candidate.id,
    left(candidate.client_name, 256),
    left(candidate.program_status_value, 128),
    left(candidate.primary_csm_name, 256),
    left(candidate.success_status, 64),
    left(candidate.progress_status, 64),
    left(candidate.buy_in_status, 64),
    candidate.csm_date_of_last_contact,
    candidate.csm_date_of_next_contact,
    case
      when candidate.glide_row_id ~ '^[A-Za-z0-9_-]{1,128}$'
        then '/clients/' || candidate.glide_row_id
      else null
    end
  from candidates candidate
  where p_dimension in ('success', 'progress', 'buy_in')
    and p_state in ('green', 'yellow', 'red')
    and p_limit between 1 and 50
    and lower(coalesce(case p_dimension
      when 'success' then candidate.success_status
      when 'progress' then candidate.progress_status
      when 'buy_in' then candidate.buy_in_status
    end, '')) = p_state
  order by candidate.csm_date_of_last_contact nulls first, lower(candidate.client_name), candidate.id
  limit p_limit;
$$;

create or replace function public.beacon_list_referral_ready(
  p_company_id uuid,
  p_actor_auth_user_id uuid,
  p_actor_member_id uuid,
  p_limit integer
)
returns table (
  client_id uuid,
  client_name text,
  primary_csm_name text,
  success_status text,
  progress_status text,
  buy_in_status text,
  referral_status text,
  testimonial_status text,
  internal_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    client.id,
    left(client.client_name, 256),
    left(member.name, 256),
    left(coalesce(client.outcomes_success_value_for_filtering, client.outcomes_success_value), 64),
    left(coalesce(client.outcomes_progress_for_filtering, client.outcomes_progress_value), 64),
    left(coalesce(client.outcomes_buy_in_for_filtering, client.outcomes_buy_in_value), 64),
    left(client.advocacy_referral_status, 64),
    left(client.advocacy_testimonial_status, 64),
    case
      when client.glide_row_id ~ '^[A-Za-z0-9_-]{1,128}$'
        then '/clients/' || client.glide_row_id
      else null
    end
  from public.clients client
  join public.beacon_authorized_client_ids(
    p_company_id,
    p_actor_auth_user_id,
    p_actor_member_id
  ) authorized_client
    on authorized_client.client_id = client.id
  left join public.company_members member
    on member.company_id = client.company_id
   and member.legacy_glide_row_id = nullif(btrim(client.csm_team_member_id), '')
  where p_limit between 1 and 50
    and client.company_id = p_company_id
    and client.archived_at is null
    and client.program_status_value in ('front-end', 'back-end')
    and lower(coalesce(client.outcomes_success_value_for_filtering, client.outcomes_success_value, '')) = 'green'
    and lower(coalesce(client.outcomes_progress_for_filtering, client.outcomes_progress_value, '')) = 'green'
    and lower(coalesce(client.outcomes_buy_in_for_filtering, client.outcomes_buy_in_value, '')) = 'green'
    and client.advocacy_referral_status = 'not_asked'
  order by client.csm_date_of_last_contact desc nulls last, lower(client.client_name), client.id
  limit p_limit;
$$;

create or replace function public.beacon_list_csm_books(
  p_company_id uuid,
  p_actor_auth_user_id uuid,
  p_actor_member_id uuid,
  p_csm_member_id uuid,
  p_limit integer
)
returns table (
  member_id uuid,
  member_name text,
  active_clients bigint,
  front_end_clients bigint,
  back_end_clients bigint,
  renewals_30_days bigint,
  contract_gaps bigint,
  capacity numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with scope as (
    select actor.actor_role, actor.actor_member_id
    from public.beacon_actor_company_scope(
      p_company_id,
      p_actor_auth_user_id,
      p_actor_member_id
    ) actor
  ),
  csms as (
    select
      member.id,
      member.legacy_glide_row_id,
      member.name,
      member.capacity_number
    from public.company_members member
    cross join scope
    where member.company_id = p_company_id
      and member.role = 'csm'
      and member.status = 'active'
      and member.archived_at is null
      and not member.is_read_only
      and not member.hide_from_csm_list
      and (p_csm_member_id is null or member.id = p_csm_member_id)
      and (scope.actor_role <> 'csm' or member.id = scope.actor_member_id)
  ),
  current_books as (
    select
      csm.id as member_id,
      client.id as client_id,
      client.program_status_value,
      client.current_contract_start_date,
      coalesce(client.current_contract_end_date_for_filtering, client.current_contract_end_date) as contract_end_date
    from csms csm
    left join public.clients client
      on client.company_id = p_company_id
     and client.archived_at is null
     and (
       nullif(btrim(client.csm_team_member_id), '') = csm.legacy_glide_row_id
       or nullif(btrim(client.csm_secondary_assignee_id), '') = csm.legacy_glide_row_id
     )
  )
  select
    csm.id,
    left(csm.name, 256),
    count(book.client_id) filter (where book.program_status_value in ('front-end', 'back-end')),
    count(book.client_id) filter (where book.program_status_value = 'front-end'),
    count(book.client_id) filter (where book.program_status_value = 'back-end'),
    count(book.client_id) filter (
      where book.program_status_value in ('front-end', 'back-end')
        and book.contract_end_date >= now()
        and book.contract_end_date < now() + interval '30 days'
    ),
    count(book.client_id) filter (
      where book.program_status_value in ('front-end', 'back-end')
        and (
          book.current_contract_start_date is null
          or book.contract_end_date is null
          or book.contract_end_date <= now()
        )
    ),
    csm.capacity_number
  from csms csm
  left join current_books book
    on book.member_id = csm.id
  where p_limit between 1 and 50
  group by csm.id, csm.name, csm.capacity_number
  order by lower(coalesce(csm.name, '')), csm.id
  limit p_limit;
$$;

create or replace function public.beacon_get_client_brief(
  p_company_id uuid,
  p_actor_auth_user_id uuid,
  p_actor_member_id uuid,
  p_client_id uuid
)
returns table (
  client_id uuid,
  client_name text,
  business_name text,
  program_status text,
  primary_csm_name text,
  secondary_csm_name text,
  north_star text,
  success_status text,
  progress_status text,
  buy_in_status text,
  last_contact_at timestamptz,
  next_contact_at timestamptz,
  contract_start_date timestamptz,
  contract_end_date timestamptz,
  contract_monthly_value numeric,
  contract_status text,
  next_steps text,
  internal_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    client.id,
    left(client.client_name, 256),
    left(client.client_business, 256),
    left(client.program_status_value, 128),
    left(primary_member.name, 256),
    left(secondary_member.name, 256),
    left(client.north_star_value, 2000),
    left(coalesce(client.outcomes_success_value_for_filtering, client.outcomes_success_value), 64),
    left(coalesce(client.outcomes_progress_for_filtering, client.outcomes_progress_value), 64),
    left(coalesce(client.outcomes_buy_in_for_filtering, client.outcomes_buy_in_value), 64),
    client.csm_date_of_last_contact,
    client.csm_date_of_next_contact,
    client.current_contract_start_date,
    coalesce(client.current_contract_end_date_for_filtering, client.current_contract_end_date),
    client.current_contract_monthly_value,
    case
      when client.current_contract_start_date is null
        or coalesce(client.current_contract_end_date_for_filtering, client.current_contract_end_date) is null
        then 'missing'
      when client.current_contract_start_date > now() then 'not_started'
      when coalesce(client.current_contract_end_date_for_filtering, client.current_contract_end_date) <= now()
        then 'expired'
      else 'active'
    end,
    left(client.next_steps_value, 2000),
    case
      when client.glide_row_id ~ '^[A-Za-z0-9_-]{1,128}$'
        then '/clients/' || client.glide_row_id
      else null
    end
  from public.clients client
  join public.beacon_authorized_client_ids(
    p_company_id,
    p_actor_auth_user_id,
    p_actor_member_id
  ) authorized_client
    on authorized_client.client_id = client.id
  left join public.company_members primary_member
    on primary_member.company_id = client.company_id
   and primary_member.legacy_glide_row_id = nullif(btrim(client.csm_team_member_id), '')
  left join public.company_members secondary_member
    on secondary_member.company_id = client.company_id
   and secondary_member.legacy_glide_row_id = nullif(btrim(client.csm_secondary_assignee_id), '')
  where client.id = p_client_id
    and client.company_id = p_company_id
    and client.archived_at is null;
$$;

revoke all on function public.beacon_actor_company_scope(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.beacon_authorized_client_ids(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.beacon_company_metrics(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.beacon_list_clients(
  uuid, uuid, uuid, text, text, text, uuid, text, text, integer
)
  from public, anon, authenticated;
revoke all on function public.beacon_list_renewals(uuid, uuid, uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.beacon_list_contract_gaps(uuid, uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.beacon_list_health_signals(uuid, uuid, uuid, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.beacon_list_referral_ready(uuid, uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.beacon_list_csm_books(uuid, uuid, uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.beacon_get_client_brief(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.beacon_company_metrics(uuid, uuid, uuid)
  to service_role;
grant execute on function public.beacon_list_clients(
  uuid, uuid, uuid, text, text, text, uuid, text, text, integer
)
  to service_role;
grant execute on function public.beacon_list_renewals(uuid, uuid, uuid, integer, integer)
  to service_role;
grant execute on function public.beacon_list_contract_gaps(uuid, uuid, uuid, integer)
  to service_role;
grant execute on function public.beacon_list_health_signals(uuid, uuid, uuid, text, text, integer)
  to service_role;
grant execute on function public.beacon_list_referral_ready(uuid, uuid, uuid, integer)
  to service_role;
grant execute on function public.beacon_list_csm_books(uuid, uuid, uuid, uuid, integer)
  to service_role;
grant execute on function public.beacon_get_client_brief(uuid, uuid, uuid, uuid)
  to service_role;

insert into public.security_rollout_history (
  version,
  migration_name,
  details
)
values (
  '20260714013000',
  'beacon_phase_a_read_rpcs',
  jsonb_build_object(
    'scope', 'eight_fixed_service_only_actor_bound_read_capabilities',
    'max_rows', 50,
    'viewer_access', false,
    'csm_policy', 'current_or_ever_verified_assignment',
    'model_generated_queries', false
  )
)
on conflict (version) do nothing;

notify pgrst, 'reload schema';
