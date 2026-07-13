-- Security Phase 1B: Viewer-safe churn reason Dashboard aggregate.
--
-- This additive compatibility slice follows the initial aggregate rollout and
-- preserves the churn-reason chart added to the current production frontend.

do $$
begin
  if to_regclass('public.security_rollout_history') is null
    or not exists (
      select 1
      from public.security_rollout_history rollout
      where rollout.version = '20260713020000'
    ) then
    raise exception 'Security Phase 1B aggregate authority must be applied first';
  end if;
end $$;

create or replace function public.dashboard_churn_reason_rollup_actor_scoped(
  p_company_id text,
  p_csm_id text default null,
  p_secondary_assignee_id text default null,
  p_program_values text[] default null,
  p_offer_id text default null,
  p_client_start_date_from timestamptz default null,
  p_client_start_date_to timestamptz default null,
  p_date_range_end timestamptz default null
)
returns table (
  metric text,
  bucket_key text,
  bucket_label text,
  value bigint,
  capacity numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with authorized_clients as (
    select client.company_id, client.glide_row_id
    from public.dashboard_authorized_app_clients(
      p_company_id,
      p_csm_id,
      p_secondary_assignee_id,
      p_program_values,
      p_offer_id,
      p_client_start_date_from,
      p_client_start_date_to,
      p_date_range_end
    ) client
  ),
  churn_rows as (
    select
      source.company_id,
      source.churn_reason_value
    from authorized_clients authorized
    join public.clients source
      on source.company_id = authorized.company_id
     and source.glide_row_id = authorized.glide_row_id
    where nullif(btrim(source.churn_reason_value), '') is not null
  )
  select
    'churn_reason'::text,
    churn.churn_reason_value,
    coalesce(
      nullif(reason.label, ''),
      initcap(
        replace(replace(churn.churn_reason_value, '-', ' '), '_', ' ')
      )
    ) || case
      when reason.status = 'archived' then ' (Archived)'
      else ''
    end,
    count(*)::bigint,
    null::numeric
  from churn_rows churn
  left join public.company_churn_reasons reason
    on reason.company_id = churn.company_id
   and reason.value = churn.churn_reason_value
  group by
    churn.churn_reason_value,
    reason.label,
    reason.status,
    reason.position
  order by reason.position nulls last, churn.churn_reason_value;
$$;

revoke all on function public.dashboard_churn_reason_rollup_actor_scoped(
  text,
  text,
  text,
  text[],
  text,
  timestamptz,
  timestamptz,
  timestamptz
) from public, anon;

grant execute on function public.dashboard_churn_reason_rollup_actor_scoped(
  text,
  text,
  text,
  text[],
  text,
  timestamptz,
  timestamptz,
  timestamptz
) to authenticated, service_role;

insert into public.security_rollout_history (
  version,
  migration_name,
  details
)
values (
  '20260713020200',
  'security_phase1b_churn_reason_aggregate',
  jsonb_build_object(
    'scope', 'actor_scoped_dashboard_churn_reason_aggregate',
    'raw_viewer_client_rows', false,
    'policy_changes', false,
    'legacy_rpc_grants_changed', false
  )
)
on conflict (version) do nothing;

notify pgrst, 'reload schema';
