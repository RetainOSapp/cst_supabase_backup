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

## Graphify Workflow

- Graphify is now a local orientation layer for RetainOS architecture. It is useful for session starts, planning, impact checks, and subagent briefs, but it does not replace `rg` or direct source reads for exact implementation details.
- Local Graphify credentials live in `.env.graphify`, which is ignored by git. Generated graph files live in `graphify-out/`, also ignored by git.
- The committed human summary is `ARCHITECTURE_MAP.md`.
- Start non-trivial sessions with one or two anchored checks, usually:

```bash
set -a
source .env.graphify
set +a
uvx --from 'graphifyy[gemini]' graphify explain "Project Memory" --graph graphify-out/graph.json
uvx --from 'graphifyy[gemini]' graphify explain "RetainOS Roadmap" --graph graphify-out/graph.json
```

- Before larger changes, ask what could break with `graphify affected "<exact node or function>"`, then verify with `rg`.
- For subagents, include the relevant `ARCHITECTURE_MAP.md` communities and any exact nodes from `graphify explain` / `graphify affected` in the brief.
- Regenerate Graphify after major milestones, not every small edit. Ask Jay before a regeneration if it may use the Gemini key/cost. The first full no-DSN baseline was generated on 2026-06-10 from code, docs, memory, roadmap, and Hi-Fi handoff assets.

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
- Contract and renewal confidence were added to the reusable reconciliation gate on 2026-06-08. The command now accepts `--renewal-start=YYYY-MM-DD` and `--renewal-end=YYYY-MM-DD` (aliases: `--date-range-start`, `--date-range-end`) and defaults to the next 30 days when omitted. Review `contractConfidence` for mirrored/app contract counts, missing/app-only contract ids, matching field diffs, archived contract counts, latest app contract vs client summary mismatches, latest mirrored contract vs client summary mismatches, and active-client contract coverage. The active-client coverage section highlights clients missing app-owned contract history, missing all contract history, or missing a current renewal date so migration teams can decide whether current summaries are enough or a historical backfill is required. Review `renewalConfidence` for renewal ids from client summaries, app contract history, legacy contract history, retained ids, active up-for-renewal ids, and offboarded-denominator warnings. This is now part of the company-by-company migration trust checklist.
- Historical activity backfill now has a dry-run/apply script: `npm run pilot:backfill:company-activity -- --company="Company Name"`. It backfills missing historical app-owned `client_contracts` and `client_milestones` from the Glide mirror for active/pilot-relevant clients only by default. Always run dry-run first and review `unresolvedClientMilestonesSkipped` before adding `--apply`; use `--include-archived` only when intentionally migrating historical/offboarded records too.
- Clients roster filters, applied filters, page, view, and sort are persisted in browser local storage. The status multi-select closes on outside click.
- New Client v1 is enabled for app-owned pilot/migrated companies through `supabase/functions/manage-client-create`. Migration `supabase/migrations/20260531103000_client_create_pilot.sql` allows `client_created` history events. SuperAdmin/Director/Support can create company clients; CSMs can create clients too, but the server assigns the new client to that CSM so it stays inside their assigned-client scope. New clients are written only to `clients`, with `client_history_events` and `app_audit_events`; `backup_company_clients` remains untouched.
- CSV client safety net was added locally on 2026-06-10. `/clients` can download a template, export the selected company/filter set, and preview CSV imports before any writes. Import is only exposed for app-owned pilot/migrated companies and calls `manage-client-create` row-by-row after explicit confirmation. Mirror-only companies remain export-only. Template columns, current import mapping, and Jay QA checklist live in `CSV_BULK_IMPORT_EXPORT.md`.
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
- Company Custom Fields V1 adds app-owned `company_custom_fields` definitions through `supabase/migrations/20260610110000_company_custom_fields_v1.sql`. The migration seeds pilot/migrated company definitions from any `customfield1` through `customfield7` labels found on app-owned or mirrored company rows. Admin Hub / SaaS Company Detail > Customization can list, create, edit, and archive definitions through `manage-company-customization`; mirror-only companies only show read-only CST slot labels when present. Important product clarification from Jay on 2026-06-10: custom fields are recurring client update fields, not just profile metadata. Their operational home is Quick Update and Client Detail > Outcomes, not the Client Details tab.
- Custom field value editing is now wired for pilot/migrated clients in Quick Update and Client Detail > Outcomes. Values are stored in `client_custom_field_values`, written by `manage-client-quick-update` and `manage-client-outcomes`, and included in RetainOS history metadata. The related migration and Edge Functions were applied/deployed on 2026-06-10. Follow-up migration `supabase/migrations/20260610123000_client_history_events_metadata.sql` adds the missing `client_history_events.metadata` jsonb column needed for custom-field history metadata.
- Client Outcomes dropdowns prefer app-owned company outcome definitions for pilot/migrated companies and fall back to mirrored `backup_choices` elsewhere.
- Company Settings v1 saves profile upkeep freshness days, default client view, default calendar mode, secondary assignee flag, Call AI for CSMs flag, embed flag, and Zapier client-create flag. Jay QAed that the page saves on 2026-06-08.
- Client Workspace defaults are now consumed for pilot/migrated companies:
  - Clients roster starts from the company default view (`list`, `card`, or `calendar`) when there is no stronger cached user/company preference.
  - Clients calendar starts from the company default calendar mode (`month`, `week`, or `day`) when there is no stronger cached user/company preference.
  - CSM Reports Field Upkeep uses the company profile-upkeep freshness window instead of a fixed/default 14-day assumption. The selected CSM Reports date range still controls client-level update-rate/report rows.
  - 2026-06-08 QA note: stale roster cache initially blocked defaults from showing. Fix tracks explicit view/calendar user overrides separately, so old cached state no longer prevents company defaults from applying. Jay confirmed default Card/Day behavior works.
- Remaining customization gaps: optional custom field display on client list/import/export, notification settings consumption, dashboard/client-list preferences, client list columns, and deeper company-level configuration.

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
- On 2026-06-10, Notification Preferences V1 polish was added locally:
  - Admin Hub / Company Settings now exposes company-level in-app visibility toggles for next contacts, renewals, pause returns, churn risk, RGAs, quiet profiles, and client-linked task due reminders.
  - Preferences are saved through `manage-company-customization`; mirror-only companies remain read-only.
  - Clients bell reminders and Daily Pulse sections respect enabled/disabled company preferences with fallback defaults that keep existing companies visible.
  - Email delivery remains disabled; task reminders stay limited to the existing client-linked notification path.
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
- 2026-06-10 task source cleanup:
  - `/tasks`, Client Detail > Tasks, Clients calendar task events, and Dashboard task-status charts now use `client_tasks` for pilot/migrated companies.
  - `backup_company_clients_tasks` remains the read-only fallback for mirror-only companies such as Moves Method.
  - Historical contracts, historical milestones, `backup_choices` status/program labels, and legacy history remain intentional mirror dependencies until their app-owned models/backfills are approved.

## Beacon v1 Local Pilot - 2026-06-10

- The `/beacon` page is now a working AI assistant chat (built by Claude Code, validated by Jay locally the same day). It answers roster questions from live data: renewals, contract gaps, health/referral-ready clients, CSM books, and single-client detail.
- Code (all in this repo, **intentionally uncommitted** — see deploy warning below):
  - `src/lib/beacon/tools.ts`: three whitelisted query tools (`query_clients`, `get_client_detail`, `list_team_members`) running through the existing supabase client. The model never writes SQL. A `BeaconScope` enforces role scoping in code: super_admin uses the View-As company (may name another pilot/migrated company), director is locked to their company, csm to assigned clients, support/viewer have no access.
  - `src/lib/beacon/chat.ts`: Anthropic streaming tool loop (`@anthropic-ai/sdk`, `dangerouslyAllowBrowser`), frozen system prompt with `cache_control`, max 6 tool rounds per question.
  - `src/pages/Beacon.tsx`: brand-matched chat UI; suggested-prompt chips, streaming with tool-activity line, client names link to `/clients/:glide_row_id`, conversation persists in sessionStorage keyed by company.
- Env (gitignored `.env`): `VITE_BEACON_ANTHROPIC_KEY` (Jay's real key is present locally — never echo or commit it) and `VITE_BEACON_MODEL` (default `claude-sonnet-4-6`).
- Route gate unchanged: `canAccessTables` (SuperAdmin-only) in `src/App.tsx`.
- **DO NOT COMMIT OR DEPLOY Beacon as-is.** Vercel deploys from `main`, and v1 makes a browser-direct Anthropic call — committing would ship key-dependent client code. Promotion path before any commit/rollout: move the loop into a `beacon-chat` Edge Function with `ANTHROPIC_API_KEY` as a Supabase secret, enforce scoping server-side, then add a `canAccessBeacon` capability for Director/CSM access.
- Coverage: app-owned tables only (`clients`, `client_contracts`, `company_members`), so pilot/migrated companies. Mirror-only companies (`backup_*`) are out of scope for v1.
- Data caveat for QA: historical contract backfill is still pending, so for Ethical Scaling 13 of 14 active clients have no contract end date on file. "No active contract" answers are large and "renewing in 30 days" is 0 (single live contract ends 2026-09-10). This is correct per data, not a Beacon bug.
- `.claude/launch.json` was added locally (dev-server config for Claude Code's preview on port 5273, leaving 5173/5174 to Jay). Harmless if committed, but it is uncommitted alongside Beacon for now.

## Moves Method Migration Readiness - 2026-06-10

- Moves Method is the next migration candidate after Ethical Scaling, but it remains read-only / CST mirror-backed until Jay and Ben explicitly approve write-mode rollout.
- New working checklist: `MOVES_METHOD_MIGRATION_READINESS.md`.
  - Covers baseline reconciliation, read-only protections, Daily Pulse QA, journey visual QA, Resources QA, call workflow resource QA, and Ben handoff.
- Daily Pulse now has two additional company-configurable signal types:
  - `diagnostic_due`: 8-week diagnostics from client onboarding.
  - `strategic_review_due`: strategic review 35 days before current contract/program end.
  - Company Settings copy and `manage-company-customization` allowlist were updated.
- Client Detail > Pathways & Milestones now includes a compact journey visual:
  - Milestone progress from configured offer milestones and client milestone records.
  - Contract/program timing from current contract start/end or renewal fields.
  - Missing data shows fallback copy rather than implied progress.
- Client Detail > Client Details now includes a simple read-only Client Links section.
  - It detects common diagnostics, Google Drive, and external-link fields from app-owned or mirrored client rows.
  - A canonical app-owned client links table/editor is still needed before full write-mode migration.
- Resources now separates:
  - RetainOS Help: global product/setup/onboarding resources.
  - Company Resources: company-scoped SOPs, links, Loom/video embeds, and docs.
  - Migration required before full remote use: `supabase/migrations/20260610143000_resource_scopes_and_moves_readiness.sql`.
  - Edge Function update required after migration: `supabase/functions/manage-resource`.
- Call workflow resource guides now explicitly document future behavior for Fathom/Otter/Grain style payloads:
  - transcript intake setup;
  - call summary / notes update setup;
  - future client matching, call date storage, last-contact update, notes/next-steps update, history preservation, and manual correction when matching fails.
- This work does not enable Moves write mode and does not implement full Call AI ingestion.

## Moves Method Readiness Refinement - 2026-06-11

- Jay QAed the first Moves readiness pass and validated View As, roster expectations, dashboard speed, CSM Reports, Resources, read-only Client Detail, and contract/program timing.
- Refinements implemented locally:
  - `src/pages/Clients.tsx`: mirror-backed client list count now requests exact filtered counts instead of planned estimates, because walkthrough trust matters more than the small count-speed optimization.
  - `src/pages/DailyPulse.tsx`, `src/lib/companySettings.ts`, `src/pages/SaasClientDetail.tsx`: Daily Pulse diagnostic/strategic-review rules now use company-configured timing. Diagnostic copy is generalized to "Peak Diagnostic" with cadence days; Strategic Review uses configurable days before contract/program end. Defaults are 56 and 35 days.
  - `src/pages/ClientDetail.tsx`: Client Links copy is broadened from diagnostics to audits, Drive folders, and supporting docs; URL detection now finds embedded URLs in text fields and checks audit/Drive/supporting-doc candidate fields.
  - `src/pages/ClientDetail.tsx`: Pathways & Milestones now includes a read-only Program Timeline visual with 3-month, 6-month, 12-month, and 2-year presets plus kickoff, 30-day review, Peak Diagnostic, Strategic Review, program-end, and current-position markers when contract timing exists.
  - `MOVES_METHOD_MIGRATION_READINESS.md`, `CALL_TRANSCRIPT_INTEGRATION_PLAN.md`, and `supabase/migrations/20260610143000_resource_scopes_and_moves_readiness.sql` were updated to match the generalized language and Ethical Scaling-first Fathom/Zapier QA flow.
- Fathom/Call Workflow remains guidance/foundation only. The intended first real test should be Ethical Scaling: create a RetainOS inbound Edge Function, configure Zapier/n8n/Make to POST normalized JSON with a shared secret, use a known Ethical Scaling client email, then verify call storage, client matching, history, notes, and last-contact updates. Do not claim this is live until the endpoint/tables exist and Jay QA passes.
- Build passed with `npm run build`. Known warnings remain: browser-externalized Node modules from the local Beacon/Anthropic prototype and the large Vite chunk warning.
- No commit/deploy was performed in this pass.

## Daily Pulse + Client Links Refinement - 2026-06-11

- Company Settings > notification preferences now stores metadata on `notification_preferences`.
  - Migration: `supabase/migrations/20260611103000_notification_preference_metadata_and_client_links.sql`.
  - Edge Function deployed: `manage-company-customization`.
  - Peak Diagnostic can now be configured as either:
    - one-time checkpoint, e.g. Moves Method 8-week / 56-day diagnostic;
    - recurring cadence, e.g. monthly check-in every 30 days.
  - Daily Pulse consumes the mode: one-time appears only on the checkpoint date/window; recurring uses the existing cadence logic.
- Client Detail > Client Links is no longer read-only for app-owned pilot/migrated clients.
  - New app-owned table: `client_links`.
  - New Edge Function deployed: `manage-client-link`.
  - UI supports adding and archiving audit, Drive-folder, supporting-doc, and other URLs.
  - Mirror-only companies remain read-only and still show detected links from CST mirror fields.
- Build passed with `npm run build`. Known warnings remain the Beacon/Anthropic browser externalization warnings and Vite large chunk warning.
- No git commit was performed in this pass.

## Integration Intake Stage 1 - 2026-06-11

- Jay clarified the integration map:
  - Full Call AI transcript analysis is a later/heavier workflow.
  - Fathom/Otter/Grain call summaries that update client Next Steps + Date of Last Contact are a separate lower-cost workflow and should be available without Call AI.
  - Other required families: new-client webhook, update-client webhook, LMS/course-completion webhook.
- `CALL_TRANSCRIPT_INTEGRATION_PLAN.md` was reframed as the broader RetainOS integration intake plan.
  - Stage 1 is Summary-To-Next-Steps.
  - Later stages: Call AI transcript intake, update-client webhook, course completion webhook, review queue, Call AI queue/provider polish.
- Implemented Stage 1 locally and deployed its Supabase function:
  - Migration: `supabase/migrations/20260611123000_integration_intake_events.sql`.
  - New shared table: `integration_intake_events` for webhook receipt, match status, idempotency, payload storage, and review/failure tracking.
  - New Edge Function: `supabase/functions/ingest-client-call-summary/index.ts`.
  - Function requires `CALL_SUMMARY_WEBHOOK_SECRET` or `CLIENT_CALL_SUMMARY_WEBHOOK_SECRET`.
  - Function accepts app-owned UUID or legacy company id, exact `client_email`, `summary`, optional `started_at`, `external_call_id`, `recording_url`, and `title`.
  - It updates app-owned `clients.next_steps_value` and `clients.csm_date_of_last_contact`, writes `client_history_events` with `event_type = call_summary_webhook`, writes audit events, and marks integration intake as processed.
  - It only updates when exactly one active client matches the email. Unmatched or ambiguous active matches are stored as `needs_review` instead of writing to a client.
  - Duplicate provider call IDs return as duplicate/idempotent when already processed.
- Resources guide updated so `client_call_summary_webhook` is no longer described as future-only and uses the new JSON body shape.
- Build passed with `npm run build`.
- Migration applied and `ingest-client-call-summary` deployed to Supabase.
- Supabase secret check showed `CALL_SUMMARY_WEBHOOK_SECRET` is not yet configured. Set that before QA with Zapier/n8n/Make.
- Jay set `CALL_SUMMARY_WEBHOOK_SECRET` on 2026-06-11 and the first Zapier test returned `Invalid JWT`.
  - Root cause: Supabase Edge Functions verify JWT by default and Zapier was correctly sending the webhook secret in the `Authorization` header.
  - Fix: `supabase/config.toml` now includes `[functions.ingest-client-call-summary] verify_jwt = false`; redeploy the function before retrying Zapier QA.
  - Roadmap hardening note added: before sharing this workflow with Moves Method or any customer, replace the global secret with company-specific integration secrets/tokens validated against the submitted `company_id`.
- No git commit was performed in this pass.

## Call Summary History Source Label - 2026-06-11

- Jay QA confirmed the first Ethical Scaling call-summary webhook updated Matt Shiver correctly:
  - Next Steps changed to the Fathom/Zapier summary payload.
  - Date of Last Contact used the call `started_at` value from the webhook payload.
  - History was written as `call_summary_webhook`.
- UX clarification added in `src/pages/ClientDetail.tsx`:
  - webhook-driven history events now show a subtle `Updated via webhook` chip;
  - the history card explains that the event time is when RetainOS received the webhook, while Last Contact can reflect the actual call date.
- Build passed with `npm run build`. Known warnings remain the Beacon/Anthropic browser externalization warnings and Vite large chunk warning.

## Moves Method Review Queue + Journey Config Polish - 2026-06-11

- Built local Integration Review Queue support for app-owned companies.
  - Location: Admin Hub / SaaS Client Detail > Company Settings.
  - Source table: `integration_intake_events`.
  - Shows open `needs_review` and `failed` webhook intake events with provider, match status, received time, external ID, error message, client email, summary preview, and recording link when available.
  - Mirror-only companies keep the read-only protection and do not expose app-owned review controls.
- Daily Pulse configuration copy is now company-generic.
  - Diagnostic rules are framed as onboarding checkpoints/check-ins instead of Moves-only language.
  - The UI explains one-time checkpoints and recurring cadence modes with clearer examples.
  - Strategic Review copy remains generic for contract/program-end planning.
- Client Detail > Pathways & Milestones timeline now reads company notification preferences.
  - Diagnostic/check-in marker timing comes from the company-configured `diagnostic_due` preference.
  - Strategic Review timing comes from the company-configured `strategic_review_due` preference.
  - This removes hardcoded Moves-only assumptions from the visual journey map while preserving fallback defaults.
- Build passed with `npm run build`.
- No commit/deploy was performed in this pass.

## Integration Queue + Timeline QA Polish - 2026-06-11

- Jay QA confirmed an unmatched webhook event is now visible in the Integration Review Queue.
  - The queue is useful as a v1 holding pen, but it has no manual match/resolve action yet.
  - Product direction: Company Settings is acceptable short-term, but the better long-term home is likely Call AI / integration operations or a task-style inbox once there is a real resolution workflow.
- Client Detail > Pathways & Milestones program timeline was simplified after QA:
  - removed hardcoded 30-day review markers;
  - recurring diagnostic/check-in markers now show as configured check-ins;
  - kickoff/program-end labels are edge-aware so text does not fall outside the card.
- Build passed with `npm run build`. Known warnings remain the Beacon/Anthropic browser externalization warnings and Vite large chunk warning.
- No commit/deploy was performed in this pass.

## Company-Specific Integration Secrets - 2026-06-12

- Implemented app-owned per-company integration token storage for inbound webhooks.
  - New migration: `supabase/migrations/20260612110000_company_integration_secrets.sql`.
  - New table: `company_integration_secrets`.
  - Stores SHA-256 token hashes only, plus optional non-secret prefix, status, expiry, last-used metadata, and integration type.
  - RLS denies anon/authenticated client access; intended management path is service-role SQL or a future admin Edge Function.
- Hardened `supabase/functions/ingest-client-call-summary/index.ts`.
  - The function now resolves `company_id` first, then validates the submitted token against active `company_integration_secrets` rows for `integration_type = 'call_summary_next_steps'`.
  - Accepted headers: `Authorization: Bearer ...`, `x-retainos-integration-token`, and legacy-compatible `x-webhook-secret`.
  - If a company has active token rows, the old global `CALL_SUMMARY_WEBHOOK_SECRET` / `CLIENT_CALL_SUMMARY_WEBHOOK_SECRET` cannot bypass company token validation.
  - The old global secret remains a local/dev fallback only for companies with no active company token rows.
  - Successful company-token requests update `last_used_at` / `last_used_from` and store non-secret auth metadata on `integration_intake_events.metadata`.
- Updated resource/config docs:
  - `src/pages/Resources.tsx` call-summary guide now instructs company-specific bearer token setup.
  - `CALL_TRANSCRIPT_INTEGRATION_PLAN.md` now treats company-specific tokens as the inbound auth pattern and documents token QA.
  - `ROADMAP.md` call-summary item now records the 2026-06-12 hardening and remaining deploy/QA gate.
- Verification:
  - `git diff --check` passed for touched files.
  - `npm run build` did not complete because existing dirty work in `src/pages/SaasClientDetail.tsx` has `TS6133: 'NOTIFICATION_PREFERENCE_GROUPS' is declared but its value is never read`.
  - `deno check` could not run because `deno` is not installed locally.
- Deployment follow-up:
  - Apply `20260612110000_company_integration_secrets.sql`.
  - Create one active `company_integration_secrets` row per customer/company/integration before customer QA. Hash example: `encode(extensions.digest('raw-token', 'sha256'), 'hex')`.
  - Redeploy `ingest-client-call-summary` with JWT verification disabled as already captured in `supabase/config.toml`.
- No commit/deploy was performed in this pass. DO NOT COMMIT unrelated local dirty work unless its own MEMORY entry says it is ready.

## Company Customization Hardening - 2026-06-12

- Hardened Admin Hub / SaaS Client Detail customization copy for migration readiness.
  - File: `src/pages/SaasClientDetail.tsx`.
  - Company Customization now explicitly frames outcome definitions, custom fields, and churn reasons as separate setup areas.
  - Custom fields copy now says definitions are configured at the company level and consumed by Quick Update plus Client Detail > Outcomes; values are edited in those client workflows, not in Company Settings or Client Details.
  - Removed the misleading "Still coming soon" placeholder language from Company Settings and replaced it with a routing note that sends custom fields back to Company Customization.
  - Notification preferences are grouped into Daily Pulse/bell visibility versus company timing rules, preserving the existing `manage-company-customization` save path.
  - Added clearer empty states for custom fields and churn reasons.
- Updated `ROADMAP.md` to reflect that notification preferences are now configured/consumed and that remaining work is Jay QA, richer settings, client-list columns, and later dashboard/client-list preference consumption.
- Verification: `npm run build` passed. Known warnings remain the Anthropic SDK browser-externalization warnings and the large Vite chunk warning.
- No webhook functions, integration secret plumbing, migrations, or deploys were touched in this pass.
- No commit was performed. Existing dirty work remains intentionally uncommitted unless its own MEMORY entry says otherwise.

## Client Update Webhook V1 - 2026-06-12

- Implemented the app-owned inbound Client Update Webhook V1 locally.
  - New Edge Function: `supabase/functions/webhook-update-client/index.ts`.
  - New migration: `supabase/migrations/20260612100000_client_update_webhook_v1.sql`.
  - The migration also publishes a lightweight Resources guide row: `client-update-webhook`.
  - Deployment config: `supabase/config.toml` now sets `[functions.webhook-update-client] verify_jwt = false`.
  - Setup docs: `CLIENT_UPDATE_WEBHOOK.md`.
  - Integration plan updated: `CALL_TRANSCRIPT_INTEGRATION_PLAN.md`.
  - Roadmap updated: `ROADMAP.md`.
- Function behavior:
  - Accepts app-owned company UUID or legacy Glide company id.
  - Matches by exact case-insensitive `client_email`, or by explicit app-owned `client_id` when it belongs to the submitted company and optional email also matches.
  - Only pilot/migrated companies are writable; mirror-only companies remain read-only.
  - Supported V1 fields: `next_steps`, `notes` as history context, `last_contact`, `next_contact`, active `offer_id`, active `assigned_to`/CSM, and active company `custom_fields`.
  - Rejects `status`, `program`, and `program_status` updates in V1 so lifecycle side effects stay in `manage-client-status`.
  - Stores intake/idempotency rows in `integration_intake_events`; unmatched or ambiguous requests become `needs_review` and do not update clients.
  - Successful writes update only app-owned tables: `clients`, `client_custom_field_values`, `client_history_events`, `app_audit_events`, and the intake row. It does not mutate `backup_*` tables.
- Auth:
  - Uses the existing 2026-06-12 shared `company_integration_secrets` pattern for `integration_type = client_update`.
  - Accepted headers: `Authorization: Bearer ...`, `x-retainos-integration-token`, and legacy-compatible `x-webhook-secret`.
  - If active company secret rows exist, the submitted token must match one active, non-expired SHA-256 hash.
  - `CLIENT_UPDATE_WEBHOOK_SECRET` / `WEBHOOK_UPDATE_CLIENT_SECRET` remain only as a temporary fallback for companies with no active `client_update` secret rows.
- Verification:
  - `npm run build` passed. Known warnings remain the Anthropic SDK browser externalization warnings and the large Vite chunk warning.
  - `git diff --check` passed for the touched webhook/migration/docs/config files.
  - `deno check supabase/functions/webhook-update-client/index.ts` could not run because `deno` is not installed locally.
- Deployment follow-up:
  - Apply `supabase/migrations/20260611123000_integration_intake_events.sql` if the intake table is not already live.
  - Apply `supabase/migrations/20260612110000_company_integration_secrets.sql` if company integration secrets are not already live.
  - Apply `supabase/migrations/20260612100000_client_update_webhook_v1.sql` for the `client_update_webhook` history type.
  - Deploy: `npx supabase functions deploy webhook-update-client --project-ref zjauqflzxzsbpnivzsct --no-verify-jwt`.
  - Create one active `company_integration_secrets` row per company/integration before QA/customer use.
  - QA matched, unmatched, duplicate `external_event_id`, wrong-company token, invalid offer, invalid assignee, and custom-field validation paths against Ethical Scaling before using for customers.
- No commit/deploy was performed in this pass. Existing dirty work remains intentionally uncommitted unless its own MEMORY entry says otherwise.

## Integration Review Inbox V1 - 2026-06-12

- Implemented the first actionable Integration Review Queue locally.
  - UI: `src/pages/SaasClientDetail.tsx`.
  - New Edge Function: `supabase/functions/manage-integration-review/index.ts`.
  - New migration: `supabase/migrations/20260612190000_integration_review_queue_actions.sql`.
- The Admin Hub / Company Settings queue now behaves like a small review inbox for app-owned companies:
  - `Match to client`: reviewer chooses one active app-owned client and applies the intake event manually.
  - `Retry apply`: RetainOS retries the original automatic match/apply path.
  - `Ignore`: marks the event as `ignored` so it leaves the open queue without pretending it was processed.
- Supported event types in this v1:
  - `call_summary_next_steps`: updates client next steps, updates last contact when the payload has a valid call timestamp, writes `call_summary_webhook` history, audit event, and processed intake state.
  - `client_update`: applies the same narrow V1 fields as the webhook retry path, writes `client_update_webhook` history, audit event, and processed intake state.
- Mirror-only companies remain read-only; the review actions are only enabled for `pilot` / `migrated` app-owned companies.
- Verification:
  - `npm run build` passed.
  - `git diff --check` passed.
  - Known warnings remain the Anthropic SDK browser externalization warnings and the large Vite chunk warning.
- Deployment/QA follow-up:
  - Apply `supabase/migrations/20260612190000_integration_review_queue_actions.sql`.
  - Deploy `manage-integration-review`.
  - QA with Ethical Scaling: create one unmatched call-summary event, manually match it, verify client next steps/history; create another unmatched event, ignore it, verify it leaves the queue; create a now-matchable event and use Retry apply.
- No commit/deploy was performed in this pass. Existing dirty work remains intentionally uncommitted unless its own MEMORY entry says otherwise.

### Integration Review Match Dropdown Fix - 2026-06-12

- Fixed the local Admin Hub / Company Settings Integration Review Queue client-match dropdown after Jay QA found Ignore worked but Match could not load clients.
  - File: `src/pages/SaasClientDetail.tsx`.
  - Removed the brittle Supabase `.in("program_status_value", ...)` filter from the client option query.
  - Added a small normalized status guard in the UI so the dropdown includes app-owned unarchived clients while excluding offboarded/off-boarded clients.
  - Added a real empty-state option (`No active clients found`) when a company truly has no matchable clients.
- Verification: `npm run build` passed. Known warnings remain the Anthropic SDK browser externalization warnings and the large Vite chunk warning.
- No migration, Edge Function deploy, commit, or Vercel deploy was performed for this UI-only fix.

### Integration Review Manual Match Column Fix - 2026-06-12

- Fixed the follow-up QA issue where the manual match dropdown still showed `No active clients found`.
  - File: `src/pages/SaasClientDetail.tsx`.
  - Root cause: the app-owned client option query selected `business_name`, but the app-owned `clients` table column is `client_business`; Supabase rejected the query, leaving the dropdown empty.
  - Updated the option type, query, and display fallback to use `client_business`.
- Hardened manual review matching:
  - File: `supabase/functions/manage-integration-review/index.ts`.
  - `Match to client` still sends app-owned UUIDs from the UI, but the function can now resolve either an app-owned UUID or a legacy CST `glide_row_id`.
  - Manual matches are recorded as `manual_match` whether the selected identifier was an app UUID or legacy client id.
- Verification: `npm run build` passed. Known warnings remain the Anthropic SDK browser externalization warnings and the large Vite chunk warning.
- Deploy note: the dropdown fix is UI-only; the Edge Function resilience requires redeploying `manage-integration-review` before testing legacy-id manual matches in Supabase production.

## Integration Token Management UI + Queue Deploy - 2026-06-13

- Added SuperAdmin-only integration token management for pilot/migrated companies.
  - UI: `src/pages/SaasClientDetail.tsx` under Admin Hub / SaaS Client Detail > Company Settings > Integration Tokens.
  - Edge Function: `supabase/functions/manage-integration-token/index.ts`.
  - Actions: list, create, revoke one token, and revoke all active tokens for a company or integration type.
  - Supported integration types: call summary / next steps, Call AI transcript, client create, client update, and course completion.
  - Tokens are generated as one-time raw values, stored only as SHA-256 hashes in `company_integration_secrets`, and displayed later only by prefix/status/last-used metadata.
- Offboarding lesson captured: revoking RetainOS integration tokens prevents inbound webhook writes/processing after a SaaS client is offboarded, but the customer-side Zap/N8N workflow must still be disabled to stop automation task charges at the source.
- Deployed Supabase functions:
  - `manage-integration-token` deployed on 2026-06-13.
  - `manage-integration-review` redeployed on 2026-06-13 after the manual match/dropdown fixes.
- Verification:
  - `npm run build` passed before deploy. Known warnings remain the Beacon-related Anthropic SDK browser externalization warnings and the large Vite chunk warning.
- Jay QA needed:
  - Admin Hub > Ethical Scaling > Company Settings > Integration Tokens.
  - Create a token for Client Update Webhook and/or Call Summary Next Steps, copy the one-time raw token, and confirm it works in Zapier.
  - Revoke the token and confirm the same Zapier request fails authorization.
  - Generate a new token and confirm requests work again.
  - Revoke all active tokens and confirm all active tokens leave the usable set.
- Follow-ups:
  - Wire token revocation into the future SaaS offboarding workflow so offboarding can automatically revoke integration credentials.
  - Add revoke audit events if needed.
  - Keep Integration Review Queue placement under review; current location is Company Settings, but longer-term it may belong in Call AI/integration operations or a task-style inbox.
- No git commit was performed. Existing dirty work remains intentionally uncommitted unless its own MEMORY entry says otherwise.

### Integration Token One-Time Copy UX - 2026-06-13

- Jay QA found token creation succeeded but the one-time raw token was not obvious enough to copy before it disappeared into the token list.
- Updated `src/pages/SaasClientDetail.tsx` so generated tokens render as a prominent one-time token panel above the creation form with explicit Copy/Copied feedback and Dismiss after storing.
- Follow-up fix after QA: token creation also triggered a Company Settings reload that briefly unmounted `CompanySettingsSetup`, wiping the one-time token panel immediately after creation. The settings tab now keeps the component mounted during app-owned settings reloads so the raw token survives long enough to copy.
- Added inline copy clarifying the difference between Company ID and Integration Token: Company ID routes the webhook to the SaaS account; the token authorizes that integration to write for that company.
- Verification: `npm run build` passed. Known Beacon-related Anthropic SDK browser externalization warnings and the large Vite chunk warning remain.
- Follow-up product workflow: Resource guides should show company-specific IDs and active tokens when available, or ask the user to contact support/request access when the feature is not enabled or no active token exists.

## Integration Resource Token Wiring - 2026-06-13

- Cleaned the messy Ethical Scaling integration-token test slate in Supabase.
  - Applied `/private/tmp/retainos_clean_ethical_scaling_integration_tokens.sql`.
  - It deleted all `company_integration_secrets` rows for Ethical Scaling / legacy company id `chvcRSSPTJaaoK2zbhGplQ`.
  - Jay should create fresh real QA/customer tokens from Admin Hub > Company Settings > Integration Tokens.
- Added a RetainOS Help resource guide seed for Course Completion.
  - New migration: `supabase/migrations/20260613100000_course_completion_resource_guide.sql`.
  - Applied successfully with `npm run db:apply:sql`.
- Wired integration token awareness into RetainOS Help resource pages.
  - File: `src/pages/Resources.tsx`.
  - Token-aware guide set now covers: Call Summary / Next Steps, Client Update Webhook, New Client Webhook, Call Transcript, and Course Completion.
  - Resource pages show the selected company id, explain Company ID vs Integration Token, and show whether active tokens exist for the selected company/integration.
  - Raw tokens are not shown on resource pages; only one-time token creation in Admin Hub shows the full value. Later views show token prefixes only.
  - Call Summary / Next Steps and Client Update are live webhook flows.
  - Call Transcript and Course Completion are setup/planning guides for now until their endpoints are built.
- Hardened the New Client Webhook locally for company-specific integration tokens.
  - File: `supabase/functions/zapier-create-client/index.ts`.
  - Added support for `company_integration_secrets` with `integration_type = client_create`.
  - Accepted token headers: `Authorization: Bearer ...`, `x-retainos-integration-token`, and `x-webhook-secret`.
  - Active company tokens override the old global `ZAPIER_CLIENT_WEBHOOK_SECRET`; the global secret remains fallback only when no active company token row exists.
  - Intake/history/audit metadata now records non-secret auth mode/token id/prefix details when relevant.
- Verification:
  - `npm run build` passed. Known Beacon-related Anthropic SDK browser externalization warnings and the large Vite chunk warning remain.
- Deploy caveat:
  - A Supabase CLI deploy/list retry for `zapier-create-client` hung silently in this local session, so live deployment of `client_create` token support is NOT confirmed.
  - Before testing New Client Webhook with company-scoped tokens, run a clean deploy retry for `zapier-create-client`.
  - Client Update and Call Summary token flows are already the better live QA targets until that redeploy is confirmed.
- No git commit was performed. Existing dirty work remains intentionally uncommitted unless its own MEMORY entry says otherwise.

## Company Settings Polish - 2026-06-13

- Finished a small Company Settings / Customization polish pass to make the Admin Hub settings area feel less temporary.
  - File: `src/pages/SaasClientDetail.tsx`.
  - Added clearer copy for Client workspace defaults, including that the settings affect Clients and CSM Reports behavior without rewriting historical client data.
  - Renamed `Simple flags` to `Feature gates` and clarified the practical meaning of secondary assignee, Call AI for CSMs, embeds, and client creation webhook access.
  - Renamed the Zapier-specific client-create label to `Client creation webhook` so the setting can cover Zapier, n8n, or other automation tools.
  - Kept the Integration Review Queue in Company Settings for now but moved it into a quieter operations drawer that opens automatically when unmatched/ambiguous events exist.
  - Renamed `Not configured in this panel` to `Managed in other tabs` and pointed users toward Customization, Pathways & Milestones, and Resources for related setup.
- Verification:
  - `npm run build` passed.
  - `git diff --check` passed.
  - Known warnings remain: Beacon/Anthropic SDK browser externalization warnings and the large Vite chunk warning.
- No migration, Edge Function deploy, commit, or Vercel deploy was performed.
- Follow-ups:
  - Jay QA on the organized Company Settings flow.
  - Longer-term settings work remains dashboard/client-list preference consumption, client list column presets, and call/communication settings.

## New Client Webhook Company Token Deploy - 2026-06-13

- Closed the previous deploy caveat for the New Client Webhook.
  - Function: `supabase/functions/zapier-create-client/index.ts`.
  - Deployed with `npx supabase functions deploy zapier-create-client --project-ref zjauqflzxzsbpnivzsct`.
  - Supabase reported a successful deploy on project `zjauqflzxzsbpnivzsct`.
- Live behavior now supports company-scoped integration tokens for `integration_type = client_create`.
  - Accepted headers: `Authorization: Bearer <raw token>`, `x-retainos-integration-token`, or `x-webhook-secret`.
  - If active company tokens exist for `client_create`, the submitted token must match one of them.
  - The old `ZAPIER_CLIENT_WEBHOOK_SECRET` remains fallback only for companies with no active `client_create` token rows.
- Jay QA recipe:
  - Admin Hub > Company Settings > Integration Tokens: create a `New Client Webhook` token and copy the one-time raw token.
  - Zapier/N8N custom request:
    - Method: `POST`.
    - URL: `https://zjauqflzxzsbpnivzsct.supabase.co/functions/v1/zapier-create-client`.
    - Headers: `Authorization: Bearer <raw token>` and `Content-Type: application/json`.
    - Body example:

```json
{
  "company_id": "chvcRSSPTJaaoK2zbhGplQ",
  "external_id": "qa-new-client-001",
  "client_name": "QA New Client",
  "client_email": "qa-new-client@example.com",
  "business_name": "QA Business",
  "assigned_to": "jay@ethicalscaling.com",
  "offer_id": "",
  "contract_start_date": "2026-06-13",
  "contract_end_date": "2026-09-13",
  "notes": "Created by new client webhook QA"
}
```

  - Expected success: new app-owned client row, optional contract row, `client_created` history, and audit event.
  - Re-send the same payload with the same `external_id`; expected duplicate response, not another new client.
  - Test a bad token and a token generated for another company; expected 401.
  - Delete/archive the QA client after testing.
- No git commit or Vercel deploy was performed.

## New Client Webhook Zapier Body Compatibility - 2026-06-13

- Fixed Zapier POST compatibility for the New Client Webhook after Zapier kept reaching the function without top-level `company_id` / `client_name` fields.
  - File: `supabase/functions/zapier-create-client/index.ts`.
  - Added `parseWebhookBody(req)` so the Edge Function accepts:
    - plain JSON request bodies,
    - form-encoded bodies,
    - query-string fields,
    - Zapier-style nested payload strings under `data`, `body`, `payload`, `request`, or a blank key.
  - Missing `client_name` errors now return `received_keys` to make future Zapier QA visible instead of opaque.
- Deployed with:
  - `npx supabase functions deploy zapier-create-client --project-ref zjauqflzxzsbpnivzsct`
  - Supabase reported a successful deploy on project `zjauqflzxzsbpnivzsct`.
- No git commit or Vercel deploy was performed.
- QA remaining:
  - Retest Zapier POST action with key/value Data rows.
  - Confirm `company_integration_secrets.last_used_at` updates for the `client_create` token.
  - Confirm new app-owned QA client, client-created history event, optional contract, and audit event.

## New Client Webhook Zapier URL Pattern - 2026-06-13

- Jay validated the New Client Webhook from Zapier after moving `company_id` into the endpoint URL query string.
  - Working URL shape: `https://zjauqflzxzsbpnivzsct.supabase.co/functions/v1/zapier-create-client?company_id=<company_id>`.
  - Headers still use the company-scoped integration token: `Authorization: Bearer <raw client_create token>` plus `Content-Type: application/json`.
  - Client-specific fields stay in the Zapier body (`client_name`, `client_email`, `assigned_to`, contract dates, notes, etc.).
  - QA result: a new app-owned `QA New Client` appeared in the Ethical Scaling client list with the expected CSM, status, onboarded date, and renewal date.
- Resource guide update:
  - File: `src/pages/Resources.tsx`.
  - The New Client Webhook guide now copies the Zapier-safe URL with `?company_id=<selected company id>` and removes `company_id` from the body template to avoid Zapier nesting/serialization confusion.
  - The server still accepts body/query/nested payload company IDs for n8n or custom callers, but Zapier documentation should use the URL query pattern as canonical.
- Security model unchanged:
  - `company_id` is a routing identifier, not the secret.
  - The server validates the submitted token against active `company_integration_secrets` for that same company and `integration_type = client_create`.
- No git commit or Vercel deploy was performed.

## New Client Webhook Closeout QA - 2026-06-13

- Completed server-side closeout QA for the New Client Webhook using the canonical Zapier-safe endpoint pattern:
  - `POST /functions/v1/zapier-create-client?company_id=<company_id>`.
  - `Authorization: Bearer <raw client_create integration token>`.
  - Client fields in the JSON body.
- The live endpoint passed:
  - happy-path app-owned client creation;
  - optional contract creation;
  - `client_created` history event creation;
  - audit event creation;
  - idempotent duplicate response when the same `external_id` is resent;
  - 400 validation when `client_name` is missing;
  - 401 rejection for an invalid company token;
  - `company_integration_secrets.last_used_at` update for the used token.
- Temporary QA client, contract, history, audit, and token rows were cleaned up after the test.
- No git commit or Vercel deploy was performed.

## Client Update Webhook Closeout QA - 2026-06-13

- Completed server-side closeout QA for the Client Update Webhook using a disposable app-owned Ethical Scaling client and a disposable company-scoped `client_update` token.
- The live endpoint passed:
  - happy-path update for `next_steps`, `last_contact`, and `next_contact`;
  - `client_update_webhook` history event creation;
  - app audit event creation;
  - processed `integration_intake_events` row with `match_status = matched`;
  - idempotent duplicate response when the same `external_event_id` is resent;
  - unmatched-email review queue with `status = needs_review` and `match_status = unmatched`;
  - 401 rejection for an invalid company token;
  - 400 rejection for direct status/program updates, which must stay inside the RetainOS lifecycle flow;
  - `company_integration_secrets.last_used_at` update for the used token.
- Temporary QA client, history, audit, intake, and token rows were cleaned up after the test.
- No git commit or Vercel deploy was performed.

## Call Summary / Next Steps Webhook Closeout QA - 2026-06-13

- Completed server-side closeout QA for the Call Summary / Next Steps Webhook using a disposable app-owned Ethical Scaling client and a disposable company-scoped `call_summary_next_steps` token.
- The live endpoint passed:
  - happy-path matching by exact active client email;
  - `next_steps_value` update from the submitted summary;
  - `csm_date_of_last_contact` update from the submitted call timestamp;
  - `call_summary_webhook` history event creation;
  - app audit event creation;
  - processed `integration_intake_events` row with `match_status = matched`;
  - idempotent duplicate response when the same external call ID is resent;
  - unmatched-email review queue with `status = needs_review` and `match_status = unmatched`;
  - 401 rejection for an invalid company token;
  - 400 rejection when neither `summary` nor `notes` is present;
  - `company_integration_secrets.last_used_at` update for the used token.
- Temporary QA client, history, audit, intake, and token rows were cleaned up after the test.
- No git commit or Vercel deploy was performed.

## Call Transcript Webhook Resource Closeout - 2026-06-13

- Confirmed there is no live `ingest-call-transcript` Edge Function in the repo.
- Current status is intentionally resource/planning-only:
  - Resources has a token-aware Call Transcript guide.
  - The guide shows the selected company ID, active token status/prefix, expected transcript payload fields, and Fathom/Otter/Grain/Zapier/n8n/Make mapping guidance.
  - The guide includes clear placeholder language that the endpoint is not active yet and that full Call AI transcript intake/matching/analysis remains a later phase.
- No live endpoint QA was performed because there is no endpoint to call yet.
- No git commit or Vercel deploy was performed.

## Course Completion Webhook Resource Closeout - 2026-06-13

- Confirmed there is no live `webhook-course-completion` Edge Function in the repo.
- Current status is intentionally resource/planning-only:
  - Resources has a token-aware Course Completion guide.
  - The guide shows the selected company ID, active token status/prefix, expected LMS payload fields, and course/module completion mapping guidance.
  - The guide includes clear placeholder language that the endpoint is not active yet.
- No live endpoint QA was performed because there is no endpoint to call yet.
- No git commit or Vercel deploy was performed.

## Integration Resource Guides Cleanup - 2026-06-13

- Cleaned `src/pages/Resources.tsx` integration guides so live vs planned workflows are explicit.
- New Client uses the Zapier-safe `?company_id=<company_id>` URL pattern and body-only client fields.
- Client Update and Call Summary / Next Steps remain live endpoint guides with company token headers and body `company_id`.
- Call Transcript and Course Completion now use explicit not-live placeholder copy, planned method/headers, company ID, payload templates, and token status/prefix.
- No endpoint QA was performed for Call Transcript or Course Completion by design because those endpoint implementations do not exist yet.
- Verified `npm run build` passed; only the known Vite large chunk / Anthropic Beacon local warning remains.
- No git commit or Vercel deploy was performed.

## Moves Method Migration Readiness Snapshot - 2026-06-14

- Added a read-only migration readiness snapshot command for Moves Method:
  - `npm run migration:readiness:moves`
  - generic form: `npm run migration:readiness:company -- --company="Company Name"`
- Files touched:
  - `scripts/migration-readiness-snapshot.mjs`
  - `package.json`
  - `MOVES_METHOD_MIGRATION_READINESS.md`
  - `ROADMAP.md`
- Important migration rule clarified by Jay:
  - We are building everything needed for migration, not doing the migration yet.
  - The Glide/CST sync is paid/manual and should only be run by Jay when the team is truly ready to migrate.
  - Current Supabase mirror data can be around a week old and is good enough for validating structure, workflow, and migration plumbing.
  - Final confidence requires Jay to trigger the paid Glide/CST sync on cutover day, then rerun readiness and app-owned backfill immediately after.
- The new readiness script reads the current Supabase CST mirror only. It does not trigger a Glide sync and does not write app-owned migration data.
- 2026-06-14 Moves Method snapshot:
  - 4,143 mirrored clients.
  - 2,338 active clients.
  - Status mix: 2,004 front-end, 334 back-end, 106 paused, 96 suspended, 1,603 off-boarded.
  - 89 mirrored team rows; 59 visible client managers.
  - 16 mirrored offers and 33 mirrored offer milestones.
  - Active clients missing offer config: 0.
  - Active clients missing milestone config: 0.
  - Active clients missing renewal/filtering date: 0.
  - Active unassigned clients: 6.
  - Active clients with invalid CSM assignments: 9.
  - Mirrored contract history rows: 177; most active clients do not have a mirrored historical contract row, so contract-history backfill rules still need to be finalized before write-mode migration.
- Current gate interpretation:
  - Read-only walkthrough is close, but the 9 active invalid assignments and 6 active unassigned clients should be reviewed before calling Moves data clean.
  - Write migration remains intentionally blocked until Jay triggers final sync and approves app-owned backfill/cutover.
- No git commit or Vercel deploy was performed.

## Moves Method Jay QA Doc Cleanup - 2026-06-14

- Updated `MOVES_METHOD_MIGRATION_READINESS.md` to mark Jay's read-only/product QA as complete.
- Moved the 9 active invalid assignment / 6 active unassigned snapshot findings out of current product blockers and into final-sync QA, because the mirror is intentionally stale until Jay runs the paid Glide/CST sync on migration day.
- Updated `ROADMAP.md` with the same checkpoint so future sessions do not keep re-litigating stale mirror data as if it were live.
- No code changes, build, git commit, or Vercel deploy were performed.

## Beacon: Page -> Floating Bubble Widget - 2026-06-14

- Beacon is no longer a standalone page. Per Jay's request it is now a floating bubble assistant available on every authenticated page (cleaner sidebar, "always-available friend").
- Changes:
  - New `src/components/Beacon.tsx` exports `BeaconBubble` (a fixed bottom-right FAB + popover panel) wrapping an internal `BeaconChat` (the same chat/logic ported from the old page). Chat brain (`src/lib/beacon/chat.ts`, `tools.ts`) is unchanged.
  - `BeaconBubble` is mounted once in `AppShell` (`src/components/Header.tsx`) and gated on `isSuperAdmin`, so it persists across navigation and an in-flight answer survives closing/navigating. Lazy-mounts on first open, then stays mounted (hidden) to preserve the conversation.
  - Deleted `src/pages/Beacon.tsx`; removed the `/beacon` route + `Beacon` import from `src/App.tsx`; removed the Beacon entry from the `devNav` list in `src/components/Header.tsx`.
  - Panel z-index is `z-40` — above content/sticky header (`z-30`), below modals (`z-50`), per Jay's decision.
- Still SuperAdmin-only and still the uncommitted local pilot. The DO NOT COMMIT warning and Edge-Function promotion path in "Beacon v1 Local Pilot - 2026-06-10" still apply unchanged.
- `npm run build` passes; app boots with no console errors. Logged-in QA is Jay's (email-OTP gate).

## Moves Method Readiness Checklist Cleanup - 2026-06-14

- Updated `MOVES_METHOD_MIGRATION_READINESS.md` based on Jay's clarification:
  - Moves-specific company resource content is not RetainOS-owned; the Resources structure is complete and Ben/Moves will add their own SOPs/resources when ready.
  - Daily Pulse config validation is approved by Jay and treated as complete.
  - Ben handoff is complete through Jay/Ben's real-time updates.
  - Journey Visual is the only remaining product QA item in the Moves readiness doc; Jay requested a focused QA list before it is marked complete.
- Moved the official rollout checklist out of the Moves-specific doc and into `ROADMAP.md` as a reusable `Official Company Rollout Checklist` for any RetainOS customer migration.
- Important process note: pull that rollout checklist only when Jay explicitly calls a company migration and triggers the fresh paid CST/Glide sync. Do not treat stale mirror drift as a blocker while building migration plumbing.
- No code changes, build, git commit, or Vercel deploy were performed.

## Moves Method Journey Visual QA Completion - 2026-06-14

- Jay QAed the Journey Visual across Moves examples with complete, partial, missing, and offboarded journey data:
  - Darcy Sturm / Dicken Watson: complete milestone examples looked functionally right, but timeline markers were hard to read.
  - Nicola Everson: no milestones still rendered acceptable fallback state.
  - Don Wood: offboarded/missing-data example exposed close-marker collision between Peak Diagnostic and Strategic Review.
- Updated `src/pages/ClientDetail.tsx` timeline layout:
  - Kickoff and Program End now share the timeline rail and stay edge-aware.
  - Planned checkpoints render above the line.
  - Current renders below the line.
  - Close planned checkpoint labels are staggered into two lanes to avoid collisions.
- Marked Journey Visual QA complete in `MOVES_METHOD_MIGRATION_READINESS.md`.
- Marked the Moves Method migration-readiness pass complete in `ROADMAP.md`.
- `npm run build` passed. Known warnings remain: Anthropic/Beacon browser externalization warnings and the existing Vite large chunk warning.
- No git commit or Vercel deploy was performed.
- Important: this completes Moves Method readiness/plumbing, not final write-mode migration. Final cutover still waits for Jay's fresh paid CST/Glide sync and the reusable Official Company Rollout Checklist.

## Contract / Renewal Confidence V1 Closeout - 2026-06-15

- Worker 2 closed the local Contract tab V1 gaps for app-owned pilot/migrated clients.
- Files changed:
  - `src/pages/ClientDetail.tsx`
  - `supabase/functions/manage-client-contract/index.ts`
  - `ROADMAP.md`
  - `MEMORY.md`
- Client Detail > Contract now:
  - loads archived app-owned `client_contracts` rows so archived history can be filtered/viewed;
  - has Active, Old, Archived, and All filters;
  - labels the app-owned/mirrored client current summary as `Current Contract Summary` and linked rows as contract history;
  - keeps mirror-only companies read-only because write controls still require `canEditClient && isAppOwnedClient`;
  - supports create, edit, archive, and SuperAdmin-only delete for app-owned contract rows.
- `manage-client-contract` now accepts `action = delete` for SuperAdmins only.
  - Delete writes `client_history_events` and `app_audit_events` using existing allowed event type `contract_archived` with `source = contract_delete`, then removes the app-owned contract row and refreshes the client current contract summary from the latest non-archived contract.
  - Directors/Support/CSMs cannot delete; CSMs remain scoped to assigned clients for contract management.
- History/audit behavior:
  - Create/update/archive behavior remains intact.
  - Delete writes client history before the physical delete so a history failure does not silently remove the row.
- V2/later items recorded in `ROADMAP.md`:
  - remind/ensure contract is added when manual or webhook-created clients lack contract info;
  - richer multi-contract/LTV reporting and high-fidelity renewal/reporting flows remain out of V1.
- Verification:
  - `npm run build` passed on rerun. Known Beacon/Anthropic browser externalization warnings and the large Vite chunk warning remain.
  - `git diff --check -- src/pages/ClientDetail.tsx supabase/functions/manage-client-contract/index.ts ROADMAP.md MEMORY.md` passed.
  - No migration was added. Edge Function deploy is still needed for live SuperAdmin delete support.
- No git commit or Vercel deploy was performed.
- DO NOT COMMIT until Jay/parent reviews this Worker 2 closeout together with the parallel dirty work and decides what should be staged.

Correction - 2026-06-15:
- Worker 1 fixed the `src/pages/SaasClientDetail.tsx` `canManageCompanyDefinitions` used-before-declaration error during the Company Customization closeout.
- After that fix, the repo build is blocked by the separate `src/pages/ClientDetail.tsx` syntax errors reported in the Worker 1 verification note below.

## Company Customization Closeout V1 - 2026-06-15

- Worker 1 completed a narrow Company Customization V1 closeout pass.
- Files changed:
  - `src/pages/SaasClientDetail.tsx`
  - `supabase/functions/manage-company-customization/index.ts`
  - `supabase/migrations/20260608100000_company_customization_v1.sql`
  - `ROADMAP.md`
  - `MEMORY.md`
- What changed:
  - Customization now keeps outcome definitions, recurring custom fields, and churn reasons clearly grouped in one place; Company Settings continues to point definition work back to Customization instead of duplicating it.
  - Existing outcome type/value fields are locked in the edit modal so the Success / Progress / Buy-in structure stays constrained while labels and ordering remain editable.
  - Custom field copy now frames fields as recurring Quick Update / Client Profile > Outcomes tracking fields, not client-details-only profile fields.
  - Visible edit controls now require app-owned company data plus the SuperAdmin/Director capability, matching the `manage-company-customization` server rule that rejects non-Directors/CSMs.
  - Added `seed_default_churn_reasons` to `manage-company-customization`; it inserts Financial, Overwhelm, Paused, Spousal, Uncertainty, and Other only when the company has zero `company_churn_reasons` rows.
  - The Customization loader calls that seed action for app-owned companies with no churn reasons, then displays the seeded rows.
  - The company-customization migration fallback churn defaults were aligned to the Jay-approved V1 list for fresh environments.
- Deploy/migration notes:
  - Edge Function update required before live QA: deploy `supabase/functions/manage-company-customization`.
  - No new migration file was created. The existing `20260608100000_company_customization_v1.sql` was adjusted for fresh/local environments; live databases that already ran it will rely on the Edge Function seed path for truly empty company configs.
- Verification:
  - `npm run build` was attempted but blocked by pre-existing syntax errors in `src/pages/ClientDetail.tsx` at lines 2010 and 3735, outside this task's ownership.
  - Scoped check passed: `node_modules/.bin/tsc --noEmit --jsx react-jsx --module esnext --target es2021 --lib dom,dom.iterable,es2021 --moduleResolution bundler --allowImportingTsExtensions --skipLibCheck --types vite/client src/pages/SaasClientDetail.tsx`.
  - `git diff --check` passed for the changed customization files.
- No git commit, Supabase deploy, or Vercel deploy was performed.

Correction - 2026-06-15:
- Worker 2 fixed the temporary `src/pages/ClientDetail.tsx` syntax errors during the Contract / Renewal Confidence closeout.
- `npm run build` now passes. Known Beacon/Anthropic browser externalization warnings and the large Vite chunk warning remain.

## Company Rollout / Closeout Planning - 2026-06-15

- Jay clarified the next high-priority closeout push:
  - Company Customization Closeout should finish custom fields, outcome definitions, and churn reasons as company-level configuration.
  - Contract / Renewal Confidence should finish client-level contract create/edit/archive/delete/filter flows, with reminders for clients missing contracts deferred to V2.
  - Integration/Webhook Polish should wait until the higher-priority plumbing is done; resource guides should eventually show company-scoped variables/tokens.
  - Official Company Rollout Checklist should become the reusable migration checklist Jay can convert into a spreadsheet.
  - Reduce Glide/CST Mirror Dependency should focus first on making Ethical Scaling app-owned/mirror-free before repeating the pattern for other companies.
- Worker 1 completed the Company Customization V1 local slice:
  - `src/pages/SaasClientDetail.tsx`
  - `supabase/functions/manage-company-customization/index.ts`
  - `supabase/migrations/20260608100000_company_customization_v1.sql`
  - `ROADMAP.md`
  - `MEMORY.md`
  - Edge Function deploy still needed before live QA: `manage-company-customization`.
- Worker 2 completed the Contract / Renewal Confidence V1 local slice:
  - `src/pages/ClientDetail.tsx`
  - `supabase/functions/manage-client-contract/index.ts`
  - `ROADMAP.md`
  - `MEMORY.md`
  - Edge Function deploy still needed before live QA: `manage-client-contract`.
- Worker 3 completed an Ethical Scaling mirror-dependency audit without runtime edits:
  - Ethical Scaling is pilot/app-owned and ready for a staged mirror-removal plan.
  - Highest-impact remaining runtime dependencies are company/team shell fallback, mirrored choices/status definitions, historical contracts, historical milestones, some task/calendar paths, and dashboard/history confidence paths.
  - Recommended next step is a staged implementation plan before assigning a build agent, because this can affect many shared surfaces.
- Added `OFFICIAL_COMPANY_ROLLOUT_CHECKLIST.md`.
  - It captures the reusable migration flow: candidate scope, pre-migration prep, final CST/Glide sync and freeze, migration execution, QA matrix, handoff, hold/rollback criteria, and close condition.
  - It explicitly says the paid CST/Glide sync only happens when Jay calls final migration day, and CST/Glide activity must be paused/locked before the final sync.
- Updated `ROADMAP.md` to mark the Official Company Rollout Checklist as `[~] [qa] [priority: high]`, pending Jay review of the checklist format.
- No git commit, Supabase deploy, or Vercel deploy was performed.
- Open follow-ups:
  - Jay QA/review Company Customization V1.
  - Jay QA/review Contract / Renewal Confidence V1.
  - Jay review `OFFICIAL_COMPANY_ROLLOUT_CHECKLIST.md` before turning it into the reusable spreadsheet.
  - Decide the first staged implementation for Ethical Scaling mirror dependency removal.

## Company Customization / Contract QA Polish - 2026-06-15

- Tightened the QA polish pass after Jay's Company Customization and Contract/Renewal review.
- Files changed:
  - `src/pages/SaasClientDetail.tsx`
  - `src/pages/ClientDetail.tsx`
  - `ROADMAP.md`
  - `MEMORY.md`
- What changed:
  - Removed internal company ID and last-sync metadata from the Admin Hub header; it now presents a cleaner company workspace header.
  - Made Company Customization actions render as a clean three-button row on tablet/desktop, with mobile stacking.
  - Contract tab now avoids showing both Current Contract Summary and Latest Contract History for the same app-owned contract; linked app-owned rows become the contract source of truth.
  - Renamed Contract Days to Expected Duration Days and clarified that start/end dates drive renewal timing when present.
  - Added a low-priority roadmap follow-up for drag/drop ordering of customization definitions.
- No Supabase deploy, git commit, or Vercel deploy was performed.
- QA needed from Jay:
  - Confirm Admin Hub header and Customization buttons look clean.
  - Confirm contract display no longer feels duplicated/confusing.

## Ethical Scaling Mirror Dependency Reduction - 2026-06-15

- Started the first runtime mirror-reduction slice for Ethical Scaling.
- Files changed:
  - `src/pages/ClientDetail.tsx`
  - `scripts/backfill-company-activity.mjs`
  - `ETHICAL_SCALING_APP_OWNED_AUDIT.md`
  - `ROADMAP.md`
  - `MEMORY.md`
- What changed:
  - Client Detail now skips mirrored CST contract and milestone history for `pilot` / `migrated` companies and keeps backup fallback for mirror-only companies.
  - Applied contract backfill for Ethical Scaling: 7 current-summary contracts inserted; follow-up dry-run reports 0 remaining.
  - Applied activity/milestone backfill for Ethical Scaling: 32 historical milestone rows inserted; follow-up dry-run reports 0 remaining.
  - `backfill-company-activity` now skips/reports existing active client/milestone conflicts; 2 rows were skipped for Ethical Scaling because active app-owned rows already existed.
  - Fixed audit insert metadata for `historical_activity_backfill` so it satisfies `app_audit_events.entity_table`.
- Verification:
  - `npm run build` passes.
  - Known warnings: Beacon/Anthropic browser externalization and the Vite large chunk warning.
- No git commit, Supabase Edge deploy, or Vercel deploy was performed.
- QA needed:
  - Jay to verify Ethical Scaling contracts/milestones are app-owned-only on Client Detail.
  - Jay to spot-check Moves Method still has mirror read-only fallback.

## Ethical Scaling Mirror Dependency QA + Rollout Checklist Review - 2026-06-15

- Jay QA passed spot checks for Siwash Zahmat, Stephen, and Devon Canup after the Ethical Scaling mirror-reduction slice; Dashboard and CSM Reports also loaded correctly.
- Reviewed Jay's `RetainOS_Company_Rollout_Checklist.xlsx`. Spreadsheet structure maps well to the official rollout checklist: candidate scope, prep, final sync/freeze, execution, QA matrix, and handoff.
- Migration process update: contract/current-renewal coverage is mandatory for every company cutover, including Moves Method. `OFFICIAL_COMPANY_ROLLOUT_CHECKLIST.md` now treats contract backfill/dry-run/coverage spot checks as gates.
- Added low-priority roadmap follow-up for app-owned client image upload/display for RetainOS-created clients. Mirrored/migrated clients can still display CST image URLs when present.
- Files changed: `OFFICIAL_COMPANY_ROLLOUT_CHECKLIST.md`, `ROADMAP.md`, `MEMORY.md`.
- No Supabase deploy, git commit, Vercel deploy, or build was performed; this was documentation/process follow-through after Jay QA.

## Roadmap Closure Pass - 2026-06-15

- Closed validated V1 roadmap loops after Jay QA instead of leaving them in `[~]`: Company Customization V1, Company Settings V1, Client Contracts/Renewals V1, Official Company Rollout Checklist template, Ethical Scaling mirror dependency reduction/app-owned backfill slice, and company custom fields on Client Detail > Outcomes.
- Split future enhancements into explicit V2/later buckets instead of keeping V1 open: optional custom-field list/import/export display, advanced field-type UX, client-list presets, drag/drop ordering, missing-contract reminders, LTV/multi-contract reporting, client image upload, and per-company residual mirror audits.
- Rule going forward: when these areas come up again, label it as either a regression or new V2 scope. Do not reopen the V1 items unless Jay finds a real regression.
- This was a docs-only hygiene pass: no app code changes, Supabase deploy, Vercel deploy, build, or git commit.

## Roadmap QA Queue Cleanup - 2026-06-16

- Per Jay's handoff, completed a docs-only `ROADMAP.md` cleanup so the roadmap no longer presents stale `[~] [qa]` items as a giant active QA pile.
- Files changed:
  - `ROADMAP.md`
  - `MEMORY.md`
- What changed:
  - Added a `Jay QA Queue` section near the top of `ROADMAP.md`.
  - The queue is now the only canonical place to answer "what should Jay QA next?"
  - Recorded that there are no active Jay QA items queued as of 2026-06-16.
  - Reserved `[qa]` for items copied into the Jay QA Queue.
  - Retagged stale `[qa]` roadmap items as `[polish]` or `[mixed]`.
  - Added reason tags to previously untagged active `[~]` bullets.
  - Corrected stale contract duplicate entries so the closed Client Contracts/Renewals V1 work stays `[x]`.
- Verification:
  - Scanned `ROADMAP.md` for active `[~]` bullets without `[qa]`, `[polish]`, `[downstream]`, or `[mixed]`; only explanatory legend/queue text remains.
  - Scanned `ROADMAP.md` for `[qa]`; it now appears only in the status-key reservation and Jay QA Queue language.
- No app code changes, Supabase deploy, Vercel deploy, build, git stage, or git commit was performed.

## Ethical Scaling Role QA Closure - 2026-06-16

- Jay confirmed the Ethical Scaling pilot has been used with Ben and Emily and is working as expected.
- Files changed:
  - `ROADMAP.md`
  - `MEMORY.md`
- What changed:
  - Marked the Ethical Scaling pilot blocker "Role-based end-to-end QA passes using Jay, Ben, and Emily's real accounts" as `[x]`.
  - Added roadmap notes that Dashboard canonical formula validation and CSM Reports formula confidence should wait for Moves Method or another larger migrated-company dataset, because Ethical Scaling has too few active clients to be a strong formula/performance stress test.
- No app code changes, Supabase deploy, Vercel deploy, build, git stage, or git commit was performed.

## Daily Pulse / Notifications Product Polish - 2026-06-16

- Subagent A completed a narrow product-polish pass for Daily Pulse and in-app notification clarity.
- Files changed:
  - `src/pages/DailyPulse.tsx`
  - `src/pages/Clients.tsx`
  - `src/pages/SaasClientDetail.tsx`
  - `ROADMAP.md`
  - `MEMORY.md`
- What changed:
  - Daily Pulse copy now explicitly separates the persistent operating page from the compact reminder bell.
  - Daily Pulse section empty states now say no clients match the selected signal/window instead of using a generic "nothing needs attention" message.
  - Daily Pulse now shows a clear page-level empty state when no Daily Pulse sections are enabled in Company Settings.
  - Daily Pulse now shows a green zero-signal summary when enabled sections have no open items in the selected window.
  - Clients header dropdown is labeled "Reminder bell" and explains it is for short-term reminders, not the full operating view.
  - Company Settings notification copy now distinguishes bell reminders, Daily Pulse sections, and company timing rules more clearly.
- Deliberately not built:
  - Email delivery.
  - Push notifications.
  - Full inbox/read/dismiss/count behavior.
  - Scheduled delivery infrastructure.
  - Canonical formula rewrites.
- No Supabase deploy, Vercel deploy, git stage, or git commit was performed.
- Jay QA checklist:
  - Open `/daily-pulse` for Ethical Scaling and confirm the header distinction between Daily Pulse and the reminder bell reads naturally.
  - Switch Today / This Week / This Month and confirm zero-signal and section-level empty states are clear.
  - Open Clients and confirm the bell dropdown feels correctly scoped as short-term reminders.
  - Open Admin Hub / Company Settings and confirm notification labels describe what is bell-only, Daily Pulse, or timing-rule behavior.

## Daily Pulse / Resources / UX Triage Kickoff - 2026-06-16

- Jay approved two subagent workstreams for today's lighter product/UX push:
  - Daily Pulse + Notifications product polish.
  - Read-only high-fidelity UX triage for Clients, Client Detail, and Admin Hub / Company Settings.
- Created `GLIDE_RESOURCES_EXPORT_TEMPLATE.md` so Jay can paste existing Glide resources in a consistent format before the Resources / Help Center content polish work begins.
- Added a planned medium-priority roadmap item for a shorter client-facing migration QA checklist, separate from the internal official rollout checklist. It should cover simple end-user cutover validation such as login, roster spot checks, CSM assignment visibility, client profiles, updates, contracts, Daily Pulse, and support handoff.
- No Supabase deploy, Vercel deploy, build, git stage, or git commit was performed.

## Daily Pulse QA Approval + HiFi Polish Decisions - 2026-06-16

- Jay QA approved the Daily Pulse + Notifications product-polish pass.
  - Daily Pulse page looked solid.
  - Company Settings notification controls looked clean.
  - Marked `ROADMAP.md` Daily Pulse operating page as `[x]`.
  - Kept broader email delivery, push, and full inbox/read-dismiss behavior as later notification scope.
- Jay HiFi triage decisions:
  - Remove visible "pilot data" / "RetainOS data" source-badge language instead of renaming it.
  - Use `Expected Duration Days` for contract duration display.
  - Hide disabled `Edit SaaS details` in Admin Hub.
  - Add confirmations before integration token revoke / revoke-all actions.
  - Unsaved filter cue and improved empty-state recovery need a quick plain-language review before implementation.
- Files changed in this follow-up:
  - `src/pages/Clients.tsx`
  - `src/pages/ClientDetail.tsx`
  - `src/pages/SaasClientDetail.tsx`
  - `ROADMAP.md`
  - `MEMORY.md`
- Verification:
  - `git diff --check -- src/pages/Clients.tsx src/pages/ClientDetail.tsx src/pages/SaasClientDetail.tsx ROADMAP.md MEMORY.md RETAINOS_RESOURCES_MIGRATION.md` passed.
- No Supabase deploy, Vercel deploy, build, git stage, or git commit was performed.

## Clients Filter Polish - 2026-06-16

- Subagent D completed the approved Clients-page filter polish after Jay approved the plain-language UX.
- Files changed:
  - `src/pages/Clients.tsx`
  - `ROADMAP.md`
  - `MEMORY.md`
- What changed:
  - Added a subtle "Apply filters to update results." cue when draft filters differ from the applied results, using the same normalization as the existing Apply filters action for company, assigned CSM, and secondary assignee scope.
  - Replaced the bare no-results state with recovery copy and a `Clear filters` action that reuses the existing `clearFilters` behavior.
  - Added a roadmap note under the existing `[~] [polish]` Clients / Client Detail HiFi pass; status remains pending Jay QA.
- Jay QA:
  - The unsaved filter cue appears and feels right.
  - A no-match search showed the improved recovery copy.
  - `Clear filters` worked as expected.
- No Supabase deploy, Vercel deploy, git stage, or git commit was performed.

## Resources Category Polish / Arendt Takeover - 2026-06-16

- Arendt, the Resources subagent, stalled after making partial Resources edits and was shut down. Parent took over the bounded Resources slice directly.
- Files changed:
  - `src/pages/Resources.tsx`
  - `RETAINOS_RESOURCES_MIGRATION.md`
  - `supabase/migrations/20260616110000_retainos_resources_migration_seed.sql`
  - `ROADMAP.md`
  - `MEMORY.md`
- What changed:
  - Renamed the filled Glide export from `GLIDE_RESOURCES_EXPORT_TEMPLATE.md` to `RETAINOS_RESOURCES_MIGRATION.md`.
  - Added a RetainOS implementation review to `RETAINOS_RESOURCES_MIGRATION.md`, summarizing covered/live resources, resources that need rewrite/re-record, future/not-live guides, and the recommended next resource pass.
  - Added a seed migration for all 25 resource entries from Jay's Glide export.
  - Rewrite/re-record resources seed as `draft` so SuperAdmins can review them without publishing old Glide-era Looms to customer users.
  - Live dynamic integration guides seed as `published`.
  - Kept the two top-level Resources libraries: RetainOS Help and Company Resources.
  - Added RetainOS Help subcategory pills: All, Setup & Onboarding, Working with Clients, Using the Dashboard, and Automations.
  - RetainOS Help subcategory filtering uses explicit slug overrides for the seeded migration resources, with client-side inference as fallback; no resource category schema migration was added.
  - Added category-aware empty-state copy for RetainOS Help.
- Verification:
  - `node_modules/.bin/tsc --noEmit --jsx react-jsx --module esnext --target es2021 --lib dom,dom.iterable,es2021 --moduleResolution bundler --allowImportingTsExtensions --skipLibCheck --types vite/client src/pages/Resources.tsx` passed.
  - Resource seed sanity check found 25 resource slugs and balanced SQL dollar quotes.
  - `git diff --check -- src/pages/Resources.tsx supabase/migrations/20260616110000_retainos_resources_migration_seed.sql RETAINOS_RESOURCES_MIGRATION.md ROADMAP.md MEMORY.md` passed.
- Follow-up:
  - If Resources categorization needs exact editorial control, add a first-class database `category` or `tags` field to `resources`.
  - Replace seeded guide copy with rewritten RetainOS versions from `RETAINOS_RESOURCES_MIGRATION.md` in small batches.
- No Supabase deploy, Vercel deploy, build, git stage, or git commit was performed.

Apply note - 2026-06-16:
- Jay requested the Resources seed migration be applied instead of left local.
- Ran `npm run db:apply:sql -- supabase/migrations/20260616110000_retainos_resources_migration_seed.sql`.
- Apply succeeded through the repo `exec_sql` path.
- Live Supabase verification found all 25 expected resource slugs:
  - 5 published dynamic integration guides: `zapier-client-webhook`, `course-completion-webhook`, `call-ai-transcript-webhook`, `client-call-summary-webhook`, `client-update-webhook`.
  - 20 draft rewrite/re-record resources for SuperAdmin review.
  - 0 missing seeded slugs.
- No Vercel deploy, build, git stage, or git commit was performed.
