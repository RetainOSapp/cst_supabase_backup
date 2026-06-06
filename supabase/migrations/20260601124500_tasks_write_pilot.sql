-- RetainOS task write pilot.
-- Creates an app-owned task table while keeping backup_company_clients_tasks read-only.

create table if not exists public.client_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_glide_row_id text not null,
  glide_row_id text not null unique,
  client_id text,
  task_name text not null,
  task_description text,
  task_due_date timestamptz,
  task_last_updated_date timestamptz not null default now(),
  start_date timestamptz,
  completion_date timestamptz,
  recurring_is_recurring boolean not null default false,
  is_manually_archived boolean not null default false,
  created_by_id text,
  assigned_to_id text,
  priority text,
  status_value text not null default 'todo',
  external_link text,
  source_snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists client_tasks_company_glide_row_id_idx
  on public.client_tasks (company_glide_row_id);

create index if not exists client_tasks_client_id_idx
  on public.client_tasks (client_id);

create index if not exists client_tasks_assigned_to_id_idx
  on public.client_tasks (assigned_to_id);

create index if not exists client_tasks_status_value_idx
  on public.client_tasks (status_value);

create index if not exists client_tasks_due_date_idx
  on public.client_tasks (task_due_date);

drop trigger if exists client_tasks_set_updated_at on public.client_tasks;
create trigger client_tasks_set_updated_at
before update on public.client_tasks
for each row execute function public.set_updated_at();

alter table public.client_tasks enable row level security;

drop policy if exists "client_tasks_no_anon_access" on public.client_tasks;
create policy "client_tasks_no_anon_access"
on public.client_tasks for all
using (false)
with check (false);

drop policy if exists "client_tasks_authenticated_read" on public.client_tasks;
create policy "client_tasks_authenticated_read"
on public.client_tasks for select
to authenticated
using (true);

alter table public.client_history_events
  drop constraint if exists client_history_events_event_type_check;

alter table public.client_history_events
  add constraint client_history_events_event_type_check
  check (
    event_type in (
      'quick_update',
      'profile_update',
      'client_created',
      'client_offboarded',
      'task_created'
    )
  );
