# Client Update Webhook V1

Endpoint:

```text
{SUPABASE_URL}/functions/v1/webhook-update-client
```

Use this endpoint for conservative inbound updates to existing app-owned RetainOS clients. It only works for companies whose `companies.migration_status` is `pilot` or `migrated`; mirror-only companies remain read-only.

## Authentication

Send the company-specific token in either header:

```text
Authorization: Bearer {token}
x-webhook-secret: {token}
```

Preferred setup stores only a SHA-256 token hash in the shared `company_integration_secrets` table:

```sql
insert into public.company_integration_secrets (
  company_id,
  integration_type,
  token_hash,
  token_prefix,
  label
)
values (
  '<company uuid>',
  'client_update',
  encode(extensions.digest('<raw token>', 'sha256'), 'hex'),
  left('<raw token>', 8),
  'Zapier client update V1'
);
```

The function also supports a temporary global fallback secret, `CLIENT_UPDATE_WEBHOOK_SECRET` or `WEBHOOK_UPDATE_CLIENT_SECRET`, only when the company has no active `company_integration_secrets` rows for `client_update`. Prefer company secret rows before customer rollout.

## Matching Rules

Required:

- `company_id`: app-owned company UUID or legacy Glide company id.
- One of:
  - `client_email`: exact case-insensitive client email inside that company.
  - `client_id`: app-owned RetainOS client UUID. If `client_email` is also present, it must match the same client.

The function does not fuzzy-match names. If no app-owned client matches, or more than one safe match exists, the request is stored in `integration_intake_events` as `needs_review` and no client is updated.

## Supported Payload

```json
{
  "company_id": "company uuid or legacy Glide id",
  "provider": "zapier",
  "external_event_id": "crm-update-123",
  "client_email": "client@example.com",
  "next_steps": "Send onboarding recap and schedule the next check-in.",
  "notes": "Updated from CRM workflow.",
  "last_contact": "2026-06-12T10:00:00-04:00",
  "next_contact": "2026-06-19",
  "offer_id": "app-owned-company-offer-glide-row-id",
  "assigned_to": "csm email, app member UUID, or legacy member id",
  "custom_fields": {
    "peak_diagnostic_stage": "Complete",
    "course_progress": 80
  }
}
```

Aliases accepted:

- `companyId`, `companyGlideId`, `company_glide_id`
- `clientEmail`, `email`
- `clientId`
- `nextSteps`
- `lastContact`, `last_contact_at`
- `nextContact`, `next_contact_at`
- `offerId`
- `assignedTo`, `csm_email`, `csmEmail`
- `customFields`

`custom_fields` can be an object keyed by `company_custom_fields.key`, or an array of `{ "id": "...", "value": "..." }` / `{ "key": "...", "value": "..." }`.

## What It Writes

Successful requests write only app-owned tables:

- updates allowlisted fields in `clients`;
- upserts supported values in `client_custom_field_values`;
- inserts `client_history_events.event_type = 'client_update_webhook'`;
- inserts `app_audit_events.event_type = 'client_update_webhook_processed'`;
- marks the matching `integration_intake_events` row as `processed`.

It never mutates `backup_*` tables.

## V1 Limits

- Status/program lifecycle updates are rejected in V1; use the RetainOS status flow.
- Offer updates validate only the active company offer id and do not auto-change milestones.
- `notes` are stored in history/audit context, not as Director Notes.
- Duplicate `external_event_id` values are idempotent per company, provider, and integration type.

## Deploy / QA Checklist

1. Apply `supabase/migrations/20260612110000_company_integration_secrets.sql` if company-scoped integration tokens are not live yet.
2. Apply `supabase/migrations/20260612100000_client_update_webhook_v1.sql`.
3. Deploy with JWT verification disabled:

```bash
npx supabase functions deploy webhook-update-client --project-ref zjauqflzxzsbpnivzsct --no-verify-jwt
```

4. Insert a `company_integration_secrets` row for the test company/integration.
5. Send a known-client test payload and verify:
   - `clients` current fields changed as expected;
   - `client_custom_field_values` changed only for configured active fields;
   - Client Detail > History shows the webhook event;
   - `app_audit_events` has before/after data;
   - `integration_intake_events` is `processed`.
6. Send unmatched and duplicate tests:
   - unknown `client_email` returns `202` and stores `needs_review`;
   - repeated `external_event_id` returns `duplicate: true` and does not write again.
