-- Exact, reviewed MM repair for the 13 legitimate Daily Pulse Strategic Review
-- completions that currently have no Renewal Pipeline item. This gate depends
-- on migration 20260806120000 and fails closed if any bound evidence changes.

do $gate$
declare
  v_company_id constant uuid := '21586391-9a84-4072-9ae6-20436b27bea9';
  v_pipeline_id constant uuid := '70bb9fe9-759d-4594-a8c3-e129d984893f';
  v_target_stage_id constant uuid := 'f18d7174-2804-4cd0-baaa-4eec3478b9c5';
  v_completion_ids constant uuid[] := array[
    '2ae4aec2-ee64-42c7-8b7b-265cba992b20',
    '1c2d05d3-5757-4461-859e-8c1a10be1728',
    '915aa250-fd33-459f-b366-8399149cb357',
    '88b0f0ff-71d4-46d2-8cd3-3d3365babbaf',
    '17b5ae11-719d-458c-8259-475afc19fc7e',
    'f3d7461b-6d7d-43ad-937a-a282930e7da4',
    '696ed171-920a-4bfe-b2ca-70fb1fdfedf7',
    '70cb297d-7691-4141-9b7c-6efde6f48df0',
    '48da2bde-49fa-445a-b920-c03f8e9a1e8c',
    '2c1e9df9-36e5-4506-932d-772658053fb1',
    '4398290a-40b6-4f9d-9dfb-345b50c33862',
    '693b553e-acc8-4f72-92f5-5fb5c5c873f4',
    '469bd196-c12a-4861-8ad6-777a89e25c41'
  ]::uuid[];
  v_lead_days integer;
  v_completion public.client_timed_checkpoint_completions%rowtype;
  v_client public.clients%rowtype;
  v_result jsonb;
  v_item_id uuid;
  v_canonical_due date;
  v_repaired integer := 0;
  v_due_dates_corrected integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_company_id::text, 0));

  if cardinality(v_completion_ids) <> 13 then
    raise exception 'Expected exactly 13 reviewed completion IDs';
  end if;
  if (
    select count(*)
    from public.client_timed_checkpoint_completions completion
    where completion.id = any(v_completion_ids)
      and completion.company_id = v_company_id
      and completion.checkpoint_type = 'strategic_review'
      and completion.archived_at is null
  ) <> 13 then
    raise exception 'The reviewed Strategic Review completion cohort changed';
  end if;
  if exists (
    select 1
    from public.client_timed_checkpoint_completions completion
    join public.client_pipeline_items item
      on item.company_id = completion.company_id
     and item.client_id = completion.client_id
     and item.pipeline_id = v_pipeline_id
     and item.archived_at is null
    where completion.id = any(v_completion_ids)
  ) then
    raise exception 'A reviewed completion already has a visible Pipeline item';
  end if;
  if not exists (
    select 1
    from public.company_pipeline_stages stage
    where stage.id = v_target_stage_id
      and stage.company_id = v_company_id
      and stage.pipeline_id = v_pipeline_id
      and stage.name = 'Review Complete'
      and stage.stage_type = 'open'
      and stage.is_enabled
      and stage.archived_at is null
  ) then
    raise exception 'MM Review Complete stage binding changed';
  end if;
  if not exists (
    select 1
    from public.company_settings settings
    where settings.company_id = v_company_id
      and settings.enable_pipeline
      and settings.metadata -> 'strategic_review_pipeline_automation'
        ->> 'pipeline_id' = v_pipeline_id::text
      and settings.metadata -> 'strategic_review_pipeline_automation'
        ->> 'target_stage_id' = v_target_stage_id::text
      and coalesce(
        (
          settings.metadata -> 'strategic_review_pipeline_automation'
            ->> 'enabled'
        )::boolean,
        false
      )
  ) then
    raise exception 'MM Strategic Review automation binding changed';
  end if;

  select preference.lead_days
  into strict v_lead_days
  from public.notification_preferences preference
  where preference.company_id = v_company_id
    and preference.member_id is null
    and preference.role is null
    and preference.notification_type = 'strategic_review_due'
    and preference.in_app_enabled;
  if v_lead_days <> 35 then
    raise exception 'MM Strategic Review lead days changed from the reviewed 35';
  end if;

  if (
    select count(*)
    from public.preview_due_renewal_pipeline_items(
      v_company_id,
      v_pipeline_id,
      now()
    ) eligibility
    join public.client_timed_checkpoint_completions completion
      on completion.client_id = eligibility.client_id
    where completion.id = any(v_completion_ids)
      and eligibility.eligibility_status = 'eligible'
  ) <> 13 then
    raise exception 'Not all reviewed completions still have eligible current contracts';
  end if;

  for v_completion in
    select completion.*
    from public.client_timed_checkpoint_completions completion
    where completion.id = any(v_completion_ids)
    order by completion.completed_at, completion.id
    for update
  loop
    select * into strict v_client
    from public.clients client
    where client.id = v_completion.client_id
      and client.company_id = v_company_id
      and client.archived_at is null;

    v_result := public.ensure_strategic_review_pipeline_item(
      v_company_id,
      v_client.id,
      v_pipeline_id,
      v_target_stage_id,
      null,
      v_completion.completed_by_member_id,
      coalesce(v_completion.metadata ->> 'actor_role', 'system'),
      v_completion.notes
    );
    if v_result ->> 'action' <> 'created'
       or v_result -> 'item' is null then
      raise exception 'Completion % repair did not create exactly one item: %',
        v_completion.id,
        v_result;
    end if;

    v_item_id := (v_result -> 'item' ->> 'id')::uuid;
    if (v_result -> 'item' ->> 'stage_id')::uuid <> v_target_stage_id then
      raise exception 'Completion % did not land in Review Complete',
        v_completion.id;
    end if;

    v_canonical_due :=
      v_client.current_contract_end_date_for_filtering::date - v_lead_days;
    if v_completion.due_at is distinct from v_canonical_due then
      v_due_dates_corrected := v_due_dates_corrected + 1;
    end if;

    update public.client_timed_checkpoint_completions
    set
      due_at = v_canonical_due,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'pipeline_item_id', v_item_id,
        'pipeline_stage_id', v_target_stage_id,
        'pipeline_warning', null,
        'workflow_complete', true,
        'previous_due_at', v_completion.due_at,
        'canonical_due_at', v_canonical_due,
        'repair_source', 'mm_strategic_review_pipeline_repair_20260806'
      ),
      updated_at = now()
    where id = v_completion.id;
    v_repaired := v_repaired + 1;
  end loop;

  if v_repaired <> 13 or v_due_dates_corrected <> 11 then
    raise exception 'Expected 13 item repairs and 11 due-date corrections; got % and %',
      v_repaired,
      v_due_dates_corrected;
  end if;
  if (
    select count(*)
    from public.client_pipeline_items item
    join public.client_timed_checkpoint_completions completion
      on completion.client_id = item.client_id
     and completion.company_id = item.company_id
    where completion.id = any(v_completion_ids)
      and item.pipeline_id = v_pipeline_id
      and item.stage_id = v_target_stage_id
      and item.lifecycle_status = 'open'
      and item.archived_at is null
      and item.metadata ->> 'source' = 'strategic_review_completion'
  ) <> 13 then
    raise exception 'The repaired Review Complete item set is incomplete';
  end if;

  insert into public.app_audit_events(
    company_id,
    event_type,
    source,
    entity_table,
    entity_id,
    title,
    summary,
    metadata
  ) values (
    v_company_id,
    'pipeline_strategic_review_repair_completed',
    'pipeline_release_gate',
    'company_pipelines',
    v_pipeline_id,
    'MM Strategic Review Pipeline repair completed',
    'Created 13 contract-linked Review Complete items and corrected 11 calendar due dates.',
    jsonb_build_object(
      'completion_ids', v_completion_ids,
      'pipeline_id', v_pipeline_id,
      'target_stage_id', v_target_stage_id,
      'items_created', v_repaired,
      'due_dates_corrected', v_due_dates_corrected
    )
  );
end;
$gate$;
