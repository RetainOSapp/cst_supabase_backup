-- RetainOS contract write pilot.
-- Creates app-owned client contracts while keeping backup_company_clients_contracts read-only.

create table if not exists public.client_contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_glide_row_id text not null,
  glide_row_id text not null unique,
  client_id text not null,
  start_date timestamptz,
  end_date timestamptz,
  contract_days numeric,
  monthly_value numeric,
  total_contract_value numeric,
  reference_link text,
  notes text,
  auto_renew boolean not null default false,
  status text,
  source_snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists client_contracts_company_glide_row_id_idx
  on public.client_contracts (company_glide_row_id);

create index if not exists client_contracts_client_id_idx
  on public.client_contracts (client_id);

create index if not exists client_contracts_end_date_idx
  on public.client_contracts (end_date);

drop trigger if exists client_contracts_set_updated_at on public.client_contracts;
create trigger client_contracts_set_updated_at
before update on public.client_contracts
for each row execute function public.set_updated_at();

alter table public.client_contracts enable row level security;

drop policy if exists "client_contracts_no_anon_access" on public.client_contracts;
create policy "client_contracts_no_anon_access"
on public.client_contracts for all
using (false)
with check (false);

drop policy if exists "client_contracts_authenticated_read" on public.client_contracts;
create policy "client_contracts_authenticated_read"
on public.client_contracts for select
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
      'contract_created'
    )
  );
