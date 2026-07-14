# Performance Program - Releasable Phases

**Status:** Planned
**Priority:** Medium
**Owner:** Jay (product/QA) + Codex (implementation/release)
**Start condition:** Schedule after the secure Beacon rebuild or during a clear
window between customer tickets and migration-critical work.

## Goal

Improve RetainOS load time and repeated-workflow responsiveness without a giant
rewrite, formula drift, tenant-scope regressions, or speculative database
changes. Each phase must be independently testable, releasable, and reversible.

## Current Baseline - 2026-07-13

- Production build passes with 102 transformed modules.
- Initial JavaScript bundle is approximately 1.16 MB minified / 277 KB gzip.
- Vite warns that the initial chunk exceeds 500 KB.
- Supabase Performance Advisor reports 0 errors, 0 warnings, and 40
  informational index/query suggestions.
- Users report RetainOS is already faster than Glide, but first-load and large
  company workflows can improve further.

The Advisor suggestions are investigation candidates, not instructions to
change 40 indexes.

## Program Rules

1. Measure before optimizing.
2. Release one bounded surface or infrastructure slice at a time.
3. Preserve actor-scoped authorization and company/client isolation.
4. Reconcile Dashboard and report formulas before and after data-path changes.
5. Add exact rollback steps for database/index changes.
6. Do not combine this program with Beacon security work or migration cutovers.
7. Jay owns final production QA for every releasable phase.

## Phase 1 - Baseline And Route Splitting

### Scope

- Measure production login-to-usable, company switch, Dashboard, Clients,
  Client Detail, Tasks, Daily Pulse, and Admin Hub workflows.
- Record request counts, slowest calls, route transfer sizes, and visible
  time-to-content on desktop and mobile.
- Rank the real hot paths before changing query behavior.
- Rebuild route-level `React.lazy` / `Suspense` loading against current `main`.
- Load major page code only when the user visits that route.
- Provide stable, branded route-loading and chunk-error states.

### QA And Release Gate

- Every route works through navigation, direct URL entry, and refresh.
- Nested routes and role-protected routes remain correct.
- No blank screens, layout shifts, or chunk-loading failures.
- Compare initial and per-route bundle sizes to the recorded baseline.
- Run desktop/mobile smoke QA for all primary roles.

### Expected Result

The common entry route downloads substantially less JavaScript while page
behavior and database access remain unchanged.

## Phase 2 - Dashboard And Clients Data Performance

### Scope

- Profile Dashboard initial load, filters, charts, and drilldowns.
- Profile Clients roster load, search, filters, pagination, and company switch.
- Replace broad `select("*")` reads with required columns where safe.
- Remove duplicate requests and browser-side work already available through
  actor-scoped aggregate RPCs.
- Paginate large identity-bearing result sets instead of loading all rows.
- Cache stable company configuration within the signed-in session where useful.

### QA And Release Gate

- Dashboard KPI/chart/drilldown formulas match the canonical validation packet.
- Viewer remains aggregate-only; CSM remains assignment-scoped.
- Director, Support, and SuperAdmin company boundaries remain correct.
- Clients filters, empty states, exports, and deep links remain correct.
- Compare request count and time-to-content against Phase 1 measurements.

## Phase 3 - Client Detail, Tasks, And Daily Pulse

### Scope

- Profile Client Detail initial load and individual tab costs.
- Load expensive tab data on demand where that improves the measured path.
- Paginate or progressively load large history/task collections.
- Remove duplicate profile/configuration reads across Client Detail tabs.
- Profile Tasks board/list loading and Daily Pulse aggregation.
- Preserve realtime/task behavior only where it creates demonstrated value.

### QA And Release Gate

- Details, Program, Outcomes, Pathways, Contracts, Tasks, and History retain
  their current write behavior and role permissions.
- Primary/secondary pathway progression and task automations remain correct.
- History search/filter/read-more behavior remains correct at MM-scale volume.
- Tasks board/list parity, drag/drop, recurring tasks, and Daily Pulse remain
  correct.
- Compare request count and interaction timing against the baseline.

## Phase 4 - Measured Index And Component Maintenance

### Index Work

- Observe production usage over a representative business cycle.
- Match actual slow joins/filters to missing or ineffective indexes.
- Add one bounded index migration at a time and inspect the query plan.
- Remove an unused index only after representative evidence confirms it is safe.
- Include exact index recreation SQL and a rollback decision window.

### Component Work

- Do not rewrite `ClientDetail`, `Clients`, `Dashboard`, or
  `SaasClientDetail` all at once.
- Extract tab/feature components while improving a measured hot workflow.
- Prefer small hooks/repositories that reduce duplicated queries or state.
- Keep each extraction behavior-preserving and independently reviewable.

### QA And Release Gate

- Index changes improve the targeted plan without harming writes or another
  common query path.
- Extracted components retain visual, permission, and write-flow parity.
- Full build and focused regression suites pass after every bounded release.

## Recommended Delivery Order

1. Baseline and route splitting.
2. Dashboard and Clients data performance.
3. Client Detail, Tasks, and Daily Pulse data performance.
4. Evidence-based indexes and incremental component extraction.

Do not hold all phases for one release. Close and ship each phase after its own
QA gate, then re-measure before starting the next phase.

