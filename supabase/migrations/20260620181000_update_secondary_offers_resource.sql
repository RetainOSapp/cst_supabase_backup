-- Refresh the RetainOS Help draft for secondary offers after adding the
-- RetainOS secondary pathway/milestone feature gate.

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
  'adding-secondary-offers',
  'Adding secondary pathways',
  'video',
  'RetainOS guide for enabling and using secondary pathway tracking for add-ons, call tracks, or parallel client deliverables.',
  $_$Resource category: Working with Clients

Audience: Admin, Director

Operational purpose: Track a second pathway/milestone pair on a client profile without changing the client's primary program pathway.

RetainOS status: Live for app-owned pilot/migrated clients. Secondary pathways are optional and company-gated.

When to use it:
- Track an add-on, upsell, or extra support package alongside the main offer.
- Track a lightweight call-attendance pathway such as Call 1, Call 2, Call 3.
- Track a parallel deliverable that should be visible on the client profile but should not replace the primary pathway.

Enable the feature:
- Go to the company Admin area.
- Open Settings.
- Turn on Secondary pathway under Feature gates.
- Save settings.

Configure the pathway options:
- Go to Pathways & Milestones in Admin.
- Create or edit the offer/pathway you want to use as the secondary track.
- Add milestones such as Call 1, Call 2, Call 3, or the relevant add-on steps.

Add a secondary pathway to a client:
- Open the client profile.
- Go to Pathways & Milestones.
- Click Change Pathway & Milestones.
- Keep the primary pathway/milestone as-is unless it also needs changing.
- In Secondary pathway, choose the secondary pathway and milestone.
- Save Pathway.

How it behaves:
- The primary pathway remains the main program pathway.
- The secondary pathway appears as a separate read-only summary on the Pathways & Milestones tab.
- Directors and Super Admins can set or clear the secondary pathway.
- Changes are written to client history and audit logs.
- Secondary pathway tracking does not create a second program status or contract lifecycle.

Re-recording notes:
- Show Admin > Settings > Feature gates > Secondary pathway.
- Show creating a call-tracking pathway in Pathways & Milestones.
- Show assigning that pathway from Client Detail > Pathways & Milestones > Change Pathway & Milestones.
- Mention that RetainOS calls this Secondary pathway because it reuses the Pathways & Milestones model.$_$,
  'https://www.loom.com/share/c2e9f21879f74df08f577fea7274d4f6',
  'draft',
  false,
  null,
  440,
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
  updated_at = now()
;
