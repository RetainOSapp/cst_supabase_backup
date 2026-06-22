-- Refresh the RetainOS Help draft for adding clients manually after the
-- richer New Client setup fields were added to the app-owned create flow.

update public.resources
set
  title = 'Adding clients manually to RetainOS',
  type = 'video',
  description = 'Walkthrough for manually creating a client, assigning ownership, setting initial pathway/milestone context, and optionally adding contract details.',
  content = $_$Resource category: Setup & Onboarding

Audience: Admin, Director, Support, CSM

Operational purpose: Create a new app-owned client directly inside RetainOS when the client is not coming through an automation or import.

RetainOS flow:
- Go to Clients.
- Click + New Client.
- Enter the client name.
- Add optional profile context: business name, email, profile image URL, status, onboarding date, archetype, North Star, and next steps.
- Choose the Primary CSM. If a CSM creates the client, RetainOS assigns the client to that CSM automatically.
- Directors and SuperAdmins can add Director Notes during creation.
- Select an Offer / Pathway when known.
- Select the Starting Milestone after choosing the pathway.
- Enable Add initial contract now when you want to create the first contract immediately.
- Add contract start date, contract end / renewal date, monthly value, contract link, and contract notes.
- Click Create Client.

What RetainOS saves:
- The client is created in the app-owned RetainOS clients table for pilot/migrated companies.
- The selected pathway and milestone become the client's current journey context.
- If a starting milestone is selected, RetainOS starts the corresponding client milestone record.
- If contract details are entered, RetainOS creates the initial contract and syncs the current contract summary on the client.
- RetainOS creates a client-created history event and audit event.
- Any enabled client-created task templates for the company can create starter tasks automatically.

After creation:
- Open the client profile to add client links such as Slack channels, Google Drive folders, audits, or other supporting documents.
- Use Edit Profile for profile corrections and assignment changes.
- Use Program > Update Next Steps or Quick Update for day-to-day notes, last contact, next contact, outcomes, and recurring custom fields.
- Use the Contracts tab for later contract edits, renewals, and additional contract history.

RetainOS guardrails:
- Mirror-only companies remain read-only and cannot create app-owned clients.
- SuperAdmin, Director, Support, and CSM can create clients for app-owned companies.
- CSM-created clients are assigned to the creating CSM server-side.
- Assigned CSM must be an active visible client manager when selected by an Admin/Director/Support user.

Re-recording notes:
- Re-record in RetainOS from the Clients page using + New Client.
- Show the required minimum, then show the optional setup sections.
- Mention that links and custom fields are handled after creation from the client profile / Quick Update rather than all inside the create modal.$_$,
  loom_embed_url = 'https://www.loom.com/share/c752acdefa1247609b57eee6c71163d2',
  status = 'draft',
  is_dynamic = false,
  dynamic_key = null,
  scope = 'retainos_help',
  company_legacy_id = null,
  updated_at = now()
where slug = 'add-clients-manually';
