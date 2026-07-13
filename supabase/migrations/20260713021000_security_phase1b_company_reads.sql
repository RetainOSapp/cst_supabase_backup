-- Security Phase 1B: app-owned company/configuration read policies.
-- Client and client-child policies are applied in the next reversible slice.

do $$
begin
  if to_regclass('public.security_rollout_history') is null
    or not exists (
      select 1
      from public.security_rollout_history rollout
      where rollout.version = '20260713020000'
    )
    or not exists (
      select 1
      from public.security_rollout_history rollout
      where rollout.version = '20260713020500'
    ) then
    raise exception 'Phase 1B aggregate authority and frontend release gate must be applied first';
  end if;
end $$;

create or replace function public.current_actor_app_policy_company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select scope.scope_company_id
  from public.current_actor_app_scope() scope;
$$;

create or replace function public.current_actor_app_policy_company_legacy_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select scope.scope_company_legacy_id
  from public.current_actor_app_scope() scope;
$$;

create or replace function public.current_actor_app_policy_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select scope.scope_role
  from public.current_actor_app_scope() scope;
$$;

create or replace function public.current_actor_app_policy_member_ids()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    array_remove(
      array[
        scope.scope_member_id::text,
        scope.scope_member_legacy_id
      ],
      null
    ),
    array[]::text[]
  )
  from public.current_actor_app_scope() scope;
$$;

create or replace function public.current_actor_effective_policy_company_legacy_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select scope.scope_company_legacy_id
  from public.current_actor_mirror_scope() scope;
$$;

create or replace function public.current_actor_effective_policy_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select scope.scope_role
  from public.current_actor_mirror_scope() scope;
$$;

revoke all on function public.current_actor_app_policy_company_id()
  from public, anon;
revoke all on function public.current_actor_app_policy_company_legacy_id()
  from public, anon;
revoke all on function public.current_actor_app_policy_role()
  from public, anon;
revoke all on function public.current_actor_app_policy_member_ids()
  from public, anon;
revoke all on function public.current_actor_effective_policy_company_legacy_id()
  from public, anon;
revoke all on function public.current_actor_effective_policy_role()
  from public, anon;

grant execute on function public.current_actor_app_policy_company_id()
  to authenticated, service_role;
grant execute on function public.current_actor_app_policy_company_legacy_id()
  to authenticated, service_role;
grant execute on function public.current_actor_app_policy_role()
  to authenticated, service_role;
grant execute on function public.current_actor_app_policy_member_ids()
  to authenticated, service_role;
grant execute on function public.current_actor_effective_policy_company_legacy_id()
  to authenticated, service_role;
grant execute on function public.current_actor_effective_policy_role()
  to authenticated, service_role;

drop policy if exists "companies_tenant_read" on public.companies;
drop policy if exists "companies_authenticated_read" on public.companies;
create policy "companies_authenticated_read"
on public.companies
for select
to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or id = (select public.current_actor_app_policy_company_id())
);

drop policy if exists "company_members_tenant_read" on public.company_members;
drop policy if exists "company_members_authenticated_read" on public.company_members;
create policy "company_members_authenticated_read"
on public.company_members
for select
to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or company_id = (select public.current_actor_app_policy_company_id())
);

drop policy if exists "company_offers_tenant_read" on public.company_offers;
drop policy if exists "company_offers_authenticated_read" on public.company_offers;
create policy "company_offers_authenticated_read"
on public.company_offers
for select
to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or company_id = (select public.current_actor_app_policy_company_id())
);

drop policy if exists "company_offer_milestones_tenant_read"
  on public.company_offer_milestones;
drop policy if exists "company_offer_milestones_authenticated_read"
  on public.company_offer_milestones;
create policy "company_offer_milestones_authenticated_read"
on public.company_offer_milestones
for select
to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or company_id = (select public.current_actor_app_policy_company_id())
);

drop policy if exists "company_settings_tenant_read" on public.company_settings;
drop policy if exists "company_settings_authenticated_read" on public.company_settings;
create policy "company_settings_authenticated_read"
on public.company_settings
for select
to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or (
    company_id = (select public.current_actor_app_policy_company_id())
    and (select public.current_actor_app_policy_role()) in (
      'director',
      'support',
      'csm'
    )
  )
);

drop policy if exists "company_outcome_definitions_tenant_read"
  on public.company_outcome_definitions;
drop policy if exists "company_outcome_definitions_authenticated_read"
  on public.company_outcome_definitions;
create policy "company_outcome_definitions_authenticated_read"
on public.company_outcome_definitions
for select
to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or (
    company_id = (select public.current_actor_app_policy_company_id())
    and (select public.current_actor_app_policy_role()) in (
      'director',
      'support',
      'csm'
    )
  )
);

drop policy if exists "company_churn_reasons_tenant_read"
  on public.company_churn_reasons;
drop policy if exists "company_churn_reasons_authenticated_read"
  on public.company_churn_reasons;
create policy "company_churn_reasons_authenticated_read"
on public.company_churn_reasons
for select
to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or (
    company_id = (select public.current_actor_app_policy_company_id())
    and (select public.current_actor_app_policy_role()) in (
      'director',
      'support',
      'csm'
    )
  )
);

drop policy if exists "company_custom_fields_tenant_read"
  on public.company_custom_fields;
drop policy if exists "company_custom_fields_authenticated_read"
  on public.company_custom_fields;
create policy "company_custom_fields_authenticated_read"
on public.company_custom_fields
for select
to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or (
    company_id = (select public.current_actor_app_policy_company_id())
    and (select public.current_actor_app_policy_role()) in (
      'director',
      'support',
      'csm'
    )
  )
);

drop policy if exists "company_task_templates_tenant_read"
  on public.company_task_templates;
drop policy if exists "company_task_templates_authenticated_read"
  on public.company_task_templates;
create policy "company_task_templates_authenticated_read"
on public.company_task_templates
for select
to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or (
    company_id = (select public.current_actor_app_policy_company_id())
    and (select public.current_actor_app_policy_role()) in (
      'director',
      'support',
      'csm'
    )
  )
);

drop policy if exists "app_audit_events_tenant_read" on public.app_audit_events;
drop policy if exists "app_audit_events_authenticated_read"
  on public.app_audit_events;
create policy "app_audit_events_authenticated_read"
on public.app_audit_events
for select
to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or (
    company_id = (select public.current_actor_app_policy_company_id())
    and (select public.current_actor_app_policy_role()) in (
      'director',
      'support'
    )
  )
);

drop policy if exists "integration_intake_events_tenant_read"
  on public.integration_intake_events;
drop policy if exists "integration_intake_events_authenticated_read"
  on public.integration_intake_events;
create policy "integration_intake_events_authenticated_read"
on public.integration_intake_events
for select
to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or (
    company_id = (select public.current_actor_app_policy_company_id())
    and (select public.current_actor_app_policy_role()) = 'director'
  )
);

drop policy if exists resources_tenant_read on public.resources;
drop policy if exists resources_authenticated_read on public.resources;
create policy resources_authenticated_read
on public.resources
for select
to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or (
    scope = 'retainos_help'
    and status = 'published'
  )
  or (
    scope = 'company'
    and company_legacy_id = (
      select public.current_actor_effective_policy_company_legacy_id()
    )
    and (
      status = 'published'
      or (
        status = 'draft'
        and (select public.current_actor_effective_policy_role()) = 'director'
      )
    )
  )
);

insert into public.security_rollout_history (
  version,
  migration_name,
  details
)
values (
  '20260713021000',
  'security_phase1b_company_reads',
  jsonb_build_object(
    'scope', 'app_owned_company_and_configuration_reads',
    'notifications_changed', false,
    'mirror_tables_changed', false
  )
)
on conflict (version) do nothing;

notify pgrst, 'reload schema';
