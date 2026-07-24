-- Dashboard analytics exclusions.
--
-- Some migrated workspaces intentionally keep operational client records that
-- should not contribute to executive reporting (for example, never-started
-- clients assigned to a non-coaching owner, or unresolved legacy assignments).
-- Store that decision on the client so every dashboard path can share it while
-- Clients and History continue to preserve the record.

alter table public.company_settings
  add column if not exists dashboard_exclude_unassigned_clients boolean
  not null default false;

alter table public.company_members
  add column if not exists exclude_from_dashboard_analytics boolean
  not null default false;

alter table public.clients
  add column if not exists exclude_from_dashboard_analytics boolean
  not null default false,
  add column if not exists dashboard_analytics_exclusion_reason text;

alter table public.clients
  drop constraint if exists clients_dashboard_analytics_exclusion_reason_check;

alter table public.clients
  add constraint clients_dashboard_analytics_exclusion_reason_check
  check (
    dashboard_analytics_exclusion_reason is null
    or dashboard_analytics_exclusion_reason in (
      'excluded_primary_member',
      'unassigned_or_inactive_primary'
    )
  );

create index if not exists clients_dashboard_analytics_included_idx
  on public.clients (company_id, program_status_value)
  where exclude_from_dashboard_analytics = false;

create table if not exists public.dashboard_lifecycle_reconciliation_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  legacy_client_glide_row_id text not null,
  correction_type text not null,
  classification text not null
    check (classification in ('applied', 'review_required')),
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, legacy_client_glide_row_id, correction_type)
);

create index if not exists dashboard_lifecycle_reconciliation_company_idx
  on public.dashboard_lifecycle_reconciliation_log (
    company_id,
    classification,
    correction_type
  );

alter table public.dashboard_lifecycle_reconciliation_log
  enable row level security;

drop policy if exists "dashboard_lifecycle_reconciliation_no_client_access"
on public.dashboard_lifecycle_reconciliation_log;

create policy "dashboard_lifecycle_reconciliation_no_client_access"
on public.dashboard_lifecycle_reconciliation_log
for all
using (false)
with check (false);

create or replace function public.set_client_dashboard_analytics_exclusion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exclude_unassigned boolean := false;
  v_member_excluded boolean := false;
  v_member_is_active boolean := false;
begin
  select coalesce(settings.dashboard_exclude_unassigned_clients, false)
  into v_exclude_unassigned
  from public.company_settings settings
  where settings.company_id = new.company_id;

  if nullif(btrim(new.csm_team_member_id), '') is not null then
    select
      coalesce(member.exclude_from_dashboard_analytics, false),
      member.status = 'active' and member.archived_at is null
    into
      v_member_excluded,
      v_member_is_active
    from public.company_members member
    where member.company_id = new.company_id
      and new.csm_team_member_id in (
        member.id::text,
        member.legacy_glide_row_id
      )
    order by
      case when member.id::text = new.csm_team_member_id then 0 else 1 end
    limit 1;
  end if;

  if coalesce(v_member_excluded, false) then
    new.exclude_from_dashboard_analytics := true;
    new.dashboard_analytics_exclusion_reason := 'excluded_primary_member';
  elsif v_exclude_unassigned
    and (
      nullif(btrim(new.csm_team_member_id), '') is null
      or not coalesce(v_member_is_active, false)
    ) then
    new.exclude_from_dashboard_analytics := true;
    new.dashboard_analytics_exclusion_reason :=
      'unassigned_or_inactive_primary';
  else
    new.exclude_from_dashboard_analytics := false;
    new.dashboard_analytics_exclusion_reason := null;
  end if;

  return new;
end;
$$;

revoke all on function public.set_client_dashboard_analytics_exclusion()
from public, anon, authenticated;
grant execute on function public.set_client_dashboard_analytics_exclusion()
to service_role;

drop trigger if exists clients_set_dashboard_analytics_exclusion
on public.clients;

create trigger clients_set_dashboard_analytics_exclusion
before insert or update of company_id, csm_team_member_id
on public.clients
for each row
execute function public.set_client_dashboard_analytics_exclusion();

-- Preserve the existing security contract and return shape. The only reporting
-- change is the shared client-level inclusion predicate.
create or replace function public.dashboard_authorized_app_clients(
  p_company_id text,
  p_csm_id text default null,
  p_secondary_assignee_id text default null,
  p_program_values text[] default null,
  p_offer_id text default null,
  p_client_start_date_from timestamptz default null,
  p_client_start_date_to timestamptz default null,
  p_date_range_end timestamptz default null
)
returns table (
  company_id uuid,
  company_legacy_id text,
  glide_row_id text,
  program_status_value text,
  outcomes_buy_in_for_filtering text,
  outcomes_progress_for_filtering text,
  offer_milestones_current_offer_id text,
  offer_milestones_current_milestone_id text,
  csm_team_member_id text,
  csm_secondary_assignee_id text,
  client_age_date_onboarded timestamptz,
  client_age_date_offboarded timestamptz,
  client_age_date_offboarded_for_filtering timestamptz,
  current_contract_start_date timestamptz,
  current_contract_of_days numeric,
  current_contract_end_date timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with requested_company as (
    select
      company.id,
      company.legacy_glide_row_id
    from public.companies company
    where company.status <> 'archived'
      and company.archived_at is null
      and company.migration_status in ('pilot', 'migrated')
      and (
        company.id::text = p_company_id
        or company.legacy_glide_row_id = p_company_id
      )
    limit 1
  ),
  actor_scope as (
    select *
    from public.current_actor_app_scope()
  ),
  authorized_company as (
    select
      company.id,
      company.legacy_glide_row_id,
      coalesce(scope.scope_role, 'super_admin') as actor_role,
      array_remove(
        array[
          scope.scope_member_id::text,
          scope.scope_member_legacy_id
        ],
        null
      ) as actor_member_ids
    from requested_company company
    left join actor_scope scope
      on scope.scope_company_id = company.id
    where (select public.is_retainos_super_admin_bound())
      or scope.scope_company_id = company.id
  ),
  valid_filters as (
    select company.*
    from authorized_company company
    where (
        p_program_values is null
        or (
          cardinality(p_program_values) between 1 and 10
          and p_program_values <@ array[
            'front-end',
            'back-end',
            'paused',
            'suspended',
            'off-boarded'
          ]::text[]
        )
      )
      and (
        p_client_start_date_from is null
        or p_client_start_date_to is null
        or p_client_start_date_from <= p_client_start_date_to
      )
      and (
        p_offer_id is null
        or exists (
          select 1
          from public.company_offers offer
          where offer.company_id = company.id
            and offer.glide_row_id = p_offer_id
        )
      )
      and (
        p_csm_id is null
        or (
          company.actor_role = 'csm'
          and p_csm_id = any(company.actor_member_ids)
        )
        or (
          company.actor_role <> 'csm'
          and exists (
            select 1
            from public.company_members member
            where member.company_id = company.id
              and member.status = 'active'
              and member.archived_at is null
              and member.role <> 'viewer'
              and member.is_read_only = false
              and member.hide_from_csm_list = false
              and p_csm_id in (
                member.id::text,
                member.legacy_glide_row_id
              )
          )
        )
      )
      and (
        p_secondary_assignee_id is null
        or exists (
          select 1
          from public.company_members member
          where member.company_id = company.id
            and member.status = 'active'
            and member.archived_at is null
            and member.role <> 'viewer'
            and member.is_read_only = false
            and member.hide_from_csm_list = false
            and p_secondary_assignee_id in (
              member.id::text,
              member.legacy_glide_row_id
            )
        )
      )
  )
  select
    client.company_id,
    company.legacy_glide_row_id,
    client.glide_row_id,
    client.program_status_value,
    client.outcomes_buy_in_for_filtering,
    client.outcomes_progress_for_filtering,
    client.offer_milestones_current_offer_id,
    client.offer_milestones_current_milestone_id,
    client.csm_team_member_id,
    client.csm_secondary_assignee_id,
    client.client_age_date_onboarded,
    client.client_age_date_offboarded,
    client.client_age_date_offboarded_for_filtering,
    client.current_contract_start_date,
    client.current_contract_of_days,
    client.current_contract_end_date
  from public.clients client
  join valid_filters company
    on company.id = client.company_id
  where client.exclude_from_dashboard_analytics = false
    and (
      company.actor_role <> 'csm'
      or client.csm_team_member_id = any(company.actor_member_ids)
      or client.csm_secondary_assignee_id = any(company.actor_member_ids)
    )
    and (
      p_csm_id is null
      or company.actor_role = 'csm'
      or client.csm_team_member_id = p_csm_id
    )
    and (
      p_secondary_assignee_id is null
      or client.csm_secondary_assignee_id = p_secondary_assignee_id
    )
    and (
      p_program_values is null
      or client.program_status_value = any(p_program_values)
    )
    and (
      p_offer_id is null
      or client.offer_milestones_current_offer_id = p_offer_id
    )
    and (
      p_client_start_date_from is null
      or client.client_age_date_onboarded >= p_client_start_date_from
    )
    and (
      p_client_start_date_to is null
      or client.client_age_date_onboarded < p_client_start_date_to + interval '1 day'
    )
    and (
      p_date_range_end is null
      or client.client_age_date_onboarded is null
      or client.client_age_date_onboarded < p_date_range_end + interval '1 day'
    );
$$;

revoke all on function public.dashboard_authorized_app_clients(
  text,
  text,
  text,
  text[],
  text,
  timestamptz,
  timestamptz,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.dashboard_authorized_app_clients(
  text,
  text,
  text,
  text[],
  text,
  timestamptz,
  timestamptz,
  timestamptz
) to service_role;

-- The signature above intentionally remains service-role only. Refresh
-- PostgREST so direct app-owned queries can use the new client column.
notify pgrst, 'reload schema';
