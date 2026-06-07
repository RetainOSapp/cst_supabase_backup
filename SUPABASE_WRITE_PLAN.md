# RetainOS Supabase Write Plan

Session 1 planning artifact. This file captures the first practical path from the current read-only Glide mirror into a Supabase-native RetainOS app.

## Guiding Decision

RetainOS should not write business data back into `backup_*` tables.

The `backup_*` tables should remain the read-only Glide mirror and migration/reference source. New RetainOS writes should go into app-owned tables with clear ownership, RLS, audit history, and optional `legacy_glide_row_id` links back to the mirrored rows.

## Current State

- The app reads real data from Supabase `backup_*` tables.
- Auth and hierarchy are working:
  - SuperAdmin is email allowlist based.
  - Company users resolve from `backup_company_team`.
  - Roles map from `role_id` and `role_read_only_user`.
- Business data writes are still locked/read-only.
- First internal pilot should be Ethical Scaling because Jay controls it and the risk is low.

## Table Naming Recommendation

Use app-owned tables without the `backup_` prefix.

Recommended prefix style:

- `companies`
- `company_members`
- `clients`
- `client_contracts`
- `client_tasks`
- `client_history_events`
- `offers`
- `offer_milestones`
- `client_milestones`
- `groups`
- `group_clients`

Each migrated table should include:

- `id uuid primary key default gen_random_uuid()`
- `company_id uuid/text depending on company migration choice`
- `legacy_glide_row_id text null`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`
- `created_by uuid null`
- `updated_by uuid null`
- `archived_at timestamptz null`

## ID Strategy

Short term:

- Keep mirrored Glide IDs in use for read-only routes.
- Add `legacy_glide_row_id` to app-owned rows so migrated data can reconcile against the mirror.
- Use RetainOS UUIDs for new writes.

Medium term:

- Route app-owned screens by UUID once a company is migrated.
- Keep read-only mirror routes available only for debugging/admin comparison.

Open decision:

- Whether `companies.id` should be a UUID only, or whether the current Glide company ID remains the stable external `company_public_id` used for Zapier/webhooks.

Recommendation:

- Use UUID as internal primary key.
- Add `public_company_id text unique not null` for Zapier/setup copy-paste.
- Store `legacy_glide_row_id text unique null` for migration reconciliation.

## Phase 1 App-Owned Schema

These tables are needed before enabling meaningful writes.

### Companies

Purpose: SaaS account / company tenant.

Fields:

- `id`
- `public_company_id`
- `legacy_glide_row_id`
- `name`
- `status` (`active`, `paused`, `archived`)
- `subscription_tier` (`starter`, `growth`, `pro_enterprise_dfy`)
- `logo_url`
- `enable_secondary_assignee`
- `enable_call_ai_for_csms`
- `view_override`
- `created_at`, `updated_at`, `archived_at`

First writes:

- Create SaaS Client.
- Edit SaaS Client.
- Pause/archive SaaS Client.
- Copy `public_company_id` for integrations.

### Company Members

Purpose: company users and role access.

Fields:

- `id`
- `company_id`
- `legacy_glide_row_id`
- `auth_user_id`
- `email`
- `name`
- `photo_url`
- `role` (`director`, `support`, `csm`, `viewer`)
- `is_read_only`
- `hide_from_csm_list`
- `capacity_number`
- `status` (`active`, `archived`)
- `created_at`, `updated_at`, `archived_at`

First writes:

- Create team member.
- Edit role.
- Edit capacity.
- Archive/remove access.

Important behavior:

- SuperAdmins are not company members by default.
- SuperAdmin access remains global allowlist/application-level access.
- A team member email should not have multiple active company memberships until multi-company access is intentionally designed.

### Company Settings

Purpose: keep company configuration out of one huge `companies` row.

Possible tables:

- `company_settings`
- `company_custom_fields`
- `company_outcome_definitions`
- `company_churn_reasons`
- `company_notification_settings`
- `company_client_list_columns`

First writes:

- Custom fields.
- Outcome definitions.
- Churn reasons.
- Notification settings.
- Client list column customization.

AI prompts should not be the first company customization write because AI is post-live.

## Phase 2 Client Lifecycle Schema

These tables support the first real fulfillment workflow.

### Clients

Purpose: client profile owned by a company.

Fields:

- `id`
- `company_id`
- `legacy_glide_row_id`
- `name`
- `email`
- `image_url`
- `status` (`front_end`, `back_end`, `paused`, `suspended`, `offboarded`, or mapped canonical enum)
- `date_onboarded`
- `date_offboarded`
- `primary_csm_member_id`
- `secondary_csm_member_id`
- `current_offer_id`
- `current_milestone_id`
- `north_star`
- `next_steps`
- `director_notes`
- `last_contact_at`
- `next_contact_at`
- `progress_status`
- `buy_in_status`
- `ar_status`
- `profile_updated_score`
- `created_at`, `updated_at`, `archived_at`

First writes:

- Create client.
- Edit client general info.
- Assign CSM/secondary CSM.
- Update status/program.
- Quick Update.
- Offboard/archive client.

Pilot note:

- The first implemented client write is intentionally narrower than full client CRUD.
- `client_history_events` stores Quick Update history for pilot/migrated companies.
- `clients` now stores Ethical Scaling pilot client current state, backfilled from `backup_company_clients`.
- `manage-client-quick-update` writes the history event, updates the app-owned `clients` current row, and writes an audit event without mutating `backup_company_clients`.
- `manage-client-profile` enables the first client profile edit flow for pilot/migrated companies. SuperAdmins can edit globally, Directors and Support can edit company clients, CSMs can edit assigned clients only, and Viewers remain read-only.
- Client profile edit v1 covers client name, business name, email, archetype, and North Star. Director Notes is limited to SuperAdmin/Director because Support/CSM users should not manage that field yet.
- `manage-client-create` enables New Client v1 for pilot/migrated companies. SuperAdmins, Directors, Support, and CSMs can create clients; CSM-created clients are automatically assigned to that CSM. New client creation writes only to app-owned `clients`, `client_history_events`, and `app_audit_events`.
- `manage-client-status` enables Client Status Lifecycle v1 for pilot/migrated companies. SuperAdmins, Directors, and Support can change company client status; CSMs can change assigned clients only. The flow uses existing program statuses only (`front-end`, `back-end`, `paused`, `suspended`, `off-boarded`), requires typed reasons for Paused/Suspended/Offboarded, requires a return date for Paused, extends app-owned contract dates for approved pauses, and writes history/audit events without mutating `backup_company_clients`.
- Later client write phases should broaden this pattern into full client CRUD and richer field-specific audit events once `clients` becomes source of truth for more companies.

### Client Contracts

Purpose: contract history and renewal tracking.

Fields:

- `id`
- `company_id`
- `client_id`
- `legacy_glide_row_id`
- `start_date`
- `end_date`
- `contract_days`
- `monthly_value`
- `total_contract_value`
- `reference_link`
- `notes`
- `auto_renew`
- `status`
- `created_at`, `updated_at`, `archived_at`

First writes:

- Create current contract.
- Preserve older contracts.
- Calculate renewal/upcoming expiration views.

Pilot note:

- `client_contracts` now exists as the app-owned contract table for pilot/migrated companies.
- `manage-client-contract` enables New Contract v1 for app-owned clients. SuperAdmins, Directors, and Support can create contracts for company clients; CSMs can create contracts for assigned clients only.
- The flow creates a `client_contracts` row, updates the app-owned `clients` current contract summary, writes `contract_created` history/audit events, and does not mutate `backup_company_clients_contracts`.
- Contract edit/delete/archive and broader LTV reporting remain later phases.

### Offers And Milestones

Purpose: company-specific client journey definitions.

Tables:

- `offers`
- `offer_milestones`
- `client_milestones`

Offer fields:

- `id`
- `company_id`
- `legacy_glide_row_id`
- `name`
- `status`

Offer milestone fields:

- `id`
- `company_id`
- `offer_id`
- `legacy_glide_row_id`
- `name`
- `position`
- `target_days_to_complete`
- `is_ttv_milestone`
- `is_final_milestone`

Client milestone fields:

- `id`
- `company_id`
- `client_id`
- `offer_id`
- `offer_milestone_id`
- `started_at`
- `completed_at`
- `duration_days`
- `time_to_hit_days`

Pilot note:

- `client_milestones` now exists as the app-owned client progress table for pilot/migrated companies.
- `manage-client-milestone` enables Pathways & Milestones v1 for app-owned clients.
- Company offer and milestone templates use app-owned `company_offers` and `company_offer_milestones` for pilot/migrated companies.
- Migration `20260606170000_company_pathways_milestones_pilot.sql` seeds the initial app-owned configuration from the Glide mirror without mutating `backup_*`.
- `manage-company-pathway` enables controlled create/edit/archive actions for Directors and SuperAdmins.
- Mirror-only companies continue reading `backup_company_offers` and `backup_company_offer_milestones` as a read-only fallback.
- SuperAdmins and Directors can change a client's current offer/pathway and milestone.
- Assigned CSMs can start and complete milestones for their assigned clients only.
- Support does not write milestones in v1.
- Completing a milestone advances the client to the next configured milestone in the current offer when one exists.
- Date defaults use the click date, with UI overrides for start and completion dates.
- Duration is calculated from milestone start to completion when both dates exist; time-to-hit is calculated from client onboarded date to completion date.
- Client Detail should display only the milestone timeline for the client's current offer/pathway. It can load broader company milestone data for id-to-name lookup, but unrelated offer milestones should not render in the client workflow.
- Current offer and milestone values must resolve by configured name, not raw Glide ids, including immediately after auto-advance.
- Primary offer behavior is validated enough for the Ethical Scaling pilot, but UX should later be rebuilt to match the shared low-fi pathway/milestone flow.
- Secondary offer/milestone fields are intentionally deferred until primary offer behavior has more pilot usage.
- Quick Update milestone-progress editing remains a later v2 item. It is a common CSM workflow in Glide and should be added using the proper low-fi flow, not jammed into the current narrow Quick Update modal.
- `status`

First writes:

- `[v1 pilot]` Configure offers/milestones at company level.
- `[v1 pilot]` Update a client's milestone progress.
- `[v1 pilot]` Track time spent in each milestone.

### Client Tasks

Purpose: company-level and client-linked tasks.

Fields:

- `id`
- `company_id`
- `client_id null`
- `legacy_glide_row_id`
- `title`
- `description`
- `due_at`
- `started_at`
- `completed_at`
- `assigned_to_member_id`
- `created_by_member_id`
- `priority`
- `status`
- `external_link`
- `is_recurring`
- `recurring_weekday`
- `dismissed_at`
- `read_at`
- `archived_at`
- `created_at`, `updated_at`

Important behavior:

- `client_id` is nullable.
- Top-level Tasks must support company-level tasks.
- Client Detail shows only tasks linked to that client.

### Client History Events

Purpose: audit trail and CSM compliance.

Fields:

- `id`
- `company_id`
- `client_id`
- `actor_auth_user_id`
- `actor_member_id`
- `event_type`
- `source` (`manual`, `quick_update`, `task`, `contract`, `call_ai`, `import`, `zapier`)
- `title`
- `summary`
- `before_data jsonb`
- `after_data jsonb`
- `metadata jsonb`
- `created_at`

First events:

- Client created.
- Client edited.
- Quick Update submitted.
- Contract created/edited.
- Task created/completed.
- CSM assignment changed.
- Status/progress/buy-in changed.
- Offboarded/paused/suspended.

## Phase 3 Operations Schema

### Groups

Priority note:

- As of 2026-06-03, Groups are intentionally late-stage and should not block the Ethical Scaling pilot or early client migrations.
- Build Groups after migration-critical reporting, client contact calendar, and profile upkeep scoring are further along.

Tables:

- `groups`
- `group_clients`

Purpose:

- Support group/cohort management.
- Allow groups to contain many clients.
- Allow clients to belong to multiple groups if needed.

### CSM Reports

Recommendation:

- Prefer Supabase views/RPCs over permanent helper tables.
- Source from `clients`, `client_history_events`, `client_tasks`, and `company_members`.

Pilot note:

- CSM Reports v1 is implemented as `/csm-reports`.
- V1 uses app-owned `clients` and `client_history_events` for pilot/migrated companies and falls back to mirrored client roster data for mirror-only companies.
- Updated vs non-updated definition: a client is updated when it has at least one RetainOS `client_history_events` row in the selected date range.
- Compliance grouping is by assigned primary CSM, not by event actor. This can be revised later if product wants an “actions by user” report.
- Date filters include Today, last 7, 14, 30 days, and custom start/end dates.
- QA cleanup on 2026-06-02 aligned CSM Reports with pilot rules:
  - only active clients (`front-end`, `back-end`) count toward report rows and update-rate denominator.
  - only active team members who manage clients appear in CSM dropdowns/summary.
  - archived, read-only, and hidden-from-CSM-list members are excluded.
  - client rows sort by client, CSM, status, and updated status.

Needed views/RPCs:

- updated vs non-updated profiles.
- latest client update per client.
- CSM progress/buy-in breakdowns.
- workload/capacity.

### Dashboard Canonical Reporting

Recommendation:

- Move dashboard calculations out of client-side fallbacks and into SQL views/RPCs.
- All report/PDF/export work should consume the same canonical views.
- Use `DASHBOARD_FORMULA_VALIDATION.md` as the current formula definition and QA checklist before applying canonical RPC migrations.
- Use `DASHBOARD_CANONICAL_RPC_DRAFT.sql` as the starting point for the first reviewed/applied dashboard KPI RPC migration.

Pilot note:

- Dashboard Charts now read from app-owned `clients` for pilot/migrated companies and mirrored `backup_company_clients` for mirror-only companies.
- Program filtering supports multiple selected statuses. Current KPI RPCs accept only one program, so multi-program and offer-filtered cases use a client-side fallback until canonical RPCs are expanded.
- Program Distribution, Buy-in, Progress, and Clients By Offer support client-list drilldowns.
- CSM Active Client Workload counts active clients by active client-managing CSM.
- CSM Capacity displays active clients against configured `capacity_number`; blank capacity remains `Not set`.
- Profile Upkeep Score v1 is currently calculated in `src/pages/Dashboard.tsx` from filtered active clients, recent app-owned `client_history_events`, and current client date fields. This should move into canonical SQL/RPC once the formula is QA-approved.

Needed views/RPCs:

- `dashboard_kpi_counts_canonical` for active/front-end/back-end/paused/suspended/offboarded, churn, retention, renewal, and visible-client totals.
- `dashboard_clients_list_canonical` for KPI/chart drilldowns.
- `dashboard_chart_breakdown_canonical` for program, offer, buy-in, and progress breakdowns.
- `dashboard_profile_upkeep_canonical` for active-client upkeep score, per-field freshness, and drilldown rows.
- `dashboard_csm_workload_capacity_canonical` for active client-manager workload and configured capacity.
- Updated vs non-updated profiles can share the same source rules as CSM Reports, with `client_history_events` as the v1 event source.

## Post-Live AI Schema

AI is intentionally post-live for the first 2-3 migrated companies.

Tables:

- `global_ai_prompts`
- `company_ai_prompts`
- `calls`
- `call_analyses`
- `call_comments`

Rules:

- Fixed/global prompts are SuperAdmin-only.
- Directors cannot edit prompts.
- Company-specific prompts are Pro/Enterprise only.
- Company-specific prompts are requested by client and built by CST Dev Team.
- Limit to one custom prompt per company until scope changes.

## RLS And Write Enforcement

Do not trust frontend role checks for writes.

Use one of these patterns:

1. RLS policies plus helper functions that resolve the current user's role/membership.
2. Supabase Edge Functions for sensitive writes with service role and explicit authorization checks.
3. Hybrid:
   - Direct Supabase writes for simple user-owned operations after RLS is proven.
   - Edge Functions for admin writes, imports, Zapier, bulk upload, and AI.

Recommendation:

- Start write mode through Edge Functions for the first controlled flows.
- Add RLS before opening broad direct writes.

Required authorization rules:

- SuperAdmin can manage SaaS Clients and View As companies.
- Director can manage their company settings/team/clients.
- Support can operate company workflows if confirmed, but not AI Insights/prompt management.
- CSM can operate assigned clients/tasks only.
- Viewer is read-only.
- Unknown emails have no access.

## First Write Flow Recommendation

Start with Company Members before Client writes.

Why:

- It is lower risk than client lifecycle data.
- It validates company scoping, roles, member capacity, and audit history.
- It supports every later workflow: client assignment, tasks, CSM reports, notifications.

Implementation sequence:

1. `[x]` Create app-owned `companies` and `company_members`.
2. `[x]` Backfill Ethical Scaling and a small set of members from `backup_companies` / `backup_company_team`.
3. `[~]` Build an Edge Function for member create/update/archive.
4. `[x]` Update SaaS Client Detail Team tab to prefer app-owned members when company is migrated.
5. `[x]` Keep mirrored backup team rows as fallback for non-migrated companies.
6. `[~]` Add audit/history event for member changes.

Current implementation:

- `supabase/functions/manage-company-member` is the first controlled write path.
- It supports create, update, and archive for app-owned `pilot`/`migrated` companies only.
- It authorizes SuperAdmins and active company Directors.
- Non-pilot companies stay read-only through the Glide mirror fallback.

## Pilot Strategy

Use Ethical Scaling first.

Pilot implementation artifacts:

- `supabase/migrations/20260529120000_write_mode_pilot_foundation.sql`
- `scripts/seed-ethical-scaling-pilot.mjs`
- `scripts/qa-ethical-scaling-pilot.mjs`
- `QA_WRITE_MODE_PILOT.md`

Pilot stages:

1. Internal controlled pilot: Ethical Scaling.
2. Low-volume external SaaS Client.
3. Normal/medium-volume SaaS Client.
4. Broader migration.

Ethical Scaling pilot should include:

- One Director.
- One Support.
- One CSM.
- A small client set.
- A few contracts.
- A few tasks.
- One offer/pathway with milestones.

Pilot success criteria:

- Roles resolve correctly.
- Production login works through `https://retainos.ai`, with Supabase Auth redirect URLs configured for that domain.
- OTP/PIN emails are delivered through a verified RetainOS custom SMTP sender instead of Supabase's low-limit built-in sender.
- Team write flow works.
- Client create/edit works.
- Contracts and tasks write correctly.
- Quick Update writes to app-owned history and app-owned current client state for the Ethical Scaling pilot; later canonical client CRUD can build on this pattern.
- Dashboard and CSM Reports reflect updates.
- No writes touch `backup_*` tables.
- Glide and RetainOS can be reconciled during parallel run.

Pilot marker cleanup:

- `migration_status = 'pilot'` is temporary.
- When a pilot company is validated, change it to `migration_status = 'migrated'`.
- Keep non-migrated companies at `migration_status = 'mirror_only'`.
- Before broader rollout, generalize Ethical Scaling scripts to accept a company identifier.
- Remove UI assumptions that special-case Ethical Scaling.

## Required Company-By-Company Reconciliation Gate

Every Glide company must pass a read-only reconciliation report before its
`migration_status` changes from `mirror_only` to `pilot`, and again before it
changes from `pilot` to `migrated`.

Run:

```bash
npm run pilot:reconcile:company -- --company="Company Name"
```

The report must be reviewed for:

- Mirrored versus app-owned client counts.
- Missing app-owned clients and unexpected app-only clients.
- Program/status distribution differences.
- CSM assignment integrity, especially active clients assigned to archived or
  hidden team members.
- Offer, milestone, contract, and outcome current-state differences.
- App-owned contracts, milestones, history events, and audit events.
- Company team roles, active/archived status, and assignment identifiers.

Expected differences caused by validated RetainOS pilot writes are acceptable
and must be documented. Unexpected differences block migration until resolved.
The report is read-only and must never update `backup_*` or app-owned tables.

Ethical Scaling checkpoint:

- On 2026-06-06, `npm run pilot:reconcile:ethical-scaling` returned
  `rolloutGate.readyForPilot = true` with no blockers.
- Confirmed 154 mirrored clients and 154 app-owned clients, with no missing or
  unexpected client rows.
- On 2026-06-07, after a final Ethical Scaling backup sync and Supabase
  compute recovery, reconciliation found five mirrored clients missing from the
  app-owned `clients` table.
- `scripts/seed-ethical-scaling-clients-pilot.mjs --missing-only --apply`
  inserted only the missing app-owned rows and preserved existing pilot edits.
- The follow-up reconciliation returned `rolloutGate.readyForPilot = true` with
  159 mirrored clients and 159 app-owned clients.
- After that clean gate, the first backup dependency reduction pass moved
  login provisioning, browser account resolution, and CSM/team dropdowns for
  pilot/migrated companies to prefer app-owned `company_members`. Mirror team
  reads remain only as fallback for mirror-only companies.
- Confirmed zero invalid active CSM assignments and zero active clients with
  missing app-owned offer/milestone configuration.
- Non-blocking documented differences:
  - Invalid CSM assignments exist only on offboarded clients.
  - Archived pilot/test app-owned offer and milestone rows exist.
  - Historical mirrored contracts and client milestone records are not fully
    backfilled app-side yet; pilot writes are app-owned from this point forward.

## Open Decisions

- Internal company UUID plus public company ID versus keeping Glide company ID as the primary visible ID.
- Exact canonical program/status enum mapping.
- Whether Support can access Admin Hub/team/settings or only operational areas.
- Whether SuperAdmin/Director/Support task views should remain company-wide or only related/assigned.
- Whether Zapier SaaS company creation is still needed before launch, or only Zapier client creation.
- Which first external company should follow Ethical Scaling.
