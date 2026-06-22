-- Merge the old CST "Filtering Clients (Deep Dive)" draft into the canonical
-- RetainOS filtering guide, then remove the duplicate deep-dive resource.

update public.resources
set
  title = 'Filtering clients in RetainOS',
  type = 'video',
  description = 'RetainOS guide for using Clients page filters strategically across ownership, status, pathway, milestone, renewal timing, contact cadence, health signals, and follow-up workflows.',
  content = $_$Resource category: Working with Clients

Audience: CSM, Admin, Director, Support

Operational purpose: Use the Clients page as the day-to-day roster command center, narrowing the client list to the exact group that needs review, coaching, renewal attention, advocacy follow-up, or proactive support.

RetainOS flow:
- Go to Clients.
- SuperAdmins, Directors, and Support users select the company when needed.
- CSMs see their assigned roster by default.
- Use Client Name to search by client name.
- Use Status to filter by one or more program states such as Front End, Back End, Paused, Suspended, or Offboarded.
- Use CSM when you have permission to review the company-wide roster.
- Use CSM = Unassigned to find clients that still need a primary CSM.
- Use Offer to filter by pathway.
- Use Milestone to filter clients currently sitting at a specific pathway milestone.
- Use Renewals to find clients overdue or due in the next 7, 14, 30, 60, or 90 days.
- Use Last Contact to find clients who have never been contacted or have not been contacted recently.
- Use Next Contact to find overdue follow-ups, clients with no next contact set, or follow-ups due soon.
- Use Success, Progress, and Buy-In to filter by current outcome and health signals.
- Use Secondary Assignee when the company has secondary assignment enabled.
- Combine filters when you need a focused operating list.
- Click Apply filters to update the roster.
- Use Clear All Filters to reset the page back to the selected company/default assignment view.

Where filters apply:
- List view, Card view, and Calendar view share the same applied client filters.
- Sorting stays available in List and Card views for client name, onboarded date, renewal date, last contact, and next contact.
- Calendar view keeps the same roster filters while showing contact/task timing.
- Unsaved filter changes show an Apply filters prompt so users know when the visible roster has not updated yet.

Strategic examples:
- CSM book review: filter by CSM to inspect one coach or account manager's active client list.
- Unassigned intake review: filter CSM = Unassigned to find new or automation-created clients that still need an owner.
- Program review: filter Front End, Back End, Paused, Suspended, or Offboarded to inspect a specific operating state.
- Pathway review: filter by Offer and Milestone to see where clients are getting stuck.
- Renewal planning: filter Renewals due in the next 30 or 60 days, then layer Progress or Buy-In yellow/red.
- Save-the-client review: filter Progress red plus Buy-In red to build an escalation or churn-prevention list.
- High-touch follow-up: filter Last Contact older than 14 or 30 days, or Next Contact overdue.
- Call-prep list: filter Next Contact due in the next 7 days so CSMs can prepare resources, SOPs, or follow-up notes.
- Advocacy candidates: filter Success yes plus Progress green and Buy-In green for review, testimonial, referral, or case-study outreach.
- ICP learning: filter Success yes and review common patterns across client type, pathway, milestone, and profile context.
- Coaching focus: filter by CSM plus yellow/red Progress or Buy-In to review a teammate's at-risk clients.

RetainOS notes:
- RetainOS intentionally uses pathway/milestone language instead of Glide offer-only language.
- Revenue forecast math from the old CST filtering deep dive is not part of the Clients roster filter. Renewal and predicted pipeline revenue should live in Dashboard / CSM Reports / Beacon-assisted reporting once validated.
- Some filters depend on the client profile being kept up to date. Quick Update and Client Detail are the source of truth for contact dates, outcomes, pathway progress, and renewal dates.

Re-recording notes:
- Re-record from the RetainOS Clients page.
- Show Apply filters and Clear All Filters.
- Show List, Card, and Calendar views using the same filters.
- Demonstrate one CSM book review, one unassigned-client review, one renewal planning list, one stale-contact list, one red/red risk list, and one green/green advocacy candidate list.
- Mention that renewal forecast / predicted pipeline revenue is future reporting scope, not part of the roster filters today.
- Do not record a separate Filtering Clients deep dive; this is the canonical RetainOS filtering resource.$_$,
  loom_embed_url = 'https://www.loom.com/share/bf57b657bb024c93987ff5b7eeed22f6',
  status = 'draft',
  is_dynamic = false,
  dynamic_key = null,
  scope = 'retainos_help',
  company_legacy_id = null,
  updated_at = now()
where slug = 'filtering-clients-overview';

delete from public.resources
where
  slug = 'filtering-clients-deep-dive'
  and scope = 'retainos_help'
  and company_legacy_id is null;
