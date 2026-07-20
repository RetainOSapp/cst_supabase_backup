-- Pipeline Phase 0-2 additive foundation.
-- Disabled by default: this migration creates no pipeline rows and enables no
-- company. Browser clients receive assignment-aware reads only; writes remain
-- behind authenticated service-role Edge Functions.

alter table public.company_settings
  add column if not exists enable_pipeline boolean not null default false,
  add column if not exists enable_pipeline_viewer_access boolean not null default false;

comment on column public.company_settings.enable_pipeline is
  'Master Pipeline workspace and operational-write kill switch. Defaults off.';
comment on column public.company_settings.enable_pipeline_viewer_access is
  'Allows same-company Viewers to read Pipeline data when Pipeline is enabled.';

create table if not exists public.company_pipelines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  pipeline_type text not null
    check (pipeline_type in ('renewal', 'expansion')),
  position integer not null default 0 check (position between 0 and 10000),
  is_enabled boolean not null default false,
  value_source text not null default 'none'
    check (value_source in ('current_contract', 'fixed', 'none')),
  default_estimated_value_cents bigint
    check (default_estimated_value_cents is null or default_estimated_value_cents >= 0),
  currency_code text not null default 'USD'
    check (currency_code ~ '^[A-Z]{3}$'),
  renewal_lead_days integer not null default 90
    check (renewal_lead_days between 0 and 365),
  default_follow_up_days integer
    check (default_follow_up_days is null or default_follow_up_days between 0 and 365),
  entry_rules jsonb not null default '{}'::jsonb,
  automation_settings jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, company_id)
);

create table if not exists public.company_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  pipeline_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  color text,
  stage_type text not null default 'open'
    check (stage_type in ('open', 'won', 'lost')),
  position integer not null default 0 check (position between 0 and 10000),
  requires_note boolean not null default false,
  is_enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, pipeline_id, company_id),
  constraint company_pipeline_stages_pipeline_company_fkey
    foreign key (pipeline_id, company_id)
    references public.company_pipelines(id, company_id)
    on delete cascade
);

create unique index if not exists pipeline_clients_id_company_unique_idx
  on public.clients (id, company_id);

create table if not exists public.client_pipeline_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid not null,
  pipeline_id uuid not null,
  stage_id uuid not null,
  owner_member_id uuid references public.company_members(id) on delete set null,
  source_contract_id uuid references public.client_contracts(id) on delete set null,
  client_name_snapshot text not null
    check (char_length(btrim(client_name_snapshot)) between 1 and 200),
  client_business_snapshot text,
  pathway_id_snapshot text,
  pathway_name_snapshot text,
  estimated_value_cents bigint
    check (estimated_value_cents is null or estimated_value_cents >= 0),
  actual_value_cents bigint
    check (actual_value_cents is null or actual_value_cents >= 0),
  currency_code text not null default 'USD'
    check (currency_code ~ '^[A-Z]{3}$'),
  renewal_at timestamptz,
  expected_close_at timestamptz,
  follow_up_at timestamptz,
  outcome text,
  loss_reason text,
  current_note text,
  lifecycle_status text not null default 'open'
    check (lifecycle_status in ('open', 'won', 'lost', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, company_id),
  constraint client_pipeline_items_client_company_fkey
    foreign key (client_id, company_id)
    references public.clients(id, company_id)
    on delete restrict,
  constraint client_pipeline_items_pipeline_company_fkey
    foreign key (pipeline_id, company_id)
    references public.company_pipelines(id, company_id)
    on delete restrict,
  constraint client_pipeline_items_stage_pipeline_company_fkey
    foreign key (stage_id, pipeline_id, company_id)
    references public.company_pipeline_stages(id, pipeline_id, company_id)
    on delete restrict
);

create table if not exists public.client_pipeline_stage_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  pipeline_id uuid not null,
  item_id uuid not null,
  from_stage_id uuid references public.company_pipeline_stages(id) on delete set null,
  to_stage_id uuid references public.company_pipeline_stages(id) on delete set null,
  actor_auth_user_id uuid references auth.users(id) on delete set null,
  actor_member_id uuid references public.company_members(id) on delete set null,
  event_type text not null default 'stage_changed'
    check (
      event_type in (
        'created',
        'stage_changed',
        'note_added',
        'follow_up_changed',
        'owner_changed',
        'value_changed',
        'details_changed',
        'archived'
      )
    ),
  note text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint client_pipeline_stage_events_item_company_fkey
    foreign key (item_id, company_id)
    references public.client_pipeline_items(id, company_id)
    on delete cascade,
  constraint client_pipeline_stage_events_pipeline_company_fkey
    foreign key (pipeline_id, company_id)
    references public.company_pipelines(id, company_id)
    on delete restrict
);

create unique index if not exists company_pipelines_active_name_unique_idx
  on public.company_pipelines (company_id, lower(name))
  where archived_at is null;

create index if not exists company_pipelines_company_state_position_idx
  on public.company_pipelines (company_id, is_enabled, position)
  where archived_at is null;

create index if not exists company_pipeline_stages_pipeline_position_idx
  on public.company_pipeline_stages (pipeline_id, position)
  where archived_at is null and is_enabled = true;

create index if not exists company_pipeline_stages_company_pipeline_idx
  on public.company_pipeline_stages (company_id, pipeline_id);

create unique index if not exists company_pipeline_stages_active_terminal_unique_idx
  on public.company_pipeline_stages (pipeline_id, stage_type)
  where archived_at is null
    and is_enabled = true
    and stage_type in ('won', 'lost');

create index if not exists client_pipeline_items_company_stage_idx
  on public.client_pipeline_items (company_id, pipeline_id, stage_id)
  where archived_at is null;

create index if not exists client_pipeline_items_company_client_created_idx
  on public.client_pipeline_items (company_id, client_id, created_at desc);

create index if not exists client_pipeline_items_owner_follow_up_idx
  on public.client_pipeline_items (company_id, owner_member_id, follow_up_at)
  where archived_at is null and lifecycle_status = 'open';

create index if not exists client_pipeline_items_company_follow_up_idx
  on public.client_pipeline_items (company_id, follow_up_at)
  where archived_at is null and lifecycle_status = 'open' and follow_up_at is not null;

create unique index if not exists client_pipeline_items_pipeline_contract_unique_idx
  on public.client_pipeline_items (pipeline_id, source_contract_id)
  where source_contract_id is not null and archived_at is null;

create index if not exists client_pipeline_stage_events_item_created_idx
  on public.client_pipeline_stage_events (item_id, created_at desc);

create index if not exists client_pipeline_stage_events_company_created_idx
  on public.client_pipeline_stage_events (company_id, created_at desc);

drop trigger if exists company_pipelines_set_updated_at on public.company_pipelines;
create trigger company_pipelines_set_updated_at
before update on public.company_pipelines
for each row execute function public.set_updated_at();

drop trigger if exists company_pipeline_stages_set_updated_at on public.company_pipeline_stages;
create trigger company_pipeline_stages_set_updated_at
before update on public.company_pipeline_stages
for each row execute function public.set_updated_at();

drop trigger if exists client_pipeline_items_set_updated_at on public.client_pipeline_items;
create trigger client_pipeline_items_set_updated_at
before update on public.client_pipeline_items
for each row execute function public.set_updated_at();

create or replace function public.prevent_client_pipeline_stage_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Pipeline stage events are append-only.';
end;
$$;

drop trigger if exists client_pipeline_stage_events_append_only
  on public.client_pipeline_stage_events;
create trigger client_pipeline_stage_events_append_only
before update or delete on public.client_pipeline_stage_events
for each row execute function public.prevent_client_pipeline_stage_event_mutation();

alter table public.company_pipelines enable row level security;
alter table public.company_pipeline_stages enable row level security;
alter table public.client_pipeline_items enable row level security;
alter table public.client_pipeline_stage_events enable row level security;

-- Viewer actors intentionally cannot read the full company_settings row. These
-- narrow helpers expose only the two booleans needed by Pipeline policies and
-- avoid weakening the existing company_settings policy.
create or replace function public.is_company_pipeline_enabled(
  target_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select settings.enable_pipeline
      from public.company_settings settings
      where settings.company_id = target_company_id
    ),
    false
  );
$$;

create or replace function public.is_company_pipeline_viewer_access_enabled(
  target_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select
        settings.enable_pipeline
        and settings.enable_pipeline_viewer_access
      from public.company_settings settings
      where settings.company_id = target_company_id
    ),
    false
  );
$$;

revoke all on function public.is_company_pipeline_enabled(uuid)
  from public, anon;
revoke all on function public.is_company_pipeline_viewer_access_enabled(uuid)
  from public, anon;
grant execute on function public.is_company_pipeline_enabled(uuid)
  to authenticated, service_role;
grant execute on function public.is_company_pipeline_viewer_access_enabled(uuid)
  to authenticated, service_role;

-- Configuration remains visible to Directors while the master gate is off so
-- they can prepare it. Operational roles only receive definitions when the
-- company gate is enabled. Viewer reads also require the separate Viewer gate.
create policy company_pipelines_authenticated_read
on public.company_pipelines for select to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or (
    company_id = (select public.current_actor_app_policy_company_id())
    and (
      (select public.current_actor_app_policy_role()) = 'director'
      or (
        (select public.is_company_pipeline_enabled(company_id))
        and (
          (select public.current_actor_app_policy_role()) in ('support', 'csm')
          or (
            (select public.current_actor_app_policy_role()) = 'viewer'
            and (
              select public.is_company_pipeline_viewer_access_enabled(company_id)
            )
          )
        )
      )
    )
  )
);

create policy company_pipeline_stages_authenticated_read
on public.company_pipeline_stages for select to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or (
    company_id = (select public.current_actor_app_policy_company_id())
    and (
      (select public.current_actor_app_policy_role()) = 'director'
      or (
        (select public.is_company_pipeline_enabled(company_id))
        and (
          (select public.current_actor_app_policy_role()) in ('support', 'csm')
          or (
            (select public.current_actor_app_policy_role()) = 'viewer'
            and (
              select public.is_company_pipeline_viewer_access_enabled(company_id)
            )
          )
        )
      )
    )
  )
);

create policy client_pipeline_items_authenticated_read
on public.client_pipeline_items for select to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or (
    company_id = (select public.current_actor_app_policy_company_id())
    and (select public.is_company_pipeline_enabled(company_id))
    and (
          (select public.current_actor_app_policy_role()) in ('director', 'support')
          or (
            (select public.current_actor_app_policy_role()) = 'viewer'
            and (
              select public.is_company_pipeline_viewer_access_enabled(company_id)
            )
          )
          or (
            (select public.current_actor_app_policy_role()) = 'csm'
            and exists (
              select 1
              from public.clients client
              where client.id = client_pipeline_items.client_id
                and client.company_id = client_pipeline_items.company_id
                and (
                  client.csm_team_member_id = any(
                    coalesce(
                      (select public.current_actor_app_policy_member_ids()),
                      array[]::text[]
                    )
                  )
                  or client.csm_secondary_assignee_id = any(
                    coalesce(
                      (select public.current_actor_app_policy_member_ids()),
                      array[]::text[]
                    )
                  )
                )
            )
          )
    )
  )
);

create policy client_pipeline_stage_events_authenticated_read
on public.client_pipeline_stage_events for select to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or (
    company_id = (select public.current_actor_app_policy_company_id())
    and (select public.is_company_pipeline_enabled(company_id))
    and exists (
      select 1
      from public.client_pipeline_items item
      where item.id = client_pipeline_stage_events.item_id
        and item.company_id = client_pipeline_stage_events.company_id
        and (
          (select public.current_actor_app_policy_role()) in ('director', 'support')
          or (
            (select public.current_actor_app_policy_role()) = 'viewer'
            and (
              select public.is_company_pipeline_viewer_access_enabled(
                client_pipeline_stage_events.company_id
              )
            )
          )
          or (
            (select public.current_actor_app_policy_role()) = 'csm'
            and exists (
              select 1
              from public.clients client
              where client.id = item.client_id
                and client.company_id = item.company_id
                and (
                  client.csm_team_member_id = any(
                    coalesce(
                      (select public.current_actor_app_policy_member_ids()),
                      array[]::text[]
                    )
                  )
                  or client.csm_secondary_assignee_id = any(
                    coalesce(
                      (select public.current_actor_app_policy_member_ids()),
                      array[]::text[]
                    )
                  )
                )
            )
          )
        )
    )
  )
);

-- No INSERT, UPDATE, or DELETE policies are intentionally created.

alter table public.client_history_events
  drop constraint if exists client_history_events_event_type_check;

alter table public.client_history_events
  add constraint client_history_events_event_type_check
  check (
    event_type in (
      'quick_update',
      'profile_update',
      'client_created',
      'client_offboarded',
      'client_outcomes_updated',
      'client_retention_recorded',
      'task_created',
      'task_updated',
      'contract_created',
      'contract_updated',
      'contract_archived',
      'contract_deleted',
      'client_status_changed',
      'client_milestone_started',
      'client_milestone_completed',
      'client_pathway_changed',
      'client_secondary_pathway_changed',
      'client_timed_checkpoint_completed',
      'call_summary_webhook',
      'client_update_webhook',
      'pipeline_activity'
    )
  );

-- Service-only transactional mutation helpers keep the canonical item,
-- append-only stage evidence, Client History, and app audit row in one
-- database transaction. Browser/authenticated roles cannot execute them.
create or replace function public.create_pipeline_item_with_evidence(
  p_company_id uuid,
  p_client_id uuid,
  p_pipeline_id uuid,
  p_stage_id uuid,
  p_owner_member_id uuid,
  p_client_name_snapshot text,
  p_client_business_snapshot text,
  p_pathway_id_snapshot text,
  p_pathway_name_snapshot text,
  p_estimated_value_cents bigint,
  p_currency_code text,
  p_renewal_at timestamptz,
  p_expected_close_at timestamptz,
  p_follow_up_at timestamptz,
  p_outcome text,
  p_current_note text,
  p_lifecycle_status text,
  p_metadata jsonb,
  p_actor_auth_user_id uuid,
  p_actor_member_id uuid,
  p_actor_role text
)
returns public.client_pipeline_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_item public.client_pipeline_items;
  stage_event_id uuid;
  history_event_id uuid;
  legacy_client_id text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text, 0));
  if not public.is_company_pipeline_enabled(p_company_id) then
    raise exception 'Pipeline is disabled for this company.';
  end if;
  if not exists (
    select 1
    from public.company_pipelines pipeline
    join public.company_pipeline_stages stage
      on stage.pipeline_id = pipeline.id
     and stage.company_id = pipeline.company_id
    where pipeline.id = p_pipeline_id
      and pipeline.company_id = p_company_id
      and pipeline.is_enabled = true
      and pipeline.archived_at is null
      and stage.id = p_stage_id
      and stage.is_enabled = true
      and stage.archived_at is null
  ) then
    raise exception 'Pipeline or stage is not enabled.';
  end if;

  insert into public.client_pipeline_items (
    company_id,
    client_id,
    pipeline_id,
    stage_id,
    owner_member_id,
    client_name_snapshot,
    client_business_snapshot,
    pathway_id_snapshot,
    pathway_name_snapshot,
    estimated_value_cents,
    currency_code,
    renewal_at,
    expected_close_at,
    follow_up_at,
    outcome,
    current_note,
    lifecycle_status,
    metadata
  )
  values (
    p_company_id,
    p_client_id,
    p_pipeline_id,
    p_stage_id,
    p_owner_member_id,
    p_client_name_snapshot,
    p_client_business_snapshot,
    p_pathway_id_snapshot,
    p_pathway_name_snapshot,
    p_estimated_value_cents,
    p_currency_code,
    p_renewal_at,
    p_expected_close_at,
    p_follow_up_at,
    p_outcome,
    p_current_note,
    p_lifecycle_status,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into created_item;

  legacy_client_id := coalesce(
    created_item.metadata->>'client_legacy_id',
    created_item.client_id::text
  );

  insert into public.client_pipeline_stage_events (
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
  )
  values (
    created_item.company_id,
    created_item.pipeline_id,
    created_item.id,
    created_item.stage_id,
    p_actor_auth_user_id,
    p_actor_member_id,
    'created',
    p_current_note,
    to_jsonb(created_item),
    jsonb_build_object('actor_role', p_actor_role, 'activity', 'created')
  )
  returning id into stage_event_id;

  insert into public.client_history_events (
    company_id,
    legacy_client_glide_row_id,
    actor_auth_user_id,
    actor_member_id,
    event_type,
    source,
    title,
    summary,
    next_contact_at,
    notes,
    payload
  )
  values (
    created_item.company_id,
    legacy_client_id,
    p_actor_auth_user_id,
    p_actor_member_id,
    'pipeline_activity',
    'pipeline_workspace',
    'Pipeline item created',
    created_item.client_name_snapshot || ': pipeline item created.',
    created_item.follow_up_at,
    created_item.current_note,
    jsonb_build_object(
      'pipeline_item_id', created_item.id,
      'pipeline_id', created_item.pipeline_id,
      'stage_id', created_item.stage_id,
      'activity', 'created'
    )
  )
  returning id into history_event_id;

  insert into public.app_audit_events (
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
  )
  values (
    created_item.company_id,
    p_actor_auth_user_id,
    p_actor_member_id,
    'pipeline_item_created',
    'pipeline_workspace',
    'client_pipeline_items',
    created_item.id,
    legacy_client_id,
    'Pipeline item created',
    created_item.client_name_snapshot || ': pipeline item created.',
    to_jsonb(created_item),
    jsonb_build_object(
      'pipeline_stage_event_id', stage_event_id,
      'client_history_event_id', history_event_id,
      'actor_role', p_actor_role
    )
  );

  return created_item;
end;
$$;

create or replace function public.mutate_pipeline_item_with_evidence(
  p_company_id uuid,
  p_item_id uuid,
  p_activity text,
  p_patch jsonb,
  p_actor_auth_user_id uuid,
  p_actor_member_id uuid,
  p_actor_role text,
  p_note text default null
)
returns public.client_pipeline_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_item public.client_pipeline_items;
  changed_item public.client_pipeline_items;
  stage_event_id uuid;
  history_event_id uuid;
  legacy_client_id text;
  allowed_keys text[] := array[
    'stage_id',
    'owner_member_id',
    'estimated_value_cents',
    'actual_value_cents',
    'currency_code',
    'renewal_at',
    'expected_close_at',
    'follow_up_at',
    'outcome',
    'current_note',
    'lifecycle_status',
    'archived_at'
  ];
begin
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text, 0));
  if not public.is_company_pipeline_enabled(p_company_id) then
    raise exception 'Pipeline is disabled for this company.';
  end if;
  if p_activity not in ('stage_changed', 'details_changed', 'archived') then
    raise exception 'Unsupported Pipeline activity.';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) key
    where not (key = any(allowed_keys))
  ) then
    raise exception 'Pipeline patch contains an unsupported field.';
  end if;

  select * into prior_item
  from public.client_pipeline_items
  where id = p_item_id
    and company_id = p_company_id
    and archived_at is null
  for update;
  if prior_item.id is null then
    raise exception 'Pipeline item not found.';
  end if;
  if not exists (
    select 1
    from public.company_pipelines pipeline
    join public.company_pipeline_stages stage
      on stage.pipeline_id = pipeline.id
     and stage.company_id = pipeline.company_id
    where pipeline.id = prior_item.pipeline_id
      and pipeline.company_id = prior_item.company_id
      and pipeline.is_enabled = true
      and pipeline.archived_at is null
      and stage.id = coalesce(
        nullif(p_patch->>'stage_id', '')::uuid,
        prior_item.stage_id
      )
      and stage.is_enabled = true
      and stage.archived_at is null
  ) then
    raise exception 'Pipeline or target stage is not enabled.';
  end if;

  update public.client_pipeline_items
  set
    stage_id = case when p_patch ? 'stage_id'
      then (p_patch->>'stage_id')::uuid else stage_id end,
    owner_member_id = case when p_patch ? 'owner_member_id'
      then nullif(p_patch->>'owner_member_id', '')::uuid else owner_member_id end,
    estimated_value_cents = case when p_patch ? 'estimated_value_cents'
      then nullif(p_patch->>'estimated_value_cents', '')::bigint else estimated_value_cents end,
    actual_value_cents = case when p_patch ? 'actual_value_cents'
      then nullif(p_patch->>'actual_value_cents', '')::bigint else actual_value_cents end,
    currency_code = case when p_patch ? 'currency_code'
      then p_patch->>'currency_code' else currency_code end,
    renewal_at = case when p_patch ? 'renewal_at'
      then nullif(p_patch->>'renewal_at', '')::timestamptz else renewal_at end,
    expected_close_at = case when p_patch ? 'expected_close_at'
      then nullif(p_patch->>'expected_close_at', '')::timestamptz else expected_close_at end,
    follow_up_at = case when p_patch ? 'follow_up_at'
      then nullif(p_patch->>'follow_up_at', '')::timestamptz else follow_up_at end,
    outcome = case when p_patch ? 'outcome'
      then nullif(p_patch->>'outcome', '') else outcome end,
    current_note = case when p_patch ? 'current_note'
      then nullif(p_patch->>'current_note', '') else current_note end,
    lifecycle_status = case when p_patch ? 'lifecycle_status'
      then p_patch->>'lifecycle_status' else lifecycle_status end,
    archived_at = case when p_patch ? 'archived_at'
      then nullif(p_patch->>'archived_at', '')::timestamptz else archived_at end
  where id = prior_item.id
    and company_id = prior_item.company_id
  returning * into changed_item;

  legacy_client_id := coalesce(
    changed_item.metadata->>'client_legacy_id',
    changed_item.client_id::text
  );

  insert into public.client_pipeline_stage_events (
    company_id,
    pipeline_id,
    item_id,
    from_stage_id,
    to_stage_id,
    actor_auth_user_id,
    actor_member_id,
    event_type,
    note,
    before_data,
    after_data,
    metadata
  )
  values (
    changed_item.company_id,
    changed_item.pipeline_id,
    changed_item.id,
    prior_item.stage_id,
    changed_item.stage_id,
    p_actor_auth_user_id,
    p_actor_member_id,
    p_activity,
    p_note,
    to_jsonb(prior_item),
    to_jsonb(changed_item),
    jsonb_build_object('actor_role', p_actor_role, 'activity', p_activity)
  )
  returning id into stage_event_id;

  insert into public.client_history_events (
    company_id,
    legacy_client_glide_row_id,
    actor_auth_user_id,
    actor_member_id,
    event_type,
    source,
    title,
    summary,
    next_contact_at,
    notes,
    payload
  )
  values (
    changed_item.company_id,
    legacy_client_id,
    p_actor_auth_user_id,
    p_actor_member_id,
    'pipeline_activity',
    'pipeline_workspace',
    'Pipeline ' || replace(p_activity, '_', ' '),
    changed_item.client_name_snapshot || ': ' || replace(p_activity, '_', ' ') || '.',
    changed_item.follow_up_at,
    p_note,
    jsonb_build_object(
      'pipeline_item_id', changed_item.id,
      'pipeline_id', changed_item.pipeline_id,
      'stage_id', changed_item.stage_id,
      'activity', p_activity
    )
  )
  returning id into history_event_id;

  insert into public.app_audit_events (
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
    before_data,
    after_data,
    metadata
  )
  values (
    changed_item.company_id,
    p_actor_auth_user_id,
    p_actor_member_id,
    'pipeline_item_' || p_activity,
    'pipeline_workspace',
    'client_pipeline_items',
    changed_item.id,
    legacy_client_id,
    'Pipeline ' || replace(p_activity, '_', ' '),
    changed_item.client_name_snapshot || ': ' || replace(p_activity, '_', ' ') || '.',
    to_jsonb(prior_item),
    to_jsonb(changed_item),
    jsonb_build_object(
      'pipeline_stage_event_id', stage_event_id,
      'client_history_event_id', history_event_id,
      'actor_role', p_actor_role
    )
  );

  return changed_item;
end;
$$;

revoke all on function public.create_pipeline_item_with_evidence(
  uuid, uuid, uuid, uuid, uuid, text, text, text, text, bigint, text,
  timestamptz, timestamptz, timestamptz, text, text, text, jsonb,
  uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.mutate_pipeline_item_with_evidence(
  uuid, uuid, text, jsonb, uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.create_pipeline_item_with_evidence(
  uuid, uuid, uuid, uuid, uuid, text, text, text, text, bigint, text,
  timestamptz, timestamptz, timestamptz, text, text, text, jsonb,
  uuid, uuid, text
) to service_role;
grant execute on function public.mutate_pipeline_item_with_evidence(
  uuid, uuid, text, jsonb, uuid, uuid, text, text
) to service_role;

-- Configuration writes use one service-only transaction for the canonical
-- row(s) and their audit evidence. Authorization and business-rule validation
-- remain in the Edge Function; this helper supplies the final integrity
-- boundary and intentionally exposes no execution path to browser roles.
create or replace function public.apply_pipeline_configuration_with_audit(
  p_company_id uuid,
  p_operation text,
  p_entity_id uuid,
  p_payload jsonb,
  p_actor_auth_user_id uuid,
  p_actor_member_id uuid,
  p_actor_role text,
  p_audit_event_type text,
  p_audit_title text,
  p_audit_summary text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_pipeline public.company_pipelines;
  changed_pipeline public.company_pipelines;
  prior_stage public.company_pipeline_stages;
  changed_stage public.company_pipeline_stages;
  pipeline_definition jsonb;
  stage_definition jsonb;
  created_stages jsonb;
  result_data jsonb := '[]'::jsonb;
  before_data jsonb;
  after_data jsonb;
  audit_entity_table text;
  audit_entity_id uuid;
  stage_entry record;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text, 0));

  if p_operation = 'create_starters' then
    for pipeline_definition in
      select value
      from jsonb_array_elements(coalesce(p_payload->'pipelines', '[]'::jsonb))
    loop
      insert into public.company_pipelines (
        company_id, name, pipeline_type, position, is_enabled, value_source,
        default_estimated_value_cents, currency_code, renewal_lead_days,
        default_follow_up_days, entry_rules, automation_settings, metadata
      ) values (
        p_company_id,
        pipeline_definition->>'name',
        pipeline_definition->>'pipeline_type',
        (pipeline_definition->>'position')::integer,
        coalesce((pipeline_definition->>'is_enabled')::boolean, false),
        pipeline_definition->>'value_source',
        nullif(pipeline_definition->>'default_estimated_value_cents', '')::bigint,
        pipeline_definition->>'currency_code',
        (pipeline_definition->>'renewal_lead_days')::integer,
        nullif(pipeline_definition->>'default_follow_up_days', '')::integer,
        coalesce(pipeline_definition->'entry_rules', '{}'::jsonb),
        coalesce(pipeline_definition->'automation_settings', '{}'::jsonb),
        coalesce(pipeline_definition->'metadata', '{}'::jsonb)
      ) returning * into changed_pipeline;

      created_stages := '[]'::jsonb;
      for stage_definition in
        select value
        from jsonb_array_elements(coalesce(pipeline_definition->'stages', '[]'::jsonb))
      loop
        insert into public.company_pipeline_stages (
          company_id, pipeline_id, name, color, stage_type, position,
          requires_note, is_enabled, metadata
        ) values (
          p_company_id,
          changed_pipeline.id,
          stage_definition->>'name',
          nullif(stage_definition->>'color', ''),
          stage_definition->>'stage_type',
          (stage_definition->>'position')::integer,
          coalesce((stage_definition->>'requires_note')::boolean, false),
          coalesce((stage_definition->>'is_enabled')::boolean, true),
          coalesce(stage_definition->'metadata', '{}'::jsonb)
        ) returning * into changed_stage;
        created_stages := created_stages || jsonb_build_array(to_jsonb(changed_stage));
      end loop;

      after_data := to_jsonb(changed_pipeline)
        || jsonb_build_object('stages', created_stages);
      insert into public.app_audit_events (
        company_id, actor_auth_user_id, actor_member_id, event_type, source,
        entity_table, entity_id, title, summary, after_data, metadata
      ) values (
        p_company_id, p_actor_auth_user_id, p_actor_member_id,
        'company_pipeline_starter_created', 'company_pipeline_admin',
        'company_pipelines', changed_pipeline.id, 'Pipeline starter created',
        changed_pipeline.name || ' starter was created disabled.', after_data,
        jsonb_build_object('actor_role', p_actor_role)
      );
      result_data := result_data || jsonb_build_array(after_data);
    end loop;
    return result_data;
  end if;

  if p_operation = 'reorder_pipelines' then
    if jsonb_array_length(coalesce(p_payload->'pipeline_ids', '[]'::jsonb))
        <> (
          select count(*)
          from public.company_pipelines pipeline
          where pipeline.company_id = p_company_id
            and pipeline.archived_at is null
        )
      or (
        select count(distinct value)
        from jsonb_array_elements_text(
          coalesce(p_payload->'pipeline_ids', '[]'::jsonb)
        )
      ) <> jsonb_array_length(coalesce(p_payload->'pipeline_ids', '[]'::jsonb))
      or exists (
        select 1
        from public.company_pipelines pipeline
        where pipeline.company_id = p_company_id
          and pipeline.archived_at is null
          and not exists (
            select 1
            from jsonb_array_elements_text(
              coalesce(p_payload->'pipeline_ids', '[]'::jsonb)
            ) supplied(value)
            where supplied.value::uuid = pipeline.id
          )
      ) then
      raise exception 'Pipeline reorder must include every active pipeline exactly once.';
    end if;

    select coalesce(jsonb_agg(to_jsonb(pipeline) order by pipeline.position), '[]'::jsonb)
      into before_data
    from public.company_pipelines pipeline
    where pipeline.company_id = p_company_id
      and pipeline.archived_at is null;

    for stage_entry in
      select value::uuid as pipeline_id, ordinality
      from jsonb_array_elements_text(coalesce(p_payload->'pipeline_ids', '[]'::jsonb))
        with ordinality
    loop
      update public.company_pipelines
      set position = stage_entry.ordinality * 10
      where id = stage_entry.pipeline_id
        and company_id = p_company_id
        and archived_at is null;
      if not found then
        raise exception 'Pipeline reorder target was not found.';
      end if;
    end loop;

    select coalesce(jsonb_agg(to_jsonb(pipeline) order by pipeline.position), '[]'::jsonb)
      into after_data
    from public.company_pipelines pipeline
    where pipeline.company_id = p_company_id
      and pipeline.archived_at is null;

    insert into public.app_audit_events (
      company_id, actor_auth_user_id, actor_member_id, event_type, source,
      entity_table, entity_id, title, summary, before_data, after_data, metadata
    ) values (
      p_company_id, p_actor_auth_user_id, p_actor_member_id,
      p_audit_event_type, 'company_pipeline_admin', 'company_pipelines',
      null, p_audit_title, p_audit_summary, before_data, after_data,
      jsonb_build_object('actor_role', p_actor_role)
    );
    return after_data;
  end if;

  if p_operation = 'reorder_stages' then
    if jsonb_array_length(coalesce(p_payload->'stage_ids', '[]'::jsonb))
        <> (
          select count(*)
          from public.company_pipeline_stages stage
          where stage.company_id = p_company_id
            and stage.pipeline_id = p_entity_id
            and stage.is_enabled = true
            and stage.archived_at is null
        )
      or (
        select count(distinct value)
        from jsonb_array_elements_text(
          coalesce(p_payload->'stage_ids', '[]'::jsonb)
        )
      ) <> jsonb_array_length(coalesce(p_payload->'stage_ids', '[]'::jsonb))
      or exists (
        select 1
        from public.company_pipeline_stages stage
        where stage.company_id = p_company_id
          and stage.pipeline_id = p_entity_id
          and stage.is_enabled = true
          and stage.archived_at is null
          and not exists (
            select 1
            from jsonb_array_elements_text(
              coalesce(p_payload->'stage_ids', '[]'::jsonb)
            ) supplied(value)
            where supplied.value::uuid = stage.id
          )
      ) then
      raise exception 'Stage reorder must include every active stage exactly once.';
    end if;

    select coalesce(jsonb_agg(to_jsonb(stage) order by stage.position), '[]'::jsonb)
      into before_data
    from public.company_pipeline_stages stage
    where stage.company_id = p_company_id
      and stage.pipeline_id = p_entity_id
      and stage.is_enabled = true
      and stage.archived_at is null;

    for stage_entry in
      select value::uuid as stage_id, ordinality
      from jsonb_array_elements_text(coalesce(p_payload->'stage_ids', '[]'::jsonb))
        with ordinality
    loop
      update public.company_pipeline_stages
      set position = stage_entry.ordinality * 10
      where id = stage_entry.stage_id
        and company_id = p_company_id
        and pipeline_id = p_entity_id
        and is_enabled = true
        and archived_at is null;
      if not found then
        raise exception 'Pipeline stage reorder target was not found.';
      end if;
    end loop;

    select coalesce(jsonb_agg(to_jsonb(stage) order by stage.position), '[]'::jsonb)
      into after_data
    from public.company_pipeline_stages stage
    where stage.company_id = p_company_id
      and stage.pipeline_id = p_entity_id
      and stage.is_enabled = true
      and stage.archived_at is null;

    insert into public.app_audit_events (
      company_id, actor_auth_user_id, actor_member_id, event_type, source,
      entity_table, entity_id, title, summary, before_data, after_data, metadata
    ) values (
      p_company_id, p_actor_auth_user_id, p_actor_member_id,
      p_audit_event_type, 'company_pipeline_admin', 'company_pipeline_stages',
      p_entity_id, p_audit_title, p_audit_summary, before_data, after_data,
      jsonb_build_object('actor_role', p_actor_role)
    );
    return after_data;
  end if;

  if p_operation = 'create_pipeline' then
    insert into public.company_pipelines (
      company_id, name, pipeline_type, position, is_enabled, value_source,
      default_estimated_value_cents, currency_code, renewal_lead_days,
      default_follow_up_days, entry_rules, automation_settings, metadata
    ) values (
      p_company_id, p_payload->>'name', p_payload->>'pipeline_type',
      (p_payload->>'position')::integer,
      coalesce((p_payload->>'is_enabled')::boolean, false),
      p_payload->>'value_source',
      nullif(p_payload->>'default_estimated_value_cents', '')::bigint,
      p_payload->>'currency_code', (p_payload->>'renewal_lead_days')::integer,
      nullif(p_payload->>'default_follow_up_days', '')::integer,
      coalesce(p_payload->'entry_rules', '{}'::jsonb),
      coalesce(p_payload->'automation_settings', '{}'::jsonb),
      coalesce(p_payload->'metadata', '{}'::jsonb)
    ) returning * into changed_pipeline;
    after_data := to_jsonb(changed_pipeline);
    audit_entity_table := 'company_pipelines';
    audit_entity_id := changed_pipeline.id;
  elsif p_operation in ('update_pipeline', 'archive_pipeline') then
    select * into prior_pipeline
    from public.company_pipelines
    where id = p_entity_id and company_id = p_company_id
    for update;
    if prior_pipeline.id is null then raise exception 'Pipeline not found.'; end if;
    if prior_pipeline.archived_at is not null then
      raise exception 'Pipeline is archived.';
    end if;
    if p_operation = 'archive_pipeline' and exists (
      select 1
      from public.client_pipeline_items item
      where item.company_id = p_company_id
        and item.pipeline_id = prior_pipeline.id
        and item.archived_at is null
    ) then
      raise exception 'Archive all pipeline items before archiving this pipeline.';
    end if;
    if p_payload ? 'pipeline_type'
      and p_payload->>'pipeline_type' is distinct from prior_pipeline.pipeline_type
      and exists (
        select 1
        from public.client_pipeline_items item
        where item.company_id = p_company_id
          and item.pipeline_id = prior_pipeline.id
          and item.archived_at is null
      ) then
      raise exception 'Archive all pipeline items before changing pipeline type.';
    end if;
    if p_payload ? 'is_enabled'
      and (p_payload->>'is_enabled')::boolean = true
      and (
        (
          select count(*)
          from public.company_pipeline_stages stage
          where stage.company_id = p_company_id
            and stage.pipeline_id = prior_pipeline.id
            and stage.is_enabled = true
            and stage.archived_at is null
            and stage.stage_type = 'open'
        ) < 1
        or (
          select count(*)
          from public.company_pipeline_stages stage
          where stage.company_id = p_company_id
            and stage.pipeline_id = prior_pipeline.id
            and stage.is_enabled = true
            and stage.archived_at is null
            and stage.stage_type = 'won'
        ) <> 1
        or (
          select count(*)
          from public.company_pipeline_stages stage
          where stage.company_id = p_company_id
            and stage.pipeline_id = prior_pipeline.id
            and stage.is_enabled = true
            and stage.archived_at is null
            and stage.stage_type = 'lost'
        ) <> 1
      ) then
      raise exception 'An enabled pipeline requires open, Won, and Lost stages.';
    end if;
    update public.company_pipelines
    set
      name = case when p_payload ? 'name' then p_payload->>'name' else name end,
      pipeline_type = case when p_payload ? 'pipeline_type' then p_payload->>'pipeline_type' else pipeline_type end,
      position = case when p_payload ? 'position' then (p_payload->>'position')::integer else position end,
      is_enabled = case when p_payload ? 'is_enabled' then (p_payload->>'is_enabled')::boolean else is_enabled end,
      value_source = case when p_payload ? 'value_source' then p_payload->>'value_source' else value_source end,
      default_estimated_value_cents = case when p_payload ? 'default_estimated_value_cents' then nullif(p_payload->>'default_estimated_value_cents', '')::bigint else default_estimated_value_cents end,
      currency_code = case when p_payload ? 'currency_code' then p_payload->>'currency_code' else currency_code end,
      renewal_lead_days = case when p_payload ? 'renewal_lead_days' then (p_payload->>'renewal_lead_days')::integer else renewal_lead_days end,
      default_follow_up_days = case when p_payload ? 'default_follow_up_days' then nullif(p_payload->>'default_follow_up_days', '')::integer else default_follow_up_days end,
      entry_rules = case when p_payload ? 'entry_rules' then p_payload->'entry_rules' else entry_rules end,
      automation_settings = case when p_payload ? 'automation_settings' then p_payload->'automation_settings' else automation_settings end,
      archived_at = case when p_payload ? 'archived_at' then nullif(p_payload->>'archived_at', '')::timestamptz else archived_at end
    where id = prior_pipeline.id and company_id = prior_pipeline.company_id
    returning * into changed_pipeline;
    before_data := to_jsonb(prior_pipeline);
    after_data := to_jsonb(changed_pipeline);
    audit_entity_table := 'company_pipelines';
    audit_entity_id := changed_pipeline.id;
  elsif p_operation = 'create_stage' then
    if not exists (
      select 1
      from public.company_pipelines pipeline
      where pipeline.id = (p_payload->>'pipeline_id')::uuid
        and pipeline.company_id = p_company_id
        and pipeline.archived_at is null
    ) then
      raise exception 'Pipeline is archived or missing.';
    end if;
    insert into public.company_pipeline_stages (
      company_id, pipeline_id, name, color, stage_type, position,
      requires_note, is_enabled, metadata
    ) values (
      p_company_id, (p_payload->>'pipeline_id')::uuid, p_payload->>'name',
      nullif(p_payload->>'color', ''), p_payload->>'stage_type',
      (p_payload->>'position')::integer,
      coalesce((p_payload->>'requires_note')::boolean, false),
      coalesce((p_payload->>'is_enabled')::boolean, true),
      coalesce(p_payload->'metadata', '{}'::jsonb)
    ) returning * into changed_stage;
    after_data := to_jsonb(changed_stage);
    audit_entity_table := 'company_pipeline_stages';
    audit_entity_id := changed_stage.id;
  elsif p_operation in ('update_stage', 'archive_stage') then
    select * into prior_stage
    from public.company_pipeline_stages
    where id = p_entity_id and company_id = p_company_id
    for update;
    if prior_stage.id is null then raise exception 'Pipeline stage not found.'; end if;
    if prior_stage.archived_at is not null then
      raise exception 'Pipeline stage is archived.';
    end if;
    if p_operation = 'archive_stage' then
      if prior_stage.stage_type in ('won', 'lost') then
        raise exception 'Won and Lost terminal stages cannot be archived.';
      end if;
      if exists (
        select 1
        from public.client_pipeline_items item
        where item.company_id = p_company_id
          and item.stage_id = prior_stage.id
          and item.archived_at is null
      ) then
        raise exception 'Move or archive stage items before archiving this stage.';
      end if;
      if prior_stage.stage_type = 'open'
        and exists (
          select 1
          from public.company_pipelines pipeline
          where pipeline.id = prior_stage.pipeline_id
            and pipeline.company_id = p_company_id
            and pipeline.is_enabled = true
            and pipeline.archived_at is null
        )
        and (
          select count(*)
          from public.company_pipeline_stages stage
          where stage.company_id = p_company_id
            and stage.pipeline_id = prior_stage.pipeline_id
            and stage.stage_type = 'open'
            and stage.is_enabled = true
            and stage.archived_at is null
        ) <= 1 then
        raise exception 'An enabled pipeline must keep at least one open stage.';
      end if;
    end if;
    if p_payload ? 'stage_type'
      and p_payload->>'stage_type' is distinct from prior_stage.stage_type then
      if prior_stage.stage_type in ('won', 'lost') then
        raise exception 'Won and Lost terminal stages cannot change type.';
      end if;
      if exists (
        select 1
        from public.client_pipeline_items item
        where item.company_id = p_company_id
          and item.stage_id = prior_stage.id
          and item.archived_at is null
      ) then
        raise exception 'Move or archive stage items before changing stage type.';
      end if;
      if prior_stage.stage_type = 'open'
        and exists (
          select 1
          from public.company_pipelines pipeline
          where pipeline.id = prior_stage.pipeline_id
            and pipeline.company_id = p_company_id
            and pipeline.is_enabled = true
            and pipeline.archived_at is null
        )
        and (
          select count(*)
          from public.company_pipeline_stages stage
          where stage.company_id = p_company_id
            and stage.pipeline_id = prior_stage.pipeline_id
            and stage.stage_type = 'open'
            and stage.is_enabled = true
            and stage.archived_at is null
        ) <= 1 then
        raise exception 'An enabled pipeline must keep at least one open stage.';
      end if;
    end if;
    update public.company_pipeline_stages
    set
      name = case when p_payload ? 'name' then p_payload->>'name' else name end,
      color = case when p_payload ? 'color' then nullif(p_payload->>'color', '') else color end,
      stage_type = case when p_payload ? 'stage_type' then p_payload->>'stage_type' else stage_type end,
      position = case when p_payload ? 'position' then (p_payload->>'position')::integer else position end,
      requires_note = case when p_payload ? 'requires_note' then (p_payload->>'requires_note')::boolean else requires_note end,
      is_enabled = case when p_payload ? 'is_enabled' then (p_payload->>'is_enabled')::boolean else is_enabled end,
      archived_at = case when p_payload ? 'archived_at' then nullif(p_payload->>'archived_at', '')::timestamptz else archived_at end
    where id = prior_stage.id and company_id = prior_stage.company_id
    returning * into changed_stage;
    before_data := to_jsonb(prior_stage);
    after_data := to_jsonb(changed_stage);
    audit_entity_table := 'company_pipeline_stages';
    audit_entity_id := changed_stage.id;
  else
    raise exception 'Unsupported Pipeline configuration operation.';
  end if;

  insert into public.app_audit_events (
    company_id, actor_auth_user_id, actor_member_id, event_type, source,
    entity_table, entity_id, title, summary, before_data, after_data, metadata
  ) values (
    p_company_id, p_actor_auth_user_id, p_actor_member_id,
    p_audit_event_type, 'company_pipeline_admin', audit_entity_table,
    audit_entity_id, p_audit_title, p_audit_summary, before_data, after_data,
    jsonb_build_object('actor_role', p_actor_role)
  );
  return after_data;
end;
$$;

create or replace function public.update_company_pipeline_gates_with_audit(
  p_company_id uuid,
  p_enable_pipeline boolean,
  p_enable_pipeline_viewer_access boolean,
  p_actor_auth_user_id uuid,
  p_actor_member_id uuid,
  p_actor_role text
)
returns public.company_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_settings public.company_settings;
  changed_settings public.company_settings;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text, 0));

  select * into prior_settings
  from public.company_settings
  where company_id = p_company_id
  for update;
  if prior_settings.id is null then
    raise exception 'Company settings were not found.';
  end if;

  update public.company_settings
  set
    enable_pipeline = p_enable_pipeline,
    enable_pipeline_viewer_access = p_enable_pipeline
      and p_enable_pipeline_viewer_access
  where id = prior_settings.id and company_id = p_company_id
  returning * into changed_settings;

  insert into public.app_audit_events (
    company_id, actor_auth_user_id, actor_member_id, event_type, source,
    entity_table, entity_id, title, summary, before_data, after_data, metadata
  ) values (
    p_company_id, p_actor_auth_user_id, p_actor_member_id,
    'company_pipeline_gates_updated', 'company_pipeline_admin',
    'company_settings', changed_settings.id, 'Pipeline access updated',
    'Pipeline company access gates were updated.',
    jsonb_build_object(
      'enable_pipeline', prior_settings.enable_pipeline,
      'enable_pipeline_viewer_access', prior_settings.enable_pipeline_viewer_access
    ),
    jsonb_build_object(
      'enable_pipeline', changed_settings.enable_pipeline,
      'enable_pipeline_viewer_access', changed_settings.enable_pipeline_viewer_access
    ),
    jsonb_build_object('actor_role', p_actor_role)
  );
  return changed_settings;
end;
$$;

revoke all on function public.apply_pipeline_configuration_with_audit(
  uuid, text, uuid, jsonb, uuid, uuid, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.update_company_pipeline_gates_with_audit(
  uuid, boolean, boolean, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.apply_pipeline_configuration_with_audit(
  uuid, text, uuid, jsonb, uuid, uuid, text, text, text, text
) to service_role;
grant execute on function public.update_company_pipeline_gates_with_audit(
  uuid, boolean, boolean, uuid, uuid, text
) to service_role;

notify pgrst, 'reload schema';
