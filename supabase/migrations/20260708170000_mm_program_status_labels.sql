update public.company_settings settings
set metadata = jsonb_set(
  coalesce(settings.metadata, '{}'::jsonb),
  '{program_status_labels}',
  jsonb_build_object(
    'front-end', 'Front End',
    'back-end', 'Back End',
    'paused', 'Paused',
    'suspended', 'MIA',
    'off-boarded', 'Offboarded'
  ),
  true
)
from public.companies company
where settings.company_id = company.id
  and company.legacy_glide_row_id = 'wd7vy0vaQK2hgB3IRqy17w';
