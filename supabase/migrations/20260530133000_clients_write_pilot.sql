-- RetainOS clients write pilot.
-- Creates an app-owned current-state clients table for pilot/migrated companies.
-- The Glide mirror remains read-only; this table is the first Supabase-native client source.

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  glide_row_id text not null unique,
  company_glide_row_id text not null,
  client_name text not null,
  client_business text,
  client_email text,
  client_image text,
  client_archetype_value text,
  north_star_value text,
  next_steps_value text,
  client_director_notes text,
  csm_team_member_id text,
  csm_secondary_assignee_id text,
  csm_date_of_last_contact timestamptz,
  csm_date_of_next_contact timestamptz,
  client_age_date_onboarded timestamptz,
  client_age_date_offboarded timestamptz,
  client_age_date_offboarded_for_filtering timestamptz,
  current_contract_start_date timestamptz,
  current_contract_of_days numeric,
  current_contract_end_date timestamptz,
  current_contract_end_date_for_filtering timestamptz,
  current_contract_monthly_value numeric,
  current_contract_reference_link text,
  current_contract_notes text,
  current_contract_auto_renew boolean,
  program_status_value text,
  program_latest_back_end_start_date timestamptz,
  program_latest_paused_date timestamptz,
  milestone_current_value text,
  offer_current_value text,
  offer_milestones_current_offer_id text,
  offer_milestones_current_milestone_id text,
  offer_milestones_current_milestone_change_date timestamptz,
  outcomes_success_value text,
  outcomes_success_value_for_filtering text,
  outcomes_success_date timestamptz,
  outcomes_progress_value text,
  outcomes_progress_for_filtering text,
  outcomes_progress_date timestamptz,
  outcomes_buy_in_value text,
  outcomes_buy_in_for_filtering text,
  outcomes_buy_in_date timestamptz,
  outcomes_suitable_value text,
  outcomes_suitable_date timestamptz,
  churn_reason_value text,
  churn_comments text,
  source_snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists clients_company_id_idx
  on public.clients (company_id);

create index if not exists clients_company_glide_row_id_idx
  on public.clients (company_glide_row_id);

create index if not exists clients_csm_team_member_id_idx
  on public.clients (csm_team_member_id);

create index if not exists clients_secondary_assignee_id_idx
  on public.clients (csm_secondary_assignee_id);

create index if not exists clients_program_status_value_idx
  on public.clients (program_status_value);

create index if not exists clients_offer_id_idx
  on public.clients (offer_milestones_current_offer_id);

create index if not exists clients_last_contact_idx
  on public.clients (csm_date_of_last_contact);

create index if not exists clients_onboarded_idx
  on public.clients (client_age_date_onboarded);

create index if not exists clients_renewal_idx
  on public.clients (current_contract_end_date_for_filtering);

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

alter table public.clients enable row level security;

drop policy if exists "clients_no_anon_access" on public.clients;
create policy "clients_no_anon_access"
on public.clients for all
using (false)
with check (false);

drop policy if exists "clients_authenticated_read" on public.clients;
create policy "clients_authenticated_read"
on public.clients for select
to authenticated
using (true);
