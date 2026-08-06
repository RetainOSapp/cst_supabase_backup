-- Close two bounded Pipeline rollout gaps:
-- 1. A completed Strategic Review can create its missing eligible Renewal item
--    directly in the configured Review Complete stage.
-- 2. Daily recurrence rechecks the configured catch-up + lead horizon so late
--    contract-summary repairs do not permanently miss their one calendar day.

create or replace function public.ensure_strategic_review_pipeline_item(
  p_company_id uuid,
  p_client_id uuid,
  p_pipeline_id uuid,
  p_target_stage_id uuid,
  p_actor_auth_user_id uuid,
  p_actor_member_id uuid,
  p_actor_role text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client public.clients%rowtype;
  v_target_stage public.company_pipeline_stages%rowtype;
  v_current_position integer;
  v_item public.client_pipeline_items%rowtype;
  v_eligibility record;
  v_event_id uuid;
  v_created boolean := false;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_company_id::text || ':' || p_client_id::text, 0)
  );

  if not public.is_company_pipeline_enabled(p_company_id) then
    return jsonb_build_object(
      'item', null,
      'action', 'skipped',
      'warning', 'Strategic Review was saved, but Pipeline is disabled.'
    );
  end if;

  select * into v_client
  from public.clients
  where id = p_client_id
    and company_id = p_company_id
    and archived_at is null;
  if v_client.id is null then
    return jsonb_build_object(
      'item', null,
      'action', 'skipped',
      'warning', 'Strategic Review was saved, but the active client record is unavailable.'
    );
  end if;

  if not exists (
    select 1
    from public.company_pipelines pipeline
    where pipeline.id = p_pipeline_id
      and pipeline.company_id = p_company_id
      and pipeline.pipeline_type = 'renewal'
      and pipeline.is_enabled
      and pipeline.archived_at is null
  ) then
    return jsonb_build_object(
      'item', null,
      'action', 'skipped',
      'warning', 'Strategic Review was saved, but its configured Renewal pipeline is unavailable.'
    );
  end if;

  select * into v_target_stage
  from public.company_pipeline_stages stage
  where stage.id = p_target_stage_id
    and stage.company_id = p_company_id
    and stage.pipeline_id = p_pipeline_id
    and stage.stage_type = 'open'
    and stage.is_enabled
    and stage.archived_at is null;
  if v_target_stage.id is null then
    return jsonb_build_object(
      'item', null,
      'action', 'skipped',
      'warning', 'Strategic Review was saved, but its configured Pipeline stage is unavailable.'
    );
  end if;

  select item.*
  into v_item
  from public.client_pipeline_items item
  where item.company_id = p_company_id
    and item.client_id = p_client_id
    and item.pipeline_id = p_pipeline_id
    and item.lifecycle_status = 'open'
    and item.archived_at is null
  order by item.renewal_at asc nulls last, item.created_at desc
  limit 1
  for update of item;

  if v_item.id is not null then
    select stage.position
    into v_current_position
    from public.company_pipeline_stages stage
    where stage.id = v_item.stage_id
      and stage.pipeline_id = v_item.pipeline_id
      and stage.company_id = v_item.company_id;

    if coalesce(v_current_position, 0) < v_target_stage.position then
      select * into v_item
      from public.mutate_pipeline_item_with_evidence(
        p_company_id,
        v_item.id,
        'stage_changed',
        jsonb_build_object(
          'stage_id', v_target_stage.id,
          'lifecycle_status', 'open'
        ),
        p_actor_auth_user_id,
        p_actor_member_id,
        p_actor_role,
        p_note
      );
      return jsonb_build_object(
        'item', to_jsonb(v_item),
        'action', 'moved',
        'warning', null
      );
    end if;
    return jsonb_build_object(
      'item', to_jsonb(v_item),
      'action', 'unchanged',
      'warning', null
    );
  end if;

  select * into v_eligibility
  from public.preview_due_renewal_pipeline_items(
    p_company_id,
    p_pipeline_id,
    now()
  )
  where client_id = p_client_id
  limit 1;

  if not found then
    return jsonb_build_object(
      'item', null,
      'action', 'skipped',
      'warning', 'Strategic Review was saved, but no current Renewal contract was available.'
    );
  end if;

  if v_eligibility.eligibility_status <> 'eligible' then
    return jsonb_build_object(
      'item', null,
      'action', 'skipped',
      'warning',
        'Strategic Review was saved, but no eligible current Renewal contract was available'
        || case
          when v_eligibility.exclusion_reason is not null
            then ' (' || replace(v_eligibility.exclusion_reason, '_', ' ') || ').'
          else '.'
        end
    );
  end if;

  insert into public.client_pipeline_items(
    company_id,
    client_id,
    pipeline_id,
    stage_id,
    source_contract_id,
    automation_key,
    client_name_snapshot,
    client_business_snapshot,
    pathway_id_snapshot,
    estimated_value_cents,
    currency_code,
    renewal_at,
    lifecycle_status,
    current_note,
    metadata
  ) values (
    p_company_id,
    v_client.id,
    p_pipeline_id,
    v_target_stage.id,
    v_eligibility.contract_id,
    'renewal_contract:' || v_eligibility.contract_id,
    v_client.client_name,
    v_client.client_business,
    v_client.offer_milestones_current_offer_id,
    v_eligibility.estimated_value_cents,
    v_eligibility.currency_code,
    v_eligibility.contract_end_at,
    'open',
    nullif(btrim(p_note), ''),
    jsonb_build_object(
      'source', 'strategic_review_completion',
      'created_directly_in_target_stage', true
    )
  )
  on conflict(company_id, automation_key)
    where automation_key is not null and archived_at is null
  do nothing
  returning * into v_item;

  if v_item.id is null then
    select * into v_item
    from public.client_pipeline_items item
    where item.company_id = p_company_id
      and item.automation_key = 'renewal_contract:' || v_eligibility.contract_id
      and item.archived_at is null
    limit 1;
  else
    v_created := true;
  end if;

  if not v_created then
    return jsonb_build_object(
      'item', to_jsonb(v_item),
      'action', 'unchanged',
      'warning', null
    );
  end if;

  insert into public.client_pipeline_stage_events(
    company_id,
    pipeline_id,
    item_id,
    to_stage_id,
    actor_auth_user_id,
    actor_member_id,
    event_type,
    note,
    after_data,
    metadata
  ) values (
    p_company_id,
    p_pipeline_id,
    v_item.id,
    v_item.stage_id,
    p_actor_auth_user_id,
    p_actor_member_id,
    'created',
    p_note,
    to_jsonb(v_item),
    jsonb_build_object(
      'source', 'strategic_review_completion',
      'target_stage_id', v_target_stage.id
    )
  )
  returning id into v_event_id;

  insert into public.client_history_events(
    company_id,
    legacy_client_glide_row_id,
    actor_auth_user_id,
    actor_member_id,
    event_type,
    source,
    title,
    summary,
    notes,
    payload
  ) values (
    p_company_id,
    v_client.glide_row_id,
    p_actor_auth_user_id,
    p_actor_member_id,
    'pipeline_activity',
    'strategic_review_completion',
    'Renewal item created at Strategic Review complete',
    v_client.client_name || ': Renewal item created in ' || v_target_stage.name || '.',
    p_note,
    jsonb_build_object(
      'pipeline_item_id', v_item.id,
      'stage_event_id', v_event_id,
      'source_contract_id', v_eligibility.contract_id,
      'target_stage_id', v_target_stage.id
    )
  );

  insert into public.app_audit_events(
    company_id,
    actor_auth_user_id,
    actor_member_id,
    event_type,
    source,
    entity_table,
    entity_id,
    legacy_glide_row_id,
    title,
    summary,
    after_data,
    metadata
  ) values (
    p_company_id,
    p_actor_auth_user_id,
    p_actor_member_id,
    'pipeline_item_created',
    'strategic_review_completion',
    'client_pipeline_items',
    v_item.id,
    v_client.glide_row_id,
    'Renewal item created at Strategic Review complete',
    v_client.client_name || ': Renewal item created in ' || v_target_stage.name || '.',
    to_jsonb(v_item),
    jsonb_build_object(
      'stage_event_id', v_event_id,
      'source_contract_id', v_eligibility.contract_id,
      'actor_role', p_actor_role
    )
  );

  perform public.create_pipeline_tasks_for_stage_event(
    p_company_id,
    v_item.id,
    v_event_id,
    now()
  );

  return jsonb_build_object(
    'item', to_jsonb(v_item),
    'action', 'created',
    'warning', null
  );
end;
$$;

revoke all on function public.ensure_strategic_review_pipeline_item(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.ensure_strategic_review_pipeline_item(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text
) to service_role;

create or replace function public.run_due_pipeline_scheduler(
  p_as_of timestamptz default now(),
  p_max_companies integer default 10,
  p_max_total_create integer default 100
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_controls public.pipeline_scheduler_controls%rowtype;
  v_scheduler public.pipeline_scheduler_runs%rowtype;
  v_setting public.pipeline_renewal_rollout_settings%rowtype;
  v_type text;
  v_start timestamptz;
  v_end timestamptz;
  v_evaluation timestamptz;
  v_lead integer;
  v_catchup integer;
  v_cap integer;
  v_total integer := 0;
  v_processed integer := 0;
  v_considered integer := 0;
  v_result jsonb := '[]'::jsonb;
  v_child jsonb;
  v_activation jsonb := '{}'::jsonb;
  v_key text;
  v_run_as_of timestamptz := date_trunc('minute', p_as_of);
begin
  if p_max_companies is null
     or p_max_companies < 1
     or p_max_companies > 100
     or p_max_total_create is null
     or p_max_total_create < 1
     or p_max_total_create > 1000 then
    raise exception 'Scheduler caps are outside the permitted range';
  end if;

  select * into strict v_controls
  from public.pipeline_scheduler_controls
  where singleton;
  if v_controls.scheduler_paused then
    return jsonb_build_object('status', 'paused', 'reason', 'scheduler_paused');
  end if;

  insert into public.pipeline_scheduler_runs(
    run_key,
    as_of_at,
    max_companies,
    max_total_create
  ) values (
    'pipeline-scheduler:' || to_char(v_run_as_of at time zone 'UTC', 'YYYYMMDDHH24MI'),
    v_run_as_of,
    p_max_companies,
    least(p_max_total_create, v_controls.max_total_create)
  )
  on conflict(run_key) do update set run_key = excluded.run_key
  returning * into v_scheduler;

  if v_scheduler.as_of_at is distinct from v_run_as_of
     or v_scheduler.max_companies is distinct from p_max_companies
     or v_scheduler.max_total_create is distinct from least(
       p_max_total_create,
       v_controls.max_total_create
     ) then
    raise exception 'Scheduler run key % was already bound to different immutable inputs',
      v_scheduler.run_key;
  end if;
  if v_scheduler.status = 'completed' then
    return v_scheduler.result;
  end if;

  begin
    v_activation := jsonb_build_object('status', 'externally_scheduled');
    if not v_controls.renewal_materialization_paused then
      for v_setting in
        select settings.*
        from public.pipeline_renewal_rollout_settings settings
        join public.company_pipelines pipeline
          on pipeline.id = settings.pipeline_id
         and pipeline.company_id = settings.company_id
        join public.company_settings company_settings
          on company_settings.company_id = settings.company_id
        where pipeline.pipeline_type = 'renewal'
          and pipeline.is_enabled
          and pipeline.auto_create_renewal_items
          and pipeline.archived_at is null
          and company_settings.enable_pipeline
          and coalesce(
            pipeline.automation_settings ->> 'automation_paused',
            'false'
          ) <> 'true'
          and coalesce(
            pipeline.automation_settings ->> 'renewal_generation_enabled',
            'false'
          ) = 'true'
          and (
            (
              settings.first_backfill_enabled
              and settings.first_backfill_completed_at is null
              and settings.first_backfill_scheduled_for <= p_as_of
            )
            or (
              settings.recurring_enabled
              and settings.recurring_next_run_at <= p_as_of
            )
          )
        order by least(
          coalesce(settings.first_backfill_scheduled_for, 'infinity'),
          coalesce(settings.recurring_next_run_at, 'infinity')
        ), settings.company_id, settings.pipeline_id
        limit p_max_companies
      loop
        exit when v_total >= least(
          p_max_total_create,
          v_controls.max_total_create
        );
        v_considered := v_considered + 1;

        if v_setting.first_backfill_enabled
           and v_setting.first_backfill_completed_at is null
           and v_setting.first_backfill_scheduled_for <= p_as_of then
          v_type := 'first_backfill';
          v_start := v_setting.first_backfill_window_start;
          v_end := v_setting.first_backfill_window_end;
          v_evaluation := p_as_of;
        else
          v_type := 'recurring';
          select
            pipeline.renewal_lead_days,
            least(
              greatest(
                coalesce(
                  (pipeline.automation_settings ->> 'catch_up_days')::integer,
                  30
                ),
                0
              ),
              365
            )
          into strict v_lead, v_catchup
          from public.company_pipelines pipeline
          where pipeline.id = v_setting.pipeline_id;

          -- Evaluate at the end of the UTC calendar day. Recheck the complete
          -- configured eligibility horizon every day; active-item uniqueness
          -- makes this idempotent while the operational cap drains backlog in
          -- deterministic earliest-renewal order.
          v_evaluation := date_trunc('day', p_as_of)
            + interval '1 day'
            - interval '1 microsecond';
          v_start := date_trunc(
            'day',
            v_evaluation - make_interval(days => v_catchup)
          );
          v_end := date_trunc(
            'day',
            v_evaluation + make_interval(days => v_lead)
          ) + interval '1 day' - interval '1 microsecond';
        end if;

        v_cap := least(
          v_controls.per_company_max_create,
          least(p_max_total_create, v_controls.max_total_create) - v_total
        );
        v_key := 'pipeline:' || v_type || ':'
          || v_setting.pipeline_id::text || ':'
          || to_char(v_start at time zone 'UTC', 'YYYYMMDDHH24MISS') || ':'
          || to_char(v_end at time zone 'UTC', 'YYYYMMDDHH24MISS')
          || case
            when v_type = 'first_backfill'
              then ':attempt:' || v_setting.first_backfill_attempt::text
            else ''
          end;

        begin
          v_child := public.materialize_renewal_pipeline_window(
            v_setting.company_id,
            v_setting.pipeline_id,
            v_evaluation,
            v_start,
            v_end,
            v_cap,
            v_key,
            v_type,
            v_scheduler.id
          );
          v_total := v_total
            + coalesce((v_child ->> 'created_count')::integer, 0);
          v_processed := v_processed + 1;
          v_result := v_result || jsonb_build_array(
            jsonb_build_object(
              'company_id', v_setting.company_id,
              'pipeline_id', v_setting.pipeline_id,
              'result', v_child
            )
          );
        exception when others then
          v_processed := v_processed + 1;
          v_result := v_result || jsonb_build_array(
            jsonb_build_object(
              'company_id', v_setting.company_id,
              'pipeline_id', v_setting.pipeline_id,
              'error', sqlerrm
            )
          );
        end;
      end loop;
    end if;

    update public.pipeline_scheduler_runs
    set
      status = 'completed',
      companies_considered = v_considered,
      companies_processed = v_processed,
      created_count = v_total,
      scheduled_activation_result = v_activation,
      result = jsonb_build_object(
        'status', 'completed',
        'created_count', v_total,
        'companies', v_result,
        'scheduled_activations', v_activation
      ),
      completed_at = now()
    where id = v_scheduler.id
    returning * into v_scheduler;
    return v_scheduler.result;
  exception when others then
    update public.pipeline_scheduler_runs
    set
      status = 'failed',
      error_summary = sqlerrm,
      completed_at = now()
    where id = v_scheduler.id;
    return jsonb_build_object(
      'status', 'failed',
      'scheduler_run_id', v_scheduler.id,
      'error', sqlerrm
    );
  end;
end;
$$;

revoke all on function public.run_due_pipeline_scheduler(
  timestamptz, integer, integer
) from public, anon, authenticated;
grant execute on function public.run_due_pipeline_scheduler(
  timestamptz, integer, integer
) to service_role;

notify pgrst, 'reload schema';
