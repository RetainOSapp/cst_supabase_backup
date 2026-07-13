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

**Dated correction - 2026-07-13:** Phase 1A authority is now deployed and its
frontend boundaries are included in the current Phase 1B release candidate.
Phase 1B additive aggregates (`20260713020000`) are deployed. App-owned read
policy replacement remains stop-gated behind this frontend release, role smoke
QA, and the manual `20260713020500` release gate.

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
- Production Phase 1A checkpoint 2026-07-13: migration `20260713010000` is
  applied. Disposable real-JWT verification passed 38/38 across SuperAdmin,
  Director, Support, CSM, Viewer, and mirror-only CSM authority, followed by
  zero-residue cleanup.
- Production Phase 1B Wave 1 checkpoint 2026-07-13: additive aggregate migration
  `20260713020000` is applied. Core counts, MM tokens/intake, anonymous denial,
  and live HTTP health remained unchanged. No read policy or legacy RPC grant
  changed.
- Frontend release candidate checkpoint 2026-07-13: branch
  `codex/security-phase1b-frontend-release` is based on production `main`
  rollback baseline `17c3023`. It preserves current Dashboard filter and chart
  behavior while adding DB-resolved account authority, Viewer boundaries, and
  actor-scoped aggregate reads. Phase 1A checks pass 37/37, Phase 1B checks pass
  52/52, and the production build passes. Independent review found that the
  current-main churn-reason chart postdated the original aggregate slice, so
  additive compatibility migration `20260713020200` and its exact rollback are
  now required before the frontend deploy.
- Mandatory forward order is: apply additive churn aggregate `20260713020200`;
  deploy frontend; complete role smoke QA; explicitly apply `20260713020500`;
  then separately apply and QA `21000`, `22000`, `22500`, and `23000`. Do not
  batch these steps.

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
