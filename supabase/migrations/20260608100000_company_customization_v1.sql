-- RetainOS company customization V1.
-- Adds app-owned outcome definitions, churn reasons, and minimal company
-- settings for pilot/migrated companies.

create table if not exists public.company_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  profile_upkeep_freshness_days integer not null default 14
    check (profile_upkeep_freshness_days between 1 and 365),
  default_client_view text not null default 'list'
    check (default_client_view in ('list', 'card', 'calendar')),
  default_calendar_mode text not null default 'month'
    check (default_calendar_mode in ('month', 'week', 'day')),
  dashboard_default_tab text not null default 'overview'
    check (dashboard_default_tab in ('overview', 'charts', 'ai')),
  enable_secondary_assignee boolean not null default false,
  enable_call_ai_for_csms boolean not null default false,
  enable_embeds boolean not null default false,
  enable_zapier_client_create boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_outcome_definitions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  outcome_type text not null
    check (outcome_type in ('success', 'progress', 'buy_in', 'suitable')),
  value text not null,
  label text not null,
  color text,
  emoji text,
  positive_rank integer,
  position integer not null default 0,
  is_default boolean not null default false,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (company_id, outcome_type, value)
);

create table if not exists public.company_churn_reasons (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  value text not null,
  label text not null,
  category text,
  requires_notes boolean not null default false,
  counts_as_churn boolean not null default true,
  position integer not null default 0,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (company_id, value)
);

create index if not exists company_outcome_definitions_company_type_idx
  on public.company_outcome_definitions (company_id, outcome_type, position);

create index if not exists company_churn_reasons_company_position_idx
  on public.company_churn_reasons (company_id, position);

drop trigger if exists company_settings_set_updated_at on public.company_settings;
create trigger company_settings_set_updated_at
before update on public.company_settings
for each row execute function public.set_updated_at();

drop trigger if exists company_outcome_definitions_set_updated_at on public.company_outcome_definitions;
create trigger company_outcome_definitions_set_updated_at
before update on public.company_outcome_definitions
for each row execute function public.set_updated_at();

drop trigger if exists company_churn_reasons_set_updated_at on public.company_churn_reasons;
create trigger company_churn_reasons_set_updated_at
before update on public.company_churn_reasons
for each row execute function public.set_updated_at();

alter table public.company_settings enable row level security;
alter table public.company_outcome_definitions enable row level security;
alter table public.company_churn_reasons enable row level security;

drop policy if exists "company_settings_authenticated_read" on public.company_settings;
create policy "company_settings_authenticated_read"
on public.company_settings for select
to authenticated
using (true);

drop policy if exists "company_outcome_definitions_authenticated_read" on public.company_outcome_definitions;
create policy "company_outcome_definitions_authenticated_read"
on public.company_outcome_definitions for select
to authenticated
using (true);

drop policy if exists "company_churn_reasons_authenticated_read" on public.company_churn_reasons;
create policy "company_churn_reasons_authenticated_read"
on public.company_churn_reasons for select
to authenticated
using (true);

insert into public.company_settings (
  company_id,
  enable_secondary_assignee,
  enable_call_ai_for_csms,
  metadata
)
select
  company.id,
  coalesce(company.enable_secondary_assignee, mirror.enable_secondary_assignee, false),
  coalesce(company.enable_call_ai_for_csms, mirror.enable_call_ai_for_csms, false),
  jsonb_build_object('seeded_from', 'companies_and_backup_companies')
from public.companies company
left join public.backup_companies mirror
  on mirror.glide_row_id = company.legacy_glide_row_id
where company.migration_status in ('pilot', 'migrated')
on conflict (company_id) do update
set
  enable_secondary_assignee = excluded.enable_secondary_assignee,
  enable_call_ai_for_csms = excluded.enable_call_ai_for_csms;

with mirrored_outcomes as (
  select
    company.id as company_id,
    'success'::text as outcome_type,
    lower(trim(choice.success_value)) as value,
    coalesce(nullif(trim(choice.success_display), ''), initcap(replace(trim(choice.success_value), '_', ' '))) as label,
    coalesce(choice."index", 0) as position,
    jsonb_build_object('seeded_from', 'backup_choices') as metadata
  from public.companies company
  cross join public.backup_choices choice
  where company.migration_status in ('pilot', 'migrated')
    and nullif(trim(choice.success_value), '') is not null
  union all
  select
    company.id,
    'progress',
    lower(trim(choice.progress_value)),
    coalesce(nullif(trim(choice.progress_display), ''), initcap(replace(trim(choice.progress_value), '_', ' '))),
    coalesce(choice."index", 0),
    jsonb_build_object('seeded_from', 'backup_choices')
  from public.companies company
  cross join public.backup_choices choice
  where company.migration_status in ('pilot', 'migrated')
    and nullif(trim(choice.progress_value), '') is not null
    and lower(trim(choice.progress_value)) <> 'offtrack'
  union all
  select
    company.id,
    'buy_in',
    lower(trim(choice.buy_in_value)),
    coalesce(nullif(trim(choice.buy_in_display), ''), initcap(replace(trim(choice.buy_in_value), '_', ' '))),
    coalesce(choice."index", 0),
    jsonb_build_object('seeded_from', 'backup_choices')
  from public.companies company
  cross join public.backup_choices choice
  where company.migration_status in ('pilot', 'migrated')
    and nullif(trim(choice.buy_in_value), '') is not null
)
insert into public.company_outcome_definitions (
  company_id,
  outcome_type,
  value,
  label,
  position,
  is_default,
  metadata
)
select distinct on (company_id, outcome_type, value)
  company_id,
  outcome_type,
  value,
  label,
  position,
  true,
  metadata
from mirrored_outcomes
where value <> ''
order by company_id, outcome_type, value, position
on conflict (company_id, outcome_type, value) do nothing;

with defaults(outcome_type, value, label, position, positive_rank) as (
  values
    ('success', 'yes', 'Yes', 10, 2),
    ('success', 'no', 'No', 20, 1),
    ('progress', 'green', 'Green', 10, 3),
    ('progress', 'yellow', 'Yellow', 20, 2),
    ('progress', 'red', 'Red', 30, 1),
    ('buy_in', 'green', 'Green', 10, 3),
    ('buy_in', 'yellow', 'Yellow', 20, 2),
    ('buy_in', 'red', 'Red', 30, 1)
)
insert into public.company_outcome_definitions (
  company_id,
  outcome_type,
  value,
  label,
  position,
  positive_rank,
  is_default,
  metadata
)
select
  company.id,
  defaults.outcome_type,
  defaults.value,
  defaults.label,
  defaults.position,
  defaults.positive_rank,
  true,
  jsonb_build_object('seeded_from', 'safe_defaults')
from public.companies company
cross join defaults
where company.migration_status in ('pilot', 'migrated')
on conflict (company_id, outcome_type, value) do nothing;

with raw_reasons as (
  select
    company.id as company_id,
    nullif(trim(client.churn_reason_value), '') as label
  from public.companies company
  join public.clients client
    on client.company_id = company.id
  where company.migration_status in ('pilot', 'migrated')
  union
  select
    company.id,
    nullif(trim(mirror_client.churn_reason_value), '')
  from public.companies company
  join public.backup_company_clients mirror_client
    on mirror_client.company_id = company.legacy_glide_row_id
  where company.migration_status in ('pilot', 'migrated')
), normalized_reasons as (
  select distinct
    company_id,
    lower(regexp_replace(label, '[^a-zA-Z0-9]+', '_', 'g')) as value,
    label
  from raw_reasons
  where label is not null
)
insert into public.company_churn_reasons (
  company_id,
  value,
  label,
  position,
  metadata
)
select
  company_id,
  trim(both '_' from value),
  label,
  row_number() over (partition by company_id order by label)::integer * 10,
  jsonb_build_object('seeded_from', 'client_churn_reason_values')
from normalized_reasons
where trim(both '_' from value) <> ''
on conflict (company_id, value) do nothing;

with defaults(value, label, category, position, requires_notes) as (
  values
    ('financial', 'Financial', 'commercial', 10, false),
    ('overwhelm', 'Overwhelm', 'capacity', 20, false),
    ('paused', 'Paused', 'paused', 30, false),
    ('spousal', 'Spousal', 'family', 40, false),
    ('uncertainty', 'Uncertainty', 'uncertainty', 50, false),
    ('other', 'Other', 'other', 60, true)
)
insert into public.company_churn_reasons (
  company_id,
  value,
  label,
  category,
  position,
  requires_notes,
  metadata
)
select
  company.id,
  defaults.value,
  defaults.label,
  defaults.category,
  defaults.position,
  defaults.requires_notes,
  jsonb_build_object('seeded_from', 'safe_defaults')
from public.companies company
cross join defaults
where company.migration_status in ('pilot', 'migrated')
on conflict (company_id, value) do nothing;
