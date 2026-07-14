-- Additive semantic overloads for active-client and primary-vs-any CSM queries.

create or replace function public.beacon_list_clients(
  p_company_id uuid, p_actor_auth_user_id uuid, p_actor_member_id uuid,
  p_program_status text, p_active_only boolean,
  p_health_dimension text, p_health_state text,
  p_csm_member_id uuid, p_csm_name text, p_csm_assignment text,
  p_name_fragment text, p_next_contact_days integer, p_risk_states text[],
  p_sort text, p_limit integer
)
returns table (
  client_id uuid, client_name text, business_name text, program_status text,
  primary_csm_name text, secondary_csm_name text, success_status text,
  progress_status text, buy_in_status text, last_contact_at timestamptz,
  next_contact_at timestamptz, contract_end_date timestamptz, internal_path text
)
language sql stable security definer set search_path = ''
as $$
  with source_rows as (
    select result.*
    from public.beacon_list_clients(
      p_company_id, p_actor_auth_user_id, p_actor_member_id,
      p_program_status, p_health_dimension, p_health_state,
      p_csm_member_id, p_csm_name, p_name_fragment, p_next_contact_days,
      p_risk_states, p_sort, 50
    ) result
    where not p_active_only and p_program_status is null

    union all

    select result.*
    from public.beacon_list_clients(
      p_company_id, p_actor_auth_user_id, p_actor_member_id,
      p_program_status, p_health_dimension, p_health_state,
      p_csm_member_id, p_csm_name, p_name_fragment, p_next_contact_days,
      p_risk_states, p_sort, 50
    ) result
    where not p_active_only and p_program_status is not null

    union all

    select result.*
    from unnest(array['front-end', 'back-end']::text[]) active_status
    cross join lateral public.beacon_list_clients(
      p_company_id, p_actor_auth_user_id, p_actor_member_id,
      active_status, p_health_dimension, p_health_state,
      p_csm_member_id, p_csm_name, p_name_fragment, p_next_contact_days,
      p_risk_states, p_sort, 50
    ) result
    where p_active_only and p_program_status is null
  )
  select source_rows.*
  from source_rows
  where p_limit between 1 and 50
    and p_active_only is not null
    and not (p_active_only and p_program_status is not null)
    and (p_csm_assignment is null or p_csm_assignment in ('primary', 'any'))
    and (
      p_csm_assignment is distinct from 'primary'
      or (
        p_csm_name is not null
        and position(lower(btrim(p_csm_name)) in lower(btrim(coalesce(source_rows.primary_csm_name, '')))) > 0
      )
    )
  order by
    case when p_sort = 'name_asc' then lower(source_rows.client_name) end asc nulls last,
    case when p_sort = 'renewal_asc' then source_rows.contract_end_date end asc nulls last,
    case when p_sort = 'last_contact_asc' then source_rows.last_contact_at end asc nulls last,
    case when p_sort = 'health_risk_first' then least(
      case lower(coalesce(source_rows.success_status, '')) when 'red' then 0 when 'yellow' then 1 when 'green' then 2 else 3 end,
      case lower(coalesce(source_rows.progress_status, '')) when 'red' then 0 when 'yellow' then 1 when 'green' then 2 else 3 end,
      case lower(coalesce(source_rows.buy_in_status, '')) when 'red' then 0 when 'yellow' then 1 when 'green' then 2 else 3 end
    ) end asc nulls last,
    lower(source_rows.client_name), source_rows.client_id
  limit p_limit;
$$;

create or replace function public.beacon_get_client_brief(
  p_company_id uuid, p_actor_auth_user_id uuid, p_actor_member_id uuid,
  p_client_id uuid, p_client_name text, p_program_status text,
  p_csm_name text, p_csm_assignment text
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
language sql stable security definer set search_path = ''
as $$
  with natural_candidates as (
    select candidate.client_id, count(*) over () as match_count
    from public.beacon_list_clients(
      p_company_id, p_actor_auth_user_id, p_actor_member_id,
      p_program_status, false,
      null, null, null, p_csm_name, p_csm_assignment,
      p_client_name, null, null, 'name_asc', 2
    ) candidate
    where p_client_id is null
      and length(btrim(p_client_name)) between 1 and 120
  ), resolved as (
    select p_client_id as client_id
    where p_client_id is not null and p_client_name is null
      and p_program_status is null and p_csm_name is null and p_csm_assignment is null
    union all
    select candidate.client_id from natural_candidates candidate
    where candidate.match_count = 1
  )
  select brief.*
  from resolved
  cross join lateral public.beacon_get_client_brief(
    p_company_id, p_actor_auth_user_id, p_actor_member_id, resolved.client_id
  ) brief;
$$;

revoke all on function public.beacon_list_clients(
  uuid, uuid, uuid, text, boolean, text, text, uuid, text, text,
  text, integer, text[], text, integer
) from public, anon, authenticated;
grant execute on function public.beacon_list_clients(
  uuid, uuid, uuid, text, boolean, text, text, uuid, text, text,
  text, integer, text[], text, integer
) to service_role;

revoke all on function public.beacon_get_client_brief(
  uuid, uuid, uuid, uuid, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.beacon_get_client_brief(
  uuid, uuid, uuid, uuid, text, text, text, text
) to service_role;

insert into public.security_rollout_history (version, migration_name, details)
values ('20260714022000', 'beacon_active_assignment_semantics', jsonb_build_object(
  'active_only_statuses', array['front-end', 'back-end'],
  'csm_assignment_modes', array['primary', 'any'],
  'service_only', true, 'max_rows', 50,
  'rollback', '20260714022000_beacon_active_assignment_semantics.sql'
));

notify pgrst, 'reload schema';
