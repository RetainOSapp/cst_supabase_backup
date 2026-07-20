# Pipeline Phase 0-2 QA Handoff

Status: historical Phase 0–2 checklist, superseded by the completed Phase 0–4
local/manual QA in `PIPELINE_PHASE_3_4_QA.md`. This document does not authorize
a migration, Edge Function deployment, company enablement, production data
change, or push to `main`.

## Scope

Phase 0-2 includes the disabled-by-default schema and company configuration,
Admin Hub Pipelines setup, and the manual Pipeline workspace. Contract
synchronization, automatic renewal entry, task templates, Quick Update actions,
offboarding synchronization, and Daily Pulse consumption are later phases.

Source decisions: `PIPELINE_PHASE_0_2_PLAN.md`.

## Jay Local Visual QA — Use This Now

Open `http://127.0.0.1:5173/pipeline-preview.html` and use the resettable sample
data to review the Workspace and pipeline editor. This is the checklist to use
while the local prototype is open:

- Workspace: pipeline selection, Board/List, client/pathway/Assigned to filters,
  Follow-up/Renewal/Expansion close timing and month filters, summaries, card/list values,
  item creation, drawer edits, and stage moves.
- Admin preview: switch between pipeline configuration buttons, edit one pipeline
  at a time, change stages/defaults, and add a pipeline. Starter shortcuts appear
  only when the default Renewal or Expansion pipeline is absent.
- Use **Reset sample data** whenever you want to return to the known fixtures.

Do not try to QA the real sidebar gate, disabled-company behavior, real Admin Hub
tab permissions, role/tenant isolation, database persistence, Client History, or
audit evidence here. Those checks are labeled environment-gated below and need
the separately approved inert apply/deploy/account phase.

## Automated Local Evidence

Record exact results. A local/static pass is not database, deployed-function, or
real-account proof.

| Gate | Exact command | Expected evidence | Result |
| --- | --- | --- | --- |
| Worktree boundary | `git status --short --branch` | Local `codex/` branch; unrelated dirty work identified and preserved | PASS — `codex/pipeline-phase-0-2`; only candidate and required handoff files are dirty |
| Pipeline contract | `npm run pipeline:verify` | All schema, rollback, authorization, audit, route, and UI markers pass | PASS — 55/55 |
| Migration hash only | `node scripts/apply-sql-file.mjs supabase/migrations/20260715010000_pipeline_phase_0_2_foundation.sql` | `mode: dry-run`, bytes, and SHA-256; no SQL applied | PASS — dry-run only; 53,176 bytes; `7a99ec95a3be3b0f5f129b16f123c586290fd36e6583851b1e19c73207388923` |
| Rollback hash only | `node scripts/apply-rollback-sql-file.mjs supabase/rollbacks/20260715010000_pipeline_phase_0_2_foundation.sql` | `mode: rollback-dry-run`, bytes, and SHA-256; no SQL applied | PASS — rollback dry-run only; 4,331 bytes; `1f8fb3045330cf073a413d093b2415d36ebcc0d7ab9c1bc76c7488bfecf06c7a` |
| Focused handler tests, if present | `node --test supabase/functions/*pipeline*/tests/*.test.mjs` | All role, company, gate, assignment, validation, and transition tests pass | NOT PRESENT — no isolated Node-testable handler module; 55/55 static contract passed, live role/runtime proof remains gated below |
| Edge source syntax | `node --check` for both Pipeline functions and `manage-company-customization` | All three sources parse | PASS |
| TypeScript/Vite build | `npm run build` | Strict frontend typecheck and production bundle pass | PASS — existing large-chunk warning only |
| Local visual sandbox | `npm run dev -- --host 127.0.0.1`, then `http://127.0.0.1:5173/pipeline-preview.html` | Public local-only mock Workspace/Admin preview; no Supabase access | PASS — Board fixtures, Admin configuration/reorder, item edit persistence, reset, and zero browser console errors verified |
| Production mock exclusion | Build, then search `dist` for preview HTML, storage key, and fixture markers | No preview entry or mock fixture ships in production output | PASS |
| Patch hygiene | `git diff --check` | No whitespace errors | PASS |
| Scope review | `git diff --stat` and `git status --short` | No secrets, `.env*`, Beacon quarantine, old Glide reference, deploy, or unrelated cleanup | PASS — no prohibited path or action detected |

The build checks `src` only. It does not typecheck Supabase Edge TypeScript. If
the Pipeline handler does not expose pure Node-testable modules, its runtime
behavior remains environment-gated even when the static verifier passes.

The local visual sandbox is deliberately not database QA. Its state lives only
in browser local storage, can be reset from the page header, and is excluded
from the production build. Use it for layout and interaction feedback; use the
environment-gated checks below for authorization, RLS, audit, and SQL proof.

## Proof Not Available From The Local Candidate

These must remain `NOT RUN` until a separately approved environment step:

| Gate | Status | Required later proof |
| --- | --- | --- |
| Migration executes transactionally | NOT RUN — environment gated | Apply to the approved RetainOS database while disabled; verify objects, constraints, RLS, indexes, and zero enabled companies |
| RLS/role/tenant behavior | NOT RUN — live accounts gated | Real Super Admin, Director, Support, CSM, Viewer, inactive, and cross-company probes |
| Edge runtime and JWT gateway | NOT RUN — deploy gated | Paused deployment, anonymous 401, valid-session behavior, and server logs |
| Rollback SQL executes | NOT RUN — environment gated | Disposable transaction or approved rollback drill; preserve pilot evidence first |
| Ethical Scaling usability | NOT RUN — enablement gated | Complete `PIPELINE_ETHICAL_SCALING_ENABLEMENT.md` |
| Moves Method or Saleskick behavior | NOT RUN — explicitly out of scope | Separate decision only after Ethical Scaling observation |

## Role And Capability Matrix

Use real same-company accounts and at least one client assigned to the CSM, one
secondary-assigned client, and one unassigned client.

| Check | Super Admin | Director | Support | CSM | Viewer |
| --- | --- | --- | --- | --- | --- |
| Open enabled Pipeline workspace | All selected companies | Own company | Own company | Own assigned scope | Only when Viewer gate is on |
| See company-wide item counts and summaries | Yes | Yes | Yes | No; assigned scope only | Yes, read-only, when enabled |
| Configure pipelines/stages | Yes | Yes | No | No | No |
| Create/update/move/archive items | Yes | Yes | Yes | Assigned clients only | No |
| Add notes/set follow-up/change owner or value | Yes | Yes | Yes | Assigned clients only | No |
| Direct URL/search/filter access to unassigned client item | Yes | Yes | Yes | Denied and not leaked | Read-only company scope when enabled |

Also prove inactive membership, missing membership, and another-company IDs deny
without creating an item, stage event, Client History event, or audit row.

## Disabled-By-Default Regression — Environment Gated

- [ ] Migration contains no company-specific seed or enablement.
- [ ] Master Pipeline and Viewer gates default false.
- [ ] No company has Pipeline enabled after inert apply.
- [ ] Existing Dashboard, Clients, Tasks, Call AI, Admin Hub, and integrations
      behave unchanged while disabled.
- [ ] `/pipeline` shows a controlled disabled/unavailable state and leaks no
      items when the company gate is off.
- [ ] Mirror-only companies cannot read or mutate Pipeline data.
- [ ] A Viewer with the Viewer gate off cannot read the workspace or direct URL.

## Admin Hub Configuration QA

The local preview proves the editor interactions only. The real Admin Hub tab
order, permissions, server persistence, in-use constraints, and audit evidence
remain environment-gated.

- [ ] Tabs appear in this order: Team, Customization, Pathways & Milestones,
      Pipelines, Company Settings.
- [ ] Super Admin and Director can open Pipelines; Support, CSM, and Viewer
      cannot configure by direct navigation or request replay.
- [ ] Create starter Renewal and Expansion definitions only after an explicit
      action; nothing is automatically seeded.
- [ ] Create, rename, enable/disable, reorder, and archive a safe test pipeline.
- [ ] Create, rename, color, reorder, and archive safe stages.
- [ ] Stage order and open/won/lost category persist after refresh.
- [ ] Value source, default cents/currency, renewal lead days, and follow-up days
      validate and persist.
- [ ] An in-use stage cannot be archived until its open items move elsewhere.
- [ ] Configuration changes create internal audit evidence.

## Operational Workspace QA

All visual workspace checks except the sidebar gate can be exercised in the local
preview. The sidebar line and server-success/failure semantics remain
environment-gated.

- [ ] Sidebar Pipeline entry appears between Tasks and Call AI only when the
      current company/role may access it.
- [ ] Visible pipeline buttons support one, several, and All selections.
- [ ] Board/List toggle preserves the same filtered item set.
- [ ] Client search is case-insensitive and finds a known client.
- [ ] Pathway, Assigned to, Follow-up/Renewal/Expansion close month, and overdue
      filters combine predictably.
      predictably and can be cleared.
- [ ] Compact summaries respond to active pipeline and item filters without
      exposing data outside the actor's scope.
- [ ] Manual item creation links the intended client, pipeline, stage, owner,
      dates, currency, and estimated-value snapshot.
- [ ] Clicking a card/list row opens the drawer without leaving the workspace.
- [ ] Drawer updates note, follow-up, owner, expected close, value, outcome, and
      archive state; validation failures preserve the previous UI state.
- [ ] Drag/drop moves an item only after server success and restores the prior
      stage on failure.
- [ ] Loading, empty, disabled, unavailable, and recoverable error states are
      understandable.
- [ ] Keyboard focus, visible labels, color-independent stage meaning, and
      narrow-screen horizontal board behavior are usable.

## History And Audit QA

For one disposable manual item, capture row IDs before and after each action.

- [ ] Creation writes the item and one internal audit event.
- [ ] Every real stage change appends exactly one immutable stage event, one
      Client History event, and one audit event.
- [ ] Moving to the current stage does not create duplicate evidence.
- [ ] Note/follow-up/owner/value/outcome/archive mutations create the expected
      audit evidence without fabricating a stage transition.
- [ ] Actor, company, client, pipeline item, from/to stage, and timestamp are
      attributable.
- [ ] Browser requests cannot supply a different actor or bypass company/client
      assignment through modified IDs.
- [ ] No Pipeline action writes a `backup_*` table.

## Existing-Surface Regression

- [ ] Tasks board/list and drag/drop still work for a safe existing task.
- [ ] Clients search, CSM assignment scope, and Client Detail still load.
- [ ] Admin Hub Team, Customization, Pathways & Milestones, and Company Settings
      still load and save their existing fields.
- [ ] Company switch resets Pipeline data and never flashes the prior company.
- [ ] Sign-out and expired sessions deny Pipeline server requests.

## Hold Criteria

Do not proceed to an Ethical Scaling enablement if any of these are true:

- A company is enabled by migration or seed.
- CSM assignment, Viewer write denial, or cross-company isolation is unproven.
- Any browser code writes Pipeline tables directly.
- A stage transition can partially write its item/event/history/audit evidence.
- Disabling Pipeline does not immediately remove operational access.
- Existing non-Pipeline workflows regress while the gate is off.
- The migration has no exact reviewed rollback or the local verification/build
  gates fail.

## Handoff Decision

Local candidate: ☐ Stop ☐ Fix and repeat ☒ Ready for separately approved inert apply

Jay visual QA: ☐ Not started ☐ Passed ☒ In progress — first feedback incorporated

Notes: Independent security/data and product/UI reviewers identified P1 issues in
the first pass. The candidate was hardened and sent through closure review; both
reviewers report no unresolved P0/P1. No environment or production proof is
implied by this local readiness decision.
