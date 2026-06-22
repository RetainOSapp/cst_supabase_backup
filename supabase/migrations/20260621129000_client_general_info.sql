-- Add app-owned client General Information so legacy CST general info can
-- migrate into RetainOS and be edited separately from North Star, Next Steps,
-- and Director Notes.

alter table public.clients
  add column if not exists client_general_info text;

update public.clients c
set client_general_info = nullif(trim(b.client_general_info), '')
from public.backup_company_clients b
where c.glide_row_id = b.glide_row_id
  and c.company_glide_row_id = b.company_id
  and c.client_general_info is null
  and nullif(trim(b.client_general_info), '') is not null;
