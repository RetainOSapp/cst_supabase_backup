-- Track completion for date-driven company timing rules such as Strategic Review.
-- These are separate from pathway milestones because their due date is computed
-- from client dates/contracts rather than pathway sequence.

create table if not exists public.client_timed_checkpoint_completions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_glide_row_id text not null,
  client_id uuid references public.clients(id) on delete cascade,
  legacy_client_id text not null,
  checkpoint_type text not null
    check (checkpoint_type in ('strategic_review')),
  due_at date not null,
  completed_at timestamptz not null default now(),
  completed_by_member_id uuid references public.company_members(id) on delete set null,
  completed_by_name text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index if not exists client_timed_checkpoint_active_unique_idx
  on public.client_timed_checkpoint_completions (
    company_id,
    legacy_client_id,
    checkpoint_type,
    due_at
  )
  where archived_at is null;

create index if not exists client_timed_checkpoint_company_due_idx
  on public.client_timed_checkpoint_completions (
    company_id,
    checkpoint_type,
    due_at
  )
  where archived_at is null;

create index if not exists client_timed_checkpoint_client_idx
  on public.client_timed_checkpoint_completions (legacy_client_id)
  where archived_at is null;

drop trigger if exists client_timed_checkpoint_set_updated_at
  on public.client_timed_checkpoint_completions;
create trigger client_timed_checkpoint_set_updated_at
before update on public.client_timed_checkpoint_completions
for each row execute function public.set_updated_at();

alter table public.client_timed_checkpoint_completions enable row level security;

drop policy if exists "client_timed_checkpoint_no_anon_access"
  on public.client_timed_checkpoint_completions;
create policy "client_timed_checkpoint_no_anon_access"
on public.client_timed_checkpoint_completions for all
using (false)
with check (false);

drop policy if exists "client_timed_checkpoint_authenticated_read"
  on public.client_timed_checkpoint_completions;
create policy "client_timed_checkpoint_authenticated_read"
on public.client_timed_checkpoint_completions for select
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
      'client_outcomes_updated',
      'client_retention_recorded',
      'task_created',
      'task_updated',
      'contract_created',
      'contract_updated',
      'contract_archived',
      'contract_deleted',
      'client_status_changed',
      'client_milestone_started',
      'client_milestone_completed',
      'client_pathway_changed',
      'client_secondary_pathway_changed',
      'client_timed_checkpoint_completed',
      'call_summary_webhook',
      'client_update_webhook'
    )
  );
