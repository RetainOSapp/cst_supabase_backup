-- Assign contract-linked Renewal items to the client's exact active primary
-- CSM/member at creation time. Ambiguous, missing, inactive, or read-only
-- mappings deliberately remain unassigned.

create or replace function public.resolve_pipeline_primary_owner_member_id(
  p_company_id uuid,
  p_client_id uuid
) returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when count(*) = 1 then (array_agg(member.id order by member.id))[1]
    else null
  end
  from public.clients client
  join public.company_members member
    on member.company_id = client.company_id
   and member.legacy_glide_row_id = client.csm_team_member_id
   and member.status = 'active'
   and member.is_read_only = false
   and member.role <> 'viewer'
  where client.company_id = p_company_id
    and client.id = p_client_id
    and client.archived_at is null;
$$;

create or replace function public.assign_pipeline_primary_owner_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_member_id uuid;
begin
  if new.owner_member_id is not null
     or new.source_contract_id is null
     or not exists (
       select 1
       from public.company_pipelines pipeline
       where pipeline.id = new.pipeline_id
         and pipeline.company_id = new.company_id
         and pipeline.pipeline_type = 'renewal'
         and pipeline.archived_at is null
     ) then
    return new;
  end if;

  v_owner_member_id := public.resolve_pipeline_primary_owner_member_id(
    new.company_id,
    new.client_id
  );
  if v_owner_member_id is not null then
    new.owner_member_id := v_owner_member_id;
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
      'owner_assignment_source', 'exact_active_primary_csm',
      'owner_assigned_at', now()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists client_pipeline_items_assign_primary_owner
  on public.client_pipeline_items;
create trigger client_pipeline_items_assign_primary_owner
before insert on public.client_pipeline_items
for each row execute function public.assign_pipeline_primary_owner_on_insert();

revoke all on function public.resolve_pipeline_primary_owner_member_id(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.assign_pipeline_primary_owner_on_insert()
  from public, anon, authenticated;
grant execute on function public.resolve_pipeline_primary_owner_member_id(uuid, uuid)
  to service_role;

notify pgrst, 'reload schema';
