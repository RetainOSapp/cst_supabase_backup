-- Roll back only the Phase 1B assignment-aware app-owned client policies.
-- Restores the pre-Phase-1B authenticated read behavior for these tables.

do $$
begin
  if exists (
    select 1
    from public.security_rollout_history rollout
    where rollout.version in ('20260713022500', '20260713023000')
  ) then
    raise exception 'Remove the post-policy QA gate and RPC lockdown first';
  end if;
end $$;

delete from public.security_rollout_history
where version = '20260713022000';

drop policy if exists "clients_authenticated_read" on public.clients;
create policy "clients_authenticated_read"
on public.clients for select
to authenticated
using (true);

drop policy if exists "client_history_events_authenticated_read"
  on public.client_history_events;
create policy "client_history_events_authenticated_read"
on public.client_history_events for select
to authenticated
using (true);

drop policy if exists "client_contracts_authenticated_read"
  on public.client_contracts;
create policy "client_contracts_authenticated_read"
on public.client_contracts for select
to authenticated
using (true);

drop policy if exists "client_milestones_authenticated_read"
  on public.client_milestones;
create policy "client_milestones_authenticated_read"
on public.client_milestones for select
to authenticated
using (true);

drop policy if exists "client_custom_field_values_authenticated_read"
  on public.client_custom_field_values;
create policy "client_custom_field_values_authenticated_read"
on public.client_custom_field_values for select
to authenticated
using (true);

drop policy if exists "client_tasks_authenticated_read" on public.client_tasks;
create policy "client_tasks_authenticated_read"
on public.client_tasks for select
to authenticated
using (true);

drop policy if exists "client_links_authenticated_read" on public.client_links;
create policy "client_links_authenticated_read"
on public.client_links for select
to authenticated
using (public.can_read_company(company_id));

drop policy if exists "client_advocacy_events_authenticated_read"
  on public.client_advocacy_events;
create policy "client_advocacy_events_authenticated_read"
on public.client_advocacy_events for select
to authenticated
using (public.can_read_company(company_id));

drop index if exists public.security_phase1b_advocacy_company_client_legacy_idx;
drop index if exists public.security_phase1b_advocacy_company_client_uuid_idx;
drop index if exists public.security_phase1b_links_company_client_legacy_idx;
drop index if exists public.security_phase1b_links_company_client_uuid_idx;
drop index if exists public.security_phase1b_milestones_company_client_idx;
drop index if exists public.security_phase1b_contracts_company_client_idx;
drop index if exists public.security_phase1b_tasks_company_assignee_idx;
drop index if exists public.security_phase1b_tasks_company_client_idx;
drop index if exists public.security_phase1b_history_company_client_idx;
drop index if exists public.security_phase1b_clients_company_legacy_idx;

notify pgrst, 'reload schema';
