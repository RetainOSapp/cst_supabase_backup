-- Merge the old "Client Advocacy Triggers" walkthrough into the canonical
-- RetainOS Advocacy & Growth resource after adding Clients roster filters.

update public.resources
set
  title = 'Tracking reviews, testimonials, referrals, and renewal opportunities',
  type = 'video',
  description = 'RetainOS guide for finding advocacy opportunities, recording asks and received wins, and reviewing ask-to-received performance on the Dashboard.',
  content = $_$Resource category: Working with Clients

Audience: CSM, Admin, Director, Support

Operational purpose: Track client advocacy and growth opportunities as operating events so CSMs can build the habit of asking, leadership can see how many asks are needed to generate received wins, and teams can quickly find the clients who should be asked next.

RetainOS status: Live for app-owned pilot/migrated clients. Mirror-only companies keep their CST advocacy fields as read-only until migrated into app-owned RetainOS data.

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

Finding advocacy opportunities from Clients:
- Go to Clients.
- Select an app-owned pilot/migrated company.
- Use the Review, Testimonial, Referral, and Renewal filters to find clients by advocacy status.
- Each advocacy filter supports Any, Not asked, Asked, and Received.
- Filters can be used individually or combined. For example, filter Testimonial = Not asked and Referral = Not asked to find clients who have not been asked for either.
- Combine advocacy filters with Success, Progress, Buy-In, CSM, offer/pathway, milestone, last contact, or next contact filters to find the best clients to ask next.
- A common RGA workflow is Success = Yes, Progress = Green, Buy-In = Green, then Review/Testimonial/Referral = Not asked.
- After finding the right segment, open Quick Update and log the ask or received win from Advocacy & Growth.

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
- Use advocacy status filters to separate Not asked, Asked, and Received clients.
- Log every ask, even when the client does not immediately provide the asset or referral.
- When a referral is received, include the referral name or context in the note.
- Review the Dashboard ask-to-received ratio monthly by company and CSM to coach the advocacy habit.

Related resources:
- Filtering clients in RetainOS.
- Making a quick update in RetainOS.
- How to manage clients in RetainOS.
- Understanding and updating a client profile.

Re-recording notes:
- Start from Clients and show the Review, Testimonial, Referral, and Renewal filters.
- Show a combined example such as Progress = Green, Buy-In = Green, Testimonial = Not asked.
- Open Quick Update for one filtered client and show Add ask multiple times so the counter increases.
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

delete from public.resources
where slug = 'client-advocacy-triggers-reviews-testimonials-and-referrals';
