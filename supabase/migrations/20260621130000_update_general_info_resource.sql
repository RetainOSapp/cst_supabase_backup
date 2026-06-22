-- Refresh the old CST General Info resource for the RetainOS client
-- profile implementation.

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
  'optional-general-info-section-on-client-profile',
  'Using General Information on a client profile',
  'video',
  'RetainOS guide for storing evergreen client context separately from North Star, Next Steps, Director Notes, and company custom fields.',
  $_$Resource category: Working with Clients

Audience: CSM, Admin, Director, Support

Operational purpose: Store useful evergreen context about a client that is not a current action item, not the client's main goal, and not a private Director-only note.

RetainOS status: Live for app-owned pilot/migrated clients. RetainOS stores General Information as a dedicated client profile field and preserves migrated CST General Info where available.

What General Information is for:
- Stable client context that helps the team support the person well.
- Preferences, background, constraints, personal context, dietary requirements, implementation history, or other useful notes.
- Information that should remain visible on the client profile across multiple calls.

What it is not for:
- Current action items. Use Next Steps.
- The client's main transformation goal. Use North Star.
- Private leadership-only notes. Use Director Notes, visible only to permitted roles.
- Structured company KPIs or repeatable fields. Use Custom Fields.
- Due-date reminders. Use Tasks.

Where to view it:
- Open Clients.
- Open the client profile.
- Go to Client Detail > Program.
- General Information appears alongside North Star, Next Steps, and related program context when it has a value.

How to edit it:
- Open the client profile.
- Click Edit Profile.
- Update General Information.
- Save Profile.
- RetainOS saves the value to the app-owned client profile and records the profile change in client history.

How this differs from the old CST version:
- The old CST flow used an Admin toggle called Enable client general information.
- RetainOS does not need that toggle for the core field.
- General Information is simply part of the client profile, while Custom Fields handle company-specific optional fields and structured data.
- RetainOS keeps Quick Update focused on operating updates like Next Steps, contact dates, outcomes, pathway progress, advocacy, and custom field updates.

Migration notes:
- Legacy CST `client_general_info` values migrate into RetainOS `client_general_info`.
- During migration QA, pick a known client with General Info in Glide/CST and confirm it appears in Client Detail > Program.
- Edit the value from Edit Profile and confirm it saves and remains visible.
- If a company used General Info as a structured KPI, consider rebuilding that item as a RetainOS Custom Field instead.

Best practices:
- Keep General Information evergreen and useful.
- Do not duplicate every call note here; that belongs in Next Steps / History.
- Keep sensitive or leadership-only context in Director Notes.
- Use Custom Fields when the same type of information should be tracked across many clients.

Related resources:
- Understanding and updating a client profile.
- Leveraging North Star for proactive coaching.
- Using Next Steps well.
- Custom fields in RetainOS.
- Understanding client history in RetainOS.

Re-recording notes:
- Show Client Detail > Program with General Information visible.
- Open Edit Profile and update General Information.
- Explain the difference between North Star, Next Steps, General Information, Director Notes, and Custom Fields.
- Mention that RetainOS does not use the old CST Admin toggle for this core profile field.$_$,
  'https://www.loom.com/share/1cc1bed7508b4fdab9bd8a3d898f3c99',
  'draft',
  false,
  null,
  560,
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
