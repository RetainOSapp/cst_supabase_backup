-- Rewrite the old CST custom-reminders resource around the current RetainOS
-- equivalent: client-linked tasks with due dates, due-state visibility,
-- Clients reminder bell, Daily Pulse, and Client Detail > Tasks.

update public.resources
set
  title = 'Creating client reminders with tasks',
  type = 'video',
  description = 'RetainOS guide for creating client-linked reminder tasks, tracking due dates, and using the reminder bell and Daily Pulse to stay on top of client follow-up.',
  content = $_$Resource category: Working with Clients

Audience: CSM, Admin, Director, Support

Operational purpose: Keep important client follow-up dates visible without creating a separate reminder system. In RetainOS, custom client reminders are handled as client-linked tasks with due dates.

RetainOS status: Use Tasks and Client Detail > Tasks for reminder-style work. A separate CST-style Reminders panel inside Quick Update is not live.

Where to create a reminder:
- Go to Tasks.
- Click New Task.
- Add a task name such as Send birthday gift, Prepare renewal call, Follow up on referral, or Review launch event.
- Select the related client.
- Assign the task to the responsible team member.
- Set the due date.
- Choose priority and starting status.
- Save the task.

Client profile view:
- Open the client profile.
- Go to Tasks.
- Client-linked tasks appear in the client profile.
- Open tasks stay visible first.
- Closed tasks are collapsible so the profile stays clean.

How reminders surface:
- Tasks with due dates show due/overdue urgency on the Tasks page.
- Client-linked task due reminders can appear in the Clients reminder bell when task_due reminders are enabled.
- Daily Pulse can show Tasks Due Today, This Week, or This Month when the company has task_due visibility enabled.
- Clicking a reminder or Daily Pulse item can take the user back to the relevant client/task context.

How to complete or dismiss:
- Open the task from Tasks or the client profile.
- Move it to Done when the reminder action is complete.
- Use Dismissed/Archived when the reminder is no longer needed.
- Recurring tasks can create the next occurrence after completion when configured.

Why RetainOS uses tasks instead of a separate reminder widget:
- Tasks already support ownership, due dates, status, priority, company-level visibility, client linking, recurring behavior, and Daily Pulse.
- A separate reminder object would duplicate task behavior and make client follow-up harder to manage at scale.
- The old CST reminder panel was useful, but RetainOS has a cleaner operating model when reminders are treated as tasks.

What is not live today:
- Creating a reminder directly from Quick Update.
- A dedicated Reminders panel separate from Tasks.
- Email/push delivery for reminder due dates.
- A full notification inbox with read/dismiss state.

Future optional scope:
- A Quick Update shortcut that creates a client-linked task without leaving the Quick Update modal.
- Richer notification delivery for task_due reminders.
- Notification inbox/read state for reminder-style work.

Re-recording notes:
- Do not record this as a CST-style Reminders panel.
- Record from the RetainOS Tasks page and Client Detail > Tasks.
- Create a client-linked task that behaves like a reminder.
- Show the due date, priority, assignee, and client link.
- Show where it appears on the client profile.
- Mention Daily Pulse and the Clients reminder bell for due task visibility.
- Mention that Quick Update reminder creation is not live and can be future scope.$_$,
  loom_embed_url = 'https://www.loom.com/share/746eaf9a00bd4457a07c927c0bb45c35',
  status = 'draft',
  is_dynamic = false,
  dynamic_key = null,
  scope = 'retainos_help',
  company_legacy_id = null,
  updated_at = now()
where slug = 'creating-custom-client-reminders';
