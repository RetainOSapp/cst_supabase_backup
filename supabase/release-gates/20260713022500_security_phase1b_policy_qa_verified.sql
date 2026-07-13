-- Manual Phase 1B post-policy release gate.
-- Apply only after company/configuration and client read policies are live and
-- the SuperAdmin, Director, Support, CSM, Viewer, and mirror-isolation smoke
-- tests pass. Legacy Dashboard RPCs remain available until this gate is set.

do $$
begin
  if to_regclass('public.security_rollout_history') is null
    or not exists (
      select 1
      from public.security_rollout_history rollout
      where rollout.version = '20260713021000'
    )
    or not exists (
      select 1
      from public.security_rollout_history rollout
      where rollout.version = '20260713022000'
    ) then
    raise exception 'Phase 1B company and client read policies must be applied first';
  end if;

  if exists (
    select 1
    from public.security_rollout_history rollout
    where rollout.version = '20260713023000'
  ) then
    raise exception 'Phase 1B legacy Dashboard RPC lockdown is already applied';
  end if;
end $$;

insert into public.security_rollout_history (
  version,
  migration_name,
  details
)
values (
  '20260713022500',
  'security_phase1b_policy_qa_verified',
  jsonb_build_object(
    'scope', 'manual_release_gate',
    'operator_assertion', 'phase1b_read_policies_role_and_isolation_qa_passed'
  )
)
on conflict (version) do nothing;

notify pgrst, 'reload schema';
