-- Permit bounded pilot stress QA while retaining minute, concurrency, company,
-- and hard-dollar controls.

update public.ai_feature_global_controls
set actor_requests_per_day = 100,
    config_version = config_version + 1,
    changed_by_auth_user_id = (
      select admin.auth_user_id
      from public.retainos_super_admins admin
      where lower(admin.email) = 'jay@ethicalscaling.com'
        and admin.status = 'active'
      limit 1
    ),
    updated_at = now()
where feature_key = 'beacon'
  and actor_requests_per_day = 50;

insert into public.security_rollout_history (version, migration_name, details)
values (
  '20260714021000',
  'beacon_pilot_daily_limit',
  jsonb_build_object(
    'actor_requests_per_day', 100,
    'actor_requests_per_minute_unchanged', 5,
    'company_requests_per_day_unchanged', 250,
    'reason', 'bounded_ethical_scaling_stress_qa'
  )
)
on conflict (version) do update
set migration_name = excluded.migration_name,
    details = excluded.details,
    applied_at = now();

notify pgrst, 'reload schema';
