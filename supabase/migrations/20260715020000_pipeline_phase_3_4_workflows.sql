-- Pipeline Phase 3-4 workflow primitives.
-- Additive and disabled by default. No company, pipeline, or automation is enabled here.

alter table public.client_contracts
  add column if not exists contract_type text not null default 'standard',
  add column if not exists billing_cadence text not null default 'unknown',
  add column if not exists currency_code text not null default 'USD',
  add column if not exists origin_pipeline_item_id uuid;

alter table public.client_contracts drop constraint if exists client_contracts_contract_type_check;
alter table public.client_contracts add constraint client_contracts_contract_type_check
  check (contract_type in ('standard', 'renewal', 'add_on'));
alter table public.client_contracts drop constraint if exists client_contracts_billing_cadence_check;
alter table public.client_contracts add constraint client_contracts_billing_cadence_check
  check (billing_cadence in ('fixed_term', 'month_to_month', 'open_ended', 'unknown'));
alter table public.client_contracts drop constraint if exists client_contracts_currency_code_check;
alter table public.client_contracts add constraint client_contracts_currency_code_check
  check (currency_code ~ '^[A-Z]{3}$');

alter table public.client_pipeline_items
  add column if not exists result_contract_id uuid,
  add column if not exists target_offer_id text,
  add column if not exists automation_key text;

alter table public.client_contracts drop constraint if exists client_contracts_origin_pipeline_item_fkey;
alter table public.client_contracts add constraint client_contracts_origin_pipeline_item_fkey
  foreign key (origin_pipeline_item_id) references public.client_pipeline_items(id) on delete set null;
alter table public.client_pipeline_items drop constraint if exists client_pipeline_items_result_contract_fkey;
alter table public.client_pipeline_items add constraint client_pipeline_items_result_contract_fkey
  foreign key (result_contract_id) references public.client_contracts(id) on delete set null;
alter table public.client_pipeline_items drop constraint if exists client_pipeline_items_target_offer_fkey;
alter table public.client_pipeline_items add constraint client_pipeline_items_target_offer_fkey
  foreign key (target_offer_id) references public.company_offers(glide_row_id) on delete set null;

drop index if exists public.client_pipeline_items_pipeline_contract_unique_idx;
create unique index if not exists client_pipeline_items_active_source_contract_unique_idx
  on public.client_pipeline_items(company_id, source_contract_id)
  where source_contract_id is not null and archived_at is null;
create unique index if not exists client_pipeline_items_active_automation_key_unique_idx
  on public.client_pipeline_items(company_id, automation_key)
  where automation_key is not null and archived_at is null;

alter table public.company_pipelines
  add column if not exists auto_create_renewal_items boolean not null default false;
create unique index if not exists company_pipelines_one_active_auto_renewal_idx
  on public.company_pipelines(company_id)
  where pipeline_type = 'renewal' and is_enabled and auto_create_renewal_items and archived_at is null;

create table if not exists public.pipeline_automation_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  pipeline_id uuid references public.company_pipelines(id) on delete set null,
  run_key text not null,
  as_of_at timestamptz not null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  candidate_count integer not null default 0 check (candidate_count >= 0),
  created_count integer not null default 0 check (created_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  exclusion_counts jsonb not null default '{}'::jsonb,
  error_summary text,
  requested_by_auth_user_id uuid references auth.users(id) on delete set null,
  requested_by_member_id uuid references public.company_members(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(company_id, run_key)
);
create index if not exists pipeline_automation_runs_company_created_idx
  on public.pipeline_automation_runs(company_id, created_at desc);
alter table public.pipeline_automation_runs enable row level security;
drop policy if exists "pipeline_automation_runs_no_anon_access" on public.pipeline_automation_runs;
create policy "pipeline_automation_runs_no_anon_access" on public.pipeline_automation_runs
  for all to anon using (false) with check (false);
drop policy if exists "pipeline_automation_runs_authenticated_read" on public.pipeline_automation_runs;
create policy "pipeline_automation_runs_authenticated_read" on public.pipeline_automation_runs
  for select to authenticated using (
    (select public.is_retainos_super_admin_bound())
    or (
      company_id = (select public.current_actor_app_policy_company_id())
      and (select public.current_actor_app_policy_role()) in ('director','support')
    )
  );
revoke insert, update, delete, truncate, references, trigger on public.pipeline_automation_runs from anon, authenticated;
grant all on public.pipeline_automation_runs to service_role;

alter table public.company_task_templates
  add column if not exists applies_to_pipeline_id uuid,
  add column if not exists applies_to_pipeline_stage_id uuid,
  add column if not exists pipeline_due_date_source text not null default 'transition_at';
alter table public.company_task_templates drop constraint if exists company_task_templates_trigger_type_check;
alter table public.company_task_templates add constraint company_task_templates_trigger_type_check
  check (trigger_type in ('manual','client_created','milestone_completed','pipeline_stage_entered'));
alter table public.company_task_templates drop constraint if exists company_task_templates_assign_to_type_check;
alter table public.company_task_templates add constraint company_task_templates_assign_to_type_check
  check (assign_to_type in ('assigned_csm','director','support','specific_member','unassigned','pipeline_owner'));
alter table public.company_task_templates drop constraint if exists company_task_templates_pipeline_due_source_check;
alter table public.company_task_templates add constraint company_task_templates_pipeline_due_source_check
  check (pipeline_due_date_source in ('transition_at','follow_up_at'));
alter table public.company_task_templates drop constraint if exists company_task_templates_pipeline_fkey;
alter table public.company_task_templates add constraint company_task_templates_pipeline_fkey
  foreign key (applies_to_pipeline_id) references public.company_pipelines(id) on delete set null;
alter table public.company_task_templates drop constraint if exists company_task_templates_pipeline_stage_fkey;
alter table public.company_task_templates add constraint company_task_templates_pipeline_stage_fkey
  foreign key (applies_to_pipeline_stage_id) references public.company_pipeline_stages(id) on delete set null;

alter table public.client_tasks
  add column if not exists pipeline_item_id uuid,
  add column if not exists pipeline_stage_event_id uuid,
  add column if not exists task_template_id uuid;
alter table public.client_tasks drop constraint if exists client_tasks_pipeline_item_fkey;
alter table public.client_tasks add constraint client_tasks_pipeline_item_fkey
  foreign key (pipeline_item_id) references public.client_pipeline_items(id) on delete set null;
alter table public.client_tasks drop constraint if exists client_tasks_pipeline_stage_event_fkey;
alter table public.client_tasks add constraint client_tasks_pipeline_stage_event_fkey
  foreign key (pipeline_stage_event_id) references public.client_pipeline_stage_events(id) on delete set null;
alter table public.client_tasks drop constraint if exists client_tasks_task_template_fkey;
alter table public.client_tasks add constraint client_tasks_task_template_fkey
  foreign key (task_template_id) references public.company_task_templates(id) on delete set null;
alter table public.client_tasks drop constraint if exists client_tasks_stage_event_template_unique;
alter table public.client_tasks add constraint client_tasks_stage_event_template_unique
  unique(pipeline_stage_event_id, task_template_id);
create index if not exists client_tasks_pipeline_item_idx on public.client_tasks(pipeline_item_id);

create or replace function public.create_pipeline_tasks_for_stage_event(
  p_company_id uuid, p_item_id uuid, p_stage_event_id uuid, p_transition_at timestamptz default now()
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_item public.client_pipeline_items%rowtype; v_client public.clients%rowtype;
  v_pipeline public.company_pipelines%rowtype; v_stage public.company_pipeline_stages%rowtype;
  v_template public.company_task_templates%rowtype; v_event public.client_pipeline_stage_events%rowtype;
  v_company_legacy text; v_assignee text; v_task_id uuid; v_count integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text, 0));
  select * into strict v_item from public.client_pipeline_items where id=p_item_id and company_id=p_company_id;
  select * into strict v_client from public.clients where id=v_item.client_id and company_id=p_company_id;
  select * into strict v_pipeline from public.company_pipelines where id=v_item.pipeline_id and company_id=p_company_id;
  select * into strict v_stage from public.company_pipeline_stages where id=v_item.stage_id and pipeline_id=v_item.pipeline_id;
  select * into strict v_event from public.client_pipeline_stage_events where id=p_stage_event_id and item_id=p_item_id;
  select legacy_glide_row_id into v_company_legacy from public.companies where id=p_company_id;
  if coalesce(v_pipeline.automation_settings->>'automation_paused','false') = 'true'
     or coalesce(v_pipeline.automation_settings->>'stage_task_creation_enabled','false') <> 'true'
  then return 0; end if;
  for v_template in
    select * from public.company_task_templates
    where company_id=p_company_id and trigger_type='pipeline_stage_entered' and is_enabled
      and archived_at is null and applies_to_pipeline_id=v_item.pipeline_id
      and applies_to_pipeline_stage_id=v_item.stage_id order by position,id
  loop
    v_assignee := case v_template.assign_to_type
      when 'pipeline_owner' then null
      when 'assigned_csm' then v_client.csm_team_member_id
      when 'specific_member' then v_template.assigned_member_legacy_id
      else null end;
    if v_template.assign_to_type='pipeline_owner' and v_item.owner_member_id is not null then
      select coalesce(legacy_glide_row_id,id::text) into v_assignee
      from public.company_members where id=v_item.owner_member_id and company_id=p_company_id
        and status='active' and archived_at is null;
    end if;
    if v_template.assign_to_type='specific_member' then
      select legacy_glide_row_id into v_assignee from public.company_members
      where company_id=p_company_id and legacy_glide_row_id=v_template.assigned_member_legacy_id
        and status='active' and archived_at is null;
      if v_assignee is null then raise exception 'Pipeline task template % has no active same-company specific assignee',v_template.id; end if;
    end if;
    if v_template.assign_to_type in ('director','support') then
      select coalesce(legacy_glide_row_id,id::text) into v_assignee from public.company_members
       where company_id=p_company_id and role=v_template.assign_to_type and status='active' and archived_at is null
       order by created_at limit 1;
    end if;
    insert into public.client_tasks(company_id,company_glide_row_id,glide_row_id,client_id,task_name,
      task_description,task_due_date,assigned_to_id,priority,status_value,pipeline_item_id,
      pipeline_stage_event_id,task_template_id,metadata)
    values(p_company_id,coalesce(v_company_legacy,p_company_id::text),gen_random_uuid()::text,v_client.glide_row_id,
      coalesce(replace(replace(replace(v_template.name,'{client_name}',coalesce(v_client.client_name,'Client')),
        '{pipeline_name}',coalesce(v_pipeline.name,'Pipeline')),'{stage_name}',coalesce(v_stage.name,'Stage')),'Pipeline follow-up'),
      v_template.description,
      (case when v_template.pipeline_due_date_source='follow_up_at' then coalesce(v_item.follow_up_at,p_transition_at) else p_transition_at end)
        + make_interval(days=>v_template.due_offset_days),v_assignee,v_template.priority,v_template.status_value,
      p_item_id,p_stage_event_id,v_template.id,jsonb_build_object('source','pipeline_stage_template'))
    on conflict (pipeline_stage_event_id,task_template_id) do nothing returning id into v_task_id;
    if v_task_id is not null then
      v_count := v_count+1;
      insert into public.client_history_events(company_id,legacy_client_glide_row_id,actor_auth_user_id,actor_member_id,
        event_type,source,title,summary,payload)
      values(p_company_id,v_client.glide_row_id,v_event.actor_auth_user_id,v_event.actor_member_id,'task_created',
        'pipeline_automation','Pipeline task created',v_template.name,
        jsonb_build_object('task_id',v_task_id,'pipeline_item_id',p_item_id,'stage_event_id',p_stage_event_id,'template_id',v_template.id));
      insert into public.app_audit_events(company_id,actor_auth_user_id,actor_member_id,event_type,source,entity_table,entity_id,
        legacy_glide_row_id,title,summary,after_data)
      values(p_company_id,v_event.actor_auth_user_id,v_event.actor_member_id,'pipeline_task_created','pipeline_automation',
        'client_tasks',v_task_id,v_client.glide_row_id,'Pipeline task created',v_template.name,
        jsonb_build_object('pipeline_item_id',p_item_id,'stage_event_id',p_stage_event_id,'template_id',v_template.id));
    end if;
    v_task_id := null;
  end loop;
  return v_count;
end $$;

-- Centralize stage-template task generation at the append-only evidence row.
-- This covers the Phase 0-2 mutation RPC and future service writers. Explicit
-- workflow calls may invoke the helper again; the stage-event/template unique
-- constraint makes those calls retry-safe and prevents duplicate tasks.
create or replace function public.create_pipeline_tasks_after_stage_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.event_type in ('created','stage_changed') and new.to_stage_id is not null then
    perform public.create_pipeline_tasks_for_stage_event(new.company_id,new.item_id,new.id,new.created_at);
  end if;
  return new;
end $$;

drop trigger if exists client_pipeline_stage_events_create_template_tasks
  on public.client_pipeline_stage_events;
create trigger client_pipeline_stage_events_create_template_tasks
after insert on public.client_pipeline_stage_events
for each row execute function public.create_pipeline_tasks_after_stage_event();

create or replace function public.create_expansion_pipeline_item_with_target(
  p_company_id uuid,
  p_client_id uuid,
  p_pipeline_id uuid,
  p_stage_id uuid,
  p_owner_member_id uuid,
  p_client_name_snapshot text,
  p_client_business_snapshot text,
  p_pathway_id_snapshot text,
  p_pathway_name_snapshot text,
  p_estimated_value_cents bigint,
  p_currency_code text,
  p_expected_close_at timestamptz,
  p_follow_up_at timestamptz,
  p_current_note text,
  p_metadata jsonb,
  p_target_offer_id text,
  p_actor_auth_user_id uuid,
  p_actor_member_id uuid,
  p_actor_role text
) returns public.client_pipeline_items language plpgsql security definer set search_path = '' as $$
declare
  v_client public.clients%rowtype;
  v_item public.client_pipeline_items%rowtype;
  v_event_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text,0));
  if not public.is_company_pipeline_enabled(p_company_id) then raise exception 'Pipeline is disabled for this company'; end if;
  select * into strict v_client from public.clients
    where id=p_client_id and company_id=p_company_id and archived_at is null;
  if not exists(
    select 1 from public.company_pipelines p
    join public.company_pipeline_stages s on s.pipeline_id=p.id and s.company_id=p.company_id
    where p.id=p_pipeline_id and p.company_id=p_company_id and p.pipeline_type='expansion'
      and p.is_enabled and p.archived_at is null and s.id=p_stage_id and s.stage_type='open'
      and s.is_enabled and s.archived_at is null
  ) then raise exception 'Enabled Expansion pipeline and open entry stage are required'; end if;
  if p_target_offer_id is not null and (
    nullif(btrim(p_target_offer_id),'') is null or not exists(
      select 1 from public.company_offers o where o.glide_row_id=p_target_offer_id and o.company_id=p_company_id
        and o.status='active' and o.archived_at is null
    )
  ) then raise exception 'Target offer must be active and belong to the company'; end if;
  if p_owner_member_id is not null and not exists(
    select 1 from public.company_members m where m.id=p_owner_member_id and m.company_id=p_company_id
      and m.status='active' and m.archived_at is null
  ) then raise exception 'Owner must be an active same-company member'; end if;

  insert into public.client_pipeline_items(company_id,client_id,pipeline_id,stage_id,owner_member_id,
    client_name_snapshot,client_business_snapshot,pathway_id_snapshot,pathway_name_snapshot,
    estimated_value_cents,currency_code,expected_close_at,follow_up_at,current_note,lifecycle_status,
    target_offer_id,metadata)
  values(p_company_id,p_client_id,p_pipeline_id,p_stage_id,p_owner_member_id,
    coalesce(nullif(btrim(p_client_name_snapshot),''),v_client.client_name),
    coalesce(p_client_business_snapshot,v_client.client_business),p_pathway_id_snapshot,p_pathway_name_snapshot,
    p_estimated_value_cents,coalesce(nullif(upper(btrim(p_currency_code)),''),'USD'),p_expected_close_at,p_follow_up_at,
    p_current_note,'open',p_target_offer_id,
    coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('client_legacy_id',v_client.glide_row_id,'target_offer_id',p_target_offer_id))
  returning * into v_item;

  insert into public.client_pipeline_stage_events(company_id,pipeline_id,item_id,to_stage_id,actor_auth_user_id,
    actor_member_id,event_type,note,after_data,metadata)
  values(p_company_id,p_pipeline_id,v_item.id,p_stage_id,p_actor_auth_user_id,p_actor_member_id,'created',p_current_note,
    to_jsonb(v_item),jsonb_build_object('actor_role',p_actor_role,'activity','created','target_offer_id',p_target_offer_id))
  returning id into v_event_id;

  insert into public.client_history_events(company_id,legacy_client_glide_row_id,actor_auth_user_id,actor_member_id,
    event_type,source,title,summary,next_contact_at,notes,payload)
  values(p_company_id,v_client.glide_row_id,p_actor_auth_user_id,p_actor_member_id,'pipeline_activity',
    'pipeline_workspace','Expansion opportunity created',v_item.client_name_snapshot||': expansion opportunity created.',
    v_item.follow_up_at,p_current_note,jsonb_build_object('pipeline_item_id',v_item.id,'pipeline_id',p_pipeline_id,
      'stage_id',p_stage_id,'stage_event_id',v_event_id,'target_offer_id',p_target_offer_id,'activity','created'));

  insert into public.app_audit_events(company_id,actor_auth_user_id,actor_member_id,event_type,source,entity_table,
    entity_id,legacy_glide_row_id,title,summary,after_data,metadata)
  values(p_company_id,p_actor_auth_user_id,p_actor_member_id,'pipeline_item_created','pipeline_workspace',
    'client_pipeline_items',v_item.id,v_client.glide_row_id,'Expansion opportunity created',
    v_item.client_name_snapshot||': expansion opportunity created.',to_jsonb(v_item),
    jsonb_build_object('actor_role',p_actor_role,'stage_event_id',v_event_id,'target_offer_id',p_target_offer_id));
  return v_item;
end $$;

create or replace function public.set_pipeline_item_target_offer_with_evidence(
  p_company_id uuid,p_item_id uuid,p_target_offer_id text,p_actor_auth_user_id uuid,
  p_actor_member_id uuid,p_actor_role text
) returns public.client_pipeline_items language plpgsql security definer set search_path = '' as $$
declare
  v_item public.client_pipeline_items%rowtype;
  v_before jsonb;
  v_event_id uuid;
  v_client public.clients%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text,0));
  if not public.is_company_pipeline_enabled(p_company_id) then raise exception 'Pipeline is disabled for this company'; end if;
  select i.* into strict v_item from public.client_pipeline_items i
  join public.company_pipelines p on p.id=i.pipeline_id and p.company_id=i.company_id
  where i.id=p_item_id and i.company_id=p_company_id and i.lifecycle_status='open' and i.archived_at is null
    and p.pipeline_type='expansion' and p.is_enabled and p.archived_at is null for update of i;
  if p_target_offer_id is not null and (
    nullif(btrim(p_target_offer_id),'') is null or not exists(
      select 1 from public.company_offers o where o.glide_row_id=p_target_offer_id and o.company_id=p_company_id
        and o.status='active' and o.archived_at is null
    )
  ) then raise exception 'Target offer must be active and belong to the company'; end if;
  select * into strict v_client from public.clients where id=v_item.client_id and company_id=p_company_id;
  v_before:=to_jsonb(v_item);
  update public.client_pipeline_items set target_offer_id=p_target_offer_id,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('target_offer_id',p_target_offer_id)
  where id=p_item_id returning * into v_item;
  insert into public.client_pipeline_stage_events(company_id,pipeline_id,item_id,from_stage_id,to_stage_id,
    actor_auth_user_id,actor_member_id,event_type,note,before_data,after_data,metadata)
  values(p_company_id,v_item.pipeline_id,v_item.id,v_item.stage_id,v_item.stage_id,p_actor_auth_user_id,p_actor_member_id,
    'details_changed','Target offer updated.',v_before,to_jsonb(v_item),
    jsonb_build_object('actor_role',p_actor_role,'target_offer_id',p_target_offer_id)) returning id into v_event_id;
  insert into public.client_history_events(company_id,legacy_client_glide_row_id,actor_auth_user_id,actor_member_id,
    event_type,source,title,summary,payload)
  values(p_company_id,v_client.glide_row_id,p_actor_auth_user_id,p_actor_member_id,'pipeline_activity',
    'pipeline_workspace','Expansion target offer updated',v_item.client_name_snapshot||': target offer updated.',
    jsonb_build_object('pipeline_item_id',v_item.id,'stage_event_id',v_event_id,'target_offer_id',p_target_offer_id,
      'activity','details_changed'));
  insert into public.app_audit_events(company_id,actor_auth_user_id,actor_member_id,event_type,source,entity_table,
    entity_id,legacy_glide_row_id,title,summary,before_data,after_data,metadata)
  values(p_company_id,p_actor_auth_user_id,p_actor_member_id,'pipeline_item_target_offer_updated','pipeline_workspace',
    'client_pipeline_items',v_item.id,v_client.glide_row_id,'Expansion target offer updated',
    v_item.client_name_snapshot||': target offer updated.',v_before,to_jsonb(v_item),
    jsonb_build_object('actor_role',p_actor_role,'stage_event_id',v_event_id,'target_offer_id',p_target_offer_id));
  return v_item;
end $$;

create or replace function public.configure_pipeline_automation_with_audit(
  p_company_id uuid,
  p_pipeline_id uuid,
  p_auto_create_renewal_items boolean,
  p_renewal_generation_enabled boolean,
  p_entry_stage_id uuid,
  p_catch_up_days integer,
  p_offboard_sync_enabled boolean,
  p_stage_task_creation_enabled boolean,
  p_automation_paused boolean,
  p_actor_auth_user_id uuid,
  p_actor_member_id uuid,
  p_actor_role text
) returns public.company_pipelines language plpgsql security definer set search_path = '' as $$
declare
  v_pipeline public.company_pipelines%rowtype;
  v_before jsonb;
  v_catch_up_days integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text,0));
  if not public.is_company_pipeline_enabled(p_company_id) then
    raise exception 'Pipeline master gate is disabled for this company';
  end if;
  select * into strict v_pipeline from public.company_pipelines
  where id=p_pipeline_id and company_id=p_company_id and is_enabled and archived_at is null for update;
  if p_actor_member_id is not null and not exists(
    select 1 from public.company_members m where m.id=p_actor_member_id and m.company_id=p_company_id
      and m.status='active' and m.archived_at is null
  ) then raise exception 'Actor member must be active and belong to the company'; end if;

  v_catch_up_days:=coalesce(p_catch_up_days,30);
  if v_catch_up_days not between 0 and 365 then raise exception 'Catch-up days must be between 0 and 365'; end if;
  if v_pipeline.pipeline_type<>'renewal' and (
    coalesce(p_auto_create_renewal_items,false)
    or coalesce(p_renewal_generation_enabled,false)
    or coalesce(p_offboard_sync_enabled,false)
    or p_entry_stage_id is not null
  ) then raise exception 'Renewal generation and offboard synchronization settings require a Renewal pipeline'; end if;
  if v_pipeline.pipeline_type='renewal'
     and (coalesce(p_auto_create_renewal_items,false) or coalesce(p_renewal_generation_enabled,false))
     and p_entry_stage_id is null then
    raise exception 'An active open entry stage is required for renewal generation';
  end if;
  if p_entry_stage_id is not null and not exists(
    select 1 from public.company_pipeline_stages s
    where s.id=p_entry_stage_id and s.pipeline_id=p_pipeline_id and s.company_id=p_company_id
      and s.stage_type='open' and s.is_enabled and s.archived_at is null
  ) then raise exception 'Entry stage must be active, open, and belong to this pipeline'; end if;

  v_before:=to_jsonb(v_pipeline);
  update public.company_pipelines
  set auto_create_renewal_items=case when pipeline_type='renewal' then coalesce(p_auto_create_renewal_items,false) else false end,
      automation_settings=coalesce(automation_settings,'{}'::jsonb)||jsonb_build_object(
        'renewal_generation_enabled',case when pipeline_type='renewal' then coalesce(p_renewal_generation_enabled,false) else false end,
        'entry_stage_id',case when pipeline_type='renewal' and p_entry_stage_id is not null then to_jsonb(p_entry_stage_id::text) else 'null'::jsonb end,
        'catch_up_days',v_catch_up_days,
        'offboard_sync_enabled',case when pipeline_type='renewal' then coalesce(p_offboard_sync_enabled,false) else false end,
        'stage_task_creation_enabled',coalesce(p_stage_task_creation_enabled,false),
        'automation_paused',coalesce(p_automation_paused,false)
      )
  where id=p_pipeline_id and company_id=p_company_id returning * into v_pipeline;

  insert into public.app_audit_events(company_id,actor_auth_user_id,actor_member_id,event_type,source,entity_table,
    entity_id,title,summary,before_data,after_data,metadata)
  values(p_company_id,p_actor_auth_user_id,p_actor_member_id,'pipeline_automation_configured','pipeline_admin',
    'company_pipelines',v_pipeline.id,'Pipeline automation configured',v_pipeline.name||': automation settings updated.',
    v_before,to_jsonb(v_pipeline),jsonb_build_object('actor_role',p_actor_role));
  return v_pipeline;
end $$;

create or replace function public.preview_due_renewal_pipeline_items(p_company_id uuid,p_pipeline_id uuid,p_as_of timestamptz default now())
returns table(contract_id uuid,client_id uuid,pipeline_id uuid,entry_stage_id uuid,contract_end_at timestamptz,
  eligibility_status text,exclusion_reason text,estimated_value_cents bigint,currency_code text)
language plpgsql security definer set search_path = '' as $$
declare v_pipeline public.company_pipelines%rowtype; v_stage uuid; v_catchup integer;
begin
  -- Preview is deliberately available while execution remains paused. The
  -- generation function repeats every execution kill-switch check before it
  -- can create a run or an item.
  select p.* into v_pipeline from public.company_pipelines p join public.company_settings s on s.company_id=p.company_id
   where p.company_id=p_company_id and p.id=p_pipeline_id and p.pipeline_type='renewal' and p.is_enabled
     and p.archived_at is null and s.enable_pipeline;
  if not found then raise exception 'No enabled renewal pipeline for company %',p_company_id; end if;
  begin v_stage := (v_pipeline.automation_settings->>'entry_stage_id')::uuid; exception when others then raise exception 'Renewal entry_stage_id is required'; end;
  if not exists(select 1 from public.company_pipeline_stages st where st.id=v_stage and st.pipeline_id=v_pipeline.id and st.stage_type='open' and st.is_enabled and st.archived_at is null)
    then raise exception 'Renewal entry_stage_id is not an active open stage'; end if;
  v_catchup := least(greatest(coalesce((v_pipeline.automation_settings->>'catch_up_days')::integer,30),0),365);
  return query
  select c.id,cl.id,v_pipeline.id,v_stage,c.end_date,
    case when x.reason is null then 'eligible' else 'excluded' end,
    x.reason,
    case when v_pipeline.value_source='fixed' then v_pipeline.default_estimated_value_cents
         when v_pipeline.value_source='current_contract' then round(coalesce(c.total_contract_value,c.monthly_value,0)*100)::bigint else null end,
    coalesce(c.currency_code,v_pipeline.currency_code)
  from public.client_contracts c join public.clients cl on cl.company_id=c.company_id and cl.glide_row_id=c.client_id
  cross join lateral (select case
    when c.archived_at is not null or lower(coalesce(c.status,''))='archived' then 'archived_contract'
    when cl.archived_at is not null then 'archived_client'
    when lower(coalesce(cl.program_status_value,''))='off-boarded' then 'offboarded_client'
    when lower(coalesce(cl.program_status_value,'')) in ('paused','suspended')
      and coalesce(v_pipeline.entry_rules->>('include_'||lower(cl.program_status_value)),'false')<>'true' then 'paused_or_suspended_client'
    when c.end_date is null then 'open_or_missing_end'
    when c.end_date::date=date '2075-01-01' then 'placeholder_end_date'
    when c.billing_cadence in ('open_ended','unknown') then 'open_or_unknown_cadence'
    when c.billing_cadence='month_to_month' and coalesce(v_pipeline.entry_rules->>'include_month_to_month','false')<>'true' then 'month_to_month'
    when c.auto_renew and coalesce(v_pipeline.entry_rules->>'include_auto_renew','false')<>'true' then 'auto_renew'
    when c.end_date < p_as_of-make_interval(days=>v_catchup) then 'outside_catch_up_window'
    when c.end_date > p_as_of+make_interval(days=>v_pipeline.renewal_lead_days) then 'not_due_yet'
    when exists(select 1 from public.client_pipeline_items i where i.company_id=p_company_id and i.source_contract_id=c.id and i.archived_at is null) then 'already_exists'
    else null end as reason) x
  where c.company_id=p_company_id;
end $$;

create or replace function public.generate_due_renewal_pipeline_items(
 p_company_id uuid,p_as_of timestamptz,p_run_key text,p_requested_by_auth_user_id uuid,p_requested_by_member_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_run public.pipeline_automation_runs%rowtype; v_row record; v_item public.client_pipeline_items%rowtype;
 v_event uuid; v_created integer:=0; v_skipped integer:=0; v_items jsonb:='[]'::jsonb; v_client public.clients%rowtype;
 v_pipeline_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text,0));
  select p.id into v_pipeline_id
  from public.company_pipelines p join public.company_settings s on s.company_id=p.company_id
  where p.company_id=p_company_id and p.pipeline_type='renewal' and p.is_enabled and p.auto_create_renewal_items
    and p.archived_at is null and s.enable_pipeline
    and coalesce(p.automation_settings->>'automation_paused','false')<>'true'
    and coalesce(p.automation_settings->>'renewal_generation_enabled','false')='true';
  if v_pipeline_id is null then raise exception 'No enabled automatic renewal pipeline for company %',p_company_id; end if;

  insert into public.pipeline_automation_runs(company_id,pipeline_id,run_key,as_of_at,requested_by_auth_user_id,requested_by_member_id)
  values(p_company_id,v_pipeline_id,p_run_key,p_as_of,p_requested_by_auth_user_id,p_requested_by_member_id)
  -- A run key is an immutable idempotency key. The no-op update returns the
  -- original row without resetting completed status, counts, or timestamps.
  on conflict(company_id,run_key) do update set run_key=excluded.run_key returning * into v_run;
  if v_run.pipeline_id is distinct from v_pipeline_id
     or v_run.as_of_at is distinct from p_as_of
     or v_run.requested_by_auth_user_id is distinct from p_requested_by_auth_user_id
     or v_run.requested_by_member_id is distinct from p_requested_by_member_id
  then
    raise exception 'Automation run key % was already bound to different immutable inputs',p_run_key;
  end if;
  if v_run.status='completed' then return jsonb_build_object('created_count',v_run.created_count,'skipped_count',v_run.skipped_count,'items','[]'::jsonb); end if;
  begin
    for v_row in select * from public.preview_due_renewal_pipeline_items(p_company_id,v_pipeline_id,p_as_of) loop
      if v_row.eligibility_status<>'eligible' then v_skipped:=v_skipped+1; continue; end if;
      select * into v_client from public.clients where id=v_row.client_id;
      insert into public.client_pipeline_items(company_id,client_id,pipeline_id,stage_id,source_contract_id,automation_key,
      client_name_snapshot,client_business_snapshot,pathway_id_snapshot,estimated_value_cents,currency_code,renewal_at,
      lifecycle_status,metadata)
      values(p_company_id,v_client.id,v_row.pipeline_id,v_row.entry_stage_id,v_row.contract_id,'renewal_contract:'||v_row.contract_id,
      v_client.client_name,v_client.client_business,v_client.offer_milestones_current_offer_id,v_row.estimated_value_cents,
      v_row.currency_code,v_row.contract_end_at,'open',jsonb_build_object('client_legacy_id',v_client.glide_row_id,'automation_run_id',v_run.id))
      on conflict(company_id,automation_key) where automation_key is not null and archived_at is null do nothing returning * into v_item;
      if v_item.id is null then v_skipped:=v_skipped+1; continue; end if;
      insert into public.client_pipeline_stage_events(company_id,pipeline_id,item_id,to_stage_id,actor_auth_user_id,actor_member_id,
      event_type,after_data,metadata) values(p_company_id,v_item.pipeline_id,v_item.id,v_item.stage_id,p_requested_by_auth_user_id,
      p_requested_by_member_id,'created',to_jsonb(v_item),jsonb_build_object('automation_run_id',v_run.id)) returning id into v_event;
      insert into public.client_history_events(company_id,legacy_client_glide_row_id,actor_auth_user_id,actor_member_id,event_type,
      source,title,summary,next_contact_at,payload) values(p_company_id,v_client.glide_row_id,p_requested_by_auth_user_id,
      p_requested_by_member_id,'pipeline_activity','pipeline_automation','Renewal item created',v_client.client_name||': renewal item created.',
      v_item.follow_up_at,jsonb_build_object('pipeline_item_id',v_item.id,'stage_event_id',v_event,'source_contract_id',v_row.contract_id));
      insert into public.app_audit_events(company_id,actor_auth_user_id,actor_member_id,event_type,source,entity_table,entity_id,
      legacy_glide_row_id,title,summary,after_data,metadata) values(p_company_id,p_requested_by_auth_user_id,p_requested_by_member_id,
      'pipeline_item_created','pipeline_automation','client_pipeline_items',v_item.id,v_client.glide_row_id,'Renewal item created',
      v_client.client_name||': renewal item created.',to_jsonb(v_item),jsonb_build_object('automation_run_id',v_run.id));
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

create or replace function public.create_contract_and_close_pipeline_item(
 p_company_id uuid,p_item_id uuid,p_start_date timestamptz,p_end_date timestamptz,p_contract_days numeric,
 p_monthly_value numeric,p_total_contract_value numeric,p_auto_renew boolean,p_note text,p_target_offer_id text,
 p_actor_auth_user_id uuid,p_actor_member_id uuid,p_actor_role text,
 p_retention_target_status text default null,p_mark_success boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_item public.client_pipeline_items%rowtype; v_before jsonb; v_client public.clients%rowtype;
 v_pipeline public.company_pipelines%rowtype; v_stage uuid; v_contract public.client_contracts%rowtype; v_event uuid; v_type text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text,0));
  if not public.is_company_pipeline_enabled(p_company_id) then raise exception 'Pipeline is disabled for this company'; end if;
  select * into strict v_item from public.client_pipeline_items where id=p_item_id and company_id=p_company_id for update;
  if v_item.lifecycle_status<>'open' then raise exception 'Pipeline item is not open'; end if;
  select * into strict v_pipeline from public.company_pipelines where id=v_item.pipeline_id and company_id=p_company_id;
  if not v_pipeline.is_enabled or v_pipeline.archived_at is not null then raise exception 'Pipeline is not enabled'; end if;
  if v_pipeline.pipeline_type='renewal' and p_target_offer_id is not null then raise exception 'Renewal contracts cannot set a target offer'; end if;
  if v_pipeline.pipeline_type='renewal' and p_retention_target_status is not null
     and p_retention_target_status not in ('front-end','back-end') then
    raise exception 'Renewal retention target status must be front-end or back-end';
  end if;
  if p_target_offer_id is not null and not exists(
    select 1 from public.company_offers where glide_row_id=p_target_offer_id and company_id=p_company_id and archived_at is null
  ) then raise exception 'Target offer does not belong to the company'; end if;
  select * into strict v_client from public.clients where id=v_item.client_id and company_id=p_company_id;
  select id into strict v_stage from public.company_pipeline_stages where pipeline_id=v_item.pipeline_id and stage_type='won' and is_enabled and archived_at is null;
  v_type:=case when v_pipeline.pipeline_type='renewal' then 'renewal' else 'add_on' end;
  insert into public.client_contracts(company_id,company_glide_row_id,glide_row_id,client_id,start_date,end_date,contract_days,
    monthly_value,total_contract_value,notes,auto_renew,status,contract_type,billing_cadence,currency_code,origin_pipeline_item_id,metadata)
  values(p_company_id,v_client.company_glide_row_id,gen_random_uuid()::text,v_client.glide_row_id,p_start_date,p_end_date,p_contract_days,
    p_monthly_value,p_total_contract_value,p_note,coalesce(p_auto_renew,false),'active',v_type,
    case when p_end_date is null then 'open_ended' else 'fixed_term' end,v_item.currency_code,p_item_id,
    jsonb_build_object('source','pipeline_workspace','actor_role',p_actor_role,'target_offer_id',p_target_offer_id)) returning * into v_contract;
  v_before:=to_jsonb(v_item);
  update public.client_pipeline_items set stage_id=v_stage,result_contract_id=v_contract.id,target_offer_id=coalesce(p_target_offer_id,target_offer_id),
    actual_value_cents=round(coalesce(p_total_contract_value,p_monthly_value,0)*100)::bigint,lifecycle_status='won',outcome='won',
    current_note=coalesce(p_note,current_note),follow_up_at=null where id=p_item_id returning * into v_item;
  if v_type='renewal' then
    update public.clients set current_contract_start_date=p_start_date,current_contract_end_date=p_end_date,
      current_contract_end_date_for_filtering=p_end_date,current_contract_of_days=p_contract_days,
      current_contract_monthly_value=p_monthly_value,current_contract_auto_renew=p_auto_renew,current_contract_notes=p_note,
      program_status_value=coalesce(p_retention_target_status,program_status_value),
      client_age_date_offboarded=case when p_retention_target_status is not null then null else client_age_date_offboarded end,
      client_age_date_offboarded_for_filtering=case when p_retention_target_status is not null then null else client_age_date_offboarded_for_filtering end,
      program_latest_back_end_start_date=case
        when p_retention_target_status='back-end' and program_status_value is distinct from 'back-end' then now()
        else program_latest_back_end_start_date end,
      outcomes_success_value=case when coalesce(p_mark_success,false) then 'yes' else outcomes_success_value end,
      outcomes_success_value_for_filtering=case when coalesce(p_mark_success,false) then 'yes' else outcomes_success_value_for_filtering end,
      outcomes_success_date=case when coalesce(p_mark_success,false) then now() else outcomes_success_date end
      where id=v_client.id returning * into v_client;
  end if;
  insert into public.client_pipeline_stage_events(company_id,pipeline_id,item_id,from_stage_id,to_stage_id,actor_auth_user_id,
    actor_member_id,event_type,note,before_data,after_data,metadata) values(p_company_id,v_item.pipeline_id,v_item.id,
    (v_before->>'stage_id')::uuid,v_stage,p_actor_auth_user_id,p_actor_member_id,'stage_changed',p_note,v_before,to_jsonb(v_item),
    jsonb_build_object('actor_role',p_actor_role,'result_contract_id',v_contract.id)) returning id into v_event;
  insert into public.client_history_events(company_id,legacy_client_glide_row_id,actor_auth_user_id,actor_member_id,event_type,
    source,title,summary,notes,payload) values(p_company_id,v_client.glide_row_id,p_actor_auth_user_id,p_actor_member_id,
    'contract_created','pipeline_workspace','Contract created and pipeline won',v_client.client_name,p_note,
    jsonb_build_object('pipeline_item_id',v_item.id,'result_contract_id',v_contract.id,'stage_event_id',v_event));
  insert into public.client_history_events(company_id,legacy_client_glide_row_id,actor_auth_user_id,actor_member_id,event_type,
    source,title,summary,notes,payload) values(p_company_id,v_client.glide_row_id,p_actor_auth_user_id,p_actor_member_id,
    'pipeline_activity','pipeline_workspace','Pipeline item won',v_client.client_name,p_note,
    jsonb_build_object('pipeline_item_id',v_item.id,'result_contract_id',v_contract.id,'stage_event_id',v_event));
  if v_type='renewal' then
    insert into public.client_history_events(company_id,legacy_client_glide_row_id,actor_auth_user_id,actor_member_id,event_type,
      source,title,summary,notes,success_status,payload)
    values(p_company_id,v_client.glide_row_id,p_actor_auth_user_id,p_actor_member_id,'client_retention_recorded',
      'pipeline_workspace','Client retained via renewal',
      'Recorded renewal'||case when p_end_date is not null then ' ending '||p_end_date::date::text else '' end||'.',p_note,
      case when coalesce(p_mark_success,false) then 'yes' else null end,
      jsonb_build_object('actor_role',p_actor_role,'retention_type','renewal','retention_date',p_start_date,
        'to_status',v_client.program_status_value,'success_marked',coalesce(p_mark_success,false),
        'pipeline_item_id',v_item.id,'result_contract_id',v_contract.id,'client',to_jsonb(v_client),'contract',to_jsonb(v_contract)));
  end if;
  insert into public.app_audit_events(company_id,actor_auth_user_id,actor_member_id,event_type,source,entity_table,entity_id,
    legacy_glide_row_id,title,summary,before_data,after_data,metadata) values(p_company_id,p_actor_auth_user_id,p_actor_member_id,
    'pipeline_item_won','pipeline_workspace','client_pipeline_items',v_item.id,v_client.glide_row_id,'Pipeline item won',
    v_client.client_name,v_before,to_jsonb(v_item),jsonb_build_object('result_contract_id',v_contract.id,'actor_role',p_actor_role));
  insert into public.app_audit_events(company_id,actor_auth_user_id,actor_member_id,event_type,source,entity_table,entity_id,
    legacy_glide_row_id,title,summary,after_data,metadata) values(p_company_id,p_actor_auth_user_id,p_actor_member_id,
    'contract_created','pipeline_workspace','client_contracts',v_contract.id,v_contract.glide_row_id,'Contract created',
    v_client.client_name,to_jsonb(v_contract),jsonb_build_object('pipeline_item_id',v_item.id,'actor_role',p_actor_role));
  perform public.create_pipeline_tasks_for_stage_event(p_company_id,v_item.id,v_event,now());
  return jsonb_build_object('item',to_jsonb(v_item),'contract',to_jsonb(v_contract),'client',to_jsonb(v_client));
end $$;

create or replace function public.resolve_pipeline_item_lost(
 p_company_id uuid,p_item_id uuid,p_loss_reason text,p_outcome text,p_note text,p_actor_auth_user_id uuid,
 p_actor_member_id uuid,p_actor_role text
) returns public.client_pipeline_items language plpgsql security definer set search_path = '' as $$
declare v_item public.client_pipeline_items%rowtype; v_before jsonb; v_stage uuid; v_event uuid; v_client public.clients%rowtype;
begin
  if nullif(btrim(p_loss_reason),'') is null then raise exception 'Loss reason is required'; end if;
  if coalesce(nullif(btrim(p_outcome),''),'lost') not in ('lost','offboarded','downgrade','extended_decision','moved_to_another_offer','duplicate','not_applicable')
    then raise exception 'Unsupported loss outcome'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text,0));
  if not public.is_company_pipeline_enabled(p_company_id) then raise exception 'Pipeline is disabled for this company'; end if;
  select * into strict v_item from public.client_pipeline_items where id=p_item_id and company_id=p_company_id for update;
  if v_item.lifecycle_status<>'open' then return v_item; end if;
  select * into strict v_client from public.clients where id=v_item.client_id;
  select id into strict v_stage from public.company_pipeline_stages where pipeline_id=v_item.pipeline_id and stage_type='lost' and is_enabled and archived_at is null;
  v_before:=to_jsonb(v_item);
  update public.client_pipeline_items set stage_id=v_stage,lifecycle_status='lost',outcome=coalesce(nullif(btrim(p_outcome),''),'lost'),
    loss_reason=p_loss_reason,current_note=coalesce(p_note,current_note),follow_up_at=null where id=p_item_id returning * into v_item;
  insert into public.client_pipeline_stage_events(company_id,pipeline_id,item_id,from_stage_id,to_stage_id,actor_auth_user_id,
    actor_member_id,event_type,note,before_data,after_data,metadata) values(p_company_id,v_item.pipeline_id,v_item.id,
    (v_before->>'stage_id')::uuid,v_stage,p_actor_auth_user_id,p_actor_member_id,'stage_changed',p_note,v_before,to_jsonb(v_item),
    jsonb_build_object('actor_role',p_actor_role,'outcome',v_item.outcome)) returning id into v_event;
  insert into public.client_history_events(company_id,legacy_client_glide_row_id,actor_auth_user_id,actor_member_id,event_type,
    source,title,summary,notes,payload) values(p_company_id,v_client.glide_row_id,p_actor_auth_user_id,p_actor_member_id,
    'pipeline_activity','pipeline_workspace','Pipeline item lost',v_client.client_name||': '||p_loss_reason,p_note,
    jsonb_build_object('pipeline_item_id',v_item.id,'stage_event_id',v_event,'outcome',v_item.outcome));
  insert into public.app_audit_events(company_id,actor_auth_user_id,actor_member_id,event_type,source,entity_table,entity_id,
    legacy_glide_row_id,title,summary,before_data,after_data,metadata) values(p_company_id,p_actor_auth_user_id,p_actor_member_id,
    'pipeline_item_lost','pipeline_workspace','client_pipeline_items',v_item.id,v_client.glide_row_id,'Pipeline item lost',p_loss_reason,
    v_before,to_jsonb(v_item),jsonb_build_object('actor_role',p_actor_role));
  perform public.create_pipeline_tasks_for_stage_event(p_company_id,v_item.id,v_event,now());
  return v_item;
end $$;

create or replace function public.close_renewal_pipeline_items_on_offboard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_item record;
begin
  if old.program_status_value is distinct from new.program_status_value and lower(coalesce(new.program_status_value,''))='off-boarded' then
    for v_item in select i.id from public.client_pipeline_items i join public.company_pipelines p on p.id=i.pipeline_id
      join public.company_settings s on s.company_id=i.company_id
      where i.client_id=new.id and i.lifecycle_status='open' and i.archived_at is null and p.pipeline_type='renewal'
        and p.is_enabled and p.archived_at is null and s.enable_pipeline
        and coalesce(p.automation_settings->>'automation_paused','false')<>'true'
        and coalesce(p.automation_settings->>'offboard_sync_enabled','false')='true'
    loop
      perform public.resolve_pipeline_item_lost(new.company_id,v_item.id,coalesce(nullif(new.churn_reason_value,''),'Client offboarded'),
        'offboarded','Client status changed to off-boarded.',null,null,'system');
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists clients_close_renewal_pipeline_on_offboard on public.clients;
create trigger clients_close_renewal_pipeline_on_offboard after update of program_status_value on public.clients
for each row execute function public.close_renewal_pipeline_items_on_offboard();

revoke all on function public.create_pipeline_tasks_for_stage_event(uuid,uuid,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.create_pipeline_tasks_after_stage_event() from public,anon,authenticated;
revoke all on function public.create_expansion_pipeline_item_with_target(uuid,uuid,uuid,uuid,uuid,text,text,text,text,bigint,text,timestamptz,timestamptz,text,jsonb,text,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.set_pipeline_item_target_offer_with_evidence(uuid,uuid,text,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.configure_pipeline_automation_with_audit(uuid,uuid,boolean,boolean,uuid,integer,boolean,boolean,boolean,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.preview_due_renewal_pipeline_items(uuid,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.generate_due_renewal_pipeline_items(uuid,timestamptz,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.create_contract_and_close_pipeline_item(uuid,uuid,timestamptz,timestamptz,numeric,numeric,numeric,boolean,text,text,uuid,uuid,text,text,boolean) from public,anon,authenticated;
revoke all on function public.resolve_pipeline_item_lost(uuid,uuid,text,text,text,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.close_renewal_pipeline_items_on_offboard() from public,anon,authenticated;
grant execute on function public.create_pipeline_tasks_for_stage_event(uuid,uuid,uuid,timestamptz) to service_role;
grant execute on function public.create_expansion_pipeline_item_with_target(uuid,uuid,uuid,uuid,uuid,text,text,text,text,bigint,text,timestamptz,timestamptz,text,jsonb,text,uuid,uuid,text) to service_role;
grant execute on function public.set_pipeline_item_target_offer_with_evidence(uuid,uuid,text,uuid,uuid,text) to service_role;
grant execute on function public.configure_pipeline_automation_with_audit(uuid,uuid,boolean,boolean,uuid,integer,boolean,boolean,boolean,uuid,uuid,text) to service_role;
grant execute on function public.preview_due_renewal_pipeline_items(uuid,uuid,timestamptz) to service_role;
grant execute on function public.generate_due_renewal_pipeline_items(uuid,timestamptz,text,uuid,uuid) to service_role;
grant execute on function public.create_contract_and_close_pipeline_item(uuid,uuid,timestamptz,timestamptz,numeric,numeric,numeric,boolean,text,text,uuid,uuid,text,text,boolean) to service_role;
grant execute on function public.resolve_pipeline_item_lost(uuid,uuid,text,text,text,uuid,uuid,text) to service_role;

comment on column public.company_pipelines.auto_create_renewal_items is 'Second renewal-generation kill switch; default false.';
comment on column public.client_pipeline_items.source_contract_id is 'Authoritative expiring contract that originated this item.';
comment on column public.client_pipeline_items.result_contract_id is 'New contract created when this item resolves Won.';
comment on column public.client_contracts.billing_cadence is
  'Safe default is unknown; existing contracts remain excluded from renewal generation until explicitly classified.';
notify pgrst, 'reload schema';
