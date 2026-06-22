-- Refresh the RetainOS Help draft for Filtering Clients (Overview) after
-- adding strategic client filters to the Clients roster and calendar views.

update public.resources
set
  title = 'Filtering clients in RetainOS',
  type = 'video',
  description = 'Overview of the Clients page filters for finding clients by ownership, status, pathway, milestone, renewal timing, contact cadence, and health signals.',
  content = $_$Resource category: Working with Clients

Audience: CSM, Admin, Director, Support

Operational purpose: Use the Clients page as the day-to-day roster command center, narrowing the client list to the exact group that needs review, coaching, renewal attention, or follow-up.

RetainOS flow:
- Go to Clients.
- SuperAdmins, Directors, and Support users select the company when needed.
- CSMs see their assigned roster by default.
- Use Client Name to search by client name.
- Use Status to filter by one or more program states such as Front End, Back End, Paused, Suspended, or Offboarded.
- Use CSM when you have permission to review the company-wide roster.
- Use Offer to filter by pathway.
- Use Milestone to filter clients currently sitting at a specific pathway milestone.
- Use Renewals to find clients overdue or due in the next 7, 14, 30, 60, or 90 days.
- Use Last Contact to find clients who have never been contacted or have not been contacted recently.
- Use Next Contact to find overdue follow-ups, clients with no next contact set, or follow-ups due soon.
- Use Success, Progress, and Buy-In to filter by current outcome and health signals.
- Use Secondary Assignee when the company has secondary assignment enabled.
- Click Apply filters to update the roster.
- Use Clear All Filters to reset the page back to the selected company/default assignment view.

Where filters apply:
- List view, Card view, and Calendar view share the same applied client filters.
- Sorting stays available in List and Card views for client name, onboarded date, and renewal date.
- Calendar view keeps the same roster filters while showing contact/task timing.
- Unsaved filter changes show an Apply filters prompt so users know when the visible roster has not updated yet.

Strategic examples:
- Renewal planning: Renewals due in the next 30 or 60 days plus Progress or Buy-In yellow/red.
- Save-the-client review: Progress red plus Buy-In red.
- High-touch follow-up: Last Contact older than 14 or 30 days, or Next Contact overdue.
- Referral/review candidates: Success yes plus Progress green and Buy-In green.
- Coaching focus: Filter by CSM plus yellow/red Progress or Buy-In to review a teammate's at-risk clients.
- Milestone bottleneck: Filter by Offer and Milestone to see where clients are getting stuck.

RetainOS notes:
- RetainOS intentionally uses pathway/milestone language instead of Glide offer-only language.
- Revenue forecast math from the old CST filtering walkthrough is not part of this Clients overview. Renewal and revenue projections should be validated in Dashboard / CSM reporting resources.
- Some filters depend on the client profile being kept up to date. Quick Update and Client Detail are the source of truth for contact dates, outcomes, pathway progress, and renewal dates.

Re-recording notes:
- Re-record from the RetainOS Clients page.
- Show Apply filters and Clear All Filters.
- Demonstrate one operational combination for risk, one for renewal planning, and one for referral/review candidates.
- Mention that RetainOS list, card, and calendar views use the same applied filters.$_$,
  loom_embed_url = 'https://www.loom.com/share/bf57b657bb024c93987ff5b7eeed22f6',
  status = 'draft',
  is_dynamic = false,
  dynamic_key = null,
  scope = 'retainos_help',
  company_legacy_id = null,
  updated_at = now()
where slug = 'filtering-clients-overview';
