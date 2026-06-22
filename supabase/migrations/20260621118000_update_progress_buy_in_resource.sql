-- Refresh the old CST Progress / Buy-In coaching walkthrough for the
-- current RetainOS Outcomes, filters, dashboard, and history workflow.

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
  'using-progress-and-buy-in-for-more-effective-coaching',
  'Using Progress and Buy-In for effective coaching',
  'video',
  'RetainOS guide for interpreting Progress and Buy-In together so CSMs can identify coaching priorities, risk, and support needs before clients fall behind.',
  $_$Resource category: Working with Clients

Audience: CSM, Admin, Director, Support

Operational purpose: Use Progress and Buy-In as two separate client health signals so the team can coach proactively, spot risk earlier, and understand whether a client needs tactical help, relationship repair, accountability, or escalation.

RetainOS status: Live for app-owned pilot/migrated clients. Progress, Buy-In, and Success can be updated from Quick Update and Client Detail > Outcomes, filtered from the Clients page, reviewed in Dashboard charts, and tracked through client history.

What Progress means:
- Progress is the pace at which the client is moving through the program, pathway, milestones, or expected result journey.
- It is the more objective signal: is the client moving at the pace required to reach the outcome inside the contracted timeframe?
- A client can be engaged and like the team, but still be behind on Progress.
- Progress should be calibrated against the offer journey, expected milestone timing, implementation pace, or success plan.

What Buy-In means:
- Buy-In is the quality of the client's engagement, trust, responsiveness, ownership, and willingness to do the work.
- It is the more qualitative signal: how is the client showing up?
- A client can be making progress while becoming less bought in, or be highly bought in while still needing more tactical support.
- Buy-In should be based on observed behavior: attendance, responsiveness, implementation, attitude on calls, and whether the client follows through on commitments.

How this differs from Success:
- Success answers whether the client is achieving, or on track to achieve, the promised outcome.
- Progress helps explain whether the client is moving through the journey at the right pace.
- Buy-In helps explain whether the client relationship and engagement are healthy enough to support the work.
- Together, the three fields give a clearer picture than any one field alone.

Traffic-light calibration:
- Green Progress: client is moving at or ahead of the expected pace.
- Yellow Progress: client is a little behind, blocked, or at risk of slipping if no action is taken.
- Red Progress: client is meaningfully behind the required pace or stuck.
- Green Buy-In: client trusts the process, responds well, attends, implements, and owns the work.
- Yellow Buy-In: client is inconsistent, hesitant, delayed, or showing early signs of frustration.
- Red Buy-In: client is disengaged, unresponsive, resistant, repeatedly late/missing, or no longer behaving like they trust the plan.

Team calibration:
- Admins and Directors should define what Green, Yellow, and Red mean for each offer or delivery motion.
- The goal is consistency across CSMs, not perfection.
- Use team meetings, client reviews, and CSM Reports to compare how people are scoring clients and tighten definitions over time.
- If the team has custom outcome definitions configured, use those definitions as the source of truth.

Where to update Progress and Buy-In:
- Open Clients.
- Use Quick Update when updating the client after a meaningful interaction.
- In Quick Update, update Success, Progress, and Buy-In in the Health / Outcomes area.
- Add context in notes, Next Steps, or tasks when the score change needs explanation or follow-through.
- From the full client profile, use Client Detail > Outcomes when reviewing or editing the client more deeply.

Where to review and filter:
- Clients > Filters > Health & Outcomes lets the team find clients by Success, Progress, and Buy-In.
- Dashboard > Charts shows Progress and Buy-In distributions for a broader company view.
- Dashboard filters and chart drilldowns can help Admins and Directors review patterns by CSM, offer/pathway, or date range where available.
- Client Detail > History shows outcome updates and related context so another team member can understand what changed.

Coaching matrix:
- Green Progress + Green Buy-In: protect momentum. These clients are strong candidates for advocacy asks, renewal conversations, upsell timing, or deeper wins.
- Yellow/Red Progress + Green Buy-In: the relationship is healthy, but the client needs tactical support. Look for blockers, unclear next steps, overloaded workload, missing resources, or offer-fit friction.
- Green Progress + Yellow/Red Buy-In: the work may be happening, but the relationship signal is weak. Prioritize expectation resets, trust, communication, and surfacing hidden frustration.
- Yellow/Red Progress + Yellow/Red Buy-In: treat this as an intervention zone. Create a clear plan, escalate if needed, and use tasks/Next Steps to make ownership visible.
- Success = No with Green Buy-In can mean the client still believes and needs a sharper plan.
- Success = No with Red Buy-In can mean the team should prepare for churn risk, refund risk, or a formal escalation.

How CSMs should use the signals:
- Update them after meaningful interactions, not as random admin maintenance.
- Use Yellow as the early warning state. Do not wait for Red before coaching differently.
- Pair score changes with a note, Next Step, or task when action is required.
- Review clients with Yellow/Red Progress before calls so coaching is more direct and practical.
- Review clients with Yellow/Red Buy-In before calls so the CSM can rebuild trust, clarify expectations, or escalate the relationship issue.
- Use both fields when deciding who needs proactive outreach this week.

How Admins and Directors should use the signals:
- Review Dashboard > Charts to see whether the department has more Progress risk or Buy-In risk.
- Use Clients filters to build review lists, for example Red Progress, Yellow Buy-In, or Green Progress plus Green Buy-In.
- Compare patterns by CSM and offer/pathway where dashboard filters are available.
- Use the signals in coaching reviews with CSMs, but anchor the conversation in specific client notes, Next Steps, tasks, and history.
- If a CSM consistently overuses Green or Red, recalibrate the definitions rather than treating the score as objective truth.

Best practices:
- Progress should usually be tied to milestones, client journey pace, implementation, and measurable movement.
- Buy-In should be tied to behavior and relationship signals, not whether the CSM personally likes the client.
- Use notes for why the score changed.
- Use tasks for the follow-up created by the score change.
- Use Next Steps for what the client is now working on.
- Use North Star when the score conversation needs to reconnect the client to the larger goal.
- Keep the system simple enough that CSMs actually maintain it.

Related resources:
- Making a quick update in RetainOS.
- How to manage clients in RetainOS.
- Filtering clients in RetainOS.
- Leveraging North Star for proactive coaching.
- Using Next Steps well.
- Understanding client history in RetainOS.
- Tracking reviews, testimonials, referrals, and renewal opportunities.

Re-recording notes:
- Record from RetainOS, not the old CST quick update modal.
- Show Quick Update and update Success, Progress, and Buy-In.
- Show Client Detail > Outcomes for the deeper profile workflow.
- Show Clients > Filters > Health & Outcomes.
- Show Dashboard > Charts for Progress and Buy-In distribution.
- Explain the coaching matrix with at least two examples: Green Buy-In / Red Progress and Red Buy-In / Green Progress.
- Mention that history provides accountability for outcome updates and related notes.$_$,
  'https://www.loom.com/share/f5c328479c2c43189e3a2d8ccda90db9',
  'draft',
  false,
  null,
  410,
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
