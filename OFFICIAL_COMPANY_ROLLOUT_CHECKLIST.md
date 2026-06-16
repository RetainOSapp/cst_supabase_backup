# Official Company Rollout Checklist

Reusable checklist for migrating one RetainOS customer from CST/Glide mirror mode into RetainOS app-owned write mode.

## Operating Rules

- Migrate one company at a time.
- Do not trigger the paid CST/Glide sync until Jay explicitly calls final migration day.
- Before final migration, the company remains read-only or mirror-backed unless Jay says otherwise.
- On final migration day, pause or lock CST/Glide activity for that company before the last sync so no edits are lost.
- After cutover, RetainOS app-owned tables become the source of truth.
- Keep CST/Glide mirror data only for reconciliation, fallback review, and historical archive unless a rollback is explicitly chosen.
- Non-migrated companies must keep working from mirror fallback.
- Contract history/current-contract coverage is mandatory for every write-mode migration. Do not cut over active clients without reconciled app-owned contract/renewal coverage or a documented Jay-approved caveat.

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
| No new CST/Glide edits made after freeze | Jay / Ben | Operator confirmation | Not started |

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
| Isolation | Another company still uses mirror fallback correctly | Jay / Codex | Regression sample | Not started |

## Phase 5 - Rollout Handoff

| Check | Owner | Evidence | Status |
| --- | --- | --- | --- |
| Ben receives what changed and what remains limited | Jay / Codex | Handoff note | Not started |
| Company receives operating instructions | Jay / Ben | Loom/doc/training | Not started |
| Known caveats documented | Codex | Roadmap or handoff note | Not started |
| Rollback stance confirmed | Jay / Ben / Codex | Written decision | Not started |
| RetainOS marked as source of truth for the company | Jay | Final go-live confirmation | Not started |

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
