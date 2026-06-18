create table if not exists public.company_task_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  trigger_type text not null default 'manual'
    check (trigger_type in ('manual', 'client_created')),
  applies_to_offer_id text,
  assign_to_type text not null default 'assigned_csm'
    check (assign_to_type in ('assigned_csm', 'director', 'support', 'specific_member', 'unassigned')),
  assigned_member_legacy_id text,
  due_offset_days integer not null default 0
    check (due_offset_days between 0 and 365),
  priority text,
  status_value text not null default 'todo'
    check (status_value in ('todo', 'in-progress', 'waiting', 'done', 'dismissed', 'archived')),
  is_enabled boolean not null default true,
  position integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists company_task_templates_company_status_idx
  on public.company_task_templates (company_id, is_enabled, trigger_type, position)
  where archived_at is null;

create index if not exists company_task_templates_offer_idx
  on public.company_task_templates (company_id, applies_to_offer_id)
  where archived_at is null;

drop trigger if exists company_task_templates_set_updated_at on public.company_task_templates;
create trigger company_task_templates_set_updated_at
before update on public.company_task_templates
for each row execute function public.set_updated_at();

alter table public.company_task_templates enable row level security;

drop policy if exists "company_task_templates_no_anon_access" on public.company_task_templates;
create policy "company_task_templates_no_anon_access"
on public.company_task_templates for all
to anon
using (false)
with check (false);

drop policy if exists "company_task_templates_authenticated_read" on public.company_task_templates;
create policy "company_task_templates_authenticated_read"
on public.company_task_templates for select
to authenticated
using (true);
