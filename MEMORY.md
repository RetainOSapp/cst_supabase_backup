# Project Memory

This file is the fast session-start router for RetainOS. It should stay short.
Feature status belongs in `ROADMAP.md`; historical session logs belong in
`MEMORY_ARCHIVE.md`; scoped plans/checklists belong in dedicated `.md` files.

## Start Here

At the start of a session:

1. Read this file.
2. Check `git status --short`.
3. Ask what mode the session is in if it is not obvious: planning, QA, deploy, implementation, or cleanup.
4. Open `ROADMAP.md` only when Jay asks for planning, pending QA, priorities, roadmap status, or "what next?"
5. Open a dedicated scope doc only when the session touches that area.
6. Use `ARCHITECTURE_MAP.md` / Graphify before non-trivial implementation or impact analysis, not as a mandatory startup step. Treat Graphify as orientation only and verify exact behavior with `rg` / source reads.

## Source Of Truth Split

- `MEMORY.md`: hard rules, current operational facts, dirty-work warnings, routing.
- `ROADMAP.md`: shipped/open/planned status, priorities, pending QA, pending deploys.
- `MEMORY_ARCHIVE.md`: full historical session log copied from the old memory file.
- `ARCHITECTURE_MAP.md`: distilled Graphify architecture map.
- Active / reusable scope docs:
  - `SUPABASE_WRITE_PLAN.md`: app-owned write-mode plan.
  - `OFFICIAL_COMPANY_ROLLOUT_CHECKLIST.md`: internal migration runbook.
  - `CLIENT_FACING_MIGRATION_QA_CHECKLIST.md`: customer-facing migration signoff.
  - `CONTRACT_BACKFILL_RENEWAL_PLAN.md`: contract backfill and renewal confidence planning.
  - `DASHBOARD_FORMULA_VALIDATION.md`: dashboard formula validation.
  - `CSV_BULK_IMPORT_EXPORT.md`: CSV import/export behavior.
- Closed / reference scope docs should not be loaded by default. Search them only when relevant:
  - `PATHWAYS_MILESTONES_POLISH_PLAN.md`
  - `RETAINOS_RESOURCES_MIGRATION.md`
  - `MOVES_METHOD_MIGRATION_READINESS.md`
  - `ETHICAL_SCALING_APP_OWNED_AUDIT.md`

## Hard Rules

- Never commit secrets. `.env`, `.env.*`, and `.env.graphify` are local-only.
- `VITE_BEACON_ANTHROPIC_KEY` currently holds a real key.
- Vercel deploys from `main`; anything pushed there is live.
- Use the repo git identity `retainOS <retainOS@users.noreply.github.com>`.
- GitHub auth for this repo should use the `retainOS` account, not `atlas-thebrain`.
- The untracked `old glide project test/` folder is a local Glide/reference copy. Do not commit it unless Jay explicitly asks.
- `backup_*` tables are read-only Glide mirror/reference sources. New RetainOS writes go to app-owned tables.
- Do not reopen closed V1 roadmap work unless Jay finds a real regression. New improvements become V2/polish items.

## Current Dirty Work / Commit Warnings

There may be intentional uncommitted local work. Before staging/committing, inspect
`git status --short` and compare against this list.

- Beacon local pilot is intentionally uncommitted and must not be committed/deployed as-is:
  - `src/components/Beacon.tsx`
  - `src/lib/beacon/*`
  - Beacon mount/import changes in `src/components/Header.tsx`
  - related `package.json` / `package-lock.json` Anthropic dependency changes
- Beacon v1 uses a browser-direct Anthropic call. Promotion path before commit/rollout:
  - move chat loop into a `beacon-chat` Supabase Edge Function
  - store `ANTHROPIC_API_KEY` as a Supabase secret
  - enforce server-side company/role scoping
  - add a proper `canAccessBeacon` capability before Director/CSM access
- Pathways/Milestones local code/function changes may be uncommitted until Jay asks for commit/deploy.

## Deploy / Environment Notes

- Local dev server usually runs on Vite; use `npm run dev`.
- Build check: `npm run build`.
- Known build warnings currently include Beacon/Anthropic browser externalization and Vite large chunk warning.
- Supabase project ref: `zjauqflzxzsbpnivzsct`.
- Supabase CLI default profile is the RetainOS org. Do not pass `--profile retainos`; that named profile is malformed.
- `prepare-login` must be deployed with JWT verification disabled because public login calls it before a user session exists.

Useful command:

```bash
npx supabase functions deploy prepare-login --project-ref zjauqflzxzsbpnivzsct --no-verify-jwt
```

## Current Operational State

- Ethical Scaling is the controlled pilot / app-owned company.
- Mirror-only companies still read from Glide backup tables.
- Validated migrated/pilot surfaces prefer app-owned tables where built.
- Resources seed migration has been applied; seeded RetainOS resources include published dynamic integration guides and draft rewrite/re-record resources.
- Daily Pulse + notification product polish was QA-approved.
- Clients filter polish was QA-approved.
- Company Pathways & Milestones V1/polish is closed in `ROADMAP.md`; any remaining deploy or future enhancement belongs there, not here.
- Ali/contracts need separate contract-page investigation; track that in `ROADMAP.md` / a contract scope doc.
- Client-facing migration signoff spreadsheet is approved as a v1 template for Moves Method testing; roadmap owns the status.

## Active Routing

For a day-planning question:

1. Read `ROADMAP.md` top sections and active `[priority: high]` / `[priority: medium]` items.
2. Use the `Jay QA Queue` as the only source for active Jay QA asks.
3. If the work touches a specific area, open its scope doc before editing.

For migration work:

1. Start from `OFFICIAL_COMPANY_ROLLOUT_CHECKLIST.md`.
2. Use `CLIENT_FACING_MIGRATION_QA_CHECKLIST.md` for customer signoff.
3. Use company-specific readiness docs when present.
4. Add status/open items to `ROADMAP.md`, not this file.

For historical context:

1. Search `MEMORY_ARCHIVE.md` with `rg`.
2. Promote only durable operational facts back into this file.
3. Put feature status or next work into `ROADMAP.md`.

## Latest Checkpoint - 2026-06-17

- `MEMORY_ARCHIVE.md` was created from the old 1,673-line `MEMORY.md`.
- `MEMORY.md` was reduced to this router format so session startup is faster.
- Keep this file under roughly 300 lines.
- Future session notes should be short. Detailed work logs should go to archive or dedicated scope docs.
- Pathways closure: `npm run build` passed; deployed `manage-company-pathway` and `manage-client-milestone` to Supabase project `zjauqflzxzsbpnivzsct`.
- Commit scope for Pathways closure excludes Beacon local pilot files, `package.json`, `package-lock.json`, `src/components/Header.tsx`, and `old glide project test/`.
- Contract sanity: deployed `manage-client-contract` fix so start date + expected duration days sync a calculated end/filtering date to `clients`; repaired four Ethical Scaling pilot summaries. Ali Back End still has duplicate QA-created contract history rows, which can be tidied later via SuperAdmin delete.
- Roadmap hygiene: Jay QA queue is intentionally tiny; Ethical Scaling pilot/backfill loops are closed; migration plan now reflects Jay-led final sync/cutover instead of long Glide parallel usage.
- Migration cutover packet: `OFFICIAL_COMPANY_ROLLOUT_CHECKLIST.md` now includes command-center flow, no-parallel-run rule, client-facing signoff handoff, and emergency support plan. Moves dry readiness rerun stayed blocked for write migration until final paid sync; current mirror still has 6 active unassigned and 9 active invalid CSM assignments.
- Integration closeout: deployed `zapier-create-client`, `ingest-client-call-summary`, and `webhook-update-client` auth-status fix so revoked/missing company tokens return 401. Live QA with disposable tokens verified client create, duplicate idempotency, unmatched call summary/client update review queue behavior, wrong token type 401, revoked token 401, `last_used_at`, and cleanup.
- Ethical Scaling-only assumptions audit: app-facing pilot copy was generalized, and generic reconcile/backfill scripts now require an explicit company selector instead of silently defaulting to Ethical Scaling. Remaining Ethical Scaling references are intentional historical docs/package aliases and ES-only seed/QA scripts; roadmap owns the remaining `pilot` to `migrated` status decision.
- Role access validation packet: `ROLE_ACCESS_VALIDATION_PACKET.md` maps capability code, route/page gates, server write guards, QA steps, and Jay's applied decisions for Viewer Dashboard, Support Admin Hub, integration review, and role-specific Resources.
- Role access closure: Jay decisions applied. Viewer can access Dashboard read-only without KPI/chart client drilldowns or client-name search; Support stays operational-only; integration review is SuperAdmin/Director only and `manage-integration-review` was deployed; Company Resource drafts are visible to Directors while RetainOS Help drafts remain SuperAdmin-only. `npm run build` passed.
- Dashboard/CSM Reports formula readiness: `DASHBOARD_FORMULA_VALIDATION.md` was rewritten as a migration-day validation packet covering Dashboard KPI formulas, chart/drilldown sources, CSM Reports update-rate/field-upkeep formulas, known weak spots, and Moves Method validation steps. Full formula confidence still waits for a larger migrated company after final sync/backfill.
- Client lifecycle/program closeout: `CLIENT_LIFECYCLE_PROGRAM_CLOSEOUT.md` documents V1 status write behavior, downstream wiring, non-scope items, and Moves Method validation checks. `ROADMAP.md` now queues a bounded Jay QA pass for Paused/Reactivated/Suspended/Offboarded; archive remains separate/future, and downstream reporting/notification confidence remains a Moves Method validation item.
- Client lifecycle QA passed: Jay tested Josh Garvey assigned to Ben and approved the flow. `ROADMAP.md` now marks active/paused/suspended/offboarded lifecycle writes and Client Offboarding flow closed; downstream dashboard/CSM/notification proof still waits for Moves Method migration-day validation.
- Moves migration preflight: 2026-06-18 dry snapshot still shows 4,143 clients, 2,338 active, 6 active unassigned, and 9 active invalid CSM assignments. Added generic `scripts/seed-company-write-mode.mjs`; dry run for Moves passed with no active team email conflicts. DO NOT APPLY until final paid sync and Jay approval.
- Moves temporary Zapier validation rule: optional 3-5 day pre-cutover RetainOS webhook writes are validation-only while Glide stays source of truth. Wipe any temporary Moves app-owned data before final paid sync/backfill.
- Tasks V1.5 local pass: app-owned task edit/status/complete/reopen/dismiss/archive/detail-modal/native-drag behavior is implemented; `task_updated` SQL migration was applied. `manage-client-task` deploy is pending because this shell lacks `/Users/joaogoncalves/.supabase/profile`; deploy from normal authenticated terminal with `npx supabase functions deploy manage-client-task --project-ref zjauqflzxzsbpnivzsct`.
- Tasks V1.5 QA passed: Jay deployed `manage-client-task` and passed company-level creation, client linking/navigation, edit, and drag/drop including `In Progress` after the frontend `in-progress`/`in_progress` normalization fix.
- Task Templates + Urgency V1: `company_task_templates` SQL migration applied. Deployed `manage-company-customization`, `manage-client-create`, and `zapier-create-client`. Admin Hub > Company Settings now manages task templates; New Task can start from manual templates; new client creation/webhook paths auto-create enabled `client_created` template tasks; Tasks shows due soon/today/overdue signals; Daily Pulse now includes a `task_due` section when enabled.
- Task Templates QA follow-up: clarified manual templates as New Task presets, auto-created template tasks now append/render client names, and Tasks list view now mirrors board status groupings with drag/drop. Redeployed `manage-client-create` and `zapier-create-client`.
- Tasks automation/recurring follow-up: deployed `manage-client-task` and `manage-client-profile`. Assigning a primary CSM now claims open unassigned tasks linked to that client. Tasks modal supports recurring tasks with an interval stored in metadata; first completion creates the next occurrence. Board/list status lanes use soft RetainOS palette colors.
- Emily pilot feedback: Client Detail > Program now has an inline Update Next Steps action. It reuses `manage-client-quick-update`, updates the Program Next Steps field, and appends the Quick Update history event. Frontend-only; no function redeploy needed.
- Emily feedback QA fix: Program Next Steps modal now passes `companyLegacyId` to `manage-client-quick-update`; History tab now has Contract / Last Contact / Next Steps / Health Scores filter pills and search.
- Emily final Quick Update / Client Detail polish: Quick Update context cards now have soft hierarchy and no embedded history preview; Client Detail > Program can edit Next Steps, last contact, and next contact together; North Star has an Edit shortcut to the existing profile modal; Outcomes shows current values; Pathway change modal shows current pathway/milestone before edits. Frontend-only; `npm run build` and `npx tsc --noEmit` passed. Jay QA remains open in `ROADMAP.md`.
- Emily final QA follow-up: Outcomes current badges now stay as the saved source of truth while dropdowns default blank/no-change; Pathway change modal includes completion date, start-another-milestone, and green complete-current-milestone controls. Frontend-only; `npm run build` and `npx tsc --noEmit` passed.
- Emily correction: Outcomes preserve-current save now coerces saved labels/values into allowed option values before calling `manage-client-outcomes`; Pathway modal now mirrors the Quick Update `Pathway progress` section layout for current milestone completion. Frontend-only; `npm run build` and `npx tsc --noEmit` passed.
- Emily QA correction: Outcomes now treats blank or same-as-current dropdowns as `No change` so no-op saves are blocked in the UI. Pathway modal always renders the Quick Update-style `Pathway progress` block above pathway reassignment fields, even when the current milestone is already completed. Frontend-only; `npm run build` and `npx tsc --noEmit` passed.
- Outcomes model correction: Outcomes are event-style updates. Current badges show saved value/date, dropdowns allow selecting the same color again, and `manage-client-outcomes` now refreshes the selected outcome date even when the value does not change. Deployed `manage-client-outcomes` to `zjauqflzxzsbpnivzsct`; `npm run build` and `npx tsc --noEmit` passed.
- Emily final QA passed: Jay confirmed Outcomes same-color event updates work and Pathway modal polish is done. `ROADMAP.md` promoted the Emily QA item to `[x]`.

## RetainOS Resources Working With Clients v2 - 2026-06-20

- Added `supabase/migrations/20260620110000_retainos_resources_working_clients_v2_seed.sql` from `RETAINOS_RESOURCES_MIGRATION_v2.md`, seeding the 42 missing Working with Clients entries as RetainOS Help drafts.
- Updated `src/pages/Resources.tsx` categorization to honor `Resource category: Working with Clients` content markers before dashboard/automation inference.
- Applied the SQL via `npm run db:apply:sql -- supabase/migrations/20260620110000_retainos_resources_working_clients_v2_seed.sql`; service-role readback confirmed 43 Working with Clients draft resources including the prior Client Details screen draft.
- `npm run build` passed. Existing Beacon/package/Header dirty work remains unrelated and intentionally uncommitted per current warnings.

## Team Invite Flow Resource Audit - 2026-06-20

- Built local RetainOS invite flow for `How to Invite a Team Member`: `supabase/functions/manage-company-member/index.ts` now provisions/sends login email on create and supports `send_invite`; `src/pages/SaasClientDetail.tsx` shows invite success/error banners and adds Send invite on active team cards.
- Follow-up fix after Send invite returned non-2xx from the stale deployed Edge Function: `src/pages/SaasClientDetail.tsx` now falls back to `prepare-login` + `supabase.auth.signInWithOtp` for the selected member email, so invite delivery works even before `manage-company-member` is redeployed.
- Brand-new user onboarding nuance: invite success messages now include the RetainOS `/login` URL and OTP sends include `emailRedirectTo`; the `invite-team-member` resource was reapplied with login URL guidance.
- Added/applied `supabase/migrations/20260620123000_update_invite_team_member_resource.sql`; service-role readback confirmed `invite-team-member` draft includes RetainOS flow and Send invite copy.
- `npm run build` passed. `deno check` was unavailable in this shell. `npx supabase functions deploy manage-company-member --project-ref zjauqflzxzsbpnivzsct` hung twice, including with escalation, and was interrupted; deploy this function from a normal authenticated terminal before QA.

## Client Offboarding Resource Audit - 2026-06-20

- Upgraded `src/pages/ClientDetail.tsx` status modal for Offboarded: actual end date, contract-end comparison, churn/completed/needs-review classification, company churn reason dropdown with typed fallback, churn notes requirement when churned, and good-fit yes/no capture.
- QA follow-up: `src/pages/ClientDetail.tsx` now writes a roster refresh token after successful status changes, and `src/pages/Clients.tsx` waits for app-owned company detection before loading roster rows. This prevents the Clients page from briefly or persistently showing stale mirrored program statuses until hard refresh.
- Updated/deployed `supabase/functions/manage-client-status/index.ts`; live deploy to project `zjauqflzxzsbpnivzsct` succeeded. The function now computes churn server-side, saves actual offboard date, churn data, offer-fit metadata, and richer history/audit payloads.
- Added/applied `supabase/migrations/20260620133000_update_offboard_client_resource.sql`; service-role readback confirmed `how-to-offboard-a-client` includes actual end date and good-fit guidance.
- `npm run build` passed. `deno check` remains unavailable in this shell. `ROADMAP.md` has a `[qa]` item for Jay to test the richer RetainOS offboarding flow before publishing/re-recording the resource.

## Milestones And Offers Resource Audit - 2026-06-20

- Audited `How to Customize Milestones and Offers`; RetainOS already supports the core flow through Admin Hub / SaaS Client Detail > Pathways & Milestones using `manage-company-pathway`.
- Confirmed create/edit/archive/restore pathways and milestones, move up/down milestone ordering, active-client archive blockers, and mirror-only read-only fallback are live. RetainOS uses safer archive/restore instead of Glide-style delete.
- Added/applied `supabase/migrations/20260620143000_update_customize_milestones_offers_resource.sql`; service-role readback confirmed `customize-milestones-offers` includes Pathways & Milestones, archive guardrails, and reorder guidance.

## Manual Client Creation Resource Audit - 2026-06-20

- Upgraded `src/pages/Clients.tsx` New Client modal with optional profile image URL, next steps, Director Notes for Director/SuperAdmin, and richer initial contract fields: monthly value, contract link, and contract notes.
- Updated/deployed `supabase/functions/manage-client-create/index.ts` to persist those fields into app-owned `clients` and initial `client_contracts`; deploy to project `zjauqflzxzsbpnivzsct` succeeded.
- Added/applied `supabase/migrations/20260620150000_update_add_clients_manually_resource.sql`; service-role readback confirmed `add-clients-manually` includes + New Client, contract details, and after-creation guidance.
- `npm run build` passed after the code changes. RetainOS intentionally handles Slack/folder/supporting links after creation through the client profile links section, and custom fields through Quick Update / Client Detail outcomes instead of inside the create modal.
- Image upload follow-up: added `src/lib/clientImageUpload.ts` and deployed `supabase/functions/upload-client-image/index.ts`; New Client and Client Detail > Edit Profile can now upload JPG/PNG/WEBP/GIF client images up to 5 MB or paste an image URL. Redeployed `manage-client-profile` so profile edits persist `client_image`. Added/applied `20260620152000_update_add_clients_manually_image_upload.sql`.

## Filtering Clients Overview Resource Audit - 2026-06-20

- Upgraded `src/pages/Clients.tsx` filters for the old CST "Filtering Clients (Overview)" use cases: milestone, renewal window, last-contact age, next-contact window, Success, Progress, and Buy-In. List/card/calendar queries now share the same applied filters.
- Corrected the Success filter to use `outcomes_success_value_for_filtering` for both app-owned and mirrored client rows after live schema readback showed `backup_company_clients.outcomes_success_for_filtering` does not exist.
- Added/applied `supabase/migrations/20260620153000_update_filtering_clients_overview_resource.sql`; service-role readback confirmed `filtering-clients-overview` is a draft titled "Filtering clients in RetainOS" with milestone, calendar, Apply filters, and revenue-scope notes.
- `npm run build` passed. Revenue forecast math from the old CST walkthrough remains out of this Clients overview and should be validated under Dashboard / CSM reporting resources.

## Client Full Card Details Resource Audit - 2026-06-20

- Audited the old CST "Client Full Card Details" transcript against current RetainOS Client Detail. No product patch was needed: current RetainOS already has profile edit/image upload, Program next-steps/contact update, Outcomes, Contract, Pathways & Milestones, Client Links, Tasks, History, and richer offboarding/status actions.
- Added/applied `supabase/migrations/20260620154000_update_client_full_card_details_resource.sql`; service-role readback confirmed `client-full-card-details` is now a draft titled "Understanding and updating a client profile" with paired workflow, Client Links, and offboarding notes.
- The same migration lightly cross-links `filtering-clients-overview` to the client profile resource. No app build was run because this slice changed only resource SQL and handoff docs.

## Contact Cadence Resource Merge - 2026-06-20

- Added Last Contact and Next Contact sort options to `src/pages/Clients.tsx` List/Card views. Sorts use `csm_date_of_last_contact` and `csm_date_of_next_contact`; live schema readback confirmed both columns exist on app-owned and mirrored client tables.
- Added/applied `supabase/migrations/20260620155000_merge_contact_cadence_resources.sql`. `using-date-of-last-contact-and-date-of-next-contact-features` is now the canonical draft "Tracking client contact cadence"; `date-of-last-contact-sorting-clients` and `date-of-next-contact` are draft merged pointers.
- `npm run build` passed. The first SQL apply failed because `resources.type = article` violates the table check constraint; migration was corrected to keep pointer rows as `video` and reapplied successfully.

## AI Call Summary Webhook Resource Audit - 2026-06-20

- Audited the old CST/Fathom/Zapier transcript against RetainOS. Core flow was already live: company-scoped token, company ID, summary/notes payload, exact email match, Next Steps update, Last Contact update, history event, intake audit/idempotency, and Integration Review Queue.
- Hardened `supabase/functions/ingest-client-call-summary/index.ts` so payloads can send `client_email` or provider attendee/invitee email lists. RetainOS still only auto-updates when exactly one active app-owned client matches; zero/multiple matches go to review.
- Updated `src/pages/Resources.tsx` Call Summary / Next Steps guide with attendee_emails and optional summary cleanup guidance. Added/applied `supabase/migrations/20260620160000_update_ai_call_summary_resource.sql`; readback confirmed attendee email, review queue, optional cleanup, and Call AI boundary notes.
- `npm run build` passed. Deployed `ingest-client-call-summary` to Supabase project `zjauqflzxzsbpnivzsct`. Smoke test with attendee_emails reached company validation, confirming the new payload shape is accepted by the deployed endpoint.

## Task Management Resource Audit - 2026-06-20

- Audited the old CST "Task Management in RetainOS" transcript against current RetainOS. No product patch was needed: current Tasks already has board/list views, status drag/drop, task detail edit modal, company-level and client-linked tasks, task templates, due urgency, recurring tasks, Daily Pulse visibility, and Client Detail > Tasks.
- Added/applied `supabase/migrations/20260620161000_update_task_management_resource.sql`; service-role readback confirmed `task-management-in-retainos` is a draft with template, recurring, Daily Pulse, mirror-only, and known-later-scope guidance.
- No app build was run because this slice changed only resource SQL and handoff docs. Current later task gaps remain comments, attachments, advanced recurring rules, realtime, and richer notification delivery.

## Quick Update Resource Audit - 2026-06-20

- Audited the old text-only CST "How to Make a Quick Update" notes against current RetainOS. No product patch was needed: Quick Update already supports Next Steps, Notes, Date of Last Contact, Date of Next Contact, Success, Progress, Buy-In, active company custom fields, and current milestone completion/start-next for app-owned pilot/migrated companies.
- Added/applied `supabase/migrations/20260620162000_update_quick_update_resource.sql`; service-role readback confirmed `how-to-make-a-quick-update` is now titled "Making a quick update in RetainOS" and includes pathway progress, offer-change boundary, and call-attendance future-scope guidance.
- No app build was run because this slice changed only resource SQL and handoff docs. Product note: pathway/offer reassignment intentionally remains in Client Detail > Pathways & Milestones rather than Quick Update.

## Redundant Client Details Screen Resource Cleanup - 2026-06-20

- Removed the old `client-details-screen` RetainOS Help draft because the transcript was really about Clients list/detail-card views plus Quick Update context, and those concepts are now covered by Filtering Clients, Quick Update, contact cadence, and the full client profile resource.
- Added/applied `supabase/migrations/20260620163000_remove_redundant_client_details_screen_resource.sql`; service-role readback confirmed zero remaining `client-details-screen` resource rows.
- No app build was run because this slice changed only resource SQL and handoff docs.

## Assign New Clients To CSM Resource Audit - 2026-06-20

- Audited the old CST "Assigning New Clients to a CSM" transcript against RetainOS. The current RetainOS truth is assignment during New Client creation or reassignment from Client Detail > Edit Profile; the old CST-style Director profile notification/new assignment popup is not live and remains later notification scope.
- Added `Unassigned` to the Clients CSM filter in `src/pages/Clients.tsx` so Admin/Director/Support users can find clients that still need a primary CSM. The filter works for app-owned and mirrored client queries.
- Added/applied `supabase/migrations/20260620164000_update_assign_new_clients_csm_resource.sql`; service-role readback confirmed `assign-new-clients-csm` is now titled "Assigning new clients to a CSM in RetainOS" and documents creation assignment, Unassigned filtering, Edit Profile reassignment, task claiming, role limits, and no-popup guidance.
- `npm run build` passed after the Clients filter change.
- Follow-up note: `ROADMAP.md` notification backlog now explicitly tracks a future "Unassigned new client reminder" that should trigger for active/new clients with no Primary CSM and link to Clients filtered by `CSM = Unassigned`.
- Removed the related old CSM-facing assignment acknowledgement draft because it depended entirely on non-live CST popup behavior. Added/applied `supabase/migrations/20260620165000_remove_acknowledge_new_client_assignment_resource.sql`; service-role readback confirmed zero remaining `acknowledging-a-new-client-assigned-to-you-as-a-csm` rows. `ROADMAP.md` now tracks "New client assigned to CSM notification / acknowledgement" as future notification scope.

## Filtering Deep Dive Resource Merge - 2026-06-20

- Audited the old CST "Filtering Clients (Deep Dive)" transcript against the already-upgraded RetainOS Clients filters. No product patch was needed: RetainOS covers CSM, unassigned CSM, status, offer/pathway, milestone, renewals, last contact, next contact, Success, Progress, Buy-In, combined filters, and clear/apply behavior.
- Added `ROADMAP.md` low-priority future feature for renewal forecast / predicted pipeline revenue. Note says Beacon could likely provide the first lightweight version using renewal windows, health signals, CSM, offer/pathway, and contract values before a dedicated UI calculator exists.
- Added/applied `supabase/migrations/20260620170000_merge_filtering_deep_dive_resource.sql`; service-role readback confirmed `filtering-clients-overview` remains the canonical draft "Filtering clients in RetainOS" with deep-dive strategic examples, and `filtering-clients-deep-dive` has zero remaining rows.
- No app build was run because this slice changed only resource SQL and handoff docs.

## Custom Fields Resource And Webhook Audit - 2026-06-20

- Audited the old CST "Custom Fields" walkthrough against RetainOS. RetainOS is stronger than CST for setup and day-to-day usage: app-owned company custom field definitions support typed fields/options/order/archive, and active fields appear in Quick Update plus Client Detail > Outcomes.
- Closed the creation-time webhook gap: `supabase/functions/zapier-create-client/index.ts` now accepts modern `custom_fields` / `customFields` payloads as an object or array, keeps legacy `customfield1..customfield7` compatibility, validates submitted values against active company custom field definitions, writes `client_custom_field_values`, and returns/history/audits custom field changes.
- Updated `src/pages/Resources.tsx` New Client Webhook dynamic guide to show `custom_fields` plus legacy slot parameters.
- Added/applied `supabase/migrations/20260620171000_update_custom_fields_resource.sql`; service-role readback confirmed `custom-fields` is now titled "Custom fields in RetainOS" and includes no-five-slot-limit, webhook, and Quick Update guidance.
- `npm run build` passed. Deployed `zapier-create-client` to Supabase project `zjauqflzxzsbpnivzsct`.

## Contact Cadence Pointer Resource Cleanup - 2026-06-20

- User flagged the third contact-date transcript as repetitive. The conceptual merge had already happened in `20260620155000_merge_contact_cadence_resources.sql`, but the old `date-of-last-contact-sorting-clients` and `date-of-next-contact` drafts still existed as merged pointers.
- Added/applied `supabase/migrations/20260620172000_remove_contact_cadence_pointer_resources.sql`; service-role readback confirmed only `using-date-of-last-contact-and-date-of-next-contact-features` remains, titled "Tracking client contact cadence".
- No app build was run because this slice changed only resource SQL and handoff docs.

## Custom Client Reminders Resource Audit - 2026-06-20

- Audited the old CST "Creating Custom Client Reminders" walkthrough. Pushback decision: do not build a separate reminders object for V1 because RetainOS already covers reminder-style work through client-linked tasks with due dates, due/overdue state, Tasks page visibility, Client Detail > Tasks, Clients reminder bell, and Daily Pulse `task_due`.
- Added/applied `supabase/migrations/20260620173000_update_custom_client_reminders_resource.sql`; service-role readback confirmed `creating-custom-client-reminders` is now titled "Creating client reminders with tasks" and explicitly says Quick Update reminder creation / a separate Reminders panel are not live.
- Updated `ROADMAP.md` task section to capture the product decision and optional future scope: a Quick Update shortcut that creates a client-linked task/reminder.
- No app build was run because this slice changed only resource SQL and handoff docs.

## Multiple Client Emails - 2026-06-20

- Built the RetainOS version of "Managing Multiple Email Addresses per Client": added `client_email_secondary` and `client_email_tertiary` to app-owned `clients` via `supabase/migrations/20260620174000_client_alternate_emails.sql`, including lower-case indexes.
- Updated `src/pages/ClientDetail.tsx` Edit Profile with Email 2 and Email 3 fields. Updated `manage-client-profile` to persist them, `manage-client-create` / `zapier-create-client` to accept creation-time alternate emails, and `src/pages/Resources.tsx` New Client Webhook guide with `client_email_secondary` / `client_email_tertiary`.
- Updated automation matching in `ingest-client-call-summary`, `webhook-update-client`, and `manage-integration-review` so Email, Email 2, and Email 3 can all match integration payloads. Ambiguous matches still go to review rather than auto-applying.
- Added/applied `supabase/migrations/20260620175000_update_multiple_client_emails_resource.sql`; service-role readback confirmed the resource is titled "Managing multiple email addresses per client" and includes Email 2 plus review-safety guidance.
- `npm run build` passed. Applied the schema/resource SQL and deployed `manage-client-profile`, `manage-client-create`, `zapier-create-client`, `ingest-client-call-summary`, `webhook-update-client`, and `manage-integration-review` to Supabase project `zjauqflzxzsbpnivzsct`. Live select confirmed the new columns are queryable.

## Secondary Pathways - 2026-06-20

- Built the RetainOS version of old CST "Adding Secondary Offers" as company-gated Secondary pathway tracking, not a second program lifecycle.
- Added/applied `supabase/migrations/20260620180000_secondary_client_pathways.sql`: `company_settings.enable_secondary_offers`, `companies.enable_secondary_offers`, and app-owned `clients.secondary_offer_milestones_current_offer_id`, `secondary_offer_milestones_current_milestone_id`, `secondary_offer_milestones_current_milestone_change_date` with indexes.
- Updated `src/pages/SaasClientDetail.tsx`, `src/lib/appOwnedData.ts`, and `supabase/functions/manage-company-customization/index.ts` so Company Settings > Feature gates can save the Secondary pathway flag. Deployed `manage-company-customization` to project `zjauqflzxzsbpnivzsct`.
- Updated `supabase/functions/manage-client-milestone/index.ts` with `set_secondary_pathway` and `clear_secondary_pathway`, Director/SuperAdmin-only permissioning, company-setting enforcement, client history events, and app audit events. Deployed `manage-client-milestone` to project `zjauqflzxzsbpnivzsct`.
- Updated `src/pages/ClientDetail.tsx`: Client Detail > Pathways & Milestones now loads the company setting, shows a Secondary Pathway summary when enabled, and the Change Pathway & Milestones modal can set or clear the secondary pathway/milestone.
- Added/applied `supabase/migrations/20260620181000_update_secondary_offers_resource.sql`; because live `resources` had no existing row for this slug, the migration now upserts `adding-secondary-offers` as draft "Adding secondary pathways".
- `npm run build` passed. Live service-role smoke check confirmed secondary pathway columns/settings are queryable and the resource draft exists. `ROADMAP.md` marks this as `[qa]`; Jay still needs to test enable setting, set secondary pathway, clear secondary pathway, and resource wording before publishing/re-recording.

## Secondary Assignee - 2026-06-20

- Completed RetainOS Secondary Assignee support for app-owned pilot/migrated clients. Existing plumbing already included `company_settings.enable_secondary_assignee`, `clients.csm_secondary_assignee_id`, CSM access scoping, Clients/Dashboard filters, and task/milestone/outcome permission checks.
- Updated `src/pages/Clients.tsx`: + New Client now shows Secondary Assignee when the selected company has the feature gate enabled and the actor is not a CSM creating their own assigned client.
- Updated `src/pages/ClientDetail.tsx`: Client Detail > Edit Profile now loads `enable_secondary_assignee` and shows Secondary Assignee beside Primary CSM when the feature gate is enabled.
- Hardened `supabase/functions/manage-client-create/index.ts` and `supabase/functions/manage-client-profile/index.ts`: Secondary Assignee is accepted only when company settings enable it, must be an active visible company member, and cannot equal the Primary CSM. Deployed both functions to Supabase project `zjauqflzxzsbpnivzsct`.
- Added/applied `supabase/migrations/20260620182000_secondary_assignee_resource.sql`, creating the `adding-secondary-assignee` RetainOS Help draft.
- `npm run build` passed. Live service-role smoke check confirmed `adding-secondary-assignee` exists and `clients.csm_secondary_assignee_id` / `company_settings.enable_secondary_assignee` are queryable. `ROADMAP.md` marks this as `[qa]`; Jay should test enable setting, create client with secondary assignee, edit/clear secondary assignee, and CSM visibility as secondary assignee.
- QA correction: Jay found New Client did not respect the newly enabled Secondary Assignee while existing Client Detail did. Root cause was `src/pages/Clients.tsx` loading `enable_secondary_assignee` from `backup_companies` only; patched it to merge app-owned `companies.enable_secondary_assignee` for pilot/migrated companies before gating the New Client modal. Frontend-only; `npm run build` passed.

## Archetypes In Client Views - 2026-06-21

- Built the RetainOS version of old CST "Archetypes — In Client Views" as a company-gated roster signal. Archetype editing already existed in + New Client and Client Detail > Edit Profile through `client_archetype_value`.
- Added/applied `supabase/migrations/20260621100000_archetypes_in_client_views.sql`: `company_settings.enable_archetypes` and `companies.enable_archetypes`.
- Updated `src/pages/SaasClientDetail.tsx` and `supabase/functions/manage-company-customization/index.ts`: Company Settings > Feature gates now has `Client archetypes`, saves to `company_settings`, and mirrors the flag onto `companies`. Deployed `manage-company-customization` to Supabase project `zjauqflzxzsbpnivzsct`.
- Updated `src/pages/Clients.tsx`: pilot/migrated companies merge app-owned `enable_archetypes`; List view shows an Archetype column when enabled; Card view shows Archetype as a compact meta row when enabled.
- Updated `src/lib/appOwnedData.ts` so shared company loading includes `enable_archetypes`.
- Added/applied `supabase/migrations/20260621101000_update_archetypes_client_views_resource.sql`, refreshing `archetypes-in-client-views` as a RetainOS Help draft.
- `npm run build` passed. Live service-role smoke check confirmed `company_settings.enable_archetypes`, `companies.enable_archetypes`, and the `archetypes-in-client-views` resource draft are queryable. `ROADMAP.md` marks this as `[qa]`; Jay should enable Client archetypes, verify List/Card display, edit a client archetype, and confirm roster updates.
- QA correction: Archetype is now a controlled dropdown in + New Client and Client Detail > Edit Profile with only Doer, Controller, Worrier, and Follower. `manage-client-create`, `manage-client-profile`, and `zapier-create-client` normalize accepted values to those Title Case labels and reject invalid values; all three functions were deployed to `zjauqflzxzsbpnivzsct`.
- Added/applied `supabase/migrations/20260621102000_normalize_client_archetypes.sql` and `20260621103000_update_archetype_dropdown_resource.sql`. Live readback for Ethical Scaling confirmed `Doer: 31`, `Controller: 26`, `Worrier: 6`, `Follower: 27`, blank `70`, and `0` lowercase archetype values. The resource draft now documents the controlled dropdown.
- Updated `scripts/seed-ethical-scaling-clients-pilot.mjs` and generic `scripts/seed-company-write-mode.mjs` so future app-owned company migrations normalize legacy Glide archetypes to the same dropdown labels.

## How To Manage Clients Resource Audit - 2026-06-21

- Audited the old CST CSM orientation Loom transcript. No new app build was needed for the orientation itself: RetainOS already covers Clients List/Card views, search/filters, Quick Update, Next Steps/notes/contact cadence, Progress/Buy-In/Success, custom fields, pathway milestone completion, Client Detail, links, tasks, history, contracts, and lifecycle controls.
- Real product gap found: old CST had dedicated Testimonial / Review / Referral asked/received controls. RetainOS can identify advocacy candidates with Success + green Progress/Buy-In filters, but dedicated advocacy write controls remain future scope. `ROADMAP.md` now calls this out explicitly under client outcomes.
- Added/applied `supabase/migrations/20260621104000_update_how_to_manage_clients_resource.sql`, refreshing `how-to-manage-clients` as draft "How to manage clients in RetainOS" with CSM orientation structure and RetainOS boundaries. Live readback confirmed the resource draft exists and includes the advocacy gap note.

## Advocacy Tracking - 2026-06-21

- Built RetainOS Advocacy & Growth tracking for Review, Testimonial, Referral, and Renewal / Upsell. Added `src/lib/clientAdvocacy.ts` and `src/components/ClientAdvocacyPanel.tsx`.
- Added/applied `supabase/migrations/20260621105000_client_advocacy_tracking.sql`: `client_advocacy_events` plus app-owned `clients` advocacy summary columns for status, asked count, received count, last asked date, last received date, and latest note. Migration backfilled existing app-owned clients from legacy Glide fields.
- Updated/deployed `supabase/functions/manage-client-quick-update/index.ts` and `supabase/functions/manage-client-outcomes/index.ts`. Both now accept `advocacyEvents`, insert asked/received event rows, refresh client summary counts, and include advocacy context in history/audit payloads.
- Updated `src/pages/Clients.tsx`: Quick Update now has an Advocacy & Growth panel. Updated `src/pages/ClientDetail.tsx`: Outcomes tab and the older outcomes modal now include the same panel.
- Updated `src/pages/Dashboard.tsx`: Dashboard > Overview now shows Advocacy & Growth cards for asked, received, and ask-to-received ratio by Review, Testimonial, Referral, and Renewal / Upsell. Reporting uses app-owned `client_advocacy_events`, event dates, CSM snapshot, and the existing dashboard filters where applicable.
- Updated `scripts/seed-company-write-mode.mjs` so future Glide-to-app-owned company migrations map legacy advocacy fields into summary columns and `glide_migration` event rows. Updated `scripts/seed-ethical-scaling-clients-pilot.mjs` summary mapping so reruns preserve the new fields.
- Added/applied `supabase/migrations/20260621110000_update_advocacy_resource.sql` and `20260621111000_update_manage_clients_advocacy_boundary.sql`. `reviews-testimonials-and-referrals` is now titled "Tracking reviews, testimonials, referrals, and renewal opportunities"; `how-to-manage-clients` no longer says advocacy controls are missing.
- `npm run build` passed. Live readback for Ethical Scaling showed advocacy events: review asked `3` / received `6`, testimonial asked `19` / received `32`, referral asked `11` / received `19`, renewal/upsell received `3`. `ROADMAP.md` marks this as `[qa]`.
- Jay QA passed the main slice: testimonial save worked from Client Detail, Dashboard > Overview advocacy cards looked good, and dashboard filters worked. Quick Update layout was adjusted so Pathway progress appears before Advocacy & Growth; frontend-only reorder in `src/pages/Clients.tsx`, and `npm run build` passed.
- Client Advocacy Triggers follow-up: added Clients roster filters for Review, Testimonial, Referral, and Renewal / Upsell status (`Any`, `Not asked`, `Asked`, `Received`) for app-owned pilot/migrated companies. Filters combine with the existing CSM/status/pathway/contact/health filters and apply to list/card/calendar client queries.
- Added/applied `supabase/migrations/20260621114000_update_advocacy_triggers_resource.sql`, merging the old `Client Advocacy Triggers` walkthrough into the canonical `reviews-testimonials-and-referrals` resource and deleting the duplicate trigger-specific draft.
- `npm run build` passed after the Clients filter changes. Service-role readback confirmed only the canonical advocacy resource remains and it includes the Clients-filter section. Ethical Scaling smoke counts confirmed the new status columns are queryable: review `153/1/6`, testimonial `128/0/32`, referral `141/0/19`, renewal `157/0/3` for `not_asked/asked/received`.
- Filter UI polish follow-up: `src/pages/Clients.tsx` now keeps Client Name, Status, CSM, Offer, Secondary Assignee when enabled, Last Contact, and Next Contact visible, and moves Milestone/Renewals, Success/Progress/Buy-In, and Advocacy filters into collapsible `Journey & Contract`, `Health & Outcomes`, and `Advocacy & Growth` sections with active-count badges. `npm run build` passed; browser smoke reached login on local `/clients`, so Jay still needs authenticated visual QA.

## Next Steps Resource Audit - 2026-06-21

- User flagged `Using the Next Steps Feature` as repetitive with Quick Update / Manage Clients. No product patch was needed.
- Added/applied `supabase/migrations/20260621112000_update_next_steps_resource.sql`, retitling the draft to `Using Next Steps well` and narrowing it to writing best practices, example structure, history/accountability, and when to use Quick Update vs Program update vs Tasks.
- Live readback confirmed the `using-the-next-steps-feature` resource is draft, includes Best practices / Related resources, and explicitly says not to re-record the full Quick Update workflow there.

## Client History Log Resource Audit - 2026-06-21

- Audited the old CST `Understanding the Client History Log` transcript against RetainOS. No product patch was needed: RetainOS already has a dedicated Client Detail > History tab with filter pills, search, timestamps, source labels, and app-owned history events across the write flows that are live.
- Added/applied `supabase/migrations/20260621113000_update_client_history_log_resource.sql`, retitling the resource to `Understanding client history in RetainOS` and replacing the old three-dot CST drawer workflow with the RetainOS History tab workflow. The migration upserts the resource because live readback showed the draft row was not present before the first update-only pass.
- Service-role readback confirmed `understanding-the-client-history-log` exists as draft, includes the RetainOS History tab guidance, and includes the Call AI boundary.
- Updated `ROADMAP.md` to correct the stale note that History only showed Quick Update events. Remaining history gaps are narrower: AR status changes, call attendance, and deeper task history if users need it.

## North Star Resource Audit - 2026-06-21

- Audited old CST `Leveraging North Star for Proactive Coaching`. No product patch was needed: RetainOS already supports North Star during New Client creation, app-owned profile editing, Zapier/new-client payloads, Quick Update context display, and profile-update history events.
- Added/applied `supabase/migrations/20260621115000_update_north_star_resource.sql`, refreshing the resource as draft `Leveraging North Star for proactive coaching`.
- The updated resource positions North Star as the long-term destination, Next Steps as current actions, Tasks as owned work, and the History tab as the place to review previous North Star/profile changes instead of the old CST inline field history.
- Service-role readback confirmed the resource exists as draft and includes destination/History/Quick Update guidance.

## Admin Tools Overview Resource Audit - 2026-06-21

- Audited old CST `Tools for Admins Only`. No product patch was needed: RetainOS already has the relevant role/capability model and admin surfaces through Dashboard, Clients, CSM Reports, Tasks, Resources, and Admin Hub.
- Added/applied `supabase/migrations/20260621116000_update_admin_tools_overview_resource.sql`, refreshing `admin-tools-overview` as draft `Admin and Director tools in RetainOS`.
- The updated resource maps old CST concepts into RetainOS: Dashboard/Charts for cohort-style analysis, CSM Reports for CSM/profile-upkeep review, Admin Hub for company/team/configuration, and Resources for help/company resources.
- It explicitly marks old CST popup-style alerts and the old More > Call AI pattern as boundary/future/dedicated-resource scope rather than pretending those exact flows are live.
- Service-role readback confirmed the resource exists as draft and includes role model, Admin Hub, CSM Reports, and popup-boundary guidance.

## Terminology Guide Resource Audit - 2026-06-21

- Audited old CST `RetainOS Terminology Guide`. No product patch was needed; the best RetainOS version is a glossary resource for onboarding and migration language alignment.
- Added/applied `supabase/migrations/20260621117000_update_terminology_guide_resource.sql`, refreshing `retainos-terminology-guide` as a draft glossary.
- The updated guide covers account roles, client lifecycle statuses, pathway/offer and milestone language, North Star / Next Steps / contact cadence, Success / Progress / Buy-In, advocacy and renewal/upsell terms, contracts, Dashboard / CSM Reports, Admin Hub, app-owned vs mirrored data, and old CST-to-RetainOS language shifts.
- Service-role readback confirmed the resource exists as draft and includes lifecycle, advocacy, app-owned data, and language-shift sections.

## Progress And Buy-In Resource Audit - 2026-06-21

- Audited old CST `Using Progress and Buy-in for Effective Coaching`. No product patch was needed: RetainOS already supports Success / Progress / Buy-In updates from Quick Update and Client Detail > Outcomes, Clients > Filters > Health & Outcomes, Dashboard > Charts distributions, and client History context.
- Added/applied `supabase/migrations/20260621118000_update_progress_buy_in_resource.sql`, refreshing `using-progress-and-buy-in-for-more-effective-coaching` as draft `Using Progress and Buy-In for effective coaching`.
- The updated resource reframes the walkthrough as an operating guide: Progress vs Buy-In definitions, Success boundary, traffic-light calibration, where to update/review/filter, Dashboard usage, CSM/Admin best practices, and a Progress x Buy-In coaching matrix.
- Service-role readback confirmed the live draft includes Quick Update, Dashboard > Charts, Coaching matrix, definitions, and History guidance.

## Paused And Suspended Resource Audit - 2026-06-21

- Audited old CST `Marking a Client as Paused or Suspended`. No product patch was needed: RetainOS already supports Paused and Suspended through the controlled Client Detail lifecycle/status flow, requires reasons, requires a paused return date, records status changes in client History, supports Clients status filtering, and shows current status mix in Dashboard > Charts > Program Distribution.
- Added/applied `supabase/migrations/20260621119000_update_paused_suspended_resource.sql`, refreshing `marking-a-client-as-paused-or-suspended` as draft `Marking a client as paused or suspended`.
- The updated resource documents RetainOS-specific behavior that did not exist in the old CST transcript: paused return date requirement, app-owned contract extension for the approved pause window where a contract exists, reactivation to Front End / Back End, paused-return notification scope, and the boundary that dedicated Director email alerts for paused/suspended status changes remain roadmap scope.
- Service-role readback confirmed the live draft includes return date, contract extension, Status filter, Program Distribution, History, and Director email alert boundary guidance.

## Dashboard Milestone Breakdown By Offer - 2026-06-21

- Audited old CST `Milestone Progress Breakdown by Offer` and found a real dashboard behavior gap: RetainOS had Dashboard > Charts > Clients By Offer and an Offer filter, but selecting one offer still grouped by offer, producing a one-bar chart instead of the old CST milestone breakdown.
- Updated `src/pages/Dashboard.tsx`: the existing journey chart now stays `Clients By Offer` when no Offer filter is applied, and switches to `Clients By Milestone` when a specific Offer is applied. It loads milestone labels/order from `company_offer_milestones` for app-owned companies or `backup_company_offer_milestones` for mirror-only companies, counts clients by `offer_milestones_current_milestone_id`, and keeps chart drilldowns pointed at the right client segment.
- Added/applied `supabase/migrations/20260621120000_update_milestone_progress_breakdown_resource.sql`, refreshing the `milestone-progress-breakdown-by-offer` draft resource to match the RetainOS behavior and old CST intent.
- `npm run build` passed. Service-role readback confirmed the resource draft includes Clients By Offer, Clients By Milestone, drilldown, and Secondary Pathway boundary guidance. `ROADMAP.md` marks the chart switch as `[qa]`; Jay should test Dashboard > Charts with All offers, then select one Offer and confirm the chart title/data/drilldown change.
- QA follow-up: Jay saw a raw milestone ID in the milestone chart. Live readback for `Pm4s3detsuobvj5xm04q6q` found no matching app-owned/mirror milestone row and no currently assigned clients, but the edge case was valid. Patched `src/pages/Dashboard.tsx` so the chart loads archived app-owned milestones too, labels them as `(Archived)`, labels clients with no milestone as `No current milestone`, and labels missing legacy references as `Unknown milestone (<short id>)` instead of showing the full raw ID. `npm run build` passed.
- Added/applied `supabase/migrations/20260621121000_update_milestone_breakdown_edge_case_resource.sql`; service-role readback confirmed the resource draft now includes Archived and Unknown milestone guidance.
- QA follow-up 2: Jay still saw `Unknown milestone (pM4S3dET...)`. Case-insensitive readback showed that exact milestone exists as `Buy-in` for offer `Ud4LVWyfSKuCfZlRVeQnzQ`, but at least one filtered client (`Marianne Lehikoinen`) had current offer `8Mv0j3xjQpGWQvhaMAdGyg` while still pointing at the `Buy-in` milestone from the other offer. Patched `src/pages/Dashboard.tsx` so the selected-offer milestone chart also resolves current milestone IDs present in the filtered client set even when the milestone belongs to another offer, and labels those as `(from another offer)` for cleanup visibility. `npm run build` passed.
- Added/applied `supabase/migrations/20260621122000_update_milestone_cross_offer_resource.sql`; service-role readback confirmed the milestone resource includes cross-offer mismatch guidance.
- QA follow-up 3: The `(from another offer)` label was confusing because it surfaced a foreign milestone named `Buy-in` inside the selected offer's milestone breakdown. Patched `src/pages/Dashboard.tsx` again so selected-offer milestone charts only show milestones that belong to the selected offer plus a single `Milestone mismatch` cleanup bucket for clients whose current milestone is outside that offer. Drilldown on the bucket still opens the affected clients. `npm run build` passed.
- Added/applied `supabase/migrations/20260621123000_update_milestone_mismatch_resource.sql`; service-role readback confirmed the resource now says `Milestone mismatch` and no longer includes the old `from another offer` guidance.

## Tracking TTV Resource And Dashboard Metric - 2026-06-21

- Audited old CST `Tracking TTV (Time to Value)`. RetainOS already had the configuration foundation: `company_offer_milestones.is_ttv_milestone`, mirrored `backup_company_offer_milestones.ttv_milestone`, Admin Hub milestone editing, and migration scripts that preserve TTV flags.
- Product gap closed in `src/pages/Dashboard.tsx`: Dashboard > Overview now includes a Journey card for `Avg. Time to Value`, plus `Reached` count and `TTV Points`. Formula is TTV milestone completion date minus client onboarding/start date, averaged across clients who reached an active configured TTV milestone in the selected filters. The loader respects company, CSM, secondary assignee, program/status, offer, client start date, and Date Range completion date filters.
- Updated `src/pages/ClientDetail.tsx`: Client Detail > Pathways & Milestones > Milestone Timeline now labels configured TTV milestones with a `Time to Value` badge.
- Added/applied `supabase/migrations/20260621124000_update_tracking_ttv_resource.sql`, refreshing the `tracking-time-to-value` draft resource for RetainOS. Service-role readback confirmed the resource includes Dashboard, Client Detail, filter rules, and Value Activation guidance.
- `npm run build` passed. Supabase smoke check found active TTV milestone example `Tracking` for Ethical Scaling plus an archived test TTV milestone; the Dashboard metric was tightened to active app-owned TTV milestones only. `ROADMAP.md` marks Average Time to Value / TTV as `[qa]`; Jay should validate Admin Hub config, Dashboard metric, filters, and Client Detail badge.
- QA follow-up: `src/pages/Dashboard.tsx` now makes the TTV card details clickable. Clicking `Reached` opens the existing client-list chart detail modal with clients who reached TTV. Clicking `TTV Points` opens a configured milestone dialog because that number represents TTV milestone configuration, not clients. `npm run build` passed.
- Added/applied `supabase/migrations/20260621125000_update_ttv_clickthrough_resource.sql`; service-role readback confirmed the TTV resource now includes `Click Reached` and `Click TTV Points` guidance.
- QA follow-up 2: Jay found the `Reached` clickthrough showed `Unnamed client` rows. Root cause was the TTV client query not selecting `client_name` / `client_image` before reusing the shared chart detail modal. Patched `src/pages/Dashboard.tsx` to include both fields in the TTV client query; `npm run build` passed.

## Retention And Churn Resource Audit - 2026-06-21

- Audited old CST `Understanding Retention and Churn`. No product patch was needed: RetainOS already records renewals through contract-created retention events, calculates churn during controlled offboarding by comparing actual end date against contract end date, and surfaces Retained / Retention % / Up For Renewal / Churn % in Dashboard > Overview > Contracts & Retention with drilldowns.
- Added/applied `supabase/migrations/20260621126000_update_retention_churn_resource.sql`, refreshing `retention-churn-metrics` as draft `Understanding retention and churn in RetainOS`.
- The updated resource documents RetainOS formulas, contract renewal workflow, offboarding churn workflow, Clients renewal filters, Dashboard drilldowns, migration QA checks, and the boundary that predictive renewal forecast / pipeline revenue is future Dashboard / CSM Reports / Beacon-assisted scope.
- Service-role readback confirmed the live draft includes the Retention % formula, Churn % formula, contract flow, offboarding flow, forecast boundary, and migration QA checklist.

## Global Note Search - 2026-06-21

- Built the old CST `Global Note Search Across Client Profiles` as a RetainOS Clients view mode rather than a hidden table switch.
- Added/applied `supabase/migrations/20260621127000_global_client_note_search.sql`, creating RPC `search_client_notes`. It searches current Next Steps, app-owned `client_history_events` text fields, and migrated `backup_company_clients_history` values for filtered clients. It returns paginated rows with source labels, client metadata, matched text, event date, and total count.
- Updated `src/pages/Clients.tsx`: List / Cards / Calendar now has a fourth `Notes` mode. Notes mode has its own keyword search, uses the applied Clients filters before querying notes, highlights matched snippets, shows source badges, paginates results, and links to the matched client profile.
- Added/applied `supabase/migrations/20260621128000_update_global_note_search_resource.sql`, refreshing `global-note-search-across-client-profiles` as draft `Global note search across client profiles`.
- Verification: `npm run build` passed with the existing Beacon/Anthropic browser externalization and chunk-size warnings. Service-role smoke test on Ethical Scaling returned `book` matches through the RPC, and resource readback confirmed Clients > Notes, filter behavior, legacy history coverage, and non-AI-search boundary guidance.
- `ROADMAP.md` marks Global client note search as `[~] [qa]`; Jay should test visual feel, useful known search terms, CSM/offer filters, and at least one known migrated legacy history example.

## Client General Information - 2026-06-21

- Audited old CST `Optional General Info Section on Client Profile`. RetainOS could already display legacy/mirrored General Information in Client Detail > Program, but app-owned clients did not yet have a dedicated editable field.
- Added/applied `supabase/migrations/20260621129000_client_general_info.sql`, adding `clients.client_general_info` and backfilling from `backup_company_clients.client_general_info` where available. Ethical Scaling smoke readback found no non-empty legacy General Info examples, but the mapping is now present for companies that used it.
- Updated `src/pages/ClientDetail.tsx`: Edit Profile now includes `General Information` below North Star and sends `generalInfo` to the profile function.
- Updated/deployed `supabase/functions/manage-client-profile/index.ts` so Edit Profile persists `client_general_info`; also updated/deployed `manage-client-create` to accept `generalInfo` for API/future create payload consistency.
- Updated migration scripts `scripts/seed-ethical-scaling-clients-pilot.mjs` and `scripts/seed-company-write-mode.mjs` so future company/app-owned migrations carry `client_general_info`.
- Added/applied `supabase/migrations/20260621130000_update_general_info_resource.sql`, refreshing `optional-general-info-section-on-client-profile` as draft `Using General Information on a client profile`. Resource readback confirmed Edit Profile, no-old-toggle boundary, and migration notes. `npm run build` passed with existing Beacon/Anthropic/chunk warnings.

## Pathway Progress Consistency Patch - 2026-06-22

- Jay found demo-blocking inconsistencies on Ali's profile: Client Detail and Quick Update could show stale `Optimized Journey / Deep Dive` current pathway/milestone while the milestone timeline showed the real active Back End progress.
- Updated `src/pages/ClientDetail.tsx`: Pathways section and Change Pathway & Milestones modal now derive current pathway/milestone from the latest incomplete `client_milestones` row first, then fall back to legacy `clients.offer_milestones_current_*` fields only when no active progress row exists. The detail FieldGrid label now says `Pathway`, and relation lookups include pathway IDs from milestone history rows.
- Updated `src/pages/Clients.tsx`: Quick Update now loads active `client_milestones` for the open client and uses that corrected pathway/milestone for both display and the `complete_milestone` payload. New Client and Clients filters now use Pathway wording instead of visible Offer wording.
- `npm run build` passed. The build still shows existing local Beacon/Anthropic browser-externalization warnings because Beacon remains an intentionally uncommitted local pilot.
- DO NOT COMMIT remains in force for the local Beacon pilot files unless Jay explicitly asks to ship Beacon: `package.json`, `package-lock.json`, `src/components/Header.tsx`, `src/components/Beacon.tsx`, `src/lib/beacon/*`, plus `old glide project test/`.

## QA Closeout - 2026-07-02

- Jay approved Archetypes, Secondary Assignee, and Offboarding actual-end-date/churn. Secondary Pathway remains in QA after a modal save fix: unchanged primary pathway writes are skipped, unchanged secondary values are skipped, secondary milestone selection is validated, and Edge Function errors now surface their real messages.
- Secondary Pathway follow-up: applied `supabase/migrations/20260702100000_secondary_pathway_history_events.sql` so secondary pathway history events pass the DB constraint; `src/pages/ClientDetail.tsx` now has an expandable secondary milestone progress view. `npm run build` passed. Awaiting Jay retest before promoting in `ROADMAP.md`.
- Secondary Pathway follow-up 2: `src/pages/ClientDetail.tsx` now exposes Start/Complete Secondary Milestone actions from the expanded secondary progress card; `manage-client-milestone` now supports secondary start/complete actions and was deployed to `zjauqflzxzsbpnivzsct`. `npm run build` passed. Awaiting Jay retest.
- Jay retested Secondary Pathway and approved it; `ROADMAP.md` promoted the item to `[x]`.
- Moves Method webhook readiness: deployed `zapier-create-client` and `webhook-update-client` support for canonical `pathway_id`, optional `secondary_pathway_id` / `secondary_milestone_id`, and legacy `offer_id` / `secondary_offer_id` aliases. Build passed.
- Added `--shell-only` to `scripts/seed-company-write-mode.mjs` and applied it for Moves Method. MM is now an app-owned pilot shell (`companies.id = 21586391-9a84-4072-9ae6-20436b27bea9`, legacy `wd7vy0vaQK2hgB3IRqy17w`) with 89 members, 16 pathways, 33 milestones, zero migrated clients, Secondary Pathway enabled, and New Client Webhook enabled.
- Internal MM webhook QA passed using disposable tokens that were revoked afterward. Test client: `retainos-mm-internal-qa-1782986876735@example.com`; create-client returned 200, client-update secondary pathway returned 200, call-summary returned 200 and wrote Next Steps/Last Contact.
- Moves Method Resource guide + shell seed script update was pushed to `main` in commit `7aaafa7`; Vercel deploys from `main`.
- Daniel-call follow-up: updated `src/pages/Resources.tsx` Client Update Webhook guide so the copied request body is a safe minimal payload and optional payload examples are split into Profile fields and Secondary pathway. `npm run build` passed.
- Moves Method access prep: Jay refreshed the Glide backup at `2026-07-02T16:26:17Z`; app-owned `company_members` was refreshed from `backup_company_team` for MM only. Inserted 11 rows, updated 6 archived/status changes, and final verification shows 100 app-owned team rows with 73 active users matching backup. No clients were touched.
- Moves Method custom-field prep: seeded app-owned `company_custom_fields` for legacy Glide slots `customfield1..customfield7`: Gender, Age, Goals, Training Background, Injuries, Close Date, Program Name and Length. Live disposable-token QA against `zapier-create-client` confirmed `customfield6 = 2026-07-02` and `customfield7 = Inner Circle - 3 Months` are accepted and persisted; temporary test client and token were cleaned up.

## Moves Method Loom Polish - 2026-07-02

- Jay found two Loom polish issues before sharing access: Dashboard still surfaced user-facing Offer copy, and Client Detail custom fields were useful but too visually long once webhook-prefilled values existed.
- Updated `src/pages/Dashboard.tsx`: Dashboard-visible filter/chart/drilldown copy now says Pathway / pathways instead of Offer / offers. Internal `offer_*` names remain because the schema and query contract still use those names.
- Updated `src/pages/ClientDetail.tsx`: `CustomFieldEditorGrid` supports a collapsible mode. Client Detail > Outcomes now shows custom fields as an expandable section with a filled-field count; Quick Update and outcome modals remain unchanged.
- `npm run build` passed with the existing Vite/Anthropic browser-externalization and chunk-size warnings.

## Quick Update Long Context Polish - 2026-07-02

- Jay found Loom QA cases where automated North Star / Next Steps values could be very long and made Quick Update visually heavy.
- Updated `src/pages/Clients.tsx`: Quick Update North Star and Next Steps context cards now preview the first 260 characters and show `Read more` when longer. The full value opens in a simple read-only modal using the existing rich-text renderer.
- `npm run build` passed with the existing Vite/Anthropic browser-externalization and chunk-size warnings.

## Milestone-Completed Task Templates V1 - 2026-07-03

- Built the Moves Method-requested task automation as a Task Templates trigger, not as a new customer webhook. Scope is primary pathway milestones only; secondary pathway milestones intentionally do not fire this V1.
- Added/applied `supabase/migrations/20260703100000_task_templates_milestone_completed.sql`: `company_task_templates.trigger_type` now allows `milestone_completed`, and templates have `applies_to_milestone_id` plus an index for pathway/milestone matching.
- Updated `src/pages/SaasClientDetail.tsx`: Company Settings > Task Templates now supports `When milestone is completed`, shows Pathway and filtered Milestone selectors, counts enabled milestone-trigger templates, and sends `appliesToMilestoneId`.
- Updated/deployed `supabase/functions/manage-company-customization/index.ts`: validates milestone-completed templates against active company-owned primary pathways/milestones.
- Updated/deployed `supabase/functions/manage-client-milestone/index.ts`: after primary `complete_milestone`, matching enabled templates create client-linked tasks due `completion date + due offset`. Metadata records template/pathway/milestone context and duplicate protection prevents re-creating tasks for the same template + client milestone progress row.
- `npm run build` passed with existing Vite/Anthropic browser-externalization and chunk-size warnings. Awaiting Jay QA in MM/Admin Hub flow.

## MM Pathway Archive Cleanup - 2026-07-03

- Jay QA passed milestone-completed task templates; `ROADMAP.md` promoted that task automation item to `[x]`.
- Updated `supabase/functions/manage-company-pathway/index.ts`: archive blockers now count only active Front End / Back End clients and check both primary and secondary pathway/milestone fields before allowing archive.
- Updated `src/pages/SaasClientDetail.tsx`: Admin Hub > Pathways & Milestones usage counts now use the same active-client rule and include secondary pathway/milestone usage.
- Deployed `manage-company-pathway` to Supabase project `zjauqflzxzsbpnivzsct`; `npm run build` passed. `ROADMAP.md` has a short Jay QA retest item for archiving unused MM pathways/milestones.
- DO NOT COMMIT remains in force for unrelated local Beacon/package/Header dirty work.

## Task Template Modal Polish - 2026-07-03

- Jay confirmed the missing new Kickoff milestones were resolved by hard refresh, meaning Task Templates had stale settings data rather than missing Supabase rows.
- Updated `src/pages/SaasClientDetail.tsx`: Task Templates modal now refreshes active app-owned pathways/milestones on open and shows refreshing labels while loading.
- Added a Copy action to active task template cards; it opens an unsaved `Copy of ...` draft with the original trigger, assignment, due offset, priority, pathway, and milestone values for faster MM setup.
- `npm run build` passed with existing Beacon/Anthropic browser-externalization and chunk-size warnings.

## Moves Method Migration Local QA Blocker - 2026-07-04

- Jay found local SuperAdmin company switching could load mirror-only companies like Bye Bye Panic, but app-owned pilot companies like Ethical Scaling and Moves Method hung.
- Root cause: page-level company lists on Dashboard / Clients / Tasks only accepted non-archived `backup_companies` rows. Pilot/app-owned companies intentionally have archived mirror rows, so validation effects cleared the selected company while account context immediately restored it, causing a `Maximum update depth exceeded` render loop.
- Updated `src/pages/Dashboard.tsx`, `src/pages/Clients.tsx`, and `src/pages/Tasks.tsx` to merge pilot/migrated `companies` rows into the page company lists even when their mirror backup row is archived.
- Verification: `npm run build` passed with existing Beacon/Anthropic browser-externalization and chunk-size warnings.
- Follow-up Dashboard MM KPI mismatch: canonical Dashboard RPC timed out at MM scale, then the client-side fallback only counted the capped API slice, producing incorrect cards such as 626 active instead of 2,374. Updated `src/pages/Dashboard.tsx` to skip the timed-out canonical path for app-owned companies for now and page through all fallback client rows in 1,000-row batches. Expected MM cards after hard refresh: Active 2,374; Front End 2,037; Back End 337; Off-boarded 1,910. `npm run build` passed.

## Moves Method Cutover Operator Log - 2026-07-04

- Jay confirmed Glide/MM is frozen and approved wiping pre-cutover MM app-owned shadow/client-side rows before clean migration. Jay also marked rollout checklist Phase 0 and Phase 1 complete.
- Wiped MM app-owned shadow rows only for `companies.id = 21586391-9a84-4072-9ae6-20436b27bea9` / legacy `wd7vy0vaQK2hgB3IRqy17w`: `clients` 26, `client_tasks` 34, `client_history_events` 30, `client_milestones` 1, `integration_intake_events` 226, `client_custom_field_values` 100, and `client_advocacy_events` 2. Post-wipe counts for those tables are all 0.
- Preserved MM company configuration: `company_members` 100, `company_offers` 16, `company_offer_milestones` 36 including the 3 Kickoff Call milestones, `company_task_templates` 6, `company_custom_fields` 7, `company_settings` 1, and `notification_preferences` 6.
- Next operator gate: after Jay confirms final paid Glide/CST sync is complete, run the fresh Moves readiness snapshot, verify backup freshness/counts, then prepare/apply the clean app-owned backfill with count confirmation before destructive or source-of-truth changes.
- Jay confirmed final Glide/CST syncs were complete and validated. Fresh readiness snapshot before backfill showed mirror `backup_companies.archived = true` because Glide/MM was frozen/offline, mirror/app-owned target legacy `wd7vy0vaQK2hgB3IRqy17w`, and 4,485 mirror clients with 2,374 active.
- Patched `scripts/seed-company-write-mode.mjs` for cutover-safe preserved config mode: `--preserve-company-config` keeps reviewed app-owned team/pathways/milestones/settings/custom fields/preferences instead of overwriting them from the now-frozen mirror, and keeps the app-owned company `status = active` even when the mirror company is archived. Added `--skip-client-custom-fields` after Jay decided not to backfill old Glide custom-field values into MM's reviewed 7-field setup.
- Applied approved MM client backfill with `node scripts/seed-company-write-mode.mjs --company="Moves Method" --migration-status=pilot --preserve-company-config --skip-client-custom-fields --apply`. Result: `clients` 4,485 imported, app-owned company remains active/pilot, company config remains `company_members` 100, `company_offers` 16, `company_offer_milestones` 36, `company_task_templates` 6, `company_custom_fields` 7, `company_settings` 1, `notification_preferences` 6. `client_custom_field_values` intentionally remains 0.
- Post-backfill readiness snapshot generated `2026-07-04T10:23:17.155Z`: app-owned and mirror client counts match at 4,485; status split matches mirror (`front-end` 2,037, `back-end` 337, `paused` 118, `suspended` 83, `off-boarded` 1,910); active client count 2,374; active clients missing offer/milestone config 0; active contracts have renewal-date coverage via filtering date. Remaining source-data blocker: 5 active clients unassigned and 10 active clients with archived primary CSM assignments.
- Jay accepted the remaining CSM assignment blockers for manual post-migration cleanup.
- Patched `scripts/backfill-company-contracts.mjs` so MM-scale dry runs/apply page app clients, existing contracts, and backup contract chunks instead of sending oversized `.in()` requests or reading only Supabase's default first 1,000 rows.
- Contract backfill dry-run from the fresh sync was reviewed. Jay approved the recommended live-portfolio scope including `front-end`, `back-end`, `paused`, and `suspended`, excluding off-boarded clients.
- Applied `node scripts/backfill-company-contracts.mjs --company="Moves Method" --include-paused-suspended --apply`. Result: 2,583 `client_contracts` rows inserted for 2,575 live/non-offboarded MM clients: 189 historical mirror contract rows and 2,394 current-summary contract rows. Direct verification found 0 live clients missing an app-owned contract row. The readiness script's `missingContractHistory` still describes missing Glide mirror history rows, not app-owned current-summary coverage.
- Jay approved Phase 3 with old CST history kept mirror-only for launch; customer-facing/operator language should say CST/read-only CST history rather than naming Glide. Internal schema fields such as `glide_row_id` remain unchanged.
- Patched `scripts/backfill-company-activity.mjs` for MM-scale pagination/chunked reads before applying. Phase 3 dry-run showed 56 client milestone rows, 0 unresolved skips, 0 active conflicts, 0 duplicate active milestone skips, and 0 additional contracts to backfill.
- Applied `node scripts/backfill-company-activity.mjs --company="Moves Method" --apply`. Result: 56 `client_milestones` rows inserted, `client_history_events` intentionally remains 0, and old CST history remains mirror-only/read-only for launch. Post-apply verification: `client_milestones` 56, `client_contracts` 2,583, `client_history_events` 0.
- Patched `scripts/migration-readiness-snapshot.mjs` output strings to say CST sync instead of Glide sync in operator-facing warnings/notes.
- Phase 3 customization/integration validation: MM has `company_settings` 1 with secondary assignee/offers and Zapier client-create enabled, `company_custom_fields` 7 active, `company_outcome_definitions` 8 active, `company_churn_reasons` 6 active, and `notification_preferences` 6 active in-app defaults. Dynamic integration resource pages are published; no MM company-specific resources exist yet. Active integration token prefixes exist for `client_create`, `client_update`, and `call_summary_next_steps`.
- Contract QA catch/fix: initial contract backfill gave every live client a contract row, but 181 clients with historical contract rows were missing a separate current-summary row, which could make the UI show old contracts as current. Patched `scripts/backfill-company-contracts.mjs` with `--include-current-summary-for-existing-contracts` and applied `node scripts/backfill-company-contracts.mjs --company="Moves Method" --include-paused-suspended --include-current-summary-for-existing-contracts --apply`. Final verification: `client_contracts` 2,764 total = 2,575 active current-summary rows + 189 historical rows; 0 live/non-offboarded clients missing current-summary coverage.
- Jay approved leaving Steven Russell and other contract source discrepancies as-is for launch, using current CST client summary as the RetainOS current contract source and CST history/contract rows as reference/history unless manually corrected after spot-checks. Jay then approved moving Moves Method to write-mode.
- Promoted Moves Method from `migration_status = 'pilot'` to `migration_status = 'migrated'` with `status = 'active'` / `archived_at = null` and wrote an `app_audit_events` record. Final verification: company is active/migrated; counts are `clients` 4,485, `company_members` 100, `client_contracts` 2,764, `client_milestones` 56, `client_history_events` 0, `company_custom_fields` 7, `client_custom_field_values` 0, `company_offers` 16, `company_offer_milestones` 36, `company_task_templates` 6, `notification_preferences` 6. Final readiness snapshot at `2026-07-04T11:30:52.269Z` confirms app-owned/mirror client counts match; remaining assignment warnings are accepted manual cleanup.
- Jay caught that existing MM tasks were not included in the app-owned cutover. Added `scripts/backfill-company-tasks.mjs` and applied `node scripts/backfill-company-tasks.mjs --company="Moves Method" --apply`. Result: `client_tasks` 7,570 rows imported from `backup_company_clients_tasks`, preserving 450 company-level tasks with `client_id = null`, 7,120 client-linked tasks, and 258 unresolved legacy client links flagged as `metadata.unresolved_legacy_client_link = true`. Status mapping result: `todo` 4,821, `in-progress` 281, `waiting` 58, `done` 1,914, `archived` 496. Follow-up dry-run verified idempotency with `existingAppTasks` 7,570 and `toBackfill` 0.
- Jay QA found Tasks page showed only 250 visible tasks after the backfill. Root cause was a frontend `.limit(250)` on `/tasks`, not missing data. Updated `src/pages/Tasks.tsx` so app-owned/pilot/migrated companies page through all matching `client_tasks` in 1,000-row batches and chunk related client lookups. Mirror-only companies keep the old 250-row cap. `npm run build` passed.
- Jay QA found some task cards showed raw assignment IDs after the MM task import. Updated `src/pages/Tasks.tsx` so migrated task assignment display resolves both app-owned member UUIDs and legacy CST member IDs, includes archived members for display-only name resolution, and falls back to `Former team member` instead of leaking raw IDs. Assignable dropdowns still exclude archived/hidden members. `npm run build` passed.
- Jay asked for board task cards to be smaller and more usable as scan cards. Updated `src/pages/Tasks.tsx` board cards to clamp task titles/descriptions, tighten spacing, and keep full content in the existing task detail modal opened by clicking the card. `npm run build` passed.
- Jay QA found moving an imported task to Done could return a generic non-2xx error. Root cause was `manage-client-task` validating the existing legacy `assigned_to_id` as active even for status-only updates; imported MM tasks may be assigned to archived/former members. Patched/deployed `manage-client-task` so assignee active-status validation only runs when the assignee is changed, and updated `src/pages/Tasks.tsx` to surface function JSON errors instead of the generic non-2xx wrapper. `npm run build` passed; deployed function to `zjauqflzxzsbpnivzsct`.
- Added Tasks usability filters for MM cleanup: Status now includes `Overdue` and `Due soon`, and Tasks has a Client filter that persists in URL/session state. App-owned company client loading now pages through all clients so MM's client filter is complete; mirror-only preview keeps its 500-client cap. `npm run build` passed.
- Applied approved Moves Method open-task cleanup with `scripts/cleanup-company-tasks.mjs`: dismissed 1,084 stale open tasks and reassigned 3 recent active-client tasks from archived/former assignees to each client's active Primary CSM. Cleanup rules: Waiting >60d overdue, In Progress >60d overdue, To Do >90d overdue, off-boarded/missing client >30d overdue, archived/former assignee >45d overdue dismissed; archived/former assignee 31-45d overdue on active clients reassigned when an active Primary CSM existed. Post-cleanup verification: total tasks 7,570; open 4,074; closed 3,496; open status split `todo` 3,960, `in-progress` 84, `waiting` 30; open overdue 2,268; due soon 145. Metadata cleanup rows: 1,087.
- Applied approved MM task cleanup second pass with updated `scripts/cleanup-company-tasks.mjs`: dismissed 878 additional stale To Do tasks for missing/off-boarded clients, paused/suspended clients overdue >30d excluding reengage/unpause tasks, onboarding/post-kickoff tasks overdue >45d, and 8-week/diagnostic tasks overdue >60d. Post-pass verification: total tasks 7,570; open 3,196; closed 4,374; open split `todo` 3,082, `in-progress` 84, `waiting` 30; open overdue 1,390; To Do overdue 1,311; due soon 145; cleanup metadata rows 1,965 (`dismiss` 1,962, `reassign` 3).

## Moves Method Role QA Fixes - 2026-07-04

- Jay tested a temporary MM Director QA login and confirmed company scoping worked, but found three launch polish issues: invite success copy pointed to localhost during local QA, CSM Reports returned `Bad Request`, and Directors could not add company-owned MM resources.
- Updated `src/pages/SaasClientDetail.tsx` so invite/login copy and OTP redirect use `VITE_RETAINOS_APP_URL` / `VITE_APP_URL` when configured and fall back to `https://app.retainos.ai` instead of localhost during local QA.
- Updated `src/pages/CsmReports.tsx` so app-owned/mirror history reads chunk large client ID lists, preventing MM-scale Director CSM Reports from sending one oversized request.
- Updated `src/pages/Resources.tsx` so Directors can create/edit selected-company resources while RetainOS Help and dynamic setup guides remain SuperAdmin-only.
- Updated/deployed `supabase/functions/manage-resource/index.ts` to allow active Directors to create/update/archive only company-scoped resources for their own company; RetainOS Help remains SuperAdmin-only. Deployed to project `zjauqflzxzsbpnivzsct`.
- Verification: `npm run build` passed. Jay retested Director access on live and passed the role QA.
- Jay retested on live after commit `764dec3` deployed: Director CSM Reports loaded, Director can create/edit MM Company Resources, and RetainOS Help remains read-only for Director. Director role QA passed.
- Created temporary MM role QA data for CSM validation: client `MM Role QA Client - Delete` / `jay+mm-role-qa-client@ethicalscaling.com` (`clients.glide_row_id = role_qa_client_f26aea9c-2d04-4b09-a768-f4fd509e532c`) assigned to `jay+mm-csm-qa@ethicalscaling.com`, with matching active contract, active Inner Circle 3 Months / Kickoff Call milestone, and task `Role QA task - visible to temp CSM` (`client_tasks.glide_row_id = role_qa_task_c019ece1-cc26-4bd4-aa5a-2de809465669`). All rows are tagged with metadata `created_in = moves_method_role_qa` / `delete_after_qa = true` for cleanup.
- Jay completed Support role QA successfully: Support can see approved company-wide operational views, cannot see/use integrations or token management, and does not have SuperAdmin/company switcher access.
- CSM role QA found temp app-owned CSMs could see assigned clients/tasks but CSM write functions still authorized only against `legacy_glide_row_id`, causing a non-2xx on quick edits for app-owned-only members. Patched/deployed `manage-client-profile`, `manage-client-quick-update`, `manage-client-task`, `manage-client-status`, `manage-client-offboard`, and `manage-client-milestone` so CSM assignment checks accept either `legacy_glide_row_id` or app-owned `company_members.id`. Awaiting Jay retest of CSM quick edits.
- Jay retested CSM quick edits after the Edge Function deploy and confirmed they work. Moves Method role QA is now passed for Director, CSM, and Support.

## Moves Method Client Detail QA Polish - 2026-07-04

- Jay paused the Phase 4 Client Detail QA row because long MM automation Next Steps made the Program tab visually heavy, and some clients appeared to show `0` in a Program-related section.
- Read-only MM app-owned data check found Program text fields migrated: `next_steps_value` present on 3,626 clients, `north_star_value` on 2,555, `client_general_info` on 663; no literal `0` values were found in those Program text fields or current contract-day fields. A wider client-row sample found expected `0` values only in advocacy count fields. Need a specific client name/screenshot if Jay still sees `0` in Program.
- Updated `src/pages/ClientDetail.tsx`: Client Detail > Program > Next Steps now previews long rich text and opens the full value in a read-only `Read more` modal, matching the Quick Update long-context pattern.
- Verification: `npm run build` passed. Awaiting Jay live retest after frontend deploy.

## Moves Method Contract QA Fix - 2026-07-04

- Jay's Phase 4 contract QA found edit/archive/current-summary confusion and confirmed CSM/Support should manage contracts for clients they can manage.
- Updated `src/pages/ClientDetail.tsx`: app-owned contract rows are source-tagged, same-day end dates stay Active, CST mirror labels no longer say Glide, and delete uses the same manage-contract permission as create/edit/archive.
- Updated/deployed `supabase/functions/manage-client-contract/index.ts`: assigned CSM checks accept app-owned member IDs, delete is no longer SuperAdmin-only, create reuses the summary sync path, and summary sync only promotes active/open non-archived contracts.
- Verification: `npm run build` passed; `manage-client-contract` deployed to Supabase project `zjauqflzxzsbpnivzsct`. `ROADMAP.md` has a focused `[qa]` retest item for create/edit/archive/delete and role permissions.
- Jay retested and approved: edited contract value persisted after refresh, archiving removed contracts from Active, and archived contracts appeared correctly under Archived.

## Moves Method Renewal KPI QA Fix - 2026-07-04

- Jay's renewal QA found Dashboard > Up For Renewal showed 2,348 for MM with no Date Range, effectively nearly every active client, while Clients renewal windows showed much smaller overdue/next-30 counts.
- Updated `src/pages/Dashboard.tsx` so renewal KPI calculations and drilldowns use overdue through next 30 days by default when no Dashboard Date Range is set; explicit Date Range still wins. Dashboard now uses `current_contract_end_date_for_filtering`, includes non-archived historical contract rows for overdue cases, and excludes archived app-owned contract rows by status/archived flag.
- Updated KPI help copy in `src/components/dashboard/kpis/UpForRenewalKpi.tsx` and `RetentionPercentageKpi.tsx`.
- Verification: `npm run build` passed. Read-only MM sanity count for July 4, 2026 expects default Up For Renewal around 451 after retained-client exclusion.
- Follow-up polish: Dashboard renewal KPI drilldown now includes Renewal Date, defaults to renewal-date sort, and lets the header toggle ascending/descending sort.
- QA catch: card showed 438 while drilldown showed 70 because the drawer still subtracted broad retained-history clients. Aligned Up For Renewal card and drawer on active clients due in the renewal window; retained history remains for Retention Percentage only.

## Moves Method Renewal Drilldown Count Fix - 2026-07-04

- Jay still saw Dashboard > Active Clients Up For Renewal card at 438 while the drilldown modal showed 70 results after repeated refreshes.
- Root cause: the card path paged through all 4,486 MM app-owned clients, but the drilldown detail query used one Supabase range request and only received the first 1,000 rows in production. The first page happened to contain 70 current-summary renewal matches.
- Updated `src/pages/Dashboard.tsx`: KPI detail drawers now page client rows in 1,000-row batches, related history/contract reads are chunked in 500-ID batches, and Active Clients Up For Renewal uses the current client contract summary set to match the Clients renewal filters. Read-only sanity count for July 4, 2026: current-summary active renewal window = 438.
- Verification: `npm run build` passed with existing Beacon/Anthropic browser-externalization and chunk-size warnings.

## Dashboard KPI Info Privacy Hotfix - 2026-07-04

- Jay found Dashboard KPI info dialogs exposed raw SQL, company IDs, internal table names, and schema language to client-visible users.
- Updated `src/components/dashboard/kpis/*`, `src/components/dashboard/kpis/KpiCardBase.tsx`, and `src/pages/Dashboard.tsx`: removed the SQL modal section and copy-SQL action, changed the modal subtitle to "How this card works", and replaced KPI descriptions with plain-language explanations that avoid database/table/field names.
- Deleted `src/lib/dashboardKpiSql.ts` so raw KPI SQL is no longer part of the client dashboard code path.
- Verification: `npm run build` passed with existing Beacon/Anthropic browser-externalization and chunk-size warnings. Roadmap has a focused `[qa]` retest item for the KPI info dialogs.

## Git Push Workflow Note - 2026-07-04

- GitHub/network DNS is often blocked in the default sandbox. When Jay explicitly asks to push, use the approved/escalated `git push` path directly instead of first trying a sandboxed push that predictably fails with DNS errors.
- If Jay says not to push live, do not run `git push` at all; local commits are okay only when useful, and `main` may intentionally stay ahead of `origin/main`.

## Moves Method Launch Handoff Checkpoint - 2026-07-04

- Jay completed final Phase 4 QA gates for Moves Method: pathway progression on the QA client completed both milestones and showed 100%; Bye Bye Panic confirmed mirror fallback still loads; MM app-owned writes persisted on real clients, including off-boarded clients; and Dashboard KPI info modal privacy retest passed after SQL/schema removal.
- Dashboard renewal KPI retest passed functionally after the full-client drilldown fix; remaining note is performance polish for the full-scale renewal drawer, not a launch blocker.
- Read-only MM drift audit: app-owned clients = 4,486, CST mirror snapshot clients = 4,485, and the only app-owned-only row is `MM Role QA Client - Delete` / `jay+mm-role-qa-client@ethicalscaling.com`.
- Webhook/token handoff check: MM has one active non-expiring token each for `client_create`, `client_update`, and `call_summary_next_steps`. Client create/update tokens show Daniel/MM Zapier usage on 2026-07-03; call-summary next steps processed and matched Janet Post on 2026-07-04.
- Latest-client screenshot audit: all 30 CST-visible latest clients Jay sent were found in MM app-owned RetainOS data. Practical newest normal synced client marker is Cheryl Rieger (`cheryl.rieger13@gmail.com`, onboarded 2026-07-03T23:08:35.402Z); Emily Ward exists too but is future-dated to 2026-08-01.
- No app code changes in this checkpoint. Existing intentionally dirty local Beacon/package/Header files remain uncommitted.

## Moves Method Role QA Cleanup - 2026-07-04

- Deleted the temporary MM QA auth users `jay+mm-director-qa@ethicalscaling.com`, `jay+mm-csm-qa@ethicalscaling.com`, and `jay+mm-support-qa@ethicalscaling.com`, plus their `company_members` rows.
- Deleted the temporary client `MM Role QA Client - Delete` / `jay+mm-role-qa-client@ethicalscaling.com` (`clients.glide_row_id = role_qa_client_f26aea9c-2d04-4b09-a768-f4fd509e532c`) and its associated QA-only rows: 2 tasks, 13 client history events, 2 client milestones, 2 client contracts, and temp-created audit rows.
- Verification after cleanup: temp auth matches = 0, temp `company_members` = 0, temp client = 0, temp task/history/milestone/contract/audit rows = 0.
- MM app-owned clients now match the CST mirror snapshot again at 4,485 / 4,485. Paged status verification: `front-end` 2,037, `back-end` 337, `paused` 118, `suspended` 83, `off-boarded` 1,910.
- No app code changes in this cleanup. Existing intentionally dirty local Beacon/package/Header files remain uncommitted.

## Moves Method Secondary Pathway Webhook Hotfix - 2026-07-05

- Jay/Daniel found MM's client update Zap failed for AA Bundle because AA Bundle has no milestones and `webhook-update-client` required `secondary_pathway_id` plus `secondary_milestone_id`.
- Used a separate clean hotfix worktree from `origin/main` so the dirty local `security-phase-0` project was not touched.
- Updated `supabase/functions/webhook-update-client/index.ts`: `secondary_pathway_id` can now be sent without `secondary_milestone_id`; milestone validation only runs when a milestone is provided; sending a milestone without a pathway still returns a validation error.
- Updated `src/pages/Resources.tsx` client update webhook resource copy/body example so secondary milestone is documented as optional for pathways with no milestones.
- Deployed `webhook-update-client` to Supabase project `zjauqflzxzsbpnivzsct` with `--no-verify-jwt`. Verification: `npm run build` passed in the hotfix worktree; live webhook call with a temporary token applied AA Bundle to Stacie Rigney (`faithworks8@gmail.com`) with no milestone; temporary token was deleted afterward.
- Remaining manual cleanup after verification: Daniela Chiaramonte, Elizabeth Stenger, Judie Myers, Lucie Marie Guilbert, Michael Garcia, and Sandy Dawson still had blank secondary pathway fields at the last readback.

## Moves Method Secondary Pathway Manual UI Hotfix - 2026-07-05

- Jay found Client Detail > Change Pathway & Milestones still blocked manual AA Bundle assignment with "Choose a secondary milestone first."
- Updated `src/pages/ClientDetail.tsx`: the secondary pathway modal now allows saving a secondary pathway without a milestone and shows "No milestones for this pathway" when the selected pathway has no milestones.
- Updated/deployed `supabase/functions/manage-client-milestone/index.ts`: `set_secondary_pathway` now accepts a blank milestone, writes `secondary_offer_milestones_current_offer_id`, leaves `secondary_offer_milestones_current_milestone_id = null`, and records clean history/audit text using the pathway name. Primary pathway, start milestone, and complete milestone actions still require a milestone.
- Verification: `npm run build` passed in the hotfix worktree. Deployed `manage-client-milestone` to Supabase project `zjauqflzxzsbpnivzsct`. No temporary QA users were created.

## Moves Method Task Dismissal Hotfix - 2026-07-06

- Adam Zomparelli reported that dragging tasks from To Do to Dismissed on the MM Tasks board returned "Unexpected error."
- Root cause: `manage-client-task` revalidated linked clients on every CSM task update and validated assignees with `id.eq.<assignedToId>` even when the task used a legacy Glide member id. Imported MM tasks can be CSM-owned while pointing at legacy-only client ids; the UUID comparison could throw before the status update.
- Updated/deployed `supabase/functions/manage-client-task/index.ts`: CSM-owned task updates only revalidate the linked client when the user changes the task's client link, and assignee lookup only compares against `company_members.id` when the supplied id is actually a UUID. Legacy member ids use `legacy_glide_row_id`.
- Verification: `npm run build` passed in the hotfix worktree. Live smoke test created a temporary MM CSM auth user/member and temporary task assigned to that CSM with a legacy-only client id; the deployed function moved it to `dismissed` successfully. Cleanup verification found 0 temp auth users, members, tasks, history rows, or audit rows.

## Moves Method Contacted Button Hotfix - 2026-07-06

- Jay/coach feedback from the MM launch: RetainOS needed the old CST one-click contacted action so CSMs can mark quick touchpoints without opening Quick Update.
- Used the separate clean hotfix worktree from `origin/main`; did not touch the dirty local `security-phase-0` project.
- Updated `src/pages/Clients.tsx`: Clients list and card views now show a compact calendar-check icon for app-owned companies where the user can Quick Update. Clicking it calls `manage-client-quick-update` with `contactTouch: true` and updates Last Contact to today, then refreshes the visible client row/card.
- Updated `supabase/functions/manage-client-quick-update/index.ts`: the function now preserves fields that are not sent, so the contacted action can update only Last Contact. If company settings metadata enables `contact_touch_sets_next_contact`, the function also sets Next Contact to Last Contact plus `contact_touch_next_contact_days`.
- Updated `src/pages/SaasClientDetail.tsx` and `supabase/functions/manage-company-customization/index.ts`: Company Settings now has a Contact cadence automation section with a toggle and days field stored in `company_settings.metadata`.
- Deployed `manage-client-quick-update` and `manage-company-customization` to Supabase project `zjauqflzxzsbpnivzsct`.
- Verification: `npm run build` passed in the hotfix worktree by temporarily symlinking to the main workspace `node_modules`; the symlink was removed before commit. Jay live QA is still pending.

## Moves Method Contact Cadence Coverage Follow-up - 2026-07-06

- Jay asked whether the Company Settings "Set next contact with last contact" rule covers three flows: the new roster contacted button, manual Quick Update edits, and Fathom/call-summary webhook updates.
- Updated `src/pages/Clients.tsx`: roster contacted buttons now use the RetainOS blue treatment; Quick Update only sends Last Contact / Next Contact when the user edits those fields, preventing notes-only updates from accidentally shifting next-contact dates while still allowing the automation to run when Last Contact is manually changed.
- Updated `src/pages/ClientDetail.tsx`: the Program tab's Update Next Steps/Contact modal uses the same touched-field behavior for contact dates.
- Updated/deployed `supabase/functions/ingest-client-call-summary/index.ts`: direct call-summary/Fathom events now set `csm_date_of_next_contact` from the company metadata rule when they update Last Contact.
- Updated/deployed `supabase/functions/manage-integration-review/index.ts`: manually matched/retried call-summary events and reviewed client-update events now apply the same next-contact automation when Last Contact is updated and Next Contact is not explicitly provided.
- Redeployed `manage-client-quick-update`, `ingest-client-call-summary`, and `manage-integration-review` to Supabase project `zjauqflzxzsbpnivzsct`. Verification: `npm run build` passed in the hotfix worktree by temporarily symlinking to the main workspace `node_modules`; the symlink was removed before commit.

## Moves Method Legacy History Visibility Hotfix - 2026-07-06

- Lorcan/Jay flagged that coaches expected old CST call info, transcripts/summaries, and Next Steps history to be visible from the client profile. The MM cutover intentionally kept old CST history mirror-only, but Client Detail > History was only loading app-owned `client_history_events`.
- Live readback confirmed Angela Røren's old CST history rows exist in `backup_company_clients_history` by `client_id`, including a `change_type_code = next-steps` row with the full old Fathom/Next Steps summary.
- Updated `src/pages/ClientDetail.tsx`: History now loads up to 100 app-owned RetainOS events plus up to 100 legacy CST mirror rows for the same client, maps CST rows into the same timeline, sorts newest-first, and labels them as CST history / Imported from CST.
- Added a Calls filter, kept the Next Steps filter, rendered long history values through the existing rich preview/read-more modal, converted raw `<br>` text into readable content, and made plain Fathom/recording URLs clickable.
- Verification: `npm run build` passed in the hotfix worktree by temporarily symlinking to the main workspace `node_modules`; the symlink was removed before commit. No Edge Function deploy required; this is a frontend/history read-path hotfix.

## Moves Method History Edit/Delete Hotfix - 2026-07-06

- Ben/Jay requested CST-style history cleanup controls so a mistaken client action can be corrected from Client Detail > History.
- Updated `src/pages/ClientDetail.tsx`: each manageable history entry now has row actions for Change date and Delete history entry, with a date modal and delete confirmation. The actions work for both app-owned RetainOS history and imported CST mirror history rows.
- Added/deployed `supabase/functions/manage-client-history/index.ts`: role-gated history management for pilot/migrated companies. SuperAdmin/Director/Support can manage company-visible client history; CSMs can manage assigned-client history only. Deletes/updates write `app_audit_events` before/after data for accountability.
- Product note: deleting/changing a history row changes the visible history timeline only; it does not automatically roll back the client's current profile/program fields.
- Verification: `npm run build` passed in the hotfix worktree by temporarily symlinking to the main workspace `node_modules`; `manage-client-history` deployed to Supabase project `zjauqflzxzsbpnivzsct`. Awaiting Jay live QA.

## Moves Method Legacy Health History Visibility Hotfix - 2026-07-06

- Jay QA passed History date/delete controls and flagged that migrated CST Health Scores history was still not visible like Calls and Next Steps.
- Updated `src/pages/ClientDetail.tsx`: legacy CST history rows whose `change_type_code` references Success, Progress, Buy In, health, or outcomes now classify into the Health Scores filter and show the historical score value in the matching score column when possible.
- Increased Client Detail history loading from 100 app-owned / 100 CST rows to 200 app-owned / 500 CST rows and removed the combined 160-row cap so older CST health-score events are not hidden behind high-volume Fathom/Next Steps history.
- Audit clarification: history edit/delete audit lives in internal `app_audit_events`; there is no user-facing audit log page yet.
- Verification: `npm run build` passed in the hotfix worktree. No Edge Function deploy required.
