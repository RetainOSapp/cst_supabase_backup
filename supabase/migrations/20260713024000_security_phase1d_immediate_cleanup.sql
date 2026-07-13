-- Security Phase 1D immediate cleanup.
-- Harden remaining non-mirror broad authenticated policies while preserving
-- backup_* fallback reads until all companies are migrated.

do $$
begin
  if to_regclass('public.security_rollout_history') is null
    or not exists (
      select 1
      from public.security_rollout_history rollout
      where rollout.version = '20260713023000'
    ) then
    raise exception 'Phase 1B must be fully closed before Phase 1D cleanup';
  end if;
end $$;

create index if not exists security_phase1d_attendance_legacy_client_idx
  on public.client_call_attendance_events (
    company_legacy_id,
    client_legacy_id,
    occurred_at desc
  );

create index if not exists security_phase1d_timed_checkpoint_lookup_idx
  on public.client_timed_checkpoint_completions (
    company_id,
    checkpoint_type,
    legacy_client_id,
    due_at
  )
  where archived_at is null;

drop policy if exists "client_call_attendance_events_authenticated_read"
  on public.client_call_attendance_events;
create policy "client_call_attendance_events_authenticated_read"
on public.client_call_attendance_events
for select
to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or (
    company_id = (select public.current_actor_app_policy_company_id())
    and (
      (select public.current_actor_app_policy_role()) in ('director', 'support')
      or (
        (select public.current_actor_app_policy_role()) = 'csm'
        and exists (
          select 1
          from public.clients client
          where client.company_id = client_call_attendance_events.company_id
            and (
              client.id = client_call_attendance_events.client_id
              or client.glide_row_id =
                client_call_attendance_events.client_legacy_id
            )
            and (
              client.csm_team_member_id = any(
                coalesce(
                  (select public.current_actor_app_policy_member_ids()),
                  array[]::text[]
                )
              )
              or client.csm_secondary_assignee_id = any(
                coalesce(
                  (select public.current_actor_app_policy_member_ids()),
                  array[]::text[]
                )
              )
            )
        )
      )
    )
  )
);

drop policy if exists "client_timed_checkpoint_authenticated_read"
  on public.client_timed_checkpoint_completions;
create policy "client_timed_checkpoint_authenticated_read"
on public.client_timed_checkpoint_completions
for select
to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or (
    company_id = (select public.current_actor_app_policy_company_id())
    and (
      (select public.current_actor_app_policy_role()) in ('director', 'support')
      or (
        (select public.current_actor_app_policy_role()) = 'csm'
        and exists (
          select 1
          from public.clients client
          where client.company_id =
            client_timed_checkpoint_completions.company_id
            and (
              client.id = client_timed_checkpoint_completions.client_id
              or client.glide_row_id =
                client_timed_checkpoint_completions.legacy_client_id
            )
            and (
              client.csm_team_member_id = any(
                coalesce(
                  (select public.current_actor_app_policy_member_ids()),
                  array[]::text[]
                )
              )
              or client.csm_secondary_assignee_id = any(
                coalesce(
                  (select public.current_actor_app_policy_member_ids()),
                  array[]::text[]
                )
              )
            )
        )
      )
    )
  )
);

drop policy if exists "company_contract_templates_authenticated_read"
  on public.company_contract_templates;
create policy "company_contract_templates_authenticated_read"
on public.company_contract_templates
for select
to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or (
    company_id = (select public.current_actor_app_policy_company_id())
    and (select public.current_actor_app_policy_role()) = 'director'
  )
);

drop policy if exists auth_read_ccaa
  on public.company_clients_ai_analysis;

drop policy if exists auth_read_glide_rows on public.glide_rows;

drop policy if exists auth_read_glide_sync_jobs on public.glide_sync_jobs;
create policy auth_read_glide_sync_jobs
on public.glide_sync_jobs
for select
to authenticated
using ((select public.is_retainos_super_admin_bound()));

drop policy if exists auth_cancel_glide_sync_jobs on public.glide_sync_jobs;
create policy auth_cancel_glide_sync_jobs
on public.glide_sync_jobs
for update
to authenticated
using ((select public.is_retainos_super_admin_bound()))
with check (
  (select public.is_retainos_super_admin_bound())
  and status = 'cancelled'
);

drop policy if exists auth_read_glide_sync_runs on public.glide_sync_runs;
create policy auth_read_glide_sync_runs
on public.glide_sync_runs
for select
to authenticated
using ((select public.is_retainos_super_admin_bound()));

drop policy if exists auth_read_glide_tables on public.glide_tables;

drop policy if exists auth_read_sync_config on public.sync_config;

drop policy if exists auth_read_sync_table_list on public.sync_table_list;
create policy auth_read_sync_table_list
on public.sync_table_list
for select
to authenticated
using ((select public.is_retainos_super_admin_bound()));

drop policy if exists auth_update_sync_table_list on public.sync_table_list;
create policy auth_update_sync_table_list
on public.sync_table_list
for update
to authenticated
using ((select public.is_retainos_super_admin_bound()))
with check ((select public.is_retainos_super_admin_bound()));

insert into public.security_rollout_history (
  version,
  migration_name,
  details
)
values (
  '20260713024000',
  'security_phase1d_immediate_cleanup',
  jsonb_build_object(
    'scope', 'remaining_non_mirror_broad_authenticated_policies',
    'backup_tables_changed', false,
    'mirror_retirement_deferred', true
  )
)
on conflict (version) do nothing;

notify pgrst, 'reload schema';
