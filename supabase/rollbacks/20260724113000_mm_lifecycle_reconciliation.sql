-- Moves Method lifecycle reconciliation rollback.
--
-- Run only while the 20260724110000 additive foundation still exists. Restore
-- a row only when it still matches the applied correction, so later user edits
-- are never overwritten by rollback.

update public.company_settings
set dashboard_exclude_unassigned_clients = false
where company_id = '21586391-9a84-4072-9ae6-20436b27bea9'::uuid;

update public.company_members
set exclude_from_dashboard_analytics = false
where company_id = '21586391-9a84-4072-9ae6-20436b27bea9'::uuid
  and lower(btrim(name)) = 'jhoyce';

update public.clients
set
  exclude_from_dashboard_analytics = false,
  dashboard_analytics_exclusion_reason = null
where company_id = '21586391-9a84-4072-9ae6-20436b27bea9'::uuid;

update public.clients client
set
  client_age_date_offboarded =
    nullif(log.before_data ->> 'client_age_date_offboarded', '')::timestamptz,
  client_age_date_offboarded_for_filtering =
    nullif(
      log.before_data ->> 'client_age_date_offboarded_for_filtering',
      ''
    )::timestamptz
from public.dashboard_lifecycle_reconciliation_log log
where log.client_id = client.id
  and log.company_id = client.company_id
  and log.correction_type in (
    'safe_cst_offboard_date',
    'confirmed_cst_offboard_date'
  )
  and client.client_age_date_offboarded is not distinct from
    nullif(log.after_data ->> 'client_age_date_offboarded', '')::timestamptz
  and client.client_age_date_offboarded_for_filtering is not distinct from
    nullif(
      log.after_data ->> 'client_age_date_offboarded_for_filtering',
      ''
    )::timestamptz;

update public.clients client
set
  program_status_value =
    log.before_data ->> 'program_status_value',
  program_latest_suspended_date =
    nullif(
      log.before_data ->> 'program_latest_suspended_date',
      ''
    )::timestamptz,
  client_age_date_offboarded =
    nullif(log.before_data ->> 'client_age_date_offboarded', '')::timestamptz,
  client_age_date_offboarded_for_filtering =
    nullif(
      log.before_data ->> 'client_age_date_offboarded_for_filtering',
      ''
    )::timestamptz,
  churn_reason_value =
    nullif(log.before_data ->> 'churn_reason_value', '')
from public.dashboard_lifecycle_reconciliation_log log
where log.client_id = client.id
  and log.company_id = client.company_id
  and log.correction_type = 'status_offboard_date_contradiction'
  and client.program_status_value = 'off-boarded'
  and client.client_age_date_offboarded is not distinct from
    nullif(log.after_data ->> 'client_age_date_offboarded', '')::timestamptz;

-- Restore both timer-only backfills and rows subsequently processed by the
-- suspended timeout worker, but only while their automation evidence matches.
update public.clients client
set
  program_status_value =
    coalesce(log.before_data ->> 'program_status_value', 'suspended'),
  program_latest_suspended_date =
    nullif(
      log.before_data ->> 'program_latest_suspended_date',
      ''
    )::timestamptz,
  client_age_date_offboarded =
    nullif(log.before_data ->> 'client_age_date_offboarded', '')::timestamptz,
  client_age_date_offboarded_for_filtering =
    nullif(
      log.before_data ->> 'client_age_date_offboarded_for_filtering',
      ''
    )::timestamptz,
  churn_reason_value =
    nullif(log.before_data ->> 'churn_reason_value', '')
from public.dashboard_lifecycle_reconciliation_log log
where log.client_id = client.id
  and log.company_id = client.company_id
  and log.correction_type = 'mia_timer_backfill'
  and (
    (
      client.program_status_value = 'suspended'
      and client.program_latest_suspended_date is not distinct from
        nullif(
          log.after_data ->> 'program_latest_suspended_date',
          ''
        )::timestamptz
    )
    or (
      client.program_status_value = 'off-boarded'
      and client.churn_reason_value = 'auto_suspended_timeout'
      and client.metadata -> 'offboarding' ->> 'automation' =
        'suspended_timeout'
    )
  );

insert into public.app_audit_events (
  company_id,
  event_type,
  source,
  entity_table,
  title,
  summary,
  metadata
)
values (
  '21586391-9a84-4072-9ae6-20436b27bea9'::uuid,
  'dashboard_lifecycle_reconciliation_rolled_back',
  'dashboard_lifecycle_reconciliation',
  'clients',
  'Dashboard lifecycle reconciliation rolled back',
  'Restored still-matching Moves Method lifecycle corrections and disabled analytics exclusions.',
  jsonb_build_object(
    'rollback', '20260724113000_mm_lifecycle_reconciliation'
  )
);

notify pgrst, 'reload schema';
