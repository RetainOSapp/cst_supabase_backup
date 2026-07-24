-- Operational rollback after the Ethical Scaling manual pilot. Preserve call,
-- transcript, run, usage, and audit evidence.

do $$
declare
  v_company_id constant uuid := '8c2e9c88-d939-49f8-b2ef-563b3c96c70c';
  v_actor_id constant uuid := '5e8e49d0-0da1-4994-8143-8f338f7ae1ac';
begin
  update public.ai_feature_global_controls
  set
    status = 'paused',
    status_reason = 'Ethical Scaling manual pilot rolled back',
    config_version = config_version + 1,
    changed_by_auth_user_id = v_actor_id,
    paused_at = statement_timestamp()
  where feature_key = 'call_analysis'
    and status = 'active';

  update public.company_ai_feature_entitlements
  set
    status = 'paused',
    paused_at = statement_timestamp(),
    config_version = config_version + 1,
    enabled_by_auth_user_id = v_actor_id
  where company_id = v_company_id
    and feature_key = 'call_analysis'
    and status in ('pilot', 'enabled');

  update public.company_ai_feature_allowances
  set
    status = 'superseded',
    effective_until = statement_timestamp(),
    changed_by_auth_user_id = v_actor_id,
    override_reason = 'Ethical Scaling manual Call Intelligence pilot rollback'
  where company_id = v_company_id
    and feature_key = 'call_analysis'
    and status = 'active';

  insert into public.app_audit_events (
    company_id, actor_auth_user_id, event_type, source, entity_table, entity_id,
    title, summary, metadata
  ) values (
    v_company_id,
    v_actor_id,
    'call_intelligence_pilot_rolled_back',
    'call_intelligence_manual_pilot_rollback',
    'ai_feature_global_controls',
    v_company_id,
    'Ethical Scaling Call Intelligence pilot rolled back',
    'Global processing paused and the company policy was closed; evidence preserved.',
    jsonb_build_object('feature_key', 'call_analysis')
  );
end;
$$;
