-- Company-gated client archetype visibility in roster views.

alter table public.company_settings
  add column if not exists enable_archetypes boolean not null default false;

alter table public.companies
  add column if not exists enable_archetypes boolean not null default false;
