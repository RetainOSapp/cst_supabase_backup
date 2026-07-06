create table if not exists public.company_contract_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  applies_to_offer_id text not null,
  contract_days integer not null check (contract_days between 1 and 3650),
  monthly_value numeric,
  reference_link text,
  notes text,
  auto_renew boolean not null default false,
  is_enabled boolean not null default true,
  position integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index if not exists company_contract_templates_offer_active_idx
  on public.company_contract_templates (company_id, applies_to_offer_id)
  where archived_at is null;

create index if not exists company_contract_templates_company_enabled_idx
  on public.company_contract_templates (company_id, is_enabled, position)
  where archived_at is null;

drop trigger if exists company_contract_templates_set_updated_at on public.company_contract_templates;
create trigger company_contract_templates_set_updated_at
before update on public.company_contract_templates
for each row execute function public.set_updated_at();

alter table public.company_contract_templates enable row level security;

drop policy if exists "company_contract_templates_no_anon_access" on public.company_contract_templates;
create policy "company_contract_templates_no_anon_access"
on public.company_contract_templates for all
to anon
using (false)
with check (false);

drop policy if exists "company_contract_templates_authenticated_read" on public.company_contract_templates;
create policy "company_contract_templates_authenticated_read"
on public.company_contract_templates for select
to authenticated
using (true);
