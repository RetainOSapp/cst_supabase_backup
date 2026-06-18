# Official Company Rollout Checklist

Reusable checklist for migrating one RetainOS customer from CST/Glide mirror mode into RetainOS app-owned write mode.

## Operating Rules

- Migrate one company at a time.
- Do not trigger the paid CST/Glide sync until Jay explicitly calls final migration day.
- Before final migration, the company remains read-only or mirror-backed unless Jay says otherwise.
- Optional pre-cutover webhook validation can run 3-5 days before cutover if Jay approves. During that window, Glide remains the source of truth; RetainOS app-owned data is temporary validation data only.
- Any temporary app-owned data created before cutover must be wiped before final migration execution. The clean migration must start from the fresh paid CST/Glide sync and backfill from backup tables.
- On final migration day, pause or lock CST/Glide activity for that company before the last sync so no edits are lost.
- After cutover, RetainOS app-owned tables become the source of truth.
- Do not plan a long customer parallel run. Jay owns a high-touch final sync, validation, and go-live decision; after go-live, operators stop using CST/Glide for day-to-day work.
- Keep CST/Glide mirror data only for reconciliation, fallback review, and historical archive unless a rollback is explicitly chosen.
- Non-migrated companies must keep working from mirror fallback.
- Contract history/current-contract coverage is mandatory for every write-mode migration. Do not cut over active clients without reconciled app-owned contract/renewal coverage or a documented Jay-approved caveat.

## How To Use This Packet

This file is the internal migration command packet. Use it with the shorter
`CLIENT_FACING_MIGRATION_QA_CHECKLIST.md` or Jay's spreadsheet version.

1. Use this file before and during migration day for RetainOS/Jay/Ben checks.
2. Use the client-facing checklist after RetainOS is live so the customer can
   spot-check access, roster, client profiles, contracts, updates, Daily Pulse,
   resources, dashboard, and CSM Reports.
3. Record any customer-facing issues in the client-facing checklist; record
   internal blockers, data caveats, and support decisions here.

## Migration Day Command Center

| Moment | Owner | Action | Evidence |
| --- | --- | --- | --- |
| Before freeze | Jay / Ben | Confirm the company is ready for final migration and customer operators know CST/Glide edits are stopping. | Written confirmation |
| Freeze | Jay / Ben | Pause/lock CST/Glide usage for the selected company. | Operator confirmation |
| Final sync | Jay | Trigger the paid CST/Glide sync. | Sync completion note |
| Snapshot | Codex | Rerun company readiness/reconciliation against the fresh mirror. | Saved command output |
| Backfill | Codex | Backfill app-owned company, users, clients, contracts, offers, milestones, settings, resources, and tokens. | Counts and samples |
| Internal QA | Jay / Codex | Run this checklist's QA matrix. | Pass/fail notes |
| Customer signoff | Jay / Customer | Run the client-facing signoff checklist. | Spreadsheet/doc approval |
| Go-live | Jay | Confirm RetainOS is source of truth and CST/Glide is no longer used for daily operations. | Final go-live note |
| Support watch | Jay / Ben / Codex | Monitor issues for the agreed support window. | Issue log |

## Phase 0 - Candidate Scope

| Check | Owner | Evidence | Status |
| --- | --- | --- | --- |
| Company selected for migration | Jay | Company name and company ID | Not started |
| Migration objective confirmed | Jay / Ben | Pilot, read-only validation, or full write-mode rollout | Not started |
| Stakeholders informed of migration window | Jay / Ben | Slack/email/meeting note | Not started |
| Company-specific risks listed | Jay / Ben / Codex | Notes on volume, integrations, Call AI, groups, resources, special workflows | Not started |
| Required RetainOS features confirmed available | Codex | Roadmap items checked against company needs | Not started |

## Phase 1 - Pre-Migration Prep

| Check | Owner | Evidence | Status |
| --- | --- | --- | --- |
| Current mirror snapshot reviewed without triggering a new paid sync | Codex | Readiness snapshot output | Not started |
| Roster count reviewed | Codex / Jay | Active, paused, suspended, offboarded totals | Not started |
| Team members reviewed | Jay / Ben | Directors, CSMs, Support, hidden/non-client-managing members | Not started |
| CSM assignment integrity reviewed | Codex / Jay | Invalid assignments, unassigned clients, duplicate names | Not started |
| Offers and milestones reviewed | Codex / Jay | Offer count, milestone count, active client pathway coverage | Not started |
| Contract and renewal coverage reviewed | Codex / Jay | Active clients with current contract/renewal date | Not started |
| Contract backfill approach confirmed | Codex / Jay | Which mirror fields/tables seed app-owned contracts, plus caveats | Not started |
| Company customization reviewed | Jay | Outcomes, custom fields, churn reasons, Daily Pulse rules | Not started |
| Resources structure reviewed | Jay / Ben | RetainOS Help and Company Resources | Not started |
| Integration needs reviewed | Jay / Codex | New client, client update, call summary, transcript, course completion | Not started |
| Optional temporary Zapier validation window decided | Jay / Codex | If enabled, RetainOS writes are validation-only for 3-5 days and will be wiped before final migration | Not started |
| Write-mode blockers listed | Codex | Anything preventing source-of-truth flip | Not started |

## Phase 2 - Final Sync And Freeze

Run this phase only when Jay calls final migration day.

| Check | Owner | Evidence | Status |
| --- | --- | --- | --- |
| CST/Glide usage paused or locked for the company | Jay / Ben | Confirmation from operators | Not started |
| Final paid CST/Glide sync triggered | Jay | Sync completed successfully | Not started |
| Fresh readiness snapshot rerun immediately after sync | Codex | Snapshot output saved | Not started |
| Roster and assignment anomalies reviewed from fresh data | Codex / Jay | Pass/fail notes | Not started |
| Contract, milestone, and history anomalies reviewed from fresh data | Codex / Jay | Pass/fail notes | Not started |
| Contract backfill dry-run reviewed from fresh data | Codex / Jay | Pending count, missing active-client coverage, caveats | Not started |
| Temporary pre-cutover app-owned validation data wiped | Codex / Jay | Confirm no validation-only RetainOS rows remain before clean backfill | Not started |
| No new CST/Glide edits made after freeze | Jay / Ben | Operator confirmation | Not started |
| Customer operators reminded that RetainOS becomes source of truth after go-live | Jay / Ben | Message / meeting note | Not started |

## Phase 3 - Migration Execution

| Check | Owner | Evidence | Status |
| --- | --- | --- | --- |
| Company row exists app-owned | Codex | `companies` record | Not started |
| Company members backfilled app-owned | Codex | `company_members` count and role QA | Not started |
| Clients backfilled app-owned | Codex | `clients` count and sample QA | Not started |
| CSM assignments backfilled app-owned | Codex | Assigned clients per CSM | Not started |
| Contracts backfilled app-owned for all relevant clients | Codex | `client_contracts` count and samples | Not started |
| Contract backfill dry-run returns clean after apply | Codex | 0 pending relevant contracts or Jay-approved caveat | Not started |
| Active-client contract coverage spot-checked | Jay / Codex | Sample clients across CSMs/offers | Not started |
| Offers and milestones backfilled app-owned | Codex | `company_offers`, `company_offer_milestones`, `client_milestones` | Not started |
| Client history imported or explicitly archived as mirror-only | Jay / Codex | Decision and evidence | Not started |
| Company customization backfilled app-owned | Codex | Outcomes, custom fields, churn reasons, settings | Not started |
| Daily Pulse and notification preferences backfilled app-owned | Codex | Company settings/preferences | Not started |
| Resources and integration tokens configured | Jay / Codex | Resource pages and token list | Not started |
| Company migration status moved to write-mode only after QA gate | Jay / Codex | Status change record | Not started |
| Mirror fallback preserved for reference only | Codex | No mirror deletion; app-owned reads verified | Not started |

## Phase 4 - QA Matrix

| Area | Check | Owner | Evidence | Status |
| --- | --- | --- | --- | --- |
| Login and access | SuperAdmin can view as company | Jay | Browser QA | Not started |
| Login and access | Director can access only their company | Jay / Ben | Browser QA | Not started |
| Login and access | CSM sees only assigned clients | Jay / Ben | Browser QA | Not started |
| Login and access | Support sees approved company-wide views | Jay / Ben | Browser QA | Not started |
| Clients | List, card, and calendar load | Jay | Browser QA | Not started |
| Clients | Filters, sorting, and persistence work | Jay | Browser QA | Not started |
| Clients | New client creation writes app-owned | Jay | Browser QA and Supabase check | Not started |
| Clients | Quick Update writes app-owned history | Jay | Client history entry | Not started |
| Client detail | Details, Program, Outcomes, Pathways, Tasks, History load | Jay | Sample clients | Not started |
| Contracts | Create, edit, archive, delete permissions and active/old/archived filters work | Jay | Contract tab QA | Not started |
| Renewals | Renewal dates and up-for-renewal views are trustworthy | Jay / Codex | Samples and dashboard checks | Not started |
| Pathways | Current milestone progression works | Jay | Sample client journey | Not started |
| Dashboard | KPIs load quickly and match expected formulas | Jay / Codex | Formula QA | Not started |
| Dashboard | Drill-throughs open correct client lists | Jay | Browser QA | Not started |
| CSM Reports | Field upkeep, summaries, and drill-throughs work | Jay | Browser QA | Not started |
| Daily Pulse | Today, This Week, This Month are scoped correctly | Jay / Ben | Browser QA | Not started |
| Resources | RetainOS Help and Company Resources behave correctly | Jay / Ben | Browser QA | Not started |
| Integrations | Enabled webhooks accept valid tokens and reject revoked tokens | Jay / Codex | Zapier/Supabase QA | Not started |
| Integrations | A token from another migrated company is rejected for this company | Codex | Same-token/different-company 401 test | Not started |
| Isolation | Another company still uses mirror fallback correctly | Jay / Codex | Regression sample | Not started |

## Phase 5 - Rollout Handoff

| Check | Owner | Evidence | Status |
| --- | --- | --- | --- |
| Ben receives what changed and what remains limited | Jay / Codex | Handoff note | Not started |
| Company receives operating instructions | Jay / Ben | Loom/doc/training | Not started |
| Known caveats documented | Codex | Roadmap or handoff note | Not started |
| Emergency support stance confirmed | Jay / Ben / Codex | Written decision | Not started |
| RetainOS marked as source of truth for the company | Jay | Final go-live confirmation | Not started |
| Client-facing signoff checklist completed or scheduled | Jay / Customer | Approved checklist or open issue list | Not started |

## Emergency Support Plan

Use this only when a migrated company cannot operate correctly in RetainOS after
go-live. This is an internal support path, not a planned customer parallel run.

| Scenario | Action | Owner |
| --- | --- | --- |
| Data display mismatch | Pause affected workflow, compare app-owned row to fresh mirror/archive, document expected source of truth, then patch data or UI. | Codex / Jay |
| Role/access failure | Pause affected user group, verify company membership/role, fix access path before asking the customer to continue. | Codex / Jay |
| Write workflow failure | Stop that workflow, keep RetainOS as source of truth for unaffected areas, fix Edge Function/UI, then replay or manually repair the failed write if needed. | Codex |
| Reporting materially wrong | Keep operations in RetainOS, mark reports as under review, validate formulas against samples before using numbers for decisions. | Jay / Codex |
| Critical blocker across core operations | Jay decides whether to temporarily use CST/Glide archive/fallback for reference while RetainOS is repaired. Record the exact affected scope and exit condition. | Jay |

## Hold Or Rollback Criteria

Pause migration if any of these are true:

- Client counts do not reconcile and the mismatch cannot be explained.
- CSM assignment integrity fails for active clients.
- Active clients are missing critical offers, milestones, contracts, or renewal dates required by that company.
- Contract backfill dry-run still reports unresolved active/relevant client coverage after apply.
- Role isolation fails.
- Write actions hit mirror tables instead of app-owned tables after cutover.
- Dashboard or CSM Reports are materially misleading for the company.
- Webhook tokens cannot be revoked or scoped safely.
- Operators continued editing CST/Glide after the final sync.

## Close Condition

A company rollout is complete only when Jay signs off on the QA matrix, the company is confirmed app-owned/write-mode where intended, and the roadmap/memory are updated with the rollout result.
