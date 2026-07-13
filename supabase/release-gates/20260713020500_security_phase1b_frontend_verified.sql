-- Manual Phase 1B release gate.
-- Apply only after the actor-scoped Dashboard frontend is deployed and its
-- SuperAdmin, Director, Support, CSM, and Viewer smoke tests pass.

do $$
begin
  if to_regclass('public.security_rollout_history') is null
    or not exists (
      select 1
      from public.security_rollout_history rollout
      where rollout.version = '20260713020000'
    ) then
    raise exception 'Phase 1B aggregate authority must be applied first';
  end if;

  if exists (
    select 1
    from public.security_rollout_history rollout
    where rollout.version in (
      '20260713021000',
      '20260713022000',
      '20260713023000'
    )
  ) then
    raise exception 'Phase 1B read-policy rollout already started';
  end if;
end $$;

insert into public.security_rollout_history (
  version,
  migration_name,
  details
)
values (
  '20260713020500',
  'security_phase1b_frontend_verified',
  jsonb_build_object(
    'scope', 'manual_release_gate',
    'operator_assertion', 'actor_scoped_frontend_deployed_and_role_qa_passed'
  )
)
on conflict (version) do nothing;

notify pgrst, 'reload schema';
