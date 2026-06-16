# RetainOS Integration Intake Plan

Purpose: design the provider-agnostic inbound integration layer for RetainOS. This includes Fathom/Otter/Grain call workflows, CRM client creation/update webhooks, LMS course-completion webhooks, and the later Call AI pipeline. This is a proposal/coordination file unless a section explicitly says an endpoint is live.

## Current Context

- RetainOS already has a provider-style inbound webhook pattern in `supabase/functions/zapier-create-client`.
- Client write flows already use app-owned tables for pilot/migrated companies and write `client_history_events` plus `app_audit_events`.
- Quick Update currently updates notes, next steps, last contact, next contact, outcomes, and history for app-owned clients.
- Resources already supports global guides, dynamic company-specific IDs, editable resources, and Loom embeds.
- Call AI is still a later roadmap area. Transcript ingestion is useful as a foundation, but summary-to-next-steps should be treated as a distinct workflow because it is lighter, safer, and available to companies that may not have Call AI.

## Integration Types

RetainOS needs five integration families to reach parity with CST/Glide patterns.

### 1. Call AI Transcript Intake

Purpose: receive full call transcripts from Fathom, Otter, Grain, or another recorder and queue them for future Call AI analysis/QC.

- Endpoint family: `ingest-call-transcript`.
- Payload: full transcript, attendee emails, meeting title, timestamp, recording URL, provider metadata.
- Matching: conservative client match by explicit client email or attendee email; no `client_id` should be required because providers normally do not know RetainOS ids.
- Rollout: later, after migration-critical workflows are stable.
- Tiering: gated by Call AI access/subscription because high-volume companies can generate heavy AI usage.

### 2. Call Summary To Client Next Steps

Purpose: receive a lighter provider-generated call summary and write it into the matched client's next steps/history, while updating Date of Last Contact.

- Endpoint family: `ingest-client-call-summary`.
- Payload: company id, client email, summary/next steps, call timestamp, recording URL/provider metadata.
- Matching: explicit `client_email` first. Attendee matching can be a later fallback, but v1 should ask Zapier/n8n/Make to send the exact client email.
- Behavior:
  - match client inside the supplied company;
  - write previous next steps into history;
  - update current `next_steps_value`;
  - update `csm_date_of_last_contact` to the call timestamp/date;
  - create a `client_history_events` row with source `call_summary_webhook`.
- Rollout: can ship before Call AI because it is operationally useful and lower cost.
- Tiering: available to companies without Call AI, e.g. Moves Method.

### 3. New Client Webhook

Purpose: create a new app-owned RetainOS client from a CRM/sales/marketing automation.

- Endpoint: `zapier-create-client` exists.
- Required: `company_id`, client name/email.
- Existing status: baseline structure exists and should be QAed before each company migration.
- Future: support n8n/Make as alternatives to Zapier using the same RetainOS endpoint contract.

### 4. Update Client Webhook

Purpose: update an existing client from an external system when the client can be matched.

- Endpoint: `webhook-update-client`.
- V1 docs: `CLIENT_UPDATE_WEBHOOK.md`.
- Matching: company id + exact client email in v1, or explicit app-owned `client_id` when it belongs to the submitted company and optional email also matches.
- Updatable fields: `next_steps`, `notes` as history context, `last_contact`, `next_contact`, active `offer_id`, `assigned_to`, and active company `custom_fields`.
- Status/program updates are deliberately rejected in V1 so lifecycle side effects stay inside the RetainOS status flow.
- Auth prefers company-scoped `company_integration_secrets` rows with SHA-256 token hashes, with a temporary global secret fallback only for companies that do not have active client-update secret rows yet.
- Unmatched or ambiguous requests write `integration_intake_events.status = 'needs_review'` and do not mutate clients.
- Successful requests update only app-owned tables (`clients`, `client_custom_field_values`, `client_history_events`, `app_audit_events`, and intake status). They do not mutate `backup_*`.

### 5. Course Completion Webhook

Purpose: receive LMS progress/completion pings, commonly as a percentage, and store/update a client custom field or dedicated course-progress record.

- Recommended endpoint: `webhook-course-completion`.
- Matching: company id + exact client email in v1.
- Payload: course id/name, completion percentage, completed_at, provider metadata.
- V1 destination can be a client custom field if configured; a later dedicated `client_course_progress` table may be cleaner for multiple courses.

## Goals

- Accept call transcript and call-summary events from Fathom, Otter, Grain, or an automation layer such as Zapier, n8n, or Make.
- Store each call/transcript as app-owned data, scoped to one company.
- Match the call to a client when possible.
- For the summary endpoint, write the provider summary into client next steps/history and update Date of Last Contact.
- Queue the transcript for future Call AI analysis without blocking ingestion.
- Provide a Resources setup guide similar to the client-creation webhook guide.

## Non-Goals For V1

- Do not run AI analysis in the ingestion request.
- Do not build full Call AI dashboards yet.
- Do not support direct OAuth integrations with each provider yet.
- Do not auto-create clients from call attendees in V1.
- Do not send notifications until notification preferences are defined.

## Provider-Agnostic Call AI Endpoint

Recommended function name:

```text
supabase/functions/ingest-call-transcript
```

Recommended public URL:

```text
{SUPABASE_URL}/functions/v1/ingest-call-transcript
```

Auth pattern:

- Disable JWT verification for provider webhooks.
- Require `company_id`.
- Require a company-specific integration token in either:
  - `Authorization: Bearer {COMPANY_INTEGRATION_TOKEN}`
  - `x-retainos-integration-token: {COMPANY_INTEGRATION_TOKEN}`
  - `x-webhook-secret: {COMPANY_INTEGRATION_TOKEN}` for tools that cannot set bearer auth.
- Validate the submitted token against the submitted company before processing.
- Accept either app-owned company UUID or legacy Glide company id, matching the existing client webhook pattern.
- Only allow companies with `migration_status in ('pilot', 'migrated')`.
- Optionally require a company setting such as `enable_call_transcript_ingestion = true` before accepting requests.

## Call AI Request Shape

Providers vary a lot, so V1 should accept a normalized payload and preserve raw provider payload in metadata.

```json
{
  "company_id": "{{company_id}}",
  "provider": "fathom",
  "external_call_id": "{{provider_call_id}}",
  "meeting_title": "{{meeting_title}}",
  "started_at": "{{started_at}}",
  "ended_at": "{{ended_at}}",
  "duration_seconds": 3600,
  "summary": "{{provider_summary}}",
  "transcript": "{{full_transcript}}",
  "recording_url": "{{recording_url}}",
  "client_email": "{{optional_client_email}}",
  "client_name": "{{optional_client_name}}",
  "csm_email": "{{optional_csm_email}}",
  "attendees": [
    { "name": "Client Name", "email": "client@example.com" },
    { "name": "CSM Name", "email": "csm@example.com" }
  ],
  "queue_ai_analysis": true,
  "raw_payload": {}
}
```

## Summary-To-Next-Steps Endpoint

Recommended function name:

```text
supabase/functions/ingest-client-call-summary
```

Recommended public URL:

```text
{SUPABASE_URL}/functions/v1/ingest-client-call-summary
```

Recommended payload:

```json
{
  "company_id": "{{company_id}}",
  "provider": "fathom",
  "external_call_id": "{{provider_call_id}}",
  "client_email": "{{client_email}}",
  "summary": "{{fathom_summary_or_next_steps}}",
  "started_at": "{{call_started_at}}",
  "recording_url": "{{recording_url}}",
  "raw_payload": {}
}
```

V1 should require `client_email`. If it cannot match exactly one client inside the company, it should store a failed intake/review event and must not update a client.

## Ethical Scaling First QA Setup

Before Moves Method uses this, validate with Ethical Scaling because it is already a pilot company and the risk is low.

Recommended setup:

1. Create the RetainOS inbound endpoint first, for example `ingest-call-transcript`.
2. Create a company-specific integration token row for the company and integration type.
3. In Zapier, n8n, or Make, create a test automation from Fathom/Otter/Grain:
   - Trigger: new recording/transcript/AI summary is available.
   - Action: Webhooks by Zapier or equivalent `POST`.
   - URL: `{SUPABASE_URL}/functions/v1/ingest-call-transcript`.
   - Header: `Authorization: Bearer {COMPANY_INTEGRATION_TOKEN}`.
   - Header: `Content-Type: application/json`.
   - Body: normalized JSON matching the shape above.
4. Use Ethical Scaling's company id in the payload.
5. Use a known Ethical Scaling client email for the first test.
6. Send one payload to `ingest-client-call-summary` first, because this is the lighter operational flow.
7. Verify in RetainOS:
   - The intake is stored.
   - The call matched the expected client.
   - The client History shows the summary/update.
   - The client current next steps changed to the summary.
   - Date of Last Contact updates only when matching is confident.
   - If matching fails, the call lands in a review/unmatched state instead of writing to the wrong client.

How this links to RetainOS:

- Zapier or another automation layer only delivers the provider payload.
- RetainOS owns company validation, client matching, history writing, last-contact updates, and future Call AI queuing.
- The resource guide should show company-specific IDs and copyable payload examples, but should not claim the endpoint is live until the Edge Function and tables are implemented and QAed.

Provider-specific aliases should be supported in the function for common variations:

- `provider_call_id`, `call_id`, `meeting_id`, `recording_id` -> `external_call_id`
- `title`, `meeting_name`, `call_title` -> `meeting_title`
- `start_time`, `created_at`, `meeting_started_at` -> `started_at`
- `end_time`, `meeting_ended_at` -> `ended_at`
- `notes`, `meeting_summary`, `fathom_summary` -> `summary`
- `transcript_text`, `transcript_url`, `transcript` -> transcript fields

## Proposed Tables

### `integration_intake_events`

Recommended shared audit/intake table for all inbound integrations.

Suggested fields:

- `id uuid primary key`
- `company_id uuid not null references companies(id)`
- `legacy_company_glide_row_id text`
- `integration_type text not null`
  - suggested values: `call_ai_transcript`, `call_summary_next_steps`, `client_create`, `client_update`, `course_completion`
- `provider text`
- `external_event_id text`
- `status text not null default 'received'`
  - suggested values: `received`, `processed`, `needs_review`, `failed`, `ignored`
- `match_status text not null default 'unmatched'`
  - suggested values: `matched`, `unmatched`, `ambiguous`, `manual`, `not_required`
- `matched_client_id uuid null references clients(id)`
- `matched_legacy_client_glide_row_id text`
- `matched_by text`
- `error_message text`
- `payload jsonb not null default '{}'::jsonb`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Suggested unique index:

```sql
unique (company_id, integration_type, provider, external_event_id)
where external_event_id is not null
```

### `client_calls`

Stores one call or meeting transcript. Calls can be linked to a client or can remain company-level only.

Suggested fields:

- `id uuid primary key`
- `company_id uuid not null references companies(id)`
- `legacy_company_glide_row_id text`
- `client_id uuid null references clients(id)`
- `legacy_client_glide_row_id text null`
- `provider text not null`
- `external_call_id text`
- `title text`
- `started_at timestamptz`
- `ended_at timestamptz`
- `duration_seconds integer`
- `summary text`
- `recording_url text`
- `transcript_text text`
- `transcript_storage_path text`
- `transcript_checksum text`
- `status text not null default 'received'`
  - suggested values: `received`, `linked`, `queued_for_ai`, `analyzed`, `needs_review`, `ignored`
- `match_status text not null default 'unmatched'`
  - suggested values: `matched`, `unmatched`, `ambiguous`, `manual`
- `matched_by text`
  - suggested values: `client_id`, `client_email`, `attendee_email`, `client_name`, `manual`
- `matched_confidence numeric`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Suggested unique index:

```sql
unique (company_id, provider, external_call_id)
where external_call_id is not null
```

### `call_ai_analysis_jobs`

Queues future AI analysis without making ingestion wait.

Suggested fields:

- `id uuid primary key`
- `company_id uuid not null references companies(id)`
- `call_id uuid not null references client_calls(id)`
- `status text not null default 'queued'`
  - suggested values: `queued`, `processing`, `completed`, `failed`, `skipped`
- `run_fixed_prompts boolean not null default true`
- `run_company_prompt boolean not null default false`
- `requested_by text`
  - suggested values: `webhook`, `manual`, `scheduled`
- `error_message text`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### `client_course_progress`

This can wait unless an LMS integration becomes immediate. If we want multiple courses per client, use a dedicated table instead of custom fields.

Suggested fields:

- `id uuid primary key`
- `company_id uuid not null references companies(id)`
- `client_id uuid null references clients(id)`
- `legacy_client_glide_row_id text`
- `provider text`
- `course_id text`
- `course_name text`
- `completion_percentage numeric`
- `completed_at timestamptz`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### Future Tables

The broader Call AI model can add:

- `call_ai_analysis_results`
- `call_ai_comments`
- `company_call_types`
- `company_call_prompt_config`

Those should wait until Call AI is actively being built.

## Transcript Storage

V1 can store small transcripts directly in `client_calls.transcript_text`.

Recommended guardrail:

- If transcript text is small enough, store it in the row.
- If transcript is large, write it to Supabase Storage and store:
  - `transcript_storage_path`
  - `transcript_checksum`
  - short preview or extracted summary in `transcript_text`

Suggested Storage bucket:

```text
call-transcripts
```

Suggested path:

```text
{company_id}/{provider}/{external_call_id || call_id}.txt
```

Security:

- Keep bucket private.
- Read through server-side or authenticated app flows only.
- Do not expose raw transcript URLs publicly.

## Client Matching Rules

V1 should match conservatively and never guess when ambiguous.

Recommended order:

1. Explicit `client_id`
   - Accept app-owned client UUID or legacy `clients.glide_row_id`.
   - Must belong to the supplied company.
2. Explicit `client_email`
   - Match `clients.client_email` within company.
   - If multiple active clients share the email, mark `ambiguous`.
3. Attendee email
   - Compare attendee emails against `clients.client_email`.
   - Ignore known internal company team member emails.
4. Client name
   - Match exact normalized `client_name` within company.
   - If more than one result, mark `ambiguous`.
5. No match
   - Store call as company-level `unmatched`.
   - Show later in Call AI / review queue.

Recommended matching outcomes:

- `matched`: exactly one client identified.
- `ambiguous`: multiple possible clients.
- `unmatched`: no likely client.
- `manual`: user linked the call later.

## Fathom Summary To Next Steps / History

When a summary payload is matched to exactly one client, write a `client_history_events` row and update the client current state.

Suggested history event:

- `event_type`: `call_summary_added`
- `source`: `call_summary_webhook`
- `title`: `Call summary added for {client_name}`
- `summary`: provider summary
- `last_contact_at`: call started time, if available
- `notes`: provider summary
- `next_steps`: provider summary
- `payload`:
  - `call_id`
  - `provider`
  - `external_call_id`
  - `recording_url`
  - `matched_by`
  - `matched_confidence`

Important:

- The summary endpoint is explicitly allowed to update `clients.next_steps_value` because that is the purpose of the workflow.
- Store the prior next steps in history/audit metadata so changes are reversible/reviewable.
- Summary should appear in History as a RetainOS history event.
- If the UI later has a dedicated call notes area, the same event can link there.

## Linked Call To Last Contact Date

When a summary payload is matched to a client:

- Update `clients.csm_date_of_last_contact` to the call `started_at` date/time.
- If the current last-contact date is newer than the call date, do not move it backwards unless `force_update_last_contact = true`.
- Record before/after values in `app_audit_events`.
- Include `last_contact_at` on the `client_history_events` row so dashboard/profile upkeep logic can count the update.

This directly supports the user goal:

- Fathom summary adds to client notes/history.
- Date of last contact updates when the Fathom call is linked to a client.

## Call AI Analysis Queue

Ingestion should create an optional `call_ai_analysis_jobs` row when:

- company setting allows Call AI ingestion, and
- transcript exists, and
- request has `queue_ai_analysis = true`, or company default says auto-queue.

V1 should only queue, not process.

Future processing should:

- Run fixed SuperAdmin-managed prompts.
- Optionally run one company-specific prompt for Pro/Enterprise companies.
- Store analysis results separately from the transcript row.
- Mark the job `completed` or `failed`.

## Permissions And Security

Webhook ingestion:

- Public function with JWT disabled.
- Shared secret required.
- Company must be pilot/migrated.
- Optional company setting must be enabled.
- Input must be size-limited.
- Transcript payload should be sanitized and never rendered as raw HTML.
- Request should be idempotent by `(company_id, provider, external_call_id)`.

App access:

- SuperAdmin: all companies.
- Director/Support: company calls and client-linked calls.
- CSM: calls linked to assigned clients; optionally calls they own if `enable_call_ai_for_csms` is true.
- Viewer: no Call AI unless later explicitly allowed.

Audit:

- Insert `app_audit_events` for call received, call linked, summary written, last contact updated, and AI queued.
- Keep raw provider payload in metadata, but avoid storing unnecessary secrets.

## Resources Setup Guide Skeleton

Add a global Resource with:

- `slug`: `call-transcript-webhook`
- `title`: `Connect meeting transcripts to RetainOS`
- `type`: `guide`
- `status`: `draft` initially
- `is_dynamic`: `true`
- `dynamic_key`: `call_transcript_webhook`

Also add a separate global Resource with:

- `slug`: `call-summary-webhook`
- `title`: `Connect call summaries to client next steps`
- `type`: `guide`
- `status`: `draft` until endpoint is live
- `is_dynamic`: `true`
- `dynamic_key`: `client_call_summary_webhook`

Dynamic guide should show:

1. Copy the Call Transcript Webhook URL.
2. Copy the selected Company ID.
3. Configure Headers:
   - `Authorization: Bearer YOUR_COMPANY_INTEGRATION_TOKEN`
   - `Content-Type: application/json`
4. Choose provider:
   - Fathom
   - Otter
   - Grain
   - Other / n8n / Zapier / Make
5. Copy JSON request body template.
6. Explain matching:
   - best: send `client_id`
   - good: send `client_email`
   - acceptable: attendees include client email
7. Explain what RetainOS will do:
   - store call
   - link to client when possible
   - add summary to history when enabled
   - update last contact when enabled
   - queue Call AI later when enabled
8. Troubleshooting:
   - invalid company id
   - invalid secret
   - unmatched client
   - ambiguous client
   - duplicate external call id
   - missing transcript

Resource JSON body example:

```json
{
  "company_id": "{{company_id}}",
  "provider": "fathom",
  "external_call_id": "{{fathom_call_id}}",
  "meeting_title": "{{meeting_title}}",
  "started_at": "{{started_at}}",
  "ended_at": "{{ended_at}}",
  "summary": "{{summary}}",
  "transcript": "{{transcript}}",
  "recording_url": "{{recording_url}}",
  "client_email": "{{client_email}}",
  "attendees": "{{attendees}}",
  "queue_ai_analysis": false
}
```

Summary-to-next-steps JSON body example:

```json
{
  "company_id": "{{company_id}}",
  "provider": "fathom",
  "external_call_id": "{{fathom_call_id}}",
  "client_email": "{{client_email}}",
  "summary": "{{fathom_summary}}",
  "started_at": "{{started_at}}",
  "recording_url": "{{recording_url}}"
}
```

## QA Checklist

### Summary-To-Next-Steps Ingestion

- Send a valid webhook with app-owned company UUID.
- Send a valid webhook with legacy company id.
- Send a valid webhook with a token configured for the submitted company.
- Same token with a different company_id returns 401.
- Invalid company integration token returns 401.
- Missing company id returns 400.
- Missing client email returns 400.
- Mirror-only company returns 400 unless explicitly enabled later.
- Duplicate `(company_id, provider, external_call_id)` does not create duplicate history updates.
- Exact client email matches the correct client.
- Duplicate client email marks intake ambiguous/needs review and does not update a client.
- Matched payload updates `clients.next_steps_value`.
- Matched payload updates `clients.csm_date_of_last_contact`.
- History tab shows the call summary.
- CSM Reports / Profile Upkeep count last-contact freshness from the new history event.

### Call AI Transcript Ingestion

- Send a valid webhook with app-owned company UUID.
- Send a valid webhook with legacy Glide company id.
- Invalid secret returns 401.
- Missing company id returns 400.
- Mirror-only company returns 400.
- Duplicate `(company_id, provider, external_call_id)` does not create duplicates.
- Large transcript is handled according to the storage rule.

### Client Matching

- Explicit client id matches the correct client.
- Explicit client email matches the correct client.
- Attendee email matches the correct client.
- Duplicate client email marks call ambiguous.
- Missing match creates company-level unmatched call.

### Client Updates

- Matched summary writes `client_history_events`.
- Matched summary updates current next steps.
- Matched summary updates last-contact date.
- Older call does not overwrite newer last-contact date.
- History tab shows the call summary.
- CSM Reports / Profile Upkeep count last-contact freshness from the new history event.

### Security / Permissions

- CSM cannot view unassigned client calls.
- Director/Support can view company calls.
- SuperAdmin can view all.
- Raw transcript content is not exposed to unauthenticated users.

### Resources

- Dynamic guide shows the selected company id.
- Guide shows the call transcript webhook URL.
- Copy buttons work.
- Draft/published behavior works.
- Loom/video resource pattern still works.

## Recommended Staged Build

### Stage 1: Summary-To-Next-Steps Foundation `[implemented pending QA]`

Built on 2026-06-11:

- `integration_intake_events` table.
- `ingest-client-call-summary` function.
- Exact client-email matching.
- Idempotency.
- Update next steps.
- Update last-contact date.
- History and audit events.
- Resources dynamic guide.

Remaining before calling this shipped:

- QA with Ethical Scaling through Zapier/n8n/Make or a direct POST.
- Create an active `company_integration_secrets` row for each customer/company using a SHA-256 token hash. Example hash expression: `encode(extensions.digest('raw-token', 'sha256'), 'hex')`.
- Validate duplicate protection with `external_call_id`.
- Decide whether unmatched/ambiguous events need a small review UI before Moves Method migration.
- Legacy `CALL_SUMMARY_WEBHOOK_SECRET` / `CLIENT_CALL_SUMMARY_WEBHOOK_SECRET` remains a local/dev fallback only when a company has no active company token configured.

Do not build full transcript/Call AI yet.

### Stage 2: Call AI Inbound Foundation

Build:

- `client_calls` table.
- `ingest-call-transcript` function.
- Conservative client matching by explicit email and attendee email.
- Idempotency.
- App audit events.
- Resources dynamic guide skeleton.

Do not run AI analysis yet. This lets us safely test provider payloads.

### Stage 3: Client Update Webhook

Add:

- `webhook-update-client` function.
- Conservative company + email matching.
- Explicit allowlist of updatable fields.
- History/audit events for every write.

### Stage 4: Course Completion Webhook

Add:

- `webhook-course-completion` function.
- Optional `client_course_progress` table.
- Client custom-field update option for simple percentage tracking.

### Stage 5: Review Queue

Add:

- Call AI / Calls page list of received calls.
- Matched, unmatched, ambiguous filters.
- Manual link/unlink client action.
- Re-run matching action.

### Stage 6: Call AI Queue

Add:

- `call_ai_analysis_jobs`.
- Queue-on-ingest setting.
- Manual "Run AI analysis" action.
- No AI processing yet unless explicitly scoped.

### Stage 7: Provider Polish

Add provider-specific setup guides for:

- Fathom
- Otter
- Grain
- n8n / Zapier / Make generic webhook setup

## Recommended First Build Slice

Start with Stage 1: Summary-To-Next-Steps Foundation.

Why:

- It is low risk.
- It matches the operational use case needed before full Call AI.
- It supports Moves Method-style companies that do not have Call AI access.
- It updates a visible client workflow Jay can QA immediately: next steps, last contact, history.
- It creates a reusable intake/audit pattern for the later transcript, client update, and LMS webhooks.
