-- Remove the redundant RetainOS Help draft for the old CST "Client Details
-- Screen" walkthrough. Its actual teaching points are now covered by the
-- Clients filtering/views, Quick Update, contact cadence, and full client
-- profile resources.

delete from public.resources
where
  slug = 'client-details-screen'
  and scope = 'retainos_help'
  and company_legacy_id is null;
