-- Additive Beacon overloads for bounded natural-name resolution and combined
-- health/contact queries. Historical Phase A signatures remain untouched.

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
  p_risk_states text[],
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
      p_company_id, p_actor_auth_user_id, p_actor_member_id
    ) actor
  ), eligible_assignees as (
    select distinct member.id, member.legacy_glide_row_id, member.name
    from scope
    join public.clients assigned_client
      on assigned_client.company_id = p_company_id
     and assigned_client.archived_at is null
    join public.beacon_authorized_client_ids(
      p_company_id, p_actor_auth_user_id, p_actor_member_id
    ) authorized_client on authorized_client.client_id = assigned_client.id
    join public.company_members member
      on member.company_id = assigned_client.company_id
     and member.legacy_glide_row_id in (
       nullif(btrim(assigned_client.csm_team_member_id), ''),
       nullif(btrim(assigned_client.csm_secondary_assignee_id), '')
     )
    where member.status = 'active'
      and member.archived_at is null
      and (scope.actor_role <> 'csm' or member.id = scope.actor_member_id)
  ), csm_name_matches as (
    select member.id, member.legacy_glide_row_id, count(*) over () as match_count
    from eligible_assignees member
    where p_csm_name is not null
      and length(btrim(p_csm_name)) between 1 and 120
      and position(lower(btrim(p_csm_name)) in lower(btrim(member.name))) > 0
  ), target_csm as (
    select member.id, member.legacy_glide_row_id
    from eligible_assignees member
    where p_csm_member_id is not null
      and p_csm_name is null
      and member.id = p_csm_member_id
    union all
    select matched.id, matched.legacy_glide_row_id
    from csm_name_matches matched
    where p_csm_member_id is null and matched.match_count = 1
  ), candidates as (
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
      p_company_id, p_actor_auth_user_id, p_actor_member_id
    ) authorized_client on authorized_client.client_id = client.id
    left join public.company_members primary_member
      on primary_member.company_id = client.company_id
     and primary_member.legacy_glide_row_id = nullif(btrim(client.csm_team_member_id), '')
    left join public.company_members secondary_member
      on secondary_member.company_id = client.company_id
     and secondary_member.legacy_glide_row_id = nullif(btrim(client.csm_secondary_assignee_id), '')
    where client.company_id = p_company_id and client.archived_at is null
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
    case when candidate.glide_row_id ~ '^[A-Za-z0-9_-]{1,128}$'
      then '/clients/' || candidate.glide_row_id else null end
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
          when 'buy_in' then candidate.buy_in_status end, '')) = p_health_state
      )
    )
    and (
      p_risk_states is null
      or (
        p_health_dimension is null and p_health_state is null
        and cardinality(p_risk_states) between 1 and 2
        and p_risk_states <@ array['red', 'yellow']::text[]
        and (
          lower(coalesce(candidate.success_status, '')) = any(p_risk_states)
          or lower(coalesce(candidate.progress_status, '')) = any(p_risk_states)
          or lower(coalesce(candidate.buy_in_status, '')) = any(p_risk_states)
        )
      )
    )
    and (
      (p_csm_member_id is null and p_csm_name is null)
      or exists (
        select 1 from target_csm member
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
          or position(lower(btrim(p_name_fragment)) in lower(coalesce(candidate.client_business, ''))) > 0
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
    lower(candidate.client_name), candidate.id
  limit p_limit;
$$;

create or replace function public.beacon_get_client_brief(
  p_company_id uuid,
  p_actor_auth_user_id uuid,
  p_actor_member_id uuid,
  p_client_id uuid,
  p_client_name text,
  p_program_status text,
  p_csm_name text
)
returns table (
  client_id uuid, client_name text, business_name text, program_status text,
  primary_csm_name text, secondary_csm_name text, north_star text,
  success_status text, progress_status text, buy_in_status text,
  last_contact_at timestamptz, next_contact_at timestamptz,
  contract_start_date timestamptz, contract_end_date timestamptz,
  contract_monthly_value numeric, contract_status text, next_steps text,
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
      p_company_id, p_actor_auth_user_id, p_actor_member_id
    ) actor
  ), eligible_assignees as (
    select distinct member.id, member.legacy_glide_row_id, member.name
    from scope
    join public.clients assigned_client
      on assigned_client.company_id = p_company_id
     and assigned_client.archived_at is null
    join public.beacon_authorized_client_ids(
      p_company_id, p_actor_auth_user_id, p_actor_member_id
    ) authorized_client on authorized_client.client_id = assigned_client.id
    join public.company_members member
      on member.company_id = assigned_client.company_id
     and member.legacy_glide_row_id in (
       nullif(btrim(assigned_client.csm_team_member_id), ''),
       nullif(btrim(assigned_client.csm_secondary_assignee_id), '')
     )
    where member.status = 'active'
      and member.archived_at is null
      and (scope.actor_role <> 'csm' or member.id = scope.actor_member_id)
  ), csm_name_matches as (
    select member.id, member.legacy_glide_row_id, count(*) over () as match_count
    from eligible_assignees member
    where p_csm_name is not null
      and length(btrim(p_csm_name)) between 1 and 120
      and position(lower(btrim(p_csm_name)) in lower(btrim(member.name))) > 0
  ), resolved_csm as (
    select matched.legacy_glide_row_id
    from csm_name_matches matched where matched.match_count = 1
  ), candidates as (
    select client.id, count(*) over () as match_count
    from public.clients client
    join public.beacon_authorized_client_ids(
      p_company_id, p_actor_auth_user_id, p_actor_member_id
    ) authorized_client on authorized_client.client_id = client.id
    where client.company_id = p_company_id
      and client.archived_at is null
      and (
        (p_client_id is not null and p_client_name is null
          and p_program_status is null and p_csm_name is null and client.id = p_client_id)
        or (
          p_client_id is null
          and length(btrim(p_client_name)) between 1 and 120
          and (
            position(lower(btrim(p_client_name)) in lower(client.client_name)) > 0
            or position(lower(btrim(p_client_name)) in lower(coalesce(client.client_business, ''))) > 0
          )
          and (p_program_status is null or (
            p_program_status in ('front-end', 'back-end', 'paused', 'suspended', 'off-boarded')
            and client.program_status_value = p_program_status
          ))
          and (
            p_csm_name is null
            or exists (
              select 1 from resolved_csm member
              where member.legacy_glide_row_id in (
                nullif(btrim(client.csm_team_member_id), ''),
                nullif(btrim(client.csm_secondary_assignee_id), '')
              )
            )
          )
        )
      )
  ), resolved as (
    select candidate.id from candidates candidate where candidate.match_count = 1
  )
  select brief.*
  from resolved
  cross join lateral public.beacon_get_client_brief(
    p_company_id, p_actor_auth_user_id, p_actor_member_id, resolved.id
  ) brief;
$$;


revoke all on function public.beacon_list_clients(
  uuid, uuid, uuid, text, text, text, uuid, text, text, integer, text[], text, integer
) from public, anon, authenticated;
grant execute on function public.beacon_list_clients(
  uuid, uuid, uuid, text, text, text, uuid, text, text, integer, text[], text, integer
) to service_role;

revoke all on function public.beacon_get_client_brief(
  uuid, uuid, uuid, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.beacon_get_client_brief(
  uuid, uuid, uuid, uuid, text, text, text
) to service_role;

insert into public.security_rollout_history (version, migration_name, details)
values ('20260714023000', 'beacon_authorized_assignee_role_correction', jsonb_build_object(
  'authorization_first', true,
  'assignee_role_agnostic', true,
  'csm_actor_self_restricted', true,
  'rollback', '20260714023000_beacon_authorized_assignee_role_correction.sql'
));
notify pgrst, 'reload schema';
