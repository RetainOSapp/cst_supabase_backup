-- Restore the exact-day recurring cohort and remove the Strategic Review
-- missing-item helper. Existing Pipeline/history/audit evidence is preserved.

revoke all on function public.ensure_strategic_review_pipeline_item(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text
) from public, anon, authenticated, service_role;
drop function if exists public.ensure_strategic_review_pipeline_item(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text
);

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
          select renewal_lead_days
          into strict v_lead
          from public.company_pipelines
          where id = v_setting.pipeline_id;
          v_start := date_trunc(
            'day',
            p_as_of + make_interval(days => v_lead)
          );
          v_end := v_start
            + make_interval(days => v_setting.recurring_window_days)
            - interval '1 microsecond';
          v_evaluation := date_trunc('day', p_as_of)
            + interval '1 day'
            - interval '1 microsecond';
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
