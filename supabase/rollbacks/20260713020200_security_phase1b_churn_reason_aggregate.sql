-- Roll back the additive Viewer-safe churn reason aggregate.

do $$
begin
  if exists (
    select 1
    from public.security_rollout_history rollout
    where rollout.version in (
      '20260713020500',
      '20260713021000',
      '20260713022000',
      '20260713022500',
      '20260713023000'
    )
  ) then
    raise exception 'Roll back all later Phase 1B slices before churn reason aggregate';
  end if;
end $$;

delete from public.security_rollout_history
where version = '20260713020200';

drop function if exists public.dashboard_churn_reason_rollup_actor_scoped(
  text,
  text,
  text,
  text[],
  text,
  timestamptz,
  timestamptz,
  timestamptz
);

notify pgrst, 'reload schema';
