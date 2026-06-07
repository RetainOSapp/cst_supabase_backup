create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  type text not null default 'guide' check (type in ('guide', 'video', 'template')),
  description text not null default '',
  content text not null default '',
  loom_embed_url text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  is_dynamic boolean not null default false,
  dynamic_key text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists resources_set_updated_at on public.resources;
create trigger resources_set_updated_at
before update on public.resources
for each row execute function public.set_updated_at();

alter table public.resources enable row level security;

drop policy if exists resources_authenticated_read on public.resources;
create policy resources_authenticated_read
on public.resources
for select
to authenticated
using (true);

insert into public.resources (
  slug,
  title,
  type,
  description,
  content,
  loom_embed_url,
  status,
  is_dynamic,
  dynamic_key,
  sort_order
) values
  (
    'zapier-client-webhook',
    'Add new clients through Zapier',
    'guide',
    'Connect a CRM, form, checkout, or automation tool to create clients automatically in RetainOS.',
    'This guide includes the shared webhook URL, the selected company ID, assignable team member IDs, active offer IDs, and request body examples.',
    null,
    'published',
    true,
    'zapier_client_webhook',
    10
  ),
  (
    'quick-update-workflow',
    'Quick Update workflow',
    'video',
    'Short walkthrough for CSMs covering notes, next steps, contact dates, outcomes, and milestones.',
    'Add a Loom embed URL and notes here when the pilot training video is ready.',
    null,
    'draft',
    false,
    null,
    20
  ),
  (
    'client-status-changes',
    'Client status changes',
    'guide',
    'How to move clients between Front End, Back End, Paused, Suspended, and Offboarded.',
    'Draft placeholder for the program/status workflow guide.',
    null,
    'draft',
    false,
    null,
    30
  ),
  (
    'dashboard-csm-reports',
    'Dashboard and CSM Reports',
    'video',
    'Director-level walkthrough for KPI filters, chart drill-throughs, CSM reports, and field upkeep.',
    'Add a Loom embed URL and notes here when the reporting walkthrough is ready.',
    null,
    'draft',
    false,
    null,
    40
  ),
  (
    'new-client-checklist',
    'New client checklist',
    'template',
    'Recommended fields to collect before adding a new client manually or through automation.',
    'Draft placeholder for the new client setup checklist.',
    null,
    'draft',
    false,
    null,
    50
  ),
  (
    'pilot-onboarding-guide',
    'Pilot onboarding guide',
    'guide',
    'One-page starting point for team members joining the RetainOS pilot.',
    'Draft placeholder for the RetainOS pilot onboarding guide.',
    null,
    'draft',
    false,
    null,
    60
  )
on conflict (slug) do update set
  title = excluded.title,
  type = excluded.type,
  description = excluded.description,
  content = case
    when public.resources.content = '' then excluded.content
    else public.resources.content
  end,
  loom_embed_url = coalesce(public.resources.loom_embed_url, excluded.loom_embed_url),
  status = case
    when public.resources.slug = 'zapier-client-webhook' then 'published'
    else public.resources.status
  end,
  is_dynamic = excluded.is_dynamic,
  dynamic_key = excluded.dynamic_key,
  sort_order = excluded.sort_order,
  updated_at = now();
