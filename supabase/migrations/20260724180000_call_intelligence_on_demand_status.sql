-- Keep the call-level processing state tied to the base analysis. On-demand
-- runs are independent add-ons and must not strand an already analyzed call
-- in "processing" after their own terminal state.

create or replace function public.restore_call_intelligence_status_after_on_demand()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base_status text;
begin
  if new.run_kind <> 'on_demand'
    or new.status not in ('succeeded', 'failed')
    or old.status is not distinct from new.status then
    return new;
  end if;

  select run.status
  into v_base_status
  from public.call_intelligence_runs run
  where run.call_id = new.call_id
    and run.run_kind in ('fixed', 'reprocess')
  order by run.created_at desc, run.id desc
  limit 1;

  update public.call_intelligence_calls
  set processing_status = case
    when v_base_status = 'succeeded' then 'completed'
    when v_base_status = 'failed' then 'failed'
    when v_base_status in ('queued', 'claimed') then 'processing'
    else processing_status
  end
  where id = new.call_id;

  return new;
end;
$$;

drop trigger if exists call_intelligence_on_demand_restore_call_status
  on public.call_intelligence_runs;
create trigger call_intelligence_on_demand_restore_call_status
after update of status on public.call_intelligence_runs
for each row
execute function public.restore_call_intelligence_status_after_on_demand();

revoke all on function public.restore_call_intelligence_status_after_on_demand()
  from public, anon, authenticated;

-- Repair already-terminal on-demand runs that left a successfully analyzed
-- call marked as processing. Never touch calls with any active run.
update public.call_intelligence_calls call
set
  processing_status = 'completed',
  last_error_category = null
where call.processing_status = 'processing'
  and exists (
    select 1
    from public.call_intelligence_runs base_run
    where base_run.call_id = call.id
      and base_run.run_kind in ('fixed', 'reprocess')
      and base_run.status = 'succeeded'
  )
  and not exists (
    select 1
    from public.call_intelligence_runs active_run
    where active_run.call_id = call.id
      and active_run.status in ('queued', 'claimed')
  );
