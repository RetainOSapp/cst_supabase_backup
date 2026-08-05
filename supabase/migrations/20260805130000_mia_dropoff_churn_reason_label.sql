-- Preserve company-owned labels for the system-managed MIA timeout reason.
--
-- The stable reason value remains `auto_suspended_timeout`, so existing and
-- future automatic offboards stay in one Churn Reasons chart segment. The
-- worker may seed a missing reason, but it must not overwrite a label that a
-- company has chosen.

do $worker_patch$
declare
  function_definition text;
  old_reason_lookup constant text := $old$
      v_churn_label := v_status_label || ' auto-offboard';
$old$;
  new_reason_lookup constant text := $new$
      select nullif(btrim(reason.label), '')
        into v_churn_label
      from public.company_churn_reasons reason
      where reason.company_id = v_due.company_id
        and reason.value = 'auto_suspended_timeout'
      limit 1;
      v_churn_label := coalesce(
        v_churn_label,
        v_status_label || ' auto-offboard'
      );
$new$;
  old_summary constant text := $old$
      v_summary := format(
        'Automatically changed from %s to Offboarded after %s days without returning. Churn effective %s.',
        v_status_label,
        v_due.suspended_auto_offboard_days,
        v_effective_at::date
      );
$old$;
  new_summary constant text := $new$
      v_summary := format(
        'Automatically changed from %s to Offboarded after %s days without returning. Exit outcome Dropoff; churn reason %s. Churn effective %s.',
        v_status_label,
        v_due.suspended_auto_offboard_days,
        v_churn_label,
        v_effective_at::date
      );
$new$;
  old_upsert constant text := $old$
      set
        label = excluded.label,
        category = excluded.category,
$old$;
  new_upsert constant text := $new$
      set
        label = coalesce(
          nullif(btrim(public.company_churn_reasons.label), ''),
          excluded.label
        ),
        category = excluded.category,
$new$;
  old_history_reason constant text := $old$
          'reason', 'auto_suspended_timeout',
          'automation', 'suspended_timeout',
$old$;
  new_history_reason constant text := $new$
          'reason', 'auto_suspended_timeout',
          'reason_label', v_churn_label,
          'exit_outcome', 'dropoff',
          'automation', 'suspended_timeout',
$new$;
  replacement_count integer;
begin
  select pg_get_functiondef(
    'public.process_due_suspended_auto_offboards(timestamptz,integer)'::regprocedure
  ) into function_definition;

  replacement_count :=
    (
      length(function_definition)
      - length(replace(function_definition, old_reason_lookup, ''))
    ) / length(old_reason_lookup);
  if replacement_count <> 1 then
    raise exception
      'Expected one MIA auto-offboard reason-label assignment, found %',
      replacement_count;
  end if;
  function_definition := replace(
    function_definition,
    old_reason_lookup,
    new_reason_lookup
  );

  replacement_count :=
    (
      length(function_definition)
      - length(replace(function_definition, old_summary, ''))
    ) / length(old_summary);
  if replacement_count <> 1 then
    raise exception
      'Expected one MIA auto-offboard history summary, found %',
      replacement_count;
  end if;
  function_definition := replace(
    function_definition,
    old_summary,
    new_summary
  );

  replacement_count :=
    (
      length(function_definition)
      - length(replace(function_definition, old_upsert, ''))
    ) / length(old_upsert);
  if replacement_count <> 1 then
    raise exception
      'Expected one MIA auto-offboard churn-reason upsert, found %',
      replacement_count;
  end if;
  function_definition := replace(
    function_definition,
    old_upsert,
    new_upsert
  );

  replacement_count :=
    (
      length(function_definition)
      - length(replace(function_definition, old_history_reason, ''))
    ) / length(old_history_reason);
  if replacement_count <> 1 then
    raise exception
      'Expected one MIA auto-offboard history reason payload, found %',
      replacement_count;
  end if;
  function_definition := replace(
    function_definition,
    old_history_reason,
    new_history_reason
  );

  execute function_definition;
end;
$worker_patch$;

do $moves_method_label$
declare
  v_company public.companies%rowtype;
  v_reason_before public.company_churn_reasons%rowtype;
  v_reason_after public.company_churn_reasons%rowtype;
begin
  select * into strict v_company
  from public.companies
  where id = '21586391-9a84-4072-9ae6-20436b27bea9'::uuid
    and legacy_glide_row_id = 'wd7vy0vaQK2hgB3IRqy17w'
    and name = 'Moves Method';

  select * into v_reason_before
  from public.company_churn_reasons
  where company_id = v_company.id
    and value = 'auto_suspended_timeout'
  for update;

  if v_reason_before.id is null then
    raise exception
      'Moves Method automatic MIA churn reason is missing';
  end if;

  update public.company_churn_reasons
  set
    label = 'Dropoff — MIA timeout',
    counts_as_churn = true,
    status = 'active',
    archived_at = null,
    metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'system_managed', true,
        'automation', 'suspended_timeout',
        'company_customizable_label', true
      )
  where id = v_reason_before.id
  returning * into strict v_reason_after;

  if v_reason_before.label is distinct from v_reason_after.label then
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
      'company_customization_update_churn_reason',
      'approved_mia_dropoff_label',
      'company_churn_reasons',
      v_reason_after.id,
      v_company.legacy_glide_row_id,
      'Automatic MIA churn reason renamed',
      'Moves Method now displays automatic MIA churn as Dropoff — MIA timeout.',
      to_jsonb(v_reason_before),
      to_jsonb(v_reason_after),
      jsonb_build_object(
        'approved_by', 'Jay',
        'stable_reason_value', 'auto_suspended_timeout',
        'historical_client_rows_rewritten', false
      )
    );
  end if;
end;
$moves_method_label$;

notify pgrst, 'reload schema';
