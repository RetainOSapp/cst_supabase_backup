-- Fix the shared AI Features usage snapshot so zero micros renders as zero
-- cents. sum(bigint) returns numeric; the previous numeric-to-bigint return cast
-- rounded 0.9999 to 1 independently for consumed and reserved usage.

do $$
declare
  v_definition text;
  v_buggy_consumed constant text :=
    'select (coalesce(sum(event.actual_cost_micros), 0) + 9999) / 10000';
  v_fixed_consumed constant text :=
    'select (coalesce(sum(event.actual_cost_micros), 0)::bigint + 9999) / 10000';
  v_buggy_reserved constant text :=
    'select (coalesce(sum(reservation.reserved_cost_micros), 0) + 9999) / 10000';
  v_fixed_reserved constant text :=
    'select (coalesce(sum(reservation.reserved_cost_micros), 0)::bigint + 9999) / 10000';
begin
  select pg_get_functiondef(
    'public.beacon_allowance_usage_snapshot(uuid,timestamptz)'::regprocedure
  )
  into strict v_definition;

  if position(v_buggy_consumed in v_definition) = 0
    or position(v_buggy_reserved in v_definition) = 0 then
    raise exception using
      errcode = '55000',
      message = 'Expected AI allowance rounding expressions were not found';
  end if;

  execute replace(
    replace(v_definition, v_buggy_consumed, v_fixed_consumed),
    v_buggy_reserved,
    v_fixed_reserved
  );
end;
$$;

notify pgrst, 'reload schema';
