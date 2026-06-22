-- Refresh the old CST Time to Value resource for the current RetainOS
-- milestone configuration, Dashboard metric, and Client Detail visibility.

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
  'tracking-time-to-value',
  'Tracking TTV (Time to Value)',
  'video',
  'RetainOS guide for configuring a Time to Value milestone and using Dashboard/client-profile visibility to understand how quickly clients reach a meaningful value moment.',
  $_$Resource category: Using the Dashboard

Audience: Admin, Director, CSM, Support

Operational purpose: Identify the key milestone where a client first experiences meaningful value, then use RetainOS to track how long clients take to reach that value moment.

RetainOS status: Live for app-owned pilot/migrated clients. TTV configuration is stored on pathway milestones, the Dashboard shows Avg. Time to Value, and Client Detail labels the configured TTV milestone in the milestone timeline.

What TTV means:
- TTV stands for Time to Value.
- It is not necessarily the final success point or end of the program.
- It is the milestone where the client experiences a major value moment, win, activation point, or proof that the program is working.
- In older CST language, this may have been called the Value Activation Point.

Where to configure it:
- Open Admin Hub.
- Go to Pathways & Milestones.
- Open the relevant pathway/offer.
- Create or edit the milestone that represents the value activation point.
- Enable Time to Value on that milestone.
- Save the milestone.

How RetainOS calculates Avg. Time to Value:
- RetainOS finds milestones marked as Time to Value.
- RetainOS looks for clients who completed one of those TTV milestones.
- For each client, RetainOS calculates days from the client onboarding/start date to the TTV milestone completion date.
- The Dashboard shows the average across clients who reached that TTV point.
- The card also shows how many clients reached TTV and how many TTV points are configured in the current filter context.

Where to see it:
- Dashboard > Overview > Journey > Avg. Time to Value.
- Client Detail > Pathways & Milestones > Milestone Timeline, where the configured milestone is labeled Time to Value.
- Admin Hub > Pathways & Milestones, where Admins can see and edit the TTV configuration.

How filters affect it:
- Company filter scopes the metric to that company.
- CSM and Secondary Assignee filters narrow the clients included.
- Program/status filters narrow the clients included.
- Offer filter narrows both the clients and the TTV milestones to that selected offer/pathway.
- Client Start Date filters clients by onboarding/start date.
- Date Range filters TTV completions by completion date.

How to interpret it:
- Lower TTV usually means clients are reaching meaningful value faster.
- Higher TTV may reveal onboarding friction, unclear implementation steps, weak milestone design, or CSM enablement opportunities.
- A low Reached count means the average may not be representative yet.
- If TTV Points is 0, no milestone is currently marked as Time to Value for the selected filter context.
- If the number looks strange after migration, confirm the correct milestone is marked as TTV and that client milestone completion dates migrated correctly.

Best practices:
- Choose one clear TTV milestone per offer/pathway when possible.
- Pick a milestone that reflects felt value, not just internal progress.
- Do not mark every milestone as TTV; the metric is most useful when the value point is intentional.
- Review TTV alongside Progress, Buy-In, milestone breakdown, advocacy, and renewals.
- Use TTV wins as moments to ask for reviews, testimonials, referrals, or renewal/upsell conversations when appropriate.

Related resources:
- Milestone progress breakdown by offer.
- How to customize milestones and offers.
- Using Progress and Buy-In for effective coaching.
- Tracking reviews, testimonials, referrals, and renewal opportunities.
- Admin and Director tools in RetainOS.

Re-recording notes:
- Record from Admin Hub > Pathways & Milestones.
- Show editing a milestone and enabling Time to Value.
- Show Dashboard > Overview > Journey > Avg. Time to Value.
- Show Client Detail > Pathways & Milestones and the Time to Value badge in the milestone timeline.
- Explain that TTV is an activation/value point, not necessarily final success.
- Mention that Date Range filters completion dates and Client Start Date filters client cohorts.$_$,
  'https://www.loom.com/share/7e17541a256f454a9a30133b4f7b529b',
  'draft',
  false,
  null,
  350,
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
