# Dashboard Formula Validation

Canonical planning notes for Dashboard, CSM Reports, reporting PDFs/CSVs, and future AI summaries.

Last updated: 2026-06-05

## Why This Exists

Dashboard metrics currently come from a mix of:

- Existing Supabase RPCs for core dashboard KPIs.
- Client-side fallbacks for offer-filtered and multi-program-filtered views.
- Mirrored Glide tables for non-migrated companies.
- App-owned RetainOS tables for pilot/migrated companies where wired.

For migration readiness, the same formulas should eventually live in canonical Supabase SQL views/RPCs so Dashboard, CSM Reports, alerts, reports, exports, and AI all read the same numbers.

Canonical SQL starting point: `DASHBOARD_CANONICAL_RPC_DRAFT.sql`.

2026-06-05 canonical RPC v1:

- Migration applied: `supabase/migrations/20260605103000_dashboard_kpi_counts_canonical.sql`.
- Function: `dashboard_kpi_counts_canonical`.
- Supports app-owned pilot/migrated `clients` and mirror-only fallback.
- Supports multi-program filters through `p_program_values text[]`, offer filters, primary/secondary CSM filters, onboarded-date filters, and reporting date ranges.
- Legacy contract and history joins are scoped through the filtered client set to avoid broad scans.
- Smoke-tested against Ethical Scaling after apply.
- UI status: Dashboard has not fully switched to the canonical RPC yet; it still uses the validated app-owned client-side formula path for pilot/migrated companies while this RPC is validated further.

## Current Dashboard Sources

Current app behavior:

- Mirror-only Overview KPI cards call existing RPCs:
  - `dashboard_kpi_counts_primary`
  - `dashboard_kpi_counts_retention`
  - `dashboard_clients_list`
- The local definitions for KPI info modals live in `src/lib/dashboardKpiSql.ts`.
- Pilot/migrated company KPI cards now use the app-owned client-side formula path in `src/pages/Dashboard.tsx`, even with no offer filter selected.
- Offer-filtered and multi-program-filtered KPI views also use that client-side formula path.
- Charts read:
  - `clients` for pilot/migrated companies.
  - `backup_company_clients` for mirror-only companies.
  - `backup_company_clients_tasks` for task status chart.

2026-06-04 pilot hardening:

- Ethical Scaling / app-owned companies no longer fall back to the legacy Dashboard KPI RPCs on the default no-offer view.
- App-owned offboarded counts use `client_age_date_offboarded` first, then the legacy filtering date.
- Retention reads app-owned `client_history_events` status transitions, app-owned `client_retention_recorded` events, and legacy Glide status history where present.
- Renewal/up-for-renewal reads app-owned `client_contracts` and legacy contract rows where present.
- Remaining goal: move this now-validated logic into canonical SQL/RPC so the UI no longer owns reporting formulas.
- 2026-06-05: canonical RPC v1 exists and is smoke-tested; remaining goal is switching UI/reporting consumers to the RPC and comparing values against the current Dashboard output during QA.

## Canonical Filter Contract

Every canonical Dashboard query should support the same filter contract:

- `company_id`: required, legacy Glide company id or app company id must be normalized by the query layer.
- `csm_id`: optional primary CSM/team member id.
- `secondary_assignee_id`: optional secondary assignee id where company setting enables it.
- `program_values`: optional array of program/status values, not a single value.
- `offer_id`: optional current offer id.
- `client_start_date_from`: optional onboarded/start date lower bound.
- `client_start_date_to`: optional onboarded/start date upper bound.
- `date_range_start`: optional reporting period lower bound.
- `date_range_end`: optional reporting period upper bound.
- `source_mode`: derived internally from company migration status:
  - app-owned `clients` for `pilot` / `migrated`.
  - mirrored `backup_company_clients` for `mirror_only`.

## Canonical Status Definitions

Program/status values currently used by RetainOS:

- `front-end`
- `back-end`
- `paused`
- `suspended`
- `off-boarded`

Canonical groups:

- Active clients: `front-end`, `back-end`.
- Inactive operational holds: `paused`, `suspended`.
- Offboarded/lost clients: `off-boarded`.

Product notes:

- Reactivation is not a separate status. Moving a client back to Front End or Back End is the reactivation action.
- Paused/Suspended require reasons in write mode. Paused also requires a return date and extends app-owned contract dates.

## Formula Definitions

### Active Clients

Definition:

- Count clients whose current status is `front-end` or `back-end`.

Current implementation:

- Existing dashboard RPC path supports this for single/no program filters.
- Chart/workload path uses this definition for active client workload and capacity.

Canonical gap:

- Ensure app-owned and mirror-only source selection is handled in SQL/RPC, not client code.
- Ensure multi-program filters can be passed as arrays.

### Front End Clients

Definition:

- Count clients whose current status is `front-end`.

Canonical gap:

- Same as Active Clients.

### Back End Clients

Definition:

- Count clients whose current status is `back-end`.

Canonical gap:

- Same as Active Clients.

### Offboarded Clients

Definition:

- Count clients whose current status is `off-boarded` and whose offboarded date is inside the selected reporting period.

Current date priority:

1. `client_age_date_offboarded`
2. `client_age_date_offboarded_for_filtering`
3. fallback contract end date only where legacy data requires it

Canonical gap:

- For app-owned RetainOS data, use `client_age_date_offboarded` as the canonical filter date.
- Keep `client_age_date_offboarded_for_filtering` only as legacy Glide mirror compatibility while mirror data still needs it.

### Churn Percentage

Formula source:

- `# of Customers Lost During Period / # of Customers at Start of Period x 100`

Pilot v1 interpretation:

- Numerator: clients offboarded during the selected reporting period before their expected contract end date.
- Denominator: active book for the period plus clients offboarded during the period.
- Current denominator approximation in app/RPC paths: `front-end + back-end + off-boarded in period`.

Recommendation:

- Use active clients plus period offboardings as the pilot denominator. This is close enough operationally to "customers at start of period" for current usage and avoids overbuilding status reconstruction before migration.

### Retention Percentage

Formula:

- `# of Renewals / Total # of Clients Eligible for Renewal x 100`.

Renewal/retention triggers:

- Front End to Front End: renewal.
- Front End to Back End: renewal/upsell.
- Back End to Back End: renewal.

Important product rule:

- Program change is the critical retention trigger.
- Contracts should prompt or support the renewal action, not be the only source of retention truth.
- Example: a Front End client can be renewed into Front End again, then the user should be prompted to add the new contract/end date.

Pilot v1 implementation:

- Client Detail > Contract can record a `client_retention_recorded` event when a new contract represents a renewal or upsell.
- Same-program renewals are now supported because they no longer depend on a visible status label change.
- Front End to Back End upsells can be recorded from the New Contract flow and move the client to Back End.
- Renewal/upsell events can optionally mark Success, which writes the app-owned success outcome and date.

Remaining gap:

- Build the higher-fidelity renewal flow and reporting breakdowns after the pilot event shape is QAed.

Denominator:

- Clients eligible for renewal in the selected reporting period, based on contract end/renewal timing.

Breakdowns needed:

- Total retention.
- Renewal vs upsell distinction.
- FE -> FE, FE -> BE, and BE -> BE where useful for reporting.

Recommendation:

- For pilot, count retained clients from app-owned `client_retention_recorded` events and app-owned status history where `from_status`/`to_status` match the transitions above.
- Keep contract end dates as the "up for renewal" driver and as the prompt to add/extend contracts.

### Up For Renewal

Definition:

- Active clients whose current or historical contract end date falls inside the selected reporting period and who have not already been retained in that period.

Exclusions:

- Paused
- Suspended
- Churned before expected contract end

Canonical gap:

- Decide how pause extensions and multi-contract values should affect renewal date once `client_contracts` becomes the source of truth.
- Later idea: allow offers to define a default contract duration template. Example: Ethical Scaling's Optimized Journey could default to a 91-day contract instead of requiring manual duration entry each time.

### CSM Active Client Workload

Definition:

- Count active clients (`front-end`, `back-end`) grouped by assigned primary CSM/team member.

Team member inclusion:

- Active team members only.
- Exclude archived members.
- Exclude read-only/viewer members.
- Exclude team members marked as hidden from CSM/client-manager lists.

Canonical gap:

- Move the active client-manager roster logic into a reusable SQL view or RPC.

### CSM Capacity

Pilot v1 definition:

- Active clients assigned to a team member / configured `capacity_number`.

Current UI behavior:

- If `capacity_number` is blank, show `Not set`.
- Utilization is only displayed when capacity is configured and greater than zero.

Recommendation:

- Current capacity display is sufficient for pilot.
- Add separate 30-day forecast later using upcoming renewals/offboardings/new expected clients.

### Profile Updated Score

Definition:

- Use active clients only.
- Score is a percentage, not binary.
- For each active client, check whether the required upkeep fields were updated within the configured freshness window.

Default freshness window:

- 14 days.
- Make this company-configurable later.

Required upkeep fields:

- Next Steps.
- Milestone.
- Date of Last Contact.
- Date of Next Contact.
- Progress.
- Buy-in.

Recommendation:

- Keep CSM Reports "updated/not updated" as a simple v1 compliance table.
- Build Profile Updated Score separately as a percentage formula using the field freshness rules above.
- Current v1 calculates this in `src/pages/Dashboard.tsx` using recent app-owned `client_history_events` first and current client date fields as fallback. After QA, move it into a canonical SQL/RPC so Dashboard, reports, exports, and alerts all use the same source.

### Success Rate

Definition:

- Success is primarily counted when the Success outcome/button is marked yes.

CSM prompt/reminder triggers:

- Client completes the final milestone of an offer.
- Client offboards after the end of contract.
- Client renews:
  - Front End to Front End.
  - Front End to Back End.
  - Back End to Back End.

Recommendation:

- Success Rate should count the success outcome itself, while the milestone/offboard/renewal events should remind or prompt the CSM to update success.
- Pilot v1: the New Contract renewal/upsell flow prompts the user to mark Success with the renewal.

### Average Time To Success

Definition:

- Start: date added to the app / onboarded date.
- End: date Success was marked yes.

Recommendation:

- Average Time to Success = success marked yes date minus onboarded date.

## Proposed Next SQL/RPC Work

Create one canonical RPC family that accepts multi-value filters:

- `dashboard_kpi_counts_canonical`
- `dashboard_clients_list_canonical`
- `dashboard_chart_breakdown_canonical`
- `dashboard_csm_workload_capacity_canonical`

Current applied starting point:

- `DASHBOARD_CANONICAL_RPC_DRAFT.sql` now mirrors the applied `dashboard_kpi_counts_canonical` v1 migration.

These should:

- Resolve company migration status internally.
- Read app-owned `clients` for pilot/migrated companies.
- Read `backup_company_clients` for mirror-only companies.
- Accept `program_values text[]`.
- Return both counts and drilldown-compatible client IDs.

## Validation Checklist

For Ethical Scaling pilot:

- Compare current Dashboard overview cards against canonical query outputs.
- Test no program filter.
- Test one program filter.
- Test multi-program filter: Front End + Back End.
- Test offer filter.
- Test CSM filter.
- Test date range and client start date filters.
- Confirm Dashboard and CSM Reports agree on active-client and active-manager denominators.
