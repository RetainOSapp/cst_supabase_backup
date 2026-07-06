create table if not exists public.client_call_attendance_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  client_legacy_id text not null,
  company_legacy_id text,
  attendance_status text not null check (attendance_status in ('attended', 'missed')),
  occurred_at timestamptz not null default now(),
  source text not null default 'manual',
  notes text,
  actor_member_id uuid references public.company_members(id) on delete set null,
  actor_member_legacy_id text,
  actor_auth_user_id uuid,
  history_event_id uuid references public.client_history_events(id) on delete set null,
  integration_intake_event_id uuid references public.integration_intake_events(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists client_call_attendance_events_company_date_idx
  on public.client_call_attendance_events(company_id, occurred_at desc);

create index if not exists client_call_attendance_events_client_idx
  on public.client_call_attendance_events(company_id, client_legacy_id, occurred_at desc);

create index if not exists client_call_attendance_events_reporting_idx
  on public.client_call_attendance_events(company_id, attendance_status, occurred_at desc);

alter table public.client_call_attendance_events enable row level security;

drop policy if exists "client_call_attendance_events_no_anon_access"
  on public.client_call_attendance_events;
create policy "client_call_attendance_events_no_anon_access"
on public.client_call_attendance_events for all
using (false)
with check (false);

drop policy if exists "client_call_attendance_events_authenticated_read"
  on public.client_call_attendance_events;
create policy "client_call_attendance_events_authenticated_read"
on public.client_call_attendance_events for select
to authenticated
using (true);
