-- Remove the manual Phase 1B post-policy QA release gate.

do $$
begin
  if exists (
    select 1
    from public.security_rollout_history rollout
    where rollout.version = '20260713023000'
  ) then
    raise exception 'Roll back the legacy Dashboard RPC lockdown first';
  end if;
end $$;

delete from public.security_rollout_history
where version = '20260713022500';

notify pgrst, 'reload schema';
