# RetainOS Resources Migration
> Migrated from Glide CST. All references to "Client Success Tracker" or "CST" have been rebranded to **RetainOS**.
> Resources marked **Needs Re-record** require new Loom walkthroughs once RetainOS build is finalized.
> Resources marked **⚠️ Codex Note** flag UI/copy changes Codex must confirm before re-recording.

---

## Resource Index

| Resource | Section | Audience | Keep / Rewrite / Archive | RetainOS Status |
| --- | --- | --- | --- | --- |
| How to Invite a Team Member | Setup & Onboarding | Admin | Rewrite | Needs Re-record |
| How to Customize Milestones and Offers | Setup & Onboarding | Admin | Rewrite | Needs Re-record |
| Tools for Admins Only | Setup & Onboarding | Admin/Director | Rewrite | Needs Re-record |
| Upload Your Existing Clients with a CSV File | Setup & Onboarding | Admin | Rewrite | Pending — confirm CSV import in RetainOS |
| Assigning New Clients to a CSM | Setup & Onboarding | Admin | Rewrite | Needs Re-record |
| Full Walkthrough and Zapier Template | Setup & Onboarding | Admin | Rewrite | Needs Re-record — webhook URL update required |
| RetainOS Terminology Guide | Setup & Onboarding | All | Rewrite | Needs Re-record |
| Custom Fields | Setup & Onboarding | Admin | Keep | Needs Re-record |
| Adding Clients Manually | Setup & Onboarding | Admin, CSM | Rewrite | Needs Re-record |
| How to Use the Client Details Screen | Working with Clients | CSM, Admin | Rewrite | Needs Re-record — pending RetainOS UI finalization |
| CSM / Performance View | Using the Dashboard | Admin, CSM | Rewrite | Needs Re-record |
| How to Filter the Results | Using the Dashboard | Admin | Keep | Needs Re-record |
| How to Analyze Performance | Using the Dashboard | Admin | Keep | Needs Re-record — original Loom broken |
| Cohort Analysis | Using the Dashboard | Admin/Director | Rewrite | Needs Re-record |
| Tracking TTV (Time to Value) | Using the Dashboard | Admin, CSM | Keep | Needs Re-record |
| Milestone Progress Breakdown by Offer | Using the Dashboard | Admin, CSM | Keep | Needs Re-record |
| Understanding Retention and Churn | Using the Dashboard | Admin, CSM | Rewrite | Needs Re-record |
| Webhook: Adding New Clients | Automations | Admin/Dev | Rewrite | In RetainOS — unique tokens per company |
| Webhook: Updating Client Course Completion | Automations | Admin/Dev | Rewrite | In RetainOS — unique tokens per company |
| Webhook: Call AI Integration | Automations | Admin/Dev | Rewrite | In RetainOS — unique tokens per company |
| Webhook: Adding AI Summary to Notes / Next Steps | Automations | Admin/Dev | Rewrite | In RetainOS — unique tokens per company |
| Webhook: Updating a Client's Profile | Automations | Admin/Dev | Rewrite | In RetainOS — unique tokens per company |
| Webhook: Adding a New Task | Automations | Admin/Dev | Rewrite | In RetainOS — unique tokens per company |
| Webhook: Updating a Client's Program | Automations | Admin/Dev | Rewrite | In RetainOS — unique tokens per company |
| Tracking Group Calls | Automations | Admin, CSM | Rewrite | Needs Re-record |

---

## Resource Blocks

---

## RetainOS Implementation Review - 2026-06-16

Current RetainOS Resources implementation:

- RetainOS already separates the library into two top-level collections:
  - RetainOS Help: shared/global resources.
  - Company Resources: customer-owned SOPs, Looms, docs, and links scoped to the selected company.
- `supabase/migrations/20260616110000_retainos_resources_migration_seed.sql` seeds all 25 resources from this export into RetainOS Help.
  - Rewrite/re-record resources are seeded as `draft` for SuperAdmin review.
  - Live dynamic integration guides are seeded as `published`.
  - Future/not-live automation guides stay draft unless an existing dynamic planning guide already exists.
- The Resources page now has RetainOS Help subcategory pills matching this export:
  - All
  - Setup & Onboarding
  - Working with Clients
  - Using the Dashboard
  - Automations
- Category filtering uses explicit slug overrides for the seeded resources and falls back to client-side inference from each resource's title, slug, description, content, and `dynamic_key`.
  - No schema migration was added.
  - If resources become larger or need exact editorial control, add a first-class `category` or `tags` field to `resources`.

Content status:

- Covered/live in RetainOS today:
  - RetainOS Help vs Company Resources library split.
  - Written guide, link, and Loom/video resource rendering.
  - SuperAdmin create/edit/archive path for resources.
  - Token-aware RetainOS Help setup guides for New Client Webhook, Client Update, Call Summary / Next Steps, Call Transcript planning, and Course Completion planning.
- Seeded as draft because they need rewrite/re-record before customer-facing use:
  - Setup & Onboarding walkthroughs.
  - Working with Clients walkthroughs.
  - Dashboard walkthroughs and dashboard formula/performance walkthroughs.
  - Generic Glide Looms that show old UI, old tab names, or CST-era URLs.
- Future/not-live or customer-specific:
  - Course Completion endpoint.
  - Full Call Transcript / Call AI ingestion.
  - Add New Task webhook.
  - Update Client Program webhook.
  - Group Call Tracking.
  - Generic webhook Looms should stay limited because real setup needs company-specific IDs and tokens.

Recommended next resource pass:

1. Apply the seed migration to the target database when ready to review the full draft resource set in-app.
2. Replace draft guide copy with final RetainOS versions in small batches.
3. Re-record Looms only after the relevant RetainOS UI is stable.
4. Add a database-backed resource category/tag field when editorial categorization needs to be exact instead of inferred.

---

## Section: Setup & Onboarding

---

### 🤝 How to Invite a Team Member

Category: Setup & Onboarding

Audience: Admin

Current Glide location or URL:

Related media or Loom URL: https://www.loom.com/share/3e34b3bb5ce04afebb6a84e8526667a2

Existing Glide copy:

```text
- Go to the Admin tab (only admins can add team members)
- Click "Add" close to Team
- Add their Name, Email, Role, and Photo (remember that Director/Admin will have access to every CSM data)
- Click Submit
```

Operational purpose: Enable Admins to add new team members to RetainOS with the correct role and permissions.

Keep / rewrite / archive: Rewrite

RetainOS equivalent, if known: Admin > Team Management

Notes for RetainOS: Confirm that the Admin tab and "Add" button labeling matches RetainOS UI. Update copy to reflect RetainOS role names if they differ from Glide. Re-record Loom once UI is finalized.

---

### 🛠️ How to Customize Milestones and Offers

Category: Setup & Onboarding

Audience: Admin

Current Glide location or URL:

Related media or Loom URL: https://www.loom.com/share/5b5151c6a03a429197099887774c06ee

Existing Glide copy:

```text
- Click on More > Admin
- Scroll Down to '+ New Offer'
- Add Your Milestones
- Use The 'Order' Feature To Structure Your Offer
```

Operational purpose: Allow Admins to configure offer structure and milestone sequence inside RetainOS.

Keep / rewrite / archive: Rewrite

RetainOS equivalent, if known: Admin > Offers & Milestones

Notes for RetainOS: ⚠️ Codex Note — confirm navigation path in RetainOS (More > Admin or direct Admin tab?). Confirm whether "Order" feature for milestone sequencing exists in RetainOS and what it's called. Re-record once confirmed.

---

### 🥷 Tools for Admins Only

Category: Setup & Onboarding

Audience: Admin, Director

Current Glide location or URL:

Related media or Loom URL: https://www.loom.com/share/a769893cb5474e2c8fb2fed7c5edc850

Existing Glide copy:

```text
Some tools will only be available for Admins, and it's by design.

Clients Tab:
- Admins can see every single client that the company has or has had before.
- This includes clients that might still be assigned to Admins/Directors in case it's applicable.
- If performing actions related to the team, you can select which CSM you want to filter for, or you can see them all.
- If performing clients for an Admin/Director from an account management standpoint, you can filter for clients assigned to you and perform regular support actions and tracking like a CSM/AM would do.

Cohorts Tab:
- Only visible to Admin/Director.
- Used for program analysis and CSM analysis.
- Recommended every 90 days (quarterly reviews) and a deep dive every end of year.
- Program analysis goal: find what is working well and not so well for the department for any client that has started within a period (cohorts). Typically a 90-day deep dive and monthly cohort breakdown.
- CSM analysis goal: ensure every CSM is performing at KPI and define optimizations for the next quarter.

CSM Tab:
- Only visible to Admin/Director.
- Used for client success department analysis and CSM analysis.
- Recommended every 30 days (monthly reviews).
- Client success analysis goal: find what is working well and not so well for the department for any active client during that period.
- CSM analysis goal: ensure every CSM is performing at KPI and define optimizations for the month ahead, including any potential PIPs (Performance Improvement Plan).

Admin Tab:
- Only visible to Admin/Director.
- Used to add/remove team members and change offer names, milestones, and archive info.

Call AI Tab:
- Where you can find logs of all Call AI analyses listed by date and call sentiment.
```

Operational purpose: Orient Admins and Directors to the full suite of admin-only tools and their intended use cadence in RetainOS.

Keep / rewrite / archive: Rewrite

RetainOS equivalent, if known: Admin tab, Cohorts tab, CSM tab, Call AI tab

Notes for RetainOS: ⚠️ Codex Note — confirm all tab names match RetainOS exactly (Clients, Cohorts, CSM, Admin, Call AI). If any tab was renamed or restructured in RetainOS, update copy accordingly before re-recording. This is a high-priority Loom as it orients new Admins to the full platform.

---

### 📂 Upload Your Existing Clients with a CSV File

Category: Setup & Onboarding

Audience: Admin

Current Glide location or URL:

Related media or Loom URL: N/A

Existing Glide copy:

```text
TBD — matches in RetainOS to be confirmed.
```

Operational purpose: Allow Admins to bulk-import existing client rosters into RetainOS via CSV upload.

Keep / rewrite / archive: Rewrite

RetainOS equivalent, if known: Admin > Import Clients (to be confirmed)

Notes for RetainOS: ⚠️ Codex Note — this resource was TBD in Glide. Confirm whether CSV import is built in RetainOS and where it lives in the UI. Define required CSV column structure and any field mapping logic. This resource needs to be built from scratch once the feature is confirmed. Record Loom after.

---

### 🆕 Assigning New Clients to a CSM

Category: Setup & Onboarding

Audience: Admin

Current Glide location or URL:

Related media or Loom URL: https://www.loom.com/share/fa157d2b76e2448fbaa5c65bfa87e59e

Existing Glide copy:

```text
Option 1 (manual):
- When you create a new client, assign them to the right CSM and let the CSM know.

Option 2 (automatic via Zapier):
- The system Admin gets a notification that a new client was added in the client view.
- Click the notification, go to the client, click Edit on the top right, and assign the right CSM.
- When the assigned CSM logs in, a popup will show that a new client was assigned to them.
```

Operational purpose: Guide Admins through both manual and automated client assignment workflows in RetainOS.

Keep / rewrite / archive: Rewrite

RetainOS equivalent, if known: Clients > Client Detail > Edit > Assign CSM

Notes for RetainOS: ⚠️ Codex Note — confirm that the notification system and CSM assignment popup exist in RetainOS. Confirm "Edit" button placement on the client detail screen. Re-record Loom once confirmed.

---

### 🤖 Full Walkthrough and Zapier Template

Category: Setup & Onboarding

Audience: Admin

Current Glide location or URL:

Related media or Loom URL: https://www.loom.com/share/b6beca686f9c4e63bda0240d0177a681

Existing Glide copy:

```text
Template for Zap Import: https://zapier.com/shared/50a9692cbedcf88c9ca342d2f9666b36b60a1bd5
Webhook configuration details: https://clientsuccesstracker.ai/dl/webhook
```

Operational purpose: Walk Admins through the full Zapier integration setup for automating client additions into RetainOS.

Keep / rewrite / archive: Rewrite

RetainOS equivalent, if known: Automations > Zapier Integration

Notes for RetainOS: ⚠️ Codex Note — the webhook URL (clientsuccesstracker.ai/dl/webhook) must be updated to the RetainOS equivalent. Confirm whether the Zapier template link is reusable or needs to be rebuilt for RetainOS. Update all URLs before re-recording Loom.

---

### 📑 RetainOS Terminology Guide

Category: Setup & Onboarding

Audience: All

Current Glide location or URL:

Related media or Loom URL: https://www.loom.com/share/36338f0bac104be993080094901adb30

Existing Glide copy:

```text
Some of the verbiage and language used in RetainOS might be new to you. Below you'll find all definitions.

Clients Tab:
- Assigned CSM: who is responsible for managing the client
- Front End Program: typically the first purchase your client makes when working with you
- Backend Program: typically the second purchase your client makes when working with you
- Milestone: big keystone moments in your client journey that help get them closer to the initial expectation
- Offer: potential products available in your offer suite
- Buy-in: how committed/engaged your client is (typically based on communication and trust). Refer to your internal Client Health Scores Doc.
- Progress: how on track with milestones or results your client is (typically based on pre-defined milestones for the offer the client is in). Refer to your internal Journey Touchpoint Mapping Doc.
- Success: typically the client's expectations for the offer they are in

Cohorts Tab:
- Built for quarterly reviews to analyze cohorts and cross-reference client results with marketing and sales initiatives. Cohorts = timeline under analysis.

Admin:
- Milestone: big keystone moments in your client journey that help get them closer to the initial expectation
- Offer: potential products available in your offer suite
```

Operational purpose: Define all RetainOS-specific terminology for new users across all roles.

Keep / rewrite / archive: Rewrite

RetainOS equivalent, if known: Resources > Terminology Guide

Notes for RetainOS: All references to "Client Success Tracker" or "CST" have been replaced with "RetainOS." Confirm all term definitions are still accurate in RetainOS. If any new terms were introduced (e.g., new field names), add them here. Re-record Loom after confirming.

---

### 📓 Custom Fields

Category: Setup & Onboarding

Audience: Admin

Current Glide location or URL:

Related media or Loom URL: https://www.loom.com/share/adb793b20c3442df9ae2fab5e7867484

Existing Glide copy:

```text
To make RetainOS more customizable to each business and offer, you can add up to 5 custom columns to the tracker to keep visibility on the specific metrics most relevant to your team.
```

Operational purpose: Show Admins how to add and configure custom fields in RetainOS for offer-specific tracking.

Keep / rewrite / archive: Keep

RetainOS equivalent, if known: Admin > Custom Fields

Notes for RetainOS: ⚠️ Codex Note — confirm whether the 5 custom field limit still applies in RetainOS or if it has changed. Confirm where custom fields are configured in the RetainOS UI. Re-record Loom once confirmed.

---

### ➕ Adding Clients Manually to RetainOS

Category: Setup & Onboarding

Audience: Admin, CSM

Current Glide location or URL:

Related media or Loom URL: https://www.loom.com/share/c752acdefa1247609b57eee6c71163d2

Existing Glide copy:

```text
This walkthrough shows you how to add clients to RetainOS manually.
```

Operational purpose: Guide users through the manual client creation flow in RetainOS.

Keep / rewrite / archive: Rewrite

RetainOS equivalent, if known: Clients > Add New Client

Notes for RetainOS: ⚠️ Codex Note — confirm manual client creation flow and required fields in RetainOS. Re-record Loom with updated UI walkthrough once finalized.

---

## Section: Working with Clients

> **Section Note:** There are approximately 40 resources in this section that can only be re-recorded after RetainOS is fully built. All resources in this section are flagged as pending UI finalization.

---

### 💻 How to Use the Client Details Screen

Category: Working with Clients

Audience: CSM, Admin

Current Glide location or URL:

Related media or Loom URL: https://www.loom.com/share/4472e6bd1c1146ee827df0957f0b292c

Existing Glide copy:

```text
- Go to the Clients tab
- Click the 3 dots close to refresh to change views (list or details)
- You can see at a glance: Milestone the client is trying to accomplish, Offer they're in, Progress, Buy-in, Assigned CSM, client age in weeks, and when the client was last engaged
```

Operational purpose: Help CSMs and Admins navigate the client details screen efficiently in RetainOS.

Keep / rewrite / archive: Rewrite

RetainOS equivalent, if known: Clients > Client Detail

Notes for RetainOS: ⚠️ Codex Note — confirm whether the view toggle (list vs. details via 3-dot menu) exists in RetainOS or if navigation changed. Confirm all visible fields at a glance match RetainOS field names. Re-record after UI is finalized.

---

## Section: Using the Dashboard

---

### 📊 CSM / Performance View

Category: Using the Dashboard

Audience: Admin, CSM

Current Glide location or URL:

Related media or Loom URL: https://www.loom.com/share/eabc567f69674a53a4d95c9d2d3bbe2c

Existing Glide copy:

```text
The goal of this tab is to help you track client success as a whole and individually for each CSM/Coach/AM. Filtering is Admin-only, but every CSM can view their own performance by clicking this tab.

- Assigned CSM: who is responsible for managing the client and who you want to filter results for
- Date Range: the month you want to analyze (applies to WHEN the KPIs happened, not when the client started — that is Cohort analysis)
- Active Clients: how many active clients for that month
- Front-end Clients: how many clients on their first purchase were active for the selected filters
- Backend Clients: how many clients on their second purchase were active for the selected filters
- Upgraded Clients: how many clients were upgraded (front-end to backend) for the selected filters
- Capacity: how much capacity is being used for the selected filters
- Capacity in 30 Days: how much capacity will be released based on contract end dates over the next 30 days
- Reviews: how many clients left a review for the selected filters
- Testimonials: how many clients left a testimonial for the selected filters
- Referrals: how many clients provided a referral for the selected filters
- Offboarded Clients: how many clients were offboarded for the selected filters
```

Operational purpose: Give CSMs and Admins a full performance snapshot across all tracked KPIs in RetainOS.

Keep / rewrite / archive: Rewrite

RetainOS equivalent, if known: Dashboard > Performance View

Notes for RetainOS: ⚠️ Codex Note — confirm all KPI field names match RetainOS exactly (especially Capacity, Capacity in 30 Days, Upgraded Clients). Confirm whether CSMs can self-view without filtering. Re-record Loom after UI is confirmed.

---

### 🔍 How to Filter the Results

Category: Using the Dashboard

Audience: Admin

Current Glide location or URL:

Related media or Loom URL: https://www.loom.com/share/3da3a72e232d40efa561a29e196b8812

Existing Glide copy:

```text
The goal here is to understand how to maximize the Performance tab. We recommend using it in three ways:

- Every month: go through the Performance tab, select the right CSM and date range, and run your performance review.
- Performance reviews: if under KPI, provide support and potentially put the CSM on a PIP (Performance Improvement Plan), then use this dashboard again in 30 days to review improvements.
- Quarterly goals: use a wider date range to evaluate past 90-day performance and plan for growth.
```

Operational purpose: Teach Admins how to apply filters effectively for monthly reviews, PIPs, and quarterly analysis.

Keep / rewrite / archive: Keep

RetainOS equivalent, if known: Dashboard > Performance View > Filters

Notes for RetainOS: Content is largely evergreen. Confirm filter UI in RetainOS matches Glide (CSM dropdown, date range picker). Re-record with updated UI.

---

### 📊 How to Analyze Performance

Category: Using the Dashboard

Audience: Admin

Current Glide location or URL:

Related media or Loom URL: Not working — needs re-recording

Existing Glide copy:

```text
This is closely related to filtering results (see previous resource).

We recommend focusing on two core functions of this tab:
- Individually: review team members' performance, capacity, and projections.
- Collectively: get a full breakdown of how the Client Success department is performing as a whole.
```

Operational purpose: Guide Admins through individual and collective performance analysis inside RetainOS.

Keep / rewrite / archive: Keep

RetainOS equivalent, if known: Dashboard > Performance View

Notes for RetainOS: Original Loom is broken — this must be re-recorded from scratch. Content is sound. Record a clean walkthrough covering both the individual CSM view and the collective department view.

---

### 🔎 Cohort Analysis

Category: Using the Dashboard

Audience: Admin, Director

Current Glide location or URL:

Related media or Loom URL: https://www.loom.com/share/efc73fc6e6124583b5c4cb7308341514

Existing Glide copy:

```text
The goal of the Cohorts tab is to help track client success across the company, organized by when clients started. This tab is Admin-only — CSMs cannot see it.

While similar to the Performance tab, cohort analysis gives a broader company-wide breakdown. Recommended cadence: no less than every 90 days, at least every 6 months.

- Client Started: analyze cohorts based on when clients were added to the roster
- Assigned CSM: view collectively or filter by CSM
- View Clients: opens a window showing all clients filtered under the selected cohort

Key distinction from the Performance tab: KPIs in cohort analysis are tied to clients who STARTED in the selected period, regardless of when those KPIs actually occurred. For example — a client who started in January and sent a referral in June will still appear in the January cohort's referral count.
```

Operational purpose: Enable Admins to run quarterly and biannual cohort analysis on client outcomes tied to start dates in RetainOS.

Keep / rewrite / archive: Rewrite

RetainOS equivalent, if known: Dashboard > Cohorts

Notes for RetainOS: ⚠️ Codex Note — confirm the Cohorts tab exists in RetainOS and that the "Client Started" vs. "KPI date" distinction is preserved in the UI. Confirm "View Clients" drill-down is functional. Re-record Loom once confirmed.

---

### ⌚ Tracking TTV (Time to Value)

Category: Using the Dashboard

Audience: Admin, CSM

Current Glide location or URL:

Related media or Loom URL: https://www.loom.com/share/7e17541a256f454a9a30133b4f7b529b

Existing Glide copy:

```text
By selecting a Value Activation Point for your offer, you can identify a moment in the client journey where the client feels a strong sense of accomplishment and value. RetainOS tracks this in the dashboard to show how long it takes clients to reach this point.
```

Operational purpose: Help Admins and CSMs understand and track Time to Value (TTV) as a key success metric in RetainOS.

Keep / rewrite / archive: Keep

RetainOS equivalent, if known: Dashboard > TTV Tracking

Notes for RetainOS: ⚠️ Codex Note — confirm that the Value Activation Point field and TTV metric exist in RetainOS dashboard. Confirm where this is configured (Admin vs. per-offer). Re-record Loom once confirmed.

---

### 📈 Milestone Progress Breakdown by Offer

Category: Using the Dashboard

Audience: Admin, CSM

Current Glide location or URL:

Related media or Loom URL: https://www.loom.com/share/b77254f612204657bbb51ab9c9f1ada3

Existing Glide copy:

```text
RetainOS includes a dashboard widget that gives a visual breakdown of milestone completion across client journeys, organized by each client's specific offer. This allows you to instantly see how clients are progressing through their milestones, identify bottlenecks, and prioritize support where it's needed most.
```

Operational purpose: Give teams a visual tool for spotting milestone bottlenecks and prioritizing coaching interventions in RetainOS.

Keep / rewrite / archive: Keep

RetainOS equivalent, if known: Dashboard > Milestone Progress Widget

Notes for RetainOS: ⚠️ Codex Note — confirm this widget exists in RetainOS and that it is filterable by offer. Re-record Loom once UI is confirmed.

---

### 📉 Understanding Retention and Churn in RetainOS

Category: Using the Dashboard

Audience: Admin, CSM

Current Glide location or URL:

Related media or Loom URL: https://www.loom.com/share/4e6b212f7fe84ca5b9aae54fd2aa6c72

Existing Glide copy:

```text
This training explains how Retention % and Churn % are calculated in the RetainOS Dashboard.
```

Operational purpose: Ensure all users understand how retention and churn metrics are defined and calculated in RetainOS.

Keep / rewrite / archive: Rewrite

RetainOS equivalent, if known: Dashboard > Retention & Churn Metrics

Notes for RetainOS: ⚠️ Codex Note — confirm the formulas for Retention % and Churn % are unchanged in RetainOS vs. Glide CST. If calculation logic changed, update the resource copy before re-recording. This is a foundational metrics resource — accuracy is critical.

---

## Section: Automations

> **Section Note:** All webhook resources have been structured or started in RetainOS. They require unique tokens and variable fields shown differently per company. These resources should not be re-recorded as generic walkthroughs — each company will receive individualized setup guidance. The exception is Tracking Group Calls, which requires a fresh Loom walkthrough.

---

### ⚡ Webhook: Adding New Clients

Category: Automations

Audience: Admin, Developer

Current Glide location or URL:

Related media or Loom URL:

Existing Glide copy: N/A — structure defined in RetainOS

Operational purpose: Automate new client creation in RetainOS via inbound webhook (e.g., from Zapier or a CRM).

Keep / rewrite / archive: Rewrite

RetainOS equivalent, if known: Automations > Webhooks > Add New Client

Notes for RetainOS: Webhook structure exists in RetainOS. Each company receives unique tokens and endpoint variables. Do not record a generic Loom — build company-specific setup docs per onboarding.

---

### ⚡ Webhook: Updating Client Course Completion

Category: Automations

Audience: Admin, Developer

Current Glide location or URL:

Related media or Loom URL:

Existing Glide copy: N/A — structure defined in RetainOS

Operational purpose: Automatically update client milestone or progress status in RetainOS when course modules are completed in an external platform.

Keep / rewrite / archive: Rewrite

RetainOS equivalent, if known: Automations > Webhooks > Update Course Completion

Notes for RetainOS: Company-specific tokens required. No generic Loom — handle per onboarding.

---

### ⚡ Webhook: Call AI Integration

Category: Automations

Audience: Admin, Developer

Current Glide location or URL:

Related media or Loom URL:

Existing Glide copy: N/A — structure defined in RetainOS

Operational purpose: Push Call AI analysis results into RetainOS automatically after each coaching or renewal call.

Keep / rewrite / archive: Rewrite

RetainOS equivalent, if known: Automations > Webhooks > Call AI Integration

Notes for RetainOS: Company-specific tokens required. No generic Loom — handle per onboarding.

---

### ⚡ Webhook: Adding AI Summary to Notes / Next Steps

Category: Automations

Audience: Admin, Developer

Current Glide location or URL:

Related media or Loom URL:

Existing Glide copy: N/A — structure defined in RetainOS

Operational purpose: Automatically populate the Notes and Next Steps fields in RetainOS with AI-generated call summaries post-call.

Keep / rewrite / archive: Rewrite

RetainOS equivalent, if known: Automations > Webhooks > AI Summary > Notes & Next Steps

Notes for RetainOS: Company-specific tokens required. No generic Loom — handle per onboarding.

---

### ⚡ Webhook: Updating a Client's Profile

Category: Automations

Audience: Admin, Developer

Current Glide location or URL:

Related media or Loom URL:

Existing Glide copy: N/A — structure defined in RetainOS

Operational purpose: Automatically sync client profile updates (name, offer, program, etc.) from external systems into RetainOS.

Keep / rewrite / archive: Rewrite

RetainOS equivalent, if known: Automations > Webhooks > Update Client Profile

Notes for RetainOS: Company-specific tokens required. No generic Loom — handle per onboarding.

---

### ⚡ Webhook: Adding a New Task

Category: Automations

Audience: Admin, Developer

Current Glide location or URL:

Related media or Loom URL:

Existing Glide copy: N/A — structure defined in RetainOS

Operational purpose: Automatically create tasks inside RetainOS triggered by external events (e.g., call completed, milestone reached).

Keep / rewrite / archive: Rewrite

RetainOS equivalent, if known: Automations > Webhooks > Add New Task

Notes for RetainOS: Company-specific tokens required. No generic Loom — handle per onboarding.

---

### ⚡ Webhook: Updating a Client's Program

Category: Automations

Audience: Admin, Developer

Current Glide location or URL:

Related media or Loom URL:

Existing Glide copy: N/A — structure defined in RetainOS

Operational purpose: Automatically update a client's program assignment in RetainOS when an upgrade or change occurs in an external system.

Keep / rewrite / archive: Rewrite

RetainOS equivalent, if known: Automations > Webhooks > Update Client Program

Notes for RetainOS: Company-specific tokens required. No generic Loom — handle per onboarding.

---

### 🎥 Tracking Group Calls in RetainOS

Category: Automations

Audience: Admin, CSM

Current Glide location or URL:

Related media or Loom URL: https://www.loom.com/share/7a7349665f834570859d8ba870aee853

Existing Glide copy:

```text
Watch this Loom walkthrough to see how to automate group call tracking inside RetainOS.
```

Operational purpose: Show teams how to set up automated group call tracking so attendance and notes are logged in RetainOS without manual entry.

Keep / rewrite / archive: Rewrite

RetainOS equivalent, if known: Automations > Group Call Tracking

Notes for RetainOS: This is the only Automation resource that requires a fresh Loom recording (unlike the webhook resources which are company-specific). Re-record once the group call tracking automation is finalized in RetainOS.

---
