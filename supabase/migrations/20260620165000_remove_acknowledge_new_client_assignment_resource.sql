-- Remove the RetainOS Help draft for the old CST "Acknowledge new client
-- assignment" popup flow. RetainOS does not currently have this CSM-facing
-- assignment alert; track it as future notification scope instead.

delete from public.resources
where
  slug = 'acknowledging-a-new-client-assigned-to-you-as-a-csm'
  and scope = 'retainos_help'
  and company_legacy_id is null;
