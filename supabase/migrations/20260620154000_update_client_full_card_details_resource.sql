-- Refresh the RetainOS Help draft for Client Full Card Details and connect it
-- to the Filtering Clients overview as a paired workflow.

update public.resources
set
  title = 'Understanding and updating a client profile',
  type = 'video',
  description = 'A RetainOS walkthrough of the Client Detail page: profile identity, program notes, outcomes, pathway progress, contracts, links, tasks, and history.',
  content = $_$Resource category: Working with Clients

Audience: CSM, Admin, Director, Support

Operational purpose: After using the Clients page to find the right client or client segment, open the client profile to understand the current state, update the operating fields, and leave a clean history trail for the team.

Paired workflow:
- Start with Filtering clients in RetainOS when you need to find a segment by CSM, status, pathway, milestone, renewal timing, contact cadence, or health.
- Use this resource once you have opened a specific client profile and need to understand what each section means.

RetainOS flow:
- Go to Clients.
- Search, filter, or use List / Card / Calendar view to find the client.
- Open the client profile.
- Review the header for client image, client name, assigned CSM, and current program status.
- Use Change Status when the client should move to Paused, Suspended, Offboarded, or another program state.
- Use Edit Profile for core profile updates such as name, business name, email, profile image, archetype, North Star, Director Notes, and primary CSM assignment when permitted.

Client profile sections:
- Details: business/profile context, archetype, program status, onboarded date, client age, and client-level links.
- Client Links: operational URLs such as Drive folders, audits, Slack/workspace links, and supporting documents. App-owned clients can add/archive RetainOS links when permitted.
- Program: North Star, Next Steps, Director Notes for permitted roles, General Information, and contact cadence fields.
- Update Next Steps/Contact: a focused Program action for changing next steps, date of last contact, and date of next contact without opening the full profile editor.
- Outcomes: Success, Progress, Buy-In, advocacy/custom outcome fields, and related dates. Outcome changes are saved as RetainOS history events.
- Contract: current contract summary plus app-owned contract history. Admins/Directors can create, edit, archive, or delete app-owned contract rows when permitted.
- Pathways & Milestones: current pathway, current milestone, milestone progress, contract/program timing, and milestone timeline. Authorized users can start/complete milestones or change the active pathway/milestone.
- Tasks: client-linked tasks and assignment context.
- History: recent client profile, program, outcome, contract, task, and milestone events with filters for common history types.

What RetainOS does differently from the old CST card:
- RetainOS uses pathway/milestone language instead of only offer/milestone language.
- Contact, outcome, pathway, contract, task, and status updates are designed to create history/audit context where available.
- Offboarding uses the actual end date, compares it to the contract end date, classifies churn/completion, and captures churn reason/notes only when needed.
- Links are handled in the Client Links section instead of being buried inside one large edit form.
- Contract work is handled in the Contract tab so renewal, upsell, archive, and deletion actions stay separate from basic profile edits.

Role and data notes:
- CSMs generally work with their assigned clients.
- Directors, Admins, Support, and SuperAdmins may see broader company context depending on role permissions.
- Director Notes are only visible/editable to roles with Director Notes access.
- Mirror-only companies remain read-only. App-owned pilot/migrated companies support the RetainOS write flows.

Re-recording notes:
- Re-record after opening a client from the filtered Clients page.
- Keep the walkthrough focused on orientation: what each tab is for and which action belongs where.
- Show one profile edit, one Program next-steps/contact update, one Outcome update, and one Pathway or Contract example.
- Mention that detailed filtering is covered in the paired Filtering clients in RetainOS resource.$_$,
  loom_embed_url = 'https://www.loom.com/share/8b720a9352934ab59c2ffa4e2b25b7fd',
  status = 'draft',
  is_dynamic = false,
  dynamic_key = null,
  scope = 'retainos_help',
  company_legacy_id = null,
  updated_at = now()
where slug = 'client-full-card-details';

update public.resources
set
  content = content || E'\n\nRelated resource: Understanding and updating a client profile is the paired follow-up after filters help you find the right client or segment.',
  updated_at = now()
where slug = 'filtering-clients-overview'
  and content not like '%Related resource: Understanding and updating a client profile%';
