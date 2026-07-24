-- Emergency rollback is deliberately fail-closed. It avoids restoring the
-- historical-contract bug while allowing the frontend/Edge release to be
-- rolled back independently.

create or replace function public.preview_due_renewal_pipeline_items(
  p_company_id uuid,
  p_pipeline_id uuid,
  p_as_of timestamptz default now()
)
returns table(
  contract_id uuid,
  client_id uuid,
  pipeline_id uuid,
  entry_stage_id uuid,
  contract_end_at timestamptz,
  eligibility_status text,
  exclusion_reason text,
  estimated_value_cents bigint,
  currency_code text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Renewal preview is paused pending current-contract validation';
end
$$;

revoke all on function public.preview_due_renewal_pipeline_items(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.preview_due_renewal_pipeline_items(uuid, uuid, timestamptz)
  to service_role;

notify pgrst, 'reload schema';
