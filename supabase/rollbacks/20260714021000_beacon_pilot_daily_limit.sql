do $$
begin
  if exists (
    select 1 from public.security_rollout_history rollout
    where rollout.version > '20260714021000'
      and (rollout.migration_name like 'beacon_%'
        or rollout.migration_name like 'ai_feature_%')
  ) then raise exception 'Roll back later Beacon/AI slices first'; end if;
end $$;

delete from public.security_rollout_history where version = '20260714021000';
update public.ai_feature_global_controls
set actor_requests_per_day = 50,
    config_version = config_version + 1,
    updated_at = now()
where feature_key = 'beacon'
  and actor_requests_per_day = 100;
notify pgrst, 'reload schema';
