-- Refresh the old CST "Tools for Admins Only" walkthrough for the current
-- RetainOS role model, navigation, and admin operating surfaces.

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
  'admin-tools-overview',
  'Admin and Director tools in RetainOS',
  'video',
  'Orientation for Admins and Directors on RetainOS role permissions, client visibility, reporting, resources, and Admin Hub workflows.',
  $_$Resource category: Setup & Onboarding

Audience: Admin, Director, Support

Operational purpose: Orient Admins and Directors to the RetainOS areas they use to manage the company, review client success performance, support CSMs, and configure the workspace.

RetainOS status: Live as an orientation resource. Some old CST popup-style alerts and cohort-specific screens have been redesigned or moved into Dashboard, CSM Reports, Daily Pulse, Clients filters, and future notification scope.

Role model in RetainOS:
- Super Admin: RetainOS internal / platform-level access across companies.
- Director: company admin role with broad visibility and Admin Hub access.
- Support: broad company visibility and operating access, but without full Admin Hub configuration power.
- CSM: assigned-client operating role.
- Viewer: read-only visibility where configured.

Director / Admin visibility:
- Directors can see the company roster across CSMs.
- Directors can filter Clients by CSM, status, pathway/offer, milestone, contact cadence, outcomes, advocacy, and other enabled filters.
- Directors can open client profiles and review full client context.
- Directors can edit client profile details where permitted.
- Directors can assign or reassign the Primary CSM.
- Directors can set or clear Secondary Assignee when the company feature is enabled.
- Directors can change client status, manage offboarding details, and review client history.
- Directors can manage pathways/milestones and company settings from Admin Hub.

Support visibility:
- Support users can see broader company context than a CSM.
- Support can help operate clients, tasks, reporting, and support workflows where permitted.
- Support is intentionally not the same as Director. Configuration, team management, and higher-risk company setup actions remain Director / Super Admin scope.

CSM visibility:
- CSMs see and operate assigned clients.
- CSMs can use Clients, Daily Pulse, Tasks, Quick Update, client profiles, resources, and the Dashboard views allowed for their role.
- CSMs do not get the same full-company management and Admin Hub access as Directors.

Main RetainOS navigation for Admins and Directors:
- Dashboard: company-level KPIs, retention, client health, charts, advocacy reporting, and AI Insights where enabled.
- Daily Pulse: operating view for current follow-ups, reminders, due work, and client attention signals.
- Clients: roster management, filtering, Quick Update, client profiles, assignment, status changes, and client-level operating work.
- CSM Reports: CSM/profile-upkeep reporting and compliance review by CSM and date range.
- Tasks: team and client task management.
- Resources: RetainOS Help and company resources.
- Admin Hub: company settings, team members, custom fields, pathways/milestones, feature gates, integrations, churn reasons, and other workspace setup.

Dashboard usage:
- Use Dashboard > Overview for company-level operating metrics.
- Use Dashboard filters for company, CSM, client status, offer/pathway, date ranges, and other available reporting dimensions.
- Use Dashboard > Charts for distribution views such as program status, outcomes, offer/pathway, task status, CSM workload, and capacity where available.
- Use Dashboard drilldowns where enabled to inspect the client list behind a KPI or chart segment.
- Use Dashboard > AI Insights only when available to the role and company.

CSM Reports usage:
- Use CSM Reports for CSM performance and profile upkeep review.
- Filter by CSM and date range.
- Use this for coaching conversations, quality control, and operating accountability.
- This replaces much of the old CST "Performance" tab language.

Clients usage for Directors:
- Use Clients to review all client segments, not only assigned clients.
- Filter by CSM to review one coach's book of business.
- Use the compact filter sections for Journey & Contract, Health & Outcomes, and Advocacy & Growth.
- Open client profiles for deeper review, profile edits, pathway/milestone work, contracts, tasks, links, and history.
- Use the CSM = Unassigned filter when reviewing clients that need a Primary CSM.

Admin Hub usage:
- Team Members: add team members, set roles, capacity, visibility, and invite access.
- Customization: configure outcome definitions and custom client fields.
- Pathways & Milestones: create, edit, archive, restore, and order company pathways and milestones.
- Settings / Feature Gates: enable company-level capabilities such as Secondary Assignee, Secondary Pathway, Client Archetypes, Call AI access, and other feature switches where available.
- Integrations: review integration queue items and company tokens where the role has permission.
- Company resources and setup guidance live in Resources.

Call AI / integrations boundary:
- The old CST walkthrough described a Call AI area under a More tab.
- In RetainOS, call summary and transcript workflows are handled through the current Call AI / integration resources and the integration review queue where available.
- Full Call AI QC and transcript-processing resources should be recorded separately from this general admin orientation.

Notifications and alerts boundary:
- The old CST walkthrough described popup-style alerts for offboarded clients, new clients, and assigned clients.
- RetainOS currently handles much of this through Clients filters, Daily Pulse, Tasks, roster visibility, and future notification work.
- Do not record this resource as if old CST popup notifications are fully live in the same form.
- Current useful fallback: use Clients filters such as CSM = Unassigned, status filters, offboarding reporting, and Daily Pulse / Tasks for operating follow-up.

What Directors should not treat as normal workflow:
- Do not delete clients as a normal operating action. Use status changes, offboarding, archiving-style workflows, and history-preserving actions where available.
- Do not bypass CSM workflows by editing everything directly unless there is a clear operating reason.
- Do not use Admin Hub settings casually during live customer operations; configuration changes can affect the whole team.

Recommended admin cadence:
- Daily: check Daily Pulse, urgent tasks, and active client risks.
- Weekly: review Clients filters, CSM workload, at-risk segments, next contact gaps, advocacy opportunities, and overdue tasks.
- Monthly: review Dashboard KPIs, CSM Reports, profile upkeep, retention/churn, renewals, and advocacy ask-to-received ratios.
- Quarterly: use Dashboard filters and charts for cohort-style analysis by start date, CSM, pathway/offer, milestone, and health signals.

Related resources:
- How to invite a team member.
- Assigning new clients to a CSM in RetainOS.
- Custom fields in RetainOS.
- Customizing milestones and offers in RetainOS.
- Filtering clients in RetainOS.
- Tracking reviews, testimonials, referrals, and renewal opportunities.
- Understanding client history in RetainOS.

Re-recording notes:
- Record from current RetainOS navigation, not the old CST More tab.
- Show Dashboard, Clients, CSM Reports, Tasks, Resources, and Admin Hub.
- Explain Director, Support, CSM, and Viewer role differences.
- Show Clients filtered by CSM and CSM = Unassigned.
- Show Admin Hub tabs for Team Members, Customization, Pathways & Milestones, and Settings.
- Mention that old popup-style notifications are future/different scope, not the core admin workflow today.
- Keep Call AI brief and point to dedicated Call AI resources instead of trying to cover call QC inside this overview.$_$,
  'https://www.loom.com/share/a769893cb5474e2c8fb2fed7c5edc850',
  'draft',
  false,
  null,
  130,
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
