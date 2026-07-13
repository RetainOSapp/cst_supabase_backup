-- Security Phase 0 notification-policy performance hotfix.
--
-- The original tenant predicate called can_read_company(company_id) once per
-- candidate row. On the large notifications table, ordinary company members
-- could hit the statement timeout even with an explicit company_id filter.
-- These policies evaluate the current user's admin/member scope once as
-- uncorrelated init plans, then apply the cached UUID set to indexed rows.

do $$
begin
  if to_regclass('public.security_rollout_history') is null
    or not exists (
      select 1
      from public.security_rollout_history rollout
      where rollout.version = '20260705100000'
    ) then
    raise exception 'Security Phase 0 hardening must be applied first';
  end if;
end $$;

create index if not exists notifications_company_id_idx
  on public.notifications (company_id);

create index if not exists notification_preferences_company_id_idx
  on public.notification_preferences (company_id);

drop policy if exists "notifications_authenticated_read"
  on public.notifications;
create policy "notifications_authenticated_read"
on public.notifications
for select
to authenticated
using (
  (select public.is_retainos_super_admin())
  or company_id = any (
    coalesce(
      (
        select array_agg(member_company.company_id)
        from public.current_member_company_ids()
          as member_company(company_id)
      ),
      array[]::uuid[]
    )
  )
);

drop policy if exists "notification_preferences_authenticated_read"
  on public.notification_preferences;
create policy "notification_preferences_authenticated_read"
on public.notification_preferences
for select
to authenticated
using (
  (select public.is_retainos_super_admin())
  or company_id = any (
    coalesce(
      (
        select array_agg(member_company.company_id)
        from public.current_member_company_ids()
          as member_company(company_id)
      ),
      array[]::uuid[]
    )
  )
);

insert into public.security_rollout_history (
  version,
  migration_name,
  details
)
values (
  '20260712173000',
  'security_phase0_notification_policy_performance',
  jsonb_build_object(
    'scope',
    'set_based_notification_tenant_policy'
  )
)
on conflict (version) do nothing;

notify pgrst, 'reload schema';
