# Pipeline Phase 0-2 Plan

Status: local implementation candidate. Nothing in this plan authorizes a
production migration, Edge Function deploy, company enablement, or push to
`main`.

## Outcome

Phase 0-2 delivers a disabled-by-default Pipeline foundation and a local
operational workspace that RetainOS can later pilot with Ethical Scaling.
Pipeline tracks commercial events rather than placing one mutable stage on a
client, so the same client can have concurrent renewal and expansion work.

## Frozen Phase 0 Decisions

- Pipeline is a top-level route between Tasks and Call AI.
- Admin Hub tabs are Team, Customization, Pathways & Milestones, Pipelines,
  and Company Settings.
- Company Settings owns the master Pipeline gate. Every company defaults off.
- A company may configure multiple named pipelines categorized as `renewal`
  or `expansion`.
- Each pipeline owns ordered, colored stages. Stages are categorized as open,
  won, or lost without forcing companies to use RetainOS labels.
- Pipeline selection uses visible buttons with multi-select and an All action.
- The workspace supports Kanban/List views, drag-and-drop, client search,
  pathway, owner, renewal/follow-up date filters, compact summaries, and a
  detail drawer.
- A pipeline item is a distinct commercial event linked to one client and may
  later link to a contract. Stage changes are append-only events and also land
  in Client History and the internal audit log.
- Super Admin and Director configure pipelines. Super Admin, Director,
  Support, and CSM operate items. CSM access is limited to clients where they
  are the current primary or secondary assignee. Viewer access is read-only
  and requires a separate company setting that defaults off.
- Renewal value defaults from the current contract when configured. Expansion
  pipelines may use a fixed configured value. Values are stored as integer
  cents with a currency code; card values are snapshots, not live formulas.
- Phase 0-2 contains manual item workflows only. Contract synchronization,
  renewal generation, task-template triggers, offboarding synchronization,
  Quick Update shortcuts, and Daily Pulse consumption start in later phases.

## Safety Boundary

- New schema is additive and has a matching rollback file.
- No migration seeds, enables, or mutates a company or business record.
- The master gate, per-pipeline gate, and Viewer gate all default false.
- Browser code never writes Pipeline tables directly.
- Reads and writes cross one authenticated server boundary that resolves the
  actor, company, role, company gate, and CSM client assignment.
- Configuration writes require Super Admin or same-company Director.
- Item writes require Super Admin, same-company Director/Support, or an
  assigned same-company CSM. Viewer and inactive membership writes deny.
- Mirror-only companies deny all Pipeline reads and writes.
- Disabling Pipeline is the first rollback. SQL rollback is reserved for an
  additive-object defect and must preserve needed pilot evidence first.

## Data Model

### `company_pipelines`

Company-owned definition: name, `renewal`/`expansion` category, enabled and
archived state, display order, value source, default value/currency, renewal
lead days, follow-up days, entry-rule metadata, and audit timestamps.

### `company_pipeline_stages`

Ordered child definitions with name, color, open/won/lost category, optional
note requirement, enabled/archive state, and timestamps. An in-use stage
cannot be archived without first moving its open items.

### `client_pipeline_items`

One commercial event: company, client, pipeline, current stage, owner,
estimated/actual value, renewal/follow-up/expected-close dates, optional
contract link, outcome, current note, safe client/pathway snapshots, lifecycle
state, and timestamps.

### `client_pipeline_stage_events`

Append-only transition evidence: item, from/to stage, actor, note, and time.

## Phase 1: Configuration Foundation

- Add schema, indexes, constraints, RLS denial/read policy boundary, and
  rollback.
- Add master and Viewer feature gates to app-owned company settings.
- Add authenticated company-configuration actions.
- Add starter Renewal and Expansion creation without automatic seeding.
- Add pipeline and stage create/update/reorder/archive behavior.
- Add Admin Hub Pipelines tab and master gate controls.

## Phase 2: Operational Workspace

- Add `/pipeline`, the funnel icon, and gated sidebar placement.
- Load one actor-scoped workspace payload.
- Add pipeline buttons, All, pathway/owner/date/search filters, and Board/List.
- Add manual item creation and a detail drawer.
- Add optimistic stage movement with server rollback on failure.
- Add notes, follow-up, owner, expected close, estimated value, outcome, and
  archive controls.
- Add four quiet summaries computed from the currently filtered item set.
- Write stage events, Client History, and `app_audit_events` for mutations.
- Add loading, empty, disabled, unavailable, and error states.

## Explicit Non-Goals

- No automatic renewal generator.
- No contract-created -> Won or Won -> contract orchestration.
- No Lost -> offboarding or offboarding -> Lost orchestration.
- No task-template or Daily Pulse pipeline triggers.
- No Quick Update or Client Detail pipeline shortcuts.
- No weighted forecasting, alerts, AI analysis, dashboard funnels, or Slack.
- No tertiary pathway or unlimited client-program enrollment model.
- No production apply, deploy, enablement, or `main` push.

## Phase 0-2 Completion Evidence

- Dedicated static verifier passes.
- Pure handler tests cover role, company, gate, assignment, validation, and
  transition invariants where practical.
- Migration and rollback dry-run hashing succeeds without applying SQL.
- `npm run build` passes.
- `git diff --check` passes.
- Independent review finds no unresolved P0/P1 issue.
- Manual QA and Ethical Scaling enablement checklists are complete.
- Live database/RLS, deployed function, and real-account role proof remain
  explicitly environment-gated and are not claimed locally.
