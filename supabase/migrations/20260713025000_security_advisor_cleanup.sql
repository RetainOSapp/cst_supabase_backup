-- Security advisor cleanup after Phase 1D.
-- Removes one anonymous aggregate path, scopes the remaining authenticated
-- retention RPC, pins mutable function search paths, and removes advisor-only
-- redundant policies/indexes without touching any mirror read policy.

do $$
begin
  if to_regclass('public.security_rollout_history') is null
    or not exists (
      select 1
      from public.security_rollout_history rollout
      where rollout.version = '20260713024000'
    ) then
    raise exception 'Phase 1D immediate cleanup must be applied first';
  end if;
end $$;

alter function public.set_updated_at()
  set search_path = pg_catalog;

alter function public.dashboard_kpi_counts_canonical(
  text, text, text, text[], text, timestamptz, timestamptz, timestamptz, timestamptz
)
  set search_path = pg_catalog, public;

alter function public.search_client_notes(
  text, text, text, text, text, text, text[], text, text, text, text, text,
  text, text, text, text, text, text, text, integer, integer
)
  set search_path = pg_catalog, public;

alter function public.dashboard_retention_counts_fast(
  text, text, text, text[], text, timestamptz, timestamptz, timestamptz,
  timestamptz, text
)
  rename to _dashboard_retention_counts_fast_unchecked;

revoke all on function public._dashboard_retention_counts_fast_unchecked(
  text, text, text, text[], text, timestamptz, timestamptz, timestamptz,
  timestamptz, text
)
  from public, anon, authenticated;
grant execute on function public._dashboard_retention_counts_fast_unchecked(
  text, text, text, text[], text, timestamptz, timestamptz, timestamptz,
  timestamptz, text
)
  to service_role;

create function public.dashboard_retention_counts_fast(
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
  from public._dashboard_retention_counts_fast_unchecked(
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

revoke all on function public.dashboard_retention_counts_fast(
  text, text, text, text[], text, timestamptz, timestamptz, timestamptz,
  timestamptz, text
)
  from public, anon;
grant execute on function public.dashboard_retention_counts_fast(
  text, text, text, text[], text, timestamptz, timestamptz, timestamptz,
  timestamptz, text
)
  to authenticated, service_role;

drop policy if exists "app_audit_events_no_anon_access" on public.app_audit_events;
drop policy if exists "client_call_attendance_events_no_anon_access" on public.client_call_attendance_events;
drop policy if exists "client_contracts_no_anon_access" on public.client_contracts;
drop policy if exists "client_history_events_no_anon_access" on public.client_history_events;
drop policy if exists "client_milestones_no_anon_access" on public.client_milestones;
drop policy if exists "client_tasks_no_anon_access" on public.client_tasks;
drop policy if exists "client_timed_checkpoint_no_anon_access" on public.client_timed_checkpoint_completions;
drop policy if exists "clients_no_anon_access" on public.clients;
drop policy if exists "companies_no_anon_access" on public.companies;
drop policy if exists "company_members_no_anon_access" on public.company_members;
drop policy if exists "integration_intake_events_no_anon_access" on public.integration_intake_events;
drop policy if exists "notification_preferences_no_anon_access" on public.notification_preferences;
drop policy if exists "notifications_no_anon_access" on public.notifications;

drop index if exists public.security_phase1a_backup_clients_primary_csm_idx;
drop index if exists public.security_phase1b_advocacy_company_client_legacy_idx;

insert into public.security_rollout_history (
  version,
  migration_name,
  details
)
values (
  '20260713025000',
  'security_advisor_cleanup',
  jsonb_build_object(
    'anonymous_retention_rpc_revoked', true,
    'retention_rpc_actor_scoped', true,
    'search_paths_pinned', 3,
    'redundant_false_policies_removed', 13,
    'duplicate_indexes_removed', 2,
    'backup_policies_changed', false
  )
)
on conflict (version) do nothing;

notify pgrst, 'reload schema';
