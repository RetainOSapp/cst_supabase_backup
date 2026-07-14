# Project Memory

Fast startup router for RetainOS. Keep under 150 lines with only current operational facts, dirty-work warnings, deploy/env notes, and the latest 1-3 active checkpoints.
Feature status belongs in `ROADMAP.md`; historical logs move verbatim to `MEMORY_ARCHIVE.md`; scoped runbooks/checklists belong in dedicated docs.

## Start Here

1. Read this file.
2. Run `git status --short` before edits, deploys, or commits.
3. Open `ROADMAP.md` only when Jay asks for priorities, pending QA, roadmap status, or "what next?"
4. Open scope docs only for the area being touched.
5. Use `ARCHITECTURE_MAP.md` / Graphify before non-trivial implementation or impact checks, then verify exact behavior with `rg` and source reads.

## Source Of Truth

- `MEMORY.md`: hard rules, current operational facts, dirty-work warnings, routing.
- `ROADMAP.md`: shipped/open/planned status, priorities, Jay QA queue, deploy gaps.
- `MEMORY_ARCHIVE.md`: searchable historical session log. Do not load by default.
- `ARCHITECTURE_MAP.md`: distilled Graphify architecture map.
- Active scope docs:
  - `OFFICIAL_COMPANY_ROLLOUT_CHECKLIST.md`: internal migration runbook.
  - `CLIENT_FACING_MIGRATION_QA_CHECKLIST.md`: customer-facing signoff.
  - `CONTRACT_BACKFILL_RENEWAL_PLAN.md`: contract/renewal planning.
  - `DASHBOARD_FORMULA_VALIDATION.md`: dashboard and CSM formula validation.
  - `CSV_BULK_IMPORT_EXPORT.md`: CSV import/export behavior.
  - `PERFORMANCE_PROGRAM_RELEASABLE_PHASES.md`: measured four-phase performance program.
- Closed/reference docs: search only when relevant, do not load by default:
  - `RETAINOS_RESOURCES_MIGRATION.md`
  - `PATHWAYS_MILESTONES_POLISH_PLAN.md`
  - `MOVES_METHOD_MIGRATION_READINESS.md`
  - `ETHICAL_SCALING_APP_OWNED_AUDIT.md`

## Hard Rules

- Never commit secrets. `.env`, `.env.*`, and `.env.graphify` are local-only.
- The old Beacon Anthropic key was revoked; any local value is obsolete and must never be reused or committed.
- Vercel deploys from `main`; anything pushed there is live.
- Use repo git identity `retainOS <retainOS@users.noreply.github.com>`.
- GitHub auth for this repo should use `retainOS`, not `atlas-thebrain`.
- The untracked `old glide project test/` folder is local Glide/reference material. Do not commit it unless Jay explicitly asks.
- `backup_*` tables are read-only Glide/CST mirror/reference sources. New RetainOS writes go to app-owned tables.
- Do not reopen closed V1 roadmap work unless Jay finds a real regression. New improvements become V2/polish roadmap items.
- Do not append detailed completed-work logs here. Put them in `ROADMAP.md` if status-related or `MEMORY_ARCHIVE.md` if historical only.

## Dirty Work / Commit Warnings

Before staging/committing, inspect `git status --short`. Uncommitted work may be intentional.

- Normal workspace: `/Users/joaogoncalves/Desktop/cst_supabase_backup` on clean production `main`.
- Beacon rebuild workspace: `/Users/joaogoncalves/Desktop/cst_supabase_beacon` on `codex/beacon-secure-rebuild`. Its `BEACON_PROTOTYPE_REFERENCE_DO_NOT_COMMIT/` files preserve the unsafe browser-direct pilot only as local reference; never commit/deploy them as-is.
- Beacon promotion path: build a provider-server-side `beacon-chat` Supabase Edge Function, keep the AI key as a Supabase secret, enforce company entitlement plus role/client scoping, and add usage limits/audit logging.
- Old Glide project reference moved outside Git to `/Users/joaogoncalves/Desktop/RetainOS Local Reference/old glide project test` until remaining migrations finish.

## Deploy / Environment Notes

- Local dev server: `npm run dev`.
- Build check: `npm run build`.
- Known build warnings may include Beacon/Anthropic browser externalization and Vite large chunk warning while Beacon remains local-only.
- Supabase project ref: `zjauqflzxzsbpnivzsct`.
- Supabase CLI default profile is the RetainOS org. Do not pass `--profile retainos`; that named profile is malformed.
- `prepare-login` must be deployed with JWT verification disabled because public login calls it before a user session exists:

```bash
npx supabase functions deploy prepare-login --project-ref zjauqflzxzsbpnivzsct --no-verify-jwt
```

- GitHub/network DNS may be blocked in the default sandbox. When Jay explicitly asks to push, use the approved/escalated `git push` path directly.

## Current Operational State

- Ethical Scaling is the controlled pilot/app-owned company.
- Moves Method was migrated to app-owned write mode on 2026-07-04 and is the first large live migrated company.
- Mirror-only companies still read from Glide/CST backup tables.
- Validated migrated/pilot surfaces prefer app-owned tables where built.
- App-owned MM webhooks are live for new client, client update, and call-summary/next-steps flows; customer Zap maintenance remains operational.
- MM launch hotfixes through 2026-07-06 included task dismissal, contacted shortcut, contact cadence automation, legacy/current history visibility, history date/delete controls, secondary pathway no-milestone support, and dashboard KPI info privacy.
- History edit/delete audit lives internally in `app_audit_events`; no user-facing audit log exists yet.
- Full feature state and remaining QA belong in `ROADMAP.md`, not here.

## Routing

For planning/priorities:

1. Read `ROADMAP.md` top sections and active high/medium-priority items.
2. Use the Jay QA Queue as the only active Jay QA source.
3. Open relevant scope docs only when the work touches that area.

For migration work:

1. Start from `OFFICIAL_COMPANY_ROLLOUT_CHECKLIST.md`.
2. Use `CLIENT_FACING_MIGRATION_QA_CHECKLIST.md` for customer signoff.
3. Put migration status and open items in `ROADMAP.md`.

For historical context:

1. Search `MEMORY_ARCHIVE.md` with `rg`.
2. Promote only durable operational facts back into this file.
3. Keep active `MEMORY.md` below 150 lines.

## Security Rollout Release Candidate - 2026-07-13

- Production Phases 0, 0.5, 1A, 1B, 1D, and 1E are deployed and Jay-QAed; Phase 1C mirror-policy work is intentionally deferred until remaining Glide companies migrate.
- Current Advisors: Security `0 errors / 24 warnings / 6 info`; Performance `0 errors / 0 warnings / 40 info`. Remaining entries are classified/deferred in `SECURITY_PERFORMANCE_AUDIT.md`.
- The clean local consolidation branch is `codex/security-source-consolidation` in `/private/tmp/retainos-security-source-consolidation`; it excludes Beacon and secrets and must not be pushed or merged without Jay's explicit approval.
- Detailed rollout state, rollback steps, and verification evidence live in `SECURITY_ROLLOUT_PLAN.md`; do not expand this memory checkpoint with the rollout log.
- 2026-07-13 correction: Jay approved the release; commits through `e4cda12` were fast-forwarded to production `main`, Vercel succeeded, and live app/login/bundle smoke passed. Beacon and Anthropic client code remain absent.
