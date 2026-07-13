-- Roll back only the Phase 1B app-owned company/configuration read policies.
-- Restores the broad authenticated SELECT policies that preceded Phase 1B.

do $$
begin
  if exists (
    select 1
    from public.security_rollout_history rollout
    where rollout.version in (
      '20260713022000',
      '20260713022500',
      '20260713023000'
    )
  ) then
    raise exception 'Roll back later Phase 1B read-policy slices first';
  end if;
end $$;

delete from public.security_rollout_history
where version = '20260713021000';

drop policy if exists "companies_authenticated_read" on public.companies;
create policy "companies_authenticated_read"
on public.companies for select
to authenticated
using (true);

drop policy if exists "company_members_authenticated_read" on public.company_members;
create policy "company_members_authenticated_read"
on public.company_members for select
to authenticated
using (true);

drop policy if exists "company_offers_authenticated_read" on public.company_offers;
create policy "company_offers_authenticated_read"
on public.company_offers for select
to authenticated
using (true);

drop policy if exists "company_offer_milestones_authenticated_read"
  on public.company_offer_milestones;
create policy "company_offer_milestones_authenticated_read"
on public.company_offer_milestones for select
to authenticated
using (true);

drop policy if exists "company_settings_authenticated_read" on public.company_settings;
create policy "company_settings_authenticated_read"
on public.company_settings for select
to authenticated
using (true);

drop policy if exists "company_outcome_definitions_authenticated_read"
  on public.company_outcome_definitions;
create policy "company_outcome_definitions_authenticated_read"
on public.company_outcome_definitions for select
to authenticated
using (true);

drop policy if exists "company_churn_reasons_authenticated_read"
  on public.company_churn_reasons;
create policy "company_churn_reasons_authenticated_read"
on public.company_churn_reasons for select
to authenticated
using (true);

drop policy if exists "company_custom_fields_authenticated_read"
  on public.company_custom_fields;
create policy "company_custom_fields_authenticated_read"
on public.company_custom_fields for select
to authenticated
using (true);

drop policy if exists "company_task_templates_authenticated_read"
  on public.company_task_templates;
create policy "company_task_templates_authenticated_read"
on public.company_task_templates for select
to authenticated
using (true);

drop policy if exists "app_audit_events_authenticated_read"
  on public.app_audit_events;
create policy "app_audit_events_authenticated_read"
on public.app_audit_events for select
to authenticated
using (true);

drop policy if exists "integration_intake_events_authenticated_read"
  on public.integration_intake_events;
create policy "integration_intake_events_authenticated_read"
on public.integration_intake_events for select
to authenticated
using (true);

drop policy if exists resources_authenticated_read on public.resources;
create policy resources_authenticated_read
on public.resources for select
to authenticated
using (true);

drop function if exists public.current_actor_effective_policy_role();
drop function if exists public.current_actor_effective_policy_company_legacy_id();
drop function if exists public.current_actor_app_policy_member_ids();
drop function if exists public.current_actor_app_policy_role();
drop function if exists public.current_actor_app_policy_company_legacy_id();
drop function if exists public.current_actor_app_policy_company_id();

notify pgrst, 'reload schema';
