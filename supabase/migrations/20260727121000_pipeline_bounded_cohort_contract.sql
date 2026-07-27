-- Service-only, one-time bounded cohort contract for the Pipeline UI.
-- This is deliberately independent from recurring scheduler enrollment.

create table if not exists public.pipeline_renewal_preview_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  company_id uuid not null references public.companies(id) on delete cascade,
  pipeline_id uuid not null references public.company_pipelines(id) on delete cascade,
  actor_auth_user_id uuid not null references auth.users(id) on delete cascade,
  actor_member_id uuid references public.company_members(id) on delete set null,
  renewal_date_from date not null,
  renewal_date_to date not null,
  max_items integer not null check (max_items between 1 and 100),
  selected_contract_ids uuid[] not null,
  eligibility_snapshot jsonb not null,
  previewed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  automation_run_id uuid references public.pipeline_automation_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  check (renewal_date_from <= renewal_date_to),
  check (cardinality(selected_contract_ids) between 1 and 100)
);
create index if not exists pipeline_renewal_preview_tokens_active_idx
  on public.pipeline_renewal_preview_tokens(company_id, pipeline_id, expires_at)
  where consumed_at is null;
alter table public.pipeline_renewal_preview_tokens enable row level security;
revoke all on public.pipeline_renewal_preview_tokens from public, anon, authenticated;
grant all on public.pipeline_renewal_preview_tokens to service_role;

create or replace function public.preview_renewal_pipeline_cohort(
  p_company_id uuid, p_pipeline_id uuid, p_renewal_date_from date, p_renewal_date_to date,
  p_max_items integer, p_actor_auth_user_id uuid, p_actor_member_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_pipeline public.company_pipelines%rowtype; v_token text := gen_random_uuid()::text;
  v_from timestamptz := p_renewal_date_from::timestamptz; v_until timestamptz := (p_renewal_date_to + 1)::timestamptz;
  v_as_of timestamptz := now();
  v_selected uuid[]; v_candidates jsonb; v_exclusions jsonb; v_eligible integer; v_excluded integer; v_total integer;
begin
  if p_renewal_date_from is null or p_renewal_date_to is null or p_renewal_date_from > p_renewal_date_to
     or p_renewal_date_to - p_renewal_date_from > 366 or p_max_items is null or p_max_items not between 1 and 100 then
    raise exception 'Cohort requires ordered inclusive dates no more than 366 days apart and a max_items cap from 1 to 100';
  end if;
  select * into strict v_pipeline from public.company_pipelines
  where id = p_pipeline_id and company_id = p_company_id and pipeline_type = 'renewal' and is_enabled and archived_at is null;
  if not public.is_company_pipeline_enabled(p_company_id) then raise exception 'Pipeline is disabled for this company'; end if;
  with rows as materialized (
    select * from public.preview_due_renewal_pipeline_items(p_company_id, p_pipeline_id, v_as_of)
    where contract_end_at >= v_from and contract_end_at < v_until
  ), selected as (
    select * from rows where eligibility_status = 'eligible' order by contract_end_at, client_id, contract_id limit p_max_items
  ), exclusion_stats as (
    select exclusion_reason, count(*)::integer as exclusion_count from rows
    where eligibility_status = 'excluded' group by exclusion_reason
  ), stats as (
    select count(*) filter (where eligibility_status = 'eligible')::integer as eligible_count,
      count(*) filter (where eligibility_status = 'excluded')::integer as excluded_count, count(*)::integer as total_evaluated
    from rows
  )
  select coalesce(array_agg(selected.contract_id order by selected.contract_end_at, selected.client_id, selected.contract_id)
      filter (where selected.contract_id is not null), '{}'::uuid[]),
    coalesce(jsonb_agg(jsonb_build_object('contract_id', contract_id, 'client_id', client_id, 'pipeline_id', pipeline_id,
      'entry_stage_id', entry_stage_id, 'eligibility_status', 'eligible', 'exclusion_reason', null,
      'contract_end_at', contract_end_at, 'estimated_value_cents', estimated_value_cents, 'currency_code', currency_code)
      order by contract_end_at, client_id, contract_id) filter (where selected.contract_id is not null), '[]'::jsonb)
    , stats.eligible_count, stats.excluded_count, stats.total_evaluated,
    coalesce((select jsonb_object_agg(exclusion_reason, exclusion_count) from exclusion_stats), '{}'::jsonb)
  into v_selected, v_candidates, v_eligible, v_excluded, v_total, v_exclusions
  from stats left join selected on true group by stats.eligible_count, stats.excluded_count, stats.total_evaluated;
  if cardinality(v_selected) = 0 then
    return jsonb_build_object('previewed_at', v_as_of, 'eligible_count', coalesce(v_eligible, 0), 'selected_count', 0, 'excluded_count', coalesce(v_excluded, 0), 'total_evaluated', coalesce(v_total, 0),
      'exclusion_counts', v_exclusions, 'candidates', '[]'::jsonb, 'binding', null);
  end if;
  insert into public.pipeline_renewal_preview_tokens(token_hash, company_id, pipeline_id, actor_auth_user_id, actor_member_id,
    renewal_date_from, renewal_date_to, max_items, selected_contract_ids, eligibility_snapshot, previewed_at, expires_at)
  values(encode(extensions.digest(v_token, 'sha256'), 'hex'), p_company_id, p_pipeline_id, p_actor_auth_user_id, p_actor_member_id,
    p_renewal_date_from, p_renewal_date_to, p_max_items, v_selected,
    jsonb_build_object('candidates', v_candidates, 'eligible_count', v_eligible, 'excluded_count', v_excluded, 'total_evaluated', v_total, 'exclusion_counts', v_exclusions), v_as_of, v_as_of + interval '15 minutes');
  return jsonb_build_object('previewed_at', v_as_of, 'eligible_count', coalesce(v_eligible, 0), 'selected_count', cardinality(v_selected), 'excluded_count', coalesce(v_excluded, 0), 'total_evaluated', coalesce(v_total, 0),
    'exclusion_counts', v_exclusions, 'candidates', v_candidates,
    'binding', jsonb_build_object('cohort', jsonb_build_object('renewalDateFrom', p_renewal_date_from, 'renewalDateTo', p_renewal_date_to, 'maxItems', p_max_items), 'previewToken', v_token));
end;
$$;

-- The Edge boundary verifies actor authorization then uses this one-time token.
-- It never recomputes a cohort: its source-contract list is the preview snapshot.
create or replace function public.consume_renewal_pipeline_cohort(
  p_company_id uuid, p_pipeline_id uuid, p_renewal_date_from date, p_renewal_date_to date, p_max_items integer,
  p_preview_token text, p_actor_auth_user_id uuid, p_actor_member_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_token public.pipeline_renewal_preview_tokens%rowtype; v_pipeline public.company_pipelines%rowtype; v_run public.pipeline_automation_runs%rowtype;
  v_from timestamptz := p_renewal_date_from::timestamptz; v_until timestamptz := (p_renewal_date_to + 1)::timestamptz;
  v_as_of timestamptz;
  v_row record; v_client public.clients%rowtype; v_item public.client_pipeline_items%rowtype; v_event uuid;
  v_created integer := 0; v_skipped integer := 0;
begin
  if nullif(trim(p_preview_token), '') is null then raise exception 'A preview token is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text, 0));
  select * into strict v_token from public.pipeline_renewal_preview_tokens
  where token_hash = encode(extensions.digest(p_preview_token, 'sha256'), 'hex') for update;
  if v_token.company_id is distinct from p_company_id or v_token.pipeline_id is distinct from p_pipeline_id
     or v_token.actor_auth_user_id is distinct from p_actor_auth_user_id or v_token.actor_member_id is distinct from p_actor_member_id
     or v_token.renewal_date_from is distinct from p_renewal_date_from or v_token.renewal_date_to is distinct from p_renewal_date_to
     or v_token.max_items is distinct from p_max_items then raise exception 'Preview token binding does not match this request'; end if;
  if v_token.expires_at <= now() then raise exception 'Preview token has expired'; end if;
  if v_token.consumed_at is not null then
    if v_token.automation_run_id is not null then select * into strict v_run from public.pipeline_automation_runs where id = v_token.automation_run_id; return jsonb_build_object('run_id', v_run.id, 'created_count', v_run.created_count, 'skipped_count', v_run.skipped_count, 'idempotent', true); end if;
    raise exception 'Preview token was already consumed';
  end if;
  v_as_of := v_token.previewed_at;
  select * into strict v_pipeline from public.company_pipelines where id = p_pipeline_id and company_id = p_company_id and pipeline_type = 'renewal' and is_enabled and archived_at is null;
  if not public.is_company_pipeline_enabled(p_company_id) then raise exception 'Pipeline is disabled for this company'; end if;
  insert into public.pipeline_automation_runs(company_id, pipeline_id, run_key, as_of_at, run_type, window_start_at, window_end_at, max_create, requested_by_auth_user_id, requested_by_member_id, requested_by_source)
  values(p_company_id, p_pipeline_id, 'manual-cohort:' || v_token.id::text, v_as_of, 'manual', v_from, v_until, p_max_items, p_actor_auth_user_id, p_actor_member_id, 'preview_token') returning * into v_run;
  begin
    for v_row in select * from public.preview_due_renewal_pipeline_items(p_company_id, p_pipeline_id, v_as_of)
      where contract_id = any(v_token.selected_contract_ids) and contract_end_at >= v_from and contract_end_at < v_until
      order by contract_end_at, client_id, contract_id
    loop
      if v_row.eligibility_status <> 'eligible' then raise exception 'Preview token is stale; selected contract % is no longer eligible', v_row.contract_id; end if;
      select * into strict v_client from public.clients where id = v_row.client_id and company_id = p_company_id;
      insert into public.client_pipeline_items(company_id, client_id, pipeline_id, stage_id, source_contract_id, automation_key, client_name_snapshot, client_business_snapshot, pathway_id_snapshot, estimated_value_cents, currency_code, renewal_at, lifecycle_status, metadata)
      values(p_company_id, v_client.id, p_pipeline_id, v_row.entry_stage_id, v_row.contract_id, 'renewal_contract:' || v_row.contract_id, v_client.client_name, v_client.client_business, v_client.offer_milestones_current_offer_id, v_row.estimated_value_cents, v_row.currency_code, v_row.contract_end_at, 'open', jsonb_build_object('automation_run_id', v_run.id, 'source', 'preview_token'))
      on conflict(company_id, automation_key) where automation_key is not null and archived_at is null do nothing returning * into v_item;
      if v_item.id is null then v_skipped := v_skipped + 1; continue; end if;
      insert into public.client_pipeline_stage_events(company_id, pipeline_id, item_id, to_stage_id, actor_auth_user_id, actor_member_id, event_type, after_data, metadata)
      values(p_company_id, p_pipeline_id, v_item.id, v_item.stage_id, p_actor_auth_user_id, p_actor_member_id, 'created', to_jsonb(v_item), jsonb_build_object('automation_run_id', v_run.id, 'source', 'preview_token')) returning id into v_event;
      insert into public.client_history_events(company_id, legacy_client_glide_row_id, actor_auth_user_id, actor_member_id, event_type, source, title, summary, payload)
      values(p_company_id, v_client.glide_row_id, p_actor_auth_user_id, p_actor_member_id, 'pipeline_activity', 'pipeline_automation', 'Renewal item created', v_client.client_name || ': renewal item created.', jsonb_build_object('pipeline_item_id', v_item.id, 'stage_event_id', v_event, 'source_contract_id', v_row.contract_id, 'preview_token_id', v_token.id));
      insert into public.app_audit_events(company_id, actor_auth_user_id, actor_member_id, event_type, source, entity_table, entity_id, legacy_glide_row_id, title, summary, after_data, metadata)
      values(p_company_id, p_actor_auth_user_id, p_actor_member_id, 'pipeline_item_created', 'pipeline_automation', 'client_pipeline_items', v_item.id, v_client.glide_row_id, 'Renewal item created', v_client.client_name || ': renewal item created.', to_jsonb(v_item), jsonb_build_object('automation_run_id', v_run.id, 'preview_token_id', v_token.id));
      perform public.create_pipeline_tasks_for_stage_event(p_company_id, v_item.id, v_event, v_as_of);
      v_created := v_created + 1; v_item := null;
    end loop;
    if v_created + v_skipped <> cardinality(v_token.selected_contract_ids) then raise exception 'Preview token is stale; selected cohort changed'; end if;
    update public.pipeline_automation_runs set status = 'completed', candidate_count = cardinality(v_token.selected_contract_ids), created_count = v_created, skipped_count = v_skipped, completed_at = now() where id = v_run.id;
    update public.pipeline_renewal_preview_tokens set consumed_at = now(), automation_run_id = v_run.id where id = v_token.id;
    return jsonb_build_object('run_id', v_run.id, 'created_count', v_created, 'skipped_count', v_skipped);
  exception when others then
    update public.pipeline_automation_runs set status = 'failed', error_summary = sqlerrm, completed_at = now() where id = v_run.id;
    raise;
  end;
end;
$$;

revoke all on function public.preview_renewal_pipeline_cohort(uuid, uuid, date, date, integer, uuid, uuid) from public, anon, authenticated;
revoke all on function public.consume_renewal_pipeline_cohort(uuid, uuid, date, date, integer, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.preview_renewal_pipeline_cohort(uuid, uuid, date, date, integer, uuid, uuid) to service_role;
grant execute on function public.consume_renewal_pipeline_cohort(uuid, uuid, date, date, integer, text, uuid, uuid) to service_role;

notify pgrst, 'reload schema';
