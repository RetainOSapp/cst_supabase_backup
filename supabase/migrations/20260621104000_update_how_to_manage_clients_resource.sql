-- Refresh the CSM orientation resource after auditing the full legacy
-- "How to Manage Clients" walkthrough against the current RetainOS workflow.

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
  'how-to-manage-clients',
  'How to manage clients in RetainOS',
  'video',
  'Orientation guide for CSMs using Clients, Quick Update, Client Detail, health signals, contact cadence, and filters in their day-to-day workflow.',
  $_$Resource category: Working with Clients

Audience: CSM, Admin, Director, Support

Operational purpose: Give a new CSM a practical first tour of how to run their client book in RetainOS without needing to understand every admin or reporting surface on day one.

RetainOS status: This is an orientation resource. It should stay high-level and link conceptually to the more specific resources for Quick Update, Filtering clients, Client Detail, contact cadence, pathways/milestones, outcomes, tasks, and offboarding.

Daily operating rhythm:
- Start from Clients.
- Use List or Card view depending on how much context you need at once.
- Search for a specific client by name when you already know who you need.
- Use filters when you need to work a segment of your book, such as stale contacts, upcoming follow-ups, red/yellow health, one pathway, one milestone, or renewals.
- Open Quick Update for the fastest day-to-day client interaction logging.
- Open the full Client Detail profile when you need deeper profile, pathway, contract, link, task, history, or lifecycle context.

What CSMs usually do in Quick Update:
- Review the current North Star.
- Review current Next Steps.
- Update Next Steps after a call, Slack thread, async check-in, or other client interaction.
- Add Notes when extra interaction context should be saved.
- Update Date of Last Contact.
- Set Date of Next Contact.
- Refresh Success, Progress, and Buy-In when those signals changed or need a new timestamp.
- Update active company custom fields.
- Complete the current pathway milestone and optionally start the next or another milestone.

How to think about the main fields:
- North Star is the client's larger outcome, goal, or expectation. Edit it from the full client profile when the client's target changes.
- Next Steps is the operational handoff for the next client interaction. Use it to capture what happened, what the client should do next, and what the CSM should follow up on.
- Date of Last Contact proves the latest touchpoint.
- Date of Next Contact tells RetainOS when the next follow-up should happen.
- Progress is the more delivery-based health signal: is the client moving through the pathway at the expected pace?
- Buy-In is the more relationship-based health signal: is the client responsive, engaged, coachable, and showing up well?
- Success records whether the client has achieved the intended outcome for the offer or company definition.

When to use the full Client Detail profile:
- Edit core profile details such as name, email, alternate emails, profile image, archetype, North Star, Director Notes, or assigned CSM.
- Manage Client Links such as Drive folders, Slack channels, CRM records, or other external resources.
- Review or update Pathways & Milestones beyond the quick current-milestone completion flow.
- Review contracts, renewal context, and lifecycle status.
- Review tasks connected to the client.
- Read the History tab when you need accountability or previous context.
- Offboard, pause, suspend, or reactivate a client through the lifecycle controls when appropriate.

Useful filter habits:
- Use Last Contact to find clients who have not been touched recently.
- Use Next Contact to prepare upcoming follow-ups or find overdue outreach.
- Use Progress and Buy-In together to identify risk, stuck clients, or coaching priorities.
- Use Success plus green Progress/Buy-In to find clients who may be good candidates for advocacy, upsells, or case-study outreach.
- Use Offer and Milestone to find bottlenecks in a specific pathway.
- Admin, Director, and Support users can filter by CSM or Unassigned when reviewing a larger company book. CSM users normally work from their assigned roster.

Important RetainOS boundaries:
- Quick Update is for fast interaction logging and current-state updates. It is not the place to change a client's pathway/offer assignment, contract, lifecycle status, or deeper profile details.
- Mirror-only companies are read-only CST previews until migrated to app-owned RetainOS data.
- Dedicated Testimonial, Review, and Referral asked/received controls from the old CST walkthrough are not live yet as write controls. For now, use health filters to identify candidates and track follow-up through Next Steps or Tasks until the client advocacy outcome fields ship.
- Call attendance tracking is also future scope unless the company has modeled it through a custom field or secondary pathway.

Re-recording notes:
- Record this as a first-day CSM orientation, not as a deep product walkthrough.
- Start on Clients and show List/Card view switching.
- Open Quick Update and demonstrate one realistic client interaction update: Next Steps, Notes, Last Contact, Next Contact, Progress, Buy-In, and one custom field.
- Show completing a current milestone only briefly; point viewers to the pathway/milestone resource for the full workflow.
- Open Client Detail and briefly point out Profile, Program, Outcomes, Pathways & Milestones, Contracts, Links, Tasks, and History.
- End with two or three practical filters: stale contact, upcoming next contact, red/yellow health, and green advocacy candidates.
- Mention the advocacy write-control gap only if this Loom is recorded before testimonial/review/referral tracking ships.$_$,
  'https://www.loom.com/share/e0f509ba440f4e5d9a6ede28d9d6aa19',
  'draft',
  false,
  null,
  380,
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
