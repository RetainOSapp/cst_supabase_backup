-- RetainOS client Quick Update pilot.
-- Stores client activity in app-owned history events without mutating Glide mirror tables.

create table if not exists public.client_history_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  legacy_client_glide_row_id text not null,
  actor_auth_user_id uuid references auth.users(id) on delete set null,
  actor_member_id uuid references public.company_members(id) on delete set null,
  event_type text not null default 'quick_update'
    check (event_type in ('quick_update')),
  source text not null default 'client_quick_update',
  title text,
  summary text,
  next_steps text,
  last_contact_at timestamptz,
  next_contact_at timestamptz,
  success_status text,
  progress_status text,
  buy_in_status text,
  notes text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists client_history_events_company_created_idx
  on public.client_history_events (company_id, created_at desc);

create index if not exists client_history_events_client_created_idx
  on public.client_history_events (legacy_client_glide_row_id, created_at desc);

alter table public.client_history_events enable row level security;

drop policy if exists "client_history_events_no_anon_access" on public.client_history_events;
create policy "client_history_events_no_anon_access"
on public.client_history_events for all
using (false)
with check (false);

drop policy if exists "client_history_events_authenticated_read" on public.client_history_events;
create policy "client_history_events_authenticated_read"
on public.client_history_events for select
to authenticated
using (true);
