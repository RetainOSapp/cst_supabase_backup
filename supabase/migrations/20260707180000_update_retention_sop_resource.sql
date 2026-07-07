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
  'RetainOS SOP for renewal, retention, and churn metrics across Dashboard, Clients, contracts, status changes, and migrated CST history.',
  $_$Resource category: Using the Dashboard

Audience: Admin, Director, CSM, Support

Operational purpose: Keep renewal, retention, and churn reporting consistent after migration. RetainOS separates historical CST retention evidence from new RetainOS retention actions so teams are not penalized for a rule that did not exist before cutover.

Core definitions:
- Renewal date: the current contract end date / renewal date on the client profile.
- Up for renewal: clients whose current contract end date, calculated contract end date, or relevant contract history end date falls inside the selected Dashboard Date Range.
- Active clients up for renewal: clients up for renewal who are still active in Front End or Back End and have not already been retained in that same reporting context.
- Retention event: one renewal, restart, or upsell movement that should count as retained for reporting.
- Retention %: retention events divided by clients up for renewal in the same filter context.
- Offboarded client: a client whose lifecycle status has been changed to Off-boarded and whose actual offboarding date falls inside the selected reporting context.
- Churned client: an offboarded client whose actual offboarding date is before the client contract end date.
- Churn %: churned clients divided by total clients in the same filter context, currently Front End + Back End + Offboarded.

Migrated CST retention rule:
- For data migrated from CST, RetainOS counts historical program movements as retention evidence because CST did not require a paired RetainOS contract event.
- Count Front End to Back End as a retention / upsell event.
- Count Back End to Back End as a restart / retained event.
- Use the CST movement modified date as the retention date.
- Do not require these historical migrated events to have a RetainOS-created renewal contract.

RetainOS retention rule going forward:
- A status/program change alone does not count as retained.
- A new contract marked Renewal or Upsell creates the RetainOS retention event.
- The new contract start date is the retention date used by Dashboard.
- Front End to Front End counts as a Front End restart only when paired with a renewal contract.
- Back End to Back End counts as a Back End restart only when paired with a renewal contract.
- Front End to Back End counts as an upsell only when paired with an upsell contract.

How to record a renewal or upsell:
- Open the client profile.
- Go to Contract.
- Create the new contract.
- Set the contract start date to the real retained/restart/upsell date.
- Choose Renewal for same-program restarts or Upsell for Front End to Back End.
- Save the contract.
- RetainOS updates the current contract dates and writes a retention history event.

How to handle status/program changes:
- Use Change Status when the client's operating program really changes.
- If the change represents retention, add the new contract as Renewal or Upsell too.
- RetainOS may remind the user to pair active status movements with a retention contract.
- Do not rely on status movement alone for RetainOS-era retention reporting.

How churn is recorded:
- Open the client profile.
- Change the lifecycle status to Offboarded.
- Enter the client's actual end date.
- RetainOS compares the actual end date against the current contract end date.
- If the actual end date is before the contract end date, RetainOS treats the client as churned and requires churn reason / notes.
- If the actual end date is on or after the contract end date, RetainOS treats the offboarding as completed rather than churned.

Where to review the numbers:
- Dashboard > Overview > Contracts & Retention.
- Retained Clients shows retention events in the selected reporting context.
- Retention Percentage shows retention events divided by clients up for renewal.
- Up For Renewal shows active clients whose renewal date is in the selected reporting context and who still need action.
- Churn Percentage shows churned clients and the churn percentage for the selected reporting context.
- Click KPI cards to inspect the clients or events behind the number when drilldowns are available.

How filters affect the metrics:
- Company selects the company being reported on.
- CSM narrows the report to clients owned by that CSM.
- Secondary Assignee narrows the report when secondary assignees are enabled.
- Program/status narrows the clients included.
- Pathway narrows the clients included to that pathway.
- Client Start Date filters the client cohort by onboarding/start date.
- Date Range controls renewal windows, retained events, offboarding dates, and churn reporting windows.

Migration QA checklist:
- Compare retained counts against CST movement history for Front End to Back End and Back End to Back End.
- Spot-check several retained clients and confirm the Dashboard retained date matches the CST movement date.
- Record a RetainOS renewal / upsell contract on a test client and confirm Retained Clients responds based on the contract start date.
- Confirm a status change without a renewal/upsell contract does not create retention by itself.
- Offboard one test client before contract end date and confirm churn reason / notes are required.
- Offboard one test client on or after contract end date and confirm it is offboarded but not churned.

Best practices:
- Keep contract start and end dates clean.
- For new RetainOS work, use the contract flow for renewals instead of only changing lifecycle status.
- Use the offboarding flow for churn instead of leaving churn notes only in Next Steps.
- Review Retention % and Churn % alongside Progress, Buy-In, Time to Value, advocacy activity, and renewal / upsell opportunities.$_$,
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
