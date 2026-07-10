alter table public.company_task_templates
  add column if not exists recurring_is_recurring boolean not null default false;

alter table public.company_task_templates
  add column if not exists recurring_interval_days integer;

alter table public.company_task_templates
  drop constraint if exists company_task_templates_recurring_interval_days_check;

alter table public.company_task_templates
  add constraint company_task_templates_recurring_interval_days_check
  check (recurring_interval_days is null or recurring_interval_days between 1 and 365);
