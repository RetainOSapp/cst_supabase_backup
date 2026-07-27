-- Stop future automatic owner assignment. Existing audited owner assignments
-- remain intact rather than silently rewriting business history.

drop trigger if exists client_pipeline_items_assign_primary_owner
  on public.client_pipeline_items;
drop function if exists public.assign_pipeline_primary_owner_on_insert();
drop function if exists public.resolve_pipeline_primary_owner_member_id(uuid, uuid);

notify pgrst, 'reload schema';
