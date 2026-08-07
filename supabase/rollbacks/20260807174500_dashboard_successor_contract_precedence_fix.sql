-- Restore the prior explicit-first successor behavior.

do $successor_contract_precedence_fix_rollback$
declare
  function_definition text;
  safe_successor_flag constant text := $safe$
    evidence.retained_at,
    false as is_explicit
$safe$;
  unsafe_successor_flag constant text := $unsafe$
    evidence.retained_at,
    true as is_explicit
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
  unsafe_retained_selection constant text := $unsafe$
    coalesce(
      min(link.retained_at) filter (where link.is_explicit),
      min(link.retained_at)
    ) as retained_at
$unsafe$;
  successor_flag_count integer;
  retained_selection_count integer;
begin
  select pg_get_functiondef(
    'public._dashboard_renewal_cohort_counts_fast_unchecked(text,text,text,text[],text,timestamptz,timestamptz,timestamptz,timestamptz,text)'::regprocedure
  ) into function_definition;

  successor_flag_count :=
    (
      length(function_definition)
      - length(replace(function_definition, safe_successor_flag, ''))
    ) / length(safe_successor_flag);
  retained_selection_count :=
    (
      length(function_definition)
      - length(replace(function_definition, safe_retained_selection, ''))
    ) / length(safe_retained_selection);

  if successor_flag_count <> 1 or retained_selection_count <> 1 then
    raise exception
      'Successor precedence rollback shape mismatch: flag %, selection %',
      successor_flag_count,
      retained_selection_count;
  end if;

  function_definition := replace(
    function_definition,
    safe_successor_flag,
    unsafe_successor_flag
  );
  function_definition := replace(
    function_definition,
    safe_retained_selection,
    unsafe_retained_selection
  );
  execute function_definition;
end;
$successor_contract_precedence_fix_rollback$;

notify pgrst, 'reload schema';
