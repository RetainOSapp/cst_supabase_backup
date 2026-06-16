-- Shared intake ledger for external integrations.
-- Keeps webhook processing auditable and idempotent across providers.

create table if not exists public.integration_intake_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  legacy_company_glide_row_id text,
  integration_type text not null
    check (
      integration_type in (
        'call_ai_transcript',
        'call_summary_next_steps',
        'client_create',
        'client_update',
        'course_completion'
      )
    ),
  provider text not null default 'unknown',
  external_event_id text,
  status text not null default 'received'
    check (status in ('received', 'processed', 'needs_review', 'failed')),
  match_status text not null default 'unmatched'
    check (match_status in ('unmatched', 'matched', 'ambiguous')),
  matched_client_id uuid,
  matched_legacy_client_glide_row_id text,
  matched_by text,
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists integration_intake_events_external_unique_idx
  on public.integration_intake_events (
    company_id,
    integration_type,
    provider,
    external_event_id
  )
  where external_event_id is not null;

create index if not exists integration_intake_events_company_created_idx
  on public.integration_intake_events (company_id, created_at desc);

create index if not exists integration_intake_events_status_idx
  on public.integration_intake_events (status, match_status);

drop trigger if exists integration_intake_events_set_updated_at
  on public.integration_intake_events;
create trigger integration_intake_events_set_updated_at
before update on public.integration_intake_events
for each row execute function public.set_updated_at();

alter table public.integration_intake_events enable row level security;

drop policy if exists "integration_intake_events_no_anon_access"
  on public.integration_intake_events;
create policy "integration_intake_events_no_anon_access"
on public.integration_intake_events for all
using (false)
with check (false);

drop policy if exists "integration_intake_events_authenticated_read"
  on public.integration_intake_events;
create policy "integration_intake_events_authenticated_read"
on public.integration_intake_events for select
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
      'contract_updated',
      'contract_archived',
      'client_status_changed',
      'client_milestone_started',
      'client_milestone_completed',
      'client_pathway_changed',
      'client_retention_recorded',
      'client_outcomes_updated',
      'call_summary_webhook'
    )
  );
