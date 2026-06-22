-- Remove redundant merged-pointer contact-date resources now that
-- `using-date-of-last-contact-and-date-of-next-contact-features` is the
-- canonical RetainOS Help draft: "Tracking client contact cadence".

delete from public.resources
where
  slug in (
    'date-of-last-contact-sorting-clients',
    'date-of-next-contact'
  )
  and scope = 'retainos_help'
  and company_legacy_id is null;
