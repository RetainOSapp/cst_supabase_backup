-- The original Expansion starter paired value_source=fixed with a null fixed
-- value, an internally invalid draft that could not be enabled through the
-- management Edge Function. Repair the one reviewed Sales Kick starter and
-- honor the SuperAdmin's attempted enable action. No automation is enabled.

do $$
declare
  v_company_id uuid := '0736d983-9c9a-4f84-9251-8f103261f3ea'::uuid;
  v_pipeline_id uuid := '9de45e10-efd8-4402-ba9a-b2810e4ca120'::uuid;
  v_before public.company_pipelines;
  v_after public.company_pipelines;
  v_open_count integer;
  v_won_count integer;
  v_lost_count integer;
begin
  select * into v_before
  from public.company_pipelines
  where id = v_pipeline_id
    and company_id = v_company_id
    and name = 'Expansion'
    and pipeline_type = 'expansion'
    and is_enabled = false
    and value_source = 'fixed'
    and default_estimated_value_cents is null
    and archived_at is null
    and metadata->>'created_from' = 'pipeline_starter'
  for update;

  if v_before.id is null then
    raise exception 'Expected invalid Sales Kick Expansion starter was not found';
  end if;

  select
    count(*) filter (where stage_type = 'open'),
    count(*) filter (where stage_type = 'won'),
    count(*) filter (where stage_type = 'lost')
  into v_open_count, v_won_count, v_lost_count
  from public.company_pipeline_stages
  where company_id = v_company_id
    and pipeline_id = v_pipeline_id
    and is_enabled = true
    and archived_at is null;

  if v_open_count < 1 or v_won_count <> 1 or v_lost_count <> 1 then
    raise exception
      'Sales Kick Expansion stage guard failed: open %, won %, lost %',
      v_open_count, v_won_count, v_lost_count;
  end if;

  update public.company_pipelines
  set value_source = 'none',
      default_estimated_value_cents = null,
      is_enabled = true,
      updated_at = now()
  where id = v_pipeline_id
    and company_id = v_company_id
  returning * into v_after;

  insert into public.app_audit_events (
    company_id,
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
    'company_pipeline_updated',
    'approved_support_repair',
    'company_pipelines',
    v_pipeline_id,
    'Expansion Pipeline enabled',
    'Repaired the invalid fixed-value starter configuration and enabled Expansion. Automation remains off.',
    to_jsonb(v_before),
    to_jsonb(v_after),
    jsonb_build_object(
      'repair', 'expansion_starter_null_fixed_value',
      'automation_enabled', false
    )
  );
end
$$;
