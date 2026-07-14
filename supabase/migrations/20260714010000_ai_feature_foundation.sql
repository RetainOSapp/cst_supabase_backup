-- Secure AI feature foundation.
--
-- This migration intentionally contains no provider credential, prompt text,
-- response text, tool payload, or browser-readable usage policy. AI provider
-- credentials remain Supabase secrets and all operational writes are reserved
-- for service-role server code.

create table if not exists public.company_ai_feature_entitlements (
  company_id uuid not null references public.companies(id) on delete cascade,
  feature_key text not null
    check (feature_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  status text not null default 'disabled'
    check (status in ('disabled', 'pilot', 'enabled', 'paused')),
  effective_from timestamptz,
  effective_until timestamptz,
  enabled_by_auth_user_id uuid references auth.users(id) on delete set null,
  enabled_at timestamptz,
  paused_at timestamptz,
  company_requests_per_day integer
    check (company_requests_per_day is null or company_requests_per_day > 0),
  config_version integer not null default 1
    check (config_version > 0),
  server_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, feature_key),
  check (effective_until is null or effective_from is null or effective_until > effective_from)
);

comment on table public.company_ai_feature_entitlements is
  'Company paid-feature entitlement gate. Absence or status disabled/paused denies use. Service-role writes only.';
comment on column public.company_ai_feature_entitlements.server_metadata is
  'Server-only operational metadata. Never return this column to a browser or model.';

create table if not exists public.company_ai_feature_allowances (
  id uuid primary key default gen_random_uuid(),
  policy_lineage_id uuid not null default gen_random_uuid(),
  lineage_started_at timestamptz not null default now(),
  company_id uuid not null,
  feature_key text not null,
  meter_type text not null
    check (meter_type in (
      'usd_cents',
      'analysis_count',
      'token_count',
      'request_count'
    )),
  period_type text not null
    check (period_type in ('one_time', 'monthly')),
  period_timezone text not null default 'UTC',
  reset_day smallint not null default 1
    check (reset_day between 1 and 28),
  limit_value bigint not null
    check (limit_value >= 0),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'superseded')),
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  warning_thresholds smallint[] not null default array[80]::smallint[]
    check (
      cardinality(warning_thresholds) between 1 and 4
      and warning_thresholds[1] between 1 and 99
      and (warning_thresholds[2] is null or warning_thresholds[2] between 1 and 99)
      and (warning_thresholds[3] is null or warning_thresholds[3] between 1 and 99)
      and (warning_thresholds[4] is null or warning_thresholds[4] between 1 and 99)
      and (warning_thresholds[2] is null or warning_thresholds[2] > warning_thresholds[1])
      and (warning_thresholds[3] is null or warning_thresholds[3] > warning_thresholds[2])
      and (warning_thresholds[4] is null or warning_thresholds[4] > warning_thresholds[3])
    ),
  hard_stop boolean not null default true,
  policy_version integer not null default 1
    check (policy_version > 0),
  override_reason text,
  changed_by_auth_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, feature_key)
    references public.company_ai_feature_entitlements(company_id, feature_key)
    on delete cascade,
  unique (company_id, feature_key, meter_type, policy_version),
  check (effective_until is null or effective_until > effective_from),
  check (period_type = 'monthly' or reset_day = 1),
  check (status <> 'active' or hard_stop)
);

comment on table public.company_ai_feature_allowances is
  'Versioned company allowance policy. Contains limits only; all usage is computed from server-owned events and totals.';

create unique index if not exists company_ai_allowances_one_active_meter_idx
  on public.company_ai_feature_allowances (company_id, feature_key, meter_type)
  where status = 'active';

create unique index if not exists company_ai_allowances_one_active_currency_idx
  on public.company_ai_feature_allowances (company_id, feature_key)
  where status = 'active'
    and meter_type = 'usd_cents';

create index if not exists company_ai_allowances_effective_idx
  on public.company_ai_feature_allowances (
    company_id,
    feature_key,
    status,
    effective_from,
    effective_until
  );

create index if not exists company_ai_allowances_lineage_idx
  on public.company_ai_feature_allowances (
    company_id,
    feature_key,
    meter_type,
    policy_lineage_id,
    policy_version
  );

create table if not exists public.ai_feature_global_controls (
  feature_key text primary key
    check (feature_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  status text not null default 'paused'
    check (status in ('paused', 'active', 'disabled')),
  status_reason text,
  config_version integer not null default 1
    check (config_version > 0),
  actor_concurrency_limit integer not null default 2
    check (actor_concurrency_limit between 1 and 20),
  actor_requests_per_minute integer not null default 5
    check (actor_requests_per_minute between 1 and 120),
  actor_requests_per_day integer not null default 50
    check (actor_requests_per_day between 1 and 10000),
  company_requests_per_minute integer not null default 20
    check (company_requests_per_minute between 1 and 1000),
  default_company_requests_per_day integer not null default 250
    check (default_company_requests_per_day between 1 and 100000),
  reservation_ttl_seconds integer not null default 180
    check (reservation_ttl_seconds between 60 and 900),
  max_reserve_cost_micros_per_request bigint not null default 500000
    check (max_reserve_cost_micros_per_request > 0),
  changed_by_auth_user_id uuid references auth.users(id) on delete set null,
  activated_at timestamptz,
  paused_at timestamptz not null default now(),
  server_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ai_feature_global_controls is
  'RetainOS global kill switch and technical limiter policy. Every feature defaults paused.';

insert into public.ai_feature_global_controls (
  feature_key,
  status,
  status_reason
)
values
  ('beacon', 'paused', 'Secure beta is disabled until reviewed rollout'),
  ('call_analysis', 'paused', 'Not released'),
  ('sentiment_analysis', 'paused', 'Not released'),
  ('automated_summaries', 'paused', 'Not released'),
  ('slack_data', 'paused', 'Not released')
on conflict (feature_key) do nothing;

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  event_kind text not null
    check (event_kind in (
      'reservation',
      'finalization',
      'late_finalization',
      'denial',
      'expiration'
    )),
  reservation_event_id uuid references public.ai_usage_events(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  feature_key text not null,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  actor_member_id uuid references public.company_members(id) on delete restrict,
  actor_role text not null
    check (actor_role in ('super_admin', 'director', 'support', 'csm', 'viewer')),
  decision text not null
    check (decision in ('allowed', 'denied', 'rate_limited', 'budget_blocked')),
  outcome text not null
    check (outcome in ('reserved', 'succeeded', 'failed', 'cancelled', 'denied', 'expired')),
  denial_code text,
  error_code text,
  entitlement_status text
    check (entitlement_status is null or entitlement_status in ('disabled', 'pilot', 'enabled', 'paused')),
  model text,
  tool_names text[] not null default '{}'::text[],
  tool_call_count integer not null default 0
    check (tool_call_count >= 0),
  tool_row_count integer not null default 0
    check (tool_row_count >= 0),
  input_tokens integer not null default 0
    check (input_tokens >= 0),
  cached_input_tokens integer not null default 0
    check (cached_input_tokens >= 0),
  output_tokens integer not null default 0
    check (output_tokens >= 0),
  reasoning_tokens integer not null default 0
    check (reasoning_tokens >= 0),
  total_tokens integer not null default 0
    check (total_tokens >= 0),
  provider_latency_ms integer
    check (provider_latency_ms is null or provider_latency_ms >= 0),
  total_latency_ms integer
    check (total_latency_ms is null or total_latency_ms >= 0),
  price_card_version text,
  estimated_cost_micros bigint
    check (estimated_cost_micros is null or estimated_cost_micros >= 0),
  actual_cost_micros bigint
    check (actual_cost_micros is null or actual_cost_micros >= 0),
  reserved_cost_micros bigint
    check (reserved_cost_micros is null or reserved_cost_micros >= 0),
  allowance_id uuid references public.company_ai_feature_allowances(id) on delete restrict,
  meter_type text
    check (meter_type is null or meter_type in (
      'usd_cents',
      'analysis_count',
      'token_count',
      'request_count'
    )),
  reserved_meter_value bigint
    check (reserved_meter_value is null or reserved_meter_value >= 0),
  actual_meter_value bigint
    check (actual_meter_value is null or actual_meter_value >= 0),
  allowance_limit_snapshot bigint
    check (allowance_limit_snapshot is null or allowance_limit_snapshot >= 0),
  allowance_period_start timestamptz,
  allowance_period_end timestamptz,
  overage_meter_value bigint not null default 0
    check (overage_meter_value >= 0),
  provider_request_id text,
  provider_status_class integer
    check (provider_status_class is null or provider_status_class between 1 and 5),
  limiter_metadata jsonb not null default '{}'::jsonb,
  request_fingerprint text,
  release_version text,
  reservation_expires_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (company_id, feature_key)
    references public.company_ai_feature_entitlements(company_id, feature_key)
    on delete restrict,
  check (
    (event_kind = 'reservation'
      and reservation_event_id is null
      and outcome = 'reserved'
      and decision = 'allowed'
      and reservation_expires_at is not null)
    or (event_kind = 'denial'
      and reservation_event_id is null
      and outcome = 'denied'
      and decision <> 'allowed')
    or (event_kind in ('finalization', 'late_finalization', 'expiration')
      and reservation_event_id is not null)
  ),
  check (cached_input_tokens <= input_tokens),
  check (reasoning_tokens <= output_tokens),
  check (total_tokens = input_tokens + output_tokens),
  check (jsonb_typeof(limiter_metadata) = 'object'),
  check (pg_column_size(limiter_metadata) <= 2048),
  check (cardinality(tool_names) <= 24),
  check (model is null or length(model) <= 128),
  check (denial_code is null or length(denial_code) <= 128),
  check (error_code is null or length(error_code) <= 128),
  check (price_card_version is null or length(price_card_version) <= 128),
  check (provider_request_id is null or length(provider_request_id) <= 256),
  check (request_fingerprint is null or length(request_fingerprint) <= 256),
  check (release_version is null or length(release_version) <= 128)
);

comment on table public.ai_usage_events is
  'Append-only metadata usage ledger. Prompt, response, raw tool result, and customer content are prohibited by schema.';
comment on column public.ai_usage_events.limiter_metadata is
  'Bounded non-content limiter facts only; never prompt, response, tool result, or arbitrary request payload.';

create unique index if not exists ai_usage_events_one_ingress_per_request_idx
  on public.ai_usage_events (request_id)
  where event_kind in ('reservation', 'denial');

create unique index if not exists ai_usage_events_one_terminal_per_request_idx
  on public.ai_usage_events (request_id)
  where event_kind in ('finalization', 'expiration');

create unique index if not exists ai_usage_events_one_late_finalization_per_request_idx
  on public.ai_usage_events (request_id)
  where event_kind = 'late_finalization';

create index if not exists ai_usage_events_company_feature_created_idx
  on public.ai_usage_events (company_id, feature_key, created_at desc);

create index if not exists ai_usage_events_actor_feature_created_idx
  on public.ai_usage_events (actor_auth_user_id, feature_key, created_at desc);

create index if not exists ai_usage_events_open_reservation_idx
  on public.ai_usage_events (company_id, feature_key, reservation_expires_at)
  where event_kind = 'reservation';

create index if not exists ai_usage_events_allowance_period_idx
  on public.ai_usage_events (
    allowance_id,
    allowance_period_start,
    allowance_period_end,
    event_kind
  )
  where allowance_id is not null;

create table if not exists public.ai_usage_period_totals (
  id uuid primary key default gen_random_uuid(),
  policy_lineage_id uuid not null,
  allowance_id uuid not null
    references public.company_ai_feature_allowances(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  feature_key text not null,
  meter_type text not null
    check (meter_type in (
      'usd_cents',
      'analysis_count',
      'token_count',
      'request_count'
    )),
  period_start timestamptz not null,
  period_end timestamptz not null,
  limit_value_snapshot bigint not null
    check (limit_value_snapshot >= 0),
  reserved_value bigint not null default 0
    check (reserved_value >= 0),
  consumed_value bigint not null default 0
    check (consumed_value >= 0),
  reservation_count bigint not null default 0
    check (reservation_count >= 0),
  finalization_count bigint not null default 0
    check (finalization_count >= 0),
  expiration_count bigint not null default 0
    check (expiration_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (policy_lineage_id, period_start, period_end),
  check (period_end > period_start)
);

comment on table public.ai_usage_period_totals is
  'Server-owned derived quota totals. Browser payloads never set or reset usage values.';

create index if not exists ai_usage_period_totals_company_feature_idx
  on public.ai_usage_period_totals (company_id, feature_key, period_start desc);

create or replace function public.ai_feature_reject_append_only_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = format('%I is append-only', tg_table_name);
end;
$$;

create or replace function public.ai_feature_guard_allowance_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.policy_lineage_id is distinct from old.policy_lineage_id
    or new.lineage_started_at is distinct from old.lineage_started_at
    or new.company_id is distinct from old.company_id
    or new.feature_key is distinct from old.feature_key
    or new.meter_type is distinct from old.meter_type
    or new.period_type is distinct from old.period_type
    or new.period_timezone is distinct from old.period_timezone
    or new.reset_day is distinct from old.reset_day
    or new.effective_from is distinct from old.effective_from
    or new.policy_version is distinct from old.policy_version
    or new.limit_value is distinct from old.limit_value
    or new.warning_thresholds is distinct from old.warning_thresholds
    or new.hard_stop is distinct from old.hard_stop then
    raise exception using
      errcode = '55000',
      message = 'Allowance identity and period fields are immutable; supersede and insert a new policy version';
  end if;

  if new.status is distinct from old.status
    and not (old.status = 'active' and new.status = 'superseded') then
    raise exception using
      errcode = '55000',
      message = 'Allowance status changes require a versioned replacement policy';
  end if;

  if new.effective_until is distinct from old.effective_until
    and new.status <> 'superseded' then
    raise exception using
      errcode = '55000',
      message = 'Only a superseded allowance may receive an effective end';
  end if;

  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.ai_feature_validate_usage_event_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowance public.company_ai_feature_allowances%rowtype;
  v_reservation public.ai_usage_events%rowtype;
begin
  if new.allowance_id is not null then
    select allowance.*
    into strict v_allowance
    from public.company_ai_feature_allowances allowance
    where allowance.id = new.allowance_id;

    if v_allowance.company_id <> new.company_id
      or v_allowance.feature_key <> new.feature_key
      or v_allowance.meter_type is distinct from new.meter_type then
      raise exception using
        errcode = '23514',
        message = 'Usage event allowance must match company, feature, and meter';
    end if;
  end if;

  if new.event_kind = 'reservation' then
    if new.allowance_id is null
      or new.meter_type is null
      or new.reserved_cost_micros is null
      or new.reserved_meter_value is null
      or new.allowance_limit_snapshot is null
      or new.price_card_version is null
      or new.allowance_period_start is null
      or new.allowance_period_end is null then
      raise exception using
        errcode = '23514',
        message = 'Reservation usage events require a complete allowance snapshot';
    end if;
  elsif new.event_kind in ('finalization', 'late_finalization', 'expiration') then
    select reservation.*
    into strict v_reservation
    from public.ai_usage_events reservation
    where reservation.id = new.reservation_event_id
      and reservation.event_kind = 'reservation';

    if v_reservation.request_id <> new.request_id
      or v_reservation.company_id <> new.company_id
      or v_reservation.feature_key <> new.feature_key
      or v_reservation.actor_auth_user_id <> new.actor_auth_user_id
      or v_reservation.actor_member_id is distinct from new.actor_member_id
      or v_reservation.actor_role <> new.actor_role
      or v_reservation.allowance_id is distinct from new.allowance_id
      or v_reservation.meter_type is distinct from new.meter_type
      or v_reservation.reserved_cost_micros is distinct from new.reserved_cost_micros
      or v_reservation.reserved_meter_value is distinct from new.reserved_meter_value
      or v_reservation.allowance_limit_snapshot is distinct from new.allowance_limit_snapshot
      or v_reservation.price_card_version is distinct from new.price_card_version
      or v_reservation.allowance_period_start is distinct from new.allowance_period_start
      or v_reservation.allowance_period_end is distinct from new.allowance_period_end
      or new.decision <> 'allowed'
      or (new.event_kind in ('finalization', 'late_finalization')
        and (
          new.outcome not in ('succeeded', 'failed', 'cancelled')
          or new.actual_cost_micros is null
          or new.actual_meter_value is null
        ))
      or (new.event_kind = 'expiration' and (
        new.outcome <> 'expired'
        or new.actual_cost_micros is distinct from new.reserved_cost_micros
        or new.actual_meter_value is distinct from new.reserved_meter_value
      )) then
      raise exception using
        errcode = '23514',
        message = 'Terminal usage event does not structurally match its reservation';
    end if;

    if new.event_kind = 'late_finalization'
      and not exists (
        select 1
        from public.ai_usage_events expiration
        where expiration.request_id = new.request_id
          and expiration.event_kind = 'expiration'
      ) then
      raise exception using
        errcode = '23514',
        message = 'Late finalization requires an existing expiration terminal';
    end if;
  end if;

  return new;
exception
  when no_data_found then
    raise exception using
      errcode = '23514',
      message = 'Usage event references missing allowance or reservation evidence';
  when too_many_rows then
    raise exception using
      errcode = '23514',
      message = 'Usage event references ambiguous allowance or reservation evidence';
end;
$$;

create or replace function public.ai_feature_validate_period_total_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowance public.company_ai_feature_allowances%rowtype;
begin
  if tg_op = 'UPDATE'
    and (
      new.id is distinct from old.id
      or new.policy_lineage_id is distinct from old.policy_lineage_id
      or new.allowance_id is distinct from old.allowance_id
      or new.company_id is distinct from old.company_id
      or new.feature_key is distinct from old.feature_key
      or new.meter_type is distinct from old.meter_type
      or new.period_start is distinct from old.period_start
      or new.period_end is distinct from old.period_end
      or new.created_at is distinct from old.created_at
    ) then
    raise exception using
      errcode = '55000',
      message = 'Usage-period identity and timestamps are immutable';
  end if;

  select allowance.*
  into strict v_allowance
  from public.company_ai_feature_allowances allowance
  where allowance.id = new.allowance_id;

  if v_allowance.company_id <> new.company_id
    or v_allowance.feature_key <> new.feature_key
    or v_allowance.meter_type <> new.meter_type
    or v_allowance.policy_lineage_id <> new.policy_lineage_id then
    raise exception using
      errcode = '23514',
      message = 'Usage period allowance must match company, feature, and meter';
  end if;

  new.updated_at = now();
  return new;
exception
  when no_data_found then
    raise exception using
      errcode = '23514',
      message = 'Usage period references a missing allowance';
end;
$$;

drop trigger if exists ai_usage_events_append_only
  on public.ai_usage_events;
create trigger ai_usage_events_append_only
before update or delete on public.ai_usage_events
for each row execute function public.ai_feature_reject_append_only_mutation();

drop trigger if exists ai_usage_events_validate_insert
  on public.ai_usage_events;
create trigger ai_usage_events_validate_insert
before insert on public.ai_usage_events
for each row execute function public.ai_feature_validate_usage_event_insert();

drop trigger if exists ai_usage_period_totals_validate_write
  on public.ai_usage_period_totals;
create trigger ai_usage_period_totals_validate_write
before insert or update on public.ai_usage_period_totals
for each row execute function public.ai_feature_validate_period_total_write();

drop trigger if exists company_ai_allowances_guard_update
  on public.company_ai_feature_allowances;
create trigger company_ai_allowances_guard_update
before update on public.company_ai_feature_allowances
for each row execute function public.ai_feature_guard_allowance_update();

drop trigger if exists company_ai_entitlements_set_updated_at
  on public.company_ai_feature_entitlements;
create trigger company_ai_entitlements_set_updated_at
before update on public.company_ai_feature_entitlements
for each row execute function public.set_updated_at();

drop trigger if exists ai_feature_global_controls_set_updated_at
  on public.ai_feature_global_controls;
create trigger ai_feature_global_controls_set_updated_at
before update on public.ai_feature_global_controls
for each row execute function public.set_updated_at();

alter table public.company_ai_feature_entitlements enable row level security;
alter table public.company_ai_feature_allowances enable row level security;
alter table public.ai_feature_global_controls enable row level security;
alter table public.ai_usage_events enable row level security;
alter table public.ai_usage_period_totals enable row level security;

revoke all on table public.company_ai_feature_entitlements
  from public, anon, authenticated;
revoke all on table public.company_ai_feature_allowances
  from public, anon, authenticated;
revoke all on table public.ai_feature_global_controls
  from public, anon, authenticated;
revoke all on table public.ai_usage_events
  from public, anon, authenticated;
revoke all on table public.ai_usage_period_totals
  from public, anon, authenticated;

grant select, insert, update on table public.company_ai_feature_entitlements
  to service_role;
grant select, insert, update on table public.company_ai_feature_allowances
  to service_role;
grant select, insert, update on table public.ai_feature_global_controls
  to service_role;
grant select, insert on table public.ai_usage_events
  to service_role;
grant select, insert, update on table public.ai_usage_period_totals
  to service_role;

revoke all on function public.ai_feature_reject_append_only_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.ai_feature_guard_allowance_update()
  from public, anon, authenticated, service_role;
revoke all on function public.ai_feature_validate_usage_event_insert()
  from public, anon, authenticated, service_role;
revoke all on function public.ai_feature_validate_period_total_write()
  from public, anon, authenticated, service_role;

insert into public.security_rollout_history (
  version,
  migration_name,
  details
)
values (
  '20260714010000',
  'ai_feature_foundation',
  jsonb_build_object(
    'scope', 'additive_secure_ai_feature_foundation',
    'default_state', 'paused_and_disabled',
    'browser_access', false,
    'content_logging', false
  )
)
on conflict (version) do nothing;

notify pgrst, 'reload schema';
