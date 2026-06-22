-- Add RetainOS-owned secondary pathway tracking.

alter table public.company_settings
  add column if not exists enable_secondary_offers boolean not null default false;

alter table public.companies
  add column if not exists enable_secondary_offers boolean not null default false;

alter table public.clients
  add column if not exists secondary_offer_milestones_current_offer_id text,
  add column if not exists secondary_offer_milestones_current_milestone_id text,
  add column if not exists secondary_offer_milestones_current_milestone_change_date timestamptz;

create index if not exists idx_clients_secondary_offer
  on public.clients(company_id, secondary_offer_milestones_current_offer_id)
  where secondary_offer_milestones_current_offer_id is not null;

create index if not exists idx_clients_secondary_milestone
  on public.clients(company_id, secondary_offer_milestones_current_milestone_id)
  where secondary_offer_milestones_current_milestone_id is not null;
