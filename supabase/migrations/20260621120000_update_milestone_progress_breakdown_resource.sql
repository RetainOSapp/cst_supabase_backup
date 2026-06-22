-- Refresh the old CST milestone progress dashboard resource for the current
-- RetainOS Dashboard > Charts behavior.

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
  'milestone-progress-breakdown-by-offer',
  'Milestone progress breakdown by offer',
  'video',
  'RetainOS guide for using Dashboard charts to move from offer distribution into milestone-level bottleneck analysis for a selected offer.',
  $_$Resource category: Using the Dashboard

Audience: Admin, Director, CSM, Support

Operational purpose: Use Dashboard > Charts to understand how clients are distributed across offers/pathways, then zoom into one selected offer to identify where clients are sitting by current milestone.

RetainOS status: Live for app-owned pilot/migrated clients and supported mirrored data. The Dashboard Charts view shows offer distribution by default, then switches the journey chart to milestone breakdown after an Offer filter is applied.

What the chart answers:
- With no Offer filter: which offers/pathways have the most current clients?
- With one Offer filter applied: which milestones inside that selected offer/pathway have the most current clients?
- For Admins and Directors: where are clients clustering, getting stuck, or moving too slowly?
- For CSMs: which part of the journey needs more proactive support this week?

How to view offer distribution:
- Open Dashboard.
- Select the company.
- Leave Offer set to All offers.
- Apply filters.
- Open Charts.
- Review Clients By Offer.

How to view milestone breakdown for one offer:
- Open Dashboard.
- Select the company.
- Choose a specific Offer.
- Apply filters.
- Open Charts.
- The journey chart changes from Clients By Offer to Clients By Milestone.
- Each bar represents the current milestone for clients inside that selected offer.
- Click a bar, where drilldowns are available, to review the clients behind that milestone count.

How to combine filters:
- Use CSM to inspect one manager's client book.
- Use Secondary Assignee when that feature is enabled.
- Use Program to compare only active, paused, suspended, or offboarded clients where relevant.
- Use Date Range and Client Start Date to focus on a cohort or reporting period.
- Use Offer first when you want the milestone breakdown; without an Offer selected the chart intentionally stays at offer/pathway level.

How to interpret the breakdown:
- A high count at the first milestone can mean onboarding friction, slow starts, or a large new cohort.
- A high count in the middle of the journey can reveal delivery bottlenecks, unclear implementation steps, or a milestone that needs better support material.
- A low count near final milestones may indicate clients are not progressing far enough before renewal/offboarding.
- Compare milestone breakdown with Progress, Buy-In, contact cadence, and tasks before deciding what action to take.

Important RetainOS behavior:
- RetainOS uses pathway/milestone language in many places, while older CST resources may say offer/milestone.
- The chart uses each client's current primary offer/pathway and current primary milestone.
- Secondary Pathway is a separate tracker and is not the default source for this dashboard breakdown.
- Clients without a current milestone can appear as Unassigned / Not set depending on the data available.

Best practices:
- Review this chart during weekly department reviews.
- Filter by one offer when trying to diagnose delivery bottlenecks.
- Filter by CSM when comparing coaching book movement.
- Use the client drilldown to turn a chart insight into action: outreach, tasks, milestone cleanup, or a delivery improvement.
- If the milestone names or order look wrong, check Admin Hub > Pathways & Milestones.

Related resources:
- Admin and Director tools in RetainOS.
- How to customize milestones and offers.
- Filtering clients in RetainOS.
- Using Progress and Buy-In for effective coaching.
- How to manage clients in RetainOS.

Re-recording notes:
- Record from Dashboard > Charts.
- Show the chart as Clients By Offer with All offers selected.
- Apply one Offer filter.
- Show the same chart change to Clients By Milestone.
- Click a milestone bar if drilldowns are available.
- Explain that this is for bottleneck analysis, not milestone configuration.
- Point Admins to Admin Hub > Pathways & Milestones if the journey structure itself needs to be edited.$_$,
  'https://www.loom.com/share/b77254f612204657bbb51ab9c9f1ada3',
  'draft',
  false,
  null,
  360,
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
