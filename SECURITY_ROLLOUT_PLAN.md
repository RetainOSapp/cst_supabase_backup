# Security Rollout Plan

Local branch: `security-phase-0`

Local companion drafts, added in their relevant later checkpoints:

- `SECURITY_PERFORMANCE_AUDIT.md`
- `SUPABASE_AUTH_SETTINGS_CHECKLIST.md`
- `ROADMAP.md` > Write Mode And Security

Do not apply, deploy, push, or merge this branch until Jay approves the rollout
window.

Production actions require a phase-specific approval from Jay, such as
`Approve production Phase 0`. Approval to make local commits does not authorize
GitHub pushes, Vercel deploys, Supabase migration applies, Auth setting changes,
or Edge Function deploys.

## Rollout Principles

- Keep the rollout incremental. Close public/anonymous exposure before changing
  tenant-wide RLS.
- Prefer reversible steps before irreversible cleanup.
- Do not weaken RLS or restore anonymous grants as a rollback unless RetainOS is
  in an emergency outage and Jay explicitly approves it.
- Keep CST/Glide sync capability available until all companies are migrated, but
  require service-role authorization for sync endpoints.
- Keep Beacon out of this rollout unless it is moved server-side and the exposed
  key is rotated.
- Apply one production phase at a time. Each phase has its own apply, QA,
  observation, and go/no-go decision.
- Subagents may prepare bounded local patches, but may not receive production
  credentials or perform production actions.

## Preflight

- Confirm branch is `security-phase-0`.
- Confirm no Beacon files are staged for any security commit/deploy.
- The exposed Beacon Anthropic key was revoked on 2026-07-11. Do not add a
  replacement browser/Vite key during this rollout.
- Record the current production commit as the local rollback baseline.
- Build and test the exact security commit from a clean worktree. A build from
  the mixed Beacon worktree is not release evidence.
- Run `node scripts/verify-security-scope.mjs` before every local security
  commit and `node scripts/verify-security-scope.mjs --committed` in the clean
  QA worktree.
- Review generated DB types in `src/types/supabase.ts`; they are available
  through `typedSupabase` but not globally enforced yet.
- Build locally with `npm run build`.
- Check helper scripts:
  - `node --check scripts/verify-security-phase0.mjs`
  - `node --check scripts/sync-super-admins.mjs`
  - Run `node --check scripts/verify-security-phase1.mjs` only once the Phase 1
    candidate is included.
- Confirm `SUPER_ADMIN_EMAILS` / `VITE_SUPER_ADMIN_EMAILS` includes Jay and any
  other required launch SuperAdmins before tenant RLS is applied.
- Confirm Supabase backups/PITR and access to the previous Vercel deployment and
  previous Edge Function sources before any production window.
- Do not use `supabase db push` for this staged rollout: later draft migrations
  coexist in the worktree. Apply only the explicitly approved SQL file through
  the guarded `db:apply:sql` command.

## Phase 0 Local Gate

- Preview both SQL files without contacting Supabase:
  - `npm run db:apply:sql -- supabase/migrations/20260705090000_security_identity_bootstrap.sql`
  - `npm run db:apply:sql -- supabase/migrations/20260705100000_security_phase0_hardening.sql`
- Run:
  - `node --check scripts/apply-sql-file.mjs`
  - `node --check scripts/sync-super-admins.mjs`
  - `node --check scripts/verify-security-phase0.mjs`
  - `npm run build`
  - `git diff --check`
- Review the exact staged diff and run the security-scope guard.
- Create a local-only Phase 0 commit and validate it from a clean worktree.
- No command in this local gate may use `--apply`, `--allow-production`,
  `supabase functions deploy`, `git push`, or Vercel deployment commands.

## Phase 0: Public Exposure Hardening

Scope:

- Apply the additive identity bootstrap only:
  - `npm run db:apply:sql -- supabase/migrations/20260705090000_security_identity_bootstrap.sql --apply --allow-production`
- Preview the SuperAdmin registry and verify the configured emails/auth IDs:
  - `node scripts/sync-super-admins.mjs`
- Seed the reviewed registry:
  - `node scripts/sync-super-admins.mjs --apply --allow-production`
- Apply the approved Phase 0 hardening SQL only:
  - `npm run db:apply:sql -- supabase/migrations/20260705100000_security_phase0_hardening.sql --apply --allow-production`
- Deploy only the reviewed `sync-glide-table` function.
- Do not apply the Phase 1 migration in this phase.

QA:

- Run `node scripts/verify-security-phase0.mjs`.
- Confirm `security_rollout_history` contains the identity-bootstrap and Phase 0
  records after successful application.
- Confirm anonymous `exec_sql` is blocked.
- Confirm anonymous `client_links` read is blocked.
- Confirm anonymous `client_advocacy_events`, `glide_companies`, and `glide_rows`
  reads are blocked.
- Confirm unauthenticated `sync-glide-table` is blocked.
- Confirm a valid anon JWT is also rejected by `sync-glide-table`'s internal
  service-role check.
- Confirm SuperAdmin Tables still shows backup-table estimates.
- Confirm MM and Ethical Scaling client links/advocacy panels still load for
  legitimate users.
- Open Clients once as Jay and a company member to confirm authorized
  notification generation still succeeds.
- Confirm a company member cannot query another company's notifications or
  notification preferences through the REST API.
- Run a controlled SuperAdmin sync-table smoke test if this endpoint is still
  operationally needed.
- Run a limited primary `sync-glide` smoke test so the still-required CST mirror
  workflow remains healthy.

Rollback:

- Keep the additive identity registry and indexes; they do not remove or rewrite
  customer data.
- Never restore anonymous `exec_sql`, chain-secret helpers, legacy-table grants,
  or the unauthenticated `sync-glide-table` implementation.
- If notification generation fails, disable that caller/fall back to existing
  client fields while fixing the authorized wrapper; do not grant access to the
  unchecked implementation.
- If table estimates fail, temporarily hide estimates while fixing the
  SuperAdmin-only helper; syncing itself remains available.
- If a legitimate link/advocacy read fails, add a narrow membership-policy fix
  for the affected table. Do not restore cross-tenant `USING (true)`.
- The primary `sync-glide` path is the operational fallback if the legacy
  `sync-glide-table` endpoint needs to remain disabled.

## Phase 0.5: Edge Function Hardening

Scope:

- Deploy hardened functions that do not change the tenant RLS model.
- Shared authority is DB-backed through the Phase 0 `retainos_super_admins`
  registry. Company roles continue to require an active membership in the
  requested company.
- Browser functions use exact configured CORS origins. Arbitrary Vercel preview
  origins are not trusted; add an exact preview URL through
  `RETAINOS_ALLOWED_ORIGINS` only for an approved test window.
- Global webhook secrets are disabled by default. Production webhooks require
  active company-scoped tokens. `ALLOW_GLOBAL_WEBHOOK_FALLBACK=true` is an
  explicit local/dev compatibility switch and must remain unset in production.
- `sync-glide` accepts SuperAdmin JWTs for interactive modes and a verified
  service-role request for `job_batch` only. Request-supplied Glide credentials
  are rejected, and newly discovered backup tables default to SuperAdmin-only
  reads. Existing mirror-table policies are not changed in this phase.
- Deploy in four independently reversible waves:
  1. `manage-client-task`, `manage-integration-review`,
     `manage-integration-token`, and `manage-resource`.
  2. `prepare-login` with `--no-verify-jwt`.
  3. `zapier-create-client`, `webhook-update-client`, and
     `ingest-client-call-summary`, each separately with `--no-verify-jwt` and a
     QA stop between functions.
  4. `sync-glide` last, with JWT verification enabled.
- Before Wave 3, verify every live integration has an active company token.
  Never enable the global fallback merely to avoid issuing the correct token.
- Wave 3C has a two-function recovery dependency. Deploy the corrected
  `manage-integration-review` first with JWT verification enabled, complete its
  authenticated review-claim/recovery smoke test, and stop. Only then deploy
  `ingest-client-call-summary` with `--no-verify-jwt` and run the disposable
  company-token webhook QA. Neither step rotates, revokes, or rewrites existing
  company integration tokens.
- Before each wave, run `node scripts/verify-security-phase05.mjs`, the Deno
  local-symbol check, `git diff --check`, and the clean-worktree build.

QA:

- Wave 1: CSM can create/edit an assigned task; Director can create/edit/archive
  only their company's resources; Support cannot use integration review/token
  management; SuperAdmin can list tokens without creating or revoking one.
- Wave 2: unknown email receives the same generic preparation response as an
  eligible email; SuperAdmin, Director, and CSM OTP login still succeeds.
- MM Client Create webhook succeeds with an active company token.
- MM Client Update webhook succeeds for secondary pathway and supported profile
  fields.
- MM Call Summary / Next Steps webhook succeeds and still routes unmatched
  events to review.
- Wave 3C review recovery: a fresh claim cannot be taken twice; an abandoned
  claim older than 30 minutes returns to review; the newer claim alone can
  ignore, fail, or complete the event; partial history/attendance/audit rows are
  reused rather than duplicated.
- Wave 3C call-summary intake: archived clients never match, multiple attendee
  emails still find one active client, malformed timestamps fail clearly, a
  fresh duplicate reports in-progress, and a stale duplicate moves to review
  without automatic replay.
- Revoked/missing token paths still return unauthorized.
- Reuse the same external event ID once and confirm the second delivery is
  reported as a duplicate without a second history/task/client side effect.
- Wave 4: anonymous, invalid, and ordinary company-member sync requests fail;
  service-role `job_batch` reaches validation; SuperAdmin Tables refresh works;
  one small still-mirrored table sync succeeds.
- After every wave, confirm MM client-create, client-update, and call-summary
  intake timestamps continue moving normally before proceeding.

Rollback:

- Redeploy the previous version of only the failing Edge Function.
- Keep Phase 0 DB hardening in place unless the failure is proven to come from
  the migration rather than the function.
- Pre-Phase-0.5 production sources, deployed versions/bundle hashes, JWT modes,
  and downloaded-source hashes are captured at
  `/private/tmp/retainos-phase05-production-rollback-20260712`.
- Preserve the captured JWT mode when rolling back. In particular, the old
  `sync-glide` v19 rollback used `--no-verify-jwt`; all new Wave 4 deployments
  must use verified JWT.
- Stop after the first failing QA check. Roll back that function only, rerun its
  pre-wave smoke check, and do not continue to the next function or wave.

## Phase 1: Tenant-Scoped Read RLS

Status: **blocked from production** until role-aware app-owned policies,
mirror-table policies, secure future `backup_*` policy creation, and mandatory
role JWT verification are implemented and reviewed.

The original blanket Phase 1 draft is superseded and must not be applied. Build
and release Phase 1 in four independently reviewed slices:

1. **Phase 1A - authority foundation:** additive bound-SuperAdmin, app/mirror
   membership, and assigned-client helpers plus supporting indexes. No table
   policy replacement. Align the browser with the DB registry.
2. **Phase 1B - app-owned reads:** role-aware, set-based policies in small table
   groups. Director/Support may read company operations; CSM client-dependent
   reads require primary or secondary assignment; Viewer receives aggregate
   dashboard RPCs rather than raw client rows. Keep Phase 0 notification
   policies unchanged until recipient-aware replacements are proven.
3. **Phase 1C - known mirror fallback:** explicit policies for the mirror tables
   used by Dashboard, Clients, Client Detail, Tasks, Resources, and CSM Reports.
   Do not apply a blanket rule to unknown `backup_*` tables or global choices.
4. **Phase 1D - cleanup:** remove remaining broad authenticated policies only
   after all five roles and both app-owned/mirror paths pass direct REST and UI
   QA. Unknown sync-created tables stay SuperAdmin-only.

Scope:

- The identity bootstrap and SuperAdmin registry should already exist from
  Phase 0.
- Split the policy rollout from identity/bootstrap work so SuperAdmin access is
  proven before any broad read policy is replaced.
- Do not apply the current
  `supabase/migrations/20260705110000_security_phase1_tenant_rls.sql` draft as-is.
- Phase 1A candidate migration is
  `supabase/migrations/20260713010000_security_phase1a_role_authority.sql` with
  an exact helper/index rollback. It must pass
  `node scripts/verify-security-phase1a.mjs` before any production approval.
- Phase 1A intentionally does not replace the older email-fallback
  `is_retainos_super_admin()` used by the already-deployed Phase 0 notification
  policies. All current SuperAdmins are UUID-bound; Phase 1B will move the
  remaining policies to the bound helper after role QA proves parity.
- Production checkpoint 2026-07-13: Jay approved and Phase 1A migration
  `20260713010000` was applied with SHA-256
  `5180a931f27b6b6fe5e86ecbf57fb18913a6e99ba69194b06d8eaa830e41d440`.
  The migration changed no table policy. Disposable real-JWT verification
  passed 38/38 across bound SuperAdmin, app Director/Support/CSM/Viewer, and
  mirror-only CSM authority, including primary/secondary assignment,
  cross-company denial, Viewer raw-client denial, app-before-mirror precedence,
  and zero-residue cleanup. The browser `resolve_current_account()` consumer is
  still local-only and needs a separate frontend release approval. Phase 1B-D
  remain production-blocked until their own narrow policies and QA are ready.
- Local frontend checkpoint 2026-07-13: commit `88608ba` on the clean QA
  worktree passed all six role paths, 37/37 focused checks, the 101-module
  build, adversarial Viewer company scoping, zero-residue cleanup, and final
  independent review with no P0-P3 findings. Viewer now receives aggregate
  Dashboard/Resources only in the UI, with no client routes, names, profile
  history, drilldowns, row-level KPI fallback, or URL-selected foreign company.
- Frontend production remains stop-gated. Phase 1B must authorize aggregate
  Dashboard RPCs against the resolved actor/company and provide Viewer-safe
  aggregate paths for metrics that still derive from client rows before broad
  app-owned reads are removed. Shipping UI restrictions alone does not close
  direct REST/RPC isolation.
- Phase 1B local checkpoint 2026-07-13: clean commit `38817f0` is READY with
  actor-scoped Dashboard aggregates, role/assignment-aware app-owned reads,
  Viewer raw-row denial, source-resolution fail-closed behavior, exact guarded
  rollbacks, and two manual release gates. Checks passed 50/50 Phase 1B, 37/37
  Phase 1A, the 101-module build, deterministic SQL previews, and two final
  independent READY reviews. Production is unchanged.
- Mandatory forward order: apply additive `20260713020000`; deploy the frontend;
  complete frontend role smoke QA; explicitly apply manual gate `20260713020500`;
  apply and QA company policies `20260713021000`; apply and QA client policies
  `20260713022000`; explicitly apply post-policy QA gate `20260713022500`; only
  then apply legacy Dashboard RPC lockdown `20260713023000`. A batch apply is
  designed to stop before policy replacement when the manual gate is absent.
- Mandatory full rollback order: `23000`, `22500`, `22000`, `21000`, then
  `20500`; redeploy Phase 1A frontend commit `88608ba`; finally roll back
  additive aggregate slice `20000`. Each SQL rollback refuses unsafe ordering.
- Production Wave 1 checkpoint 2026-07-13: Jay approved and additive aggregate
  migration `20260713020000` is applied with SHA-256
  `c0e39fa60405d53267cd13c6788f636ea6ba2aa885c974be64084bdd040bce1e`.
  Postflight confirmed unchanged core counts, anonymous denial, fail-closed
  unbound service calls, healthy MM tokens/intake, and live HTTP 200. No policy,
  legacy-RPC grant, frontend, Auth, Edge Function, Git, or token changed.
- STOP GATE: deploy and QA the `38817f0` frontend before applying manual gate
  `20260713020500`. Do not apply `21000`, `22000`, `22500`, or `23000` yet.
- Production Wave 1B/frontend correction 2026-07-13: current-main churn chart
  parity required one additional aggregate-only RPC. Jay approved and migration
  `20260713020200` is applied with SHA-256
  `dd51ec58d6cf071738cf259bb13b5775cd7ceb08ffdb62d41f0fe8d97e26dc40`.
  It changes no policy, returns no raw identity, denies anonymous execution, and
  has an exact guarded rollback. The current-main-compatible frontend is live
  at `d29fa95`; Vercel deployment `5425577967` succeeded and the production
  bundle contains all actor-scoped RPC paths. Automated checks pass Phase 1A
  37/37, Phase 1B 52/52, and the production build.
- Updated STOP GATE: complete live role smoke QA before applying manual gate
  `20260713020500`. Policy and lockdown slices `21000`-`23000` remain unapplied.
  Frontend rollback baseline is `17c3023`; while `20500` is absent, roll back
  `20200` before `20000` if the aggregate/frontend release must be reversed.
- Production closure 2026-07-13: live role QA passed and temporary identities,
  client, and child records were deleted with zero residue. Release gates
  `20500`/`22500`, company policy slice `21000`, client policy slice `22000`,
  and legacy Dashboard lockdown `23000` are applied in the required order.
  Direct transaction-scoped RLS QA passed Director/Support company access,
  primary/secondary-assigned CSM client graphs and self-assigned tasks,
  unassigned/cross-company denial, Viewer raw-row denial, and automatic fixture
  rollback. Final postflight found zero broad policies on covered Phase 1B
  tables, browser denial on all three legacy KPI RPCs, authenticated-only access
  to actor-scoped replacements, three active MM tokens, and live HTTP 200.
  Phase 1B is complete.
- Phase 1C decision 2026-07-13: do not build temporary mirror-specific RLS
  because the remaining companies are expected to migrate within four weeks.
  Existing `backup_*` policies remain an explicitly time-bounded risk until
  mirror retirement. Phase 1D is split into immediate app/sync cleanup and a
  final mirror-table revocation only after the last company no longer depends
  on fallback reads.
- Phase 1D immediate candidate 2026-07-13: local migration `20260713024000`
  hardens every remaining non-mirror broad browser policy. Attendance and timed
  checkpoints follow Director/Support company scope plus primary/secondary CSM
  assignment; contract templates are SuperAdmin/Director-only; unscoped AI,
  raw Glide rows/metadata, and sync configuration become service-role-only;
  sync jobs/runs and table visibility remain bound-SuperAdmin-only. The exact
  rollback restores only the prior policies. No `backup_*` table is changed.
  Static/regression checks and the production build pass; production remains
  unchanged until a separate approval applies this migration and direct role
  QA passes.
- Phase 1D immediate production checkpoint 2026-07-13: Jay approved and
  migration `20260713024000` is applied. Direct transaction-scoped QA passed
  all intended role boundaries and rolled back every fixture. Postflight found
  zero targeted broad policies, zero authenticated policies on service-only raw
  configuration tables, both query indexes, zero QA residue, three active MM
  tokens, current processed MM intake, and live app/login HTTP 200. The 13
  `backup_*` broad policies remain unchanged for the four-week migration window.
  Jay's production UI smoke passed Tables, Sync Log, MM Contract Templates,
  Client Detail, and Daily Pulse. Immediate Phase 1D is closed. The separately
  gated final mirror-table revocation remains deferred until the last
  Glide-backed company migration is complete.

QA:

- SuperAdmin company switcher loads and can view Moves Method plus another
  company.
- Director sees only their company.
- CSM sees only assigned clients.
- Support sees approved company-wide operational views and no token management.
- Viewer dashboard behavior remains read-only.
- Run `node scripts/verify-security-phase1.mjs` with a non-SuperAdmin JWT and
  allowed/forbidden company IDs.
- Verify mirror fallback still works for a non-migrated company.
- Verify MM app-owned pages still load: Dashboard, Clients, Client Detail, Tasks,
  Resources, CSM Reports.

Rollback:

- If SuperAdmin is locked out, fix `retainos_super_admins` via service-role
  script first.
- If one role loses a legitimate read path, add a narrow tenant policy or helper
  fix for that table.
- Full rollback is to restore the previous authenticated read policies only for
  the specific broken table. Do not broadly restore `USING (true)` everywhere.

## Supabase Auth Settings

Apply dashboard-level changes from `SUPABASE_AUTH_SETTINGS_CHECKLIST.md` after
Phase 0.5 is stable and before or during the Phase 1 controlled window.

QA:

- SuperAdmin, Director, CSM, and Support can still complete OTP login.
- Unknown email does not reveal membership status.
- Public webhook functions are unaffected.

Rollback:

- Revert only the last Auth setting changed if legitimate login fails.

Source consolidation checkpoint 2026-07-13:

- Clean local branch `codex/security-source-consolidation` now reproduces the
  deployed Phase 0, Phase 0.5, recovery-fix, Phase 1A/B, and immediate Phase 1D
  security source on top of current `main`.
- Ten hardened function/shared files match downloaded production source
  byte-for-byte. `manage-client-task` preserves current-main's stricter UUID
  validator; `manage-integration-review` was corrected to the deployed
  Director/SuperAdmin-only rule so Support cannot use integrations.
- Current production DB types were regenerated and exposed through optional
  `typedSupabase`; existing runtime queries remain unchanged. Beacon, the
  Anthropic browser SDK, and obsolete Phase 1C draft are excluded.
- Validation passes Phase 0 production checks 8/8, Phase 0.5 91/91, Phase 1A
  37/37, Phase 1B 52/52, Phase 1D 16/16, clean diff checks, and the 102-module
  production build. Branch remains local until Auth settings and final security
  verification are complete.

Auth production checkpoint 2026-07-13:

- Jay enabled secure password changes and leaked-password protection, raised
  minimum password length from 6 to 12 with the strongest available character
  requirements, and preserved secure email change, 3,600-second OTP expiry,
  and 8-digit OTPs. Require-current-password and CAPTCHA remain disabled for
  the documented OTP-first/provider reasons.
- Jay logged out and completed a fresh production OTP login successfully.
  SuperAdmin login QA is closed.
- Auth connection management now uses a 17% allocation rather than an absolute
  cap of 10. The current 60-connection instance therefore retains the same
  10-connection Auth capacity and can scale automatically. Jay completed a
  second logout/fresh-OTP login successfully after saving this change.
- Auth settings and performance are closed. Final advisor/exploit verification
  remains before the consolidation branch can be proposed for merge.

Final verification checkpoint 2026-07-13:

- Fresh static gates pass Phase 0.5 91/91, Phase 1A 37/37, Phase 1B 52/52,
  and Phase 1D 16/16. The current production build passes with 102 modules.
- The branch diff against current `origin/main` excludes package changes,
  Header/Beacon files, Beacon libraries, and the old Glide folder.
- Fresh live Phase 0 exposure QA passes 8/8: anonymous SQL/RPC and protected
  table reads are blocked; anonymous/invalid sync function auth is rejected;
  and service auth reaches the target allowlist without executing a sync.
- Supabase Security and Performance Advisor review is the final evidence gate
  before review/merge of the local consolidation branch.

Advisor review correction / Phase 1E candidate 2026-07-13:

- Production Advisors report 0 Security errors and 0 Performance errors.
  Security has 28 warnings / 6 info suggestions; Performance has 15 warnings /
  40 info suggestions.
- The six Security info suggestions are intentional service-only tables with
  RLS enabled and no browser policy. Twenty-four authenticated
  `SECURITY DEFINER` warnings are intentional actor-scoped policy helpers,
  resolvers, guarded operational RPCs, or aggregate-only Dashboard functions.
- The advisor exposed one real anonymous path: legacy
  `dashboard_retention_counts_fast`. Clean local commit `3881d91` adds
  reversible migration `20260713025000`: anonymous execution is revoked; a
  wrapper enforces company role, denies Viewer/missing scope, and forces CSM
  queries to the signed-in CSM's assignment before returning retention data.
- The same migration pins all three mutable function search paths, removes 13
  inert `USING (false)` policies, and drops only two advisor-confirmed duplicate
  indexes. It changes no mirror read policy. Exact rollback and a 15/15 verifier
  are included.
- The 40 Performance info suggestions remain measured follow-up work for
  unindexed foreign keys and unused-index candidates, as already deferred in
  the roadmap. Production is unchanged pending a separately approved
  transaction-only preflight and rollout.

Phase 1E transaction-only preflight 2026-07-13:

- Jay explicitly approved the production transaction-only preflight. The first
  executor attempt rejected explicit transaction commands before executing the
  body; the final preflight used the existing RPC transaction plus a deliberate
  success sentinel to force rollback.
- The final preflight passed against production using a real active CSM's
  current unbound-email membership shape. It verified anon denial, authenticated
  wrapper grant, hidden unchecked core, three pinned search paths, zero remaining
  inert policies, retained equivalent indexes, unchanged mirror-policy count,
  forced CSM assignment parity, and denial for an authenticated identity with no
  membership.
- A separate postflight confirmed the Phase 1E rollout marker and renamed core
  were absent, the original function/grant/policies/indexes were restored, and
  production was unchanged. Disposable preflight files were removed; the clean
  worktree remains at local commit `3881d91`.
- Apply SHA-256: `882dbf97ebc8040464182fd7fbc114e3e1d03a02c12a9e4fe2006b45c5ebf855`.
  Exact rollback SHA-256:
  `8f208abcbf2ce31490956b29b0e51b58921d1f4be310a5e7a7ff3cd2390acfe6`.
  Permanent production apply remains separately gated.

Phase 1E production checkpoint 2026-07-13:

- Jay explicitly approved and migration `20260713025000` applied permanently
  with SHA-256
  `882dbf97ebc8040464182fd7fbc114e3e1d03a02c12a9e4fe2006b45c5ebf855`.
- Catalog/runtime postflight passed: rollout marker present; anon retention grant
  removed; authenticated scoped wrapper present; unchecked core hidden; all
  three search paths pinned; 13 inert policies absent; two duplicate indexes
  absent while equivalent indexes remain; exactly 13 deferred broad mirror
  policies remain.
- A real active CSM's wrapper result matched the service baseline forced to that
  CSM's actual assignment. An authenticated identity with no membership was
  denied. A direct live anonymous REST call now returns 401.
- Regression gates pass Phase 0 live 8/8, Phase 0.5 91/91, Phase 1A 37/37,
  Phase 1B 52/52, Phase 1D 16/16, Phase 1E 15/15, and the 102-module production
  build. MM retains three active integration types; app and login return 200.
- Exact rollback remains unapplied with SHA-256
  `8f208abcbf2ce31490956b29b0e51b58921d1f4be310a5e7a7ff3cd2390acfe6`.
  Jay's short Dashboard/note-search UI smoke and refreshed Advisor counts remain
  before Phase 1E closure.

Phase 1E QA closure 2026-07-13:

- Jay completed the production UI smoke successfully: Moves Method Dashboard
  and retention drilldown, Clients history/note search, and Ethical Scaling
  Dashboard all worked normally.
- Refreshed Advisors match the reviewed target exactly: Security has 0 errors,
  24 intentional authenticated-function warnings, and 6 intentional service-only
  info suggestions; Performance has 0 errors, 0 warnings, and 40 measured
  unindexed-FK/unused-index suggestions.
- Phase 1E is closed. Remaining rollout work is source/document consolidation,
  final branch review, and a separately approved merge/push. Phase 1C/final
  mirror-policy retirement remains deferred until all Glide-backed companies
  migrate.

Consolidation release candidate 2026-07-13:

- The clean local branch includes the final Phase 1E evidence and synchronized
  roadmap, Auth checklist, and rollout state.
- Final gates pass Phase 0 live 8/8, Phase 0.5 91/91, Phase 1A 37/37, Phase 1B
  52/52, Phase 1D 16/16, Phase 1E 15/15, the 102-module production build,
  committed-scope checks, and credential-shaped-secret scanning.
- Beacon, package changes, local secrets, and old Glide source are excluded.
  The candidate is ready for a separately approved merge/push. No merge, push,
  or deployment occurred during consolidation.

## Launch Gate

Each production phase can proceed only when:

- Its local build/static checks pass from the clean candidate worktree.
- Phase 0 and Phase 0.5 smoke QA pass.
- Phase 1 tenant QA matrix passes for SuperAdmin, Director, CSM, Support, and
  Viewer.
- MM webhooks pass with Daniel/MM active tokens.
- A rollback owner and decision window are agreed before production changes.

## Deferred Items

These are intentionally not part of the first security rollout:

- Unused index cleanup.
- Deeper query/repository refactors.
- Monster page component splitting.
- Beacon promotion/server-side rebuild.
- Broad generated-type enforcement across all existing queries.
