# Notifications V1 Plan

## Goal

Build a safe notification system for pilot and migrated companies without recreating noisy Glide automations too early. V1 should make reminders visible inside RetainOS first, then add email delivery only after the trigger rules are QAed.

## Current Starting Point

- Clients page has a compact "Pilot reminders" strip for next contact, renewal, and paused return dates.
- Client calendar already shows onboarded, renewal, last contact, next contact, and client-linked task due dates.
- Client status changes, contracts, milestones, outcomes, tasks, and quick updates already write `client_history_events` for app-owned pilot/migrated companies.
- `company_settings` exists and already stores several company-level settings.
- Notification bell and global search are intentionally hidden in the HiFi app shell until functional.

## Proposed Source-Of-Truth Tables

### `notifications`

One row per actionable notification instance.

Recommended columns:

- `id uuid primary key`
- `company_id uuid not null references companies(id)`
- `recipient_member_id uuid null references company_members(id)`
- `recipient_role text null`
- `scope text not null` such as `member`, `role`, `company`
- `type text not null` such as `next_contact_due`, `renewal_due`, `paused_return_due`, `task_due`, `client_risk`, `assignment_changed`
- `severity text not null default 'info'` such as `info`, `warning`, `critical`
- `title text not null`
- `body text null`
- `entity_table text null`
- `entity_id text null`
- `client_id uuid null references clients(id)`
- `legacy_client_id text null`
- `due_at timestamptz null`
- `triggered_at timestamptz not null default now()`
- `read_at timestamptz null`
- `dismissed_at timestamptz null`
- `resolved_at timestamptz null`
- `dedupe_key text not null`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Important indexes:

- unique `(company_id, dedupe_key)` where `resolved_at is null`
- `(company_id, recipient_member_id, read_at, due_at)`
- `(company_id, type, due_at)`
- `(client_id, type)`

### `notification_preferences`

Company/member preference model. Keep it flexible enough for company defaults and per-user overrides.

Recommended columns:

- `id uuid primary key`
- `company_id uuid not null references companies(id)`
- `member_id uuid null references company_members(id)`
- `role text null`
- `notification_type text not null`
- `in_app_enabled boolean not null default true`
- `email_enabled boolean not null default false`
- `lead_days integer not null default 0`
- `repeat_interval_days integer null`
- `quiet_hours jsonb null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Lookup precedence:

1. Member-specific preference.
2. Role-specific company preference.
3. Company default preference.
4. Safe system default.

## V1 Trigger Candidates

### Pilot Build Triggers

Start with low-risk triggers that already have trusted app-owned fields:

- Next contact due or overdue from `clients.client_next_contact_date`.
- Contract renewal due or overdue from app-owned client current contract summary / `client_contracts`.
- Paused return date due or overdue from `clients.program_paused_return_date`.
- Task due or overdue from `client_tasks.task_due_date`.
- Assignment changed from `client_history_events` or profile update responses.

### Broader Rollout Triggers

Add after pilot QA:

- Suspended clients requiring attention.
- Clients missing upkeep fields by company freshness window.
- Milestone overdue based on target duration once company milestone target timing is canonical.
- Churn risk based on progress/buy-in/status rules.
- Revenue-generating activity and renewal opportunity alerts.
- Weekly/monthly digest summaries.

## Role And Company Scoping

- SuperAdmin: can view all company notifications when viewing as a company, but should not receive every client-level notification by default.
- Director: receives company-level operational notifications by default.
- Support: receives company-level operational notifications if enabled.
- CSM: receives notifications only for assigned active clients and tasks assigned to them.
- Viewer: read-only; no write actions from notifications.
- Mirror-only companies should not generate app-owned notifications until migrated or explicitly enabled.

## UX Strategy

### Stage 1: Visible In-App List, Bell Still Hidden

- Replace the Clients-page-only pilot strip with a reusable notification query/helper.
- Keep the existing reminder strip as the first surface.
- Add a lightweight "Notifications" section/page only if needed for QA.
- Keep the topbar bell hidden until unread counts and dismiss/read states are real.

### Stage 2: Bell And Inbox

- Show notification bell with unread count.
- Bell opens a dropdown with the newest unread items.
- Add full inbox page with filters: unread, all, type, client, due/overdue.
- Notification click routes to the relevant client/task/dashboard detail.

### Stage 3: Email Delivery

- Add email only after Stage 1/2 notification generation is stable.
- Prefer a queue table or delivery status columns before sending email.
- Delivery options:
  - Supabase Edge Function + SMTP.
  - N8N workflow reading pending notification deliveries.
  - Later: provider abstraction if SendGrid/Postmark/etc. becomes useful.

## Anti-Spam And Deduping Rules

- Every trigger must generate a deterministic `dedupe_key`.
- Do not create duplicate active notifications for the same company/type/client/due date/recipient.
- Resolve or supersede notifications when the source condition is no longer true.
- Use daily digest for broad Director/Support notices instead of one email per client.
- In-app can update existing notifications; email should send only on first trigger or configured repeat interval.
- Never email SuperAdmins for every company by default.
- Do not generate notifications from mirror-only backup rows unless a company is explicitly migrated.

Example dedupe keys:

- `next_contact_due:{client_id}:{recipient_member_id}:{yyyy-mm-dd}`
- `renewal_due:{client_id}:{contract_id}:{recipient_member_id}:{yyyy-mm-dd}`
- `paused_return_due:{client_id}:{recipient_member_id}:{yyyy-mm-dd}`
- `task_due:{task_id}:{recipient_member_id}:{yyyy-mm-dd}`

## Recommended Build Phases

### Phase 1: Notification Foundation

- Create `notifications` and `notification_preferences` tables.
- Add RLS/server-side access expectations.
- Add helper/RPC to list active notifications for the current effective company/user.
- Seed safe company defaults for pilot/migrated companies.
- No email delivery.

### Phase 2: Generate Pilot Notifications

- Generate in-app notifications for next contact, renewal, paused return, and task due dates.
- Use a deterministic upsert so rerunning generation is safe.
- Start with on-demand/manual generation from UI load or admin action.
- Later move to scheduled generation.

### Phase 3: Notification UX

- Replace/upgrade the Clients reminder strip to read from `notifications`.
- Add read/dismiss support.
- Add client/task route-through behavior.
- Only then expose the topbar bell.

### Phase 4: Email/N8N Delivery

- Add delivery status model: pending, sent, failed, suppressed.
- Add SMTP/N8N pipeline.
- Start with daily digest only for Directors/Support.
- Add per-user/per-role email preferences after digest QA.

### Phase 5: Advanced Triggers

- Churn risk.
- Profile upkeep.
- Milestone overdue.
- Weekly/monthly reporting digests.
- Renewal/RGA bundles.

## QA Checklist

### Data Generation

- Create next-contact notification for an assigned active client.
- Do not create duplicate next-contact notifications on repeated generation.
- Update the next contact date and confirm the old notification resolves/supersedes.
- Create renewal notification from app-owned contract end date.
- Create paused-return notification after moving a client to Paused.
- Create task due notification for a client-linked task.
- Confirm offboarded clients do not generate active operational reminders unless the trigger explicitly allows them.

### Permissions

- CSM sees only assigned-client notifications.
- Director sees company-level notifications.
- Support sees company-level notifications when enabled.
- SuperAdmin viewing as a company can inspect company notifications.
- Viewer cannot perform write actions from notifications.
- Mirror-only companies do not generate app-owned notification rows by default.

### UX

- Reminder strip displays the same or better information as the current pilot strip.
- Clicking a notification opens the correct client/task.
- Dismissed notifications disappear from active lists but remain auditable.
- Read/unread counts match visible rows once bell is enabled.

### Email Stage

- Email is disabled by default.
- Enabling email for one test member sends only that member's notifications.
- Repeat interval prevents repeated sends for the same issue.
- Failures are logged without blocking the app.

## Recommended First Build Slice

Build Phase 1 plus the smallest part of Phase 2:

1. Add `notifications` and `notification_preferences`.
2. Add a server-side generation path for next contact, renewal, paused return, and task due notifications for pilot/migrated companies.
3. Keep email disabled.
4. Keep bell hidden.
5. Point the existing Clients pilot reminder strip at the new `notifications` table.

This gives us a real source of truth while preserving the current lightweight UX.
