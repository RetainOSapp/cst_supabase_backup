-- Roll back pause-period contract reconciliation.
-- This removes the new ledger and RPC only; it does not reverse contract dates
-- already reconciled through completed pause transitions.

drop function if exists public.apply_client_pause_transition(
  uuid, uuid, text, text, text, date, date, date, text, uuid, uuid, text
);

drop table if exists public.client_pause_operations;
drop table if exists public.client_pause_periods;

alter table public.company_settings
  drop column if exists extend_contract_for_pauses;

notify pgrst, 'reload schema';
