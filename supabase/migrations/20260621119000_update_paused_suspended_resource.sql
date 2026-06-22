-- Refresh the old CST paused/suspended walkthrough for the current RetainOS
-- controlled client lifecycle workflow.

insert into public.resources (
  slug,
  title,
  type,
  description,
  content,
  loom_embed_url,
  status,
  is_dynamic,
  dynamic_key,
  sort_order,
  scope,
  company_legacy_id
)
values (
  'marking-a-client-as-paused-or-suspended',
  'Marking a client as paused or suspended',
  'video',
  'RetainOS guide for using the controlled client status workflow to pause, suspend, reactivate, and review clients without losing lifecycle context.',
  $_$Resource category: Working with Clients

Audience: CSM, Admin, Director, Support

Operational purpose: Make paused and suspended clients visible as real lifecycle states, capture the reason for the change, preserve the event in client history, and give Admins / Directors visibility through Clients filters and Dashboard reporting.

RetainOS status: Live for app-owned pilot/migrated clients. Paused and Suspended are controlled client status changes from the full Client Detail screen.

What changed from the old CST workflow:
- CSMs should not mark pause or suspension only by writing a note in Next Steps.
- RetainOS treats Paused and Suspended as actual client statuses.
- RetainOS captures the reason for the status change.
- RetainOS writes the change to the client History tab.
- RetainOS can show paused and suspended clients in Clients filters and Dashboard charts.
- Paused clients also require a planned return date.

Paused vs Suspended:
- Paused means the client is temporarily on hold and is expected to return.
- Suspended means the client is not actively progressing because of a hold, payment issue, compliance issue, delivery issue, or other suspension reason.
- Use your company's internal rules for when to use Paused vs Suspended.
- If the client is fully ending the relationship, use Offboarded instead of Paused or Suspended.

How to pause a client:
- Open Clients.
- Click into the client profile.
- Use the lifecycle / status controls on Client Detail.
- Choose Paused.
- Enter the required pause reason.
- Enter the required return date.
- Save the status change.

What happens when a client is paused:
- The client status changes to Paused.
- The pause reason is saved on the client.
- The planned return date is saved.
- RetainOS records a lifecycle event in Client Detail > History.
- For app-owned contracts, RetainOS extends the active contract window by the approved pause duration when a contract is available.
- Paused-return reminders can appear through the notification / Daily Pulse system when the return date is due or overdue, depending on company notification settings.

How to suspend a client:
- Open Clients.
- Click into the client profile.
- Use the lifecycle / status controls on Client Detail.
- Choose Suspended.
- Enter the required suspension reason.
- Save the status change.

What happens when a client is suspended:
- The client status changes to Suspended.
- The suspension reason is saved on the client.
- RetainOS records a lifecycle event in Client Detail > History.
- Suspended clients are excluded from active-client operating counts where RetainOS treats only Front End and Back End as active.

How to reactivate a paused or suspended client:
- Open the client profile.
- Use the same lifecycle / status controls.
- Choose the correct active status, usually Front End or Back End.
- Add any supporting notes if the team needs reactivation context.
- Save the change.

Where to review paused and suspended clients:
- Clients > Status filter: select Paused or Suspended to review the roster.
- Dashboard > Charts > Program Distribution: review the company status mix, including Paused and Suspended.
- Dashboard filters and drilldowns can help Admins / Directors inspect the client list behind the status counts where available.
- Client Detail > History: review when the client was paused, suspended, or reactivated, who changed it, and the reason captured at the time.

What RetainOS does not currently copy from the old CST walkthrough:
- RetainOS does not rely on a generic old CST popup that simply says a client was paused or suspended in the last 30 days.
- Dedicated Director email alerts for "client paused / suspended" remain roadmap notification scope.
- Current RetainOS notification behavior is strongest for paused return dates, renewals, next contacts, and task due reminders.

Best practices:
- Use Paused only when there is an approved return window.
- Use Suspended when the client is on hold because of payment, compliance, or another blocking issue.
- Put the actual reason in the status reason, not only in Next Steps.
- Use Notes / Next Steps / Tasks for the operational plan around the status change.
- When pausing a client, confirm whether contract timing should extend before saving the return date.
- Review paused clients before their return date so the team can plan reactivation.
- Review suspended clients regularly so they do not disappear from active management.

Related resources:
- Offboarding a client in RetainOS.
- Understanding client history in RetainOS.
- Filtering clients in RetainOS.
- Tracking client contact cadence.
- Task Management in RetainOS.
- Admin and Director tools in RetainOS.

Re-recording notes:
- Record from Client Detail, not the old CST program dropdown.
- Show changing a client to Paused with reason and return date.
- Mention the contract extension behavior for app-owned contracts.
- Show changing a client to Suspended with reason.
- Show returning the client to Front End or Back End.
- Show Clients > Status filter for Paused / Suspended.
- Show Dashboard > Charts > Program Distribution.
- Show the resulting status event in Client Detail > History.
- Be explicit that Director email alerts for pause/suspension are future notification scope, while paused-return reminders are live notification scope.$_$,
  'https://www.loom.com/share/eefe83cb5ced451382f12433f3205bd6',
  'draft',
  false,
  null,
  490,
  'retainos_help',
  null
)
on conflict (slug) do update set
  title = excluded.title,
  type = excluded.type,
  description = excluded.description,
  content = excluded.content,
  loom_embed_url = excluded.loom_embed_url,
  status = excluded.status,
  is_dynamic = excluded.is_dynamic,
  dynamic_key = excluded.dynamic_key,
  sort_order = excluded.sort_order,
  scope = excluded.scope,
  company_legacy_id = excluded.company_legacy_id,
  updated_at = now();
