-- Refresh the RetainOS Help draft for archetypes in client views.

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
  'archetypes-in-client-views',
  'Archetypes in client views',
  'video',
  'RetainOS guide for enabling archetype visibility in client roster views and editing a client archetype from the client profile.',
  $_$Resource category: Working with Clients

Audience: Admin, CSM, Director, Support

Operational purpose: Help CSMs and operators see client archetypes directly in the roster so they can personalize coaching, support, and prioritization without opening every client profile.

RetainOS status: Live for app-owned pilot/migrated clients. Archetype visibility in roster views is optional and company-gated.

Enable the feature:
- Go to the company Admin area.
- Open Settings.
- Turn on Client archetypes under Feature gates.
- Save settings.

Where archetypes appear:
- Clients List view shows Archetype as a column when enabled.
- Clients Card view shows Archetype as a compact client card detail when enabled.
- Client Detail continues to show Archetype in the profile details.

How to update a client archetype:
- Open the client profile.
- Click Edit Profile.
- Update Archetype.
- Save the profile.
- Return to Clients List or Card view to see the updated value.

Recommended usage:
- Use archetypes as an operating signal for coaching style, communication style, risk interpretation, and support strategy.
- Keep archetype values short and recognizable so the roster remains easy to scan.
- If a company does not use archetypes operationally, leave the feature gate off to keep the roster simpler.

Re-recording notes:
- Show Admin > Settings > Feature gates > Client archetypes.
- Show Clients List view with the Archetype column.
- Show Clients Card view with Archetype visible.
- Open a client profile, edit Archetype, save, and return to the roster to show the updated value.$_$,
  'https://www.loom.com/share/359beee7916b45f299f2583ac0728d2b',
  'draft',
  false,
  null,
  350,
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
