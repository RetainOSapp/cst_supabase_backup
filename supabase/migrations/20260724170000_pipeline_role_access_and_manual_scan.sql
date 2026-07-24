-- Company-specific Pipeline role access and a separately gated one-time
-- renewal materialization path. New role columns default to the behavior that
-- existed before this migration; no company is enabled or disabled here.

alter table public.company_settings
  add column if not exists enable_pipeline_director_access boolean not null default true,
  add column if not exists enable_pipeline_support_access boolean not null default true,
  add column if not exists enable_pipeline_csm_access boolean not null default true;

comment on column public.company_settings.enable_pipeline_director_access is
  'Allows active writable Directors to use the operational Pipeline workspace.';
comment on column public.company_settings.enable_pipeline_support_access is
  'Allows active writable Support users to use the operational Pipeline workspace.';
comment on column public.company_settings.enable_pipeline_csm_access is
  'Allows active writable CSMs to use the operational Pipeline workspace for assigned clients.';

create or replace function public.is_company_pipeline_role_access_enabled(
  target_company_id uuid,
  target_role text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select
        settings.enable_pipeline
        and case lower(coalesce(target_role, ''))
          when 'director' then settings.enable_pipeline_director_access
          when 'support' then settings.enable_pipeline_support_access
          when 'csm' then settings.enable_pipeline_csm_access
          when 'viewer' then settings.enable_pipeline_viewer_access
          else false
        end
      from public.company_settings settings
      where settings.company_id = target_company_id
    ),
    false
  );
$$;

revoke all on function public.is_company_pipeline_role_access_enabled(uuid, text)
  from public, anon;
grant execute on function public.is_company_pipeline_role_access_enabled(uuid, text)
  to authenticated, service_role;

create or replace function public.update_company_pipeline_role_access_with_audit(
  p_company_id uuid,
  p_director_access boolean,
  p_support_access boolean,
  p_csm_access boolean,
  p_viewer_access boolean,
  p_actor_auth_user_id uuid,
  p_actor_member_id uuid,
  p_actor_role text
)
returns public.company_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_settings public.company_settings;
  changed_settings public.company_settings;
begin
  if p_actor_role <> 'super_admin' then
    raise exception 'Only a Super Admin can change Pipeline role access.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text, 0));

  select * into prior_settings
  from public.company_settings
  where company_id = p_company_id
  for update;
  if prior_settings.id is null then
    raise exception 'Company settings were not found.';
  end if;

  update public.company_settings
  set
    enable_pipeline_director_access = p_director_access,
    enable_pipeline_support_access = p_support_access,
    enable_pipeline_csm_access = p_csm_access,
    enable_pipeline_viewer_access = p_viewer_access
  where id = prior_settings.id
    and company_id = p_company_id
  returning * into changed_settings;

  insert into public.app_audit_events (
    company_id, actor_auth_user_id, actor_member_id, event_type, source,
    entity_table, entity_id, title, summary, before_data, after_data, metadata
  ) values (
    p_company_id, p_actor_auth_user_id, p_actor_member_id,
    'company_pipeline_role_access_updated', 'company_pipeline_admin',
    'company_settings', changed_settings.id, 'Pipeline role access updated',
    'Pipeline workspace access by company role was updated.',
    jsonb_build_object(
      'director', prior_settings.enable_pipeline_director_access,
      'support', prior_settings.enable_pipeline_support_access,
      'csm', prior_settings.enable_pipeline_csm_access,
      'viewer', prior_settings.enable_pipeline_viewer_access
    ),
    jsonb_build_object(
      'director', changed_settings.enable_pipeline_director_access,
      'support', changed_settings.enable_pipeline_support_access,
      'csm', changed_settings.enable_pipeline_csm_access,
      'viewer', changed_settings.enable_pipeline_viewer_access
    ),
    jsonb_build_object('actor_role', p_actor_role)
  );

  return changed_settings;
end;
$$;

revoke all on function public.update_company_pipeline_role_access_with_audit(
  uuid, boolean, boolean, boolean, boolean, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.update_company_pipeline_role_access_with_audit(
  uuid, boolean, boolean, boolean, boolean, uuid, uuid, text
) to service_role;

-- Preserve Director configuration visibility while applying the new role gates
-- to operational definition reads.
drop policy if exists company_pipelines_authenticated_read on public.company_pipelines;
create policy company_pipelines_authenticated_read
on public.company_pipelines for select to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or (
    company_id = (select public.current_actor_app_policy_company_id())
    and (
      (select public.current_actor_app_policy_role()) = 'director'
      or (
        select public.is_company_pipeline_role_access_enabled(
          company_id,
          (select public.current_actor_app_policy_role())
        )
      )
    )
  )
);

drop policy if exists company_pipeline_stages_authenticated_read on public.company_pipeline_stages;
create policy company_pipeline_stages_authenticated_read
on public.company_pipeline_stages for select to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or (
    company_id = (select public.current_actor_app_policy_company_id())
    and (
      (select public.current_actor_app_policy_role()) = 'director'
      or (
        select public.is_company_pipeline_role_access_enabled(
          company_id,
          (select public.current_actor_app_policy_role())
        )
      )
    )
  )
);

drop policy if exists client_pipeline_items_authenticated_read on public.client_pipeline_items;
create policy client_pipeline_items_authenticated_read
on public.client_pipeline_items for select to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or (
    company_id = (select public.current_actor_app_policy_company_id())
    and (
      select public.is_company_pipeline_role_access_enabled(
        company_id,
        (select public.current_actor_app_policy_role())
      )
    )
    and (
      (select public.current_actor_app_policy_role()) in ('director', 'support', 'viewer')
      or (
        (select public.current_actor_app_policy_role()) = 'csm'
        and exists (
          select 1
          from public.clients client
          where client.id = client_pipeline_items.client_id
            and client.company_id = client_pipeline_items.company_id
            and (
              client.csm_team_member_id = any(
                coalesce(
                  (select public.current_actor_app_policy_member_ids()),
                  array[]::text[]
                )
              )
              or client.csm_secondary_assignee_id = any(
                coalesce(
                  (select public.current_actor_app_policy_member_ids()),
                  array[]::text[]
                )
              )
            )
        )
      )
    )
  )
);

drop policy if exists client_pipeline_stage_events_authenticated_read
  on public.client_pipeline_stage_events;
create policy client_pipeline_stage_events_authenticated_read
on public.client_pipeline_stage_events for select to authenticated
using (
  (select public.is_retainos_super_admin_bound())
  or (
    company_id = (select public.current_actor_app_policy_company_id())
    and (
      select public.is_company_pipeline_role_access_enabled(
        company_id,
        (select public.current_actor_app_policy_role())
      )
    )
    and exists (
      select 1
      from public.client_pipeline_items item
      where item.id = client_pipeline_stage_events.item_id
        and item.company_id = client_pipeline_stage_events.company_id
        and (
          (select public.current_actor_app_policy_role()) in ('director', 'support', 'viewer')
          or (
            (select public.current_actor_app_policy_role()) = 'csm'
            and exists (
              select 1
              from public.clients client
              where client.id = item.client_id
                and client.company_id = item.company_id
                and (
                  client.csm_team_member_id = any(
                    coalesce(
                      (select public.current_actor_app_policy_member_ids()),
                      array[]::text[]
                    )
                  )
                  or client.csm_secondary_assignee_id = any(
                    coalesce(
                      (select public.current_actor_app_policy_member_ids()),
                      array[]::text[]
                    )
                  )
                )
            )
          )
        )
    )
  )
);

-- The existing service-only generator keeps its full idempotency, evidence,
-- exclusion, and locking behavior. A manual-once run key permits an explicit
-- SuperAdmin materialization without changing the recurring automation flags.
create or replace function public.pipeline_manual_scan_requested(p_run_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_run_key, '') like 'manual-once:%';
$$;

revoke all on function public.pipeline_manual_scan_requested(text)
  from public, anon, authenticated;
grant execute on function public.pipeline_manual_scan_requested(text)
  to service_role;

create or replace function public.generate_due_renewal_pipeline_items(
 p_company_id uuid,p_as_of timestamptz,p_run_key text,p_requested_by_auth_user_id uuid,p_requested_by_member_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_run public.pipeline_automation_runs%rowtype; v_row record; v_item public.client_pipeline_items%rowtype;
 v_event uuid; v_created integer:=0; v_skipped integer:=0; v_items jsonb:='[]'::jsonb; v_client public.clients%rowtype;
 v_pipeline_id uuid; v_manual_once boolean:=public.pipeline_manual_scan_requested(p_run_key);
begin
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text,0));
  select p.id into v_pipeline_id
  from public.company_pipelines p join public.company_settings s on s.company_id=p.company_id
  where p.company_id=p_company_id and p.pipeline_type='renewal' and p.is_enabled
    and p.archived_at is null and s.enable_pipeline
    and (
      (
        v_manual_once
        and p.id::text = split_part(p_run_key, ':', 2)
      )
      or (
        p.auto_create_renewal_items
        and coalesce(p.automation_settings->>'automation_paused','false')<>'true'
        and coalesce(p.automation_settings->>'renewal_generation_enabled','false')='true'
      )
    );
  if v_pipeline_id is null then
    raise exception 'No enabled Renewal pipeline is available for this company.';
  end if;

  insert into public.pipeline_automation_runs(company_id,pipeline_id,run_key,as_of_at,requested_by_auth_user_id,requested_by_member_id)
  values(p_company_id,v_pipeline_id,p_run_key,p_as_of,p_requested_by_auth_user_id,p_requested_by_member_id)
  on conflict(company_id,run_key) do update set run_key=excluded.run_key returning * into v_run;
  if v_run.pipeline_id is distinct from v_pipeline_id
     or v_run.as_of_at is distinct from p_as_of
     or v_run.requested_by_auth_user_id is distinct from p_requested_by_auth_user_id
     or v_run.requested_by_member_id is distinct from p_requested_by_member_id
  then
    raise exception 'Automation run key % was already bound to different immutable inputs',p_run_key;
  end if;
  if v_run.status='completed' then
    return jsonb_build_object('created_count',v_run.created_count,'skipped_count',v_run.skipped_count,'items','[]'::jsonb);
  end if;
  begin
    for v_row in select * from public.preview_due_renewal_pipeline_items(p_company_id,v_pipeline_id,p_as_of) loop
      if v_row.eligibility_status<>'eligible' then v_skipped:=v_skipped+1; continue; end if;
      select * into v_client from public.clients where id=v_row.client_id;
      insert into public.client_pipeline_items(company_id,client_id,pipeline_id,stage_id,source_contract_id,automation_key,
      client_name_snapshot,client_business_snapshot,pathway_id_snapshot,estimated_value_cents,currency_code,renewal_at,
      lifecycle_status,metadata)
      values(p_company_id,v_client.id,v_row.pipeline_id,v_row.entry_stage_id,v_row.contract_id,'renewal_contract:'||v_row.contract_id,
      v_client.client_name,v_client.client_business,v_client.offer_milestones_current_offer_id,v_row.estimated_value_cents,
      v_row.currency_code,v_row.contract_end_at,'open',jsonb_build_object(
        'client_legacy_id',v_client.glide_row_id,
        'automation_run_id',v_run.id,
        'generation_mode',case when v_manual_once then 'manual_once' else 'recurring' end
      ))
      on conflict(company_id,automation_key) where automation_key is not null and archived_at is null do nothing returning * into v_item;
      if v_item.id is null then v_skipped:=v_skipped+1; continue; end if;
      insert into public.client_pipeline_stage_events(company_id,pipeline_id,item_id,to_stage_id,actor_auth_user_id,actor_member_id,
      event_type,after_data,metadata) values(p_company_id,v_item.pipeline_id,v_item.id,v_item.stage_id,p_requested_by_auth_user_id,
      p_requested_by_member_id,'created',to_jsonb(v_item),jsonb_build_object('automation_run_id',v_run.id,'generation_mode',case when v_manual_once then 'manual_once' else 'recurring' end)) returning id into v_event;
      insert into public.client_history_events(company_id,legacy_client_glide_row_id,actor_auth_user_id,actor_member_id,event_type,
      source,title,summary,next_contact_at,payload) values(p_company_id,v_client.glide_row_id,p_requested_by_auth_user_id,
      p_requested_by_member_id,'pipeline_activity','pipeline_automation','Renewal item created',v_client.client_name||': renewal item created.',
      v_item.follow_up_at,jsonb_build_object('pipeline_item_id',v_item.id,'stage_event_id',v_event,'source_contract_id',v_row.contract_id));
      insert into public.app_audit_events(company_id,actor_auth_user_id,actor_member_id,event_type,source,entity_table,entity_id,
      legacy_glide_row_id,title,summary,after_data,metadata) values(p_company_id,p_requested_by_auth_user_id,p_requested_by_member_id,
      'pipeline_item_created','pipeline_automation','client_pipeline_items',v_item.id,v_client.glide_row_id,'Renewal item created',
      v_client.client_name||': renewal item created.',to_jsonb(v_item),jsonb_build_object('automation_run_id',v_run.id,'generation_mode',case when v_manual_once then 'manual_once' else 'recurring' end));
      perform public.create_pipeline_tasks_for_stage_event(p_company_id,v_item.id,v_event,p_as_of);
      v_created:=v_created+1; v_items:=v_items||jsonb_build_array(to_jsonb(v_item)); v_item:=null;
    end loop;
    update public.pipeline_automation_runs set status='completed',candidate_count=v_created+v_skipped,created_count=v_created,
      skipped_count=v_skipped,completed_at=now(),exclusion_counts=coalesce((
        select jsonb_object_agg(exclusion_reason,n) from (
          select exclusion_reason,count(*)::integer n
          from public.preview_due_renewal_pipeline_items(p_company_id,v_pipeline_id,p_as_of)
          where eligibility_status='excluded' group by exclusion_reason
        ) counts
      ),'{}'::jsonb) where id=v_run.id;
    return jsonb_build_object('created_count',v_created,'skipped_count',v_skipped,'items',v_items);
  exception when others then
    update public.pipeline_automation_runs set status='failed',error_summary=sqlerrm,completed_at=now() where id=v_run.id;
    return jsonb_build_object('created_count',0,'skipped_count',0,'items','[]'::jsonb,'error',sqlerrm);
  end;
end $$;

revoke all on function public.generate_due_renewal_pipeline_items(
  uuid,timestamptz,text,uuid,uuid
) from public,anon,authenticated;
grant execute on function public.generate_due_renewal_pipeline_items(
  uuid,timestamptz,text,uuid,uuid
) to service_role;

notify pgrst, 'reload schema';
