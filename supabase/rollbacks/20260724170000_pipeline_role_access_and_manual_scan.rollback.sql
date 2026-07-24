drop function if exists public.update_company_pipeline_role_access_with_audit(
  uuid, boolean, boolean, boolean, boolean, uuid, uuid, text
);

-- Restore the pre-release operational behavior without deleting additive
-- columns that deployed policies or cached API schemas may still reference.
update public.company_settings
set
  enable_pipeline_director_access = true,
  enable_pipeline_support_access = true,
  enable_pipeline_csm_access = true;

create or replace function public.pipeline_manual_scan_requested(p_run_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select false;
$$;

notify pgrst, 'reload schema';
