-- Call Intelligence V1: disabled-by-default app-owned foundation.
-- This migration creates storage and read policies only. It does not enable a
-- company, create a webhook token, call a provider, or write client profiles.

create table if not exists public.call_intelligence_calls (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  assigned_member_id uuid references public.company_members(id) on delete set null,
  integration_intake_event_id uuid unique
    references public.integration_intake_events(id) on delete set null,
  schema_version text not null default 'call_intelligence.v1'
    check (schema_version = 'call_intelligence.v1'),
  provider text not null check (provider in ('fathom', 'manual')),
  provider_call_id text not null check (length(provider_call_id) between 1 and 255),
  title text not null check (length(title) between 1 and 500),
  occurred_at timestamptz not null,
  duration_seconds integer
    check (duration_seconds is null or duration_seconds between 0 and 86400),
  recording_url text,
  share_url text,
  host_name text,
  host_email_normalized text,
  match_status text not null default 'unmatched'
    check (match_status in ('unmatched', 'matched', 'ambiguous', 'ignored')),
  processing_status text not null default 'received'
    check (
      processing_status in (
        'received',
        'needs_reconciliation',
        'queued',
        'processing',
        'completed',
        'failed',
        'ignored'
      )
    ),
  matched_by text,
  match_reason text,
  reconciliation_note text,
  transcript_sha256 text not null check (transcript_sha256 ~ '^[0-9a-f]{64}$'),
  last_error_category text,
  processing_attempts integer not null default 0 check (processing_attempts >= 0),
  queued_at timestamptz,
  processing_started_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, provider, provider_call_id),
  check (
    (match_status = 'matched' and client_id is not null)
    or (match_status <> 'matched')
  )
);

create index if not exists call_intelligence_calls_company_occurred_idx
  on public.call_intelligence_calls (company_id, occurred_at desc);

create index if not exists call_intelligence_calls_company_processing_idx
  on public.call_intelligence_calls (
    company_id,
    processing_status,
    occurred_at desc
  );

create index if not exists call_intelligence_calls_company_client_idx
  on public.call_intelligence_calls (company_id, client_id, occurred_at desc);

create index if not exists call_intelligence_calls_reconciliation_idx
  on public.call_intelligence_calls (company_id, occurred_at desc)
  where processing_status = 'needs_reconciliation';

drop trigger if exists call_intelligence_calls_set_updated_at
  on public.call_intelligence_calls;
create trigger call_intelligence_calls_set_updated_at
before update on public.call_intelligence_calls
for each row execute function public.set_updated_at();

create table if not exists public.call_intelligence_transcripts (
  call_id uuid primary key
    references public.call_intelligence_calls(id) on delete cascade,
  transcript_text text not null check (length(transcript_text) between 1 and 500000),
  transcript_sha256 text not null check (transcript_sha256 ~ '^[0-9a-f]{64}$'),
  character_count integer not null check (character_count between 1 and 500000),
  source_format text not null default 'plaintext'
    check (source_format in ('plaintext')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists call_intelligence_transcripts_set_updated_at
  on public.call_intelligence_transcripts;
create trigger call_intelligence_transcripts_set_updated_at
before update on public.call_intelligence_transcripts
for each row execute function public.set_updated_at();

create table if not exists public.call_intelligence_participants (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null
    references public.call_intelligence_calls(id) on delete cascade,
  name text,
  email_normalized text,
  participant_kind text not null default 'unknown'
    check (participant_kind in ('internal', 'external', 'unknown')),
  provider_role text not null default 'invitee'
    check (provider_role in ('host', 'invitee', 'unknown')),
  matched_client_id uuid references public.clients(id) on delete set null,
  matched_member_id uuid references public.company_members(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists call_intelligence_participants_call_email_idx
  on public.call_intelligence_participants (call_id, email_normalized)
  where email_normalized is not null;

create index if not exists call_intelligence_participants_call_idx
  on public.call_intelligence_participants (call_id);

create index if not exists call_intelligence_participants_client_idx
  on public.call_intelligence_participants (matched_client_id)
  where matched_client_id is not null;

create table if not exists public.call_intelligence_prompt_definitions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  scope text not null check (scope in ('fixed', 'company')),
  prompt_key text not null check (prompt_key ~ '^[a-z0-9][a-z0-9_]{1,79}$'),
  name text not null check (length(name) between 1 and 160),
  run_mode text not null check (run_mode in ('auto', 'manual')),
  prompt_text text not null check (length(prompt_text) between 1 and 100000),
  output_schema jsonb not null default '{}'::jsonb,
  version text not null check (length(version) between 1 and 80),
  status text not null default 'active'
    check (status in ('active', 'archived')),
  created_by_auth_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (scope = 'fixed' and company_id is null)
    or (scope = 'company' and company_id is not null)
  )
);

create unique index if not exists call_intelligence_fixed_prompt_version_idx
  on public.call_intelligence_prompt_definitions (prompt_key, version)
  where company_id is null;

create unique index if not exists call_intelligence_company_prompt_version_idx
  on public.call_intelligence_prompt_definitions (
    company_id,
    prompt_key,
    version
  )
  where company_id is not null;

drop trigger if exists call_intelligence_prompt_definitions_set_updated_at
  on public.call_intelligence_prompt_definitions;
create trigger call_intelligence_prompt_definitions_set_updated_at
before update on public.call_intelligence_prompt_definitions
for each row execute function public.set_updated_at();

create table if not exists public.call_intelligence_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  call_id uuid not null
    references public.call_intelligence_calls(id) on delete cascade,
  prompt_definition_id uuid not null
    references public.call_intelligence_prompt_definitions(id) on delete restrict,
  prompt_version text not null,
  prompt_snapshot_sha256 text not null
    check (prompt_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  run_kind text not null check (run_kind in ('fixed', 'on_demand', 'reprocess')),
  request_key text not null default 'auto',
  status text not null default 'queued'
    check (status in ('queued', 'claimed', 'succeeded', 'failed', 'cancelled')),
  model text,
  reasoning_effort text,
  price_card_version text,
  input_micros_per_million_tokens bigint
    check (
      input_micros_per_million_tokens is null
      or input_micros_per_million_tokens > 0
    ),
  cached_input_micros_per_million_tokens bigint
    check (
      cached_input_micros_per_million_tokens is null
      or cached_input_micros_per_million_tokens > 0
    ),
  output_micros_per_million_tokens bigint
    check (
      output_micros_per_million_tokens is null
      or output_micros_per_million_tokens > 0
    ),
  result_schema_version text,
  result_json jsonb,
  result_text text,
  provider_request_id text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  cached_input_tokens integer
    check (cached_input_tokens is null or cached_input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  reasoning_tokens integer check (reasoning_tokens is null or reasoning_tokens >= 0),
  cost_micros bigint check (cost_micros is null or cost_micros >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  allowance_id uuid
    references public.company_ai_feature_allowances(id) on delete restrict,
  allowance_period_start timestamptz,
  allowance_period_end timestamptz,
  reserved_cost_micros bigint
    check (reserved_cost_micros is null or reserved_cost_micros >= 0),
  reservation_expires_at timestamptz,
  provider_dispatched_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  error_category text,
  claimed_at timestamptz,
  completed_at timestamptz,
  created_by_auth_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (
    call_id,
    prompt_definition_id,
    prompt_version,
    run_kind,
    request_key
  )
);

create index if not exists call_intelligence_runs_queue_idx
  on public.call_intelligence_runs (status, created_at)
  where status = 'queued';

create index if not exists call_intelligence_runs_call_idx
  on public.call_intelligence_runs (call_id, created_at desc);

drop trigger if exists call_intelligence_runs_set_updated_at
  on public.call_intelligence_runs;
create trigger call_intelligence_runs_set_updated_at
before update on public.call_intelligence_runs
for each row execute function public.set_updated_at();

create table if not exists public.call_intelligence_usage_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  call_id uuid not null
    references public.call_intelligence_calls(id) on delete cascade,
  run_id uuid not null
    references public.call_intelligence_runs(id) on delete cascade,
  trigger_kind text not null
    check (trigger_kind in ('webhook', 'scheduled_worker', 'user')),
  actor_auth_user_id uuid,
  provider text not null default 'openai',
  model text not null,
  price_card_version text not null,
  input_micros_per_million_tokens bigint not null
    check (input_micros_per_million_tokens > 0),
  cached_input_micros_per_million_tokens bigint not null
    check (cached_input_micros_per_million_tokens > 0),
  output_micros_per_million_tokens bigint not null
    check (output_micros_per_million_tokens > 0),
  provider_request_id text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cached_input_tokens integer not null default 0
    check (cached_input_tokens between 0 and input_tokens),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  reasoning_tokens integer not null default 0
    check (reasoning_tokens between 0 and output_tokens),
  cost_micros bigint not null default 0 check (cost_micros >= 0),
  status text not null check (status in ('succeeded', 'failed', 'failed_uncertain')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (
    (trigger_kind = 'user' and actor_auth_user_id is not null)
    or trigger_kind in ('webhook', 'scheduled_worker')
  )
);

create unique index if not exists call_intelligence_usage_provider_request_idx
  on public.call_intelligence_usage_events (provider, provider_request_id)
  where provider_request_id is not null;

create index if not exists call_intelligence_usage_company_created_idx
  on public.call_intelligence_usage_events (company_id, created_at desc);

create or replace function public.can_read_call_intelligence_call(
  target_company_id uuid,
  target_client_id uuid,
  target_match_status text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_retainos_super_admin_bound()
    or (
      target_company_id = public.current_actor_app_policy_company_id()
      and (
        public.current_actor_app_policy_role() = 'director'
        or (
          public.current_actor_app_policy_role() = 'support'
          and target_match_status = 'matched'
        )
        or (
          public.current_actor_app_policy_role() = 'csm'
          and target_match_status = 'matched'
          and target_client_id is not null
          and exists (
            select 1
            from public.company_settings settings
            where settings.company_id = target_company_id
              and settings.enable_call_ai_for_csms = true
          )
          and exists (
            select 1
            from public.clients client
            where client.id = target_client_id
              and client.company_id = target_company_id
              and (
                client.csm_team_member_id = any(
                  coalesce(
                    public.current_actor_app_policy_member_ids(),
                    array[]::text[]
                  )
                )
                or client.csm_secondary_assignee_id = any(
                  coalesce(
                    public.current_actor_app_policy_member_ids(),
                    array[]::text[]
                  )
                )
              )
          )
        )
      )
    );
$$;

revoke all on function public.can_read_call_intelligence_call(uuid, uuid, text)
  from public, anon;
grant execute on function public.can_read_call_intelligence_call(uuid, uuid, text)
  to authenticated, service_role;

alter table public.call_intelligence_calls enable row level security;
alter table public.call_intelligence_transcripts enable row level security;
alter table public.call_intelligence_participants enable row level security;
alter table public.call_intelligence_prompt_definitions enable row level security;
alter table public.call_intelligence_runs enable row level security;
alter table public.call_intelligence_usage_events enable row level security;

create policy "call_intelligence_calls_authenticated_read"
on public.call_intelligence_calls
for select
to authenticated
using (
  public.can_read_call_intelligence_call(company_id, client_id, match_status)
);

create policy "call_intelligence_transcripts_authenticated_read"
on public.call_intelligence_transcripts
for select
to authenticated
using (
  exists (
    select 1
    from public.call_intelligence_calls call
    where call.id = call_intelligence_transcripts.call_id
      and public.can_read_call_intelligence_call(
        call.company_id,
        call.client_id,
        call.match_status
      )
  )
);

create policy "call_intelligence_participants_authenticated_read"
on public.call_intelligence_participants
for select
to authenticated
using (
  exists (
    select 1
    from public.call_intelligence_calls call
    where call.id = call_intelligence_participants.call_id
      and public.can_read_call_intelligence_call(
        call.company_id,
        call.client_id,
        call.match_status
      )
  )
);

create policy "call_intelligence_runs_authenticated_read"
on public.call_intelligence_runs
for select
to authenticated
using (
  exists (
    select 1
    from public.call_intelligence_calls call
    where call.id = call_intelligence_runs.call_id
      and public.can_read_call_intelligence_call(
        call.company_id,
        call.client_id,
        call.match_status
      )
  )
);

create policy "call_intelligence_prompt_definitions_authenticated_read"
on public.call_intelligence_prompt_definitions
for select
to authenticated
using (
  public.is_retainos_super_admin_bound()
  or (
    public.current_actor_app_policy_role() in ('director', 'support')
    and (
      company_id is null
      or company_id = public.current_actor_app_policy_company_id()
    )
  )
);

-- Usage is intentionally server-only in V1. Browser-safe usage summaries can
-- be added through a bounded RPC after accounting semantics are proven.

revoke all on public.call_intelligence_calls from anon;
revoke all on public.call_intelligence_transcripts from anon;
revoke all on public.call_intelligence_participants from anon;
revoke all on public.call_intelligence_prompt_definitions from anon;
revoke all on public.call_intelligence_runs from anon;
revoke all on public.call_intelligence_usage_events from anon, authenticated;

grant select on public.call_intelligence_calls to authenticated;
grant select on public.call_intelligence_transcripts to authenticated;
grant select on public.call_intelligence_participants to authenticated;
grant select on public.call_intelligence_prompt_definitions to authenticated;
grant select on public.call_intelligence_runs to authenticated;

grant all on public.call_intelligence_calls to service_role;
grant all on public.call_intelligence_transcripts to service_role;
grant all on public.call_intelligence_participants to service_role;
grant all on public.call_intelligence_prompt_definitions to service_role;
grant all on public.call_intelligence_runs to service_role;
grant all on public.call_intelligence_usage_events to service_role;

comment on table public.call_intelligence_transcripts is
  'Protected full call transcripts. Never select this table in list/metrics queries or copy transcript text into operational logs/audit rows.';

comment on table public.call_intelligence_usage_events is
  'Automation-safe metadata-only provider usage ledger. Webhook/scheduled triggers are explicit and are never falsely attributed to a user.';

create or replace function public.claim_call_intelligence_run(
  p_run_id uuid,
  p_model text,
  p_reasoning_effort text,
  p_reserved_cost_micros bigint,
  p_price_card_version text,
  p_input_micros_per_million_tokens bigint,
  p_cached_input_micros_per_million_tokens bigint,
  p_output_micros_per_million_tokens bigint
)
returns table (
  allowed boolean,
  denial_code text,
  run_id uuid,
  call_id uuid,
  company_id uuid,
  transcript_text text,
  prompt_text text,
  output_schema jsonb,
  run_kind text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.call_intelligence_runs%rowtype;
  v_call public.call_intelligence_calls%rowtype;
  v_control public.ai_feature_global_controls%rowtype;
  v_entitlement public.company_ai_feature_entitlements%rowtype;
  v_allowance public.company_ai_feature_allowances%rowtype;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_consumed_micros bigint := 0;
  v_reserved_micros bigint := 0;
begin
  if p_reserved_cost_micros is null or p_reserved_cost_micros <= 0 then
    return query select false, 'invalid_reservation'::text,
      null::uuid, null::uuid, null::uuid, null::text, null::text,
      null::jsonb, null::text;
    return;
  end if;
  if nullif(trim(p_price_card_version), '') is null
    or p_input_micros_per_million_tokens is null
    or p_input_micros_per_million_tokens <= 0
    or p_cached_input_micros_per_million_tokens is null
    or p_cached_input_micros_per_million_tokens <= 0
    or p_output_micros_per_million_tokens is null
    or p_output_micros_per_million_tokens <= 0 then
    return query select false, 'invalid_price_lineage'::text,
      null::uuid, null::uuid, null::uuid, null::text, null::text,
      null::jsonb, null::text;
    return;
  end if;

  select run.*
  into v_run
  from public.call_intelligence_runs run
  where run.id = p_run_id
  for update;

  if not found then
    return query select false, 'run_not_found'::text,
      null::uuid, null::uuid, null::uuid, null::text, null::text,
      null::jsonb, null::text;
    return;
  end if;

  if v_run.status = 'claimed'
    and v_run.reservation_expires_at is not null
    and v_run.reservation_expires_at <= now() then
    if v_run.provider_dispatched_at is not null then
      return query select false, 'ambiguous_provider_dispatch'::text,
        v_run.id, v_run.call_id, v_run.company_id, null::text, null::text,
        null::jsonb, v_run.run_kind;
      return;
    end if;
    update public.call_intelligence_runs
    set
      status = 'queued',
      claimed_at = null,
      reservation_expires_at = null,
      reserved_cost_micros = null,
      allowance_id = null,
      allowance_period_start = null,
      allowance_period_end = null,
      error_category = 'expired_claim_requeued'
    where id = v_run.id;
    v_run.status := 'queued';
  end if;

  if v_run.status <> 'queued' then
    return query select false, 'run_not_queued'::text,
      v_run.id, v_run.call_id, v_run.company_id, null::text, null::text,
      null::jsonb, v_run.run_kind;
    return;
  end if;

  select control.*
  into v_control
  from public.ai_feature_global_controls control
  where control.feature_key = 'call_analysis'
  for update;

  if not found or v_control.status <> 'active' then
    return query select false, 'feature_paused'::text,
      v_run.id, v_run.call_id, v_run.company_id, null::text, null::text,
      null::jsonb, v_run.run_kind;
    return;
  end if;

  if p_reserved_cost_micros > v_control.max_reserve_cost_micros_per_request then
    return query select false, 'reservation_too_large'::text,
      v_run.id, v_run.call_id, v_run.company_id, null::text, null::text,
      null::jsonb, v_run.run_kind;
    return;
  end if;

  select entitlement.*
  into v_entitlement
  from public.company_ai_feature_entitlements entitlement
  where entitlement.company_id = v_run.company_id
    and entitlement.feature_key = 'call_analysis';

  if not found
    or v_entitlement.status not in ('pilot', 'enabled')
    or (v_entitlement.effective_from is not null and v_entitlement.effective_from > now())
    or (v_entitlement.effective_until is not null and v_entitlement.effective_until <= now()) then
    return query select false, 'company_not_entitled'::text,
      v_run.id, v_run.call_id, v_run.company_id, null::text, null::text,
      null::jsonb, v_run.run_kind;
    return;
  end if;

  select allowance.*
  into v_allowance
  from public.company_ai_feature_allowances allowance
  where allowance.company_id = v_run.company_id
    and allowance.feature_key = 'call_analysis'
    and allowance.meter_type = 'usd_cents'
    and allowance.status = 'active'
    and allowance.hard_stop
    and allowance.effective_from <= now()
    and (allowance.effective_until is null or allowance.effective_until > now())
  for update;

  if not found then
    return query select false, 'allowance_missing'::text,
      v_run.id, v_run.call_id, v_run.company_id, null::text, null::text,
      null::jsonb, v_run.run_kind;
    return;
  end if;

  select bounds.period_start, bounds.period_end
  into v_period_start, v_period_end
  from public.beacon_allowance_period(v_allowance.id, now()) bounds;

  select coalesce(sum(usage.cost_micros), 0)
  into v_consumed_micros
  from public.call_intelligence_usage_events usage
  where usage.company_id = v_run.company_id
    and usage.created_at >= v_period_start
    and usage.created_at < v_period_end;

  select coalesce(sum(run.reserved_cost_micros), 0)
  into v_reserved_micros
  from public.call_intelligence_runs run
  where run.company_id = v_run.company_id
    and run.status = 'claimed'
    and run.reservation_expires_at > now()
    and run.allowance_id = v_allowance.id
    and run.allowance_period_start = v_period_start
    and run.allowance_period_end = v_period_end;

  if v_consumed_micros + v_reserved_micros + p_reserved_cost_micros
    > v_allowance.limit_value * 10000 then
    return query select false, 'allowance_exhausted'::text,
      v_run.id, v_run.call_id, v_run.company_id, null::text, null::text,
      null::jsonb, v_run.run_kind;
    return;
  end if;

  update public.call_intelligence_runs
  set
    status = 'claimed',
    model = left(p_model, 128),
    reasoning_effort = left(p_reasoning_effort, 32),
    price_card_version = left(p_price_card_version, 128),
    input_micros_per_million_tokens =
      p_input_micros_per_million_tokens,
    cached_input_micros_per_million_tokens =
      p_cached_input_micros_per_million_tokens,
    output_micros_per_million_tokens =
      p_output_micros_per_million_tokens,
    allowance_id = v_allowance.id,
    allowance_period_start = v_period_start,
    allowance_period_end = v_period_end,
    reserved_cost_micros = p_reserved_cost_micros,
    reservation_expires_at =
      now() + make_interval(secs => v_control.reservation_ttl_seconds),
    claimed_at = now(),
    attempt_count = attempt_count + 1,
    error_category = null
  where id = v_run.id;

  update public.call_intelligence_calls
  set
    processing_status = 'processing',
    processing_started_at = now(),
    processing_attempts = processing_attempts + 1,
    last_error_category = null
  where id = v_run.call_id;

  select call.*
  into strict v_call
  from public.call_intelligence_calls call
  where call.id = v_run.call_id;

  return query
  select
    true,
    null::text,
    v_run.id,
    v_run.call_id,
    v_run.company_id,
    transcript.transcript_text,
    prompt.prompt_text,
    prompt.output_schema,
    v_run.run_kind
  from public.call_intelligence_transcripts transcript
  join public.call_intelligence_prompt_definitions prompt
    on prompt.id = v_run.prompt_definition_id
  where transcript.call_id = v_run.call_id;
end;
$$;

create or replace function public.mark_call_intelligence_run_dispatched(
  p_run_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  update public.call_intelligence_runs
  set provider_dispatched_at = now()
  where id = p_run_id
    and status = 'claimed'
    and provider_dispatched_at is null
  returning true;
$$;

create or replace function public.finalize_call_intelligence_run(
  p_run_id uuid,
  p_succeeded boolean,
  p_result_schema_version text,
  p_result_json jsonb,
  p_result_text text,
  p_provider_request_id text,
  p_input_tokens integer,
  p_cached_input_tokens integer,
  p_output_tokens integer,
  p_reasoning_tokens integer,
  p_actual_cost_micros bigint,
  p_latency_ms integer,
  p_error_category text,
  p_cost_uncertain boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.call_intelligence_runs%rowtype;
  v_charge_micros bigint;
  v_recomputed_cost_micros bigint;
begin
  select run.*
  into v_run
  from public.call_intelligence_runs run
  where run.id = p_run_id
  for update;

  if not found or v_run.status <> 'claimed' then
    return false;
  end if;

  v_recomputed_cost_micros :=
    (
      (
        (
          greatest(coalesce(p_input_tokens, 0), 0)
          - least(
              greatest(coalesce(p_cached_input_tokens, 0), 0),
              greatest(coalesce(p_input_tokens, 0), 0)
            )
        )::bigint * v_run.input_micros_per_million_tokens
        + 999999
      ) / 1000000
    )
    + (
      (
        least(
          greatest(coalesce(p_cached_input_tokens, 0), 0),
          greatest(coalesce(p_input_tokens, 0), 0)
        )::bigint * v_run.cached_input_micros_per_million_tokens
        + 999999
      ) / 1000000
    )
    + (
      (
        greatest(coalesce(p_output_tokens, 0), 0)::bigint
          * v_run.output_micros_per_million_tokens
        + 999999
      ) / 1000000
    );

  if not p_cost_uncertain
    and p_actual_cost_micros is distinct from v_recomputed_cost_micros then
    raise exception 'Call Intelligence cost does not match price lineage';
  end if;

  v_charge_micros := case
    when p_cost_uncertain then v_run.reserved_cost_micros
    else v_recomputed_cost_micros
  end;

  if v_charge_micros is null or v_charge_micros < 0 then
    raise exception 'Call Intelligence finalization requires non-negative cost';
  end if;

  if v_charge_micros > v_run.reserved_cost_micros then
    update public.ai_feature_global_controls
    set
      status = 'paused',
      status_reason = 'Call Intelligence actual cost exceeded reservation',
      paused_at = now()
    where feature_key = 'call_analysis';
  end if;

  insert into public.call_intelligence_usage_events (
    company_id,
    call_id,
    run_id,
    trigger_kind,
    provider,
    model,
    price_card_version,
    input_micros_per_million_tokens,
    cached_input_micros_per_million_tokens,
    output_micros_per_million_tokens,
    provider_request_id,
    input_tokens,
    cached_input_tokens,
    output_tokens,
    reasoning_tokens,
    cost_micros,
    status,
    metadata
  )
  values (
    v_run.company_id,
    v_run.call_id,
    v_run.id,
    'scheduled_worker',
    'openai',
    coalesce(v_run.model, 'unknown'),
    v_run.price_card_version,
    v_run.input_micros_per_million_tokens,
    v_run.cached_input_micros_per_million_tokens,
    v_run.output_micros_per_million_tokens,
    nullif(left(coalesce(p_provider_request_id, ''), 256), ''),
    greatest(coalesce(p_input_tokens, 0), 0),
    least(
      greatest(coalesce(p_cached_input_tokens, 0), 0),
      greatest(coalesce(p_input_tokens, 0), 0)
    ),
    greatest(coalesce(p_output_tokens, 0), 0),
    least(
      greatest(coalesce(p_reasoning_tokens, 0), 0),
      greatest(coalesce(p_output_tokens, 0), 0)
    ),
    v_charge_micros,
    case
      when p_cost_uncertain then 'failed_uncertain'
      when p_succeeded then 'succeeded'
      else 'failed'
    end,
    jsonb_build_object(
      'result_status', case when p_succeeded then 'succeeded' else 'failed' end,
      'cost_uncertain', p_cost_uncertain,
      'allowance_id', v_run.allowance_id,
      'allowance_period_start', v_run.allowance_period_start,
      'allowance_period_end', v_run.allowance_period_end,
      'reserved_cost_micros', v_run.reserved_cost_micros
    )
  );

  update public.call_intelligence_runs
  set
    status = case when p_succeeded then 'succeeded' else 'failed' end,
    result_schema_version =
      case when p_succeeded then left(p_result_schema_version, 80) else null end,
    result_json = case when p_succeeded then p_result_json else null end,
    result_text = case when p_succeeded then p_result_text else null end,
    provider_request_id =
      nullif(left(coalesce(p_provider_request_id, ''), 256), ''),
    input_tokens = greatest(coalesce(p_input_tokens, 0), 0),
    cached_input_tokens = least(
      greatest(coalesce(p_cached_input_tokens, 0), 0),
      greatest(coalesce(p_input_tokens, 0), 0)
    ),
    output_tokens = greatest(coalesce(p_output_tokens, 0), 0),
    reasoning_tokens = least(
      greatest(coalesce(p_reasoning_tokens, 0), 0),
      greatest(coalesce(p_output_tokens, 0), 0)
    ),
    cost_micros = v_charge_micros,
    latency_ms = greatest(coalesce(p_latency_ms, 0), 0),
    error_category =
      case when p_succeeded then null else left(p_error_category, 128) end,
    completed_at = now()
  where id = v_run.id;

  if v_run.run_kind in ('fixed', 'reprocess') then
    update public.call_intelligence_calls
    set
      processing_status = case when p_succeeded then 'completed' else 'failed' end,
      processed_at = case when p_succeeded then now() else processed_at end,
      last_error_category =
        case when p_succeeded then null else left(p_error_category, 128) end
    where id = v_run.call_id;
  end if;

  return true;
end;
$$;

revoke all on function public.claim_call_intelligence_run(
  uuid, text, text, bigint, text, bigint, bigint, bigint
)
  from public, anon, authenticated;
revoke all on function public.mark_call_intelligence_run_dispatched(uuid)
  from public, anon, authenticated;
revoke all on function public.finalize_call_intelligence_run(
  uuid, boolean, text, jsonb, text, text, integer, integer, integer, integer,
  bigint, integer, text, boolean
) from public, anon, authenticated;

grant execute on function public.claim_call_intelligence_run(
  uuid, text, text, bigint, text, bigint, bigint, bigint
)
  to service_role;
grant execute on function public.mark_call_intelligence_run_dispatched(uuid)
  to service_role;
grant execute on function public.finalize_call_intelligence_run(
  uuid, boolean, text, jsonb, text, text, integer, integer, integer, integer,
  bigint, integer, text, boolean
) to service_role;
