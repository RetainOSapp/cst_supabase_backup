do $$
begin
  if exists (
    select 1 from public.security_rollout_history rollout
    where rollout.version > '20260714019000'
      and (rollout.migration_name like 'beacon_%'
        or rollout.migration_name like 'ai_feature_%')
  ) then raise exception 'Roll back later Beacon/AI slices first'; end if;
end $$;

delete from public.security_rollout_history where version = '20260714019000';
drop function if exists public.beacon_get_client_brief(uuid, uuid, uuid, uuid, text, text);
drop function if exists public.beacon_list_clients(
  uuid, uuid, uuid, text, text, text, uuid, text, text, integer, text, integer
);
notify pgrst, 'reload schema';
