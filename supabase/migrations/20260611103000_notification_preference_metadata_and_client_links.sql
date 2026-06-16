alter table public.notification_preferences
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.notification_preferences
set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{recurrence}', '"once"', true)
where notification_type = 'diagnostic_due'
  and not (coalesce(metadata, '{}'::jsonb) ? 'recurrence');

create table if not exists public.client_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  legacy_client_glide_row_id text not null,
  label text not null,
  url text not null,
  link_type text not null default 'supporting_doc',
  status text not null default 'active',
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists client_links_company_id_idx
  on public.client_links(company_id);

create index if not exists client_links_legacy_client_glide_row_id_idx
  on public.client_links(legacy_client_glide_row_id);

create index if not exists client_links_active_idx
  on public.client_links(company_id, legacy_client_glide_row_id)
  where status = 'active';
