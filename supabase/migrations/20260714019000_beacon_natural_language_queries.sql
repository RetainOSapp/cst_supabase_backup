-- Natural-language Beacon lookup and bounded upcoming-contact filters.

create or replace function public.beacon_list_clients(
  p_company_id uuid,
  p_actor_auth_user_id uuid,
  p_actor_member_id uuid,
  p_program_status text,
  p_health_dimension text,
  p_health_state text,
  p_csm_member_id uuid,
  p_csm_name text,
  p_name_fragment text,
  p_next_contact_days integer,
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
      p_csm_name is null
      or (
        length(btrim(p_csm_name)) between 1 and 120
        and lower(btrim(p_csm_name)) in (
          lower(btrim(coalesce(candidate.primary_csm_name, ''))),
          lower(btrim(coalesce(candidate.secondary_csm_name, '')))
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
    and (
      p_next_contact_days is null
      or (
        p_next_contact_days between 0 and 365
        and candidate.csm_date_of_next_contact >= current_date
        and candidate.csm_date_of_next_contact < current_date + (p_next_contact_days + 1)
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


create or replace function public.beacon_get_client_brief(
  p_company_id uuid,
  p_actor_auth_user_id uuid,
  p_actor_member_id uuid,
  p_client_id uuid,
  p_client_name text,
  p_csm_name text
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
  with authorized_candidates as (
    select
      client.id,
      client.glide_row_id,
      client.client_name,
      client.client_business,
      client.program_status_value,
      client.north_star_value,
      client.outcomes_success_value_for_filtering,
      client.outcomes_success_value,
      client.outcomes_progress_for_filtering,
      client.outcomes_progress_value,
      client.outcomes_buy_in_for_filtering,
      client.outcomes_buy_in_value,
      client.csm_date_of_last_contact,
      client.csm_date_of_next_contact,
      client.current_contract_start_date,
      client.current_contract_end_date_for_filtering,
      client.current_contract_end_date,
      client.current_contract_monthly_value,
      client.next_steps_value,
      primary_member.name as resolved_primary_csm_name,
      secondary_member.name as resolved_secondary_csm_name
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
      and (
        (p_client_id is not null and p_client_name is null and p_csm_name is null and client.id = p_client_id)
        or (
          p_client_id is null
          and length(btrim(p_client_name)) between 1 and 120
          and lower(btrim(p_client_name)) in (
            lower(btrim(client.client_name)),
            lower(btrim(coalesce(client.client_business, '')))
          )
          and (
            p_csm_name is null
            or (
              length(btrim(p_csm_name)) between 1 and 120
              and lower(btrim(p_csm_name)) in (
                lower(btrim(coalesce(primary_member.name, ''))),
                lower(btrim(coalesce(secondary_member.name, '')))
              )
            )
          )
        )
      )
  ), resolved as (
    select candidate.*, count(*) over () as match_count
    from authorized_candidates candidate
  )
  select
    client.id,
    left(client.client_name, 256),
    left(client.client_business, 256),
    left(client.program_status_value, 128),
    left(client.resolved_primary_csm_name, 256),
    left(client.resolved_secondary_csm_name, 256),
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
  from resolved client
  where client.match_count = 1;
$$;


revoke all on function public.beacon_list_clients(
  uuid, uuid, uuid, text, text, text, uuid, text, text, integer, text, integer
) from public, anon, authenticated;
revoke all on function public.beacon_get_client_brief(uuid, uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.beacon_list_clients(
  uuid, uuid, uuid, text, text, text, uuid, text, text, integer, text, integer
) to service_role;
grant execute on function public.beacon_get_client_brief(uuid, uuid, uuid, uuid, text, text)
  to service_role;

insert into public.security_rollout_history (version, migration_name, details)
values (
  '20260714019000',
  'beacon_natural_language_queries',
  jsonb_build_object(
    'client_resolution', 'exact_authorized_name_or_business_with_optional_csm',
    'next_contact_days_max', 365,
    'model_generated_queries', false
  )
)
on conflict (version) do update
set migration_name = excluded.migration_name,
    details = excluded.details,
    applied_at = now();

notify pgrst, 'reload schema';
