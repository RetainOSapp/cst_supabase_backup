-- RetainOS client milestones write pilot.
-- Owns client milestone progress while using mirrored offer/milestone rows as
-- configuration templates during the pilot.

create table if not exists public.client_milestones (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_glide_row_id text not null,
  glide_row_id text not null unique,
  client_id text not null,
  offer_id text not null,
  milestone_id text not null,
  start_date timestamptz,
  completion_date timestamptz,
  duration_days numeric,
  time_to_hit_days numeric,
  initiated_by_member_id uuid references public.company_members(id) on delete set null,
  completed_by_member_id uuid references public.company_members(id) on delete set null,
  initiated_by_name text,
  completed_by_name text,
  source_snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists client_milestones_company_id_idx
  on public.client_milestones (company_id);

create index if not exists client_milestones_client_id_idx
  on public.client_milestones (client_id);

create index if not exists client_milestones_offer_id_idx
  on public.client_milestones (offer_id);

create index if not exists client_milestones_milestone_id_idx
  on public.client_milestones (milestone_id);

create unique index if not exists client_milestones_active_client_milestone_idx
  on public.client_milestones (client_id, milestone_id)
  where archived_at is null;

drop trigger if exists client_milestones_set_updated_at on public.client_milestones;
create trigger client_milestones_set_updated_at
before update on public.client_milestones
for each row execute function public.set_updated_at();

alter table public.client_milestones enable row level security;

drop policy if exists "client_milestones_no_anon_access" on public.client_milestones;
create policy "client_milestones_no_anon_access"
on public.client_milestones for all
using (false)
with check (false);

drop policy if exists "client_milestones_authenticated_read" on public.client_milestones;
create policy "client_milestones_authenticated_read"
on public.client_milestones for select
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
      'task_created',
      'contract_created',
      'client_status_changed',
      'client_milestone_started',
      'client_milestone_completed',
      'client_pathway_changed'
    )
  );
