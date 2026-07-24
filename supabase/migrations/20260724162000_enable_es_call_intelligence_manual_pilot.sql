-- Enable the first Call Intelligence pilot only after the product UI, actor
-- boundary, policy management, zero-usage allowance, and rollback are live.
-- This pilot deliberately creates no webhook token and permits no Zapier
-- traffic. The first source must be an authenticated manual upload.

do $$
declare
  v_company_id constant uuid := '8c2e9c88-d939-49f8-b2ef-563b3c96c70c';
  v_actor_id constant uuid := '5e8e49d0-0da1-4994-8143-8f338f7ae1ac';
  v_control public.ai_feature_global_controls%rowtype;
begin
  if not exists (
    select 1
    from public.companies company
    where company.id = v_company_id
      and company.name = 'Ethical Scaling'
      and company.migration_status = 'pilot'
      and company.archived_at is null
  ) then
    raise exception using
      errcode = '55000',
      message = 'Ethical Scaling pilot company preflight failed';
  end if;

  select control.*
  into strict v_control
  from public.ai_feature_global_controls control
  where control.feature_key = 'call_analysis'
  for update;

  if v_control.status <> 'paused' or v_control.config_version <> 1 then
    raise exception using
      errcode = '55000',
      message = 'Call Intelligence global control is not at the approved paused baseline';
  end if;

  if not exists (
    select 1
    from public.company_ai_feature_entitlements entitlement
    where entitlement.company_id = v_company_id
      and entitlement.feature_key = 'call_analysis'
      and entitlement.status = 'pilot'
  ) or exists (
    select 1
    from public.company_ai_feature_entitlements entitlement
    where entitlement.feature_key = 'call_analysis'
      and entitlement.company_id <> v_company_id
      and entitlement.status in ('pilot', 'enabled')
  ) then
    raise exception using
      errcode = '55000',
      message = 'Call Intelligence company entitlement preflight failed';
  end if;

  if (
    select count(*)
    from public.company_ai_feature_allowances allowance
    where allowance.company_id = v_company_id
      and allowance.feature_key = 'call_analysis'
      and allowance.status = 'active'
      and allowance.meter_type = 'usd_cents'
      and allowance.period_type = 'one_time'
      and allowance.limit_value = 100
      and allowance.hard_stop
  ) <> 1 then
    raise exception using
      errcode = '55000',
      message = 'Call Intelligence one-dollar hard allowance preflight failed';
  end if;

  if exists (
    select 1
    from public.company_integration_secrets secret
    where secret.integration_type = 'call_ai_transcript'
      and secret.status = 'active'
  ) or exists (
    select 1 from public.call_intelligence_calls
    union all
    select 1 from public.call_intelligence_runs
    union all
    select 1 from public.call_intelligence_usage_events
  ) then
    raise exception using
      errcode = '55000',
      message = 'Call Intelligence pilot must begin without tokens or traffic';
  end if;

  update public.ai_feature_global_controls
  set
    status = 'active',
    status_reason = 'Ethical Scaling authenticated manual-upload pilot',
    config_version = config_version + 1,
    changed_by_auth_user_id = v_actor_id,
    activated_at = statement_timestamp(),
    server_metadata = coalesce(server_metadata, '{}'::jsonb) ||
      jsonb_build_object(
        'pilot_company_id', v_company_id,
        'pilot_source', 'authenticated_manual_upload',
        'hard_cap_cents', 100,
        'webhook_enabled', false
      )
  where feature_key = 'call_analysis';

  insert into public.app_audit_events (
    company_id,
    actor_auth_user_id,
    event_type,
    source,
    entity_table,
    entity_id,
    title,
    summary,
    before_data,
    after_data,
    metadata
  ) values (
    v_company_id,
    v_actor_id,
    'call_intelligence_pilot_enabled',
    'call_intelligence_manual_pilot_release',
    'ai_feature_global_controls',
    v_company_id,
    'Ethical Scaling Call Intelligence pilot enabled',
    'Authenticated manual upload only; no webhook token or Zapier automation.',
    jsonb_build_object(
      'status', v_control.status,
      'config_version', v_control.config_version
    ),
    jsonb_build_object(
      'status', 'active',
      'config_version', v_control.config_version + 1,
      'hard_cap_cents', 100
    ),
    jsonb_build_object(
      'feature_key', 'call_analysis',
      'webhook_enabled', false,
      'retention', 'keep_until_pilot_approval'
    )
  );
end;
$$;
