-- Refresh the old CST North Star walkthrough for the current RetainOS client
-- profile workflow and coaching operating model.

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
  'leveraging-north-star-for-proactive-coaching',
  'Leveraging North Star for proactive coaching',
  'video',
  'RetainOS guide for using a client North Star as the long-term outcome that anchors coaching, accountability, expectation resets, and renewal conversations.',
  $_$Resource category: Working with Clients

Audience: CSM, Admin, Director, Support

Operational purpose: Use the client's North Star as the larger promised outcome or expectation that anchors coaching conversations, prioritization, accountability, and expectation resets.

RetainOS status: Live for app-owned pilot/migrated clients. North Star can be set during client creation, imported through supported new-client automations, edited from the full client profile, and reviewed as profile context by the CSM.

What North Star means:
- North Star is the client's larger goal, expectation, or desired outcome.
- It is the thing the client joined the program hoping to achieve.
- It should be specific enough to guide coaching decisions, but durable enough that it does not change after every normal call.
- Examples: reach $10k/month, book 20 qualified sales calls, launch a new offer, reduce delivery overwhelm, or build a repeatable acquisition system.

How North Star differs from Next Steps:
- North Star is the destination.
- Next Steps are the current operational moves toward that destination.
- Tasks are owner-and-due-date work items.
- Notes are broader context.
- If a CSM is updating the field every call, they are probably writing Next Steps, not North Star.

Where North Star comes from:
- Sales or onboarding form data when included in the new-client automation payload.
- Manual client creation in RetainOS when the team already knows the goal.
- The first onboarding or kickoff conversation with the client.
- A later expectation-reset conversation when the original goal is no longer realistic or no longer relevant.

Where to see it:
- Open Clients.
- Click into the client profile.
- Review North Star in the client profile context.
- Quick Update also shows North Star as context so the CSM can keep the next interaction tied to the bigger outcome.

Where to edit it:
- Open the client profile.
- Click Edit Profile.
- Update North Star.
- Save the profile.

When to update it:
- During onboarding if the North Star was missing or too vague.
- When the client clarifies the real outcome they want.
- When the client's situation changes enough that the original target is no longer realistic.
- During a formal expectation reset, for example when workload, pace, capacity, or priorities have changed.
- Before renewal or expansion conversations if the next program phase needs a clearer outcome.

When not to update it:
- Do not use North Star as a normal call note.
- Do not replace it with this week's tactical action items.
- Do not rewrite it every time Next Steps change.
- Do not soften it quietly when the client is behind; use the change as a coaching conversation and preserve context in Notes / History.

How to use it in proactive coaching:
- Bring the client back to the outcome they said mattered.
- Connect the current milestone, Next Steps, and tasks to that outcome.
- Use it when the client is frustrated, moving slowly, or avoiding the work required to reach the goal.
- Use it to make tradeoffs explicit: either adjust the workload and behavior to match the North Star, or reset the North Star to something realistic for the current pace.
- Use it during renewal conversations to compare the original goal, current progress, and the next best outcome.

History and accountability:
- RetainOS saves North Star edits as profile update events in the client History tab.
- Use History to understand when the goal changed, who changed it, and what other context was saved around the same time.
- The old CST walkthrough showed inline field history. In RetainOS, use the dedicated History tab for previous profile updates.

Automation behavior:
- New-client automation can include North Star when the onboarding or sales system collects it.
- If the payload does not include it, the CSM should capture it manually during onboarding.
- North Star is profile context; automated call summaries and Quick Updates should normally update Next Steps and notes rather than overwrite North Star.

Best practices:
- Write the North Star in the client's language when possible.
- Include a measurable target or clear outcome when one exists.
- Include a timeframe only when it is truly part of the expectation.
- Keep it concise enough that another CSM can understand the client goal at a glance.
- If the North Star needs a major change, add notes so the reason for the reset is clear later.

Related resources:
- Using Next Steps well.
- Making a quick update in RetainOS.
- Understanding client history in RetainOS.
- How to manage clients in RetainOS.
- Adding clients manually.

Re-recording notes:
- Record from Client Detail, not the old CST inline pencil/history pattern.
- Show North Star in the client profile.
- Show Quick Update displaying North Star as context.
- Show Edit Profile > North Star.
- Mention that previous North Star changes are reviewed in the History tab.
- Use one coaching example: client wanted $10k/month, current workload does not match the target, so the CSM either resets behavior expectations or resets the North Star.$_$,
  'https://www.loom.com/share/9c1aaacbdefb443dae8c753febffc7b8',
  'draft',
  false,
  null,
  400,
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
