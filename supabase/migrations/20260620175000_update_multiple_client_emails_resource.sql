-- Refresh the RetainOS Help draft for multiple client email addresses after
-- adding Email 2 / Email 3 support and integration matching.

update public.resources
set
  title = 'Managing multiple email addresses per client',
  type = 'video',
  description = 'RetainOS guide for storing alternate client email addresses so call summaries, Call AI, and client-update automations can match the right profile.',
  content = $_$Resource category: Working with Clients

Audience: Admin, CSM, Director, Support

Operational purpose: Improve automation matching when a client uses different personal, business, or meeting email addresses across calls, forms, purchases, and integrations.

RetainOS status: Live for app-owned pilot/migrated clients. Each client can store one primary email plus two optional alternate emails.

Where to manage emails:
- Open the client profile.
- Click Edit Profile.
- Use Email for the primary client email.
- Use Email 2 and Email 3 for optional alternate addresses.
- Save the profile.

How integrations use the emails:
- Call Summary / Next Steps webhook can match against Email, Email 2, or Email 3.
- Client Update webhook can match against Email, Email 2, or Email 3.
- New Client Webhook can receive client_email_secondary and client_email_tertiary during client creation.
- Review Queue retry/match logic also checks all three email fields.
- RetainOS only auto-applies integration updates when exactly one active app-owned client matches. If multiple clients match, the event goes to review instead of updating the wrong profile.

Recommended usage:
- Keep the client's most reliable email in Email.
- Add business/work/personal meeting emails in Email 2 and Email 3.
- Use this especially for clients who appear in Fathom, Zoom, Grain, Otter, Make, Zapier, or Call AI with different addresses.
- Avoid reusing the same email across multiple active clients unless you expect integration events to require review.

What this prevents:
- Fathom or call-summary notes failing to attach because the invitee email differs from the profile email.
- Call AI or client-update automations going to review because the submitted email is valid but not the primary client email.
- CSMs manually copying summaries into profiles when an alternate email could have matched automatically.

Re-recording notes:
- Show Client Detail > Edit Profile.
- Add Email 2 and Email 3.
- Explain that these addresses are used for integration matching, not separate users.
- Mention that New Client Webhook can also set the alternate emails.
- Mention RetainOS safety behavior: ambiguous matches go to review rather than auto-updating the wrong client.$_$,
  loom_embed_url = 'https://www.loom.com/share/9d2c87501ebf4bcb89b5a9594aea8c53',
  status = 'draft',
  is_dynamic = false,
  dynamic_key = null,
  scope = 'retainos_help',
  company_legacy_id = null,
  updated_at = now()
where slug = 'managing-multiple-email-addresses-per-client';
