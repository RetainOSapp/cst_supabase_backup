# Call Intelligence V1: Fathom → Zapier Contract

Use this Zap only for calls involving one RetainOS client account. Multiple
internal team members and multiple participants from that same client are
supported. Calls containing people from more than one RetainOS client account
are accepted but held for Director reconciliation instead of being analyzed.

This is separate from the existing call-summary/notes Zap. Do not replace or
modify `ingest-client-call-summary`.

## Webhook

- Method: `POST`
- URL:
  `https://zjauqflzxzsbpnivzsct.supabase.co/functions/v1/ingest-call-intelligence`
- Header: `Content-Type: application/json`
- Header: `x-retainos-integration-token: <company Call AI transcript token>`
- Token type: `call_ai_transcript`

Each company must use its own token and company ID. Never put the token in the
JSON body, a shared spreadsheet, Loom, ticket, or committed file.

## Body

```json
{
  "schema_version": "call_intelligence.v1",
  "provider": "fathom",
  "company_id": "RETAINOS_COMPANY_ID",
  "external_call_id": "FATHOM_STABLE_RECORDING_OR_MEETING_ID",
  "title": "FATHOM_MEETING_TITLE",
  "occurred_at": "2026-07-23T12:00:00Z",
  "duration_seconds": 2700,
  "recording_url": "https://fathom.video/calls/...",
  "share_url": "https://fathom.video/share/...",
  "host": {
    "name": "Team Member",
    "email": "team@company.com"
  },
  "participants": [
    {
      "name": "Client Participant",
      "email": "client@example.com",
      "is_external": true
    }
  ],
  "transcript": "00:00:00 - Team Member: ..."
}
```

## Zapier mapping

| RetainOS field | Zapier/Fathom value | Rule |
| --- | --- | --- |
| `schema_version` | Static `call_intelligence.v1` | Required |
| `provider` | Static `fathom` | Required in V1 |
| `company_id` | Static RetainOS company ID | Required; must match token |
| `external_call_id` | Stable Fathom recording/call ID | Required; dedupe key |
| `title` | Meeting title | Required |
| `occurred_at` | Recording/meeting start timestamp | ISO-8601 timestamp |
| `duration_seconds` | Fathom duration converted to seconds | Integer, 0–86,400 |
| `recording_url` | Private recording URL | Optional HTTPS URL |
| `share_url` | Share URL | Optional HTTPS URL |
| `host` | Host name and email | Include when available |
| `participants` | All host/invitee/attendee identities | Preserve emails |
| `transcript` | Plain transcript text | Required; max 500,000 chars |

Do not prepend the recording URL or Zap metadata to the transcript. Send URLs
in their dedicated fields.

## Expected behavior

- First valid delivery creates one call and returns its match/processing state.
- Exact replay returns the existing call; no second automatic analysis is made.
- The same provider call ID with different transcript content returns a
  conflict and preserves the original source for review.
- One client match queues analysis.
- No client match or more than one client account match creates a
  reconciliation item; no automatic provider call.
- A 2xx response is success. Do not retry a 4xx validation/auth/conflict
  response automatically; correct the Zap mapping.
- Retry transport failures and 5xx responses with the same
  `external_call_id`.

## Pilot QA

1. Use a new Fathom test call, not an old provider ID already delivered.
2. Confirm the Zap exposes participant emails and a stable call/recording ID.
3. Send one call with one known RetainOS client account.
4. Confirm exactly one RetainOS call and one base analysis run exist.
5. Replay the same payload and confirm no duplicate call/run.
6. Send an unknown-client call and confirm it appears in Reconciliation.
7. Resolve it as a Director and confirm analysis queues once.
8. Confirm the existing Notes/Next Steps Zap continues unchanged.
