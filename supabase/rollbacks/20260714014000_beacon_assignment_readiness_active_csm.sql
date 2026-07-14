-- Restore the original conservative all-assignment readiness calculation.

do $$
begin
  if exists (
    select 1
    from public.security_rollout_history rollout
    where rollout.version > '20260714014000'
      and (
        rollout.migration_name like 'beacon_%'
        or rollout.migration_name like 'ai_feature_%'
      )
  ) then
    raise exception 'Roll back later Beacon/AI slices before assignment readiness';
  end if;
end $$;

delete from public.security_rollout_history
where version = '20260714014000';

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

revoke all on function public.beacon_assignment_ledger_readiness(uuid)
  from public, anon, authenticated;
grant execute on function public.beacon_assignment_ledger_readiness(uuid)
  to service_role;

notify pgrst, 'reload schema';
