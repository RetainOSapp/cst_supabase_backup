-- Revert the worker-label preservation patch. Restore the old MM label only
-- when it still equals the label introduced by the forward migration.

do $worker_patch$
declare
  function_definition text;
  old_reason_lookup constant text := $old$
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
$old$;
  new_reason_lookup constant text := $new$
      v_churn_label := v_status_label || ' auto-offboard';
$new$;
  old_summary constant text := $old$
      v_summary := format(
        'Automatically changed from %s to Offboarded after %s days without returning. Exit outcome Dropoff; churn reason %s. Churn effective %s.',
        v_status_label,
        v_due.suspended_auto_offboard_days,
        v_churn_label,
        v_effective_at::date
      );
$old$;
  new_summary constant text := $new$
      v_summary := format(
        'Automatically changed from %s to Offboarded after %s days without returning. Churn effective %s.',
        v_status_label,
        v_due.suspended_auto_offboard_days,
        v_effective_at::date
      );
$new$;
  old_upsert constant text := $old$
      set
        label = coalesce(
          nullif(btrim(public.company_churn_reasons.label), ''),
          excluded.label
        ),
        category = excluded.category,
$old$;
  new_upsert constant text := $new$
      set
        label = excluded.label,
        category = excluded.category,
$new$;
  old_history_reason constant text := $old$
          'reason', 'auto_suspended_timeout',
          'reason_label', v_churn_label,
          'exit_outcome', 'dropoff',
          'automation', 'suspended_timeout',
$old$;
  new_history_reason constant text := $new$
          'reason', 'auto_suspended_timeout',
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
      'Expected one customized MIA reason lookup, found %',
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
      'Expected one customized MIA history summary, found %',
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
      'Expected one customized MIA reason upsert, found %',
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
      'Expected one customized MIA history payload, found %',
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

update public.company_churn_reasons
set label = 'MIA auto-offboard'
where company_id = '21586391-9a84-4072-9ae6-20436b27bea9'::uuid
  and value = 'auto_suspended_timeout'
  and label = 'Dropoff — MIA timeout';

notify pgrst, 'reload schema';
