-- Pipeline production-rollout foundation.
-- Additive and fail-closed: every scheduler control starts paused and no
-- company/pipeline is enrolled by this migration.

create table if not exists public.pipeline_scheduler_controls (
  singleton boolean primary key default true check (singleton),
  scheduler_paused boolean not null default true,
  renewal_materialization_paused boolean not null default true,
  per_company_max_create integer not null default 25 check (per_company_max_create between 1 and 500),
  max_total_create integer not null default 100 check (max_total_create between 1 and 1000),
  updated_at timestamptz not null default now()
);
insert into public.pipeline_scheduler_controls(singleton)
values (true) on conflict (singleton) do nothing;

create table if not exists public.pipeline_renewal_rollout_settings (
  pipeline_id uuid primary key references public.company_pipelines(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  first_backfill_enabled boolean not null default false,
  first_backfill_scheduled_for timestamptz,
  first_backfill_window_start timestamptz,
  first_backfill_window_end timestamptz,
  first_backfill_completed_at timestamptz,
  first_backfill_attempt integer not null default 0 check (first_backfill_attempt >= 0),
  recurring_enabled boolean not null default false,
  recurring_next_run_at timestamptz,
  -- Recurrence advances once per day. Wider windows are unsafe with the
  -- current lead-bound eligibility function because later days are not yet due.
  recurring_window_days integer not null default 1 check (recurring_window_days = 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    not first_backfill_enabled
    or (first_backfill_scheduled_for is not null and first_backfill_window_start is not null
        and first_backfill_window_end is not null and first_backfill_window_start <= first_backfill_window_end)
  ),
  check (not recurring_enabled or recurring_next_run_at is not null)
);
create index if not exists pipeline_renewal_rollout_settings_due_idx
  on public.pipeline_renewal_rollout_settings(company_id, first_backfill_scheduled_for, recurring_next_run_at)
  where first_backfill_enabled or recurring_enabled;

alter table public.pipeline_automation_runs
  add column if not exists run_type text not null default 'manual',
  add column if not exists window_start_at timestamptz,
  add column if not exists window_end_at timestamptz,
  add column if not exists max_create integer,
  add column if not exists scheduler_run_id uuid,
  add column if not exists requested_by_source text not null default 'manual';
alter table public.pipeline_automation_runs drop constraint if exists pipeline_automation_runs_run_type_check;
alter table public.pipeline_automation_runs add constraint pipeline_automation_runs_run_type_check
  check (run_type in ('manual', 'first_backfill', 'recurring'));
alter table public.pipeline_automation_runs drop constraint if exists pipeline_automation_runs_window_check;
alter table public.pipeline_automation_runs add constraint pipeline_automation_runs_window_check
  check ((window_start_at is null and window_end_at is null) or (window_start_at is not null and window_end_at is not null and window_start_at <= window_end_at));
alter table public.pipeline_automation_runs drop constraint if exists pipeline_automation_runs_max_create_check;
alter table public.pipeline_automation_runs add constraint pipeline_automation_runs_max_create_check
  check (max_create is null or max_create between 1 and 500);

create table if not exists public.pipeline_scheduler_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  as_of_at timestamptz not null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'paused')),
  max_companies integer not null check (max_companies between 1 and 100),
  max_total_create integer not null check (max_total_create between 1 and 1000),
  companies_considered integer not null default 0,
  companies_processed integer not null default 0,
  created_count integer not null default 0,
  scheduled_activation_result jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error_summary text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.pipeline_automation_runs drop constraint if exists pipeline_automation_runs_scheduler_run_fkey;
alter table public.pipeline_automation_runs add constraint pipeline_automation_runs_scheduler_run_fkey
  foreign key (scheduler_run_id) references public.pipeline_scheduler_runs(id) on delete set null;
create index if not exists pipeline_scheduler_runs_created_idx on public.pipeline_scheduler_runs(created_at desc);

alter table public.pipeline_scheduler_controls enable row level security;
alter table public.pipeline_renewal_rollout_settings enable row level security;
alter table public.pipeline_scheduler_runs enable row level security;
revoke all on public.pipeline_scheduler_controls, public.pipeline_renewal_rollout_settings, public.pipeline_scheduler_runs from public, anon, authenticated;
grant all on public.pipeline_scheduler_controls, public.pipeline_renewal_rollout_settings, public.pipeline_scheduler_runs to service_role;

create or replace function public.materialize_renewal_pipeline_window(
  p_company_id uuid,
  p_pipeline_id uuid,
  p_evaluation_as_of timestamptz,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_max_create integer,
  p_run_key text,
  p_run_type text,
  p_scheduler_run_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_controls public.pipeline_scheduler_controls%rowtype;
  v_pipeline public.company_pipelines%rowtype;
  v_settings public.pipeline_renewal_rollout_settings%rowtype;
  v_run public.pipeline_automation_runs%rowtype;
  v_row record; v_item public.client_pipeline_items%rowtype; v_client public.clients%rowtype;
  v_event uuid; v_created integer := 0; v_eligible integer := 0; v_excluded integer := 0; v_capped integer := 0;
  v_items jsonb := '[]'::jsonb;
begin
  if p_window_start is null or p_window_end is null or p_window_start > p_window_end then
    raise exception 'A materialization run requires an ordered explicit date window';
  end if;
  if p_max_create is null or p_max_create < 1 or p_max_create > 500 then
    raise exception 'Materialization max_create must be between 1 and 500';
  end if;
  if p_run_type not in ('first_backfill', 'recurring') or nullif(trim(p_run_key), '') is null then
    raise exception 'Materialization requires a non-empty first_backfill or recurring run key';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text, 0));
  select * into strict v_controls from public.pipeline_scheduler_controls where singleton;
  if v_controls.scheduler_paused or v_controls.renewal_materialization_paused then
    raise exception 'Pipeline scheduler is paused';
  end if;
  if p_max_create > v_controls.per_company_max_create then
    raise exception 'Requested max_create exceeds the operational per-company cap';
  end if;
  select * into strict v_pipeline from public.company_pipelines
  where id = p_pipeline_id and company_id = p_company_id and pipeline_type = 'renewal'
    and is_enabled and auto_create_renewal_items and archived_at is null;
  if not public.is_company_pipeline_enabled(p_company_id)
     or coalesce(v_pipeline.automation_settings ->> 'automation_paused', 'false') = 'true'
     or coalesce(v_pipeline.automation_settings ->> 'renewal_generation_enabled', 'false') <> 'true' then
    raise exception 'Pipeline automation is disabled for this company';
  end if;
  if p_window_end > p_evaluation_as_of + make_interval(days => v_pipeline.renewal_lead_days::integer) then
    raise exception 'Materialization window extends beyond the current renewal eligibility horizon';
  end if;
  select * into strict v_settings from public.pipeline_renewal_rollout_settings
  where pipeline_id = p_pipeline_id and company_id = p_company_id;
  if p_run_type = 'first_backfill' then
    if not v_settings.first_backfill_enabled or v_settings.first_backfill_completed_at is not null
       or v_settings.first_backfill_window_start is distinct from p_window_start
       or v_settings.first_backfill_window_end is distinct from p_window_end then
      raise exception 'First backfill is not enabled for this exact pipeline window';
    end if;
  elsif not v_settings.recurring_enabled then
    raise exception 'Recurring materialization is not enabled for this pipeline';
  end if;

  insert into public.pipeline_automation_runs(
    company_id, pipeline_id, run_key, as_of_at, run_type, window_start_at, window_end_at,
    max_create, scheduler_run_id, requested_by_source
  ) values (
    p_company_id, p_pipeline_id, p_run_key, p_window_end, p_run_type, p_window_start, p_window_end,
    p_max_create, p_scheduler_run_id, 'pipeline_scheduler'
  ) on conflict(company_id, run_key) do update set run_key = excluded.run_key
  returning * into v_run;
  if v_run.pipeline_id is distinct from p_pipeline_id or v_run.as_of_at is distinct from p_window_end
     or v_run.run_type is distinct from p_run_type or v_run.window_start_at is distinct from p_window_start
     or v_run.window_end_at is distinct from p_window_end or v_run.max_create is distinct from p_max_create
     or v_run.scheduler_run_id is distinct from p_scheduler_run_id or v_run.requested_by_source <> 'pipeline_scheduler' then
    raise exception 'Automation run key % was already bound to different immutable inputs', p_run_key;
  end if;
  if v_run.status = 'completed' then
    return jsonb_build_object('run_id', v_run.id, 'created_count', v_run.created_count, 'idempotent', true);
  end if;

  begin
    for v_row in
      select * from public.preview_due_renewal_pipeline_items(p_company_id, p_pipeline_id, p_evaluation_as_of)
      where contract_end_at >= p_window_start and contract_end_at <= p_window_end
      order by contract_end_at, client_id, contract_id
    loop
      if v_row.eligibility_status <> 'eligible' then v_excluded := v_excluded + 1; continue; end if;
      v_eligible := v_eligible + 1;
      if v_created >= p_max_create then v_capped := v_capped + 1; continue; end if;
      select * into strict v_client from public.clients where id = v_row.client_id and company_id = p_company_id;
      insert into public.client_pipeline_items(
        company_id, client_id, pipeline_id, stage_id, source_contract_id, automation_key,
        client_name_snapshot, client_business_snapshot, pathway_id_snapshot, estimated_value_cents,
        currency_code, renewal_at, lifecycle_status, metadata
      ) values (
        p_company_id, v_client.id, v_row.pipeline_id, v_row.entry_stage_id, v_row.contract_id,
        'renewal_contract:' || v_row.contract_id, v_client.client_name, v_client.client_business,
        v_client.offer_milestones_current_offer_id, v_row.estimated_value_cents, v_row.currency_code,
        v_row.contract_end_at, 'open', jsonb_build_object('automation_run_id', v_run.id, 'run_type', p_run_type)
      ) on conflict(company_id, automation_key) where automation_key is not null and archived_at is null
        do nothing returning * into v_item;
      if v_item.id is null then v_excluded := v_excluded + 1; continue; end if;
      insert into public.client_pipeline_stage_events(company_id, pipeline_id, item_id, to_stage_id, event_type, after_data, metadata)
      values(p_company_id, v_item.pipeline_id, v_item.id, v_item.stage_id, 'created', to_jsonb(v_item),
        jsonb_build_object('automation_run_id', v_run.id, 'run_type', p_run_type)) returning id into v_event;
      insert into public.client_history_events(company_id, legacy_client_glide_row_id, event_type, source, title, summary, payload)
      values(p_company_id, v_client.glide_row_id, 'pipeline_activity', 'pipeline_scheduler', 'Renewal item created',
        v_client.client_name || ': renewal item created.', jsonb_build_object('pipeline_item_id', v_item.id, 'stage_event_id', v_event, 'source_contract_id', v_row.contract_id, 'automation_run_id', v_run.id));
      insert into public.app_audit_events(company_id, event_type, source, entity_table, entity_id, legacy_glide_row_id, title, summary, after_data, metadata)
      values(p_company_id, 'pipeline_item_created', 'pipeline_scheduler', 'client_pipeline_items', v_item.id, v_client.glide_row_id,
        'Renewal item created', v_client.client_name || ': renewal item created.', to_jsonb(v_item),
        jsonb_build_object('automation_run_id', v_run.id, 'run_type', p_run_type, 'window_start', p_window_start, 'window_end', p_window_end));
      perform public.create_pipeline_tasks_for_stage_event(p_company_id, v_item.id, v_event, p_window_end);
      v_created := v_created + 1; v_items := v_items || jsonb_build_array(to_jsonb(v_item)); v_item := null;
    end loop;
    update public.pipeline_automation_runs set status = 'completed', candidate_count = v_eligible + v_excluded,
      created_count = v_created, skipped_count = v_excluded + v_capped, completed_at = now(),
      exclusion_counts = jsonb_build_object('excluded', v_excluded, 'capped', v_capped, 'eligible', v_eligible),
      metadata = metadata || jsonb_build_object('items', v_items, 'window_start', p_window_start, 'window_end', p_window_end)
    where id = v_run.id;
    if p_run_type = 'first_backfill' then
      update public.pipeline_renewal_rollout_settings
      set first_backfill_completed_at = case when v_capped = 0 then now() else null end,
          first_backfill_attempt = case when v_capped = 0 then first_backfill_attempt else first_backfill_attempt + 1 end,
          updated_at = now()
      where pipeline_id = p_pipeline_id;
    else
      update public.pipeline_renewal_rollout_settings set recurring_next_run_at = date_trunc('day', p_evaluation_as_of) + make_interval(days => recurring_window_days), updated_at = now() where pipeline_id = p_pipeline_id;
    end if;
    insert into public.app_audit_events(company_id, event_type, source, entity_table, entity_id, title, summary, metadata)
    values(p_company_id, 'pipeline_materialization_completed', 'pipeline_scheduler', 'pipeline_automation_runs', v_run.id,
      'Renewal materialization completed', p_run_type, jsonb_build_object('created_count', v_created, 'max_create', p_max_create, 'run_key', p_run_key));
    return jsonb_build_object('run_id', v_run.id, 'created_count', v_created, 'skipped_count', v_excluded + v_capped, 'items', v_items);
  exception when others then
    update public.pipeline_automation_runs set status = 'failed', error_summary = sqlerrm, completed_at = now() where id = v_run.id;
    insert into public.app_audit_events(company_id, event_type, source, entity_table, entity_id, title, summary, metadata)
    values(p_company_id, 'pipeline_materialization_failed', 'pipeline_scheduler', 'pipeline_automation_runs', v_run.id,
      'Renewal materialization failed', p_run_type, jsonb_build_object('error', sqlerrm, 'run_key', p_run_key));
    return jsonb_build_object('run_id', v_run.id, 'created_count', 0, 'error', sqlerrm);
  end;
end;
$$;

create or replace function public.run_due_pipeline_scheduler(
  p_as_of timestamptz default now(), p_max_companies integer default 10, p_max_total_create integer default 100
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_controls public.pipeline_scheduler_controls%rowtype; v_scheduler public.pipeline_scheduler_runs%rowtype;
  v_setting public.pipeline_renewal_rollout_settings%rowtype; v_type text; v_start timestamptz; v_end timestamptz; v_evaluation timestamptz; v_lead integer;
  v_cap integer; v_total integer := 0; v_processed integer := 0; v_considered integer := 0; v_result jsonb := '[]'::jsonb;
  v_child jsonb; v_activation jsonb := '{}'::jsonb; v_key text; v_run_as_of timestamptz := date_trunc('minute', p_as_of);
begin
  if p_max_companies is null or p_max_companies < 1 or p_max_companies > 100 or p_max_total_create is null or p_max_total_create < 1 or p_max_total_create > 1000 then
    raise exception 'Scheduler caps are outside the permitted range';
  end if;
  select * into strict v_controls from public.pipeline_scheduler_controls where singleton;
  if v_controls.scheduler_paused then return jsonb_build_object('status', 'paused', 'reason', 'scheduler_paused'); end if;
  insert into public.pipeline_scheduler_runs(run_key, as_of_at, max_companies, max_total_create)
  values ('pipeline-scheduler:' || to_char(v_run_as_of at time zone 'UTC', 'YYYYMMDDHH24MI'), v_run_as_of, p_max_companies, least(p_max_total_create, v_controls.max_total_create))
  on conflict(run_key) do update set run_key = excluded.run_key returning * into v_scheduler;
  if v_scheduler.as_of_at is distinct from v_run_as_of or v_scheduler.max_companies is distinct from p_max_companies
     or v_scheduler.max_total_create is distinct from least(p_max_total_create, v_controls.max_total_create) then
    raise exception 'Scheduler run key % was already bound to different immutable inputs', v_scheduler.run_key;
  end if;
  if v_scheduler.status = 'completed' then return v_scheduler.result; end if;
  begin
    -- Scheduled contract activation has its own already-live pg_cron job. This
    -- orchestrator never invokes it, avoiding duplicate processing; status is
    -- deliberately observational only.
    v_activation := jsonb_build_object('status', 'externally_scheduled');
    if not v_controls.renewal_materialization_paused then
      for v_setting in
        select settings.* from public.pipeline_renewal_rollout_settings settings
        join public.company_pipelines pipeline on pipeline.id = settings.pipeline_id and pipeline.company_id = settings.company_id
        join public.company_settings company_settings on company_settings.company_id = settings.company_id
        where pipeline.pipeline_type = 'renewal' and pipeline.is_enabled and pipeline.auto_create_renewal_items and pipeline.archived_at is null
          and company_settings.enable_pipeline and coalesce(pipeline.automation_settings ->> 'automation_paused', 'false') <> 'true'
          and coalesce(pipeline.automation_settings ->> 'renewal_generation_enabled', 'false') = 'true'
          and ((settings.first_backfill_enabled and settings.first_backfill_completed_at is null and settings.first_backfill_scheduled_for <= p_as_of)
            or (settings.recurring_enabled and settings.recurring_next_run_at <= p_as_of))
        order by least(coalesce(settings.first_backfill_scheduled_for, 'infinity'), coalesce(settings.recurring_next_run_at, 'infinity')), settings.company_id, settings.pipeline_id
        limit p_max_companies
      loop
        exit when v_total >= least(p_max_total_create, v_controls.max_total_create);
        v_considered := v_considered + 1;
        if v_setting.first_backfill_enabled and v_setting.first_backfill_completed_at is null and v_setting.first_backfill_scheduled_for <= p_as_of then
          v_type := 'first_backfill'; v_start := v_setting.first_backfill_window_start; v_end := v_setting.first_backfill_window_end; v_evaluation := p_as_of;
        else
          v_type := 'recurring';
          select renewal_lead_days into strict v_lead from public.company_pipelines where id = v_setting.pipeline_id;
          v_start := date_trunc('day', p_as_of + make_interval(days => v_lead));
          v_end := v_start + make_interval(days => v_setting.recurring_window_days) - interval '1 microsecond';
          -- Renewal timing is configured in calendar days. Evaluate at the end
          -- of the current UTC day so the entire target contract-end date is
          -- eligible without opening any later date.
          v_evaluation := date_trunc('day', p_as_of) + interval '1 day' - interval '1 microsecond';
        end if;
        v_cap := least(v_controls.per_company_max_create, least(p_max_total_create, v_controls.max_total_create) - v_total);
        v_key := 'pipeline:' || v_type || ':' || v_setting.pipeline_id::text || ':' || to_char(v_start at time zone 'UTC', 'YYYYMMDDHH24MISS') || ':' || to_char(v_end at time zone 'UTC', 'YYYYMMDDHH24MISS') || case when v_type = 'first_backfill' then ':attempt:' || v_setting.first_backfill_attempt::text else '' end;
        begin
          v_child := public.materialize_renewal_pipeline_window(v_setting.company_id, v_setting.pipeline_id, v_evaluation, v_start, v_end, v_cap, v_key, v_type, v_scheduler.id);
          v_total := v_total + coalesce((v_child ->> 'created_count')::integer, 0); v_processed := v_processed + 1;
          v_result := v_result || jsonb_build_array(jsonb_build_object('company_id', v_setting.company_id, 'pipeline_id', v_setting.pipeline_id, 'result', v_child));
        exception when others then
          v_processed := v_processed + 1;
          v_result := v_result || jsonb_build_array(jsonb_build_object('company_id', v_setting.company_id, 'pipeline_id', v_setting.pipeline_id, 'error', sqlerrm));
        end;
      end loop;
    end if;
    update public.pipeline_scheduler_runs set status = 'completed', companies_considered = v_considered, companies_processed = v_processed,
      created_count = v_total, scheduled_activation_result = v_activation,
      result = jsonb_build_object('status', 'completed', 'created_count', v_total, 'companies', v_result, 'scheduled_activations', v_activation), completed_at = now()
    where id = v_scheduler.id returning * into v_scheduler;
    return v_scheduler.result;
  exception when others then
    update public.pipeline_scheduler_runs set status = 'failed', error_summary = sqlerrm, completed_at = now() where id = v_scheduler.id;
    return jsonb_build_object('status', 'failed', 'scheduler_run_id', v_scheduler.id, 'error', sqlerrm);
  end;
end;
$$;

create or replace function public.get_pipeline_automation_status(
  p_company_id uuid
) returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_controls public.pipeline_scheduler_controls%rowtype;
  v_last public.pipeline_automation_runs%rowtype;
  v_failure public.pipeline_automation_runs%rowtype;
  v_scheduler_registered boolean := false;
  v_company_paused boolean := true;
  v_pipeline_paused boolean := true;
begin
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'Company not found';
  end if;
  select * into strict v_controls
  from public.pipeline_scheduler_controls
  where singleton;

  select not exists (
    select 1
    from public.pipeline_renewal_rollout_settings rollout
    where rollout.company_id = p_company_id
      and (
        rollout.recurring_enabled
        or (
          rollout.first_backfill_enabled
          and rollout.first_backfill_completed_at is null
        )
      )
  ) into v_company_paused;

  select not exists (
    select 1
    from public.company_pipelines pipeline
    where pipeline.company_id = p_company_id
      and pipeline.pipeline_type = 'renewal'
      and pipeline.is_enabled
      and pipeline.auto_create_renewal_items
      and pipeline.archived_at is null
      and coalesce(pipeline.automation_settings ->> 'automation_paused', 'false') <> 'true'
      and coalesce(pipeline.automation_settings ->> 'renewal_generation_enabled', 'false') = 'true'
  ) into v_pipeline_paused;

  select * into v_last
  from public.pipeline_automation_runs
  where company_id = p_company_id
  order by created_at desc
  limit 1;

  select * into v_failure
  from public.pipeline_automation_runs
  where company_id = p_company_id
    and status = 'failed'
  order by created_at desc
  limit 1;

  if to_regclass('cron.job') is not null then
    execute
      'select exists (
         select 1 from cron.job
         where jobname = $1 and active
       )'
      into v_scheduler_registered
      using 'retainos-pipeline-renewal-scheduler';
  end if;

  return jsonb_build_object(
    'available', true,
    'globalPaused', v_controls.scheduler_paused or v_controls.renewal_materialization_paused,
    'companyPaused', v_company_paused,
    'pipelinePaused', v_pipeline_paused,
    'schedulerRegistered', v_scheduler_registered,
    'lastRunAt', v_last.created_at,
    'lastRunStatus', v_last.status,
    'lastFailureAt', v_failure.created_at,
    'lastFailure', v_failure.error_summary,
    'perCompanyMaxCreate', v_controls.per_company_max_create,
    'maxTotalCreate', v_controls.max_total_create,
    'scheduledContractActivation', 'independent_existing_scheduler'
  );
end;
$$;

revoke all on function public.materialize_renewal_pipeline_window(uuid, uuid, timestamptz, timestamptz, timestamptz, integer, text, text, uuid) from public, anon, authenticated;
revoke all on function public.run_due_pipeline_scheduler(timestamptz, integer, integer) from public, anon, authenticated;
revoke all on function public.get_pipeline_automation_status(uuid) from public, anon, authenticated;
grant execute on function public.materialize_renewal_pipeline_window(uuid, uuid, timestamptz, timestamptz, timestamptz, integer, text, text, uuid) to service_role;

do $do$
begin
  if to_regclass('cron.job') is not null and not exists (select 1 from cron.job where jobname = 'retainos-pipeline-renewal-scheduler') then
    perform cron.schedule('retainos-pipeline-renewal-scheduler', '5 * * * *', 'select public.run_due_pipeline_scheduler(now(), 10, 100);');
  end if;
end;
$do$;
grant execute on function public.run_due_pipeline_scheduler(timestamptz, integer, integer) to service_role;
grant execute on function public.get_pipeline_automation_status(uuid) to service_role;

notify pgrst, 'reload schema';
