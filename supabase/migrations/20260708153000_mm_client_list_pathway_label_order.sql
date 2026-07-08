-- Correct the MM client-list column metadata after launch QA:
-- Status should appear before Pathway, and the saved key should use pathway
-- instead of the old internal "program" name.
update public.company_settings settings
set metadata = coalesce(settings.metadata, '{}'::jsonb) || jsonb_build_object(
  'client_list_columns',
  jsonb_build_array(
    'csm',
    'status',
    'pathway',
    'onboarded',
    'renewal',
    'weeks_in_program',
    'weeks_left',
    'last_contact',
    'next_contact',
    'buy_in',
    'progress',
    'actions'
  )
)
from public.companies company
where settings.company_id = company.id
  and company.legacy_glide_row_id = 'wd7vy0vaQK2hgB3IRqy17w';
