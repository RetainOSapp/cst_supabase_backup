-- Refresh the RetainOS Help draft for AI-generated call summaries after
-- auditing the old CST/Fathom/Zapier walkthrough against the live webhook.

update public.resources
set
  title = 'AI-generated call summaries into client profiles',
  type = 'video',
  description = 'RetainOS guide for sending Fathom or other provider summaries into client Next Steps, Last Contact, and History through the call summary webhook.',
  content = $_$Resource category: Working with Clients

Audience: Admin, CSM

Operational purpose: Automatically save useful call summaries, key takeaways, or next steps into the correct RetainOS client profile so CSMs do not have to manually copy notes after every call.

RetainOS status: Live for app-owned pilot/migrated companies through the Call Summary / Next Steps webhook.

What RetainOS receives:
- company_id: the selected RetainOS company ID.
- client_email: the client email to match.
- attendee_emails: optional full invitee list from Fathom, Zoom, Grain, Otter, Zapier, Make, or another provider.
- summary: the summary, key takeaways, notes, or next steps to save.
- started_at: optional call timestamp used as Date of Last Contact.
- external_call_id: optional provider call ID used for idempotency so retries do not duplicate updates.
- recording_url: optional call recording or transcript URL for history context.
- title: optional meeting title.

How matching works:
- RetainOS matches the submitted email or attendee email list against active app-owned clients in the selected company.
- RetainOS only auto-updates when exactly one active client matches.
- If no active client matches, or more than one active client matches, the event goes to the Integration Review Queue instead of updating the wrong profile.
- Company-specific integration tokens protect the endpoint and must match the submitted company_id.

What RetainOS updates:
- Client Next Steps receives the submitted summary.
- Date of Last Contact is refreshed from started_at when provided.
- A call_summary_webhook history event is created with the summary, provider, recording URL, previous Next Steps, and previous Last Contact.
- The integration intake event is marked processed for audit/idempotency.

Recommended automation setup:
- Trigger from Fathom New AI Summary or the equivalent event in another recording/automation tool.
- Send a POST request to the RetainOS Call Summary / Next Steps endpoint.
- Use JSON payload type.
- Add Authorization: Bearer YOUR_COMPANY_INTEGRATION_TOKEN.
- Map company_id from the RetainOS resource guide for the selected company.
- Map client_email when your automation can identify the exact client email.
- Map attendee_emails when the provider returns the full invitee list.
- Map summary from the provider's AI summary, or from a pre-cleaned automation step.
- Map started_at from the call start time.
- Map external_call_id from the provider call/meeting ID when available.

Optional summary cleanup:
- If the provider summary is too long or too noisy, add a cleanup step before sending to RetainOS.
- The cleanup step can extract only key takeaways, action items, and next steps.
- The cleaned output should be mapped into summary.
- RetainOS does not need to know whether summary came directly from Fathom or from a cleanup step.

How to verify:
- Open the matched client profile.
- Go to Program and confirm Next Steps updated.
- Confirm Date of Last Contact reflects the call timestamp when provided.
- Go to History and look for the call summary webhook event.
- If nothing updated, check the Integration Review Queue for unmatched or ambiguous events.

RetainOS notes:
- This is separate from full Call AI transcript processing. The call summary webhook receives an already-generated summary and saves it to the client profile.
- Full transcript ingestion/scoring remains its own Call AI resource and workflow.
- The old CST walkthrough showed Fathom plus Zapier plus an optional ChatGPT cleanup step. RetainOS keeps that same shape but uses company-scoped tokens, review queue protection, and app-owned client history.$_$,
  loom_embed_url = 'https://www.loom.com/share/746e45dd58e645da9509424fb2005419',
  status = 'draft',
  is_dynamic = false,
  dynamic_key = null,
  scope = 'retainos_help',
  company_legacy_id = null,
  updated_at = now()
where slug = 'ai-generated-call-summaries-pulled-into-client-profiles';
