# RetainOS Roadmap

Living product roadmap for the RetainOS app. Keep this file focused on what has shipped, what is actively being wired, and what should be considered next so future sessions do not restart from scattered memory.

Status key:

- `[x]` Shipped / validated
- `[~]` Built but not closed yet. Every active `[~]` item should carry one or more reason tags:
  - `[qa]` Built and ready for Jay/stakeholder QA.
  - `[polish]` Works, but UX, edge cases, or final fit-and-finish remain.
  - `[downstream]` Data/config exists, but another app surface still needs to consume it.
  - `[mixed]` More than one reason applies; see the item notes.
- `[ ]` Planned
- `[?]` Needs product/data decision
- `[late]` Deliberately deferred until after migration-critical work

Closure rule: when Jay QA passes every stated close condition for a `[~]` item, promote it to `[x]`. If an item still feels open, its reason tag and remaining notes must explain exactly why.

Priority labels:

- `[priority: high]` Migration-critical or pilot/source-of-truth critical.
- `[priority: medium]` Needed before broader migration or important operating polish, but not blocking the current pilot.
- `[priority: low]` Useful in the next 1-2 months, but not required for early migration readiness.
- `[priority: later]` Valuable long-term, but intentionally not urgent while RetainOS is replacing Glide.

## Current Foundation

- `[x]` Vite + React + TypeScript app connected to Supabase backup tables.
- `[x]` Vercel deploys from `main`.
- `[x]` Git identity for this repo is `retainOS <retainOS@users.noreply.github.com>`.
- `[x]` Supabase Edge Function `prepare-login` is deployed for just-in-time Auth user provisioning.
- `[x]` SuperAdmin allowlist:
  - `jay@ethicalscaling.com`
  - `ben@ethicalscaling.com`
  - `darren@amblemind.com`
- `[x]` App is still read-only for business data writes unless explicitly planned otherwise.

## Phase-Based Delivery Plan

Source: `RetainOS_Ethical Scaling I Estimated Roadmap (Client) - Estimated Roadmap.csv`, reviewed for phase/order only. Ignore estimates in this roadmap; use this section to decide what to work on next.

My take: the scoping sequence is directionally right. The main RetainOS-specific adjustments are:

- AI should stay post-live and should not block the first 2-3 migrated companies.
- Offline functionality should stay later/nice-to-have, not before reporting and notifications.
- Dashboard and reporting should be validated earlier than the CSV implies because they prove whether client lifecycle data is flowing correctly.
- Zapier needs two separate tracks:
  - SaaS company provisioning, if needed.
  - Client creation webhook with required server-validated `company_id`.

### Phase 0: Shipped Read-Only Foundation

Goal: prove RetainOS can read real mirrored data, enforce hierarchy, and give SuperAdmin/company users useful local/live access.

- `[x]` App setup.
- `[x]` Supabase connection to mirrored backup tables.
- `[x]` Login/auth foundation with just-in-time user provisioning.
- `[x]` Role hierarchy and company scoping.
- `[x]` SuperAdmin global access and View As company.
- `[x]` SaaS Clients list/detail read-only foundation.
- `[x]` Clients list/card read-only foundation.
- `[x]` Client detail read-only foundation.
- `[x]` Contracts, program, outcomes, pathways/milestones, and tasks read-only wiring where available.
- `[x]` Tasks board/list read-only foundation.
- `[x]` Dashboard read-only foundation.
- `[~]` `[polish]` Admin/team management surfaces exist; Ethical Scaling pilot team writes are enabled through a controlled server path.

### Phase 1: Write-Mode Data Foundation And Admin Configuration

Goal: define the Supabase-native source of truth before enabling real CRUD.

- `[~]` `[mixed]` Finalize app-owned database structure and migration/backfill plan.
  - Working plan: `SUPABASE_WRITE_PLAN.md`.
- `[~]` `[mixed]` Define RLS/server-side authorization for all write paths.
- `[~]` `[mixed]` Start write mode through controlled Edge Functions for first flows, then add direct RLS-backed writes only after policies are proven.
- `[~]` `[qa]` Use Ethical Scaling as the first internal controlled pilot company.
  - Pilot schema/backfill/QA artifacts:
    - `supabase/migrations/20260529120000_write_mode_pilot_foundation.sql`
    - `scripts/seed-ethical-scaling-pilot.mjs`
    - `scripts/qa-ethical-scaling-pilot.mjs`
    - `QA_WRITE_MODE_PILOT.md`
- `[~]` `[downstream]` `[priority: high]` Remove Ethical Scaling-only assumptions before broader rollout.
  - Move successful pilot companies from `migration_status = 'pilot'` to `migration_status = 'migrated'`.
  - Keep non-migrated companies at `migration_status = 'mirror_only'`.
  - Generalize pilot scripts to accept a company identifier.
  - 2026-06-07: generic reconciliation command supports company name, app company id, and legacy Glide company id.
- `[ ]` `[priority: medium]` Convert SaaS Client/company management from disabled UI to controlled writes.
- `[ ]` `[priority: medium]` CRUD SaaS Clients.
- `[ ]` `[priority: medium]` SaaS Clients list filters: active, paused, archived.
- `[x]` Ethical Scaling pilot CRUD company team members.
  - Pilot create/update/archive uses `supabase/functions/manage-company-member`.
  - Archived members are visible through the Team tab Active/Archived toggle.
  - Broader rollout still needs generalized company migration and final authorization hardening.
  - Non-pilot companies remain read-only from the Glide mirror.
- `[~]` `[mixed]` `[priority: high]` Company customization:
  - App-owned outcome definitions and churn reasons are live for pilot/migrated companies.
  - Admin Hub / SaaS Company Detail > Customization can edit pilot/migrated company definitions; mirror-only companies remain read-only.
  - Client Outcomes dropdowns prefer app-owned company definitions for pilot/migrated companies.
  - Remaining: custom fields, notification settings, richer client/account management settings, client list view columns, and final UX polish.
- `[~]` `[polish]` `[priority: high]` Company Pathways & Milestones setup:
  - App-owned `company_offers` and `company_offer_milestones` tables seed pilot/migrated companies from Glide once.
  - Admin Hub / SaaS Company Detail lists offers and their ordered milestones.
  - Directors and SuperAdmins can create, edit, and archive offers/milestones for pilot companies.
  - Offers/milestones assigned to active clients cannot be archived until those clients move elsewhere.
  - Reorder controls, active-client usage counts, archive blockers, and restore/unarchive are live for pilot companies.
  - Mirror-only companies retain a read-only Glide fallback.
  - Remaining: drag/drop reorder as later UI/UX polish, secondary offers after primary pathway validation, and hard-delete cleanup only with explicit approval.
- `[~]` `[mixed]` `[priority: high]` Company settings:
  - Client workspace defaults now save and apply profile upkeep freshness days, default client view, and default calendar mode for pilot/migrated companies.
  - Clients roster uses the default list/card/calendar view when there is no stronger cached user preference.
  - Clients calendar uses the default month/week/day mode when there is no stronger cached user preference.
  - CSM Reports Field Upkeep uses the company freshness window while report rows/update rate keep using the selected report date range.
  - Feature settings now save secondary assignee, Call AI for CSMs, embed, and Zapier client-create flags.
  - V1 QA passed on 2026-06-08 after fixing stale roster cache behavior.
  - Remaining: dashboard/client-list preference consumption beyond current defaults, client list column presets, call/communication settings, and notification preferences.
- `[ ]` `[priority: medium]` SaaS Client archive/offboard flow.
- `[ ]` `[priority: medium]` Zapier SaaS company automation, if this remains needed.

### Phase 2: Client Lifecycle MVP

Goal: one company can manage real clients in RetainOS without relying on Glide for day-to-day fulfillment tracking.

- `[~]` `[qa]` Run first client lifecycle write tests against the Ethical Scaling pilot company.
  - First pilot write is Quick Update history via `client_history_events`.
- `[~]` `[qa]` App-owned clients current-state table and Ethical Scaling backfill.
  - `clients` now holds 154 Ethical Scaling pilot rows backfilled from `backup_company_clients`.
  - Clients list/detail prefer app-owned `clients` for pilot/migrated companies and fall back to the Glide mirror elsewhere.
- `[~]` `[polish]` `[priority: medium]` CRUD Clients.
  - New Client v1 is enabled for app-owned pilot/migrated companies through `manage-client-create`.
  - SuperAdmin/Director/Support can create company clients.
  - CSMs can create clients, but the server assigns the created client to that CSM.
  - Client Status Lifecycle v1 is enabled through `manage-client-status`.
  - Status changes use existing program statuses: Front End, Back End, Paused, Suspended, Offboarded.
  - Paused/Suspended/Offboarded require a typed reason; Paused requires a return date and extends app-owned contract dates.
  - Remaining CRUD gaps: richer field coverage, archive/delete beyond lifecycle statuses, and bulk import.
- `[~]` `[qa]` Clients list/card views and filters exist; Ethical Scaling now reads app-owned client rows.
- `[x]` Clients calendar view and filters.
- `[~]` `[polish]` `[priority: medium]` Client detail general information write flow.
  - Ethical Scaling pilot has profile edit v1 through `manage-client-profile`.
  - SuperAdmin/Director/Support can edit company clients; CSM can edit assigned clients only; Viewer is read-only.
  - Fields: client name, business name, email, archetype, North Star, and Director Notes for SuperAdmin/Director only.
- `[~]` `[polish]` `[priority: high]` CRUD client contracts.
  - New Contract v1 is enabled for app-owned pilot/migrated clients through `manage-client-contract`.
  - Creates app-owned `client_contracts`, updates the app-owned client current contract summary, and writes history/audit events.
  - Contract renewal prompt v1 is live for active clients whose contract ends within 30 days.
  - New Contract can record a same-program renewal or Front End to Back End upsell through `client_retention_recorded` history.
  - Renewal/upsell can optionally mark Success on the client outcome.
  - QA: Jay validated this flow on Shaan Kassam on 2026-06-04.
  - 2026-06-08: reusable reconciliation now includes `contractConfidence` and `renewalConfidence` sections for company-by-company migration trust.
  - Remaining gaps: richer multi-contract/LTV reporting, high-fidelity renewal UX, automated renewal notifications, and applying historical contract backfill only after dry-run review.
- `[~]` `[mixed]` `[priority: medium]` CRUD client program.
  - Status/program lifecycle v1 supports Front End, Back End, Paused, Suspended, and Offboarded for app-owned pilot/migrated clients.
  - Remaining gaps: program setup/configuration, status notifications, and deeper dashboard/reporting validation.
- `[~]` `[polish]` `[priority: medium]` CRUD client outcomes.
  - Client Detail > Outcomes has Edit Outcomes v1 for app-owned pilot/migrated clients.
  - Success, Progress, and Buy-in use the same mirrored `backup_choices` dropdown values as Quick Update.
  - `manage-client-outcomes` writes app-owned `clients`, `client_history_events`, and `app_audit_events`; Glide mirror rows remain read-only.
  - Migration `20260605100000_client_outcomes_write_pilot.sql` was applied on 2026-06-05.
  - `manage-client-outcomes` was deployed to RetainOS project `zjauqflzxzsbpnivzsct` on 2026-06-06 and is ready for QA.
  - 2026-06-06 QA found and removed a stale mirrored Progress option, `offtrack`. Supported values are now Success `yes/no` and Progress/Buy-in `green/yellow/red`.
  - Outcomes error handling now displays the real Edge Function response instead of only the generic non-2xx message.
  - QA passed on 2026-06-06: Jay updated Ali Abdaal's Success, Progress, Buy-in, and notes; the values saved and appeared correctly in Client History.
  - Later polish: display friendly outcome labels/colors in History instead of raw lowercase stored values.
  - Remaining gaps: testimonial/review/referral write fields, company-owned outcome definitions, and high-fidelity Outcomes UX.
- `[~]` `[polish]` `[priority: high]` CRUD client pathways and milestones.
  - Pathways & Milestones v1 is enabled through `manage-client-milestone`.
  - App-owned `client_milestones` tracks milestone start date, completion date, duration, and time-to-hit for pilot/migrated clients.
  - SuperAdmin/Director can change the client's current offer/pathway and milestone.
  - Assigned CSMs can start and complete milestones for assigned clients only.
  - Completing a milestone advances to the next configured milestone in the current offer.
  - Client detail timeline is filtered to the active/current offer so unrelated company pathway milestones are not shown.
  - Current offer and current milestone resolve by name, including auto-advanced milestones.
  - Company-level offer/milestone CRUD, ordering controls, archive blockers, and restore/unarchive are live for pilot companies.
  - Remaining gaps: secondary offers, drag/drop reorder polish, final low-fi-aligned UX, and deeper reporting/backfill validation.
- `[ ]` `[priority: low]` CRUD client tasks.
- `[~]` `[qa]` Quick Update write flow.
  - Ethical Scaling pilot writes app-owned history and app-owned client current state; Glide mirror fields remain unchanged.
  - Quick Update intentionally keeps North Star, Next Steps, last contact, and next contact as read-only context. North Star editing belongs in full client profile editing.
  - Success, Progress, and Buy In use dropdowns from mirrored `backup_choices` for the pilot UI.
- `[ ]` `[priority: high]` Bulk upload clients through CSV.
- `[~]` `[qa]` `[priority: high]` Zapier client creation webhook with required server-validated `company_id`.
  - 2026-06-07: `zapier-create-client` Edge Function deployed with JWT verification disabled and protected by `ZAPIER_CLIENT_WEBHOOK_SECRET`.
  - It accepts app-owned company UUID or legacy Glide company id, creates app-owned clients, optional initial contract, history, and audit events.
  - Remaining: set Supabase secret, create Zapier QA zap, test idempotency/external id, and add stakeholder-facing setup instructions.
- `[~]` `[qa]` `[priority: medium]` Profile upkeep scoring.
  - CSM Reports v1 exists for active clients with six-field freshness.
  - Dashboard duplicate was removed so Dashboard stays focused on KPI/chart reporting and CSM Reports owns field-upkeep compliance.
- `[~]` `[qa]` Client history/change log.
  - Client Detail now has a pilot `History` tab for RetainOS Quick Update events.

### Phase 3: Operations, QC Reporting, And Migration Readiness

Goal: Directors, CSMs, and Support can run the operating cadence: client follow-up, CSM compliance, dashboard validation, and migration-critical reporting.

Next session lock:

- `[x]` Dashboard performance pass after canonical KPI/drill-through wiring.
  - Dashboard Overview no longer loads hidden chart/upkeep/task datasets on first page load.
  - Dashboard Profile Upkeep duplicate was removed; CSM Reports remains the source for field-upkeep compliance.
  - Charts now lazy-load their heavier client/task/offer/capacity dataset when the Charts tab is opened.
  - Keep canonical KPI RPC as the source for card counts.
  - 2026-06-09 Moves Method demo optimization: mirror-only default Dashboard views use the lighter split KPI path unless offer/multi-program/app-owned filters require canonical calculations. This is a walkthrough-safe speed fix, not the final migration-grade reporting architecture.
  - Final migration-grade fix: move large-company dashboard counts, retention/renewal calculations, drill-throughs, and chart breakdowns into optimized canonical Supabase reporting RPCs/views with appropriate indexes or summaries before broad customer migration.
- `[x]` Ethical Scaling reconciliation pass before pilot rollout.
  - Command: `npm run pilot:reconcile:ethical-scaling`.
  - 2026-06-06 result: `rolloutGate.readyForPilot = true`, with no blockers.
  - Confirmed 154 mirrored clients and 154 app-owned clients, with no missing/extra client rows.
  - 2026-06-07 post-Supabase Micro recovery result: `rolloutGate.readyForPilot = true`, with no blockers.
  - After the final backup sync, five mirrored front-end clients were missing from app-owned `clients`; they were inserted with the safe missing-only seed path so existing pilot edits were not overwritten.
  - Confirmed 159 mirrored clients and 159 app-owned clients, with no missing/extra client rows.
  - Confirmed zero invalid active CSM assignments.
  - Confirmed active clients have app-owned offer and milestone configuration available.
  - Non-blocking notes: invalid assignments exist only on offboarded clients; archived pilot/test offer and milestone rows exist app-side; historical mirrored contracts and client milestones are not fully app-backfilled yet.
  - 2026-06-07: historical activity backfill dry-run script added. Ethical Scaling dry-run found 1 contract and 34 client milestone rows ready to backfill for active/pilot-relevant clients, with 0 unresolved milestone offer mappings. Applying remains an explicit review gate.
  - 2026-06-08: `scripts/reconcile-company-pilot.mjs` now supports `--renewal-start` / `--renewal-end` and reports contract/renewal confidence. Live Ethical Scaling run for 2026-06-08 to 2026-07-08 returned `rolloutGate.readyForPilot = true`; it identified missing historical mirrored contract/client milestone backfill as non-blocking notes, not pilot blockers.
  - Remaining product/process decision: pilot-week source-of-truth rules so RetainOS and Glide do not receive conflicting edits.
- `[~]` `[downstream]` `[priority: high]` Reduce Glide mirror dependency for Ethical Scaling pilot surfaces after reconciliation is clean.
  - Keep mirror fallback for non-pilot companies.
  - For Ethical Scaling pilot users, prefer app-owned tables wherever the app-owned equivalent exists.
  - Track any remaining backup-table reads that are still required only because the app-owned table is not built yet.
  - 2026-06-07 checkpoint:
    - Login provisioning and browser account resolution now prefer app-owned `company_members`.
    - CSM/team dropdowns on Clients, CSM Reports, Dashboard, and Tasks now prefer app-owned `company_members` for pilot/migrated companies.
    - `prepare-login` was deployed and smoke-tested with Emily's pilot email.
    - Remaining likely mirror dependencies: company list/search shell, mirrored choices/status definitions, historical contracts, historical milestone rows, legacy tasks, and legacy dashboard history/contract calculations where app-owned equivalents are incomplete.

- `[~]` `[polish]` Task manager board/list exists and now includes New Task v1 for app-owned pilot/migrated companies.
- `[~]` `[polish]` `[priority: low]` CRUD Tasks.
  - New Task v1 creates app-owned `client_tasks` through `manage-client-task`.
  - Task update/complete/dismiss is intentionally deferred. It will be needed later, but it is not core to the Ethical Scaling pilot because Ethical Scaling barely uses tasks today.
  - Remaining later gaps: edit/update status, complete, dismiss/archive, recurring rules, notifications.
- `[ ]` `[priority: low]` Tasks list/board filters for entire SaaS company.
- `[ ]` `[priority: low]` Task due dates, assignments, overdue state, and notifications.
- `[~]` `[qa]` CSM Reports list view and filters.
  - Standalone `/csm-reports` page exists for SuperAdmin, Director, and Support.
  - V1 filters: company, CSM, Today, last 7/14/30 days, and custom date range.
  - Updated vs non-updated is based on app-owned `client_history_events` inside the selected date range.
  - Active-client denominator and active client-manager roster were QA-cleaned on 2026-06-02.
- `[ ]` `[priority: medium]` CSM in-progress details.
- `[ ]` `[priority: later]` CSM Reports AI summary can remain later if AI is not live.
- `[~]` `[qa]` `[priority: medium]` Dashboard KPIs/charts exist; validate against canonical formulas.
  - Charts read app-owned clients for pilot/migrated companies and fall back to the Glide mirror for mirror-only companies.
  - KPI cards now try `dashboard_kpi_counts_canonical` first, including offer and multi-program filters, then fall back to the prior app-owned/legacy calculation if the canonical RPC errors.
  - Performance follow-up v1 completed on 2026-06-06: Overview avoids hidden chart/upkeep loads and Charts lazy-loads heavier datasets by active tab.
  - App-owned offboarded, retention, and renewal/up-for-renewal formulas were hardened against Ethical Scaling pilot data sources.
  - Retention now includes `client_retention_recorded` events for same-program renewals.
  - Program filter supports multi-select.
  - Program Distribution, Buy-in, Progress, and Clients By Offer support client-list drilldowns.
- `[ ]` `[priority: medium]` Dashboard advanced filtering and sorting.
  - Capture Ben pilot feedback: dashboard views should eventually support more operational filtering/sorting directly inside the dashboard.
  - First named use case: show only upcoming renewals from dashboard metrics/drilldowns.
  - Not urgent for pilot because renewal dates can already be sorted elsewhere, but likely to become a common coach/CSM request as usage grows.
  - Future examples: filter chart/list views by renewal window, risk/status, offer, CSM, and operational follow-up buckets without forcing users back to Clients list.
- `[~]` `[qa]` `[priority: medium]` Dashboard CSM list/workload/capacity views.
  - CSM Active Client Workload counts active clients by active client-managing CSM.
  - CSM Capacity displays active clients versus configured team-member capacity.
- `[~]` `[qa]` `[priority: medium]` Dashboard canonical formula validation.
  - Validate active, front-end/back-end, offboarded, churn, retention, renewal, workload, and capacity definitions against Ethical Scaling pilot data.
  - Working spec: `DASHBOARD_FORMULA_VALIDATION.md`.
  - Draft SQL starting point: `DASHBOARD_CANONICAL_RPC_DRAFT.sql`.
  - Canonical KPI UI integration v1 is wired for Dashboard KPI cards; Jay QA against live Ethical Scaling data is still needed before marking shipped.
  - Remaining gaps: charts/client drill-throughs still use client-row calculations; decide later whether those should move to canonical reporting views too.
- `[x]` Client contact calendar.
  - V1 exists as a Calendar view on `/clients`, beside List and Cards.
  - Day, Week, and Month modes exist.
  - Populated from onboarded date, renewal date, date of last contact, date of next contact, and linked task due dates.
  - Scoped by current company, CSM, program/status, offer, client search, and secondary assignee filters.
  - Jay QAed it as working on 2026-06-03.
- `[~]` `[qa]` `[priority: medium]` Profile upkeep scoring.
  - V1 exists on Dashboard Overview.
  - Score active clients only.
  - Score as a percentage, not binary updated/not updated.
  - Freshness window now comes from Company Settings for pilot/migrated companies, with 14 days as fallback/default.
  - Required fields: Next Steps, Milestone, Date of Last Contact, Date of Next Contact, Progress, and Buy-in.
  - Current implementation uses recent app-owned `client_history_events` first, with current client date fields as fallback where available.
  - Dashboard v1 includes clickable field drilldowns and a clickable complete/incomplete profile drilldown.
  - CSM Reports now includes a Field Upkeep section as the operational/compliance home, using the company freshness window and separating client-level update rate from field-level upkeep score.
  - Remaining gaps: Jay QA with Ethical Scaling in CSM Reports after configurable-window wiring and eventual canonical SQL/RPC calculation.
- `[~]` `[qa]` `[priority: medium]` Daily Pulse operating page for CSMs.
  - Purpose: a persistent daily operating view, distinct from dismissible notifications.
  - Suggested buckets: Today, This Week, and This Month, with expandable sections to avoid clutter.
  - Today examples: clients needing contact today, paused clients resuming today, renewals due today without a new contract/retention event, churn-risk clients, RGA candidates, and profiles with no update in 30+ days.
  - This Week examples: calendar-week paused returns, renewals, churn-risk clients, RGA candidates, and profiles with no update in 14+ days.
  - This Month examples: calendar-month paused returns, renewals, and profiles with no update in 30+ days.
  - Churn-risk draft rule: red Progress or Buy-in for longer than the configured window.
  - RGA draft rule: green Progress or Buy-in for longer than the configured window.
  - V2 page exists at `/daily-pulse` and is linked in the sidebar for company-scoped roles.
  - V2 is read-only, role-scoped, expandable by section, and client cards link into client detail.
  - CSM users see only assigned/secondary-assigned clients.
  - SuperAdmin, Director, and Support users see the selected company by default and can filter the page by active client-managing CSM.
  - V2 combines Progress and Buy-in signals into one card per client to avoid duplicate RGA/churn cards.
  - V2 uses local page calculations from current client rows plus app-owned history where available; canonical SQL/RPC can come after UX validation.
  - Future Company Settings / Customization option: Directors can choose which Daily Pulse sections are visible for their company.
- `[ ]` `[priority: medium]` Dashboard HTML export.

### Phase 4: Resources, User Management, Notifications, And Migration Readiness

Goal: prepare RetainOS for real customer migration, support operations, and repeatable company setup.

- `[ ]` `[priority: medium]` CRUD Resources.
- `[ ]` `[priority: medium]` Resource list/search/categorization.
- `[ ]` `[priority: medium]` User Management CRUD Users.
- `[ ]` `[priority: medium]` Invite/provisioning flow for bulk/team users.
- `[~]` `[priority: medium]` Notifications: in-app, email, and future push.
  - V1 foundation added app-owned `notifications` and `notification_preferences`, plus an idempotent generator for next contact, renewal, paused return, and client-linked task due reminders for pilot/migrated companies.
  - The Clients notification surface now reads from the notification source of truth where available and falls back to current client fields if the migration/RPC is unavailable.
  - Local-only prototype replaced the wide Clients pilot reminder strip with a compact bell/dropdown in the Clients header; Jay QAed the direction as feeling right.
  - Email delivery and full inbox remain intentionally disabled until read/dismiss/counts and delivery preferences are QAed.
- `[ ]` `[priority: medium]` Reporting PDF generation:
  - Semi-monthly churn-risk / renewals / RGAs PDF.
  - Weekly CSM Metrics PDF.
- `[ ]` `[priority: high]` Final migration validation with pilot company.
- `[ ]` `[priority: high]` Parallel run with Glide before cutover.
- `[ ]` `[priority: high]` Cutover and rollback plan.

### Phase 5: AI, Advanced Automations, Billing, And Later Enhancements

Goal: add higher-tier intelligence and scale features after the first migrated companies are stable.

- `[ ]` `[priority: later]` Groups / cohort management.
  - Deliberately late priority. Groups can be built after client migration because it is not blocking the Ethical Scaling pilot or early client migrations.
  - Future scope: CRUD groups, group list/detail views, group-client assignment flow, and group-scoped filters/reporting.
- `[ ]` `[priority: later]` Call AI filters and list view.
- `[ ]` `[priority: later]` Add new meeting transcript and run AI manually.
- `[ ]` `[priority: later]` Automatic transcript ingestion through Fathom or equivalent.
- `[ ]` `[priority: later]` Fixed AI prompts managed only by SuperAdmin.
- `[ ]` `[priority: later]` Company-specific prompts for Pro/Enterprise, built by CST Dev Team.
- `[ ]` `[priority: low]` Dashboard AI Insights generation.
- `[ ]` `[priority: later]` Call AI summaries, red flags, green lights, sentiment, archetype, and call score.
- `[ ]` `[priority: medium]` Automated flagging for churn risk, renewals, and RGAs.
- `[ ]` `[priority: later]` Stripe billing/subscriptions and tier enforcement.
- `[ ]` `[priority: later]` Google SSO.
- `[ ]` `[priority: low]` Offline functionality.
- `[ ]` `[priority: low]` Dark mode.

## Functional Product Map

Source: scoping team functional overview shared on 2026-05-29.

Use this as the top-level product taxonomy. The detailed sections below track implementation status, data-model decisions, and final migration validation.

### Core Features

#### Client Management System

- `[x]` Company-scoped client roster.
- `[x]` Client search, filtering, list view, and card/detail view.
- `[x]` Client detail read-only profile.
- `[x]` Client status/program display and filtering.
- `[x]` Contract read-only display with renewal-related fields where available.
- `[x]` Offer filter and offer/milestone read-only mapping.
- `[x]` Multiple assignee/CSM filtering, including secondary assignee matches.
- `[ ]` `[priority: medium]` Create clients manually.
- `[ ]` `[priority: high]` Create clients via CSV import.
- `[ ]` `[priority: high]` Create clients automatically through Zapier webhook with required server-validated `company_id`.
- `[ ]` `[priority: later]` Support individual client and group/cohort client management models.
- `[ ]` `[priority: medium]` Assign multiple CSMs to a single client for different service offerings.
- `[~]` Quick Update write workflow for recording client interactions.
  - Pilot stores next steps, contact dates, outcome/status values, and notes in `client_history_events`.
  - Pilot also updates the app-owned `clients` current-state row for next steps, contact dates, and outcome values.
  - Pilot outcome dropdowns currently read from mirrored Glide choices; app-owned company outcome definitions are still planned.
- `[~]` Profile upkeep scoring based on last update timestamps across key fields.
  - Dashboard Overview v1 uses recent RetainOS history events and current client date fields for Ethical Scaling pilot data.
- `[x]` Client calendar view.
- `[~]` Client lifecycle actions: active, paused, suspended, offboarded.
  - Pilot supports status writes through `manage-client-status`; needs QA and later notification/report integration.

#### Dashboard And Analytics

- `[x]` Dashboard view with KPI groups and charts.
- `[x]` Role-aware dashboard access.
- `[x]` Company, CSM, program/status, date, and offer-style filtering where currently wired.
- `[x]` Active client and status/program reporting where source data is available.
- `[~]` Retention and churn reporting exist; app-owned UI path was hardened for Ethical Scaling, but still needs canonical Supabase formulas before broad write-mode rollout.
- `[~]` CSM workload/capacity areas exist conceptually but need final formula and data validation.
- `[ ]` `[priority: medium]` CSM performance reports.
- `[ ]` `[priority: medium]` At-risk client identification and tracking.
- `[ ]` `[priority: later]` Tier-based dashboard customization.
- `[ ]` `[priority: low]` Real AI Insights for higher subscription tiers.
- `[ ]` `[priority: medium]` Real-time data generation behavior without manual refresh requirements.

#### Call AI Integration

- `[ ]` `[priority: later]` AI usage can launch after initial go-live.
  - Not a blocker for the first 2-3 migrated companies.
  - Initial migration can proceed without full AI automation if core client, dashboard, task, and reporting workflows are stable.
- `[ ]` `[priority: later]` Upload and process meeting transcripts manually.
- `[ ]` `[priority: later]` Automatically ingest meeting transcripts through Fathom or equivalent integration.
- `[ ]` `[priority: later]` Fixed AI prompts for sentiment analysis, call grading, and summaries.
- `[ ]` `[priority: later]` Company-specific custom prompts for tailored analysis.
- `[ ]` `[priority: later]` On-demand analysis for specific call scenarios.
- `[ ]` `[priority: later]` Call sharing between team members.
- `[ ]` `[priority: later]` Weekly automated reports on call analysis metrics.
- `[ ]` `[priority: later]` Red flag identification and escalation alerts.

#### Task Management

- `[x]` Top-level Tasks page.
- `[x]` Board and list task views.
- `[x]` Task filtering by open/all/closed and search.
- `[x]` CSM task scoping for assigned work.
- `[x]` Client detail Tasks tab wired read-only.
- `[~]` Create tasks with due dates and team assignments.
  - New Task v1 creates app-owned tasks with due dates and assignment; update/complete/dismiss is deferred.
- `[ ]` `[priority: low]` Update task status: pending, completed, overdue.
- `[ ]` `[priority: low]` Task assignment and due-date notifications.
- `[ ]` `[priority: medium]` Clarify company-level tasks versus client-linked tasks in write mode.

#### Offer And Milestone Tracking

- `[x]` Company offer filter from mirrored offer data.
- `[x]` Client detail resolves offer IDs and milestone rows.
- `[~]` Progress tracking through predefined client pathways.
  - Pilot v1 writes client milestone progress to app-owned `client_milestones`.
  - Completing a milestone advances to the next configured milestone in the active offer.
  - Client detail timeline is filtered to the client's active/current offer.
- `[~]` Manual milestone completion.
  - Start and complete actions support date override.
  - Call-based milestone completion is not started.
- `[~]` Historical tracking of time spent in each milestone.
  - V1 stores duration and time-to-hit on `client_milestones`.
  - Needs dashboard/reporting validation before marking complete.
- `[ ]` `[priority: high]` Company-specific offer definitions in RetainOS write mode.
- `[ ]` `[priority: high]` Offer-specific milestone definitions.
- `[ ]` `[priority: medium]` Target completion times and automatic milestone-delay flagging.
- `[x]` Quick Update milestone-progress flow matching the intended CSM low-fi workflow.
- `[ ]` `[priority: medium]` Secondary offers/pathways.

### Supporting Features

#### User Authentication And Management

- `[x]` Secure email OTP login.
- `[x]` Just-in-time Auth user provisioning for existing company users.
- `[x]` SuperAdmin global access is not tied to companies.
- `[x]` Company association for team members.
- `[x]` Role-based route and capability gating.
- `[ ]` `[priority: medium]` Full activity logging for audit trails and change history.
- `[ ]` `[priority: later]` Google login.

#### Resource Library

- `[ ]` `[priority: medium]` Centralized resource library.
- `[ ]` `[priority: medium]` External resource link management for videos, docs, links, and training materials.
- `[ ]` `[priority: medium]` Resource access control by user role and company settings.
- `[ ]` `[priority: medium]` Resource search and categorization.

#### Admin Configuration Panel

- `[~]` SuperAdmin SaaS Clients and company Team tab exist; pilot Team writes are enabled for app-owned companies only.
- `[ ]` `[priority: high]` Custom field creation with text, dropdown, date, boolean, and future field types.
- `[ ]` `[priority: high]` Outcome definitions for success, progress, and buy-in.
- `[ ]` `[priority: high]` Notification preferences and automation settings.
- `[~]` Team member management and role assignments.
- `[ ]` `[priority: high]` Company customization tabs:
  - Customization.
  - Pathways & Milestones.
  - Company Settings.

#### Automated Workflow Engine

- `[ ]` `[priority: medium]` Churn risk identification from buy-in/progress status and milestone delays.
- `[~]` Renewal notifications/prompts for contracts expiring within 30 days.
  - Client Detail > Contract now shows a local renewal prompt for active clients within 30 days of contract end.
  - Automated notifications remain future work.
- `[ ]` `[priority: medium]` Revenue-generating activity alerts for eligible clients.
- `[ ]` `[priority: medium]` Monthly dashboard reports delivered automatically.
- `[ ]` `[priority: medium]` Summary notifications for client conditions.
- `[ ]` `[priority: medium]` Real-time notifications for immediate issues and periodic reminders.

#### Reporting, Exports, And Imports

- `[ ]` `[priority: medium]` Report template system.
  - Initial target: 2 distinct report templates/types.
  - Templates to be provided by Jay as core examples.
- `[ ]` `[priority: medium]` PDF report generation.
- `[ ]` `[priority: medium]` Semi-monthly client opportunity/risk PDF.
  - Schedule: every 1st and 14th.
  - Recipients: CSMs and Director.
  - Contents: clients at churn risk, clients up for renewal, and RGAs.
- `[ ]` `[priority: medium]` Weekly CSM Metrics PDF.
  - Schedule: every Monday.
  - Recipient: Director.
  - Contents: Avg. Time to Success per CSM, Updated vs. Non-Updated Profiles, and other metrics from the data sheet.
- `[ ]` `[priority: medium]` Custom HTML export of Dashboard.
- `[ ]` `[priority: high]` CSV upload and parse flow.
- `[ ]` `[priority: medium]` User bulk upload flow.

#### Billing And Subscription Management

- `[ ]` `[priority: later]` Stripe integration.
- `[ ]` `[priority: later]` Monthly recurring billing.
- `[ ]` `[priority: later]` Tier-based feature access.
- `[ ]` `[priority: later]` Subscription upgrade/downgrade workflow through SuperAdmin.
- `[ ]` `[priority: later]` Usage monitoring and tier limit enforcement.

### Future / Nice-To-Have

- `[ ]` `[priority: low]` Dark mode.
- `[ ]` `[priority: low]` Offline functionality.

## End-To-End Flow Map

Source: scoping team process-flow and automated-flow overview shared on 2026-05-29.

Use this section to connect feature work into operational flows. A feature is not truly ready unless the relevant flow can be completed by the right role, with the right company scope, and the expected data landing in dashboards, reports, alerts, and history.

### Client Intake And Setup Flow

- `[~]` `[priority: medium]` New client can be created manually.
- `[ ]` `[priority: high]` New client can be imported from CSV with preview and validation.
- `[ ]` `[priority: high]` New client can be created from Zapier with required `company_id`.
- `[~]` `[priority: medium]` Client can be assigned to company, offer, pathway, milestone, CSM, and optional group/cohort.
- `[~]` Client setup captures contract details, start date, end/renewal logic, and external links.
  - New Contract v1 covers this for app-owned pilot/migrated clients from Client Detail > Contract.
- `[ ]` `[priority: medium]` Client appears correctly in roster, dashboard, CSM reports, tasks, and notification logic after creation.

### Quick Update And Client Progress Flow

- `[~]` CSM can complete Quick Update after a client interaction.
  - Pilot server path allows SuperAdmin, Director, Support, and assigned CSMs.
- `[~]` Quick Update can update progress, buy-in, next steps, last contact, next contact, call attendance, notes, and key custom fields.
  - Pilot covers progress, buy-in, next steps, last/next contact, and notes.
  - Call attendance and custom fields remain future work.
- `[~]` Quick Update writes to client history/change log.
  - Pilot writes app-owned `client_history_events`.
- `[~]` Quick Update refreshes profile upkeep scoring.
  - Quick Update history events now feed Dashboard Profile Upkeep Score v1.
- `[ ]` `[priority: medium]` Quick Update changes flow into dashboard KPIs, CSM Reports, alerts, and AI/reporting inputs.

### Quality Control Flow

- `[~]` Dashboard provides quantitative view of company/client health.
  - Overview KPI cards and chart segments can drill into affected client lists where wired.
- `[~]` CSM Reports show system compliance and profile update behavior.
  - Field Upkeep supports field-level and complete/incomplete profile drill-through.
  - CSM Summary rows can drill into that CSM's active client update list.
  - QA passed on 2026-06-06: date ranges, CSM modal, not-updated-first order, and client profile links worked as expected.
- `[ ]` `[priority: later]` Call AI shows call quality and coaching standard signals.
- `[~]` Directors can move from dashboard signal to affected client list to individual profile details.
- `[ ]` `[priority: medium]` CSMs can move from assigned client/task alerts to client updates.
- `[~]` Support can inspect company-wide operational data without AI Insights access.

### Task Manager Flow

- `[x]` Task can be created from company-level context.
- `[~]` Task can be created from client profile context.
  - Current v1 creates from top-level Tasks with an optional client link; direct Client Detail create button is still future.
- `[x]` Task can be assigned to team members with due date and priority/status.
- `[x]` Task appears in the global Task Manager and client profile when linked to a client.
- `[ ]` `[priority: low]` Task status changes update related notifications and reporting.
  - Deferred until task usage becomes a higher pilot priority.
- `[ ]` `[priority: low]` Overdue tasks are flagged and routed to the correct user.

### Contract Renewal And Offboarding Flow

- `[ ]` `[priority: medium]` Contract expiration detection identifies clients up for renewal within configured windows.
- `[ ]` `[priority: medium]` Renewal opportunities can be surfaced to CSMs and Directors.
- `[ ]` `[priority: medium]` Client at churn risk can be flagged from progress/buy-in/milestone delays and related signals.
- `[~]` Client can be paused, suspended, offboarded, or archived through controlled write flows.
  - Pause/Suspended/Offboarded status changes are live for app-owned pilot clients.
  - Archive remains separate/future.
- `[~]` Offboarding updates roster, dashboard, client history, notifications, and reporting.
  - Roster/current profile/history are covered in pilot; notifications/reporting need later validation.

### Automated Flagging Flow

- `[ ]` `[priority: medium]` Automated workflows can find and flag churn-risk clients on configured schedules.
- `[ ]` `[priority: medium]` Automated workflows can find and flag clients up for renewal on configured schedules.
- `[ ]` `[priority: medium]` Automated workflows can find and flag Revenue Generating Activities on configured schedules.
- `[ ]` `[priority: medium]` Scheduled workflow outputs can feed notifications, reports, dashboard indicators, and task creation.
- `[?]` `[priority: medium]` Decide whether automated workflows run in Supabase scheduled functions, N8N, Zapier, or a hybrid approach.

## Sitemap And Navigation Coverage

Source: scoping team sitemap overview shared on 2026-05-29.

Use this section to validate route structure, navigation visibility, and role access. It should stay aligned with the hierarchy matrix and final QA checklist.

### SuperAdmin Sitemap

- `[x]` SaaS Clients list view.
- `[x]` SaaS Client detail view.
- `[~]` New SaaS Client modal exists with disabled submit.
- `[x]` View As / company support flow.
- `[ ]` `[priority: medium]` Resources list view.
- `[ ]` `[priority: medium]` New resource flow.
- `[ ]` `[priority: later]` AI Prompts management for fixed prompts.
  - SuperAdmin has the ability to edit fixed AI prompts.
  - Directors cannot edit fixed prompts.
- `[late]` `[priority: later]` Groups list and detail views across selected company.
- `[x]` Clients list, card, and calendar views across selected company.
- `[~]` `[priority: medium]` New Client flow.
- `[ ]` `[priority: high]` Bulk client upload.
- `[~]` `[priority: medium]` Client detail edit/manage.
- `[x]` Dashboard / KPI dashboard for selected company.
- `[~]` `[priority: low]` Generate AI Insights action exists as placeholder only.
- `[~]` `[priority: medium]` CSM Reports updated-clients list and client detail flow.
- `[ ]` `[priority: later]` Call AI filters/KPIs/analysis list view.
- `[ ]` `[priority: later]` New meeting transcript flow.
- `[ ]` `[priority: later]` Call analysis detail view and share-with-team action.
- `[x]` Tasks list view.
- `[~]` `[priority: low]` New Task flow.
- `[ ]` `[priority: low]` Update Task flow.
- `[x]` Admin Hub / Team Members exists through SaaS Client Team tab and company-side `/admin` route.
- `[~]` New Team User flow.
- `[ ]` `[priority: medium]` User detail edit/manage.
- `[ ]` `[priority: high]` Admin Hub settings:
  - Company settings.
  - Customization.
  - Offers & Milestones.
- `[~]` `[priority: high]` Offers & Milestones list view.
- `[~]` `[priority: high]` New Offer flow.
- `[~]` `[priority: high]` New Milestone flow.

### Director Sitemap

- `[late]` `[priority: later]` Groups list and detail views.
- `[late]` `[priority: later]` New Group flow.
- `[late]` `[priority: later]` Group edit/manage.
- `[x]` Clients list and card views.
- `[x]` Client calendar view.
- `[~]` `[priority: medium]` New Client flow.
- `[ ]` `[priority: high]` Bulk client upload.
- `[~]` `[priority: medium]` Client detail edit/manage.
- `[x]` Dashboard / KPI dashboard.
- `[~]` `[priority: low]` Generate AI Insights action exists as placeholder only.
- `[?]` Confirm whether dashboard should include clients at risk of churn by default for Director.
- `[~]` `[priority: medium]` CSM Reports updated-clients list and client detail flow.
- `[ ]` `[priority: later]` Call AI filters/KPIs/analysis list view.
- `[ ]` `[priority: later]` New meeting transcript flow.
- `[ ]` `[priority: later]` Call analysis detail view and share-with-team action.
- `[x]` Tasks list view.
- `[~]` `[priority: low]` New Task flow.
- `[ ]` `[priority: low]` Update Task flow.
- `[x]` Admin Hub team members.
- `[x]` New Team User flow.
- `[ ]` `[priority: medium]` User detail edit/manage.
- `[ ]` `[priority: high]` Admin Hub settings:
  - Company settings.
  - Customization.
  - Offers & Milestones.
- `[ ]` `[priority: medium]` Resources list view.
- `[ ]` `[priority: high]` Director customization excludes dynamic AI prompts.
  - Director can manage custom fields, outcome definitions, and churn reasons.
  - Director cannot customize dynamic AI prompts.

### CSM Sitemap

- `[late]` `[priority: later]` Groups list and detail views, scoped to own clients where applicable.
- `[x]` Clients list/card access scoped to own clients.
- `[x]` Client calendar view scoped to own clients.
- `[~]` `[priority: medium]` Client detail edit/manage for permitted fields.
- `[x]` Dashboard / KPI dashboard scoped to own clients.
- `[x]` Tasks list view scoped to assigned tasks.
- `[~]` `[priority: low]` New Task flow.
- `[ ]` `[priority: low]` Update Task flow.
- `[ ]` `[priority: later]` Call AI list view for accessible calls.
- `[ ]` `[priority: medium]` Resources list view.
- `[x]` CSM does not access Admin Hub.
- `[x]` CSM does not access SaaS Clients.

### Support Sitemap

- `[late]` `[priority: later]` Groups list and detail views.
- `[late]` `[priority: later]` New Group flow.
- `[late]` `[priority: later]` Group edit/manage.
- `[x]` Clients list and card views.
- `[x]` Client calendar view.
- `[~]` `[priority: medium]` New Client flow.
- `[ ]` `[priority: high]` Bulk client upload.
- `[~]` `[priority: medium]` Client detail edit/manage for permitted fields.
- `[x]` Dashboard / KPI dashboard.
- `[x]` Support cannot access AI Insights.
- `[x]` Tasks list view.
- `[~]` `[priority: low]` New Task flow.
- `[ ]` `[priority: low]` Update Task flow.
- `[ ]` `[priority: later]` Call AI list view.
- `[ ]` `[priority: later]` New meeting transcript flow.
- `[ ]` `[priority: later]` Share call analysis with team.
- `[ ]` `[priority: medium]` Resources list view.
- `[x]` Support does not access SaaS Clients.
- `[?]` Confirm whether Support should access Admin Hub/team/settings or only operational areas.

### Viewer Sitemap

- `[late]` `[priority: later]` Groups list and detail views.
- `[x]` Clients list and card views.
- `[x]` Client calendar view.
- `[x]` Dashboard / KPI dashboard.
- `[ ]` `[priority: medium]` Resources list view.
- `[x]` Viewer is read-only.
- `[x]` Viewer does not see Quick Update.
- `[x]` Viewer does not access Tasks, Call AI, CSM Reports, Admin Hub, or SaaS Clients.

## Hierarchy Matrix Coverage

This section maps the CSV hierarchy matrix against the current app. Use it to decide what to build next without re-reading every CSV. Checked against `Datasheet - Ethical Scaling - User Matrix.csv` and `Datasheet - Ethical Scaling - User Matrix (1).csv`.

### SaaS Clients / Companies

- `[x]` SuperAdmin can view existing SaaS Clients / Companies.
- `[x]` SaaS Clients area is hidden from Director, CSM, Support, and Viewer.
- `[~]` SuperAdmin can open Add SaaS Client modal for UX testing, but Submit is disabled.
- `[~]` SuperAdmin can open SaaS Client details and Team tab, but edit actions are disabled.
- `[ ]` Create new SaaS Client.
- `[ ]` Edit existing SaaS Client.
- `[ ]` Remove / delete / block / archive SaaS Client.
- `[ ]` Manage SaaS Client subscription.

### Clients

- `[x]` SuperAdmin, Director, Support, and Viewer can see all clients for their scoped company.
- `[x]` CSM can see only assigned clients.
- `[x]` All roles with Clients access can filter and search the client list.
- `[x]` List and card views are available.
- `[ ]` Calendar view.
- `[ ]` Create new client for SuperAdmin and Director.

### Client Details

- `[x]` All roles with Clients access can open and view client profiles.
- `[x]` Quick Update is visible for SuperAdmin, Director, CSM, and Support.
- `[x]` Viewer does not see Quick Update.
- `[x]` Director Notes are visible only to SuperAdmin and Director.
- `[x]` Client contract data is visible read-only.
- `[x]` Client task data is visible read-only.
- `[x]` Program, Outcomes, Pathways, and Milestones are visible read-only.
- `[~]` Quick Update write flow.
- `[ ]` Edit client details.
- `[ ]` Manage / edit offers and milestone statuses.
- `[ ]` Manage / edit program.
- `[ ]` Update Outcomes.
- `[ ]` See client update history.
- `[ ]` Update dates of last / next contact.
- `[ ]` Track call attendance.
- `[ ]` Edit North Star and Next Steps.
- `[ ]` Create, assign, and update client tasks.
- `[ ]` View archived tasks in client context.
- `[~]` Create / update contracts for client.
  - Create is live for the Ethical Scaling pilot; update/edit is still planned.
- `[ ]` Delete Forever client for SuperAdmin and Director.

### Call AI

- `[ ]` Add new call transcript to analyze for SuperAdmin, Director, and Support.
- `[ ]` View past analyzed meetings for SuperAdmin, Director, and Support.
- `[ ]` Share call analysis with team for SuperAdmin, Director, and Support.
- `[ ]` See call analysis shared with me for Director, CSM, and Support.
- `[ ]` Define AI prompt inventory and versioning before wiring generation.

### CSM Reports

- `[~]` CSM Reports dashboard for SuperAdmin, Director, and Support.
  - V1 standalone route: `/csm-reports`.
  - CSM users do not access this page in v1.
- `[~]` Filters for CSM Reports dashboard.
  - Company, CSM, last 7/14/30 days, and custom date range.

### KPI Dashboard

- `[x]` SuperAdmin and Director can view company-wide KPIs.
- `[x]` Support can view/filter company-wide KPIs.
- `[x]` CSM can view assigned-client dashboard data.
- `[x]` SuperAdmin and Director can see AI Insights tab.
- `[x]` Support and CSM cannot access AI Insights.
- `[ ]` Real AI Insights generation.
- `[?]` Confirm whether Support should remain company-wide on KPI dashboard, since matrix only explicitly grants company-wide KPIs to SuperAdmin and Director but separately grants Support dashboard filtering.

### Tasks

- `[x]` Tasks page is available to SuperAdmin, Director, CSM, and Support.
- `[x]` Board and list views are available.
- `[x]` Open / All / Closed filters are available.
- `[x]` Search is available.
- `[x]` CSM sees assigned tasks.
- `[~]` SuperAdmin, Director, and Support currently see company-wide tasks, not only creator/assigned related tasks.
- `[ ]` Manage / update tasks.
- `[?]` Confirm whether “my related tasks” should restrict SuperAdmin, Director, and Support to creator/assigned tasks or remain company-wide for operational visibility.

### Company Customization

- `[ ]` Create and manage custom fields for SuperAdmin and Director.
- `[ ]` Manage / edit churn reasons for SuperAdmin and Director.
- `[ ]` Manage / edit outcome definitions for SuperAdmin and Director.
- `[ ]` Create / manage fixed AI prompts for SuperAdmin.
- `[ ]` Create / manage dynamic AI prompts for SuperAdmin.
- `[ ]` Manage / edit team and CSM capacity for SuperAdmin and Director.

## Shipped Features

### Login And Hierarchy

- `[x]` RetainOS low-fi login page with email OTP flow.
- `[x]` Login preflight checks SuperAdmin allowlist or active `backup_company_team` membership.
- `[x]` Existing company users are auto-created in Supabase Auth on first login.
- `[x]` SuperAdmin is global and not tied to a company.
- `[x]` Company users resolve from active `backup_company_team` rows.
- `[x]` Role mapping:
  - `role_id = 1` Director
  - `role_id = 2` Support
  - `role_id = 3` CSM
  - `role_read_only_user = true` Viewer
- `[x]` Multiple active company memberships block login until cleaned up.
- `[x]` Header navigation is role/capability gated.
- `[x]` SuperAdmin can View As a company for support testing.

### Clients

- `[x]` `/clients` client roster.
- `[x]` Company-scoped roster memory with explicit user override tracking for view/calendar defaults.
- `[x]` Program/status filters with shared visual mapping.
- `[x]` CSM and secondary assignee filters.
- `[x]` Offer filter from `backup_company_offers`.
- `[x]` Server-side sorting by client name, onboarded date, and renewal date.
- `[x]` CSM users only see assigned clients, including secondary assignee matches.
- `[x]` Viewer role hides Quick Update.

### Client Detail

- `[x]` `/clients/:clientId` detail page.
- `[x]` Client details date formatting and client age in days.
- `[x]` Contract tab wired to current client contract fields and `backup_company_clients_contracts`.
- `[x]` Older contracts collapse behind an expanded list.
- `[~]` Contract tab loads app-owned `client_contracts` for pilot/migrated clients and supports New Contract v1.
- `[x]` Program and Outcomes tabs.
- `[x]` Pathways & Milestones tab resolves offer IDs and milestone rows.
- `[x]` Tasks tab wired to `backup_company_clients_tasks`.
- `[x]` CSM users cannot open unassigned clients directly.
- `[x]` Director Notes hidden from Support, CSM, and Viewer.

### Tasks

- `[x]` `/tasks` top-level task workspace.
- `[x]` Company selector for SuperAdmin.
- `[x]` Company users are locked to their company.
- `[x]` Dependent CSM/View As filter.
- `[x]` Open / All / Closed task modes.
- `[x]` Board and List views.
- `[x]` CSM users only see assigned tasks.

### Dashboard

- `[x]` `/dashboard` executive command center.
- `[x]` Overview tab with KPI groups.
- `[x]` Charts tab with Supabase-backed charts.
- `[x]` AI Insights placeholder.
- `[x]` Offer filter across dashboard data.
- `[x]` SuperAdmin/Director can see AI Insights.
- `[x]` Support can view/filter company-wide KPIs but cannot access AI Insights.
- `[x]` CSM dashboard is scoped to assigned clients/tasks.

### SuperAdmin SaaS Clients

- `[x]` `/saas-clients` read-only SaaS client/company view.
- `[x]` Active and Archived company filters.
- `[x]` Add New SaaS Client modal opens for UX testing with Submit disabled.
- `[x]` `/saas-clients/:companyId` details page.
- `[x]` Team tab reads `backup_company_team`.
- `[x]` Team role labels use `role_id` mapping with Viewer override.
- `[x]` New Team Member modal opens for UX testing with Submit disabled.
- `[x]` View As company support flow.

## Next Product Areas

### Write Mode And Security

- `[ ]` Decide when RetainOS moves from read-only preview to controlled write mode.
- `[ ]` Define Supabase RLS/server-side enforcement before enabling writes.
- `[ ]` Replace disabled Submit buttons with real write flows only after write-mode approval.
- `[ ]` Add audit/logging expectations for writes.

### Data Model And Supabase-Native Schema

Source: Glide data-model walkthrough and screenshot shared on 2026-05-29.

The current Glide model starts with Companies. Companies own team members, groups, clients, offers, on-demand prompts, call types, and company-level configuration. Clients can then own contracts, tasks, history, milestone progress, and calls. Tasks and calls should also be able to exist at company level without being tied to a client.

- `[x]` Core mirror model understood:
  - Companies / SaaS Clients.
  - Team Members: Director, Support, CSM, Viewer.
  - Clients.
  - Offers and offer milestones.
  - Client contracts.
  - Client tasks.
  - Client milestone progress.
- `[~]` Current RetainOS read-only wiring uses mirrored backup tables for companies, team, clients, offers, milestones, contracts, tasks, and dashboard data.
- `[ ]` Create app-owned schema plan before write mode.
  - Decide which mirrored Glide tables remain temporary read sources.
  - Decide which RetainOS-owned Supabase tables become write sources of truth.
  - Define migration/backfill path for each product area.
- `[ ]` Normalize company custom fields into an app-owned table instead of keeping seven fixed custom-field columns on the company record.
- `[ ]` Add app-owned groups model.
  - Company owns groups.
  - Groups can contain many clients.
  - Clients can belong to groups through a join table.
- `[ ]` Add company call types table for Call AI / call tracking.
- `[ ]` Add company on-demand prompts table if existing mirrored prompt data is not sufficient for write mode.
- `[ ]` Add Call AI tables:
  - Calls, optionally linked to a client.
  - On-demand analysis outputs.
  - Comments / review notes on calls.
- `[ ]` Make tasks company-level first-class objects with optional client linkage.
  - Client detail should show client-linked tasks.
  - Tasks page should also support company-level tasks.
- `[ ]` Add client history / change-log table for profile edits, quick updates, milestone changes, contracts, tasks, and other write flows.
- `[ ]` Add CSV client import staging and preview tables for future bulk import.
- `[ ]` Define client profile completeness and client progress completeness as app-owned calculations.
  - Decide whether these are stored snapshots, database views, or recalculated on read.
- `[?]` Replace Glide helper tables with Supabase-native queries/views where possible:
  - Group Search.
  - Client Search.
  - Main Dashboard.
  - Call AI Dashboard.
  - CSM Reports.
  - Tasks Dashboard.
- `[?]` Define reference-data strategy:
  - Support/resources articles.
  - Choices / lookups / dropdowns.
  - AI prompt library.
- `[?]` Confirm whether tasks and calls should share one consistent company-level ownership pattern with nullable `client_id`.

### SuperAdmin Company Management

- `[ ]` Create SaaS Client write flow.
- `[ ]` Edit SaaS Client details.
- `[ ]` Pause SaaS Client access while preserving data.
- `[ ]` Archive/offboard SaaS Client from normal views.
- `[ ]` Manage subscription tier:
  - Starter
  - Growth
  - Pro/Enterprise/DFY
- `[?]` Confirm fields that should live on `backup_companies` versus future app-owned tables.

### Company Team Management

- `[x]` Create Team Member write flow.
  - Enabled for Ethical Scaling pilot/app-owned companies through `manage-company-member`.
- `[x]` Edit team member role.
- `[x]` Edit team member capacity.
- `[x]` Remove/archive team member access.
- `[x]` View archived team members.
- `[ ]` Restore/unarchive archived team member.
- `[x]` Support Director/Support “does not manage clients” behavior via `role_hide_from_csm_list`.
- `[?]` Define capacity formula and display:
  - Low-fi formula referenced: 30-day active clients minus expiring clients divided by total capacity.
  - Needs data validation before implementation.

### Company Customization

- `[~]` Company Customization tab.
  - App-owned outcome definitions, churn reasons, and basic settings are editable for pilot/migrated companies.
  - Mirror-only companies remain read-only from Glide.
- `[ ]` Custom fields.
- `[~]` Outcome definitions.
- `[~]` Churn reasons.
- `[ ]` AI custom prompts.
- `[ ]` Fixed/dynamic AI prompt management.
- `[?]` On-demand AI prompt editing is SuperAdmin only and likely limited to Pro/Enterprise tiers.
- `[~]` Company settings.
  - V1 saves profile upkeep freshness days, default client view, default calendar mode, secondary assignee flag, Call AI for CSMs flag, embed flag, and Zapier client-create flag.
  - Client workspace defaults now drive Clients roster starting view, Clients calendar starting mode, and CSM Reports Field Upkeep freshness window for pilot/migrated companies.
  - V1 QA passed on 2026-06-08 after fixing stale roster cache behavior.
  - Remaining: dashboard/client-list preference consumption beyond current defaults, client list column presets, call/communication settings, and notification preferences.

### Pathways And Milestones Management

- `[~]` SuperAdmin/company Pathways & Milestones configuration tab.
  - V1 is implemented in Admin Hub / SaaS Company Detail for pilot companies.
  - Mirror-only companies see the same configuration read-only from Glide.
- `[~]` New Offer / Milestone flow.
  - V1 supports names, milestone ordering position, target days, time-to-value, and final-milestone flags.
- `[~]` Edit / archive Offer and Milestone flow.
  - Archiving is blocked while active clients are assigned to the item.
  - Move up/down ordering controls and restore/unarchive are live.
  - Drag/drop ordering is intentionally deferred as later UI/UX polish.
  - Secondary offers are intentionally deferred until the primary pathway flow is fully validated.
- `[x]` Define whether offer/milestone writes go back to Glide mirror tables or new app-owned tables.
  - Do not mutate `backup_*`.
  - V1 writes client progress to app-owned `client_milestones`.
  - Company offer/milestone template CRUD uses app-owned `company_offers` and `company_offer_milestones`.
- `[~]` Client-level Pathways & Milestones progress writes.
  - Enabled for app-owned pilot/migrated clients through `manage-client-milestone`.
  - SuperAdmin/Director can change a client's current offer/pathway and milestone.
  - Assigned CSMs can start and complete milestones for assigned clients.
  - Timeline UI must stay scoped to the client's active offer/pathway.
  - UX should later be rebuilt to match the shared low-fi workflow.

### Client Writes

- `[ ]` New Client form.
- `[ ]` Zapier client creation webhook.
  - Webhook must include SaaS account `company_id`.
  - Server must reject requests without a valid `company_id`.
  - Server must create the client only under the matching SaaS Client/company.
  - Admin/Integration UI should expose the Company ID and setup guidance for Directors/Support.
- `[ ]` Calendar view for clients.
- `[ ]` Edit Client Details.
- `[~]` Quick Update write flow.
  - Pilot saves app-owned quick update events without changing mirrored client fields.
- `[~]` Client Offboarding flow.
  - Pilot marks app-owned clients as `off-boarded`, saves offboarded date/churn context, and writes history/audit events.
- `[~]` Client update history view.
  - Pilot view reads `client_history_events`; full Glide-style audit/change log is still future work.
- `[ ]` Track call attendance.
- `[~]` Task create/edit/complete/dismiss flows.
  - Partially done. Pilot supports task creation only.
  - Edit/complete/dismiss should be revisited later, but is not blocking the Ethical Scaling pilot.
- `[~]` Contract create/edit flow.
  - Create is live through `manage-client-contract`; edit/archive remains planned.
- `[ ]` Meeting transcript / Call AI creation flow.
- `[ ]` Delete Forever client for SuperAdmin and Director.
- `[?]` Confirm which write flows must sync back to Glide versus become RetainOS-native.

### Dashboard And AI

- `[~]` CSM Reports dashboard.
  - V1 focuses on profile update compliance, not AI summaries.
- `[~]` CSM Reports filters.
- `[ ]` Replace AI Insights placeholder with approved generation path.
- `[ ]` Define dashboard AI prompt inputs and stored output format.
- `[ ]` Add dashboard export/share behavior if needed.
- `[ ]` Improve dashboard visual polish after high-fidelity pass.

### Formula And Computed Field Migration

Source: `Datasheet - Ethical Scaling - Formulas.csv`.

Working validation spec: `DASHBOARD_FORMULA_VALIDATION.md`.

Draft SQL starting point: `DASHBOARD_CANONICAL_RPC_DRAFT.sql`.

These formulas matter when RetainOS moves away from read-only Glide mirror fields into Supabase-only write mode.

- `[~]` Current contract end / renewal date.
  - Current state: mostly read from mirrored fields, with UI fallback calculations in Client Detail and Dashboard.
  - Future need: app-owned computed contract end date from start date + contract days, plus renewal date indexing/filtering.
  - Future idea: offer-level default contract duration templates, e.g. Ethical Scaling Optimized Journey defaults to 91 days.
- `[~]` Churn Percentage.
  - Formula source: `# of Customers Lost During Period / # of Customers at Start of Period x 100`.
  - Current state: dashboard computes churn via the app-owned formula path for pilot/migrated companies; canonical RPC v1 has been applied and smoke-tested but the UI has not fully switched to it yet.
  - Future need: finish UI migration to canonical Supabase calculation shared by KPI cards, reports, and AI summaries.
- `[~]` Retention Percentage.
  - Formula source: `# of Renewals / Total # of Clients Eligible for Renewal x 100`.
  - Current state: dashboard computes retention through the app-owned formula path for pilot/migrated companies and includes `client_retention_recorded` events.
  - Renewal/retention transitions: Front End -> Front End, Front End -> Back End, and Back End -> Back End.
  - Front End -> Back End should be broken out as renewal/upsell.
  - Pilot v1: New Contract can write `client_retention_recorded` for same-program renewals and FE -> BE upsells.
  - Future need: high-fidelity renewal action and reporting breakdowns.
- `[~]` Success Rate.
  - Count success when the Success outcome is marked yes.
  - Prompt CSMs to update success when final milestone completes, client offboards after contract end, or client renews.
  - Pilot v1: New Contract renewal/upsell flow includes a Mark Success checkbox.
- `[ ]` Average Time to Success.
  - Formula: success marked yes date minus onboarded/date-added-to-app date.
- `[ ]` Average Time to Success per CSM.
  - Future need: same definition as Avg Time to Success, grouped by assigned CSM.
- `[ ]` Current Capacity.
  - Future need: canonical formula for team member capacity and 30-day forecast.
  - Related roadmap item: Team capacity management.
- `[ ]` AR Status.
  - Future need: define source of accounts receivable/payment status and integration dependency.
- `[ ]` Profile Updated Score.
  - Use active clients only.
  - Score as percent of required fields refreshed within the company freshness window.
  - Default freshness window: 14 days.
  - Required fields: Next Steps, Milestone, Date of Last Contact, Date of Next Contact, Progress, and Buy-in.
- `[ ]` Engagement and Feedback actual average.
  - Future need: define feedback inputs, scoring scale, and aggregation window.
- `[ ]` Client Sentiment, CSM Sentiment, and Call Score.
  - Future need: AI/Call AI analysis outputs and storage model.
  - Related roadmap items: Call AI, AI Prompt Inventory, OpenRouter integration.
- `[?]` Decide formula implementation layer:
  - Database views / RPCs for canonical reporting.
  - Edge Functions for AI-driven or workflow-driven computed values.
  - Client-side fallbacks only for display, not source-of-truth write mode.
  - Current status: `dashboard_kpi_counts_canonical` v1 was added in `20260605103000_dashboard_kpi_counts_canonical.sql` and smoke-tested on Ethical Scaling.
  - QA passed on 2026-06-06 for the full Ethical Scaling result and Front End-only program filter; returned values matched the expected baseline.
  - Current recommendation: finish moving dashboard/reporting metrics into Supabase RPCs/views, with client-side code only formatting and drilling into the returned data.

### Notification System

Source: `Datasheet - Ethical Scaling - Notifications.csv`.

Guiding note from source: keep notification triggers simple and avoid spamming users; target 15 triggers or fewer.

- `[~]` Define notification infrastructure.
  - V1 in-app notification storage exists in `notifications`.
  - V1 preference storage exists in `notification_preferences`; email is disabled by default.
  - V1 generation covers next contact, renewal, paused return, and client-linked task due reminders for pilot/migrated companies.
  - Local Clients-page bell/dropdown prototype is the preferred UX direction after Jay QA; global bell placement and full inbox still need final design/build.
  - Read/unread, dismiss UX, bell counts, email delivery, future push channel, and mature unsubscribe/preference rules remain future slices.
- `[ ]` `[priority: medium]` Daily Pulse should reuse notification/workflow signals without becoming a dismissible inbox.
  - Treat it as the CSM start-of-day operating page for Today, This Week, and This Month.
  - Keep it persistent and expandable, while notifications remain event/reminder-driven and dismissible.
- `[ ]` New onboarded client ready to assign CSM.
  - Recipient: Director.
  - Channels: push, email, in-app.
- `[ ]` New client assigned to CSM.
  - Recipient: CSM.
  - Channels: push, email, in-app.
- `[ ]` Client at risk of churn.
  - Recipients: CSM and Director.
  - Channels: push, email, in-app.
  - Depends on churn-risk formula/definition.
- `[ ]` Overdue task.
  - Recipient: assigned/related user.
  - Channels: push, email, in-app.
  - Depends on task write/status system.
- `[ ]` Client up for renewal in next 30 days.
  - Recipients: CSM and Director.
  - Channels: push, email, in-app.
  - Depends on canonical contract end / renewal date formula.
- `[ ]` Client has Revenue Generating Activities available.
  - Recipient: CSM.
  - Channels: push, email, in-app.
  - Depends on RGA likelihood formula definition.
- `[ ]` Client achieved all milestones and is ready for upgrade.
  - Recipients: CSM and Director.
  - Channels: push, email, in-app.
  - Depends on milestone completion write model.
- `[ ]` Client offboarded in last 30 days.
  - Recipient: Director.
  - Channel: email.
- `[ ]` Client paused / suspended.
  - Recipient: Director.
  - Channel: email.
- `[ ]` Next contact date expiring.
  - Recipient: CSM.
  - Channel: email.
- `[ ]` SaaS Client reaches 7, 14, or 20 days without activity.
  - Recipient listed in source: CSM.
  - Channel: email.
  - Needs clarification: likely company Director/SuperAdmin may also need this.
- `[ ]` Team capacity at 99%.
  - Recipient: Director.
  - Channel: email.
  - Depends on team capacity formula.
- `[ ]` Semi-monthly risk/renewal/RGA digest.
  - Schedule: 1st and 14th day of each month.
  - Recipients: CSM and Director.
  - Channel: email.
  - Contents: clients at churn risk, clients up for renewal, RGAs.
  - Related roadmap area: Reporting, Exports, And Imports.
- `[ ]` Weekly CSM Metrics email.
  - Schedule: every Monday.
  - Recipient: Director.
  - Channel: email.
  - Contents:
    - Avg. Time to Success per CSM.
    - Updated vs. non-updated profiles.
    - CSM workload vs. capacity.
    - Churn sources.
    - Renewed opportunities by month/CSM.
    - Effort score by CSM.
    - Link to full report.
  - Related roadmap area: Reporting, Exports, And Imports.
- `[?]` Decide notification engine.
  - Supabase scheduled functions.
  - N8N workflows.
  - Hybrid with Supabase for source-of-truth notifications and N8N for delivery/orchestration.
- `[?]` Confirm final recipients and channels before implementation.

### Reporting, Exports, And Imports

- `[ ]` Define report template architecture.
  - Start with 2 template types.
  - Inputs should come from canonical Supabase reporting views/RPCs, not ad hoc client calculations.
  - Templates should support future branding/customization by company if needed.
- `[ ]` Reports PDF generation.
  - Decide rendering approach: server-side HTML-to-PDF, third-party PDF service, or workflow engine.
  - Store generated report metadata and delivery history.
- `[ ]` Semi-monthly clients-at-risk / renewals / RGAs report.
  - Schedule: every 1st and 14th.
  - Recipients: CSMs and Director.
  - Output: PDF.
  - Related notifications item: semi-monthly risk/renewal/RGA digest.
- `[ ]` Weekly CSM Metrics report.
  - Schedule: every Monday.
  - Recipient: Director.
  - Output: PDF.
  - Contents include Avg. Time to Success per CSM, Updated vs. Non-Updated Profiles, and other metrics from the data sheet.
- `[ ]` Custom HTML export of Dashboard.
  - Decide whether export is a static dashboard snapshot, shareable report page, or downloadable HTML file.
- `[ ]` CSV upload and parse.
  - Needed for client imports and future bulk data tools.
  - Include preview, validation, error handling, and rollback expectations.
- `[ ]` User bulk upload.
  - Needed for team/user onboarding at scale.
  - Must respect role mapping, company assignment, duplicate emails, and invite/provisioning flow.

### Integrations

Source: `Datasheet - Ethical Scaling - Integrations.csv`.

- `[x]` Supabase.
  - Current use: Auth, backup tables, Edge Functions, deployed `prepare-login`.
  - Next needs: custom SMTP config, RLS/security model before write mode, app-owned tables decision.
- `[ ]` Postmark.
  - Intended use: custom SMTP / transactional email for OTP and later notifications.
  - Immediate value: remove Supabase built-in email bottleneck such as 2 emails/hour.
  - Needs: account access, SMTP credentials, sender/domain verification, production limits.
- `[ ]` OpenRouter.
  - Intended use: AI Insights, Call AI summaries, prompt-based analysis.
  - Needs: model choice, API key, prompt strategy, storage format for generated outputs, usage/cost guardrails.
- `[ ]` N8N.
  - Intended use: automation/orchestration layer for background workflows and integrations.
  - Needs: hosting plan, API access, workflow ownership model, security review for secrets.
- `[ ]` Zapier.
  - Intended use: lightweight no-code automations if N8N is not used for a specific workflow.
  - Needs: decide whether Zapier is a fallback/bridge or a long-term integration surface.
  - Required before broader live rollout if companies need automated client creation.
  - Client creation webhook must include the SaaS account `company_id`.
  - `company_id` is generated when the SaaS Client/company is created and must be copied into the Zap configuration by Director or Support during setup.
  - RetainOS must validate `company_id` server-side before creating the client so new clients route to the correct SaaS Client.
  - Add clear setup instructions in the Admin/Integration UI so teams know where to find and copy the Company ID.
- `[?]` Decide integration boundary:
  - Which workflows should live inside RetainOS/Supabase Edge Functions.
  - Which workflows should live in N8N or Zapier.
  - Which AI calls should be direct from Supabase functions versus routed through automation.

### AI Prompt Inventory

Source: `Datasheet - Ethical Scaling - Prompts.csv`.

- `[ ]` AI usage launch sequencing.
  - AI functions can launch after live.
  - Full AI automation is not non-negotiable for the first 2-3 migrated companies.
  - Before AI launch, RetainOS still needs stable data capture so future AI outputs have reliable inputs.
- `[ ]` Fixed prompt system.
  - SuperAdmin only.
  - Not editable by Directors.
  - Intended owner/editor: Jay / SuperAdmin.
  - Based on Jay's analysis of 3,000+ client calls over several years.
  - Runs for every company.
  - Fixed prompt types:
    - Summary prompt.
    - Title prompt.
    - Red flag prompt.
    - Green light prompt.
    - Client sentiment prompt.
    - CSM sentiment prompt.
    - Call score prompt.
    - Archetype prompt.
- `[ ]` Company-specific prompt system.
  - Available only to Pro/Enterprise subscription tiers.
  - Requested by the client.
  - Built by the CST Dev Team.
  - Deployed at the company level.
  - Not editable directly by Directors.
  - Limited to one custom prompt per company unless product scope changes.
  - Can be configured as:
    - Auto-run prompt that runs for every call for that company.
    - On-demand prompt triggered manually for specific calls, such as escalation analysis.
- `[?]` Decide how prompt ownership is represented in the data model:
  - Global fixed prompts.
  - Company-level custom prompts.
  - Prompt versioning.
  - Prompt deployment status.
  - Subscription-tier enforcement.
- `[ ]` Client `Next Step Summary`.
  - Target surface: client profile or client summary.
  - Input: assigned account manager notes / next steps.
  - Expected output: concise two-bullet manager-facing next-step summary, stripped of JSON/rich text.
- `[ ]` CSM Report `Green Clients Summary`.
  - Target surface: CSM Reports.
  - Input: notes for clients with green buy-in and green progress.
  - Expected output: max three-sentence Hemingway-style summary beginning with `Clients are ...`.
- `[ ]` CSM Report `Yellow Clients Summary`.
  - Target surface: CSM Reports.
  - Input: notes for clients with yellow buy-in and yellow progress.
  - Expected output: max three-sentence Hemingway-style summary beginning with `Clients are ...`.
- `[ ]` CSM Report `Red Clients Summary`.
  - Target surface: CSM Reports.
  - Input: notes for clients with red buy-in and red progress.
  - Expected output: max three-sentence Hemingway-style summary beginning with `Clients are ...`.
- `[?]` Decide prompt storage model:
  - Fixed prompts managed only by SuperAdmin.
  - Company-specific prompts built by CST Dev Team, not Director-editable.
  - Prompt versioning and output audit/history.
- `[?]` Decide AI execution path:
  - Direct Supabase Edge Function calling OpenRouter.
  - N8N/Zapier orchestration.
  - Hybrid approach depending on workflow.

### Login And Access Polish

- `[~]` Low-fi RetainOS login page is live.
- `[ ]` High-fidelity login redesign.
- `[ ]` Custom SMTP setup for reliable OTP/PIN delivery, likely via Postmark.
  - Verify a RetainOS sender address and the `retainos.ai` sending domain.
  - Configure Supabase Auth SMTP credentials and production email templates.
  - Validate delivery, spam placement, resend behavior, and production rate limits.
- `[ ]` Consider Google login after auth hierarchy is stable.
- `[ ]` Better no-access and multi-company access issue screens.

### UX / High-Fidelity Pass

- `[~]` Full UI pass for login.
- `[~]` Full UI pass for authenticated shell.
- `[ ]` Full UI pass for Dashboard.
- `[~]` Full UI pass for Clients and Client Detail.
- `[ ]` Full UI pass for Tasks.
- `[~]` Full UI pass for SuperAdmin SaaS Clients.

### High-Fidelity Design Reference

Source: scoping team high-fidelity screen examples and design-system references shared on 2026-05-29.

This phase should happen after core wiring/write-mode foundations are stable. Use these references to guide the UI upgrade rather than rebuilding visuals before the product flows are validated.

- `[ ]` Sign-in screen high-fidelity pass.
  - Background photo treatment.
  - Centered translucent login panel.
  - RetainOS logo.
  - Email/PIN fields.
  - Google sign-in visual treatment, if Google SSO is enabled.
- `[ ]` Authenticated shell high-fidelity pass.
  - Deep navy left sidebar.
  - Top search/header bar.
  - User avatar/profile menu.
  - Notification indicator.
  - Dark mode toggle visual.
- `[ ]` SaaS Clients high-fidelity pass.
  - Card grid.
  - Active/Paused/Archived tabs.
  - Add SaaS Client modal.
  - SaaS Client details shell.
- `[ ]` Company/team high-fidelity pass.
  - Team member cards.
  - Director/CSM grouping.
  - Capacity pills.
  - Company detail tabs.
- `[ ]` Company customization high-fidelity pass.
  - Call AI prompts cards.
  - Custom field cards.
  - Outcome definitions editor.
  - Churn reasons editor.
- `[~]` Dashboard KPI high-fidelity pass.
  - KPI cards.
  - KPI/Charts/CSMs/AI tabs.
  - Export button.
  - Filters for user, date range, program, offer where applicable.
- `[ ]` Dashboard chart visual/data Phase 2.
  - Use Recharts with a clean shadcn-chart-inspired visual treatment.
  - Use the existing RetainOS HiFi palette and keep labels visible for the first pass.
  - Preserve existing clickable chart drill-through behavior and extend it where planned.
  - Program Distribution: donut.
  - Buy-in: donut.
  - Progress: donut.
  - Clients By Offer: modern horizontal/vertical bar chart with drill-through.
  - Tasks By Status: bar chart with future clickable task-detail/filter modal.
  - CSM Active Client Workload: bar chart.
  - Treat actionable metrics shown in the HiFi prototype as future wiring scope, not disposable invented content.
  - Add canonical formulas/data sources before exposing unwired metrics.
- `[ ]` Dashboard CSM high-fidelity/data pass.
  - Avg. Time to Success chart.
  - Updated vs. Non-Updated Profiles chart.
  - CSM Workload & Capacity chart.
  - Churn Reason chart.
  - Renewal Opportunities chart.
  - Offboarding by CSM chart.
- `[~]` Client screens high-fidelity pass.
  - Client roster views.
  - Client detail sections.
  - Merge the existing working milestone-progress controls into the HiFi Quick Update modal styling.
  - Keep pathway changes on the full Client Detail page.
  - Preserve the richer pilot New Client setup fields while applying the HiFi styling.
  - Contract, program, outcomes, pathways/milestones, tasks, and history tabs.
- `[ ]` Accessibility check.
  - Validate color contrast for all core text/background and CTA combinations.
  - Known note: light blue `#59ABF0` with white text did not pass accessibility checks.
  - Known passing combinations include deep navy `#162B3E` with gray/light text and deep navy with white text.
- `[ ]` Color palette tokens.
  - Primary: Deep Navy `#162B3E`.
  - Secondary: Muted Lavender Gray `#BBBEC C` appears in one source image, but the explicit RGB value is `RGB(187, 190, 204)`, so canonical token should be `#BBBECC`.
  - CTA/highlight: Modern Sky Blue `#59ABF0`.
  - Main background: `#F6F8FB`.
  - Success: pressed `#066042`, hovered `#04724D`, default `#2DB585`, surface `#EDFDF8`.
  - Warning: pressed `#353640`, hovered `#62636A`, default `#EBEBEC`, surface `#F8F8F8`.
  - Danger: pressed `#981B25`, hovered `#BA2532`, default `#E02D3C`, surface `#FEF1F2`.
  - Neutral: hover `#05070B`, title `#0D121C`, subtitle `#364152`, body `#4B5565`, placeholder `#6C7684`, disabled `#E3E8EF`, borders `#EEF2F6`, surface `#F8FAFC`.
- `[ ]` Typography tokens.
  - Font family: Montserrat.
  - Weights: 400 regular, 500 medium, 600 semibold, 700 bold.
  - Heading scale from 72px down to 24px.
  - Body scale: XL 20px, L 18px, M 16px, S 14px, XS 12px.
  - Note: current frontend guidance says do not use negative letter spacing; reconcile source typography tracking values before implementation.
- `[ ]` Desktop grid.
  - 1440px layout reference.
  - 320px sidebar.
  - 1120px content region.
  - 12 columns.
  - 40px margin.
  - 20px gutter.
- `[late]` `[priority: low]` Replace inline/prototype brand icons with final production logo assets during a pilot UI revision.
  - RetainOS wordmark.
  - RetainOS circular arrow mark.
  - Light, deep navy, and sky blue logo treatments.
  - Prefer SVG assets for the full wordmark, icon-only mark, light version, dark/navy version, and favicon.
- `[ ]` Post-pilot company configuration and commercial model.
  - Company-defined churn reasons.
  - Real subscription tiers and tier-based feature flags.
  - Company customization settings and their canonical data sources.

## Final Migration Validation

Source: Glide Client Success Tracker walkthrough transcript shared on 2026-05-29.

Use this section as the “what good looks like” checklist before migrating real companies from Glide into RetainOS. The goal is not only matching screens; the goal is proving a company can run the same fulfillment operating rhythm in RetainOS without losing accountability, reporting, or quality control.

### Client Roster And Alerts

- `[ ]` Client page has an alert center for:
  - Offboardings.
  - Pauses / suspensions.
  - Scheduled contact reminders due today.
  - Newly added clients.
- `[x]` Client page supports filtering and searching by client name and email.
- `[x]` Client page supports card/detail and list views.
- `[ ]` Client page supports contact calendar view populated from next contact dates.
- `[ ]` List view supports operational sorting by last contact date and next contact date.
- `[~]` List view supports onboarded date and renewal date sorting.
- `[ ]` Client cards show at-a-glance fulfillment context:
  - Offer.
  - Current milestone.
  - Progress / buy-in.
  - North Star.
  - Notes and next steps.

### Client Profile Operating Workflow

- `[x]` Client profile shows core details, program, outcomes, pathways/milestones, contracts, and tasks in read-only mode.
- `[~]` Client profile supports editing source-of-truth fields once write mode is approved.
  - Pilot v1 edits app-owned `clients` only and writes a `profile_update` history event.
- `[ ]` Client profile supports external links such as Slack channel, Google Drive folder, CRM, and other client resources.
- `[ ]` Client profile supports company custom fields.
- `[ ]` Client profile supports call attendance tracking.
- `[ ]` Client profile supports progress and buy-in updates.
- `[ ]` Client profile supports testimonials, reviews, referrals, and related client outcomes.
- `[ ]` Client profile supports notes and next steps updates at the CSM cadence.
- `[ ]` Client profile stores next steps and profile updates into history.
- `[ ]` Client profile supports AR status tracking.
- `[ ]` Client profile supports last contact and next contact updates.
- `[ ]` Contract area supports multi-contract value and LTV-oriented reporting.
- `[ ]` Contract area supports contract links.
- `[~]` Milestone area tracks milestone start and completion dates.
  - Pilot v1 tracks app-owned start/completion dates, duration, and time-to-hit in `client_milestones`.
  - Remaining gap: polish the low-fi workflow and wire milestone updates into Quick Update.
- `[~]` History tab shows the full interaction/change log:
  - Pilot currently shows RetainOS Quick Update events.
  - Full interaction/change log still needs:
  - AR status changes.
  - Call attendance.
  - Contract changes.
  - CSM assignment changes.
  - Profile updates.
  - Notes and next steps.

### Quality Control Loop

- `[ ]` RetainOS supports the three-part QC workflow from Glide:
  - Dashboard for quantitative KPIs.
  - CSM Reports for system compliance.
  - Call AI for quality of calls and coaching standards.
- `[x]` Dashboard supports company, CSM, date, program/status, and offer-style filtering where currently wired.
- `[ ]` Dashboard supports cohort/date range filtering equivalent to Glide.
- `[~]` Dashboard includes active clients, upgrades, renewals, pauses, offboardings, churn percentage, retention, chart breakdowns, offboardings by CSM, and CSM workload where data is available.
- `[~]` Dashboard chart segments are clickable and can drill into the clients behind the number where wired.
- `[ ]` Dashboard supports CSM capacity if enabled for a company.
- `[ ]` Dashboard includes Call AI rollups:
  - Total calls processed.
  - Positive / neutral / negative breakdowns.
  - Call score trends.
- `[ ]` AI Insights can generate:
  - Key data summary.
  - Red flags / clients likely to churn, ghost, or need attention.
  - 30- to 60-day action plan.

### CSM Reports Validation

- `[ ]` CSM Reports can filter by today, last 7 days, last 30 days, and selected CSM.
- `[ ]` CSM Reports show updated versus total client counts.
- `[ ]` CSM Reports show green / yellow / red breakdowns.
- `[ ]` CSM Reports show most recent entry for each client:
  - Most recent notes.
  - Next steps.
  - Progress updates.
- `[ ]` CSM Reports prove coaches/CSMs are following the tracking cadence.

### Call AI Validation

- `[ ]` Call AI supports manual transcript upload/paste.
- `[ ]` Call AI supports selecting or matching the transcript to a client.
- `[ ]` Call AI stores transcript, summary, score, green lights, red flags, and action plan.
- `[ ]` Call AI scores agenda, CSM energy, story/support provided, and action plan out of 7 each, for a total score out of 28.
- `[ ]` Call AI results can be used by CSMs to update the client profile after a call.
- `[ ]` Fathom integration or equivalent can automatically ingest transcripts when ready.
- `[ ]` Transcript-to-client matching works by client identity/email where possible.

### Migration Readiness

- `[ ]` A real company can complete one full client lifecycle in RetainOS:
  - Add/import client.
  - Assign CSM.
  - Track contract.
  - Track milestones.
  - Update notes and next steps.
  - Schedule next contact.
  - Complete tasks.
  - Analyze a call.
  - See updates reflected in dashboard, CSM Reports, and alerts.
- `[ ]` Existing Glide data can be reconciled against RetainOS for a pilot company.
- `[ ]` Ethical Scaling internal pilot is completed before external company migration.
- `[ ]` Low-volume external SaaS Client pilot is completed after Ethical Scaling.
- `[ ]` Role access is validated for SuperAdmin, Director, Support, CSM, and Viewer on the full workflow.
- `[ ]` RetainOS can run in parallel with Glide for a pilot period before cutover.
- `[ ]` Final cutover plan exists for:
  - Data backfill.
  - User access.
  - Notification/email setup.
  - Support process.
  - Rollback plan.

### Ethical Scaling Pilot Launch Blockers

1. `[~]` Client CSM assignment and reassignment flow is complete.
   - Existing clients can now be reassigned from Edit Profile by SuperAdmin, Director, or Support.
   - New Client and Edit Profile use the app-owned active team roster for pilot/migrated companies.
   - Edge Functions `manage-client-profile` and `manage-client-create` were deployed on 2026-06-06.
   - Remaining: Jay QA, including CSM visibility after reassignment.
2. `[ ]` Role-based end-to-end QA passes using Jay, Ben, and Emily's real accounts.
3. `[~]` Ethical Scaling app-owned data is reconciled against Glide and the pilot source-of-truth rules are agreed.
   - Read-only Ethical Scaling command: `npm run pilot:reconcile:ethical-scaling`.
   - Reusable rollout command: `npm run pilot:reconcile:company -- --company="Company Name"`.
   - This reconciliation is a required gate before every future company's `mirror_only` -> `pilot` -> `migrated` transitions.
   - On 2026-06-06 the reconciliation gate returned `readyForPilot = true` with no blockers.
   - All 154 mirrored clients existed app-side with no missing or extra clients.
   - Active pilot clients have no invalid assignments and no missing app-owned offer/milestone configuration.
   - Non-blocking notes: seven invalid assignments belong only to offboarded clients; archived pilot/test app-owned offer/milestone rows exist; historical mirrored contracts/client milestones are not fully app-backfilled yet.
   - Remaining: agree source-of-truth and parallel-run rules for pilot week.
4. `[ ]` Validated work is committed to RetainOS `main`, deployed by Vercel, and production-smoke-tested.
5. `[ ]` Production domain and authentication delivery are configured.
   - Use the agreed `app.retainos.ai` subdomain, preserving the root `retainos.ai` website.
   - `[~]` `app.retainos.ai` is attached to Vercel project `retainoss-projects/cst-supabase-backup`.
   - Add Squarespace DNS `A` record: host `app`, value `76.76.21.21`, then verify HTTPS.
   - Set the production app URL and allowed redirect URLs in Supabase Auth to use the chosen production app domain.
   - Configure `support@ethicalscaling.com` as the pilot sender through a custom SMTP provider for OTP/PIN emails.
   - Test successful login delivery for Jay, Ben, and Emily without hitting Supabase's built-in email limit.

### Pilot Workflow Polish

- `[x]` Milestone progress is available from Quick Update.
  - Quick Update shows the current offer/milestone and lets an authorized CSM complete the current milestone.
  - Completion uses the existing milestone write path, records history/audit, and advances to the next configured milestone.
  - Jay QA passed against Ali Abdaal and Matt Shiver.
  - Product decision: pathway changes remain on the full Client Detail page. Quick Update handles milestone progress only.
- `[x]` New Client setup can optionally configure the initial offer/pathway, starting milestone, and initial contract dates in one flow.
  - Jay QA passed for both optional setup paths.
- `[x]` Minimal pilot reminders are visible above the Clients roster.
  - Shows active-client next contacts and renewals plus paused-client return dates due in the next 7 days or overdue within the last 30 days.
  - 2026-06-08: reminder rows now prefer app-owned `notifications` generated by `generate_company_notifications`, with the old current-client-field calculation preserved as fallback.
  - 2026-06-08 local prototype replaced the wide reminder strip with a compact Clients-header bell/dropdown. Jay confirmed the bell direction feels right.
  - The existing Clients calendar remains the full manual pilot timeline.
  - Broader notification automation remains later roadmap work.
- `[x]` Ethical Scaling pilot onboarding guide exists in `PILOT_ONBOARDING.md`.

### Future UI/UX Polish

- `[x]` Responsive navigation uses a mobile sidebar drawer on smaller screens.
- `[x]` The sidebar company selector is the single global SuperAdmin `View As` control; redundant page-level company selectors are removed.
- `[ ]` Add functional cross-app global search. Keep the header search hidden until it is wired.
- `[~]` Add notifications and an inbox experience.
  - In-app notification data foundation exists; local Clients-page bell/dropdown prototype is the preferred direction.
  - Full global bell/inbox stays hidden until read/dismiss/count behavior is real.
- `[ ]` Add a user avatar/account menu. Keep it hidden until it has useful account actions.
- `[ ]` Preserve the current working Dashboard information structure while applying the HiFi visual system.
- `[x]` Use amber for Paused and Suspended statuses and red for Offboarded.

## QA Checklist For Every Release

- `[ ]` `npm run build` passes.
- `[ ]` SuperAdmin can log in and View As a company.
- `[ ]` Director can log in and sees only their company.
- `[ ]` Support can log in and sees company-wide client/dashboard data, without AI Insights.
- `[ ]` CSM can log in and sees only assigned clients/tasks.
- `[ ]` Unknown emails cannot access RetainOS.
- `[ ]` `/dashboard`, `/clients`, `/tasks`, `/clients/:clientId`, `/saas-clients` smoke-tested as applicable.
- `[ ]` Vercel deploy from `main` verified after push.
- `[ ]` Production login redirect and OTP/PIN delivery verified on `https://app.retainos.ai`.

## Known Operational Notes

- Supabase built-in email may be limited to very low OTP volume, such as 2 emails/hour.
- Configure custom SMTP before broad external testing.
- `prepare-login` must remain deployed with JWT verification disabled because public login calls it before there is a user session. The function enforces access internally using SuperAdmin allowlist and `backup_company_team`.
- Keep `old glide project test/` untracked and out of commits unless explicitly requested.
