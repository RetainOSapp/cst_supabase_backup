-- Operational rollback for the dashboard analytics exclusion foundation.
-- Keep the additive columns/table in place so the rollback is non-destructive;
-- clearing all policies restores the previous dashboard population.

update public.company_settings
set dashboard_exclude_unassigned_clients = false
where dashboard_exclude_unassigned_clients = true;

update public.company_members
set exclude_from_dashboard_analytics = false
where exclude_from_dashboard_analytics = true;

update public.clients
set
  exclude_from_dashboard_analytics = false,
  dashboard_analytics_exclusion_reason = null
where exclude_from_dashboard_analytics = true;

notify pgrst, 'reload schema';
