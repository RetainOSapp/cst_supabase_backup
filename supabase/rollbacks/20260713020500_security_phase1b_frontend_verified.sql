-- Remove the manual Phase 1B frontend release gate.

do $$
begin
  if exists (
    select 1
    from public.security_rollout_history rollout
    where rollout.version in (
      '20260713021000',
      '20260713022000',
      '20260713022500',
      '20260713023000'
    )
  ) then
    raise exception 'Roll back Phase 1B policy slices before removing the frontend gate';
  end if;
end $$;

delete from public.security_rollout_history
where version = '20260713020500';

notify pgrst, 'reload schema';
