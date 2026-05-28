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
- `/clients` stores company/filter/page/view state in `sessionStorage` under `cst.clientsRosterState.v1` so returning from a detail page does not reset the roster.

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
- Dashboard KPI RPCs do not currently accept offer as an argument, so when an offer is selected the dashboard uses a client-side KPI fallback for the KPI cards. The normal no-offer dashboard path still uses the existing Supabase RPCs.

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

SaaS Clients page notes:

- Reads companies from `backup_companies`.
- Reads team/director preview data from `backup_company_team`.
- Active/Archived filters use `backup_companies.archived`.
- Paused is a placeholder count/filter until there is a confirmed pause/status field.
- Add New SaaS Client modal opens for UX testing but Submit is disabled.

SaaS Client details notes:

- Team tab reads `backup_company_team`.
- Role labels are inferred for now:
  - `role_is_saa_s_admin` -> Director.
  - `role_read_only_user` -> Viewer.
  - `role_hide_from_csm_list` -> Support.
  - Otherwise -> CSM.
- New Team Member modal opens for UX testing but Submit is disabled.
- Edit/offboard/team member actions remain disabled while the app is in read-only mode.
