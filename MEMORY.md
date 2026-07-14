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
  - `BEACON_BETA_PLAN.md`: secure Beacon beta architecture, decisions, QA, pilot, observability, rollout, and rollback.
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

## Beacon Secure Rebuild Plan - 2026-07-13

- `BEACON_BETA_PLAN.md` is the planning source of truth. It keeps OpenAI and all privileged data access in a `beacon-chat` Edge Function, separates company AI entitlement from role/client authorization, and defines test, pilot, observability, cost, rollout, and rollback gates.
- Jay decisions block implementation: historical CSM interval semantics, Support access, chat/log retention, Phase A tools, model/budget/environment strategy, and sanitized SuperAdmin configuration scope. CSM Beacon access remains off until normalized interval authorization is approved and proven.
- No implementation, provider secret, migration, deploy, entitlement, commit, or quarantine restore occurred. Preserve `BEACON_PROTOTYPE_REFERENCE_DO_NOT_COMMIT/` and `retainos-conversation-ai-scope.md` as intentional untracked work.
- 2026-07-13 decision correction: Jay resolved G0. Active CSMs may access current and historical approved data for any same-company app-owned client they are or were verifiably assigned to; inactive membership, never-assigned, ambiguous, and cross-company cases deny. Support has company-wide operational visibility but no admin/configuration scope. Phase 1 is read-only with memory-only chat; future writes are a separate security phase.
- Model/budget baseline: pinned `gpt-5.4-mini-2026-03-17` with reasoning `none`, nano only as an eval challenger; provisional one-time $25 Ethical Scaling cap and Jay-approved one-time $100 Moves cap. AI Features belong only in the SuperAdmin SaaS-client view and use independent per-feature meters. G1-G3 design/security/environment proof still gates implementation/deployment.
- 2026-07-14 correction: the approved local Phase 1 candidate is now implemented on `codex/beacon-secure-rebuild`; this supersedes the earlier “implementation blocked/no implementation” checkpoint but does not authorize any environment change.
- The candidate uses a memory-only widget, SuperAdmin-only AI Features management, three Edge Functions, four unapplied additive migrations with rollbacks, and eight service-only actor-bound read tools. CSM evidence is truthful from ledger cutover forward plus verified corrections; missing pre-cutover history is never inferred.
- Local evidence: database contract 49/49, Edge mocks 33/33, Edge source verification over 20 files, frontend/security 25/25, production build, and diff check passed. Ambiguous dispatched provider work consumes the full reservation. Database SQL still requires disposable/staging application and runtime tests; schedule the service-role expiration sweep at least once per minute before pilot traffic.
- No provider secret, provider call, migration apply, deploy, entitlement, commit, or quarantine restore occurred. Preserve `BEACON_PROTOTYPE_REFERENCE_DO_NOT_COMMIT/` and `retainos-conversation-ai-scope.md` as intentional untracked reference work.
- 2026-07-14 morning QA: all Section A local/static checks and G1/G2 code review passed; independent Terra review found no P0/P1 issue. The worktree has no Docker/PostgreSQL/local Supabase runtime, so database execution, concurrency, live authorization, and rollback tests require an approved isolated staging target.
- Jay's eventual manual scope is limited to visual placement/states, route-memory behavior, reset behavior, keyboard/screen-reader UX, and safe link navigation; Sol retains live security, data correctness, cost, observability, and rollback QA.
- 2026-07-14 rollout correction: Jay rejected separate Supabase/staging infrastructure and a multi-week Beacon gate. `BEACON_DIRECT_ROLLOUT.md` is now the active checklist: existing RetainOS Supabase/database, additive migrations applied disabled, three Edge Functions deployed while paused, existing-account OpenAI key stored only as a Supabase secret, Ethical Scaling-only $25 beta, then Moves by separate decision.
- Keep the tested server boundary, fixed tools, authorization, hard budget, and metadata-only usage; defer formal staging, exhaustive corpus/load/golden-set work, mandatory scheduler, and generalized future-AI rollout ceremony. The longer beta/morning QA documents are reference, not active blockers.
- 2026-07-14 production DB apply: migrations `20260714010000` through `20260714013000` applied to `zjauqflzxzsbpnivzsct` with the recorded hashes. Readback: all four rollout rows present, all five global AI controls paused, zero company entitlements, zero allowances, no Edge deploy/secret/frontend/enablement.
- Ethical Scaling assignment readiness is false: 72 active-CSM assignment values are verified; 89 current values map exactly to archived CSMs (58) or non-CSM members (31). This safely denies all CSM Beacon access. Before CSM rollout, narrowly exclude ineligible archived/non-CSM slots from the global readiness calculation without inventing history; SuperAdmin/Director/Support are unaffected.
- 2026-07-14 correction applied: `20260714014000_beacon_assignment_readiness_active_csm` (`f645dec39465bf18c6a677c9d767f65081c2d541b905469b8aae246e4d432db8`) now ignores only exact ineligible archived/non-CSM mappings while missing/duplicate/unverified active-CSM evidence still denies. ES readback: 161 exact mappings, 72 verified active-CSM values, 0 unresolved, ready=true; no historical inference.
- Post-correction production remains fail-closed: all five global AI controls paused, 0 entitlements, 0 allowances. Static DB verifier is 53/53. No Edge deploy, secret, frontend deploy, enablement, or provider call yet.
- 2026-07-14 paused Edge deploy complete: `beacon-access`, `beacon-chat`, and `manage-ai-feature-entitlement` are active at version 1 in `zjauqflzxzsbpnivzsct`, all with JWT verification enabled. Anonymous-token probes returned `401 unauthenticated` for every endpoint.
- Post-deploy Beacon remains globally paused with 0 entitlements, 0 allowances, and 0 usage events. No OpenAI secret, frontend deploy, enablement, or provider call occurred. Exact deployed hashes are recorded in `BEACON_DIRECT_ROLLOUT.md`; next separately approved step is the Supabase-only OpenAI secret.
- 2026-07-14 secret checkpoint: Jay stored `OPENAI_API_KEY` directly in Supabase project `zjauqflzxzsbpnivzsct`; CLI verification confirmed only the secret name, never its value. Beacon remains paused with 0 entitlements, 0 allowances, and 0 usage events; no frontend deploy, enablement, or provider call occurred.
- 2026-07-14 hidden frontend release: secure Beacon source commit `d76d90e` was pushed to production `main`; Vercel is Ready, and live app/login returned 200. The production bundle includes Beacon but no provider endpoint or credential name. Final DB readback remains paused with 0 entitlements, 0 allowances, and 0 usage events; quarantine references remain untracked and undeployed.
- 2026-07-14 ES pilot enabled: runtime correction `20260714015000_beacon_admin_feature_conflict_fix` (`1b23bcff57d4a11419b78061a58db625aa6b33cc0d442979d9f35e3b7516e8d8`) fixed the management RPC's ambiguous conflict target after the first attempt safely stopped while globally paused. Ethical Scaling is the only entitlement (`pilot`) with a one-time 2,500-cent hard allowance; global Beacon is active at config v2 and initial usage is 0. Local QA server uses `http://127.0.0.1:5173/`.
