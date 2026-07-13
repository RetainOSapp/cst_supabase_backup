-- Exact rollback for the Phase 1E security advisor cleanup.

drop function if exists public.dashboard_retention_counts_fast(
  text, text, text, text[], text, timestamptz, timestamptz, timestamptz,
  timestamptz, text
);

alter function public._dashboard_retention_counts_fast_unchecked(
  text, text, text, text[], text, timestamptz, timestamptz, timestamptz,
  timestamptz, text
)
  rename to dashboard_retention_counts_fast;

grant execute on function public.dashboard_retention_counts_fast(
  text, text, text, text[], text, timestamptz, timestamptz, timestamptz,
  timestamptz, text
)
  to public, authenticated, service_role;

alter function public.set_updated_at() reset search_path;

alter function public.dashboard_kpi_counts_canonical(
  text, text, text, text[], text, timestamptz, timestamptz, timestamptz, timestamptz
)
  reset search_path;

alter function public.search_client_notes(
  text, text, text, text, text, text, text[], text, text, text, text, text,
  text, text, text, text, text, text, text, integer, integer
)
  reset search_path;

create policy "app_audit_events_no_anon_access"
on public.app_audit_events for all using (false) with check (false);
create policy "client_call_attendance_events_no_anon_access"
on public.client_call_attendance_events for all using (false) with check (false);
create policy "client_contracts_no_anon_access"
on public.client_contracts for all using (false) with check (false);
create policy "client_history_events_no_anon_access"
on public.client_history_events for all using (false) with check (false);
create policy "client_milestones_no_anon_access"
on public.client_milestones for all using (false) with check (false);
create policy "client_tasks_no_anon_access"
on public.client_tasks for all using (false) with check (false);
create policy "client_timed_checkpoint_no_anon_access"
on public.client_timed_checkpoint_completions for all using (false) with check (false);
create policy "clients_no_anon_access"
on public.clients for all using (false) with check (false);
create policy "companies_no_anon_access"
on public.companies for all using (false) with check (false);
create policy "company_members_no_anon_access"
on public.company_members for all using (false) with check (false);
create policy "integration_intake_events_no_anon_access"
on public.integration_intake_events for all using (false) with check (false);
create policy "notification_preferences_no_anon_access"
on public.notification_preferences for all using (false) with check (false);
create policy "notifications_no_anon_access"
on public.notifications for all using (false) with check (false);

create index if not exists security_phase1a_backup_clients_primary_csm_idx
  on public.backup_company_clients (company_id, csm_team_member_id);
create index if not exists security_phase1b_advocacy_company_client_legacy_idx
  on public.client_advocacy_events (company_id, client_legacy_id);

delete from public.security_rollout_history
where version = '20260713025000';

notify pgrst, 'reload schema';
