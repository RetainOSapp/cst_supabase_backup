-- Moves Method approved the Suspended/MIA automation with a 28-day grace
-- period. No other company is enabled.

do $enable$
declare
  v_company public.companies%rowtype;
  v_before public.company_settings%rowtype;
  v_after public.company_settings%rowtype;
begin
  select * into strict v_company
  from public.companies
  where id = '21586391-9a84-4072-9ae6-20436b27bea9'::uuid
    and legacy_glide_row_id = 'wd7vy0vaQK2hgB3IRqy17w'
    and name = 'Moves Method';

  select * into strict v_before
  from public.company_settings
  where company_id = v_company.id
  for update;

  update public.company_settings
  set
    enable_suspended_auto_offboard = true,
    suspended_auto_offboard_days = 28
  where company_id = v_company.id
  returning * into v_after;

  insert into public.company_churn_reasons (
    company_id,
    value,
    label,
    category,
    requires_notes,
    counts_as_churn,
    position,
    status,
    metadata
  ) values (
    v_company.id,
    'auto_suspended_timeout',
    'MIA auto-offboard',
    'automation',
    false,
    true,
    1000,
    'active',
    jsonb_build_object(
      'system_managed', true,
      'automation', 'suspended_timeout'
    )
  )
  on conflict (company_id, value) do update
  set
    label = excluded.label,
    category = excluded.category,
    requires_notes = false,
    counts_as_churn = true,
    status = 'active',
    archived_at = null,
    metadata = coalesce(
      public.company_churn_reasons.metadata,
      '{}'::jsonb
    ) || excluded.metadata;

  if v_before.enable_suspended_auto_offboard is distinct from true
    or v_before.suspended_auto_offboard_days is distinct from 28 then
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
      metadata
    ) values (
      v_company.id,
      'company_customization_update_settings',
      'approved_mia_auto_offboard_rollout',
      'company_settings',
      v_after.id,
      v_company.legacy_glide_row_id,
      'MIA auto-offboarding enabled',
      'Moves Method enabled automatic offboarding after 28 days in MIA.',
      to_jsonb(v_before),
      to_jsonb(v_after),
      jsonb_build_object(
        'approved_by', 'Jay',
        'automation', 'suspended_timeout',
        'grace_days', 28
      )
    );
  end if;
end;
$enable$;

notify pgrst, 'reload schema';
