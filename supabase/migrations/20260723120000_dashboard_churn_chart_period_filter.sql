-- The Dashboard reporting date range is an event window for churn. Filter the
-- Churn Reason chart by the recorded offboarding date instead of returning the
-- same all-time distribution for every selected month.
--
-- Keep the new start parameter last so existing callers that only send the
-- prior named arguments continue to work during the frontend rollout.

drop function if exists public.dashboard_churn_reason_rollup_actor_scoped(
  text,
  text,
  text,
  text[],
  text,
  timestamptz,
  timestamptz,
  timestamptz
);

create function public.dashboard_churn_reason_rollup_actor_scoped(
  p_company_id text,
  p_csm_id text default null,
  p_secondary_assignee_id text default null,
  p_program_values text[] default null,
  p_offer_id text default null,
  p_client_start_date_from timestamptz default null,
  p_client_start_date_to timestamptz default null,
  p_date_range_end timestamptz default null,
  p_date_range_start timestamptz default null
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
    where source.program_status_value = 'off-boarded'
      and nullif(btrim(source.churn_reason_value), '') is not null
      and coalesce(
        source.client_age_date_offboarded,
        source.client_age_date_offboarded_for_filtering
      ) is not null
      and (
        p_date_range_start is null
        or coalesce(
          source.client_age_date_offboarded,
          source.client_age_date_offboarded_for_filtering
        ) >= p_date_range_start
      )
      and (
        p_date_range_end is null
        or coalesce(
          source.client_age_date_offboarded,
          source.client_age_date_offboarded_for_filtering
        ) < p_date_range_end + interval '1 day'
      )
  ),
  churn_buckets as (
    select
      'churn_reason'::text as metric,
      churn.churn_reason_value as bucket_key,
      coalesce(
        nullif(reason.label, ''),
        initcap(
          replace(replace(churn.churn_reason_value, '-', ' '), '_', ' ')
        )
      ) || case
        when reason.status = 'archived' then ' (Archived)'
        else ''
      end as bucket_label,
      count(*)::bigint as value,
      null::numeric as capacity,
      reason.position as sort_position
    from churn_rows churn
    left join public.company_churn_reasons reason
      on reason.company_id = churn.company_id
     and reason.value = churn.churn_reason_value
    group by
      churn.churn_reason_value,
      reason.label,
      reason.status,
      reason.position
  )
  select
    bucket.metric,
    bucket.bucket_key,
    bucket.bucket_label,
    bucket.value,
    bucket.capacity
  from churn_buckets bucket
  order by
    bucket.sort_position nulls last,
    bucket.value desc,
    bucket.bucket_label;
$$;

revoke all on function public.dashboard_churn_reason_rollup_actor_scoped(
  text,
  text,
  text,
  text[],
  text,
  timestamptz,
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
  timestamptz,
  timestamptz
) to authenticated, service_role;

notify pgrst, 'reload schema';
