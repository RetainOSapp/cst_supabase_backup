-- Canonicalize the two duplicate Moves Method CSM memberships discovered in
-- production. Each archived record is empty; the active record is retained and
-- linked to the existing authenticated user before the duplicate is removed.

do $$
declare
  merge_row record;
  active_member public.company_members%rowtype;
  archived_member public.company_members%rowtype;
begin
  for merge_row in
    select *
    from (
      values
        (
          'lorcan.garvey@movesmethod.com'::text,
          'ac993783-8465-4aab-84b6-a44bc5b342ea'::uuid,
          '9450d3f9-c53e-4a3b-8e12-66422c4b3b80'::uuid,
          '7ff6adee-469a-4cf0-86e3-a5a4cebdccba'::uuid
        ),
        (
          'ben.alfaro@movesmethod.com'::text,
          'f10594d3-bd72-4176-a321-5baa67b5da2f'::uuid,
          '258c475c-fe5b-4fe1-be3a-b379400d1919'::uuid,
          '0ee784a6-82e7-4574-a80e-9d178e386c6a'::uuid
        )
    ) as rows(email, active_member_id, archived_member_id, auth_user_id)
  loop
    select * into strict active_member
    from public.company_members
    where id = merge_row.active_member_id
      and role = 'csm'
      and status = 'active'
      and lower(email) = merge_row.email
    for update;

    select * into strict archived_member
    from public.company_members
    where id = merge_row.archived_member_id
      and company_id = active_member.company_id
      and role = 'csm'
      and status = 'archived'
      and lower(email) = merge_row.email
    for update;

    if active_member.auth_user_id is not null
       and active_member.auth_user_id <> merge_row.auth_user_id then
      raise exception using
        errcode = '23514',
        message = format('Active membership for %s is linked to a different auth user.', merge_row.email);
    end if;

    if not exists (
      select 1 from auth.users where id = merge_row.auth_user_id
    ) then
      raise exception using
        errcode = '23514',
        message = format('Expected auth user for %s no longer exists.', merge_row.email);
    end if;

    -- The Beacon ledger is append-only and intentionally never remapped.
    if exists (
      select 1
      from public.client_assignment_intervals
      where member_id = archived_member.id
    ) then
      raise exception using
        errcode = '23514',
        message = format('Archived membership for %s has immutable assignment evidence.', merge_row.email);
    end if;

    update public.company_members
    set auth_user_id = merge_row.auth_user_id
    where id = active_member.id;

    update public.clients
    set csm_team_member_id = active_member.legacy_glide_row_id
    where csm_team_member_id = archived_member.legacy_glide_row_id;

    update public.clients
    set csm_secondary_assignee_id = active_member.legacy_glide_row_id
    where csm_secondary_assignee_id = archived_member.legacy_glide_row_id;

    -- Preserve human attribution under the canonical active membership rather
    -- than losing it through the foreign keys' ON DELETE SET NULL behavior.
    update public.client_history_events set actor_member_id = active_member.id where actor_member_id = archived_member.id;
    update public.app_audit_events set actor_member_id = active_member.id where actor_member_id = archived_member.id;
    update public.client_advocacy_events set actor_member_id = active_member.id where actor_member_id = archived_member.id;
    update public.client_call_attendance_events set actor_member_id = active_member.id where actor_member_id = archived_member.id;
    update public.client_milestones set initiated_by_member_id = active_member.id where initiated_by_member_id = archived_member.id;
    update public.client_milestones set completed_by_member_id = active_member.id where completed_by_member_id = archived_member.id;
    update public.client_timed_checkpoint_completions set completed_by_member_id = active_member.id where completed_by_member_id = archived_member.id;
    update public.notifications set recipient_member_id = active_member.id where recipient_member_id = archived_member.id;
    update public.notification_preferences set member_id = active_member.id where member_id = archived_member.id;
    update public.ai_usage_events set actor_member_id = active_member.id where actor_member_id = archived_member.id;

    delete from public.company_members where id = archived_member.id;
  end loop;
end;
$$;

-- A CSM may be archived or active, but never duplicated for the same company
-- and email. Reinstatement must reactivate the canonical record.
create unique index if not exists company_members_csm_company_email_unique_idx
  on public.company_members (company_id, lower(email))
  where role = 'csm' and nullif(btrim(email), '') is not null;
