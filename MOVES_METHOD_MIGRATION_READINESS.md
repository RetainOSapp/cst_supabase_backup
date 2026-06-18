# Moves Method Migration Readiness

Last updated: 2026-06-17

## Goal

Make Moves Method the next migration-ready company after Ethical Scaling without enabling write mode until validation is clean.

Default stance: Moves Method remains read-only and CST mirror-backed. RetainOS can be used for walkthroughs, feedback, and validation, but official rollout starts only when Jay calls the final migration and the reusable company rollout checklist in `OFFICIAL_COMPANY_ROLLOUT_CHECKLIST.md` is run against a fresh CST sync.

## Baseline Checks

- [x] View As Moves Method loads reliably for Super Admin.
- [x] Roster count matches current CST mirror expectations for walkthrough purposes.
- [x] Active, paused, suspended, offboarded, and archived client counts are understood from the current mirror snapshot.
- [x] CSM assignment integrity has been reviewed for current mirror walkthrough purposes. The current stale snapshot found 9 active clients with invalid CSM assignments and 6 active unassigned clients; this is logged for final sync QA, not treated as a live product blocker.
- [x] Offers and milestone coverage are visible enough for power-user review.
- [x] Contract and renewal dates are present or caveats are documented.
- [x] Dashboard loads quickly enough for walkthroughs.
- [x] CSM Reports loads and caveats are documented where mirror fields are incomplete.
- [x] Daily Pulse loads with role-aware client scope.
- [x] Resources loads both RetainOS Help and Company Resources.
- [x] Client details load with read-only protections active.

## Data Confidence Snapshot

Use this command for a read-only readiness snapshot. It reads the current Supabase CST mirror and never triggers a Glide sync:

```bash
npm run migration:readiness:moves
```

Current snapshot from 2026-06-14:

- Mirrored company: Moves Method (`wd7vy0vaQK2hgB3IRqy17w`).
- App-owned company: none yet, intentionally.
- Mirrored clients: 4,143 total.
- Active clients: 2,338 total.
- Status mix: 2,004 front-end, 334 back-end, 106 paused, 96 suspended, 1,603 off-boarded.
- Team rows: 89 mirrored members, 59 visible client managers.
- Active unassigned clients: 6.
- Active clients with invalid CSM assignments: 9.
- Offer coverage: 16 mirrored offers and 33 mirrored offer milestones.
- Active clients missing offer config: 0.
- Active clients missing milestone config: 0.
- Renewal date confidence: all 2,338 active clients have a renewal/filtering date in the mirror.
- Mirrored contract history rows: 177. Most active clients do not have a mirrored historical contract row, so renewal confidence currently relies on client-level renewal/filtering fields until migration backfill rules are finalized.

Dry snapshot rerun on 2026-06-17:

- Current CST mirror data only; no Glide sync was triggered.
- Counts are unchanged from the 2026-06-14 snapshot: 4,143 mirrored clients and 2,338 active clients.
- Active unassigned clients remain 6.
- Active clients with invalid CSM assignments remain 9.
- All 2,338 active clients still have renewal/filtering date coverage from mirror client-level fields.
- App-owned company row remains intentionally absent before final migration day.
- Script gate remains conservative: write migration is blocked until Jay triggers final paid sync, assignment anomalies are reviewed from fresh data, and app-owned backfill/cutover is explicitly approved.

Gate interpretation:

- Read-only walkthrough: Jay QA is complete enough for product walkthrough/readiness purposes.
- Stale mirror assignment anomalies are final-sync QA items, not current product blockers.
- Write migration: intentionally blocked. Do not migrate until Jay triggers the final paid Glide sync and explicitly approves app-owned backfill/cutover.

## Migration Path

This is the execution path for Moves Method. It exists so we build the migration runway without spending sync cost early.

1. Mirror walkthrough phase: keep Moves read-only and mirror-backed. Use RetainOS to gather power-user feedback on workflows, dashboard, CSM Reports, Daily Pulse, resources, client detail, journey, and webhook setup.
2. Readiness build phase: close workflow gaps in RetainOS while validating against the current CST mirror snapshot. The mirror can be stale here because we are validating structure and behavior, not performing final reconciliation.
3. Dry readiness phase: run `npm run migration:readiness:moves` and review blockers. Fix config/workflow issues that do not require a fresh Glide sync.
4. Optional temporary Zapier validation phase: 3-5 days before cutover, Jay may enable Moves Zaps to write into RetainOS as validation-only app-owned data while Glide remains the source of truth. Jay can compare Glide and RetainOS side by side during this window. This data is not preserved for final migration.
5. Final sync day: before the clean migration backfill, wipe any temporary Moves app-owned validation data, then Jay triggers the paid Glide/CST sync only when the team is ready to migrate. Immediately rerun the readiness snapshot against the fresh mirror.
6. App-owned backfill phase: create/enable the app-owned company and backfill team, clients, contracts, offers, milestones, resources, customization, notification preferences, and integration tokens from the fresh snapshot.
7. Cutover QA: verify roster counts, active-client counts, CSM assignments, offers/milestones, contracts/renewals, dashboard, CSM Reports, Daily Pulse, resources, client links, and write protections.
8. Source-of-truth flip: only after Jay/Ben approve, switch Moves from mirror/read-only to RetainOS app-owned write mode.
9. Customer signoff: run `CLIENT_FACING_MIGRATION_QA_CHECKLIST.md` or Jay's spreadsheet version after RetainOS is live.

Emergency support stance: keep CST/Glide mirror/archive data available for reconciliation and emergency reference until Moves is fully validated in RetainOS. Do not delete mirrored data during migration. Do not plan a long customer parallel run; after Jay calls go-live, Moves operators should work in RetainOS and route issues back to Jay.

## Remaining Moves-Specific Items

- [~] Journey visual final QA: Jay will validate the visual against the client-profile journey expectations before this doc is fully closed.
- [x] Daily Pulse config validation: Jay has tested this multiple times and shown it in the Moves context; approved as complete.
- [x] Resources structure: RetainOS Help and Company Resources are built. Moves-specific SOPs/resources are customer-owned content that Ben/Moves can add during or after migration, not a RetainOS readiness blocker.
- [x] Ben handoff: complete through real-time Jay/Ben updates. Ben already understands that Moves remains read-only until final migration and that RetainOS plumbing is being built ahead of cutover.
- [~] Contract history confidence: final migration-day item. The official company rollout checklist decides whether client-level renewal fields are sufficient or whether historical contract rows need app-owned backfill before cutover.
- [~] Temporary Zapier validation: optional pre-cutover operating window. If used, RetainOS app-owned data is validation-only and must be wiped before final paid sync/backfill.
- [~] Final sync gate: final migration-day item. Do not run the paid Glide/CST sync until Jay explicitly calls migration day.

## Read-Only Protections

- Moves Method is not a write-mode pilot yet.
- Write actions should be hidden, disabled, or ineffective while the company is mirror-backed.
- If Ben needs to demo write behavior, demo it in Ethical Scaling and explain that Moves remains validation-only until migration begins.

## Daily Pulse Rules

Company-configurable reminder rules added for migration readiness:

- Peak Diagnostic: recurring signal from client onboarding. Moves can use 56 days, but each company can configure the cadence.
- Strategic review: signal before current contract/program end. Moves can use 35 days, but each company can configure the lead time.

Expected hierarchy:

- CSM sees only assigned clients.
- Director, Support, and Super Admin can view company-wide or filter by CSM.
- These signals are persistent operating signals, not dismissible notifications.

## Client Journey Visibility

Client Profile > Pathways & Milestones now has a compact journey visual:

- Milestone progress from configured offer milestones and client milestone records.
- Contract/program timing from current contract start/end or renewal-date fields.
- Program timeline presets for 3-month, 6-month, 12-month, and 2-year views.
- Common checkpoints such as kickoff, 30-day review, Peak Diagnostic, Strategic Review, and program end.
- Missing data shows a clear fallback instead of implied progress.

For Moves Method, this stays read-only from CST mirror data where available. For migrated companies, the same surface uses app-owned offer, milestone, and contract tables.

## Resources Split

Resources is split into:

- RetainOS Help: shared software guides, webhook setup, onboarding docs.
- Company Resources: company-scoped SOPs, coaching docs, Google Drive folders, Loom/video resources, and internal links.

Company resources should only appear for the selected company.

## Fathom / Call Workflow Foundation

Current scope is guidance only, not full Call AI processing.

Resource guides should show:

- Transcript payload setup.
- Call summary / notes payload setup.
- Company-specific ID.
- Expected fields: company ID, client email or attendee emails, transcript/summary, timestamp, recording URL.

Future behavior to validate later:

- Match call to client.
- Store call date/time and recording URL.
- Update last contact and notes/next steps.
- Preserve previous values in history.
- Keep unmatched calls in a manual correction queue.

## Client External Links

Client Profile > Client Details now includes a simple Client Links section for migration support:

- Audits, diagnostics, or review links.
- Client Google Drive folder.
- Other operational docs/notes links.

This is intentionally not a full document-management system.

## QA Plan

Jay read-only/product QA completed on 2026-06-14. Daily Pulse, resources structure, read-only protections, and Ben handoff are approved. The only product QA item left in this doc is the Journey Visual final QA; final migration-day reconciliation now lives in the reusable company rollout checklist in `ROADMAP.md`.

### Moves Read-Only QA

- [x] View As Moves Method.
- [x] Confirm no write actions are available or effective.
- [x] Confirm clients, dashboard, CSM Reports, Daily Pulse, Resources, and Client Detail load.
- [x] Confirm dashboard and CSM Reports caveats are documented if CST mirror data is incomplete.

### Daily Pulse QA

- [x] Validate Today, This Week, and This Month.
- [x] Confirm Peak Diagnostic signals appear on the configured cadence.
- [x] Confirm Strategic Review signals appear on the configured days-before-end window.
- [x] Confirm CSM sees only assigned clients.
- [x] Confirm Director/Super Admin can view company-wide and filter by CSM.

### Journey Visual QA

- [x] Open several Moves clients across different offers.
- [x] Confirm current offer and current milestone are readable and match known CST journey state.
- [x] Confirm the milestone timeline only shows relevant milestones for the active/current offer.
- [x] Confirm contract/program timing matches current contract, renewal, or program-end state.
- [x] Confirm configured checkpoints/check-ins and strategic review markers appear at the expected timing.
- [x] Confirm missing data shows fallback copy, not misleading progress.
- [x] Confirm the visual does not overflow, overlap, or hide labels at the start/end of the timeline.
- [x] Confirm no write actions appear for Moves while it is mirror-backed/read-only.

Jay QA completed on 2026-06-14 after reviewing Moves examples with complete, partial, missing, and offboarded journey data. Final polish keeps kickoff/program end dots anchored on the timeline, places planned checkpoints above the line, places the current marker below the line, and staggers close checkpoint labels to avoid overlap.

### Resources QA

- [x] Confirm RetainOS Help and Company Resources are visually distinct.
- [x] Add/open a company resource link.
- [x] Add/open a Loom/video resource.
- [x] Confirm company resources do not appear for unrelated companies.
- [x] Confirm Moves-specific resource content is not a RetainOS-owned blocker; Moves/Ben will create their own SOP/resource list when ready.

### Call Workflow Resource QA

- [x] Confirm Fathom/Otter/Grain setup guides show the selected company ID.
- [x] Confirm payload examples are copyable.
- [x] Confirm copy explains that full processing is future/controlled unless an endpoint is actually live.

## Handoff For Ben

Handoff for Ben is complete through Jay/Ben's real-time updates. Ben knows:

- What is ready to show Moves.
- What is read-only because Moves is not migrated yet.
- What workflows were added from walkthrough feedback.
- Known caveats, especially dashboard and CSM Reports limitations from CST mirror data.

The reusable official rollout checklist now lives in `OFFICIAL_COMPANY_ROLLOUT_CHECKLIST.md`. Pull that checklist for Moves only when Jay calls the final migration and triggers a fresh CST sync. Use `CLIENT_FACING_MIGRATION_QA_CHECKLIST.md` or Jay's spreadsheet version for customer signoff after go-live.
