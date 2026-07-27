-- Operational rollback: stop new follow-up generation and disable the seeded
-- MM template. Preserve existing task/history/audit evidence and its supporting
-- schema so completed or acknowledged work is never erased.

drop trigger if exists client_history_create_suspended_auto_offboard_tasks
  on public.client_history_events;

update public.company_task_templates
set
  is_enabled = false,
  archived_at = coalesce(archived_at, now()),
  metadata = coalesce(metadata, '{}'::jsonb)
    || jsonb_build_object('rollback_disabled_at', now())
where metadata ->> 'system_seed' = 'mm_mia_auto_offboard_followup_v1';

notify pgrst, 'reload schema';
