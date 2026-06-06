-- RetainOS dashboard canonical reporting RPC draft.
-- Draft only: keep outside supabase/migrations until it is validated against
-- the live Supabase schema and Ethical Scaling pilot data.

-- Intent:
-- - Replace client-side Dashboard KPI fallbacks with database-level formulas.
-- - Support multi-program filters and offer filters in the same query.
-- - Normalize app-owned pilot/migrated companies and Glide mirror companies.
-- - Provide one source for Dashboard, CSM Reports, PDFs, CSVs, alerts, and AI.
-- - Retention counting assumes renewal events are written to status/history.
--   The current pilot status function may need a dedicated renewal action to
--   support same-program renewals such as front-end -> front-end.

create or replace function public.dashboard_kpi_counts_canonical(
  p_company_id text,
  p_csm_id text default null,
  p_secondary_assignee_id text default null,
  p_program_values text[] default null,
  p_offer_id text default null,
  p_client_start_date_from timestamptz default null,
  p_client_start_date_to timestamptz default null,
  p_date_range_start timestamptz default null,
  p_date_range_end timestamptz default null
)
returns table (
  active_clients bigint,
  front_end_clients bigint,
  back_end_clients bigint,
  paused_clients bigint,
  suspended_clients bigint,
  off_boarded_clients bigint,
  churned_clients bigint,
  churn_percentage numeric,
  retained_clients bigint,
  renewing_clients bigint,
  active_renewing_clients bigint,
  retention_percentage numeric
)
language sql
stable
as $$
with selected_company as (
  select
    c.id,
    c.legacy_glide_row_id,
    c.migration_status
  from public.companies c
  where c.id::text = p_company_id
     or c.legacy_glide_row_id = p_company_id
  limit 1
),
source_clients as (
  select
    cl.glide_row_id,
    cl.program_status_value,
    cl.offer_milestones_current_offer_id,
    cl.csm_team_member_id,
    cl.csm_secondary_assignee_id,
    cl.client_age_date_onboarded,
    cl.client_age_date_offboarded,
    cl.client_age_date_offboarded_for_filtering,
    cl.current_contract_start_date,
    cl.current_contract_of_days,
    cl.current_contract_end_date
  from public.clients cl
  join selected_company sc on sc.id = cl.company_id
  where sc.migration_status in ('pilot', 'migrated')

  union all

  select
    bc.glide_row_id,
    bc.program_status_value,
    bc.offer_milestones_current_offer_id,
    bc.csm_team_member_id,
    bc.csm_secondary_assignee_id,
    bc.client_age_date_onboarded,
    bc.client_age_date_offboarded,
    bc.client_age_date_offboarded_for_filtering,
    bc.current_contract_start_date,
    bc.current_contract_of_days,
    bc.current_contract_end_date
  from public.backup_company_clients bc
  left join selected_company sc on true
  where coalesce(sc.migration_status, 'mirror_only') = 'mirror_only'
    and bc.company_id = coalesce(sc.legacy_glide_row_id, p_company_id)
),
filtered_clients as (
  select *
  from source_clients c
  where (p_csm_id is null or c.csm_team_member_id = p_csm_id)
    and (p_secondary_assignee_id is null or c.csm_secondary_assignee_id = p_secondary_assignee_id)
    and (p_program_values is null or cardinality(p_program_values) = 0 or c.program_status_value = any(p_program_values))
    and (p_offer_id is null or c.offer_milestones_current_offer_id = p_offer_id)
    and (p_client_start_date_from is null or c.client_age_date_onboarded >= p_client_start_date_from)
    and (p_client_start_date_to is null or c.client_age_date_onboarded < p_client_start_date_to + interval '1 day')
    and (p_date_range_end is null or c.client_age_date_onboarded is null or c.client_age_date_onboarded < p_date_range_end + interval '1 day')
),
client_contract_dates as (
  select
    c.glide_row_id,
    coalesce(
      c.current_contract_end_date,
      case
        when c.current_contract_start_date is not null and c.current_contract_of_days is not null
          then c.current_contract_start_date + make_interval(days => c.current_contract_of_days::int)
        else null
      end
    ) as current_contract_end_date
  from filtered_clients c
),
contract_history as (
  select cc.client_id, cc.end_date
  from public.client_contracts cc
  join selected_company sc on sc.id = cc.company_id
  where sc.migration_status in ('pilot', 'migrated')

  union all

  select bcc.client_id, bcc.end_date
  from public.backup_company_clients_contracts bcc
  join filtered_clients fc on fc.glide_row_id = bcc.client_id
),
retained_history as (
  select distinct che.legacy_client_glide_row_id as client_id
  from public.client_history_events che
  join selected_company sc on sc.id = che.company_id
  where sc.migration_status in ('pilot', 'migrated')
    and (
      che.event_type = 'client_retention_recorded'
      or (
        che.event_type = 'client_status_changed'
        and (che.payload->>'to_status') in ('front-end', 'back-end')
        and (che.payload->>'from_status') in ('front-end', 'back-end')
      )
    )
    and (p_date_range_start is null or che.created_at >= p_date_range_start)
    and (p_date_range_end is null or che.created_at < p_date_range_end + interval '1 day')

  union

  select distinct bch.client_id
  from public.backup_company_clients_history bch
  join filtered_clients fc on fc.glide_row_id = bch.client_id
  where bch.change_type_code = 'program-status'
    and bch.value in ('front-end', 'back-end')
    and bch.original_value in ('front-end', 'back-end')
    and (p_date_range_start is null or bch.modified_date >= p_date_range_start)
    and (p_date_range_end is null or bch.modified_date < p_date_range_end + interval '1 day')
),
offboarded_clients as (
  select c.glide_row_id
  from filtered_clients c
  where c.program_status_value = 'off-boarded'
    and (
      p_date_range_start is null
      or coalesce(c.client_age_date_offboarded, c.client_age_date_offboarded_for_filtering) >= p_date_range_start
    )
    and (
      p_date_range_end is null
      or coalesce(c.client_age_date_offboarded, c.client_age_date_offboarded_for_filtering) < p_date_range_end + interval '1 day'
    )
),
churned_clients as (
  select c.glide_row_id
  from filtered_clients c
  join client_contract_dates cd on cd.glide_row_id = c.glide_row_id
  where c.program_status_value = 'off-boarded'
    and coalesce(c.client_age_date_offboarded, c.client_age_date_offboarded_for_filtering) is not null
    and cd.current_contract_end_date is not null
    and coalesce(c.client_age_date_offboarded, c.client_age_date_offboarded_for_filtering) < cd.current_contract_end_date
    and (
      p_date_range_start is null
      or coalesce(c.client_age_date_offboarded, c.client_age_date_offboarded_for_filtering) >= p_date_range_start
    )
    and (
      p_date_range_end is null
      or coalesce(c.client_age_date_offboarded, c.client_age_date_offboarded_for_filtering) < p_date_range_end + interval '1 day'
    )
),
renewing_clients as (
  select distinct c.glide_row_id
  from filtered_clients c
  join client_contract_dates cd on cd.glide_row_id = c.glide_row_id
  where c.program_status_value not in ('paused', 'suspended')
    and not exists (select 1 from churned_clients ch where ch.glide_row_id = c.glide_row_id)
    and cd.current_contract_end_date is not null
    and (p_date_range_start is null or cd.current_contract_end_date >= p_date_range_start)
    and (p_date_range_end is null or cd.current_contract_end_date < p_date_range_end + interval '1 day')

  union

  select distinct c.glide_row_id
  from filtered_clients c
  join contract_history ch on ch.client_id = c.glide_row_id
  where c.program_status_value not in ('paused', 'suspended')
    and not exists (select 1 from churned_clients churn where churn.glide_row_id = c.glide_row_id)
    and ch.end_date is not null
    and (p_date_range_start is null or ch.end_date >= p_date_range_start)
    and (p_date_range_end is null or ch.end_date < p_date_range_end + interval '1 day')
),
counts as (
  select
    count(*) filter (where program_status_value in ('front-end', 'back-end')) as active_clients,
    count(*) filter (where program_status_value = 'front-end') as front_end_clients,
    count(*) filter (where program_status_value = 'back-end') as back_end_clients,
    count(*) filter (where program_status_value = 'paused') as paused_clients,
    count(*) filter (where program_status_value = 'suspended') as suspended_clients,
    (select count(*) from offboarded_clients) as off_boarded_clients,
    (select count(*) from churned_clients) as churned_clients,
    (select count(*) from retained_history rh join filtered_clients fc on fc.glide_row_id = rh.client_id) as retained_clients,
    (select count(*) from renewing_clients) as renewing_clients,
    (
      select count(*)
      from renewing_clients rc
      join filtered_clients fc on fc.glide_row_id = rc.glide_row_id
      where fc.program_status_value in ('front-end', 'back-end')
        and not exists (select 1 from retained_history rh where rh.client_id = rc.glide_row_id)
    ) as active_renewing_clients
  from filtered_clients
)
select
  counts.active_clients,
  counts.front_end_clients,
  counts.back_end_clients,
  counts.paused_clients,
  counts.suspended_clients,
  counts.off_boarded_clients,
  counts.churned_clients,
  case
    when counts.front_end_clients + counts.back_end_clients + counts.off_boarded_clients = 0 then 0
    else round((counts.churned_clients::numeric / (counts.front_end_clients + counts.back_end_clients + counts.off_boarded_clients)::numeric) * 100)
  end as churn_percentage,
  counts.retained_clients,
  counts.renewing_clients,
  counts.active_renewing_clients,
  case
    when counts.renewing_clients = 0 then 0
    else round((counts.retained_clients::numeric / counts.renewing_clients::numeric) * 100)
  end as retention_percentage
from counts;
$$;

comment on function public.dashboard_kpi_counts_canonical is
  'Draft canonical Dashboard KPI function. Validate against Ethical Scaling pilot data before moving into migrations.';
