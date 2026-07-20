# Pipeline Phase 3–4 QA Handoff

Status: all local/manual Phase 3–4 QA passed with Jay on 2026-07-15. Minor
Admin layout/copy polish was applied and reverified locally. Only the separately
approved environment gates remain. No migration, deployment, company enablement,
commit, push, or production change has occurred.

## Where to QA

Open `http://127.0.0.1:5173/pipeline-preview.html`.

This page uses browser-only fixtures. It never reads or writes Supabase. Use
**Reset sample data** whenever you want to return to the exact starting state.

## Automated Local Evidence

| Gate | Result |
| --- | --- |
| Phase 0–2 verifier | Pass — 55/55 |
| Phase 3–4 verifier | Pass — 37/37 |
| TypeScript/Vite production build | Pass; existing chunk-size warning only |
| Diff/whitespace check | Pass |
| Production mock exclusion | Pass; preview HTML/fixtures absent from `dist` |
| Phase 3 browser scenarios | Pass; exact match, ambiguity, offboard scope, task idempotency, reset |
| Phase 4 browser scenario | Pass; add-on Won preserves primary pathway, reset |
| Admin automation browser check | Pass; controls render and saved mock state persists |
| Browser console | Pass; zero errors/warnings in final run |
| Independent Phase 3 P0/P1 review | Pass; no remaining P0/P1 |
| Independent bounded Phase 4 P0/P1 review | Pass; no P0/P1 |

No SQL was executed. PostgreSQL/RLS/concurrency, real JWT roles, deployed Edge
Functions, and real-company data remain intentionally unproven.

## Jay QA — Resettable Scenarios

Start by clicking **Reset sample data**.

### Phase 3 Renewal Workflows

- [x] Click **1. Create Alex renewal contract**. Alex renewals changes from 1
      to 0 and the matching renewal moves to Won.
- [x] Click **2. Try ambiguous Priya renewal**. The action is refused and
      Priya renewals remains 2.
- [x] Click **3. Offboard Marco**. Marco renewals changes to 0 while Marco
      expansions remains 1.
- [x] Click **4. Generate stage task** twice. The first creates one linked
      task; the second confirms no duplicate was created and Generated tasks
      remains 1.
- [x] In Workspace, move an open item to Won. The guided contract form appears
      instead of a bare stage move.
- [x] Move an open item to Lost. A loss reason is required and the result offers
      an offboarding next step without silently offboarding the client.

### Admin Automation Configuration

- [x] Open **Admin configuration** and select **Renewals**.
- [x] Confirm Renewal execution includes automatic entry, an active Open entry
      stage, catch-up days, offboarding-to-Lost sync, and stage-task templates.
- [x] Automatic entry cannot be saved without an Open entry stage.
- [x] Enable automatic entry, leave Strategic Review selected, and click
      **Save automation**. The checked state persists.
- [x] Select **Expansion** and confirm it offers stage-task templates without
      renewal-entry or offboarding controls.
- [x] Click **Reset sample data** before continuing.

### Phase 4 Expansion Foundation

- [x] Click **Phase 4: Win Amara add-on**.
- [x] The evidence panel shows primary pathway `path-growth`, add-on offer
      `offer-payment-processor`, and a separate result contract.
- [x] Amara moves to Expansion Won with the add-on value; no primary pathway
      replacement or tertiary-pathway promise appears.
- [x] Click **New pipeline item** and confirm the form opens correctly.
- [x] Choose Expansion and confirm Target offer is available but optional until
      Won.
- [x] Open an Expansion item and confirm Target offer can be changed and is
      visible on its card/drawer.
- [x] Moving Expansion to Won requires an active offer when offers exist and
      clearly says it creates an add-on contract without replacing the primary
      pathway.
- [x] Click **Reset sample data** and confirm the Phase 4 evidence disappears
      and Amara returns to Call Set.

## 2026-07-15 QA Notes And Polish

- Lost items correctly stop contributing to Projected value.
- A repeated stage-task action is expected idempotency, not an error. The
  message now says **No duplicate created** and explains that the existing task
  was kept unchanged.
- Admin configuration now separates **Pipeline settings**, **Renewal
  eligibility**, and **Renewal execution**. Eligibility defines which contracts
  qualify and when; execution determines whether those rules create items.
- Checkbox cards now use consistent padding and minimum heights at desktop and
  responsive widths.
- Jay confirmed all Expansion target-offer behavior: optional selection before
  Won, card/drawer visibility and editing, Won validation, and add-on wording.
- Jay confirmed Expansion Admin automation scope and the final reset behavior;
  every local/manual Phase 3–4 checklist item is complete.
- The revised UI passed the Phase 3–4 verifier (37/37), production build,
  resettable browser test, and zero-console-error check.

## Environment-Gated QA — Do Not Run Yet

- [ ] Apply both Pipeline migrations transactionally while every company gate
      and every automation remains off.
- [ ] Classify eligible legacy contracts with explicit billing cadence before a
      renewal preview; `unknown` is deliberately excluded.
- [ ] Deploy the Pipeline Edge Functions paused, with JWT verification enabled.
- [ ] Prove Super Admin, Director, Support, assigned/unassigned CSM, Viewer,
      inactive, and cross-company behavior using real JWTs.
- [ ] Prove two concurrent scans, run-key retry, two Won submissions, task retry,
      and injected evidence failures in an approved disposable transaction.
- [ ] Preview eligible renewals before enabling any materialization switch.
- [ ] Execute the guarded rollback in an approved disposable environment.
- [ ] Use the Ethical Scaling enablement checklist before any company pilot.

## Hold Criteria

- Any automation runs while its master or per-pipeline switch is off.
- One source contract can create two active renewal items.
- Ambiguous independent renewal matching writes any contract or Pipeline state.
- Contract/offboarding state commits without matching Pipeline evidence.
- Expansion changes a primary pathway/current-contract summary or invents a
  tertiary pathway.
- Browser code writes Pipeline, contract, task, or client-status tables directly.
- Any verifier, build, rollback, mock-exclusion, or P0/P1 gate regresses.
