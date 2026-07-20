-- Before the Contract Type control was removed on 2026-07-08, selecting
-- "Renewal" classified the contract but did not always create the separate
-- retention event used by Dashboard reporting. Repair the three verified,
-- already-started Moves Method renewals from that path. The future-dated
-- contract is intentionally excluded until its actual start date.
do $$
declare
  inserted_count integer;
begin
  with target_contracts as (
    select
      contract.*,
      client.client_name,
      client.program_status_value
    from public.client_contracts contract
    join public.clients client
      on client.company_id = contract.company_id
     and client.glide_row_id = contract.client_id
    where contract.company_id = '21586391-9a84-4072-9ae6-20436b27bea9'::uuid
      and contract.client_id in (
        'rUPQEixrQCmE3VRFa2vl7w',
        's2-J-6L6S7Ky6diRirgObQ',
        'apI0gwR4RZyDg9.m5Ko5Cw'
      )
      and contract.archived_at is null
      and coalesce(contract.status, '') <> 'archived'
      and contract.metadata ->> 'contract_type' = 'renewal'
      and contract.start_date <= now()
  ),
  inserted_events as (
    insert into public.client_history_events (
      company_id,
      legacy_client_glide_row_id,
      actor_auth_user_id,
      actor_member_id,
      event_type,
      source,
      title,
      summary,
      payload,
      created_at
    )
    select
      contract.company_id,
      contract.client_id,
      contract_event.actor_auth_user_id,
      contract_event.actor_member_id,
      'client_retention_recorded',
      'contract_create',
      'Client retained via renewal',
      concat(
        'Backfilled from the original Renewal contract. New renewal date: ',
        coalesce(to_char(contract.end_date at time zone 'UTC', 'YYYY-MM-DD'), 'not set'),
        '.'
      ),
      jsonb_build_object(
        'actor_role', contract_event.payload ->> 'actor_role',
        'retention_type', 'renewal',
        'retention_date', contract.start_date,
        'from_status', null,
        'to_status', contract.program_status_value,
        'backfilled_from_contract_type', true,
        'backfill_reason', 'legacy_contract_type_missing_retention_event',
        'contract', jsonb_build_object(
          'id', contract.id,
          'glide_row_id', contract.glide_row_id,
          'start_date', contract.start_date,
          'end_date', contract.end_date,
          'contract_days', contract.contract_days
        )
      ),
      contract.created_at
    from target_contracts contract
    left join lateral (
      select event.actor_auth_user_id, event.actor_member_id, event.payload
      from public.client_history_events event
      where event.company_id = contract.company_id
        and event.legacy_client_glide_row_id = contract.client_id
        and event.event_type = 'contract_created'
        and event.payload -> 'contract' ->> 'id' = contract.id::text
      order by event.created_at desc
      limit 1
    ) contract_event on true
    where not exists (
      select 1
      from public.client_history_events event
      where event.company_id = contract.company_id
        and event.legacy_client_glide_row_id = contract.client_id
        and event.event_type = 'client_retention_recorded'
        and event.payload -> 'contract' ->> 'id' = contract.id::text
    )
    returning id
  )
  select count(*) into inserted_count from inserted_events;

  if inserted_count <> 3 then
    raise exception
      'Expected to backfill 3 verified Moves Method renewal events, inserted %',
      inserted_count;
  end if;
end;
$$;
