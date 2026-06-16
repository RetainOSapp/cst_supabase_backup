# Contract Backfill And Renewal Reporting Plan

Scope for this document: implementation guidance and QA gates. Contract backfills remain dry-run/read-only unless `--apply` is explicitly approved for a selected company.

## Current Implemented State

- `clients` is the app-owned current-state client table for `pilot` / `migrated` companies. It stores mirrored current-contract summary fields:
  - `current_contract_start_date`
  - `current_contract_of_days`
  - `current_contract_end_date`
  - `current_contract_end_date_for_filtering`
  - `current_contract_monthly_value`
  - `current_contract_reference_link`
  - `current_contract_notes`
  - `current_contract_auto_renew`
- `client_contracts` is the app-owned contract history table. It stores `glide_row_id`, `client_id` as the legacy Glide client id, dates, value fields, status, archived marker, source snapshot, and metadata.
- New/edit/archive contract writes are implemented through `supabase/functions/manage-client-contract/index.ts` for app-owned pilot/migrated clients.
  - Create inserts `client_contracts`, updates the `clients` current-contract summary, writes `contract_created`, and optionally writes `client_retention_recorded`.
  - Update edits an unarchived app-owned contract, then recomputes the client current-contract summary from the latest unarchived contract.
  - Archive marks the contract archived, then recomputes the client current-contract summary.
- Contract history events are allowed by `supabase/migrations/20260607153000_contract_edit_archive_history.sql`.
- Historical activity backfill already exists in `scripts/backfill-company-activity.mjs`.
  - It resolves a company by app id, legacy id, or name.
  - It reads app-owned `clients`.
  - It backfills missing `client_contracts` rows from `backup_company_clients_contracts`.
  - It backfills missing `client_milestones` rows from `backup_company_clients_milestones`.
  - It defaults to active/pilot-relevant statuses: `front-end`, `back-end`, `paused`, `suspended`.
  - `--include-archived` intentionally expands the scope to all app-owned clients.
  - It is dry-run by default and writes only with `--apply`.
- Generic reconciliation exists in `scripts/reconcile-company-pilot.mjs`.
  - It checks client counts, missing/app-only client rows, status distributions, selected current-state field diffs, assignment validity, app-owned offers/milestones, missing historical app contracts/milestones, history count, audit count, and rollout blockers.
  - It now reports contract field parity, latest app/mirrored contract-to-client-summary parity, renewal denominator source parity, retention source parity, active up-for-renewal ids, and active-client renewal date source confidence.
  - Formula output parity against the Dashboard UI/RPC is still a manual QA step.
- Dashboard KPI canonical RPC v1 exists in `supabase/migrations/20260605103000_dashboard_kpi_counts_canonical.sql`.
  - It supports app-owned pilot/migrated `clients` and mirror-only fallback.
  - It supports multi-program, offer, CSM, secondary CSM, onboarded-date, and reporting-date filters.
  - It counts retention from app-owned `client_retention_recorded`, app-owned active-to-active status changes, and legacy Glide status history.
  - It counts renewal candidates from current contract end dates plus contract history.
- Dashboard UI now tries `dashboard_kpi_counts_canonical` first, then falls back to existing client-side/legacy calculations.
- Paused status currently extends contract dates in `manage-client-status`.
  - It updates the app-owned `clients` current-contract end/filtering date and `current_contract_of_days`.
  - If a latest `client_contracts` row exists, it updates that row's `end_date`, `contract_days`, and metadata.
  - It writes the pause extension details into the `client_status_changed` history payload.

## Backfill Strategy

Backfill should be company-by-company and idempotent.

1. Freeze or define source-of-truth rules for the target company.
   - Before migration, Glide mirror is still the historical reference.
   - During the migration window, avoid simultaneous Glide and RetainOS contract edits.
   - After migration, RetainOS app-owned tables are the source of truth.
2. Run preflight reconciliation:
   - `npm run pilot:reconcile:company -- --company="Company Name"`
   - Block if app-owned client rows are missing for mirrored clients intended to migrate.
   - Block if active/pilot clients point to invalid CSM assignments.
   - Block if active clients reference missing active app-owned offers or milestones.
3. Run historical activity dry-run:
   - `npm run pilot:backfill:company-activity -- --company="Company Name"`
   - Review `contractsToBackfill`, `contractSample`, `clientMilestonesToBackfill`, and `unresolvedClientMilestonesSkipped`.
   - Use the default active/pilot-relevant scope for the first rollout unless product explicitly wants offboarded historical reporting in app-owned tables immediately.
   - Do not add `--apply` until reconciliation has been captured for the same date range and Jay/Ben accepts the dry-run samples.
4. Apply the backfill only after the dry-run sample is accepted:
   - `npm run pilot:backfill:company-activity -- --company="Company Name" --apply`
5. Re-run reconciliation.
   - Missing app contracts should shrink to zero for the selected scope.
   - Remaining missing contracts should be explainable by excluded offboarded/archived clients if `--include-archived` was not used.
   - Review `contractConfidence.activeClientCoverage.renewalDateSources`; active clients should usually resolve from `client_summary_filtering_date` or `client_summary_end_date`, with any `missing` entries manually explained.
   - Review `renewalConfidence.currentSummaryOnlyRenewingIds` and `renewalConfidence.historyOnlyRenewingIds` for the selected period before trusting Dashboard renewal reporting.
6. For companies with meaningful historical reporting needs, run a second dry-run with `--include-archived`.
   - Apply only if the company needs full historical/offboarded contract reporting before pilot use.

Recommended contract-specific backfill behavior:

- Keep `glide_row_id` as the idempotency key.
- Preserve the complete source row in `source_snapshot`.
- Use `status` from the mirror when present; otherwise use `historical`.
- Never overwrite existing app-owned contracts by default.
- Do not update `clients.current_contract_*` from historical backfill unless a separate reconciliation proves the latest unarchived contract row should be authoritative for that client. The current script currently only inserts historical rows, which is safer.

## Required Reconciliation Checks

Add a contract/renewal confidence section to the generic reconciliation command before migrating another company.

Pre-migration checks:

- Company identity:
  - exactly one app-owned `companies` row matches the selector;
  - `legacy_glide_row_id` matches `backup_companies.glide_row_id`;
  - `migration_status` is expected for the stage.
- Client row parity:
  - mirrored count vs app-owned count;
  - missing app rows;
  - app-only rows;
  - status distribution;
  - current contract summary field diffs against mirror for clients not edited app-side.
- Contract history parity:
  - mirrored `backup_company_clients_contracts` count for target client set;
  - app-owned `client_contracts` count for target company/client set;
  - missing app contract ids by `glide_row_id`;
  - app-only contract ids;
  - field diffs for matching rows: `client_id`, `start_date`, `end_date`, `monthly_value`, `total_contract_value`, `auto_renew`, `reference_link`, `status`;
  - archived app contracts excluded from active latest-contract checks but still counted separately.
- Latest-contract/current-summary parity:
  - for each active/pilot client, compute latest unarchived app contract by `end_date desc nulls last, created_at desc`;
  - compare it to `clients.current_contract_*`;
  - separately compare mirror latest/current summary before app contract writes begin;
  - report clients where the latest contract end date and current summary end date disagree.
- Renewal denominator parity:
  - for a fixed date range, compute renewing client ids from current summaries;
  - compute renewing client ids from contract history;
  - union and dedupe;
  - report which ids enter only through current summary vs only through history.
- Retention numerator parity:
  - app-owned `client_retention_recorded` event count by range;
  - app-owned active-to-active `client_status_changed` transitions by range;
  - legacy active-to-active status history by range;
  - duplicate clients counted by more than one source.
- Formula output parity:
  - call `dashboard_kpi_counts_canonical`;
  - compare to an independent reconciliation-side calculation for the same filters;
  - compare to Dashboard UI fallback values while fallback still exists.

Post-backfill checks:

- Missing app contracts for the selected scope are zero or explicitly explained.
- Contract field diffs are zero for untouched backfilled rows after normalizing timestamps and numeric values.
- No duplicate active app contracts by `glide_row_id`.
- No app contract points to a client outside the selected company.
- Latest app contract summary agrees with `clients.current_contract_*` for clients whose latest contract came from a RetainOS write.
- Backfilled historical rows do not unexpectedly change current dashboard counts unless they add legitimate historical renewal dates.

Post-migration checks:

- `migration_status` moved from `mirror_only` to `pilot`, then to `migrated` only after no blockers.
- New RetainOS contract create/edit/archive writes produce history and audit events.
- Reconciliation notes distinguish expected app-only pilot-created contracts from suspicious rows.
- Running the reconciliation twice is stable.

## Renewal Formula Confidence

Canonical definitions should be made explicit before the next company migration.

Active clients:

- `program_status_value in ('front-end', 'back-end')`.

Paused/suspended exclusions:

- Exclude `paused` and `suspended` from renewal denominator and up-for-renewal action lists.
- Paused clients can return later with extended contract dates; they should not be counted as currently actionable during the pause.

Offboarded exclusions:

- Up-for-renewal action lists should exclude `off-boarded`.
- Retention denominator needs a product decision:
  - operational/actionable denominator: active clients only, excluding offboarded;
  - historical performance denominator: clients whose contract ended in range, excluding only true churn-before-contract-end.
- Current canonical RPC excludes paused/suspended and churned clients, but not all offboarded clients. This can include offboarded-but-not-churned clients in `renewing_clients`. That may be acceptable for historical retention percentage, but it is not acceptable for "active clients up for renewal" action reporting.

Date filters:

- `date_range_start` and `date_range_end` apply to:
  - offboarded date for offboarded/churn;
  - retention event created date for retained clients;
  - contract end date for renewal/up-for-renewal denominator;
  - inclusive start, exclusive day-after end.
- `client_start_date_from` and `client_start_date_to` apply to onboarded date.
- Current RPC also excludes clients onboarded after `date_range_end`; keep this behavior for period reporting, but document it as "client must exist by report period end."

Contract end date priority:

1. `clients.current_contract_end_date`
2. calculated `current_contract_start_date + current_contract_of_days`
3. unarchived `client_contracts.end_date`
4. legacy `backup_company_clients_contracts.end_date` only for mirror-only companies or while historical backfill is incomplete

Retention numerator:

- Count a client once per selected period if it has:
  - `client_retention_recorded`; or
  - `client_status_changed` from active status to active status; or
  - legacy program-status history from active status to active status.
- Same-program renewals must rely on `client_retention_recorded`, because a status label may not change.

Recommended near-term adjustment:

- Keep `renewing_clients` as the retention denominator if the product wants historical retention percentage.
- Keep `active_renewing_clients` as the action metric and require `program_status_value in ('front-end', 'back-end')` and no retained event in range.
- Add a reconciliation warning if `renewing_clients` includes any `off-boarded` ids so Jay/Ben can decide whether the denominator should be active-only before rollout.

## Paused Contract Extensions

Current behavior is mostly right for current-state reporting:

- Pausing requires a return date.
- Pause extension days are calculated from now to return date.
- The client current-contract end date and filtering date are shifted.
- The latest app-owned contract row is shifted when one exists.
- The status-change history payload records the extension and updated contract.

Confidence gaps:

- If no app-owned contract row exists yet, only the `clients` summary is extended. Historical contract reporting will not show a contract row mutation.
- If the latest contract row is selected only by `end_date`, a historical backfilled row could be updated if it has the furthest end date. That may be acceptable, but should be explicitly checked.
- Pause extension is stored as metadata/history, not as a distinct contract extension row.

Recommendation:

- For migration readiness, keep the current mutation model but add reconciliation checks:
  - paused clients have `program_paused_return_date`;
  - paused clients have `program_latest_pause_extension_days > 0`;
  - current contract end date equals pre-pause end plus extension days where a pre-pause value exists;
  - latest app contract metadata has `latest_pause_extension_days` when a latest app contract exists.
- Later, add a first-class `contract_extension` / `pause_extension` history event or contract audit table only if reporting needs extension breakdowns.
- Do not create a new contract row for pause extensions in the first slice; extending the existing current contract avoids inflating renewal denominators.

## SQL, RPC, And Function Changes Needed

No immediate schema migration is required for historical contract backfill.

Recommended changes before the next company migration:

- Extend `scripts/reconcile-company-pilot.mjs` with a `contractConfidence` / `renewalConfidence` section.
- Add a small SQL helper or script-side query for independent renewal id calculation.
- Update `dashboard_kpi_counts_canonical` only after reconciliation shows the current formula's exact offboarded behavior.
  - If the product chooses active-only renewal denominator, change `renewing_clients` to require `program_status_value in ('front-end', 'back-end')`.
  - If the product keeps historical denominator, leave `renewing_clients` broader and make `active_renewing_clients` the action KPI.
- Consider adding `archived_at is null` / `status <> 'archived'` to the app-owned `contract_history` branch in the canonical RPC. Dashboard client-side fallback already filters app contracts by `archived_at is null`; the RPC should match.
- Consider adding a canonical reporting RPC that returns renewal client ids, not only counts, so dashboard drilldowns and reconciliation can compare the same source.
- No Edge Function change is required before the first slice unless reconciliation proves pause extension is updating the wrong latest contract.

## First Smallest Valuable Implementation Slice

Implement only a reconciliation/reporting-confidence slice, not new UI:

1. Extend `scripts/reconcile-company-pilot.mjs`.
2. Add `contractConfidence`:
   - mirrored/app contract counts;
   - missing/app-only contract ids;
   - field diffs for matching contracts;
   - latest app contract vs client current summary mismatches;
   - archived app contract count.
3. Add `renewalConfidence` for a date range argument:
   - default next 30 days if no range is passed;
   - renewing ids by current summary;
   - renewing ids by app contract history;
   - renewing ids by legacy contract history;
   - retained ids by app retention events/status changes/legacy status history;
   - active up-for-renewal ids after excluding retained, paused, suspended, and offboarded;
   - offboarded ids currently entering the broader denominator as a warning.
4. Run it on Ethical Scaling before applying historical activity backfill.
5. Apply the existing activity backfill for Ethical Scaling only if the dry-run sample is accepted.
6. Re-run reconciliation and compare before/after output.

This slice is valuable because it proves the backfill and renewal formulas without changing product behavior.

## QA Checklist

Script QA:

- `npm run pilot:reconcile:company -- --company="Ethical Scaling"` reports no rollout blockers.
- Contract confidence reports expected missing historical contracts before backfill.
- `npm run pilot:backfill:company-activity -- --company="Ethical Scaling"` dry-run sample is reviewed.
- Apply command inserts only the expected missing rows.
- Reconciliation after apply shows expected app-owned contract count and no unexpected field diffs.
- Re-running the apply command does not insert duplicates.

Dashboard QA:

- Dashboard canonical RPC values match the reconciliation-side calculation for:
  - no filters;
  - Front End only;
  - Back End only;
  - one CSM;
  - one offer;
  - next 30 days;
  - a custom historical range.
- Up For Renewal drilldown contains only active clients for the action KPI.
- Paused and suspended clients are excluded.
- Offboarded clients are either excluded or intentionally included only in the historical denominator, according to the product decision.
- A same-program renewal creates `client_retention_recorded` and removes that client from active up-for-renewal for the same period.
- A Front End to Back End upsell creates `client_retention_recorded`, updates status to `back-end`, and counts as retained.

Pause QA:

- Pause a test active client with a future return date.
- Verify `clients.current_contract_end_date_for_filtering` shifts by the extension window.
- Verify latest unarchived app contract shifts when present.
- Verify `client_status_changed` payload includes `pause_extension_days` and `updated_contract`.
- Verify Dashboard up-for-renewal excludes the paused client while paused.
- Move the client back to active and verify the extended renewal date is used.

## Rollout Sequence For The Next Company

1. Select company and confirm no active RetainOS/Glide double-write window.
2. Ensure app-owned company/team/client rows exist.
3. Run generic reconciliation.
4. Resolve blockers: missing clients, invalid active CSM assignments, missing active offer/milestone config.
5. Run contract/renewal confidence checks with default next-30-days and at least one historical period.
6. Run historical activity backfill dry-run.
7. Review contract and milestone samples with Jay/Ben.
8. Apply backfill for active/pilot-relevant clients.
9. Re-run reconciliation and contract/renewal confidence checks.
10. Smoke-test Dashboard canonical RPC and Dashboard UI for the company.
11. Move company to `pilot`.
12. Run one manual contract create/edit/archive/renewal flow against a test or approved real client.
13. Re-run reconciliation.
14. If no blockers and pilot use is stable, move company to `migrated`.

## Open Decisions

- Should `renewing_clients` retention denominator be active-only, or should offboarded-but-not-churned clients remain in the historical performance denominator?
- Should historical/offboarded client contracts be fully backfilled for each company before migration, or only when reporting needs require it?
- Should pause extensions remain metadata on the current/latest contract, or become first-class extension records later?
- Should Dashboard drilldowns move to a canonical id-returning RPC before broader migration?
