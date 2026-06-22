-- Refresh the old CST Client History Log resource for the current RetainOS
-- History tab and broader app-owned change log coverage.

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
  'understanding-the-client-history-log',
  'Understanding client history in RetainOS',
  'video',
  'RetainOS guide for using the client History tab to review profile changes, interaction updates, lifecycle events, outcomes, contracts, tasks, and integration-driven updates.',
  $_$Resource category: Working with Clients

Audience: CSM, Admin, Director, Support

Operational purpose: Use client history to understand what changed on a client profile, when it changed, who or what changed it, and what context existed before the latest update.

RetainOS status: Live for app-owned pilot/migrated clients. Mirror-only CST data can show limited legacy context, but the full RetainOS History tab is populated by app-owned write flows after migration.

Where to find it:
- Open Clients.
- Click into a client profile.
- Open the History tab.

What changed from the old CST walkthrough:
- The old CST used a three-dot menu and a history drawer.
- RetainOS uses a dedicated History tab on the client profile.
- RetainOS history is broader than the original Glide version and is designed as an operating timeline, not just a small note archive.

What the History tab can include:
- Quick Updates, including Notes, Next Steps, Last Contact, Next Contact, Success, Progress, Buy-In, and custom field updates.
- Program context updates, including Next Steps and contact cadence changes from the Program section.
- Profile changes, including fields such as North Star, archetype, client details, links, assignees, and other editable profile context where supported.
- Lifecycle changes, including paused, suspended, reactivated, offboarded, churn reason, and offboarding notes.
- Pathway and milestone changes, including primary pathway changes, secondary pathway changes when enabled, started milestones, and completed milestones.
- Contract changes, including created, edited, archived, deleted, renewal, and upsell-related contract events where app-owned contracts are enabled.
- Outcome and advocacy updates, including Success, Progress, Buy-In, reviews, testimonials, referrals, and renewal / upsell events.
- Task-related context where the task workflow writes client history.
- Integration-driven updates such as AI call summaries, webhook updates, and approved integration review items.

How to use it:
- Use the filter pills to narrow common history types such as Contract, Last Contact, Next Steps, and Health Scores.
- Use Search history when looking for a specific note, outcome, source, or phrase.
- Review the timestamp to understand when RetainOS received or saved the event.
- Review the event source when an update came from a webhook, integration, or automated workflow.
- Use the History tab during handoffs, account reviews, escalation reviews, churn analysis, and QA checks.

What it is not:
- It is not the Call AI recording library. Call recordings and call analysis live in the Call AI / integration flow; history only preserves the relevant client-profile event or summary context.
- It is not a full technical audit export. RetainOS also writes app audit events for admin/technical accountability, but CSMs should use the client History tab for client-level context.
- It is not intended to replace Tasks, contracts, or Next Steps. Those are still the places to manage the live work; History explains what happened over time.

Recommended operating rhythm:
- Check History before taking over a client from another CSM.
- Check History before an escalation conversation so you understand recent contact, blockers, and outcome changes.
- Check History after automated call-summary or webhook updates to confirm the update landed on the right client.
- Use history during churn/offboarding review to understand the sequence of status, outcome, contact, and advocacy changes.

Related resources:
- Making a quick update in RetainOS.
- Using Next Steps well.
- Tracking client contact cadence.
- Offboarding a client in RetainOS.
- AI-generated call summaries into client profiles.

Re-recording notes:
- Record this from Client Detail > History, not the old three-dot menu.
- Show the filter pills and Search history input.
- Show at least three event examples: a Quick Update / Next Steps event, a lifecycle or offboarding event, and a contract, pathway, advocacy, or integration event.
- Mention that mirror-only companies will not have the full RetainOS history timeline until migrated into app-owned write mode.
- Keep the positioning simple: History is the client timeline for accountability, handoffs, and context.$_$,
  'https://www.loom.com/share/0b1198ad7cca46eda66936a8dbecf775',
  'draft',
  false,
  null,
  480,
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
