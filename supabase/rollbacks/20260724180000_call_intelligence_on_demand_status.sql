-- The forward data repair is intentionally preserved. This rollback only
-- removes the automatic state-restoration trigger.

drop trigger if exists call_intelligence_on_demand_restore_call_status
  on public.call_intelligence_runs;
drop function if exists public.restore_call_intelligence_status_after_on_demand();
