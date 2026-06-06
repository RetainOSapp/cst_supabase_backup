-- RetainOS write-mode pilot foundation.
-- Purpose: create app-owned tables for the Ethical Scaling pilot without
-- writing business data into backup_* Glide mirror tables.

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  public_company_id text not null unique default ('ret_' || encode(gen_random_bytes(8), 'hex')),
  legacy_glide_row_id text unique,
  name text not null,
  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),
  migration_status text not null default 'mirror_only'
    check (migration_status in ('mirror_only', 'pilot', 'migrated')),
  subscription_tier text
    check (
      subscription_tier is null
      or subscription_tier in ('starter', 'growth', 'pro_enterprise_dfy')
    ),
  logo_url text,
  enable_secondary_assignee boolean not null default false,
  enable_call_ai_for_csms boolean not null default false,
  view_override text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  legacy_glide_row_id text unique,
  auth_user_id uuid references auth.users(id) on delete set null,
  email text not null,
  name text,
  photo_url text,
  role text not null check (role in ('director', 'support', 'csm', 'viewer')),
  is_read_only boolean not null default false,
  hide_from_csm_list boolean not null default false,
  capacity_number numeric,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.app_audit_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  actor_auth_user_id uuid references auth.users(id) on delete set null,
  actor_member_id uuid references public.company_members(id) on delete set null,
  event_type text not null,
  source text not null default 'manual',
  entity_table text not null,
  entity_id uuid,
  legacy_glide_row_id text,
  title text,
  summary text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists companies_migration_status_idx
  on public.companies (migration_status);

create index if not exists companies_legacy_glide_row_id_idx
  on public.companies (legacy_glide_row_id);

create index if not exists company_members_company_id_idx
  on public.company_members (company_id);

create index if not exists company_members_role_idx
  on public.company_members (role);

create index if not exists company_members_legacy_glide_row_id_idx
  on public.company_members (legacy_glide_row_id);

create unique index if not exists company_members_active_email_unique_idx
  on public.company_members (lower(email))
  where status = 'active';

create index if not exists app_audit_events_company_id_created_at_idx
  on public.app_audit_events (company_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

drop trigger if exists company_members_set_updated_at on public.company_members;
create trigger company_members_set_updated_at
before update on public.company_members
for each row execute function public.set_updated_at();

alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.app_audit_events enable row level security;

-- Keep app-owned tables private by default. Reads/writes should go through
-- service-role Edge Functions until RLS policies are intentionally opened.
drop policy if exists "companies_no_anon_access" on public.companies;
create policy "companies_no_anon_access"
on public.companies for all
using (false)
with check (false);

drop policy if exists "company_members_no_anon_access" on public.company_members;
create policy "company_members_no_anon_access"
on public.company_members for all
using (false)
with check (false);

drop policy if exists "app_audit_events_no_anon_access" on public.app_audit_events;
create policy "app_audit_events_no_anon_access"
on public.app_audit_events for all
using (false)
with check (false);
