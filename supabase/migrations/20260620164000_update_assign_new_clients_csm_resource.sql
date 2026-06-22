-- Refresh the RetainOS Help draft for assigning new clients to a CSM after
-- auditing the old CST notification/profile flow against current RetainOS.

update public.resources
set
  title = 'Assigning new clients to a CSM in RetainOS',
  type = 'video',
  description = 'RetainOS guide for assigning or reassigning a client owner during manual creation, from the Clients roster, or after an automation-created client arrives unassigned.',
  content = $_$Resource category: Setup & Onboarding

Audience: Admin, Director, Support

Operational purpose: Make sure every active client has the right primary CSM so ownership, roster visibility, task claiming, dashboard counts, and CSM reporting stay accurate.

RetainOS status: Client assignment and reassignment are live for app-owned pilot/migrated companies. The old CST-style profile notification/popup is not the current RetainOS workflow.

Best path: assign during client creation
- Go to Clients.
- Click New Client.
- Complete the required client fields.
- Choose Primary CSM before saving.
- Save the client.
- If a CSM creates the client, RetainOS assigns the client to that CSM server-side.

Finding clients that still need a CSM
- Go to Clients.
- Open the filters.
- Use the CSM filter.
- Choose Unassigned.
- Apply filters.
- Review the clients that do not yet have a primary CSM.

Assigning an existing or automation-created client
- Open the client profile.
- Click Edit Profile.
- Find Primary CSM.
- Choose the active client manager who should own the client.
- Save the profile.
- Return to Clients or CSM Reports to confirm the assigned CSM now appears correctly.

What changes when the Primary CSM is assigned
- The client profile stores the new primary CSM.
- A profile update/history event is created.
- CSM users can only see and work with clients assigned to them, including secondary assignments where enabled.
- Open unassigned tasks linked to that client can be claimed by the newly assigned primary CSM.
- Dashboard workload, CSM Reports, Tasks, and roster filters can use the assignment.

Who can assign clients
- SuperAdmin, Director, and Support can assign or reassign Primary CSM from the client profile when permitted.
- CSM users can create clients, but RetainOS assigns those clients to the creating CSM.
- CSM users cannot assign clients to someone else.
- Viewer users are read-only.

Eligible assignees
- The Primary CSM dropdown shows active team members who are allowed to manage clients.
- Archived team members and members hidden from the CSM list are not valid primary CSM assignments.
- If secondary assignee is enabled for the company, use it for supporting coverage; Primary CSM remains the main client owner.

Automation-created clients
- New Client Webhook and Zapier-created clients can include assignment data when the automation knows the right CSM.
- If the automation does not know the right CSM, let the client arrive unassigned.
- Admins/Directors can then use Clients > CSM filter > Unassigned to review and assign those clients manually.

How RetainOS differs from the old CST walkthrough
- The old CST flow used profile notifications to tell a Director that new clients needed assignment and showed a popup for the assigned CSM.
- RetainOS uses the Clients roster, CSM filter, client profile assignment, history/audit, CSM-scoped access, and task ownership as the current source of truth.
- Real-time assignment notifications can be treated as later notification scope; do not record the resource as if a CST-style popup exists today.

Re-recording notes:
- Record from Clients.
- Show creating a client with Primary CSM selected.
- Show filtering CSM = Unassigned.
- Open one unassigned client, click Edit Profile, choose Primary CSM, and save.
- Show the client returning with the CSM name visible in the roster/profile.
- Mention that assignment affects what CSMs can see and which client-linked tasks they own.
- Do not show the old profile popup/notification behavior.$_$,
  loom_embed_url = 'https://www.loom.com/share/fa157d2b76e2448fbaa5c65bfa87e59e',
  status = 'draft',
  is_dynamic = false,
  dynamic_key = null,
  scope = 'retainos_help',
  company_legacy_id = null,
  updated_at = now()
where slug = 'assign-new-clients-csm';
