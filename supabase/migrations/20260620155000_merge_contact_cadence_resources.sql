-- Merge the old Last Contact sorting and Next Contact resources into one
-- RetainOS contact-cadence guide, while leaving the narrower drafts as pointers.

update public.resources
set
  title = 'Tracking client contact cadence',
  type = 'video',
  description = 'Merged RetainOS guide for updating, filtering, and sorting by Date of Last Contact and Date of Next Contact.',
  content = $_$Resource category: Working with Clients

Audience: CSM, Admin, Director, Support

Operational purpose: Keep client follow-up proactive by tracking when the team last had meaningful contact with a client and when the next follow-up should happen.

Merged resources:
- Date of Last Contact - Sorting Clients
- Date of Next Contact
- Using Date of Last Contact and Date of Next Contact Features

RetainOS concept:
- Date of Last Contact answers: when did we last meaningfully interact with this client?
- Date of Next Contact answers: when should we next reach out?
- Together, they create the contact cadence for the roster.

Where contact dates appear:
- Clients List view shows Last Contact and Next Contact columns.
- Clients Card view shows contact metadata on each card.
- Clients Calendar view uses the same applied filters and is useful for upcoming follow-up timing.
- Client Detail > Program shows contact cadence fields.
- Client Detail > Program > Update Next Steps/Contact lets authorized users update Next Steps, Date of Last Contact, and Date of Next Contact together.
- Quick Update can also support day-to-day contact/date updates where enabled.

How to update contact cadence:
- Open the client profile.
- Go to Program.
- Click Update Next Steps/Contact.
- Update Next Steps when there is new operating context.
- Set Date of Last Contact after a meaningful client interaction.
- Set Date of Next Contact to the next planned follow-up date.
- Save the update so RetainOS refreshes the client record and history.

How to filter:
- Use Last Contact to find clients who have never been contacted or who have not been contacted in more than 7, 14, 30, 60, 90, 180, or 365 days.
- Use Next Contact to find overdue follow-ups, clients with no next contact set, or clients due in the next 7, 14, 30, 60, or 90 days.
- Combine contact filters with CSM, status, pathway, milestone, renewals, Progress, and Buy-In for sharper operating views.

How to sort:
- In Clients List or Card view, use the Sort control.
- Choose Last contact to work the roster by oldest or newest last-touch date.
- Choose Next contact to work the roster by earliest or latest planned follow-up.
- Use the direction button to switch between oldest/newest ordering.

Recommended operating views:
- Follow-up recovery: Last Contact older than 14 or 30 days.
- Planning queue: Next Contact due in the next 7 days.
- Overdue work: Next Contact overdue.
- Hygiene check: Next Contact has no date set.
- Coaching review: filter by CSM plus stale Last Contact or overdue Next Contact.
- Risk review: combine stale contact cadence with red/yellow Progress or Buy-In.

RetainOS notes:
- The old CST treated Last Contact sorting and Next Contact as separate feature-update Looms. RetainOS should teach them together as one contact-cadence workflow.
- Contact date quality depends on CSMs keeping Program / Quick Update current.
- Filtering narrows the roster; sorting decides the order to work through that roster.

Re-recording notes:
- Record one clean Loom rather than separate Last Contact and Next Contact videos.
- Start from Clients, show contact filters, show contact sorting, then open a client and update Next Steps/Contact.
- Mention that this resource pairs with Filtering clients in RetainOS for broader roster segmentation.$_$,
  loom_embed_url = 'https://www.loom.com/share/bd47340883714bcfbe5282386f55d279',
  status = 'draft',
  is_dynamic = false,
  dynamic_key = null,
  scope = 'retainos_help',
  company_legacy_id = null,
  updated_at = now()
where slug = 'using-date-of-last-contact-and-date-of-next-contact-features';

update public.resources
set
  title = 'Merged: Date of Last Contact sorting',
  type = 'video',
  description = 'Merged into Tracking client contact cadence.',
  content = $_$Resource category: Working with Clients

This old CST resource has been merged into the RetainOS guide: Tracking client contact cadence.

Use the merged resource for Date of Last Contact filtering, Date of Last Contact sorting, Date of Next Contact filtering, Date of Next Contact sorting, and client-profile contact cadence updates.$_$,
  status = 'draft',
  is_dynamic = false,
  dynamic_key = null,
  scope = 'retainos_help',
  company_legacy_id = null,
  updated_at = now()
where slug = 'date-of-last-contact-sorting-clients';

update public.resources
set
  title = 'Merged: Date of Next Contact',
  type = 'video',
  description = 'Merged into Tracking client contact cadence.',
  content = $_$Resource category: Working with Clients

This old CST resource has been merged into the RetainOS guide: Tracking client contact cadence.

Use the merged resource for Date of Last Contact filtering, Date of Last Contact sorting, Date of Next Contact filtering, Date of Next Contact sorting, and client-profile contact cadence updates.$_$,
  status = 'draft',
  is_dynamic = false,
  dynamic_key = null,
  scope = 'retainos_help',
  company_legacy_id = null,
  updated_at = now()
where slug = 'date-of-next-contact';
