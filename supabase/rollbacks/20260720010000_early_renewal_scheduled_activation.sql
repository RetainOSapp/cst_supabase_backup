-- Fail-closed rollback for early-renewal scheduled activation.

do $do$
declare
  v_job_id bigint;
begin
  if to_regclass('cron.job') is not null then
    execute 'select jobid from cron.job where jobname = $1 limit 1'
      into v_job_id using 'retainos-scheduled-contract-activations';
    if v_job_id is not null then
      execute 'select cron.unschedule($1)' using v_job_id;
    end if;
  end if;
end;
$do$;

do $$
begin
  if to_regclass('public.scheduled_contract_activations') is not null
     and exists (select 1 from public.scheduled_contract_activations) then
    raise exception 'Rollback refused: scheduled contract activation evidence exists.';
  end if;
end;
$$;

drop function if exists public.reconcile_scheduled_contract_activation(
  uuid, uuid, text, timestamptz, uuid, uuid, text
);
drop function if exists public.process_due_scheduled_contract_activations(timestamptz, integer);
drop function if exists public.create_scheduled_retention_contract(
  uuid, uuid, uuid, timestamptz, timestamptz, numeric, numeric, numeric,
  text, text, boolean, text, text, text, boolean, boolean, uuid, uuid, text, text
);
drop function if exists public.refresh_client_contract_summary(uuid, uuid, timestamptz);
drop table if exists public.scheduled_contract_activations;

notify pgrst, 'reload schema';
