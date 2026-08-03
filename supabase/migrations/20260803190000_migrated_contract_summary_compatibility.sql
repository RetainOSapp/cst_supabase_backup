-- Migrated current-summary rows are live current-contract evidence, not
-- historical rows. Treat them as eligible when refreshing a client's summary
-- so editing one cannot clear the summary that Dashboard and Client Detail use.

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
    and lower(coalesce(contract.status, 'active')) in ('active', 'current_summary')
    and lower(
      coalesce(
        contract.contract_type,
        contract.metadata->>'contract_type',
        'standard'
      )
    ) <> 'add_on'
    and (contract.start_date is null or contract.start_date <= p_as_of)
    and (
      contract.end_date is null
      or contract.end_date >= p_as_of::date
      or (
        contract.start_date is not null
        and contract.contract_days is not null
        and contract.start_date
          + make_interval(days => round(contract.contract_days)::integer)
          >= p_as_of
      )
    )
  order by
    coalesce(
      contract.end_date,
      case
        when contract.start_date is not null
          and contract.contract_days is not null
          then contract.start_date
            + make_interval(days => round(contract.contract_days)::integer)
        else 'infinity'::timestamptz
      end
    ) desc,
    case
      when lower(coalesce(contract.status, 'active')) = 'active' then 0
      else 1
    end,
    contract.created_at desc
  limit 1;

  if v_contract.id is not null then
    v_end := coalesce(
      v_contract.end_date,
      case
        when v_contract.start_date is not null
          and v_contract.contract_days is not null
          then v_contract.start_date
            + make_interval(days => round(v_contract.contract_days)::integer)
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

revoke all on function public.refresh_client_contract_summary(
  uuid, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.refresh_client_contract_summary(
  uuid, uuid, timestamptz
) to service_role;

comment on function public.refresh_client_contract_summary is
  'Refreshes the current client contract summary from one effective active or migrated current-summary non-add-on contract.';

notify pgrst, 'reload schema';
