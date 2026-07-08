-- Configure Moves Method's default Clients List columns without changing
-- the fallback for future companies.
update public.company_settings settings
set metadata = coalesce(settings.metadata, '{}'::jsonb) || jsonb_build_object(
  'client_list_columns',
  jsonb_build_array(
    'status',
    'pathway',
    'csm',
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
