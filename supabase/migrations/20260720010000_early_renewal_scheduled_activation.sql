-- Early-renewal scheduled activation foundation.
-- Commercial retention is recorded when signed; a future contract becomes
-- current and any Front End -> Back End transition applies on its start date.

create table if not exists public.scheduled_contract_activations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  contract_id uuid references public.client_contracts(id) on delete set null,
  pipeline_item_id uuid references public.client_pipeline_items(id) on delete set null,
  scheduled_for timestamptz not null,
  expected_from_status text not null check (expected_from_status in ('front-end', 'back-end')),
  target_status text not null check (target_status in ('front-end', 'back-end')),
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'blocked', 'cancelled')),
  source text not null check (source in ('contract_create', 'pipeline_workspace')),
  created_by_auth_user_id uuid,
  created_by_member_id uuid references public.company_members(id) on delete set null,
  completion_history_event_id uuid references public.client_history_events(id) on delete set null,
  completed_at timestamptz,
  blocked_at timestamptz,
  blocked_reason text,
  cancelled_at timestamptz,
  cancellation_reason text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists scheduled_contract_activations_contract_unique
  on public.scheduled_contract_activations(contract_id)
  where contract_id is not null;

create unique index if not exists scheduled_contract_activations_client_pending_unique
  on public.scheduled_contract_activations(company_id, client_id)
  where status = 'pending';

create index if not exists scheduled_contract_activations_due_idx
  on public.scheduled_contract_activations(status, scheduled_for, company_id);

alter table public.scheduled_contract_activations enable row level security;
revoke all on table public.scheduled_contract_activations
  from public, anon, authenticated;

create or replace function public.refresh_client_contract_summary(
  p_company_id uuid,
  p_client_id uuid,
  p_as_of timestamptz default now()
) returns public.clients
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client public.clients%rowtype;
  v_contract public.client_contracts%rowtype;
  v_end timestamptz;
begin
  select * into strict v_client
  from public.clients
  where id = p_client_id and company_id = p_company_id
  for update;

  select contract.* into v_contract
  from public.client_contracts contract
  where contract.company_id = p_company_id
    and contract.client_id = v_client.glide_row_id
    and contract.archived_at is null
    and lower(coalesce(contract.status, 'active')) = 'active'
    and lower(coalesce(contract.contract_type, contract.metadata->>'contract_type', 'standard')) <> 'add_on'
    and (contract.start_date is null or contract.start_date <= p_as_of)
    and (
      contract.end_date is null
      or contract.end_date >= p_as_of::date
      or (
        contract.start_date is not null
        and contract.contract_days is not null
        and contract.start_date + make_interval(days => round(contract.contract_days)::integer) >= p_as_of
      )
    )
  order by
    coalesce(
      contract.end_date,
      case
        when contract.start_date is not null and contract.contract_days is not null
          then contract.start_date + make_interval(days => round(contract.contract_days)::integer)
        else 'infinity'::timestamptz
      end
    ) desc,
    contract.created_at desc
  limit 1;

  if v_contract.id is not null then
    v_end := coalesce(
      v_contract.end_date,
      case
        when v_contract.start_date is not null and v_contract.contract_days is not null
          then v_contract.start_date + make_interval(days => round(v_contract.contract_days)::integer)
        else null
      end
    );
    update public.clients
    set current_contract_start_date = v_contract.start_date,
        current_contract_of_days = v_contract.contract_days,
        current_contract_end_date = v_end,
        current_contract_end_date_for_filtering = v_end,
        current_contract_monthly_value = v_contract.monthly_value,
        current_contract_reference_link = v_contract.reference_link,
        current_contract_notes = v_contract.notes,
        current_contract_auto_renew = v_contract.auto_renew
    where id = v_client.id
    returning * into v_client;
  else
    update public.clients
    set current_contract_start_date = null,
        current_contract_of_days = null,
        current_contract_end_date = null,
        current_contract_end_date_for_filtering = null,
        current_contract_monthly_value = null,
        current_contract_reference_link = null,
        current_contract_notes = null,
        current_contract_auto_renew = null
    where id = v_client.id
    returning * into v_client;
  end if;

  return v_client;
end;
$$;

create or replace function public.create_scheduled_retention_contract(
  p_company_id uuid,
  p_client_id uuid,
  p_pipeline_item_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_contract_days numeric,
  p_monthly_value numeric,
  p_total_contract_value numeric,
  p_reference_link text,
  p_notes text,
  p_auto_renew boolean,
  p_currency_code text,
  p_retention_type text,
  p_target_status text,
  p_apply_target_status_now boolean,
  p_mark_success boolean,
  p_actor_auth_user_id uuid,
  p_actor_member_id uuid,
  p_actor_role text,
  p_source text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client public.clients%rowtype;
  v_contract public.client_contracts%rowtype;
  v_item public.client_pipeline_items%rowtype;
  v_item_before jsonb;
  v_pipeline public.company_pipelines%rowtype;
  v_won_stage uuid;
  v_stage_event uuid;
  v_contract_event public.client_history_events%rowtype;
  v_retention_event public.client_history_events%rowtype;
  v_schedule public.scheduled_contract_activations%rowtype;
  v_effective_end timestamptz;
  v_original_status text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text, 0));
  if p_start_date is null or p_start_date <= now() then
    raise exception 'Scheduled activation requires a future contract start date.';
  end if;
  if p_retention_type not in ('renewal', 'upsell') then
    raise exception 'Scheduled activation requires a renewal or upsell retention outcome.';
  end if;
  if p_target_status not in ('front-end', 'back-end') then
    raise exception 'Scheduled activation target must be Front End or Back End.';
  end if;
  if p_source not in ('contract_create', 'pipeline_workspace') then
    raise exception 'Unsupported scheduled activation source.';
  end if;

  select * into strict v_client
  from public.clients
  where id = p_client_id and company_id = p_company_id and archived_at is null
  for update;
  if v_client.program_status_value not in ('front-end', 'back-end') then
    raise exception 'Scheduled retention requires an active client.';
  end if;
  v_original_status := v_client.program_status_value;
  if p_target_status <> v_client.program_status_value
     and not (v_client.program_status_value = 'front-end' and p_target_status = 'back-end') then
    raise exception 'A scheduled renewal can continue the current program or move Front End to Back End.';
  end if;
  if coalesce(p_apply_target_status_now, false)
     and (v_original_status <> 'front-end' or p_target_status <> 'back-end') then
    raise exception 'Only a Front End to Back End transition can be applied immediately.';
  end if;
  if exists (
    select 1 from public.scheduled_contract_activations schedule
    where schedule.company_id = p_company_id
      and schedule.client_id = p_client_id
      and schedule.status = 'pending'
  ) then
    raise exception 'This client already has a pending contract activation.';
  end if;

  if p_pipeline_item_id is not null then
    if not public.is_company_pipeline_enabled(p_company_id) then
      raise exception 'Pipeline is disabled for this company.';
    end if;
    select * into strict v_item
    from public.client_pipeline_items
    where id = p_pipeline_item_id and company_id = p_company_id
    for update;
    if v_item.client_id <> p_client_id or v_item.lifecycle_status <> 'open' then
      raise exception 'Pipeline item is not an open renewal for this client.';
    end if;
    select * into strict v_pipeline
    from public.company_pipelines
    where id = v_item.pipeline_id and company_id = p_company_id
      and pipeline_type = 'renewal' and is_enabled and archived_at is null;
    select id into strict v_won_stage
    from public.company_pipeline_stages
    where pipeline_id = v_pipeline.id and company_id = p_company_id
      and stage_type = 'won' and is_enabled and archived_at is null;
  end if;

  v_effective_end := coalesce(
    p_end_date,
    case
      when p_contract_days is not null
        then p_start_date + make_interval(days => round(p_contract_days)::integer)
      else null
    end
  );

  insert into public.client_contracts (
    company_id, company_glide_row_id, glide_row_id, client_id,
    start_date, end_date, contract_days, monthly_value, total_contract_value,
    reference_link, notes, auto_renew, status, contract_type, billing_cadence,
    currency_code, origin_pipeline_item_id, metadata
  ) values (
    p_company_id, v_client.company_glide_row_id, gen_random_uuid()::text,
    v_client.glide_row_id, p_start_date, v_effective_end, p_contract_days,
    p_monthly_value, p_total_contract_value, p_reference_link, p_notes,
    coalesce(p_auto_renew, false), 'pending', 'renewal',
    case when v_effective_end is null then 'open_ended' else 'fixed_term' end,
    upper(coalesce(nullif(trim(p_currency_code), ''), 'USD')),
    p_pipeline_item_id,
    jsonb_build_object(
      'source', p_source,
      'actor_role', p_actor_role,
      'retention_type', p_retention_type,
      'scheduled_activation', true
    )
  ) returning * into v_contract;

  if coalesce(p_apply_target_status_now, false) then
    update public.clients
    set program_status_value = p_target_status,
        client_age_date_offboarded = null,
        client_age_date_offboarded_for_filtering = null,
        program_latest_back_end_start_date = now()
    where id = v_client.id
    returning * into v_client;
  end if;

  if coalesce(p_mark_success, false) then
    update public.clients
    set outcomes_success_value = 'yes',
        outcomes_success_value_for_filtering = 'yes',
        outcomes_success_date = now()
    where id = v_client.id
    returning * into v_client;
  end if;

  if p_pipeline_item_id is not null then
    v_item_before := to_jsonb(v_item);
    update public.client_pipeline_items
    set stage_id = v_won_stage,
        result_contract_id = v_contract.id,
        actual_value_cents = round(coalesce(p_total_contract_value, p_monthly_value, 0) * 100)::bigint,
        lifecycle_status = 'won',
        outcome = 'won',
        current_note = coalesce(p_notes, current_note),
        follow_up_at = null
    where id = v_item.id
    returning * into v_item;

    insert into public.client_pipeline_stage_events (
      company_id, pipeline_id, item_id, from_stage_id, to_stage_id,
      actor_auth_user_id, actor_member_id, event_type, note,
      before_data, after_data, metadata
    ) values (
      p_company_id, v_item.pipeline_id, v_item.id,
      (v_item_before->>'stage_id')::uuid, v_won_stage,
      p_actor_auth_user_id, p_actor_member_id, 'stage_changed', p_notes,
      v_item_before, to_jsonb(v_item),
      jsonb_build_object('actor_role', p_actor_role, 'result_contract_id', v_contract.id, 'scheduled_activation', true)
    ) returning id into v_stage_event;

    insert into public.client_history_events (
      company_id, legacy_client_glide_row_id, actor_auth_user_id,
      actor_member_id, event_type, source, title, summary, notes, payload
    ) values (
      p_company_id, v_client.glide_row_id, p_actor_auth_user_id,
      p_actor_member_id, 'pipeline_activity', 'pipeline_workspace',
      'Pipeline item won',
      'Renewal signed; contract activation is scheduled for ' || p_start_date::date::text || '.',
      p_notes,
      jsonb_build_object('pipeline_item_id', v_item.id, 'result_contract_id', v_contract.id, 'stage_event_id', v_stage_event, 'scheduled_activation', true)
    );

    insert into public.app_audit_events (
      company_id, actor_auth_user_id, actor_member_id, event_type, source,
      entity_table, entity_id, legacy_glide_row_id, title, summary,
      before_data, after_data, metadata
    ) values (
      p_company_id, p_actor_auth_user_id, p_actor_member_id,
      'pipeline_item_won', 'pipeline_workspace', 'client_pipeline_items',
      v_item.id, v_client.glide_row_id, 'Pipeline item won', v_client.client_name,
      v_item_before, to_jsonb(v_item),
      jsonb_build_object('result_contract_id', v_contract.id, 'actor_role', p_actor_role, 'scheduled_activation', true)
    );
  end if;

  insert into public.client_history_events (
    company_id, legacy_client_glide_row_id, actor_auth_user_id,
    actor_member_id, event_type, source, title, summary, notes, payload
  ) values (
    p_company_id, v_client.glide_row_id, p_actor_auth_user_id,
    p_actor_member_id, 'contract_created', p_source,
    'Future renewal contract created',
    'Renewal contract begins ' || p_start_date::date::text || ' and is pending activation.',
    p_notes,
    jsonb_build_object('contract', to_jsonb(v_contract), 'client', to_jsonb(v_client), 'scheduled_activation', true)
  ) returning * into v_contract_event;

  insert into public.client_history_events (
    company_id, legacy_client_glide_row_id, actor_auth_user_id,
    actor_member_id, event_type, source, title, summary, notes,
    success_status, payload
  ) values (
    p_company_id, v_client.glide_row_id, p_actor_auth_user_id,
    p_actor_member_id, 'client_retention_recorded', p_source,
    case when p_retention_type = 'upsell'
      then 'Client retained via scheduled Back End renewal'
      else 'Client retained via renewal' end,
    'Renewal signed; effective ' || p_start_date::date::text || '.',
    p_notes,
    case when coalesce(p_mark_success, false) then 'yes' else null end,
    jsonb_build_object(
      'actor_role', p_actor_role,
      'retention_type', p_retention_type,
      'retention_date', p_start_date,
      'decision_recorded_at', now(),
      'from_status', v_original_status,
      'to_status', p_target_status,
      'status_transition_timing', case
        when coalesce(p_apply_target_status_now, false) then 'immediate'
        else 'on_contract_start'
      end,
      'scheduled_transition_at', p_start_date,
      'success_marked', coalesce(p_mark_success, false),
      'pipeline_item_id', p_pipeline_item_id,
      'contract', to_jsonb(v_contract),
      'client', to_jsonb(v_client)
    )
  ) returning * into v_retention_event;

  insert into public.scheduled_contract_activations (
    company_id, client_id, contract_id, pipeline_item_id, scheduled_for,
    expected_from_status, target_status, source,
    created_by_auth_user_id, created_by_member_id, metadata
  ) values (
    p_company_id, v_client.id, v_contract.id, p_pipeline_item_id, p_start_date,
    v_client.program_status_value, p_target_status, p_source,
    p_actor_auth_user_id, p_actor_member_id,
    jsonb_build_object(
      'retention_type', p_retention_type,
      'contract_history_event_id', v_contract_event.id,
      'retention_history_event_id', v_retention_event.id,
      'original_status', v_original_status,
      'target_status_applied_immediately', coalesce(p_apply_target_status_now, false)
    )
  ) returning * into v_schedule;

  insert into public.client_history_events (
    company_id, legacy_client_glide_row_id, actor_auth_user_id,
    actor_member_id, event_type, source, title, summary, notes, payload
  ) values (
    p_company_id, v_client.glide_row_id, p_actor_auth_user_id,
    p_actor_member_id, 'scheduled_contract_activation_created', p_source,
    'Contract activation scheduled',
    case when v_client.program_status_value <> p_target_status
      then 'Contract activation and ' || v_client.program_status_value || ' to ' || p_target_status || ' transition scheduled for ' || p_start_date::date::text || '.'
      else 'Contract activation scheduled for ' || p_start_date::date::text || '.' end,
    p_notes,
    jsonb_build_object('schedule_id', v_schedule.id, 'contract_id', v_contract.id, 'pipeline_item_id', p_pipeline_item_id, 'scheduled_for', p_start_date, 'target_status', p_target_status)
  );

  insert into public.app_audit_events (
    company_id, actor_auth_user_id, actor_member_id, event_type, source,
    entity_table, entity_id, legacy_glide_row_id, title, summary,
    after_data, metadata
  ) values (
    p_company_id, p_actor_auth_user_id, p_actor_member_id,
    'scheduled_contract_activation_created', p_source,
    'scheduled_contract_activations', v_schedule.id, v_client.glide_row_id,
    'Contract activation scheduled', v_client.client_name,
    to_jsonb(v_schedule),
    jsonb_build_object('contract_id', v_contract.id, 'pipeline_item_id', p_pipeline_item_id, 'actor_role', p_actor_role)
  );

  insert into public.app_audit_events (
    company_id, actor_auth_user_id, actor_member_id, event_type, source,
    entity_table, entity_id, legacy_glide_row_id, title, summary,
    after_data, metadata
  ) values (
    p_company_id, p_actor_auth_user_id, p_actor_member_id,
    'contract_created', p_source, 'client_contracts', v_contract.id,
    v_contract.glide_row_id, 'Future renewal contract created', v_client.client_name,
    to_jsonb(v_contract),
    jsonb_build_object('schedule_id', v_schedule.id, 'pipeline_item_id', p_pipeline_item_id, 'actor_role', p_actor_role)
  );

  return jsonb_build_object(
    'contract', to_jsonb(v_contract),
    'client', to_jsonb(v_client),
    'item', case when p_pipeline_item_id is null then null else to_jsonb(v_item) end,
    'event', to_jsonb(v_contract_event),
    'retentionEvent', to_jsonb(v_retention_event),
    'scheduledActivation', to_jsonb(v_schedule)
  );
end;
$$;

create or replace function public.process_due_scheduled_contract_activations(
  p_as_of timestamptz default now(),
  p_limit integer default 100
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schedule public.scheduled_contract_activations%rowtype;
  v_contract public.client_contracts%rowtype;
  v_client public.clients%rowtype;
  v_item public.client_pipeline_items%rowtype;
  v_history_id uuid;
  v_completed integer := 0;
  v_blocked integer := 0;
  v_reason text;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Activation batch limit must be between 1 and 500.';
  end if;

  for v_schedule in
    select * from public.scheduled_contract_activations
    where status = 'pending' and scheduled_for <= p_as_of
    order by scheduled_for, id
    limit p_limit
    for update skip locked
  loop
    begin
      update public.scheduled_contract_activations
      set attempt_count = attempt_count + 1,
          last_attempt_at = p_as_of,
          updated_at = now()
      where id = v_schedule.id;

      v_reason := null;
      select * into v_client
      from public.clients
      where id = v_schedule.client_id and company_id = v_schedule.company_id
      for update;
      select * into v_contract
      from public.client_contracts
      where id = v_schedule.contract_id and company_id = v_schedule.company_id
      for update;

      if v_client.id is null or v_client.archived_at is not null then
        v_reason := 'client_unavailable';
      elsif v_client.program_status_value in ('paused', 'suspended', 'off-boarded', 'offboarded') then
        v_reason := 'client_not_active';
      elsif v_client.program_status_value not in (v_schedule.expected_from_status, v_schedule.target_status) then
        v_reason := 'client_status_changed';
      elsif v_contract.id is null or v_contract.archived_at is not null then
        v_reason := 'contract_unavailable';
      elsif lower(coalesce(v_contract.status, '')) <> 'pending' then
        v_reason := 'contract_not_pending';
      elsif v_contract.start_date is null or v_contract.start_date > p_as_of then
        v_reason := 'contract_start_not_due';
      end if;

      if v_reason is null and v_schedule.pipeline_item_id is not null then
        select * into v_item
        from public.client_pipeline_items
        where id = v_schedule.pipeline_item_id and company_id = v_schedule.company_id;
        if v_item.id is null or v_item.archived_at is not null
           or v_item.lifecycle_status <> 'won'
           or v_item.result_contract_id is distinct from v_contract.id then
          v_reason := 'pipeline_evidence_mismatch';
        end if;
      end if;

      if v_reason is not null then
        update public.scheduled_contract_activations
        set status = 'blocked', blocked_at = p_as_of,
            blocked_reason = v_reason, last_error = null,
            metadata = metadata || jsonb_build_object(
              'blocked_client_status', v_client.program_status_value,
              'blocked_contract_status', v_contract.status
            ),
            updated_at = now()
        where id = v_schedule.id;

        if v_client.id is not null then
          insert into public.client_history_events (
            company_id, legacy_client_glide_row_id, event_type, source,
            title, summary, payload
          ) values (
            v_schedule.company_id, v_client.glide_row_id,
            'scheduled_contract_activation_blocked', 'scheduled_contract_activation',
            'Scheduled contract activation needs review', v_reason,
            jsonb_build_object('schedule_id', v_schedule.id, 'contract_id', v_schedule.contract_id, 'reason', v_reason)
          );
        end if;
        insert into public.app_audit_events (
          company_id, event_type, source, entity_table, entity_id,
          legacy_glide_row_id, title, summary, metadata
        ) values (
          v_schedule.company_id, 'scheduled_contract_activation_blocked',
          'scheduled_contract_activation', 'scheduled_contract_activations',
          v_schedule.id, v_client.glide_row_id,
          'Scheduled contract activation blocked', v_reason,
          jsonb_build_object('contract_id', v_schedule.contract_id)
        );
        v_blocked := v_blocked + 1;
        continue;
      end if;

      update public.client_contracts
      set status = 'active',
          updated_at = now(),
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'scheduled_activation_completed_at', p_as_of,
            'scheduled_activation_id', v_schedule.id
          )
      where id = v_contract.id
      returning * into v_contract;

      perform public.refresh_client_contract_summary(
        v_schedule.company_id,
        v_schedule.client_id,
        p_as_of
      );

      if v_client.program_status_value is distinct from v_schedule.target_status then
        update public.clients
        set program_status_value = v_schedule.target_status,
            client_age_date_offboarded = null,
            client_age_date_offboarded_for_filtering = null,
            program_latest_back_end_start_date = case
              when v_schedule.target_status = 'back-end' then v_schedule.scheduled_for
              else program_latest_back_end_start_date
            end
        where id = v_client.id;
      end if;

      insert into public.client_history_events (
        company_id, legacy_client_glide_row_id, event_type, source,
        title, summary, payload
      ) values (
        v_schedule.company_id, v_client.glide_row_id,
        'scheduled_contract_activation_completed', 'scheduled_contract_activation',
        'Scheduled contract activated',
        case when v_schedule.expected_from_status <> v_schedule.target_status
          then 'Contract activated and client moved from ' || v_schedule.expected_from_status || ' to ' || v_schedule.target_status || '.'
          else 'Contract activated on its scheduled start date.' end,
        jsonb_build_object(
          'schedule_id', v_schedule.id,
          'contract_id', v_contract.id,
          'pipeline_item_id', v_schedule.pipeline_item_id,
          'effective_at', v_schedule.scheduled_for,
          'from_status', v_schedule.expected_from_status,
          'to_status', v_schedule.target_status
        )
      ) returning id into v_history_id;

      update public.scheduled_contract_activations
      set status = 'completed', completed_at = p_as_of,
          completion_history_event_id = v_history_id,
          last_error = null, updated_at = now()
      where id = v_schedule.id;

      insert into public.app_audit_events (
        company_id, event_type, source, entity_table, entity_id,
        legacy_glide_row_id, title, summary, after_data, metadata
      ) values (
        v_schedule.company_id, 'scheduled_contract_activation_completed',
        'scheduled_contract_activation', 'scheduled_contract_activations',
        v_schedule.id, v_client.glide_row_id,
        'Scheduled contract activation completed', v_client.client_name,
        jsonb_build_object('contract', to_jsonb(v_contract), 'target_status', v_schedule.target_status),
        jsonb_build_object('contract_id', v_contract.id, 'pipeline_item_id', v_schedule.pipeline_item_id, 'history_event_id', v_history_id)
      );
      v_completed := v_completed + 1;
    exception when others then
      update public.scheduled_contract_activations
      set status = 'blocked', blocked_at = p_as_of,
          blocked_reason = 'unexpected_error', last_error = sqlerrm,
          updated_at = now()
      where id = v_schedule.id and status = 'pending';
      insert into public.app_audit_events (
        company_id, event_type, source, entity_table, entity_id,
        title, summary, metadata
      ) values (
        v_schedule.company_id, 'scheduled_contract_activation_blocked',
        'scheduled_contract_activation', 'scheduled_contract_activations',
        v_schedule.id, 'Scheduled contract activation blocked',
        'Unexpected processing error.', jsonb_build_object('error', sqlerrm)
      );
      v_blocked := v_blocked + 1;
    end;
  end loop;

  return jsonb_build_object(
    'completed_count', v_completed,
    'blocked_count', v_blocked,
    'remaining_due_count', (
      select count(*) from public.scheduled_contract_activations
      where status = 'pending' and scheduled_for <= p_as_of
    )
  );
end;
$$;

create or replace function public.reconcile_scheduled_contract_activation(
  p_company_id uuid,
  p_contract_id uuid,
  p_action text,
  p_scheduled_for timestamptz,
  p_actor_auth_user_id uuid,
  p_actor_member_id uuid,
  p_actor_role text
) returns public.scheduled_contract_activations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schedule public.scheduled_contract_activations%rowtype;
begin
  select * into v_schedule
  from public.scheduled_contract_activations
  where company_id = p_company_id and contract_id = p_contract_id
    and status = 'pending'
  for update;
  if v_schedule.id is null then return null; end if;

  if p_action in ('archive', 'delete', 'cancel') then
    update public.scheduled_contract_activations
    set status = 'cancelled', cancelled_at = now(),
        cancellation_reason = 'Contract ' || p_action || 'd before activation.',
        updated_at = now()
    where id = v_schedule.id
    returning * into v_schedule;
  elsif p_action = 'update' then
    if p_scheduled_for is null then
      raise exception 'A pending activation requires a contract start date.';
    end if;
    update public.scheduled_contract_activations
    set scheduled_for = p_scheduled_for, updated_at = now()
    where id = v_schedule.id
    returning * into v_schedule;
  else
    raise exception 'Unsupported activation reconciliation action.';
  end if;

  insert into public.app_audit_events (
    company_id, actor_auth_user_id, actor_member_id, event_type, source,
    entity_table, entity_id, title, summary, after_data, metadata
  ) values (
    p_company_id, p_actor_auth_user_id, p_actor_member_id,
    case when v_schedule.status = 'cancelled'
      then 'scheduled_contract_activation_cancelled'
      else 'scheduled_contract_activation_updated' end,
    'contract_update', 'scheduled_contract_activations', v_schedule.id,
    case when v_schedule.status = 'cancelled'
      then 'Scheduled contract activation cancelled'
      else 'Scheduled contract activation updated' end,
    coalesce(v_schedule.cancellation_reason, 'Scheduled date updated.'),
    to_jsonb(v_schedule), jsonb_build_object('actor_role', p_actor_role)
  );
  return v_schedule;
end;
$$;

revoke all on function public.refresh_client_contract_summary(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.create_scheduled_retention_contract(
  uuid, uuid, uuid, timestamptz, timestamptz, numeric, numeric, numeric,
  text, text, boolean, text, text, text, boolean, boolean, uuid, uuid, text, text
) from public, anon, authenticated;
revoke all on function public.process_due_scheduled_contract_activations(timestamptz, integer)
  from public, anon, authenticated;
revoke all on function public.reconcile_scheduled_contract_activation(
  uuid, uuid, text, timestamptz, uuid, uuid, text
) from public, anon, authenticated;

grant execute on function public.refresh_client_contract_summary(uuid, uuid, timestamptz)
  to service_role;
grant execute on function public.create_scheduled_retention_contract(
  uuid, uuid, uuid, timestamptz, timestamptz, numeric, numeric, numeric,
  text, text, boolean, text, text, text, boolean, boolean, uuid, uuid, text, text
) to service_role;
grant execute on function public.process_due_scheduled_contract_activations(timestamptz, integer)
  to service_role;
grant execute on function public.reconcile_scheduled_contract_activation(
  uuid, uuid, text, timestamptz, uuid, uuid, text
) to service_role;

do $do$
declare
  v_exists boolean := false;
begin
  if to_regclass('cron.job') is not null then
    execute 'select exists(select 1 from cron.job where jobname = $1)'
      into v_exists using 'retainos-scheduled-contract-activations';
    if not v_exists then
      execute 'select cron.schedule($1, $2, $3)'
        using
          'retainos-scheduled-contract-activations',
          '*/15 * * * *',
          'select public.process_due_scheduled_contract_activations(now(), 100);';
    end if;
  end if;
end;
$do$;

notify pgrst, 'reload schema';
