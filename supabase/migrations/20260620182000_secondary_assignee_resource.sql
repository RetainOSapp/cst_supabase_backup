-- Add the RetainOS Help draft for secondary client assignees.

insert into public.resources (
  slug,
  title,
  type,
  description,
  content,
  loom_embed_url,
  status,
  is_dynamic,
  dynamic_key,
  sort_order,
  scope,
  company_legacy_id
)
values (
  'adding-secondary-assignee',
  'Adding a secondary assignee',
  'video',
  'RetainOS guide for enabling and assigning a secondary team member to a client alongside the Primary CSM.',
  $_$Resource category: Working with Clients

Audience: Admin, Director, Support

Operational purpose: Add another team member to a client without replacing the Primary CSM. Use this for add-on delivery, implementation support, specialist work, or coverage where the Primary CSM remains the main owner.

RetainOS status: Live for app-owned pilot/migrated clients. Secondary assignee is optional and company-gated.

Enable the feature:
- Go to the company Admin area.
- Open Settings.
- Turn on Secondary assignee under Feature gates.
- Save settings.

Assign during client creation:
- Open Clients.
- Click + New Client.
- Choose the Primary CSM.
- If Secondary assignee is enabled, choose the supporting team member in Secondary Assignee.
- Create the client.

Assign or change later:
- Open the client profile.
- Click Edit Profile.
- Choose the Primary CSM and, if needed, Secondary Assignee.
- Save the profile.

How it behaves:
- Primary CSM remains the main client owner.
- Secondary Assignee gives another team member client visibility and permission to work on assigned-client flows where RetainOS scopes CSM access by assignment.
- CSM users can see clients where they are either the Primary CSM or Secondary Assignee.
- Clients and Dashboard filters can filter by Secondary Assignee when the company feature is enabled.
- Secondary Assignee must be an active visible team member and cannot be the same person as the Primary CSM.

Recommended usage:
- Use Primary CSM for the day-to-day owner and point of contact.
- Use Secondary Assignee for add-on fulfillment, implementation, specialist coaching, temporary coverage, or delivery support.
- Clear the Secondary Assignee when that support role is no longer active.

Re-recording notes:
- Show Admin > Settings > Feature gates > Secondary assignee.
- Show + New Client with Primary CSM and Secondary Assignee.
- Show Client Detail > Edit Profile changing or clearing Secondary Assignee.
- Show Clients filter or Dashboard filter by Secondary Assignee if useful.$_$,
  null,
  'draft',
  false,
  null,
  445,
  'retainos_help',
  null
)
on conflict (slug) do update set
  title = excluded.title,
  type = excluded.type,
  description = excluded.description,
  content = excluded.content,
  loom_embed_url = excluded.loom_embed_url,
  status = excluded.status,
  is_dynamic = excluded.is_dynamic,
  dynamic_key = excluded.dynamic_key,
  sort_order = excluded.sort_order,
  scope = excluded.scope,
  company_legacy_id = excluded.company_legacy_id,
  updated_at = now();
