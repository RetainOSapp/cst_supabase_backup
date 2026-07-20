# Pipeline Phase 0–4 Rollout And Pilot Runbook

Status: Gates A and B are closed. Pipeline remains disabled for every company,
and Gate C Ethical Scaling configuration/enablement is separately gated. This document is
stop-gated: approval for one gate never authorizes the next gate. No migration,
function deployment, company enablement, sample creation, scheduler, commit,
push, or `main` change is authorized merely by this document.

## Cost And Control Rule

- Use deterministic SQL, RPC probes, static verifiers, and count comparisons for
  the bulk of the proof.
- Use human/high-cost oversight only for gate approvals, ambiguous contract
  classification, usability judgment, and company promotion decisions.
- Reuse existing RetainOS infrastructure and accounts. Do not create a separate
  staging stack, broad synthetic corpus, generalized observability platform, or
  recurring scheduler for this pilot.
- Stop after every gate and preserve exact evidence before asking to continue.

## Five Stop-Gated Steps

| Step | Scope | State | Approval |
| --- | --- | --- | --- |
| 1 | Phase 0–4 packet, P0/P1 review, hashes, read-only preflight | Complete | No environment approval needed |
| 2 | Gate A: inert additive database apply and readback | Complete | Approved and closed 2026-07-15 |
| 3 | Gate B: operationally disabled Edge deployment and JWT QA | Complete | Approved and closed 2026-07-16 |
| 4 | Gate C: Ethical Scaling manual-first pilot, then bounded automation | C1 configured; Jay QC in progress | C2 automation remains a second stop |
| 5 | Moves Method, then Saleskick promotion decisions | Not approved | Separate decision per company |

## Frozen Artifacts

Apply migrations in this order in one transaction:

1. `20260715010000_pipeline_phase_0_2_foundation.sql`
   - SHA-256 `7a99ec95a3be3b0f5f129b16f123c586290fd36e6583851b1e19c73207388923`
   - 53,176 bytes
2. `20260715020000_pipeline_phase_3_4_workflows.sql`
   - SHA-256 `182dd70ba986d83a9858ba7294505d25fdd23883bf5f7a19f6d7d1f519412f68`
   - 53,346 bytes

Rollback order is the reverse and is permitted only for a zero-evidence
disposable transaction or verified additive-object defect:

1. `20260715020000_pipeline_phase_3_4_workflows.sql` rollback
   - SHA-256 `55eceab9167ac149e2db9b8615da985e8c493aa03a66c258998e4ecce8e12489`
   - 6,922 bytes
2. `20260715010000_pipeline_phase_0_2_foundation.sql` rollback
   - SHA-256 `1f8fb3045330cf073a413d093b2415d36ebcc0d7ab9c1bc76c7488bfecf06c7a`
   - 4,331 bytes

Candidate branch/starting commit: `codex/pipeline-phase-0-2` at
`07946191495f0604a68c4d34fcc61d16aa9aefd2`. The worktree is intentionally
uncommitted; record the final reviewed tree before any environment action.

## Step 1 — Local Packet And Read-Only Preflight

- [x] Phase 0–2 verifier passes 55/55.
- [x] Phase 3–4 verifier passes 37/37.
- [x] Production build and diff check pass.
- [x] All local/manual QA passed with Jay.
- [x] Independent product, schema, and security rollout reviews completed.
- [x] Preview works while materialization switches remain off; generation
      independently repeats every execution kill switch.
- [x] Automation run keys reject changed pipeline, as-of, or requester inputs.
- [x] Record timestamped production baselines immediately before Gate A:
      companies, settings, clients, contracts, tasks, task templates, Client
      History, and audit counts.
- [x] Record the current local `main`/candidate commit and known deployment
      record. The hosted migration ledger remains unavailable because the local
      CLI is deliberately not linked; use live pre/post schema probes instead.
- [x] Confirm no conflicting Pipeline tables or gate columns exist through the
      live PostgREST schema cache.
- [x] Confirm a low-traffic apply window and bounded lock/statement timeouts;
      contract/task constraint additions may scan existing rows.
- [x] Guarded executor pins the exact HTTPS Supabase origin, locks both
      migrations and both rollbacks, re-proves table/gate absence and company
      identities, captures immediate baselines, applies both migrations through
      one RPC transaction, and fails closed on deterministic postflight drift.
- [x] Jay approved the exact Gate A transaction after reviewing this packet.

## Step 2 / Gate A — Inert Additive Database Apply

Apply both migrations in the recorded order within one transaction. Do not seed,
backfill, configure, or enable Pipeline.

Required readback before stopping:

- [x] Five Pipeline tables exist with reviewed RLS, policies, constraints, and
      indexes: definitions, stages, items, stage events, and automation runs.
- [x] Contract classification/link columns, Pipeline task-template links,
      durable task links, service-only RPCs, and both workflow triggers match
      the reviewed definitions.
- [x] Function ACLs keep workflow mutations service-role-only; authenticated
      browser roles have no direct Pipeline table writes.
- [x] Every company has `enable_pipeline=false` and
      `enable_pipeline_viewer_access=false`.
- [x] Pipeline definitions, stages, items, events, and automation runs all have
      zero rows.
- [x] There are zero Pipeline-stage task templates, linked Pipeline tasks,
      source/result/origin contract links, target-offer links, or automation
      keys.
- [x] Existing contracts read back safely as `contract_type=standard`,
      `billing_cadence=unknown`, `currency_code=USD`, and no Pipeline origin.
      `unknown` must remain excluded until explicitly reviewed.
- [x] Existing company/client/contract/task/history/audit counts and core
      RetainOS smoke checks are unchanged.
- [x] Anonymous access denies and the unchanged mirror fallback retains its
      existing
      read path.

### Gate A Completion Evidence — 2026-07-15

- Exact combined transaction SHA-256:
  `147217eeca2546acbf106aaa57417d6422d0774307124af41916ba5fd21d48bb`
  (107,035 bytes).
- One `exec_sql` transaction applied Phase 0–2 then Phase 3–4 with 5-second
  lock, 120-second database, and 130-second HTTP limits.
- Immediate pre/post counts matched exactly: 2 companies, 2 settings, 4,764
  clients, 2,926 contracts, 7,683 tasks, 8 task templates, 5,438 history
  events, and 5,644 audit events.
- All five Pipeline tables contain zero rows; both company gates are false;
  contract defaults and Pipeline task/template links are clean.
- Runtime catalog proof: 5 RLS tables, 6 policies, 6 triggers, 6 final key
  indexes, 15 key constraints, and 12 service-only workflow functions.
- Anonymous zero-row reads passed; a schema-valid insert was denied with exact
  PostgreSQL `42501`; residue is zero; service-only RPC access denied.
- Authenticated roles have zero Pipeline INSERT/UPDATE/DELETE/ALL policies.
- Production app and login returned HTTP 200. Static verification confirms the
  migrations never touch Glide backup tables; no frontend was deployed.
- Final independent closure review found no remaining Gate A P0/P1.

Stop immediately if any company or automation is enabled, any Pipeline row is
seeded, a policy/ACL differs, a core count changes unexpectedly, or a normal
workflow regresses. Do not proceed to function deployment.

## Step 3 / Gate B — Operationally Disabled Edge Deployment

Deploy these new functions with JWT verification enabled:

- `manage-company-pipeline`
- `manage-pipeline-workspace`
- `manage-pipeline-automation`

The reviewed candidate also changes existing functions
`manage-client-contract`, `manage-client-status`, and
`manage-company-customization`; freeze and deploy their exact reviewed versions
only as part of the separately approved Gate B packet.

“Operationally disabled” means every company master gate remains off, so no
workspace, contract synchronization, offboarding synchronization, task
generation, or renewal run can execute. Authorized Super Admin/Director
configuration endpoints intentionally exist while the master gate is off; do
not call them during Gate B, and explicitly prove ordinary roles cannot do so.

- [x] Record exact source hashes and deployed versions.
- [x] Anonymous, malformed, expired, and wrong-project tokens return 401.
- [x] Real valid sessions receive disabled/zero-row operational responses.
- [x] Company/client replay and cross-tenant requests deny.
- [ ] Super Admin and writable Director are the only configuration roles;
      Support, CSM, Viewer, inactive, and no-membership identities deny.
- [x] No item, event, history, audit, task, contract, or automation-run mutation
      occurs during disabled probes.
- [x] Core app/login/client/task/integration smoke checks remain healthy.

The full same-company Support/Viewer/read-only/inactive matrix could not be run
without creating production identities: none currently exist for ES/MM. CSM
and cross-tenant denials passed live, static role enforcement passes, and these
unavailable identities remain a Gate C pre-enable requirement if introduced.

Stop and review Gate B evidence before enabling Ethical Scaling.

## Runtime Proof Before A Company Pilot

Use real JWTs and disposable transactions. This is environment QA, not company
enablement.

- [ ] Super Admin, Director, Support, primary/secondary/unassigned CSM, Viewer
      off/on, inactive, no-membership, and cross-company matrix passes.
- [ ] Concurrent renewal scans create at most one item per source contract.
- [ ] Same run key returns the original result; changed immutable inputs with
      that key reject.
- [ ] Concurrent Won submissions create one result contract and evidence chain.
- [ ] Stage-task retry creates one linked task.
- [ ] Injected failures after item/contract/event/history/audit steps leave no
      partial state.
- [ ] Phase 3–4 then Phase 0–2 rollback succeeds only against a zero-evidence
      disposable state and restores baseline objects/counts.

The Phase 0–2 rollback deletes `pipeline_activity` Client History before dropping
objects. After any pilot evidence exists, operational rollback is gate-off plus
last-known-good code; never run schema rollback against pilot evidence.

## Step 4 / Gate C1 — Ethical Scaling Manual Pilot

Resolve Ethical Scaling by exact app-owned company UUID. Enable only its master
Pipeline gate; Viewer and every automation switch remain off.

1. Read back all companies and prove Ethical Scaling is the only enabled one.
2. Create one Renewal and one Expansion pipeline with minimal pilot stages.
3. Create three recognizable disposable `PIPELINE PILOT QA` items covering a
   primary assignment, secondary assignment, and unassigned denial.
4. Exercise Board/List, pipeline selection, search, timing filters, drawer,
   stage movement, required notes, and Client History/audit evidence.
5. Run Super Admin, Director, Support, CSM, Viewer-off, inactive, and
   cross-tenant role checks with the smallest reusable account set.
6. Turn the master gate off and prove UI/API access stops immediately, evidence
   is preserved, no new writes occur, and normal RetainOS workflows continue.

Decision: ☐ Stop ☐ Fix and repeat ☐ Approve C2 bounded automation

### Gate C1 Setup Evidence — 2026-07-16

- Ethical Scaling is the only company with `enable_pipeline=true`; Viewer
  access remains false everywhere.
- The exact reviewed Renewal and Expansion starters were created and enabled.
- Renewal uses current-contract value, 90-day timing, 30-day follow-up, and
  excludes auto-renew/month-to-month. Expansion uses no fixed default value and
  a 30-day follow-up.
- Both pipelines explicitly have renewal generation, offboarding sync, and
  stage-task creation off; both are paused. No scheduler exists.
- Operational tables remain empty: zero items, stage events, and automation
  runs. No automatic item was created by enablement.
- The real local app is running at `http://127.0.0.1:5174/`; this is the
  production-connected RetainOS frontend, not `pipeline-preview.html`.

Jay QC now:

- [x] Sign in at the real local app and select Ethical Scaling.
- [x] Confirm Pipeline appears and the workspace loads for ES.
- [x] Confirm Renewal and Expansion selectors, Board/List, search, CSM,
      pathway, and timing filters.
- [x] In Admin Hub → Ethical Scaling → Pipelines, confirm the exact stages,
      values/timing above, Viewer off, and every automation off/paused.
- [x] Create one manual Renewal item for Richik Sinha Roy and one manual
      Expansion item for Physical Achievement Center; do not resolve Won/Lost yet.
- [x] Exercise drawer edits, follow-up date, notes, Board/List, search, and one
      nonterminal stage move. Confirm refresh persistence.
- [x] Report any visual, wording, permission, value, or workflow issue before
      the disable-switch drill or any terminal/contract test.

2026-07-16 Jay QC checkpoint: Pipeline/selectors/Admin configuration and both
manual item creations passed; drawers passed. Filters remain unconfirmed until
there is enough data. Clicking Renewal scan correctly produced no run or
residue but exposed a UX bug because manual-pilot automation is paused. The
local UI now disables that action with a separate-approval explanation. The
New Item client control now searches name, business, pathway, and offer with
result counts and no-match states; refresh the local app to retest both fixes.

### Gate C1 Closeout Evidence — 2026-07-16

- Jay confirmed the corrected New Item Client combobox is substantially easier
  to use. The remaining selector/filter/drawer/nonterminal QA passed.
- Final read-only reconciliation found Ethical Scaling as the sole enabled
  company, Viewer access off, both Pipeline automations off/paused, Moves Method
  off, and zero automation runs.
- Disposable `QA New Client` terminal proof created one zero-value Renewal Won
  item and one Expansion Lost item. The renewal produced exactly one contract;
  it is archived with `status=qa_complete`. Two concurrent Lost requests
  converged on one stage transition. The QA client's original off-boarded status
  and contract summary were restored; Richik Sinha Roy and Physical Achievement
  Center were not used for terminal outcomes.
- Terminal evidence reconciled to four stage events, six Client History events,
  five audit events, one result contract, and zero automation runs.
- Temporary live-role QA passed Director, Support, assigned CSM, unassigned CSM
  denial, cross-company denial, inactive denial, Viewer-off empty/disabled
  workspace, and read-only Director denial. No Pipeline row changed. All
  temporary Auth users were deleted and all membership rows restored.
- The master-switch drill returned an empty disabled workspace, exposed zero
  clients/items, and denied writes with 403. Configuration and all operational
  evidence remained intact. Ethical Scaling was restored to manual-only access;
  Viewer access and every automation remain off, and Moves Method remains off.
- Final state: four ES items, nine stage events, eleven item-linked Client
  History events, nine item audit events, one archived zero-value QA contract,
  zero automation runs, and zero temporary role users.

Gate C1 is complete. Gate C2 still requires a separate explicit approval; no
preview generation, renewal generation, scheduler, frontend deployment, commit,
push, or Moves Method enablement is authorized by this closeout.

## Gate C2 — ES Preview And Bounded Automation

No scheduler is registered. Human invocation remains required.

### Preview Attempt And Stop — 2026-07-16

- Jay approved preview only. Renewal generation, scheduler, offboarding sync,
  and stage-task creation remained off; both Pipeline configurations remained
  paused and Moves Method remained off.
- The authenticated, pipeline-bound preview failed closed with HTTP 500 before
  returning candidates. Direct database diagnosis returned PostgreSQL `42702`:
  `column reference "pipeline_id" is ambiguous` in the Open entry-stage lookup.
- No contract classification, item, stage event, history event, audit event,
  automation run, contract, gate, or Pipeline configuration changed.
- A one-function corrective migration and exact fail-closed rollback are frozen
  at:
  - migration SHA-256
    `07cd335ca8c18154e6c1d6ac04d20c739ff5481d11b6b9a98bd8b358688c28df`
  - rollback SHA-256
    `34f72eae659e39fad4970d64f0e29c7ea346bbca93f8a9592aef9e6c8c6af194`
- The correction only aliases `company_pipeline_stages` and qualifies its
  `pipeline_id` reference. It contains no data mutation, gate change,
  generation call, table DDL, or function permission expansion. Browser roles
  remain revoked and only `service_role` retains execution.
- Local verification is Phase 0–2 55/55, Phase 3–4 45/45, build pass, SQL dry
  run pass. The hotfix has not been applied to production.

Stop decision: production application of the function-only hotfix requires a
separate explicit approval. After application, rerun the same preview and stop
again before any contract classification or renewal generation.

### Preview Hotfix Applied And Preview Passed — 2026-07-16

- Jay explicitly approved the function-only hotfix. Exact SHA
  `07cd335ca8c18154e6c1d6ac04d20c739ff5481d11b6b9a98bd8b358688c28df`
  applied successfully to production project `zjauqflzxzsbpnivzsct`.
- The deterministic preview ran as of `2026-07-16T00:00:00Z` while auto-create,
  generation, offboarding sync, stage tasks, and scheduling were off and the
  pipelines remained paused.
- All 27 ES contracts were classified: zero eligible; six placeholder end
  dates; five open/unknown cadence; six offboarded clients; three paused or
  suspended clients; six open/missing end dates; one archived QA contract.
- Cadence distribution is 26 `unknown` and one `fixed_term`; the only
  `fixed_term` record is the archived zero-value Gate C1 QA contract.
- Before/after counts were identical: four items, nine stage events, 166 total
  ES Client History events, 236 ES audit events, zero automation runs, and 27
  contracts. Preview created no residue.
- Two active, non-auto-renew contracts fall inside the 90-day lead window but
  remain excluded solely because cadence is unreviewed: Richik Sinha Roy ending
  2026-09-18 and Dominic Wenner ending 2026-09-10. No cadence was inferred or
  changed.

Stop decision: business confirmation is required before classifying either
contract as `fixed_term`. Renewal generation remains separately approval-gated.

### Reviewed Cohort Classified And Re-Previewed — 2026-07-16

- Jay confirmed that Richik Sinha Roy and Dominic Wenner are fixed-term.
- An atomic cadence-only transaction changed exactly those two contracts from
  `unknown` to `fixed_term`; no value, date, status, auto-renew, item, stage, or
  client-summary field changed. Two Client History and two audit events record
  the review.
- Post-classification cadence is 24 `unknown` and three `fixed_term`, including
  the archived Gate C1 QA contract.
- Deterministic re-preview returned two eligible contracts: Richik ending
  2026-09-18 at projected value 549,991 cents and Dominic ending 2026-09-10 at
  projected value 1,500,000 cents. Twenty-five contracts remain excluded under
  the previously reconciled reasons.
- Preview again produced zero residue: four items, nine stage events, 168 ES
  Client History events, 238 ES audit events, zero automation runs, and 27
  contracts before and after.
- Duplicate-risk stop: Richik already has an open manual Renewal item
  `a596bbfb-a528-42f6-89ab-860042671919`, but its `source_contract_id` is null.
  The generator would therefore create a second Richik Renewal item. Dominic
  has no existing Pipeline item.

Stop decision: before any generation, separately approve linking Richik's
existing manual item to confirmed contract
`d3a5a857-1c89-4872-a2d2-c9314c4633e0` with transactional evidence. Re-preview
must then show Richik as `already_exists` and Dominic as the sole eligible
candidate. Generation remains off/paused and separately approval-gated.

### Richik Source Link And Sole-Candidate Preview — 2026-07-16

- Jay approved linking the existing Richik Renewal item to the exact reviewed
  source contract. The atomic transaction changed only
  `source_contract_id` on item `a596bbfb-a528-42f6-89ab-860042671919` to
  contract `d3a5a857-1c89-4872-a2d2-c9314c4633e0`.
- One details-changed stage event, one Client History event, and one audit event
  record the linkage. Item count remained four, contract count 27, and
  automation runs zero.
- Required re-preview returned Richik as `already_exists` and Dominic Wenner as
  the sole eligible contract, ending 2026-09-10 with projected value 1,500,000
  cents. There are no eligible-item conflicts.
- Re-preview produced zero residue: four items, ten stage events, 169 ES Client
  History events, 239 ES audit events, zero automation runs, and 27 contracts
  before and after.
- Auto-create, renewal generation, offboarding sync, stage tasks, and scheduler
  remain off; the Pipeline remains paused, Viewer access remains off, and Moves
  Method remains off.

Stop decision: one deterministic Dominic-only generation run requires a
separate explicit approval. The execution must enable only the minimum Renewal
generation switches, invoke one fixed run key, immediately restore the paused
manual-only configuration, prove one Dominic item and zero Richik duplicates,
retry the same key for zero new rows, and reject changed-input reuse.

### Bounded Dominic Generation Passed — 2026-07-16

- Jay explicitly approved one Dominic-only generation run. Preconditions proved
  Dominic was the sole eligible contract and Richik was `already_exists`.
- Minimum Renewal execution switches were enabled only for the bounded run;
  offboarding sync and stage tasks stayed off and no scheduler existed.
- Deterministic run key
  `gate-c2:es:2026-07-16:dominic-wenner-v1` completed with 27 candidates, one
  created, and 26 skipped. Run ID is
  `f42953e8-7480-489a-9712-80de38ba3fa4`.
- Exactly one Dominic Wenner Renewal item was created in Strategic Review:
  item `cf8ea1b3-4596-41dd-b283-66b3981b11ee`, source contract
  `0068c4ea-d157-4b1f-9f72-c3d89327d8ee`, renewal date 2026-09-10,
  projected value 1,500,000 cents, and deterministic automation key
  `renewal_contract:0068c4ea-d157-4b1f-9f72-c3d89327d8ee`.
- Exact same-key retry returned the completed result and created zero new rows.
  Reuse of the key with a changed `as_of` input was rejected with zero residue.
- Renewal execution was immediately restored to auto-create off, generation
  off, paused on, offboarding sync off, and stage tasks off. Expansion remained
  untouched, Viewer access remained off, Moves Method remained off, and no
  scheduler was registered.
- Independent postflight returned zero eligible contracts and both reviewed
  contracts as `already_exists`. Before/after preview counts were identical:
  five items, eleven stage events, 170 ES Client History events, 242 ES audit
  events, one completed automation run, and 27 contracts.
- Phase 3–4 verification remains 45/45. No frontend deployment, commit, push,
  scheduler, or Moves Method change occurred.

Technical Gate C2 is complete. Jay's short visual QA should confirm Dominic
appears exactly once in Strategic Review at $15,000 with renewal date 2026-09-10,
Richik still appears exactly once, and Renewal scan is disabled again. Continue
ES observation or consider Moves Method only after that confirmation and a
separate decision.

### Gate C2 Visual QA Closure — 2026-07-16

- [x] Dominic appears exactly once in Renewal → Strategic Review with the
      expected $15,000 projected value.
- [x] Richik remains present exactly once; no duplicate was materialized.
- [x] Renewal scan is disabled after the bounded run.

Jay confirmed all three checks. Gate C2 is closed. Ethical Scaling remains in
manual-only observation with every automation off/paused. Moves Method and
Saleskick remain disabled and require separate rollout decisions.

1. Explicitly classify only a tiny reviewed ES contract cohort. Never infer
   cadence from missing/ambiguous data; `unknown`, open-ended, placeholder, and
   unreviewed month-to-month contracts remain excluded.
2. Configure one enabled Renewal pipeline and active Open entry stage while
   `auto_create_renewal_items=false`, `renewal_generation_enabled=false`,
   offboarding sync=false, stage-task creation=false, and automation paused.
3. Run preview-only eligibility and reconcile every candidate/exclusion while
   execution remains off.
4. After separate approval, enable only renewal generation for the reviewed
   cohort, invoke one deterministic run key, and immediately pause again.
5. Reconcile exact source-contract → item → stage event → Client History → audit
   evidence. Retry the same key for zero new rows and reject changed-input reuse.
6. Separately exercise exact Won→contract, ambiguous renewal refusal,
   renewal-only offboard→Lost, one stage-task retry, and one Expansion Won add-on
   preserving the primary pathway.
7. Repeat the disable-switch drill. Leave the scheduler absent.

Decision: ☐ Stop ☐ Fix and repeat ☐ Continue ES observation

## Step 5 — Promotions

### Moves Method

Requires a separate decision after ES evidence. Start manual-only with 5–10
representative items/roles. Read cadence distribution before classification;
never bulk-classify `unknown`. Preview counts before any materialization and use
one small reviewed cohort. Prove idempotency, concurrency, performance, and kill
switches before considering broader use. Keep the scheduler absent.

### Saleskick

Requires a separate decision after MM. Configure Renewal, Sales Ops Expansion,
and Payment Processor Expansion independently. Validate offers, fixed/default
values, and currencies per pipeline. Begin manual-only, then preview and run a
bounded renewal cohort only if contract cadence evidence supports it.

## Hold Criteria And Explicit Deferrals

Disable the company gate and stop for any tenant leak, role failure, partial or
duplicate evidence, unexpected automation, misleading commercial value,
kill-switch failure, or core RetainOS regression.

Deferred beyond this five-step win: recurring production scheduler, broad
contract backfill, month-to-month synthetic cadence, tertiary/arbitrary offers,
primary pathway replacement, Quick Update/Daily Pulse integration, funnels,
weighted forecasts, notifications, health scoring, email/Slack, and AI analysis.
