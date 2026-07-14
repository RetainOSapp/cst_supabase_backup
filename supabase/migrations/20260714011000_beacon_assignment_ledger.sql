-- Beacon CSM ever-assigned authorization ledger.
--
-- Only assignments that resolve exactly to an app-owned CSM by the canonical
-- company_members.legacy_glide_row_id are verified. This migration seeds only
-- the currently observable assignments; it does not invent older history.

create table if not exists public.client_assignment_intervals (
  id uuid primary key default gen_random_uuid(),
  proof_key uuid not null default gen_random_uuid(),
  revision integer not null default 1
    check (revision > 0),
  company_id uuid not null references public.companies(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  member_id uuid not null references public.company_members(id) on delete restrict,
  assignment_kind text not null
    check (assignment_kind in ('primary', 'secondary')),
  assertion_status text not null default 'verified'
    check (assertion_status in ('verified', 'invalidated')),
  granted_at timestamptz not null,
  revoked_at timestamptz,
  source text not null
    check (source in ('current_state_seed', 'clients_assignment_trigger', 'verified_correction')),
  source_client_assignment_value text not null
    check (length(source_client_assignment_value) between 1 and 256),
  supersedes_interval_id uuid references public.client_assignment_intervals(id) on delete restrict,
  recorded_by_auth_user_id uuid references auth.users(id) on delete set null,
  verification_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (proof_key, revision),
  check (revoked_at is null or revoked_at >= granted_at),
  check ((revision = 1) = (supersedes_interval_id is null)),
  check (jsonb_typeof(verification_metadata) = 'object'),
  check (pg_column_size(verification_metadata) <= 2048)
);

comment on table public.client_assignment_intervals is
  'Append-only, revision-chained evidence for the approved Beacon ever-assigned CSM policy.';
comment on column public.client_assignment_intervals.source_client_assignment_value is
  'Canonical legacy member ID observed in the clients assignment column; service-only.';
comment on column public.client_assignment_intervals.verification_metadata is
  'Bounded provenance facts only. Do not store customer content or inferred historical assignments.';

create index if not exists client_assignment_intervals_authorization_idx
  on public.client_assignment_intervals (company_id, member_id, client_id, created_at desc)
  where assertion_status = 'verified';

create index if not exists client_assignment_intervals_latest_revision_idx
  on public.client_assignment_intervals (proof_key, revision desc);

create index if not exists client_assignment_intervals_current_slot_idx
  on public.client_assignment_intervals (
    company_id,
    client_id,
    assignment_kind,
    created_at desc
  );

drop trigger if exists client_assignment_intervals_append_only
  on public.client_assignment_intervals;
create trigger client_assignment_intervals_append_only
before update or delete on public.client_assignment_intervals
for each row execute function public.ai_feature_reject_append_only_mutation();

create or replace function public.beacon_validate_assignment_interval_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_company_id uuid;
  v_member_company_id uuid;
  v_member_role text;
  v_previous public.client_assignment_intervals%rowtype;
begin
  select client.company_id
  into v_client_company_id
  from public.clients client
  where client.id = new.client_id;

  select member.company_id, member.role
  into v_member_company_id, v_member_role
  from public.company_members member
  where member.id = new.member_id;

  if v_client_company_id is null
    or v_member_company_id is null
    or v_client_company_id <> new.company_id
    or v_member_company_id <> new.company_id
    or v_member_role <> 'csm' then
    raise exception using
      errcode = '23514',
      message = 'Assignment evidence must bind a same-company client and member';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    new.company_id::text || ':' || new.client_id::text || ':'
      || new.member_id::text || ':' || new.assignment_kind,
    0
  ));

  if new.source = 'verified_correction'
    and (
      new.recorded_by_auth_user_id is null
      or not exists (
        select 1
        from public.retainos_super_admins admin
        where admin.auth_user_id = new.recorded_by_auth_user_id
          and admin.status = 'active'
      )
      or not (new.verification_metadata ? 'review_reason')
      or jsonb_typeof(new.verification_metadata -> 'review_reason') <> 'string'
      or length(btrim(new.verification_metadata ->> 'review_reason')) not between 1 and 500
    ) then
    raise exception using
      errcode = '23514',
      message = 'Verified corrections require a bound active SuperAdmin and bounded review reason';
  end if;

  if new.revision = 1
    and new.assertion_status = 'verified'
    and new.revoked_at is null
    and exists (
      select 1
      from public.client_assignment_intervals existing
      where existing.company_id = new.company_id
        and existing.client_id = new.client_id
        and existing.member_id = new.member_id
        and existing.assignment_kind = new.assignment_kind
        and existing.assertion_status = 'verified'
        and existing.revoked_at is null
        and not exists (
          select 1
          from public.client_assignment_intervals newer
          where newer.proof_key = existing.proof_key
            and newer.revision > existing.revision
        )
    ) then
    raise exception using
      errcode = '23505',
      message = 'An open verified assignment proof already exists for this slot';
  end if;

  if new.revision > 1 then
    select interval_row.*
    into strict v_previous
    from public.client_assignment_intervals interval_row
    where interval_row.id = new.supersedes_interval_id;

    if v_previous.proof_key <> new.proof_key
      or v_previous.revision + 1 <> new.revision
      or v_previous.company_id <> new.company_id
      or v_previous.client_id <> new.client_id
      or v_previous.member_id <> new.member_id
      or v_previous.assignment_kind <> new.assignment_kind
      or v_previous.granted_at <> new.granted_at then
      raise exception using
        errcode = '23514',
        message = 'Assignment revision identity does not match the superseded evidence';
    end if;

    if exists (
      select 1
      from public.client_assignment_intervals newer
      where newer.proof_key = new.proof_key
        and newer.revision >= new.revision
    ) then
      raise exception using
        errcode = '23505',
        message = 'Assignment evidence revision already exists';
    end if;
  end if;

  return new;
exception
  when no_data_found then
    raise exception using
      errcode = '23514',
      message = 'Superseded assignment evidence does not exist';
  when too_many_rows then
    raise exception using
      errcode = '23514',
      message = 'Superseded assignment evidence is ambiguous';
end;
$$;

drop trigger if exists client_assignment_intervals_validate_insert
  on public.client_assignment_intervals;
create trigger client_assignment_intervals_validate_insert
before insert on public.client_assignment_intervals
for each row execute function public.beacon_validate_assignment_interval_insert();

create or replace function public.beacon_forbid_client_company_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.company_id is distinct from old.company_id then
    raise exception using
      errcode = '55000',
      message = 'clients.company_id is immutable; migrate the client through a reviewed workflow';
  end if;
  return new;
end;
$$;

drop trigger if exists clients_forbid_company_change
  on public.clients;
create trigger clients_forbid_company_change
before update of company_id on public.clients
for each row execute function public.beacon_forbid_client_company_change();

create or replace function public.beacon_capture_client_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_old_value text;
  v_new_value text;
  v_old_company_id uuid;
  v_new_company_id uuid;
  v_old_member_id uuid;
  v_new_member_id uuid;
  v_match_count integer;
  v_open public.client_assignment_intervals%rowtype;
  v_now timestamptz := statement_timestamp();
begin
  for v_kind in
    select kind
    from (values ('primary'::text), ('secondary'::text)) slots(kind)
  loop
    if tg_op = 'INSERT' then
      v_old_value := null;
      v_old_company_id := null;
    else
      v_old_value := nullif(btrim(case
        when v_kind = 'primary' then old.csm_team_member_id
        else old.csm_secondary_assignee_id
      end), '');
      v_old_company_id := old.company_id;
    end if;

    v_new_value := nullif(btrim(case
      when v_kind = 'primary' then new.csm_team_member_id
      else new.csm_secondary_assignee_id
    end), '');
    v_new_company_id := new.company_id;

    if tg_op <> 'INSERT'
      and v_old_company_id is not distinct from v_new_company_id
      and v_old_value is not distinct from v_new_value then
      continue;
    end if;

    v_old_member_id := null;
    if v_old_value is not null then
      select count(*), (array_agg(member.id order by member.id))[1]
      into v_match_count, v_old_member_id
      from public.company_members member
      where member.company_id = v_old_company_id
        and member.role = 'csm'
        and member.legacy_glide_row_id = v_old_value;

      if v_match_count = 1 then
        for v_open in
        select interval_row.*
        from public.client_assignment_intervals interval_row
        where interval_row.company_id = v_old_company_id
          and interval_row.client_id = old.id
          and interval_row.member_id = v_old_member_id
          and interval_row.assignment_kind = v_kind
          and interval_row.assertion_status = 'verified'
          and interval_row.revoked_at is null
          and not exists (
            select 1
            from public.client_assignment_intervals newer
            where newer.proof_key = interval_row.proof_key
              and newer.revision > interval_row.revision
          )
        order by interval_row.created_at, interval_row.id
        loop
          insert into public.client_assignment_intervals (
            proof_key,
            revision,
            company_id,
            client_id,
            member_id,
            assignment_kind,
            assertion_status,
            granted_at,
            revoked_at,
            source,
            source_client_assignment_value,
            supersedes_interval_id,
            verification_metadata
          )
          values (
            v_open.proof_key,
            v_open.revision + 1,
            v_open.company_id,
            v_open.client_id,
            v_open.member_id,
            v_open.assignment_kind,
            'verified',
            v_open.granted_at,
            v_now,
            'clients_assignment_trigger',
            v_old_value,
            v_open.id,
            jsonb_build_object('event', 'assignment_removed')
          );
        end loop;
      end if;
    end if;

    v_new_member_id := null;
    if v_new_value is not null then
      select count(*), (array_agg(member.id order by member.id))[1]
      into v_match_count, v_new_member_id
      from public.company_members member
      where member.company_id = v_new_company_id
        and member.role = 'csm'
        and member.status = 'active'
        and member.archived_at is null
        and member.legacy_glide_row_id = v_new_value;

      if v_match_count = 1
        and not exists (
          select 1
          from public.client_assignment_intervals interval_row
          where interval_row.company_id = v_new_company_id
            and interval_row.client_id = new.id
            and interval_row.member_id = v_new_member_id
            and interval_row.assignment_kind = v_kind
            and interval_row.assertion_status = 'verified'
            and interval_row.revoked_at is null
            and not exists (
              select 1
              from public.client_assignment_intervals newer
              where newer.proof_key = interval_row.proof_key
                and newer.revision > interval_row.revision
            )
        ) then
        insert into public.client_assignment_intervals (
          company_id,
          client_id,
          member_id,
          assignment_kind,
          assertion_status,
          granted_at,
          source,
          source_client_assignment_value,
          verification_metadata
        )
        values (
          v_new_company_id,
          new.id,
          v_new_member_id,
          v_kind,
          'verified',
          v_now,
          'clients_assignment_trigger',
          v_new_value,
          jsonb_build_object('event', 'assignment_added')
        );
      end if;
    end if;
  end loop;

  return new;
end;
$$;

-- Seed only assignment values that currently map to exactly one active,
-- non-archived app-owned CSM in the same company. There is deliberately no
-- attempt to infer any assignment that predates the current clients row.
with assignment_slots as (
  select
    client.company_id,
    client.id as client_id,
    'primary'::text as assignment_kind,
    nullif(btrim(client.csm_team_member_id), '') as assignment_value
  from public.clients client
  where client.archived_at is null

  union all

  select
    client.company_id,
    client.id,
    'secondary'::text,
    nullif(btrim(client.csm_secondary_assignee_id), '')
  from public.clients client
  where client.archived_at is null
),
verified_slots as (
  select
    slot.company_id,
    slot.client_id,
    slot.assignment_kind,
    slot.assignment_value,
    (array_agg(member.id order by member.id))[1] as member_id
  from assignment_slots slot
  join public.company_members member
    on member.company_id = slot.company_id
   and member.role = 'csm'
   and member.status = 'active'
   and member.archived_at is null
   and member.legacy_glide_row_id = slot.assignment_value
  where slot.assignment_value is not null
  group by
    slot.company_id,
    slot.client_id,
    slot.assignment_kind,
    slot.assignment_value
  having count(*) = 1
)
insert into public.client_assignment_intervals (
  company_id,
  client_id,
  member_id,
  assignment_kind,
  assertion_status,
  granted_at,
  source,
  source_client_assignment_value,
  verification_metadata
)
select
  slot.company_id,
  slot.client_id,
  slot.member_id,
  slot.assignment_kind,
  'verified',
  statement_timestamp(),
  'current_state_seed',
  slot.assignment_value,
  jsonb_build_object('scope', 'current_assignment_only')
from verified_slots slot
where not exists (
  select 1
  from public.client_assignment_intervals existing
  where existing.company_id = slot.company_id
    and existing.client_id = slot.client_id
    and existing.member_id = slot.member_id
    and existing.assignment_kind = slot.assignment_kind
    and existing.assertion_status = 'verified'
    and existing.revoked_at is null
    and not exists (
      select 1
      from public.client_assignment_intervals newer
      where newer.proof_key = existing.proof_key
        and newer.revision > existing.revision
    )
);

drop trigger if exists clients_capture_beacon_assignment
  on public.clients;
drop trigger if exists clients_capture_beacon_assignment_insert
  on public.clients;
create trigger clients_capture_beacon_assignment_insert
after insert
on public.clients
for each row execute function public.beacon_capture_client_assignment_change();

drop trigger if exists clients_capture_beacon_assignment_update
  on public.clients;
create trigger clients_capture_beacon_assignment_update
after update of csm_team_member_id, csm_secondary_assignee_id
on public.clients
for each row execute function public.beacon_capture_client_assignment_change();

create or replace function public.beacon_assignment_ledger_readiness(
  p_company_id uuid default null
)
returns table (
  company_id uuid,
  assigned_values bigint,
  resolvable_values bigint,
  verified_open_values bigint,
  unresolved_values bigint,
  ledger_ready boolean,
  coverage_mode text,
  coverage_started_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with assignment_slots as (
    select
      company.id as company_id,
      client.id as client_id,
      'primary'::text as assignment_kind,
      nullif(btrim(client.csm_team_member_id), '') as assignment_value
    from public.companies company
    left join public.clients client
      on client.company_id = company.id
     and client.archived_at is null
    where (p_company_id is null or company.id = p_company_id)

    union all

    select
      company.id,
      client.id,
      'secondary'::text,
      nullif(btrim(client.csm_secondary_assignee_id), '')
    from public.companies company
    left join public.clients client
      on client.company_id = company.id
     and client.archived_at is null
    where (p_company_id is null or company.id = p_company_id)
  ),
  slot_resolution as (
    select
      slot.company_id,
      slot.client_id,
      slot.assignment_kind,
      slot.assignment_value,
      count(member.id) as member_matches,
      (array_agg(member.id order by member.id))[1] as member_id
    from assignment_slots slot
    left join public.company_members member
      on member.company_id = slot.company_id
     and member.role = 'csm'
     and member.status = 'active'
     and member.archived_at is null
     and member.legacy_glide_row_id = slot.assignment_value
    group by
      slot.company_id,
      slot.client_id,
      slot.assignment_kind,
      slot.assignment_value
  ),
  checked as (
    select
      slot.*,
      exists (
        select 1
        from public.client_assignment_intervals interval_row
        where interval_row.company_id = slot.company_id
          and interval_row.client_id = slot.client_id
          and interval_row.member_id = slot.member_id
          and interval_row.assignment_kind = slot.assignment_kind
          and interval_row.assertion_status = 'verified'
          and interval_row.revoked_at is null
          and not exists (
            select 1
            from public.client_assignment_intervals newer
            where newer.proof_key = interval_row.proof_key
              and newer.revision > interval_row.revision
          )
      ) as verified_open
    from slot_resolution slot
  )
  select
    checked.company_id,
    count(*) filter (where checked.assignment_value is not null) as assigned_values,
    count(*) filter (
      where checked.assignment_value is not null
        and checked.member_matches = 1
    ) as resolvable_values,
    count(*) filter (
      where checked.assignment_value is not null
        and checked.member_matches = 1
        and checked.verified_open
    ) as verified_open_values,
    count(*) filter (
      where checked.assignment_value is not null
        and (checked.member_matches <> 1 or not checked.verified_open)
    ) as unresolved_values,
    count(*) filter (
      where checked.assignment_value is not null
        and (checked.member_matches <> 1 or not checked.verified_open)
    ) = 0 as ledger_ready,
    'current_at_cutover_plus_forward_and_verified_corrections'::text as coverage_mode,
    (
      select rollout.applied_at
      from public.security_rollout_history rollout
      where rollout.version = '20260714011000'
    ) as coverage_started_at
  from checked
  group by checked.company_id;
$$;

alter table public.client_assignment_intervals enable row level security;

revoke all on table public.client_assignment_intervals
  from public, anon, authenticated;
grant select, insert on table public.client_assignment_intervals
  to service_role;

revoke all on function public.beacon_capture_client_assignment_change()
  from public, anon, authenticated, service_role;
revoke all on function public.beacon_validate_assignment_interval_insert()
  from public, anon, authenticated, service_role;
revoke all on function public.beacon_forbid_client_company_change()
  from public, anon, authenticated, service_role;
revoke all on function public.beacon_assignment_ledger_readiness(uuid)
  from public, anon, authenticated;
grant execute on function public.beacon_assignment_ledger_readiness(uuid)
  to service_role;

insert into public.security_rollout_history (
  version,
  migration_name,
  details
)
select
  '20260714011000',
  'beacon_assignment_ledger',
  jsonb_build_object(
    'scope', 'current_seed_and_future_assignment_tracking',
    'historical_inference', false,
    'coverage_mode', 'current_at_cutover_plus_forward_and_verified_corrections',
    'coverage_started_at', statement_timestamp(),
    'assigned_values', coalesce(sum(readiness.assigned_values), 0),
    'verified_open_values', coalesce(sum(readiness.verified_open_values), 0),
    'unresolved_values', coalesce(sum(readiness.unresolved_values), 0),
    'ledger_ready', coalesce(bool_and(readiness.ledger_ready), true)
  )
from public.beacon_assignment_ledger_readiness(null) readiness
on conflict (version) do nothing;

notify pgrst, 'reload schema';
