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
  - `CALL_INTELLIGENCE_V1_PLAN.md`, `CALL_INTELLIGENCE_ROLLOUT.md`, and `CALL_INTELLIGENCE_ZAPIER_CONTRACT.md`: Call Intelligence boundary, disabled release, rollback, and Zap handoff.
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

- Pipeline workspace: `/Users/joaogoncalves/Desktop/cst_supabase_backup` on dirty `codex/pipeline-phase-0-2`; preserve its intentional uncommitted candidate.
- Call Intelligence workspace: `/private/tmp/cst-call-intelligence-v1` on `codex/call-intelligence-v1`, isolated from verified `origin/main`; production remains unchanged until an explicitly approved disabled-first rollout.
- Shippable workspace: `/private/tmp/cst-shippable-main`, created from clean production `main`; keep non-Pipeline releases isolated here while the Pipeline candidate remains open.
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
- 2026-07-14 MM contract-template backfill: 90 Zapier-created clients with no current contract were matched exactly to enabled pathway templates and backfilled using their RetainOS/Zapier `created_at` as the start date (23 three-month, 38 six-month, 29 twelve-month). Each row is tagged `mm_pathway_template_zapier_intake_v1`, updates the current summary, and has a company audit record. Serina Ablett and Arana Karaka are intentionally unmatched/manual.
- 2026-07-15 MM legacy renewal repair: corrected 815 client summaries whose `2075-01-01` migration placeholder conflicted with a positive contract duration, plus 27 matching migration-summary contract rows. Carol Weyrauch now renews 2026-08-04. The remaining 116 client records have no duration and 24 linked contract summaries are genuinely open-ended; they remain unchanged. `scripts/repair-mm-legacy-contract-placeholders.mjs` is idempotent; Clients defensively derives a date if legacy input recurs.
- 2026-07-16 Client Detail polish keeps the summary/actions sticky below the app header and allows app-owned task edits from the client Tasks tab via the existing audited task function.
- 2026-07-16 navigation-continuity release `3357386` is on production `main`: Dashboard/Clients filters and Clients page/view/sort persist across navigation, while client links support standard new-tab behavior. Awaiting Jay QA.
- 2026-07-17 contact-touch reliability release `9ae70c1` is on production `main`: rapid “Mark contacted today” updates stay row-local, duplicate same-client clicks are synchronously blocked, returned client/history confirmation is required, stale roster reads are rejected, and the roster silently reconciles after a burst settles. Awaiting Adam QA.
- 2026-07-17 CSM membership repair `20260717100000` is production-applied: two empty archived Moves Method CSM duplicates were deleted after their active records were linked to the correct authenticated users; a same-company CSM email uniqueness index now prevents recurrence. `manage-client-status` was redeployed with active-membership-only resolution. Await Lorcan pause QA.
- 2026-07-18 native private-workspace release `d8c6580` is on production `main`: SuperAdmins can create an app-owned RetainOS workspace through SaaS Clients with no Glide/CST record or sync. The first Director is held as onboarding data (no membership/access) until the explicit Activate & invite action, which creates the membership and sends its login email. Live DB uses per-company active-email uniqueness (`company_members_active_company_email_unique_idx`). Await Jay QA.
- 2026-07-18 Sales Kick private setup: default outcomes and approved custom fields are live. Eight named team memberships are present as `pending`/held (no linked auth user, email, or access); `6f69738` and production migration `20260718103000` make this reusable and activate a held member only after a successful invite. Source-hashed batch `sales-kick-historical-v1:6b6cc58a9fe622a1` is imported and audited: 120 Front End clients, 116 contracts, 117 inferred current milestones, 119 last-contact dates, 922 custom field values, and 0 template tasks. CSM split is Ben 51, Aaron Rapoza 33, Gio 29, and only Cameron Widner's 7 rows route to Ben McLellan. Cole Gordon, Justin Nelson, Matt, and Brian Waldron intentionally have no imported contract for manual review.
- 2026-07-18 RetainOS-only mirror retirement: `20260718113000_company_mirror_visibility_overrides.sql` is production-applied. Acme Inc, Client Success Tracker AI, ClientEcho Funnel, and Darren Test are hidden from RetainOS; Major League Profits and Section 8 Training are archived. The `backup_companies` Glide mirror remains untouched; visibility records and audit events carry the exact legacy IDs.
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

## Beacon Secure Rebuild Plan - 2026-07-13

- `BEACON_BETA_PLAN.md` is the planning source of truth. It keeps OpenAI and all privileged data access in a `beacon-chat` Edge Function, separates company AI entitlement from role/client authorization, and defines test, pilot, observability, cost, rollout, and rollback gates.
- 2026-07-13 decision correction: Jay resolved G0. Active CSMs may access current and historical approved data for any same-company app-owned client they are or were verifiably assigned to; inactive membership, never-assigned, ambiguous, and cross-company cases deny. Support has company-wide operational visibility but no admin/configuration scope. Phase 1 is read-only with memory-only chat; future writes are a separate security phase.
- The candidate uses a memory-only widget, SuperAdmin-only AI Features management, three Edge Functions, four unapplied additive migrations with rollbacks, and eight service-only actor-bound read tools. CSM evidence is truthful from ledger cutover forward plus verified corrections; missing pre-cutover history is never inferred.
- Local evidence: database contract 49/49, Edge mocks 33/33, Edge source verification over 20 files, frontend/security 25/25, production build, and diff check passed. Ambiguous dispatched provider work consumes the full reservation. Database SQL still requires disposable/staging application and runtime tests; schedule the service-role expiration sweep at least once per minute before pilot traffic.
- No provider secret, provider call, migration apply, deploy, entitlement, commit, or quarantine restore occurred. Preserve `BEACON_PROTOTYPE_REFERENCE_DO_NOT_COMMIT/` and `retainos-conversation-ai-scope.md` as intentional untracked reference work.
- Jay's eventual manual scope is limited to visual placement/states, route-memory behavior, reset behavior, keyboard/screen-reader UX, and safe link navigation; Sol retains live security, data correctness, cost, observability, and rollback QA.
- 2026-07-14 rollout correction: Jay rejected separate Supabase/staging infrastructure and a multi-week Beacon gate. `BEACON_DIRECT_ROLLOUT.md` is now the active checklist: existing RetainOS Supabase/database, additive migrations applied disabled, three Edge Functions deployed while paused, existing-account OpenAI key stored only as a Supabase secret, Ethical Scaling-only $25 beta, then Moves by separate decision.
- Keep the tested server boundary, fixed tools, authorization, hard budget, and metadata-only usage; defer formal staging, exhaustive corpus/load/golden-set work, mandatory scheduler, and generalized future-AI rollout ceremony. The longer beta/morning QA documents are reference, not active blockers.
- 2026-07-14 production DB apply: migrations `20260714010000` through `20260714013000` applied to `zjauqflzxzsbpnivzsct` with the recorded hashes. Readback: all four rollout rows present, all five global AI controls paused, zero company entitlements, zero allowances, no Edge deploy/secret/frontend/enablement.
- Ethical Scaling assignment readiness is false: 72 active-CSM assignment values are verified; 89 current values map exactly to archived CSMs (58) or non-CSM members (31). This safely denies all CSM Beacon access. Before CSM rollout, narrowly exclude ineligible archived/non-CSM slots from the global readiness calculation without inventing history; SuperAdmin/Director/Support are unaffected.
- 2026-07-14 correction applied: `20260714014000_beacon_assignment_readiness_active_csm` (`f645dec39465bf18c6a677c9d767f65081c2d541b905469b8aae246e4d432db8`) now ignores only exact ineligible archived/non-CSM mappings while missing/duplicate/unverified active-CSM evidence still denies. ES readback: 161 exact mappings, 72 verified active-CSM values, 0 unresolved, ready=true; no historical inference.
- Post-correction production remains fail-closed: all five global AI controls paused, 0 entitlements, 0 allowances. Static DB verifier is 53/53. No Edge deploy, secret, frontend deploy, enablement, or provider call yet.
- 2026-07-14 paused Edge deploy complete: `beacon-access`, `beacon-chat`, and `manage-ai-feature-entitlement` are active at version 1 in `zjauqflzxzsbpnivzsct`, all with JWT verification enabled. Anonymous-token probes returned `401 unauthenticated` for every endpoint.
- Post-deploy Beacon remains globally paused with 0 entitlements, 0 allowances, and 0 usage events. No OpenAI secret, frontend deploy, enablement, or provider call occurred. Exact deployed hashes are recorded in `BEACON_DIRECT_ROLLOUT.md`; next separately approved step is the Supabase-only OpenAI secret.
- 2026-07-14 hidden frontend release: secure Beacon source commit `d76d90e` was pushed to production `main`; Vercel is Ready, and live app/login returned 200. The production bundle includes Beacon but no provider endpoint or credential name. Final DB readback remains paused with 0 entitlements, 0 allowances, and 0 usage events; quarantine references remain untracked and undeployed.
- 2026-07-14 ES pilot enabled: runtime correction `20260714015000_beacon_admin_feature_conflict_fix` (`1b23bcff57d4a11419b78061a58db625aa6b33cc0d442979d9f35e3b7516e8d8`) fixed the management RPC's ambiguous conflict target after the first attempt safely stopped while globally paused. Ethical Scaling is the only entitlement (`pilot`) with a one-time 2,500-cent hard allowance; global Beacon is active at config v2 and initial usage is 0. Local QA server uses `http://127.0.0.1:5173/`.
- 2026-07-14 Jay UI QA: launcher, route memory, refresh reset, keyboard close/reopen, SuperAdmin AI Features, $25 presentation, and Moves hiding passed. Five chats failed metadata-only as `provider_unavailable` before tools/tokens; `beacon-chat` was redeployed after the secret as active v3 (`ea334695351950739d23c796ecab48e8d411bf5883c23697019c515234df8a62`) for a fresh binding. Chat retest is open. Launcher/header now use a repo-native lighthouse/light-beam SVG instead of “B”.
- 2026-07-14 SuperAdmin chat QA passed after bounding the hashed OpenAI `safety_identifier` from 71 to 63 characters; the diagnostic identified `string_above_max_length` without content/error-message logging. Six successful requests exercised metrics, renewals, client lookup, context, and write/SQL/credential refusal. Metadata accounting: actual provider cost 10,863 micros (~$0.0109), whole-cent hard meter 6 cents, $24.94 remaining; all 10 pre-fix failures cost $0. Director/Support/CSM/Viewer live QA remains.
- 2026-07-14 cost/access correction: `20260714016000` (`25e842b4232636e79b36b82db06274483a0b4369923b327d056e24c005629435`) is live and all three Edge Functions are redeployed. Per-company Director/Support/CSM gates are server-enforced; SuperAdmin is implicit and Viewer denied. Aggregate micro-cost rounds once to 2 cents for the existing 10,863 micros. GPT-5.4 nano is the ES challenger; mini is the pinned rollback. ES alone remains entitled at $25; Moves remains off. Gates: DB 62/62, Edge 37/37, frontend 26/26, build pass. Frontend push and nano/role live QA remain.
- 2026-07-14 release correction: `c4d2801` is on production `main`; Vercel asset `index-J9ZSQMW6.js` contains the role controls/update action and passed the provider/privileged-credential scan. Nano conversation quality plus Director/Support/CSM/Viewer live QA remain; Moves stays disabled.
- 2026-07-14 nano eval correction: Jay's first live nano attempts passed access/reservation but failed closed during usage finalization because the database contract remains pinned to the reviewed mini model/price lineage. No nano finalization/provider cost was recorded; the temporary reservations expire. Restore mini immediately; do not evaluate nano live again until a separate reversible DB price-lineage migration passes accounting QA.
- 2026-07-14 nano accounting release: `20260714017000` (`237f8084c17d278cb4991c6f132e6e46fcf350f15a0b46127c22abf2204105d5`) is live. The DB independently recomputes finalized mini/nano costs from token counts and stamps the matching immutable lineage; mismatches deny. `beacon-chat` is redeployed on nano, with mini retained as source rollback. Gates: DB 65/65, Edge 37/37. Jay nano answer/finalization QA remains; Moves stays disabled.
- 2026-07-14 reservation-binding correction: the first 17000 nano smoke exposed the existing structural trigger requiring reservation/finalization price lineage equality. Mini was restored while `20260714018000` (`48b5dd1e51cee64f71bb880b9e3892b66e65ba659cad2a0e4a8dea10c47fb3e4`) bound server release -> model -> reservation price and finalization. Nano is redeployed; DB 68/68 and Edge 37/37 pass. One live nano smoke remains; Moves stays off.
- 2026-07-14 nano evaluation result: accounting passed exactly (3,208 input, 1,792 cached, 82 output, 422 micros), but product QA failed: nano reported only 8 front-end clients instead of 14 active front/back-end clients and emitted unsupported bold markers. Restore mini as production default; retain nano accounting support only. Strip simple bold markers in the plain-text sanitizer. Moves remains off.
- 2026-07-14 stress-quality release: `20260714019000` (`c586121be59645449714ac46dcca9525a04d60c03aba4505be1f9ffdf95f8f69`) and all three Edge Functions are live. Aggregate routing is authoritative; prose strips IDs/paths while structured buttons remain; exact natural client/CSM resolution and 0-365-day next-contact filters are actor-bound and fail closed. Gates: DB 72/72, Edge 42/42. Role QA passed. ES allowance is audited-adjusted to $27 to offset exactly $2 known conservative deployment-test charges while preserving $0.049852 real usage and the append-only ledger. Moves stays disabled; use `BEACON_STRESS_QA.md`.
- 2026-07-14 retest correction: the combined-health question succeeded; the other three were never executed because Jay hit the 50-request UTC daily cap (`actor_daily_limited`). `20260714021000` (`c31135f13a2e84c5d1b7aecb87e75f40f0bfaa9b429ef8d45ce72d5fe088c728`) raises only the actor daily pilot cap to 100; 5/minute, concurrency, company, and hard-dollar controls remain. Frontend now explains exact rate-limit retries. DB 79/79, frontend 26/26/build pass. Retry three; Moves off.
- 2026-07-14 semantic completion: Alima passed. Ali failed closed because Jay was primary on one Ali and secondary on another; Emily health returned only front-end. `20260714022000` (`19fe74a7b5adf7ab07b2a721eeea5d6ba41e8409449b26c2455fb39b8d048eb0`) and chat are live: `activeOnly` is front-end+back-end, “under/managed by” is primary CSM, generic assigned may include secondary, and ambiguity remains fail-closed. DB 83/83, Edge 43/43. Retest Ali and Emily; Moves off.
- 2026-07-14 assignee-role correction: Emily six-client health passed. Ali still missed because Jay is an active Director who is assigned as primary manager, while the partial-assignee resolver wrongly required account role CSM. `20260714023000` (`1f90973afc1433cb8386809d7154b2aa6da7906d0f1f877d59dfef6c336da1b5`) is live; eligible assignees now come only from active same-company members referenced on actor-authorized client assignments, regardless account role, while CSM actors remain self-restricted. Direct live Ali/Jay primary brief returns one back-end record and saved next steps. DB 87/87, Edge 44/44. One chat smoke remains; Moves off.
- 2026-07-14 brief orchestration correction: Ali/Jay chat resolved the right list row but stopped before the brief and falsely said next steps were unavailable. Chat instructions/tool description now require `get_client_brief` for summaries/north star/next steps/detail and forbid absence claims from `list_clients`; deployed with Edge 44/44. One final Ali smoke remains; Moves off.
- 2026-07-16 Beacon UX checkpoint: Moves Method Director pilot QA passed and is live. Jay approved a frontend-only drag-and-dock launcher/panel improvement after local QA; fine-pointer users can move Beacon by its launcher/header, it snaps to a viewport-safe edge, and only dock position persists locally while chat remains memory-only.
- 2026-07-22 Pipeline Gate F is live; MM is off. Sales Kick's master gate and Renewal/Expansion definitions are on with zero items, Viewer off, and automation off. Expansion's invalid null fixed-value starter was repaired to no-value and future starters use that valid default; Pipeline configuration now surfaces real Edge errors. Sales Kick configuration and MM feedback remain.
- 2026-07-22 Sales Kick Zapier client-create auth is healthy: its active company token accepted the latest Zap from `44.214.195.75`. The copied JSON template's unmapped optional `{{...}}` placeholders were reaching resolvers as literal IDs and producing a generic 500. `zapier-create-client` now treats exact unresolved placeholders as omitted and returns actionable 400s for invalid visible CSM/pathway/secondary configuration. Sales Kick retry QA remains.
- 2026-07-23 dashboard renewal decision-month formula is live via `20260723100000` (`c078abc12f9fbfadf938312d37e0f314dfdaa25661e9a1e12db02dbf94a9a228`) plus migrated source-evidence correction `20260723103000` (`dd861d1b10d0e142af48d64a850ca3ab678c4f2c4ae66da370fddf3cbcbd8006`). Renewal month is `max(prior contract end, successor start)`; paused, suspended/MIA, and pre-end churn are excluded. MM John July verified 16 eligible / 4 retained: Brent and Vipal retained in July, Nikki excluded; June/August contain none of those three. Static verifier 7/7 and build pass; Jay/MM QA remains.
- 2026-07-23 Churn Reasons chart period fix is live on `main` at `a5b3a2b`: production migration `20260723120000` (`0f2af9dcf3d5792ee59758fc60fafc1f091cac99e07ef91f919c56596652840d`) filters the actor-scoped aggregate by real recorded offboard date; the frontend distribution and drilldown use the same rule and never substitute contract end. MM production evidence is 67 dated churn records in June versus 50 in July. Jay/MM QA remains.
- 2026-07-23 Call Intelligence V1 local candidate: secure intake/dedupe/reconciliation, six-table RLS model, exact Glide baseline plus structured V2, budgeted AI worker/on-demand prompts, actor-scoped real UI, DEV-only fixture, tests, and rollout/Zapier docs are built on `codex/call-intelligence-v1`. Gates pass: Edge 16/16, eval 3/3, DB 53/53, source 35/35, frontend 19/19, build, and 1440px/320px browser QA. Official docs confirm GPT-5.6 Luna/Terra/Sol IDs and Responses schema; `openai-standard-2026-07-23` model prices are pinned with standard tier and implicit cache writes disabled. The ignored five-call private corpus plans 45 Terra-medium calls with a conservative $5.26 ceiling. No production migration/function/frontend deploy, token, entitlement, allowance, Zap change, paid eval, or provider call occurred.
