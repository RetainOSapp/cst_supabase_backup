-- Security Phase 0 hardening.
-- Local/staged first: review and apply deliberately before production deploy.
-- Goals:
-- 1. Remove anonymous API access to sensitive SECURITY DEFINER helpers.
-- 2. Close unauthenticated DML/reads on RLS-disabled tables from the audit.
-- 3. Require tenant membership for app-owned client-link and advocacy reads.
-- Requires 20260705090000_security_identity_bootstrap.sql and a seeded
-- retainos_super_admins registry before production apply.

do $$
begin
  if to_regclass('public.security_rollout_history') is null then
    raise exception 'Security identity bootstrap has not been applied';
  end if;

  if not exists (
    select 1
    from public.security_rollout_history rollout
    where rollout.version = '20260705090000'
  ) then
    raise exception 'Security identity bootstrap history record is missing';
  end if;

  if not exists (
    select 1
    from public.retainos_super_admins admin
    where admin.status = 'active'
  ) then
    raise exception 'SuperAdmin registry must be seeded before Phase 0';
  end if;
end $$;

do $$
declare
  fn record;
  fn_identity text;
begin
  for fn in
    select
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'exec_sql',
        '_set_chain_secret',
        '_glide_chain_tick'
      )
  loop
    fn_identity := format('%I.%I(%s)', fn.nspname, fn.proname, fn.args);
    execute format('revoke all on function %s from public, anon, authenticated', fn_identity);
    execute format('grant execute on function %s to service_role', fn_identity);
    execute format('alter function %s set search_path to %L', fn_identity, '');
  end loop;

  for fn in
    select
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'seed_default_notification_preferences'
      )
  loop
    fn_identity := format('%I.%I(%s)', fn.nspname, fn.proname, fn.args);
    execute format(
      'revoke all on function %s from public, anon, authenticated',
      fn_identity
    );
    execute format('grant execute on function %s to service_role', fn_identity);
    execute format('alter function %s set search_path to %L', fn_identity, '');
  end loop;
end $$;

-- Keep notification generation available to legitimate app users without
-- exposing the original SECURITY DEFINER implementation for arbitrary company
-- ids. The unchecked implementation is callable only by the wrapper owner and
-- service_role.
do $$
begin
  if to_regprocedure(
    'public._generate_company_notifications_unchecked(uuid,date,date)'
  ) is null then
    if to_regprocedure(
      'public.generate_company_notifications(uuid,date,date)'
    ) is null then
      raise exception 'generate_company_notifications(uuid,date,date) is missing';
    end if;

    execute 'alter function public.generate_company_notifications(uuid, date, date) rename to _generate_company_notifications_unchecked';
  end if;
end $$;

alter function public._generate_company_notifications_unchecked(uuid, date, date)
  set search_path = '';
revoke all on function
  public._generate_company_notifications_unchecked(uuid, date, date)
  from public, anon, authenticated;
grant execute on function
  public._generate_company_notifications_unchecked(uuid, date, date)
  to service_role;

create or replace function public.generate_company_notifications(
  p_company_id uuid,
  p_window_start date default (current_date - 30),
  p_window_end date default (current_date + 8)
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role'
    and not public.can_read_company(p_company_id) then
    raise exception 'Not authorized for this company'
      using errcode = '42501';
  end if;

  return public._generate_company_notifications_unchecked(
    p_company_id,
    p_window_start,
    p_window_end
  );
end;
$$;

revoke all on function public.generate_company_notifications(uuid, date, date)
  from public, anon;
grant execute on function public.generate_company_notifications(uuid, date, date)
  to authenticated, service_role;

-- Replace the uncaptured live helper with a reviewed implementation. The
-- SuperAdmin sync UI keeps its fast estimate, while ordinary authenticated
-- users cannot probe arbitrary relation names or row counts.
drop function if exists public.get_table_row_estimate(text);

create function public.get_table_row_estimate(p_table text)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  row_estimate bigint;
begin
  if coalesce((select auth.role()), '') <> 'service_role'
    and not public.is_retainos_super_admin() then
    raise exception 'Only SuperAdmins can inspect sync-table estimates'
      using errcode = '42501';
  end if;

  if p_table !~ '^backup_[a-z0-9_]+$'
    or not exists (
      select 1
      from public.sync_table_list sync_table
      where sync_table.backup_table_name = p_table
    ) then
    raise exception 'Unknown backup table'
      using errcode = '22023';
  end if;

  select greatest(coalesce(relation.reltuples, 0), 0)::bigint
  into row_estimate
  from pg_catalog.pg_class relation
  join pg_catalog.pg_namespace namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = p_table
    and relation.relkind in ('r', 'p');

  return coalesce(row_estimate, 0);
end;
$$;

revoke all on function public.get_table_row_estimate(text)
  from public, anon;
grant execute on function public.get_table_row_estimate(text)
  to authenticated, service_role;

do $$
declare
  table_name text;
  table_identity text;
begin
  foreach table_name in array array[
    'client_links',
    'client_advocacy_events',
    'glide_companies',
    'glide_rows'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;

    table_identity := format('public.%I', table_name);
    execute format('alter table %s enable row level security', table_identity);
    execute format(
      'revoke all on table %s from public, anon, authenticated',
      table_identity
    );
    execute format(
      'grant all privileges on table %s to service_role',
      table_identity
    );

    if table_name in ('client_links', 'client_advocacy_events') then
      execute format('grant select on table %s to authenticated', table_identity);
    end if;
  end loop;
end $$;

do $$
begin
  if to_regclass('public.client_links') is not null then
    drop policy if exists "client_links_authenticated_read" on public.client_links;
    create policy "client_links_authenticated_read"
    on public.client_links
    for select
    to authenticated
    using (public.can_read_company(company_id));
  end if;

  if to_regclass('public.client_advocacy_events') is not null then
    drop policy if exists "client_advocacy_events_authenticated_read" on public.client_advocacy_events;
    create policy "client_advocacy_events_authenticated_read"
    on public.client_advocacy_events
    for select
    to authenticated
    using (public.can_read_company(company_id));
  end if;

  if to_regclass('public.notifications') is not null then
    drop policy if exists "notifications_authenticated_read"
      on public.notifications;
    create policy "notifications_authenticated_read"
    on public.notifications
    for select
    to authenticated
    using (public.can_read_company(company_id));
  end if;

  if to_regclass('public.notification_preferences') is not null then
    drop policy if exists "notification_preferences_authenticated_read"
      on public.notification_preferences;
    create policy "notification_preferences_authenticated_read"
    on public.notification_preferences
    for select
    to authenticated
    using (public.can_read_company(company_id));
  end if;
end $$;

insert into public.security_rollout_history (
  version,
  migration_name,
  details
)
values (
  '20260705100000',
  'security_phase0_hardening',
  jsonb_build_object(
    'scope',
    'public_exposure_and_privileged_rpc_hardening'
  )
)
on conflict (version) do nothing;

notify pgrst, 'reload schema';
