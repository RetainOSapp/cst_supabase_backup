-- Refresh the RetainOS Help draft for Custom Fields after auditing the old
-- CST custom-field walkthrough against app-owned RetainOS customization,
-- Quick Update / Outcomes usage, and webhook support.

update public.resources
set
  title = 'Custom fields in RetainOS',
  type = 'video',
  description = 'RetainOS guide for configuring company-level custom client fields, updating client values, and passing custom field values through client webhooks.',
  content = $_$Resource category: Setup & Onboarding

Audience: Admin, Director

Operational purpose: Configure company-specific recurring client tracking fields when the standard RetainOS profile, outcome, contact, pathway, task, and contract fields are not enough.

RetainOS status: Custom Fields V1 is live for app-owned pilot/migrated companies. Mirror-only companies show CST custom-field labels as read-only previews until migration.

Where admins configure custom fields:
- Go to Admin Hub / SaaS Client Detail for the company.
- Open Customization.
- Go to Custom fields.
- Click + Custom Field.
- Add a stable key, display label, optional description, field type, options when needed, visibility/editability settings, and position.
- Save the field.

Supported field types:
- Text.
- Textarea.
- Number.
- Date.
- Boolean.
- Single select.
- Multi select.
- URL.
- Email.

How RetainOS improves on old CST:
- Old CST used a small fixed set of custom-field slots.
- RetainOS stores app-owned custom field definitions per company.
- RetainOS is not limited to the old five-slot CST model.
- Fields can be typed, ordered, archived, and mapped from legacy CST source keys.
- Select fields can have configured option lists so users enter cleaner data.

Where CSMs update custom field values:
- Clients > Quick Update: active client custom fields appear alongside contact dates, notes, and outcome signals.
- Client Detail > Outcomes: active client custom fields can be edited with outcome updates.
- Custom field updates save to the client's app-owned custom field value records and appear in history/audit context where available.

Webhook support:
- New Client Webhook can accept custom_fields during client creation.
- Client Update Webhook can accept custom_fields when updating an existing client.
- custom_fields can be sent as an object keyed by active field key/ID, or as an array of objects with key or id plus value.
- Legacy customfield1 through customfield7 payload fields are still accepted when they match migrated field source keys.
- If a submitted custom field key/ID is not active for the company, RetainOS rejects the webhook instead of silently storing the wrong field.

Recommended setup:
- Use custom fields only for recurring client signals the team should update repeatedly.
- Put durable profile details in Edit Profile when they are core client information.
- Put health/state signals in Outcomes when they belong to Success, Progress, or Buy-In.
- Put operational next action context in Next Steps / Quick Update notes.
- Keep custom field labels short and specific so they work in forms, reports, and future automation.

Example fields:
- Money generated.
- Deals closed.
- Guarantee type.
- Activation score.
- Primary constraint.
- Onboarding source.
- Implementation risk.

Re-recording notes:
- Do not say RetainOS is limited to five custom fields.
- Show Admin Hub / Company Customization > Custom fields.
- Create a field with a real field type, such as Number or Single select.
- Show that active fields appear in Quick Update.
- Show the same field in Client Detail > Outcomes.
- Mention New Client Webhook and Client Update Webhook can receive custom_fields.
- Mention legacy customfield1..customfield7 only as backwards compatibility for migrated CST/Zapier payloads.$_$,
  loom_embed_url = 'https://www.loom.com/share/adb793b20c3442df9ae2fab5e7867484',
  status = 'draft',
  is_dynamic = false,
  dynamic_key = null,
  scope = 'retainos_help',
  company_legacy_id = null,
  updated_at = now()
where slug = 'custom-fields';
