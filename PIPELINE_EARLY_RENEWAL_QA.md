# Pipeline Early-Renewal QA And Rollout Gate

Status: local candidate and all Jay resettable scenarios passed on 2026-07-20;
Production Gates D and E passed on 2026-07-20. No frontend release has occurred.
This checklist is the source of truth for the early-renewal addition and the
remaining Gate F rollout.

## Product Contract

When a renewal is signed before the next contract starts:

1. The Pipeline item moves to **Won** immediately and its commercial value is
   recorded.
2. A `client_retention_recorded` history event is written immediately, with the
   future contract start date as the retention effective date. This preserves
   the signed decision without counting it in an earlier Dashboard period.
3. The new contract is stored as **Pending**. It does not replace the current
   contract summary before its start date.
4. For a Front End client, the operator chooses either **Continue current Front
   End program** or **Move client to Back End**.
5. A Back End move defaults to **On contract start date** for a future contract.
   **Now** remains an explicit override.
6. On the start date, the server activates the contract, refreshes the current
   contract summary, applies the configured program status once, and writes
   Client History plus audit evidence.
7. Paused, suspended, offboarded, archived, manually changed, or inconsistent
   records fail closed as **Blocked** for review. The worker never guesses.

The same server transaction is used from Pipeline Won and Client Detail > New
Contract. Editing the pending contract updates its activation date; archiving
or deleting it cancels the pending activation.

## Local Resettable QA

Open `http://127.0.0.1:5174/pipeline-preview.html` and choose **QA sandbox**.
Nothing on this page reads or writes Supabase.

### Future Front End To Back End Renewal

- [x] Click **Reset sample data**.
- [x] Open Alex Morgan in Renewal > Strategic Review.
- [x] Change Stage to **Won** and click **Save changes**.
- [x] Confirm the guided form defaults the contract start to Alex's future
      renewal date.
- [x] Choose **Move client to Back End**.
- [x] Confirm **On contract start date** is selected and the form explains that
      Won is recorded now while the contract remains Pending.
- [x] Click **Confirm Won**. Alex moves to Won and **Pending activations** becomes
      1.
- [x] Click **Early renewal: reach start date**. Pending activations becomes 0
      and the success message confirms one activation.
- [x] Click the same button again. It says **No activation due** and creates no
      duplicate transition.

### Continue Current Program

- [x] Reset, repeat Alex's Won flow, and leave **Continue current Front End
      program** selected.
- [x] Confirm the future contract is still Pending until the start-date action.
- [x] Reach the start date and confirm the contract activates without a Front
      End to Back End promise.

### Explicit Immediate Override

- [x] Reset, choose **Move client to Back End**, then select **Now**.
- [x] Confirm the copy still says the future contract remains Pending until its
      start date; only the program-status transition is immediate.
- [x] Reach the start date and confirm the activation is idempotent.

## Automated Local Evidence

| Gate | Result |
| --- | --- |
| Phase 0-2 verifier | 55/55 pass |
| Phase 3-4 verifier | 47/47 pass |
| Early-renewal verifier | 18/18 pass |
| TypeScript/Vite build | Pass; existing chunk-size warning only |
| Browser future Won -> pending -> activate -> retry | Pass |

Static and browser evidence do not replace PostgreSQL runtime QA.

## Production Gate D — Foundation, Still Inert

Approved and completed on 2026-07-20.

- [x] Record exact migration/rollback and two Edge Function hashes.
- [x] Apply `20260720010000_early_renewal_scheduled_activation.sql` before either
      changed Edge Function.
- [x] Verify zero pre-existing scheduled activations and exactly one scheduler
      job, running every 15 minutes.
- [x] Verify the schedule table has RLS and no browser-role table privileges;
      only service-role RPC execution is allowed.
- [x] Deploy `manage-client-contract` and `manage-pipeline-workspace` with JWT
      verification enabled.
- [x] Keep renewal auto-entry/generation, offboarding sync, and stage-task
      automation in their current off/paused states.
- [x] Verify existing ES/MM Pipeline items, contracts, summaries, history, and
      automation-run counts are unchanged.

Stop for any unexpected row, job, privilege, function, or company-gate change.

Gate D evidence:

- Frozen SHA-256: migration `f87a0e09...b36fb`, rollback
  `8f2be749...18304`, contract source `45a19b38...4b0b`, workspace source
  `c0da86a0...3db9`.
- The guarded migration transaction preserved every protected baseline count
  and both company-settings/Pipeline fingerprints. Scheduled rows remained 0.
- `manage-client-contract` is active v15 (`7daa59d7...1577`) and
  `manage-pipeline-workspace` is active v2 (`8dfcd099...45b2`), both with JWT
  verification. Anonymous postflight requests returned 401.
- Catalog/RLS/ACL/service-only RPC/15-minute cron assertions passed. All three
  Pipeline automation controls remain off and every Pipeline remains paused.
- One Fathom call-summary history/audit pair arrived concurrently after deploy.
  Its exact IDs, source, type, and timestamp are recorded in
  `scripts/qa-pipeline-early-renewal-gate-d.mjs`; subtracting only that unrelated
  pair reproduces the frozen history/audit baseline exactly.

## Production Gate E — Controlled Runtime Proof

Use one disposable app-owned Front End QA client and exact before/after counts.

2026-07-20 attempt 1 stopped safely before creating any schedule. Pipeline item
creation succeeded, then the guided Won transaction returned 500 because Gate D
had omitted its three new scheduled-activation values from the existing Client
History event-type check constraint. The transaction rolled back, automation
remained paused, and scheduled rows remained 0. The disposable client, item,
contract, and generated task were archived with zero active residue; two
append-only stage events and four audit events were preserved. The frozen
additive correction is `20260720020000_early_renewal_history_event_types.sql`
(`18c4ed7481...d2a3`) with guarded rollback (`a194e5d96b...6521`). Production
apply and Gate E attempt 2 required explicit hotfix approval.

The hotfix was approved, applied with every protected count and configuration
fingerprint unchanged, and Gate E attempt 2 passed all 79 guarded assertions.
Final reconciliation found 3 completed, 2 cancelled, and 3 blocked schedules;
the blocked reasons were `client_not_active` twice and
`client_status_changed` once. Pipeline supplied one schedule and Client Detail
supplied seven. Both QA clients and all related operational rows are archived,
global pending schedules are 0, automation remains paused, and 23 audit rows
plus append-only Client History/stage evidence remain.

- [x] Pipeline Won with a future start creates one Pending contract, one pending
      activation, one Won item/result link, one retention event, and no early
      client-summary/status change.
- [x] Running the worker before the date returns zero completed.
- [x] Running it at the exact start date activates once, refreshes the summary,
      moves Front End to Back End when configured, and records history/audit.
- [x] Same-date retry creates zero additional evidence.
- [x] Client Detail > New Contract proves the identical future behavior.
- [x] Continue-current-program renewal activates without changing status.
- [x] Immediate Back End override changes only status early; contract/current
      summary still wait for the start date.
- [x] Editing the Pending contract moves its schedule; archiving and deleting
      cancel it.
- [x] Paused/status-changed/offboarded cases become Blocked and do not mutate the
      contract summary or program status.
- [x] Restore/delete the disposable client evidence according to the recorded
      cleanup plan, preserving required audit history.

## Production Gate F — Frontend And Company Rollout

Requires Gate E pass and explicit frontend-release approval.

1. Release the frontend once, then smoke SuperAdmin, Director, Support, assigned
   CSM, unassigned CSM, Viewer-off, inactive, and cross-company authorization.
2. Keep Ethical Scaling manual-only; use its existing reviewed Renewal items.
3. Run Moves Method as the first real early-renewal cohort for one week. Its
   custom **Re-sign Call Complete** stage is configuration-only and requires no
   code change.
4. During the MM week, review pending/completed/blocked activations daily and
   reconcile Dashboard effective-date reporting against the contracts.
5. Configure Sales Kick basics only after its onboarding data is ready. Renewal
   plus separate Expansion pipelines work now; tertiary pathway modeling stays
   deferred.
6. After the observation week, enable the remaining company/role audience only
   if there are zero duplicate activations, unexplained blocks, summary drift,
   tenant/role failures, or retention-date discrepancies.

## Explicitly Deferred Until After The MM Week

Daily Pulse integration, funnel/conversion reporting, weighted forecasts,
renewal health scoring, notifications, Slack/email, AI analysis, arbitrary
tertiary pathways, and broad automation are not first-rollout blockers.
