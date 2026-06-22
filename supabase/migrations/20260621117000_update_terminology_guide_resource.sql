-- Refresh the RetainOS terminology guide as a current glossary for onboarding
-- and cross-role language alignment.

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
  'retainos-terminology-guide',
  'RetainOS terminology guide',
  'video',
  'Glossary of common RetainOS terms across clients, lifecycle status, pathways, outcomes, advocacy, reporting, roles, and admin setup.',
  $_$Resource category: Setup & Onboarding

Audience: All

Operational purpose: Give new and existing users a shared vocabulary for RetainOS so CSMs, Directors, Support, and Admins interpret client data the same way.

RetainOS status: Live as a draft glossary resource. This should be re-recorded after the main migration/resource pass so the walkthrough reflects the final RetainOS UI and language.

Core account terms:
- Company: the customer workspace inside RetainOS.
- Client: an end customer/member/student being managed through the company workspace.
- Team Member: a user on the company team.
- Primary CSM: the main client success manager responsible for a client.
- Secondary Assignee: an optional second team member assigned to support a client when the company feature is enabled.
- Director: company admin role with broad client visibility, reporting access, and Admin Hub access.
- Support: broader operating visibility than a CSM, but not full Director/Admin configuration power.
- CSM: assigned-client operating role.
- Viewer: read-only role where configured.
- Super Admin: RetainOS internal / platform-level access across companies.

Client lifecycle status:
- Front End: usually the first/core offer or first program stage the client joins.
- Back End: usually a continuation, upgrade, renewal, second program stage, or higher-level offer.
- Paused: the client is temporarily paused and may have a planned return date.
- Suspended: the client is not actively progressing because of a hold, issue, or suspension.
- Offboarded: the client has ended their active program relationship.
- Churned: the client ended before the expected/contracted completion point or did not continue when expected, based on the company's offboarding logic.
- Completed / Did not churn: the client completed the relevant contracted/program period without being classified as churned.

Pathway and journey terms:
- Offer / Pathway: the product, program, or journey structure the client is on. RetainOS often uses Pathway for the operational journey, while existing CST/Glide resources may say Offer.
- Milestone: a defined step or key moment within a pathway that marks client progress.
- Current Milestone: the milestone the client is currently working through.
- Completed Milestone: a milestone the client has finished.
- Secondary Pathway: an optional additional pathway/milestone tracker, useful for add-ons, secondary journeys, call tracking, or Moves Method-style secondary pathways.

Coaching context terms:
- North Star: the client's larger promised outcome, goal, or expectation.
- Next Steps: the current action-oriented plan for the client's next interaction or next work period.
- Notes: broader context from calls, Slack, async support, or relationship history.
- Date of Last Contact: when the team last meaningfully interacted with the client.
- Date of Next Contact: when the team plans to contact or follow up with the client next.
- Reminder: in RetainOS, most reminder-style work should be modeled as a task with a due date.

Outcome and health terms:
- Success: whether the client is currently successful or has met the relevant expectation/outcome according to the company's definition.
- Progress: whether the client is moving through the journey at the expected pace.
- Buy-In: how engaged, committed, and responsive the client is.
- Green / Yellow / Red: common traffic-light health language. Companies can define what each value means in their operating SOPs.
- Outcome Definitions: company-level definitions for Success, Progress, and Buy-In so the team scores clients consistently.
- Custom Fields: company-specific client fields used for repeated operating data that does not fit the standard RetainOS fields.

Advocacy and growth terms:
- Advocacy & Growth: RetainOS area for tracking reviews, testimonials, referrals, and renewal / upsell opportunities.
- Asked: the team has asked the client for the review, testimonial, referral, renewal, or upsell opportunity.
- Received: the team has received the review, testimonial, referral, renewal, or upsell opportunity.
- Asked x2 / Asked x3: repeat ask count for the same client and advocacy item.
- Referral Note: optional note where the team can capture referral name, company, context, or next step.

Contract and revenue terms:
- Contract: app-owned record of a client's agreement, value, start date, end/renewal date, and related notes/links where available.
- Contract Start Date: when the relevant agreement/program period begins.
- Contract End / Renewal Date: when the current agreement/program period ends or becomes up for renewal.
- Monthly Value: monthly contract value used for reporting and revenue visibility where available.
- Renewal: a client coming to the end of a contract/program period with an opportunity to continue.
- Upsell: a client moving into a higher-value or additional offer/pathway.

Reporting terms:
- Dashboard: company-level reporting area for client health, retention, contracts, advocacy, charts, and AI Insights where enabled.
- Dashboard Overview: KPI cards and operating metrics for the selected filters.
- Dashboard Charts: distribution and breakdown views, including program status, outcomes, offers/pathways, tasks, workload, and capacity where available.
- CSM Reports: CSM/profile-upkeep and operating compliance reporting by CSM and date range.
- Cohort-style analysis: in RetainOS, use Dashboard filters and charts to analyze clients by start date, CSM, pathway/offer, milestone, lifecycle status, and health signals. There is not a separate old-CST Cohorts tab in the same form.
- Drilldown: clicking a KPI/chart segment to see the clients behind that number where enabled.
- Capacity: configured workload target for a CSM or team member.

Daily operating terms:
- Daily Pulse: day-to-day operating view for follow-ups, due work, reminders, and clients needing attention.
- Tasks: owned work items with status, priority, assignee, due date, and optional client link.
- Quick Update: fast client update workflow from Clients for notes, next steps, contact cadence, outcomes, custom fields, pathway progress, and advocacy.
- Profile Upkeep: how recently and completely important client fields have been maintained.
- History: client-level timeline of app-owned updates, profile changes, notes, outcomes, status changes, contracts, pathway changes, integrations, and other events where available.

Admin and setup terms:
- Admin Hub: company setup area for team members, customization, pathways/milestones, settings, feature gates, integrations, and related configuration.
- Feature Gate: company-level setting that enables or hides a capability.
- Team Member Capacity: target number of active clients or workload level for a team member.
- Churn Reason: company-configured reason used during offboarding/churn reporting.
- Integration Token: company-scoped token used by automation tools to send data into RetainOS.
- Integration Review Queue: review area for automation payloads that cannot be safely auto-applied.
- Resources: RetainOS Help and company resource library.

Data state terms:
- App-owned data: RetainOS-native records that can be edited and used by live write flows.
- Mirrored CST / Glide data: read-only legacy mirror data kept for migration, reference, or staged rollout.
- Pilot / Migrated company: company whose data has been enabled for RetainOS app-owned workflows.

Common language shifts from Glide/CST:
- CST / Client Success Tracker -> RetainOS.
- More > Admin -> Admin Hub.
- Cohorts tab -> Dashboard filters/charts for cohort-style analysis.
- Performance tab -> Dashboard and CSM Reports.
- Offer -> often Pathway in RetainOS when talking about the operational journey.
- Inline field history -> Client Detail > History tab.
- Custom reminder -> usually a client-linked Task with a due date.

How to use this guide:
- Admins should use it when onboarding a new team.
- CSMs should use it when first learning RetainOS fields and filters.
- Directors should use it when standardizing how the team scores Success, Progress, Buy-In, and advocacy activity.
- Support should use it when translating old CST/Glide language into RetainOS language during migration.

Related resources:
- Admin and Director tools in RetainOS.
- Filtering clients in RetainOS.
- Making a quick update in RetainOS.
- Understanding and updating a client profile.
- Custom fields in RetainOS.
- Tracking client contact cadence.
- Tracking reviews, testimonials, referrals, and renewal opportunities.

Re-recording notes:
- Record from Resources first, then briefly show Clients filters, Client Detail, Dashboard, CSM Reports, and Admin Hub.
- Do not use old CST navigation labels as if they still exist.
- Explicitly explain the Glide/CST language shifts.
- Keep the video practical: define the term, show where it appears, and explain why the team should care.
- Record this after major migration terminology is stable.$_$,
  'https://www.loom.com/share/36338f0bac104be993080094901adb30',
  'draft',
  false,
  null,
  160,
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
