-- Turn automated Suspended/MIA offboarding into an assigned, auditable
-- operational follow-up without coupling lifecycle correctness to task
-- creation. The task-template trigger is reusable by any company that enables
-- the existing Suspended/MIA auto-offboard policy.

alter table public.company_task_templates
  drop constraint if exists company_task_templates_trigger_type_check;
alter table public.company_task_templates
  add constraint company_task_templates_trigger_type_check
  check (
    trigger_type in (
      'manual',
      'client_created',
      'milestone_completed',
      'pipeline_stage_entered',
      'suspended_auto_offboard'
    )
  );

alter table public.client_tasks
  add column if not exists source_history_event_id uuid;

alter table public.client_tasks
  drop constraint if exists client_tasks_source_history_event_fkey;
alter table public.client_tasks
  add constraint client_tasks_source_history_event_fkey
  foreign key (source_history_event_id)
  references public.client_history_events(id)
  on delete set null;

create unique index if not exists client_tasks_auto_offboard_event_template_unique
  on public.client_tasks (source_history_event_id, task_template_id)
  where source_history_event_id is not null
    and task_template_id is not null;

create index if not exists client_tasks_auto_offboard_followup_open_idx
  on public.client_tasks (company_id, assigned_to_id, created_at)
  where archived_at is null
    and is_manually_archived = false
    and status_value in ('todo', 'in-progress', 'waiting')
    and metadata ->> 'follow_up_kind' = 'mia_auto_offboard';

create or replace function public.create_suspended_auto_offboard_followup_tasks(
  p_history_event_id uuid
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.client_history_events%rowtype;
  v_client public.clients%rowtype;
  v_template public.company_task_templates%rowtype;
  v_company_legacy_id text;
  v_assignee text;
  v_task_id uuid;
  v_task_name text;
  v_task_description text;
  v_assignment_fallback boolean;
  v_created integer := 0;
begin
  select history.*
    into v_event
  from public.client_history_events history
  where history.id = p_history_event_id
    and history.source = 'suspended_auto_offboard'
    and history.event_type = 'client_status_changed';

  if v_event.id is null then
    return 0;
  end if;

  select client.*
    into v_client
  from public.clients client
  where client.company_id = v_event.company_id
    and client.glide_row_id = v_event.legacy_client_glide_row_id
    and client.archived_at is null;

  if v_client.id is null then
    return 0;
  end if;

  select company.legacy_glide_row_id
    into v_company_legacy_id
  from public.companies company
  where company.id = v_event.company_id;

  for v_template in
    select template.*
    from public.company_task_templates template
    where template.company_id = v_event.company_id
      and template.trigger_type = 'suspended_auto_offboard'
      and template.is_enabled = true
      and template.archived_at is null
      and (
        template.applies_to_offer_id is null
        or template.applies_to_offer_id = v_client.offer_milestones_current_offer_id
      )
    order by template.position, template.id
  loop
    begin
      v_task_id := null;
      v_assignee := null;
      v_assignment_fallback := false;

      if v_template.assign_to_type = 'assigned_csm' then
        v_assignee := v_client.csm_team_member_id;
      elsif v_template.assign_to_type = 'specific_member' then
        v_assignee := v_template.assigned_member_legacy_id;
      elsif v_template.assign_to_type in ('director', 'support') then
        select coalesce(member.legacy_glide_row_id, member.id::text)
          into v_assignee
        from public.company_members member
        where member.company_id = v_event.company_id
          and member.role = v_template.assign_to_type
          and member.status = 'active'
          and member.archived_at is null
        order by member.created_at, member.id
        limit 1;
      end if;

      if v_assignee is not null
        and not exists (
          select 1
          from public.company_members member
          where member.company_id = v_event.company_id
            and member.status = 'active'
            and member.archived_at is null
            and (
              member.legacy_glide_row_id = v_assignee
              or member.id::text = v_assignee
            )
        ) then
        v_assignee := null;
      end if;

      -- A missing/inactive requested assignee must not silently hide the
      -- operational follow-up. Directors are the first fallback, then Support.
      if v_assignee is null and v_template.assign_to_type <> 'unassigned' then
        select coalesce(member.legacy_glide_row_id, member.id::text)
          into v_assignee
        from public.company_members member
        where member.company_id = v_event.company_id
          and member.role in ('director', 'support')
          and member.status = 'active'
          and member.archived_at is null
        order by
          case when member.role = 'director' then 0 else 1 end,
          member.created_at,
          member.id
        limit 1;
        v_assignment_fallback := true;
      end if;

      v_task_name := replace(
        v_template.name,
        '{client_name}',
        coalesce(nullif(v_client.client_name, ''), 'Client')
      );
      v_task_description := case
        when v_template.description is null then null
        else replace(
          v_template.description,
          '{client_name}',
          coalesce(nullif(v_client.client_name, ''), 'Client')
        )
      end;

      insert into public.client_tasks (
        company_id,
        company_glide_row_id,
        glide_row_id,
        client_id,
        task_name,
        task_description,
        task_due_date,
        task_last_updated_date,
        assigned_to_id,
        priority,
        status_value,
        recurring_is_recurring,
        task_template_id,
        source_history_event_id,
        source_snapshot,
        metadata
      ) values (
        v_event.company_id,
        coalesce(v_company_legacy_id, v_event.company_id::text),
        gen_random_uuid()::text,
        v_client.glide_row_id,
        v_task_name,
        v_task_description,
        v_event.created_at + make_interval(days => v_template.due_offset_days),
        now(),
        v_assignee,
        v_template.priority,
        v_template.status_value,
        false,
        v_template.id,
        v_event.id,
        jsonb_build_object(
          'source', 'suspended_auto_offboard',
          'history_event_id', v_event.id,
          'effective_at', v_event.payload ->> 'effective_at'
        ),
        jsonb_build_object(
          'created_in', 'suspended_auto_offboard_template',
          'follow_up_kind', 'mia_auto_offboard',
          'daily_pulse_follow_up', true,
          'history_event_id', v_event.id,
          'effective_at', v_event.payload ->> 'effective_at',
          'assignment_fallback', v_assignment_fallback,
          'requested_assign_to_type', v_template.assign_to_type
        )
      )
      on conflict do nothing
      returning id into v_task_id;

      if v_task_id is null then
        continue;
      end if;

      v_created := v_created + 1;

      insert into public.client_history_events (
        company_id,
        legacy_client_glide_row_id,
        event_type,
        source,
        title,
        summary,
        payload
      ) values (
        v_event.company_id,
        v_client.glide_row_id,
        'task_created',
        'suspended_auto_offboard_task',
        'Automatic offboarding follow-up created',
        v_task_name,
        jsonb_build_object(
          'actor_role', 'system',
          'automation', 'suspended_timeout',
          'task_id', v_task_id,
          'task_template_id', v_template.id,
          'source_history_event_id', v_event.id,
          'assigned_to_id', v_assignee,
          'assignment_fallback', v_assignment_fallback
        )
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
        after_data,
        metadata
      ) values (
        v_event.company_id,
        'mia_auto_offboard_followup_task_created',
        'suspended_auto_offboard_task',
        'client_tasks',
        v_task_id,
        v_client.glide_row_id,
        'MIA auto-offboard follow-up task created',
        v_task_name,
        jsonb_build_object(
          'assigned_to_id', v_assignee,
          'task_template_id', v_template.id,
          'source_history_event_id', v_event.id
        ),
        jsonb_build_object(
          'actor_role', 'system',
          'automation', 'suspended_timeout',
          'assignment_fallback', v_assignment_fallback
        )
      );
    exception when others then
      -- Task delivery cannot invalidate a correctly due lifecycle transition.
      insert into public.app_audit_events (
        company_id,
        event_type,
        source,
        entity_table,
        entity_id,
        legacy_glide_row_id,
        title,
        summary,
        metadata
      ) values (
        v_event.company_id,
        'mia_auto_offboard_followup_task_failed',
        'suspended_auto_offboard_task',
        'company_task_templates',
        v_template.id,
        v_client.glide_row_id,
        'MIA auto-offboard follow-up needs review',
        'RetainOS could not create the configured follow-up task.',
        jsonb_build_object(
          'actor_role', 'system',
          'automation', 'suspended_timeout',
          'source_history_event_id', v_event.id,
          'sqlstate', sqlstate,
          'error', sqlerrm
        )
      );
    end;
  end loop;

  return v_created;
end;
$$;

revoke all on function public.create_suspended_auto_offboard_followup_tasks(uuid)
  from public, anon, authenticated;
grant execute on function public.create_suspended_auto_offboard_followup_tasks(uuid)
  to service_role;

create or replace function public.create_suspended_auto_offboard_tasks_after_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.create_suspended_auto_offboard_followup_tasks(new.id);
  return new;
end;
$$;

revoke all on function public.create_suspended_auto_offboard_tasks_after_history()
  from public, anon, authenticated;

drop trigger if exists client_history_create_suspended_auto_offboard_tasks
  on public.client_history_events;
create trigger client_history_create_suspended_auto_offboard_tasks
after insert on public.client_history_events
for each row
when (
  new.source = 'suspended_auto_offboard'
  and new.event_type = 'client_status_changed'
)
execute function public.create_suspended_auto_offboard_tasks_after_history();

-- MM requested this workflow. Seed one editable company template; no other
-- company is enabled or receives a template.
insert into public.company_task_templates (
  company_id,
  name,
  description,
  trigger_type,
  assign_to_type,
  due_offset_days,
  recurring_is_recurring,
  recurring_interval_days,
  priority,
  status_value,
  is_enabled,
  position,
  metadata
)
select
  company.id,
  'Post MIA offboarding update for {client_name}',
  'Post in the client''s onboarding Slack thread that RetainOS automatically offboarded them after the configured MIA period. Confirm the fulfillment team can remove backend access, then mark this task done.',
  'suspended_auto_offboard',
  'assigned_csm',
  0,
  false,
  null,
  'high',
  'todo',
  true,
  coalesce(
    (
      select max(template.position) + 10
      from public.company_task_templates template
      where template.company_id = company.id
    ),
    0
  ),
  jsonb_build_object(
    'system_seed', 'mm_mia_auto_offboard_followup_v1',
    'daily_pulse_section', 'automated_offboard_follow_up'
  )
from public.companies company
where company.id = '21586391-9a84-4072-9ae6-20436b27bea9'::uuid
  and company.legacy_glide_row_id = 'wd7vy0vaQK2hgB3IRqy17w'
  and company.name = 'Moves Method'
  and not exists (
    select 1
    from public.company_task_templates existing
    where existing.company_id = company.id
      and existing.trigger_type = 'suspended_auto_offboard'
      and existing.archived_at is null
  );

-- Bounded backfill: only exact automated offboards already recorded for MM
-- since this automation was enabled. Manual and migrated offboards are excluded.
do $backfill$
declare
  v_event record;
begin
  for v_event in
    select history.id
    from public.client_history_events history
    where history.company_id = '21586391-9a84-4072-9ae6-20436b27bea9'::uuid
      and history.source = 'suspended_auto_offboard'
      and history.event_type = 'client_status_changed'
    order by history.created_at, history.id
  loop
    perform public.create_suspended_auto_offboard_followup_tasks(v_event.id);
  end loop;
end;
$backfill$;

notify pgrst, 'reload schema';
