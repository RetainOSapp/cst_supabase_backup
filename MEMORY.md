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
