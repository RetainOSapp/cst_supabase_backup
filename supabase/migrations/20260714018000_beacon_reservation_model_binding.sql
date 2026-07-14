-- Bind each reservation to the server-owned Edge release/model price lineage.

do $$
declare
  v_definition text;
  v_old_price constant text := '''gpt-5.4-mini-2026-03-17-2026-07-13''';
  v_new_price constant text := $price$case p_release_version
      when 'beacon-edge-beta-v1' then 'gpt-5.4-mini-2026-03-17-2026-07-13'
      when 'beacon-edge-beta-v1-nano' then 'gpt-5.4-nano-2026-03-17-2026-07-14'
    end$price$;
  v_anchor constant text := $anchor$
  insert into public.ai_usage_events ($anchor$;
  v_replacement constant text := $replacement$
  if p_release_version not in ('beacon-edge-beta-v1', 'beacon-edge-beta-v1-nano') then
    raise exception using errcode = '22023',
      message = 'Beacon reservation release lineage is invalid';
  end if;

  insert into public.ai_usage_events ($replacement$;
begin
  select pg_get_functiondef(
    'public.beacon_reserve_usage(uuid,text,uuid,uuid,uuid,text,bigint,integer,text)'::regprocedure
  ) into strict v_definition;
  if position(v_old_price in v_definition) = 0
    or position(v_anchor in v_definition) = 0 then
    raise exception 'Expected Beacon reservation lineage anchors were not found';
  end if;
  execute replace(
    replace(v_definition, v_old_price, v_new_price),
    v_anchor,
    v_replacement
  );
end;
$$;

do $$
declare
  v_definition text;
  v_anchor constant text := $anchor$
  perform pg_advisory_xact_lock($anchor$;
  v_replacement constant text := $replacement$
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

  perform pg_advisory_xact_lock($replacement$;
begin
  select pg_get_functiondef(
    'public.beacon_finalize_usage(uuid,uuid,text,text,integer,integer,integer,integer,bigint,text[],integer,integer,integer,text,boolean,boolean,text)'::regprocedure
  ) into strict v_definition;
  if position(v_anchor in v_definition) = 0 then
    raise exception 'Expected Beacon finalization lock anchor was not found';
  end if;
  execute replace(v_definition, v_anchor, v_replacement);
end;
$$;

notify pgrst, 'reload schema';
