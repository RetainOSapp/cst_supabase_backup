drop function if exists public.reconcile_client_contract_summary(
  uuid, uuid, uuid, text, timestamptz
);

notify pgrst, 'reload schema';
