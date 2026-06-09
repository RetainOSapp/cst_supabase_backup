# Call Transcript Integration Plan

Purpose: design a provider-agnostic inbound transcript flow for Fathom, Otter, Grain, and similar tools. This is a proposal only; no code has been implemented from this plan yet.

## Current Context

- RetainOS already has a provider-style inbound webhook pattern in `supabase/functions/zapier-create-client`.
- Client write flows already use app-owned tables for pilot/migrated companies and write `client_history_events` plus `app_audit_events`.
- Quick Update currently updates notes, next steps, last contact, next contact, outcomes, and history for app-owned clients.
- Resources already supports global guides, dynamic company-specific IDs, editable resources, and Loom embeds.
- Call AI is still a later roadmap area, but transcript ingestion is a useful foundation because it can power notes, last-contact updates, call records, and future analysis.

## Goals

- Accept meeting transcript events from Fathom, Otter, Grain, or an automation layer such as Zapier, n8n, or Make.
- Store each call/transcript as app-owned data, scoped to one company.
- Match the call to a client when possible.
- Optionally write the provider summary into client history/notes.
- Optionally update the client's date of last contact when the call is linked to a client.
- Queue the transcript for future Call AI analysis without blocking ingestion.
- Provide a Resources setup guide similar to the client-creation webhook guide.

## Non-Goals For V1

- Do not run AI analysis in the ingestion request.
- Do not build full Call AI dashboards yet.
- Do not support direct OAuth integrations with each provider yet.
- Do not auto-create clients from call attendees in V1.
- Do not send notifications until notification preferences are defined.

## Provider-Agnostic Endpoint

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
- Require a server-side shared secret in either:
  - `Authorization: Bearer {CALL_TRANSCRIPT_WEBHOOK_SECRET}`
  - `x-webhook-secret: {CALL_TRANSCRIPT_WEBHOOK_SECRET}`
- Require `company_id`.
- Accept either app-owned company UUID or legacy Glide company id, matching the existing client webhook pattern.
- Only allow companies with `migration_status in ('pilot', 'migrated')`.
- Optionally require a company setting such as `enable_call_transcript_ingestion = true` before accepting requests.

## Request Shape

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
  "client_id": "{{optional_retainos_client_id_or_legacy_id}}",
  "client_email": "{{optional_client_email}}",
  "client_name": "{{optional_client_name}}",
  "csm_email": "{{optional_csm_email}}",
  "attendees": [
    { "name": "Client Name", "email": "client@example.com" },
    { "name": "CSM Name", "email": "csm@example.com" }
  ],
  "write_summary_to_notes": true,
  "update_last_contact": true,
  "raw_payload": {}
}
```

Provider-specific aliases should be supported in the function for common variations:

- `provider_call_id`, `call_id`, `meeting_id`, `recording_id` -> `external_call_id`
- `title`, `meeting_name`, `call_title` -> `meeting_title`
- `start_time`, `created_at`, `meeting_started_at` -> `started_at`
- `end_time`, `meeting_ended_at` -> `ended_at`
- `notes`, `meeting_summary`, `fathom_summary` -> `summary`
- `transcript_text`, `transcript_url`, `transcript` -> transcript fields

## Proposed Tables

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

## Fathom Summary To Notes / History

When a call is matched to a client and `write_summary_to_notes = true`, write a `client_history_events` row.

Suggested history event:

- `event_type`: `call_summary_added`
- `source`: `call_transcript_webhook`
- `title`: `Call summary added for {client_name}`
- `summary`: provider summary
- `last_contact_at`: call started time, if available
- `notes`: provider summary
- `payload`:
  - `call_id`
  - `provider`
  - `external_call_id`
  - `recording_url`
  - `matched_by`
  - `matched_confidence`

Important:

- Do not overwrite `next_steps_value` unless the provider payload explicitly sends next steps and Jay approves that behavior later.
- Summary should appear in History as a RetainOS history event.
- If the UI later has a dedicated call notes area, the same event can link there.

## Linked Call To Last Contact Date

When a call is matched to a client and `update_last_contact = true`:

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

Dynamic guide should show:

1. Copy the Call Transcript Webhook URL.
2. Copy the selected Company ID.
3. Configure Headers:
   - `Authorization: Bearer YOUR_WEBHOOK_SECRET`
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
  "write_summary_to_notes": true,
  "update_last_contact": true,
  "queue_ai_analysis": false
}
```

## QA Checklist

### Ingestion

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

- Matched call with summary writes `client_history_events`.
- Matched call updates last-contact date.
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

### Stage 1: Inbound Foundation

Build only:

- `client_calls` table.
- `ingest-call-transcript` function.
- Conservative client matching.
- Idempotency.
- App audit events.
- Resources dynamic guide skeleton.

Do not update client notes or last-contact date yet. This lets us safely test provider payloads.

### Stage 2: Client History + Last Contact

Add:

- `call_summary_added` history event support.
- Optional last-contact update.
- Client Detail History display validation.
- CSM Reports/Profile Upkeep validation.

### Stage 3: Review Queue

Add:

- Call AI / Calls page list of received calls.
- Matched, unmatched, ambiguous filters.
- Manual link/unlink client action.
- Re-run matching action.

### Stage 4: Call AI Queue

Add:

- `call_ai_analysis_jobs`.
- Queue-on-ingest setting.
- Manual "Run AI analysis" action.
- No AI processing yet unless explicitly scoped.

### Stage 5: Provider Polish

Add provider-specific setup guides for:

- Fathom
- Otter
- Grain
- n8n / Zapier / Make generic webhook setup

## Recommended First Build Slice

Start with Stage 1 plus the Resource guide skeleton.

Why:

- It is low risk.
- It gives Jay and Ben a real endpoint to test against Fathom/n8n/Zapier.
- It avoids modifying client records until payload matching is trusted.
- It creates the data foundation for Call AI without committing to full AI processing yet.

