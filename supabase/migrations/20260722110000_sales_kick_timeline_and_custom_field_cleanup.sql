-- Remove the retired Sales Kick CSV-only custom fields and make the retained
-- contract checkpoints company-specific. Slack Channel Name is intentionally
-- preserved. The deleted values can be reconstructed from the approved import
-- CSV and scripts/import-sales-kick-historical-clients.mjs if ever required.

do $$
declare
  v_sales_kick_id uuid := '0736d983-9c9a-4f84-9251-8f103261f3ea'::uuid;
  v_moves_method_id uuid := '21586391-9a84-4072-9ae6-20436b27bea9'::uuid;
  v_removed_field_count integer;
  v_removed_value_count integer;
  v_slack_field_count integer;
  v_slack_value_count integer;
  v_updated_count integer;
  v_removed_keys text[] := array[
    'features_purchased',
    'onboarding_form_complete',
    'onboarding_call_complete',
    'grading_setup_complete',
    'calendar_management_setup_complete',
    'financial_data_setup_complete',
    'lns_setup_complete'
  ];
begin
  if not exists (
    select 1 from public.companies
    where id = v_sales_kick_id
      and name = 'Sales Kick'
      and legacy_glide_row_id = 'ret_369acea9c33549fe'
  ) then
    raise exception 'Expected Sales Kick company was not found';
  end if;

  if not exists (
    select 1 from public.companies
    where id = v_moves_method_id and name = 'Moves Method'
  ) then
    raise exception 'Expected Moves Method company was not found';
  end if;

  select count(*) into v_removed_field_count
  from public.company_custom_fields
  where company_id = v_sales_kick_id
    and status = 'active'
    and key = any(v_removed_keys);

  select count(*) into v_removed_value_count
  from public.client_custom_field_values value
  join public.company_custom_fields field on field.id = value.custom_field_id
  where value.company_id = v_sales_kick_id
    and field.company_id = v_sales_kick_id
    and field.key = any(v_removed_keys)
    and value.source_table = 'sales_kick_active_client_csv';

  select count(*) into v_slack_field_count
  from public.company_custom_fields
  where company_id = v_sales_kick_id
    and status = 'active'
    and key = 'slack_channel_name';

  select count(*) into v_slack_value_count
  from public.client_custom_field_values value
  join public.company_custom_fields field on field.id = value.custom_field_id
  where value.company_id = v_sales_kick_id
    and field.company_id = v_sales_kick_id
    and field.key = 'slack_channel_name';

  if v_removed_field_count <> 7 or v_removed_value_count <> 803 then
    raise exception
      'Sales Kick cleanup guard failed: expected 7 fields/803 imported values, found %/%',
      v_removed_field_count, v_removed_value_count;
  end if;

  if v_slack_field_count <> 1 or v_slack_value_count <> 119 then
    raise exception
      'Sales Kick Slack guard failed: expected 1 field/119 values, found %/%',
      v_slack_field_count, v_slack_value_count;
  end if;

  if exists (
    select 1
    from public.client_custom_field_values value
    join public.company_custom_fields field on field.id = value.custom_field_id
    where value.company_id = v_sales_kick_id
      and field.company_id = v_sales_kick_id
      and field.key = any(v_removed_keys)
      and value.source_table is distinct from 'sales_kick_active_client_csv'
  ) then
    raise exception 'Sales Kick cleanup found a non-import value; refusing to delete';
  end if;

  delete from public.client_custom_field_values value
  using public.company_custom_fields field
  where value.custom_field_id = field.id
    and value.company_id = v_sales_kick_id
    and field.company_id = v_sales_kick_id
    and field.key = any(v_removed_keys);

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 803 then
    raise exception 'Expected to delete 803 Sales Kick values, deleted %', v_updated_count;
  end if;

  update public.company_custom_fields
  set status = 'archived', archived_at = now(), updated_at = now()
  where company_id = v_sales_kick_id
    and status = 'active'
    and key = any(v_removed_keys);

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 7 then
    raise exception 'Expected to archive 7 Sales Kick fields, archived %', v_updated_count;
  end if;

  -- Sales Kick has no onboarding diagnostic checkpoint. Keep its existing
  -- contract-relative Strategic Review timing and give the marker its own label.
  update public.notification_preferences
  set in_app_enabled = false,
      metadata = coalesce(metadata, '{}'::jsonb)
        || '{"label":"Onboarding checkpoint"}'::jsonb,
      updated_at = now()
  where company_id = v_sales_kick_id
    and member_id is null
    and role is null
    and notification_type = 'diagnostic_due';

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'Expected one Sales Kick diagnostic preference, updated %', v_updated_count;
  end if;

  update public.notification_preferences
  set metadata = coalesce(metadata, '{}'::jsonb)
        || '{"label":"Strategic Review"}'::jsonb,
      updated_at = now()
  where company_id = v_sales_kick_id
    and member_id is null
    and role is null
    and notification_type = 'strategic_review_due';

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'Expected one Sales Kick Strategic Review preference, updated %', v_updated_count;
  end if;

  -- Preserve Moves Method's existing language now that checkpoint labels are
  -- no longer globally hardcoded by the frontend.
  update public.notification_preferences
  set metadata = coalesce(metadata, '{}'::jsonb)
        || '{"label":"Peak Diagnostic"}'::jsonb,
      updated_at = now()
  where company_id = v_moves_method_id
    and member_id is null
    and role is null
    and notification_type = 'diagnostic_due';

  update public.notification_preferences
  set metadata = coalesce(metadata, '{}'::jsonb)
        || '{"label":"Strategic Review"}'::jsonb,
      updated_at = now()
  where company_id = v_moves_method_id
    and member_id is null
    and role is null
    and notification_type = 'strategic_review_due';

  insert into public.app_audit_events (
    company_id,
    event_type,
    source,
    entity_table,
    entity_id,
    title,
    summary,
    metadata
  ) values (
    v_sales_kick_id,
    'company_customization_cleanup',
    'approved_support_cleanup',
    'companies',
    v_sales_kick_id,
    'Sales Kick custom-field and timeline cleanup',
    'Archived seven retired CSV-only custom fields, deleted their 803 imported values, preserved Slack Channel Name, and disabled the unused diagnostic checkpoint.',
    jsonb_build_object(
      'archived_field_keys', to_jsonb(v_removed_keys),
      'deleted_imported_value_count', 803,
      'preserved_field_key', 'slack_channel_name',
      'preserved_value_count', 119
    )
  );

  if exists (
    select 1
    from public.client_custom_field_values value
    join public.company_custom_fields field on field.id = value.custom_field_id
    where value.company_id = v_sales_kick_id
      and field.key = any(v_removed_keys)
  ) then
    raise exception 'Post-cleanup guard failed: retired Sales Kick values remain';
  end if;
end
$$;
