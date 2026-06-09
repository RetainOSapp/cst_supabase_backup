# Project Memory

This repo is the active collaboration checkout for the Glide to Supabase backup dashboard:

`/Users/joaogoncalves/Desktop/cst_supabase_backup`

The untracked `old glide project test/` folder is a downloaded/reference copy and should not be committed unless explicitly requested.

## App Shape

- Frontend: Vite + React + TypeScript + Tailwind.
- Supabase client: `src/lib/supabase.ts`.
- Main authenticated shell routes live in `src/App.tsx`.
- Header navigation lives in `src/components/Header.tsx`.
- Local dev server usually runs at `http://localhost:5174/` because `5173` has often been occupied.

## Git / Deploy Workflow

- Vercel deploys from `main`, so validated work must be committed and pushed to `origin/main`.
- Before the Ethical Scaling pilot rollout, add and verify the chosen RetainOS app domain in Vercel, then update Supabase Auth's production app URL and allowed redirect URLs to that domain.
- Domain check on 2026-06-06 showed the root `retainos.ai` currently serves Squarespace. Do not replace its DNS without Jay's explicit confirmation; `app.retainos.ai` is the recommended RetainOS app domain unless the root site is intentionally being replaced.
- Jay confirmed `app.retainos.ai` is the desired RetainOS application domain. Use `support@ethicalscaling.com` as the pilot authentication-email sender once custom SMTP is configured.
- Vercel CLI for this repo must use account `jay-3651` and team scope `retainoss-projects` (`retainOS's projects`), not the older `jay-3208` account.
- The local repo is linked to Vercel project `retainoss-projects/cst-supabase-backup`.
- `app.retainos.ai` was added to the Vercel project on 2026-06-06. Squarespace DNS must add an `A` record with host `app` and value `76.76.21.21`; Vercel will verify it after propagation.
- Supabase authentication already handles PIN/OTP login, but its built-in email sender has a very low delivery limit. Before the pilot, configure custom SMTP with a verified RetainOS sender/domain so Jay, Ben, and Emily can log in reliably.
- This repo should use the local git identity:
  - `retainOS`
  - `retainOS@users.noreply.github.com`
- GitHub auth for this repo should be the `retainOS` account.
- If push/auth starts failing or GitHub appears to use the wrong account, run:

```bash
gh auth switch -u retainOS
```

- The user's other project may use `atlas-thebrain`; do not confuse that identity with this RetainOS repo.
- Keep the untracked `old glide project test/` reference folder out of commits unless explicitly requested.

## Supabase Function Deployment Notes

- `prepare-login` must remain deployed with JWT verification disabled because public login calls it before there is a user session. The function enforces access internally using the SuperAdmin allowlist and app-owned/mirrored company membership checks.
- If login shows `Edge Function returned a non-2xx status code`, test `prepare-login` with the public anon key. A response like `UNAUTHORIZED_INVALID_JWT_FORMAT` means it was redeployed with JWT verification enabled.
- Fix command:

```bash
npx supabase functions deploy prepare-login --project-ref zjauqflzxzsbpnivzsct --no-verify-jwt
```

- The intended setting is also captured in `supabase/config.toml`.

Useful commands:

```bash
npm run dev
npm run build
```

## Important Supabase Backup Tables

- `backup_companies`: companies.
- `backup_company_team`: company CSM/team members.
- `backup_company_clients`: main client rows.
- `backup_company_clients_contracts`: linked client contract history.
- `backup_company_clients_tasks`: linked client tasks.
- `backup_company_clients_milestones`: client-specific milestone rows.
- `backup_company_offers`: company offers.
- `backup_company_offer_milestones`: configured milestone templates for offers.
- `backup_choices`: program/status labels and emoji.
- `sync_table_list`: metadata mapping Glide table names to backup table names.

The local `.env` may include `supabase_service_role` for read-only inspection from local scripts. Never expose or commit secret values.

## Write-Mode Planning

Session 1 write-mode planning lives in:

`/Users/joaogoncalves/Desktop/cst_supabase_backup/SUPABASE_WRITE_PLAN.md`

Core decisions captured there:

- Do not write business data back into `backup_*` tables.
- Treat `backup_*` tables as read-only Glide mirror/reference sources.
- New RetainOS writes should go into app-owned tables with `legacy_glide_row_id` for migration reconciliation.
- Recommended first app-owned tables:
  - `companies`
  - `company_members`
  - `company_settings` / related customization tables
  - `clients`
  - `client_contracts`
  - `offers`
  - `offer_milestones`
  - `client_milestones`
  - `client_tasks`
  - `client_history_events`
  - `groups`
  - `group_clients`
- Start write mode through controlled Supabase Edge Functions for sensitive/admin flows, then allow direct RLS-backed writes only after policies are proven.
- First write flow recommendation: company/team member management before client lifecycle writes.
- First pilot company recommendation: Ethical Scaling, because Jay controls it and the migration risk is low.
- Pilot implementation files:
  - `supabase/migrations/20260529120000_write_mode_pilot_foundation.sql`
  - `scripts/seed-ethical-scaling-pilot.mjs`
  - `scripts/qa-ethical-scaling-pilot.mjs`
  - `QA_WRITE_MODE_PILOT.md`
- `migration_status = 'pilot'` is temporary. When more companies migrate, move validated companies to `migrated`, keep unmigrated companies at `mirror_only`, and generalize/remove Ethical Scaling-only assumptions.
- SaaS Client Detail > Team now prefers `company_members` for companies with `migration_status` of `pilot` or `migrated`, and falls back to `backup_company_team` for all other companies. The UI badge says `RetainOS pilot data` versus `Glide mirror data`.
- First controlled Team write flow is `supabase/functions/manage-company-member`. It supports create/update/archive for app-owned pilot/migrated companies only, authorizes SuperAdmins plus active company directors, and writes `app_audit_events`. Non-pilot companies stay locked/read-only in the UI. Archived team members are visible through the Team tab Active/Archived toggle; restore/unarchive is intentionally a later roadmap item.
- Company-side Admin Hub now exists at `/admin` for SuperAdmins and Directors. It reuses the SaaS Client Detail Team experience for the effective company, so Directors have a direct path to Team management without going through SuperAdmin SaaS Clients.
- First client lifecycle write pilot is Quick Update history. `supabase/migrations/20260530120000_client_quick_update_pilot.sql` adds `client_history_events`, and `supabase/functions/manage-client-quick-update` writes app-owned history events for pilot/migrated companies only. It does not mutate `backup_company_clients`.
- Client Detail now has a `History` tab that reads RetainOS pilot Quick Update events from `client_history_events`. This is not yet the full future Glide-style change log; AR status, call attendance, contract changes, CSM assignment changes, and profile updates are still roadmap items.
- Quick Update outcome fields (`Success`, `Progress`, `Buy In`) are dropdowns in the pilot UI. Options currently come from `backup_choices` (`success_*`, `progress_*`, `buy_in_*`) so the UI behaves like Glide while the future write-mode source of truth for outcome definitions is still planned.
- Quick Update should stay intentionally narrow: editable interaction fields only. The read-only context at the top is North Star, Next Steps, Date of Last Contact, and Date of Next Contact. North Star editing belongs in the future full client profile edit flow, not Quick Update.
- Ethical Scaling now has app-owned client current-state rows in `clients`. Migration: `supabase/migrations/20260530133000_clients_write_pilot.sql`. Backfill script: `scripts/seed-ethical-scaling-clients-pilot.mjs`. `/clients` and `/clients/:clientId` prefer `clients` for pilot/migrated companies and fall back to `backup_company_clients` for mirror-only companies. Quick Update now writes both `client_history_events` and the app-owned `clients` current row; it still never mutates `backup_company_clients`.
- Client profile edit v1 is enabled for app-owned pilot/migrated client rows through `supabase/functions/manage-client-profile`. Migration `supabase/migrations/20260531100000_client_profile_edit_pilot.sql` allows `profile_update` history events. SuperAdmin/Director/Support can edit company clients; CSMs can edit assigned clients only; Viewer remains read-only. Current editable fields: client name, business name, email, archetype, North Star, and Director Notes for SuperAdmin/Director only.
- Client assignment/reassignment v1 was added on 2026-06-06. SuperAdmin, Director, and Support can change Primary CSM through Edit Profile; CSMs cannot reassign clients. New Client and Edit Profile use app-owned active team members for pilot/migrated companies, and assignment changes are included in profile history/audit. `manage-client-profile` and `manage-client-create` were deployed; Jay QA remains.
- Ethical Scaling reconciliation command: `npm run pilot:reconcile:ethical-scaling`. On 2026-06-06 it confirmed 154 mirrored and 154 app-owned clients with no missing/extra rows. The seven clients assigned to an archived member are all offboarded, so active-client assignment integrity is clean.
- Reconciliation is a mandatory company-by-company migration gate. For future Glide companies run `npm run pilot:reconcile:company -- --company="Company Name"` before moving `mirror_only` to `pilot` and again before moving `pilot` to `migrated`. You can also target exact ids with `--company-id=<uuid>` or `--legacy-company-id=<glide id>`. Review client counts, app-only/missing rows, status distributions, assignments, current-state differences, app-owned activity, and team roles. Never auto-fix data from the reconciliation command.
- Contract and renewal confidence were added to the reusable reconciliation gate on 2026-06-08. The command now accepts `--renewal-start=YYYY-MM-DD` and `--renewal-end=YYYY-MM-DD` (aliases: `--date-range-start`, `--date-range-end`) and defaults to the next 30 days when omitted. Review `contractConfidence` for mirrored/app contract counts, missing/app-only contract ids, matching field diffs, archived contract counts, and latest app contract vs client summary mismatches. Review `renewalConfidence` for renewal ids from client summaries, app contract history, legacy contract history, retained ids, active up-for-renewal ids, and offboarded-denominator warnings. This is now part of the company-by-company migration trust checklist.
- Historical activity backfill now has a dry-run/apply script: `npm run pilot:backfill:company-activity -- --company="Company Name"`. It backfills missing historical app-owned `client_contracts` and `client_milestones` from the Glide mirror for active/pilot-relevant clients only by default. Always run dry-run first and review `unresolvedClientMilestonesSkipped` before adding `--apply`; use `--include-archived` only when intentionally migrating historical/offboarded records too.
- Clients roster filters, applied filters, page, view, and sort are persisted in browser local storage. The status multi-select closes on outside click.
- New Client v1 is enabled for app-owned pilot/migrated companies through `supabase/functions/manage-client-create`. Migration `supabase/migrations/20260531103000_client_create_pilot.sql` allows `client_created` history events. SuperAdmin/Director/Support can create company clients; CSMs can create clients too, but the server assigns the new client to that CSM so it stays inside their assigned-client scope. New clients are written only to `clients`, with `client_history_events` and `app_audit_events`; `backup_company_clients` remains untouched.
- Zapier client creation v1 exists as `supabase/functions/zapier-create-client` and was deployed to project `zjauqflzxzsbpnivzsct` on 2026-06-07 with JWT verification disabled. It remains locked until Supabase secret `ZAPIER_CLIENT_WEBHOOK_SECRET` is set. Zapier payloads must include `company_id`, either the app-owned company UUID or the legacy Glide company id. Optional fields include client name/email/business, CSM id/email, onboarded date, contract start/end, next steps, and external id for idempotency.
- Client status lifecycle v1 is enabled from Client Detail through `supabase/functions/manage-client-status`. Migration `supabase/migrations/20260602100000_client_status_lifecycle_pilot.sql` adds app-owned status metadata and `client_status_changed` history events. The flow uses existing program statuses only: `front-end`, `back-end`, `paused`, `suspended`, and `off-boarded`. SuperAdmin/Director/Support can change company client status; CSMs can change assigned clients only. Paused/Suspended/Offboarded require a typed reason; Paused also requires a return date and extends app-owned contract end/current days by the approved pause window. The flow writes app-owned `clients`, optional `client_contracts`, history, and audit only; it never mutates `backup_company_clients`.
- New Task v1 is enabled on the top-level Tasks page for app-owned pilot/migrated companies through `supabase/functions/manage-client-task`. Migration `supabase/migrations/20260601124500_tasks_write_pilot.sql` creates app-owned `client_tasks` and allows `task_created` history events. SuperAdmin/Director/Support can create company or client-linked tasks; CSMs can create tasks assigned to themselves and only for assigned clients when a client is linked. Top-level Tasks now shows app-owned tasks plus mirrored Glide tasks; Client Detail > Tasks includes app-owned tasks linked to that client. The flow does not mutate `backup_company_clients_tasks`.
- New Contract v1 is enabled from Client Detail > Contract for app-owned pilot/migrated clients through `supabase/functions/manage-client-contract`. Migration `supabase/migrations/20260601131500_contracts_write_pilot.sql` creates app-owned `client_contracts` and allows `contract_created` history events. SuperAdmin/Director/Support can create contracts for company clients; CSMs can create contracts for assigned clients only. The flow creates a contract row, updates the app-owned `clients` current contract summary, writes history/audit events, and does not mutate `backup_company_clients_contracts`.
- Contract renewal/retention prompt v1 is live as of 2026-06-04. Migration `supabase/migrations/20260604102000_client_retention_event_pilot.sql` allows `client_retention_recorded` history events, and `manage-client-contract` was redeployed to project `zjauqflzxzsbpnivzsct`. In Client Detail > Contract, active clients with a contract ending within 30 days show a renewal prompt. New Contract can record no retention, same-program renewal, or Front End to Back End upsell. Same-program renewals now create a first-class retention event for Dashboard retention formulas. Renewal/upsell events can also mark Success, which writes `outcomes_success_value = yes`, `outcomes_success_value_for_filtering = yes`, and `outcomes_success_date`. Jay QAed this successfully on Shaan Kassam on 2026-06-04.
- Client Outcomes edit v1 was built on 2026-06-05. Migration `supabase/migrations/20260605100000_client_outcomes_write_pilot.sql` allows `client_outcomes_updated` history events, and `supabase/functions/manage-client-outcomes` writes Success, Progress, and Buy-in to app-owned `clients` plus history/audit for pilot/migrated companies only. The Client Detail > Outcomes tab has an Edit Outcomes modal using mirrored `backup_choices` values. `manage-client-outcomes` was deployed to project `zjauqflzxzsbpnivzsct` on 2026-06-06 and is ready for QA.
- Outcomes QA note from 2026-06-06: mirrored `backup_choices` contained a stale Progress option `offtrack`; it has been filtered from Client Detail and Quick Update, and the server now accepts only Success `yes/no` and Progress/Buy-in `green/yellow/red`. The UI now surfaces the real Edge Function error response. Jay successfully QAed Outcomes save/history on Ali Abdaal after the fix. Later polish: History currently displays raw lowercase outcome values rather than friendly labels/colors.
- Supabase CLI auth rule: the default Supabase CLI account is currently authenticated to the RetainOS organization and can see project `zjauqflzxzsbpnivzsct`. Do not pass `--profile retainos`; that named profile is malformed and causes `Unsupported Config Type ""`. Run RetainOS Supabase commands from this workspace using the default profile.
- CSM Reports drill-through cleanup was added on 2026-06-05. Field Upkeep already drills into field-level and complete/incomplete client lists; CSM Summary rows now open a CSM-specific active client update list with links to client profiles.
- CSM Reports drill-through QA passed on 2026-06-06: date ranges, CSM modal, not-updated-first order, and client profile links worked correctly.
- Canonical dashboard KPI RPC v1 was applied on 2026-06-05 through `supabase/migrations/20260605103000_dashboard_kpi_counts_canonical.sql`. Function name: `dashboard_kpi_counts_canonical`. It supports legacy/app company id normalization, multi-program filters, offer filters, CSM filters, date filters, app-owned pilot/migrated `clients`, and mirror-only fallback. Smoke-tested against Ethical Scaling and returned active/front/back/offboard/churn/retention/renewal counts. As of 2026-06-06, the Dashboard KPI strip tries this canonical RPC first for active/front/back/offboard/churn/retention/renewal numbers, including offer and multi-program filters, then falls back to the existing working client-side/legacy RPC calculation if the canonical function errors. 2026-06-09 note: for mirror-only default walkthrough views such as Moves Method, the UI intentionally uses the lighter split KPI path unless app-owned, offer, or multi-program filters require canonical logic. This keeps large CST-preview demos fast, but the final broader-migration fix is optimized canonical reporting RPCs/views plus indexes/summaries for counts, retention, renewal, drill-throughs, and chart breakdowns.
- Canonical Dashboard RPC QA passed on 2026-06-06 for the full Ethical Scaling result and Front End-only filter; returned values matched the expected baseline.

## Company Customization And Settings

- App-owned company customization v1 is live for pilot/migrated companies. Migration: `supabase/migrations/20260608100000_company_customization_v1.sql`. Edge Function: `supabase/functions/manage-company-customization`.
- App-owned outcome definitions and churn reasons are seeded from the Glide mirror/defaults and editable from Admin Hub / SaaS Company Detail > Customization for SuperAdmins and Directors. Mirror-only companies stay read-only from Glide.
- Client Outcomes dropdowns prefer app-owned company outcome definitions for pilot/migrated companies and fall back to mirrored `backup_choices` elsewhere.
- Company Settings v1 saves profile upkeep freshness days, default client view, default calendar mode, secondary assignee flag, Call AI for CSMs flag, embed flag, and Zapier client-create flag. Jay QAed that the page saves on 2026-06-08.
- Client Workspace defaults are now consumed for pilot/migrated companies:
  - Clients roster starts from the company default view (`list`, `card`, or `calendar`) when there is no stronger cached user/company preference.
  - Clients calendar starts from the company default calendar mode (`month`, `week`, or `day`) when there is no stronger cached user/company preference.
  - CSM Reports Field Upkeep uses the company profile-upkeep freshness window instead of a fixed/default 14-day assumption. The selected CSM Reports date range still controls client-level update-rate/report rows.
  - 2026-06-08 QA note: stale roster cache initially blocked defaults from showing. Fix tracks explicit view/calendar user overrides separately, so old cached state no longer prevents company defaults from applying. Jay confirmed default Card/Day behavior works.
- Remaining customization gaps: custom fields, notification settings, dashboard/client-list preferences, client list columns, and deeper company-level configuration.

## Client Workspace

Routes:

- `/clients`: read-only client roster.
- `/clients/:clientId`: read-only client detail page.

Recent client detail wiring:

- Status display is shared through `src/lib/clientDisplay.tsx`.
- Status uses `backup_choices` labels/emojis when available.
- Client detail tabs currently include Client Details, Contract, Program, Outcomes, Pathways & Milestones, and Tasks.
- Date fields should render as readable dates, not raw ISO strings.
- Client Age is calculated as days since `client_age_date_onboarded`.
- `/clients` stores company/filter/page/view/calendar state under `cst.clientsRosterState.v1` so returning from a detail page does not reset the roster. Company defaults apply unless the cached state has an explicit user override for view/calendar mode.

## Contract Wiring

Client Detail > Contract uses two sources:

- Current contract summary from `backup_company_clients` fields:
  - `current_contract_start_date`
  - `current_contract_of_days`
  - `current_contract_end_date`
  - `current_contract_end_date_for_filtering`
  - `current_contract_monthly_value`
  - `current_contract_reference_link`
  - `current_contract_notes`
  - `current_contract_auto_renew`
- Linked contract history from `backup_company_clients_contracts`, filtered by `client_id`.
- For app-owned pilot/migrated clients, new contract rows also load from `client_contracts` and are shown before mirrored contract rows.

Linked contract columns:

- `client_id`
- `start_date`
- `end_date`
- `monthly_value`
- `reference_link`
- `notes`
- `auto_renew`
- `last_modified_time`
- `last_modified_by`

The UI keeps the current/latest contract visible and collapses older linked contracts behind `Older Contracts (n)`.

## Pathways And Milestones Wiring

Important distinction:

- `offer_milestones_current_offer_id` is an offer id, not a milestone id.
- Resolve offer ids through `backup_company_offers`.
- Real configured offer milestones come from `backup_company_offer_milestones`, filtered by `offer_id`.
- Client-specific milestone rows come from `backup_company_clients_milestones`, filtered by `client_id`.
- App-owned milestone progress writes now go to `client_milestones` for pilot/migrated companies. Migration: `supabase/migrations/20260602123000_client_milestones_write_pilot.sql`. Edge Function: `supabase/functions/manage-client-milestone`.
- Pathways & Milestones now use app-owned offer/milestone configuration for pilot/migrated companies and Glide mirror configuration for read-only fallback companies.
- On 2026-06-06, Company Pathways & Milestones Setup V1 introduced app-owned `company_offers` and `company_offer_milestones` for pilot/migrated companies. The migration seeds their existing Glide configuration once; `manage-company-pathway` controls Director/SuperAdmin create, edit, and archive actions. Mirror-only companies remain read-only from Glide.
- Pilot client creation, milestone progression, Client Detail, Clients offer filters, Dashboard offer filters, and Quick Update milestone labels prefer the app-owned journey configuration.
- Offers or milestones assigned to active clients cannot be archived.
- Company Pathways polish added active-client usage counts, move up/down ordering controls, clearer archive blockers, and restore/unarchive for archived offers/milestones. Restored milestones append to the end of the active order. Drag/drop ordering is deferred as a later UI/UX optimization.
- The archived `Temporary test offer` from QA is hidden from normal active views. Hard-delete cleanup should only happen after explicit approval and SQL review.
- SuperAdmins and Directors can change a client's current offer/pathway and milestone.
- Assigned CSMs can start and complete milestones for assigned clients only.
- Support does not write milestones in v1.
- Completing a milestone auto-advances the client to the next configured milestone in the current offer when one exists.
- Date defaults use the click date, but start/completion dates can be overridden in the UI. Duration is milestone start-to-completion; time-to-hit is onboarded date-to-completion.
- Client Detail > Pathways & Milestones now shows a filtered timeline for the client's active/current offer only. The app may load all company milestones for lookup/name resolution, but the visible timeline must not show milestones from unrelated offers/pathways.
- The active milestone should render by configured name, not raw Glide id. Example: Ali Abdaal advanced from `Onboarding` to `Touchpoint Mapping`; the current milestone id `xsZ4WRBhRF-RrJvZeexBrQ` must display as `Touchpoint Mapping`.
- Pathways v1 is functionally acceptable for the Ethical Scaling pilot after QA/polish, but the modal/user-flow UI does not yet match the low-fi designs. Treat design fidelity as a later pass after wiring is stable.
- Secondary offer/milestone fields are deferred until the primary offer flow is validated and can be grouped into a later company setup phase.
- On 2026-06-06, pilot workflow polish added current-milestone completion to Quick Update, optional initial offer/milestone/contract setup to New Client, and a compact Clients-page reminder strip for next contacts, renewals, and paused return dates. Jay QA passed milestone completion against Ali Abdaal and Matt Shiver, approved both optional New Client setup paths, and accepted reminders as a pilot starting point. Keep pathway changes on the full Client Detail page; Quick Update handles milestone progress only.
- On 2026-06-08, Notifications V1 foundation moved pilot reminders toward an app-owned source of truth:
  - Migration `20260608134751_notifications_v1.sql` creates `notifications` and `notification_preferences`.
  - RPC `generate_company_notifications` idempotently generates in-app reminders for next contact, renewal, paused return, and client-linked task due dates for pilot/migrated companies only.
  - Email remains disabled and the full notification inbox stays hidden until read/dismiss/count behavior is built.
  - Clients page now prefers notification rows and falls back to current client fields if the migration/RPC is unavailable.
  - Local-only UX test on 2026-06-08 replaced the wide Clients pilot reminder strip with a compact bell/dropdown in the Clients header. Jay QAed it and said it feels right. Do not commit/deploy this until final notification UX is reviewed, but keep it as the preferred direction.
- On 2026-06-08, Daily Pulse V2 was added as a read-only operating page at `/daily-pulse`.
  - Daily Pulse is distinct from dismissible notifications: it is a persistent start-of-day action view.
  - Buckets are Today, This Week, and This Month, with sections auto-expanded only when they contain active signals.
  - Current signals include next contacts, paused returns, renewals, churn-risk outcomes, RGA candidates, and quiet profiles.
  - CSM users see only clients assigned/secondarily assigned to them.
  - SuperAdmin, Director, and Support users see the selected company by default and can filter the page by active client-managing CSM.
  - Progress and Buy-in outcome signals are combined into one client card to avoid duplicate RGA/churn rows for the same client.
  - Calculations are local page logic from current client rows plus app-owned history where available. Move to canonical SQL/RPC after UX validation and before broader migration-scale reporting.
- `PILOT_ONBOARDING.md` is the recording script/checklist for onboarding Ben and Emily into the Ethical Scaling internal pilot.

Example found during debugging:

- Aarin Siler had `offer_milestones_current_offer_id = Nr-eQzWuQoKZnRBNBR-I1Q`, which resolves to `Inner Circle - 6 Months` in `backup_company_offers`.
- Aaron Grant had offer `Inner Circle - 3 Months`; its configured milestone was `8 Week Diagnostic`.

## Offer Filters

Dashboard and Clients include an Offer filter that mirrors the CSM-dependent pattern:

- Offers load from `backup_company_offers`, filtered by `company_id`.
- Offer labels use `backup_company_offers.name`.
- Client rows store the selected/current offer id in `backup_company_clients.offer_milestones_current_offer_id`.
- `/clients` filters directly with `offer_milestones_current_offer_id`.
- `/dashboard` includes `offerId` in URL/search state and chart filters.
- Dashboard KPI RPCs do not currently accept offer as an argument. For pilot/migrated companies, Dashboard KPI cards now use the app-owned client-side formula path even with no offer selected. Mirror-only companies still use the existing Supabase RPCs unless an offer or multi-program filter forces the client-side fallback.

## Client Roster Sorting

`/clients` supports server-side sorting:

- Client name (`client_name`).
- Onboarded date (`client_age_date_onboarded`).
- Renewal date (`current_contract_end_date_for_filtering`).

Sort state is stored with the existing client roster session cache under `cst.clientsRosterState.v1`. The list and card views display onboarded and renewal dates so the sort is visible to users.

## Task Wiring

Client Detail > Tasks and top-level `/tasks` use:

`backup_company_clients_tasks`

Useful columns:

- `company_id`
- `client_id`
- `task_name`
- `task_description`
- `task_due_date`
- `task_last_updated_date`
- `start_date`
- `completion_date`
- `recurring_is_recurring`
- `is_manually_archived`
- `task_dismissed`
- `task_read`
- `created_by_id`
- `assigned_to_id`
- `priority`
- `status_value`
- `external_link`

Top-level Tasks page:

- Route: `/tasks`.
- Company dropdown first.
- Dependent CSM dropdown from `backup_company_team`.
- Filters tasks by `company_id` and optionally `assigned_to_id`.
- Supports Open / All / Closed task mode.
- Supports Board / List view.
- Stores state in `sessionStorage` under `cst.tasksPageState.v1`.

Moves Method test clients with tasks:

- John Skouros: good first test, has open todo tasks.
- Gemma Marcinkoski.
- Seema Patel.
- Doyin Shonekan.
- Tom O'Loughlin.
- Bernetta Woodard.

## Current Commit Context

Recent work added:

- Shared program status pill helper.
- Client detail contract, pathways, milestones, and task wiring.
- Top-level user/CSM-based tasks page.
- Navigation entry for Tasks.
- Session memory for client roster and tasks page filters.

Latest committed checkpoint:

- Commit: `8bcd555 Build client task and contract views`
- Author/committer: `retainOS <retainOS@users.noreply.github.com>`
- Branch: `local-dev-setup`
- Branch is ahead of `origin/local-dev-setup` by 1 commit.

## Dashboard Work In Progress

There is uncommitted dashboard work in:

`src/pages/Dashboard.tsx`

This was started from the dashboard low-fidelity wireframe. It is not committed yet.

Current dashboard direction:

- Keep `/dashboard` as the executive command center, not a task workspace.
- Preserve the existing company/CSM/secondary/program/date filters.
- Add dashboard tabs:
  - `Overview`
  - `Charts`
  - `AI Insights`
- `Overview` keeps the existing KPI cards and KPI detail drawer, grouped into clearer sections:
  - Client Health
  - Contracts & Retention
- `Charts` adds Supabase-backed aggregate visualizations:
  - Program Distribution
  - Buy-in
  - Progress
  - Clients By Offer
  - Tasks By Status
  - CSM Workload
- Chart data is loaded from:
  - `backup_company_clients`
  - `backup_company_clients_tasks`
  - `backup_company_offers`
- `AI Insights` is currently a read-only placeholder with a disabled `Generate AI Insights` button. Do not wire OpenAI or write paths until explicitly requested.

Dashboard work status:

- `npm run build` passed after the dashboard tab/chart changes.
- The dashboard changes are still uncommitted and should be reviewed/tested in-browser before committing.
- Only known uncommitted tracked file at last handoff was `src/pages/Dashboard.tsx`.
- The untracked `old glide project test/` folder remains intentionally excluded.

Suggested next step after context reset:

1. Run `git status --short --branch`.
2. Run `npm run build`.
3. Start or confirm Vite dev server.
4. Open `/dashboard`, test filters, Overview, Charts, and AI Insights.
5. Refine UI/data if needed.
6. Commit dashboard work as `retainOS`.

## CSM Reports

- Route: `/csm-reports`.
- Access: SuperAdmin, Director, and Support. CSMs do not get the CSM Reports nav/page in v1 because the sitemap treats CSM Reports as an operational/QC surface above individual CSM work.
- CSM Reports v1 uses app-owned `clients` and `client_history_events` for pilot/migrated companies, with mirrored `backup_company_clients` roster fallback for mirror-only companies.
- V1 definition of “updated”: a client has at least one RetainOS `client_history_events` row inside the selected date window. This includes Quick Update, profile/status/contract/milestone/task-created events as they are written to history.
- Default date window: last 30 days. Quick filters: Today, last 7, 14, 30 days, plus custom start/end dates.
- The report groups compliance by the client’s assigned primary CSM, not by the actor who clicked save. This is intentional for system-compliance reporting.
- V1 sections: top summary cards, CSM summary table, and client profile update table linking into Client Detail.
- QA cleanup completed on 2026-06-02:
  - CSM dropdown and CSM Summary only include active team members who manage clients.
  - Archived/read-only/hidden-from-CSM-list members are excluded.
  - Report rows and update-rate denominators only include active clients (`front-end`, `back-end`).
  - Client Profile Updates table sorts by client, CSM, status, and updated status.
  - CSM Summary no longer shows unresolved `Unassigned` rows unless data is genuinely orphaned.

## Dashboard Pilot Validation

- Dashboard Charts now read app-owned `clients` for pilot/migrated companies and fall back to `backup_company_clients` for mirror-only companies.
- Dashboard KPI cards now use the app-owned formula path for pilot/migrated companies, not the old default RPC path.
- App-owned Dashboard KPI hardening on 2026-06-04:
  - Offboarded counts use `client_age_date_offboarded` first, then the legacy filtering date.
  - Retention reads app-owned `client_history_events` status transitions plus legacy Glide history where present.
  - Retention also counts app-owned `client_retention_recorded` events, which covers same-program renewals that do not change the visible program/status.
  - Renewal/up-for-renewal reads app-owned `client_contracts` plus legacy contract rows where present.
- Dashboard CSM filters use the same active client-manager rules as CSM Reports.
- Program filter is a compact multi-select dropdown. It supports combinations like Front End + Back End.
- Multiple selected programs use a client-side KPI fallback because current dashboard KPI RPCs accept only one program value.
- Charts tab:
  - `Visible Client Total` is the total client count for current chart filters.
  - Program Distribution, Buy-in, Progress, and Clients By Offer are clickable and open a client list modal.
  - Tasks By Status and CSM Active Client Workload are intentionally passive for now.
  - CSM Active Client Workload counts active (`front-end`, `back-end`) clients by active client-managing CSM.
  - CSM Capacity shows active clients versus configured `capacity_number`; blank capacity displays `Not set`.
- Remaining Dashboard work:
  - Profile Upkeep Score v1 is now on Dashboard Overview for app-owned pilot data.
    - Active clients only.
    - Default freshness window: 14 days.
    - Required fields: Next Steps, Milestone, Date of Last Contact, Date of Next Contact, Progress, and Buy-in.
    - It uses recent app-owned `client_history_events` first, with current client date fields as fallback for milestone/contact/progress/buy-in.
    - Each upkeep field is clickable and opens updated versus not-updated active clients.
    - The complete-profile pill is clickable and opens complete versus incomplete profiles.
    - The same Profile Upkeep section now also lives in CSM Reports as the operational/compliance home, while Dashboard keeps the high-level health signal.
    - Dashboard uses the fixed 14-day health window. CSM Reports uses the selected report date range and separates client-level update rate from field-level upkeep score so the denominators are clear.
    - Later: make the freshness window company-configurable and move this into canonical SQL/RPC reporting.
  - Move canonical calculations into SQL views/RPCs when ready.
  - Validate formulas against the scoping formulas using `DASHBOARD_FORMULA_VALIDATION.md` as the working definition checkpoint.
  - Add dashboard export later.

## Current Planning Priority

As of 2026-06-03, Groups are deliberately low priority and should be moved to a very late phase. They can happen after client migrations because they do not block the Ethical Scaling pilot or first migrated companies.

Latest session status:

- Jay QAed Client Contact Calendar v1 and confirmed it works.
- Jay QAed CSM Reports Field Upkeep after removing the redundant old update-rate cards.
- Jay QAed Dashboard app-owned formula hardening for Ethical Scaling.
- Jay QAed Contract renewal/retention prompt v1 on Shaan Kassam, including the new retention event path and optional Success trigger.

Next migration-readiness priorities:

1. Dashboard formula validation / canonical RPC planning.
   - Validate Dashboard formulas against the scoping formulas and Ethical Scaling pilot data.
   - Current UI formula path was hardened for app-owned/pilot data on 2026-06-04.
   - Working spec: `DASHBOARD_FORMULA_VALIDATION.md`.
   - Draft SQL starting point: `DASHBOARD_CANONICAL_RPC_DRAFT.sql`.
   - Expand canonical SQL/RPC support so offer filters and multi-program filters do not require client-side fallbacks.
2. Client calendar.
   - Client Contact Calendar v1 is now built into `/clients` as a third roster view beside List and Cards.
   - It uses the current company/CSM/status/offer/search filters and displays Day/Week/Month calendar modes.
   - Calendar events include onboarded date, renewal date, last contact, next contact, and client-linked task due dates.
   - This supports daily CSM follow-up and migration confidence.
3. Profile upkeep scoring.
   - Active clients only.
   - Percentage score based on required field freshness.
   - Default 14-day window, company-configurable later.

## Super Admin / Login Hierarchy Planning

The current company dropdowns across Dashboard, Clients, and Tasks are temporary workarounds. The intended hierarchy is:

- **Super Admin** users: `jay@ethicalscaling.com`, `ben@ethicalscaling.com`, and `darren@amblemind.com`.
- Super Admins can manage SaaS clients, meaning the companies in `backup_companies`.
- Super Admins can choose a company to **View As** and then interact with that company account as a full-access admin for support/debugging.
- Company-scoped users should eventually see only their own company data and should not need a company dropdown.

Initial safe implementation idea:

- Add a frontend role/context layer for authenticated users.
- Define Super Admin by `VITE_SUPER_ADMIN_EMAILS=jay@ethicalscaling.com,ben@ethicalscaling.com,darren@amblemind.com`.
- Add a persistent selected company / `viewAsCompanyId` in `sessionStorage`.
- Existing pages should use `viewAsCompanyId` as their default company context.
- Keep write actions disabled/read-only until an explicit write-mode plan and Supabase security path are approved.

## Super Admin Low-Fi Screens / Product Notes

Screens provided:

- Login screen:
  - High-fidelity direction shows RetainOS branding.
  - Email/password and Google login are shown in the low-fi.
  - Current app uses Supabase email OTP flow; do not switch auth mode without explicit request.

- SuperAdmin > SaaS Clients:
  - A SaaS client is a company/account in `backup_companies`.
  - Super Admin can view SaaS clients as cards/list.
  - Filters/statuses shown: Active, Paused, Archived.
  - Search should eventually search SaaS user names, client names, tasks, and SaaS companies.
  - Card actions planned: Edit, Pause/Offboard, Archive.
  - Pause should preserve data but restrict access for non-super-admins and notify director.
  - Archive/offboard should preserve data but remove company access and remove it from normal screen view.
  - Read-only mode note: screens can be built/opened for testing, but Submit/Save must be disabled until write mode is approved.

- Add New SaaS Client modal:
  - Fields shown:
    - Company Name
    - Director Name
    - Director Email
    - Logo optional
    - Subscription tier
  - Company ID should be auto-generated when Super Admin creates a new SaaS account.
  - Logo/image is not required at Super Admin creation time; Director can upload during onboarding later.
  - Tier options:
    - Starter
    - Growth
    - Pro/Enterprise/DFY
  - Tier should eventually drive SaaS permissions and limitations.
  - For now, modal can be present but Submit disabled/read-only.

- SaaS Client Details:
  - Shows company ID, company name, created date, and edit SaaS details action.
  - Super Admin can select this company to **View As** for support.
  - Details tabs:
    - Team
    - Customization
    - Pathways & Milestones
    - Company Settings
  - For the near term, only Team is planned. The other tabs are future work.

- Team tab:
  - Uses company members/team data from company/team tables.
  - Sections by role:
    - Director
    - CSM
    - Support
    - Viewer
  - New Team Member modal:
    - Name
    - Email
    - Profile picture
    - Role: Director, CSM, Support, Viewer
    - Optional checkbox: assigned person does not manage clients
  - Role semantics from low-fi:
    - Director: can see all clients and manage team members.
    - CSM: can only see assigned clients.
    - Support: can see all clients and CSM performance.
    - Viewer: read-oriented access, exact permissions TBD.
  - The “does not manage clients” checkbox appears for Director or Support roles; when checked, they should not appear in client assignment dropdowns or dashboard filters.
  - Current `backup_company_team.role_hide_from_csm_list` likely maps to this behavior.

- Team member cards:
  - Display user name, email, and capacity percent pill.
  - Card actions planned:
    - Edit capacity
    - Remove user from SaaS client
  - Capacity tooltip note:
    - Displays % capacity forecast for next 30 days.
    - Capacity logic varies by company/team member.
    - Low-fi formula: `30 days - active clients minus clients that will expire this month / total capacity for that team member`.
    - This formula needs clarification before implementation.
  - On-demand AI prompt editing is only Super Admin and only available in Pro/Enterprise tiers later.

Future tabs not yet building:

- Customization:
  - AI custom prompts
  - Custom fields
  - Outcome definitions
  - Churn reasons
- Pathways & Milestones.
- Company Settings.

## Super Admin Implementation Checkpoint

Login hierarchy implementation checkpoint:

- Shared frontend account context: `src/lib/accountContext.tsx`.
- Persistent Super Admin **View as company** state stored in `localStorage` under `retainOS.viewAsCompanyId.v1`.
- Super Admin detection uses `VITE_SUPER_ADMIN_EMAILS` as a required comma-separated allowlist.
  - Current intended allowlist: `jay@ethicalscaling.com`, `ben@ethicalscaling.com`, `darren@amblemind.com`.
  - Super Admin is global and is not tied to `backup_company_team`.
- Company users resolve from active `backup_company_team` rows by signed-in email.
  - `role_id = 1` -> Director.
  - `role_id = 2` -> Support.
  - `role_id = 3` -> CSM.
  - `role_read_only_user = true` -> Viewer override.
  - Multiple active company memberships currently block login so access can be cleaned up manually.
- Header navigation is gated by account capabilities.
  - `SaaS Clients`, `Tables`, and `Sync Log` are Super Admin only.
  - Dashboard/Clients/Tasks appear by role capability.
- Dashboard, Clients, Tasks, and Client Detail now use account-scoped company context.
  - Super Admin uses the selected View As company for company-scoped pages.
  - Company users use their assigned company and cannot switch companies.
  - CSMs are scoped to their own clients/tasks.
  - Viewer is read-only and does not get Quick Update/actions.
- Support can view/filter company-wide dashboard KPIs but cannot access AI Insights.
- Login OTP now uses the `prepare-login` Supabase Edge Function before calling `signInWithOtp`.
  - The function checks whether the email is either in the Super Admin allowlist or active in `backup_company_team`.
  - If allowed, it creates the Supabase Auth user just-in-time with the service role key, then the normal OTP flow sends the code with `shouldCreateUser: false`.
  - This avoids manually creating every existing company user in Supabase Auth.
  - The function must be deployed to Supabase before company-user OTP login works outside local code.
  - Supabase Edge Function secrets should include `SUPER_ADMIN_EMAILS=jay@ethicalscaling.com,ben@ethicalscaling.com,darren@amblemind.com`.
- New routes:
  - `/saas-clients`: read-only SaaS Clients/company account view.
  - `/saas-clients/:companyId`: read-only SaaS Client details, currently focused on the Team tab.
  - `/admin`: company-side Admin Hub for SuperAdmins/Directors, currently focused on Team.

SaaS Clients page notes:

- Reads companies from `backup_companies`.
- Reads team/director preview data from `backup_company_team`.
- Active/Archived filters use `backup_companies.archived`.
- Paused is a placeholder count/filter until there is a confirmed pause/status field.
- Add New SaaS Client modal opens for UX testing but Submit is disabled.

SaaS Client details / Admin Hub Team notes:

- Team tab reads app-owned `company_members` for pilot/migrated companies and falls back to `backup_company_team` for mirror-only companies.
- Role labels for mirrored rows are inferred for now:
  - `role_is_saa_s_admin` -> Director.
  - `role_read_only_user` -> Viewer.
  - `role_hide_from_csm_list` -> Support.
  - Otherwise -> CSM.
- New Team Member, edit role/capacity, and archive are enabled for app-owned pilot/migrated companies through the Edge Function path.
- Mirror-only company Team writes remain disabled/read-only.

## HiFi Product Decisions - 2026-06-06

- Use the HiFi handoff as the visual source of truth while preserving the current working RetainOS data model, permissions, navigation structure, and write flows.
- Dashboard chart modernization is a deliberate UI/data Phase 2. Use Recharts with a clean shadcn-chart-inspired treatment, RetainOS HiFi colors, visible labels, and existing drill-through behavior.
- Agreed chart shapes:
  - Program Distribution, Buy-in, and Progress: donut charts.
  - Clients By Offer, Tasks By Status, and CSM Active Client Workload: modern bar charts.
- Metrics shown in the HiFi prototype such as churn reasons, richer actionable dashboard data, subscription tiers, and company customization flags are future real product scope. Do not dismiss them as sample-only data; wire them after their canonical formulas/tables exist.
- Quick Update should retain the existing working milestone-progress controls and receive the HiFi modal styling. Pathway changes remain on the full Client Detail page.
- New Client should retain the richer pilot setup fields, including assignment, offer/pathway, starting milestone, and initial contract dates, while adopting the HiFi styling.
- Final standalone production logo assets can be added during a later pilot UI revision. Prefer SVG wordmark/icon/light/dark assets when supplied.
- HiFi client workflow pass started on 2026-06-06:
  - Quick Update now uses the RetainOS HiFi modal treatment while preserving outcomes, contact dates, notes, history, and current-milestone completion.
  - New Client now uses the HiFi modal treatment while preserving assignment, status, offer/pathway, starting milestone, North Star, and optional initial contract setup.
  - Client Detail received its first HiFi shell pass: RetainOS colors, buttons, tabs, profile header, and field cards.

## Dashboard Performance - 2026-06-06

- Dashboard Overview should stay fast and formula-focused.
  - It uses canonical KPI cards and drill-throughs.
  - It should not eagerly load chart, task, capacity, or profile-upkeep datasets while the user is only viewing Overview.
- Dashboard Charts now lazy-load the heavier client/task/offer/capacity data when the Charts tab is opened.
- Field/Profile Upkeep belongs in CSM Reports, not Dashboard Overview.
  - The duplicate Dashboard Profile Upkeep block was removed to avoid confusion and hidden data-loading cost.
- Next pilot sequence:
  - Re-run Ethical Scaling reconciliation after latest app-owned writes.
  - If reconciliation is clean, reduce Ethical Scaling pilot surfaces to prefer app-owned tables and keep Glide mirror fallback only for non-pilot companies or not-yet-built tables.

## Ethical Scaling Reconciliation - 2026-06-06 / 2026-06-07

- Run command: `npm run pilot:reconcile:ethical-scaling`.
- The reconciliation script now checks clients, active CSM assignment integrity, app-owned offers, app-owned offer milestones, app-owned contracts, app-owned client milestones, history/audit activity, and a `rolloutGate` summary.
- 2026-06-07 recovery note:
  - Supabase Nano/free-tier IO budget was exhausted after heavy Glide backup syncs, causing app/login/reconciliation timeouts.
  - Jay upgraded the project from Nano to Micro after moving to Pro; app and reconciliation performance recovered.
  - After Jay resynced Ethical Scaling backup clients/history, the mirror had five additional clients not yet in app-owned `clients`.
  - `scripts/seed-ethical-scaling-clients-pilot.mjs` now supports `--missing-only` to insert only absent app-owned client rows and preserve existing pilot edits.
  - Missing-only seed inserted: Vanessa Valencia, Oscar Sey, Samantha Kall, Practice Advisor, and Alima Sharipova.
- Latest result on 2026-06-07:
  - `rolloutGate.readyForPilot = true`.
  - `blockers = []`.
  - Mirrored clients: 159.
  - App-owned clients: 159.
  - Missing app-owned clients: 0.
  - App-only clients: 0.
  - Invalid active CSM assignments: 0.
  - Active clients with missing app-owned offer config: 0.
  - Active clients with missing app-owned milestone config: 0.
- Non-blocking notes from the reconciliation:
  - Seven invalid CSM assignments exist only on offboarded clients.
  - One app-owned offer and two app-owned offer milestones are app-only archived pilot/test rows.
  - Historical mirrored contracts are not fully backfilled into app-owned `client_contracts` yet; pilot contract writes are app-owned from this point forward.
  - Historical mirrored client milestone records are not fully backfilled into app-owned `client_milestones` yet; pilot milestone writes are app-owned from this point forward.
- Next step after this pass: reduce Ethical Scaling pilot surfaces to prefer app-owned tables wherever app-owned equivalents exist, while preserving `backup_*` fallback for mirror-only companies and not-yet-built areas.

## Pilot Backup Dependency Reduction - 2026-06-07

- Login/access provisioning now prefers app-owned `company_members` for pilot/migrated companies before falling back to `backup_company_team`.
  - Updated and deployed Edge Function: `supabase/functions/prepare-login`.
  - Smoke test against `recruiting@ethicalscaling.com` returned `{"ok":true,"access":"company_user"}`.
- Browser account resolution now prefers active app-owned `company_members` joined to pilot/migrated `companies`.
  - The resolved `companyId` remains the legacy Glide company id for compatibility with existing routes/filters.
  - The resolved `teamMemberId` is `legacy_glide_row_id` when present, otherwise the app-owned member UUID.
- Pilot team dropdown/filter reads now prefer `company_members` without also querying the mirror:
  - Clients page was already using app-owned members.
  - CSM Reports now reads app-owned team only for pilot/migrated companies.
  - Dashboard now reads app-owned team only for pilot/migrated companies.
  - Tasks now reads app-owned team only for pilot/migrated companies.
- Mirror fallback remains for non-pilot/mirror-only companies.
