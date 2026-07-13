-- Security Phase 1B: final legacy Dashboard RPC lockdown.
-- Apply only after the actor-scoped frontend is live and the app-owned read
-- policies have passed role QA.

do $$
begin
  if to_regclass('public.security_rollout_history') is null
    or not exists (
      select 1
      from public.security_rollout_history rollout
      where rollout.version = '20260713020500'
    )
    or not exists (
      select 1
      from public.security_rollout_history rollout
      where rollout.version = '20260713022000'
    )
    or not exists (
      select 1
      from public.security_rollout_history rollout
      where rollout.version = '20260713022500'
    ) then
    raise exception 'Phase 1B frontend, read-policy, and post-policy QA gates must be applied first';
  end if;
end $$;

do $$
declare
  function_identity regprocedure;
begin
  for function_identity in
    select proc.oid::regprocedure
    from pg_proc proc
    join pg_namespace namespace
      on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname in (
        'dashboard_kpi_counts_canonical',
        'dashboard_kpi_counts_primary',
        'dashboard_kpi_counts_retention'
      )
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated',
      function_identity
    );
    execute format(
      'grant execute on function %s to service_role',
      function_identity
    );
  end loop;
end $$;

insert into public.security_rollout_history (
  version,
  migration_name,
  details
)
values (
  '20260713023000',
  'security_phase1b_legacy_dashboard_rpc_lockdown',
  jsonb_build_object(
    'scope', 'legacy_dashboard_rpc_execute_lockdown',
    'frontend_prerequisite', 'actor_scoped_dashboard_rpcs'
  )
)
on conflict (version) do nothing;

notify pgrst, 'reload schema';
