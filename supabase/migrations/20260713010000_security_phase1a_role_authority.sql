-- Security Phase 1A: role-aware read authority foundation.
-- Additive authority helpers and supporting indexes only. This migration does
-- not replace or drop any table policy.

create index if not exists security_phase1a_backup_team_actor_idx
  on public.backup_company_team ((lower(email)), company_id, glide_row_id)
  where email is not null
    and company_id is not null
    and coalesce(is_archived, false) = false;

create index if not exists security_phase1a_backup_clients_company_client_idx
  on public.backup_company_clients (company_id, glide_row_id);

create index if not exists security_phase1a_backup_clients_primary_csm_idx
  on public.backup_company_clients (company_id, csm_team_member_id);

create index if not exists security_phase1a_backup_clients_secondary_csm_idx
  on public.backup_company_clients (company_id, csm_secondary_assignee_id);

create or replace function public.is_retainos_super_admin_bound()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.retainos_super_admins admin
    where admin.status = 'active'
      and admin.auth_user_id is not null
      and admin.auth_user_id = (select auth.uid())
  );
$$;

create or replace function public.current_actor_app_scope()
returns table (
  scope_company_id uuid,
  scope_company_legacy_id text,
  scope_member_id uuid,
  scope_member_legacy_id text,
  scope_role text
)
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select
      (select auth.uid()) as auth_user_id,
      lower(coalesce((select auth.jwt() ->> 'email'), '')) as email
  ),
  matches as (
    select
      member.company_id as scope_company_id,
      company.legacy_glide_row_id as scope_company_legacy_id,
      member.id as scope_member_id,
      member.legacy_glide_row_id as scope_member_legacy_id,
      case
        when member.is_read_only then 'viewer'
        else member.role
      end as scope_role,
      count(*) over () as match_count
    from public.company_members member
    join public.companies company
      on company.id = member.company_id
    cross join actor
    where member.status = 'active'
      and company.status <> 'archived'
      and company.archived_at is null
      and company.legacy_glide_row_id is not null
      and company.migration_status in ('pilot', 'migrated')
      and (
        member.auth_user_id = actor.auth_user_id
        or (
          member.auth_user_id is null
          and actor.email <> ''
          and lower(member.email) = actor.email
        )
      )
  )
  select
    matches.scope_company_id,
    matches.scope_company_legacy_id,
    matches.scope_member_id,
    matches.scope_member_legacy_id,
    matches.scope_role
  from matches
  where matches.match_count = 1;
$$;

create or replace function public.current_actor_mirror_scope()
returns table (
  scope_company_legacy_id text,
  scope_member_legacy_id text,
  scope_role text
)
language sql
stable
security definer
set search_path = ''
as $$
  with app_scope as (
    select *
    from public.current_actor_app_scope()
    where scope_company_legacy_id is not null
  ),
  actor as (
    select lower(coalesce((select auth.jwt() ->> 'email'), '')) as email
  ),
  mirror_matches as (
    select
      member.company_id as scope_company_legacy_id,
      member.glide_row_id as scope_member_legacy_id,
      case
        when coalesce(member.role_read_only_user, false) then 'viewer'
        when member.role_id = 1 then 'director'
        when member.role_id = 2 then 'support'
        when member.role_id = 3 then 'csm'
        else 'viewer'
      end as scope_role,
      count(*) over () as match_count
    from public.backup_company_team member
    cross join actor
    where actor.email <> ''
      and lower(member.email) = actor.email
      and member.company_id is not null
      and coalesce(member.is_archived, false) = false
  )
  select
    app_scope.scope_company_legacy_id,
    app_scope.scope_member_legacy_id,
    app_scope.scope_role
  from app_scope

  union all

  select
    mirror_matches.scope_company_legacy_id,
    mirror_matches.scope_member_legacy_id,
    mirror_matches.scope_role
  from mirror_matches
  where mirror_matches.match_count = 1
    and not exists (select 1 from app_scope);
$$;

create or replace function public.can_read_app_company(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_retainos_super_admin_bound()
    or exists (
      select 1
      from public.current_actor_app_scope() scope
      where scope.scope_company_id = target_company_id
    );
$$;

create or replace function public.can_read_mirror_company(
  target_company_legacy_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_retainos_super_admin_bound()
    or exists (
      select 1
      from public.current_actor_mirror_scope() scope
      where scope.scope_company_legacy_id = target_company_legacy_id
    );
$$;

create or replace function public.can_read_app_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_retainos_super_admin_bound()
    or exists (
      select 1
      from public.clients client
      join public.current_actor_app_scope() scope
        on scope.scope_company_id = client.company_id
      where client.id = target_client_id
        and (
          scope.scope_role in ('director', 'support')
          or (
            scope.scope_role = 'csm'
            and (
              client.csm_team_member_id = scope.scope_member_id::text
              or client.csm_team_member_id = scope.scope_member_legacy_id
              or client.csm_secondary_assignee_id = scope.scope_member_id::text
              or client.csm_secondary_assignee_id = scope.scope_member_legacy_id
            )
          )
        )
    );
$$;

create or replace function public.can_read_app_client_legacy(
  target_company_id uuid,
  target_client_legacy_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_retainos_super_admin_bound()
    or exists (
      select 1
      from public.clients client
      where client.company_id = target_company_id
        and client.glide_row_id = target_client_legacy_id
        and public.can_read_app_client(client.id)
    );
$$;

create or replace function public.can_read_mirror_client(
  target_company_legacy_id text,
  target_client_legacy_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_retainos_super_admin_bound()
    or exists (
      select 1
      from public.backup_company_clients client
      join public.current_actor_mirror_scope() scope
        on scope.scope_company_legacy_id = client.company_id
      where client.company_id = target_company_legacy_id
        and client.glide_row_id = target_client_legacy_id
        and (
          scope.scope_role in ('director', 'support')
          or (
            scope.scope_role = 'csm'
            and scope.scope_member_legacy_id is not null
            and (
              client.csm_team_member_id = scope.scope_member_legacy_id
              or client.csm_secondary_assignee_id = scope.scope_member_legacy_id
            )
          )
        )
    );
$$;

create or replace function public.resolve_current_account()
returns table (
  account_role text,
  company_legacy_id text,
  team_member_id text,
  membership_source text
)
language sql
stable
security definer
set search_path = ''
as $$
  with super_admin as (
    select public.is_retainos_super_admin_bound() as allowed
  ),
  app_scope as (
    select * from public.current_actor_app_scope()
  ),
  mirror_scope as (
    select * from public.current_actor_mirror_scope()
  )
  select
    'super_admin'::text,
    null::text,
    null::text,
    'registry'::text
  from super_admin
  where super_admin.allowed

  union all

  select
    app_scope.scope_role,
    app_scope.scope_company_legacy_id,
    coalesce(app_scope.scope_member_legacy_id, app_scope.scope_member_id::text),
    'app'::text
  from app_scope
  where not (select allowed from super_admin)

  union all

  select
    mirror_scope.scope_role,
    mirror_scope.scope_company_legacy_id,
    mirror_scope.scope_member_legacy_id,
    'mirror'::text
  from mirror_scope
  where not (select allowed from super_admin)
    and not exists (select 1 from app_scope);
$$;

revoke all on function public.is_retainos_super_admin_bound()
  from public, anon;
revoke all on function public.current_actor_app_scope()
  from public, anon, authenticated;
revoke all on function public.current_actor_mirror_scope()
  from public, anon, authenticated;
revoke all on function public.can_read_app_company(uuid)
  from public, anon;
revoke all on function public.can_read_mirror_company(text)
  from public, anon;
revoke all on function public.can_read_app_client(uuid)
  from public, anon;
revoke all on function public.can_read_app_client_legacy(uuid, text)
  from public, anon;
revoke all on function public.can_read_mirror_client(text, text)
  from public, anon;
revoke all on function public.resolve_current_account()
  from public, anon;

grant execute on function public.is_retainos_super_admin_bound()
  to authenticated, service_role;
grant execute on function public.can_read_app_company(uuid)
  to authenticated, service_role;
grant execute on function public.can_read_mirror_company(text)
  to authenticated, service_role;
grant execute on function public.can_read_app_client(uuid)
  to authenticated, service_role;
grant execute on function public.can_read_app_client_legacy(uuid, text)
  to authenticated, service_role;
grant execute on function public.can_read_mirror_client(text, text)
  to authenticated, service_role;
grant execute on function public.resolve_current_account()
  to authenticated, service_role;

insert into public.security_rollout_history (
  version,
  migration_name,
  details
)
values (
  '20260713010000',
  'security_phase1a_role_authority',
  jsonb_build_object(
    'scope', 'additive_role_authority_helpers',
    'policy_changes', false
  )
)
on conflict (version) do nothing;

notify pgrst, 'reload schema';
