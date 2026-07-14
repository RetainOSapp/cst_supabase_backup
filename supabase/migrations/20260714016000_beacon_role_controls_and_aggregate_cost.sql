-- Company-specific Beacon role controls and aggregate micro-cost metering.

alter table public.company_ai_feature_entitlements
  add column if not exists allowed_roles text[] not null
    default array['director', 'support', 'csm']::text[];

alter table public.company_ai_feature_entitlements
  drop constraint if exists company_ai_feature_entitlements_allowed_roles_check;
alter table public.company_ai_feature_entitlements
  add constraint company_ai_feature_entitlements_allowed_roles_check
  check (
    allowed_roles <@ array['director', 'support', 'csm']::text[]
    and cardinality(allowed_roles) <= 3
  );

comment on column public.company_ai_feature_entitlements.allowed_roles is
  'Company-specific non-SuperAdmin role gate. SuperAdmin is implicit; Viewer is always denied.';

create or replace function public.beacon_role_access_allowed(
  p_company_id uuid,
  p_feature_key text,
  p_actor_role text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_actor_role = 'super_admin' then true
    when p_actor_role = 'viewer' then false
    when p_actor_role not in ('director', 'support', 'csm') then false
    else coalesce((
      select p_actor_role = any(entitlement.allowed_roles)
      from public.company_ai_feature_entitlements entitlement
      where entitlement.company_id = p_company_id
        and entitlement.feature_key = p_feature_key
    ), false)
  end;
$$;

create or replace function public.beacon_admin_get_ai_feature_access(
  p_company_id uuid,
  p_actor_auth_user_id uuid,
  p_feature_key text
)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_roles text[];
begin
  if not exists (
    select 1
    from public.retainos_super_admins admin
    where admin.auth_user_id = p_actor_auth_user_id
      and admin.status = 'active'
  ) then
    raise exception using errcode = '42501',
      message = 'A bound active RetainOS SuperAdmin is required';
  end if;

  if p_feature_key <> 'beacon' then
    return array[]::text[];
  end if;

  select entitlement.allowed_roles
  into v_roles
  from public.company_ai_feature_entitlements entitlement
  where entitlement.company_id = p_company_id
    and entitlement.feature_key = p_feature_key;

  return coalesce(v_roles, array['director', 'support', 'csm']::text[]);
end;
$$;

create or replace function public.beacon_admin_update_ai_feature_access(
  p_company_id uuid,
  p_actor_auth_user_id uuid,
  p_feature_key text,
  p_allowed_roles text[]
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before text[];
  v_after text[];
begin
  if not exists (
    select 1
    from public.retainos_super_admins admin
    where admin.auth_user_id = p_actor_auth_user_id
      and admin.status = 'active'
  ) then
    raise exception using errcode = '42501',
      message = 'A bound active RetainOS SuperAdmin is required';
  end if;

  if not exists (
    select 1
    from public.companies company
    where company.id = p_company_id
      and company.archived_at is null
      and company.status <> 'archived'
      and company.migration_status in ('pilot', 'migrated')
  ) or p_feature_key <> 'beacon' then
    raise exception using errcode = '42501',
      message = 'Company or feature is not an AI-feature target';
  end if;

  if p_allowed_roles is null
    or not (p_allowed_roles <@ array['director', 'support', 'csm']::text[])
    or cardinality(p_allowed_roles) > 3
    or cardinality(p_allowed_roles) <> (
      select count(distinct role_name)::integer
      from unnest(p_allowed_roles) role_name
    ) then
    raise exception using errcode = '22023',
      message = 'Beacon role access is invalid';
  end if;

  select entitlement.allowed_roles
  into v_before
  from public.company_ai_feature_entitlements entitlement
  where entitlement.company_id = p_company_id
    and entitlement.feature_key = p_feature_key
  for update;

  insert into public.company_ai_feature_entitlements (
    company_id, feature_key, status, allowed_roles,
    enabled_by_auth_user_id, config_version
  ) values (
    p_company_id, p_feature_key, 'disabled', p_allowed_roles,
    p_actor_auth_user_id, 1
  )
  on conflict on constraint company_ai_feature_entitlements_pkey do update
  set allowed_roles = excluded.allowed_roles,
      enabled_by_auth_user_id = excluded.enabled_by_auth_user_id,
      config_version = public.company_ai_feature_entitlements.config_version + 1,
      updated_at = now()
  returning allowed_roles into v_after;

  insert into public.app_audit_events (
    company_id, actor_auth_user_id, event_type, source, entity_table,
    entity_id, title, summary, before_data, after_data, metadata
  ) values (
    p_company_id, p_actor_auth_user_id, 'ai_feature_access_updated',
    'beacon_admin_update_ai_feature_access',
    'company_ai_feature_entitlements', p_company_id,
    'AI feature role access updated', 'Beacon role access updated',
    jsonb_build_object('allowed_roles', coalesce(v_before, array[]::text[])),
    jsonb_build_object('allowed_roles', v_after),
    jsonb_build_object('feature_key', p_feature_key)
  );

  return v_after;
end;
$$;

-- Replace only the two exact accounting expressions in the installed snapshot
-- function. Commercial cents are now rounded once over aggregate micros, never
-- once per request.
do $$
declare
  v_definition text;
  v_old_consumed constant text := 'select sum(event.actual_meter_value)';
  v_new_consumed constant text :=
    'select (coalesce(sum(event.actual_cost_micros), 0) + 9999) / 10000';
  v_old_reserved constant text := 'select sum(reservation.reserved_meter_value)';
  v_new_reserved constant text :=
    'select (coalesce(sum(reservation.reserved_cost_micros), 0) + 9999) / 10000';
begin
  select pg_get_functiondef(
    'public.beacon_allowance_usage_snapshot(uuid,timestamptz)'::regprocedure
  ) into strict v_definition;
  if position(v_old_consumed in v_definition) = 0
    or position(v_old_reserved in v_definition) = 0 then
    raise exception 'Expected Beacon allowance snapshot expressions were not found';
  end if;
  execute replace(
    replace(v_definition, v_old_consumed, v_new_consumed),
    v_old_reserved, v_new_reserved
  );
end;
$$;

-- Add the company role gate after canonical actor-role revalidation in the
-- atomic reservation function. Direct chat calls cannot bypass this check.
do $$
declare
  v_definition text;
  v_anchor constant text := $anchor$
  if v_actor_role = 'csm' then$anchor$;
  v_replacement constant text := $replacement$
  if not public.beacon_role_access_allowed(
    p_company_id,
    p_feature_key,
    v_actor_role
  ) then
    return query select false, null::uuid, 'role_not_allowed'::text, null::integer;
    return;
  end if;

  if v_actor_role = 'csm' then$replacement$;
begin
  select pg_get_functiondef(
    'public.beacon_reserve_usage(uuid,text,uuid,uuid,uuid,text,bigint,integer,text)'::regprocedure
  ) into strict v_definition;
  if position(v_anchor in v_definition) = 0 then
    raise exception 'Expected Beacon reservation role anchor was not found';
  end if;
  execute replace(v_definition, v_anchor, v_replacement);
end;
$$;

revoke all on function public.beacon_role_access_allowed(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.beacon_admin_get_ai_feature_access(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.beacon_admin_update_ai_feature_access(uuid, uuid, text, text[])
  from public, anon, authenticated;
grant execute on function public.beacon_role_access_allowed(uuid, text, text)
  to service_role;
grant execute on function public.beacon_admin_get_ai_feature_access(uuid, uuid, text)
  to service_role;
grant execute on function public.beacon_admin_update_ai_feature_access(uuid, uuid, text, text[])
  to service_role;

notify pgrst, 'reload schema';
