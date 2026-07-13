-- Roll back the additive Phase 1B Dashboard aggregate authority slice.

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
    raise exception 'Roll back all later Phase 1B slices before aggregate authority';
  end if;
end $$;

delete from public.security_rollout_history
where version = '20260713020000';

drop function if exists public.dashboard_chart_rollups_actor_scoped(
  text,
  text,
  text,
  text[],
  text,
  timestamptz,
  timestamptz,
  timestamptz
);
drop function if exists public.dashboard_overview_rollups_actor_scoped(
  text,
  text,
  text,
  text[],
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz
);
drop function if exists public.dashboard_kpi_counts_actor_scoped(
  text,
  text,
  text,
  text[],
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz
);
drop function if exists public.dashboard_authorized_app_clients(
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
