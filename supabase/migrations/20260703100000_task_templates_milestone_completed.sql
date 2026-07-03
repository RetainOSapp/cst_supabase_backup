alter table public.company_task_templates
  add column if not exists applies_to_milestone_id text;

alter table public.company_task_templates
  drop constraint if exists company_task_templates_trigger_type_check;

alter table public.company_task_templates
  add constraint company_task_templates_trigger_type_check
  check (trigger_type in ('manual', 'client_created', 'milestone_completed'));

create index if not exists company_task_templates_milestone_idx
  on public.company_task_templates (
    company_id,
    applies_to_offer_id,
    applies_to_milestone_id
  )
  where archived_at is null;
