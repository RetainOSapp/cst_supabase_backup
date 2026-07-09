drop function if exists public.dashboard_retention_counts_fast(
  text,
  text,
  text,
  text[],
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  text
);

create or replace function public.dashboard_retention_counts_fast(
  p_company_id text,
  p_csm_id text default null,
  p_secondary_assignee_id text default null,
  p_program_values text[] default null,
  p_offer_id text default null,
  p_client_start_date_from timestamptz default null,
  p_client_start_date_to timestamptz default null,
  p_date_range_start timestamptz default null,
  p_date_range_end timestamptz default null,
  p_assigned_team_member_id text default null
)
returns table (
  retained_clients bigint,
  retained_client_ids text[],
  retained_events jsonb
)
language sql
stable
security definer
set search_path = public
as $$
with selected_company as (
  select
    c.id,
    c.legacy_glide_row_id
  from public.companies c
  where c.id::text = p_company_id
     or c.legacy_glide_row_id = p_company_id
  limit 1
),
authorized_company as (
  select sc.*
  from selected_company sc
  where auth.role() = 'service_role'
     or exists (
       select 1
       from public.company_members cm
       where cm.company_id = sc.id
         and cm.status = 'active'
         and lower(cm.email) = lower(coalesce(auth.email(), ''))
     )
),
retention_settings as (
  select coalesce(cs.allow_status_change_retention, false) as allow_status_change_retention
  from authorized_company sc
  left join public.company_settings cs on cs.company_id = sc.id
),
filtered_clients as (
  select
    c.glide_row_id
  from public.clients c
  join authorized_company sc on c.company_glide_row_id = sc.legacy_glide_row_id
  where (
      p_assigned_team_member_id is null
      or c.csm_team_member_id = p_assigned_team_member_id
      or c.csm_secondary_assignee_id = p_assigned_team_member_id
    )
    and (
      p_assigned_team_member_id is not null
      or p_csm_id is null
      or c.csm_team_member_id = p_csm_id
    )
    and (p_secondary_assignee_id is null or c.csm_secondary_assignee_id = p_secondary_assignee_id)
    and (p_program_values is null or cardinality(p_program_values) = 0 or c.program_status_value = any(p_program_values))
    and (p_offer_id is null or c.offer_milestones_current_offer_id = p_offer_id)
    and (p_client_start_date_from is null or c.client_age_date_onboarded >= p_client_start_date_from)
    and (p_client_start_date_to is null or c.client_age_date_onboarded < p_client_start_date_to + interval '1 day')
    and (p_date_range_end is null or c.client_age_date_onboarded is null or c.client_age_date_onboarded < p_date_range_end + interval '1 day')
),
app_retained as (
  select
    che.legacy_client_glide_row_id as client_id,
    min(
      case
        when che.event_type = 'client_retention_recorded'
          then coalesce(
            (che.payload->'contract'->>'start_date')::timestamptz,
            (che.payload->'contract'->>'startDate')::timestamptz,
            (che.payload->>'retention_date')::timestamptz,
            che.created_at
          )
        else che.created_at
      end
    ) as retained_at
  from public.client_history_events che
  join authorized_company sc on sc.id = che.company_id
  cross join retention_settings rs
  where che.legacy_client_glide_row_id is not null
    and (
      (
        che.event_type = 'client_retention_recorded'
        and (
          p_date_range_start is null
          or coalesce(
            (che.payload->'contract'->>'start_date')::timestamptz,
            (che.payload->'contract'->>'startDate')::timestamptz,
            (che.payload->>'retention_date')::timestamptz,
            che.created_at
          ) >= p_date_range_start
        )
        and (
          p_date_range_end is null
          or coalesce(
            (che.payload->'contract'->>'start_date')::timestamptz,
            (che.payload->'contract'->>'startDate')::timestamptz,
            (che.payload->>'retention_date')::timestamptz,
            che.created_at
          ) < p_date_range_end + interval '1 day'
        )
      )
      or (
        rs.allow_status_change_retention
        and che.event_type = 'client_status_changed'
        and (che.payload->>'from_status', che.payload->>'to_status') in (
          ('front-end', 'front-end'),
          ('front-end', 'back-end'),
          ('back-end', 'back-end')
        )
        and (p_date_range_start is null or che.created_at >= p_date_range_start)
        and (p_date_range_end is null or che.created_at < p_date_range_end + interval '1 day')
      )
    )
  group by che.legacy_client_glide_row_id
),
legacy_retained as (
  select
    bch.client_id,
    min(bch.modified_date) as retained_at
  from public.backup_company_clients_history bch
  join filtered_clients fc on fc.glide_row_id = bch.client_id
  where bch.change_type_code = 'program-status'
    and (
      (bch.original_value = 'front-end' and bch.value = 'back-end')
      or (bch.original_value = 'back-end' and bch.value = 'back-end')
    )
    and (p_date_range_start is null or bch.modified_date >= p_date_range_start)
    and (p_date_range_end is null or bch.modified_date < p_date_range_end + interval '1 day')
  group by bch.client_id
),
all_retained as (
  select ar.client_id, ar.retained_at
  from app_retained ar
  join filtered_clients fc on fc.glide_row_id = ar.client_id

  union all

  select lr.client_id, lr.retained_at
  from legacy_retained lr
),
unique_retained as (
  select
    client_id,
    min(retained_at) as retained_at
  from all_retained
  group by client_id
)
select
  count(*)::bigint as retained_clients,
  coalesce(array_agg(client_id order by client_id), array[]::text[]) as retained_client_ids,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'client_id', client_id,
        'retained_at', retained_at
      )
      order by retained_at desc nulls last, client_id
    ),
    '[]'::jsonb
  ) as retained_events
from unique_retained;
$$;

grant execute on function public.dashboard_retention_counts_fast(
  text,
  text,
  text,
  text[],
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  text
) to authenticated;

comment on function public.dashboard_retention_counts_fast is
  'Fast dashboard retention count for app-owned/migrated companies. Counts unique retained clients from RetainOS retention events plus migrated CST Front End -> Back End and Back End -> Back End movements.';
