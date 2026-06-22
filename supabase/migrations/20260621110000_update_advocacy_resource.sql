-- Refresh the Reviews, Testimonials, and Referrals resource for the RetainOS
-- advocacy tracking workflow.

update public.resources
set
  title = 'Tracking reviews, testimonials, referrals, and renewal opportunities',
  type = 'video',
  description = 'RetainOS guide for recording advocacy asks and received wins from Quick Update or Outcomes, then reviewing ask-to-received performance on the Dashboard.',
  content = $_$Resource category: Working with Clients

Audience: CSM, Admin, Director, Support

Operational purpose: Track client advocacy and growth opportunities as operating events so CSMs can build the habit of asking, and leadership can see how many asks are needed to generate received reviews, testimonials, referrals, renewals, or upsells.

RetainOS status: Live for app-owned pilot/migrated clients. Mirror-only companies keep their CST advocacy fields as read-only until migrated.

What RetainOS tracks:
- Reviews.
- Testimonials.
- Referrals.
- Renewal / Upsell opportunities.

For each item, RetainOS tracks:
- Asked count.
- Received count.
- Current status: Not asked, Asked, or Received.
- Last asked date.
- Last received date.
- Latest note.

How counts work:
- Clicking Add ask creates a new asked event. If you ask multiple times, the client can show Asked x2, Asked x3, and so on.
- Clicking Add received creates a new received event. A client can have more than one received referral, review, testimonial, renewal, or upsell opportunity.
- Notes are optional. For referrals, use the note to capture the referred person's name, company, context, or next step. For reviews/testimonials, notes can include a link.

Where CSMs update advocacy:
- Go to Clients.
- Open Quick Update for the client.
- Use Advocacy & Growth to add asks or received events.
- Add a note if useful.
- Save Quick Update.

Where Admins or CSMs can also update advocacy:
- Open the client profile.
- Go to Outcomes.
- Use Advocacy & Growth in the Outcomes tab.
- Save Outcomes.

Dashboard reporting:
- Dashboard > Overview includes an Advocacy & Growth section for app-owned companies.
- The cards show received count, asked count, and ask-to-received ratio for Reviews, Testimonials, Referrals, and Renewal / Upsell.
- Dashboard filters apply to advocacy reporting, including company, CSM, program/status, offer/pathway, client start date, and reporting date range.
- Date filters use the event date, so a June report can show asks and received wins created during June.
- CSM filtering attributes the event to the client's assigned primary CSM at the time the ask or received event was logged.

Migration behavior:
- RetainOS migrates legacy Glide CST advocacy fields into app-owned advocacy summaries and historical events.
- Legacy Review/Testimonial/Referral/Renewal ask dates become asked events.
- Legacy yes/set values become received events.
- Future company migrations use the same mapping so Moves Method and later companies keep this data.

Recommended operating rhythm:
- Use Success + green Progress + green Buy-In filters to find likely advocacy candidates.
- Log every ask, even when the client does not immediately provide the asset or referral.
- When a referral is received, include the referral name or context in the note.
- Review the Dashboard ask-to-received ratio monthly by company and CSM to coach the advocacy habit.

Re-recording notes:
- Start from a client Quick Update and show Add ask multiple times so the counter increases.
- Show Add received and add a referral-name note.
- Open the client profile > Outcomes and show the same Advocacy & Growth panel there.
- Open Dashboard > Overview and show the Advocacy & Growth cards.
- Apply a CSM filter and a date range to show how leadership can review performance.$_$,
  loom_embed_url = 'https://www.loom.com/share/f277bd74adf7488e8c35c5e6f4e01325',
  status = 'draft',
  is_dynamic = false,
  dynamic_key = null,
  scope = 'retainos_help',
  company_legacy_id = null,
  updated_at = now()
where slug = 'reviews-testimonials-and-referrals';
