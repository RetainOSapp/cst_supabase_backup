-- RetainOS company pathways and milestones setup pilot.
-- Seeds pilot/migrated companies from the Glide mirror once, then treats these
-- app-owned rows as the editable journey configuration source.

create table if not exists public.company_offers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_glide_row_id text not null,
  glide_row_id text not null unique,
  legacy_glide_row_id text,
  name text not null,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.company_offer_milestones (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_glide_row_id text not null,
  offer_id text not null references public.company_offers(glide_row_id) on delete cascade,
  glide_row_id text not null unique,
  legacy_glide_row_id text,
  name text not null,
  position integer not null default 0,
  target_days_to_complete integer,
  is_ttv_milestone boolean not null default false,
  is_final_milestone boolean not null default false,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists company_offers_company_id_idx
  on public.company_offers (company_id);

create index if not exists company_offers_company_glide_row_id_idx
  on public.company_offers (company_glide_row_id);

create index if not exists company_offer_milestones_company_id_idx
  on public.company_offer_milestones (company_id);

create index if not exists company_offer_milestones_offer_id_position_idx
  on public.company_offer_milestones (offer_id, position);

drop trigger if exists company_offers_set_updated_at on public.company_offers;
create trigger company_offers_set_updated_at
before update on public.company_offers
for each row execute function public.set_updated_at();

drop trigger if exists company_offer_milestones_set_updated_at on public.company_offer_milestones;
create trigger company_offer_milestones_set_updated_at
before update on public.company_offer_milestones
for each row execute function public.set_updated_at();

alter table public.company_offers enable row level security;
alter table public.company_offer_milestones enable row level security;

drop policy if exists "company_offers_authenticated_read" on public.company_offers;
create policy "company_offers_authenticated_read"
on public.company_offers for select
to authenticated
using (true);

drop policy if exists "company_offer_milestones_authenticated_read" on public.company_offer_milestones;
create policy "company_offer_milestones_authenticated_read"
on public.company_offer_milestones for select
to authenticated
using (true);

insert into public.company_offers (
  company_id,
  company_glide_row_id,
  glide_row_id,
  legacy_glide_row_id,
  name,
  metadata
)
select
  company.id,
  company.legacy_glide_row_id,
  offer.glide_row_id,
  offer.glide_row_id,
  offer.name,
  jsonb_build_object('seeded_from', 'backup_company_offers')
from public.companies company
join public.backup_company_offers offer
  on offer.company_id = company.legacy_glide_row_id
where company.migration_status in ('pilot', 'migrated')
  and offer.glide_row_id is not null
  and offer.name is not null
on conflict (glide_row_id) do nothing;

insert into public.company_offer_milestones (
  company_id,
  company_glide_row_id,
  offer_id,
  glide_row_id,
  legacy_glide_row_id,
  name,
  position,
  target_days_to_complete,
  is_ttv_milestone,
  is_final_milestone,
  metadata
)
select
  offer.company_id,
  offer.company_glide_row_id,
  offer.glide_row_id,
  milestone.glide_row_id,
  milestone.glide_row_id,
  milestone.name,
  coalesce(milestone."order", 0),
  milestone.target_days_to_complete_from_onboarding_date,
  coalesce(milestone.ttv_milestone, false),
  coalesce(milestone.final_milestone, false),
  jsonb_build_object('seeded_from', 'backup_company_offer_milestones')
from public.company_offers offer
join public.backup_company_offer_milestones milestone
  on milestone.offer_id = offer.glide_row_id
where milestone.glide_row_id is not null
  and milestone.name is not null
on conflict (glide_row_id) do nothing;

