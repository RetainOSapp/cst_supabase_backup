# Dashboard And CSM Reports Formula Readiness Packet

Last updated: 2026-06-17

Purpose: define the formulas, source tables, weak spots, and migration-day
validation steps for Dashboard and CSM Reports. This is a readiness packet, not
full formula certification. Full validation waits for Moves Method or another
larger migrated company because Ethical Scaling is too small to stress-test
reporting behavior.

Use this with `OFFICIAL_COMPANY_ROLLOUT_CHECKLIST.md` during final-sync and
cutover QA.

## Current Implementation Map

| Surface | Current source path | Notes |
| --- | --- | --- |
| Dashboard KPI cards | `src/pages/Dashboard.tsx` plus `dashboard_kpi_counts_canonical` | App-owned, offer-filtered, and multi-program views try canonical RPC first. If it errors, the UI falls back to the older client-side or legacy RPC path. |
| Dashboard KPI info SQL | `src/lib/dashboardKpiSql.ts` | User-facing calculation examples are still mirror-table SQL snippets. Treat as explanatory, not the final canonical source for migrated companies. |
| Dashboard charts | `src/pages/Dashboard.tsx` | Reads `clients` for pilot/migrated companies and `backup_company_clients` for mirror-only companies. Chart breakdowns are still client-row calculations. |
| Dashboard KPI drilldowns | `src/pages/Dashboard.tsx` | Client-list drawer uses client-row calculations, not canonical list RPCs. Viewer role cannot open drilldowns. |
| CSM Reports | `src/pages/CsmReports.tsx` | Uses active clients, app-owned `client_history_events` for migrated companies, and mirror history fallback for mirror-only companies. |
| Canonical KPI RPC | `supabase/migrations/20260605103000_dashboard_kpi_counts_canonical.sql` | Applied v1. Supports app-owned and mirror source selection, multi-program filters, offer filters, CSM filters, secondary assignee filters, client-start dates, and reporting dates. |
| Draft canonical SQL reference | `DASHBOARD_CANONICAL_RPC_DRAFT.sql` | Mirrors the applied canonical KPI RPC starting point. |

## Filter Contract

Dashboard canonical formulas must support:

| Filter | Behavior |
| --- | --- |
| Company | Required. Accepts app company id or legacy Glide company id, then resolves app-owned vs mirror source. |
| CSM | Optional. Primary CSM assignment filter. For CSM role, the app forces the signed-in CSM/secondary-assignee scope. |
| Secondary assignee | Optional. Applied when company secondary-assignee setting is enabled. |
| Program/status | Optional multi-value filter. Current canonical RPC accepts `p_program_values text[]`. |
| Offer/pathway | Optional current-offer filter. |
| Client start date | Optional onboarding/start-date range. |
| Reporting date range | Optional KPI/reporting period. Used for offboarded, churn, retention, renewal, and CSM Reports update-rate windows. |

CSM Reports supports:

| Filter | Behavior |
| --- | --- |
| Company | Effective company from role context. |
| CSM | Optional for SuperAdmin/Director/Support. Disabled/scoped for assigned-client roles, though CSMs do not access CSM Reports in v1. |
| Date range | Today, last 7/14/30 days, or custom. Controls client update-rate rows. |
| Field upkeep freshness window | Company setting from `company_settings.profile_upkeep_freshness_days`, default 14. Controls field freshness scoring separately from the selected report date range. |

## Dashboard KPI Formulas

### Active Clients

Formula: count clients with `program_status_value in ('front-end', 'back-end')`.

Primary sources:

- App-owned: `clients.program_status_value`.
- Mirror fallback: `backup_company_clients.program_status_value`.

Validation notes:

- Compare Dashboard active count with Clients list filtered to Front End + Back End.
- For CSM role/scoped filters, include primary and secondary assignee matches where the UI does.

### Front End Clients

Formula: count clients with `program_status_value = 'front-end'`.

Primary sources:

- App-owned: `clients.program_status_value`.
- Mirror fallback: `backup_company_clients.program_status_value`.

Validation notes:

- Compare with Clients list `front-end` status filter.

### Back End Clients

Formula: count clients with `program_status_value = 'back-end'`.

Primary sources:

- App-owned: `clients.program_status_value`.
- Mirror fallback: `backup_company_clients.program_status_value`.

Validation notes:

- Compare with Clients list `back-end` status filter.

### Offboarded Clients

Formula: count clients with `program_status_value = 'off-boarded'` whose
offboarded date falls inside the selected reporting range.

Date priority:

1. App-owned/current: `client_age_date_offboarded`.
2. Legacy compatibility: `client_age_date_offboarded_for_filtering`.

Primary sources:

- App-owned: `clients`.
- Mirror fallback: `backup_company_clients`.

Known weak spots:

- Mirror data can have missing or legacy-derived offboard dates.
- The current canonical RPC uses `coalesce(client_age_date_offboarded, client_age_date_offboarded_for_filtering)`.

Validation notes:

- Spot-check at least 5 offboarded clients in the Dashboard drawer against Client Detail dates.
- Confirm date-range edges: start date inclusive, end date inclusive via `< end + 1 day`.

### Churned Clients

Formula: offboarded clients in the reporting period whose offboarded date is
before the expected/current contract end date.

Contract end priority:

1. `current_contract_end_date`.
2. `current_contract_start_date + current_contract_of_days`.

Primary sources:

- App-owned current client summary fields in `clients`.
- Mirror fallback current client summary fields in `backup_company_clients`.

Known weak spots:

- If a client has no contract end date, it cannot be classified as churned by this formula.
- Contract backfill quality directly affects churn confidence.

Validation notes:

- During migration day, validate churn only after contract/current-renewal coverage is accepted.
- Spot-check any churned clients against Client Detail > Contract.

### Churn Percentage

Formula:

```text
churned_clients / (front_end_clients + back_end_clients + offboarded_clients_in_period) * 100
```

Rounding: whole-number percentage in the current Dashboard.

Known weak spots:

- This is the current operational denominator, not a perfect historical "customers at start of period" reconstruction.
- Good enough for early migration if documented; future canonical reporting may reconstruct start-of-period book more precisely.

Validation notes:

- Confirm numerator equals Dashboard churned client drilldown.
- Confirm denominator components match the visible Front End, Back End, and Offboarded cards for the same filters/date range.

### Retained Clients

Formula: count distinct clients with a retention/renewal event in the selected
reporting period.

Retention event sources:

- App-owned `client_history_events.event_type = 'client_retention_recorded'`.
- App-owned `client_history_events.event_type = 'client_status_changed'` where `from_status` and `to_status` are both in `front-end/back-end`.
- Mirror fallback `backup_company_clients_history` rows where `change_type_code = 'program-status'`, old value is front/back, and new value is front/back.

Accepted transitions:

- Front End to Front End.
- Front End to Back End.
- Back End to Back End.

Known weak spots:

- Same-program renewals depend on the explicit `client_retention_recorded` event. They are not discoverable from status alone.
- If migration misses historical retention events, retention percentage can undercount.

Validation notes:

- Spot-check same-program renewals in `client_history_events`.
- Confirm Front End to Back End upsells are counted once.

### Clients Up For Renewal

Formula: distinct non-paused, non-suspended, non-churned clients with any
current or historical contract end date inside the selected reporting period.

Sources:

- Current client summary calculated end date from `clients` or `backup_company_clients`.
- App-owned `client_contracts.end_date`.
- Mirror fallback `backup_company_clients_contracts.end_date`.

Exclusions:

- `paused`.
- `suspended`.
- Churned clients for the period.

Known weak spots:

- Duplicate current-summary and historical contract rows must not double-count because the formula uses distinct client ids.
- Missing contract backfill reduces renewal confidence.

Validation notes:

- Compare Up For Renewal drawer with Clients sorted/filterable by renewal date.
- Spot-check clients with multiple contracts and clients with only current summary fields.

### Active Clients Up For Renewal

Formula: clients in Up For Renewal whose current status is active
(`front-end/back-end`) and who were not already retained in the selected period.

Sources:

- Same renewal source set as Clients Up For Renewal.
- Retained client set from retention events.

Validation notes:

- This is the "still needs renewal action" list. It should shrink when retention is recorded in the same date range.

### Retention Percentage

Formula:

```text
retained_clients / clients_up_for_renewal * 100
```

Rounding: whole-number percentage in the current Dashboard.

Known weak spots:

- Depends on both contract coverage and explicit retention event coverage.
- A client retained outside the selected date range is not counted as retained for that period.

Validation notes:

- Validate numerator and denominator separately before trusting the percentage.

## Dashboard Chart Formulas

Charts currently use client-row calculations in `src/pages/Dashboard.tsx`.

| Chart | Formula / grouping | Source |
| --- | --- | --- |
| Program Distribution | Count visible clients by `program_status_value`. | `clients` or `backup_company_clients` |
| Buy-in | Count visible clients by `outcomes_buy_in_for_filtering`. | `clients` or `backup_company_clients` |
| Progress | Count visible clients by `outcomes_progress_for_filtering`. | `clients` or `backup_company_clients` |
| Clients By Offer | Count visible clients by `offer_milestones_current_offer_id`; labels come from offer lookup. | `clients` or `backup_company_clients` plus offers |
| Tasks By Status | Count tasks by `status_value`. | `client_tasks` when app-owned; `backup_company_clients_tasks` fallback where wired |
| CSM Active Client Workload | Count active clients by client-managing CSM. | active clients plus app/mirror team |
| CSM Capacity | Active client count divided by configured team-member `capacity_number`. | app/mirror team capacity |

Known weak spots:

- Chart breakdowns are not yet backed by canonical reporting RPCs.
- Client drilldowns use the current loaded client rows and must be compared against KPI counts on migration day.
- Capacity is only meaningful when `capacity_number` is populated.

## CSM Reports Formulas

### Client Set

Formula: active clients only.

Active statuses:

- `front-end`
- `back-end`

Sources:

- App-owned: `clients`.
- Mirror fallback: `backup_company_clients`.

Role/scoping:

- Page access: SuperAdmin, Director, Support.
- CSM Reports excludes CSM users in v1.
- CSM filter uses primary CSM only.

### Client Update Rate

Formula:

```text
clients_with_at_least_one_history_event_in_selected_report_range / active_clients * 100
```

Sources:

- App-owned migrated companies: `client_history_events`.
- Mirror fallback: `backup_company_clients_history`.

Selected report range:

- Today.
- Last 7 days.
- Last 14 days.
- Last 30 days.
- Custom range.

Known weak spots:

- This measures "client touched at least once" in the selected range, not field-level completeness.
- Mirror history can contain broad CST field changes; app-owned history is cleaner.

Validation notes:

- For a CSM row, Updated + Not Updated must equal Clients.
- Overall update rate must equal updated active clients divided by active clients.

### Field Upkeep Score

Formula:

```text
fresh_required_fields / total_required_fields * 100
```

Required fields per active client:

- Next Steps.
- Milestone.
- Date of Last Contact.
- Date of Next Contact.
- Progress.
- Buy-in.

Freshness window:

- Company setting: `company_settings.profile_upkeep_freshness_days`.
- Fallback/default: 14 days.
- This window is independent from the selected CSM Reports date range.

Field freshness sources:

| Field | Fresh when |
| --- | --- |
| Next Steps | Recent `client_history_events.next_steps` exists. |
| Milestone | Recent milestone event exists, or current milestone change date is inside freshness window. |
| Last Contact | Recent `last_contact_at` exists, or `csm_date_of_last_contact` is inside freshness window. |
| Next Contact | Recent `next_contact_at` exists, or `csm_date_of_next_contact` is inside freshness window. |
| Progress | Recent `progress_status` exists, or `outcomes_progress_date` is inside freshness window. |
| Buy-in | Recent `buy_in_status` exists, or `outcomes_buy_in_date` is inside freshness window. |

Complete Profiles:

- Count active clients where all 6 required fields are fresh.

Field Scores:

- For each field, count clients where that field is fresh divided by active clients.

Known weak spots:

- Mirror fallback cannot always identify semantic field changes as cleanly as app-owned history.
- Milestone freshness depends on app-owned milestone events or current milestone change date quality.
- Quick Update and Client Detail writes must consistently write `client_history_events` for this score to stay trustworthy.

Validation notes:

- Confirm the Company Settings freshness window is reflected in CSM Reports copy.
- Use one known Quick Update and confirm the relevant fields move into the updated/fresh side.

### CSM Summary

Formula per active CSM:

```text
total = active clients assigned to CSM
updated = assigned active clients with at least one history event in selected report range
not_updated = total - updated
rate = updated / total * 100
```

Team member inclusion:

- Active team members only.
- Exclude archived.
- Exclude hidden/non-client-managing.
- Exclude read-only/viewer.

Known weak spots:

- CSM Summary groups by primary CSM only; secondary assignee is not currently part of the CSM Summary denominator.
- Unassigned active clients appear in the report rows but are excluded from CSM Summary rows.

Validation notes:

- Before cutover, resolve invalid or unassigned active CSM assignments.
- Confirm CSM Summary active-client totals match Clients list filtered by that CSM.

## Migration-Day Validation Runbook

Run after Jay triggers final paid CST/Glide sync and after app-owned backfill for
the target company.

### 1. Preconditions

- Company is app-owned with `migration_status in ('pilot', 'migrated')`.
- Team members are reviewed and active client-managing CSMs are clean.
- Active-client CSM assignments have no invalid active assignments.
- Contract/current-renewal coverage is accepted or explicitly caveated.
- Offers/milestones are loaded and active clients have expected current offer/milestone references.

### 2. Dashboard KPI Checks

Use the same company and date range for all checks.

| Check | Expected |
| --- | --- |
| Active Clients | Matches Clients list filtered to Front End + Back End. |
| Front End | Matches Clients list Front End filter. |
| Back End | Matches Clients list Back End filter. |
| Offboarded | Matches offboarded clients with offboard date inside selected period. |
| Churned | Every churned client offboarded before contract end. |
| Churn Percentage | `churned / (front + back + offboarded)`. |
| Retained | Matches `client_retention_recorded` plus accepted front/back status-transition renewals. |
| Up For Renewal | Matches distinct clients with contract end in range, excluding paused/suspended/churned. |
| Active Up For Renewal | Up For Renewal minus already-retained, limited to active statuses. |
| Retention Percentage | `retained / up_for_renewal`. |

### 3. Dashboard Filter Checks

Run each check once:

- No CSM filter.
- One CSM filter.
- Secondary assignee filter if enabled.
- Program filter: Front End only.
- Program filter: Back End only.
- Multi-program filter: Front End + Back End.
- Offer/pathway filter.
- Client start date range.
- Reporting date range.

Expected:

- KPI counts, chart totals, and drilldowns move consistently.
- No filter combination errors.
- Large company dashboard load is acceptable for the walkthrough.

### 4. CSM Reports Checks

| Check | Expected |
| --- | --- |
| CSM Reports opens for SuperAdmin/Director/Support. | Page loads without role or data errors. |
| Active-client denominator | Matches active Clients list for company or selected CSM. |
| Update rate | Updated + Not Updated equals active clients. |
| CSM Summary | Each CSM row total matches Clients list filtered by primary CSM. |
| Field Upkeep Score | Uses company freshness window, not selected report range. |
| Field drilldowns | Updated/missing lists sum to active clients for each field. |
| Complete Profiles | Complete + incomplete equals active clients. |

### 5. Cross-Surface Checks

- Dashboard active-client count equals CSM Reports active-client denominator.
- Dashboard CSM workload active-client counts match CSM Reports CSM Summary totals for primary CSMs.
- Clients list CSM dropdown and CSM Reports CSM dropdown use the same active client-managing team.
- Quick Update creates history that CSM Reports can count.
- Contract update/retention events affect Dashboard renewal/retention as expected.

## Known Weak Spots To Watch

1. Ethical Scaling cannot certify formulas at scale because it has too few active clients.
2. Contract coverage drives churn, renewal, and retention confidence.
3. Same-program renewals require `client_retention_recorded`; status-only checks will miss them.
4. Chart breakdowns and KPI drilldowns are not yet canonical RPC-backed.
5. CSM Summary uses primary CSM only; secondary assignee is scope/filter support, not a second CSM Summary owner.
6. Mirror fallback history is noisier than app-owned `client_history_events`.
7. Capacity is only useful when `capacity_number` is populated for team members.

## Close Criteria For Formula Confidence

Mark broader formula validation complete only when:

- Moves Method or another larger migrated company passes the Dashboard KPI checks.
- CSM Reports active-client and CSM Summary denominators match Clients list checks.
- Contract/renewal spot checks support retention and renewal counts.
- No material discrepancy exists between canonical KPI counts and current UI counts.
- Any intentional caveats are documented in `ROADMAP.md` and the company migration notes.

Until then, keep Dashboard/CSM formula confidence as migration-readiness prepared,
not fully validated.
