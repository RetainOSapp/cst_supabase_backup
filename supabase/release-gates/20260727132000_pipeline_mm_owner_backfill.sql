-- Audited one-time owner backfill for Jay's approved 12-card MM cohort.

do $gate$
declare
  v_company_id constant uuid := '21586391-9a84-4072-9ae6-20436b27bea9';
  v_pipeline_id constant uuid := '70bb9fe9-759d-4594-a8c3-e129d984893f';
  v_item record;
  v_owner_id uuid;
  v_count integer;
begin
  if not exists (
    select 1 from public.companies
    where id = v_company_id
      and name = 'Moves Method'
      and legacy_glide_row_id = 'wd7vy0vaQK2hgB3IRqy17w'
      and migration_status in ('pilot', 'migrated')
  ) then
    raise exception 'Moves Method company binding changed';
  end if;
  if not exists (
    select 1 from public.company_pipelines
    where id = v_pipeline_id
      and company_id = v_company_id
      and pipeline_type = 'renewal'
      and is_enabled
      and archived_at is null
  ) then
    raise exception 'Moves Method Renewal pipeline binding changed';
  end if;

  select count(*)::integer into v_count
  from public.client_pipeline_items
  where company_id = v_company_id
    and pipeline_id = v_pipeline_id
    and archived_at is null
    and source_contract_id is not null
    and metadata ->> 'source' = 'preview_token'
    and owner_member_id is null;
  if v_count <> 12 then
    raise exception 'Expected exactly 12 approved unassigned MM cohort items; found %', v_count;
  end if;

  for v_item in
    select id, client_id
    from public.client_pipeline_items
    where company_id = v_company_id
      and pipeline_id = v_pipeline_id
      and archived_at is null
      and source_contract_id is not null
      and metadata ->> 'source' = 'preview_token'
      and owner_member_id is null
    order by created_at, id
  loop
    v_owner_id := public.resolve_pipeline_primary_owner_member_id(
      v_company_id,
      v_item.client_id
    );
    if v_owner_id is null then
      raise exception 'Approved cohort item % has no exact active primary owner', v_item.id;
    end if;
    perform public.mutate_pipeline_item_with_evidence(
      v_company_id,
      v_item.id,
      'details_changed',
      jsonb_build_object('owner_member_id', v_owner_id),
      null,
      null,
      'system_rollout',
      'Assigned from the client''s exact active primary CSM during MM rollout.'
    );
  end loop;
end;
$gate$;
