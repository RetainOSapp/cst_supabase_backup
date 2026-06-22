-- Refresh the RetainOS Help draft for inviting team members after the
-- RetainOS invite/resend flow was added.

update public.resources
set
  title = 'How to invite a team member',
  type = 'video',
  description = 'Admin guide for adding team members, sending RetainOS login invites, and resending invite emails when needed.',
  content = $_$Resource category: Setup & Onboarding

Audience: Admin, Director

Operational purpose: Enable Admins and Directors to add new team members to RetainOS with the correct role, capacity settings, and login access.

RetainOS flow:
- Go to Admin Hub or SaaS Client Detail for the company.
- Open the Team tab.
- Click + New Team Member.
- Add the team member's name, email, optional profile picture URL, capacity percentage, and role.
- Choose whether this person should be hidden from CSM assignment lists.
- Click Save.
- RetainOS creates the team member and sends a login invite email to the address entered.
- The new team member opens the RetainOS login page, enters their email, and uses the email login code.
- The Team tab success message shows the login URL to share if the teammate asks where to enter the code.

Invite follow-up:
- Existing active team members have a Send invite action on their team card.
- Use Send invite when a teammate lost the original login email, never received it, or needs a fresh login code.
- Send invite sends a fresh login code and shows the RetainOS login URL in the success message.
- If the member is added but invite delivery fails, RetainOS keeps the team member row and shows an error so an Admin can retry Send invite.

Role notes:
- Director can manage company-wide views and team setup.
- CSM manages assigned client work.
- Support has approved operational access.
- Viewer is read-only.

RetainOS review note: This replaces the old Glide CST invitation walkthrough. Re-record the Loom in RetainOS after the updated team invite UI is deployed.$_$,
  loom_embed_url = 'https://www.loom.com/share/3e34b3bb5ce04afebb6a84e8526667a2',
  status = 'draft',
  is_dynamic = false,
  dynamic_key = null,
  scope = 'retainos_help',
  company_legacy_id = null,
  updated_at = now()
where slug = 'invite-team-member';
