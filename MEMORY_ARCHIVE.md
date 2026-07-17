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

## Client-Facing QA + Pathways Planning Docs - 2026-06-16

- Galileo and Pauli subagents stalled on the two light docs tasks and were shut down; parent took over directly so the work would not stay half-finished.
- Files changed:
  - `CLIENT_FACING_MIGRATION_QA_CHECKLIST.md`
  - `PATHWAYS_MILESTONES_POLISH_PLAN.md`
  - `ROADMAP.md`
  - `MEMORY.md`
- Created `CLIENT_FACING_MIGRATION_QA_CHECKLIST.md` as a customer-facing migration/cutover signoff checklist, separate from the internal `OFFICIAL_COMPANY_ROLLOUT_CHECKLIST.md`.
  - It covers login, team/assignment visibility, roster spot checks, client profile samples, contracts/renewals, Quick Update, Daily Pulse, Resources, Dashboard/CSM Reports smoke checks, issue tracking, and signoff.
  - Intended next step: Jay can convert it into a spreadsheet and adjust customer-facing wording.
- Refreshed `PATHWAYS_MILESTONES_POLISH_PLAN.md` with a 2026-06-16 product summary.
  - Recommended next lightweight slice: Client Detail milestone completion clarity and real-migration QA before secondary offers.
  - Secondary offers remain deferred until the primary migration flow has more real customer data.
- Updated `ROADMAP.md` to mark the client-facing checklist as `[~] [polish] [priority: medium]`, pending Jay review/spreadsheet conversion, and added the refreshed pathways-plan note.
- No app code changes, Supabase deploy, Vercel deploy, build, git stage, or git commit was performed for this docs pass.

## Pathways & Milestones Product Polish Implementation - 2026-06-16

- Jay answered the open product decisions in `PATHWAYS_MILESTONES_POLISH_PLAN.md`; parent implemented the remaining safe pathway-polish items directly.
- Files changed:
  - `src/pages/SaasClientDetail.tsx`
  - `src/pages/ClientDetail.tsx`
  - `supabase/functions/manage-company-pathway/index.ts`
  - `supabase/functions/manage-client-milestone/index.ts`
  - `PATHWAYS_MILESTONES_POLISH_PLAN.md`
  - `ROADMAP.md`
  - `MEMORY.md`
- What changed:
  - User-facing Admin/Client wording now prefers `Pathway` over `Offer` / `Journey`; internal table/action names still use `offer` for compatibility.
  - `unarchive_offer` now restores the pathway and its associated archived milestones together, matching Jay's product decision.
  - Client Detail milestone completion now offers an optional "start another milestone after completing this one" step, defaulting to the next milestone in line when available while allowing another active milestone.
  - `manage-client-milestone` now returns `selectedMilestone`, `nextMilestone`, `isFinalMilestone`, `durationDays`, and `timeToHitDays`.
  - Historical `client_milestones.metadata.mirrored_milestone_name` snapshots are intentionally not rewritten in this slice; current labels resolve by milestone id, while snapshot rewrites remain a separate explicit migration/tooling decision if needed.
- Verification:
  - Frontend type-check for `src/pages/ClientDetail.tsx` and `src/pages/SaasClientDetail.tsx` passed.
  - `git diff --check` passed for the touched app/function files.
  - `npm run build` passed.
  - Known build warnings remain: Beacon/Anthropic browser externalization and Vite large chunk warning.
  - In-app browser smoke opened the local app at `http://127.0.0.1:5173/`, but this browser session was at `/login`; authenticated Admin/Client UI QA still needs Jay.
- No Supabase Edge deploy, Vercel deploy, git stage, or git commit was performed for this pass.

QA follow-up - 2026-06-16:
- Jay QA passed Admin milestone reordering and active-client pointer stability.
- Jay flagged that archive-blocker errors showed only `Edge Function returned a non-2xx status code`; `src/pages/SaasClientDetail.tsx` now reads the Edge Function response body and shows the affected-client message/sample.
- Admin pathway/milestone counts now say `current active client(s)` to clarify that the count means active client records currently assigned to that pathway/milestone, not incomplete milestone status.
- Jay flagged Quick Update still used stale copy and older milestone behavior:
  - Removed `CST preview fields remain unchanged` from the pilot Quick Update write-status message.
  - Renamed Quick Update `Journey progress` to `Pathway progress`.
  - Quick Update now loads the current pathway's ordered active milestones, shows the next state, accepts a completion date, and can optionally start the next/another active milestone after completion.
- Jay flagged an empty Client Detail `Contract / Program Timing` card for Ali; the card is now hidden when contract timing is unavailable.
- Verification after this follow-up:
  - Frontend type-check for `src/pages/Clients.tsx`, `src/pages/ClientDetail.tsx`, and `src/pages/SaasClientDetail.tsx` passed.
  - `git diff --check` passed for the touched UI/docs files.
  - `npm run build` passed with the known Beacon/Anthropic browser externalization warnings and Vite large chunk warning.
- Still pending:
  - Jay authenticated QA of Admin archive errors and Quick Update milestone completion.
  - Supabase Edge deploy for function changes before live archive/restore/function behavior can be fully validated.

Final QA closure follow-up - 2026-06-16:
- Jay re-tested the latest pass:
  - Quick Update no longer has CST wording.
  - Quick Update milestone completion works, though Ali's test data is now noisy from QA.
  - Client Detail Pathways view no longer shows the empty Contract / Program Timing card.
  - Contract tab for Ali still needs a separate deeper contracts cleanup/review tomorrow; do not keep Pathways & Milestones open for that.
- Final fixes:
  - `manage-company-pathway` affected-client sampling now selects `client_business` instead of nonexistent `business_name`.
  - `manage-company-pathway` catch handler now surfaces Supabase error-object messages instead of collapsing non-Error throws to `Unexpected error.`
  - Admin affected-client sample rendering supports `client_business`.
  - Quick Update `Milestone To Start` now defaults to the next milestone in line whenever the current milestone/list changes, instead of sticking on the first startable milestone.
- Updated `ROADMAP.md` to mark Company Pathways & Milestones setup `[x]` for this V1/polish loop.
- Verification:
  - Focused frontend type-check for `src/pages/Clients.tsx` and `src/pages/SaasClientDetail.tsx` passed.
  - `git diff --check` passed for the latest touched files.
  - `npm run build` passed with the known Beacon/Anthropic browser externalization warnings and Vite large chunk warning.
- Still pending outside this closed loop:
  - Supabase Edge deploy for local function changes.
  - Separate contracts deep dive for Ali / Contract tab display.

## Active MEMORY Archive Before 2026-07-06 Cleanup

The following block was moved out of active MEMORY.md on 2026-07-06 to keep session startup fast. It preserves exact historical notes for search only; do not load it by default.

## Latest Checkpoint - 2026-06-17

- `MEMORY_ARCHIVE.md` was created from the old 1,673-line `MEMORY.md`.
- `MEMORY.md` was reduced to this router format so session startup is faster.
- Keep this file under roughly 300 lines.
- Future session notes should be short. Detailed work logs should go to archive or dedicated scope docs.
- Pathways closure: `npm run build` passed; deployed `manage-company-pathway` and `manage-client-milestone` to Supabase project `zjauqflzxzsbpnivzsct`.
- Commit scope for Pathways closure excludes Beacon local pilot files, `package.json`, `package-lock.json`, `src/components/Header.tsx`, and `old glide project test/`.
- Contract sanity: deployed `manage-client-contract` fix so start date + expected duration days sync a calculated end/filtering date to `clients`; repaired four Ethical Scaling pilot summaries. Ali Back End still has duplicate QA-created contract history rows, which can be tidied later via SuperAdmin delete.
- Roadmap hygiene: Jay QA queue is intentionally tiny; Ethical Scaling pilot/backfill loops are closed; migration plan now reflects Jay-led final sync/cutover instead of long Glide parallel usage.
- Migration cutover packet: `OFFICIAL_COMPANY_ROLLOUT_CHECKLIST.md` now includes command-center flow, no-parallel-run rule, client-facing signoff handoff, and emergency support plan. Moves dry readiness rerun stayed blocked for write migration until final paid sync; current mirror still has 6 active unassigned and 9 active invalid CSM assignments.
- Integration closeout: deployed `zapier-create-client`, `ingest-client-call-summary`, and `webhook-update-client` auth-status fix so revoked/missing company tokens return 401. Live QA with disposable tokens verified client create, duplicate idempotency, unmatched call summary/client update review queue behavior, wrong token type 401, revoked token 401, `last_used_at`, and cleanup.
- Ethical Scaling-only assumptions audit: app-facing pilot copy was generalized, and generic reconcile/backfill scripts now require an explicit company selector instead of silently defaulting to Ethical Scaling. Remaining Ethical Scaling references are intentional historical docs/package aliases and ES-only seed/QA scripts; roadmap owns the remaining `pilot` to `migrated` status decision.
- Role access validation packet: `ROLE_ACCESS_VALIDATION_PACKET.md` maps capability code, route/page gates, server write guards, QA steps, and Jay's applied decisions for Viewer Dashboard, Support Admin Hub, integration review, and role-specific Resources.
- Role access closure: Jay decisions applied. Viewer can access Dashboard read-only without KPI/chart client drilldowns or client-name search; Support stays operational-only; integration review is SuperAdmin/Director only and `manage-integration-review` was deployed; Company Resource drafts are visible to Directors while RetainOS Help drafts remain SuperAdmin-only. `npm run build` passed.
- Dashboard/CSM Reports formula readiness: `DASHBOARD_FORMULA_VALIDATION.md` was rewritten as a migration-day validation packet covering Dashboard KPI formulas, chart/drilldown sources, CSM Reports update-rate/field-upkeep formulas, known weak spots, and Moves Method validation steps. Full formula confidence still waits for a larger migrated company after final sync/backfill.
- Client lifecycle/program closeout: `CLIENT_LIFECYCLE_PROGRAM_CLOSEOUT.md` documents V1 status write behavior, downstream wiring, non-scope items, and Moves Method validation checks. `ROADMAP.md` now queues a bounded Jay QA pass for Paused/Reactivated/Suspended/Offboarded; archive remains separate/future, and downstream reporting/notification confidence remains a Moves Method validation item.
- Client lifecycle QA passed: Jay tested Josh Garvey assigned to Ben and approved the flow. `ROADMAP.md` now marks active/paused/suspended/offboarded lifecycle writes and Client Offboarding flow closed; downstream dashboard/CSM/notification proof still waits for Moves Method migration-day validation.
- Moves migration preflight: 2026-06-18 dry snapshot still shows 4,143 clients, 2,338 active, 6 active unassigned, and 9 active invalid CSM assignments. Added generic `scripts/seed-company-write-mode.mjs`; dry run for Moves passed with no active team email conflicts. DO NOT APPLY until final paid sync and Jay approval.
- Moves temporary Zapier validation rule: optional 3-5 day pre-cutover RetainOS webhook writes are validation-only while Glide stays source of truth. Wipe any temporary Moves app-owned data before final paid sync/backfill.
- Tasks V1.5 local pass: app-owned task edit/status/complete/reopen/dismiss/archive/detail-modal/native-drag behavior is implemented; `task_updated` SQL migration was applied. `manage-client-task` deploy is pending because this shell lacks `/Users/joaogoncalves/.supabase/profile`; deploy from normal authenticated terminal with `npx supabase functions deploy manage-client-task --project-ref zjauqflzxzsbpnivzsct`.
- Tasks V1.5 QA passed: Jay deployed `manage-client-task` and passed company-level creation, client linking/navigation, edit, and drag/drop including `In Progress` after the frontend `in-progress`/`in_progress` normalization fix.
- Task Templates + Urgency V1: `company_task_templates` SQL migration applied. Deployed `manage-company-customization`, `manage-client-create`, and `zapier-create-client`. Admin Hub > Company Settings now manages task templates; New Task can start from manual templates; new client creation/webhook paths auto-create enabled `client_created` template tasks; Tasks shows due soon/today/overdue signals; Daily Pulse now includes a `task_due` section when enabled.
- Task Templates QA follow-up: clarified manual templates as New Task presets, auto-created template tasks now append/render client names, and Tasks list view now mirrors board status groupings with drag/drop. Redeployed `manage-client-create` and `zapier-create-client`.
- Tasks automation/recurring follow-up: deployed `manage-client-task` and `manage-client-profile`. Assigning a primary CSM now claims open unassigned tasks linked to that client. Tasks modal supports recurring tasks with an interval stored in metadata; first completion creates the next occurrence. Board/list status lanes use soft RetainOS palette colors.
- Emily pilot feedback: Client Detail > Program now has an inline Update Next Steps action. It reuses `manage-client-quick-update`, updates the Program Next Steps field, and appends the Quick Update history event. Frontend-only; no function redeploy needed.
- Emily feedback QA fix: Program Next Steps modal now passes `companyLegacyId` to `manage-client-quick-update`; History tab now has Contract / Last Contact / Next Steps / Health Scores filter pills and search.
- Emily final Quick Update / Client Detail polish: Quick Update context cards now have soft hierarchy and no embedded history preview; Client Detail > Program can edit Next Steps, last contact, and next contact together; North Star has an Edit shortcut to the existing profile modal; Outcomes shows current values; Pathway change modal shows current pathway/milestone before edits. Frontend-only; `npm run build` and `npx tsc --noEmit` passed. Jay QA remains open in `ROADMAP.md`.
- Emily final QA follow-up: Outcomes current badges now stay as the saved source of truth while dropdowns default blank/no-change; Pathway change modal includes completion date, start-another-milestone, and green complete-current-milestone controls. Frontend-only; `npm run build` and `npx tsc --noEmit` passed.
- Emily correction: Outcomes preserve-current save now coerces saved labels/values into allowed option values before calling `manage-client-outcomes`; Pathway modal now mirrors the Quick Update `Pathway progress` section layout for current milestone completion. Frontend-only; `npm run build` and `npx tsc --noEmit` passed.
- Emily QA correction: Outcomes now treats blank or same-as-current dropdowns as `No change` so no-op saves are blocked in the UI. Pathway modal always renders the Quick Update-style `Pathway progress` block above pathway reassignment fields, even when the current milestone is already completed. Frontend-only; `npm run build` and `npx tsc --noEmit` passed.
- Outcomes model correction: Outcomes are event-style updates. Current badges show saved value/date, dropdowns allow selecting the same color again, and `manage-client-outcomes` now refreshes the selected outcome date even when the value does not change. Deployed `manage-client-outcomes` to `zjauqflzxzsbpnivzsct`; `npm run build` and `npx tsc --noEmit` passed.
- Emily final QA passed: Jay confirmed Outcomes same-color event updates work and Pathway modal polish is done. `ROADMAP.md` promoted the Emily QA item to `[x]`.

## RetainOS Resources Working With Clients v2 - 2026-06-20

- Added `supabase/migrations/20260620110000_retainos_resources_working_clients_v2_seed.sql` from `RETAINOS_RESOURCES_MIGRATION_v2.md`, seeding the 42 missing Working with Clients entries as RetainOS Help drafts.
- Updated `src/pages/Resources.tsx` categorization to honor `Resource category: Working with Clients` content markers before dashboard/automation inference.
- Applied the SQL via `npm run db:apply:sql -- supabase/migrations/20260620110000_retainos_resources_working_clients_v2_seed.sql`; service-role readback confirmed 43 Working with Clients draft resources including the prior Client Details screen draft.
- `npm run build` passed. Existing Beacon/package/Header dirty work remains unrelated and intentionally uncommitted per current warnings.

## Team Invite Flow Resource Audit - 2026-06-20

- Built local RetainOS invite flow for `How to Invite a Team Member`: `supabase/functions/manage-company-member/index.ts` now provisions/sends login email on create and supports `send_invite`; `src/pages/SaasClientDetail.tsx` shows invite success/error banners and adds Send invite on active team cards.
- Follow-up fix after Send invite returned non-2xx from the stale deployed Edge Function: `src/pages/SaasClientDetail.tsx` now falls back to `prepare-login` + `supabase.auth.signInWithOtp` for the selected member email, so invite delivery works even before `manage-company-member` is redeployed.
- Brand-new user onboarding nuance: invite success messages now include the RetainOS `/login` URL and OTP sends include `emailRedirectTo`; the `invite-team-member` resource was reapplied with login URL guidance.
- Added/applied `supabase/migrations/20260620123000_update_invite_team_member_resource.sql`; service-role readback confirmed `invite-team-member` draft includes RetainOS flow and Send invite copy.
- `npm run build` passed. `deno check` was unavailable in this shell. `npx supabase functions deploy manage-company-member --project-ref zjauqflzxzsbpnivzsct` hung twice, including with escalation, and was interrupted; deploy this function from a normal authenticated terminal before QA.

## Client Offboarding Resource Audit - 2026-06-20

- Upgraded `src/pages/ClientDetail.tsx` status modal for Offboarded: actual end date, contract-end comparison, churn/completed/needs-review classification, company churn reason dropdown with typed fallback, churn notes requirement when churned, and good-fit yes/no capture.
- QA follow-up: `src/pages/ClientDetail.tsx` now writes a roster refresh token after successful status changes, and `src/pages/Clients.tsx` waits for app-owned company detection before loading roster rows. This prevents the Clients page from briefly or persistently showing stale mirrored program statuses until hard refresh.
- Updated/deployed `supabase/functions/manage-client-status/index.ts`; live deploy to project `zjauqflzxzsbpnivzsct` succeeded. The function now computes churn server-side, saves actual offboard date, churn data, offer-fit metadata, and richer history/audit payloads.
- Added/applied `supabase/migrations/20260620133000_update_offboard_client_resource.sql`; service-role readback confirmed `how-to-offboard-a-client` includes actual end date and good-fit guidance.
- `npm run build` passed. `deno check` remains unavailable in this shell. `ROADMAP.md` has a `[qa]` item for Jay to test the richer RetainOS offboarding flow before publishing/re-recording the resource.

## Milestones And Offers Resource Audit - 2026-06-20

- Audited `How to Customize Milestones and Offers`; RetainOS already supports the core flow through Admin Hub / SaaS Client Detail > Pathways & Milestones using `manage-company-pathway`.
- Confirmed create/edit/archive/restore pathways and milestones, move up/down milestone ordering, active-client archive blockers, and mirror-only read-only fallback are live. RetainOS uses safer archive/restore instead of Glide-style delete.
- Added/applied `supabase/migrations/20260620143000_update_customize_milestones_offers_resource.sql`; service-role readback confirmed `customize-milestones-offers` includes Pathways & Milestones, archive guardrails, and reorder guidance.

## Manual Client Creation Resource Audit - 2026-06-20

- Upgraded `src/pages/Clients.tsx` New Client modal with optional profile image URL, next steps, Director Notes for Director/SuperAdmin, and richer initial contract fields: monthly value, contract link, and contract notes.
- Updated/deployed `supabase/functions/manage-client-create/index.ts` to persist those fields into app-owned `clients` and initial `client_contracts`; deploy to project `zjauqflzxzsbpnivzsct` succeeded.
- Added/applied `supabase/migrations/20260620150000_update_add_clients_manually_resource.sql`; service-role readback confirmed `add-clients-manually` includes + New Client, contract details, and after-creation guidance.
- `npm run build` passed after the code changes. RetainOS intentionally handles Slack/folder/supporting links after creation through the client profile links section, and custom fields through Quick Update / Client Detail outcomes instead of inside the create modal.
- Image upload follow-up: added `src/lib/clientImageUpload.ts` and deployed `supabase/functions/upload-client-image/index.ts`; New Client and Client Detail > Edit Profile can now upload JPG/PNG/WEBP/GIF client images up to 5 MB or paste an image URL. Redeployed `manage-client-profile` so profile edits persist `client_image`. Added/applied `20260620152000_update_add_clients_manually_image_upload.sql`.

## Filtering Clients Overview Resource Audit - 2026-06-20

- Upgraded `src/pages/Clients.tsx` filters for the old CST "Filtering Clients (Overview)" use cases: milestone, renewal window, last-contact age, next-contact window, Success, Progress, and Buy-In. List/card/calendar queries now share the same applied filters.
- Corrected the Success filter to use `outcomes_success_value_for_filtering` for both app-owned and mirrored client rows after live schema readback showed `backup_company_clients.outcomes_success_for_filtering` does not exist.
- Added/applied `supabase/migrations/20260620153000_update_filtering_clients_overview_resource.sql`; service-role readback confirmed `filtering-clients-overview` is a draft titled "Filtering clients in RetainOS" with milestone, calendar, Apply filters, and revenue-scope notes.
- `npm run build` passed. Revenue forecast math from the old CST walkthrough remains out of this Clients overview and should be validated under Dashboard / CSM reporting resources.

## Client Full Card Details Resource Audit - 2026-06-20

- Audited the old CST "Client Full Card Details" transcript against current RetainOS Client Detail. No product patch was needed: current RetainOS already has profile edit/image upload, Program next-steps/contact update, Outcomes, Contract, Pathways & Milestones, Client Links, Tasks, History, and richer offboarding/status actions.
- Added/applied `supabase/migrations/20260620154000_update_client_full_card_details_resource.sql`; service-role readback confirmed `client-full-card-details` is now a draft titled "Understanding and updating a client profile" with paired workflow, Client Links, and offboarding notes.
- The same migration lightly cross-links `filtering-clients-overview` to the client profile resource. No app build was run because this slice changed only resource SQL and handoff docs.

## Contact Cadence Resource Merge - 2026-06-20

- Added Last Contact and Next Contact sort options to `src/pages/Clients.tsx` List/Card views. Sorts use `csm_date_of_last_contact` and `csm_date_of_next_contact`; live schema readback confirmed both columns exist on app-owned and mirrored client tables.
- Added/applied `supabase/migrations/20260620155000_merge_contact_cadence_resources.sql`. `using-date-of-last-contact-and-date-of-next-contact-features` is now the canonical draft "Tracking client contact cadence"; `date-of-last-contact-sorting-clients` and `date-of-next-contact` are draft merged pointers.
- `npm run build` passed. The first SQL apply failed because `resources.type = article` violates the table check constraint; migration was corrected to keep pointer rows as `video` and reapplied successfully.

## AI Call Summary Webhook Resource Audit - 2026-06-20

- Audited the old CST/Fathom/Zapier transcript against RetainOS. Core flow was already live: company-scoped token, company ID, summary/notes payload, exact email match, Next Steps update, Last Contact update, history event, intake audit/idempotency, and Integration Review Queue.
- Hardened `supabase/functions/ingest-client-call-summary/index.ts` so payloads can send `client_email` or provider attendee/invitee email lists. RetainOS still only auto-updates when exactly one active app-owned client matches; zero/multiple matches go to review.
- Updated `src/pages/Resources.tsx` Call Summary / Next Steps guide with attendee_emails and optional summary cleanup guidance. Added/applied `supabase/migrations/20260620160000_update_ai_call_summary_resource.sql`; readback confirmed attendee email, review queue, optional cleanup, and Call AI boundary notes.
- `npm run build` passed. Deployed `ingest-client-call-summary` to Supabase project `zjauqflzxzsbpnivzsct`. Smoke test with attendee_emails reached company validation, confirming the new payload shape is accepted by the deployed endpoint.

## Task Management Resource Audit - 2026-06-20

- Audited the old CST "Task Management in RetainOS" transcript against current RetainOS. No product patch was needed: current Tasks already has board/list views, status drag/drop, task detail edit modal, company-level and client-linked tasks, task templates, due urgency, recurring tasks, Daily Pulse visibility, and Client Detail > Tasks.
- Added/applied `supabase/migrations/20260620161000_update_task_management_resource.sql`; service-role readback confirmed `task-management-in-retainos` is a draft with template, recurring, Daily Pulse, mirror-only, and known-later-scope guidance.
- No app build was run because this slice changed only resource SQL and handoff docs. Current later task gaps remain comments, attachments, advanced recurring rules, realtime, and richer notification delivery.

## Quick Update Resource Audit - 2026-06-20

- Audited the old text-only CST "How to Make a Quick Update" notes against current RetainOS. No product patch was needed: Quick Update already supports Next Steps, Notes, Date of Last Contact, Date of Next Contact, Success, Progress, Buy-In, active company custom fields, and current milestone completion/start-next for app-owned pilot/migrated companies.
- Added/applied `supabase/migrations/20260620162000_update_quick_update_resource.sql`; service-role readback confirmed `how-to-make-a-quick-update` is now titled "Making a quick update in RetainOS" and includes pathway progress, offer-change boundary, and call-attendance future-scope guidance.
- No app build was run because this slice changed only resource SQL and handoff docs. Product note: pathway/offer reassignment intentionally remains in Client Detail > Pathways & Milestones rather than Quick Update.

## Redundant Client Details Screen Resource Cleanup - 2026-06-20

- Removed the old `client-details-screen` RetainOS Help draft because the transcript was really about Clients list/detail-card views plus Quick Update context, and those concepts are now covered by Filtering Clients, Quick Update, contact cadence, and the full client profile resource.
- Added/applied `supabase/migrations/20260620163000_remove_redundant_client_details_screen_resource.sql`; service-role readback confirmed zero remaining `client-details-screen` resource rows.
- No app build was run because this slice changed only resource SQL and handoff docs.

## Assign New Clients To CSM Resource Audit - 2026-06-20

- Audited the old CST "Assigning New Clients to a CSM" transcript against RetainOS. The current RetainOS truth is assignment during New Client creation or reassignment from Client Detail > Edit Profile; the old CST-style Director profile notification/new assignment popup is not live and remains later notification scope.
- Added `Unassigned` to the Clients CSM filter in `src/pages/Clients.tsx` so Admin/Director/Support users can find clients that still need a primary CSM. The filter works for app-owned and mirrored client queries.
- Added/applied `supabase/migrations/20260620164000_update_assign_new_clients_csm_resource.sql`; service-role readback confirmed `assign-new-clients-csm` is now titled "Assigning new clients to a CSM in RetainOS" and documents creation assignment, Unassigned filtering, Edit Profile reassignment, task claiming, role limits, and no-popup guidance.
- `npm run build` passed after the Clients filter change.
- Follow-up note: `ROADMAP.md` notification backlog now explicitly tracks a future "Unassigned new client reminder" that should trigger for active/new clients with no Primary CSM and link to Clients filtered by `CSM = Unassigned`.
- Removed the related old CSM-facing assignment acknowledgement draft because it depended entirely on non-live CST popup behavior. Added/applied `supabase/migrations/20260620165000_remove_acknowledge_new_client_assignment_resource.sql`; service-role readback confirmed zero remaining `acknowledging-a-new-client-assigned-to-you-as-a-csm` rows. `ROADMAP.md` now tracks "New client assigned to CSM notification / acknowledgement" as future notification scope.

## Filtering Deep Dive Resource Merge - 2026-06-20

- Audited the old CST "Filtering Clients (Deep Dive)" transcript against the already-upgraded RetainOS Clients filters. No product patch was needed: RetainOS covers CSM, unassigned CSM, status, offer/pathway, milestone, renewals, last contact, next contact, Success, Progress, Buy-In, combined filters, and clear/apply behavior.
- Added `ROADMAP.md` low-priority future feature for renewal forecast / predicted pipeline revenue. Note says Beacon could likely provide the first lightweight version using renewal windows, health signals, CSM, offer/pathway, and contract values before a dedicated UI calculator exists.
- Added/applied `supabase/migrations/20260620170000_merge_filtering_deep_dive_resource.sql`; service-role readback confirmed `filtering-clients-overview` remains the canonical draft "Filtering clients in RetainOS" with deep-dive strategic examples, and `filtering-clients-deep-dive` has zero remaining rows.
- No app build was run because this slice changed only resource SQL and handoff docs.

## Custom Fields Resource And Webhook Audit - 2026-06-20

- Audited the old CST "Custom Fields" walkthrough against RetainOS. RetainOS is stronger than CST for setup and day-to-day usage: app-owned company custom field definitions support typed fields/options/order/archive, and active fields appear in Quick Update plus Client Detail > Outcomes.
- Closed the creation-time webhook gap: `supabase/functions/zapier-create-client/index.ts` now accepts modern `custom_fields` / `customFields` payloads as an object or array, keeps legacy `customfield1..customfield7` compatibility, validates submitted values against active company custom field definitions, writes `client_custom_field_values`, and returns/history/audits custom field changes.
- Updated `src/pages/Resources.tsx` New Client Webhook dynamic guide to show `custom_fields` plus legacy slot parameters.
- Added/applied `supabase/migrations/20260620171000_update_custom_fields_resource.sql`; service-role readback confirmed `custom-fields` is now titled "Custom fields in RetainOS" and includes no-five-slot-limit, webhook, and Quick Update guidance.
- `npm run build` passed. Deployed `zapier-create-client` to Supabase project `zjauqflzxzsbpnivzsct`.

## Contact Cadence Pointer Resource Cleanup - 2026-06-20

- User flagged the third contact-date transcript as repetitive. The conceptual merge had already happened in `20260620155000_merge_contact_cadence_resources.sql`, but the old `date-of-last-contact-sorting-clients` and `date-of-next-contact` drafts still existed as merged pointers.
- Added/applied `supabase/migrations/20260620172000_remove_contact_cadence_pointer_resources.sql`; service-role readback confirmed only `using-date-of-last-contact-and-date-of-next-contact-features` remains, titled "Tracking client contact cadence".
- No app build was run because this slice changed only resource SQL and handoff docs.

## Custom Client Reminders Resource Audit - 2026-06-20

- Audited the old CST "Creating Custom Client Reminders" walkthrough. Pushback decision: do not build a separate reminders object for V1 because RetainOS already covers reminder-style work through client-linked tasks with due dates, due/overdue state, Tasks page visibility, Client Detail > Tasks, Clients reminder bell, and Daily Pulse `task_due`.
- Added/applied `supabase/migrations/20260620173000_update_custom_client_reminders_resource.sql`; service-role readback confirmed `creating-custom-client-reminders` is now titled "Creating client reminders with tasks" and explicitly says Quick Update reminder creation / a separate Reminders panel are not live.
- Updated `ROADMAP.md` task section to capture the product decision and optional future scope: a Quick Update shortcut that creates a client-linked task/reminder.
- No app build was run because this slice changed only resource SQL and handoff docs.

## Multiple Client Emails - 2026-06-20

- Built the RetainOS version of "Managing Multiple Email Addresses per Client": added `client_email_secondary` and `client_email_tertiary` to app-owned `clients` via `supabase/migrations/20260620174000_client_alternate_emails.sql`, including lower-case indexes.
- Updated `src/pages/ClientDetail.tsx` Edit Profile with Email 2 and Email 3 fields. Updated `manage-client-profile` to persist them, `manage-client-create` / `zapier-create-client` to accept creation-time alternate emails, and `src/pages/Resources.tsx` New Client Webhook guide with `client_email_secondary` / `client_email_tertiary`.
- Updated automation matching in `ingest-client-call-summary`, `webhook-update-client`, and `manage-integration-review` so Email, Email 2, and Email 3 can all match integration payloads. Ambiguous matches still go to review rather than auto-applying.
- Added/applied `supabase/migrations/20260620175000_update_multiple_client_emails_resource.sql`; service-role readback confirmed the resource is titled "Managing multiple email addresses per client" and includes Email 2 plus review-safety guidance.
- `npm run build` passed. Applied the schema/resource SQL and deployed `manage-client-profile`, `manage-client-create`, `zapier-create-client`, `ingest-client-call-summary`, `webhook-update-client`, and `manage-integration-review` to Supabase project `zjauqflzxzsbpnivzsct`. Live select confirmed the new columns are queryable.

## Secondary Pathways - 2026-06-20

- Built the RetainOS version of old CST "Adding Secondary Offers" as company-gated Secondary pathway tracking, not a second program lifecycle.
- Added/applied `supabase/migrations/20260620180000_secondary_client_pathways.sql`: `company_settings.enable_secondary_offers`, `companies.enable_secondary_offers`, and app-owned `clients.secondary_offer_milestones_current_offer_id`, `secondary_offer_milestones_current_milestone_id`, `secondary_offer_milestones_current_milestone_change_date` with indexes.
- Updated `src/pages/SaasClientDetail.tsx`, `src/lib/appOwnedData.ts`, and `supabase/functions/manage-company-customization/index.ts` so Company Settings > Feature gates can save the Secondary pathway flag. Deployed `manage-company-customization` to project `zjauqflzxzsbpnivzsct`.
- Updated `supabase/functions/manage-client-milestone/index.ts` with `set_secondary_pathway` and `clear_secondary_pathway`, Director/SuperAdmin-only permissioning, company-setting enforcement, client history events, and app audit events. Deployed `manage-client-milestone` to project `zjauqflzxzsbpnivzsct`.
- Updated `src/pages/ClientDetail.tsx`: Client Detail > Pathways & Milestones now loads the company setting, shows a Secondary Pathway summary when enabled, and the Change Pathway & Milestones modal can set or clear the secondary pathway/milestone.
- Added/applied `supabase/migrations/20260620181000_update_secondary_offers_resource.sql`; because live `resources` had no existing row for this slug, the migration now upserts `adding-secondary-offers` as draft "Adding secondary pathways".
- `npm run build` passed. Live service-role smoke check confirmed secondary pathway columns/settings are queryable and the resource draft exists. `ROADMAP.md` marks this as `[qa]`; Jay still needs to test enable setting, set secondary pathway, clear secondary pathway, and resource wording before publishing/re-recording.

## Secondary Assignee - 2026-06-20

- Completed RetainOS Secondary Assignee support for app-owned pilot/migrated clients. Existing plumbing already included `company_settings.enable_secondary_assignee`, `clients.csm_secondary_assignee_id`, CSM access scoping, Clients/Dashboard filters, and task/milestone/outcome permission checks.
- Updated `src/pages/Clients.tsx`: + New Client now shows Secondary Assignee when the selected company has the feature gate enabled and the actor is not a CSM creating their own assigned client.
- Updated `src/pages/ClientDetail.tsx`: Client Detail > Edit Profile now loads `enable_secondary_assignee` and shows Secondary Assignee beside Primary CSM when the feature gate is enabled.
- Hardened `supabase/functions/manage-client-create/index.ts` and `supabase/functions/manage-client-profile/index.ts`: Secondary Assignee is accepted only when company settings enable it, must be an active visible company member, and cannot equal the Primary CSM. Deployed both functions to Supabase project `zjauqflzxzsbpnivzsct`.
- Added/applied `supabase/migrations/20260620182000_secondary_assignee_resource.sql`, creating the `adding-secondary-assignee` RetainOS Help draft.
- `npm run build` passed. Live service-role smoke check confirmed `adding-secondary-assignee` exists and `clients.csm_secondary_assignee_id` / `company_settings.enable_secondary_assignee` are queryable. `ROADMAP.md` marks this as `[qa]`; Jay should test enable setting, create client with secondary assignee, edit/clear secondary assignee, and CSM visibility as secondary assignee.
- QA correction: Jay found New Client did not respect the newly enabled Secondary Assignee while existing Client Detail did. Root cause was `src/pages/Clients.tsx` loading `enable_secondary_assignee` from `backup_companies` only; patched it to merge app-owned `companies.enable_secondary_assignee` for pilot/migrated companies before gating the New Client modal. Frontend-only; `npm run build` passed.

## Archetypes In Client Views - 2026-06-21

- Built the RetainOS version of old CST "Archetypes — In Client Views" as a company-gated roster signal. Archetype editing already existed in + New Client and Client Detail > Edit Profile through `client_archetype_value`.
- Added/applied `supabase/migrations/20260621100000_archetypes_in_client_views.sql`: `company_settings.enable_archetypes` and `companies.enable_archetypes`.
- Updated `src/pages/SaasClientDetail.tsx` and `supabase/functions/manage-company-customization/index.ts`: Company Settings > Feature gates now has `Client archetypes`, saves to `company_settings`, and mirrors the flag onto `companies`. Deployed `manage-company-customization` to Supabase project `zjauqflzxzsbpnivzsct`.
- Updated `src/pages/Clients.tsx`: pilot/migrated companies merge app-owned `enable_archetypes`; List view shows an Archetype column when enabled; Card view shows Archetype as a compact meta row when enabled.
- Updated `src/lib/appOwnedData.ts` so shared company loading includes `enable_archetypes`.
- Added/applied `supabase/migrations/20260621101000_update_archetypes_client_views_resource.sql`, refreshing `archetypes-in-client-views` as a RetainOS Help draft.
- `npm run build` passed. Live service-role smoke check confirmed `company_settings.enable_archetypes`, `companies.enable_archetypes`, and the `archetypes-in-client-views` resource draft are queryable. `ROADMAP.md` marks this as `[qa]`; Jay should enable Client archetypes, verify List/Card display, edit a client archetype, and confirm roster updates.
- QA correction: Archetype is now a controlled dropdown in + New Client and Client Detail > Edit Profile with only Doer, Controller, Worrier, and Follower. `manage-client-create`, `manage-client-profile`, and `zapier-create-client` normalize accepted values to those Title Case labels and reject invalid values; all three functions were deployed to `zjauqflzxzsbpnivzsct`.
- Added/applied `supabase/migrations/20260621102000_normalize_client_archetypes.sql` and `20260621103000_update_archetype_dropdown_resource.sql`. Live readback for Ethical Scaling confirmed `Doer: 31`, `Controller: 26`, `Worrier: 6`, `Follower: 27`, blank `70`, and `0` lowercase archetype values. The resource draft now documents the controlled dropdown.
- Updated `scripts/seed-ethical-scaling-clients-pilot.mjs` and generic `scripts/seed-company-write-mode.mjs` so future app-owned company migrations normalize legacy Glide archetypes to the same dropdown labels.

## How To Manage Clients Resource Audit - 2026-06-21

- Audited the old CST CSM orientation Loom transcript. No new app build was needed for the orientation itself: RetainOS already covers Clients List/Card views, search/filters, Quick Update, Next Steps/notes/contact cadence, Progress/Buy-In/Success, custom fields, pathway milestone completion, Client Detail, links, tasks, history, contracts, and lifecycle controls.
- Real product gap found: old CST had dedicated Testimonial / Review / Referral asked/received controls. RetainOS can identify advocacy candidates with Success + green Progress/Buy-In filters, but dedicated advocacy write controls remain future scope. `ROADMAP.md` now calls this out explicitly under client outcomes.
- Added/applied `supabase/migrations/20260621104000_update_how_to_manage_clients_resource.sql`, refreshing `how-to-manage-clients` as draft "How to manage clients in RetainOS" with CSM orientation structure and RetainOS boundaries. Live readback confirmed the resource draft exists and includes the advocacy gap note.

## Advocacy Tracking - 2026-06-21

- Built RetainOS Advocacy & Growth tracking for Review, Testimonial, Referral, and Renewal / Upsell. Added `src/lib/clientAdvocacy.ts` and `src/components/ClientAdvocacyPanel.tsx`.
- Added/applied `supabase/migrations/20260621105000_client_advocacy_tracking.sql`: `client_advocacy_events` plus app-owned `clients` advocacy summary columns for status, asked count, received count, last asked date, last received date, and latest note. Migration backfilled existing app-owned clients from legacy Glide fields.
- Updated/deployed `supabase/functions/manage-client-quick-update/index.ts` and `supabase/functions/manage-client-outcomes/index.ts`. Both now accept `advocacyEvents`, insert asked/received event rows, refresh client summary counts, and include advocacy context in history/audit payloads.
- Updated `src/pages/Clients.tsx`: Quick Update now has an Advocacy & Growth panel. Updated `src/pages/ClientDetail.tsx`: Outcomes tab and the older outcomes modal now include the same panel.
- Updated `src/pages/Dashboard.tsx`: Dashboard > Overview now shows Advocacy & Growth cards for asked, received, and ask-to-received ratio by Review, Testimonial, Referral, and Renewal / Upsell. Reporting uses app-owned `client_advocacy_events`, event dates, CSM snapshot, and the existing dashboard filters where applicable.
- Updated `scripts/seed-company-write-mode.mjs` so future Glide-to-app-owned company migrations map legacy advocacy fields into summary columns and `glide_migration` event rows. Updated `scripts/seed-ethical-scaling-clients-pilot.mjs` summary mapping so reruns preserve the new fields.
- Added/applied `supabase/migrations/20260621110000_update_advocacy_resource.sql` and `20260621111000_update_manage_clients_advocacy_boundary.sql`. `reviews-testimonials-and-referrals` is now titled "Tracking reviews, testimonials, referrals, and renewal opportunities"; `how-to-manage-clients` no longer says advocacy controls are missing.
- `npm run build` passed. Live readback for Ethical Scaling showed advocacy events: review asked `3` / received `6`, testimonial asked `19` / received `32`, referral asked `11` / received `19`, renewal/upsell received `3`. `ROADMAP.md` marks this as `[qa]`.
- Jay QA passed the main slice: testimonial save worked from Client Detail, Dashboard > Overview advocacy cards looked good, and dashboard filters worked. Quick Update layout was adjusted so Pathway progress appears before Advocacy & Growth; frontend-only reorder in `src/pages/Clients.tsx`, and `npm run build` passed.
- Client Advocacy Triggers follow-up: added Clients roster filters for Review, Testimonial, Referral, and Renewal / Upsell status (`Any`, `Not asked`, `Asked`, `Received`) for app-owned pilot/migrated companies. Filters combine with the existing CSM/status/pathway/contact/health filters and apply to list/card/calendar client queries.
- Added/applied `supabase/migrations/20260621114000_update_advocacy_triggers_resource.sql`, merging the old `Client Advocacy Triggers` walkthrough into the canonical `reviews-testimonials-and-referrals` resource and deleting the duplicate trigger-specific draft.
- `npm run build` passed after the Clients filter changes. Service-role readback confirmed only the canonical advocacy resource remains and it includes the Clients-filter section. Ethical Scaling smoke counts confirmed the new status columns are queryable: review `153/1/6`, testimonial `128/0/32`, referral `141/0/19`, renewal `157/0/3` for `not_asked/asked/received`.
- Filter UI polish follow-up: `src/pages/Clients.tsx` now keeps Client Name, Status, CSM, Offer, Secondary Assignee when enabled, Last Contact, and Next Contact visible, and moves Milestone/Renewals, Success/Progress/Buy-In, and Advocacy filters into collapsible `Journey & Contract`, `Health & Outcomes`, and `Advocacy & Growth` sections with active-count badges. `npm run build` passed; browser smoke reached login on local `/clients`, so Jay still needs authenticated visual QA.

## Next Steps Resource Audit - 2026-06-21

- User flagged `Using the Next Steps Feature` as repetitive with Quick Update / Manage Clients. No product patch was needed.
- Added/applied `supabase/migrations/20260621112000_update_next_steps_resource.sql`, retitling the draft to `Using Next Steps well` and narrowing it to writing best practices, example structure, history/accountability, and when to use Quick Update vs Program update vs Tasks.
- Live readback confirmed the `using-the-next-steps-feature` resource is draft, includes Best practices / Related resources, and explicitly says not to re-record the full Quick Update workflow there.

## Client History Log Resource Audit - 2026-06-21

- Audited the old CST `Understanding the Client History Log` transcript against RetainOS. No product patch was needed: RetainOS already has a dedicated Client Detail > History tab with filter pills, search, timestamps, source labels, and app-owned history events across the write flows that are live.
- Added/applied `supabase/migrations/20260621113000_update_client_history_log_resource.sql`, retitling the resource to `Understanding client history in RetainOS` and replacing the old three-dot CST drawer workflow with the RetainOS History tab workflow. The migration upserts the resource because live readback showed the draft row was not present before the first update-only pass.
- Service-role readback confirmed `understanding-the-client-history-log` exists as draft, includes the RetainOS History tab guidance, and includes the Call AI boundary.
- Updated `ROADMAP.md` to correct the stale note that History only showed Quick Update events. Remaining history gaps are narrower: AR status changes, call attendance, and deeper task history if users need it.

## North Star Resource Audit - 2026-06-21

- Audited old CST `Leveraging North Star for Proactive Coaching`. No product patch was needed: RetainOS already supports North Star during New Client creation, app-owned profile editing, Zapier/new-client payloads, Quick Update context display, and profile-update history events.
- Added/applied `supabase/migrations/20260621115000_update_north_star_resource.sql`, refreshing the resource as draft `Leveraging North Star for proactive coaching`.
- The updated resource positions North Star as the long-term destination, Next Steps as current actions, Tasks as owned work, and the History tab as the place to review previous North Star/profile changes instead of the old CST inline field history.
- Service-role readback confirmed the resource exists as draft and includes destination/History/Quick Update guidance.

## Admin Tools Overview Resource Audit - 2026-06-21

- Audited old CST `Tools for Admins Only`. No product patch was needed: RetainOS already has the relevant role/capability model and admin surfaces through Dashboard, Clients, CSM Reports, Tasks, Resources, and Admin Hub.
- Added/applied `supabase/migrations/20260621116000_update_admin_tools_overview_resource.sql`, refreshing `admin-tools-overview` as draft `Admin and Director tools in RetainOS`.
- The updated resource maps old CST concepts into RetainOS: Dashboard/Charts for cohort-style analysis, CSM Reports for CSM/profile-upkeep review, Admin Hub for company/team/configuration, and Resources for help/company resources.
- It explicitly marks old CST popup-style alerts and the old More > Call AI pattern as boundary/future/dedicated-resource scope rather than pretending those exact flows are live.
- Service-role readback confirmed the resource exists as draft and includes role model, Admin Hub, CSM Reports, and popup-boundary guidance.

## Terminology Guide Resource Audit - 2026-06-21

- Audited old CST `RetainOS Terminology Guide`. No product patch was needed; the best RetainOS version is a glossary resource for onboarding and migration language alignment.
- Added/applied `supabase/migrations/20260621117000_update_terminology_guide_resource.sql`, refreshing `retainos-terminology-guide` as a draft glossary.
- The updated guide covers account roles, client lifecycle statuses, pathway/offer and milestone language, North Star / Next Steps / contact cadence, Success / Progress / Buy-In, advocacy and renewal/upsell terms, contracts, Dashboard / CSM Reports, Admin Hub, app-owned vs mirrored data, and old CST-to-RetainOS language shifts.
- Service-role readback confirmed the resource exists as draft and includes lifecycle, advocacy, app-owned data, and language-shift sections.

## Progress And Buy-In Resource Audit - 2026-06-21

- Audited old CST `Using Progress and Buy-in for Effective Coaching`. No product patch was needed: RetainOS already supports Success / Progress / Buy-In updates from Quick Update and Client Detail > Outcomes, Clients > Filters > Health & Outcomes, Dashboard > Charts distributions, and client History context.
- Added/applied `supabase/migrations/20260621118000_update_progress_buy_in_resource.sql`, refreshing `using-progress-and-buy-in-for-more-effective-coaching` as draft `Using Progress and Buy-In for effective coaching`.
- The updated resource reframes the walkthrough as an operating guide: Progress vs Buy-In definitions, Success boundary, traffic-light calibration, where to update/review/filter, Dashboard usage, CSM/Admin best practices, and a Progress x Buy-In coaching matrix.
- Service-role readback confirmed the live draft includes Quick Update, Dashboard > Charts, Coaching matrix, definitions, and History guidance.

## Paused And Suspended Resource Audit - 2026-06-21

- Audited old CST `Marking a Client as Paused or Suspended`. No product patch was needed: RetainOS already supports Paused and Suspended through the controlled Client Detail lifecycle/status flow, requires reasons, requires a paused return date, records status changes in client History, supports Clients status filtering, and shows current status mix in Dashboard > Charts > Program Distribution.
- Added/applied `supabase/migrations/20260621119000_update_paused_suspended_resource.sql`, refreshing `marking-a-client-as-paused-or-suspended` as draft `Marking a client as paused or suspended`.
- The updated resource documents RetainOS-specific behavior that did not exist in the old CST transcript: paused return date requirement, app-owned contract extension for the approved pause window where a contract exists, reactivation to Front End / Back End, paused-return notification scope, and the boundary that dedicated Director email alerts for paused/suspended status changes remain roadmap scope.
- Service-role readback confirmed the live draft includes return date, contract extension, Status filter, Program Distribution, History, and Director email alert boundary guidance.

## Dashboard Milestone Breakdown By Offer - 2026-06-21

- Audited old CST `Milestone Progress Breakdown by Offer` and found a real dashboard behavior gap: RetainOS had Dashboard > Charts > Clients By Offer and an Offer filter, but selecting one offer still grouped by offer, producing a one-bar chart instead of the old CST milestone breakdown.
- Updated `src/pages/Dashboard.tsx`: the existing journey chart now stays `Clients By Offer` when no Offer filter is applied, and switches to `Clients By Milestone` when a specific Offer is applied. It loads milestone labels/order from `company_offer_milestones` for app-owned companies or `backup_company_offer_milestones` for mirror-only companies, counts clients by `offer_milestones_current_milestone_id`, and keeps chart drilldowns pointed at the right client segment.
- Added/applied `supabase/migrations/20260621120000_update_milestone_progress_breakdown_resource.sql`, refreshing the `milestone-progress-breakdown-by-offer` draft resource to match the RetainOS behavior and old CST intent.
- `npm run build` passed. Service-role readback confirmed the resource draft includes Clients By Offer, Clients By Milestone, drilldown, and Secondary Pathway boundary guidance. `ROADMAP.md` marks the chart switch as `[qa]`; Jay should test Dashboard > Charts with All offers, then select one Offer and confirm the chart title/data/drilldown change.
- QA follow-up: Jay saw a raw milestone ID in the milestone chart. Live readback for `Pm4s3detsuobvj5xm04q6q` found no matching app-owned/mirror milestone row and no currently assigned clients, but the edge case was valid. Patched `src/pages/Dashboard.tsx` so the chart loads archived app-owned milestones too, labels them as `(Archived)`, labels clients with no milestone as `No current milestone`, and labels missing legacy references as `Unknown milestone (<short id>)` instead of showing the full raw ID. `npm run build` passed.
- Added/applied `supabase/migrations/20260621121000_update_milestone_breakdown_edge_case_resource.sql`; service-role readback confirmed the resource draft now includes Archived and Unknown milestone guidance.
- QA follow-up 2: Jay still saw `Unknown milestone (pM4S3dET...)`. Case-insensitive readback showed that exact milestone exists as `Buy-in` for offer `Ud4LVWyfSKuCfZlRVeQnzQ`, but at least one filtered client (`Marianne Lehikoinen`) had current offer `8Mv0j3xjQpGWQvhaMAdGyg` while still pointing at the `Buy-in` milestone from the other offer. Patched `src/pages/Dashboard.tsx` so the selected-offer milestone chart also resolves current milestone IDs present in the filtered client set even when the milestone belongs to another offer, and labels those as `(from another offer)` for cleanup visibility. `npm run build` passed.
- Added/applied `supabase/migrations/20260621122000_update_milestone_cross_offer_resource.sql`; service-role readback confirmed the milestone resource includes cross-offer mismatch guidance.
- QA follow-up 3: The `(from another offer)` label was confusing because it surfaced a foreign milestone named `Buy-in` inside the selected offer's milestone breakdown. Patched `src/pages/Dashboard.tsx` again so selected-offer milestone charts only show milestones that belong to the selected offer plus a single `Milestone mismatch` cleanup bucket for clients whose current milestone is outside that offer. Drilldown on the bucket still opens the affected clients. `npm run build` passed.
- Added/applied `supabase/migrations/20260621123000_update_milestone_mismatch_resource.sql`; service-role readback confirmed the resource now says `Milestone mismatch` and no longer includes the old `from another offer` guidance.

## Tracking TTV Resource And Dashboard Metric - 2026-06-21

- Audited old CST `Tracking TTV (Time to Value)`. RetainOS already had the configuration foundation: `company_offer_milestones.is_ttv_milestone`, mirrored `backup_company_offer_milestones.ttv_milestone`, Admin Hub milestone editing, and migration scripts that preserve TTV flags.
- Product gap closed in `src/pages/Dashboard.tsx`: Dashboard > Overview now includes a Journey card for `Avg. Time to Value`, plus `Reached` count and `TTV Points`. Formula is TTV milestone completion date minus client onboarding/start date, averaged across clients who reached an active configured TTV milestone in the selected filters. The loader respects company, CSM, secondary assignee, program/status, offer, client start date, and Date Range completion date filters.
- Updated `src/pages/ClientDetail.tsx`: Client Detail > Pathways & Milestones > Milestone Timeline now labels configured TTV milestones with a `Time to Value` badge.
- Added/applied `supabase/migrations/20260621124000_update_tracking_ttv_resource.sql`, refreshing the `tracking-time-to-value` draft resource for RetainOS. Service-role readback confirmed the resource includes Dashboard, Client Detail, filter rules, and Value Activation guidance.
- `npm run build` passed. Supabase smoke check found active TTV milestone example `Tracking` for Ethical Scaling plus an archived test TTV milestone; the Dashboard metric was tightened to active app-owned TTV milestones only. `ROADMAP.md` marks Average Time to Value / TTV as `[qa]`; Jay should validate Admin Hub config, Dashboard metric, filters, and Client Detail badge.
- QA follow-up: `src/pages/Dashboard.tsx` now makes the TTV card details clickable. Clicking `Reached` opens the existing client-list chart detail modal with clients who reached TTV. Clicking `TTV Points` opens a configured milestone dialog because that number represents TTV milestone configuration, not clients. `npm run build` passed.
- Added/applied `supabase/migrations/20260621125000_update_ttv_clickthrough_resource.sql`; service-role readback confirmed the TTV resource now includes `Click Reached` and `Click TTV Points` guidance.
- QA follow-up 2: Jay found the `Reached` clickthrough showed `Unnamed client` rows. Root cause was the TTV client query not selecting `client_name` / `client_image` before reusing the shared chart detail modal. Patched `src/pages/Dashboard.tsx` to include both fields in the TTV client query; `npm run build` passed.

## Retention And Churn Resource Audit - 2026-06-21

- Audited old CST `Understanding Retention and Churn`. No product patch was needed: RetainOS already records renewals through contract-created retention events, calculates churn during controlled offboarding by comparing actual end date against contract end date, and surfaces Retained / Retention % / Up For Renewal / Churn % in Dashboard > Overview > Contracts & Retention with drilldowns.
- Added/applied `supabase/migrations/20260621126000_update_retention_churn_resource.sql`, refreshing `retention-churn-metrics` as draft `Understanding retention and churn in RetainOS`.
- The updated resource documents RetainOS formulas, contract renewal workflow, offboarding churn workflow, Clients renewal filters, Dashboard drilldowns, migration QA checks, and the boundary that predictive renewal forecast / pipeline revenue is future Dashboard / CSM Reports / Beacon-assisted scope.
- Service-role readback confirmed the live draft includes the Retention % formula, Churn % formula, contract flow, offboarding flow, forecast boundary, and migration QA checklist.

## Global Note Search - 2026-06-21

- Built the old CST `Global Note Search Across Client Profiles` as a RetainOS Clients view mode rather than a hidden table switch.
- Added/applied `supabase/migrations/20260621127000_global_client_note_search.sql`, creating RPC `search_client_notes`. It searches current Next Steps, app-owned `client_history_events` text fields, and migrated `backup_company_clients_history` values for filtered clients. It returns paginated rows with source labels, client metadata, matched text, event date, and total count.
- Updated `src/pages/Clients.tsx`: List / Cards / Calendar now has a fourth `Notes` mode. Notes mode has its own keyword search, uses the applied Clients filters before querying notes, highlights matched snippets, shows source badges, paginates results, and links to the matched client profile.
- Added/applied `supabase/migrations/20260621128000_update_global_note_search_resource.sql`, refreshing `global-note-search-across-client-profiles` as draft `Global note search across client profiles`.
- Verification: `npm run build` passed with the existing Beacon/Anthropic browser externalization and chunk-size warnings. Service-role smoke test on Ethical Scaling returned `book` matches through the RPC, and resource readback confirmed Clients > Notes, filter behavior, legacy history coverage, and non-AI-search boundary guidance.
- `ROADMAP.md` marks Global client note search as `[~] [qa]`; Jay should test visual feel, useful known search terms, CSM/offer filters, and at least one known migrated legacy history example.

## Client General Information - 2026-06-21

- Audited old CST `Optional General Info Section on Client Profile`. RetainOS could already display legacy/mirrored General Information in Client Detail > Program, but app-owned clients did not yet have a dedicated editable field.
- Added/applied `supabase/migrations/20260621129000_client_general_info.sql`, adding `clients.client_general_info` and backfilling from `backup_company_clients.client_general_info` where available. Ethical Scaling smoke readback found no non-empty legacy General Info examples, but the mapping is now present for companies that used it.
- Updated `src/pages/ClientDetail.tsx`: Edit Profile now includes `General Information` below North Star and sends `generalInfo` to the profile function.
- Updated/deployed `supabase/functions/manage-client-profile/index.ts` so Edit Profile persists `client_general_info`; also updated/deployed `manage-client-create` to accept `generalInfo` for API/future create payload consistency.
- Updated migration scripts `scripts/seed-ethical-scaling-clients-pilot.mjs` and `scripts/seed-company-write-mode.mjs` so future company/app-owned migrations carry `client_general_info`.
- Added/applied `supabase/migrations/20260621130000_update_general_info_resource.sql`, refreshing `optional-general-info-section-on-client-profile` as draft `Using General Information on a client profile`. Resource readback confirmed Edit Profile, no-old-toggle boundary, and migration notes. `npm run build` passed with existing Beacon/Anthropic/chunk warnings.

## Pathway Progress Consistency Patch - 2026-06-22

- Jay found demo-blocking inconsistencies on Ali's profile: Client Detail and Quick Update could show stale `Optimized Journey / Deep Dive` current pathway/milestone while the milestone timeline showed the real active Back End progress.
- Updated `src/pages/ClientDetail.tsx`: Pathways section and Change Pathway & Milestones modal now derive current pathway/milestone from the latest incomplete `client_milestones` row first, then fall back to legacy `clients.offer_milestones_current_*` fields only when no active progress row exists. The detail FieldGrid label now says `Pathway`, and relation lookups include pathway IDs from milestone history rows.
- Updated `src/pages/Clients.tsx`: Quick Update now loads active `client_milestones` for the open client and uses that corrected pathway/milestone for both display and the `complete_milestone` payload. New Client and Clients filters now use Pathway wording instead of visible Offer wording.
- `npm run build` passed. The build still shows existing local Beacon/Anthropic browser-externalization warnings because Beacon remains an intentionally uncommitted local pilot.
- DO NOT COMMIT remains in force for the local Beacon pilot files unless Jay explicitly asks to ship Beacon: `package.json`, `package-lock.json`, `src/components/Header.tsx`, `src/components/Beacon.tsx`, `src/lib/beacon/*`, plus `old glide project test/`.

## QA Closeout - 2026-07-02

- Jay approved Archetypes, Secondary Assignee, and Offboarding actual-end-date/churn. Secondary Pathway remains in QA after a modal save fix: unchanged primary pathway writes are skipped, unchanged secondary values are skipped, secondary milestone selection is validated, and Edge Function errors now surface their real messages.
- Secondary Pathway follow-up: applied `supabase/migrations/20260702100000_secondary_pathway_history_events.sql` so secondary pathway history events pass the DB constraint; `src/pages/ClientDetail.tsx` now has an expandable secondary milestone progress view. `npm run build` passed. Awaiting Jay retest before promoting in `ROADMAP.md`.
- Secondary Pathway follow-up 2: `src/pages/ClientDetail.tsx` now exposes Start/Complete Secondary Milestone actions from the expanded secondary progress card; `manage-client-milestone` now supports secondary start/complete actions and was deployed to `zjauqflzxzsbpnivzsct`. `npm run build` passed. Awaiting Jay retest.
- Jay retested Secondary Pathway and approved it; `ROADMAP.md` promoted the item to `[x]`.
- Moves Method webhook readiness: deployed `zapier-create-client` and `webhook-update-client` support for canonical `pathway_id`, optional `secondary_pathway_id` / `secondary_milestone_id`, and legacy `offer_id` / `secondary_offer_id` aliases. Build passed.
- Added `--shell-only` to `scripts/seed-company-write-mode.mjs` and applied it for Moves Method. MM is now an app-owned pilot shell (`companies.id = 21586391-9a84-4072-9ae6-20436b27bea9`, legacy `wd7vy0vaQK2hgB3IRqy17w`) with 89 members, 16 pathways, 33 milestones, zero migrated clients, Secondary Pathway enabled, and New Client Webhook enabled.
- Internal MM webhook QA passed using disposable tokens that were revoked afterward. Test client: `retainos-mm-internal-qa-1782986876735@example.com`; create-client returned 200, client-update secondary pathway returned 200, call-summary returned 200 and wrote Next Steps/Last Contact.
- Moves Method Resource guide + shell seed script update was pushed to `main` in commit `7aaafa7`; Vercel deploys from `main`.
- Daniel-call follow-up: updated `src/pages/Resources.tsx` Client Update Webhook guide so the copied request body is a safe minimal payload and optional payload examples are split into Profile fields and Secondary pathway. `npm run build` passed.
- Moves Method access prep: Jay refreshed the Glide backup at `2026-07-02T16:26:17Z`; app-owned `company_members` was refreshed from `backup_company_team` for MM only. Inserted 11 rows, updated 6 archived/status changes, and final verification shows 100 app-owned team rows with 73 active users matching backup. No clients were touched.
- Moves Method custom-field prep: seeded app-owned `company_custom_fields` for legacy Glide slots `customfield1..customfield7`: Gender, Age, Goals, Training Background, Injuries, Close Date, Program Name and Length. Live disposable-token QA against `zapier-create-client` confirmed `customfield6 = 2026-07-02` and `customfield7 = Inner Circle - 3 Months` are accepted and persisted; temporary test client and token were cleaned up.

## Moves Method Loom Polish - 2026-07-02

- Jay found two Loom polish issues before sharing access: Dashboard still surfaced user-facing Offer copy, and Client Detail custom fields were useful but too visually long once webhook-prefilled values existed.
- Updated `src/pages/Dashboard.tsx`: Dashboard-visible filter/chart/drilldown copy now says Pathway / pathways instead of Offer / offers. Internal `offer_*` names remain because the schema and query contract still use those names.
- Updated `src/pages/ClientDetail.tsx`: `CustomFieldEditorGrid` supports a collapsible mode. Client Detail > Outcomes now shows custom fields as an expandable section with a filled-field count; Quick Update and outcome modals remain unchanged.
- `npm run build` passed with the existing Vite/Anthropic browser-externalization and chunk-size warnings.

## Quick Update Long Context Polish - 2026-07-02

- Jay found Loom QA cases where automated North Star / Next Steps values could be very long and made Quick Update visually heavy.
- Updated `src/pages/Clients.tsx`: Quick Update North Star and Next Steps context cards now preview the first 260 characters and show `Read more` when longer. The full value opens in a simple read-only modal using the existing rich-text renderer.
- `npm run build` passed with the existing Vite/Anthropic browser-externalization and chunk-size warnings.

## Milestone-Completed Task Templates V1 - 2026-07-03

- Built the Moves Method-requested task automation as a Task Templates trigger, not as a new customer webhook. Scope is primary pathway milestones only; secondary pathway milestones intentionally do not fire this V1.
- Added/applied `supabase/migrations/20260703100000_task_templates_milestone_completed.sql`: `company_task_templates.trigger_type` now allows `milestone_completed`, and templates have `applies_to_milestone_id` plus an index for pathway/milestone matching.
- Updated `src/pages/SaasClientDetail.tsx`: Company Settings > Task Templates now supports `When milestone is completed`, shows Pathway and filtered Milestone selectors, counts enabled milestone-trigger templates, and sends `appliesToMilestoneId`.
- Updated/deployed `supabase/functions/manage-company-customization/index.ts`: validates milestone-completed templates against active company-owned primary pathways/milestones.
- Updated/deployed `supabase/functions/manage-client-milestone/index.ts`: after primary `complete_milestone`, matching enabled templates create client-linked tasks due `completion date + due offset`. Metadata records template/pathway/milestone context and duplicate protection prevents re-creating tasks for the same template + client milestone progress row.
- `npm run build` passed with existing Vite/Anthropic browser-externalization and chunk-size warnings. Awaiting Jay QA in MM/Admin Hub flow.

## MM Pathway Archive Cleanup - 2026-07-03

- Jay QA passed milestone-completed task templates; `ROADMAP.md` promoted that task automation item to `[x]`.
- Updated `supabase/functions/manage-company-pathway/index.ts`: archive blockers now count only active Front End / Back End clients and check both primary and secondary pathway/milestone fields before allowing archive.
- Updated `src/pages/SaasClientDetail.tsx`: Admin Hub > Pathways & Milestones usage counts now use the same active-client rule and include secondary pathway/milestone usage.
- Deployed `manage-company-pathway` to Supabase project `zjauqflzxzsbpnivzsct`; `npm run build` passed. `ROADMAP.md` has a short Jay QA retest item for archiving unused MM pathways/milestones.
- DO NOT COMMIT remains in force for unrelated local Beacon/package/Header dirty work.

## Task Template Modal Polish - 2026-07-03

- Jay confirmed the missing new Kickoff milestones were resolved by hard refresh, meaning Task Templates had stale settings data rather than missing Supabase rows.
- Updated `src/pages/SaasClientDetail.tsx`: Task Templates modal now refreshes active app-owned pathways/milestones on open and shows refreshing labels while loading.
- Added a Copy action to active task template cards; it opens an unsaved `Copy of ...` draft with the original trigger, assignment, due offset, priority, pathway, and milestone values for faster MM setup.
- `npm run build` passed with existing Beacon/Anthropic browser-externalization and chunk-size warnings.

## Moves Method Migration Local QA Blocker - 2026-07-04

- Jay found local SuperAdmin company switching could load mirror-only companies like Bye Bye Panic, but app-owned pilot companies like Ethical Scaling and Moves Method hung.
- Root cause: page-level company lists on Dashboard / Clients / Tasks only accepted non-archived `backup_companies` rows. Pilot/app-owned companies intentionally have archived mirror rows, so validation effects cleared the selected company while account context immediately restored it, causing a `Maximum update depth exceeded` render loop.
- Updated `src/pages/Dashboard.tsx`, `src/pages/Clients.tsx`, and `src/pages/Tasks.tsx` to merge pilot/migrated `companies` rows into the page company lists even when their mirror backup row is archived.
- Verification: `npm run build` passed with existing Beacon/Anthropic browser-externalization and chunk-size warnings.
- Follow-up Dashboard MM KPI mismatch: canonical Dashboard RPC timed out at MM scale, then the client-side fallback only counted the capped API slice, producing incorrect cards such as 626 active instead of 2,374. Updated `src/pages/Dashboard.tsx` to skip the timed-out canonical path for app-owned companies for now and page through all fallback client rows in 1,000-row batches. Expected MM cards after hard refresh: Active 2,374; Front End 2,037; Back End 337; Off-boarded 1,910. `npm run build` passed.

## Moves Method Cutover Operator Log - 2026-07-04

- Jay confirmed Glide/MM is frozen and approved wiping pre-cutover MM app-owned shadow/client-side rows before clean migration. Jay also marked rollout checklist Phase 0 and Phase 1 complete.
- Wiped MM app-owned shadow rows only for `companies.id = 21586391-9a84-4072-9ae6-20436b27bea9` / legacy `wd7vy0vaQK2hgB3IRqy17w`: `clients` 26, `client_tasks` 34, `client_history_events` 30, `client_milestones` 1, `integration_intake_events` 226, `client_custom_field_values` 100, and `client_advocacy_events` 2. Post-wipe counts for those tables are all 0.
- Preserved MM company configuration: `company_members` 100, `company_offers` 16, `company_offer_milestones` 36 including the 3 Kickoff Call milestones, `company_task_templates` 6, `company_custom_fields` 7, `company_settings` 1, and `notification_preferences` 6.
- Next operator gate: after Jay confirms final paid Glide/CST sync is complete, run the fresh Moves readiness snapshot, verify backup freshness/counts, then prepare/apply the clean app-owned backfill with count confirmation before destructive or source-of-truth changes.
- Jay confirmed final Glide/CST syncs were complete and validated. Fresh readiness snapshot before backfill showed mirror `backup_companies.archived = true` because Glide/MM was frozen/offline, mirror/app-owned target legacy `wd7vy0vaQK2hgB3IRqy17w`, and 4,485 mirror clients with 2,374 active.
- Patched `scripts/seed-company-write-mode.mjs` for cutover-safe preserved config mode: `--preserve-company-config` keeps reviewed app-owned team/pathways/milestones/settings/custom fields/preferences instead of overwriting them from the now-frozen mirror, and keeps the app-owned company `status = active` even when the mirror company is archived. Added `--skip-client-custom-fields` after Jay decided not to backfill old Glide custom-field values into MM's reviewed 7-field setup.
- Applied approved MM client backfill with `node scripts/seed-company-write-mode.mjs --company="Moves Method" --migration-status=pilot --preserve-company-config --skip-client-custom-fields --apply`. Result: `clients` 4,485 imported, app-owned company remains active/pilot, company config remains `company_members` 100, `company_offers` 16, `company_offer_milestones` 36, `company_task_templates` 6, `company_custom_fields` 7, `company_settings` 1, `notification_preferences` 6. `client_custom_field_values` intentionally remains 0.
- Post-backfill readiness snapshot generated `2026-07-04T10:23:17.155Z`: app-owned and mirror client counts match at 4,485; status split matches mirror (`front-end` 2,037, `back-end` 337, `paused` 118, `suspended` 83, `off-boarded` 1,910); active client count 2,374; active clients missing offer/milestone config 0; active contracts have renewal-date coverage via filtering date. Remaining source-data blocker: 5 active clients unassigned and 10 active clients with archived primary CSM assignments.
- Jay accepted the remaining CSM assignment blockers for manual post-migration cleanup.
- Patched `scripts/backfill-company-contracts.mjs` so MM-scale dry runs/apply page app clients, existing contracts, and backup contract chunks instead of sending oversized `.in()` requests or reading only Supabase's default first 1,000 rows.
- Contract backfill dry-run from the fresh sync was reviewed. Jay approved the recommended live-portfolio scope including `front-end`, `back-end`, `paused`, and `suspended`, excluding off-boarded clients.
- Applied `node scripts/backfill-company-contracts.mjs --company="Moves Method" --include-paused-suspended --apply`. Result: 2,583 `client_contracts` rows inserted for 2,575 live/non-offboarded MM clients: 189 historical mirror contract rows and 2,394 current-summary contract rows. Direct verification found 0 live clients missing an app-owned contract row. The readiness script's `missingContractHistory` still describes missing Glide mirror history rows, not app-owned current-summary coverage.
- Jay approved Phase 3 with old CST history kept mirror-only for launch; customer-facing/operator language should say CST/read-only CST history rather than naming Glide. Internal schema fields such as `glide_row_id` remain unchanged.
- Patched `scripts/backfill-company-activity.mjs` for MM-scale pagination/chunked reads before applying. Phase 3 dry-run showed 56 client milestone rows, 0 unresolved skips, 0 active conflicts, 0 duplicate active milestone skips, and 0 additional contracts to backfill.
- Applied `node scripts/backfill-company-activity.mjs --company="Moves Method" --apply`. Result: 56 `client_milestones` rows inserted, `client_history_events` intentionally remains 0, and old CST history remains mirror-only/read-only for launch. Post-apply verification: `client_milestones` 56, `client_contracts` 2,583, `client_history_events` 0.
- Patched `scripts/migration-readiness-snapshot.mjs` output strings to say CST sync instead of Glide sync in operator-facing warnings/notes.
- Phase 3 customization/integration validation: MM has `company_settings` 1 with secondary assignee/offers and Zapier client-create enabled, `company_custom_fields` 7 active, `company_outcome_definitions` 8 active, `company_churn_reasons` 6 active, and `notification_preferences` 6 active in-app defaults. Dynamic integration resource pages are published; no MM company-specific resources exist yet. Active integration token prefixes exist for `client_create`, `client_update`, and `call_summary_next_steps`.
- Contract QA catch/fix: initial contract backfill gave every live client a contract row, but 181 clients with historical contract rows were missing a separate current-summary row, which could make the UI show old contracts as current. Patched `scripts/backfill-company-contracts.mjs` with `--include-current-summary-for-existing-contracts` and applied `node scripts/backfill-company-contracts.mjs --company="Moves Method" --include-paused-suspended --include-current-summary-for-existing-contracts --apply`. Final verification: `client_contracts` 2,764 total = 2,575 active current-summary rows + 189 historical rows; 0 live/non-offboarded clients missing current-summary coverage.
- Jay approved leaving Steven Russell and other contract source discrepancies as-is for launch, using current CST client summary as the RetainOS current contract source and CST history/contract rows as reference/history unless manually corrected after spot-checks. Jay then approved moving Moves Method to write-mode.
- Promoted Moves Method from `migration_status = 'pilot'` to `migration_status = 'migrated'` with `status = 'active'` / `archived_at = null` and wrote an `app_audit_events` record. Final verification: company is active/migrated; counts are `clients` 4,485, `company_members` 100, `client_contracts` 2,764, `client_milestones` 56, `client_history_events` 0, `company_custom_fields` 7, `client_custom_field_values` 0, `company_offers` 16, `company_offer_milestones` 36, `company_task_templates` 6, `notification_preferences` 6. Final readiness snapshot at `2026-07-04T11:30:52.269Z` confirms app-owned/mirror client counts match; remaining assignment warnings are accepted manual cleanup.
- Jay caught that existing MM tasks were not included in the app-owned cutover. Added `scripts/backfill-company-tasks.mjs` and applied `node scripts/backfill-company-tasks.mjs --company="Moves Method" --apply`. Result: `client_tasks` 7,570 rows imported from `backup_company_clients_tasks`, preserving 450 company-level tasks with `client_id = null`, 7,120 client-linked tasks, and 258 unresolved legacy client links flagged as `metadata.unresolved_legacy_client_link = true`. Status mapping result: `todo` 4,821, `in-progress` 281, `waiting` 58, `done` 1,914, `archived` 496. Follow-up dry-run verified idempotency with `existingAppTasks` 7,570 and `toBackfill` 0.
- Jay QA found Tasks page showed only 250 visible tasks after the backfill. Root cause was a frontend `.limit(250)` on `/tasks`, not missing data. Updated `src/pages/Tasks.tsx` so app-owned/pilot/migrated companies page through all matching `client_tasks` in 1,000-row batches and chunk related client lookups. Mirror-only companies keep the old 250-row cap. `npm run build` passed.
- Jay QA found some task cards showed raw assignment IDs after the MM task import. Updated `src/pages/Tasks.tsx` so migrated task assignment display resolves both app-owned member UUIDs and legacy CST member IDs, includes archived members for display-only name resolution, and falls back to `Former team member` instead of leaking raw IDs. Assignable dropdowns still exclude archived/hidden members. `npm run build` passed.
- Jay asked for board task cards to be smaller and more usable as scan cards. Updated `src/pages/Tasks.tsx` board cards to clamp task titles/descriptions, tighten spacing, and keep full content in the existing task detail modal opened by clicking the card. `npm run build` passed.
- Jay QA found moving an imported task to Done could return a generic non-2xx error. Root cause was `manage-client-task` validating the existing legacy `assigned_to_id` as active even for status-only updates; imported MM tasks may be assigned to archived/former members. Patched/deployed `manage-client-task` so assignee active-status validation only runs when the assignee is changed, and updated `src/pages/Tasks.tsx` to surface function JSON errors instead of the generic non-2xx wrapper. `npm run build` passed; deployed function to `zjauqflzxzsbpnivzsct`.
- Added Tasks usability filters for MM cleanup: Status now includes `Overdue` and `Due soon`, and Tasks has a Client filter that persists in URL/session state. App-owned company client loading now pages through all clients so MM's client filter is complete; mirror-only preview keeps its 500-client cap. `npm run build` passed.
- Applied approved Moves Method open-task cleanup with `scripts/cleanup-company-tasks.mjs`: dismissed 1,084 stale open tasks and reassigned 3 recent active-client tasks from archived/former assignees to each client's active Primary CSM. Cleanup rules: Waiting >60d overdue, In Progress >60d overdue, To Do >90d overdue, off-boarded/missing client >30d overdue, archived/former assignee >45d overdue dismissed; archived/former assignee 31-45d overdue on active clients reassigned when an active Primary CSM existed. Post-cleanup verification: total tasks 7,570; open 4,074; closed 3,496; open status split `todo` 3,960, `in-progress` 84, `waiting` 30; open overdue 2,268; due soon 145. Metadata cleanup rows: 1,087.
- Applied approved MM task cleanup second pass with updated `scripts/cleanup-company-tasks.mjs`: dismissed 878 additional stale To Do tasks for missing/off-boarded clients, paused/suspended clients overdue >30d excluding reengage/unpause tasks, onboarding/post-kickoff tasks overdue >45d, and 8-week/diagnostic tasks overdue >60d. Post-pass verification: total tasks 7,570; open 3,196; closed 4,374; open split `todo` 3,082, `in-progress` 84, `waiting` 30; open overdue 1,390; To Do overdue 1,311; due soon 145; cleanup metadata rows 1,965 (`dismiss` 1,962, `reassign` 3).

## Moves Method Role QA Fixes - 2026-07-04

- Jay tested a temporary MM Director QA login and confirmed company scoping worked, but found three launch polish issues: invite success copy pointed to localhost during local QA, CSM Reports returned `Bad Request`, and Directors could not add company-owned MM resources.
- Updated `src/pages/SaasClientDetail.tsx` so invite/login copy and OTP redirect use `VITE_RETAINOS_APP_URL` / `VITE_APP_URL` when configured and fall back to `https://app.retainos.ai` instead of localhost during local QA.
- Updated `src/pages/CsmReports.tsx` so app-owned/mirror history reads chunk large client ID lists, preventing MM-scale Director CSM Reports from sending one oversized request.
- Updated `src/pages/Resources.tsx` so Directors can create/edit selected-company resources while RetainOS Help and dynamic setup guides remain SuperAdmin-only.
- Updated/deployed `supabase/functions/manage-resource/index.ts` to allow active Directors to create/update/archive only company-scoped resources for their own company; RetainOS Help remains SuperAdmin-only. Deployed to project `zjauqflzxzsbpnivzsct`.
- Verification: `npm run build` passed. Jay retested Director access on live and passed the role QA.
- Jay retested on live after commit `764dec3` deployed: Director CSM Reports loaded, Director can create/edit MM Company Resources, and RetainOS Help remains read-only for Director. Director role QA passed.
- Created temporary MM role QA data for CSM validation: client `MM Role QA Client - Delete` / `jay+mm-role-qa-client@ethicalscaling.com` (`clients.glide_row_id = role_qa_client_f26aea9c-2d04-4b09-a768-f4fd509e532c`) assigned to `jay+mm-csm-qa@ethicalscaling.com`, with matching active contract, active Inner Circle 3 Months / Kickoff Call milestone, and task `Role QA task - visible to temp CSM` (`client_tasks.glide_row_id = role_qa_task_c019ece1-cc26-4bd4-aa5a-2de809465669`). All rows are tagged with metadata `created_in = moves_method_role_qa` / `delete_after_qa = true` for cleanup.
- Jay completed Support role QA successfully: Support can see approved company-wide operational views, cannot see/use integrations or token management, and does not have SuperAdmin/company switcher access.
- CSM role QA found temp app-owned CSMs could see assigned clients/tasks but CSM write functions still authorized only against `legacy_glide_row_id`, causing a non-2xx on quick edits for app-owned-only members. Patched/deployed `manage-client-profile`, `manage-client-quick-update`, `manage-client-task`, `manage-client-status`, `manage-client-offboard`, and `manage-client-milestone` so CSM assignment checks accept either `legacy_glide_row_id` or app-owned `company_members.id`. Awaiting Jay retest of CSM quick edits.
- Jay retested CSM quick edits after the Edge Function deploy and confirmed they work. Moves Method role QA is now passed for Director, CSM, and Support.

## Moves Method Client Detail QA Polish - 2026-07-04

- Jay paused the Phase 4 Client Detail QA row because long MM automation Next Steps made the Program tab visually heavy, and some clients appeared to show `0` in a Program-related section.
- Read-only MM app-owned data check found Program text fields migrated: `next_steps_value` present on 3,626 clients, `north_star_value` on 2,555, `client_general_info` on 663; no literal `0` values were found in those Program text fields or current contract-day fields. A wider client-row sample found expected `0` values only in advocacy count fields. Need a specific client name/screenshot if Jay still sees `0` in Program.
- Updated `src/pages/ClientDetail.tsx`: Client Detail > Program > Next Steps now previews long rich text and opens the full value in a read-only `Read more` modal, matching the Quick Update long-context pattern.
- Verification: `npm run build` passed. Awaiting Jay live retest after frontend deploy.

## Moves Method Contract QA Fix - 2026-07-04

- Jay's Phase 4 contract QA found edit/archive/current-summary confusion and confirmed CSM/Support should manage contracts for clients they can manage.
- Updated `src/pages/ClientDetail.tsx`: app-owned contract rows are source-tagged, same-day end dates stay Active, CST mirror labels no longer say Glide, and delete uses the same manage-contract permission as create/edit/archive.
- Updated/deployed `supabase/functions/manage-client-contract/index.ts`: assigned CSM checks accept app-owned member IDs, delete is no longer SuperAdmin-only, create reuses the summary sync path, and summary sync only promotes active/open non-archived contracts.
- Verification: `npm run build` passed; `manage-client-contract` deployed to Supabase project `zjauqflzxzsbpnivzsct`. `ROADMAP.md` has a focused `[qa]` retest item for create/edit/archive/delete and role permissions.
- Jay retested and approved: edited contract value persisted after refresh, archiving removed contracts from Active, and archived contracts appeared correctly under Archived.

## Moves Method Renewal KPI QA Fix - 2026-07-04

- Jay's renewal QA found Dashboard > Up For Renewal showed 2,348 for MM with no Date Range, effectively nearly every active client, while Clients renewal windows showed much smaller overdue/next-30 counts.
- Updated `src/pages/Dashboard.tsx` so renewal KPI calculations and drilldowns use overdue through next 30 days by default when no Dashboard Date Range is set; explicit Date Range still wins. Dashboard now uses `current_contract_end_date_for_filtering`, includes non-archived historical contract rows for overdue cases, and excludes archived app-owned contract rows by status/archived flag.
- Updated KPI help copy in `src/components/dashboard/kpis/UpForRenewalKpi.tsx` and `RetentionPercentageKpi.tsx`.
- Verification: `npm run build` passed. Read-only MM sanity count for July 4, 2026 expects default Up For Renewal around 451 after retained-client exclusion.
- Follow-up polish: Dashboard renewal KPI drilldown now includes Renewal Date, defaults to renewal-date sort, and lets the header toggle ascending/descending sort.
- QA catch: card showed 438 while drilldown showed 70 because the drawer still subtracted broad retained-history clients. Aligned Up For Renewal card and drawer on active clients due in the renewal window; retained history remains for Retention Percentage only.

## Moves Method Renewal Drilldown Count Fix - 2026-07-04

- Jay still saw Dashboard > Active Clients Up For Renewal card at 438 while the drilldown modal showed 70 results after repeated refreshes.
- Root cause: the card path paged through all 4,486 MM app-owned clients, but the drilldown detail query used one Supabase range request and only received the first 1,000 rows in production. The first page happened to contain 70 current-summary renewal matches.
- Updated `src/pages/Dashboard.tsx`: KPI detail drawers now page client rows in 1,000-row batches, related history/contract reads are chunked in 500-ID batches, and Active Clients Up For Renewal uses the current client contract summary set to match the Clients renewal filters. Read-only sanity count for July 4, 2026: current-summary active renewal window = 438.
- Verification: `npm run build` passed with existing Beacon/Anthropic browser-externalization and chunk-size warnings.

## Dashboard KPI Info Privacy Hotfix - 2026-07-04

- Jay found Dashboard KPI info dialogs exposed raw SQL, company IDs, internal table names, and schema language to client-visible users.
- Updated `src/components/dashboard/kpis/*`, `src/components/dashboard/kpis/KpiCardBase.tsx`, and `src/pages/Dashboard.tsx`: removed the SQL modal section and copy-SQL action, changed the modal subtitle to "How this card works", and replaced KPI descriptions with plain-language explanations that avoid database/table/field names.
- Deleted `src/lib/dashboardKpiSql.ts` so raw KPI SQL is no longer part of the client dashboard code path.
- Verification: `npm run build` passed with existing Beacon/Anthropic browser-externalization and chunk-size warnings. Roadmap has a focused `[qa]` retest item for the KPI info dialogs.

## Git Push Workflow Note - 2026-07-04

- GitHub/network DNS is often blocked in the default sandbox. When Jay explicitly asks to push, use the approved/escalated `git push` path directly instead of first trying a sandboxed push that predictably fails with DNS errors.
- If Jay says not to push live, do not run `git push` at all; local commits are okay only when useful, and `main` may intentionally stay ahead of `origin/main`.

## Moves Method Launch Handoff Checkpoint - 2026-07-04

- Jay completed final Phase 4 QA gates for Moves Method: pathway progression on the QA client completed both milestones and showed 100%; Bye Bye Panic confirmed mirror fallback still loads; MM app-owned writes persisted on real clients, including off-boarded clients; and Dashboard KPI info modal privacy retest passed after SQL/schema removal.
- Dashboard renewal KPI retest passed functionally after the full-client drilldown fix; remaining note is performance polish for the full-scale renewal drawer, not a launch blocker.
- Read-only MM drift audit: app-owned clients = 4,486, CST mirror snapshot clients = 4,485, and the only app-owned-only row is `MM Role QA Client - Delete` / `jay+mm-role-qa-client@ethicalscaling.com`.
- Webhook/token handoff check: MM has one active non-expiring token each for `client_create`, `client_update`, and `call_summary_next_steps`. Client create/update tokens show Daniel/MM Zapier usage on 2026-07-03; call-summary next steps processed and matched Janet Post on 2026-07-04.
- Latest-client screenshot audit: all 30 CST-visible latest clients Jay sent were found in MM app-owned RetainOS data. Practical newest normal synced client marker is Cheryl Rieger (`cheryl.rieger13@gmail.com`, onboarded 2026-07-03T23:08:35.402Z); Emily Ward exists too but is future-dated to 2026-08-01.
- No app code changes in this checkpoint. Existing intentionally dirty local Beacon/package/Header files remain uncommitted.

## Moves Method Role QA Cleanup - 2026-07-04

- Deleted the temporary MM QA auth users `jay+mm-director-qa@ethicalscaling.com`, `jay+mm-csm-qa@ethicalscaling.com`, and `jay+mm-support-qa@ethicalscaling.com`, plus their `company_members` rows.
- Deleted the temporary client `MM Role QA Client - Delete` / `jay+mm-role-qa-client@ethicalscaling.com` (`clients.glide_row_id = role_qa_client_f26aea9c-2d04-4b09-a768-f4fd509e532c`) and its associated QA-only rows: 2 tasks, 13 client history events, 2 client milestones, 2 client contracts, and temp-created audit rows.
- Verification after cleanup: temp auth matches = 0, temp `company_members` = 0, temp client = 0, temp task/history/milestone/contract/audit rows = 0.
- MM app-owned clients now match the CST mirror snapshot again at 4,485 / 4,485. Paged status verification: `front-end` 2,037, `back-end` 337, `paused` 118, `suspended` 83, `off-boarded` 1,910.
- No app code changes in this cleanup. Existing intentionally dirty local Beacon/package/Header files remain uncommitted.

## Moves Method Secondary Pathway Webhook Hotfix - 2026-07-05

- Jay/Daniel found MM's client update Zap failed for AA Bundle because AA Bundle has no milestones and `webhook-update-client` required `secondary_pathway_id` plus `secondary_milestone_id`.
- Used a separate clean hotfix worktree from `origin/main` so the dirty local `security-phase-0` project was not touched.
- Updated `supabase/functions/webhook-update-client/index.ts`: `secondary_pathway_id` can now be sent without `secondary_milestone_id`; milestone validation only runs when a milestone is provided; sending a milestone without a pathway still returns a validation error.
- Updated `src/pages/Resources.tsx` client update webhook resource copy/body example so secondary milestone is documented as optional for pathways with no milestones.
- Deployed `webhook-update-client` to Supabase project `zjauqflzxzsbpnivzsct` with `--no-verify-jwt`. Verification: `npm run build` passed in the hotfix worktree; live webhook call with a temporary token applied AA Bundle to Stacie Rigney (`faithworks8@gmail.com`) with no milestone; temporary token was deleted afterward.
- Remaining manual cleanup after verification: Daniela Chiaramonte, Elizabeth Stenger, Judie Myers, Lucie Marie Guilbert, Michael Garcia, and Sandy Dawson still had blank secondary pathway fields at the last readback.

## Moves Method Secondary Pathway Manual UI Hotfix - 2026-07-05

- Jay found Client Detail > Change Pathway & Milestones still blocked manual AA Bundle assignment with "Choose a secondary milestone first."
- Updated `src/pages/ClientDetail.tsx`: the secondary pathway modal now allows saving a secondary pathway without a milestone and shows "No milestones for this pathway" when the selected pathway has no milestones.
- Updated/deployed `supabase/functions/manage-client-milestone/index.ts`: `set_secondary_pathway` now accepts a blank milestone, writes `secondary_offer_milestones_current_offer_id`, leaves `secondary_offer_milestones_current_milestone_id = null`, and records clean history/audit text using the pathway name. Primary pathway, start milestone, and complete milestone actions still require a milestone.
- Verification: `npm run build` passed in the hotfix worktree. Deployed `manage-client-milestone` to Supabase project `zjauqflzxzsbpnivzsct`. No temporary QA users were created.

## Moves Method Task Dismissal Hotfix - 2026-07-06

- Adam Zomparelli reported that dragging tasks from To Do to Dismissed on the MM Tasks board returned "Unexpected error."
- Root cause: `manage-client-task` revalidated linked clients on every CSM task update and validated assignees with `id.eq.<assignedToId>` even when the task used a legacy Glide member id. Imported MM tasks can be CSM-owned while pointing at legacy-only client ids; the UUID comparison could throw before the status update.
- Updated/deployed `supabase/functions/manage-client-task/index.ts`: CSM-owned task updates only revalidate the linked client when the user changes the task's client link, and assignee lookup only compares against `company_members.id` when the supplied id is actually a UUID. Legacy member ids use `legacy_glide_row_id`.
- Verification: `npm run build` passed in the hotfix worktree. Live smoke test created a temporary MM CSM auth user/member and temporary task assigned to that CSM with a legacy-only client id; the deployed function moved it to `dismissed` successfully. Cleanup verification found 0 temp auth users, members, tasks, history rows, or audit rows.

## Moves Method Contacted Button Hotfix - 2026-07-06

- Jay/coach feedback from the MM launch: RetainOS needed the old CST one-click contacted action so CSMs can mark quick touchpoints without opening Quick Update.
- Used the separate clean hotfix worktree from `origin/main`; did not touch the dirty local `security-phase-0` project.
- Updated `src/pages/Clients.tsx`: Clients list and card views now show a compact calendar-check icon for app-owned companies where the user can Quick Update. Clicking it calls `manage-client-quick-update` with `contactTouch: true` and updates Last Contact to today, then refreshes the visible client row/card.
- Updated `supabase/functions/manage-client-quick-update/index.ts`: the function now preserves fields that are not sent, so the contacted action can update only Last Contact. If company settings metadata enables `contact_touch_sets_next_contact`, the function also sets Next Contact to Last Contact plus `contact_touch_next_contact_days`.
- Updated `src/pages/SaasClientDetail.tsx` and `supabase/functions/manage-company-customization/index.ts`: Company Settings now has a Contact cadence automation section with a toggle and days field stored in `company_settings.metadata`.
- Deployed `manage-client-quick-update` and `manage-company-customization` to Supabase project `zjauqflzxzsbpnivzsct`.
- Verification: `npm run build` passed in the hotfix worktree by temporarily symlinking to the main workspace `node_modules`; the symlink was removed before commit. Jay live QA is still pending.

## Moves Method Contact Cadence Coverage Follow-up - 2026-07-06

- Jay asked whether the Company Settings "Set next contact with last contact" rule covers three flows: the new roster contacted button, manual Quick Update edits, and Fathom/call-summary webhook updates.
- Updated `src/pages/Clients.tsx`: roster contacted buttons now use the RetainOS blue treatment; Quick Update only sends Last Contact / Next Contact when the user edits those fields, preventing notes-only updates from accidentally shifting next-contact dates while still allowing the automation to run when Last Contact is manually changed.
- Updated `src/pages/ClientDetail.tsx`: the Program tab's Update Next Steps/Contact modal uses the same touched-field behavior for contact dates.
- Updated/deployed `supabase/functions/ingest-client-call-summary/index.ts`: direct call-summary/Fathom events now set `csm_date_of_next_contact` from the company metadata rule when they update Last Contact.
- Updated/deployed `supabase/functions/manage-integration-review/index.ts`: manually matched/retried call-summary events and reviewed client-update events now apply the same next-contact automation when Last Contact is updated and Next Contact is not explicitly provided.
- Redeployed `manage-client-quick-update`, `ingest-client-call-summary`, and `manage-integration-review` to Supabase project `zjauqflzxzsbpnivzsct`. Verification: `npm run build` passed in the hotfix worktree by temporarily symlinking to the main workspace `node_modules`; the symlink was removed before commit.

## Moves Method Legacy History Visibility Hotfix - 2026-07-06

- Lorcan/Jay flagged that coaches expected old CST call info, transcripts/summaries, and Next Steps history to be visible from the client profile. The MM cutover intentionally kept old CST history mirror-only, but Client Detail > History was only loading app-owned `client_history_events`.
- Live readback confirmed Angela Røren's old CST history rows exist in `backup_company_clients_history` by `client_id`, including a `change_type_code = next-steps` row with the full old Fathom/Next Steps summary.
- Updated `src/pages/ClientDetail.tsx`: History now loads up to 100 app-owned RetainOS events plus up to 100 legacy CST mirror rows for the same client, maps CST rows into the same timeline, sorts newest-first, and labels them as CST history / Imported from CST.
- Added a Calls filter, kept the Next Steps filter, rendered long history values through the existing rich preview/read-more modal, converted raw `<br>` text into readable content, and made plain Fathom/recording URLs clickable.
- Verification: `npm run build` passed in the hotfix worktree by temporarily symlinking to the main workspace `node_modules`; the symlink was removed before commit. No Edge Function deploy required; this is a frontend/history read-path hotfix.

## Moves Method History Edit/Delete Hotfix - 2026-07-06

- Ben/Jay requested CST-style history cleanup controls so a mistaken client action can be corrected from Client Detail > History.
- Updated `src/pages/ClientDetail.tsx`: each manageable history entry now has row actions for Change date and Delete history entry, with a date modal and delete confirmation. The actions work for both app-owned RetainOS history and imported CST mirror history rows.
- Added/deployed `supabase/functions/manage-client-history/index.ts`: role-gated history management for pilot/migrated companies. SuperAdmin/Director/Support can manage company-visible client history; CSMs can manage assigned-client history only. Deletes/updates write `app_audit_events` before/after data for accountability.
- Product note: deleting/changing a history row changes the visible history timeline only; it does not automatically roll back the client's current profile/program fields.
- Verification: `npm run build` passed in the hotfix worktree by temporarily symlinking to the main workspace `node_modules`; `manage-client-history` deployed to Supabase project `zjauqflzxzsbpnivzsct`. Awaiting Jay live QA.

## Moves Method Legacy Health History Visibility Hotfix - 2026-07-06

- Jay QA passed History date/delete controls and flagged that migrated CST Health Scores history was still not visible like Calls and Next Steps.
- Updated `src/pages/ClientDetail.tsx`: legacy CST history rows whose `change_type_code` references Success, Progress, Buy In, health, or outcomes now classify into the Health Scores filter and show the historical score value in the matching score column when possible.
- Increased Client Detail history loading from 100 app-owned / 100 CST rows to 200 app-owned / 500 CST rows and removed the combined 160-row cap so older CST health-score events are not hidden behind high-volume Fathom/Next Steps history.
- Audit clarification: history edit/delete audit lives in internal `app_audit_events`; there is no user-facing audit log page yet.
- Verification: `npm run build` passed in the hotfix worktree. No Edge Function deploy required.

## Moves Method Current Outcome History Synthesis - 2026-07-06

- Jay tested Caroline Anthony and found Health Scores history was still blank even though Outcomes and the roster showed current migrated score values/dates.
- Root cause: some CST health-score data exists only as current client fields (`outcomes_*_value` + `outcomes_*_date`) rather than discrete rows in `backup_company_clients_history`.
- Updated `src/pages/ClientDetail.tsx`: Client Detail > History now synthesizes "migrated current field" Health Scores entries from current Success, Progress, and Buy In values when they have dates. These rows dedupe against real history rows when the same score/date/value exists.
- Verification: `npm run build` passed in the hotfix worktree. No Edge Function deploy required.

## Active MEMORY Archive - 2026-07-13 Cleanup

The following completed checkpoints were moved verbatim from active `MEMORY.md`
to keep the startup router below 150 lines.

## Latest Checkpoint - 2026-07-06 Memory Cleanup

- Active `MEMORY.md` was reduced from 669 lines to this short router/current-state file.
- The stale active block from `Latest Checkpoint - 2026-06-17` onward was moved under `## Active MEMORY Archive Before 2026-07-06 Cleanup` in `MEMORY_ARCHIVE.md` for search-only history.
- Resource migration details should live in `RETAINOS_RESOURCES_MIGRATION.md`, resource SQL migrations, `ROADMAP.md`, or archive, not active memory.
- Future entries here must be durable operational facts only; completed work summaries should go to roadmap/archive.

## MM Launch Reminder Bell Pause - 2026-07-06

- Clients-page reminder bell data loading is intentionally paused during MM launch; the bell shows "in development" and CSMs should use Daily Pulse + Tasks. Details/future scope live in `ROADMAP.md`.

## Daily Pulse Strategic Review Completion - 2026-07-07

- Strategic Review remains a Company Timing Rule, not a pathway milestone. Completion is stored in `client_timed_checkpoint_completions` via `manage-client-timed-checkpoint`; Daily Pulse shows SR pending/complete from the configured contract-end offset.

## MM Retention Formula Correction - 2026-07-07

- Dashboard retention now splits migrated CST history from RetainOS-era writes: CST FE->BE and BE->BE `program-status` movements count as historical retention events by CST modified date; new RetainOS retention counts only Renewal/Upsell contract events by contract start date.
- Live SOP resource `retention-churn-metrics` was refreshed via `20260707180000_update_retention_sop_resource.sql`.
- 2026-07-09 hotfix: app-owned Dashboard retention uses `dashboard_retention_counts_fast` to count unique retained clients server-side for migrated CST history.

## Status-Only Retention Company Setting - 2026-07-07

- RetainOS-era status-only retention is strict/off by default, but `company_settings.allow_status_change_retention` can let a company count active Front End / Back End status movements as retention without a paired Renewal/Upsell contract.
- Migration `20260707183000_status_change_retention_setting.sql` and `manage-company-customization` were applied/deployed live before the app push.

## Fathom Recording URL Hotfix - 2026-07-08

- Fathom payloads include `recording_url`; `ingest-client-call-summary` / `manage-integration-review` now normalize it onto history payloads, and Client History reads existing metadata/raw payload links.
- Follow-up UI hotfix: Client Detail > Program and Update Next Steps/Contact surface the latest Fathom recording link from call-summary history without rewriting the note body.

## Company Status Labels - 2026-07-08

- Company Settings can now store display-only program/status labels in `metadata.program_status_labels`; canonical values stay unchanged for migration/reporting.
- MM was seeded with `suspended` displayed as `MIA` via `20260708170000_mm_program_status_labels.sql`; `manage-company-customization` was deployed for Admin Hub saves.

## Contract Type UI Removal - 2026-07-08

- Client Detail no longer shows Contract Type in contract create/edit/display; `manage-client-contract` preserves existing metadata when editing.

## MM Advocacy Dashboard Fallback - 2026-07-08

- Dashboard Advocacy & Growth counts migrated client summary advocacy dates as fallback rows; MM-only backfill `20260709100000_backfill_missing_advocacy_events_from_clients.sql` was applied live.

## Call AI Reconciliation Page - 2026-07-09

- `/call-ai` is the V1 home for unmatched Fathom/call-summary reconciliation; Support can match/retry/ignore, and manual matches learn the event email into Email 2/3 when a slot is open.

## Recurring Task Templates - 2026-07-10

- Added recurring fields to `company_task_templates`, Task Templates UI, manual presets, client/milestone template task creation, and active-client-only recurrence guard in `manage-client-task`; build passed and functions deployed.

## Security Rollout Release Candidate - 2026-07-13

- Production Phases 0, 0.5, 1A, 1B, 1D, and 1E are deployed and Jay-QAed; Phase 1C mirror-policy work is intentionally deferred until remaining Glide companies migrate.
- Current Advisors: Security `0 errors / 24 warnings / 6 info`; Performance `0 errors / 0 warnings / 40 info`. Remaining entries are classified/deferred in `SECURITY_PERFORMANCE_AUDIT.md`.
- The clean local consolidation branch is `codex/security-source-consolidation` in `/private/tmp/retainos-security-source-consolidation`; it excludes Beacon and secrets and must not be pushed or merged without Jay's explicit approval.
- Detailed rollout state, rollback steps, and verification evidence live in `SECURITY_ROLLOUT_PLAN.md`; do not expand this memory checkpoint with the rollout log.
- 2026-07-13 correction: Jay approved the release; commits through `e4cda12` were fast-forwarded to production `main`, Vercel succeeded, and live app/login/bundle smoke passed. Beacon and Anthropic client code remain absent.
