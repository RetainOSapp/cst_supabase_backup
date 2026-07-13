-- Emergency rollback for notification policy performance hotfix
-- 20260712173000. Keep the additive company indexes; restore only the prior
-- tenant predicates and record the rollback without erasing rollout history.

drop policy if exists "notifications_authenticated_read"
  on public.notifications;
create policy "notifications_authenticated_read"
on public.notifications
for select
to authenticated
using (public.can_read_company(company_id));

drop policy if exists "notification_preferences_authenticated_read"
  on public.notification_preferences;
create policy "notification_preferences_authenticated_read"
on public.notification_preferences
for select
to authenticated
using (public.can_read_company(company_id));

insert into public.security_rollout_history (
  version,
  migration_name,
  details
)
values (
  '20260712173100',
  'rollback_security_phase0_notification_policy_performance',
  jsonb_build_object(
    'reverted_version',
    '20260712173000',
    'scope',
    'restore_per_row_notification_tenant_policy'
  )
)
on conflict (version) do nothing;

notify pgrst, 'reload schema';
