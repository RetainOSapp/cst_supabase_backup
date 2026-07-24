-- Moves Method dashboard lifecycle reconciliation.
--
-- Approved rules:
--   * Jhoyce-owned and unresolved/unassigned clients are preserved but excluded
--     from executive dashboard analytics.
--   * migrated offboard dates may be corrected only when CST is authoritative
--     and there is no later app-owned status change;
--   * Christopher I'Anson is the one explicitly confirmed manual exception;
--   * a current MIA row with an existing actual offboard date is an offboarded
--     lifecycle contradiction, not a current MIA;
--   * missing migrated MIA timer dates are recovered from CST history. The
--     separately deployed 28-day worker remains responsible for due offboards.

do $$
begin
  if not exists (
    select 1
    from public.companies company
    where company.id = '21586391-9a84-4072-9ae6-20436b27bea9'::uuid
      and company.legacy_glide_row_id = 'wd7vy0vaQK2hgB3IRqy17w'
      and company.name = 'Moves Method'
      and company.migration_status = 'migrated'
  ) then
    raise exception 'Moves Method migrated workspace was not found';
  end if;
end $$;

create temporary table mm_cst_program_status
on commit drop
as
select
  history.client_id,
  history.modified_date,
  history.original_value,
  history.value,
  history.modified_by,
  history.glide_row_id as history_glide_row_id
from public.backup_company_clients_history history
join public.clients client
  on client.glide_row_id = history.client_id
 and client.company_id =
   '21586391-9a84-4072-9ae6-20436b27bea9'::uuid
where history.change_type_code = 'program-status'
;

create index mm_cst_program_status_client_date_idx
  on mm_cst_program_status (client_id, modified_date desc);

create temporary table mm_latest_cst_program_status
on commit drop
as
select distinct on (history.client_id)
  history.*
from pg_temp.mm_cst_program_status history
order by
  history.client_id,
  history.modified_date desc nulls last,
  history.history_glide_row_id desc;

create unique index mm_latest_cst_program_status_client_idx
  on mm_latest_cst_program_status (client_id);

create temporary table mm_latest_cst_offboard_status
on commit drop
as
select distinct on (history.client_id)
  history.*
from pg_temp.mm_cst_program_status history
where history.value = 'off-boarded'
order by
  history.client_id,
  history.modified_date desc nulls last,
  history.history_glide_row_id desc;

create unique index mm_latest_cst_offboard_status_client_idx
  on mm_latest_cst_offboard_status (client_id);

create temporary table mm_clients_with_app_status_change
on commit drop
as
select distinct audit.legacy_glide_row_id as client_id
from public.app_audit_events audit
where audit.company_id =
    '21586391-9a84-4072-9ae6-20436b27bea9'::uuid
  and audit.event_type = 'client_status_changed'
  and audit.legacy_glide_row_id is not null;

create unique index mm_clients_with_app_status_change_client_idx
  on mm_clients_with_app_status_change (client_id);

update public.company_settings
set dashboard_exclude_unassigned_clients = true
where company_id = '21586391-9a84-4072-9ae6-20436b27bea9'::uuid;

update public.company_members
set exclude_from_dashboard_analytics = true
where company_id = '21586391-9a84-4072-9ae6-20436b27bea9'::uuid
  and lower(btrim(name)) = 'jhoyce'
  and status = 'active'
  and archived_at is null;

-- Mark the approved excluded-owner cohort.
update public.clients client
set
  exclude_from_dashboard_analytics = true,
  dashboard_analytics_exclusion_reason = 'excluded_primary_member'
where client.company_id = '21586391-9a84-4072-9ae6-20436b27bea9'::uuid
  and exists (
    select 1
    from public.company_members member
    where member.company_id = client.company_id
      and member.exclude_from_dashboard_analytics = true
      and client.csm_team_member_id in (
        member.id::text,
        member.legacy_glide_row_id
      )
  );

-- Mark blank assignments and assignments that no longer resolve to an active
-- member. They remain available in Clients for reconciliation.
update public.clients client
set
  exclude_from_dashboard_analytics = true,
  dashboard_analytics_exclusion_reason = 'unassigned_or_inactive_primary'
where client.company_id = '21586391-9a84-4072-9ae6-20436b27bea9'::uuid
  and not client.exclude_from_dashboard_analytics
  and (
    nullif(btrim(client.csm_team_member_id), '') is null
    or not exists (
      select 1
      from public.company_members member
      where member.company_id = client.company_id
        and member.status = 'active'
        and member.archived_at is null
        and client.csm_team_member_id in (
          member.id::text,
          member.legacy_glide_row_id
        )
    )
  );

-- 1. Safe CST offboard-date corrections: the migrated source snapshot was
-- already offboarded, CST's latest status is offboarded, and RetainOS has no
-- later app-owned status change for the client.
with eligible as (
  select
    client.*,
    history.modified_date as corrected_offboarded_at,
    history.original_value as cst_from_status,
    history.modified_by as cst_modified_by,
    history.history_glide_row_id
  from public.clients client
  join pg_temp.mm_latest_cst_program_status history
    on history.client_id = client.glide_row_id
   and history.value = 'off-boarded'
  where client.company_id =
      '21586391-9a84-4072-9ae6-20436b27bea9'::uuid
    and client.program_status_value = 'off-boarded'
    and history.modified_date is not null
    and coalesce(
      client.source_snapshot ->> 'program_status_value',
      client.source_snapshot -> 'data' ->> 'jhL6I'
    ) = 'off-boarded'
    and not exists (
      select 1
      from pg_temp.mm_clients_with_app_status_change changed
      where changed.client_id = client.glide_row_id
    )
    and date_trunc(
      'month',
      coalesce(
        client.client_age_date_offboarded,
        client.client_age_date_offboarded_for_filtering
      )
    ) is distinct from date_trunc('month', history.modified_date)
)
insert into public.dashboard_lifecycle_reconciliation_log (
  company_id,
  client_id,
  legacy_client_glide_row_id,
  correction_type,
  classification,
  before_data,
  after_data,
  evidence,
  applied_at
)
select
  eligible.company_id,
  eligible.id,
  eligible.glide_row_id,
  'safe_cst_offboard_date',
  'applied',
  jsonb_build_object(
    'client_name', eligible.client_name,
    'program_status_value', eligible.program_status_value,
    'client_age_date_offboarded', eligible.client_age_date_offboarded,
    'client_age_date_offboarded_for_filtering',
      eligible.client_age_date_offboarded_for_filtering
  ),
  jsonb_build_object(
    'client_age_date_offboarded', eligible.corrected_offboarded_at,
    'client_age_date_offboarded_for_filtering',
      eligible.corrected_offboarded_at
  ),
  jsonb_build_object(
    'source', 'backup_company_clients_history',
    'history_glide_row_id', eligible.history_glide_row_id,
    'from_status', eligible.cst_from_status,
    'to_status', 'off-boarded',
    'modified_by', eligible.cst_modified_by,
    'modified_date', eligible.corrected_offboarded_at
  ),
  now()
from eligible
on conflict (company_id, legacy_client_glide_row_id, correction_type)
do nothing;

update public.clients client
set
  client_age_date_offboarded =
    (log.after_data ->> 'client_age_date_offboarded')::timestamptz,
  client_age_date_offboarded_for_filtering =
    (log.after_data ->> 'client_age_date_offboarded_for_filtering')::timestamptz,
  metadata = coalesce(client.metadata, '{}'::jsonb) || jsonb_build_object(
    'dashboard_lifecycle_reconciliation',
    jsonb_build_object(
      'correction_type', log.correction_type,
      'corrected_at', log.applied_at,
      'source', 'cst_program_status_history'
    )
  )
from public.dashboard_lifecycle_reconciliation_log log
where log.company_id = client.company_id
  and log.client_id = client.id
  and log.correction_type = 'safe_cst_offboard_date'
  and log.classification = 'applied'
  and client.company_id =
    '21586391-9a84-4072-9ae6-20436b27bea9'::uuid;

-- 2. Explicitly confirmed CST correction for Christopher I'Anson. His May 12
-- CST offboard event predates a duplicate July RetainOS offboard action.
with confirmed as (
  select
    client.*,
    history.modified_date as corrected_offboarded_at,
    history.glide_row_id as history_glide_row_id,
    history.modified_by
  from public.clients client
  join public.backup_company_clients_history history
    on history.client_id = client.glide_row_id
   and history.change_type_code = 'program-status'
   and history.value = 'off-boarded'
  where client.company_id =
      '21586391-9a84-4072-9ae6-20436b27bea9'::uuid
    and client.glide_row_id = 'HeeH6xHKT8K0MJBuJzn1aw'
    and history.modified_date = '2026-05-12T07:53:06.471Z'::timestamptz
)
insert into public.dashboard_lifecycle_reconciliation_log (
  company_id,
  client_id,
  legacy_client_glide_row_id,
  correction_type,
  classification,
  before_data,
  after_data,
  evidence,
  applied_at
)
select
  confirmed.company_id,
  confirmed.id,
  confirmed.glide_row_id,
  'confirmed_cst_offboard_date',
  'applied',
  jsonb_build_object(
    'client_name', confirmed.client_name,
    'program_status_value', confirmed.program_status_value,
    'client_age_date_offboarded', confirmed.client_age_date_offboarded,
    'client_age_date_offboarded_for_filtering',
      confirmed.client_age_date_offboarded_for_filtering
  ),
  jsonb_build_object(
    'client_age_date_offboarded', confirmed.corrected_offboarded_at,
    'client_age_date_offboarded_for_filtering',
      confirmed.corrected_offboarded_at
  ),
  jsonb_build_object(
    'source', 'backup_company_clients_history',
    'history_glide_row_id', confirmed.history_glide_row_id,
    'modified_by', confirmed.modified_by,
    'modified_date', confirmed.corrected_offboarded_at,
    'confirmation', 'Izabella named example'
  ),
  now()
from confirmed
on conflict (company_id, legacy_client_glide_row_id, correction_type)
do nothing;

update public.clients client
set
  client_age_date_offboarded =
    (log.after_data ->> 'client_age_date_offboarded')::timestamptz,
  client_age_date_offboarded_for_filtering =
    (log.after_data ->> 'client_age_date_offboarded_for_filtering')::timestamptz,
  metadata = coalesce(client.metadata, '{}'::jsonb) || jsonb_build_object(
    'dashboard_lifecycle_reconciliation',
    jsonb_build_object(
      'correction_type', log.correction_type,
      'corrected_at', log.applied_at,
      'source', 'confirmed_cst_program_status_history'
    )
  )
from public.dashboard_lifecycle_reconciliation_log log
where log.company_id = client.company_id
  and log.client_id = client.id
  and log.correction_type = 'confirmed_cst_offboard_date'
  and log.classification = 'applied';

-- 3. Preserve every other app-owned mismatch for manual review. No client
-- mutation is performed for this cohort.
with review as (
  select
    client.*,
    history.modified_date as cst_offboarded_at,
    history.original_value as cst_from_status,
    history.modified_by as cst_modified_by,
    history.history_glide_row_id
  from public.clients client
  join pg_temp.mm_latest_cst_offboard_status history
    on history.client_id = client.glide_row_id
   and history.value = 'off-boarded'
  where client.company_id =
      '21586391-9a84-4072-9ae6-20436b27bea9'::uuid
    and client.program_status_value = 'off-boarded'
    and history.modified_date is not null
    and date_trunc(
      'month',
      coalesce(
        client.client_age_date_offboarded,
        client.client_age_date_offboarded_for_filtering
      )
    ) is distinct from date_trunc('month', history.modified_date)
    and exists (
      select 1
      from pg_temp.mm_clients_with_app_status_change changed
      where changed.client_id = client.glide_row_id
    )
    and client.glide_row_id <> 'HeeH6xHKT8K0MJBuJzn1aw'
)
insert into public.dashboard_lifecycle_reconciliation_log (
  company_id,
  client_id,
  legacy_client_glide_row_id,
  correction_type,
  classification,
  before_data,
  after_data,
  evidence
)
select
  review.company_id,
  review.id,
  review.glide_row_id,
  'app_status_date_review',
  'review_required',
  jsonb_build_object(
    'client_name', review.client_name,
    'program_status_value', review.program_status_value,
    'client_age_date_offboarded', review.client_age_date_offboarded,
    'client_age_date_offboarded_for_filtering',
      review.client_age_date_offboarded_for_filtering
  ),
  '{}'::jsonb,
  jsonb_build_object(
    'source', 'backup_company_clients_history',
    'history_glide_row_id', review.history_glide_row_id,
    'from_status', review.cst_from_status,
    'to_status', 'off-boarded',
    'modified_by', review.cst_modified_by,
    'modified_date', review.cst_offboarded_at,
    'reason', 'later app-owned status change requires review'
  )
from review
on conflict (company_id, legacy_client_glide_row_id, correction_type)
do nothing;

-- 4. A current MIA row with an actual offboard date is contradictory. Preserve
-- the recorded date and reconcile the current lifecycle status.
insert into public.dashboard_lifecycle_reconciliation_log (
  company_id,
  client_id,
  legacy_client_glide_row_id,
  correction_type,
  classification,
  before_data,
  after_data,
  evidence,
  applied_at
)
select
  client.company_id,
  client.id,
  client.glide_row_id,
  'status_offboard_date_contradiction',
  'applied',
  jsonb_build_object(
    'client_name', client.client_name,
    'program_status_value', client.program_status_value,
    'program_latest_suspended_date', client.program_latest_suspended_date,
    'client_age_date_offboarded', client.client_age_date_offboarded,
    'client_age_date_offboarded_for_filtering',
      client.client_age_date_offboarded_for_filtering,
    'churn_reason_value', client.churn_reason_value
  ),
  jsonb_build_object(
    'program_status_value', 'off-boarded',
    'client_age_date_offboarded',
      coalesce(
        client.client_age_date_offboarded,
        client.client_age_date_offboarded_for_filtering
      ),
    'client_age_date_offboarded_for_filtering',
      coalesce(
        client.client_age_date_offboarded,
        client.client_age_date_offboarded_for_filtering
      ),
    'churn_reason_value',
      case
        when client.glide_row_id = 'STDVPh9NTMGtGZhABZ9eBQ'
        then 'drop_off'
        else client.churn_reason_value
      end
  ),
  jsonb_build_object(
    'source', 'migrated_client_summary',
    'reason', 'current MIA status conflicts with an actual offboard date'
  ),
  now()
from public.clients client
where client.company_id =
    '21586391-9a84-4072-9ae6-20436b27bea9'::uuid
  and client.program_status_value = 'suspended'
  and coalesce(
    client.client_age_date_offboarded,
    client.client_age_date_offboarded_for_filtering
  ) is not null
on conflict (company_id, legacy_client_glide_row_id, correction_type)
do nothing;

update public.clients client
set
  program_status_value = 'off-boarded',
  client_age_date_offboarded =
    (log.after_data ->> 'client_age_date_offboarded')::timestamptz,
  client_age_date_offboarded_for_filtering =
    (log.after_data ->> 'client_age_date_offboarded_for_filtering')::timestamptz,
  churn_reason_value = log.after_data ->> 'churn_reason_value',
  metadata = coalesce(client.metadata, '{}'::jsonb) || jsonb_build_object(
    'dashboard_lifecycle_reconciliation',
    jsonb_build_object(
      'correction_type', log.correction_type,
      'corrected_at', log.applied_at,
      'source', 'recorded_offboard_date'
    )
  )
from public.dashboard_lifecycle_reconciliation_log log
where log.company_id = client.company_id
  and log.client_id = client.id
  and log.correction_type = 'status_offboard_date_contradiction'
  and log.classification = 'applied';

insert into public.client_history_events (
  company_id,
  legacy_client_glide_row_id,
  event_type,
  source,
  title,
  summary,
  payload,
  created_at
)
select
  log.company_id,
  log.legacy_client_glide_row_id,
  'client_status_changed',
  'dashboard_lifecycle_reconciliation',
  'Client lifecycle reconciled',
  'Reconciled a migrated MIA status with its recorded offboard date.',
  jsonb_build_object(
    'from_status', 'suspended',
    'to_status', 'off-boarded',
    'effective_at', log.after_data ->> 'client_age_date_offboarded',
    'correction_type', log.correction_type,
    'reconciliation_log_id', log.id
  ),
  coalesce(
    (log.after_data ->> 'client_age_date_offboarded')::timestamptz,
    now()
  )
from public.dashboard_lifecycle_reconciliation_log log
where log.company_id =
    '21586391-9a84-4072-9ae6-20436b27bea9'::uuid
  and log.correction_type = 'status_offboard_date_contradiction'
  and log.classification = 'applied'
  and not exists (
    select 1
    from public.client_history_events history
    where history.company_id = log.company_id
      and history.legacy_client_glide_row_id =
        log.legacy_client_glide_row_id
      and history.source = 'dashboard_lifecycle_reconciliation'
      and history.payload ->> 'reconciliation_log_id' = log.id::text
  );

-- 5. Recover the missing MIA timer date from the latest CST transition. Only
-- still-current MIA clients without an offboard date are eligible.
insert into public.dashboard_lifecycle_reconciliation_log (
  company_id,
  client_id,
  legacy_client_glide_row_id,
  correction_type,
  classification,
  before_data,
  after_data,
  evidence,
  applied_at
)
select
  client.company_id,
  client.id,
  client.glide_row_id,
  'mia_timer_backfill',
  'applied',
  jsonb_build_object(
    'client_name', client.client_name,
    'program_status_value', client.program_status_value,
    'program_latest_suspended_date', client.program_latest_suspended_date,
    'client_age_date_offboarded', client.client_age_date_offboarded,
    'client_age_date_offboarded_for_filtering',
      client.client_age_date_offboarded_for_filtering,
    'churn_reason_value', client.churn_reason_value
  ),
  jsonb_build_object(
    'program_latest_suspended_date', history.modified_date
  ),
  jsonb_build_object(
    'source', 'backup_company_clients_history',
    'history_glide_row_id', history.history_glide_row_id,
    'modified_by', history.modified_by,
    'modified_date', history.modified_date,
    'to_status', 'suspended'
  ),
  now()
from public.clients client
join pg_temp.mm_latest_cst_program_status history
  on history.client_id = client.glide_row_id
where client.company_id =
    '21586391-9a84-4072-9ae6-20436b27bea9'::uuid
  and client.program_status_value = 'suspended'
  and client.program_latest_suspended_date is null
  and client.client_age_date_offboarded is null
  and client.client_age_date_offboarded_for_filtering is null
  and history.value = 'suspended'
  and history.modified_date is not null
on conflict (company_id, legacy_client_glide_row_id, correction_type)
do nothing;

update public.clients client
set
  program_latest_suspended_date =
    (log.after_data ->> 'program_latest_suspended_date')::timestamptz,
  metadata = coalesce(client.metadata, '{}'::jsonb) || jsonb_build_object(
    'dashboard_lifecycle_reconciliation',
    jsonb_build_object(
      'correction_type', log.correction_type,
      'corrected_at', log.applied_at,
      'source', 'cst_program_status_history'
    )
  )
from public.dashboard_lifecycle_reconciliation_log log
where log.company_id = client.company_id
  and log.client_id = client.id
  and log.correction_type = 'mia_timer_backfill'
  and log.classification = 'applied'
  and client.program_status_value = 'suspended'
  and client.program_latest_suspended_date is null;

-- Internal audit summaries. Detailed before/after evidence remains in the
-- reconciliation log and is never exposed to ordinary dashboard users.
insert into public.app_audit_events (
  company_id,
  event_type,
  source,
  entity_table,
  title,
  summary,
  after_data,
  metadata
)
select
  '21586391-9a84-4072-9ae6-20436b27bea9'::uuid,
  'dashboard_analytics_exclusions_configured',
  'dashboard_lifecycle_reconciliation',
  'company_settings',
  'Dashboard analytics exclusions configured',
  'Excluded approved owner and unresolved assignment cohorts from dashboard analytics.',
  jsonb_build_object(
    'excluded_primary_member_clients',
      count(*) filter (
        where client.dashboard_analytics_exclusion_reason =
          'excluded_primary_member'
      ),
    'unassigned_or_inactive_primary_clients',
      count(*) filter (
        where client.dashboard_analytics_exclusion_reason =
          'unassigned_or_inactive_primary'
      )
  ),
  jsonb_build_object(
    'company', 'Moves Method',
    'exclude_unassigned_clients', true,
    'excluded_member', 'Jhoyce'
  )
from public.clients client
where client.company_id =
  '21586391-9a84-4072-9ae6-20436b27bea9'::uuid
having not exists (
  select 1
  from public.app_audit_events audit
  where audit.company_id =
      '21586391-9a84-4072-9ae6-20436b27bea9'::uuid
    and audit.event_type = 'dashboard_analytics_exclusions_configured'
    and audit.source = 'dashboard_lifecycle_reconciliation'
);

insert into public.app_audit_events (
  company_id,
  event_type,
  source,
  entity_table,
  entity_id,
  legacy_glide_row_id,
  title,
  summary,
  before_data,
  after_data,
  metadata,
  created_at
)
select
  log.company_id,
  'dashboard_lifecycle_reconciled',
  'dashboard_lifecycle_reconciliation',
  'clients',
  log.client_id,
  log.legacy_client_glide_row_id,
  'Dashboard lifecycle reconciled',
  case log.correction_type
    when 'safe_cst_offboard_date'
      then 'Corrected a migrated offboard date from authoritative CST history.'
    when 'confirmed_cst_offboard_date'
      then 'Corrected a confirmed duplicate offboard date from CST history.'
    when 'status_offboard_date_contradiction'
      then 'Reconciled a current MIA status with its recorded offboard date.'
    when 'mia_timer_backfill'
      then 'Recovered a missing migrated MIA timer date from CST history.'
    else 'Reconciled migrated dashboard lifecycle data.'
  end,
  log.before_data,
  log.after_data,
  log.evidence,
  log.applied_at
from public.dashboard_lifecycle_reconciliation_log log
where log.company_id =
    '21586391-9a84-4072-9ae6-20436b27bea9'::uuid
  and log.classification = 'applied'
  and not exists (
    select 1
    from public.app_audit_events audit
    where audit.company_id = log.company_id
      and audit.entity_id = log.client_id
      and audit.event_type = 'dashboard_lifecycle_reconciled'
      and audit.source = 'dashboard_lifecycle_reconciliation'
      and audit.metadata ->> 'history_glide_row_id'
        is not distinct from log.evidence ->> 'history_glide_row_id'
      and audit.after_data = log.after_data
  );

notify pgrst, 'reload schema';
