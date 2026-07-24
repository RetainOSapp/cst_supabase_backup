-- Make renewal preview operate on each client's current fixed-term contract.
-- Historical/superseded contracts are never eligible merely because their end
-- date falls inside the configured operational window.

create or replace function public.preview_due_renewal_pipeline_items(
  p_company_id uuid,
  p_pipeline_id uuid,
  p_as_of timestamptz default now()
)
returns table(
  contract_id uuid,
  client_id uuid,
  pipeline_id uuid,
  entry_stage_id uuid,
  contract_end_at timestamptz,
  eligibility_status text,
  exclusion_reason text,
  estimated_value_cents bigint,
  currency_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pipeline public.company_pipelines%rowtype;
  v_stage uuid;
  v_catchup integer;
begin
  select pipeline.* into v_pipeline
  from public.company_pipelines pipeline
  join public.company_settings settings
    on settings.company_id = pipeline.company_id
  where pipeline.company_id = p_company_id
    and pipeline.id = p_pipeline_id
    and pipeline.pipeline_type = 'renewal'
    and pipeline.is_enabled
    and pipeline.archived_at is null
    and settings.enable_pipeline;
  if not found then
    raise exception 'No enabled renewal pipeline for company %', p_company_id;
  end if;

  begin
    v_stage := (v_pipeline.automation_settings ->> 'entry_stage_id')::uuid;
  exception when others then
    raise exception 'Renewal entry_stage_id is required';
  end;

  if not exists (
    select 1
    from public.company_pipeline_stages stage
    where stage.id = v_stage
      and stage.pipeline_id = v_pipeline.id
      and stage.stage_type = 'open'
      and stage.is_enabled
      and stage.archived_at is null
  ) then
    raise exception 'Renewal entry_stage_id is not an active open stage';
  end if;

  v_catchup := least(
    greatest(coalesce((v_pipeline.automation_settings ->> 'catch_up_days')::integer, 30), 0),
    365
  );

  return query
  select
    current_contract.id,
    client.id,
    v_pipeline.id,
    v_stage,
    current_dates.current_end_at,
    case when eligibility.reason is null then 'eligible' else 'excluded' end,
    eligibility.reason,
    case
      when v_pipeline.value_source = 'fixed' then
        v_pipeline.default_estimated_value_cents
      when v_pipeline.value_source = 'current_contract' then
        round(coalesce(current_contract.total_contract_value, current_contract.monthly_value, 0) * 100)::bigint
      else null
    end,
    coalesce(current_contract.currency_code, v_pipeline.currency_code)
  from public.clients client
  cross join lateral (
    select coalesce(
      client.current_contract_end_date_for_filtering,
      client.current_contract_end_date,
      case
        when client.current_contract_start_date is not null
          and client.current_contract_of_days is not null
          and client.current_contract_of_days > 0
        then client.current_contract_start_date
          + make_interval(days => client.current_contract_of_days::integer)
        else null
      end
    ) as current_end_at
  ) current_dates
  left join lateral (
    select matched.*
    from (
      select
        candidate.*,
        count(*) over () as match_count
      from (
        select
          contract.*,
          coalesce(
            contract.end_date,
            case
              when contract.start_date is not null
                and contract.contract_days is not null
                and contract.contract_days > 0
              then contract.start_date + make_interval(days => contract.contract_days::integer)
              else null
            end
          ) as effective_end_at
        from public.client_contracts contract
        where contract.company_id = p_company_id
          and contract.client_id = client.glide_row_id
          and contract.archived_at is null
          and lower(coalesce(contract.status, 'active')) <> 'archived'
          and lower(coalesce(contract.contract_type, contract.metadata ->> 'contract_type', 'standard')) <> 'add_on'
      ) candidate
      where current_dates.current_end_at is not null
        and candidate.effective_end_at is not null
        and abs(extract(epoch from (candidate.effective_end_at - current_dates.current_end_at))) <= 86400
    ) matched
    order by matched.effective_end_at desc, matched.start_date desc nulls last, matched.created_at desc
    limit 1
  ) current_contract on true
  cross join lateral (
    select case
      when client.archived_at is not null then 'archived_client'
      when lower(coalesce(client.program_status_value, '')) = 'off-boarded' then 'offboarded_client'
      when lower(coalesce(client.program_status_value, '')) in ('paused', 'suspended') then 'paused_or_suspended_client'
      when lower(coalesce(client.program_status_value, '')) not in ('front-end', 'back-end') then 'inactive_client'
      when current_dates.current_end_at is null then 'open_or_missing_end'
      when current_dates.current_end_at::date = date '2075-01-01' then 'placeholder_end_date'
      when current_contract.id is null then 'missing_current_contract_evidence'
      when current_contract.match_count > 1 then 'ambiguous_current_contract_evidence'
      when current_contract.billing_cadence = 'open_ended' then 'open_ended'
      when current_contract.billing_cadence = 'month_to_month'
        and coalesce(v_pipeline.entry_rules ->> 'include_month_to_month', 'false') <> 'true' then 'month_to_month'
      when coalesce(client.current_contract_auto_renew, current_contract.auto_renew, false)
        and coalesce(v_pipeline.entry_rules ->> 'include_auto_renew', 'false') <> 'true' then 'auto_renew'
      when current_dates.current_end_at < p_as_of - make_interval(days => v_catchup) then 'outside_catch_up_window'
      when current_dates.current_end_at > p_as_of + make_interval(days => v_pipeline.renewal_lead_days::integer) then 'not_due_yet'
      when exists (
        select 1
        from public.client_pipeline_items item
        where item.company_id = p_company_id
          and item.pipeline_id = v_pipeline.id
          and item.client_id = client.id
          and item.archived_at is null
          and (
            item.source_contract_id = current_contract.id
            or item.renewal_at::date = current_dates.current_end_at::date
          )
      ) then 'already_exists'
      else null
    end as reason
  ) eligibility
  where client.company_id = p_company_id;
end
$$;

revoke all on function public.preview_due_renewal_pipeline_items(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.preview_due_renewal_pipeline_items(uuid, uuid, timestamptz)
  to service_role;

notify pgrst, 'reload schema';
