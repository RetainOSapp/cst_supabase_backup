-- Security Phase 1B: assignment-aware app-owned client graph reads.
-- Viewer receives no raw client or client-child rows; Dashboard aggregates are
-- provided by the preceding Phase 1B aggregate slice.

do $$
begin
  if to_regclass('public.security_rollout_history') is null
    or not exists (
      select 1
      from public.security_rollout_history rollout
      where rollout.version = '20260713021000'
    ) then
    raise exception 'Phase 1B company read policies must be applied first';
  end if;
end $$;

create index if not exists security_phase1b_clients_company_legacy_idx
  on public.clients (company_id, glide_row_id);

create index if not exists security_phase1b_history_company_client_idx
  on public.client_history_events (company_id, legacy_client_glide_row_id);

create index if not exists security_phase1b_tasks_company_client_idx
  on public.client_tasks (company_id, client_id);

create index if not exists security_phase1b_tasks_company_assignee_idx
  on public.client_tasks (company_id, assigned_to_id);

create index if not exists security_phase1b_contracts_company_client_idx
  on public.client_contracts (company_id, client_id);

create index if not exists security_phase1b_milestones_company_client_idx
  on public.client_milestones (company_id, client_id);

create index if not exists security_phase1b_links_company_client_uuid_idx
  on public.client_links (company_id, client_id);

create index if not exists security_phase1b_links_company_client_legacy_idx
  on public.client_links (company_id, legacy_client_glide_row_id);

create index if not exists security_phase1b_advocacy_company_client_uuid_idx
  on public.client_advocacy_events (company_id, client_id);

create index if not exists security_phase1b_advocacy_company_client_legacy_idx
  on public.client_advocacy_events (company_id, client_legacy_id);

drop policy if exists "clients_tenant_read" on public.clients;
drop policy if exists "clients_authenticated_read" on public.clients;
create policy "clients_authenticated_read"
on public.clients
for select
to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or (
    company_id = (select public.current_actor_app_policy_company_id())
    and (
      (select public.current_actor_app_policy_role()) in (
        'director',
        'support'
      )
      or (
        (select public.current_actor_app_policy_role()) = 'csm'
        and (
          csm_team_member_id = any(
            coalesce(
              (select public.current_actor_app_policy_member_ids()),
              array[]::text[]
            )
          )
          or csm_secondary_assignee_id = any(
            coalesce(
              (select public.current_actor_app_policy_member_ids()),
              array[]::text[]
            )
          )
        )
      )
    )
  )
);

drop policy if exists "client_history_events_tenant_read"
  on public.client_history_events;
drop policy if exists "client_history_events_authenticated_read"
  on public.client_history_events;
create policy "client_history_events_authenticated_read"
on public.client_history_events
for select
to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or (
    company_id = (select public.current_actor_app_policy_company_id())
    and (
      (select public.current_actor_app_policy_role()) in (
        'director',
        'support'
      )
      or (
        (select public.current_actor_app_policy_role()) = 'csm'
        and exists (
          select 1
          from public.clients client
          where client.company_id = client_history_events.company_id
            and client.glide_row_id =
              client_history_events.legacy_client_glide_row_id
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

drop policy if exists "client_contracts_tenant_read" on public.client_contracts;
drop policy if exists "client_contracts_authenticated_read"
  on public.client_contracts;
create policy "client_contracts_authenticated_read"
on public.client_contracts
for select
to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or (
    company_id = (select public.current_actor_app_policy_company_id())
    and (
      (select public.current_actor_app_policy_role()) in (
        'director',
        'support'
      )
      or (
        (select public.current_actor_app_policy_role()) = 'csm'
        and exists (
          select 1
          from public.clients client
          where client.company_id = client_contracts.company_id
            and client.glide_row_id = client_contracts.client_id
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

drop policy if exists "client_milestones_tenant_read" on public.client_milestones;
drop policy if exists "client_milestones_authenticated_read"
  on public.client_milestones;
create policy "client_milestones_authenticated_read"
on public.client_milestones
for select
to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or (
    company_id = (select public.current_actor_app_policy_company_id())
    and (
      (select public.current_actor_app_policy_role()) in (
        'director',
        'support'
      )
      or (
        (select public.current_actor_app_policy_role()) = 'csm'
        and exists (
          select 1
          from public.clients client
          where client.company_id = client_milestones.company_id
            and client.glide_row_id = client_milestones.client_id
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

drop policy if exists "client_custom_field_values_tenant_read"
  on public.client_custom_field_values;
drop policy if exists "client_custom_field_values_authenticated_read"
  on public.client_custom_field_values;
create policy "client_custom_field_values_authenticated_read"
on public.client_custom_field_values
for select
to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or (
    company_id = (select public.current_actor_app_policy_company_id())
    and (
      (select public.current_actor_app_policy_role()) in (
        'director',
        'support'
      )
      or (
        (select public.current_actor_app_policy_role()) = 'csm'
        and exists (
          select 1
          from public.clients client
          where client.company_id = client_custom_field_values.company_id
            and client.glide_row_id = client_custom_field_values.client_id
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

drop policy if exists "client_links_tenant_read" on public.client_links;
drop policy if exists "client_links_authenticated_read" on public.client_links;
create policy "client_links_authenticated_read"
on public.client_links
for select
to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or (
    company_id = (select public.current_actor_app_policy_company_id())
    and (
      (select public.current_actor_app_policy_role()) in (
        'director',
        'support'
      )
      or (
        (select public.current_actor_app_policy_role()) = 'csm'
        and exists (
          select 1
          from public.clients client
          where client.company_id = client_links.company_id
            and (
              client.id = client_links.client_id
              or client.glide_row_id = client_links.legacy_client_glide_row_id
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

drop policy if exists "client_advocacy_events_tenant_read"
  on public.client_advocacy_events;
drop policy if exists "client_advocacy_events_authenticated_read"
  on public.client_advocacy_events;
create policy "client_advocacy_events_authenticated_read"
on public.client_advocacy_events
for select
to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or (
    company_id = (select public.current_actor_app_policy_company_id())
    and (
      (select public.current_actor_app_policy_role()) in (
        'director',
        'support'
      )
      or (
        (select public.current_actor_app_policy_role()) = 'csm'
        and exists (
          select 1
          from public.clients client
          where client.company_id = client_advocacy_events.company_id
            and (
              client.id = client_advocacy_events.client_id
              or client.glide_row_id = client_advocacy_events.client_legacy_id
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

drop policy if exists "client_tasks_tenant_read" on public.client_tasks;
drop policy if exists "client_tasks_authenticated_read" on public.client_tasks;
create policy "client_tasks_authenticated_read"
on public.client_tasks
for select
to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or (
    company_id = (select public.current_actor_app_policy_company_id())
    and (
      (select public.current_actor_app_policy_role()) in (
        'director',
        'support'
      )
      or (
        (select public.current_actor_app_policy_role()) = 'csm'
        and (
          assigned_to_id = any(
            coalesce(
              (select public.current_actor_app_policy_member_ids()),
              array[]::text[]
            )
          )
          or (
            client_id is not null
            and exists (
              select 1
              from public.clients client
              where client.company_id = client_tasks.company_id
                and client.glide_row_id = client_tasks.client_id
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
    )
  )
);

insert into public.security_rollout_history (
  version,
  migration_name,
  details
)
values (
  '20260713022000',
  'security_phase1b_client_reads',
  jsonb_build_object(
    'scope', 'assignment_aware_app_owned_client_graph_reads',
    'viewer_raw_client_rows', false,
    'notifications_changed', false,
    'mirror_tables_changed', false
  )
)
on conflict (version) do nothing;

notify pgrst, 'reload schema';
