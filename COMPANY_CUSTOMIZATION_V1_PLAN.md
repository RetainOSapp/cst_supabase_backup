# Company Customization V1 Plan

Last reviewed: 2026-06-08

## Goal

Define the first RetainOS-native company customization layer needed before moving beyond the Ethical Scaling pilot. This plan intentionally covers planning and the next implementation slice only; app source, migrations, Edge Functions, `ROADMAP.md`, and `MEMORY.md` should be updated in a later implementation session.

## Current Implemented State

RetainOS already has the core app-owned pilot foundation:

- `companies`, `company_members`, and `app_audit_events` exist in `supabase/migrations/20260529120000_write_mode_pilot_foundation.sql`.
- `companies` includes early company-level flags: `subscription_tier`, `enable_secondary_assignee`, `enable_call_ai_for_csms`, `view_override`, `metadata`, `status`, and `migration_status`.
- `company_members` stores app-owned team roles: `director`, `support`, `csm`, and `viewer`.
- Sensitive writes use service-role Edge Functions that validate the caller from the Supabase session and app-owned membership, then write `app_audit_events`.
- Broad read policies currently exist on several app-owned read surfaces (`clients`, `client_history_events`, `company_offers`, `company_offer_milestones`) for authenticated users; this should be tightened as more companies migrate.

Company/admin surfaces:

- SaaS Company Detail and Admin Hub are the same page (`src/pages/SaasClientDetail.tsx`), with tabs for `Team`, `Customization`, `Pathways & Milestones`, and `Company Settings`.
- `Team` prefers app-owned `company_members` for pilot/migrated companies and falls back to `backup_company_team` for mirror-only companies.
- `Team` writes are live through `supabase/functions/manage-company-member`; SuperAdmins and active Directors can create, update, and archive app-owned team members.
- `Pathways & Milestones` prefers app-owned `company_offers` and `company_offer_milestones` for pilot/migrated companies and falls back to `backup_company_offers` and `backup_company_offer_milestones` for mirror-only companies.
- `Pathways & Milestones` writes are live through `supabase/functions/manage-company-pathway`; SuperAdmins and active Directors can create, update, and archive offers/milestones. Active client usage blocks archive.
- `Customization` and `Company Settings` are currently `ComingSoonPanel` placeholders.

Client customization dependencies already in production/pilot:

- Client current state is app-owned in `clients`, with Glide ids retained in `glide_row_id` and `company_glide_row_id`.
- Outcomes are stored on `clients` as Success, Progress, and Buy-in fields. The UI still reads choice labels from `backup_choices`; server validation in `manage-client-outcomes` is hard-coded to Success `yes/no` and Progress/Buy-in `green/yellow/red`.
- Churn is currently represented by `clients.churn_reason_value` and `clients.churn_comments`. `manage-client-status` writes the typed status-change reason into `churn_reason_value` when moving a client to `off-boarded`.
- Program/status choices still come from mirrored `backup_choices` and the status write function hard-codes `front-end`, `back-end`, `paused`, `suspended`, and `off-boarded`.
- Client list filters, sort, page, and view mode are currently browser-local via `cst.clientsRosterState.v1`, not company-owned.
- Dashboard and CSM Reports use fixed formulas and a hard-coded 14-day profile upkeep freshness window. This is called out in `ROADMAP.md` as company-configurable later.

## Proposed App-Owned Schema

Use company-scoped configuration tables rather than expanding `companies` indefinitely. Keep `companies` for coarse product flags and account state; put editable company preferences and definitions in purpose-built tables with `metadata`, timestamps, status, and audit coverage.

### `company_settings`

One row per company for operational and feature configuration.

Suggested columns:

- `id uuid primary key default gen_random_uuid()`
- `company_id uuid not null unique references companies(id) on delete cascade`
- `profile_upkeep_freshness_days integer not null default 14`
- `default_client_view text not null default 'list' check (default_client_view in ('list', 'card', 'calendar'))`
- `default_calendar_mode text not null default 'month' check (default_calendar_mode in ('month', 'week', 'day'))`
- `dashboard_default_tab text not null default 'overview' check (dashboard_default_tab in ('overview', 'charts', 'ai'))`
- `enable_secondary_assignee boolean not null default false`
- `enable_call_ai_for_csms boolean not null default false`
- `enable_embeds boolean not null default false`
- `enable_zapier_client_create boolean not null default false`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at`, `updated_at`

Notes:

- Seed from `companies.enable_secondary_assignee`, `companies.enable_call_ai_for_csms`, and mirrored `backup_companies` where app-owned values are missing.
- Keep duplicated flags on `companies` for compatibility during V1, but new UI should read `company_settings` first and sync/normalize later.

### `company_feature_flags`

Optional separate table if product/tier flags need change history or rollout targeting beyond `companies.subscription_tier`.

Suggested columns:

- `id uuid primary key default gen_random_uuid()`
- `company_id uuid not null references companies(id) on delete cascade`
- `flag_key text not null`
- `flag_value boolean not null default false`
- `locked_by_tier boolean not null default false`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at`, `updated_at`
- unique `(company_id, flag_key)`

Initial flags:

- `secondary_assignee`
- `call_ai_for_csms`
- `dashboard_ai_insights`
- `zapier_client_create`
- `custom_fields`
- `notifications`
- `embeds`

For V1, this can also stay inside `company_settings.metadata.feature_flags` if we want fewer tables. Use the table only if SuperAdmins need to manage flags separately from Directors.

### `company_custom_field_definitions`

Company-owned definitions for extra fields shown on client profiles, lists, imports, and exports.

Suggested columns:

- `id uuid primary key default gen_random_uuid()`
- `company_id uuid not null references companies(id) on delete cascade`
- `key text not null`
- `label text not null`
- `description text`
- `entity_type text not null default 'client' check (entity_type in ('client', 'company_member', 'contract'))`
- `field_type text not null check (field_type in ('text', 'textarea', 'number', 'date', 'boolean', 'single_select', 'multi_select', 'url', 'email'))`
- `options jsonb not null default '[]'::jsonb`
- `is_required boolean not null default false`
- `is_visible_on_client_detail boolean not null default true`
- `is_visible_on_client_list boolean not null default false`
- `is_editable_by_csm boolean not null default false`
- `position integer not null default 0`
- `status text not null default 'active' check (status in ('active', 'archived'))`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at`, `updated_at`, `archived_at`
- unique `(company_id, key)`

### `client_custom_field_values`

Values for custom fields. Keep values separate from definitions to avoid frequent client-table schema changes.

Suggested columns:

- `id uuid primary key default gen_random_uuid()`
- `company_id uuid not null references companies(id) on delete cascade`
- `client_id uuid references clients(id) on delete cascade`
- `legacy_client_glide_row_id text not null`
- `field_definition_id uuid not null references company_custom_field_definitions(id) on delete cascade`
- `value_text text`
- `value_number numeric`
- `value_boolean boolean`
- `value_date timestamptz`
- `value_json jsonb`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at`, `updated_at`
- unique `(client_id, field_definition_id)`

Validation should enforce that exactly one value column is populated according to `field_type`, except `multi_select`, which should use `value_json`.

### `company_outcome_definitions`

Replace mirrored `backup_choices` as the company-specific source for outcome choices and labels.

Suggested columns:

- `id uuid primary key default gen_random_uuid()`
- `company_id uuid not null references companies(id) on delete cascade`
- `outcome_type text not null check (outcome_type in ('success', 'progress', 'buy_in', 'suitable'))`
- `value text not null`
- `label text not null`
- `color text`
- `emoji text`
- `positive_rank integer`
- `position integer not null default 0`
- `is_default boolean not null default false`
- `status text not null default 'active' check (status in ('active', 'archived'))`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at`, `updated_at`, `archived_at`
- unique `(company_id, outcome_type, value)`

Initial Ethical Scaling seed:

- Success: `yes`, `no`
- Progress: `green`, `yellow`, `red`
- Buy-in: `green`, `yellow`, `red`
- Exclude stale mirrored `offtrack`.

Do not change the existing `clients` outcome value columns in V1. Definition rows should validate and label those existing stored values.

### `company_churn_reasons`

Make offboarding/churn reasons selectable while preserving typed notes.

Suggested columns:

- `id uuid primary key default gen_random_uuid()`
- `company_id uuid not null references companies(id) on delete cascade`
- `value text not null`
- `label text not null`
- `category text`
- `requires_notes boolean not null default false`
- `counts_as_churn boolean not null default true`
- `position integer not null default 0`
- `status text not null default 'active' check (status in ('active', 'archived'))`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at`, `updated_at`, `archived_at`
- unique `(company_id, value)`

V1 can keep writing selected `value` to `clients.churn_reason_value` and free-form detail to `clients.churn_comments`. Later, add `churn_reason_id uuid` if reporting needs stable ids.

### `company_notification_settings`

One row per company for notification defaults and channels.

Suggested columns:

- `id uuid primary key default gen_random_uuid()`
- `company_id uuid not null unique references companies(id) on delete cascade`
- `timezone text not null default 'UTC'`
- `enabled_channels jsonb not null default '[]'::jsonb`
- `renewal_warning_days integer[] not null default array[30,14,7]`
- `next_contact_warning_days integer[] not null default array[0]`
- `paused_return_warning_days integer[] not null default array[7,1]`
- `task_due_warning_days integer[] not null default array[0]`
- `send_to_directors boolean not null default true`
- `send_to_support boolean not null default true`
- `send_to_primary_csm boolean not null default true`
- `send_to_secondary_csm boolean not null default false`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at`, `updated_at`

Use `metadata` for channel-specific webhook ids or templates until a notification delivery subsystem is built.

### `company_notification_rules`

Optional V1.5 table for granular toggles. Use this if the Settings UI needs individual rows, not only a single JSON/settings form.

Suggested columns:

- `id uuid primary key default gen_random_uuid()`
- `company_id uuid not null references companies(id) on delete cascade`
- `event_type text not null`
- `enabled boolean not null default true`
- `audience text[] not null default array['director','support','primary_csm']`
- `lead_days integer[] not null default array[]::integer[]`
- `channels text[] not null default array[]::text[]`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at`, `updated_at`
- unique `(company_id, event_type)`

Initial event types:

- `contract_renewal_due`
- `next_contact_due`
- `paused_client_return_due`
- `task_due`
- `client_status_changed`
- `client_created`
- `outcome_changed`

### `company_client_view_preferences`

Company default preferences for Clients list/card/calendar and dashboard surfaces.

Suggested columns:

- `id uuid primary key default gen_random_uuid()`
- `company_id uuid not null unique references companies(id) on delete cascade`
- `default_view_mode text not null default 'list' check (default_view_mode in ('list', 'card', 'calendar'))`
- `default_sort_field text not null default 'client_name'`
- `default_sort_direction text not null default 'asc' check (default_sort_direction in ('asc', 'desc'))`
- `visible_columns jsonb not null default '[]'::jsonb`
- `card_fields jsonb not null default '[]'::jsonb`
- `calendar_event_types jsonb not null default '[]'::jsonb`
- `default_filters jsonb not null default '{}'::jsonb`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at`, `updated_at`

Initial `visible_columns` should cover existing built-in fields before custom fields:

- client name
- program/status
- primary CSM
- secondary assignee when enabled
- current offer
- current milestone
- last contact
- next contact
- renewal date
- progress
- buy-in
- success

Browser-local state should remain user convenience. Company preferences should provide defaults when no local state exists or when a user resets the view.

### `company_dashboard_preferences`

Keep dashboard defaults separate from client list preferences if Directors need dashboard-specific controls.

Suggested columns:

- `id uuid primary key default gen_random_uuid()`
- `company_id uuid not null unique references companies(id) on delete cascade`
- `default_tab text not null default 'overview'`
- `visible_kpis jsonb not null default '[]'::jsonb`
- `visible_charts jsonb not null default '[]'::jsonb`
- `default_filters jsonb not null default '{}'::jsonb`
- `profile_upkeep_required_fields jsonb not null default '[]'::jsonb`
- `profile_upkeep_freshness_days integer not null default 14`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at`, `updated_at`

For V1, this can be deferred unless the next session decides to make profile upkeep days configurable first.

## Mirrored Sources To Reuse Short Term

Use mirrors only as seed/fallback sources; never write business config back into `backup_*`.

- `backup_companies`: seed/display `name`, `archived`, `view_override`, `enable_secondary_assignee`, `enable_call_ai_for_csms`, and sync metadata.
- `backup_company_team`: fallback team list for `mirror_only` companies; already mapped to app-owned roles.
- `backup_choices`: short-term seed source for program/status labels, outcome labels, emojis, and order. Filter stale Progress `offtrack`.
- `backup_company_offers`: already used to seed `company_offers` and as mirror-only fallback.
- `backup_company_offer_milestones`: already used to seed `company_offer_milestones` and as mirror-only fallback.
- `backup_company_clients`: seed/reference existing outcome values, churn reason text, current offer/milestone ids, CSM assignments, and current client-state fields.
- `backup_company_clients_contracts`, `backup_company_clients_tasks`, and `backup_company_clients_milestones`: keep as historical fallback until app-owned backfill is complete.

Do not reuse mirrored data for new notification settings, custom fields, or company dashboard/list preferences unless a clear Glide source is found later.

## UI Surfaces And Roles

### SaaS Company Detail / Admin Hub

Existing tabs should be reused:

- `Team`: app-owned team management.
- `Customization`: custom fields, outcome definitions, churn reasons.
- `Pathways & Milestones`: existing offers/milestones setup.
- `Company Settings`: notification settings, client list/calendar/dashboard preferences, tier/config flags, AI/embed/Zapier settings.

Recommended role permissions:

- SuperAdmin:
  - Manage all customization/settings for any pilot/migrated company.
  - Manage tier/config flags, subscription tier, migration status, and integration enablement.
  - View and manage settings through SaaS Company Detail.
- Director:
  - Manage team, pathways, custom fields, outcome definitions, churn reasons, notification preferences, and client/dashboard defaults for their company.
  - Cannot change subscription tier, migration status, locked feature flags, or global SuperAdmin-only integration secrets.
- Support:
  - View company customization/settings.
  - Suggest/use configured options in client workflows.
  - No V1 management writes unless product explicitly grants support admin powers later.
- CSM:
  - View/use configured fields/outcomes/reasons on assigned client workflows.
  - Edit only client-level values allowed by field definitions, not definitions/settings.
- Viewer:
  - Read-only access to company-scoped client views permitted by existing role rules.

### Customization Tab Layout

Recommended sections:

- Custom Fields:
  - Table of definitions with label, type, visibility, required, CSM editable, status.
  - Create/edit/archive modals.
  - Archive disabled when data exists unless archive preserves historical values.
- Outcome Definitions:
  - Grouped by Success, Progress, Buy-in, Suitable.
  - Create/edit/archive active choices.
  - Block archive if active clients currently use that value, or allow archive but keep labels for historical values.
- Churn Reasons:
  - Ordered list with label, category, requires notes, counts as churn, status.
  - Used by status/offboarding modal.

### Company Settings Tab Layout

Recommended sections:

- Feature & Tier:
  - SuperAdmin-only subscription tier and locked product flags.
  - Director-visible flags where useful.
- Notifications:
  - Renewal, next contact, paused return, task due, and status-change settings.
  - Channel/audience controls.
- Client Views:
  - Default list/card/calendar mode, default sort, visible columns, calendar event types.
- Dashboard:
  - Default tab, visible KPIs/charts, profile upkeep freshness window and required fields.
- Integrations:
  - Zapier client create toggle, embed enablement, call AI enablement.

## Edge Functions

Prefer one company-configuration Edge Function for V1, matching the existing `manage-company-member` and `manage-company-pathway` pattern.

### `manage-company-customization`

Actions:

- `upsert_custom_field`
- `archive_custom_field`
- `upsert_outcome_definition`
- `archive_outcome_definition`
- `upsert_churn_reason`
- `archive_churn_reason`

Authorization:

- Require Supabase bearer token.
- Resolve user email from `auth.getUser`.
- SuperAdmin allowlist can manage any pilot/migrated company.
- Active Director can manage their company only.
- Reject mirror-only companies for writes.
- Support/CSM/Viewer cannot manage definitions.

Validation:

- Company must be `migration_status in ('pilot', 'migrated')`.
- `key` should be lowercase slug, unique per company, not a reserved built-in client column unless explicitly mapped.
- Field `options` required for `single_select`/`multi_select`.
- Outcome values should be lowercase slugs and unique within `(company_id, outcome_type)`.
- Prevent archiving definitions/reasons/outcomes when active client rows use them unless the UI and reporting can still resolve archived labels.
- Validate position as integer and normalize empty optional text to null.

Audit:

- Write `app_audit_events` for every create/update/archive with `before_data`, `after_data`, `entity_table`, and clear event types such as:
  - `company_custom_field_created`
  - `company_custom_field_updated`
  - `company_custom_field_archived`
  - `company_outcome_definition_updated`
  - `company_churn_reason_archived`

### `manage-company-settings`

Can be separate or added after customization definitions.

Actions:

- `update_company_settings`
- `update_notification_settings`
- `update_client_view_preferences`
- `update_dashboard_preferences`
- `update_feature_flags`

Authorization:

- Directors can update operational settings and preferences.
- SuperAdmins can update all fields, including subscription/tier/locked flags.
- Reject writes to locked flags unless SuperAdmin.

Audit:

- Write `app_audit_events` with `source = 'company_settings_admin'`.

### Client Value Writes

Custom field values should not be written by the definition-management function.

Future options:

- Extend `manage-client-profile` to accept `customFields` and validate against `company_custom_field_definitions`.
- Or create `manage-client-custom-fields` if the value editor becomes its own workflow.

CSMs should only write custom field values for assigned clients when `is_editable_by_csm = true`; Directors/Support/SuperAdmins can write company client values according to existing client edit permissions.

## Validation, History, Audit, And RLS

Validation principles:

- Definitions/settings are company-scoped and must never be looked up by legacy company id alone after company resolution.
- Store stable slugs/values on client rows; use definitions for labels, ordering, and colors.
- Keep archived definitions available for historical label resolution.
- New custom field values must match field type and allowed options.
- Do not allow deleting definitions in V1; use archive.

History behavior:

- Definition/settings changes belong in `app_audit_events`, not `client_history_events`.
- Client custom field value changes should write both:
  - `client_history_events` with event type `client_custom_fields_updated`.
  - `app_audit_events` with before/after value payload.
- Outcome value changes already write `client_history_events` and audit. Once company definitions exist, `manage-client-outcomes` should validate against active `company_outcome_definitions` instead of hard-coded sets.
- Status/offboarding should write selected churn reason value/label in history payload once `company_churn_reasons` exists.

RLS/security notes:

- Do not use broad `to authenticated using (true)` policies for new customization tables.
- Short-term safest pattern: no direct anon/auth writes; writes only through Edge Functions with service role.
- Reads should be company-scoped:
  - SuperAdmin can read all company config.
  - Active company members can read their company config.
  - CSM/Viewer reads are allowed for definitions needed to render their assigned/company views.
- If direct frontend reads are needed before robust RLS helper functions exist, use a read-only Edge Function or RPC that returns config only after resolving account access.
- Revisit existing broad read policies before broad migration. They are acceptable pilot shortcuts but risky for multi-company production.
- Never expose notification channel secrets or integration tokens in frontend reads; store those in Supabase secrets or server-only metadata.

## Smallest Valuable Implementation Slice For Next Session

Build the minimum company customization source of truth that removes mirrored outcome dependency and gives the Admin Hub a real Customization tab.

Recommended slice:

1. Add migration for:
   - `company_outcome_definitions`
   - `company_churn_reasons`
   - optional `company_settings` with only `profile_upkeep_freshness_days`, `default_client_view`, `default_calendar_mode`, `enable_secondary_assignee`, and `enable_call_ai_for_csms`
2. Seed pilot/migrated companies:
   - Outcomes from filtered `backup_choices`.
   - Churn reasons from distinct non-empty `clients.churn_reason_value` and/or `backup_company_clients.churn_reason_value`, plus a small default set if none exist.
   - Settings from existing `companies` fields.
3. Add `manage-company-customization` with:
   - Upsert/archive outcome definitions.
   - Upsert/archive churn reasons.
   - SuperAdmin/Director authorization only.
   - Audit events.
4. Update `SaasClientDetail.tsx` Customization tab:
   - Load app-owned outcomes/churn reasons for pilot/migrated companies.
   - Fall back to read-only `backup_choices` for mirror-only companies.
   - Allow SuperAdmin/Director create/edit/archive for app-owned companies.
5. Update `manage-client-outcomes` validation:
   - Validate Success/Progress/Buy-in against active `company_outcome_definitions`.
   - Keep current hard-coded defaults as emergency fallback only when no definitions exist.
6. Update Client Detail/Quick Update outcome choice loading:
   - Prefer `company_outcome_definitions` for pilot/migrated companies.
   - Fall back to `backup_choices` for mirror-only or missing config.

Why this slice first:

- Outcomes are already a live write flow and still depend on mirrored choices.
- The UI placeholder already names outcome definitions and churn reasons.
- It is small enough to test with Ethical Scaling without touching client custom field rendering/import/export complexity.
- It establishes the reusable company-config function and audit style for later custom fields/settings.

Defer from next slice:

- Full custom field value editor.
- Notification delivery.
- Dashboard preference application.
- Client list visible-column editor.
- Tier enforcement beyond current `companies.subscription_tier` and metadata/flags.

## QA Checklist

Database/migration:

- Migration applies cleanly to local/remote Supabase.
- Tables have indexes on `company_id`, definition type/status, and unique constraints.
- Seed inserts Ethical Scaling outcome definitions without `offtrack`.
- Seed is idempotent and does not overwrite edited app-owned definitions on rerun.
- Mirror-only companies remain untouched except as read fallback.

Authorization:

- SuperAdmin can manage any pilot/migrated company config.
- Ethical Scaling Director can manage Ethical Scaling config from Admin Hub.
- Director cannot manage another company by changing request payload ids.
- Support, CSM, Viewer cannot manage definitions/settings.
- Mirror-only company write attempts return a clear locked/read-only error.

UI:

- Customization tab loads app-owned rows for Ethical Scaling.
- Customization tab displays mirror fallback read-only for mirror-only companies.
- Create/edit/archive flows show server errors, refresh data, and preserve tab state.
- Archived definitions are hidden from active selectors but can still resolve labels in history/reporting if needed.
- Outcome selectors in Quick Update and Client Detail use app-owned labels/order after migration.

Client flows:

- Existing outcome edits still save for Ethical Scaling.
- Invalid/stale outcome values are rejected with specific error copy.
- Client History still records `client_outcomes_updated`.
- Audit events capture definition changes and outcome edits.
- Offboarding/status flow can continue with typed reasons before churn reason selector is wired.

Regression:

- `npm run build` passes.
- Existing Clients, Client Detail, Dashboard, CSM Reports, Tasks, Team, and Pathways pages still load.
- Dashboard charts and filters still handle existing stored outcome values.
- No app-owned writes touch `backup_*`.

## Migration Risks

- Existing broad authenticated read policies could expose cross-company config once more companies are migrated. New tables should not copy that pattern without scoped policies or read functions.
- Outcome values are currently stored as simple strings on `clients`; changing labels is safe, but changing values can break historical filters/reporting unless aliases or migration rules exist.
- Archiving outcome definitions used by active clients can make filters/charts confusing. V1 should block archive when active usage exists or retain archived definitions for display.
- `backup_choices` may contain stale or global choices that should not become company defaults for every tenant. Seed only known relevant types and filter invalid values.
- `companies.enable_secondary_assignee` and a future `company_settings.enable_secondary_assignee` can drift. Pick one read source during implementation and document sync behavior.
- Client list preferences currently live in browser storage. Introducing company defaults must not wipe personal/local state unexpectedly.
- Notification settings can imply delivery guarantees. Do not expose notification UI as "live" until a scheduler/delivery path exists.
- Custom fields can affect imports, exports, reporting, and client profile edit permissions. Keep definition CRUD separate from value editing until validation and history rules are ready.
- Mirror-only fallback must remain read-only, or users may assume configuration changes apply to Glide-backed companies.
