# RetainOS Architecture Map

This is the human-readable companion to the local Graphify output. Keep it small and useful. `graphify-out/` is generated locally and ignored by git; this file is the committed summary that should survive sessions.

## How To Use This Map

- Use this file and `MEMORY.md` to orient quickly at the start of a session.
- Use Graphify to find likely impacted areas before a medium or large change.
- Use `rg` and direct file reads to confirm exact implementation details before editing.
- Update this file after major milestones, not after every small fix.

## Current Graphify Baseline

- Last full no-DSN graph run: 2026-06-10.
- Built from commit: `75fc3b51`.
- Corpus: app code, Supabase functions/migrations, project docs, memory, roadmap, and Hi-Fi handoff docs/images.
- Output is local-only in `graphify-out/`.
- Summary: 962 nodes, 1,524 edges, 53 communities.
- Supabase Postgres DSN was intentionally skipped for this baseline.

## Main Communities To Remember

- **Authentication and Account Context:** session state, SuperAdmin view-as, capability gates, company scope.
- **Navigation and Layout:** app shell, sidebar, route-level visibility, coming-soon surfaces.
- **Client Calendar and Filters:** clients roster, persisted filters, list/card/calendar views, reminders.
- **Client Detail Components:** client profile tabs, contracts, outcomes, pathways, tasks, history.
- **Daily Pulse and CSM Tools:** operational signals for today/week/month and CSM-scoped views.
- **Dashboard and KPI Charts:** overview/charts/CSM data, filters, drill-through modals.
- **Canonical KPI Data:** dashboard RPC and performance-sensitive reporting paths.
- **Program Status and Reporting:** status display, status workflows, CSM reporting logic.
- **Company Customization and Churn:** outcomes, churn reasons, company settings, custom fields.
- **Company Workspace Settings:** client defaults, profile-upkeep window, calendar/view defaults.
- **Contract Management API:** contract create/edit/archive, renewal and retention flows.
- **Outcome and Health API:** Success, Progress, Buy-in writes and history.
- **Glide Data Integration:** read-only CST mirror tables and fallback behavior.
- **Company Pilot Reconciliation:** migration audit, app-owned vs mirror matching, backfill trust gates.
- **Glide to Supabase Sync:** sync pipeline and backup table refresh.
- **Notification Preferences:** notification settings and future notification routing.
- **Webhook and Member Resolution:** Zapier/client-create and future external webhook resolution.
- **AI Call Analysis:** Fathom/Otter/Grain resource planning and future Call AI integration.

## Critical Flows

### Login And Company Scope

`Login` -> `prepare-login` -> `accountContext` -> route/capability gates -> selected/effective company.

Use Graphify:

```bash
graphify explain "Authentication and Account Context"
graphify affected "prepare-login Edge Function"
```

### Client Roster And Calendar

`Clients.tsx` reads app-owned `clients` for pilot/migrated companies and CST mirror data for mirror-only companies. It owns client filters, view persistence, calendar mode, and reminder surfaces.

Use Graphify:

```bash
graphify explain "Client Calendar and Filters"
graphify affected "Clients()"
```

### Client Detail Writes

Client writes are Edge Function controlled. Current important functions include:

- `manage-client-create`
- `manage-client-profile`
- `manage-client-status`
- `manage-client-quick-update`
- `manage-client-outcomes`
- `manage-client-contract`
- `manage-client-milestone`

Use Graphify:

```bash
graphify affected "manage-client-quick-update Edge Function"
graphify affected "ClientDetail()"
```

### Company Setup

Admin Hub and SaaS Client Detail manage company team, customization, settings, offers, and milestones. Pilot/migrated companies use app-owned tables; mirror-only companies remain read-only.

Use Graphify:

```bash
graphify explain "Company Customization and Churn"
graphify explain "Company Workspace Settings"
graphify affected "manage-company-customization"
```

### Dashboard And Reporting

Dashboard uses a mixed strategy:

- app-owned / filtered / multi-program paths prefer canonical logic where needed.
- large mirror-only walkthrough views intentionally use a lighter split KPI path until optimized canonical reporting views are ready.

Use Graphify:

```bash
graphify explain "Dashboard and KPI Charts"
graphify explain "Canonical KPI Data"
graphify affected "dashboard_kpi_counts_canonical"
```

### Migration And Reconciliation

Migration should be company-by-company. Reconciliation is the gate before a company moves from mirror-only to pilot/migrated.

Use Graphify:

```bash
graphify explain "Company Pilot Reconciliation"
graphify explain "Glide Data Integration"
graphify explain "Glide to Supabase Sync"
```

## Graphify Workflow

Start a session with one or two anchored checks when the work is non-trivial:

```bash
graphify explain "Project Memory"
graphify explain "RetainOS Roadmap"
```

Before implementation:

```bash
graphify affected "<exact node or function>"
graphify path "<source node>" "<target node>"
```

After major milestones, regenerate the graph and update this file only if the architecture meaningfully changed.

## Subagent Brief Pattern

When spawning subagents, include:

- the relevant roadmap item;
- the relevant `MEMORY.md` section;
- one or two Graphify communities from this file;
- explicit files/functions from `graphify affected` or `graphify explain`;
- clear boundaries for what not to touch.

Example:

> Work on Notification Preferences V1. Read `MEMORY.md` notification notes, `ROADMAP.md` medium/high priority notification items, and Graphify communities `Notification Preferences`, `Daily Pulse and CSM Tools`, and `Date Formatting and Notifications`. Do not change client write Edge Functions unless needed and approved.
