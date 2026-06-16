alter table public.resources
  add column if not exists scope text not null default 'retainos_help'
    check (scope in ('retainos_help', 'company')),
  add column if not exists company_legacy_id text;

create index if not exists resources_scope_company_idx
  on public.resources (scope, company_legacy_id, status, sort_order);

update public.resources
set scope = 'retainos_help'
where scope is null;

insert into public.notification_preferences (
  company_id,
  notification_type,
  in_app_enabled,
  email_enabled,
  lead_days
)
select
  c.id,
  preference.notification_type,
  true,
  false,
  preference.lead_days
from public.companies c
cross join (
  values
    ('diagnostic_due'::text, 56),
    ('strategic_review_due'::text, 35)
) as preference(notification_type, lead_days)
where c.migration_status in ('pilot', 'migrated')
on conflict (
  company_id,
  (coalesce(member_id, '00000000-0000-0000-0000-000000000000'::uuid)),
  (coalesce(role, '')),
  notification_type
) do nothing;
