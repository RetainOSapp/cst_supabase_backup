-- Restore the original equal-precedence matching behavior.

do $successor_contract_precedence_rollback$
declare
  function_definition text;
  patched_successor_flag constant text := $patched$
    evidence.retained_at,
    true as is_explicit
$patched$;
  original_successor_flag constant text := $original$
    evidence.retained_at,
    false as is_explicit
$original$;
  patched_candidate_projection constant text := $patched$
    event.retained_at,
    event.is_explicit,
    row_number() over (
$patched$;
  original_candidate_projection constant text := $original$
    event.retained_at,
    row_number() over (
$original$;
  patched_retained_selection constant text := $patched$
    coalesce(
      min(link.retained_at) filter (where link.is_explicit),
      min(link.retained_at)
    ) as retained_at
$patched$;
  original_retained_selection constant text := $original$
    min(link.retained_at) as retained_at
$original$;
  successor_flag_count integer;
  candidate_projection_count integer;
  retained_selection_count integer;
begin
  select pg_get_functiondef(
    'public._dashboard_renewal_cohort_counts_fast_unchecked(text,text,text,text[],text,timestamptz,timestamptz,timestamptz,timestamptz,text)'::regprocedure
  ) into function_definition;

  successor_flag_count :=
    (
      length(function_definition)
      - length(replace(function_definition, patched_successor_flag, ''))
    ) / length(patched_successor_flag);
  candidate_projection_count :=
    (
      length(function_definition)
      - length(replace(function_definition, patched_candidate_projection, ''))
    ) / length(patched_candidate_projection);
  retained_selection_count :=
    (
      length(function_definition)
      - length(replace(function_definition, patched_retained_selection, ''))
    ) / length(patched_retained_selection);

  if successor_flag_count <> 1
     or candidate_projection_count <> 1
     or retained_selection_count <> 1 then
    raise exception
      'Successor precedence rollback shape mismatch: flag %, projection %, selection %',
      successor_flag_count,
      candidate_projection_count,
      retained_selection_count;
  end if;

  function_definition := replace(
    function_definition,
    patched_successor_flag,
    original_successor_flag
  );
  function_definition := replace(
    function_definition,
    patched_candidate_projection,
    original_candidate_projection
  );
  function_definition := replace(
    function_definition,
    patched_retained_selection,
    original_retained_selection
  );
  execute function_definition;
end;
$successor_contract_precedence_rollback$;

notify pgrst, 'reload schema';
