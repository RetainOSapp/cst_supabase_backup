# Pipeline bounded renewal cohort API contract

Status: frontend rollout contract; no backend or schedule change is made by this document.

The Pipeline frontend will keep materialization disabled unless this contract is
implemented by `manage-pipeline-automation`. A response which omits the binding
fields is display-only and must not be treated as approval to run.

## Preview

`POST manage-pipeline-automation`

```json
{
  "action": "preview_renewals",
  "companyLegacyId": "...",
  "pipelineId": "...",
  "renewalDateFrom": "2026-08-01",
  "renewalDateTo": "2026-08-31",
  "maxItems": 25
}
```

The server validates inclusive ISO dates, requires `from <= to`, rejects ranges
longer than 366 days and caps outside `1..100`, applies the date range before the
cap using a deterministic ordering, and returns full-window
aggregates/exclusions plus only the selected eligible candidates.
`eligibleCount` is the complete eligible count in the requested window;
`selectedCount` is the bounded run cohort and defaults in the frontend to
`candidates.length` when omitted by an otherwise compliant API. The response
must echo the exact inputs under `binding.cohort` and
return an opaque, short-lived `binding.previewToken` that binds company,
pipeline, actor, dates, cap, selected source-contract IDs, and eligibility
snapshot.

```json
{
  "enabled": true,
  "pipelineId": "...",
  "eligibleCount": 2,
  "selectedCount": 2,
  "excludedCount": 7,
  "totalEvaluated": 9,
  "exclusionCounts": { "already_exists": 1 },
  "candidates": [{ "contract_id": "...", "client_id": "...", "client_name": "Example", "eligibility_status": "eligible" }],
  "binding": {
    "cohort": { "renewalDateFrom": "2026-08-01", "renewalDateTo": "2026-08-31", "maxItems": 25 },
    "previewToken": "opaque-server-token"
  }
}
```

## One-time run

`run_renewals` accepts the same company/pipeline/cohort fields and the exact
`previewToken`. The server must reject missing, expired, altered, cross-actor,
or stale tokens; it must materialize only the token's selected contracts, never
recompute an unbounded cohort. It must return created/skipped counts and leave
recurring automation and scheduler configuration unchanged.

## Optional status

`{ "action": "status", "companyLegacyId": "..." }` is read-only and may
return `globalPaused`, `companyPaused`, `pipelinePaused`, `schedulerRegistered`,
`lastRunAt`, `lastRunStatus`, `lastFailureAt`, and `lastFailure`. Until it does,
the frontend renders those facts as unavailable/unknown and never infers that a
schedule is absent or enabled.

## Self-serve QA checklist

- [ ] SuperAdmin enters an explicit valid date window and cap (1–100); invalid values cannot preview.
- [ ] Preview shows the exact requested window/cap, full eligible count, selected names/count, and exclusion counts without writes.
- [ ] Editing any date or cap clears the preview and disables run.
- [ ] Director sees the same preview controls but no run control.
- [ ] SuperAdmin run stays disabled when binding is missing or differs from the current inputs.
- [ ] Confirmation repeats the exact cap/window and says recurring automation/schedules stay unchanged.
- [ ] Status panel shows API-reported pause/run/failure facts or the explicit unknown state; it contains no mutation controls.
