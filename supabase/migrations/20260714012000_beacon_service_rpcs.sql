-- Beacon server-only access, entitlement, quota, and AI-feature management RPCs.
-- None of these functions is executable by anon or authenticated browser roles.

create or replace function public.beacon_allowance_period(
  p_allowance_id uuid,
  p_at timestamptz default now()
)
returns table (
  period_start timestamptz,
  period_end timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_allowance public.company_ai_feature_allowances%rowtype;
  v_local timestamp without time zone;
  v_start_local timestamp without time zone;
begin
  select allowance.*
  into strict v_allowance
  from public.company_ai_feature_allowances allowance
  where allowance.id = p_allowance_id;

  if v_allowance.period_type = 'one_time' then
    period_start := v_allowance.lineage_started_at;
    period_end := 'infinity'::timestamptz;
    return next;
    return;
  end if;

  v_local := p_at at time zone v_allowance.period_timezone;
  if extract(day from v_local)::integer >= v_allowance.reset_day then
    v_start_local := date_trunc('month', v_local)
      + make_interval(days => v_allowance.reset_day - 1);
  else
    v_start_local := date_trunc('month', v_local) - interval '1 month'
      + make_interval(days => v_allowance.reset_day - 1);
  end if;

  period_start := v_start_local at time zone v_allowance.period_timezone;
  period_end := (v_start_local + interval '1 month')
    at time zone v_allowance.period_timezone;
  return next;
end;
$$;

create or replace function public.beacon_record_usage_denial(
  p_request_id uuid,
  p_company_id uuid,
  p_feature_key text,
  p_actor_auth_user_id uuid,
  p_actor_member_id uuid,
  p_actor_role text,
  p_decision text,
  p_denial_code text,
  p_entitlement_status text,
  p_retry_after_seconds integer,
  p_release_version text,
  p_input_chars integer,
  p_allowance_id uuid,
  p_meter_type text,
  p_allowance_limit bigint,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  insert into public.ai_usage_events (
    request_id,
    event_kind,
    company_id,
    feature_key,
    actor_auth_user_id,
    actor_member_id,
    actor_role,
    decision,
    outcome,
    denial_code,
    entitlement_status,
    allowance_id,
    meter_type,
    allowance_limit_snapshot,
    allowance_period_start,
    allowance_period_end,
    limiter_metadata,
    release_version
  )
  values (
    p_request_id,
    'denial',
    p_company_id,
    p_feature_key,
    p_actor_auth_user_id,
    p_actor_member_id,
    p_actor_role,
    p_decision,
    'denied',
    p_denial_code,
    p_entitlement_status,
    p_allowance_id,
    p_meter_type,
    p_allowance_limit,
    p_period_start,
    p_period_end,
    jsonb_strip_nulls(jsonb_build_object(
      'retry_after_seconds', p_retry_after_seconds,
      'input_characters', p_input_chars
    )),
    p_release_version
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function public.beacon_reserve_usage(
  p_request_id uuid,
  p_feature_key text,
  p_company_id uuid,
  p_actor_auth_user_id uuid,
  p_actor_member_id uuid,
  p_actor_role text,
  p_reserved_cost_micros bigint,
  p_input_chars integer,
  p_release_version text
)
returns table (
  accepted boolean,
  reservation_id uuid,
  reason_code text,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.ai_usage_events%rowtype;
  v_existing_terminal public.ai_usage_events%rowtype;
  v_control public.ai_feature_global_controls%rowtype;
  v_entitlement public.company_ai_feature_entitlements%rowtype;
  v_allowance public.company_ai_feature_allowances%rowtype;
  v_actor_role text;
  v_actor_member_id uuid;
  v_member_count integer;
  v_ledger_ready boolean;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_consumed bigint;
  v_reserved bigint;
  v_reserved_cents bigint;
  v_event_id uuid;
  v_count bigint;
  v_company_daily_limit integer;
  v_now timestamptz := clock_timestamp();
begin
  if p_request_id is null
    or p_actor_auth_user_id is null
    or p_company_id is null
    or p_feature_key <> 'beacon'
    or p_actor_role not in ('super_admin', 'director', 'support', 'csm', 'viewer')
    or p_reserved_cost_micros is null
    or p_reserved_cost_micros <> 500000
    or p_input_chars is null
    or p_input_chars < 1
    or p_input_chars > 10000
    or p_release_version is null
    or length(p_release_version) > 128 then
    return query select false, null::uuid, 'invalid_reservation_request'::text, null::integer;
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_company_id::text || ':' || p_feature_key, 0)
  );

  -- Reservations remain budget/concurrency-active until an explicit terminal
  -- event exists. Append stale expirations while holding this same quota lock.
  perform public.beacon_expire_usage_reservations(
    p_company_id,
    p_feature_key,
    100
  );

  select event.*
  into v_existing
  from public.ai_usage_events event
  where event.request_id = p_request_id
    and event.event_kind in ('reservation', 'denial')
  limit 1;

  if found then
    if v_existing.company_id <> p_company_id
      or v_existing.feature_key <> p_feature_key
      or v_existing.actor_auth_user_id <> p_actor_auth_user_id
      or v_existing.actor_member_id is distinct from p_actor_member_id
      or v_existing.actor_role <> p_actor_role then
      return query select false, null::uuid, 'duplicate_request_mismatch'::text, null::integer;
    elsif v_existing.event_kind = 'reservation' then
      select terminal.*
      into v_existing_terminal
      from public.ai_usage_events terminal
      where terminal.request_id = p_request_id
        and terminal.event_kind in ('finalization', 'expiration')
      limit 1;

      if found and v_existing_terminal.event_kind = 'expiration' then
        return query select false, null::uuid, 'reservation_expired'::text, 60;
      elsif found then
        return query select false, null::uuid, 'duplicate_request_finalized'::text, null::integer;
      else
        return query select true, v_existing.id, null::text, null::integer;
      end if;
    else
      return query select
        false,
        null::uuid,
        v_existing.denial_code,
        greatest(
          coalesce((v_existing.limiter_metadata ->> 'retry_after_seconds')::integer, 60),
          1
        );
    end if;
    return;
  end if;

  if not exists (
    select 1
    from public.companies company
    where company.id = p_company_id
      and company.status = 'active'
      and company.archived_at is null
      and company.migration_status in ('pilot', 'migrated')
  ) then
    return query select false, null::uuid, 'company_unavailable'::text, null::integer;
    return;
  end if;

  v_actor_role := null;
  v_actor_member_id := null;
  if exists (
    select 1
    from public.retainos_super_admins admin
    where admin.auth_user_id = p_actor_auth_user_id
      and admin.auth_user_id is not null
      and admin.status = 'active'
  ) then
    v_actor_role := 'super_admin';
  elsif p_actor_member_id is not null then
    select
      count(*),
      (array_agg(
        case when member.is_read_only then 'viewer' else member.role end
      ))[1],
      (array_agg(member.id))[1]
    into v_member_count, v_actor_role, v_actor_member_id
    from public.company_members member
    join auth.users auth_user
      on auth_user.id = p_actor_auth_user_id
    where member.id = p_actor_member_id
      and member.company_id = p_company_id
      and member.status = 'active'
      and member.archived_at is null
      and (
        member.auth_user_id = p_actor_auth_user_id
        or (
          member.auth_user_id is null
          and lower(member.email) = lower(coalesce(auth_user.email, ''))
        )
      );
    if v_member_count <> 1 then
      v_actor_role := null;
      v_actor_member_id := null;
    end if;
  end if;

  if v_actor_role is null
    or v_actor_role <> p_actor_role
    or v_actor_member_id is distinct from p_actor_member_id
    or v_actor_role = 'viewer' then
    return query select false, null::uuid, 'role_not_allowed'::text, null::integer;
    return;
  end if;

  if v_actor_role = 'csm' then
    select coalesce(readiness.ledger_ready, false)
    into v_ledger_ready
    from public.beacon_assignment_ledger_readiness(p_company_id) readiness
    where readiness.company_id = p_company_id;
    if not coalesce(v_ledger_ready, false) then
      return query select false, null::uuid, 'assignment_ledger_unavailable'::text, null::integer;
      return;
    end if;
  end if;

  select control.*
  into v_control
  from public.ai_feature_global_controls control
  where control.feature_key = p_feature_key;

  select entitlement.*
  into v_entitlement
  from public.company_ai_feature_entitlements entitlement
  where entitlement.company_id = p_company_id
    and entitlement.feature_key = p_feature_key;

  if not found then
    return query select false, null::uuid, 'feature_disabled'::text, null::integer;
    return;
  end if;

  if v_control.feature_key is null or v_control.status <> 'active' then
    v_event_id := public.beacon_record_usage_denial(
      p_request_id, p_company_id, p_feature_key,
      p_actor_auth_user_id, p_actor_member_id, p_actor_role,
      'denied', 'global_unavailable', v_entitlement.status,
      60, p_release_version, p_input_chars,
      null, null, null, null, null
    );
    return query select false, null::uuid, 'global_unavailable'::text, 60;
    return;
  end if;

  if v_entitlement.status not in ('pilot', 'enabled')
    or (v_entitlement.effective_from is not null and v_entitlement.effective_from > v_now)
    or (v_entitlement.effective_until is not null and v_entitlement.effective_until <= v_now) then
    v_event_id := public.beacon_record_usage_denial(
      p_request_id, p_company_id, p_feature_key,
      p_actor_auth_user_id, p_actor_member_id, p_actor_role,
      'denied', case
        when v_entitlement.status = 'paused' then 'feature_paused'
        else 'feature_disabled'
      end,
      v_entitlement.status, null, p_release_version, p_input_chars,
      null, null, null, null, null
    );
    return query select false, null::uuid, case
      when v_entitlement.status = 'paused' then 'feature_paused'
      else 'feature_disabled'
    end, null::integer;
    return;
  end if;

  select allowance.*
  into v_allowance
  from public.company_ai_feature_allowances allowance
  where allowance.company_id = p_company_id
    and allowance.feature_key = p_feature_key
    and allowance.meter_type = 'usd_cents'
    and allowance.status = 'active'
    and allowance.hard_stop
    and allowance.effective_from <= v_now
    and (allowance.effective_until is null or allowance.effective_until > v_now);

  if not found then
    v_event_id := public.beacon_record_usage_denial(
      p_request_id, p_company_id, p_feature_key,
      p_actor_auth_user_id, p_actor_member_id, p_actor_role,
      'budget_blocked', 'allowance_missing', v_entitlement.status,
      60, p_release_version, p_input_chars,
      null, null, null, null, null
    );
    return query select false, null::uuid, 'allowance_missing'::text, 60;
    return;
  end if;

  if p_reserved_cost_micros > v_control.max_reserve_cost_micros_per_request then
    v_event_id := public.beacon_record_usage_denial(
      p_request_id, p_company_id, p_feature_key,
      p_actor_auth_user_id, p_actor_member_id, p_actor_role,
      'budget_blocked', 'reservation_cost_too_large', v_entitlement.status,
      60, p_release_version, p_input_chars,
      v_allowance.id, v_allowance.meter_type, v_allowance.limit_value, null, null
    );
    return query select false, null::uuid, 'reservation_cost_too_large'::text, 60;
    return;
  end if;

  v_reserved_cents := (p_reserved_cost_micros + 9999) / 10000;

  select snapshot.period_start,
    snapshot.period_end,
    snapshot.consumed_value,
    snapshot.reserved_value
  into v_period_start, v_period_end, v_consumed, v_reserved
  from public.beacon_allowance_usage_snapshot(v_allowance.id, v_now) snapshot;

  v_company_daily_limit := coalesce(
    v_entitlement.company_requests_per_day,
    v_control.default_company_requests_per_day
  );

  select count(*) into v_count
  from public.ai_usage_events reservation
  where reservation.event_kind = 'reservation'
    and reservation.feature_key = p_feature_key
    and reservation.actor_auth_user_id = p_actor_auth_user_id
    and not exists (
      select 1 from public.ai_usage_events terminal
      where terminal.request_id = reservation.request_id
        and terminal.event_kind in ('finalization', 'expiration')
    );
  if v_count >= v_control.actor_concurrency_limit then
    v_event_id := public.beacon_record_usage_denial(
      p_request_id, p_company_id, p_feature_key,
      p_actor_auth_user_id, p_actor_member_id, p_actor_role,
      'rate_limited', 'actor_concurrency_limited', v_entitlement.status,
      30, p_release_version, p_input_chars,
      v_allowance.id, v_allowance.meter_type, v_allowance.limit_value,
      v_period_start, v_period_end
    );
    return query select false, null::uuid, 'actor_concurrency_limited'::text, 30;
    return;
  end if;

  select count(*) into v_count
  from public.ai_usage_events reservation
  where reservation.event_kind = 'reservation'
    and reservation.feature_key = p_feature_key
    and reservation.actor_auth_user_id = p_actor_auth_user_id
    and reservation.created_at >= v_now - interval '1 minute';
  if v_count >= v_control.actor_requests_per_minute then
    v_event_id := public.beacon_record_usage_denial(
      p_request_id, p_company_id, p_feature_key,
      p_actor_auth_user_id, p_actor_member_id, p_actor_role,
      'rate_limited', 'actor_minute_limited', v_entitlement.status,
      60, p_release_version, p_input_chars,
      v_allowance.id, v_allowance.meter_type, v_allowance.limit_value,
      v_period_start, v_period_end
    );
    return query select false, null::uuid, 'actor_minute_limited'::text, 60;
    return;
  end if;

  select count(*) into v_count
  from public.ai_usage_events reservation
  where reservation.event_kind = 'reservation'
    and reservation.feature_key = p_feature_key
    and reservation.actor_auth_user_id = p_actor_auth_user_id
    and reservation.created_at >= date_trunc('day', v_now at time zone 'UTC') at time zone 'UTC';
  if v_count >= v_control.actor_requests_per_day then
    v_event_id := public.beacon_record_usage_denial(
      p_request_id, p_company_id, p_feature_key,
      p_actor_auth_user_id, p_actor_member_id, p_actor_role,
      'rate_limited', 'actor_daily_limited', v_entitlement.status,
      300, p_release_version, p_input_chars,
      v_allowance.id, v_allowance.meter_type, v_allowance.limit_value,
      v_period_start, v_period_end
    );
    return query select false, null::uuid, 'actor_daily_limited'::text, 300;
    return;
  end if;

  select count(*) into v_count
  from public.ai_usage_events reservation
  where reservation.event_kind = 'reservation'
    and reservation.company_id = p_company_id
    and reservation.feature_key = p_feature_key
    and reservation.created_at >= v_now - interval '1 minute';
  if v_count >= v_control.company_requests_per_minute then
    v_event_id := public.beacon_record_usage_denial(
      p_request_id, p_company_id, p_feature_key,
      p_actor_auth_user_id, p_actor_member_id, p_actor_role,
      'rate_limited', 'company_minute_limited', v_entitlement.status,
      60, p_release_version, p_input_chars,
      v_allowance.id, v_allowance.meter_type, v_allowance.limit_value,
      v_period_start, v_period_end
    );
    return query select false, null::uuid, 'company_minute_limited'::text, 60;
    return;
  end if;

  select count(*) into v_count
  from public.ai_usage_events reservation
  where reservation.event_kind = 'reservation'
    and reservation.company_id = p_company_id
    and reservation.feature_key = p_feature_key
    and reservation.created_at >= date_trunc('day', v_now at time zone 'UTC') at time zone 'UTC';
  if v_count >= v_company_daily_limit then
    v_event_id := public.beacon_record_usage_denial(
      p_request_id, p_company_id, p_feature_key,
      p_actor_auth_user_id, p_actor_member_id, p_actor_role,
      'rate_limited', 'company_daily_limited', v_entitlement.status,
      300, p_release_version, p_input_chars,
      v_allowance.id, v_allowance.meter_type, v_allowance.limit_value,
      v_period_start, v_period_end
    );
    return query select false, null::uuid, 'company_daily_limited'::text, 300;
    return;
  end if;

  if v_consumed + v_reserved + v_reserved_cents > v_allowance.limit_value then
    v_event_id := public.beacon_record_usage_denial(
      p_request_id, p_company_id, p_feature_key,
      p_actor_auth_user_id, p_actor_member_id, p_actor_role,
      'budget_blocked', 'allowance_exhausted', v_entitlement.status,
      60, p_release_version, p_input_chars,
      v_allowance.id, v_allowance.meter_type, v_allowance.limit_value,
      v_period_start, v_period_end
    );
    return query select false, null::uuid, 'allowance_exhausted'::text, 60;
    return;
  end if;

  insert into public.ai_usage_events (
    request_id,
    event_kind,
    company_id,
    feature_key,
    actor_auth_user_id,
    actor_member_id,
    actor_role,
    decision,
    outcome,
    entitlement_status,
    estimated_cost_micros,
    price_card_version,
    reserved_cost_micros,
    allowance_id,
    meter_type,
    reserved_meter_value,
    allowance_limit_snapshot,
    allowance_period_start,
    allowance_period_end,
    limiter_metadata,
    release_version,
    reservation_expires_at
  )
  values (
    p_request_id,
    'reservation',
    p_company_id,
    p_feature_key,
    p_actor_auth_user_id,
    p_actor_member_id,
    p_actor_role,
    'allowed',
    'reserved',
    v_entitlement.status,
    p_reserved_cost_micros,
    'gpt-5.4-mini-2026-03-17-2026-07-13',
    p_reserved_cost_micros,
    v_allowance.id,
    v_allowance.meter_type,
    v_reserved_cents,
    v_allowance.limit_value,
    v_period_start,
    v_period_end,
    jsonb_build_object('input_characters', p_input_chars),
    p_release_version,
    v_now + make_interval(secs => v_control.reservation_ttl_seconds)
  )
  returning id into v_event_id;

  insert into public.ai_usage_period_totals (
    policy_lineage_id,
    allowance_id,
    company_id,
    feature_key,
    meter_type,
    period_start,
    period_end,
    limit_value_snapshot,
    reserved_value,
    consumed_value,
    reservation_count
  )
  values (
    v_allowance.policy_lineage_id,
    v_allowance.id,
    p_company_id,
    p_feature_key,
    v_allowance.meter_type,
    v_period_start,
    v_period_end,
    v_allowance.limit_value,
    v_reserved + v_reserved_cents,
    v_consumed,
    1
  )
  on conflict (policy_lineage_id, period_start, period_end) do update
  set
    limit_value_snapshot = excluded.limit_value_snapshot,
    reserved_value = excluded.reserved_value,
    consumed_value = excluded.consumed_value,
    reservation_count = public.ai_usage_period_totals.reservation_count + 1;

  return query select true, v_event_id, null::text, null::integer;
end;
$$;

create or replace function public.beacon_finalize_usage(
  p_reservation_id uuid,
  p_request_id uuid,
  p_outcome text,
  p_model text,
  p_input_tokens integer,
  p_cached_input_tokens integer,
  p_output_tokens integer,
  p_reasoning_tokens integer,
  p_estimated_cost_micros bigint,
  p_tool_names text[],
  p_tool_call_count integer,
  p_tool_row_count integer,
  p_latency_ms integer,
  p_provider_response_id text,
  p_truncated boolean,
  p_cost_uncertain boolean,
  p_release_version text
)
returns table (
  finalized boolean,
  usage_event_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.ai_usage_events%rowtype;
  v_terminal public.ai_usage_events%rowtype;
  v_late public.ai_usage_events%rowtype;
  v_event_id uuid;
  v_event_kind text;
  v_final_outcome text;
  v_actual_cents bigint;
  v_accounted_cost_micros bigint;
  v_overage bigint;
  v_cost_anomaly boolean;
  v_snapshot record;
  v_now timestamptz := clock_timestamp();
begin
  if p_reservation_id is null
    or p_request_id is null
    or p_outcome is null
    or length(p_outcome) > 128
    or p_model is null
    or length(p_model) > 128
    or p_model <> 'gpt-5.4-mini-2026-03-17'
    or p_input_tokens is null or p_input_tokens < 0
    or p_cached_input_tokens is null or p_cached_input_tokens < 0
    or p_cached_input_tokens > p_input_tokens
    or p_output_tokens is null or p_output_tokens < 0
    or p_reasoning_tokens is null or p_reasoning_tokens < 0
    or p_reasoning_tokens > p_output_tokens
    or p_estimated_cost_micros is null or p_estimated_cost_micros < 0
    or p_estimated_cost_micros > 1000000000
    or p_tool_names is null or cardinality(p_tool_names) > 24
    or p_tool_call_count is null or p_tool_call_count < 0 or p_tool_call_count > 24
    or p_tool_row_count is null or p_tool_row_count < 0 or p_tool_row_count > 1200
    or p_latency_ms is null or p_latency_ms < 0 or p_latency_ms > 900000
    or (p_provider_response_id is not null and length(p_provider_response_id) > 256)
    or p_cost_uncertain is null
    or p_release_version is null or length(p_release_version) > 128
    or exists (
      select 1
      from unnest(p_tool_names) tool(name)
      where tool.name is null
        or tool.name not in (
          'company_metrics',
          'list_clients',
          'list_renewals',
          'list_contract_gaps',
          'list_health_signals',
          'list_referral_ready',
          'list_csm_books',
          'get_client_brief'
        )
    ) then
    raise exception using
      errcode = '22023',
      message = 'Usage finalization metadata is invalid';
  end if;

  select reservation.*
  into strict v_reservation
  from public.ai_usage_events reservation
  where reservation.id = p_reservation_id
    and reservation.request_id = p_request_id
    and reservation.event_kind = 'reservation';

  perform pg_advisory_xact_lock(
    hashtextextended(
      v_reservation.company_id::text || ':' || v_reservation.feature_key,
      0
    )
  );

  perform public.beacon_expire_usage_reservations(
    v_reservation.company_id,
    v_reservation.feature_key,
    100
  );

  select terminal.*
  into v_terminal
  from public.ai_usage_events terminal
  where terminal.request_id = p_request_id
    and terminal.event_kind in ('finalization', 'expiration')
  limit 1;

  if found then
    if v_terminal.event_kind = 'finalization' then
      return query select true, v_terminal.id;
      return;
    end if;

    select late.*
    into v_late
    from public.ai_usage_events late
    where late.request_id = p_request_id
      and late.event_kind = 'late_finalization'
    limit 1;

    if found then
      return query select false, v_late.id;
      return;
    elsif not p_cost_uncertain
      and p_estimated_cost_micros = 0
      and p_input_tokens = 0
      and p_output_tokens = 0
      and p_tool_call_count = 0
      and p_provider_response_id is null then
      return query select false, v_terminal.id;
      return;
    end if;

    v_event_kind := 'late_finalization';
  else
    v_event_kind := 'finalization';
  end if;

  v_final_outcome := case
    when p_outcome = 'success' then 'succeeded'
    when p_outcome = 'cancelled' then 'cancelled'
    else 'failed'
  end;
  v_accounted_cost_micros := case
    when p_cost_uncertain then greatest(
      p_estimated_cost_micros,
      coalesce(v_reservation.reserved_cost_micros, 0)
    )
    else p_estimated_cost_micros
  end;
  v_actual_cents := (v_accounted_cost_micros + 9999) / 10000;
  v_overage := greatest(
    v_actual_cents - coalesce(v_reservation.reserved_meter_value, 0),
    0
  );
  v_cost_anomaly := v_event_kind = 'late_finalization'
    or v_accounted_cost_micros > coalesce(v_reservation.reserved_cost_micros, 0);

  insert into public.ai_usage_events (
    request_id,
    event_kind,
    reservation_event_id,
    company_id,
    feature_key,
    actor_auth_user_id,
    actor_member_id,
    actor_role,
    decision,
    outcome,
    error_code,
    entitlement_status,
    model,
    tool_names,
    tool_call_count,
    tool_row_count,
    input_tokens,
    cached_input_tokens,
    output_tokens,
    reasoning_tokens,
    total_tokens,
    total_latency_ms,
    price_card_version,
    estimated_cost_micros,
    actual_cost_micros,
    reserved_cost_micros,
    allowance_id,
    meter_type,
    reserved_meter_value,
    actual_meter_value,
    allowance_limit_snapshot,
    allowance_period_start,
    allowance_period_end,
    overage_meter_value,
    provider_request_id,
    limiter_metadata,
    release_version,
    finalized_at
  )
  values (
    p_request_id,
    v_event_kind,
    v_reservation.id,
    v_reservation.company_id,
    v_reservation.feature_key,
    v_reservation.actor_auth_user_id,
    v_reservation.actor_member_id,
    v_reservation.actor_role,
    'allowed',
    v_final_outcome,
    case
      when v_event_kind = 'late_finalization'
        then left('late_' || p_outcome, 128)
      when v_final_outcome = 'succeeded' then null
      else p_outcome
    end,
    v_reservation.entitlement_status,
    p_model,
    p_tool_names,
    p_tool_call_count,
    p_tool_row_count,
    p_input_tokens,
    p_cached_input_tokens,
    p_output_tokens,
    p_reasoning_tokens,
    p_input_tokens + p_output_tokens,
    p_latency_ms,
    v_reservation.price_card_version,
    p_estimated_cost_micros,
    v_accounted_cost_micros,
    v_reservation.reserved_cost_micros,
    v_reservation.allowance_id,
    v_reservation.meter_type,
    v_reservation.reserved_meter_value,
    case
      when v_event_kind = 'late_finalization' then v_overage
      else v_actual_cents
    end,
    v_reservation.allowance_limit_snapshot,
    v_reservation.allowance_period_start,
    v_reservation.allowance_period_end,
    v_overage,
    p_provider_response_id,
    jsonb_build_object(
      'truncated', coalesce(p_truncated, false),
      'late_after_expiration', v_event_kind = 'late_finalization',
      'cost_uncertain', p_cost_uncertain,
      'accounting_basis', case
        when p_cost_uncertain then 'conservative_reservation'
        else 'provider_usage'
      end
    ),
    p_release_version,
    v_now
  )
  returning id into v_event_id;

  select snapshot.*
  into v_snapshot
  from public.beacon_allowance_usage_snapshot(
    v_reservation.allowance_id,
    v_now
  ) snapshot;

  update public.ai_usage_period_totals total
  set
    reserved_value = v_snapshot.reserved_value,
    consumed_value = v_snapshot.consumed_value,
    finalization_count = total.finalization_count + 1
  from public.company_ai_feature_allowances reservation_version,
    public.company_ai_feature_allowances total_version
  where reservation_version.id = v_reservation.allowance_id
    and total_version.id = total.allowance_id
    and total_version.policy_lineage_id = reservation_version.policy_lineage_id
    and total.period_start = v_snapshot.period_start
    and total.period_end = v_snapshot.period_end;

  if v_cost_anomaly then
    if v_accounted_cost_micros > coalesce(v_reservation.reserved_cost_micros, 0) then
      update public.ai_feature_global_controls control
      set
        status = 'paused',
        status_reason = 'Actual Beacon cost exceeded the pinned reservation ceiling',
        config_version = control.config_version + 1,
        paused_at = v_now,
        server_metadata = control.server_metadata || jsonb_build_object(
          'cost_safety_pause', jsonb_build_object(
            'request_id', p_request_id,
            'detected_at', v_now,
            'reserved_cost_micros', v_reservation.reserved_cost_micros,
            'actual_cost_micros', v_accounted_cost_micros,
            'price_card_version', v_reservation.price_card_version
          )
        )
      where control.feature_key = v_reservation.feature_key;
    end if;

    update public.company_ai_feature_entitlements entitlement
    set
      status = 'paused',
      paused_at = v_now,
      config_version = entitlement.config_version + 1,
      server_metadata = entitlement.server_metadata || jsonb_build_object(
        'cost_safety_pause', jsonb_build_object(
          'request_id', p_request_id,
          'detected_at', v_now,
          'reason', case
            when v_event_kind = 'late_finalization' then 'late_cost_after_expiration'
            else 'actual_cost_exceeded_reservation'
          end,
          'reserved_cost_micros', v_reservation.reserved_cost_micros,
          'actual_cost_micros', v_accounted_cost_micros,
          'price_card_version', v_reservation.price_card_version
        )
      )
    where entitlement.company_id = v_reservation.company_id
      and entitlement.feature_key = v_reservation.feature_key;

    insert into public.app_audit_events (
      company_id,
      actor_auth_user_id,
      actor_member_id,
      event_type,
      source,
      entity_table,
      entity_id,
      title,
      summary,
      after_data,
      metadata
    )
    values (
      v_reservation.company_id,
      v_reservation.actor_auth_user_id,
      v_reservation.actor_member_id,
      'ai_cost_safety_pause',
      'beacon_finalize_usage',
      'company_ai_feature_entitlements',
      v_reservation.company_id,
      'AI feature paused by cost safety control',
      case
        when v_event_kind = 'late_finalization' then 'Late billed usage followed reservation expiration'
        else 'Actual estimated cost exceeded the reserved maximum'
      end,
      jsonb_build_object(
        'feature_key', v_reservation.feature_key,
        'reserved_cost_micros', v_reservation.reserved_cost_micros,
        'actual_cost_micros', v_accounted_cost_micros,
        'global_paused', v_accounted_cost_micros
          > coalesce(v_reservation.reserved_cost_micros, 0)
      ),
      jsonb_build_object(
        'request_id', p_request_id,
        'price_card_version', v_reservation.price_card_version
      )
    );
  end if;

  return query select not v_cost_anomaly, v_event_id;
exception
  when no_data_found then
    raise exception using
      errcode = '22023',
      message = 'Usage reservation was not found';
end;
$$;

create or replace function public.beacon_expire_usage_reservations(
  p_company_id uuid,
  p_feature_key text,
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.ai_usage_events%rowtype;
  v_snapshot record;
  v_expired integer := 0;
  v_now timestamptz := clock_timestamp();
begin
  if p_company_id is null
    or p_feature_key <> 'beacon'
    or p_limit not between 1 and 500 then
    raise exception using
      errcode = '22023',
      message = 'Expiration sweep arguments are invalid';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_company_id::text || ':' || p_feature_key, 0)
  );

  for v_reservation in
    select reservation.*
    from public.ai_usage_events reservation
    where reservation.company_id = p_company_id
      and reservation.feature_key = p_feature_key
      and reservation.event_kind = 'reservation'
      and reservation.reservation_expires_at <= v_now
      and not exists (
        select 1
        from public.ai_usage_events terminal
        where terminal.request_id = reservation.request_id
          and terminal.event_kind in ('finalization', 'expiration')
      )
    order by reservation.reservation_expires_at, reservation.id
    limit p_limit
  loop
    insert into public.ai_usage_events (
      request_id,
      event_kind,
      reservation_event_id,
      company_id,
      feature_key,
      actor_auth_user_id,
      actor_member_id,
      actor_role,
      decision,
      outcome,
      entitlement_status,
      estimated_cost_micros,
      actual_cost_micros,
      reserved_cost_micros,
      price_card_version,
      allowance_id,
      meter_type,
      reserved_meter_value,
      actual_meter_value,
      allowance_limit_snapshot,
      allowance_period_start,
      allowance_period_end,
      limiter_metadata,
      release_version,
      finalized_at
    )
    values (
      v_reservation.request_id,
      'expiration',
      v_reservation.id,
      v_reservation.company_id,
      v_reservation.feature_key,
      v_reservation.actor_auth_user_id,
      v_reservation.actor_member_id,
      v_reservation.actor_role,
      'allowed',
      'expired',
      v_reservation.entitlement_status,
      v_reservation.reserved_cost_micros,
      v_reservation.reserved_cost_micros,
      v_reservation.reserved_cost_micros,
      v_reservation.price_card_version,
      v_reservation.allowance_id,
      v_reservation.meter_type,
      v_reservation.reserved_meter_value,
      v_reservation.reserved_meter_value,
      v_reservation.allowance_limit_snapshot,
      v_reservation.allowance_period_start,
      v_reservation.allowance_period_end,
      jsonb_build_object(
        'reason', 'reservation_ttl_elapsed',
        'accounting_basis', 'conservative_reservation'
      ),
      v_reservation.release_version,
      v_now
    )
    on conflict (request_id)
      where event_kind in ('finalization', 'expiration')
      do nothing;

    if found then
      v_expired := v_expired + 1;
      select snapshot.*
      into v_snapshot
      from public.beacon_allowance_usage_snapshot(
        v_reservation.allowance_id,
        v_now
      ) snapshot;

      update public.ai_usage_period_totals total
      set
        reserved_value = v_snapshot.reserved_value,
        consumed_value = v_snapshot.consumed_value,
        expiration_count = total.expiration_count + 1
      from public.company_ai_feature_allowances reservation_version,
        public.company_ai_feature_allowances total_version
      where reservation_version.id = v_reservation.allowance_id
        and total_version.id = total.allowance_id
        and total_version.policy_lineage_id = reservation_version.policy_lineage_id
        and total.period_start = v_snapshot.period_start
        and total.period_end = v_snapshot.period_end;
    end if;
  end loop;

  return v_expired;
end;
$$;

create or replace function public.beacon_allowance_usage_snapshot(
  p_allowance_id uuid,
  p_at timestamptz default now()
)
returns table (
  period_start timestamptz,
  period_end timestamptz,
  consumed_value bigint,
  reserved_value bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with target_allowance as (
    select allowance.policy_lineage_id
    from public.company_ai_feature_allowances allowance
    where allowance.id = p_allowance_id
  ),
  period as (
    select bounds.period_start, bounds.period_end
    from public.beacon_allowance_period(p_allowance_id, p_at) bounds
  )
  select
    period.period_start,
    period.period_end,
    coalesce((
      select sum(event.actual_meter_value)
      from public.ai_usage_events event
      join public.company_ai_feature_allowances version
        on version.id = event.allowance_id
      cross join target_allowance target
      where version.policy_lineage_id = target.policy_lineage_id
        and event.event_kind in ('finalization', 'late_finalization', 'expiration')
        and event.allowance_period_start = period.period_start
        and event.allowance_period_end = period.period_end
    ), 0)::bigint as consumed_value,
    coalesce((
      select sum(reservation.reserved_meter_value)
      from public.ai_usage_events reservation
      join public.company_ai_feature_allowances version
        on version.id = reservation.allowance_id
      cross join target_allowance target
      where version.policy_lineage_id = target.policy_lineage_id
        and reservation.event_kind = 'reservation'
        and reservation.allowance_period_start = period.period_start
        and reservation.allowance_period_end = period.period_end
        and not exists (
          select 1
          from public.ai_usage_events terminal
          where terminal.request_id = reservation.request_id
            and terminal.event_kind in ('finalization', 'expiration')
        )
    ), 0)::bigint as reserved_value
  from period;
$$;

create or replace function public.beacon_resolve_access_context(
  p_actor_auth_user_id uuid,
  p_actor_email text,
  p_company_selector text
)
returns table (
  company_id uuid,
  company_legacy_id text,
  role text,
  member_id uuid,
  membership_active boolean,
  csm_assignment_ledger_ready boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select
      auth_user.id,
      lower(coalesce(auth_user.email, '')) as verified_email
    from auth.users auth_user
    where auth_user.id = p_actor_auth_user_id
      and lower(coalesce(auth_user.email, '')) = lower(coalesce(p_actor_email, ''))
  ),
  company_candidates as (
    select
      company.id,
      company.legacy_glide_row_id,
      count(*) over () as match_count
    from public.companies company
    where company.status = 'active'
      and company.archived_at is null
      and company.migration_status in ('pilot', 'migrated')
      and (
        company.id::text = p_company_selector
        or company.public_company_id = p_company_selector
        or company.legacy_glide_row_id = p_company_selector
      )
  ),
  target_company as (
    select candidate.id, candidate.legacy_glide_row_id
    from company_candidates candidate
    where candidate.match_count = 1
  ),
  super_admin as (
    select true as allowed
    from actor
    join public.retainos_super_admins admin
      on admin.auth_user_id = actor.id
     and admin.status = 'active'
  ),
  membership_matches as (
    select
      member.id,
      case when member.is_read_only then 'viewer' else member.role end as role,
      count(*) over () as match_count
    from actor
    cross join target_company company
    join public.company_members member
      on member.company_id = company.id
    where member.status = 'active'
      and member.archived_at is null
      and (
        member.auth_user_id = actor.id
        or (
          member.auth_user_id is null
          and actor.verified_email <> ''
          and lower(member.email) = actor.verified_email
        )
      )
  ),
  resolved_membership as (
    select membership.id, membership.role
    from membership_matches membership
    where membership.match_count = 1
  )
  select
    company.id as company_id,
    company.legacy_glide_row_id as company_legacy_id,
    'super_admin'::text as role,
    null::uuid as member_id,
    true as membership_active,
    coalesce(readiness.ledger_ready, false) as csm_assignment_ledger_ready
  from target_company company
  cross join super_admin
  left join public.beacon_assignment_ledger_readiness(company.id) readiness
    on readiness.company_id = company.id

  union all

  select
    company.id,
    company.legacy_glide_row_id,
    membership.role,
    membership.id,
    true,
    coalesce(readiness.ledger_ready, false)
  from target_company company
  cross join resolved_membership membership
  left join public.beacon_assignment_ledger_readiness(company.id) readiness
    on readiness.company_id = company.id
  where not exists (select 1 from super_admin);
$$;

create or replace function public.beacon_feature_gate_status(
  p_company_id uuid,
  p_feature_key text
)
returns table (
  global_status text,
  feature_status text,
  allowance_status text,
  limits jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with controls as (
    select
      control.status,
      control.actor_concurrency_limit,
      control.actor_requests_per_minute,
      control.actor_requests_per_day,
      control.company_requests_per_minute,
      control.default_company_requests_per_day,
      control.max_reserve_cost_micros_per_request
    from public.ai_feature_global_controls control
    where control.feature_key = p_feature_key
  ),
  entitlement as (
    select entitlement.status, entitlement.company_requests_per_day
    from public.company_ai_feature_entitlements entitlement
    where entitlement.company_id = p_company_id
      and entitlement.feature_key = p_feature_key
      and (entitlement.effective_from is null or entitlement.effective_from <= now())
      and (entitlement.effective_until is null or entitlement.effective_until > now())
  ),
  active_allowance as (
    select allowance.id, allowance.limit_value
    from public.company_ai_feature_allowances allowance
    where allowance.company_id = p_company_id
      and allowance.feature_key = p_feature_key
      and allowance.meter_type = 'usd_cents'
      and allowance.status = 'active'
      and allowance.hard_stop
      and allowance.effective_from <= now()
      and (allowance.effective_until is null or allowance.effective_until > now())
  ),
  paused_allowance as (
    select true as present
    from public.company_ai_feature_allowances allowance
    where allowance.company_id = p_company_id
      and allowance.feature_key = p_feature_key
      and allowance.meter_type = 'usd_cents'
      and allowance.status = 'paused'
    limit 1
  ),
  allowance_snapshot as (
    select
      allowance.id,
      allowance.limit_value,
      snapshot.period_start,
      snapshot.period_end,
      snapshot.consumed_value,
      snapshot.reserved_value
    from active_allowance allowance
    cross join lateral public.beacon_allowance_usage_snapshot(
      allowance.id,
      now()
    ) snapshot
  )
  select
    coalesce(control.status, 'disabled') as global_status,
    coalesce(entitlement.status, 'disabled') as feature_status,
    case
      when snapshot.id is not null
        and snapshot.consumed_value + snapshot.reserved_value >= snapshot.limit_value
        then 'exhausted'
      when snapshot.id is not null then 'active'
      when exists (select 1 from paused_allowance) then 'paused'
      else 'missing'
    end as allowance_status,
    jsonb_strip_nulls(jsonb_build_object(
      'actorConcurrency', control.actor_concurrency_limit,
      'actorRequestsPerMinute', control.actor_requests_per_minute,
      'actorRequestsPerDay', control.actor_requests_per_day,
      'companyRequestsPerMinute', control.company_requests_per_minute,
      'companyRequestsPerDay', coalesce(
        entitlement.company_requests_per_day,
        control.default_company_requests_per_day
      ),
      'maxReservedCostMicros', control.max_reserve_cost_micros_per_request,
      'remainingBudgetCents', case
        when snapshot.id is null then null
        else greatest(
          snapshot.limit_value - snapshot.consumed_value - snapshot.reserved_value,
          0
        )
      end,
      'periodStartedAt', snapshot.period_start,
      'periodEndsAt', snapshot.period_end
    )) as limits
  from (select 1) singleton
  left join controls control on true
  left join entitlement on true
  left join allowance_snapshot snapshot on true;
$$;

create or replace function public.beacon_admin_list_ai_features(
  p_company_id uuid,
  p_actor_auth_user_id uuid
)
returns table (
  feature_key text,
  status text,
  allowances jsonb,
  enabled_at timestamptz,
  paused_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.retainos_super_admins admin
    where admin.auth_user_id = p_actor_auth_user_id
      and admin.auth_user_id is not null
      and admin.status = 'active'
  ) then
    raise exception using
      errcode = '42501',
      message = 'A bound active RetainOS SuperAdmin is required';
  end if;

  if not exists (
    select 1
    from public.companies company
    where company.id = p_company_id
      and company.archived_at is null
      and company.status <> 'archived'
      and company.migration_status in ('pilot', 'migrated')
  ) then
    raise exception using
      errcode = '42501',
      message = 'Company is not an app-owned AI-feature target';
  end if;

  return query
  with feature_catalog(feature_key, ordinal) as (
    values
      ('beacon'::text, 1),
      ('call_analysis'::text, 2),
      ('sentiment_analysis'::text, 3),
      ('automated_summaries'::text, 4),
      ('slack_data'::text, 5)
  )
  select
    feature.feature_key,
    coalesce(entitlement.status, 'disabled') as status,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', allowance.id,
          'meter_type', allowance.meter_type,
          'period_type', allowance.period_type,
          'limit_value', allowance.limit_value,
          'used_value', snapshot.consumed_value + snapshot.reserved_value,
          'warning_thresholds', to_jsonb(allowance.warning_thresholds),
          'period_started_at', snapshot.period_start,
          'period_ends_at', snapshot.period_end
        )
        order by allowance.meter_type
      )
      from public.company_ai_feature_allowances allowance
      cross join lateral public.beacon_allowance_usage_snapshot(
        allowance.id,
        now()
      ) snapshot
      where allowance.company_id = p_company_id
        and allowance.feature_key = feature.feature_key
        and allowance.status = 'active'
    ), '[]'::jsonb) as allowances,
    entitlement.enabled_at,
    entitlement.paused_at,
    entitlement.updated_at
  from feature_catalog feature
  left join public.company_ai_feature_entitlements entitlement
    on entitlement.company_id = p_company_id
   and entitlement.feature_key = feature.feature_key
  order by feature.ordinal;
end;
$$;

create or replace function public.beacon_admin_update_ai_feature(
  p_company_id uuid,
  p_actor_auth_user_id uuid,
  p_feature_key text,
  p_status text,
  p_allowances jsonb
)
returns table (
  feature_key text,
  status text,
  allowances jsonb,
  enabled_at timestamptz,
  paused_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_meter_type text;
  v_period_type text;
  v_limit_value bigint;
  v_thresholds smallint[];
  v_allowance_count integer;
  v_policy_version integer;
  v_policy_lineage_id uuid;
  v_lineage_started_at timestamptz;
  v_previous_period_type text;
  v_before jsonb;
  v_after jsonb;
  v_now timestamptz := statement_timestamp();
begin
  if not exists (
    select 1
    from public.retainos_super_admins admin
    where admin.auth_user_id = p_actor_auth_user_id
      and admin.auth_user_id is not null
      and admin.status = 'active'
  ) then
    raise exception using
      errcode = '42501',
      message = 'A bound active RetainOS SuperAdmin is required';
  end if;

  if not exists (
    select 1
    from public.companies company
    where company.id = p_company_id
      and company.archived_at is null
      and company.status <> 'archived'
      and company.migration_status in ('pilot', 'migrated')
  ) then
    raise exception using
      errcode = '42501',
      message = 'Company is not an app-owned AI-feature target';
  end if;

  -- Phase 1 exposes the broader AI feature catalog for roadmap visibility,
  -- but only Beacon has an executable, reviewed policy contract. Keep future
  -- features fail closed until their own migration deliberately releases them.
  if p_feature_key <> 'beacon' then
    raise exception using
      errcode = '22023',
      message = 'Only Beacon may be configured in Phase 1';
  end if;

  if p_feature_key not in (
    'beacon',
    'call_analysis',
    'sentiment_analysis',
    'automated_summaries',
    'slack_data'
  ) or p_status not in ('disabled', 'pilot', 'enabled', 'paused') then
    raise exception using
      errcode = '22023',
      message = 'Unsupported AI feature or status';
  end if;

  if p_allowances is null or jsonb_typeof(p_allowances) <> 'array'
    or jsonb_array_length(p_allowances) > 4 then
    raise exception using
      errcode = '22023',
      message = 'Allowances must be a bounded array';
  end if;

  v_allowance_count := jsonb_array_length(p_allowances);
  if p_status in ('pilot', 'enabled') and v_allowance_count = 0 then
    raise exception using
      errcode = '22023',
      message = 'An allowance is required before enabling a paid AI feature';
  end if;

  if p_feature_key = 'beacon' and (
    v_allowance_count > 1
    or (p_status in ('pilot', 'enabled') and v_allowance_count <> 1)
  ) then
    raise exception using
      errcode = '22023',
      message = 'Beacon requires exactly one usd_cents allowance while enabled';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_company_id::text || ':' || p_feature_key, 0)
  );

  select jsonb_build_object(
    'status', coalesce(entitlement.status, 'disabled'),
    'allowances', coalesce((
      select jsonb_agg(jsonb_build_object(
        'meter_type', allowance.meter_type,
        'period_type', allowance.period_type,
        'limit_value', allowance.limit_value,
        'warning_thresholds', to_jsonb(allowance.warning_thresholds),
        'policy_version', allowance.policy_version
      ) order by allowance.meter_type)
      from public.company_ai_feature_allowances allowance
      where allowance.company_id = p_company_id
        and allowance.feature_key = p_feature_key
        and allowance.status = 'active'
    ), '[]'::jsonb)
  )
  into v_before
  from (select 1) singleton
  left join public.company_ai_feature_entitlements entitlement
    on entitlement.company_id = p_company_id
   and entitlement.feature_key = p_feature_key;

  -- Validate the complete policy before superseding anything.
  for v_item in
    select item.value
    from jsonb_array_elements(p_allowances) item(value)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or not (v_item ?& array[
        'meter_type',
        'limit_value',
        'period_type',
        'warning_thresholds'
      ])
      or (v_item - array[
        'meter_type',
        'limit_value',
        'period_type',
        'warning_thresholds'
      ]) <> '{}'::jsonb then
      raise exception using
        errcode = '22023',
        message = 'Allowance policy fields are invalid';
    end if;

    v_meter_type := v_item ->> 'meter_type';
    v_period_type := v_item ->> 'period_type';

    if v_meter_type not in (
      'usd_cents',
      'analysis_count',
      'token_count',
      'request_count'
    ) or v_period_type not in ('one_time', 'monthly') then
      raise exception using
        errcode = '22023',
        message = 'Allowance meter or period is invalid';
    end if;

    if p_feature_key = 'beacon' and v_meter_type <> 'usd_cents' then
      raise exception using
        errcode = '22023',
        message = 'Beacon currently supports only a usd_cents allowance';
    end if;

    select
      allowance.policy_lineage_id,
      allowance.lineage_started_at,
      allowance.period_type
    into
      v_policy_lineage_id,
      v_lineage_started_at,
      v_previous_period_type
    from public.company_ai_feature_allowances allowance
    where allowance.company_id = p_company_id
      and allowance.feature_key = p_feature_key
      and allowance.meter_type = v_meter_type
    order by allowance.policy_version desc, allowance.created_at desc
    limit 1;

    if found
      and v_previous_period_type <> v_period_type
      and exists (
        select 1
        from public.ai_usage_events event
        join public.company_ai_feature_allowances version
          on version.id = event.allowance_id
        where version.policy_lineage_id = v_policy_lineage_id
        limit 1
      ) then
      raise exception using
        errcode = '22023',
        message = 'Allowance period type cannot change after usage has started';
    end if;

    if jsonb_typeof(v_item -> 'limit_value') <> 'number'
      or (v_item ->> 'limit_value') !~ '^[0-9]+$' then
      raise exception using
        errcode = '22023',
        message = 'Allowance limit must be a positive integer';
    end if;
    v_limit_value := (v_item ->> 'limit_value')::bigint;
    if v_limit_value < 1 or v_limit_value > 1000000000 then
      raise exception using
        errcode = '22023',
        message = 'Allowance limit is outside the supported range';
    end if;

    if jsonb_typeof(v_item -> 'warning_thresholds') <> 'array'
      or jsonb_array_length(v_item -> 'warning_thresholds') not between 1 and 4
      or exists (
        select 1
        from jsonb_array_elements_text(v_item -> 'warning_thresholds') threshold(value)
        where threshold.value !~ '^[0-9]+$'
      ) then
      raise exception using
        errcode = '22023',
        message = 'Allowance warning thresholds are invalid';
    end if;

    select array_agg(threshold.value::smallint order by threshold.ordinality)
    into v_thresholds
    from jsonb_array_elements_text(v_item -> 'warning_thresholds')
      with ordinality threshold(value, ordinality);

    if v_thresholds[1] not between 1 and 99
      or (v_thresholds[2] is not null and (
        v_thresholds[2] not between 1 and 99 or v_thresholds[2] <= v_thresholds[1]
      ))
      or (v_thresholds[3] is not null and (
        v_thresholds[3] not between 1 and 99 or v_thresholds[3] <= v_thresholds[2]
      ))
      or (v_thresholds[4] is not null and (
        v_thresholds[4] not between 1 and 99 or v_thresholds[4] <= v_thresholds[3]
      )) then
      raise exception using
        errcode = '22023',
        message = 'Allowance warning thresholds must be increasing values below 100';
    end if;
  end loop;

  if (
    select count(distinct item.value ->> 'meter_type')
    from jsonb_array_elements(p_allowances) item(value)
  ) <> v_allowance_count then
    raise exception using
      errcode = '22023',
      message = 'Duplicate allowance meters are not allowed';
  end if;

  insert into public.company_ai_feature_entitlements (
    company_id,
    feature_key,
    status,
    effective_from,
    enabled_by_auth_user_id,
    enabled_at,
    paused_at,
    config_version
  )
  values (
    p_company_id,
    p_feature_key,
    p_status,
    case when p_status in ('pilot', 'enabled') then v_now else null end,
    p_actor_auth_user_id,
    case when p_status in ('pilot', 'enabled') then v_now else null end,
    case when p_status in ('paused', 'disabled') then v_now else null end,
    1
  )
  on conflict (company_id, feature_key) do update
  set
    status = excluded.status,
    effective_from = case
      when excluded.status in ('pilot', 'enabled')
        then coalesce(
          public.company_ai_feature_entitlements.effective_from,
          excluded.effective_from
        )
      else public.company_ai_feature_entitlements.effective_from
    end,
    enabled_by_auth_user_id = excluded.enabled_by_auth_user_id,
    enabled_at = case
      when excluded.status in ('pilot', 'enabled')
        then coalesce(
          public.company_ai_feature_entitlements.enabled_at,
          excluded.enabled_at
        )
      else public.company_ai_feature_entitlements.enabled_at
    end,
    paused_at = excluded.paused_at,
    config_version = public.company_ai_feature_entitlements.config_version + 1;

  update public.company_ai_feature_allowances allowance
  set
    status = 'superseded',
    effective_until = v_now,
    changed_by_auth_user_id = p_actor_auth_user_id,
    override_reason = 'Replaced through Beacon AI Features management RPC'
  where allowance.company_id = p_company_id
    and allowance.feature_key = p_feature_key
    and allowance.status = 'active';

  for v_item in
    select item.value
    from jsonb_array_elements(p_allowances) item(value)
  loop
    v_meter_type := v_item ->> 'meter_type';
    v_period_type := v_item ->> 'period_type';
    v_limit_value := (v_item ->> 'limit_value')::bigint;
    select array_agg(threshold.value::smallint order by threshold.ordinality)
    into v_thresholds
    from jsonb_array_elements_text(v_item -> 'warning_thresholds')
      with ordinality threshold(value, ordinality);

    select coalesce(max(allowance.policy_version), 0) + 1
    into v_policy_version
    from public.company_ai_feature_allowances allowance
    where allowance.company_id = p_company_id
      and allowance.feature_key = p_feature_key
      and allowance.meter_type = v_meter_type;

    select
      allowance.policy_lineage_id,
      allowance.lineage_started_at
    into
      v_policy_lineage_id,
      v_lineage_started_at
    from public.company_ai_feature_allowances allowance
    where allowance.company_id = p_company_id
      and allowance.feature_key = p_feature_key
      and allowance.meter_type = v_meter_type
    order by allowance.policy_version desc, allowance.created_at desc
    limit 1;

    if not found then
      v_policy_lineage_id := gen_random_uuid();
      v_lineage_started_at := v_now;
    end if;

    insert into public.company_ai_feature_allowances (
      policy_lineage_id,
      lineage_started_at,
      company_id,
      feature_key,
      meter_type,
      period_type,
      period_timezone,
      reset_day,
      limit_value,
      status,
      effective_from,
      warning_thresholds,
      hard_stop,
      policy_version,
      changed_by_auth_user_id,
      override_reason
    )
    values (
      v_policy_lineage_id,
      v_lineage_started_at,
      p_company_id,
      p_feature_key,
      v_meter_type,
      v_period_type,
      'UTC',
      1,
      v_limit_value,
      'active',
      v_now,
      v_thresholds,
      true,
      v_policy_version,
      p_actor_auth_user_id,
      'Configured through Beacon AI Features management RPC'
    );
  end loop;

  select jsonb_build_object(
    'status', p_status,
    'allowances', coalesce((
      select jsonb_agg(jsonb_build_object(
        'meter_type', allowance.meter_type,
        'period_type', allowance.period_type,
        'limit_value', allowance.limit_value,
        'warning_thresholds', to_jsonb(allowance.warning_thresholds),
        'policy_version', allowance.policy_version
      ) order by allowance.meter_type)
      from public.company_ai_feature_allowances allowance
      where allowance.company_id = p_company_id
        and allowance.feature_key = p_feature_key
        and allowance.status = 'active'
    ), '[]'::jsonb)
  )
  into v_after;

  insert into public.app_audit_events (
    company_id,
    actor_auth_user_id,
    event_type,
    source,
    entity_table,
    entity_id,
    title,
    summary,
    before_data,
    after_data,
    metadata
  )
  values (
    p_company_id,
    p_actor_auth_user_id,
    'ai_feature_policy_updated',
    'beacon_admin_update_ai_feature',
    'company_ai_feature_entitlements',
    p_company_id,
    'AI feature policy updated',
    p_feature_key || ' changed to ' || p_status,
    v_before,
    v_after,
    jsonb_build_object('feature_key', p_feature_key)
  );

  return query
  select card.feature_key,
    card.status,
    card.allowances,
    card.enabled_at,
    card.paused_at,
    card.updated_at
  from public.beacon_admin_list_ai_features(
    p_company_id,
    p_actor_auth_user_id
  ) card
  where card.feature_key = p_feature_key;
end;
$$;

revoke all on function public.beacon_allowance_period(uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.beacon_allowance_usage_snapshot(uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.beacon_record_usage_denial(
  uuid, uuid, text, uuid, uuid, text, text, text, text, integer,
  text, integer, uuid, text, bigint, timestamptz, timestamptz
)
  from public, anon, authenticated, service_role;

revoke all on function public.beacon_resolve_access_context(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.beacon_feature_gate_status(uuid, text)
  from public, anon, authenticated;
revoke all on function public.beacon_reserve_usage(
  uuid, text, uuid, uuid, uuid, text, bigint, integer, text
)
  from public, anon, authenticated;
revoke all on function public.beacon_finalize_usage(
  uuid, uuid, text, text, integer, integer, integer, integer, bigint,
  text[], integer, integer, integer, text, boolean, boolean, text
)
  from public, anon, authenticated;
revoke all on function public.beacon_expire_usage_reservations(uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.beacon_admin_list_ai_features(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.beacon_admin_update_ai_feature(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.beacon_resolve_access_context(uuid, text, text)
  to service_role;
grant execute on function public.beacon_feature_gate_status(uuid, text)
  to service_role;
grant execute on function public.beacon_reserve_usage(
  uuid, text, uuid, uuid, uuid, text, bigint, integer, text
)
  to service_role;
grant execute on function public.beacon_finalize_usage(
  uuid, uuid, text, text, integer, integer, integer, integer, bigint,
  text[], integer, integer, integer, text, boolean, boolean, text
)
  to service_role;
grant execute on function public.beacon_expire_usage_reservations(uuid, text, integer)
  to service_role;
grant execute on function public.beacon_admin_list_ai_features(uuid, uuid)
  to service_role;
grant execute on function public.beacon_admin_update_ai_feature(uuid, uuid, text, text, jsonb)
  to service_role;

insert into public.security_rollout_history (
  version,
  migration_name,
  details
)
values (
  '20260714012000',
  'beacon_service_rpcs',
  jsonb_build_object(
    'scope', 'server_only_access_entitlement_quota_and_management',
    'browser_execute', false,
    'quota_meter', 'usd_cents',
    'prompt_or_response_logging', false
  )
)
on conflict (version) do nothing;

notify pgrst, 'reload schema';
