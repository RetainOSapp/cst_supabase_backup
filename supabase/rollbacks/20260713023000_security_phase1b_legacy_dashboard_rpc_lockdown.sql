-- Roll back only the final Phase 1B legacy Dashboard RPC lockdown.

delete from public.security_rollout_history
where version = '20260713023000';

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
      'grant execute on function %s to public',
      function_identity
    );
  end loop;
end $$;

notify pgrst, 'reload schema';
