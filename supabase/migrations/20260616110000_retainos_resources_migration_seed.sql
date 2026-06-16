-- Seed RetainOS Help resources from the Glide resource migration export.
-- Most old Glide walkthroughs stay draft until the RetainOS UI/Looms are
-- re-recorded. Live dynamic integration guides remain published.

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
values
  (
    'invite-team-member',
    'How to invite a team member',
    'video',
    'Admin guide for adding team members with the right role and permissions.',
    $_$Audience: Admin

Operational purpose: Enable Admins to add new team members to RetainOS with the correct role and permissions.

Glide source copy:
- Go to the Admin tab (only admins can add team members).
- Click Add close to Team.
- Add their Name, Email, Role, and Photo.
- Remember that Director/Admin roles can access every CSM's data.
- Click Submit.

RetainOS review note: Confirm that the Admin tab and Add button labels match RetainOS. Update role names if they differ from Glide. Re-record the Loom once UI is finalized.$_$,
    'https://www.loom.com/share/3e34b3bb5ce04afebb6a84e8526667a2',
    'draft',
    false,
    null,
    110,
    'retainos_help',
    null
  ),
  (
    'customize-milestones-offers',
    'How to customize milestones and offers',
    'video',
    'Admin guide for configuring offer structure and milestone order.',
    $_$Audience: Admin

Operational purpose: Allow Admins to configure offer structure and milestone sequence inside RetainOS.

Glide source copy:
- Click More > Admin.
- Scroll down to + New Offer.
- Add your milestones.
- Use the Order feature to structure your offer.

RetainOS review note: Confirm the navigation path, the current Offers & Milestones tab name, and whether milestone ordering is called Order, move up/down, or another label. Re-record once confirmed.$_$,
    'https://www.loom.com/share/5b5151c6a03a429197099887774c06ee',
    'draft',
    false,
    null,
    120,
    'retainos_help',
    null
  ),
  (
    'admin-tools-overview',
    'Tools for Admins only',
    'video',
    'Orientation for Admins and Directors on the admin-only operating areas.',
    $_$Audience: Admin, Director

Operational purpose: Orient Admins and Directors to admin-only tools and the operating cadence for reviews.

Glide source copy summary:
- Clients: Admins can see all current and historical clients and filter by CSM.
- Cohorts: Admin/Director-only area for quarterly or biannual program and CSM analysis.
- CSM: Admin/Director-only area for monthly client-success and CSM analysis.
- Admin: Add/remove team members, manage offer names and milestones, archive info.
- Call AI: View Call AI analysis logs by date and sentiment.

RetainOS review note: Confirm all RetainOS tab names and availability. Cohorts and Call AI are not equivalent to the old Glide UI yet, so this should remain draft until the shipped navigation is final.$_$,
    'https://www.loom.com/share/a769893cb5474e2c8fb2fed7c5edc850',
    'draft',
    false,
    null,
    130,
    'retainos_help',
    null
  ),
  (
    'csv-client-upload',
    'Upload existing clients with a CSV file',
    'template',
    'Draft guide for importing existing client rosters into RetainOS by CSV.',
    $_$Audience: Admin

Operational purpose: Allow Admins to bulk-import existing client rosters into RetainOS via CSV upload.

Glide source copy: TBD.

RetainOS review note: RetainOS has CSV template/export/preview/import safety-net work for app-owned companies, but create/import field coverage still follows the current New Client V1 path. Confirm the final UI location, required columns, and mapping rules before publishing or recording.$_$,
    null,
    'draft',
    false,
    null,
    140,
    'retainos_help',
    null
  ),
  (
    'assign-new-clients-csm',
    'Assigning new clients to a CSM',
    'video',
    'Guide for assigning manually created or automation-created clients to the right CSM.',
    $_$Audience: Admin

Operational purpose: Guide Admins through manual and automated client assignment workflows.

Glide source copy:
Option 1, manual:
- When you create a new client, assign them to the right CSM and let the CSM know.

Option 2, automatic via Zapier:
- The system Admin gets a notification that a new client was added.
- Click the notification, go to the client, click Edit, and assign the right CSM.
- When the assigned CSM logs in, a popup shows that a new client was assigned to them.

RetainOS review note: Confirm current notification behavior, whether a popup exists, and the exact Edit Profile / assigned CSM location before publishing.$_$,
    'https://www.loom.com/share/fa157d2b76e2448fbaa5c65bfa87e59e',
    'draft',
    false,
    null,
    150,
    'retainos_help',
    null
  ),
  (
    'zapier-template-walkthrough',
    'Full walkthrough and Zapier template',
    'video',
    'Draft walkthrough for the legacy Zapier template and webhook setup flow.',
    $_$Audience: Admin, Developer

Operational purpose: Walk Admins through Zapier setup for automating client additions into RetainOS.

Glide source reference:
- Old Zap template: https://zapier.com/shared/50a9692cbedcf88c9ca342d2f9666b36b60a1bd5
- Old webhook URL: https://clientsuccesstracker.ai/dl/webhook

RetainOS review note: The old webhook URL must not be used. Confirm whether the Zapier template should be rebuilt for RetainOS, then re-record the Loom with the RetainOS endpoint and company-token flow.$_$,
    'https://www.loom.com/share/b6beca686f9c4e63bda0240d0177a681',
    'draft',
    false,
    null,
    155,
    'retainos_help',
    null
  ),
  (
    'zapier-client-webhook',
    'Add new clients through Zapier',
    'guide',
    'Company-token-aware setup guide for creating new RetainOS clients from Zapier, CRM, checkout, or form tools.',
    $_$Audience: Admin, Developer

Operational purpose: Automate new client creation in RetainOS through the live New Client Webhook.

RetainOS status: Live dynamic guide. Use the endpoint and company-specific token shown in this RetainOS resource, not the old CST URL. Each company receives unique setup variables and tokens.$_$,
    null,
    'published',
    true,
    'zapier_client_webhook',
    10,
    'retainos_help',
    null
  ),
  (
    'retainos-terminology-guide',
    'RetainOS terminology guide',
    'video',
    'Definitions for common RetainOS terms used across clients, offers, outcomes, and reporting.',
    $_$Audience: All

Operational purpose: Define RetainOS-specific terminology for new users across roles.

Glide source definitions:
- Assigned CSM: who is responsible for managing the client.
- Front End Program: typically the first purchase your client makes.
- Backend Program: typically the second purchase your client makes.
- Milestone: key moments in the client journey that help clients reach the initial expectation.
- Offer: products available in your offer suite.
- Buy-in: how committed or engaged the client is, often based on communication and trust.
- Progress: how on track the client is with milestones or results.
- Success: whether the client achieved the expected outcome for the offer.
- Cohorts: timeline under analysis for quarterly reviews.

RetainOS review note: Confirm the final terms and whether Cohorts exists in RetainOS before publishing.$_$,
    'https://www.loom.com/share/36338f0bac104be993080094901adb30',
    'draft',
    false,
    null,
    160,
    'retainos_help',
    null
  ),
  (
    'custom-fields',
    'Custom fields',
    'video',
    'Guide for configuring company-specific recurring tracking fields.',
    $_$Audience: Admin

Operational purpose: Show Admins how to configure custom fields for company-specific tracking.

Glide source copy:
To make RetainOS more customizable to each business and offer, you can add custom columns to keep visibility on metrics most relevant to your team.

RetainOS review note: RetainOS custom fields are company-level recurring Quick Update / Client Detail > Outcomes tracking fields. Confirm final field limits and UI labels before publishing.$_$,
    'https://www.loom.com/share/adb793b20c3442df9ae2fab5e7867484',
    'draft',
    false,
    null,
    170,
    'retainos_help',
    null
  ),
  (
    'add-clients-manually',
    'Adding clients manually to RetainOS',
    'video',
    'Walkthrough for manually creating a client in RetainOS.',
    $_$Audience: Admin, CSM

Operational purpose: Guide users through the manual client creation flow.

Glide source copy:
This walkthrough shows you how to add clients to RetainOS manually.

RetainOS review note: Confirm the New Client flow, required fields, optional setup fields, initial contract handling, offer/milestone assignment, and CSM assignment rules before publishing.$_$,
    'https://www.loom.com/share/c752acdefa1247609b57eee6c71163d2',
    'draft',
    false,
    null,
    180,
    'retainos_help',
    null
  ),
  (
    'client-details-screen',
    'How to use the Client Details screen',
    'video',
    'Guide for navigating client profile context, status, outcomes, milestones, contracts, tasks, and history.',
    $_$Audience: CSM, Admin

Operational purpose: Help CSMs and Admins navigate the Client Detail screen efficiently.

Glide source copy:
- Go to the Clients tab.
- Switch between list/details views.
- See milestone, offer, progress, buy-in, assigned CSM, client age, and last engagement at a glance.

RetainOS review note: RetainOS navigation differs from Glide. Confirm current tabs and visible fields before publishing or recording.$_$,
    'https://www.loom.com/share/4472e6bd1c1146ee827df0957f0b292c',
    'draft',
    false,
    null,
    210,
    'retainos_help',
    null
  ),
  (
    'csm-performance-view',
    'CSM / Performance View',
    'video',
    'Dashboard and CSM performance overview for Admins, Directors, and CSMs.',
    $_$Audience: Admin, CSM

Operational purpose: Give CSMs and Admins a performance snapshot across tracked KPIs.

Glide source copy covers assigned CSM, date range, active clients, front-end clients, backend clients, upgraded clients, capacity, capacity in 30 days, reviews, testimonials, referrals, and offboarded clients.

RetainOS review note: Dashboard/CSM Reports formula confidence waits for Moves Method or another larger migrated company. Do not publish this guide until KPI names and formulas are validated against larger data.$_$,
    'https://www.loom.com/share/eabc567f69674a53a4d95c9d2d3bbe2c',
    'draft',
    false,
    null,
    310,
    'retainos_help',
    null
  ),
  (
    'filter-dashboard-results',
    'How to filter the results',
    'video',
    'Guide for using dashboard/report filters during monthly reviews, PIPs, and quarterly planning.',
    $_$Audience: Admin

Operational purpose: Teach Admins how to apply filters for monthly reviews, PIPs, and quarterly analysis.

Glide source copy:
- Every month: use the Performance tab with the right CSM and date range.
- Performance reviews: if under KPI, provide support and review again in 30 days.
- Quarterly goals: use a wider range to evaluate past 90-day performance and plan for growth.

RetainOS review note: Confirm RetainOS filter controls and names before publishing.$_$,
    'https://www.loom.com/share/3da3a72e232d40efa561a29e196b8812',
    'draft',
    false,
    null,
    320,
    'retainos_help',
    null
  ),
  (
    'analyze-performance',
    'How to analyze performance',
    'guide',
    'Guide for reviewing individual team performance and overall department performance.',
    $_$Audience: Admin

Operational purpose: Guide Admins through individual and collective performance analysis.

Glide source copy:
Focus on two core functions:
- Individually: review team members' performance, capacity, and projections.
- Collectively: review the full breakdown of the Client Success department.

RetainOS review note: Original Loom is broken and must be re-recorded after dashboard/CSM Reports validation.$_$,
    null,
    'draft',
    false,
    null,
    330,
    'retainos_help',
    null
  ),
  (
    'cohort-analysis',
    'Cohort analysis',
    'video',
    'Draft guide for cohort-based client success analysis.',
    $_$Audience: Admin, Director

Operational purpose: Enable Admins to run quarterly and biannual cohort analysis tied to client start dates.

Glide source copy summary:
Cohort analysis groups clients by when they started and helps compare client outcomes with marketing/sales initiatives. KPIs are tied to clients who started in the selected period, even if the KPI occurred later.

RetainOS review note: RetainOS does not yet have the old Glide Cohorts tab as a finalized shipped surface. Keep draft until the dashboard/reporting equivalent is defined.$_$,
    'https://www.loom.com/share/efc73fc6e6124583b5c4cb7308341514',
    'draft',
    false,
    null,
    340,
    'retainos_help',
    null
  ),
  (
    'tracking-time-to-value',
    'Tracking TTV (Time to Value)',
    'video',
    'Draft guide for understanding time to value and value activation points.',
    $_$Audience: Admin, CSM

Operational purpose: Help teams understand and track Time to Value as a success metric.

Glide source copy:
By selecting a Value Activation Point for your offer, you can identify the moment where the client feels a strong sense of accomplishment and value. RetainOS tracks this in the dashboard to show how long clients take to reach it.

RetainOS review note: Confirm whether Value Activation Point and TTV are in the current RetainOS dashboard before publishing.$_$,
    'https://www.loom.com/share/7e17541a256f454a9a30133b4f7b529b',
    'draft',
    false,
    null,
    350,
    'retainos_help',
    null
  ),
  (
    'milestone-progress-breakdown-by-offer',
    'Milestone progress breakdown by offer',
    'video',
    'Draft guide for reading milestone completion by offer and identifying bottlenecks.',
    $_$Audience: Admin, CSM

Operational purpose: Help teams spot milestone bottlenecks and prioritize support.

Glide source copy:
RetainOS includes a dashboard widget that gives a visual breakdown of milestone completion across client journeys, organized by each client's offer.

RetainOS review note: Confirm this widget exists and is filterable by offer before publishing.$_$,
    'https://www.loom.com/share/b77254f612204657bbb51ab9c9f1ada3',
    'draft',
    false,
    null,
    360,
    'retainos_help',
    null
  ),
  (
    'retention-churn-metrics',
    'Understanding retention and churn in RetainOS',
    'video',
    'Draft guide for how retention and churn are calculated in RetainOS.',
    $_$Audience: Admin, CSM

Operational purpose: Ensure users understand retention and churn definitions.

Glide source copy:
This training explains how Retention % and Churn % are calculated in the RetainOS Dashboard.

RetainOS review note: Formula confidence waits for Moves Method or another larger migrated company. Publish only after canonical formulas are validated.$_$,
    'https://www.loom.com/share/4e6b212f7fe84ca5b9aae54fd2aa6c72',
    'draft',
    false,
    null,
    370,
    'retainos_help',
    null
  ),
  (
    'course-completion-webhook',
    'Track course completion through webhook',
    'guide',
    'Planning guide for sending LMS course-completion events into RetainOS.',
    $_$Audience: Admin, Developer

Operational purpose: Automatically update client milestone or progress status when course modules are completed externally.

RetainOS status: Planning guide only. Company-specific tokens are required, and the endpoint is not live yet. Do not turn on a live LMS automation until RetainOS marks this workflow live.$_$,
    null,
    'published',
    true,
    'course_completion_webhook',
    45,
    'retainos_help',
    null
  ),
  (
    'call-ai-transcript-webhook',
    'Submit transcripts to Call AI',
    'guide',
    'Planning guide for sending full call transcripts into RetainOS.',
    $_$Audience: Admin, Developer

Operational purpose: Push Call AI transcript data into RetainOS after coaching or renewal calls.

RetainOS status: Planning guide only. Company-specific tokens are required, and full transcript ingestion/AI analysis is not live yet. Do not turn on production sends until RetainOS marks this workflow live.$_$,
    null,
    'published',
    true,
    'call_transcript_webhook',
    70,
    'retainos_help',
    null
  ),
  (
    'client-call-summary-webhook',
    'Add AI summary to notes / next steps',
    'guide',
    'Live setup guide for sending AI-generated call summaries into RetainOS client notes and next steps.',
    $_$Audience: Admin, Developer

Operational purpose: Automatically populate Notes and Next Steps with AI-generated call summaries after calls.

RetainOS status: Live for call-summary / next-steps updates with company-specific tokens. Setup should be company-specific rather than a generic Loom.$_$,
    null,
    'published',
    true,
    'client_call_summary_webhook',
    80,
    'retainos_help',
    null
  ),
  (
    'client-update-webhook',
    'Update a client profile through webhook',
    'guide',
    'Live setup guide for syncing supported client profile updates from external tools into RetainOS.',
    $_$Audience: Admin, Developer

Operational purpose: Automatically sync supported client profile updates from external systems.

RetainOS status: Live for the supported V1 client-update fields with company-specific tokens. Status/program updates remain intentionally outside this endpoint.$_$,
    null,
    'published',
    true,
    'client_update_webhook',
    90,
    'retainos_help',
    null
  ),
  (
    'webhook-add-new-task',
    'Webhook: adding a new task',
    'guide',
    'Future guide for creating RetainOS tasks from external events.',
    $_$Audience: Admin, Developer

Operational purpose: Automatically create tasks in RetainOS from external events such as completed calls or milestones.

RetainOS status: Future guide. Company-specific tokens will be required. Keep draft until a task-create webhook is intentionally built and documented.$_$,
    null,
    'draft',
    false,
    null,
    430,
    'retainos_help',
    null
  ),
  (
    'webhook-update-client-program',
    'Webhook: updating a client program',
    'guide',
    'Future guide for updating client program assignment from external systems.',
    $_$Audience: Admin, Developer

Operational purpose: Automatically update a client's program assignment when an upgrade or change happens externally.

RetainOS status: Future guide. Program/status side effects are controlled by RetainOS lifecycle flows today. Keep draft until a dedicated endpoint exists.$_$,
    null,
    'draft',
    false,
    null,
    440,
    'retainos_help',
    null
  ),
  (
    'tracking-group-calls',
    'Tracking group calls in RetainOS',
    'video',
    'Future walkthrough for automating group call attendance and notes.',
    $_$Audience: Admin, CSM

Operational purpose: Show teams how to automate group call tracking so attendance and notes are logged without manual entry.

Glide source copy:
Watch this Loom walkthrough to see how to automate group call tracking inside RetainOS.

RetainOS review note: This requires a fresh Loom once group call tracking automation is finalized in RetainOS.$_$,
    'https://www.loom.com/share/7a7349665f834570859d8ba870aee853',
    'draft',
    false,
    null,
    450,
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
