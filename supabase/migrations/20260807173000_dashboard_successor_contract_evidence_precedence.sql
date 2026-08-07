-- Prefer authoritative retention evidence over inferred legacy status changes.
--
-- A successor contract is explicit commercial evidence. Without precedence,
-- an older Front End / Back End legacy status event matched to the same prior
-- contract can supply an earlier retained_at and keep a late renewal in the
-- wrong month. Preserve explicit RetainOS events and successor contracts first;
-- use legacy status inference only when no explicit evidence matched.

do $successor_contract_precedence_patch$
declare
  function_definition text;
  old_successor_flag constant text := $old$
    evidence.retained_at,
    false as is_explicit
$old$;
  new_successor_flag constant text := $new$
    evidence.retained_at,
    true as is_explicit
$new$;
  old_candidate_projection constant text := $old$
    event.retained_at,
    row_number() over (
$old$;
  new_candidate_projection constant text := $new$
    event.retained_at,
    event.is_explicit,
    row_number() over (
$new$;
  old_retained_selection constant text := $old$
    min(link.retained_at) as retained_at
$old$;
  new_retained_selection constant text := $new$
    coalesce(
      min(link.retained_at) filter (where link.is_explicit),
      min(link.retained_at)
    ) as retained_at
$new$;
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
      - length(replace(function_definition, old_successor_flag, ''))
    ) / length(old_successor_flag);
  if successor_flag_count <> 1 then
    raise exception
      'Expected one successor-contract evidence flag, found %',
      successor_flag_count;
  end if;

  candidate_projection_count :=
    (
      length(function_definition)
      - length(replace(function_definition, old_candidate_projection, ''))
    ) / length(old_candidate_projection);
  if candidate_projection_count <> 1 then
    raise exception
      'Expected one retention candidate projection, found %',
      candidate_projection_count;
  end if;

  retained_selection_count :=
    (
      length(function_definition)
      - length(replace(function_definition, old_retained_selection, ''))
    ) / length(old_retained_selection);
  if retained_selection_count <> 1 then
    raise exception
      'Expected one matched-retention selection, found %',
      retained_selection_count;
  end if;

  function_definition := replace(
    function_definition,
    old_successor_flag,
    new_successor_flag
  );
  function_definition := replace(
    function_definition,
    old_candidate_projection,
    new_candidate_projection
  );
  function_definition := replace(
    function_definition,
    old_retained_selection,
    new_retained_selection
  );
  execute function_definition;
end;
$successor_contract_precedence_patch$;

comment on function public.dashboard_renewal_cohort_counts_fast is
  'Returns analytics-included renewal decisions using explicit RetainOS events or valid non-add-on successor contracts before legacy status inference. Early renewals stay with contract end; late renewals move to successor start.';

notify pgrst, 'reload schema';
