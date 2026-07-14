do $$
begin
  if exists (
    select 1 from public.security_rollout_history rollout
    where rollout.version > '20260714018000'
      and (rollout.migration_name like 'beacon_%'
        or rollout.migration_name like 'ai_feature_%')
  ) then raise exception 'Roll back later Beacon/AI slices first'; end if;
end $$;
delete from public.security_rollout_history where version = '20260714018000';

do $$
declare v_definition text;
  v_new_price constant text := $price$case p_release_version
      when 'beacon-edge-beta-v1' then 'gpt-5.4-mini-2026-03-17-2026-07-13'
      when 'beacon-edge-beta-v1-nano' then 'gpt-5.4-nano-2026-03-17-2026-07-14'
    end$price$;
  v_old_price constant text := '''gpt-5.4-mini-2026-03-17-2026-07-13''';
  v_gate constant text := $gate$
  if p_release_version not in ('beacon-edge-beta-v1', 'beacon-edge-beta-v1-nano') then
    raise exception using errcode = '22023',
      message = 'Beacon reservation release lineage is invalid';
  end if;

$gate$;
begin
  select pg_get_functiondef('public.beacon_reserve_usage(uuid,text,uuid,uuid,uuid,text,bigint,integer,text)'::regprocedure) into strict v_definition;
  execute replace(replace(v_definition, v_gate, ''), v_new_price, v_old_price);
end $$;

do $$
declare v_definition text;
  v_gate constant text := $gate$
  if v_reservation.release_version is distinct from p_release_version
    or not (
      (p_release_version = 'beacon-edge-beta-v1'
        and p_model = 'gpt-5.4-mini-2026-03-17'
        and v_reservation.price_card_version = 'gpt-5.4-mini-2026-03-17-2026-07-13')
      or
      (p_release_version = 'beacon-edge-beta-v1-nano'
        and p_model = 'gpt-5.4-nano-2026-03-17'
        and v_reservation.price_card_version = 'gpt-5.4-nano-2026-03-17-2026-07-14')
    ) then
    raise exception using errcode = '22023',
      message = 'Beacon finalization release lineage is invalid';
  end if;

$gate$;
begin
  select pg_get_functiondef('public.beacon_finalize_usage(uuid,uuid,text,text,integer,integer,integer,integer,bigint,text[],integer,integer,integer,text,boolean,boolean,text)'::regprocedure) into strict v_definition;
  execute replace(v_definition, v_gate, '');
end $$;

notify pgrst, 'reload schema';
