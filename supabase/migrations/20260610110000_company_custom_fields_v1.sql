-- RetainOS company custom fields V1.
-- Adds app-owned custom field definitions for pilot/migrated companies.
-- Client custom field value editing remains a later workflow.

create table if not exists public.company_custom_fields (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  key text not null,
  label text not null,
  description text,
  entity_type text not null default 'client'
    check (entity_type in ('client', 'company_member', 'contract')),
  field_type text not null default 'text'
    check (
      field_type in (
        'text',
        'textarea',
        'number',
        'date',
        'boolean',
        'single_select',
        'multi_select',
        'url',
        'email'
      )
    ),
  options jsonb not null default '[]'::jsonb,
  is_required boolean not null default false,
  is_visible_on_client_detail boolean not null default true,
  is_visible_on_client_list boolean not null default false,
  is_editable_by_csm boolean not null default false,
  position integer not null default 0,
  source_table text,
  source_key text,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (company_id, key)
);

create index if not exists company_custom_fields_company_position_idx
  on public.company_custom_fields (company_id, position);

create index if not exists company_custom_fields_company_status_idx
  on public.company_custom_fields (company_id, status);

drop trigger if exists company_custom_fields_set_updated_at on public.company_custom_fields;
create trigger company_custom_fields_set_updated_at
before update on public.company_custom_fields
for each row execute function public.set_updated_at();

alter table public.company_custom_fields enable row level security;

drop policy if exists "company_custom_fields_authenticated_read" on public.company_custom_fields;
create policy "company_custom_fields_authenticated_read"
on public.company_custom_fields for select
to authenticated
using (true);

create table if not exists public.client_custom_field_values (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id text not null,
  custom_field_id uuid not null references public.company_custom_fields(id) on delete cascade,
  field_key text not null,
  value_text text,
  value_json jsonb,
  source_table text,
  source_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, client_id, custom_field_id)
);

create index if not exists client_custom_field_values_company_client_idx
  on public.client_custom_field_values (company_id, client_id);

create index if not exists client_custom_field_values_field_idx
  on public.client_custom_field_values (custom_field_id);

drop trigger if exists client_custom_field_values_set_updated_at on public.client_custom_field_values;
create trigger client_custom_field_values_set_updated_at
before update on public.client_custom_field_values
for each row execute function public.set_updated_at();

alter table public.client_custom_field_values enable row level security;

drop policy if exists "client_custom_field_values_authenticated_read" on public.client_custom_field_values;
create policy "client_custom_field_values_authenticated_read"
on public.client_custom_field_values for select
to authenticated
using (true);

with slots(source_key, position) as (
  values
    ('customfield1', 10),
    ('customfield2', 20),
    ('customfield3', 30),
    ('customfield4', 40),
    ('customfield5', 50),
    ('customfield6', 60),
    ('customfield7', 70)
), mirrored_definitions as (
  select
    company.id as company_id,
    slots.source_key,
    nullif(
      trim(
        coalesce(
          to_jsonb(company) ->> slots.source_key,
          to_jsonb(mirror) ->> slots.source_key,
          ''
        )
      ),
      ''
    ) as label,
    slots.position,
    case
      when nullif(trim(coalesce(to_jsonb(company) ->> slots.source_key, '')), '') is not null
        then 'companies'
      when nullif(trim(coalesce(to_jsonb(mirror) ->> slots.source_key, '')), '') is not null
        then 'backup_companies'
      else null
    end as source_table
  from public.companies company
  cross join slots
  left join public.backup_companies mirror
    on mirror.glide_row_id = company.legacy_glide_row_id
  where company.migration_status in ('pilot', 'migrated')
)
insert into public.company_custom_fields (
  company_id,
  key,
  label,
  field_type,
  position,
  source_table,
  source_key,
  metadata
)
select
  company_id,
  source_key,
  label,
  'text',
  position,
  source_table,
  source_key,
  jsonb_build_object(
    'seeded_from', 'glide_company_customfield_slots',
    'source_key', source_key
  )
from mirrored_definitions
where label is not null
on conflict (company_id, key) do nothing;

with active_fields as (
  select
    field.id as custom_field_id,
    field.company_id,
    field.key,
    field.source_key
  from public.company_custom_fields field
  where field.status = 'active'
    and field.entity_type = 'client'
), app_client_values as (
  select
    client.company_id,
    client.glide_row_id as client_id,
    active_fields.custom_field_id,
    active_fields.key,
    nullif(
      trim(
        coalesce(
          coalesce(client.metadata -> 'custom_fields', '{}'::jsonb) ->> active_fields.key,
          coalesce(client.metadata -> 'custom_fields', '{}'::jsonb) ->> coalesce(active_fields.source_key, active_fields.key),
          to_jsonb(client) ->> active_fields.key,
          to_jsonb(client) ->> coalesce(active_fields.source_key, active_fields.key),
          ''
        )
      ),
      ''
    ) as value_text,
    case
      when coalesce(client.metadata -> 'custom_fields', '{}'::jsonb) ? active_fields.key
        then coalesce(client.metadata -> 'custom_fields', '{}'::jsonb) -> active_fields.key
      when coalesce(client.metadata -> 'custom_fields', '{}'::jsonb) ? coalesce(active_fields.source_key, active_fields.key)
        then coalesce(client.metadata -> 'custom_fields', '{}'::jsonb) -> coalesce(active_fields.source_key, active_fields.key)
      else null
    end as value_json,
    'clients' as source_table,
    coalesce(active_fields.source_key, active_fields.key) as source_key
  from public.clients client
  join active_fields on active_fields.company_id = client.company_id
), mirror_client_values as (
  select
    company.id as company_id,
    mirror.glide_row_id as client_id,
    active_fields.custom_field_id,
    active_fields.key,
    nullif(
      trim(
        coalesce(
          to_jsonb(mirror) ->> active_fields.key,
          to_jsonb(mirror) ->> coalesce(active_fields.source_key, active_fields.key),
          ''
        )
      ),
      ''
    ) as value_text,
    null::jsonb as value_json,
    'backup_company_clients' as source_table,
    coalesce(active_fields.source_key, active_fields.key) as source_key
  from public.companies company
  join active_fields on active_fields.company_id = company.id
  join public.backup_company_clients mirror
    on mirror.company_id = company.legacy_glide_row_id
  where company.migration_status in ('pilot', 'migrated')
), combined_values as (
  select * from app_client_values
  union all
  select mirror_client_values.*
  from mirror_client_values
  where not exists (
    select 1
    from app_client_values app_value
    where app_value.company_id = mirror_client_values.company_id
      and app_value.client_id = mirror_client_values.client_id
      and app_value.custom_field_id = mirror_client_values.custom_field_id
      and app_value.value_text is not null
  )
)
insert into public.client_custom_field_values (
  company_id,
  client_id,
  custom_field_id,
  field_key,
  value_text,
  value_json,
  source_table,
  source_key,
  metadata
)
select
  company_id,
  client_id,
  custom_field_id,
  key,
  value_text,
  value_json,
  source_table,
  source_key,
  jsonb_build_object(
    'seeded_from', 'company_custom_fields_v1',
    'source_key', source_key
  )
from combined_values
where value_text is not null
on conflict (company_id, client_id, custom_field_id) do nothing;
