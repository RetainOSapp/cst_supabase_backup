alter table public.company_settings
  add column if not exists allow_status_change_retention boolean not null default false;

comment on column public.company_settings.allow_status_change_retention is
  'When true, active RetainOS status movements can count as retention without a renewal or upsell contract event.';

update public.resources
set content = replace(
  replace(
    content,
    E'RetainOS retention rule going forward:\n- A status/program change alone does not count as retained.',
    E'RetainOS retention rule going forward:\n- By default, a status/program change alone does not count as retained.'
  ),
  E'- Do not rely on status movement alone for RetainOS-era retention reporting.',
  E'- Company Settings can optionally allow active Front End / Back End status movements to count as retention without a Renewal or Upsell contract.\n- When that setting is off, do not rely on status movement alone for RetainOS-era retention reporting.'
)
where slug = 'retention-churn-metrics'
  and content not like '%Company Settings can optionally allow active Front End / Back End status movements%';
