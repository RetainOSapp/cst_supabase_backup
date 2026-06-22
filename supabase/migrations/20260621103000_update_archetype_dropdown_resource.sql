-- Refresh the RetainOS Help draft after archetypes became a controlled dropdown.

update public.resources
set
  description = 'RetainOS guide for enabling archetype visibility in client roster views and editing a client archetype from the controlled dropdown.',
  content = $_$Resource category: Working with Clients

Audience: Admin, CSM, Director, Support

Operational purpose: Help CSMs and operators see client archetypes directly in the roster so they can personalize coaching, support, and prioritization without opening every client profile.

RetainOS status: Live for app-owned pilot/migrated clients. Archetype visibility in roster views is optional and company-gated. Archetype values are controlled by RetainOS and limited to Doer, Controller, Worrier, and Follower.

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
- Choose Doer, Controller, Worrier, or Follower from the Archetype dropdown.
- Save the profile.
- Return to Clients List or Card view to see the updated value.

Recommended usage:
- Use archetypes as an operating signal for coaching style, communication style, risk interpretation, and support strategy.
- Keep the feature gate off for companies that do not use archetypes operationally, so the roster stays simpler.
- During company migration, RetainOS normalizes legacy Glide archetypes to the same dropdown labels.

Re-recording notes:
- Show Admin > Settings > Feature gates > Client archetypes.
- Show Clients List view with the Archetype column.
- Show Clients Card view with Archetype visible.
- Open a client profile, edit Archetype from the dropdown, save, and return to the roster to show the updated value.$_$,
  updated_at = now()
where slug = 'archetypes-in-client-views';
