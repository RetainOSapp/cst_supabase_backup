-- Security identity bootstrap.
-- Additive only: creates the server-side SuperAdmin registry and membership
-- helpers before Phase 0 changes any existing grants or policies.

create table if not exists public.retainos_super_admins (
  email text primary key
    check (email = lower(btrim(email))),
  auth_user_id uuid unique,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists retainos_super_admins_set_updated_at
  on public.retainos_super_admins;
create trigger retainos_super_admins_set_updated_at
before update on public.retainos_super_admins
for each row execute function public.set_updated_at();

alter table public.retainos_super_admins enable row level security;

drop policy if exists retainos_super_admins_no_client_access
  on public.retainos_super_admins;
create policy retainos_super_admins_no_client_access
on public.retainos_super_admins
for all
using (false)
with check (false);

revoke all on table public.retainos_super_admins
  from public, anon, authenticated;
grant select, insert, update, delete on table public.retainos_super_admins
  to service_role;

create table if not exists public.security_rollout_history (
  version text primary key
    check (version ~ '^[0-9]{14}$'),
  migration_name text not null,
  applied_at timestamptz not null default now(),
  applied_by text not null default current_user,
  details jsonb not null default '{}'::jsonb
);

alter table public.security_rollout_history enable row level security;

drop policy if exists security_rollout_history_no_client_access
  on public.security_rollout_history;
create policy security_rollout_history_no_client_access
on public.security_rollout_history
for all
using (false)
with check (false);

revoke all on table public.security_rollout_history
  from public, anon, authenticated;
grant select, insert, update, delete on table public.security_rollout_history
  to service_role;

insert into public.security_rollout_history (
  version,
  migration_name,
  details
)
values (
  '20260705090000',
  'security_identity_bootstrap',
  jsonb_build_object('scope', 'additive_identity_bootstrap')
)
on conflict (version) do nothing;

create index if not exists company_members_auth_user_id_idx
  on public.company_members (auth_user_id)
  where status = 'active';

create index if not exists company_members_email_status_idx
  on public.company_members (lower(email), status);

create or replace function public.is_retainos_super_admin()
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
      and (
        (admin.auth_user_id is not null
          and admin.auth_user_id = (select auth.uid()))
        or admin.email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      )
  );
$$;

create or replace function public.current_member_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct member.company_id
  from public.company_members member
  where member.status = 'active'
    and (
      (member.auth_user_id is not null
        and member.auth_user_id = (select auth.uid()))
      or lower(member.email) = lower(
        coalesce((select auth.jwt() ->> 'email'), '')
      )
    );
$$;

create or replace function public.can_read_company(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_retainos_super_admin()
    or exists (
      select 1
      from public.current_member_company_ids() member_company(company_id)
      where member_company.company_id = target_company_id
    );
$$;

create or replace function public.can_read_company_legacy(
  target_company_legacy_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_retainos_super_admin()
    or exists (
      select 1
      from public.companies company
      where company.legacy_glide_row_id = target_company_legacy_id
        and public.can_read_company(company.id)
    );
$$;

revoke all on function public.is_retainos_super_admin()
  from public, anon;
revoke all on function public.current_member_company_ids()
  from public, anon;
revoke all on function public.can_read_company(uuid)
  from public, anon;
revoke all on function public.can_read_company_legacy(text)
  from public, anon;

grant execute on function public.is_retainos_super_admin()
  to authenticated, service_role;
grant execute on function public.current_member_company_ids()
  to authenticated, service_role;
grant execute on function public.can_read_company(uuid)
  to authenticated, service_role;
grant execute on function public.can_read_company_legacy(text)
  to authenticated, service_role;

notify pgrst, 'reload schema';
