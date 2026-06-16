# Handoff: RetainOS Hi-Fi Prototype → Production

## Overview
This bundle is the **approved high-fidelity prototype** for RetainOS — a client-retention / customer-success platform for SaaS companies. It covers the full CSM workflow: Dashboard, Clients (List/Cards/Calendar), Client Detail, Tasks, CSM Reports, SaaS Clients + Detail, and Login.

Your existing app (`RetainOSapp/cst_supabase_backup`, `src/`) is the **low-fi, functional** React + Tailwind + Supabase implementation. The job here is to bring that app up to this hi-fi visual standard — **not** to ship these HTML files. Recreate these designs inside your existing React/Tailwind environment, reusing your components, hooks, and Supabase calls.

## About the Design Files
The files in this bundle are **design references written in plain HTML/CSS/JS** (a vanilla prototype with a tiny hash-router). They show the intended look, layout, and interactions. They are **not** production code to copy — port them into your React + Tailwind codebase using its established patterns (`react-router-dom`, `accountContext`, `supabase.ts`, the `dashboard/kpis/*` components, `clientDisplay.tsx`, etc.).

## Fidelity
**High-fidelity.** Final colors, typography, spacing, badges, and interactions. Recreate pixel-faithfully using your Tailwind setup. Where the prototype invented sample data (client names, dates), use real data from your tables.

## Key Direction Decision (read first)
- **Layout changed from top-nav → left sidebar.** Your live app (`Header.tsx`) uses a horizontal top nav with an **indigo** accent (`bg-indigo-100 text-indigo-700`). This prototype deliberately moves to the **agency-approved navy left sidebar with a blue accent**. Replace the `<Header>` top-nav with a left sidebar; keep the capability-gated nav logic (`capabilities.canAccess*`).
- **Code = source of truth for data/logic/labels. This prototype = source of truth for visuals.**
- **Indigo is retired.** Everywhere the codebase uses `indigo-*`, swap to the navy/blue tokens below (primary actions = navy `#162B3E`; accents/links/active = blue `#59ABF0`).

## Screen → Component Mapping
| Prototype screen (in `screens.js` / files) | Your production file | Notes |
|---|---|---|
| App shell (sidebar + topbar) | `src/components/Header.tsx` → new `Sidebar` | Nav order: Dashboard · Clients · CSM Reports · Tasks · SaaS Clients, then a temporary **Dev Tools** group (Tables · Sync Log). |
| `dashboard()` | `src/pages/Dashboard.tsx` + `src/components/dashboard/kpis/*` | KPI tiles map to existing Kpi components; charts are labeled placeholders — wire to your chart lib. |
| `clients()` + list/cards/calendar | `src/pages/Clients.tsx` | List/Cards/Calendar view toggle; filters (Company, Client, Status, CSM, Offer, Last contact). |
| `clientDetail()` (7 tabs) | `src/pages/ClientDetail.tsx` | Tabs: Client Details · Contract · Program · Outcomes · Pathways & Milestones · Tasks · History. |
| Quick Update modal | edge fn `manage-client-quick-update` | Payload: `buyInStatus`, `progressStatus`, `successStatus`, `lastContactAt`, `nextContactAt`, `nextSteps`, `notes`. |
| `tasks()` | `src/pages/Tasks.tsx` | Board/List toggle; `client_tasks` model. |
| `reports()` | `src/pages/CsmReports.tsx` | Profile-update compliance: Field Upkeep score, CSM Summary, Client Profile Updates. |
| `saas()` + `saasDetail()` | `src/pages/SaasClients.tsx`, `src/pages/SaasClientDetail.tsx` | Card grid + read-only Add modal; detail = customization flags + team. |
| `Login.html` | `src/pages/Login.tsx` | Two-step OTP (email → code), split layout, disabled Google. |
| Tables / Sync Log | `src/pages/Tables.tsx`, `TableDetail.tsx`, `SyncLog.tsx` | **Stubbed** in prototype (Dev Tools). Not yet designed. |

## Design Tokens
All tokens live in `tokens.css` as CSS variables; mirror them into your `tailwind.config` theme. Exact values:

**Brand / primary (navy)** — `--navy-900 #0E1B29`, `--navy-800 #162B3E` (primary brand / sidebar / primary buttons), `--navy-700 #1E3A52`, `--navy-600 #2B4D6A`, `--navy-500 #3D6485`
**Secondary (blue)** — `--blue-700 #2B79C4`, `--blue-600 #3B8FD9` (accent buttons), `--blue-500 #59ABF0` (links / active / focus), `--blue-100 #D6EAFB`, `--blue-50 #EAF4FE`
**Neutrals** — 900 `#14181D`, 800 `#232932`, 700 `#3C4450`, 600 `#586273`, 500 `#6B7686`, 400 `#98A2B3`, 300 `#CBD2DC`, 200 `#E4E9F0`, 100 `#F1F4F9`, 50 `#F7F9FC`
**Semantic** — success `#34B389` (exact Figma "pilot data" green; 600 `#2A9272`, 50 `#E7F6F0`); warning `#E0922F` (600 `#C77C1E`, 50 `#FCF3E6`); danger `#D6453D` (600 `#C13A33`, 50 `#FCEBEA`)
**Surfaces/text** — app bg `#F7F9FC`, surface `#FFFFFF`, border `#E4E9F0`, border-strong `#CBD2DC`, text-primary = navy-800, text-secondary `#586273`, text-muted `#98A2B3`, text-on-dark `#E8EEF5`
**Type** — Montserrat (400/500/600/700). Scale: H1 32 · H2 28 · H3 24 · H4 20 · H5 18 · H6 16; body XL 18 · L 16 · M 14 · S 13 · XS 12. Slides/headings use `letter-spacing: -0.01em`.
**Radius** — sm 6 · md 8 · lg 12 · xl 16 · pill 999. **Spacing** — 4pt base (4/8/12/16/20/24/32/40/48).
**Shadows** — xs `0 1px 2px rgba(16,27,41,.06)`, sm `0 1px 3px rgba(16,27,41,.08), 0 1px 2px rgba(16,27,41,.04)`, md `0 4px 12px rgba(16,27,41,.08)`, lg `0 12px 32px rgba(16,27,41,.12)`.

## Enums & Status Semantics (must match DB)
- **`program_status_value`**: `front-end` (green/emerald pill) · `back-end` (blue pill) · `paused` (amber) · `suspended` (amber) · `off-boarded` (slate/gray). Mirrors `clientDisplay.tsx` → `getProgramStatusDisplay`.
- **`outcomes_progress_value` / `outcomes_buy_in_value`** (`HEALTH_VALUES`): `green` · `yellow` (rendered amber) · `red`.
- **`outcomes_success_value`** (`SUCCESS_VALUES`): `yes` · `no`.
- **Roles**: `director` · `support` · `csm` · `viewer` (+ `super_admin`). CSMs can quick-update only assigned clients.
- **`client_tasks.status_value`**: `todo` · `in_progress` · `done`; plus `priority`, `task_due_date`, `assigned_to_id`.
- **Dashboard KPIs** come from RPC `dashboard_kpi_counts_canonical` (active / front-end / back-end / paused / suspended / off-boarded / churned, `churn_percentage`, `retained_clients`, `renewing_clients`, `retention_percentage`).

## Interactions & Behavior
- **Routing**: hash-style in prototype; use `react-router-dom` (routes already exist in `App.tsx`).
- **Clients view toggle**: List (table) / Cards (grid) / Calendar (month grid w/ Next·Last·Task·Renewal·Onboarded legend); persist choice.
- **Client/SaaS rows** are clickable → detail; nav highlight follows parent section.
- **Quick Update modal**: segmented Green/Yellow/Red for buy-in & progress, Yes/No for success, date pickers, next steps, notes. Writes a `client_history_events` row + updates `clients.outcomes_*`.
- **Add SaaS Client modal**: read-only preview (creation locked until write mode), amber note, disabled Submit — matches `SaasClients.tsx`.
- **CSM Reports**: Field Upkeep progress bars color by score (≥70 green, 50–69 amber, <50 red); CSM Summary + Client Profile Updates tables; date-range presets.
- **Login**: email → OTP code step, "Use a different email", disabled Google.

## Files (in this bundle)
- `RetainOS HiFi.html` — app shell + global CSS; loads `tokens.css` and `screens.js`.
- `screens.js` — all screen builders + the tiny router (read this to see every screen's exact markup/data).
- `tokens.css` — the full design-token layer (maps 1:1 to a Tailwind theme).
- `Login.html` — standalone login page.

## Fastest local setup with Claude Code
1. Unzip this folder into your repo, e.g. `design/retainos-hifi/`.
2. Open the repo in Claude Code and prompt, roughly:
   > "Use the prototype in `design/retainos-hifi/` as the approved hi-fi reference. Replace the top-nav `Header` with the navy left sidebar shown there, retire all `indigo-*` classes for the navy/blue tokens in its `tokens.css`, and bring `src/pages/*` up to this visual standard one screen at a time — starting with the app shell, then Clients, then Client Detail. Keep all existing Supabase logic, capability gating, and data shapes."
3. To preview the reference itself, just open `RetainOS HiFi.html` in a browser (no build step — it's static).
