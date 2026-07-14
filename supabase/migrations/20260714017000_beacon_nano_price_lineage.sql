-- Approve mini and nano price lineages while independently recomputing cost
-- from finalized provider token counts inside the database.

do $$
declare
  v_definition text;
  v_old_model_check constant text :=
    'or p_model <> ''gpt-5.4-mini-2026-03-17''';
  v_new_model_check constant text :=
    'or p_model not in (''gpt-5.4-mini-2026-03-17'', ''gpt-5.4-nano-2026-03-17'')';
  v_anchor constant text := $anchor$
  v_actual_cents := (v_accounted_cost_micros + 9999) / 10000;$anchor$;
  v_replacement constant text := $replacement$
  if not p_cost_uncertain and p_estimated_cost_micros <> (case p_model
    when 'gpt-5.4-mini-2026-03-17' then round(
      greatest(p_input_tokens - p_cached_input_tokens, 0) * 0.75
      + p_cached_input_tokens * 0.075
      + p_output_tokens * 4.5
    )::bigint
    when 'gpt-5.4-nano-2026-03-17' then round(
      greatest(p_input_tokens - p_cached_input_tokens, 0) * 0.2
      + p_cached_input_tokens * 0.02
      + p_output_tokens * 1.25
    )::bigint
    else -1
  end) then
    raise exception using
      errcode = '22023',
      message = 'Usage finalization model price lineage is invalid';
  end if;

  v_actual_cents := (v_accounted_cost_micros + 9999) / 10000;$replacement$;
  v_old_event_price constant text := $oldprice$
    p_latency_ms,
    v_reservation.price_card_version,
    p_estimated_cost_micros,$oldprice$;
  v_new_event_price constant text := $price$
    p_latency_ms,
    case p_model
      when 'gpt-5.4-mini-2026-03-17'
        then 'gpt-5.4-mini-2026-03-17-2026-07-13'
      when 'gpt-5.4-nano-2026-03-17'
        then 'gpt-5.4-nano-2026-03-17-2026-07-14'
    end,
    p_estimated_cost_micros,$price$;
begin
  select pg_get_functiondef(
    'public.beacon_finalize_usage(uuid,uuid,text,text,integer,integer,integer,integer,bigint,text[],integer,integer,integer,text,boolean,boolean,text)'::regprocedure
  ) into strict v_definition;
  if position(v_old_model_check in v_definition) = 0
    or position(v_anchor in v_definition) = 0
    or position(v_old_event_price in v_definition) = 0 then
    raise exception 'Expected Beacon finalization price anchors were not found';
  end if;
  execute replace(
    replace(
      replace(v_definition, v_old_model_check, v_new_model_check),
      v_anchor,
      v_replacement
    ),
    v_old_event_price,
    v_new_event_price
  );
end;
$$;

notify pgrst, 'reload schema';
