-- Gate C2 preview hotfix.
-- Qualifies the stage lookup so the PL/pgSQL output column `pipeline_id`
-- cannot conflict with company_pipeline_stages.pipeline_id.
-- This replaces one read-only preview function; it changes no data or gates.

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
  -- Preview remains available while execution is paused. Generation repeats
  -- every execution kill switch before it can create a run or item.
  select p.* into v_pipeline
  from public.company_pipelines p
  join public.company_settings s on s.company_id = p.company_id
  where p.company_id = p_company_id
    and p.id = p_pipeline_id
    and p.pipeline_type = 'renewal'
    and p.is_enabled
    and p.archived_at is null
    and s.enable_pipeline;
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
    from public.company_pipeline_stages st
    where st.id = v_stage
      and st.pipeline_id = v_pipeline.id
      and st.stage_type = 'open'
      and st.is_enabled
      and st.archived_at is null
  ) then
    raise exception 'Renewal entry_stage_id is not an active open stage';
  end if;

  v_catchup := least(
    greatest(coalesce((v_pipeline.automation_settings ->> 'catch_up_days')::integer, 30), 0),
    365
  );

  return query
  select
    c.id,
    cl.id,
    v_pipeline.id,
    v_stage,
    c.end_date,
    case when x.reason is null then 'eligible' else 'excluded' end,
    x.reason,
    case
      when v_pipeline.value_source = 'fixed' then v_pipeline.default_estimated_value_cents
      when v_pipeline.value_source = 'current_contract' then round(coalesce(c.total_contract_value, c.monthly_value, 0) * 100)::bigint
      else null
    end,
    coalesce(c.currency_code, v_pipeline.currency_code)
  from public.client_contracts c
  join public.clients cl
    on cl.company_id = c.company_id
   and cl.glide_row_id = c.client_id
  cross join lateral (
    select case
      when c.archived_at is not null or lower(coalesce(c.status, '')) = 'archived' then 'archived_contract'
      when cl.archived_at is not null then 'archived_client'
      when lower(coalesce(cl.program_status_value, '')) = 'off-boarded' then 'offboarded_client'
      when lower(coalesce(cl.program_status_value, '')) in ('paused', 'suspended')
        and coalesce(v_pipeline.entry_rules ->> ('include_' || lower(cl.program_status_value)), 'false') <> 'true' then 'paused_or_suspended_client'
      when c.end_date is null then 'open_or_missing_end'
      when c.end_date::date = date '2075-01-01' then 'placeholder_end_date'
      when c.billing_cadence in ('open_ended', 'unknown') then 'open_or_unknown_cadence'
      when c.billing_cadence = 'month_to_month'
        and coalesce(v_pipeline.entry_rules ->> 'include_month_to_month', 'false') <> 'true' then 'month_to_month'
      when c.auto_renew
        and coalesce(v_pipeline.entry_rules ->> 'include_auto_renew', 'false') <> 'true' then 'auto_renew'
      when c.end_date < p_as_of - make_interval(days => v_catchup) then 'outside_catch_up_window'
      when c.end_date > p_as_of + make_interval(days => v_pipeline.renewal_lead_days) then 'not_due_yet'
      when exists (
        select 1
        from public.client_pipeline_items i
        where i.company_id = p_company_id
          and i.source_contract_id = c.id
          and i.archived_at is null
      ) then 'already_exists'
      else null
    end as reason
  ) x
  where c.company_id = p_company_id;
end
$$;

revoke all on function public.preview_due_renewal_pipeline_items(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.preview_due_renewal_pipeline_items(uuid, uuid, timestamptz)
  to service_role;

notify pgrst, 'reload schema';
