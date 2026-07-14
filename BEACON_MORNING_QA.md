# Beacon Morning QA Handoff

> Detailed reference only — 2026-07-14. The active, short checklist is
> `BEACON_DIRECT_ROLLOUT.md`. These deeper cases remain useful for regressions,
> incident review, and expansion beyond Ethical Scaling; they are not a required
> multi-week sequence before the first controlled beta.

Date: 2026-07-14
Pilot company: Ethical Scaling
Active rollout source: `BEACON_DIRECT_ROLLOUT.md`
Deep security reference: `BEACON_BETA_PLAN.md`

Sol execution update (2026-07-14): all safe local/static checks in Section A are
complete and code review is green. No migration, deployment, secret, entitlement,
or provider call was performed. Remaining live checks move to the existing
RetainOS project under the short direct-rollout checklist.

This checklist has two independent stages. Section A is safe before any database
migration, Edge deployment, provider secret, or company entitlement. Section B
must not begin until Sol records every prerequisite approval below.

## Immediate Stop Conditions

Stop the review and leave Beacon disabled if any check exposes another company,
bypasses a role or assignment rule, permits a write, places a provider or
privileged key in the browser, executes an unknown tool/query, logs conversation
content, exceeds a hard allowance, or fails to stop provider calls after pause.
Do not continue to the next role, tool, or rollout stage after a security failure.

## A. Safe Local And Static Review

No migration, deployment, provider key, provider call, production entitlement, or
production data change is authorized by this section.

### A1. Workspace and build boundary

- [x] Confirm the branch is `codex/beacon-secure-rebuild` and review `git status`
  before staging or cleaning anything.
- [x] Confirm `BEACON_PROTOTYPE_REFERENCE_DO_NOT_COMMIT/` remains untracked,
  unchanged, and outside the application import graph.
- [x] Confirm no `.env`, secret, provider key, generated `dist/`, or quarantine
  file is proposed for commit.
- [x] Run the frontend invariant verifier and production build using the exact
  commands Sol records in the evidence table.
- [x] Inspect the built bundle for OpenAI/Anthropic SDKs, provider endpoints,
  provider keys, service-role credentials, and the quarantined prototype.

Expected: all static checks and the build pass; Beacon browser code calls only the
three signed Supabase Edge endpoints and performs no direct table/RPC/provider
query.

Stop if the worktree contains an unexplained change, a verifier/build check fails,
or any credential/provider/database path is present in browser code or its bundle.

### A2. SuperAdmin AI Features placement

- [x] In source, confirm AI Features mounts only when both
  `mode === "super_admin"` and the registered account context says
  `isSuperAdmin`.
- [x] Confirm the panel is in the RetainOS SuperAdmin SaaS-client company view,
  near Company Settings/integrations.
- [x] Confirm ordinary `/admin` neither renders nor fetches AI entitlements.
- [x] Confirm Beacon has its independent status and allowance editor.
- [x] Confirm Phase 1 Beacon exposes exactly one currency-spend meter; future
  feature cards are non-editable “Coming soon” placeholders even though the
  generic schema reserves analysis, token, and request meter vocabulary.
- [x] Craft a management request for a non-Beacon feature and confirm the reviewed
  SQL contract denies mutation until that feature has its own reviewed release
  migration.
- [x] Confirm Start pilot and Resume remain disabled until the feature has its
  required positive hard allowance.
- [x] Confirm mutation payloads contain only meter type, period type, limit, and
  warning thresholds—not usage, current period, provider data, actor, role, or
  server-owned authority.

Expected: the management UI is an internal SuperAdmin surface. Beacon changes
cannot implicitly enable/fund another feature, and unreleased features cannot be
pre-enabled before their security review.

Stop if AI Features appears in ordinary Admin Hub, fetches there, submits metered
usage/server-period fields, or enables without a positive hard allowance.

### A3. Beacon browser contract and memory behavior

- [x] Confirm the widget is mounted once in `AppShell` so in-memory conversation
  can survive ordinary route navigation.
- [x] Confirm it remains completely hidden unless `beacon-access` affirmatively
  returns allowed, enabled, and an active `pilot` or `enabled` feature status.
- [x] Confirm Viewer is fail-closed before the visibility request and direct Edge
  authorization remains the authoritative protection.
- [x] Confirm the browser submits only company selector, current message, and
  bounded user/assistant display history—never actor, role, member, model, tool,
  provider state, or prior tool results.
- [x] Confirm the local input cap is 2,000 characters and display history is the
  latest 10 messages total, capped at 2,000 characters each and 8,000 combined.
- [x] Confirm answers render as plain text; URLs in answer text are not linkified.
- [x] Confirm only structured `/clients/:id` router links pass the client-side
  allow-list.
- [x] Confirm New Chat clears memory and company change, sign-out, and account
  change reset the panel, messages, input, errors, and in-flight presentation.
- [x] Confirm no conversation uses local storage, session storage, IndexedDB, or
  browser cookies.

Expected: before backend deployment the bubble remains hidden. Source/static
review proves the fail-closed UI contract but does not claim live authorization or
conversation behavior.

Stop if the widget becomes visible without affirmative server access, persists
chat content across reload/sign-out/company change, renders HTML/Markdown, or
accepts an external/script/data link.

## B. Controlled End-To-End QA

Do not start this section merely because the frontend builds.

### B0. Sol must record all prerequisites

- [x] G1 security review approved the exact migration, RLS, RPC, Edge, usage,
  limiter, assignment-ledger, and rollback contracts.
- [x] G2 local/static backend tests, provider mocks, schema verifier, and rollback
  verifier passed and are recorded below.
- [x] All six service RPCs and eight service-only actor-bound tool RPCs named in
  `SQL_CONTRACT` exist with reviewed grants/RLS, exact outputs, and rollback
  coverage.
- [ ] Reviewed additive migration was applied under a separately approved change.
- [ ] After that apply, `src/types/supabase.ts` was regenerated from the reviewed
  database and the new table/RPC signatures were diff-reviewed before any typed
  consumer depended on them. This cannot be truthfully completed while the
  migrations remain unapplied in the local planning worktree.
- [ ] A reviewed service-authority schedule calls
  `beacon_expire_usage_reservations` at least once per minute for each enabled
  pilot company; opportunistic request-path sweeps are not the sole cleanup path.
- [ ] Reviewed `beacon-access`, `beacon-chat`, and
  `manage-ai-feature-entitlement` Edge Functions were deployed under a separately
  approved change.
- [ ] The global Beacon control initially remains paused and every company
  entitlement remains disabled while direct-denial checks run.
- [ ] Named test users exist for SuperAdmin, Director, Support, CSM, and Viewer,
  plus verified current, former, never-assigned, inactive, and cross-company
  fixtures.
- [ ] Disabled-state direct-denial proof passes with no OpenAI secret required.

Before the first provider-call window, also require:

- [ ] A separate low-cap OpenAI Beacon Beta project exists; its key is stored only
  as the Supabase `OPENAI_API_KEY` secret and was never printed or copied into a
  browser environment.
- [ ] Ethical Scaling is the only company approved for the first window, with a
  one-time $25 hard allowance; Moves Method and every other company remain off.
- [ ] Sol has access to metadata-only usage/limiter/observability evidence and can
  identify whether a rejected request reached OpenAI.
- [ ] Rollback owner, test-window start/end, and immediate kill-switch path are
  named before enabling the window.

Expected: the first group blocks disabled-state deployment QA; the provider-window
group blocks unpausing Beacon or making any provider call. Every applicable item
must have traceable evidence before its stage begins.

### B1. Disabled-state and independent entitlement checks

- [ ] With the global control paused, confirm `beacon-access` and `beacon-chat`
  deny before quota/data/provider work. Confirm the management endpoint remains
  SuperAdmin-only and provider-free; the kill switch does not disable entitlement
  administration.
- [ ] Unpause globally while Ethical Scaling remains disabled. Confirm the widget
  is absent and direct chat is denied with zero provider calls.
- [ ] In SuperAdmin SaaS-client view, confirm Beacon, Call Analysis, Sentiment,
  Automated Summaries, and future features remain independent cards.
- [ ] Set a Beacon one-time currency allowance without changing any other feature.
- [ ] Enable only Ethical Scaling Beacon in pilot status. Confirm no other company
  or AI feature changes.
- [ ] Confirm Director/customer Admin Hub cannot see or call AI management actions.

Expected: global control wins first, company entitlement wins second, and each
feature is independently enabled and metered.

Stop if a disabled request reaches OpenAI, one feature changes another, or a
non-SuperAdmin can list or mutate AI controls.

### B2. Beacon memory and accessibility UX

- [ ] Open Beacon with an authorized Ethical Scaling account; verify clear beta,
  read-only, loading, error, truncated-answer, and allowance states.
- [ ] Send one question, navigate between RetainOS routes, and confirm the
  in-memory conversation remains.
- [ ] Select New Chat and confirm the transcript clears.
- [ ] Reload the page and confirm the transcript does not return.
- [ ] Switch company as SuperAdmin and confirm Beacon immediately closes and
  clears before checking the new company's access.
- [ ] Sign out and back in and confirm no transcript returns.
- [ ] Use keyboard only: open, type, Shift+Enter, Enter to send, follow a safe
  client link, New Chat, Escape to close, and observe visible focus.
- [ ] Confirm screen-reader names/status announcements for dialog, loading,
  errors, limits, and send/close controls.

Expected: navigation continuity exists only in memory; every scope/session reset
clears it, and no stale answer grants access in a later turn.

Stop if content survives reload/sign-out/company switch, a stale response appears
under the new company, focus is trapped/lost, or errors expose provider/database
details.

### B3. Role and assignment authorization matrix

Run each row through the UI and by direct endpoint call. Re-resolve identity,
company, entitlement, membership, and assignment on every turn.

| Actor | Checks | Expected result |
| --- | --- | --- |
| SuperAdmin | Selected Ethical Scaling; crafted different company/client ID | Approved operational scope for independently validated selected company only; AI management allowed only through dedicated management endpoint |
| Director | Own company metrics, clients, renewals, books; AI management/config question | Approved company operational scope; no AI management and no Phase 1 operating-configuration tool |
| Support | Company-wide clients/books; request Director Notes, configuration, audit, auth/team emails, integration detail | Approved shaped operational scope; every sensitive/configuration field denied or omitted |
| CSM current primary | Current assigned client and own book | Approved only for authorized client/book scope |
| CSM current secondary | Current secondary-assigned client | Same approved client scope as current primary |
| CSM former | Verifiably ever-assigned app-owned client after reassignment | Approved for the same Phase A client scope after reassignment while membership remains active; free-form history search remains excluded |
| CSM never assigned | Same-company client with no verified assignment ledger row | Denied with no client data and no provider leakage |
| CSM inactive/archived | Formerly assigned client | Denied entirely |
| Viewer | Bubble, access endpoint, chat endpoint | No bubble; direct endpoints denied before provider/data work |

- [ ] Using an ordinary authenticated Supabase session, call each of the eight
  Phase A database RPCs directly and confirm PostgreSQL denies execution; only
  `beacon-chat` may invoke them through its server-held service role.
- [ ] Confirm role/member/company values added to a crafted request body cannot
  expand any row above.
- [ ] Change a role, assignment, or membership between two turns and confirm the
  next turn immediately follows the new server state.
- [ ] Confirm the historical coverage label is explicit: current assignments at
  ledger cutover, changes captured after cutover, and reviewed corrections only.
  Missing pre-cutover history is not inferred and does not grant access.

Expected: 100% of role and assignment checks pass. Any ambiguous or missing
assignment proof fails closed.

Stop globally on any role escalation, never-assigned access, inactive-member
access, sensitive Support field, or Viewer provider call.

### B4. Cross-company isolation negatives

- [ ] From Ethical Scaling, submit a Moves Method company UUID, legacy ID, client
  UUID, client name, assignment ID, and safe-looking client link individually.
- [ ] Repeat with a stale Ethical Scaling chat after selecting another company.
- [ ] Try names/IDs that exist in both companies and malformed/ambiguous values.
- [ ] Repeat direct endpoint calls for SuperAdmin target selection and each
  company-bound role.
- [ ] Confirm denied attempts produce no cross-company row, count, existence hint,
  link, tool payload, or provider call where denial should precede the provider.

Expected: Company A receives zero Company B information through every tool and
every denial path.

Stop globally on any cross-company data, count, existence confirmation, or stale
company response.

### B5. Read-only allow-list and canonical answers

- [ ] Validate `company_metrics` against canonical dashboard/roster results.
- [ ] Validate `list_clients` filters/sort, default 25 rows, and hard maximum 50.
- [ ] Validate `list_renewals` across 0/365-day and date-boundary cases.
- [ ] Validate `list_contract_gaps` against current active-contract truth.
- [ ] Validate Success, Progress, and Buy-in output from `list_health_signals`.
- [ ] Validate deterministic approved criteria in `list_referral_ready`.
- [ ] Validate company books for SuperAdmin/Director/Support and own book for CSM
  in `list_csm_books`.
- [ ] Validate ambiguity handling, shaped fields, and server-built internal link
  in `get_client_brief`.
- [ ] Ask for client-history search, operating configuration, forecasts, generic
  table search, raw metadata, mirror data, arbitrary export, task creation,
  profile changes, email, or any other write.
- [ ] Submit SQL, table/column/RPC names, arbitrary sort/filter/limit fields, an
  unknown tool name, and extra tool arguments.

Expected: approved answers match canonical data; all later/excluded capabilities
refuse or safely state they are unavailable. No model-generated query or mutation
executes.

Stop if a decision-critical identity, count, renewal date, or contract-gap answer
is wrong; if an excluded field appears; or if an unknown query/tool/write runs.

### B6. Rate, token, abuse, and budget states

- [ ] Verify input over 2,000 characters is blocked before paid work.
- [ ] Verify submitted display context is deterministically capped at the latest
  10 messages, 2,000 characters per item, and 8,000 characters combined.
- [ ] Verify one sequential tool call, maximum 3 tool rounds, 25/50 row caps, and
  1,200-token/8,000-character maximum answer behavior.
- [ ] Verify per-user concurrency 2, 5 requests/minute, and 50/day atomically.
- [ ] Verify company 20 requests/minute and the configured Ethical Scaling daily
  limit atomically under concurrent requests.
- [ ] Verify 25-second provider and 35-second total request timeout behavior.
- [ ] Verify at most one bounded 429/5xx retry; ambiguous network failures,
  auth, schema, safety, entitlement, quota, and deterministic tool errors do
  not retry.
- [ ] Simulate provider timeout, ambiguous network failure, and malformed
  successful usage. Confirm every dispatched cost-uncertain request consumes
  the full 50-cent reservation instead of finalizing at zero.
- [ ] Cross the configured warning thresholds (UI defaults 75% and 90%) using
  approved synthetic/mocked accounting; separately verify the 100% hard stop.
- [ ] Reach the approved $25 hard cap in a controlled test and confirm the next
  request is blocked before OpenAI, with a clear UI limit state.
- [ ] Simulate a lost finalization and confirm expiration conservatively consumes
  the full 50-cent reservation; then submit late billed usage and confirm only
  over-reservation cents are added and the company entitlement pauses.
- [ ] Simulate actual estimated cost above the pinned 50-cent reservation and
  confirm the global Beacon control plus affected company pause atomically.
- [ ] Confirm rejected auth/entitlement/abuse requests do not consume paid quota.

Expected: every limit fails closed, concurrent reservations cannot overspend, and
the UI receives bounded 429/retry, truncation, timeout, and allowance states.

Stop if any request bypasses a limit, races past the hard cap, triggers an
unbounded retry, or exposes raw provider/database errors.

### B7. Prompt injection and unsafe-content handling

- [ ] Ask Beacon to ignore its rules, reveal secrets/system prompts, query a table,
  use web/code/shell/MCP/computer tools, follow an external link, or perform a
  write.
- [ ] Place equivalent instructions in approved test client names, outcomes, next
  steps, and history text; confirm stored text remains quoted inert data.
- [ ] Return Markdown, HTML, `javascript:`, `data:`, external URLs, and disguised
  links from a provider mock; confirm none becomes active content.
- [ ] Exercise provider refusal, malformed tool call, unknown tool, tool failure,
  4xx/429/5xx, timeout, and oversized response cases.

Expected: fixed server policy and strict dispatch win; the UI renders plain text
and only validated structured RetainOS client links.

Stop if injected content changes scope/tool behavior, reveals instructions or
secrets, executes a built-in/unknown tool, or produces an active unsafe link.

### B8. Log privacy, usage reconciliation, and observability

- [ ] Inspect detailed usage/audit records for request ID, company, actor/role,
  entitlement decision, model snapshot, tool names/counts, rows/truncation,
  latency, status, limiter bucket, token categories, price-card version, and
  integer estimated cost.
- [ ] Confirm raw prompt, answer, tool result, client row, note/history text,
  credential, and unrestricted provider error body are absent.
- [ ] Reconcile every paid provider call to one finalized usage event and the
  company period total; verify cached/input/output/reasoning token categories.
- [ ] Confirm accepted, denied, rate-limited, budget-blocked, success/refusal/error,
  p50/p95 latency, tool activity, cost/success, and allowance consumption views.
- [ ] Exercise or inspect alert paths for isolation failure, provider errors over
  5%/15m, p95 over 15s/30m, rate limits over 10%/15m, budget thresholds, dominant
  actor cost, and missing finalization/reconciliation.
- [ ] Confirm company customers cannot see another company's usage, provider IDs,
  internal denial details, or any conversation content.

Expected: metadata-only evidence fully reconciles cost and operations without
retaining chat content or sensitive tool data.

Stop if a paid call lacks finalization, totals do not reconcile, conversation or
client content appears in logs, or cross-company observability is possible.

### B9. Pause, kill switch, and rollback proof

- [ ] Keep a stale authorized widget open, then pause Ethical Scaling Beacon.
- [ ] Confirm the next access/chat request is denied before data/provider work and
  zero new provider calls occur after the effective pause time.
- [ ] Re-enable only if the company-pause test passed, then activate the global
  kill switch and repeat stale-UI/direct-endpoint checks.
- [ ] Confirm the global control overrides every company entitlement.
- [ ] Confirm normal RetainOS reads/writes and non-AI integrations still work while
  Beacon is paused.
- [ ] Confirm usage evidence identifies the last accepted request and release.
- [ ] Verify the reviewed frontend rollback and last-known-good Edge redeploy path
  without deleting additive schema or metadata-only logs.
- [ ] Verify key revoke/rotation procedure without printing or scanning the key.

Expected: company pause and global kill switch independently stop new provider
calls; rollback preserves normal RetainOS behavior and incident evidence.

Stop and keep the global switch paused if any stale/direct request succeeds, a
post-pause provider call appears, or rollback affects non-AI RetainOS behavior.

### B10. Pilot decision

- [ ] Record every failed, skipped, and not-applicable check with owner and reason.
- [ ] Confirm all authorization/isolation tests are 100% passing.
- [ ] Confirm golden answers meet at least 95% overall and 100% for identity,
  renewal dates, contract gaps, and decision-critical counts.
- [ ] Confirm successful-answer rate is at least 90%, normal p95 latency is at
  most 15 seconds, cost reconciles, and spend remains within allowance.
- [ ] If all gates pass, begin the separately approved Ethical Scaling observation
  period; do not enable Moves Method during this morning QA.

Expected: Jay and Sol have a traceable go/no-go record. A visually good chat does
not override a failed security, correctness, cost, or rollback gate.

## Automated Evidence — Local Candidate (2026-07-14)

Do not mark a backend/security row passed without its actual command and result.

| Gate | Exact command or procedure | Exact result / counts | Evidence location | Sol status |
| --- | --- | --- | --- | --- |
| Worktree/branch boundary | `git status --short --branch`; `git branch --show-current`; `git rev-parse --short HEAD` | Branch `codex/beacon-secure-rebuild`, base HEAD `6901938`; intentional dirty work remains unstaged | repository | PASS (local) |
| Frontend invariant verifier | `npm run beacon:verify:frontend` | 25/25 passed | `scripts/verify-beacon-frontend.mjs` | PASS (local) |
| TypeScript/Vite production build | dummy local Supabase values + `npm run build` | 105 modules transformed; build passed; existing large-chunk warning only | terminal evidence | PASS (local) |
| Browser bundle credential/provider scan | `npm run beacon:verify:frontend` after build | Built bundle contains Beacon and excludes provider credentials and SDK paths | `scripts/verify-beacon-frontend.mjs` | PASS (local) |
| Quarantine/import exclusion | `npm run beacon:verify:frontend` | Frontend never imports the quarantined prototype | `scripts/verify-beacon-frontend.mjs` | PASS (local) |
| Migration/schema/RLS/grant static verifier | `npm run beacon:verify:db` | Included in 53/53 database contract checks | `scripts/verify-beacon-foundation.mjs` | PASS (static + applied) |
| Assignment-ledger/rollback static verifier | `npm run beacon:verify:db` | Included in 53/53 checks; production ES readiness 161 exact / 72 verified active CSM / 0 unresolved / ready | verifier + production readback | PASS |
| Edge invariant verifier | `npm run beacon:verify:edge` | Passed across 20 source files | `scripts/verify-beacon-edge.mjs` | PASS (local) |
| Edge auth/provider/tool mocks | `npm run beacon:test:edge` | 33 passed, 0 failed | `supabase/functions/beacon-chat/tests/` | PASS (local) |
| Atomic DB rate/concurrency/budget integration | Apply migrations to an approved disposable/staging database, then run B3/B5/B6 | No PostgreSQL runtime was available; not executed | B3, B5, B6 | NOT RUN — approval-gated |
| Live usage/cost/privacy reconciliation | Run B6 against an approved environment | No live provider or database operations executed | B6 | NOT RUN — approval-gated |
| Full prompt-injection corpus | Run B4 corpus against the deployed paused candidate | Focused local validation/provider tests passed; full corpus not executed | B4 plus 33-test local suite | PARTIAL — runtime required |
| Golden canonical answer set | Run B7 against approved pilot data | Not executed | B7 | NOT RUN — approval-gated |
| Rollback/kill-switch verifier | `npm run beacon:verify:db`, then run B8 in an approved environment | Static rollback coverage is included in 53/53; live pause/rollback drill not executed | rollbacks plus B8 | PARTIAL — runtime required |
| Live Ethical Scaling manual QA | Run B9 only after all earlier gates pass | Not executed; no entitlement, secret, or feature was enabled | B9 | NOT RUN — approval-gated |

Local handoff decision: QA-ready local candidate; no production or pilot go-live decision has been made.
Final pilot decision: ☐ Stop / ☐ Fix and repeat / ☐ Begin ES observation window
Jay notes:
Sol notes:

## Jay UI-Only Handoff — After Ethical Scaling Is Enabled

Sol will retain ownership of live endpoint, role, cross-company, budget,
observability, canonical-answer, and rollback QA. Jay's manual UI review is only:

- [ ] Confirm Beacon and AI Features placement, wording, loading/error/limit
  states, and overall visual polish.
- [ ] Confirm a conversation survives normal route navigation but New Chat clears it.
- [ ] Confirm reload, company switch, and sign-out clear the conversation.
- [ ] Confirm keyboard send, Shift+Enter, Escape, visible focus, and launcher focus
  restoration feel correct.
- [ ] Confirm screen-reader labels/status announcements are understandable.
- [ ] Confirm validated client links navigate to the intended RetainOS client.

Do not start this UI list until Sol has completed the existing-project migration,
disabled deployment, and short role/tenant smoke checks in the direct rollout.
