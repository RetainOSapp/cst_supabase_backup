# Ethical Scaling Write-Mode Pilot QA

Use this checklist after applying the pilot migration and backfill.

## Scope

Pilot company: Ethical Scaling.

Goal: prove app-owned `companies`, `company_members`, and `app_audit_events` work before broadening write mode beyond the first Team pilot flow.

Non-goals:

- Do not migrate every company.
- Do not write to `backup_*` tables.
- Do not enable broad client writes yet.

## Setup Commands

Apply the migration through Supabase CLI or SQL editor:

```bash
supabase db push
```

Backfill Ethical Scaling pilot rows:

```bash
npm run pilot:seed:ethical-scaling:dry
npm run pilot:seed:ethical-scaling
```

Run QA:

```bash
npm run pilot:qa:ethical-scaling
```

## Expected QA Results

- Exactly one source company matches Ethical Scaling in `backup_companies`.
- One app-owned `companies` row exists with:
  - `legacy_glide_row_id` matching the source company.
  - `migration_status = 'pilot'`.
  - a generated `public_company_id`.
- App-owned `company_members` rows exist for every Ethical Scaling source team member with an email.
- Active app-owned member emails have no duplicates.
- Role mapping is correct:
  - `role_id = 1` or SaaS admin flag maps to `director`.
  - `role_id = 2` maps to `support`.
  - `role_id = 3` maps to `csm`.
  - `role_read_only_user = true` maps to `viewer`.
- At least one `app_audit_events` row exists with `event_type = 'pilot_backfill'`.

## Manual Supabase Checks

Run these in SQL editor if needed:

```sql
select id, public_company_id, legacy_glide_row_id, name, migration_status
from public.companies
where migration_status = 'pilot';
```

```sql
select role, status, count(*)
from public.company_members cm
join public.companies c on c.id = cm.company_id
where c.migration_status = 'pilot'
group by role, status
order by role, status;
```

```sql
select event_type, source, entity_table, created_at
from public.app_audit_events ae
join public.companies c on c.id = ae.company_id
where c.migration_status = 'pilot'
order by ae.created_at desc
limit 10;
```

## App QA After UI Read Fallback Is Built

When the Team tab is updated to prefer app-owned tables for pilot companies:

- Log in as SuperAdmin.
- View As Ethical Scaling.
- Open the SaaS Client detail Team tab.
- Confirm the team list loads from `company_members`.
- Confirm the Team tab shows the `RetainOS pilot data` badge.
- Confirm the same non-pilot company still loads from `backup_company_team`.
- Confirm a non-pilot company shows the `Glide mirror data` badge.
- Confirm Viewer/CSM/Support/Director nav still respects role rules.
- Confirm no browser flow can write directly into app-owned tables without the intended server path.

## Team Write Flow QA

Only run this against Ethical Scaling while it has `migration_status = 'pilot'`.

- Log in as SuperAdmin.
- Open `SaaS Clients > Ethical Scaling details > Team`.
- Confirm the Team tab shows `RetainOS pilot data`.
- Click `+ New Team Member`.
- Add a clearly temporary test member, for example `QA RetainOS` with an email you can recognize later.
- Confirm the new member appears in the correct role section.
- Edit the member and change role/capacity.
- Confirm the card moves/updates after save.
- Archive the temporary member.
- Confirm the member disappears from the active Team view.
- Toggle to `Archived`.
- Confirm the archived member is visible there.
- In Supabase, confirm the row still exists in `company_members` with `status = 'archived'`.
- In Supabase, confirm `app_audit_events` contains `company_member_created`, `company_member_updated`, and `company_member_archived`.
- Open a non-pilot company such as Bye Bye Panic.
- Confirm it shows `Glide mirror data`.
- Confirm `+ New Team Member` opens the locked read-only message and cannot submit.

Future QA item:

- Restore/unarchive archived team member once that flow is intentionally added.

## Company Admin Hub QA

- Log in as SuperAdmin and View As Ethical Scaling.
- Open `Admin Hub` from the header.
- Confirm the Team tab opens for Ethical Scaling without going through `SaaS Clients`.
- Confirm the Team tab still shows `RetainOS pilot data`.
- Log in as a Director for Ethical Scaling when available.
- Confirm `Admin Hub` appears in the header.
- Confirm CSM, Support, and Viewer do not see `Admin Hub`.

## Client Quick Update Pilot QA

Only run this against Ethical Scaling while it has `migration_status = 'pilot'`.

- Confirm the `clients` app-owned table has 154 Ethical Scaling rows:

```sql
select count(*)
from public.clients
where company_glide_row_id = 'chvcRSSPTJaaoK2zbhGplQ';
```

- Log in as SuperAdmin or a permitted Ethical Scaling user.
- Open `Clients`.
- Confirm the page copy says it is using `RetainOS pilot client data`.
- Pick an Ethical Scaling client.
- Click `Quick Update`.
- Confirm the modal says it is a `RetainOS pilot write`.
- Confirm `Success`, `Progress`, and `Buy In` are dropdowns, not free-text fields.
- Select temporary values for those dropdowns if you want to test outcome history.
- Add a clearly temporary note and/or next step.
- Click `Save Quick Update`.
- Confirm the modal shows the saved update in `RetainOS pilot history`.
- Confirm the saved dropdown values appear with readable labels in the modal history.
- In Supabase, confirm the same client row in `clients` has updated current-state fields:
  - `next_steps_value`
  - `csm_date_of_last_contact`
  - `csm_date_of_next_contact`
  - `outcomes_success_value`
  - `outcomes_progress_value`
  - `outcomes_buy_in_value`
- Reopen the same client Quick Update modal.
- Confirm the saved update still appears in history.
- Open the client detail page.
- Open the `History` tab.
- Confirm the saved Quick Update appears there.
- Confirm no `backup_company_clients` fields were manually changed by this pilot write.
- Open a non-pilot company/client.
- Confirm Quick Update remains read-only/locked.

## Client Profile Edit Pilot QA

Only run this against Ethical Scaling while it has `migration_status = 'pilot'`.

- Log in as SuperAdmin or a permitted Ethical Scaling user.
- Open an Ethical Scaling client detail page.
- Confirm the header badge says `RetainOS pilot data`.
- Confirm `Edit Profile` is visible for SuperAdmin, Director, Support, and assigned CSM.
- Confirm Viewer does not see `Edit Profile`.
- As a CSM, confirm assigned clients can be edited and unassigned clients cannot be opened/edited.
- Click `Edit Profile`.
- Change a clearly temporary value in one low-risk field, such as North Star or Business Name.
- Save.
- Confirm the profile page updates immediately.
- Open the `History` tab.
- Confirm a `Profile updated` event appears.
- In Supabase, confirm the row in `clients` changed and the matching `backup_company_clients` row did not change.
- Confirm `app_audit_events` has `client_profile_updated`.

Role-specific note:

- Director Notes are editable only by SuperAdmin and Director in v1, matching the current Director Notes visibility rule.

## Client Assignment And Reassignment QA

- Log in as SuperAdmin, Director, or Support.
- Open an Ethical Scaling client and click `Edit Profile`.
- Confirm `Primary CSM` is visible and lists active client managers only.
- Reassign a safe client to another active CSM and save.
- Confirm the new CSM name appears in the client header and Clients roster.
- Open `History` and confirm the profile update records the assignment change.
- Confirm the selected CSM now sees the client in their assigned-client scope.
- Confirm the previous CSM no longer sees it unless they remain the secondary assignee.
- Log in as a CSM and confirm `Primary CSM` is not editable.
- Confirm archived members and members marked as not managing clients do not appear.
- Confirm New Client uses the same app-owned active-assignee list.

## New Client Pilot QA

Only run this against Ethical Scaling while it has `migration_status = 'pilot'`.

- Log in as SuperAdmin, Director, Support, or CSM.
- Open `Clients` for Ethical Scaling.
- Confirm the page says `RetainOS pilot client data`.
- Confirm `+ New Client` is visible for SuperAdmin, Director, Support, and CSM.
- Click `+ New Client`.
- Add a clearly temporary test client with a recognizable name.
- For SuperAdmin/Director/Support, optionally assign a Primary CSM.
- For CSM, confirm the Primary CSM selector is locked to the logged-in CSM.
- Save.
- Confirm the new client appears in the current client list.
- Open the new client detail page.
- Confirm the header badge says `RetainOS pilot data`.
- Open `History` and confirm a `Client created` event appears.
- In Supabase, confirm the row exists in `clients`.
- In Supabase, confirm no row was created in `backup_company_clients`.
- In Supabase, confirm `app_audit_events` has `client_created`.

## Client Status Lifecycle Pilot QA

Only run this against Ethical Scaling while it has `migration_status = 'pilot'`.

- Log in as SuperAdmin, Director, Support, or assigned CSM.
- Create or choose a safe temporary app-owned client.
- Open the client detail page.
- Confirm the header badge says `RetainOS pilot data`.
- Click `Change Status`.
- Confirm status options use existing program statuses only:
  - Front End
  - Back End
  - Paused
  - Suspended
  - Offboarded
- Choose `Paused`.
- Confirm a typed reason is required.
- Confirm a return date is required.
- Save.
- Confirm the status pill changes to `Paused`.
- Open `History` and confirm a `Status changed to Paused` event appears.
- In Supabase, confirm the row in `clients` has:
  - `program_status_value = 'paused'`
  - `program_status_reason` populated
  - `program_paused_return_date` populated
  - `program_latest_pause_extension_days` populated
- If the client has app-owned current contract dates, confirm the app-owned current contract end date was extended by the pause window.
- If the client has an app-owned `client_contracts` row, confirm the latest app-owned contract was extended too.
- Use `Change Status` again and choose `Front End` or `Back End`.
- Confirm this acts as the reactivation step and the status pill changes accordingly.
- Choose `Suspended`.
- Confirm a typed reason is required.
- Save.
- Confirm the status pill changes to `Suspended`.
- Use `Change Status` again and choose `Offboarded`.
- Confirm a typed reason is required.
- Save.
- Confirm the status pill changes to `Offboarded`.
- Open `History` and confirm status lifecycle events are visible.
- In Supabase, confirm the row in `clients` has:
  - `program_status_value = 'off-boarded'`
  - `client_age_date_offboarded` populated
  - `client_age_date_offboarded_for_filtering` populated
  - `churn_reason_value` populated from the typed reason
- In Supabase, confirm the matching `backup_company_clients` row did not change.
- In Supabase, confirm `app_audit_events` has `client_status_changed`.
- As a CSM, confirm unassigned clients cannot be opened / cannot receive status changes.

## New Contract Pilot QA

Only run this against Ethical Scaling while it has `migration_status = 'pilot'`.

- Log in as SuperAdmin, Director, Support, or assigned CSM.
- Create or choose a safe app-owned client.
- Open the client detail page.
- Open the `Contract` tab.
- Confirm the header badge says `RetainOS pilot data`.
- Confirm `+ New Contract` is visible.
- Create a clearly temporary contract with:
  - Start Date
  - End / Renewal Date
  - Monthly Value
  - Optional link/notes
- Save.
- Confirm the new contract appears immediately on the Contract tab.
- Confirm the current contract summary updates on the same page.
- Open the `History` tab and confirm a `Contract created` event appears.
- In Supabase, confirm the contract row exists in `client_contracts`.
- In Supabase, confirm the app-owned `clients` row has updated current contract fields.
- In Supabase, confirm no row was created in `backup_company_clients_contracts`.
- In Supabase, confirm `app_audit_events` has `contract_created`.
- As a CSM, confirm unassigned clients cannot be opened / cannot receive new contracts.

## Pathways And Milestones Pilot QA

Only run this against Ethical Scaling while it has `migration_status = 'pilot'`.

- Log in as SuperAdmin, Director, or assigned CSM.
- Choose a safe app-owned client with a configured current offer/pathway.
- Open the client detail page.
- Open the `Pathways & Milestones` tab.
- Confirm the current offer/pathway displays by name.
- Confirm the current milestone displays by name, not a raw id.
- Confirm the milestone timeline only shows milestones for the client's active/current offer/pathway.
- If the current milestone is not started, click `Start Milestone`.
- Save with today's date or an override date.
- Confirm the current milestone shows a start date.
- Click `Complete Milestone`.
- Save with today's date or an override date.
- Confirm the completed milestone appears with completion date, duration, and/or time-to-hit when available.
- Confirm the client auto-advances to the next configured milestone in the same offer.
- Confirm the next milestone displays by name.
- Open the `History` tab and confirm milestone events appear.
- In Supabase, confirm rows exist in `client_milestones`.
- In Supabase, confirm no row was created or changed in `backup_company_clients_milestones`.
- In Supabase, confirm `app_audit_events` has milestone events.
- As a CSM, confirm only assigned clients can receive milestone progress writes.
- As Support, confirm milestone write actions are not available in v1.
- As Viewer, confirm milestone write actions are not available.

## New Task Pilot QA

Only run this against Ethical Scaling while it has `migration_status = 'pilot'`.

- Log in as SuperAdmin, Director, Support, or CSM.
- Open `Tasks`.
- Confirm the page says it includes RetainOS pilot tasks plus mirrored Glide tasks.
- Click `New Task`.
- Create a company-level task without selecting a client.
- Confirm it appears on the Tasks board/list.
- Create a second task and link it to a safe app-owned client.
- Confirm it appears on the Tasks board/list.
- Open the linked client detail page.
- Open the `Tasks` tab and confirm the linked task appears there.
- Open the linked client `History` tab and confirm a `Task created` event appears.
- In Supabase, confirm the task row exists in `client_tasks`.
- In Supabase, confirm no row was created in `backup_company_clients_tasks`.
- In Supabase, confirm `app_audit_events` has `task_created`.
- As a CSM, confirm the assignee is locked to the logged-in CSM and linked-client creation only works for assigned clients.

## Pilot Marker Cleanup

The `migration_status = 'pilot'` marker is temporary.

Before broader rollout:

- Move successfully migrated companies from `pilot` to `migrated`.
- Keep non-migrated companies at `mirror_only`.
- Remove any one-off UI or script assumptions that only target Ethical Scaling.
- Update QA scripts to accept a company identifier instead of hard-coding Ethical Scaling.
