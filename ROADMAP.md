# RetainOS Roadmap

Living product roadmap for the RetainOS app. Keep this file focused on what has shipped, what is actively being wired, and what should be considered next so future sessions do not restart from scattered memory.

Status key:

- `[x]` Shipped / validated
- `[~]` Built but not closed yet. Every active `[~]` item should carry one or more reason tags:
  - `[qa]` Reserved for items copied into the Jay QA Queue.
  - `[polish]` Works, but UX, edge cases, or final fit-and-finish remain.
  - `[downstream]` Data/config exists, but another app surface still needs to consume it.
  - `[mixed]` More than one reason applies; see the item notes.
- `[ ]` Planned
- `[?]` Needs product/data decision
- `[late]` Deliberately deferred until after migration-critical work

Closure rule: when Jay QA passes every stated close condition for a `[~]` item, promote it to `[x]`. If an item still feels open, its reason tag and remaining notes must explain exactly why.

Priority labels:

- `[priority: high]` Migration-critical or pilot/source-of-truth critical.
- `[priority: medium]` Needed before broader migration or important operating polish, but not blocking the current pilot.
- `[priority: low]` Useful in the next 1-2 months, but not required for early migration readiness.
- `[priority: later]` Valuable long-term, but intentionally not urgent while RetainOS is replacing Glide.

Roadmap hygiene rule: closed V1 work stays `[x]`. Future polish, broader migration hardening, or V2 enhancements should become separate planned bullets instead of keeping the validated V1 item in `[~]`.

## Jay QA Queue

Use this as the only canonical list for "what should Jay QA next?" Other `[~]`
items may still be open for polish, downstream wiring, migration validation, or
mixed reasons, but they are not active Jay QA asks unless copied here.

- `[x]` 2026-06-15 V1 closure QA is complete for Company Customization, Company Settings, Client Contracts/Renewals, Official Company Rollout Checklist, and the Ethical Scaling mirror-dependency/backfill slice.
- `[x]` 2026-06-17 Client lifecycle/program closeout QA passed with Josh Garvey assigned to Ben; lifecycle controlled-write and offboarding items can be closed.
- `[x]` Lifecycle closeout promoted the client lifecycle controlled-write and offboarding items to `[x]`; dashboard/CSM/notification proof remains Moves Method migration-day validation.
- `[x]` Tasks V1.5 QA passed: company-level creation, client-linked creation, client link navigation, edit, and drag/drop including `In Progress` all work after hard refresh.
- `[x]` Task Templates + Urgency V1 QA passed.
  - 2026-06-20 QA follow-up: clarified manual templates as New Task presets, auto-created template tasks now append/render client names, and list view now mirrors board status groupings with drag/drop.
  - 2026-06-20 follow-up: assigning a primary CSM now claims open unassigned tasks linked to that client; Tasks modal supports recurring tasks with repeat interval; completing a recurring task creates the next occurrence. Board/list status lanes now use soft RetainOS palette colors.
- `[x]` Emily pilot feedback final polish QA passed.
  - 2026-06-20 QA fix: Program Next Steps modal now passes company id to `manage-client-quick-update`; History tab now has common filter pills and search.
  - 2026-06-20 final polish: Quick Update context cards now have soft visual hierarchy and no embedded history; Client Detail > Program can update Next Steps, last contact, and next contact together; North Star has an Edit shortcut to the profile modal; Outcomes shows current values before edits; Pathway change modal shows the current pathway/milestone before changing.
  - 2026-06-20 QA follow-up: Outcomes dropdowns now default blank while current badges show saved values; blank outcome dropdowns preserve existing values on save. Pathway change modal now includes current-milestone completion date, start-another-milestone controls, and the green complete-current-milestone action.
  - 2026-06-20 correction: Outcomes now coerces preserved current values back to allowed option values before saving, avoiding edge-function validation failures. Pathway modal action block now uses the same `Pathway progress` section structure/labels/classes as Quick Update.
  - 2026-06-20 QA correction: Outcomes dropdowns now treat blank or same-as-current as `No change`, preventing no-op saves that trigger `No outcome changes to save.` Pathway modal now always renders the Quick Update-style `Pathway progress` block before the pathway reassignment fields.
  - 2026-06-20 outcome model correction: Outcomes are event-style updates, not static profile diffs. Current badges show saved value/date, dropdowns allow saving the same color again, and `manage-client-outcomes` refreshes the selected outcome date even when the value does not change. Deployed `manage-client-outcomes`.
  - 2026-06-20 Jay QA passed: Outcomes same-color event updates now work, and Pathway modal polish is done.
  - Follow-up: company-level default next-contact interval should live in Company Settings and auto-fill next contact after last contact updates while remaining overrideable.
- `[x]` Offboarding actual-end-date/churn upgrade QA passed.
  - Client Detail > Change Status > Offboarded now requires the actual end date and offer-fit answer, auto-classifies churn against the current contract end date, requires churn reason/notes only when churned, writes offboarding metadata/history/audit, and updates the RetainOS Help draft.
  - QA follow-up fix: Clients roster now waits for app-owned table detection and listens for a Client Detail status-change refresh token, so returning to `/clients` should show Offboarded without hard refresh.
- `[x]` 2026-06-20 Secondary pathway support QA passed.
  - Company Settings > Feature gates can enable Secondary pathway; Client Detail > Pathways & Milestones can set or clear the secondary pathway/milestone and shows it as a separate summary. `adding-secondary-offers` is now the RetainOS "Adding secondary pathways" draft.
  - 2026-07-02 QA fix: Change Pathway & Milestones now skips unnecessary primary pathway writes when only secondary pathway changes, only calls secondary writes when secondary values changed, validates secondary milestone selection, and surfaces real Edge Function errors.
  - 2026-07-02 QA fix 2: Applied the missing `client_history_events` event-type constraint for secondary pathway history writes and added an expandable Secondary Milestone Progress view on Client Detail. Awaiting Jay retest on set secondary pathway/milestone, clear, and expanded progress.
  - 2026-07-02 QA passed: Secondary Pathway expanded progress now has its own Start/Complete Secondary Milestone actions. `manage-client-milestone` supports secondary start/complete actions and updates the secondary current fields instead of the main pathway.
- `[x]` Milestone-completed task template QA passed.
  - 2026-07-03 Jay QA passed: primary pathway milestone completion can auto-create matching template tasks.
- `[~]` `[qa]` MM pathway/archive cleanup retest.
  - 2026-07-03 fix deployed: Admin Hub > Pathways & Milestones archive blockers now count only active Front End / Back End clients across primary and secondary pathway fields, and the UI usage count uses the same rule. Jay should retest archiving an unused MM pathway and an unused MM milestone.
- `[x]` Moves Method webhook setup dry run.
  - 2026-07-02 readiness patch deployed: `zapier-create-client` accepts canonical `pathway_id`, optional `secondary_pathway_id` + `secondary_milestone_id`, and legacy `offer_id` / `secondary_offer_id` aliases. `webhook-update-client` accepts the same fields for a conditional second Zapier step. Both validate active app-owned company pathways/milestones and require Secondary Pathway to be enabled.
  - 2026-07-02 internal QA: Moves Method was seeded as an app-owned pilot shell only (`companies.id = 21586391-9a84-4072-9ae6-20436b27bea9`, legacy `wd7vy0vaQK2hgB3IRqy17w`) with 89 members, 16 pathways, 33 milestones, and zero migrated clients. Secondary Pathway and New Client Webhook settings are enabled.
  - 2026-07-02 internal webhook dry run passed with disposable tokens that were revoked afterward: `zapier-create-client` created a test client, `webhook-update-client` added secondary pathway/milestone, and `ingest-client-call-summary` wrote Next Steps/Last Contact. Remaining QA is Jay/Daniel Zapier setup with fresh MM tokens created in Admin Hub.
  - 2026-07-02 Daniel-call docs fix: Client Update Webhook Resource now shows a safe minimal request body plus separate optional payload examples for profile-field updates and secondary-pathway updates, so copied JSON does not imply every optional field should be sent.
  - 2026-07-02 access prep: after Jay refreshed the Glide backup, app-owned MM team rows were synced to match `backup_company_team` without touching clients. Final count is 100 app-owned team rows, 73 active users, and no active backup/app-owned deltas.
  - 2026-07-02 Daniel-call custom-field fix: seeded MM app-owned custom field definitions for legacy Glide slots `customfield1..customfield7` (Gender, Age, Goals, Training Background, Injuries, Close Date, Program Name and Length). Disposable-token live QA confirmed `zapier-create-client` accepts Daniel's `customfield6` / `customfield7` payload and writes `client_custom_field_values`.
  - 2026-07-04 cutover: Moves Method webhook resources/tokens were validated during migration prep; active app-owned tokens exist for client create, client update, and call-summary next steps. Remaining work is operational customer Zap maintenance, not RetainOS setup.
  - 2026-07-04 final handoff check: MM has one active non-expiring token for `client_create`, `client_update`, and `call_summary_next_steps`; client create/update tokens were last used by Daniel/MM Zapier on 2026-07-03, and call-summary next steps processed/matched Janet Post on 2026-07-04.
- `[x]` Secondary assignee support QA passed.
  - Company Settings > Feature gates can enable Secondary assignee; + New Client and Client Detail > Edit Profile can set/clear the Secondary Assignee. Server validation requires an active visible team member and prevents using the same person as Primary CSM. `adding-secondary-assignee` is a draft RetainOS Help resource.
- `[x]` Archetypes in client views QA passed.
  - Company Settings > Feature gates can enable Client archetypes; Clients List view shows an Archetype column and Card view shows Archetype as a compact meta row. + New Client and Client Detail > Edit Profile now use a controlled dropdown limited to Doer, Controller, Worrier, and Follower. `archetypes-in-client-views` is refreshed as a RetainOS Help draft.
- `[x]` 2026-06-21 Advocacy tracking QA passed.
  - Quick Update and Client Detail > Outcomes now track Review, Testimonial, Referral, and Renewal / Upsell asks and received events with repeat counts and optional notes. Dashboard > Overview has Advocacy & Growth cards for asked, received, and ratio by current filters. Ethical Scaling app-owned data was backfilled from legacy Glide fields.
  - Jay QA: testimonial save worked from Client Detail, Quick Update layout was corrected to show Pathway progress before Advocacy & Growth, and Dashboard Overview advocacy filters worked.
- `[x]` Moves Method Phase 4 contract management retest passed.
  - 2026-07-04 fix deployed: Director, Support, and assigned CSMs can create/edit/archive/delete app-owned contract rows for clients they can manage; CSM assignment checks accept app-owned member IDs; contract rows ending today remain Active; and client current-contract summary sync only promotes active/open non-archived contract rows so expired old contracts do not reappear as current after archive/edit.
  - 2026-07-04 Jay QA passed: editing contract value persisted after refresh, archiving removed contracts from Active, and archived contracts appeared correctly under Archived.
- `[x]` Moves Method renewal KPI retest passed.
  - 2026-07-04 QA found Dashboard > Up For Renewal was effectively counting almost every active MM client when no Date Range was set. Fix built: default renewal KPI/drilldown window is overdue through next 30 days unless Jay sets an explicit Dashboard Date Range; Active Clients Up For Renewal uses the same current-contract filtering field as Clients. Expected MM default Up For Renewal is 438 on July 4, 2026.
  - 2026-07-04 follow-up polish: renewal KPI drilldown now shows Name, CSM, and Renewal Date, defaults to renewal-date sort, and lets Directors flip the renewal-date sort direction from the modal header.
  - 2026-07-04 QA catch: card showed 438 while the drilldown showed 70 because the drawer query only received the first 1,000 MM clients. The drawer now pages through all matching clients, chunks related history/contract reads, and uses the same current-summary renewal set as the card.
  - 2026-07-04 Jay retest passed: drilldown now loads the right numbers. Remaining follow-up is performance optimization for the full-scale drawer load, not a launch blocker.
- `[x]` Dashboard KPI info modal privacy retest passed.
  - 2026-07-04 hotfix: KPI info dialogs no longer expose SQL, copy-SQL controls, company IDs, table names, or schema/field names. `src/lib/dashboardKpiSql.ts` was deleted from the client code path; KPI cards now show plain-language "How this card works" explanations only.
- `[x]` Moves Method Phase 4 launch QA handoff passed.
  - 2026-07-04 Jay QA passed: QA client pathway progression completed both milestones and reached 100%; Bye Bye Panic still loads through mirror fallback; MM writes persist on real app-owned clients; all 30 latest CST screenshot clients were found in RetainOS app-owned data. Temporary role-QA users/client were deleted after QA, and MM app-owned clients now match the CST mirror snapshot at 4,485 / 4,485.
- `[ ]` Next expected QA queue source: a new intentionally queued build/deploy, or the Official Company Rollout Checklist when Jay calls a company cutover day.
- `[x]` 2026-06-17 hygiene check: every active `[~]` item has a reason tag; do not treat the full roadmap as a QA queue.

## Current Foundation

- `[x]` Vite + React + TypeScript app connected to Supabase backup tables.
- `[x]` Vercel deploys from `main`.
- `[x]` Git identity for this repo is `retainOS <retainOS@users.noreply.github.com>`.
- `[x]` Supabase Edge Function `prepare-login` is deployed for just-in-time Auth user provisioning.
- `[x]` SuperAdmin allowlist:
  - `jay@ethicalscaling.com`
  - `ben@ethicalscaling.com`
  - `darren@amblemind.com`
- `[x]` App is still read-only for business data writes unless explicitly planned otherwise.

## Phase-Based Delivery Plan

Source: `RetainOS_Ethical Scaling I Estimated Roadmap (Client) - Estimated Roadmap.csv`, reviewed for phase/order only. Ignore estimates in this roadmap; use this section to decide what to work on next.

My take: the scoping sequence is directionally right. The main RetainOS-specific adjustments are:

- AI should stay post-live and should not block the first 2-3 migrated companies.
- Offline functionality should stay later/nice-to-have, not before reporting and notifications.
- Dashboard and reporting should be validated earlier than the CSV implies because they prove whether client lifecycle data is flowing correctly.
- Zapier needs two separate tracks:
  - SaaS company provisioning, if needed.
  - Client creation webhook with required server-validated `company_id`.

### Phase 0: Shipped Read-Only Foundation

Goal: prove RetainOS can read real mirrored data, enforce hierarchy, and give SuperAdmin/company users useful local/live access.

- `[x]` App setup.
- `[x]` Supabase connection to mirrored backup tables.
- `[x]` Login/auth foundation with just-in-time user provisioning.
- `[x]` Role hierarchy and company scoping.
- `[x]` SuperAdmin global access and View As company.
- `[x]` SaaS Clients list/detail read-only foundation.
- `[x]` Clients list/card read-only foundation.
- `[x]` Client detail read-only foundation.
- `[x]` Contracts, program, outcomes, pathways/milestones, and tasks read-only wiring where available.
- `[x]` Tasks board/list read-only foundation.
- `[x]` Dashboard read-only foundation.
- `[~]` `[polish]` Admin/team management surfaces exist; Ethical Scaling pilot team writes are enabled through a controlled server path.

### Phase 1: Write-Mode Data Foundation And Admin Configuration

Goal: define the Supabase-native source of truth before enabling real CRUD.

- `[~]` `[mixed]` Finalize app-owned database structure and migration/backfill plan.
  - Working plan: `SUPABASE_WRITE_PLAN.md`.
- `[ ]` `[priority: medium]` Decide long-term legacy CST/Glide ID vs Supabase UUID strategy.
  - Current migrated data intentionally preserves legacy row IDs such as `glide_row_id`, `company_glide_row_id`, `client_id`, `assigned_to_id`, and pathway/milestone IDs so migrated records, webhook payloads, CST history references, and rollback/debugging stay traceable during cutover.
  - Medium-term architecture question: decide whether RetainOS should keep legacy IDs as external-reference fields indefinitely, or eventually migrate internal relationships fully onto Supabase UUID foreign keys with legacy IDs only as audit/import metadata.
  - Evaluate after Moves Method stabilizes: task/client/member joins, webhook contracts, reporting performance, RLS simplicity, support/debug workflows, and migration cost/risk.
- `[~]` `[mixed]` Define RLS/server-side authorization for all write paths.
  - 2026-07-05 local Security Phase 0 branch prepared: staged DB/function hardening for anonymous access, legacy sync endpoint auth/allowlist, and a non-destructive verification script. Not applied/deployed/pushed yet; broader tenant-scoped RLS remains the next security phase.
  - 2026-07-05 local follow-up hardening prepared: sync DDL identifier validation/quoting, webhook fallback constant-time comparison, removal of audited raw PostgREST filter strings in webhook/review/task assignee lookups, and resource update query scoping. Still local-only.
  - 2026-07-05 local Phase 1 tenant-RLS draft prepared: DB-side SuperAdmin registry, company-membership helper functions, hot-path indexes, tenant-scoped read policies for app-owned tables, Resources read scoping, and companion super-admin seeding / tenant verification scripts. Still local-only; do not apply until staging/smoke QA plan is ready.
  - 2026-07-05 local Phase 2/performance draft prepared: generic `prepare-login` responses, allow-listed webhook payload storage, shared CORS/JSON helper started, sync-control table policies folded into the RLS draft, and route-level code splitting/manual chunks. Still local-only.
  - 2026-07-05 rollout prep added: shared Edge auth helper used by integration tokens/resources, generated Supabase DB types available through `typedSupabase`, Supabase Auth dashboard checklist documented, and `SECURITY_ROLLOUT_PLAN.md` drafted with phased QA/rollback gates. Still local-only.
  - 2026-07-11 local-only Phase 0 checkpoint `089e099`: additive DB-side SuperAdmin/bootstrap helpers, guarded privileged RPCs and exposed-table grants, tenant-scoped links/advocacy/notification reads, service-role-only `sync-glide-table`, non-destructive verification, migration-order history, and production-ref command guards. Clean worktree build/scope QA passed with no Beacon artifacts. No push, migration apply, function deploy, Vercel deploy, or Auth setting change occurred. Phase 1 remains blocked until role-aware and mirror-table RLS are corrected.
  - 2026-07-11 read-only production preflight passed for Phase 0A: project ref and candidate scope are pinned, all three configured SuperAdmins resolve to confirmed Auth users, MM/ES app-owned reads and current MM webhook activity are healthy, seven consecutive daily physical backups are complete, and the deployed `sync-glide-table` v7 rollback source was captured. The preflight also confirmed the live holes Phase 0 targets: anonymous rows are currently readable from links/advocacy and anonymous `exec_sql` is callable. No production write, SQL apply, function deploy, push, merge, Auth change, or Vercel change occurred.
  - 2026-07-11 Phase 0A production bootstrap applied with reviewed SHA-256 `95529841438f4510d4bc1d80bbbfe46fb4b7ebf538c253d3938e4c5f754492a1`. Bootstrap history exists; the empty registry and new identity helpers deny anonymous access; MM/ES counts and MM webhook evidence are unchanged. SuperAdmin dry-run resolves all 3 configured Auth users with zero missing users, UUID conflicts, or archive actions. Registry seed and Phase 0B remain paused for separate approval; no function/Auth/Vercel/Git deployment occurred.
  - 2026-07-12 approved production SuperAdmin registry seed completed: 3 configured rows synced, all 3 are active and exactly match their confirmed Supabase Auth UUIDs, with 0 missing users, conflicts, or archives. Registry/history/helpers still deny anonymous access. MM webhook ingestion continued during verification, adding one legitimate client/task. Phase 0B hardening and `sync-glide-table` deploy remain paused for separate approval.
  - 2026-07-12 approved Phase 0B production hardening applied with reviewed SQL SHA-256 `cd8bab24c3df202f831ec429087c1250d31e29115ca6d395dcd5f1ed7ce9b11a`; both rollout-history rows exist. Anonymous `exec_sql`, links, advocacy, legacy staging tables, table estimates, and notification generation now deny access. Hardened `sync-glide-table` v9 is ACTIVE with JWT verification enabled; anon/invalid callers return 401 and a valid service caller reaches the no-write target allowlist. MM/ES service reads and MM's three active webhook types remain healthy. Automated gates passed; Jay-owned UI/role/sync smoke QA remains before Phase 0 is marked closed.
  - 2026-07-12 Jay live QA passed: production Tables shows estimates; the 7-row `Company -> Client Groups` primary Glide sync completed successfully; MM Ginger Heus loads the expected client link plus testimonial/upsell advocacy; ES Ali Abdaal loads the expected testimonial; and the ES Clients list loads without authorization/notification errors. Only the controlled non-SuperAdmin cross-company notification/preference denial proof remains before Phase 0 closure.
  - 2026-07-12 controlled Viewer QA confirmed `can_read_company(ES) = true` and `can_read_company(MM) = false`, but company-scoped notification reads time out with Postgres `57014`; every temporary Auth/member identity was deleted with zero residue. Local commit `eb83082` prepares a set-based notification RLS/index hotfix plus guarded audited rollback. Clean QA and independent review passed; production apply is waiting on Jay's explicit hotfix approval.
  - 2026-07-12 correction / Phase 0 closure: Jay approved and the production notification policy/index hotfix was applied with reviewed SHA-256 `afd4e39e89a99f47090c456d744b3c7078045b06d6a3cfbad3c840af5d902e45`. A disposable Ethical Scaling Viewer passed all 7 real-JWT checks: own-company access, Moves Method denial, notification/preference isolation, and cross-company notification-generation denial; cleanup left 0 membership and 0 Auth rows. The full 8/8 Phase 0 verifier, service capability smoke, SuperAdmin registry alignment, MM/ES stability snapshot, and live webhook checks also passed. Phase 0 is closed; this parent item remains `[~]` only for the broader Phase 1 write-path/RLS rollout.
  - 2026-07-12 local Phase 0.5 release candidate `0839973` is READY but not deployed/pushed/merged. It hardens 9 Edge Functions with DB-registry authority, exact-origin CORS, company-token-only production webhooks, replay short-circuiting, bounded email matching, minimized stored payloads, and SuperAdmin/service-role-only Glide sync modes while preserving newer live contract/task/call-attendance/next-contact behavior. Clean QA passed 74/74 focused checks, Deno local-symbol checking, a 101-module build, committed-scope/diff checks, production-baseline comparison, and independent Terra review. Roll out only through the four separately approved waves in `SECURITY_ROLLOUT_PLAN.md`.
  - 2026-07-12 correction / Phase 0.5 Wave 1: Jay approved and the four management functions were deployed individually from clean commit `0839973`. Production is ACTIVE with JWT verification enabled for `manage-client-task` v10, `manage-resource` v5, `manage-integration-review` v9, and `manage-integration-token` v2. Every function passed trusted/untrusted-origin CORS checks plus unauthenticated and anon-session rejection before continuing; no rollback was needed. Wave 1 remains `[~]` pending Jay's short role-based task/resource/integration QA. Waves 2-4 remain undeployed and require separate approvals.
  - 2026-07-12 correction / Wave 1 closure: Jay QA passed. CSM task creation worked; MM Director resources remained healthy; Support remained excluded from integration review/token management; and SuperAdmin saw exactly 3 active MM integration tokens. Phase 0.5 Wave 1 is closed. Waves 2-4 remain separately gated.
  - 2026-07-12 Phase 0.5 Wave 2 attempt was stopped and rolled back: the first hardened `prepare-login` deploy returned generic 500s because it selected nonexistent `retainos_super_admins.id`. No OTP was sent and the unknown probe left 0 Auth rows. The exact captured pre-Wave-2 source was immediately restored as production v7 with JWT verification off. Clean retry commit `c759dba` fixes the schema column, prevents all four PostgREST ILIKE wildcard forms from classifying unknown emails, and keeps every valid-email internal outcome generic. It passed 77/77 checks, Deno, the clean build, read-only production query regressions, committed scope checks, and independent READY review. Production retry requires a new explicit approval.
  - 2026-07-12 corrected Wave 2 retry: Jay approved and `prepare-login` v8 is ACTIVE with JWT verification off. Eligible, normal unknown, and backslash/percent/underscore/star-shaped unknown emails all returned identical 200 `{"ok":true}`; approved-origin CORS passed, an untrusted origin received no allow-origin header, and all unknown Auth residue remained 0. Waves 1, 3, and 4 stayed unchanged. Wave 2 remains `[~]` only for Jay's SuperAdmin, Director, and CSM OTP login QA.
  - 2026-07-12 correction / Wave 2 closure: SuperAdmin OTP login passed. Disposable Ethical Scaling Director and CSM accounts both received OTPs and loaded the correct role-scoped app in incognito; Director had no SuperAdmin switcher and CSM saw no unassigned client data. Cleanup deleted both temporary memberships and both Auth users, leaving 0/0 residue. Phase 0.5 Wave 2 is closed; Waves 3-4 remain separately gated.
  - 2026-07-12 Wave 3 preflight: MM has one current active company token for each live webhook and production global fallback is disabled. Client Create is READY for its separately approved 3A deploy with disposable client/token, replay, revoke, side-effect, and zero-residue QA. Client Update and Call Summary remain `[~]` locally: fix candidate-worsened stale/failed intake recovery before 3B/3C; Call Summary must also exclude archived clients and remove the five-row match cap. No Wave 3 function was deployed.
  - 2026-07-12 correction / Wave 3A closure: Jay approved and hardened `zapier-create-client` v18 is ACTIVE with JWT verification off. Trusted/untrusted-origin CORS, missing/invalid/revoked token rejection, valid create, exact replay, contract/custom-field/task/history/audit side effects, token usage, and zero-residue cleanup all passed. The three real MM tokens remain active/current; Update, Call Summary, and Sync were untouched. Wave 3B remains local-only pending recovery-fix review and a separate approval.
  - 2026-07-12 Wave 3B READY: local commit `87ba0b1` adds no auto replay. A client-update intake row still `received` after 30 minutes, safely beyond Supabase's 400-second hosted worker limit, moves to failed/review through status + `updated_at` optimistic conditions; race losers re-read current status and catch cannot regress terminal states. Deno/build/diff, 80/80 checks, live read-only JSON-path validation, and independent no-P0-P3 review passed. Production remains v10 until separately approved.
  - 2026-07-12 correction / Wave 3B closure: Jay approved and hardened `webhook-update-client` v11 is ACTIVE with JWT verification off. Existing MM tokens were unchanged; a separate disposable token/client passed secondary pathway + milestone, custom-field/contact/next-step updates, exact replay, fresh/stale/failed event handling, invalid/revoked rejection, side-effect counts, and zero-residue cleanup. Client Create remains v18; Call Summary and Sync were untouched. Wave 3C remains separately gated.
  - 2026-07-12 Wave 3C READY locally: clean commit `dd81050` hardens Call Summary matching/recovery and Integration Review partial-write recovery. Archived clients are excluded, broad attendee matching is bounded/literal-safe, stale intake is review-only with no auto replay, partial history/attendance/audit rows are reused, and every review terminal/error transition requires the exact DB-generated claim version. The first review found and blocked a P1 ownership race; the corrected candidate passed 91/91 checks, TypeScript/build/diff validation, and independent rereview with no P0-P3 findings. Roll out as two stop-gated steps: corrected Integration Review first with JWT verification on, then Call Summary with JWT verification off and disposable-token QA. Existing MM tokens remain untouched. Production is unchanged pending Jay's explicit Wave 3C1 approval.
  - 2026-07-12 correction / Wave 3C1 closure: Jay approved and corrected `manage-integration-review` v10 is ACTIVE with JWT verification on. Missing/anon auth, trusted/untrusted CORS, one-winner concurrent claims, fresh/stale claim handling, partial history/attendance/audit recovery, owned failure handling, and zero-residue cleanup all passed with a disposable Director/client/event set. All seven stored MM token records were unchanged. Call Summary remains v12 and Wave 3C2 remains separately gated.
  - 2026-07-12 correction / Wave 3C2 and Wave 3 closure: Jay approved and hardened `ingest-client-call-summary` v13 is ACTIVE with JWT verification off for company-token auth. Exact-origin CORS, missing/invalid/revoked rejection, multi-attendee matching, exact one-time history/attendance/audit, replay deduplication, fresh/stale intake handling, archived-client exclusion, malformed-timestamp rejection, and zero-residue cleanup passed. All seven stored MM token records were unchanged. Phase 0.5 Wave 3 is closed; only Wave 4 `sync-glide` remains separately gated.
  - 2026-07-12 correction / Wave 4 and Phase 0.5 closure: Jay approved and hardened `sync-glide` v20 is ACTIVE with JWT verification on. Exact-origin CORS, missing/invalid/anon/member denial, service-role mode separation, and service `job_batch` validation passed. A disposable SuperAdmin synced only the 7-row `Company -> Client Groups` table; ES/MM app-owned counts and all MM token records stayed unchanged; cleanup left zero identity residue. All four Phase 0.5 waves are closed with intended JWT modes. Phase 1 tenant/write-path RLS remains separately gated.
  - 2026-07-12 Phase 1A READY locally: the old blanket Phase 1 draft was rejected because it would overexpose CSM data and break mirror-only companies. Clean commit `45a5df6` adds no table-policy changes: it prepares bound SuperAdmin/app/mirror authority, assigned-only CSM client helpers, Viewer raw-client denial, supporting indexes, exact rollback, schema-cache reload, and one browser account-resolution RPC that replaces the Vite email allowlist/direct membership-table logic. Real membership-shape audit, 29/29 checks, build/diff/syntax, deterministic SQL previews, and independent no-P0-P3 review passed. Production remains unchanged pending a separate Phase 1A SQL approval; frontend deployment is gated after helper JWT QA.
  - 2026-07-13 correction / Phase 1A authority foundation deployed: Jay approved and additive migration `20260713010000` was applied to production with reviewed SHA-256 `5180a931f27b6b6fe5e86ecbf57fb18913a6e99ba69194b06d8eaa830e41d440`. Real signed JWT QA passed 38/38 for bound SuperAdmin, Director, unbound-email Support fallback, primary/secondary-assigned CSM, Viewer raw-client denial, app-before-mirror precedence, and mirror-only CSM fallback; anonymous and internal-scope calls were denied and cleanup left zero temporary residue. Existing app counts, three bound SuperAdmins, all three active MM tokens, recent processed MM events, and live HTTP health remained stable. No table policy, Auth setting, Edge Function, Vercel deployment, Git push, or main merge changed. The browser resolver remains local pending a separate frontend release approval; Phase 1B-D RLS remains open.
  - 2026-07-13 correction / Phase 1A frontend local QA: clean local commit `88608ba` replaces browser email/membership reconstruction with the production account resolver and closes Viewer UI/data-fetch gaps. Six-role browser QA passed across SuperAdmin, Director, Support, app CSM, Viewer, and mirror-only CSM; Viewer now keeps aggregate Dashboard/Resources only, cannot open Clients/Daily Pulse/Groups, cannot activate dashboard drilldowns, receives no client names/profile-history payloads, fails closed on aggregate RPC errors, and cannot prime a foreign company through the URL. Final checks passed 37/37, clean build/diff, adversarial company-scope QA, zero temporary residue, and independent no-P0-P3 review. Commit remains local-only; production frontend release is still gated, and Phase 1B must secure actor-scoped aggregate RPCs plus app-owned table policies because UI controls are not the database boundary.
  - 2026-07-13 Phase 1B READY locally: clean commit `38817f0` adds actor-scoped Dashboard KPI/overview/chart RPCs, assignment-aware app-owned company/client/task policies, Viewer raw-row denial, exact rollbacks, and manual pre-policy/post-policy release gates. Final validation passed 50/50 Phase 1B checks, all 37 Phase 1A regressions, the 101-module build, deterministic apply/rollback previews, and two independent READY reviews. Nothing is deployed/applied/pushed; production must follow the gated order in `SECURITY_ROLLOUT_PLAN.md`.
  - 2026-07-13 correction / Phase 1B Wave 1: Jay approved and additive aggregate migration `20260713020000` was applied to production with reviewed SHA-256 `c0e39fa60405d53267cd13c6788f636ea6ba2aa885c974be64084bdd040bce1e`. Postflight confirmed no policy or legacy-RPC grant change, anonymous denial, fail-closed unbound service access, unchanged 2/4,734/111/7,654 company/client/member/task counts, all three active MM integration types, recent processed/matched Fathom intake, and live HTTP 200. Frontend and all policy slices remain stop-gated.
  - 2026-07-13 correction / Phase 1B Wave 1B + frontend: additive churn aggregate `20260713020200` is production-applied with SHA-256 `dd51ec58d6cf071738cf259bb13b5775cd7ceb08ffdb62d41f0fe8d97e26dc40`; it changes no policy and returns aggregate buckets only. The current-main-compatible frontend is live at commit `d29fa95`, Vercel reports success, the production bundle contains the DB-resolved account and actor-scoped chart RPC paths, and automated checks pass 37/37 + 52/52 + production build. Live role smoke QA remains the only blocker before manual gate `20500`; `21000`-`23000` remain unapplied. [qa]
  - 2026-07-13 correction / Phase 1B closure: Jay completed live SuperAdmin, Director, Support, CSM, and Viewer QA, including assigned-CSM pathway changes shipped in `42c4835`. Temporary users/client and every associated milestone/history/advocacy/audit row were deleted with zero residue. Gates `20500`/`22500`, company policies `21000`, client policies `22000`, and legacy Dashboard lockdown `23000` are production-applied in order. Transactional direct-RLS QA passed company isolation, primary/secondary CSM assignment, Support/Director scope, Viewer raw-row denial, and zero-residue rollback. Final postflight shows 0 broad policies across the Phase 1B tables, actor-scoped Dashboard RPCs available only to authenticated users, legacy KPI RPCs service-role-only, 3 active MM tokens, stable app counts, and live app/login HTTP 200. Phase 1B is closed.
  - 2026-07-13 Phase 1D audit: 25 broad authenticated policy entries remain. Thirteen are `backup_*` mirror tables intentionally deferred until all remaining companies migrate within the next four weeks; no Phase 1C build is planned. Immediate Phase 1D scope is 4 app-owned policy entries plus 8 policy entries across 6 Glide sync/admin tables. Mirror-table retirement must remain a separately gated final action so current mirror-only companies keep working until cutover.
  - 2026-07-13 Phase 1D immediate candidate is locally complete and independently reviewed. It assignment-scopes attendance/checkpoint reads, restricts contract templates to SuperAdmin/Director, removes browser policies from unscoped AI/raw sync configuration tables, binds the remaining sync UI to SuperAdmin, and adds two query-shaped indexes. It changes no `backup_*` table and remains undeployed pending a separate production approval. [qa]
  - 2026-07-13 correction / Phase 1D immediate closure: Jay approved and migration `20260713024000` is applied with SHA-256 `d6663dc2f258831d586069e4729f2b48c95778a1d95b921004ad23d2639571d5`. Transaction-only role QA passed Director/Support company scope, primary/secondary CSM assignment, Viewer denial, bound-SuperAdmin sync access, and service-only raw configuration. Postflight shows 0 targeted broad policies, 13 untouched `backup_*` mirror policies, both indexes present, zero QA residue, 3 active MM tokens, healthy recent webhook processing, and live app/login HTTP 200. Jay's production UI QA passed Tables, Sync Log, MM Contract Templates, Client Detail, and Daily Pulse. Immediate Phase 1D is closed; only final mirror retirement remains after the last Glide-backed migration.
  - 2026-07-13 security source consolidation is locally complete on current `main` in branch `codex/security-source-consolidation`. It adds the already-deployed Phase 0/0.5 migrations, rollbacks, scripts, shared Edge auth/CORS helpers, current hardened function sources, Phase 1D migration/rollback, current generated production DB types, and audit/Auth docs. Beacon, the Anthropic browser dependency, and the obsolete Phase 1C draft are excluded. Static gates pass Phase 0.5 91/91, Phase 1A 37/37, Phase 1B 52/52, Phase 1D 16/16, production Phase 0 8/8, and the 102-module build. No push/deploy occurred; Auth settings and final advisor verification remain. [qa]
  - 2026-07-13 Auth hardening QA: secure password change and leaked-password protection are enabled; minimum password length is 12 with the strongest available character requirements; secure email change, 3,600-second OTP expiry, and 8-digit OTPs remain enabled/configured. Require-current-password and CAPTCHA remain disabled for the OTP-first/provider reasons documented in `SUPABASE_AUTH_SETTINGS_CHECKLIST.md`. Jay logged out and completed a fresh production OTP login successfully. Remaining rollout gates are the Auth DB connection allocation check, final advisor/exploit verification, and reviewed merge/push of the local consolidation branch. [qa]
  - 2026-07-13 correction / Auth performance closure: Auth DB allocation changed from a fixed 10 connections to 17%, preserving 10/60 current capacity while scaling automatically with compute. Jay saved it, logged out, and completed a fresh OTP login successfully. Auth settings/performance are closed; only final advisor/exploit verification and reviewed consolidation merge/push remain. [qa]
  - 2026-07-13 final automated security verification: Phase 0.5 91/91, Phase 1A 37/37, Phase 1B 52/52, Phase 1D 16/16, the 102-module production build, and fresh live Phase 0 exposure checks 8/8 all pass. The current-`origin/main` diff contains no package, Header, Beacon, Beacon-library, or old-Glide-folder changes. Supabase Security/Performance Advisor review is the last evidence gate before reviewed consolidation merge/push. [qa]
  - 2026-07-13 advisor correction / Phase 1E local candidate: Advisors show 0 Security and 0 Performance errors. Review found one real anonymous legacy retention RPC plus three mutable search paths; local-only commit `3881d91` adds reversible migration `20260713025000` to revoke anon access, role/assignment-scope retention data, pin the paths, remove 13 inert false policies, and remove two exact duplicate indexes without touching mirror read policies. Focused checks pass 15/15 plus all prior security regressions. The remaining 24 Security warnings are intentional actor-scoped authenticated helpers/RPCs; six Security info items are intentionally service-only; 40 Performance info items remain measured FK/unused-index follow-up. Production preflight/apply remains separately gated. [qa]
  - 2026-07-13 Phase 1E transaction-only production preflight passed. Using a real active unbound-email CSM identity, the wrapper forced results to that CSM's assignment and matched the service baseline; a no-membership identity was denied. Grants, three search paths, 13 inert-policy removals, two duplicate-index removals, and unchanged mirror-policy inventory all passed inside the transaction. The forced sentinel rolled back everything, and postflight confirmed production exactly restored with no rollout marker. Permanent apply remains separately gated. [qa]
  - 2026-07-13 Phase 1E production checkpoint: Jay approved and migration `20260713025000` applied with SHA-256 `882dbf97ebc8040464182fd7fbc114e3e1d03a02c12a9e4fe2006b45c5ebf855`. Live postflight passed grants, hidden core, three search paths, zero inert policies, zero duplicate indexes, 13 preserved broad mirror policies, real-CSM assignment parity, and no-membership denial. Direct anon retention now returns 401; Phase 0 8/8, 0.5 91/91, 1A 37/37, 1B 52/52, 1D 16/16, 1E 15/15, and build all pass. MM's three integration types and app/login 200 remain healthy. Short UI QA plus refreshed Advisor counts remain. [qa]
  - 2026-07-13 correction / Phase 1E closure: Jay's production UI QA passed MM Dashboard/retention drilldown, Clients history/note search, and ES Dashboard. Refreshed Advisors exactly match target: Security 0 errors / 24 intentional warnings / 6 intentional info; Performance 0 errors / 0 warnings / 40 measured info. Phase 1E is closed. Only reviewed source consolidation/merge remains for this rollout; the 13 mirror policies remain deliberately deferred until final Glide retirement.
  - 2026-07-13 consolidation release-candidate correction: the clean local branch now includes the final Phase 1E evidence and current roadmap/Auth/runbook state. Final gates pass Phase 0 live 8/8, Phase 0.5 91/91, Phase 1A 37/37, Phase 1B 52/52, Phase 1D 16/16, Phase 1E 15/15, the 102-module build, committed-scope checks, and credential-shaped-secret scanning. Beacon, package changes, secrets, and old Glide source remain excluded. The candidate is ready for a separately approved merge/push; no merge, push, or deployment has occurred. [qa]
  - 2026-07-13 correction / security rollout source closure: Jay approved the release and the seven-commit consolidation was fast-forwarded to production `main` through `e4cda12`. Vercel completed successfully; live app, login, and production asset returned 200; the deployed bundle contains DB-resolved account and actor-scoped Dashboard paths and contains neither Beacon nor Anthropic client code. The security rollout is closed except intentionally deferred Phase 1C/final mirror retirement and the separately listed medium-priority audit follow-ups.
- `[ ]` `[priority: medium]` Integration review retry parity for secondary-pathway/custom-field-only client updates.
  - Direct `webhook-update-client` processing supports these fields today. Manual/retry application from `manage-integration-review` still handles the primary update set only; close this as product parity work after the security rollout rather than expanding Phase 0.5.
- `[ ]` `[priority: medium]` Security audit follow-up: unused index cleanup.
  - Source: `SECURITY_PERFORMANCE_AUDIT.md`.
  - Do not drop indexes in the security rollout. Revisit after enough production usage stats exist across migrated companies, then remove only confirmed-unused indexes with a measured rollback plan.
  - 2026-07-13 planning correction: schedule through `PERFORMANCE_PROGRAM_RELEASABLE_PHASES.md`, not as an independent cleanup project.
- `[ ]` `[priority: medium]` Security audit follow-up: deeper frontend/query refactors.
  - Source: `SECURITY_PERFORMANCE_AUDIT.md`.
  - Useful for speed and maintainability, but not required to close the main security holes. Target column-scoped reads, fewer wide `select("*")` calls, and repository-style data access after the security rollout is stable.
  - 2026-07-13 planning correction: schedule through `PERFORMANCE_PROGRAM_RELEASABLE_PHASES.md`, beginning with measured Dashboard/Clients hot paths.
- `[ ]` `[priority: medium]` Security audit follow-up: split monster page components.
  - Source: `SECURITY_PERFORMANCE_AUDIT.md`.
  - Large blast radius; keep out of the security fork. Later scope should break up `ClientDetail`, `Clients`, `SaasClientDetail`, and `Dashboard` into tab/feature components and hooks.
  - 2026-07-13 planning correction: schedule incrementally through `PERFORMANCE_PROGRAM_RELEASABLE_PHASES.md`, never as a single rewrite.
- `[ ]` `[priority: medium]` Performance program - independently releasable phases.
  - Source of truth: `PERFORMANCE_PROGRAM_RELEASABLE_PHASES.md`.
  - Four releases: baseline/route splitting; Dashboard/Clients data paths; Client Detail/Tasks/Daily Pulse data paths; measured index and component maintenance.
  - Start after the secure Beacon rebuild or during a clear window between customer tickets and migration-critical work. Re-measure and QA each phase before starting the next.
- `[~]` `[mixed]` Start write mode through controlled Edge Functions for first flows, then add direct RLS-backed writes only after policies are proven.
- `[x]` Use Ethical Scaling as the first internal controlled pilot company.
  - Pilot schema/backfill/QA artifacts:
    - `supabase/migrations/20260529120000_write_mode_pilot_foundation.sql`
    - `scripts/seed-ethical-scaling-pilot.mjs`
    - `scripts/qa-ethical-scaling-pilot.mjs`
    - `QA_WRITE_MODE_PILOT.md`
  - 2026-06-17 closed: Jay confirmed the role-based end-to-end pilot has been used with Ben and Emily and works as expected.
- `[~]` `[downstream]` `[priority: high]` Remove Ethical Scaling-only assumptions before broader rollout.
  - Move successful pilot companies from `migration_status = 'pilot'` to `migration_status = 'migrated'`.
  - Keep non-migrated companies at `migration_status = 'mirror_only'`.
  - Generalize pilot scripts to accept a company identifier.
  - 2026-06-07: generic reconciliation command supports company name, app company id, and legacy Glide company id.
  - 2026-06-17 audit pass: app UI copy no longer presents migrated/write-mode surfaces as Ethical Scaling/pilot-only; generic reconcile/backfill scripts now require an explicit company selector instead of defaulting to Ethical Scaling. Remaining Ethical Scaling references are intentional historical docs, package aliases, and ES-specific seed/QA scripts.
  - Remaining downstream closure: decide when to promote the completed Ethical Scaling pilot company from `migration_status = 'pilot'` to `migration_status = 'migrated'`; run the explicit-selector migration/reconcile commands during Moves Method cutover prep.
- `[ ]` `[priority: medium]` Convert SaaS Client/company management from disabled UI to controlled writes.
- `[ ]` `[priority: medium]` CRUD SaaS Clients.
- `[ ]` `[priority: medium]` SaaS Clients list filters: active, paused, archived.
- `[x]` Ethical Scaling pilot CRUD company team members.
  - Pilot create/update/archive uses `supabase/functions/manage-company-member`.
  - Archived members are visible through the Team tab Active/Archived toggle.
  - 2026-06-20 local invite pass: create now provisions/sends a RetainOS login email, active members have a Send invite action, and Team tab success/error banners report invite delivery. `manage-company-member` deploy is still pending because Supabase CLI deploy hung twice in this shell.
  - Broader rollout still needs generalized company migration and final authorization hardening.
  - Non-pilot companies remain read-only from the Glide mirror.
- `[x]` Company customization V1.
  - App-owned outcome definitions and churn reasons are live for pilot/migrated companies.
  - Company Custom Fields V1 has an app-owned definition table seeded from `customfield1..customfield7` labels where present, plus Admin Hub / SaaS Company Detail list/create/edit/archive wiring for pilot/migrated companies.
  - Custom Fields V1 now supports both setup and operational usage: enabled fields appear in Quick Update and Client Detail > Outcomes for pilot/migrated clients.
  - Admin Hub / SaaS Company Detail > Customization can edit pilot/migrated company definitions; mirror-only companies remain read-only.
  - Client Outcomes dropdowns prefer app-owned company definitions for pilot/migrated companies.
  - 2026-06-12 hardening clarified that custom fields are company-level recurring update fields consumed by Quick Update and Client Detail > Outcomes, not a Client Details profile-only setup.
  - 2026-06-15 Jay QA passed the grouped Customization sections, Quick Update custom field usage, and Client Detail > Outcomes custom field usage after admin header/button polish.
  - 2026-06-20 resource/webhook audit: New Client Webhook now accepts modern `custom_fields` object/array payloads and legacy `customfield1..customfield7` slots, validates them against active company custom fields, and writes `client_custom_field_values` on client creation. `zapier-create-client` redeployed.
- `[ ]` `[priority: medium]` Company customization V2.
  - Optional custom field display on client list/import/export.
  - Richer client/account management settings and client list column presets.
  - Advanced field-type UX polish after migration-critical workflows settle.
- `[x]` Company Pathways & Milestones setup.
  - App-owned `company_offers` and `company_offer_milestones` tables seed pilot/migrated companies from Glide once.
  - Admin Hub / SaaS Company Detail lists offers and their ordered milestones.
  - Directors and SuperAdmins can create, edit, and archive offers/milestones for pilot companies.
  - Offers/milestones assigned to active clients cannot be archived until those clients move elsewhere.
  - Reorder controls, active-client usage counts, archive blockers, and restore/unarchive are live for pilot companies.
  - Mirror-only companies retain a read-only Glide fallback.
  - 2026-06-16 refreshed `PATHWAYS_MILESTONES_POLISH_PLAN.md`; the recommended next lightweight slice is Client Detail completion clarity plus real-migration QA before secondary offers.
  - 2026-06-16 implementation follow-up: user-facing copy now uses Pathway, restoring an archived pathway restores its milestones, Client Detail completion can optionally start the next/another milestone immediately, and milestone action responses include selected/next/final/duration metadata.
  - 2026-06-16 Jay QA follow-up: Admin archive failures now surface affected-client details instead of the generic Edge Function non-2xx wrapper; Quick Update pathway completion now mirrors the Client Detail flow with next/another milestone start controls; empty Contract / Program Timing cards are hidden when timing is unavailable.
  - 2026-06-16 final QA follow-up: archive affected-client sampling now uses app-owned `client_business`, non-Error Supabase throws surface their message, and Quick Update defaults `Milestone To Start` to the next milestone in line.
  - Complete for V1/polish. Drag/drop reorder, hard-delete cleanup, and contract-page cleanup are separate later scopes.
  - 2026-06-20 secondary pathway support is live for app-owned pilot/migrated clients: company setting gate, client secondary offer/milestone fields, Client Detail Pathways summary, modal set/clear flow, and history/audit events. Awaiting Jay QA before treating the resource as publish-ready.
  - 2026-06-20 resource audit confirmed this covers the old "Customize Milestones and Offers" Glide workflow; `customize-milestones-offers` draft now documents the RetainOS Pathways & Milestones flow, archive/restore guardrails, and up/down reorder controls.
  - 2026-07-03 MM archive cleanup fix: archive blockers and usage counts now define active clients as Front End / Back End only and include secondary pathway/milestone usage, so unused MM pathways can be archived safely while secondary-attached pathways remain protected.
- `[ ]` `[priority: high]` Pathway milestone fallback ordering for missing/tied positions.
  - 2026-07-08 Moves Method QA found legacy combined pathways could have all milestone positions tied at `0`, making Client Detail fallback to arbitrary row order when a client has no explicit current milestone. Add a small frontend fallback so milestone sorting uses configured position first, then target days, then name/id for deterministic order.
- `[x]` Deploy final Pathways & Milestones closure fixes.
  - 2026-06-17 build passed and `manage-company-pathway` / `manage-client-milestone` were deployed to Supabase project `zjauqflzxzsbpnivzsct`.
  - Safe Pathways/docs work was prepared for commit/push; Beacon local pilot files stayed out of scope.
  - Keep Beacon local pilot out of this commit/deploy.
- `[x]` Company settings V1.
  - Client workspace defaults now save and apply profile upkeep freshness days, default client view, and default calendar mode for pilot/migrated companies.
  - Clients roster uses the default list/card/calendar view when there is no stronger cached user preference.
  - Clients calendar uses the default month/week/day mode when there is no stronger cached user preference.
  - CSM Reports Field Upkeep uses the company freshness window while report rows/update rate keep using the selected report date range.
  - Feature settings now save secondary assignee, secondary pathway, Call AI for CSMs, embed, and Zapier client-create flags.
  - Notification preferences now save company-level Daily Pulse/bell visibility plus onboarding checkpoint/check-in and strategic review timing.
  - V1 QA passed on 2026-06-08 after fixing stale roster cache behavior.
  - 2026-06-12 hardening split settings copy into workspace defaults, feature flags, Daily Pulse/bell visibility, timing rules, and integration review queue.
  - 2026-06-13 polish clarified what each settings section controls, renamed generic flags to feature gates, renamed Zapier client-create to client creation webhook, and moved the integration review queue into a quieter operations drawer that opens when events need review.
- `[ ]` `[priority: medium]` Company settings V2.
  - Dashboard/client-list preference consumption beyond current defaults.
  - Client list column presets.
  - Call/communication settings after integrations are closer to rollout.
- `[ ]` `[priority: medium]` SaaS Client archive/offboard flow.
- `[ ]` `[priority: medium]` Zapier SaaS company automation, if this remains needed.

### Phase 2: Client Lifecycle MVP

Goal: one company can manage real clients in RetainOS without relying on Glide for day-to-day fulfillment tracking.

- `[x]` Run first client lifecycle write tests against the Ethical Scaling pilot company.
  - First pilot write is Quick Update history via `client_history_events`.
- `[x]` App-owned clients current-state table and Ethical Scaling backfill.
  - `clients` now holds 154 Ethical Scaling pilot rows backfilled from `backup_company_clients`.
  - Clients list/detail prefer app-owned `clients` for pilot/migrated companies and fall back to the Glide mirror elsewhere.
  - 2026-06-17 closed for Ethical Scaling. Company-by-company backfill/reconciliation remains tracked under rollout and migration-readiness items.
- `[~]` `[polish]` `[priority: medium]` CRUD Clients.
  - New Client v1 is enabled for app-owned pilot/migrated companies through `manage-client-create`.
  - SuperAdmin/Director/Support can create company clients.
  - CSMs can create clients, but the server assigns the created client to that CSM.
  - 2026-06-20 resource audit upgrade: New Client now captures profile image URL, next steps, Director Notes for Director/SuperAdmin, and richer initial contract details: monthly value, contract link, and contract notes. `manage-client-create` was redeployed.
  - 2026-06-20 image upload follow-up: New Client and Edit Profile now support client image upload through `upload-client-image`, while keeping pasted image URLs as a fallback.
  - Client Status Lifecycle v1 is enabled through `manage-client-status`.
  - Status changes use existing program statuses: Front End, Back End, Paused, Suspended, Offboarded.
  - Paused/Suspended/Offboarded require a typed reason; Paused requires a return date and extends app-owned contract dates.
  - Remaining CRUD gaps: richer field coverage, archive/delete beyond lifecycle statuses, and bulk import.
- `[~]` `[polish]` Clients list/card views and filters exist; Ethical Scaling now reads app-owned client rows.
  - 2026-06-20 Filtering Clients overview audit added strategic roster filters for milestone, renewal window, last-contact age, next-contact window, Success, Progress, and Buy-In. List/card/calendar views now share the same applied filter set for app-owned and mirrored clients.
  - 2026-06-20 Contact cadence follow-up added Last Contact and Next Contact sort options to List/Card views, using the same app-owned and mirrored contact date columns as the roster display.
  - 2026-06-20 CSM assignment audit added `Unassigned` to the Clients CSM filter so Admin/Director/Support users can find clients that still need a primary CSM.
- `[x]` Clients calendar view and filters.
- `[~]` `[polish]` `[priority: medium]` Client detail general information write flow.
  - Ethical Scaling pilot has profile edit v1 through `manage-client-profile`.
  - SuperAdmin/Director/Support can edit company clients; CSM can edit assigned clients only; Viewer is read-only.
  - Fields: client name, business name, email, archetype, North Star, General Information, and Director Notes for SuperAdmin/Director only.
  - 2026-06-20 multiple-email support added Email 2 / Email 3, app-owned `client_email_secondary` / `client_email_tertiary`, and integration matching across all three client emails.
  - 2026-06-21 Archetype is now a company-gated roster signal: app-owned companies can enable Client archetypes in settings, Clients List/Card views display the saved profile archetype when enabled, and app/import writes normalize legacy values to the dropdown labels Doer, Controller, Worrier, and Follower.
  - 2026-06-21 General Information added as app-owned `client_general_info`, editable from Client Detail > Edit Profile and mapped from legacy CST `client_general_info` during migration/backfill. Resource refreshed as `Using General Information on a client profile`.
- `[x]` CRUD client contracts V1.
  - New Contract v1 is enabled for app-owned pilot/migrated clients through `manage-client-contract`.
  - Creates/edits/archives/deletes app-owned `client_contracts`, updates the app-owned client current contract summary, and writes history/audit events.
  - 2026-06-15 local closeout adds Contract tab filters for Active, Old, Archived, and All; keeps the current contract summary visually separate from linked contract history.
  - 2026-07-04 Moves Method launch QA update: Director, Support, and assigned CSMs can manage contract rows for accessible clients; client current-contract summary sync now ignores archived/expired old rows.
  - Contract renewal prompt v1 is live for active clients whose contract ends within 30 days.
  - New Contract can record a same-program renewal or Front End to Back End upsell through `client_retention_recorded` history.
  - Renewal/upsell can optionally mark Success on the client outcome.
  - QA: Jay validated this flow on Shaan Kassam on 2026-06-04.
  - 2026-06-08: reusable reconciliation now includes `contractConfidence` and `renewalConfidence` sections for company-by-company migration trust.
  - 2026-06-10: reconciliation now reports active-client contract coverage, renewal date source/confidence, latest mirrored-contract summary mismatches, active clients missing app-owned contract history, active clients missing all contract history, and active clients missing current renewal dates.
  - 2026-06-15 Jay QA passed create/edit/archive/delete, contract filters, and duration/date calculation polish.
  - 2026-06-17 Ali sanity pass found no Glide contract leakage. `manage-client-contract` now writes calculated end/filtering dates into the client summary when a contract uses start date + expected duration days; four Ethical Scaling pilot summaries were repaired, including Ali Back End.
- `[ ]` `[priority: medium]` Contract/Renewal V2.
  - 2026-06-17 Ali's remaining confusing Contract tab state is duplicate app-owned QA-created contract rows, not a source-of-truth/backfill failure.
  - Optional cleanup: use the SuperAdmin delete action for duplicate QA/test contracts when Jay wants demo data tidied.
  - When a manually created or webhook-created client is missing contract info, remind/ensure the contract is added.
  - Richer multi-contract/LTV reporting.
  - High-fidelity renewal UX.
  - Automated renewal notifications.
  - Historical contract backfill per company only after dry-run review.
- `[~]` `[mixed]` `[priority: medium]` CRUD client program.
  - Status/program lifecycle v1 supports Front End, Back End, Paused, Suspended, and Offboarded for app-owned pilot/migrated clients.
  - Remaining gaps: program setup/configuration, status notifications, and deeper dashboard/reporting validation.
- `[~]` `[polish]` `[priority: medium]` CRUD client outcomes.
  - Client Detail > Outcomes has Edit Outcomes v1 for app-owned pilot/migrated clients.
  - Success, Progress, and Buy-in use the same mirrored `backup_choices` dropdown values as Quick Update.
  - `manage-client-outcomes` writes app-owned `clients`, `client_history_events`, and `app_audit_events`; Glide mirror rows remain read-only.
  - Migration `20260605100000_client_outcomes_write_pilot.sql` was applied on 2026-06-05.
  - `manage-client-outcomes` was deployed to RetainOS project `zjauqflzxzsbpnivzsct` on 2026-06-06 and has passed the core outcome-update QA path.
  - 2026-06-06 QA found and removed a stale mirrored Progress option, `offtrack`. Supported values are now Success `yes/no` and Progress/Buy-in `green/yellow/red`.
  - Outcomes error handling now displays the real Edge Function response instead of only the generic non-2xx message.
  - QA passed on 2026-06-06: Jay updated Ali Abdaal's Success, Progress, Buy-in, and notes; the values saved and appeared correctly in Client History.
  - Later polish: display friendly outcome labels/colors in History instead of raw lowercase stored values.
  - Remaining gaps: testimonial/review/referral write fields, company-owned outcome definitions, and high-fidelity Outcomes UX.
- `[~]` `[polish]` `[priority: high]` CRUD client pathways and milestones.
  - Pathways & Milestones v1 is enabled through `manage-client-milestone`.
  - App-owned `client_milestones` tracks milestone start date, completion date, duration, and time-to-hit for pilot/migrated clients.
  - SuperAdmin/Director can change the client's current offer/pathway and milestone.
  - Assigned CSMs can start and complete milestones for assigned clients only.
  - Completing a milestone advances to the next configured milestone in the current offer.
  - Client detail timeline is filtered to the active/current offer so unrelated company pathway milestones are not shown.
  - Current offer and current milestone resolve by name, including auto-advanced milestones.
  - Company-level offer/milestone CRUD, ordering controls, archive blockers, and restore/unarchive are live for pilot companies.
  - Remaining gaps: drag/drop reorder polish, final low-fi-aligned UX, and deeper reporting/backfill validation.
- `[ ]` `[priority: low]` CRUD client tasks.
- `[~]` `[polish]` Quick Update write flow.
  - Ethical Scaling pilot writes app-owned history and app-owned client current state; Glide mirror fields remain unchanged.
  - Quick Update intentionally keeps North Star, Next Steps, last contact, and next contact as read-only context. North Star editing belongs in full client profile editing.
  - Success, Progress, and Buy In use dropdowns from mirrored `backup_choices` for the pilot UI.
- `[~]` `[polish]` `[priority: medium]` Bulk upload clients through CSV.
  - 2026-06-10 local safety-net pass: Clients page has CSV template download, filtered export, and preview-before-import for app-owned pilot/migrated companies only.
  - Import uses existing `manage-client-create` row-by-row after explicit confirmation; mirror-only companies remain export-only.
  - Current write coverage follows New Client v1 fields; phone, contract monthly value/notes, next steps, director notes, freeform notes, and custom fields are preview/export only until a broader create/import server path is approved.
  - Jay QAed the skeleton and preview/import flow as a strong starting point. Keep as a migration safety net, but prioritize other high-impact migration features first.
  - QA checklist and template columns: `CSV_BULK_IMPORT_EXPORT.md`.
- `[x]` Zapier client creation webhook with required server-validated `company_id`.
  - 2026-06-07: `zapier-create-client` Edge Function deployed with JWT verification disabled and protected by `ZAPIER_CLIENT_WEBHOOK_SECRET`.
  - It accepts app-owned company UUID or legacy Glide company id, creates app-owned clients, optional initial contract, history, and audit events.
  - 2026-06-13 local token hardening: `zapier-create-client` now supports company-scoped `company_integration_secrets` with `integration_type = client_create`, while preserving the global secret as a fallback only for companies with no active company token rows.
  - 2026-06-13 resource wiring: the New Client Webhook RetainOS Help guide now shows the company ID plus active token status/prefix and instructs `Authorization: Bearer YOUR_COMPANY_INTEGRATION_TOKEN`.
  - 2026-06-13 deploy: `zapier-create-client` was redeployed successfully to Supabase project `zjauqflzxzsbpnivzsct` with company-scoped `client_create` token support.
  - 2026-06-13 Zapier POST compatibility fix: endpoint now accepts JSON, form-encoded bodies, query params, and Zapier-style nested payloads; missing client-name errors return received body keys for faster QA.
  - 2026-06-13 Zapier QA found the most reliable setup is `company_id` in the endpoint URL query string and client-specific values in the body. RetainOS Help now treats that as the canonical Zapier setup while keeping body/query parsing support for n8n/custom callers.
  - 2026-06-13 closeout QA: direct live endpoint test passed for query-param `company_id` + bearer company token. Verified client creation, optional contract, client-created history, audit event, idempotent duplicate response, missing-client-name 400, invalid-token 401, and token `last_used_at` update. Temporary QA rows were cleaned up.
  - 2026-06-17 closeout QA: disposable company-scoped `client_create` token created a temporary client through canonical `company_id` query-param setup, duplicate external id returned idempotent duplicate response, wrong integration token type returned 401, revoked token returned 401, `last_used_at` updated, and all temporary QA rows were cleaned up.
  - 2026-07-02 Moves readiness patch: endpoint now accepts canonical `pathway_id`, optional `secondary_pathway_id` / `secondary_milestone_id`, and legacy `offer_id` / `secondary_offer_id` aliases for creation-time pathway assignment.
- `[x]` Call summary webhook updates client next steps and last contact.
  - 2026-06-11: `integration_intake_events` table and `ingest-client-call-summary` Edge Function were added/deployed.
  - This is separate from full Call AI: it receives a provider summary, exact client email, company ID, call timestamp, and optional recording URL.
  - It updates app-owned client `next_steps_value` and `csm_date_of_last_contact`, writes `call_summary_webhook` history, and stores intake/match status for audit/idempotency.
  - 2026-06-11 QA fix: `ingest-client-call-summary` must run with Supabase JWT verification disabled because Zapier sends the webhook secret in the Authorization header.
  - 2026-06-11 local polish: Admin Hub > Company Settings now surfaces an Integration Review Queue for app-owned companies, showing unmatched/ambiguous/failed webhook events with provider, match status, client email, summary preview, and recording link when available.
  - 2026-06-11 QA note: the queue successfully catches unmatched events, but still needs manual match/resolve actions. Long-term placement is likely Call AI / integration operations or a task-style inbox, not permanent Company Settings.
  - 2026-06-12 hardening: added app-owned `company_integration_secrets` and updated `ingest-client-call-summary` to validate the submitted token against the submitted company before processing. Active company tokens override the old global secret; the global env secret remains only as a local/dev fallback for companies with no active token rows.
  - 2026-06-12 local queue v1: added `manage-integration-review` plus UI actions to Match to client, Retry apply, and Ignore open intake events. Supports `call_summary_next_steps` and `client_update` events for app-owned companies; ignored events are auditable via `integration_intake_events.status = ignored`.
  - 2026-06-13 local/admin plumbing: added SuperAdmin-only Integration Tokens UI and `manage-integration-token` Edge Function for list/create/revoke/revoke-all. This gives RetainOS a per-company offboarding control for inbound integrations.
  - 2026-06-13 deploy: `manage-integration-token` and `manage-integration-review` were deployed to Supabase.
  - 2026-06-13 resource wiring: RetainOS Help pages now surface the company ID plus active token status/prefix for Call Summary / Next Steps, Client Update, New Client Webhook, Call Transcript, and Course Completion.
  - 2026-06-13 closeout QA: direct live endpoint test passed for app-owned client matching by exact email with a company-scoped `call_summary_next_steps` token. Verified next steps update, last-contact update from call timestamp, `call_summary_webhook` history, processed intake row, audit event, idempotent duplicate response, unmatched-email review queue, missing-summary 400, invalid-token 401, and token `last_used_at` update. Temporary QA rows were cleaned up.
  - 2026-06-17 closeout QA: disposable company-scoped `call_summary_next_steps` token accepted an unmatched payload into the review queue, rejected a wrong integration token type with 401, rejected the revoked token with 401, updated `last_used_at`, and cleaned up temporary intake/token rows.
  - 2026-06-20 old Loom audit hardening: `ingest-client-call-summary` now accepts `client_email` or provider attendee/invitee email lists and only auto-applies when exactly one active app-owned client matches; deployed to `zjauqflzxzsbpnivzsct`.
  - Before giving this to Moves Method or any customer: create one active company token per target company/integration, and document that revoking tokens stops RetainOS writes/processing but the customer-side Zap still needs to be turned off to avoid Zapier task spend.
- `[x]` Client update webhook V1.
  - 2026-06-12 local implementation: `webhook-update-client` accepts app-owned company UUID or legacy company id plus exact `client_email`, or explicit app-owned `client_id` when it belongs to the submitted company and optional email also matches.
  - Supported V1 fields are intentionally narrow: next steps, notes as history context, last contact, next contact, active offer id, active assigned CSM/member, and active company custom fields.
  - Status/program updates are rejected in V1 so lifecycle side effects stay inside `manage-client-status`.
  - Auth uses company-scoped `company_integration_secrets` for `integration_type = client_update`; global env fallback is only for environments with no active company token rows.
  - Successful requests write app-owned `clients`, `client_custom_field_values`, `client_history_events`, `app_audit_events`, and processed intake rows. They do not mutate `backup_*`.
  - Unmatched or ambiguous requests are stored as `integration_intake_events.status = needs_review` and do not update clients.
  - 2026-06-12 local queue v1 can retry automatic application or manually match these events to one active client.
  - 2026-06-13 token-management UI supports creating/revoking the company tokens used by this endpoint.
  - 2026-06-13 closeout QA: direct live endpoint test passed with a disposable app-owned client and company-scoped `client_update` token. Verified next steps, last contact, next contact, history, audit, processed intake, idempotent duplicate response, unmatched-email review queue, invalid-token 401, status/program-update 400, and token `last_used_at` update. Temporary QA rows were cleaned up.
  - 2026-06-17 closeout QA: disposable company-scoped `client_update` token accepted an unmatched payload into the review queue, revoked token returned 401 after deploy fix, `last_used_at` updated, and temporary intake/token rows were cleaned up.
  - 2026-07-02 Moves readiness patch: endpoint now accepts canonical `pathway_id`, optional `secondary_pathway_id` / `secondary_milestone_id`, and legacy `offer_id` / `secondary_offer_id` aliases for conditional post-create pathway assignment.
- `[~]` `[polish]` `[priority: medium]` Profile upkeep scoring.
  - CSM Reports v1 exists for active clients with six-field freshness.
  - Dashboard duplicate was removed so Dashboard stays focused on KPI/chart reporting and CSM Reports owns field-upkeep compliance.
- `[~]` `[polish]` Client history/change log.
  - Client Detail now has a pilot `History` tab for RetainOS Quick Update events.

### Phase 3: Operations, QC Reporting, And Migration Readiness

Goal: Directors, CSMs, and Support can run the operating cadence: client follow-up, CSM compliance, dashboard validation, and migration-critical reporting.

Next session lock:

- `[x]` Dashboard performance pass after canonical KPI/drill-through wiring.
  - Dashboard Overview no longer loads hidden chart/upkeep/task datasets on first page load.
  - Dashboard Profile Upkeep duplicate was removed; CSM Reports remains the source for field-upkeep compliance.
  - Charts now lazy-load their heavier client/task/offer/capacity dataset when the Charts tab is opened.
  - Keep canonical KPI RPC as the source for card counts.
  - 2026-06-09 Moves Method demo optimization: mirror-only default Dashboard views use the lighter split KPI path unless offer/multi-program/app-owned filters require canonical calculations. This is a walkthrough-safe speed fix, not the final migration-grade reporting architecture.
  - Final migration-grade fix: move large-company dashboard counts, retention/renewal calculations, drill-throughs, and chart breakdowns into optimized canonical Supabase reporting RPCs/views with appropriate indexes or summaries before broad customer migration.
- `[ ]` `[priority: medium]` Post-migration frontend bundle/code-splitting pass.
  - Current Vite build warns that the main JS chunk is larger than the default 500 kB threshold.
  - After migration-critical work stabilizes, split heavier pages/features with route-level lazy loading so first load stays fast as RetainOS grows.
- `[x]` Ethical Scaling reconciliation pass before pilot rollout.
  - Command: `npm run pilot:reconcile:ethical-scaling`.
  - 2026-06-06 result: `rolloutGate.readyForPilot = true`, with no blockers.
  - Confirmed 154 mirrored clients and 154 app-owned clients, with no missing/extra client rows.
  - 2026-06-07 post-Supabase Micro recovery result: `rolloutGate.readyForPilot = true`, with no blockers.
  - After the final backup sync, five mirrored front-end clients were missing from app-owned `clients`; they were inserted with the safe missing-only seed path so existing pilot edits were not overwritten.
  - Confirmed 159 mirrored clients and 159 app-owned clients, with no missing/extra client rows.
  - Confirmed zero invalid active CSM assignments.
  - Confirmed active clients have app-owned offer and milestone configuration available.
  - Non-blocking notes: invalid assignments exist only on offboarded clients; archived pilot/test offer and milestone rows exist app-side; historical mirrored contracts and client milestones are not fully app-backfilled yet.
  - 2026-06-07: historical activity backfill dry-run script added. Ethical Scaling dry-run found 1 contract and 34 client milestone rows ready to backfill for active/pilot-relevant clients, with 0 unresolved milestone offer mappings. Applying remains an explicit review gate.
  - 2026-06-08: `scripts/reconcile-company-pilot.mjs` now supports `--renewal-start` / `--renewal-end` and reports contract/renewal confidence. Live Ethical Scaling run for 2026-06-08 to 2026-07-08 returned `rolloutGate.readyForPilot = true`; it identified missing historical mirrored contract/client milestone backfill as non-blocking notes, not pilot blockers.
  - 2026-06-17 product decision: no long parallel-write window. Jay owns a high-touch final sync/cutover, then the customer stops using Glide.
- `[x]` Moves Method migration-readiness pass.
  - Dedicated checklist: `MOVES_METHOD_MIGRATION_READINESS.md`.
  - 2026-07-04 cutover: Moves Method was promoted to app-owned write-mode with `migration_status = 'migrated'` after Jay approved migration QA. CST mirror/history remains read-only reference only.
  - Migration rule: build and validate the migration runway now; do not trigger the paid Glide/CST sync or app-owned migration until Jay explicitly calls final cutover day.
  - Read-only snapshot command: `npm run migration:readiness:moves`.
  - Validate roster counts, CSM assignments, offer/milestone coverage, contract/renewal confidence, dashboard load speed, CSM Reports caveats, Daily Pulse, Resources, and Client Detail.
  - 2026-06-10 local implementation adds Moves-facing foundations: Daily Pulse diagnostic/strategic-review signals, compact client journey visual, Resources library split, Call workflow setup guides, and client-level external links.
  - 2026-06-11 refinement:
    - Mirror-backed Clients count now requests exact filtered counts instead of planned estimates for walkthrough trust.
    - Daily Pulse diagnostic/strategic-review signals are now company-configurable in Admin Hub, with product language generalized to onboarding checkpoints/check-ins and strategic reviews.
    - Peak Diagnostic supports one-time checkpoint mode or recurring cadence mode through notification preference metadata.
    - Client journey visual now includes a program timeline with 3-month, 6-month, 12-month, and 2-year presets plus kickoff/review/Peak Diagnostic/Strategic Review/program-end markers.
    - 2026-06-11 local polish: Client Detail timeline now reads company-configured checkpoint/check-in timing and Strategic Review timing from notification preferences instead of hardcoded Moves-only values.
    - 2026-06-11 QA polish: timeline labels are edge-aware, and unconfigured hardcoded 30-day review markers were removed to avoid implying workflows that were not configured.
    - Client Links language is generalized to audits, Drive folders, and supporting docs.
  - 2026-06-14 readiness snapshot:
    - Current CST mirror data only; no Glide sync was triggered.
    - 4,143 mirrored clients; 2,338 active clients.
    - Status mix: 2,004 front-end, 334 back-end, 106 paused, 96 suspended, 1,603 off-boarded.
    - Offer/milestone coverage is present for active clients: 16 offers, 33 offer milestones, 0 active clients missing offer config, 0 active clients missing milestone config.
    - Renewal confidence is present at the client-level mirror field for all 2,338 active clients.
    - Final-sync assignment QA needed before migration confidence: the stale mirror snapshot found 9 active clients with invalid CSM assignments and 6 active clients unassigned. Recheck only after Jay triggers the fresh paid CST sync on migration day.
    - Contract history caveat: only 177 mirrored contract history rows exist, so full historical contract backfill rules still need to be finalized before write-mode migration.
  - Migration path is documented in `MOVES_METHOD_MIGRATION_READINESS.md`: mirror walkthrough, readiness build, dry readiness snapshot, final paid sync day, app-owned backfill, cutover QA, source-of-truth flip.
  - 2026-06-14 Jay read-only/product QA marked complete in `MOVES_METHOD_MIGRATION_READINESS.md`; stale assignment anomalies are final-sync QA items, not current product blockers.
  - 2026-06-14 doc cleanup: Daily Pulse validation, resources structure, Ben handoff, and Journey Visual QA are complete. Moves-specific resource content is customer-owned and not a RetainOS blocker. Final rollout checklist is now the reusable company checklist below.
  - 2026-06-14 Journey Visual QA completed after Moves examples across complete, partial, missing, and offboarded journey states. Timeline dots now share one rail, planned checkpoints sit above the line, the current marker sits below, and close checkpoint labels are staggered.
- `[x]` Official Company Rollout Checklist template.
  - Reusable migration playbook now lives in `OFFICIAL_COMPANY_ROLLOUT_CHECKLIST.md`.
  - Use it anytime Jay calls a new RetainOS company migration.
  - Do not run it early just because a stale mirror snapshot exists.
  - Covers company kickoff, final paid CST/Glide sync, CST/Glide freeze, app-owned backfill/cutover, QA matrix, rollout handoff, and hold/rollback criteria.
  - 2026-06-15 Jay spreadsheet draft reviewed: structure maps well to the official checklist. Contract backfill/coverage is now a mandatory rollout gate for every company, including Moves Method.
  - 2026-06-15 Jay is converting the playbook into the reusable migration spreadsheet; the source playbook is approved as the canonical checklist template.
  - 2026-06-17 packet pass added Migration Day Command Center, no-parallel-run operating rule, client-facing signoff handoff, and internal emergency support plan.
- `[x]` Client-facing migration QA checklist.
  - Created `CLIENT_FACING_MIGRATION_QA_CHECKLIST.md` as the shorter customer-facing QA list for migration/cutover signoff.
  - Keep internal migration checks in `OFFICIAL_COMPANY_ROLLOUT_CHECKLIST.md`; the client-facing version should focus on simple end-user validation such as login, roster spot checks, CSM assignment visibility, client profile details, core updates, contracts, Daily Pulse, and support handoff.
  - 2026-06-17 Jay converted it into a spreadsheet template and approved it as v1 for Moves Method testing.
- `[x]` Ethical Scaling mirror dependency reduction / app-owned backfill slice.
  - Keep mirror fallback for non-pilot companies.
  - For Ethical Scaling pilot users, prefer app-owned tables wherever the app-owned equivalent exists.
  - Track any remaining backup-table reads that are still required only because the app-owned table is not built yet.
  - 2026-06-07 checkpoint:
    - Login provisioning and browser account resolution now prefer app-owned `company_members`.
    - CSM/team dropdowns on Clients, CSM Reports, Dashboard, and Tasks now prefer app-owned `company_members` for pilot/migrated companies.
    - `prepare-login` was deployed and smoke-tested with Emily's pilot email.
    - Remaining likely mirror dependencies: company list/search shell, mirrored choices/status definitions, historical contracts, historical milestone rows, legacy tasks, and legacy dashboard history/contract calculations where app-owned equivalents are incomplete.
  - 2026-06-10 checkpoint:
    - Pilot/migrated task reads now prefer `client_tasks` on `/tasks`, Client Detail > Tasks, Clients calendar task events, and Dashboard task-status charts.
    - Mirror-only companies continue to use `backup_company_clients_tasks` for CST preview/read-only behavior.
    - Remaining likely mirror dependencies: mirrored choices/status definitions, historical contracts, historical milestone rows, legacy history, and dashboard retention/renewal confidence paths until app-owned models/backfills are approved.
  - 2026-06-15 checkpoint:
    - Ethical Scaling contract backfill is clean: 7 current-summary contracts were imported and follow-up dry-run reports 0 pending.
    - Ethical Scaling historical client milestone backfill is clean: 32 rows were imported and follow-up dry-run reports 0 pending.
    - Backfill script now skips/reports 2 duplicate active client/milestone rows instead of failing on the active-row unique index.
    - Client Detail now skips mirrored CST contract/milestone history for app-owned/pilot companies; mirror-only companies keep CST fallback.
    - Jay QA passed spot checks for Siwash, Stephen, and Devon Canup; Dashboard and CSM Reports loaded correctly after the backfill slice.
    - V1 closeout: Ethical Scaling no longer relies on CST mirror for app-owned contract/milestone detail/history where app-owned equivalents exist. Residual mirror/report formula audits are now per-company rollout tasks, not part of this closed Ethical Scaling slice.
- `[ ]` `[priority: medium]` Per-company residual mirror audit after migration cutover.
  - Audit mirrored choices/status definitions, legacy history/reporting references, dashboard/report formulas, and any remaining backup-table reads against the newly migrated company.
  - Use this as part of the official rollout checklist instead of reopening the Ethical Scaling backfill slice.

- `[~]` `[polish]` Task manager board/list exists and now includes New Task v1 for app-owned pilot/migrated companies.
- `[~]` `[polish]` `[priority: low]` CRUD Tasks.
  - New Task v1 creates app-owned `client_tasks` through `manage-client-task`.
  - 2026-06-18 Tasks V1.5 pass adds app-owned task edit, status updates, complete/reopen, dismiss/archive, task detail modal, and native drag/drop board columns. SQL migration for `task_updated` history events was applied and Jay deployed `manage-client-task`.
  - Jay QA passed company-level creation, client-linked creation, client link navigation, edit, and drag/drop including `In Progress` after the follow-up `in-progress`/`in_progress` normalization fix.
  - 2026-06-18 Task Templates + Urgency V1 added `company_task_templates`, Company Settings template modal, manual New Task template picker, new-client auto-create hooks in `manage-client-create` and `zapier-create-client`, due today/due soon/overdue board signals, and Daily Pulse `task_due` section. SQL migration applied; `manage-company-customization`, `manage-client-create`, and `zapier-create-client` deployed. Awaiting Jay QA.
  - 2026-06-20 QA follow-up deployed `manage-client-create` and `zapier-create-client` again so auto-created task names render `{client_name}` / `{client}` or append the client name by default. Tasks list view now groups by status and supports drag/drop like board view.
  - 2026-06-20 automation/recurring follow-up deployed `manage-client-task` and `manage-client-profile`: client CSM assignment claims open unassigned client tasks, and recurring tasks create the next occurrence when completed. Tasks board/list got soft status lane colors from the RetainOS palette.
  - 2026-06-20 custom reminder audit: RetainOS should model custom client reminders as client-linked tasks with due dates, not a separate CST-style reminder object. Optional later UX: Quick Update shortcut that creates a client-linked task/reminder.
  - 2026-07-03 milestone-template V1: Task Templates can now use `When milestone is completed` for primary pathway milestones only. Admin selects Pathway + Milestone, due offset, assignment, priority, and status; `manage-client-milestone` creates matching tasks after primary milestone completion with duplicate protection. Awaiting Jay QA.
  - 2026-07-12 local duplicate-name picker polish: New Task and the Tasks client filter now label options as `Client Name - Program Status`, using status data already loaded by the page. `npm run build` passed. Local-only and awaiting Jay visual QA before commit/deploy.
  - 2026-07-12 correction: Jay visually QA-approved both selectors. The Tasks-only change is captured in local commit `4f9352b` (`Clarify duplicate clients in task pickers`); it remains unpushed and undeployed with the rest of the security branch.
  - Remaining later gaps after this QA: comments, attachments, recurring rules, realtime, richer notifications.
- `[ ]` `[priority: low]` Tasks list/board filters for entire SaaS company.
- `[~]` `[qa]` `[priority: low]` Task due dates, assignments, overdue state, and notifications.
  - Due-state board badges and Daily Pulse task_due visibility are implemented and awaiting Jay QA. Email/push/inbox delivery remains future.
- `[~]` `[polish]` CSM Reports list view and filters.
  - Standalone `/csm-reports` page exists for SuperAdmin, Director, and Support.
  - V1 filters: company, CSM, Today, last 7/14/30 days, and custom date range.
  - Updated vs non-updated is based on app-owned `client_history_events` inside the selected date range.
  - Active-client denominator and active client-manager roster were QA-cleaned on 2026-06-02.
- `[ ]` `[priority: medium]` CSM in-progress details.
- `[ ]` `[priority: later]` CSM Reports AI summary can remain later if AI is not live.
- `[~]` `[polish]` `[priority: medium]` Dashboard KPIs/charts exist; validate against canonical formulas.
  - Charts read app-owned clients for pilot/migrated companies and fall back to the Glide mirror for mirror-only companies.
  - KPI cards now try `dashboard_kpi_counts_canonical` first, including offer and multi-program filters, then fall back to the prior app-owned/legacy calculation if the canonical RPC errors.
  - Performance follow-up v1 completed on 2026-06-06: Overview avoids hidden chart/upkeep loads and Charts lazy-loads heavier datasets by active tab.
  - App-owned offboarded, retention, and renewal/up-for-renewal formulas were hardened against Ethical Scaling pilot data sources.
  - Retention now includes `client_retention_recorded` events for same-program renewals.
  - 2026-07-04 Moves Method QA fix: Up For Renewal no longer treats "no Dashboard Date Range" as unbounded all-time renewal coverage. Default is overdue through next 30 days; explicit Date Range still wins.
  - Program filter supports multi-select.
  - Program Distribution, Buy-in, Progress, and Clients By Offer support client-list drilldowns.
  - `[qa]` When an Offer filter is applied in Dashboard > Charts, the Clients By Offer chart switches to Clients By Milestone for that selected offer/pathway and keeps client-list drilldowns.
  - 2026-07-02 Loom polish: dashboard-visible copy now uses Pathway for the filter, all-pathways option, chart title, subtitle, and drilldown title. Internal database/query names still use `offer` where that is the current schema contract.
  - 2026-06-17 readiness packet prepared in `DASHBOARD_FORMULA_VALIDATION.md` with current formulas, sources, weak spots, and migration-day checks. Full confidence still waits for Moves Method or another larger migrated company.
- `[ ]` `[priority: medium]` Dashboard advanced filtering and sorting.
  - Capture Ben pilot feedback: dashboard views should eventually support more operational filtering/sorting directly inside the dashboard.
  - First named use case: show only upcoming renewals from dashboard metrics/drilldowns.
  - Not urgent for pilot because renewal dates can already be sorted elsewhere, but likely to become a common coach/CSM request as usage grows.
  - Future examples: filter chart/list views by renewal window, risk/status, offer, CSM, and operational follow-up buckets without forcing users back to Clients list.
- `[ ]` `[priority: low]` Renewal forecast / predicted pipeline revenue.
  - Source idea from old CST filtering deep dive: combine renewal window with Progress and Buy-In signals to estimate likely, possible, and unlikely renewals, then multiply by expected conversion value.
  - Best future home is Dashboard / CSM Reports / Renewals rather than the Clients roster filters.
  - Beacon could likely provide the first lightweight version by answering forecast questions from renewal windows, health signals, CSM, offer/pathway, and contract values before a dedicated UI calculator is built.
- `[~]` `[polish]` `[priority: medium]` Dashboard CSM list/workload/capacity views.
  - CSM Active Client Workload counts active clients by active client-managing CSM.
  - CSM Capacity displays active clients versus configured team-member capacity.
- `[~]` `[polish]` `[priority: medium]` Dashboard canonical formula validation.
  - Validate active, front-end/back-end, offboarded, churn, retention, renewal, workload, and capacity definitions against Ethical Scaling pilot data.
  - Working spec: `DASHBOARD_FORMULA_VALIDATION.md`.
  - Draft SQL starting point: `DASHBOARD_CANONICAL_RPC_DRAFT.sql`.
  - Canonical KPI UI integration v1 is wired for Dashboard KPI cards; remaining work is broader validation against Moves Method or another larger migrated-company dataset before marking shipped. Ethical Scaling has too few active clients to give strong formula/performance confidence.
  - Remaining gaps: charts/client drill-throughs still use client-row calculations; decide later whether those should move to canonical reporting views too.
  - 2026-06-17 validation packet is ready. Next action on migration day: compare Dashboard KPI cards, chart/drilldown totals, Clients list filters, contract/renewal spot checks, and CSM Reports denominators against the packet after final sync/backfill.
- `[ ]` `[priority: high]` Full Dashboard formula review on Moves Method scale.
  - Not urgent for migration-day launch, but high priority for the first post-cutover week now that MM has real app-owned scale.
  - Review every Dashboard KPI, chart, drilldown, CSM workload/capacity count, retention/churn/renewal metric, and applied filter interaction against `DASHBOARD_FORMULA_VALIDATION.md`.
  - Compare Dashboard totals against app-owned Supabase counts, Clients filters, CSM Reports denominators, and selected CST/read-only reference snapshots where useful.
  - Outcome should be a short pass/fail punch list: formula correct, needs SQL/RPC hardening, needs UI copy clarification, or needs source-data cleanup.
  - 2026-07-04 first MM finding: renewal KPI default range was too broad and has a focused QA retest queued. Continue remaining KPI/chart formula review after that retest.
- `[x]` Client contact calendar.
  - V1 exists as a Calendar view on `/clients`, beside List and Cards.
  - Day, Week, and Month modes exist.
  - Populated from onboarded date, renewal date, date of last contact, date of next contact, and linked task due dates.
  - Scoped by current company, CSM, program/status, offer, client search, and secondary assignee filters.
  - Jay QAed it as working on 2026-06-03.
- `[~]` `[polish]` `[priority: medium]` Profile upkeep scoring.
  - V1 exists on Dashboard Overview.
  - Score active clients only.
  - Score as a percentage, not binary updated/not updated.
  - Freshness window now comes from Company Settings for pilot/migrated companies, with 14 days as fallback/default.
  - Required fields: Next Steps, Milestone, Date of Last Contact, Date of Next Contact, Progress, and Buy-in.
  - Current implementation uses recent app-owned `client_history_events` first, with current client date fields as fallback where available.
  - Dashboard v1 includes clickable field drilldowns and a clickable complete/incomplete profile drilldown.
  - CSM Reports now includes a Field Upkeep section as the operational/compliance home, using the company freshness window and separating client-level update rate from field-level upkeep score.
  - Remaining gaps: CSM Reports validation after configurable-window wiring and eventual canonical SQL/RPC calculation. Treat this as a Moves Method / larger-company migration validation item because Ethical Scaling's small roster is not a strong stress test.
  - 2026-06-17 `DASHBOARD_FORMULA_VALIDATION.md` now defines the exact CSM Reports update-rate, field-upkeep, complete-profile, and CSM Summary formulas plus migration-day validation steps.
- `[x]` Daily Pulse operating page for CSMs.
  - Purpose: a persistent daily operating view, distinct from dismissible notifications.
  - Suggested buckets: Today, This Week, and This Month, with expandable sections to avoid clutter.
  - Today examples: clients needing contact today, paused clients resuming today, renewals due today without a new contract/retention event, churn-risk clients, RGA candidates, and profiles with no update in 30+ days.
  - This Week examples: calendar-week paused returns, renewals, churn-risk clients, RGA candidates, and profiles with no update in 14+ days.
  - This Month examples: calendar-month paused returns, renewals, and profiles with no update in 30+ days.
  - Churn-risk draft rule: red Progress or Buy-in for longer than the configured window.
  - RGA draft rule: green Progress or Buy-in for longer than the configured window.
  - V2 page exists at `/daily-pulse` and is linked in the sidebar for company-scoped roles.
  - V2 is read-only, role-scoped, expandable by section, and client cards link into client detail.
  - CSM users see only assigned/secondary-assigned clients.
  - SuperAdmin, Director, and Support users see the selected company by default and can filter the page by active client-managing CSM.
  - V2 combines Progress and Buy-in signals into one card per client to avoid duplicate RGA/churn cards.
  - 2026-06-10 Moves readiness pass adds company-configurable diagnostic and strategic-review signal types:
    - Peak Diagnostic cadence from client onboarding, defaulting to 56 days.
    - Strategic review days-before-contract/program-end, defaulting to 35 days.
  - 2026-06-11: Admin Hub exposes timing controls for these two signals so each company can configure them instead of inheriting Moves-specific assumptions.
  - 2026-06-11 local polish: Admin Hub copy now frames diagnostic rules as generic onboarding checkpoints/check-ins, with one-time or recurring behavior and clearer examples.
  - 2026-06-12 Company Settings groups visibility toggles separately from timing rules so migration setup is easier to QA.
  - V2 uses local page calculations from current client rows plus app-owned history where available; canonical SQL/RPC can come after UX validation.
  - Directors can choose which Daily Pulse sections are visible for their company through Company Settings.
  - 2026-06-16 product polish clarified the persistent Daily Pulse vs compact reminder bell distinction, added an empty state when no Daily Pulse sections are enabled, and made zero-signal windows easier to QA.
  - 2026-06-16 Jay QA passed Daily Pulse page polish and Company Settings notification clarity.
- `[ ]` `[priority: medium]` Dashboard HTML export.

### Phase 4: Resources, User Management, Notifications, And Migration Readiness

Goal: prepare RetainOS for real customer migration, support operations, and repeatable company setup.

- `[~]` `[polish]` `[priority: medium]` CRUD Resources.
  - Super Admin can create/edit/archive resources.
  - 2026-06-10 Moves readiness pass splits Resources into RetainOS Help and Company Resources.
  - RetainOS Help is shared globally; Company Resources are scoped to the selected company.
  - Company resources support written guides, links, and Loom/video embeds.
  - 2026-06-13 integration guide pass adds token-aware RetainOS Help setup pages for New Client Webhook, Client Update Webhook, Call Summary / Next Steps, Call Transcript, and Course Completion.
  - 2026-06-13 closeout update: New Client, Client Update, and Call Summary / Next Steps are live webhook flows with company-scoped token support. Call Transcript and Course Completion remain setup/planning guides only until their endpoint implementations are intentionally built.
  - Call Transcript resource QA scope: confirms company ID, active token status/prefix, copyable payload shape, and clear “not active yet” language. No endpoint QA is expected because `ingest-call-transcript` does not exist yet.
  - Course Completion resource QA scope: confirms company ID, active token status/prefix, copyable LMS payload shape, and clear “not active yet” language. No endpoint QA is expected because `webhook-course-completion` does not exist yet.
  - 2026-06-13 resource cleanup: future-only guides now use explicit not-live placeholder copy, include planned method/header/token guidance, and avoid implying Call Transcript/Course Completion can be tested today. Build passed.
  - 2026-06-16 Resources migration review now lives in `RETAINOS_RESOURCES_MIGRATION.md`, mapping existing Glide resource content to RetainOS status, re-record needs, and future/customer-specific guides.
  - 2026-06-16 `20260616110000_retainos_resources_migration_seed.sql` seeds all 25 migrated Glide resource entries into RetainOS Help. Rewrite/re-record items seed as drafts; live dynamic integration guides remain published.
  - 2026-06-20 `20260620110000_retainos_resources_working_clients_v2_seed.sql` seeds the 42 missing `RETAINOS_RESOURCES_MIGRATION_v2.md` Working with Clients entries as RetainOS Help drafts. Live readback confirmed 43 Working with Clients drafts including the previously seeded Client Details screen resource.
  - 2026-06-20 `20260620153000_update_filtering_clients_overview_resource.sql` refreshes `filtering-clients-overview` as a RetainOS draft covering the new Clients filter set and noting that revenue forecast validation belongs to Dashboard / CSM reporting resources.
  - 2026-06-20 `20260620154000_update_client_full_card_details_resource.sql` refreshes `client-full-card-details` as "Understanding and updating a client profile" and cross-links it from Filtering Clients as the paired next step after finding the right client/segment.
  - 2026-06-20 `20260620155000_merge_contact_cadence_resources.sql` makes `using-date-of-last-contact-and-date-of-next-contact-features` the canonical "Tracking client contact cadence" draft and turns the older Last Contact / Next Contact drafts into merged pointers.
  - 2026-06-20 `20260620160000_update_ai_call_summary_resource.sql` refreshes the AI-generated call summaries draft with live RetainOS behavior: company-scoped tokens, attendee email matching, review queue fallback, optional summary cleanup, and the boundary from full Call AI transcript processing.
  - 2026-06-20 `20260620161000_update_task_management_resource.sql` refreshes `task-management-in-retainos` as a RetainOS task operating guide covering board/list views, create/edit/status, templates, auto-created tasks, recurring tasks, Daily Pulse due visibility, client-linked tasks, and later gaps.
  - 2026-06-20 `20260620163000_remove_redundant_client_details_screen_resource.sql` removes the redundant old `client-details-screen` draft because its view/profile/update concepts are now covered by Filtering Clients, Quick Update, contact cadence, and the full client profile resource.
  - 2026-06-20 `20260620164000_update_assign_new_clients_csm_resource.sql` refreshes `assign-new-clients-csm` as a RetainOS assignment guide covering Primary CSM during creation, Clients > CSM filter > Unassigned, Edit Profile reassignment, task claiming, role limits, and the absence of the old CST popup.
  - 2026-06-20 `20260620165000_remove_acknowledge_new_client_assignment_resource.sql` removes the old CSM assignment acknowledgement/popup resource; the idea is now tracked as future notification scope.
  - 2026-06-20 `20260620170000_merge_filtering_deep_dive_resource.sql` merges `filtering-clients-deep-dive` into the canonical `filtering-clients-overview` draft, keeping one "Filtering clients in RetainOS" resource with strategic examples and forecast-as-future-scope guidance.
  - 2026-06-20 `20260620171000_update_custom_fields_resource.sql` refreshes `custom-fields` as a RetainOS setup guide covering typed company custom fields, Quick Update / Outcomes usage, New Client Webhook and Client Update Webhook `custom_fields`, and legacy CST slot compatibility.
  - 2026-06-20 `20260620172000_remove_contact_cadence_pointer_resources.sql` removes the old merged-pointer Last Contact and Next Contact drafts, leaving only the canonical "Tracking client contact cadence" resource.
  - 2026-06-20 `20260620173000_update_custom_client_reminders_resource.sql` rewrites `creating-custom-client-reminders` around RetainOS client-linked tasks, due dates, Clients reminder bell, Daily Pulse, and future Quick Update shortcut scope.
  - 2026-06-20 `20260620175000_update_multiple_client_emails_resource.sql` refreshes `managing-multiple-email-addresses-per-client` after adding Email 2 / Email 3 and integration matching support.
  - 2026-06-20 `20260620181000_update_secondary_offers_resource.sql` upserts `adding-secondary-offers` as "Adding secondary pathways" after adding the RetainOS company-gated secondary pathway/milestone feature.
  - 2026-06-21 `20260621101000_update_archetypes_client_views_resource.sql` refreshes `archetypes-in-client-views` after adding the company-gated Clients List/Card archetype display.
  - 2026-07-04 Moves Method role QA caught that Directors could view company resource drafts but could not create/edit company-owned resources. Frontend now exposes company-resource create/edit to Directors, RetainOS Help remains SuperAdmin-only, and `manage-resource` was deployed with server-side Director-only-company-resource authorization. Awaiting Jay retest.
- `[~]` `[polish]` `[priority: medium]` Resource list/search/categorization.
  - First categorization pass is the RetainOS Help vs Company Resources library split.
  - 2026-06-16 Resources page now keeps the two top-level libraries and adds RetainOS Help subcategory pills: All, Setup & Onboarding, Working with Clients, Using the Dashboard, and Automations.
  - Current subcategory filtering uses explicit slug overrides for the seeded migration resources, with client-side inference from resource title, slug, description, content, and `dynamic_key` as fallback. Add a database-backed category/tag field later if editorial categorization needs to be exact.
  - 2026-06-20 Resources categorization now also honors an explicit `Resource category: Working with Clients` content marker so v2 drafts stay under the correct pill even when titles mention dashboards, automations, renewals, or Call AI.
  - Search/tag taxonomy remains later.
- `[ ]` `[priority: medium]` User Management CRUD Users.
- `[ ]` `[priority: medium]` Invite/provisioning flow for bulk/team users.
- `[~]` `[polish]` `[priority: medium]` Notifications: in-app, email, and future push.
  - V1 foundation added app-owned `notifications` and `notification_preferences`, plus an idempotent generator for next contact, renewal, paused return, and client-linked task due reminders for pilot/migrated companies.
  - The Clients notification surface now reads from the notification source of truth where available and falls back to current client fields if the migration/RPC is unavailable.
  - Local-only prototype replaced the wide Clients pilot reminder strip with a compact bell/dropdown in the Clients header; Jay QAed the direction as feeling right.
  - 2026-06-10 local polish: Company Settings now includes in-app visibility toggles for next contacts, renewals, pause returns, churn risk, RGAs, quiet profiles, and client-linked task due reminders. Clients bell and Daily Pulse respect those toggles.
  - 2026-06-16 product polish renamed the Clients dropdown as a reminder bell, clarified that full operating review belongs in Daily Pulse, and tightened Company Settings copy around bell-only, Daily Pulse, and timing-rule controls.
  - 2026-06-16 Jay QA passed the V1 in-app reminder bell and Company Settings notification-control clarity. Email delivery, push, and full inbox/read-dismiss behavior remain later notification scope.
  - Email delivery and full inbox remain intentionally disabled until read/dismiss/counts and delivery preferences are QAed.
- `[ ]` `[priority: medium]` CST-style operational alert review surface.
  - Add a RetainOS equivalent of the old CST alert review modal/list: summarized alert groups, counts, and direct `View clients` actions.
  - Candidate alert groups: new clients needing onboarding/CSM assignment, recently off-boarded clients, paused/suspended clients, MIA/quiet clients, overdue follow-up buckets, and high-priority task/reminder groups.
  - Should work with company notification preferences and avoid noisy popups; likely best as a bell/inbox or Daily Pulse entry point with an optional review modal.
- `[ ]` `[priority: medium]` Reporting PDF generation:
  - Semi-monthly churn-risk / renewals / RGAs PDF.
  - Weekly CSM Metrics PDF.
- `[x]` Final migration validation with pilot company.
  - 2026-06-18 Moves preflight: current mirror snapshot still has 4,143 clients, 2,338 active clients, 6 active unassigned clients, and 9 active invalid CSM assignments; offer/milestone config remains complete and all active clients have renewal/filtering dates.
  - 2026-06-18 migration tooling: added a generic dry-runnable company write-mode seed script for company, team, clients, offers, milestones, settings defaults, custom fields, outcome/churn defaults, and notification preferences. It is not applied; use only after final paid sync and Jay approval.
  - 2026-07-04 Moves Method final cutover completed: fresh CST sync validated, shadow app-owned rows wiped, 4,485 app-owned clients imported, company config preserved, 2,764 app-owned contract rows created, 56 client milestone rows imported, 7,570 historical tasks imported into app-owned `client_tasks`, old CST history kept read-only/mirror-only, and company promoted to `migration_status = 'migrated'`. Jay accepted 5 active unassigned clients and 10 active archived-primary-CSM assignments as manual post-migration cleanup. Contract source rule: current CST client summary is RetainOS current contract; CST history/contract rows are reference/history unless manually corrected.
  - 2026-07-04 follow-up: Tasks page initially showed only 250 rows because the frontend query capped `/tasks` at `.limit(250)`. App-owned/pilot/migrated task reads now page through all matching `client_tasks`; mirror-only preview keeps the old cap.
- `[x]` Jay-led final sync and no-turning-back cutover plan.
  - 2026-06-17 product decision: do not plan for a long DIY parallel run. Jay owns the high-touch customer cutover; once the final migration is approved, customers stop using Glide and RetainOS becomes source of truth.
- `[x]` Post-cutover rollback/emergency support plan.
  - Keep this as an internal safety plan, not customer-facing parallel usage.
  - 2026-06-17 documented in `OFFICIAL_COMPANY_ROLLOUT_CHECKLIST.md`: use CST/Glide mirror/archive only for reconciliation or emergency reference, not as a planned parallel customer workspace.

### Phase 5: AI, Advanced Automations, Billing, And Later Enhancements

Goal: add higher-tier intelligence and scale features after the first migrated companies are stable.

- `[ ]` `[priority: later]` Groups / cohort management.
  - Deliberately late priority. Groups can be built after client migration because it is not blocking the Ethical Scaling pilot or early client migrations.
  - Future scope: CRUD groups, group list/detail views, group-client assignment flow, and group-scoped filters/reporting.
- `[ ]` `[priority: later]` Call AI filters and list view.
- `[ ]` `[priority: later]` Add new meeting transcript and run AI manually.
- `[ ]` `[priority: later]` Automatic transcript ingestion through Fathom or equivalent.
- `[ ]` `[priority: later]` Fixed AI prompts managed only by SuperAdmin.
- `[ ]` `[priority: later]` Company-specific prompts for Pro/Enterprise, built by CST Dev Team.
- `[ ]` `[priority: low]` Dashboard AI Insights generation.
- `[ ]` `[priority: later]` Call AI summaries, red flags, green lights, sentiment, archetype, and call score.
- `[ ]` `[priority: medium]` Automated flagging for churn risk, renewals, and RGAs.
- `[ ]` `[priority: later]` Stripe billing/subscriptions and tier enforcement.
- `[ ]` `[priority: later]` Google SSO.
- `[ ]` `[priority: low]` Offline functionality.
- `[ ]` `[priority: low]` Dark mode.

## Functional Product Map

Source: scoping team functional overview shared on 2026-05-29.

Use this as the top-level product taxonomy. The detailed sections below track implementation status, data-model decisions, and final migration validation.

### Core Features

#### Client Management System

- `[x]` Company-scoped client roster.
- `[x]` Client search, filtering, list view, and card/detail view.
- `[x]` Client detail read-only profile.
- `[x]` Client status/program display and filtering.
- `[x]` Contract read-only display with renewal-related fields where available.
- `[x]` Offer filter and offer/milestone read-only mapping.
- `[x]` Multiple assignee/CSM filtering, including secondary assignee matches.
- `[ ]` `[priority: medium]` Create clients manually.
- `[ ]` `[priority: high]` Create clients via CSV import.
- `[ ]` `[priority: high]` Create clients automatically through Zapier webhook with required server-validated `company_id`.
- `[ ]` `[priority: later]` Support individual client and group/cohort client management models.
- `[ ]` `[priority: medium]` Assign multiple CSMs to a single client for different service offerings.
- `[~]` `[polish]` Quick Update write workflow for recording client interactions.
  - Pilot stores next steps, contact dates, outcome/status values, and notes in `client_history_events`.
  - Pilot also updates the app-owned `clients` current-state row for next steps, contact dates, and outcome values.
  - Pilot outcome dropdowns currently read from mirrored Glide choices; app-owned company outcome definitions are still planned.
- `[~]` `[polish]` Profile upkeep scoring based on last update timestamps across key fields.
  - Dashboard Overview v1 uses recent RetainOS history events and current client date fields for Ethical Scaling pilot data.
- `[x]` Client calendar view.
- `[x]` Client lifecycle actions: active, paused, suspended, offboarded.
  - 2026-06-17 audit: V1 status writes are centralized in `manage-client-status`, include role/assignment guardrails, write history/audit, and keep lifecycle side effects out of webhooks/Quick Update. See `CLIENT_LIFECYCLE_PROGRAM_CLOSEOUT.md`.
  - 2026-06-17 Jay QA passed with Josh Garvey assigned to Ben; downstream formula/notification confidence is tracked separately for migration-day validation.

#### Dashboard And Analytics

- `[x]` Dashboard view with KPI groups and charts.
- `[x]` Role-aware dashboard access.
- `[x]` Company, CSM, program/status, date, and offer-style filtering where currently wired.
- `[x]` Active client and status/program reporting where source data is available.
- `[~]` `[polish]` Retention and churn reporting exist; app-owned UI path was hardened for Ethical Scaling, but still needs canonical Supabase formulas before broad write-mode rollout.
  - 2026-06-21 resource audit refreshed `retention-churn-metrics` to match the current RetainOS formula/workflow: renewals through contract retention events, churn through offboarding actual end date vs contract end date, dashboard drilldowns, Clients renewal filters, and predictive renewal forecast as future/Beacon-assisted scope.
- `[~]` `[polish]` CSM workload/capacity areas exist conceptually but need final formula and data validation.
- `[ ]` `[priority: medium]` CSM performance reports.
- `[ ]` `[priority: medium]` At-risk client identification and tracking.
- `[ ]` `[priority: later]` Tier-based dashboard customization.
- `[ ]` `[priority: low]` Real AI Insights for higher subscription tiers.
- `[ ]` `[priority: medium]` Real-time data generation behavior without manual refresh requirements.

#### Call AI Integration

- `[ ]` `[priority: later]` AI usage can launch after initial go-live.
  - Not a blocker for the first 2-3 migrated companies.
  - Initial migration can proceed without full AI automation if core client, dashboard, task, and reporting workflows are stable.
- `[ ]` `[priority: later]` Upload and process meeting transcripts manually.
- `[ ]` `[priority: later]` Automatically ingest meeting transcripts through Fathom or equivalent integration.
- `[ ]` `[priority: later]` Fixed AI prompts for sentiment analysis, call grading, and summaries.
- `[ ]` `[priority: later]` Company-specific custom prompts for tailored analysis.
- `[ ]` `[priority: later]` On-demand analysis for specific call scenarios.
- `[ ]` `[priority: later]` Call sharing between team members.
- `[ ]` `[priority: later]` Weekly automated reports on call analysis metrics.
- `[ ]` `[priority: later]` Red flag identification and escalation alerts.

#### Task Management

- `[x]` Top-level Tasks page.
- `[x]` Board and list task views.
- `[x]` Task filtering by open/all/closed and search.
- `[x]` CSM task scoping for assigned work.
- `[x]` Client detail Tasks tab wired read-only.
- `[~]` `[polish]` Create tasks with due dates and team assignments.
  - New Task v1 creates app-owned tasks with due dates and assignment; update/complete/dismiss is deferred.
- `[ ]` `[priority: low]` Update task status: pending, completed, overdue.
- `[ ]` `[priority: low]` Task assignment and due-date notifications.
- `[ ]` `[priority: medium]` Clarify company-level tasks versus client-linked tasks in write mode.

#### Offer And Milestone Tracking

- `[x]` Company offer filter from mirrored offer data.
- `[x]` Client detail resolves offer IDs and milestone rows.
- `[~]` `[polish]` Progress tracking through predefined client pathways.
  - Pilot v1 writes client milestone progress to app-owned `client_milestones`.
  - Completing a milestone advances to the next configured milestone in the active offer.
  - Client detail timeline is filtered to the client's active/current offer.
- `[~]` `[polish]` Manual milestone completion.
  - Start and complete actions support date override.
  - Call-based milestone completion is not started.
- `[~]` `[polish]` Historical tracking of time spent in each milestone.
  - V1 stores duration and time-to-hit on `client_milestones`.
  - Needs dashboard/reporting validation before marking complete.
- `[ ]` `[priority: high]` Company-specific offer definitions in RetainOS write mode.
- `[ ]` `[priority: high]` Offer-specific milestone definitions.
- `[ ]` `[priority: medium]` Target completion times and automatic milestone-delay flagging.
- `[x]` Quick Update milestone-progress flow matching the intended CSM low-fi workflow.
- `[ ]` `[priority: medium]` Secondary offers/pathways.

### Supporting Features

#### User Authentication And Management

- `[x]` Secure email OTP login.
- `[x]` Just-in-time Auth user provisioning for existing company users.
- `[x]` SuperAdmin global access is not tied to companies.
- `[x]` Company association for team members.
- `[x]` Role-based route and capability gating.
- `[ ]` `[priority: medium]` Full activity logging for audit trails and change history.
- `[ ]` `[priority: later]` Google login.

#### Resource Library

- `[ ]` `[priority: medium]` Centralized resource library.
- `[ ]` `[priority: medium]` External resource link management for videos, docs, links, and training materials.
- `[ ]` `[priority: medium]` Resource access control by user role and company settings.
- `[ ]` `[priority: medium]` Resource search and categorization.

#### Admin Configuration Panel

- `[~]` `[polish]` SuperAdmin SaaS Clients and company Team tab exist; pilot Team writes are enabled for app-owned companies only.
- `[ ]` `[priority: high]` Custom field creation with text, dropdown, date, boolean, and future field types.
- `[ ]` `[priority: high]` Outcome definitions for success, progress, and buy-in.
- `[ ]` `[priority: high]` Notification preferences and automation settings.
- `[~]` `[polish]` Team member management and role assignments.
  - 2026-06-20 RetainOS invite flow added locally: member creation sends login email, Send invite can resend for active app-owned members, and `invite-team-member` resource was updated/applied as a RetainOS-specific draft. Frontend now falls back to `prepare-login` + OTP send if the deployed Edge Function is stale; function deploy still pending.
- `[ ]` `[priority: high]` Company customization tabs:
  - Customization.
  - Pathways & Milestones.
  - Company Settings.

#### Automated Workflow Engine

- `[ ]` `[priority: medium]` Churn risk identification from buy-in/progress status and milestone delays.
- `[~]` `[polish]` Renewal notifications/prompts for contracts expiring within 30 days.
  - Client Detail > Contract now shows a local renewal prompt for active clients within 30 days of contract end.
  - Automated notifications remain future work.
- `[ ]` `[priority: medium]` Revenue-generating activity alerts for eligible clients.
- `[ ]` `[priority: medium]` Monthly dashboard reports delivered automatically.
- `[ ]` `[priority: medium]` Summary notifications for client conditions.
- `[ ]` `[priority: medium]` Real-time notifications for immediate issues and periodic reminders.

#### Reporting, Exports, And Imports

- `[ ]` `[priority: medium]` Report template system.
  - Initial target: 2 distinct report templates/types.
  - Templates to be provided by Jay as core examples.
- `[ ]` `[priority: medium]` PDF report generation.
- `[ ]` `[priority: medium]` Semi-monthly client opportunity/risk PDF.
  - Schedule: every 1st and 14th.
  - Recipients: CSMs and Director.
  - Contents: clients at churn risk, clients up for renewal, and RGAs.
- `[ ]` `[priority: medium]` Weekly CSM Metrics PDF.
  - Schedule: every Monday.
  - Recipient: Director.
  - Contents: Avg. Time to Success per CSM, Updated vs. Non-Updated Profiles, and other metrics from the data sheet.
- `[ ]` `[priority: medium]` Custom HTML export of Dashboard.
- `[ ]` `[priority: high]` CSV upload and parse flow.
- `[ ]` `[priority: medium]` User bulk upload flow.

#### Billing And Subscription Management

- `[ ]` `[priority: later]` Stripe integration.
- `[ ]` `[priority: later]` Monthly recurring billing.
- `[ ]` `[priority: later]` Tier-based feature access.
- `[ ]` `[priority: later]` Subscription upgrade/downgrade workflow through SuperAdmin.
- `[ ]` `[priority: later]` Usage monitoring and tier limit enforcement.

### Future / Nice-To-Have

- `[ ]` `[priority: low]` Dark mode.
- `[ ]` `[priority: low]` Offline functionality.

## End-To-End Flow Map

Source: scoping team process-flow and automated-flow overview shared on 2026-05-29.

Use this section to connect feature work into operational flows. A feature is not truly ready unless the relevant flow can be completed by the right role, with the right company scope, and the expected data landing in dashboards, reports, alerts, and history.

### Client Intake And Setup Flow

- `[~]` `[polish]` `[priority: medium]` New client can be created manually.
- `[ ]` `[priority: high]` New client can be imported from CSV with preview and validation.
- `[ ]` `[priority: high]` New client can be created from Zapier with required `company_id`.
- `[~]` `[polish]` `[priority: medium]` Client can be assigned to company, offer, pathway, milestone, CSM, and optional group/cohort.
  - 2026-06-20 Secondary Assignee is live for app-owned pilot/migrated clients when the company feature gate is enabled: create/edit UI, server validation, CSM access scope, Clients/Dashboard filters, and draft resource. Awaiting Jay QA before promoting.
  - 2026-06-20 CSM assignment resource audit added an `Unassigned` Clients CSM filter and documented the RetainOS flow for assigning automation-created or manually created clients that still need an owner.
- `[~]` `[polish]` Client setup captures contract details, start date, end/renewal logic, and external links.
  - New Contract v1 covers this for app-owned pilot/migrated clients from Client Detail > Contract.
- `[ ]` `[priority: medium]` Client appears correctly in roster, dashboard, CSM reports, tasks, and notification logic after creation.

### Quick Update And Client Progress Flow

- `[~]` `[polish]` CSM can complete Quick Update after a client interaction.
  - Pilot server path allows SuperAdmin, Director, Support, and assigned CSMs.
- `[~]` `[polish]` Quick Update can update progress, buy-in, next steps, last contact, next contact, call attendance, notes, and key custom fields.
  - Pilot covers progress, buy-in, next steps, last/next contact, notes, and enabled company custom fields.
  - Call attendance remains future work.
  - Custom fields are treated as recurring update fields and are editable in Quick Update and Client Detail > Outcomes once definitions are enabled for a company.
  - 2026-06-20 resource audit: `how-to-make-a-quick-update` now documents the RetainOS interaction-log flow, including context cards, contact cadence, Success/Progress/Buy-In, custom fields, milestone completion/start-next, and the product decision that pathway/offer reassignment belongs in Client Detail > Pathways & Milestones.
  - 2026-07-02 Loom polish: Quick Update context cards truncate long North Star / Next Steps automation text and open the full rich text in a simple read-only modal from `Read more`.
- `[~]` `[polish]` Quick Update writes to client history/change log.
  - Pilot writes app-owned `client_history_events`.
- `[~]` `[qa]` Global client note search across profiles.
  - 2026-06-21 added Clients > Notes mode backed by `search_client_notes`.
  - Searches current Next Steps, app-owned client history notes/next steps/summaries/titles, and migrated legacy CST history values where available.
  - Respects applied Clients filters before searching note content: client name, CSM, secondary assignee, status, offer, milestone, renewals, contact cadence, health/outcomes, and advocacy.
  - Awaiting Jay QA for visual feel, result usefulness, and migration confidence on known old CST history examples.
- `[~]` `[polish]` Quick Update refreshes profile upkeep scoring.
  - Quick Update history events now feed Dashboard Profile Upkeep Score v1.
- `[ ]` `[priority: medium]` Quick Update changes flow into dashboard KPIs, CSM Reports, alerts, and AI/reporting inputs.

### Quality Control Flow

- `[~]` `[polish]` Dashboard provides quantitative view of company/client health.
  - Overview KPI cards and chart segments can drill into affected client lists where wired.
- `[~]` `[polish]` CSM Reports show system compliance and profile update behavior.
  - Field Upkeep supports field-level and complete/incomplete profile drill-through.
  - CSM Summary rows can drill into that CSM's active client update list.
  - QA passed on 2026-06-06: date ranges, CSM modal, not-updated-first order, and client profile links worked as expected.
- `[ ]` `[priority: later]` Call AI shows call quality and coaching standard signals.
- `[~]` `[polish]` Directors can move from dashboard signal to affected client list to individual profile details.
- `[ ]` `[priority: medium]` CSMs can move from assigned client/task alerts to client updates.
- `[~]` `[polish]` Support can inspect company-wide operational data without AI Insights access.

### Task Manager Flow

- `[x]` Task can be created from company-level context.
- `[~]` `[polish]` Task can be created from client profile context.
  - Current v1 creates from top-level Tasks with an optional client link; direct Client Detail create button is still future.
- `[x]` Task can be assigned to team members with due date and priority/status.
- `[x]` Task appears in the global Task Manager and client profile when linked to a client.
- `[x]` Task can be auto-created when a primary pathway milestone is completed.
  - V1 is configured from Company Settings > Task templates and intentionally excludes secondary pathway milestones.
  - 2026-07-03 Jay QA passed.
  - 2026-07-03 follow-up: Task Templates modal refreshes pathway/milestone options when opened so newly created milestones appear without a hard refresh, and templates can be copied into a new unsaved draft.
- `[ ]` `[priority: low]` Task status changes update related notifications and reporting.
  - Deferred until task usage becomes a higher pilot priority.
- `[ ]` `[priority: low]` Overdue tasks are flagged and routed to the correct user.

### Contract Renewal And Offboarding Flow

- `[ ]` `[priority: medium]` Contract expiration detection identifies clients up for renewal within configured windows.
- `[ ]` `[priority: medium]` Renewal opportunities can be surfaced to CSMs and Directors.
- `[ ]` `[priority: medium]` Client at churn risk can be flagged from progress/buy-in/milestone delays and related signals.
- `[x]` Client can be paused, suspended, or offboarded through controlled write flows.
  - 2026-06-17 lifecycle audit confirms Pause/Suspended/Offboarded status changes are live for app-owned pilot/migrated clients through `manage-client-status`; Jay QA passed with Josh Garvey assigned to Ben.
- `[ ]` `[priority: low]` Client archive flow.
  - Archive remains separate/future and is not part of the status lifecycle closeout.
- `[~]` `[downstream]` Offboarding updates roster, dashboard, client history, notifications, and reporting.
  - Roster/current profile/history are wired through the app-owned status flow.
  - Dashboard/CSM formula expectations are documented in `DASHBOARD_FORMULA_VALIDATION.md`.
  - Notification/reporting confidence needs Moves Method migration-day validation with real company scale.

### Automated Flagging Flow

- `[ ]` `[priority: medium]` Automated workflows can find and flag churn-risk clients on configured schedules.
- `[ ]` `[priority: medium]` Automated workflows can find and flag clients up for renewal on configured schedules.
- `[ ]` `[priority: medium]` Automated workflows can find and flag Revenue Generating Activities on configured schedules.
- `[ ]` `[priority: medium]` Scheduled workflow outputs can feed notifications, reports, dashboard indicators, and task creation.
- `[?]` `[priority: medium]` Decide whether automated workflows run in Supabase scheduled functions, N8N, Zapier, or a hybrid approach.

## Sitemap And Navigation Coverage

Source: scoping team sitemap overview shared on 2026-05-29.

Use this section to validate route structure, navigation visibility, and role access. It should stay aligned with the hierarchy matrix and final QA checklist.

### SuperAdmin Sitemap

- `[x]` SaaS Clients list view.
- `[x]` SaaS Client detail view.
- `[~]` `[polish]` New SaaS Client modal exists with disabled submit.
- `[x]` View As / company support flow.
- `[x]` Resources list view.
- `[ ]` `[priority: medium]` New resource flow.
- `[ ]` `[priority: later]` AI Prompts management for fixed prompts.
  - SuperAdmin has the ability to edit fixed AI prompts.
  - Directors cannot edit fixed prompts.
- `[late]` `[priority: later]` Groups list and detail views across selected company.
- `[x]` Clients list, card, and calendar views across selected company.
- `[~]` `[polish]` `[priority: medium]` New Client flow.
  - 2026-06-20 manual-create resource audit added richer optional setup fields and updated `add-clients-manually` as a RetainOS-specific draft.
- `[ ]` `[priority: high]` Bulk client upload.
- `[~]` `[polish]` `[priority: medium]` Client detail edit/manage.
- `[x]` Dashboard / KPI dashboard for selected company.
- `[~]` `[polish]` `[priority: low]` Generate AI Insights action exists as placeholder only.
- `[~]` `[priority: high]` `[qa]` Beacon assistant chat secure rebuild.
  - Working chat over live client data: renewals, contract gaps, health/referral-ready, CSM books, client detail. Jay validated v1 locally on 2026-06-10.
  - Now a **floating bubble widget** on every authenticated page (mounted in `AppShell`), not a standalone page. The `/beacon` route and its sidebar nav item were removed on 2026-06-14; conversation persists across navigation.
  - `[polish]` remaining: broader question QA against roster/dashboard counts.
  - `[downstream]` The old browser-direct implementation is revoked and excluded from production. Rebuild from `/Users/joaogoncalves/Desktop/cst_supabase_beacon` using a `beacon-chat` Edge Function, server-held AI key, SuperAdmin-controlled company entitlement, server-side role/client scoping, usage limits, and audit logging.
  - 2026-07-13 workspace extraction: useful prototype files were verified byte-for-byte and quarantined under `BEACON_PROTOTYPE_REFERENCE_DO_NOT_COMMIT/` on `codex/beacon-secure-rebuild`; unsafe Anthropic package/Vite integration and stale application files were discarded. Ethical Scaling is the first secure pilot, followed by Moves Method after QA.
  - 2026-07-13 secure beta plan: `BEACON_BETA_PLAN.md` defines the two-gate entitlement/authorization boundary, server-only OpenAI flow, app-owned allow-listed RPCs, threat model, usage/rate/cost controls, five-role test matrix, Ethical Scaling -> Moves Method pilot gates, observability, and rollback. Planning only; no implementation, provider secret, migration, deploy, entitlement, or prototype restore occurred.
  - `[mixed]` Jay review blocks implementation: approve the historical CSM assignment-interval rule, Support's new operational Beacon policy, conversation/log retention, initial tool set, model/budget/environment strategy, and sanitized SuperAdmin configuration scope. CSM access stays off until normalized historical authorization exists and passes QA.
  - 2026-07-13 decision correction (supersedes the preceding blocker): Jay approved an active-CSM "ever assigned" rule for verified app-owned client assignments, Support company-wide operational visibility without admin/configuration access, memory-only chat, and the Phase 1 read-only tool allow-list. The model baseline is pinned GPT-5.4 mini with nano evaluated as a cheaper challenger. Moves begins with a one-time $100 hard cap; Ethical Scaling uses a provisional $25 one-time cap. G0 is closed; implementation still requires assignment-ledger/data-integrity proof and the G1-G3 security/test/environment reviews in `BEACON_BETA_PLAN.md`.
  - The SuperAdmin SaaS-client AI Features area will independently enable and meter each paid feature (for example Beacon currency allowance, Call AI analysis count, and future Slack AI allowance). It remains excluded from the ordinary customer Admin Hub. No Beacon configuration-query tool ships in Phase 1.
  - 2026-07-14 local QA candidate: memory-only widget, SuperAdmin-only AI Features controls, three server-side Edge Functions, four additive migrations with reverse-order rollbacks, service-only actor-bound read RPCs, and static/provider-mock verification are implemented on `codex/beacon-secure-rebuild`. Future feature cards are visible as Coming soon but cannot be mutated in Phase 1.
  - `[qa]` Local evidence: database contract 49/49, Edge tests 33/33, Edge invariant verification across 20 source files, frontend/security 25/25, TypeScript/Vite production build, and `git diff --check` passed. Ambiguous dispatched provider work now consumes its full reservation. SQL has not been applied or runtime-tested because no local PostgreSQL runtime/parser is available.
  - `[environment]` Before Ethical Scaling, apply only to an approved disposable/staging database first; prove concurrency, authorization isolation, accounting, expiration sweep, rollback, and kill switches. No secret, migration apply, deploy, entitlement, provider call, commit, quarantine restore, or pilot enablement occurred in this local build.
  - 2026-07-14 morning QA: all safe Section A checks and G1/G2 code review passed again; independent Terra audit found no P0/P1 blocker. Local runtime inventory confirmed there is no Docker/PostgreSQL/local Supabase target, so the next gate is an explicitly approved isolated staging apply of only the four Beacon migrations, followed by Sol-run database/role/tenant/accounting/rollback QA.
  - 2026-07-14 rollout correction (supersedes the preceding staging requirement): Beacon will ship through the existing RetainOS Supabase project/database using `BEACON_DIRECT_ROLLOUT.md`. Apply the four additive migrations with all controls off, deploy the three Edge Functions while paused, add the existing-account OpenAI key only as a Supabase secret, ship the hidden-by-default frontend, then enable Ethical Scaling alone at $25 and run a short role/tenant/tool/pause smoke pass. No new Supabase project, database, or multi-week gate.
  - 2026-07-14 production DB step complete: the four recorded Beacon migrations applied successfully to `zjauqflzxzsbpnivzsct`; rollout history is complete, every global AI control is paused, and there are zero entitlements/allowances. Ethical Scaling CSM readiness remains fail-closed because 89 current assignment values belong to archived CSMs or non-CSM members; 72 active-CSM values are verified. Add one narrow readiness correction before CSM access, then continue with paused Edge deployment. No function, secret, frontend, entitlement, or provider change occurred.
  - 2026-07-14 CSM readiness correction applied: `20260714014000` now ignores only exact ineligible archived/non-CSM mappings while missing, duplicate, or unverified active-CSM evidence remains fail-closed. Ethical Scaling is ready with 161 exact current mappings, 72 verified active-CSM values, and zero unresolved; no history was inferred. Global controls remain paused with zero entitlements/allowances. Next direct-rollout step is deploying the three Edge Functions while Beacon remains off.
  - 2026-07-14 paused Edge step complete: `beacon-access`, `beacon-chat`, and `manage-ai-feature-entitlement` are active at version 1 with JWT verification enabled. Anonymous-token probes denied all three with `401 unauthenticated`; Beacon remains globally paused with 0 entitlements, 0 allowances, and 0 usage events. No OpenAI secret, frontend deploy, pilot enablement, or provider call occurred.
  - 2026-07-14 Supabase secret step complete: `OPENAI_API_KEY` is present in the existing RetainOS project; verification exposed only its name. Beacon remains paused with 0 entitlements, 0 allowances, and 0 usage events, and no provider call occurred. The next separately approved rollout step is the hidden-by-default frontend release.
  - 2026-07-14 hidden frontend step complete: secure release `d76d90e` is on production `main`, Vercel is Ready, and the live app/login return 200. The live bundle contains Beacon but no provider endpoint or credential name. Beacon remains paused with 0 entitlements, 0 allowances, and 0 usage events, so no company sees the widget. Ethical Scaling enablement remains a separate decision and smoke-test gate.
  - 2026-07-14 Ethical Scaling pilot enabled: correction `20260714015000` fixed the management RPC's ambiguous entitlement conflict target after a fail-safe stopped attempt; DB verification is 57/57. ES is the only entitlement (`pilot`) with a one-time $25 hard allowance, global Beacon is active at config v2, all other companies remain disabled, and initial usage is zero. Jay's local role/tool/UI smoke pass is now active at `http://127.0.0.1:5173/`. [qa]
  - 2026-07-14 approved cost/access iteration: additive migration `20260714016000` (`25e842b4232636e79b36b82db06274483a0b4369923b327d056e24c005629435`) is live and the three Edge Functions are redeployed. SuperAdmin can select Director, Support, and CSM access per company; SuperAdmin remains implicit and Viewer denied. Commercial usage now rounds aggregate provider micros once, so the six successful ES requests consume 2 cents from the hard allowance instead of six independently rounded cents. The Edge model is pinned to GPT-5.4 nano for the ES challenger pass, with pinned mini retained as the reviewed rollback model. ES remains the only entitlement; Moves has none. Local gates pass DB 62/62, Edge 37/37, frontend 26/26, and production build. Nano answer-quality QA and live role-account QA remain open before Moves rollout. [qa]
  - 2026-07-14 production source correction: `c4d2801` is on `main`; Vercel serves `index-J9ZSQMW6.js`, which contains the new company-role controls and signed `update_access` action while the live credential/provider-path scan remains clean. Moves remains disabled. [qa]
  - 2026-07-14 nano challenger result: the first live attempts passed company access and quota reservation but the DB finalizer rejected the unreviewed nano model/price lineage, producing the safe generic error and no finalized provider cost. Roll back Edge model/pricing to mini immediately. Nano remains deferred until a dedicated reversible DB lineage migration and accounting test; role controls and aggregate-cost correction are unaffected. [qa]
  - 2026-07-14 nano accounting correction deployed: additive reversible migration `20260714017000` (`237f8084c17d278cb4991c6f132e6e46fcf350f15a0b46127c22abf2204105d5`) approves exact mini/nano lineages, independently recomputes expected cost from finalized token counts, stamps the matching lineage, and rejects any model/cost mismatch. Mini remained active through migration; `beacon-chat` then moved to nano. DB 65/65 and Edge 37/37 pass. Jay's answer-quality and successful nano-finalization smoke remain open; Moves remains disabled. [qa]
  - 2026-07-14 reservation-lineage correction: the first post-17000 nano smoke revealed the append-only structural trigger also requires the reservation and final event price lineages to match. Mini was immediately restored. Reversible `20260714018000` (`48b5dd1e51cee64f71bb880b9e3892b66e65ba659cad2a0e4a8dea10c47fb3e4`) now binds the server-owned Edge release to the approved model and reservation price lineage, and finalization requires the same release/model/lineage. Nano is redeployed after DB 68/68 and Edge 37/37. One live smoke remains; Moves stays disabled. [qa]
  - 2026-07-14 nano challenger closed: its successful request finalized accurately at 422 micros, proving dual-model accounting, but Jay's product QA failed it for returning 8 front-end clients instead of all 14 active front/back-end clients and exposing literal bold markers. Mini is restored as Beacon's production model; nano remains an approved but unselected accounting lineage. The plain-text answer sanitizer now removes simple bold markers. Moves remains disabled. [qa]
  - 2026-07-14 stress-test quality iteration deployed: additive reversible `20260714019000` (`c586121be59645449714ac46dcca9525a04d60c03aba4505be1f9ffdf95f8f69`) adds actor-bound exact client/business/CSM name resolution and bounded upcoming-contact filters without expanding the eight-tool allow-list. Aggregate questions must use canonical metrics; answer prose strips UUIDs/internal paths while server-authorized buttons remain. DB 72/72 and Edge 42/42 pass; all role QA passed. The ES allowance is audited-adjusted from $25 to $27 to offset exactly $2 of known conservative deployment-test charges while preserving ledger history and ~$0.05 real provider usage. Repeat `BEACON_STRESS_QA.md`; Moves remains disabled pending Jay's export. [qa]
  - 2026-07-14 final stress correction deployed: reversible additive `20260714020000` (`9d59bd01454cdf0d2a1937f635c612eb7ee36c5a20bcad6239478a79957f0f7d`) uniquely resolves partial client/business/CSM names only inside actor-authorized scope, allows program/CSM disambiguation for duplicate Alima/Ali records, and adds one-call red/yellow matching across Success, Progress, and Buy-in with optional CSM filter. The eight-tool allow-list and row caps are unchanged. DB 76/76 and Edge 43/43 pass. Retest the four previously failing questions; Moves remains disabled. [qa]
  - 2026-07-14 retest diagnosis/correction: the first combined-health retest succeeded with one `list_clients` call; the next three requests were denied before provider/tools as `actor_daily_limited` after today's iterative QA exhausted the 50-request UTC cap. Reversible `20260714021000` (`c31135f13a2e84c5d1b7aecb87e75f40f0bfaa9b429ef8d45ce72d5fe088c728`) raises only the actor daily cap to 100; 5/minute, concurrency, 250/company/day, and hard-dollar controls remain. The frontend now renders explicit rate-limit retry guidance. DB 79/79, frontend 26/26, production build pass. Retry the three unexecuted questions; Moves remains disabled. [qa]
  - 2026-07-14 Jay UI QA passed launcher visibility, memory/reset behavior, keyboard close/reopen, SuperAdmin controls and $25 display, and Moves hiding. Five authorized chats failed before tools/tokens as `provider_unavailable`; since the secret postdated the original deploy, `beacon-chat` was rebound as active v3 and awaits chat retest. The requested “light at the end of the tunnel” lighthouse/beam icon replaces the launcher/header “B” and passes the 25/25 frontend gate. [qa]
  - 2026-07-14 SuperAdmin chat QA passed: bounded diagnostics identified the sole provider incompatibility as an overlong hashed `safety_identifier`; the 63-character fix passes 35/35 Edge tests. Six live requests successfully used metrics/renewals/client-list tools and refused writes, SQL, and credentials. Actual provider cost was ~1.09 cents; conservative whole-cent metering consumed 6 cents, leaving $24.94. Pre-fix failures cost zero. Director/Support/CSM/Viewer live role QA remains. [qa]
- `[ ]` `[priority: later]` Beacon controlled write tools after the read-only beta is validated.
  - Treat each write action as a separately allow-listed capability with role/client authorization, user confirmation, idempotency, audit, and rollback. Existing application write permission never automatically grants Beacon write authority.
- `[~]` `[polish]` `[priority: medium]` CSM Reports updated-clients list and client detail flow.
- `[ ]` `[priority: later]` Call AI filters/KPIs/analysis list view.
- `[ ]` `[priority: later]` New meeting transcript flow.
- `[ ]` `[priority: later]` Call analysis detail view and share-with-team action.
- `[x]` Tasks list view.
- `[~]` `[polish]` `[priority: low]` New Task flow.
- `[ ]` `[priority: low]` Update Task flow.
- `[x]` Admin Hub / Team Members exists through SaaS Client Team tab and company-side `/admin` route.
- `[~]` `[polish]` New Team User flow.
  - 2026-06-20 local invite delivery/resend UI added; close after `manage-company-member` deploy + Jay QA.
- `[ ]` `[priority: medium]` User detail edit/manage.
- `[ ]` `[priority: high]` Admin Hub settings:
  - Company settings.
  - Customization.
  - Offers & Milestones.
- `[~]` `[polish]` `[priority: high]` Offers & Milestones list view.
- `[~]` `[polish]` `[priority: high]` New Offer flow.
- `[~]` `[polish]` `[priority: high]` New Milestone flow.

### Director Sitemap

- `[late]` `[priority: later]` Groups list and detail views.
- `[late]` `[priority: later]` New Group flow.
- `[late]` `[priority: later]` Group edit/manage.
- `[x]` Clients list and card views.
- `[x]` Client calendar view.
- `[~]` `[polish]` `[priority: medium]` New Client flow.
- `[ ]` `[priority: high]` Bulk client upload.
- `[~]` `[polish]` `[priority: medium]` Client detail edit/manage.
- `[x]` Dashboard / KPI dashboard.
- `[~]` `[polish]` `[priority: low]` Generate AI Insights action exists as placeholder only.
- `[?]` Confirm whether dashboard should include clients at risk of churn by default for Director.
- `[~]` `[polish]` `[priority: medium]` CSM Reports updated-clients list and client detail flow.
- `[ ]` `[priority: later]` Call AI filters/KPIs/analysis list view.
- `[ ]` `[priority: later]` New meeting transcript flow.
- `[ ]` `[priority: later]` Call analysis detail view and share-with-team action.
- `[x]` Tasks list view.
- `[~]` `[polish]` `[priority: low]` New Task flow.
- `[ ]` `[priority: low]` Update Task flow.
- `[x]` Admin Hub team members.
- `[x]` New Team User flow.
- `[ ]` `[priority: medium]` User detail edit/manage.
- `[ ]` `[priority: high]` Admin Hub settings:
  - Company settings.
  - Customization.
  - Offers & Milestones.
- `[x]` Resources list view.
- `[ ]` `[priority: high]` Director customization excludes dynamic AI prompts.
  - Director can manage custom fields, outcome definitions, and churn reasons.
  - Director cannot customize dynamic AI prompts.

### CSM Sitemap

- `[late]` `[priority: later]` Groups list and detail views, scoped to own clients where applicable.
- `[x]` Clients list/card access scoped to own clients.
- `[x]` Client calendar view scoped to own clients.
- `[~]` `[polish]` `[priority: medium]` Client detail edit/manage for permitted fields.
- `[x]` Dashboard / KPI dashboard scoped to own clients.
- `[x]` Tasks list view scoped to assigned tasks.
- `[~]` `[polish]` `[priority: low]` New Task flow.
- `[ ]` `[priority: low]` Update Task flow.
- `[ ]` `[priority: later]` Call AI list view for accessible calls.
- `[x]` Resources list view.
- `[x]` CSM does not access Admin Hub.
- `[x]` CSM does not access SaaS Clients.

### Support Sitemap

- `[late]` `[priority: later]` Groups list and detail views.
- `[late]` `[priority: later]` New Group flow.
- `[late]` `[priority: later]` Group edit/manage.
- `[x]` Clients list and card views.
- `[x]` Client calendar view.
- `[~]` `[polish]` `[priority: medium]` New Client flow.
- `[ ]` `[priority: high]` Bulk client upload.
- `[~]` `[polish]` `[priority: medium]` Client detail edit/manage for permitted fields.
- `[x]` Dashboard / KPI dashboard.
- `[x]` Support cannot access AI Insights.
- `[x]` Tasks list view.
- `[~]` `[polish]` `[priority: low]` New Task flow.
- `[ ]` `[priority: low]` Update Task flow.
- `[ ]` `[priority: later]` Call AI list view.
- `[ ]` `[priority: later]` New meeting transcript flow.
- `[ ]` `[priority: later]` Share call analysis with team.
- `[x]` Resources list view.
- `[x]` Support does not access SaaS Clients.
- `[x]` Support stays operational-only and does not access Admin Hub/team/settings.

### Viewer Sitemap

- `[late]` `[priority: later]` Groups list and detail views.
- `[x]` Clients list and card views.
- `[x]` Client calendar view.
- `[x]` Dashboard / KPI dashboard in read-only mode; Viewer cannot click KPI/cards or search client names from Dashboard drilldowns.
- `[x]` Resources list view.
- `[x]` Viewer is read-only.
- `[x]` Viewer does not see Quick Update.
- `[x]` Viewer does not access Tasks, Call AI, CSM Reports, Admin Hub, or SaaS Clients.

## Hierarchy Matrix Coverage

This section maps the CSV hierarchy matrix against the current app. Use it to decide what to build next without re-reading every CSV. Checked against `Datasheet - Ethical Scaling - User Matrix.csv` and `Datasheet - Ethical Scaling - User Matrix (1).csv`.

### SaaS Clients / Companies

- `[x]` SuperAdmin can view existing SaaS Clients / Companies.
- `[x]` SaaS Clients area is hidden from Director, CSM, Support, and Viewer.
- `[~]` `[polish]` SuperAdmin can open Add SaaS Client modal for UX testing, but Submit is disabled.
- `[~]` `[polish]` SuperAdmin can open SaaS Client details and Team tab, but edit actions are disabled.
- `[ ]` Create new SaaS Client.
- `[ ]` Edit existing SaaS Client.
- `[ ]` Remove / delete / block / archive SaaS Client.
- `[ ]` Manage SaaS Client subscription.

### Clients

- `[x]` SuperAdmin, Director, Support, and Viewer can see all clients for their scoped company.
- `[x]` CSM can see only assigned clients.
- `[x]` All roles with Clients access can filter and search the client list.
- `[x]` List and card views are available.
- `[ ]` Calendar view.
- `[ ]` Create new client for SuperAdmin and Director.

### Client Details

- `[x]` All roles with Clients access can open and view client profiles.
- `[x]` Quick Update is visible for SuperAdmin, Director, CSM, and Support.
- `[x]` Viewer does not see Quick Update.
- `[x]` Director Notes are visible only to SuperAdmin and Director.
- `[x]` Client contract data is visible read-only.
- `[x]` Client task data is visible read-only.
- `[x]` Program, Outcomes, Pathways, and Milestones are visible read-only.
- `[~]` `[polish]` Quick Update write flow.
- `[ ]` Edit client details.
- `[ ]` Manage / edit offers and milestone statuses.
- `[ ]` Manage / edit program.
- `[ ]` Update Outcomes.
- `[ ]` See client update history.
- `[ ]` Update dates of last / next contact.
- `[ ]` Track call attendance.
- `[~]` `[qa]` Edit Next Steps/contact directly from Client Detail > Program.
  - 2026-06-20 Emily pilot feedback: added Program-tab `Update Next Steps` modal that writes through `manage-client-quick-update`, updates the Program field, and appends the Quick Update history event. North Star direct-edit remains separate.
  - 2026-06-20 QA fix: modal passes `companyLegacyId`; History tab added Contract / Last Contact / Next Steps / Health Scores pills and search.
  - 2026-07-04 Moves Method Phase 4 QA polish: Client Detail > Program > Next Steps now truncates long rich text and opens the full value in a read-only `Read more` modal, matching Quick Update. Broad MM readback found no literal `0` in Program text/current contract-day fields; if Jay still sees `0`, capture a specific client example.
  - 2026-06-20 final polish: modal now also edits Date of Last Contact and Date of Next Contact.
- `[~]` `[qa]` Edit North Star from Client Detail > Program through the existing profile modal shortcut.
- `[ ]` Create, assign, and update client tasks.
- `[ ]` View archived tasks in client context.
- `[x]` Create / update contracts for client.
  - Create/edit/archive/delete are covered by the Client Contracts/Renewals V1 flow for app-owned pilot/migrated clients.
  - 2026-07-04 Moves Method QA caught edit/archive/current-summary confusion. Fix deployed and Jay QA passed: edited values persisted, Active excludes archived contracts, and Archived shows the archived rows.
- `[ ]` Delete Forever client for SuperAdmin and Director.

### Call AI

- `[ ]` Add new call transcript to analyze for SuperAdmin, Director, and Support.
- `[ ]` View past analyzed meetings for SuperAdmin, Director, and Support.
- `[ ]` Share call analysis with team for SuperAdmin, Director, and Support.
- `[ ]` See call analysis shared with me for Director, CSM, and Support.
- `[ ]` Define AI prompt inventory and versioning before wiring generation.

### CSM Reports

- `[~]` `[polish]` CSM Reports dashboard for SuperAdmin, Director, and Support.
  - V1 standalone route: `/csm-reports`.
  - CSM users do not access this page in v1.
- `[~]` `[polish]` Filters for CSM Reports dashboard.
  - Company, CSM, last 7/14/30 days, and custom date range.

### KPI Dashboard

- `[x]` SuperAdmin and Director can view company-wide KPIs.
- `[x]` Support can view/filter company-wide KPIs.
- `[x]` CSM can view assigned-client dashboard data.
- `[x]` SuperAdmin and Director can see AI Insights tab.
- `[x]` Support and CSM cannot access AI Insights.
- `[ ]` Real AI Insights generation.
- `[x]` Support remains company-wide on KPI Dashboard and stays excluded from Admin Hub/settings.

### Tasks

- `[x]` Tasks page is available to SuperAdmin, Director, CSM, and Support.
- `[x]` Board and list views are available.
- `[x]` Open / All / Closed filters are available.
- `[x]` Search is available.
- `[x]` CSM sees assigned tasks.
- `[~]` `[polish]` SuperAdmin, Director, and Support currently see company-wide tasks, not only creator/assigned related tasks.
- `[ ]` Manage / update tasks.
- `[?]` Confirm whether “my related tasks” should restrict SuperAdmin, Director, and Support to creator/assigned tasks or remain company-wide for operational visibility.

### Company Customization

- `[x]` Create and manage custom fields for SuperAdmin and Director.
  - App-owned definitions can be listed, created, edited, and archived from Admin Hub / SaaS Company Detail > Customization for pilot/migrated companies.
  - Values are editable in Quick Update and Client Detail > Outcomes for pilot/migrated clients.
  - V1 QA passed on 2026-06-15; optional list/import/export display and advanced field-type UX polish live in Company Customization V2.
- `[x]` Manage / edit churn reasons for SuperAdmin and Director.
  - Company Customization can list/create/edit/archive churn reasons for app-owned pilot/migrated companies.
  - Empty company configs seed the V1 defaults without overwriting existing company rows: Financial, Overwhelm, Paused, Spousal, Uncertainty, Other.
  - V1 QA passed on 2026-06-15; drag-and-drop ordering is tracked as low-priority polish.
- `[x]` Manage / edit outcome definitions for SuperAdmin and Director.
  - Company Customization can list/create/edit/archive outcome definitions for app-owned pilot/migrated companies.
  - Existing outcome type/value structure stays constrained; labels and ordering remain editable.
  - V1 QA passed on 2026-06-15; label/order structure remains constrained by the RetainOS outcome model.
- `[ ]` `[priority: low]` Add drag-and-drop ordering for outcome definitions, custom fields, and churn reasons so ordering no longer depends on visible numeric controls.
- `[ ]` Create / manage fixed AI prompts for SuperAdmin.
- `[ ]` Create / manage dynamic AI prompts for SuperAdmin.
- `[ ]` Manage / edit team and CSM capacity for SuperAdmin and Director.

## Shipped Features

### Login And Hierarchy

- `[x]` RetainOS low-fi login page with email OTP flow.
- `[x]` Login preflight checks SuperAdmin allowlist or active `backup_company_team` membership.
- `[x]` Existing company users are auto-created in Supabase Auth on first login.
- `[x]` SuperAdmin is global and not tied to a company.
- `[x]` Company users resolve from active `backup_company_team` rows.
- `[x]` Role mapping:
  - `role_id = 1` Director
  - `role_id = 2` Support
  - `role_id = 3` CSM
  - `role_read_only_user = true` Viewer
- `[x]` Multiple active company memberships block login until cleaned up.
- `[x]` Header navigation is role/capability gated.
- `[x]` SuperAdmin can View As a company for support testing.

### Clients

- `[x]` `/clients` client roster.
- `[x]` Company-scoped roster memory with explicit user override tracking for view/calendar defaults.
- `[x]` Program/status filters with shared visual mapping.
- `[x]` CSM and secondary assignee filters.
- `[x]` Offer filter from `backup_company_offers`.
- `[x]` Server-side sorting by client name, onboarded date, and renewal date.
- `[x]` CSM users only see assigned clients, including secondary assignee matches.
- `[x]` Viewer role hides Quick Update.

### Client Detail

- `[x]` `/clients/:clientId` detail page.
- `[x]` Client details date formatting and client age in days.
- `[x]` Contract tab wired to current client contract fields and `backup_company_clients_contracts`.
- `[x]` Older contracts collapse behind an expanded list.
- `[x]` Contract tab loads app-owned `client_contracts` for pilot/migrated clients, supports create/edit/archive/delete for V1 permissions, and filters Active/Old/Archived/All.
- `[x]` Program and Outcomes tabs.
- `[x]` Pathways & Milestones tab resolves offer IDs and milestone rows.
- `[x]` Tasks tab wired to `backup_company_clients_tasks`.
- `[x]` CSM users cannot open unassigned clients directly.
- `[x]` Director Notes hidden from Support, CSM, and Viewer.

### Tasks

- `[x]` `/tasks` top-level task workspace.
- `[x]` Company selector for SuperAdmin.
- `[x]` Company users are locked to their company.
- `[x]` Dependent CSM/View As filter.
- `[x]` Open / All / Closed task modes.
- `[x]` Board and List views.
- `[x]` CSM users only see assigned tasks.

### Dashboard

- `[x]` `/dashboard` executive command center.
- `[x]` Overview tab with KPI groups.
- `[x]` Charts tab with Supabase-backed charts.
- `[x]` AI Insights placeholder.
- `[x]` Offer filter across dashboard data.
- `[x]` SuperAdmin/Director can see AI Insights.
- `[x]` Support can view/filter company-wide KPIs but cannot access AI Insights.
- `[x]` CSM dashboard is scoped to assigned clients/tasks.

### SuperAdmin SaaS Clients

- `[x]` `/saas-clients` read-only SaaS client/company view.
- `[x]` Active and Archived company filters.
- `[x]` Add New SaaS Client modal opens for UX testing with Submit disabled.
- `[x]` `/saas-clients/:companyId` details page.
- `[x]` Team tab reads `backup_company_team`.
- `[x]` Team role labels use `role_id` mapping with Viewer override.
- `[x]` New Team Member modal opens for UX testing with Submit disabled.
- `[x]` View As company support flow.

## Next Product Areas

### Write Mode And Security

- `[ ]` Decide when RetainOS moves from read-only preview to controlled write mode.
- `[ ]` Define Supabase RLS/server-side enforcement before enabling writes.
- `[ ]` Replace disabled Submit buttons with real write flows only after write-mode approval.
- `[ ]` Add audit/logging expectations for writes.

### Data Model And Supabase-Native Schema

Source: Glide data-model walkthrough and screenshot shared on 2026-05-29.

The current Glide model starts with Companies. Companies own team members, groups, clients, offers, on-demand prompts, call types, and company-level configuration. Clients can then own contracts, tasks, history, milestone progress, and calls. Tasks and calls should also be able to exist at company level without being tied to a client.

- `[x]` Core mirror model understood:
  - Companies / SaaS Clients.
  - Team Members: Director, Support, CSM, Viewer.
  - Clients.
  - Offers and offer milestones.
  - Client contracts.
  - Client tasks.
  - Client milestone progress.
- `[~]` `[polish]` Current RetainOS read-only wiring uses mirrored backup tables for companies, team, clients, offers, milestones, contracts, tasks, and dashboard data.
- `[ ]` Create app-owned schema plan before write mode.
  - Decide which mirrored Glide tables remain temporary read sources.
  - Decide which RetainOS-owned Supabase tables become write sources of truth.
  - Define migration/backfill path for each product area.
- `[ ]` Normalize company custom fields into an app-owned table instead of keeping seven fixed custom-field columns on the company record.
- `[ ]` Add app-owned groups model.
  - Company owns groups.
  - Groups can contain many clients.
  - Clients can belong to groups through a join table.
- `[ ]` Add company call types table for Call AI / call tracking.
- `[ ]` Add company on-demand prompts table if existing mirrored prompt data is not sufficient for write mode.
- `[ ]` Add Call AI tables:
  - Calls, optionally linked to a client.
  - On-demand analysis outputs.
  - Comments / review notes on calls.
- `[ ]` Make tasks company-level first-class objects with optional client linkage.
  - Client detail should show client-linked tasks.
  - Tasks page should also support company-level tasks.
- `[ ]` Add client history / change-log table for profile edits, quick updates, milestone changes, contracts, tasks, and other write flows.
- `[ ]` Add CSV client import staging and preview tables for future bulk import.
- `[ ]` Define client profile completeness and client progress completeness as app-owned calculations.
  - Decide whether these are stored snapshots, database views, or recalculated on read.
- `[?]` Replace Glide helper tables with Supabase-native queries/views where possible:
  - Group Search.
  - Client Search.
  - Main Dashboard.
  - Call AI Dashboard.
  - CSM Reports.
  - Tasks Dashboard.
- `[?]` Define reference-data strategy:
  - Support/resources articles.
  - Choices / lookups / dropdowns.
  - AI prompt library.
- `[?]` Confirm whether tasks and calls should share one consistent company-level ownership pattern with nullable `client_id`.

### SuperAdmin Company Management

- `[ ]` Create SaaS Client write flow.
- `[ ]` Edit SaaS Client details.
- `[ ]` Pause SaaS Client access while preserving data.
- `[ ]` Archive/offboard SaaS Client from normal views.
- `[ ]` Manage subscription tier:
  - Starter
  - Growth
  - Pro/Enterprise/DFY
- `[?]` Confirm fields that should live on `backup_companies` versus future app-owned tables.

### Company Team Management

- `[x]` Create Team Member write flow.
  - Enabled for Ethical Scaling pilot/app-owned companies through `manage-company-member`.
- `[x]` Edit team member role.
- `[x]` Edit team member capacity.
- `[x]` Remove/archive team member access.
- `[x]` View archived team members.
- `[ ]` Restore/unarchive archived team member.
- `[x]` Support Director/Support “does not manage clients” behavior via `role_hide_from_csm_list`.
- `[?]` Define capacity formula and display:
  - Low-fi formula referenced: 30-day active clients minus expiring clients divided by total capacity.
  - Needs data validation before implementation.

### Company Customization

- `[x]` Company Customization tab.
  - App-owned outcome definitions, company custom fields, churn reasons, and basic settings are editable for pilot/migrated companies.
  - Mirror-only companies remain read-only from Glide.
  - 2026-06-15 closeout grouped outcome definitions, recurring custom fields, and churn reasons in Customization; Company Settings points those definition areas back to Customization instead of duplicating placeholders.
- `[x]` Custom fields.
  - Definitions are configured at company level and consumed in Quick Update and Client Detail > Outcomes for pilot/migrated companies.
- `[x]` Outcome definitions.
  - Existing outcome type/value structure is constrained; SuperAdmin/Director can edit labels/ordering from Customization.
- `[x]` Churn reasons.
  - Empty company configs seed Financial, Overwhelm, Paused, Spousal, Uncertainty, and Other without overwriting companies that already have rows.
- `[ ]` AI custom prompts.
- `[ ]` Fixed/dynamic AI prompt management.
- `[?]` On-demand AI prompt editing is SuperAdmin only and likely limited to Pro/Enterprise tiers.
- `[x]` Company settings.
  - V1 saves profile upkeep freshness days, default client view, default calendar mode, secondary assignee flag, Call AI for CSMs flag, embed flag, and Zapier client-create flag.
  - Company notification preferences are editable for Daily Pulse/bell visibility plus onboarding checkpoint/check-in and strategic review timing.
  - Client workspace defaults now drive Clients roster starting view, Clients calendar starting mode, and CSM Reports Field Upkeep freshness window for pilot/migrated companies.
  - V1 QA passed on 2026-06-08 after fixing stale roster cache behavior.
  - 2026-06-13 polish clarified section copy and tucked the integration review queue into a lower-noise operations drawer.
  - V1 closeout passed on 2026-06-15; dashboard/client-list preference expansion, client list column presets, and call/communication settings live in Company Settings V2.

### Pathways And Milestones Management

- `[~]` `[polish]` SuperAdmin/company Pathways & Milestones configuration tab.
  - V1 is implemented in Admin Hub / SaaS Company Detail for pilot companies.
  - Mirror-only companies see the same configuration read-only from Glide.
- `[~]` `[polish]` New Offer / Milestone flow.
  - V1 supports names, milestone ordering position, target days, time-to-value, and final-milestone flags.
- `[~]` `[polish]` Edit / archive Offer and Milestone flow.
  - Archiving is blocked while active clients are assigned to the item.
  - Move up/down ordering controls and restore/unarchive are live.
  - Drag/drop ordering is intentionally deferred as later UI/UX polish.
  - Secondary offers are intentionally deferred until the primary pathway flow is fully validated.
- `[x]` Define whether offer/milestone writes go back to Glide mirror tables or new app-owned tables.
  - Do not mutate `backup_*`.
  - V1 writes client progress to app-owned `client_milestones`.
  - Company offer/milestone template CRUD uses app-owned `company_offers` and `company_offer_milestones`.
- `[~]` `[polish]` Client-level Pathways & Milestones progress writes.
  - Enabled for app-owned pilot/migrated clients through `manage-client-milestone`.
  - SuperAdmin/Director can change a client's current offer/pathway and milestone company-wide.
  - Assigned CSMs can assign/change primary or secondary pathways and milestones, then start and complete milestones, for their assigned clients only.
  - 2026-07-13 authorization correction shipped in `42c4835`: frontend and `manage-client-milestone` now enforce the assigned-CSM behavior; final live CSM QA remains before closing the temporary Phase 1B fixture.
  - Timeline UI must stay scoped to the client's active offer/pathway.
  - UX should later be rebuilt to match the shared low-fi workflow.

### Client Writes

- `[ ]` New Client form.
- `[ ]` Zapier client creation webhook.
  - Webhook must include SaaS account `company_id`.
  - Server must reject requests without a valid `company_id`.
  - Server must create the client only under the matching SaaS Client/company.
  - Admin/Integration UI should expose the Company ID and setup guidance for Directors/Support.
- `[ ]` Calendar view for clients.
- `[ ]` Edit Client Details.
- `[~]` `[polish]` Quick Update write flow.
  - Pilot saves app-owned quick update events without changing mirrored client fields.
- `[x]` Client Offboarding flow.
  - 2026-06-17 audit: current Client Detail UI uses `manage-client-status` to mark app-owned clients as `off-boarded`, save offboarded date/churn context, and write history/audit events; Jay QA passed with Josh Garvey assigned to Ben.
  - 2026-06-20 RetainOS upgrade deployed: offboarding now uses an actual end date instead of save time, computes churn against current contract end, conditionally requires churn reason/notes, captures offer-fit, and stores an `offboarding` metadata packet. Jay QA is queued for this richer flow.
  - `manage-client-offboard` is legacy unless intentionally revived.
- `[~]` `[polish]` Client update history view.
  - Pilot view reads `client_history_events`; full Glide-style audit/change log is still future work.
- `[ ]` Track call attendance.
- `[~]` `[polish]` Task create/edit/complete/dismiss flows.
  - 2026-06-18 local Tasks V1.5 pass adds edit/complete/reopen/dismiss/archive/status-drag behavior for app-owned companies.
  - Needs `manage-client-task` deploy and Jay QA before closure.
- `[x]` Contract create/edit flow.
  - Create/edit/archive are live locally through `manage-client-contract`.
  - 2026-06-15 Jay QA passed create/edit/archive/delete, Contract tab filters, current-summary display cleanup, and expected duration/date calculation polish after successful Supabase deploys.
- `[ ]` Meeting transcript / Call AI creation flow.
- `[ ]` Delete Forever client for SuperAdmin and Director.
- `[?]` Confirm which write flows must sync back to Glide versus become RetainOS-native.

### Dashboard And AI

- `[~]` `[polish]` CSM Reports dashboard.
  - V1 focuses on profile update compliance, not AI summaries.
- `[~]` `[polish]` CSM Reports filters.
- `[ ]` Replace AI Insights placeholder with approved generation path.
- `[ ]` Define dashboard AI prompt inputs and stored output format.
- `[ ]` Add dashboard export/share behavior if needed.
- `[ ]` Improve dashboard visual polish after high-fidelity pass.

### Formula And Computed Field Migration

Source: `Datasheet - Ethical Scaling - Formulas.csv`.

Working validation spec: `DASHBOARD_FORMULA_VALIDATION.md`.

Draft SQL starting point: `DASHBOARD_CANONICAL_RPC_DRAFT.sql`.

These formulas matter when RetainOS moves away from read-only Glide mirror fields into Supabase-only write mode.

- `[~]` `[polish]` Current contract end / renewal date.
  - Current state: mostly read from mirrored fields, with UI fallback calculations in Client Detail and Dashboard.
  - Future need: app-owned computed contract end date from start date + contract days, plus renewal date indexing/filtering.
  - Future idea: offer-level default contract duration templates, e.g. Ethical Scaling Optimized Journey defaults to 91 days.
- `[~]` `[polish]` Churn Percentage.
  - Formula source: `# of Customers Lost During Period / # of Customers at Start of Period x 100`.
  - Current state: dashboard computes churn via the app-owned formula path for pilot/migrated companies; canonical RPC v1 has been applied and smoke-tested but the UI has not fully switched to it yet.
  - Future need: finish UI migration to canonical Supabase calculation shared by KPI cards, reports, and AI summaries.
- `[~]` `[polish]` Retention Percentage.
  - Formula source: `# of Renewals / Total # of Clients Eligible for Renewal x 100`.
  - Current state: dashboard computes retention through the app-owned formula path for pilot/migrated companies and includes `client_retention_recorded` events.
  - Renewal/retention transitions: Front End -> Front End, Front End -> Back End, and Back End -> Back End.
  - Front End -> Back End should be broken out as renewal/upsell.
  - Pilot v1: New Contract can write `client_retention_recorded` for same-program renewals and FE -> BE upsells.
  - Future need: high-fidelity renewal action and reporting breakdowns.
- `[~]` `[polish]` Success Rate.
  - Count success when the Success outcome is marked yes.
  - Prompt CSMs to update success when final milestone completes, client offboards after contract end, or client renews.
  - Pilot v1: New Contract renewal/upsell flow includes a Mark Success checkbox.
- `[ ]` Average Time to Success.
  - Formula: success marked yes date minus onboarded/date-added-to-app date.
- `[~]` `[qa]` Average Time to Value / TTV.
  - Admin Hub > Pathways & Milestones stores the active Time to Value milestone per pathway/offer.
  - Dashboard > Overview > Journey shows Avg. Time to Value, reached count, and configured TTV points.
  - Formula: TTV milestone completion date minus client onboarding/start date, averaged across clients who reached a configured active TTV milestone in the selected filters.
  - Client Detail > Pathways & Milestones labels configured TTV milestones in the milestone timeline.
- `[ ]` Average Time to Success per CSM.
  - Future need: same definition as Avg Time to Success, grouped by assigned CSM.
- `[ ]` Current Capacity.
  - Future need: canonical formula for team member capacity and 30-day forecast.
  - Related roadmap item: Team capacity management.
- `[ ]` AR Status.
  - Future need: define source of accounts receivable/payment status and integration dependency.
- `[ ]` Profile Updated Score.
  - Use active clients only.
  - Score as percent of required fields refreshed within the company freshness window.
  - Default freshness window: 14 days.
  - Required fields: Next Steps, Milestone, Date of Last Contact, Date of Next Contact, Progress, and Buy-in.
- `[ ]` Engagement and Feedback actual average.
  - Future need: define feedback inputs, scoring scale, and aggregation window.
- `[ ]` Client Sentiment, CSM Sentiment, and Call Score.
  - Future need: AI/Call AI analysis outputs and storage model.
  - Related roadmap items: Call AI, AI Prompt Inventory, OpenRouter integration.
- `[?]` Decide formula implementation layer:
  - Database views / RPCs for canonical reporting.
  - Edge Functions for AI-driven or workflow-driven computed values.
  - Client-side fallbacks only for display, not source-of-truth write mode.
  - Current status: `dashboard_kpi_counts_canonical` v1 was added in `20260605103000_dashboard_kpi_counts_canonical.sql` and smoke-tested on Ethical Scaling.
  - QA passed on 2026-06-06 for the full Ethical Scaling result and Front End-only program filter; returned values matched the expected baseline.
  - Current recommendation: finish moving dashboard/reporting metrics into Supabase RPCs/views, with client-side code only formatting and drilling into the returned data.

### Notification System

Source: `Datasheet - Ethical Scaling - Notifications.csv`.

Guiding note from source: keep notification triggers simple and avoid spamming users; target 15 triggers or fewer.

- `[~]` `[polish]` Define notification infrastructure.
  - V1 in-app notification storage exists in `notifications`.
  - V1 preference storage exists in `notification_preferences`; email is disabled by default.
  - V1 generation covers next contact, renewal, paused return, and client-linked task due reminders for pilot/migrated companies.
  - Local Clients-page bell/dropdown prototype is the preferred UX direction after Jay QA; global bell placement and full inbox still need final design/build.
  - Company-level in-app visibility preferences are editable from Company Settings for pilot/migrated companies and consumed by the Clients bell and Daily Pulse.
  - Peak Diagnostic timing now supports one-time or recurring behavior for company-specific operating rhythms.
  - Read/unread, dismiss UX, bell counts, email delivery, future push channel, and mature unsubscribe/preference rules remain future slices.
- `[ ]` `[priority: medium]` Daily Pulse should reuse notification/workflow signals without becoming a dismissible inbox.
  - Treat it as the CSM start-of-day operating page for Today, This Week, and This Month.
  - Keep it persistent and expandable, while notifications remain event/reminder-driven and dismissible.
- `[ ]` `[priority: medium]` Unassigned new client reminder.
  - Trigger: active/newly created client has no Primary CSM after creation or automation intake.
  - Recipient: Director/Admin owner for the company.
  - Channels: in-app first; email/push later when notification delivery matures.
  - UX: link to Clients with `CSM = Unassigned` so the assignee can review and assign from Client Detail > Edit Profile.
- `[ ]` `[priority: medium]` New client assigned to CSM notification / acknowledgement.
  - Trigger: a client's Primary CSM changes from blank or another member to this CSM.
  - Recipient: CSM.
  - Channels: in-app first; email/push later when notification delivery matures.
  - UX: link to the assigned client profile and optionally include an acknowledgement/read state when notification inbox work exists.
  - Current fallback: assigned CSMs see the client in their scoped Clients roster and can use Daily Pulse / Tasks for operating work; no CST-style popup exists today.
- `[ ]` Client at risk of churn.
  - Recipients: CSM and Director.
  - Channels: push, email, in-app.
  - Depends on churn-risk formula/definition.
- `[ ]` Overdue task.
  - Recipient: assigned/related user.
  - Channels: push, email, in-app.
  - Depends on task write/status system.
- `[ ]` Client up for renewal in next 30 days.
  - Recipients: CSM and Director.
  - Channels: push, email, in-app.
  - Depends on canonical contract end / renewal date formula.
- `[ ]` Client has Revenue Generating Activities available.
  - Recipient: CSM.
  - Channels: push, email, in-app.
  - Depends on RGA likelihood formula definition.
- `[ ]` Client achieved all milestones and is ready for upgrade.
  - Recipients: CSM and Director.
  - Channels: push, email, in-app.
  - Depends on milestone completion write model.
- `[ ]` Client offboarded in last 30 days.
  - Recipient: Director.
  - Channel: email.
- `[ ]` Client paused / suspended.
  - Recipient: Director.
  - Channel: email.
- `[ ]` Next contact date expiring.
  - Recipient: CSM.
  - Channel: email.
- `[ ]` SaaS Client reaches 7, 14, or 20 days without activity.
  - Recipient listed in source: CSM.
  - Channel: email.
  - Needs clarification: likely company Director/SuperAdmin may also need this.
- `[ ]` Team capacity at 99%.
  - Recipient: Director.
  - Channel: email.
  - Depends on team capacity formula.
- `[ ]` Semi-monthly risk/renewal/RGA digest.
  - Schedule: 1st and 14th day of each month.
  - Recipients: CSM and Director.
  - Channel: email.
  - Contents: clients at churn risk, clients up for renewal, RGAs.
  - Related roadmap area: Reporting, Exports, And Imports.
- `[ ]` Weekly CSM Metrics email.
  - Schedule: every Monday.
  - Recipient: Director.
  - Channel: email.
  - Contents:
    - Avg. Time to Success per CSM.
    - Updated vs. non-updated profiles.
    - CSM workload vs. capacity.
    - Churn sources.
    - Renewed opportunities by month/CSM.
    - Effort score by CSM.
    - Link to full report.
  - Related roadmap area: Reporting, Exports, And Imports.
- `[?]` Decide notification engine.
  - Supabase scheduled functions.
  - N8N workflows.
  - Hybrid with Supabase for source-of-truth notifications and N8N for delivery/orchestration.
- `[?]` Confirm final recipients and channels before implementation.

### Reporting, Exports, And Imports

- `[ ]` Define report template architecture.
  - Start with 2 template types.
  - Inputs should come from canonical Supabase reporting views/RPCs, not ad hoc client calculations.
  - Templates should support future branding/customization by company if needed.
- `[ ]` Reports PDF generation.
  - Decide rendering approach: server-side HTML-to-PDF, third-party PDF service, or workflow engine.
  - Store generated report metadata and delivery history.
- `[ ]` Semi-monthly clients-at-risk / renewals / RGAs report.
  - Schedule: every 1st and 14th.
  - Recipients: CSMs and Director.
  - Output: PDF.
  - Related notifications item: semi-monthly risk/renewal/RGA digest.
- `[ ]` Weekly CSM Metrics report.
  - Schedule: every Monday.
  - Recipient: Director.
  - Output: PDF.
  - Contents include Avg. Time to Success per CSM, Updated vs. Non-Updated Profiles, and other metrics from the data sheet.
- `[ ]` Custom HTML export of Dashboard.
  - Decide whether export is a static dashboard snapshot, shareable report page, or downloadable HTML file.
- `[ ]` CSV upload and parse.
  - Needed for client imports and future bulk data tools.
  - Include preview, validation, error handling, and rollback expectations.
- `[ ]` User bulk upload.
  - Needed for team/user onboarding at scale.
  - Must respect role mapping, company assignment, duplicate emails, and invite/provisioning flow.

### Integrations

Source: `Datasheet - Ethical Scaling - Integrations.csv`.

- `[x]` Supabase.
  - Current use: Auth, backup tables, Edge Functions, deployed `prepare-login`.
  - Next needs: custom SMTP config, RLS/security model before write mode, app-owned tables decision.
- `[ ]` Postmark.
  - Intended use: custom SMTP / transactional email for OTP and later notifications.
  - Immediate value: remove Supabase built-in email bottleneck such as 2 emails/hour.
  - Needs: account access, SMTP credentials, sender/domain verification, production limits.
- `[ ]` OpenRouter.
  - Intended use: AI Insights, Call AI summaries, prompt-based analysis.
  - Needs: model choice, API key, prompt strategy, storage format for generated outputs, usage/cost guardrails.
- `[ ]` N8N.
  - Intended use: automation/orchestration layer for background workflows and integrations.
  - Needs: hosting plan, API access, workflow ownership model, security review for secrets.
- `[ ]` Zapier.
  - Intended use: lightweight no-code automations if N8N is not used for a specific workflow.
  - Needs: decide whether Zapier is a fallback/bridge or a long-term integration surface.
  - Required before broader live rollout if companies need automated client creation.
  - Client creation webhook must include the SaaS account `company_id`.
  - `company_id` is generated when the SaaS Client/company is created and must be copied into the Zap configuration by Director or Support during setup.
  - RetainOS must validate `company_id` server-side before creating the client so new clients route to the correct SaaS Client.
  - Add clear setup instructions in the Admin/Integration UI so teams know where to find and copy the Company ID.
- `[x]` Company-specific integration token management.
  - 2026-06-13: Admin Hub > Company Settings now has a SuperAdmin-only Integration Tokens area for pilot/migrated companies.
  - Supports generating one-time raw tokens, listing active/revoked tokens, revoking one token, and revoking all active tokens for SaaS offboarding.
  - Tokens are stored hashed in `company_integration_secrets`; raw token is only shown once at creation.
  - 2026-06-13 QA fix: generated tokens now stay visible in a one-time copy panel long enough to copy, with explicit copy/dismiss UX.
  - 2026-06-13 resource wiring: RetainOS Help integration pages show whether an active token exists for the selected company and display only token prefixes after creation.
  - This is the RetainOS-side kill switch for inbound webhooks. It prevents writes/processing after offboarding, but teams must still disable customer Zaps/N8N workflows to stop automation task charges at the source.
  - 2026-06-17 kill-switch QA passed for `client_create`, `call_summary_next_steps`, and `client_update`: revoked tokens return 401 and do not process writes/intake. Same-token/different-company misuse is a final migration-day QA gate once a second app-owned company exists.
- `[?]` Decide integration boundary:
  - Which workflows should live inside RetainOS/Supabase Edge Functions.
  - Which workflows should live in N8N or Zapier.
  - Which AI calls should be direct from Supabase functions versus routed through automation.

### AI Prompt Inventory

Source: `Datasheet - Ethical Scaling - Prompts.csv`.

- `[ ]` AI usage launch sequencing.
  - AI functions can launch after live.
  - Full AI automation is not non-negotiable for the first 2-3 migrated companies.
  - Before AI launch, RetainOS still needs stable data capture so future AI outputs have reliable inputs.
- `[ ]` Fixed prompt system.
  - SuperAdmin only.
  - Not editable by Directors.
  - Intended owner/editor: Jay / SuperAdmin.
  - Based on Jay's analysis of 3,000+ client calls over several years.
  - Runs for every company.
  - Fixed prompt types:
    - Summary prompt.
    - Title prompt.
    - Red flag prompt.
    - Green light prompt.
    - Client sentiment prompt.
    - CSM sentiment prompt.
    - Call score prompt.
    - Archetype prompt.
- `[ ]` Company-specific prompt system.
  - Available only to Pro/Enterprise subscription tiers.
  - Requested by the client.
  - Built by the CST Dev Team.
  - Deployed at the company level.
  - Not editable directly by Directors.
  - Limited to one custom prompt per company unless product scope changes.
  - Can be configured as:
    - Auto-run prompt that runs for every call for that company.
    - On-demand prompt triggered manually for specific calls, such as escalation analysis.
- `[?]` Decide how prompt ownership is represented in the data model:
  - Global fixed prompts.
  - Company-level custom prompts.
  - Prompt versioning.
  - Prompt deployment status.
  - Subscription-tier enforcement.
- `[ ]` Client `Next Step Summary`.
  - Target surface: client profile or client summary.
  - Input: assigned account manager notes / next steps.
  - Expected output: concise two-bullet manager-facing next-step summary, stripped of JSON/rich text.
- `[ ]` CSM Report `Green Clients Summary`.
  - Target surface: CSM Reports.
  - Input: notes for clients with green buy-in and green progress.
  - Expected output: max three-sentence Hemingway-style summary beginning with `Clients are ...`.
- `[ ]` CSM Report `Yellow Clients Summary`.
  - Target surface: CSM Reports.
  - Input: notes for clients with yellow buy-in and yellow progress.
  - Expected output: max three-sentence Hemingway-style summary beginning with `Clients are ...`.
- `[ ]` CSM Report `Red Clients Summary`.
  - Target surface: CSM Reports.
  - Input: notes for clients with red buy-in and red progress.
  - Expected output: max three-sentence Hemingway-style summary beginning with `Clients are ...`.
- `[?]` Decide prompt storage model:
  - Fixed prompts managed only by SuperAdmin.
  - Company-specific prompts built by CST Dev Team, not Director-editable.
  - Prompt versioning and output audit/history.
- `[?]` Decide AI execution path:
  - Direct Supabase Edge Function calling OpenRouter.
  - N8N/Zapier orchestration.
  - Hybrid approach depending on workflow.

### Login And Access Polish

- `[~]` `[polish]` Low-fi RetainOS login page is live.
- `[ ]` High-fidelity login redesign.
- `[ ]` Custom SMTP setup for reliable OTP/PIN delivery, likely via Postmark.
  - Verify a RetainOS sender address and the `retainos.ai` sending domain.
  - Configure Supabase Auth SMTP credentials and production email templates.
  - Validate delivery, spam placement, resend behavior, and production rate limits.
- `[ ]` Consider Google login after auth hierarchy is stable.
- `[ ]` Better no-access and multi-company access issue screens.

### UX / High-Fidelity Pass

- `[~]` `[polish]` Full UI pass for login.
- `[~]` `[polish]` Full UI pass for authenticated shell.
- `[ ]` Full UI pass for Dashboard.
- `[~]` `[polish]` Full UI pass for Clients and Client Detail.
  - 2026-06-16 Clients filter polish adds an unsaved-filter cue and no-results recovery action. Jay QA passed the cue, no-results recovery copy, and `Clear filters` reset flow.
  - 2026-06-20 Clients filter controls now cover the core Glide CST operational use cases in RetainOS terms: pathway, milestone, renewal timing, contact cadence, and health/outcome signals.
- `[ ]` Full UI pass for Tasks.
- `[~]` `[polish]` Full UI pass for SuperAdmin SaaS Clients.

### High-Fidelity Design Reference

Source: scoping team high-fidelity screen examples and design-system references shared on 2026-05-29.

This phase should happen after core wiring/write-mode foundations are stable. Use these references to guide the UI upgrade rather than rebuilding visuals before the product flows are validated.

- `[ ]` Sign-in screen high-fidelity pass.
  - Background photo treatment.
  - Centered translucent login panel.
  - RetainOS logo.
  - Email/PIN fields.
  - Google sign-in visual treatment, if Google SSO is enabled.
- `[ ]` Authenticated shell high-fidelity pass.
  - Deep navy left sidebar.
  - Top search/header bar.
  - User avatar/profile menu.
  - Notification indicator.
  - Dark mode toggle visual.
- `[ ]` SaaS Clients high-fidelity pass.
  - Card grid.
  - Active/Paused/Archived tabs.
  - Add SaaS Client modal.
  - SaaS Client details shell.
- `[ ]` Company/team high-fidelity pass.
  - Team member cards.
  - Director/CSM grouping.
  - Capacity pills.
  - Company detail tabs.
- `[ ]` Company customization high-fidelity pass.
  - Call AI prompts cards.
  - Custom field cards.
  - Outcome definitions editor.
  - Churn reasons editor.
- `[~]` `[polish]` Dashboard KPI high-fidelity pass.
  - KPI cards.
  - KPI/Charts/CSMs/AI tabs.
  - Export button.
  - Filters for user, date range, program, offer where applicable.
- `[ ]` Dashboard chart visual/data Phase 2.
  - Use Recharts with a clean shadcn-chart-inspired visual treatment.
  - Use the existing RetainOS HiFi palette and keep labels visible for the first pass.
  - Preserve existing clickable chart drill-through behavior and extend it where planned.
  - Program Distribution: donut.
  - Buy-in: donut.
  - Progress: donut.
  - Clients By Offer: modern horizontal/vertical bar chart with drill-through. `[qa]` With an Offer filter applied, this same chart switches to Clients By Milestone so teams can spot milestone bottlenecks inside the selected offer/pathway.
  - Avg. Time to Value appears on Dashboard > Overview > Journey and should be validated against migrated client milestone completion data.
  - Tasks By Status: bar chart with future clickable task-detail/filter modal.
  - CSM Active Client Workload: bar chart.
  - Treat actionable metrics shown in the HiFi prototype as future wiring scope, not disposable invented content.
  - Add canonical formulas/data sources before exposing unwired metrics.
- `[ ]` Dashboard CSM high-fidelity/data pass.
  - Avg. Time to Success chart.
  - Updated vs. Non-Updated Profiles chart.
  - CSM Workload & Capacity chart.
  - Churn Reason chart.
  - Renewal Opportunities chart.
  - Offboarding by CSM chart.
- `[~]` `[polish]` Client screens high-fidelity pass.
  - Client roster views.
  - Client detail sections.
  - Merge the existing working milestone-progress controls into the HiFi Quick Update modal styling.
  - Keep pathway changes on the full Client Detail page.
  - Preserve the richer pilot New Client setup fields while applying the HiFi styling.
  - Contract, program, outcomes, pathways/milestones, tasks, and history tabs.
- `[ ]` Accessibility check.
  - Validate color contrast for all core text/background and CTA combinations.
  - Known note: light blue `#59ABF0` with white text did not pass accessibility checks.
  - Known passing combinations include deep navy `#162B3E` with gray/light text and deep navy with white text.
- `[ ]` Color palette tokens.
  - Primary: Deep Navy `#162B3E`.
  - Secondary: Muted Lavender Gray `#BBBEC C` appears in one source image, but the explicit RGB value is `RGB(187, 190, 204)`, so canonical token should be `#BBBECC`.
  - CTA/highlight: Modern Sky Blue `#59ABF0`.
  - Main background: `#F6F8FB`.
  - Success: pressed `#066042`, hovered `#04724D`, default `#2DB585`, surface `#EDFDF8`.
  - Warning: pressed `#353640`, hovered `#62636A`, default `#EBEBEC`, surface `#F8F8F8`.
  - Danger: pressed `#981B25`, hovered `#BA2532`, default `#E02D3C`, surface `#FEF1F2`.
  - Neutral: hover `#05070B`, title `#0D121C`, subtitle `#364152`, body `#4B5565`, placeholder `#6C7684`, disabled `#E3E8EF`, borders `#EEF2F6`, surface `#F8FAFC`.
- `[ ]` Typography tokens.
  - Font family: Montserrat.
  - Weights: 400 regular, 500 medium, 600 semibold, 700 bold.
  - Heading scale from 72px down to 24px.
  - Body scale: XL 20px, L 18px, M 16px, S 14px, XS 12px.
  - Note: current frontend guidance says do not use negative letter spacing; reconcile source typography tracking values before implementation.
- `[ ]` Desktop grid.
  - 1440px layout reference.
  - 320px sidebar.
  - 1120px content region.
  - 12 columns.
  - 40px margin.
  - 20px gutter.
- `[late]` `[priority: low]` Replace inline/prototype brand icons with final production logo assets during a pilot UI revision.
  - RetainOS wordmark.
  - RetainOS circular arrow mark.
  - Light, deep navy, and sky blue logo treatments.
  - Prefer SVG assets for the full wordmark, icon-only mark, light version, dark/navy version, and favicon.
- `[ ]` Post-pilot company configuration and commercial model.
  - Company-defined churn reasons.
  - Real subscription tiers and tier-based feature flags.
  - Company customization settings and their canonical data sources.

## Final Migration Validation

Source: Glide Client Success Tracker walkthrough transcript shared on 2026-05-29.

Use this section as the “what good looks like” checklist before migrating real companies from Glide into RetainOS. The goal is not only matching screens; the goal is proving a company can run the same fulfillment operating rhythm in RetainOS without losing accountability, reporting, or quality control.

### Client Roster And Alerts

- `[ ]` Client page has an alert center for:
  - Offboardings.
  - Pauses / suspensions.
  - Scheduled contact reminders due today.
  - Newly added clients.
- `[x]` Client page supports filtering and searching by client name and email.
- `[x]` Client page supports card/detail and list views.
- `[ ]` Client page supports contact calendar view populated from next contact dates.
- `[ ]` List view supports operational sorting by last contact date and next contact date.
- `[~]` `[polish]` List view supports onboarded date and renewal date sorting.
- `[ ]` Client cards show at-a-glance fulfillment context:
  - Offer.
  - Current milestone.
  - Progress / buy-in.
  - North Star.
  - Notes and next steps.

### Client Profile Operating Workflow

- `[x]` Client profile shows core details, program, outcomes, pathways/milestones, contracts, and tasks in read-only mode.
- `[~]` `[polish]` Client profile supports editing source-of-truth fields once write mode is approved.
  - Pilot v1 edits app-owned `clients` only and writes a `profile_update` history event.
- `[~]` `[polish]` Client profile supports external links such as Slack channel, Google Drive folder, CRM, and other client resources.
  - 2026-06-10 Moves readiness pass adds a simple read-only Client Links section on Client Details.
  - It detects common diagnostics, Google Drive, and external-link fields from app-owned or CST mirror data.
  - 2026-06-11: app-owned `client_links` table and `manage-client-link` function added for pilot/migrated companies, with create/archive UI on Client Detail. Mirror-only companies remain read-only.
  - Remaining gap: QA across roles and decide any richer link categories before wider migration.
- `[x]` Client profile supports company custom fields.
  - Values are editable under Client Detail > Outcomes.
  - Client Details tab intentionally does not show them for v1 because these are recurring update fields, not static profile metadata.
  - 2026-07-02 Loom polish: Client Detail > Outcomes custom fields are collapsed behind an expandable section with filled-field count; Quick Update custom fields are unchanged.
- `[x]` Client profile supports up to three email addresses for integration matching.
  - 2026-06-20 added primary + two alternate email slots on app-owned clients. Call Summary / Next Steps, Client Update Webhook, New Client Webhook, and Integration Review matching now use all three while keeping ambiguous matches in review.
- `[ ]` Client profile supports call attendance tracking.
- `[ ]` Client profile supports progress and buy-in updates.
- `[x]` Client profile supports testimonials, reviews, referrals, renewal/upsell asks, and related client outcomes.
  - 2026-06-21 build: added app-owned `client_advocacy_events`, client advocacy summary fields, Quick Update and Client Detail > Outcomes Advocacy & Growth panels, Dashboard > Overview Advocacy & Growth reporting, legacy Glide backfill, and generic company migration script mapping. Jay QA passed the Client Detail write, Dashboard Overview display/filters, and Quick Update order correction.
  - 2026-06-21 Client Advocacy Triggers follow-up: Clients now has app-owned Review, Testimonial, Referral, and Renewal / Upsell status filters (`Any`, `Not asked`, `Asked`, `Received`) that combine with existing roster filters. Jay QA needed before treating the filter follow-up as fully passed.
  - 2026-06-21 filter UI polish: advanced Journey/Contract, Health/Outcomes, and Advocacy/Growth filters are now collapsible sections with active-count badges to reduce filter-panel bulk. Awaiting Jay visual QA.
- `[ ]` Client profile supports notes and next steps updates at the CSM cadence.
- `[ ]` Client profile stores next steps and profile updates into history.
- `[ ]` Client profile supports AR status tracking.
- `[ ]` Client profile supports last contact and next contact updates.
- `[ ]` Contract area supports multi-contract value and LTV-oriented reporting.
- `[ ]` Contract area supports contract links.
- `[~]` `[polish]` Milestone area tracks milestone start and completion dates.
  - Pilot v1 tracks app-owned start/completion dates, duration, and time-to-hit in `client_milestones`.
  - Remaining gap: polish the low-fi workflow and wire milestone updates into Quick Update.
  - 2026-06-10 Moves readiness pass adds a compact journey visual for milestone progress and contract/program timing.
- `[~]` `[polish]` History tab shows the full interaction/change log:
  - Current app-owned History tab shows RetainOS Quick Update, notes, next steps, contact cadence, health scores, profile/status, offboarding, contract, pathway/milestone, advocacy/outcome, webhook, and integration-driven events where those write flows are live.
  - 2026-06-21 resource audit refreshed `understanding-the-client-history-log` as a RetainOS History tab guide, replacing old three-dot CST drawer language.
  - Remaining gaps:
  - AR status changes.
  - Call attendance.
  - Additional task history detail if users need a deeper task timeline.

### Quality Control Loop

- `[ ]` RetainOS supports the three-part QC workflow from Glide:
  - Dashboard for quantitative KPIs.
  - CSM Reports for system compliance.
  - Call AI for quality of calls and coaching standards.
- `[x]` Dashboard supports company, CSM, date, program/status, and offer-style filtering where currently wired.
- `[ ]` Dashboard supports cohort/date range filtering equivalent to Glide.
- `[~]` `[polish]` Dashboard includes active clients, upgrades, renewals, pauses, offboardings, churn percentage, retention, chart breakdowns, offboardings by CSM, and CSM workload where data is available.
- `[~]` `[polish]` Dashboard chart segments are clickable and can drill into the clients behind the number where wired.
- `[ ]` Dashboard supports CSM capacity if enabled for a company.
- `[ ]` Dashboard includes Call AI rollups:
  - Total calls processed.
  - Positive / neutral / negative breakdowns.
  - Call score trends.
- `[ ]` AI Insights can generate:
  - Key data summary.
  - Red flags / clients likely to churn, ghost, or need attention.
  - 30- to 60-day action plan.

### CSM Reports Validation

- `[ ]` CSM Reports can filter by today, last 7 days, last 30 days, and selected CSM.
- `[ ]` CSM Reports show updated versus total client counts.
- `[ ]` CSM Reports show green / yellow / red breakdowns.
- `[ ]` CSM Reports show most recent entry for each client:
  - Most recent notes.
  - Next steps.
  - Progress updates.
- `[ ]` CSM Reports prove coaches/CSMs are following the tracking cadence.

### Call AI Validation

- `[ ]` Call AI supports manual transcript upload/paste.
- `[ ]` Call AI supports selecting or matching the transcript to a client.
- `[ ]` Call AI stores transcript, summary, score, green lights, red flags, and action plan.
- `[ ]` Call AI scores agenda, CSM energy, story/support provided, and action plan out of 7 each, for a total score out of 28.
- `[ ]` Call AI results can be used by CSMs to update the client profile after a call.
- `[ ]` Fathom integration or equivalent can automatically ingest transcripts when ready.
  - 2026-06-10 Resources now includes setup-guide foundations for transcript payloads and call-summary/notes payloads. These are documentation/planning surfaces only; live ingestion, matching, AI analysis, and call history remain later.
  - 2026-06-11 update: the lighter call-summary-to-next-steps webhook is now implemented as `ingest-client-call-summary`; full transcript ingestion and AI analysis still remain later.
- `[ ]` Transcript-to-client matching works by client identity/email where possible.

### Migration Readiness

- `[ ]` A real company can complete one full client lifecycle in RetainOS:
  - Add/import client.
  - Assign CSM.
  - Track contract.
  - Track milestones.
  - Update notes and next steps.
  - Schedule next contact.
  - Complete tasks.
  - Analyze a call.
  - See updates reflected in dashboard, CSM Reports, and alerts.
- `[x]` Existing Glide data can be reconciled against RetainOS for a pilot company.
- `[x]` Ethical Scaling internal pilot is completed before external company migration.
- `[ ]` Low-volume external SaaS Client pilot is completed after Ethical Scaling.
- `[x]` Role access is validated for SuperAdmin, Director, Support, CSM, and Viewer on the full workflow.
  - 2026-06-17 packet created: `ROLE_ACCESS_VALIDATION_PACKET.md`.
  - Code audit source: `src/lib/accountContext.tsx`, route/nav gating, major pages, and `supabase/functions/manage-*` authorization paths.
  - 2026-06-17 Jay decisions applied: Viewer Dashboard is read-only with client drilldowns/search disabled; Support stays operational-only; integration review/tokens exclude Support; RetainOS Help drafts are SuperAdmin-only; Company Resource drafts are visible to Directors.
  - 2026-06-17 implementation passed `npm run build`; `manage-integration-review` was deployed after narrowing server-side access to SuperAdmin/Director.
  - 2026-07-04 Moves Method Director QA catch: invite copy used localhost during local QA, CSM Reports returned Bad Request at MM scale, and Director company-resource create/edit was missing. Patched invite login URL copy, chunked CSM Reports history reads, and deployed Director company-resource management. Jay retested and passed Director QA.
  - 2026-07-04 Moves Method CSM QA catch: temp app-owned CSMs with no legacy CST member ID could see assigned clients/tasks but could not write quick edits because Edge Functions checked only `legacy_glide_row_id`. Deployed client write function patches so CSM authorization accepts either legacy member ID or app-owned member UUID. Jay retested and passed CSM QA.
  - 2026-07-04 Moves Method Support QA passed: Support sees approved company-wide operational views, cannot see/use integrations or token management, and has no SuperAdmin/company switcher access.
- `[x]` RetainOS supports Jay-led final-sync validation before Glide is taken offline.
- `[x]` Final cutover plan exists for:
  - Data backfill.
  - User access.
  - Notification/email setup.
  - Support process.
  - Rollback plan.
- `[ ]` `[priority: later]` Retire CST/Glide mirror and sync infrastructure after the final company migration.
  - Expected window: roughly 30-60 days, only after every company is app-owned and its migration signoff is complete.
  - Preserve a final archival/reconciliation snapshot, then remove the SuperAdmin Tables and Sync Log surfaces, `sync-glide` / `sync-glide-table`, sync jobs/cron helpers, Glide secrets, and temporary mirror pipelines in one separately reviewed cleanup plan.
  - Do not start early: mirror sync remains required for companies that have not completed cutover.
- `[~]` `[polish]` Moves Method migration readiness can be evaluated without spending Glide sync cost.
  - 2026-06-14 added `npm run migration:readiness:moves`, which reads the current Supabase CST mirror only.
  - Final confidence still requires Jay to trigger the paid Glide/CST sync on the actual cutover day, then rerun readiness and app-owned backfill immediately after.
  - Do not treat week-old mirror drift as a blocker while building migration plumbing; use the readiness snapshot for structural gaps and save the paid sync for final migration.

### Ethical Scaling Pilot Launch Blockers

1. `[~]` `[polish]` Client CSM assignment and reassignment flow is complete.
   - Existing clients can now be reassigned from Edit Profile by SuperAdmin, Director, or Support.
   - New Client and Edit Profile use the app-owned active team roster for pilot/migrated companies.
   - Edge Functions `manage-client-profile` and `manage-client-create` were deployed on 2026-06-06.
   - Remaining: validate CSM visibility after reassignment during the next pilot workflow pass.
2. `[x]` Role-based end-to-end QA passes using Jay, Ben, and Emily's real accounts.
   - 2026-06-16 Jay confirmed the Ethical Scaling pilot has been used with Ben and Emily and is working as expected.
3. `[~]` `[polish]` Ethical Scaling app-owned data is reconciled against Glide and the pilot source-of-truth rules are agreed.
   - Read-only Ethical Scaling command: `npm run pilot:reconcile:ethical-scaling`.
   - Reusable rollout command: `npm run pilot:reconcile:company -- --company="Company Name"`.
   - This reconciliation is a required gate before every future company's `mirror_only` -> `pilot` -> `migrated` transitions.
   - On 2026-06-06 the reconciliation gate returned `readyForPilot = true` with no blockers.
   - All 154 mirrored clients existed app-side with no missing or extra clients.
   - Active pilot clients have no invalid assignments and no missing app-owned offer/milestone configuration.
   - Non-blocking notes: seven invalid assignments belong only to offboarded clients; archived pilot/test app-owned offer/milestone rows exist; historical mirrored contracts/client milestones are not fully app-backfilled yet.
   - Remaining: agree source-of-truth and parallel-run rules for pilot week.
4. `[ ]` Validated work is committed to RetainOS `main`, deployed by Vercel, and production-smoke-tested.
5. `[ ]` Production domain and authentication delivery are configured.
   - Use the agreed `app.retainos.ai` subdomain, preserving the root `retainos.ai` website.
   - `[~]` `[polish]` `app.retainos.ai` is attached to Vercel project `retainoss-projects/cst-supabase-backup`.
   - Add Squarespace DNS `A` record: host `app`, value `76.76.21.21`, then verify HTTPS.
   - Set the production app URL and allowed redirect URLs in Supabase Auth to use the chosen production app domain.
   - Configure `support@ethicalscaling.com` as the pilot sender through a custom SMTP provider for OTP/PIN emails.
   - Test successful login delivery for Jay, Ben, and Emily without hitting Supabase's built-in email limit.

### Pilot Workflow Polish

- `[x]` Milestone progress is available from Quick Update.
  - Quick Update shows the current offer/milestone and lets an authorized CSM complete the current milestone.
  - Completion uses the existing milestone write path, records history/audit, and advances to the next configured milestone.
  - Jay QA passed against Ali Abdaal and Matt Shiver.
  - Product decision: pathway changes remain on the full Client Detail page. Quick Update handles milestone progress only.
  - 2026-06-22 QA patch: Client Detail Pathways, Change Pathway & Milestones, and Quick Update now derive the active pathway/milestone from incomplete `client_milestones` progress before falling back to stale legacy current fields. Visible client-facing labels now use Pathway wording where this flow still said Offer.
- `[x]` New Client setup can optionally configure the initial offer/pathway, starting milestone, and initial contract dates in one flow.
  - Jay QA passed for both optional setup paths.
- `[x]` Minimal pilot reminders are visible above the Clients roster.
  - Shows active-client next contacts and renewals plus paused-client return dates due in the next 7 days or overdue within the last 30 days.
  - 2026-06-08: reminder rows now prefer app-owned `notifications` generated by `generate_company_notifications`, with the old current-client-field calculation preserved as fallback.
  - 2026-06-08 local prototype replaced the wide reminder strip with a compact Clients-header bell/dropdown. Jay confirmed the bell direction feels right.
  - The existing Clients calendar remains the full manual pilot timeline.
  - Broader notification automation remains later roadmap work.
- `[x]` Ethical Scaling pilot onboarding guide exists in `PILOT_ONBOARDING.md`.
- `[ ]` `[priority: low]` App-owned client image upload/display for RetainOS-created clients.
  - Migrated/mirrored clients can display profile images when CST provides image URLs.
  - RetainOS-created clients need upload/storage, replace/remove, and initials fallback support before this is complete.

### Future UI/UX Polish

- `[x]` Responsive navigation uses a mobile sidebar drawer on smaller screens.
- `[x]` The sidebar company selector is the single global SuperAdmin `View As` control; redundant page-level company selectors are removed.
- `[ ]` Add functional cross-app global search. Keep the header search hidden until it is wired.
- `[~]` `[polish]` Add notifications and an inbox experience.
  - In-app notification data foundation exists; local Clients-page bell/dropdown prototype is the preferred direction.
  - Full global bell/inbox stays hidden until read/dismiss/count behavior is real.
- `[ ]` Add a user avatar/account menu. Keep it hidden until it has useful account actions.
- `[ ]` Preserve the current working Dashboard information structure while applying the HiFi visual system.
- `[x]` Use amber for Paused and Suspended statuses and red for Offboarded.

## QA Checklist For Every Release

- `[ ]` `npm run build` passes.
- `[ ]` SuperAdmin can log in and View As a company.
- `[ ]` Director can log in and sees only their company.
- `[ ]` Support can log in and sees company-wide client/dashboard data, without AI Insights.
- `[ ]` CSM can log in and sees only assigned clients/tasks.
- `[ ]` Unknown emails cannot access RetainOS.
- `[ ]` `/dashboard`, `/clients`, `/tasks`, `/clients/:clientId`, `/saas-clients` smoke-tested as applicable.
- `[ ]` Vercel deploy from `main` verified after push.
- `[ ]` Production login redirect and OTP/PIN delivery verified on `https://app.retainos.ai`.

## Known Operational Notes

- Supabase built-in email may be limited to very low OTP volume, such as 2 emails/hour.
- Configure custom SMTP before broad external testing.
- `prepare-login` must remain deployed with JWT verification disabled because public login calls it before there is a user session. The function enforces access internally using SuperAdmin allowlist and `backup_company_team`.
- Keep `old glide project test/` untracked and out of commits unless explicitly requested.
