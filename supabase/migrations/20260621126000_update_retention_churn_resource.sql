-- Refresh the old CST retention/churn walkthrough for the current RetainOS
-- Dashboard, contract renewal, and offboarding behavior.

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
  'retention-churn-metrics',
  'Understanding retention and churn in RetainOS',
  'video',
  'RetainOS guide for how renewal, retention, and churn metrics are calculated and validated across the Dashboard, Clients roster, contracts, and offboarding flow.',
  $_$Resource category: Using the Dashboard

Audience: Admin, Director, CSM, Support

Operational purpose: Help teams understand exactly what RetainOS means by renewal, retained, up for renewal, offboarded, churned, Retention %, and Churn %, so Dashboard reporting and client lifecycle updates stay accurate during day-to-day operations and migration QA.

RetainOS status: Live for app-owned pilot/migrated clients, with migration-day formula validation still required before treating a newly migrated company as fully signed off. RetainOS is already stronger than the old CST flow because renewals are recorded through contract events, churn is decided through the controlled offboarding flow, and Dashboard KPI cards can be clicked to inspect the clients behind the numbers.

Core definitions:
- Renewal date: the current contract end date / renewal date on the client profile.
- Up for renewal: clients whose current contract end date, calculated contract end date, or relevant contract history end date falls inside the selected Dashboard Date Range.
- Active clients up for renewal: clients up for renewal who are still active in Front End or Back End and have not already been retained in that same reporting context.
- Retained client: a client with a recorded renewal or upsell / continuation event. In app-owned RetainOS data, this is stored as a client_retention_recorded history event when a new contract is created as a renewal or upsell.
- Retention %: retained clients divided by clients up for renewal in the same filter context.
- Offboarded client: a client whose lifecycle status has been changed to Off-boarded and whose actual offboarding date falls inside the selected reporting context.
- Churned client: an offboarded client whose actual offboarding date is before the client contract end date.
- Churn %: churned clients divided by total clients in the same filter context, currently front-end + back-end + offboarded.

How retention is recorded:
- Open the client profile.
- Go to the contract area.
- Create the new contract or renewal record.
- Choose whether the new contract represents a renewal or an upsell / continuation.
- Save the contract.
- RetainOS updates the current contract dates and writes a retention history event.
- Dashboard > Overview > Contracts & Retention can then count the client as retained for the selected reporting period.

How churn is recorded:
- Open the client profile.
- Change the lifecycle status to Off-boarded.
- Enter the client's actual end date.
- RetainOS compares the actual end date against the current contract end date.
- If the actual end date is before the contract end date, RetainOS treats the client as churned and requires churn reason / notes.
- If the actual end date is on or after the contract end date, RetainOS treats the offboarding as completed rather than churned.
- The offboarding decision and notes are stored in the client profile metadata and client history.

Where to review the numbers:
- Dashboard > Overview > Contracts & Retention.
- Retained Clients shows clients retained through renewal / upsell events.
- Retention Percentage shows retained clients divided by clients up for renewal.
- Up For Renewal shows active clients whose renewal date is in the selected reporting context and who still need action.
- Churn Percentage shows churned clients and the churn percentage for the selected reporting context.
- Click the KPI cards to open the client list behind the number when drilldowns are available.

How filters affect the metrics:
- Company selects the company being reported on.
- CSM narrows the report to clients owned by that CSM.
- Secondary Assignee narrows the report when secondary assignees are enabled.
- Program/status narrows the clients included.
- Offer narrows the clients included to that pathway/offer.
- Client Start Date filters the client cohort by onboarding/start date.
- Date Range controls renewal windows, retained events, offboarding dates, and churn reporting windows.

Clients roster renewal visibility:
- Clients > Filters > Journey & Contract includes the Renewal filter.
- Renewal filter options include Overdue, Next 7 days, Next 14 days, Next 30 days, Next 60 days, and Next 90 days.
- The Clients list can also sort by Renewal date.
- This is the best day-to-day place for CSMs to find upcoming renewal conversations.

Important RetainOS differences from the old CST walkthrough:
- The old CST walkthrough mentioned a predictive conversions / renewal forecast widget. That is not part of the current RetainOS renewal KPI formula.
- Renewal forecast and predicted pipeline revenue are future reporting scope, probably best handled in Dashboard / CSM Reports / Beacon-assisted reporting once the underlying formulas are validated.
- The old CST walkthrough linked "has reached TTV" to renewal planning. In RetainOS, TTV is tracked separately in Dashboard > Overview > Journey and Client Detail > Pathways & Milestones. TTV is useful context for renewal conversations, but it does not automatically mark a client as retained or churned.
- The old walkthrough used mixed language around Churn %. RetainOS uses the Dashboard formula shown above so the resource, KPI info modal, and reporting code are aligned.

Migration QA checklist:
- Confirm current contract start date, contract end date / renewal date, and contract days migrated correctly.
- Confirm existing contract history imported where available.
- Pick a client with an upcoming renewal and verify they appears in Clients > Renewal filter and Dashboard > Up For Renewal.
- Record a renewal / upsell contract on a test client and confirm Retained Clients and Retention Percentage respond in the relevant Date Range.
- Offboard one test client before contract end date and confirm churn reason / notes are required, Churn Percentage responds, and the client appears in the churn drilldown.
- Offboard one test client on or after contract end date and confirm it is offboarded but not churned.
- Click Dashboard KPI cards to verify the client lists behind Retained, Up For Renewal, and Churn match expectations.

Best practices:
- Keep contract dates clean; retention and churn reporting depends on them.
- Use the contract flow for renewals instead of only changing a lifecycle status.
- Use the offboarding flow for churn instead of leaving churn notes only in Next Steps.
- Review Retention % and Churn % alongside Progress, Buy-In, Time to Value, advocacy activity, and renewal / upsell opportunities.
- During a migration, validate the numbers with a small hand-picked sample before trusting the full company-level report.

Related resources:
- Tracking TTV (Time to Value).
- Marking a client as paused or suspended.
- How to offboard a client.
- Tracking reviews, testimonials, referrals, and renewal opportunities.
- Filtering clients in RetainOS.
- Milestone progress breakdown by offer.

Re-recording notes:
- Show Dashboard > Overview > Contracts & Retention.
- Open each KPI info modal briefly so users see the formula language.
- Click Retained, Up For Renewal, and Churn to show the underlying client lists.
- Show Clients > Filters > Journey & Contract > Renewal.
- Show the Client Detail contract renewal flow.
- Show the Client Detail offboarding flow and explain why actual end date determines churn.
- Mention that predictive renewal forecasting / pipeline revenue is future scope, not the current RetainOS formula.$_$,
  'https://www.loom.com/share/4e6b212f7fe84ca5b9aae54fd2aa6c72',
  'draft',
  false,
  null,
  370,
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
