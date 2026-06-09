-- RetainOS notifications V1.
-- Creates an app-owned in-app notification source of truth for pilot/migrated
-- companies. Email delivery is intentionally disabled at this stage.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  recipient_member_id uuid references public.company_members(id) on delete set null,
  recipient_role text,
  scope text not null default 'company'
    check (scope in ('member', 'role', 'company')),
  type text not null,
  severity text not null default 'info'
    check (severity in ('info', 'warning', 'critical')),
  title text not null,
  body text,
  entity_table text,
  entity_id text,
  client_id uuid references public.clients(id) on delete cascade,
  legacy_client_id text,
  due_at timestamptz,
  triggered_at timestamptz not null default now(),
  read_at timestamptz,
  dismissed_at timestamptz,
  resolved_at timestamptz,
  dedupe_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  member_id uuid references public.company_members(id) on delete cascade,
  role text,
  notification_type text not null,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default false,
  lead_days integer not null default 0,
  repeat_interval_days integer,
  quiet_hours jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists notifications_active_dedupe_idx
  on public.notifications (company_id, dedupe_key)
  where resolved_at is null;

create index if not exists notifications_company_due_idx
  on public.notifications (company_id, due_at)
  where resolved_at is null and dismissed_at is null;

create index if not exists notifications_company_recipient_idx
  on public.notifications (company_id, recipient_member_id, read_at, due_at)
  where resolved_at is null and dismissed_at is null;

create index if not exists notifications_company_type_idx
  on public.notifications (company_id, type, due_at)
  where resolved_at is null and dismissed_at is null;

create index if not exists notifications_client_type_idx
  on public.notifications (client_id, type);

create unique index if not exists notification_preferences_unique_scope_idx
  on public.notification_preferences (
    company_id,
    coalesce(member_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(role, ''),
    notification_type
  );

drop trigger if exists notifications_set_updated_at on public.notifications;
create trigger notifications_set_updated_at
before update on public.notifications
for each row execute function public.set_updated_at();

drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at
before update on public.notification_preferences
for each row execute function public.set_updated_at();

alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;

drop policy if exists "notifications_no_anon_access" on public.notifications;
create policy "notifications_no_anon_access"
on public.notifications for all
using (false)
with check (false);

drop policy if exists "notifications_authenticated_read" on public.notifications;
create policy "notifications_authenticated_read"
on public.notifications for select
to authenticated
using (true);

drop policy if exists "notification_preferences_no_anon_access" on public.notification_preferences;
create policy "notification_preferences_no_anon_access"
on public.notification_preferences for all
using (false)
with check (false);

drop policy if exists "notification_preferences_authenticated_read" on public.notification_preferences;
create policy "notification_preferences_authenticated_read"
on public.notification_preferences for select
to authenticated
using (true);

create or replace function public.seed_default_notification_preferences(p_company_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notification_preferences (
    company_id,
    notification_type,
    in_app_enabled,
    email_enabled,
    lead_days
  )
  values
    (p_company_id, 'next_contact_due', true, false, 0),
    (p_company_id, 'renewal_due', true, false, 7),
    (p_company_id, 'paused_return_due', true, false, 0),
    (p_company_id, 'task_due', true, false, 0)
  on conflict (
    company_id,
    (coalesce(member_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    (coalesce(role, '')),
    notification_type
  ) do update
  set
    in_app_enabled = excluded.in_app_enabled,
    email_enabled = false,
    updated_at = now();
$$;

create or replace function public.generate_company_notifications(
  p_company_id uuid,
  p_window_start date default (current_date - 30),
  p_window_end date default (current_date + 8)
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_or_active integer := 0;
begin
  perform public.seed_default_notification_preferences(p_company_id);

  with company_scope as (
    select id, legacy_glide_row_id
    from public.companies
    where id = p_company_id
      and migration_status in ('pilot', 'migrated')
  ),
  active_clients as (
    select c.*
    from public.clients c
    join company_scope cs on cs.id = c.company_id
    where c.archived_at is null
  ),
  member_recipients as (
    select
      ac.id as client_uuid,
      cm.id as member_uuid,
      cm.role as member_role,
      'member'::text as notification_scope
    from active_clients ac
    join public.company_members cm
      on cm.company_id = ac.company_id
     and cm.status = 'active'
     and cm.legacy_glide_row_id in (
      ac.csm_team_member_id,
      ac.csm_secondary_assignee_id
     )
    where cm.role in ('csm', 'director', 'support')
    union
    select
      ac.id as client_uuid,
      cm.id as member_uuid,
      cm.role as member_role,
      'role'::text as notification_scope
    from active_clients ac
    join public.company_members cm
      on cm.company_id = ac.company_id
     and cm.status = 'active'
     and cm.role in ('director', 'support')
  ),
  candidate_notifications as (
    select
      ac.company_id,
      mr.member_uuid as recipient_member_id,
      mr.member_role as recipient_role,
      mr.notification_scope as scope,
      'next_contact_due'::text as type,
      case
        when ac.csm_date_of_next_contact::date < current_date then 'critical'
        else 'warning'
      end as severity,
      'Next contact due'::text as title,
      ac.client_name || ' has a next contact date due.' as body,
      'clients'::text as entity_table,
      ac.id::text as entity_id,
      ac.id as client_id,
      ac.glide_row_id as legacy_client_id,
      ac.csm_date_of_next_contact as due_at,
      'next_contact_due:' || ac.id::text || ':' || mr.member_uuid::text || ':' || ac.csm_date_of_next_contact::date::text as dedupe_key,
      jsonb_build_object(
        'client_name', ac.client_name,
        'client_glide_row_id', ac.glide_row_id,
        'source', 'generate_company_notifications'
      ) as metadata
    from active_clients ac
    join member_recipients mr on mr.client_uuid = ac.id
    where ac.program_status_value in ('front-end', 'back-end')
      and ac.csm_date_of_next_contact is not null
      and ac.csm_date_of_next_contact::date >= p_window_start
      and ac.csm_date_of_next_contact::date < p_window_end

    union all

    select
      ac.company_id,
      mr.member_uuid,
      mr.member_role,
      mr.notification_scope,
      'renewal_due'::text,
      case
        when ac.current_contract_end_date_for_filtering::date < current_date then 'critical'
        else 'warning'
      end,
      'Contract renewal due'::text,
      ac.client_name || ' has a contract renewal date due.',
      'clients'::text,
      ac.id::text,
      ac.id,
      ac.glide_row_id,
      ac.current_contract_end_date_for_filtering,
      'renewal_due:' || ac.id::text || ':' || mr.member_uuid::text || ':' || ac.current_contract_end_date_for_filtering::date::text,
      jsonb_build_object(
        'client_name', ac.client_name,
        'client_glide_row_id', ac.glide_row_id,
        'source', 'generate_company_notifications'
      )
    from active_clients ac
    join member_recipients mr on mr.client_uuid = ac.id
    where ac.program_status_value in ('front-end', 'back-end')
      and ac.current_contract_end_date_for_filtering is not null
      and ac.current_contract_end_date_for_filtering::date >= p_window_start
      and ac.current_contract_end_date_for_filtering::date < p_window_end

    union all

    select
      ac.company_id,
      mr.member_uuid,
      mr.member_role,
      mr.notification_scope,
      'paused_return_due'::text,
      case
        when ac.program_paused_return_date::date < current_date then 'critical'
        else 'warning'
      end,
      'Paused client return due'::text,
      ac.client_name || ' has a paused return date due.',
      'clients'::text,
      ac.id::text,
      ac.id,
      ac.glide_row_id,
      ac.program_paused_return_date,
      'paused_return_due:' || ac.id::text || ':' || mr.member_uuid::text || ':' || ac.program_paused_return_date::date::text,
      jsonb_build_object(
        'client_name', ac.client_name,
        'client_glide_row_id', ac.glide_row_id,
        'source', 'generate_company_notifications'
      )
    from active_clients ac
    join member_recipients mr on mr.client_uuid = ac.id
    where ac.program_status_value = 'paused'
      and ac.program_paused_return_date is not null
      and ac.program_paused_return_date::date >= p_window_start
      and ac.program_paused_return_date::date < p_window_end

    union all

    select
      ct.company_id,
      coalesce(cm.id, mr.member_uuid),
      coalesce(cm.role, mr.member_role),
      case when cm.id is not null then 'member' else mr.notification_scope end,
      'task_due'::text,
      case
        when ct.task_due_date::date < current_date then 'critical'
        else 'warning'
      end,
      'Task due'::text,
      ct.task_name || ' is due for ' || ac.client_name || '.',
      'client_tasks'::text,
      ct.id::text,
      ac.id,
      ac.glide_row_id,
      ct.task_due_date,
      'task_due:' || ct.id::text || ':' || coalesce(cm.id, mr.member_uuid)::text || ':' || ct.task_due_date::date::text,
      jsonb_build_object(
        'client_name', ac.client_name,
        'client_glide_row_id', ac.glide_row_id,
        'task_name', ct.task_name,
        'source', 'generate_company_notifications'
      )
    from public.client_tasks ct
    join active_clients ac on ac.glide_row_id = ct.client_id
    join member_recipients mr on mr.client_uuid = ac.id
    left join public.company_members cm
      on cm.company_id = ct.company_id
     and cm.status = 'active'
     and cm.legacy_glide_row_id = ct.assigned_to_id
    where ct.company_id = p_company_id
      and ct.archived_at is null
      and coalesce(ct.is_manually_archived, false) = false
      and coalesce(ct.status_value, '') not in ('done', 'completed', 'closed')
      and ct.task_due_date is not null
      and ct.task_due_date::date >= p_window_start
      and ct.task_due_date::date < p_window_end
  ),
  valid_dedupe as (
    select dedupe_key
    from (
      select distinct on (dedupe_key) *
      from candidate_notifications
      order by dedupe_key, recipient_role nulls last
    ) deduped_notifications
  ),
  resolved_stale as (
    update public.notifications n
    set resolved_at = now()
    where n.company_id = p_company_id
      and n.type in (
        'next_contact_due',
        'renewal_due',
        'paused_return_due',
        'task_due'
      )
      and n.resolved_at is null
      and not exists (
        select 1
        from valid_dedupe vd
        where vd.dedupe_key = n.dedupe_key
      )
    returning 1
  ),
  upserted as (
    insert into public.notifications (
      company_id,
      recipient_member_id,
      recipient_role,
      scope,
      type,
      severity,
      title,
      body,
      entity_table,
      entity_id,
      client_id,
      legacy_client_id,
      due_at,
      dedupe_key,
      metadata
    )
    select
      company_id,
      recipient_member_id,
      recipient_role,
      scope,
      type,
      severity,
      title,
      body,
      entity_table,
      entity_id,
      client_id,
      legacy_client_id,
      due_at,
      dedupe_key,
      metadata
    from (
      select distinct on (dedupe_key) *
      from candidate_notifications
      order by dedupe_key, recipient_role nulls last
    ) deduped_notifications
    on conflict (company_id, dedupe_key) where resolved_at is null do update
    set
      severity = excluded.severity,
      title = excluded.title,
      body = excluded.body,
      due_at = excluded.due_at,
      metadata = excluded.metadata,
      dismissed_at = null,
      updated_at = now()
    returning 1
  )
  select count(*) into v_created_or_active from upserted;

  return v_created_or_active;
end;
$$;

grant execute on function public.seed_default_notification_preferences(uuid) to authenticated;
grant execute on function public.generate_company_notifications(uuid, date, date) to authenticated;
