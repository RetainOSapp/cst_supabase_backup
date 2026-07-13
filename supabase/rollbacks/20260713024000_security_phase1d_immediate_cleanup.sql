-- Roll back only the immediate Phase 1D policy cleanup.

drop policy if exists "client_call_attendance_events_authenticated_read"
  on public.client_call_attendance_events;
create policy "client_call_attendance_events_authenticated_read"
on public.client_call_attendance_events
for select
to authenticated
using (true);

drop policy if exists "client_timed_checkpoint_authenticated_read"
  on public.client_timed_checkpoint_completions;
create policy "client_timed_checkpoint_authenticated_read"
on public.client_timed_checkpoint_completions
for select
to authenticated
using (true);

drop policy if exists "company_contract_templates_authenticated_read"
  on public.company_contract_templates;
create policy "company_contract_templates_authenticated_read"
on public.company_contract_templates
for select
to authenticated
using (true);

drop policy if exists auth_read_ccaa on public.company_clients_ai_analysis;
create policy auth_read_ccaa
on public.company_clients_ai_analysis
for select
to authenticated
using (true);

drop policy if exists auth_read_glide_rows on public.glide_rows;
create policy auth_read_glide_rows
on public.glide_rows for select to authenticated using (true);

drop policy if exists auth_read_glide_sync_jobs on public.glide_sync_jobs;
create policy auth_read_glide_sync_jobs
on public.glide_sync_jobs for select to authenticated using (true);

drop policy if exists auth_cancel_glide_sync_jobs on public.glide_sync_jobs;
create policy auth_cancel_glide_sync_jobs
on public.glide_sync_jobs for update to authenticated
using (true)
with check (status = 'cancelled');

drop policy if exists auth_read_glide_sync_runs on public.glide_sync_runs;
create policy auth_read_glide_sync_runs
on public.glide_sync_runs for select to authenticated using (true);

drop policy if exists auth_read_glide_tables on public.glide_tables;
create policy auth_read_glide_tables
on public.glide_tables for select to authenticated using (true);

drop policy if exists auth_read_sync_config on public.sync_config;
create policy auth_read_sync_config
on public.sync_config for select to authenticated using (true);

drop policy if exists auth_read_sync_table_list on public.sync_table_list;
create policy auth_read_sync_table_list
on public.sync_table_list for select to authenticated using (true);

drop policy if exists auth_update_sync_table_list on public.sync_table_list;
create policy auth_update_sync_table_list
on public.sync_table_list for update to authenticated
using (true)
with check (true);

drop index if exists public.security_phase1d_timed_checkpoint_lookup_idx;
drop index if exists public.security_phase1d_attendance_legacy_client_idx;

delete from public.security_rollout_history
where version = '20260713024000';

notify pgrst, 'reload schema';
