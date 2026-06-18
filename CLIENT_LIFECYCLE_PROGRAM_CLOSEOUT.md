# Client Lifecycle And Program Closeout

Date: 2026-06-17

Purpose: close the client status/program lifecycle loop for V1 and separate what is already wired from what still needs migration-day validation.

## Closed V1 Scope

RetainOS supports app-owned client status changes for pilot and migrated companies through `manage-client-status`.

Supported statuses:

- `front-end`
- `back-end`
- `paused`
- `suspended`
- `off-boarded`

Who can write:

- SuperAdmin: any migrated/pilot company client.
- Director: company clients.
- Support: company clients.
- CSM: assigned or secondary-assigned clients only.
- Viewer: no write access.

The flow writes only app-owned tables. It does not mutate Glide backup/mirror tables.

## Wired Behavior

### Status Modal

`src/pages/ClientDetail.tsx` opens a status modal with the existing program status choices and invokes `manage-client-status`.

The modal requires:

- A different target status.
- A typed reason for `paused`, `suspended`, or `off-boarded`.
- A return date for `paused`.

### Server Guardrails

`supabase/functions/manage-client-status/index.ts` validates:

- Authenticated actor.
- Company migration status is `pilot` or `migrated`.
- Allowed writer role.
- CSM assignment when the actor is a CSM.
- Target status is one of the allowed existing program statuses.
- Reason and return-date rules.

### Side Effects

Paused:

- Sets `program_status_value = 'paused'`.
- Saves `program_status_reason`.
- Saves `program_paused_return_date`.
- Saves latest paused date and pause-extension days.
- Extends the current app-owned contract summary date when possible.
- Extends the latest app-owned `client_contracts` row when possible.

Suspended:

- Sets `program_status_value = 'suspended'`.
- Saves `program_status_reason`.
- Saves latest suspended date.

Offboarded:

- Sets `program_status_value = 'off-boarded'`.
- Saves `program_status_reason`.
- Saves offboarded date fields.
- Saves churn reason/comment context.

Reactivated to Front End or Back End:

- Sets the requested active program status.
- Clears offboarded date fields.
- Sets latest Back End start date when moved to Back End.

Every status change writes:

- A `client_history_events` row with `event_type = 'client_status_changed'`.
- An `app_audit_events` row.
- Before/after payload context.

## Downstream Wiring

### Dashboard And CSM Reports

Formula readiness is documented in `DASHBOARD_FORMULA_VALIDATION.md`.

Current expected behavior:

- Active-client counts use Front End + Back End where active-client denominators are required.
- Paused and suspended clients are excluded from renewal/active-denominator formulas.
- Offboarded/churn reporting uses app-owned offboarded dates where available.
- Dashboard and CSM Reports require final confidence testing on a larger migrated company.

### Notifications And Reminders

Notifications V1 includes:

- `next_contact_due`
- `renewal_due`
- `paused_return_due`
- `task_due`

`generate_company_notifications` creates paused-return notifications for paused clients with a return date inside the notification window.

Clients page fallback reminders also include paused returns when notification rows are not yet present.

Daily Pulse surfaces paused returns for Today, This Week, and This Month when the notification type is enabled.

### Webhooks And Quick Update

External webhooks deliberately reject lifecycle status/program updates in V1. Lifecycle side effects stay inside `manage-client-status`.

Quick Update is not the lifecycle write path.

## Not Part Of This Closeout

These are separate roadmap items:

- Client archive/delete flow.
- SaaS Client archive/offboard flow.
- Task status changes updating notifications/reporting.
- Automated churn-risk or renewal flagging workflows.
- Full dashboard/CSM formula validation on Moves Method after final sync/backfill.
- Final paused-return notification QA after notification generation runs on migrated company data.

## Legacy Note

`manage-client-offboard` exists as an older function, but the current Client Detail UI uses `manage-client-status` for Offboarded. Do not QA the older function as the V1 customer-facing lifecycle path unless it is intentionally revived.

## Migration-Day Validation

Run these checks for Moves Method after final paid sync/backfill:

- Change one test client to Paused with a future return date.
- Confirm the client shows as paused on Client Detail and Clients list.
- Confirm current contract summary date extends by the pause window when contract data is present.
- Run/generate notifications and confirm a `paused_return_due` row appears inside the configured window.
- Confirm Daily Pulse shows the paused return in the correct window.
- Reactivate the same client to Front End or Back End.
- Confirm active-client counts include the client again.
- Change one test client to Suspended.
- Confirm active-client and renewal denominators exclude that client.
- Change one test client to Offboarded.
- Confirm offboard date and churn context save.
- Confirm history/audit includes `client_status_changed`.
- Confirm Dashboard offboard/churn counts match `DASHBOARD_FORMULA_VALIDATION.md` expectations.
- Confirm CSM Reports active-client denominator excludes paused, suspended, and offboarded clients.
