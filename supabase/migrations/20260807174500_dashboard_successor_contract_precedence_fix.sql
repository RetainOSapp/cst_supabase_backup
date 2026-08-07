-- Correct successor precedence without allowing a contract to renew itself.
--
-- Successor events remain non-explicit so the existing candidate-specific
-- successor check must pass (successor end must exceed the candidate end).
-- Once matched, prefer:
--   1. the valid successor contract start;
--   2. an explicit RetainOS retention event;
--   3. inferred legacy status-change evidence.

do $successor_contract_precedence_fix$
declare
  function_definition text;
  unsafe_successor_flag constant text := $unsafe$
    evidence.retained_at,
    true as is_explicit
$unsafe$;
  safe_successor_flag constant text := $safe$
    evidence.retained_at,
    false as is_explicit
$safe$;
  unsafe_retained_selection constant text := $unsafe$
    coalesce(
      min(link.retained_at) filter (where link.is_explicit),
      min(link.retained_at)
    ) as retained_at
$unsafe$;
  safe_retained_selection constant text := $safe$
    coalesce(
      min(link.retained_at) filter (
        where link.event_key like 'successor-contract:%'
      ),
      min(link.retained_at) filter (where link.is_explicit),
      min(link.retained_at)
    ) as retained_at
$safe$;
  successor_flag_count integer;
  retained_selection_count integer;
begin
  select pg_get_functiondef(
    'public._dashboard_renewal_cohort_counts_fast_unchecked(text,text,text,text[],text,timestamptz,timestamptz,timestamptz,timestamptz,text)'::regprocedure
  ) into function_definition;

  successor_flag_count :=
    (
      length(function_definition)
      - length(replace(function_definition, unsafe_successor_flag, ''))
    ) / length(unsafe_successor_flag);
  retained_selection_count :=
    (
      length(function_definition)
      - length(replace(function_definition, unsafe_retained_selection, ''))
    ) / length(unsafe_retained_selection);

  if successor_flag_count <> 1 or retained_selection_count <> 1 then
    raise exception
      'Successor precedence fix shape mismatch: flag %, selection %',
      successor_flag_count,
      retained_selection_count;
  end if;

  function_definition := replace(
    function_definition,
    unsafe_successor_flag,
    safe_successor_flag
  );
  function_definition := replace(
    function_definition,
    unsafe_retained_selection,
    safe_retained_selection
  );
  execute function_definition;
end;
$successor_contract_precedence_fix$;

comment on function public.dashboard_renewal_cohort_counts_fast is
  'Returns analytics-included renewal decisions using a candidate-validated non-add-on successor contract first, explicit RetainOS retention events second, and legacy status inference last. Contracts cannot renew themselves.';

notify pgrst, 'reload schema';
