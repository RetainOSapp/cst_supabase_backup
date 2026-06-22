-- Refresh the RetainOS Help draft for Task Management after auditing the old
-- CST task-management launch walkthrough against the current RetainOS task flow.

update public.resources
set
  title = 'Task management in RetainOS',
  type = 'video',
  description = 'RetainOS guide for creating, assigning, organizing, updating, and automating company-level and client-linked tasks.',
  content = $_$Resource category: Working with Clients

Audience: CSM, Admin, Director, Support

Operational purpose: Use RetainOS Tasks as the team's operating work queue for client follow-up, internal admin work, recurring accountability, and company-wide visibility.

RetainOS status: RetainOS task management is substantially richer than the old CST version for app-owned pilot/migrated companies.

Where tasks live:
- Tasks page: the company-wide task hub.
- Client Detail > Tasks: the client-specific task view.
- Daily Pulse: surfaces due task reminders when task_due notifications are enabled.
- Admin Hub / Company Settings: manages task templates.
- New client creation and Zapier-created clients can automatically create enabled client-created template tasks.

Tasks page:
- Board view groups tasks by status lanes: To Do, In Progress, Waiting, Done, and Dismissed.
- List view mirrors the same status groupings in table form.
- Drag and drop works in both Board and List views for app-owned task data.
- The page shows visible task count, overdue count, and due-soon count.
- Use View As to review a specific team member's assigned work when permitted.
- Use Status to switch between Open tasks, All tasks, and Closed tasks.
- Use Search to find tasks by task name or description.
- Mirror-only companies stay read-only until migrated into app-owned RetainOS task data.

Creating or editing a task:
- Click New Task from the Tasks page.
- Choose an optional task template when one exists.
- Add Task Name and optional Description.
- Choose Client for client-linked work or leave it blank for a company-level task.
- Assign the task to a team member or leave it unassigned when appropriate.
- Set Due Date, Priority, Status, and optional External Link.
- Mark the task as recurring when it should recreate the next task after completion.
- Save the task.

Task detail behavior:
- Clicking a task opens the task details modal.
- Authorized users can update task name, description, linked client, assignee, due date, priority, status, external link, and recurring settings.
- Moving a task to Done completes it.
- Dismissed/Archived tasks are treated as closed.
- Completing a recurring task creates the next occurrence using the configured interval.
- Task updates write RetainOS task/history context where available.

Client-linked tasks:
- Client-linked tasks appear in Client Detail > Tasks.
- Open tasks are shown first.
- Closed tasks are collapsible so the client profile stays readable.
- Task cards show status, priority, due date, assignee, creator, timestamps, recurring state, and external links when present.
- Assigning a primary CSM to a client can claim open unassigned tasks linked to that client.

Task templates:
- Admin Hub / Company Settings can manage company task templates.
- Manual templates appear in the New Task modal as presets.
- Client-created templates can automatically create starter tasks when a client is created manually or through the new-client webhook.
- Templates can define name, description, due offset, priority, starting status, assignment behavior, and optional offer/pathway applicability.

Due and urgency signals:
- Tasks show Overdue, Due today, and Due in 1-3 days badges.
- The Tasks page summary counts overdue and due-soon work.
- Daily Pulse can surface due task reminders when enabled for the company.
- Email/push/realtime notification delivery remains future scope; current RetainOS visibility is in-app.

How RetainOS improves on the old CST task flow:
- The old CST focused on a basic Kanban task board and client profile task list.
- RetainOS adds app-owned create/edit/update/status flows, Board and List drag/drop, task templates, auto-created onboarding tasks, recurring tasks, due urgency, Daily Pulse visibility, and safer read-only fallback for mirror-only companies.
- RetainOS separates company-level tasks from client-linked tasks so teams can track both admin work and client-specific follow-up.

Known later scope:
- Comments.
- Attachments.
- More advanced recurring rules.
- Realtime collaboration.
- Richer notification delivery beyond current in-app/Daily Pulse visibility.

Re-recording notes:
- Re-record this as a RetainOS task operating guide, not a simple feature-launch video.
- Show Board view, List view, filters, task creation, template preset, client-linked task, company-level task, drag/drop status update, recurring task behavior, and Client Detail > Tasks.
- Mention that task templates live in Company Settings and auto-created tasks can be triggered by new client creation.$_$,
  loom_embed_url = 'https://www.loom.com/share/19efc6ae66474936a486cbc0c86604a3',
  status = 'draft',
  is_dynamic = false,
  dynamic_key = null,
  scope = 'retainos_help',
  company_legacy_id = null,
  updated_at = now()
where slug = 'task-management-in-retainos';
