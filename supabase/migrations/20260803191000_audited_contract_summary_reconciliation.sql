-- Apply a deliberately selected contract-summary repair and its audit record
-- in one transaction. The caller must already have identified a fully blank
-- client summary with exactly one effective standard contract.

create or replace function public.reconcile_client_contract_summary(
  p_company_id uuid,
  p_client_id uuid,
  p_source_contract_id uuid,
  p_repair_kind text,
  p_as_of timestamptz default now()
) returns public.clients
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client public.clients%rowtype;
  v_contract_count integer;
  v_effective_contract_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  if coalesce(btrim(p_repair_kind), '') = '' then
    raise exception 'A repair kind is required.';
  end if;

  select * into strict v_client
  from public.clients
  where id = p_client_id
    and company_id = p_company_id
    and archived_at is null
  for update;

  if v_client.current_contract_start_date is not null
    or v_client.current_contract_of_days is not null
    or v_client.current_contract_end_date is not null
    or v_client.current_contract_end_date_for_filtering is not null then
    raise exception 'Contract summary is no longer fully blank.';
  end if;

  select count(*), min(contract.id::text)::uuid
  into v_contract_count, v_effective_contract_id
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
    );

  if v_contract_count <> 1
    or v_effective_contract_id is distinct from p_source_contract_id then
    raise exception 'Effective contract set changed; repair stopped.';
  end if;

  v_before := jsonb_build_object(
    'current_contract_start_date', v_client.current_contract_start_date,
    'current_contract_of_days', v_client.current_contract_of_days,
    'current_contract_end_date', v_client.current_contract_end_date,
    'current_contract_end_date_for_filtering',
      v_client.current_contract_end_date_for_filtering,
    'current_contract_monthly_value', v_client.current_contract_monthly_value,
    'current_contract_reference_link', v_client.current_contract_reference_link,
    'current_contract_notes', v_client.current_contract_notes,
    'current_contract_auto_renew', v_client.current_contract_auto_renew
  );

  select * into v_client
  from public.refresh_client_contract_summary(
    p_company_id,
    p_client_id,
    p_as_of
  );

  v_after := jsonb_build_object(
    'current_contract_start_date', v_client.current_contract_start_date,
    'current_contract_of_days', v_client.current_contract_of_days,
    'current_contract_end_date', v_client.current_contract_end_date,
    'current_contract_end_date_for_filtering',
      v_client.current_contract_end_date_for_filtering,
    'current_contract_monthly_value', v_client.current_contract_monthly_value,
    'current_contract_reference_link', v_client.current_contract_reference_link,
    'current_contract_notes', v_client.current_contract_notes,
    'current_contract_auto_renew', v_client.current_contract_auto_renew
  );

  insert into public.app_audit_events (
    company_id,
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
  ) values (
    p_company_id,
    'contract_summary_reconciled',
    'contract_summary_reconciliation',
    'clients',
    v_client.id,
    v_client.glide_row_id,
    'Contract summary reconciled',
    format(
      'Restored the current contract summary for %s from its single effective app-owned contract.',
      coalesce(v_client.client_name, v_client.glide_row_id)
    ),
    v_before,
    v_after,
    jsonb_build_object(
      'repair_kind', p_repair_kind,
      'source_contract_id', p_source_contract_id,
      'as_of', p_as_of
    )
  );

  return v_client;
end;
$$;

revoke all on function public.reconcile_client_contract_summary(
  uuid, uuid, uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.reconcile_client_contract_summary(
  uuid, uuid, uuid, text, timestamptz
) to service_role;

comment on function public.reconcile_client_contract_summary is
  'Atomically restores one fully blank client contract summary from its sole effective contract and records before/after audit evidence.';

notify pgrst, 'reload schema';
