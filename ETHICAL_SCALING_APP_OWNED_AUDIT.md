# Ethical Scaling App-Owned Dependency Audit

Date: 2026-06-10

Purpose: identify remaining Glide mirror dependencies that affect the Ethical Scaling pilot and classify what should move to app-owned Supabase data before broader company migrations. This is a planning/audit document only; no implementation is included here.

## Summary

Ethical Scaling is already mostly app-owned for daily client operations:

- Login resolves app-owned `company_members` before mirrored `backup_company_team`.
- Clients list/detail prefer app-owned `clients`.
- Team/CSM dropdowns prefer app-owned `company_members`.
- Offers and milestones prefer app-owned `company_offers` and `company_offer_milestones`.
- Quick Update, client profile edits, outcomes, status changes, contracts, client milestones, tasks, and history write to app-owned tables.
- Company settings/customization v1 exists for outcome definitions, churn reasons, and workspace defaults.

The remaining mirror dependencies fall into four categories:

1. Company shell and SuperAdmin SaaS browsing still rely on `backup_companies`.
2. Several dropdown/reference values still rely on `backup_choices`.
3. Historical data and reporting still read mirrored contracts, milestones, tasks, and history as fallback/backfill sources.
4. Dev/sync surfaces intentionally remain mirror-specific and should not be migrated for the pilot.

## Migration-Readiness Checklist

Use this checklist before moving a company from CST mirror preview into a RetainOS pilot or fully migrated state.

### Safe App-Owned Runtime Sources

For companies with `migration_status` of `pilot` or `migrated`, these surfaces should use app-owned tables first and only keep mirror reads for explicit fallback/backfill scenarios:

- **Company shell:** `companies` is the preferred company record; `backup_companies` remains only for SuperAdmin discovery and mirror-only companies.
- **Team and assignment:** `company_members` is the preferred source for active CSM/director/support lists, assignment dropdowns, capacity, and role visibility.
- **Client roster/detail/reporting:** `clients` is the preferred source for current client state.
- **Offers and templates:** `company_offers` and `company_offer_milestones` are the preferred source for current pathway setup.
- **Client milestone progress:** `client_milestones` is the preferred source for current/future progress; mirrored historical rows require a backfill/display decision.
- **Contracts:** `client_contracts` is the preferred source for current/future contract actions; mirrored historical rows require a backfill/display decision.
- **Tasks:** `client_tasks` is the preferred source for task list, client detail tasks, client calendar task events, and Dashboard task-status charts.
- **History:** `client_history_events` is the preferred source for RetainOS-created Quick Update, status, profile, outcome, contract, and milestone events.
- **Company customization:** `company_outcome_definitions`, `company_churn_reasons`, and `company_settings` are the preferred sources for pilot/migrated companies.

### Intentional Mirror Dependencies To Keep For Now

These `backup_*` reads are still expected and should not be removed until the named prerequisite is complete:

- `backup_companies`: SuperAdmin discovery and mirror-only walkthroughs. Remove only after every active SaaS client has an app-owned `companies` row and the old Glide mirror is retired.
- `backup_choices`: program/status label and emoji reference. Remove after an app-owned canonical status definition table or static config is implemented.
- `backup_company_clients_history`: retention/status-transition confidence and legacy activity comparison. Remove from runtime only after historical activity import is approved per company.
- `backup_company_clients_contracts`: historical contract/renewal confidence. Remove from pilot runtime after contract backfill dry-run/apply is approved and duplicate display is resolved.
- `backup_company_clients_milestones`: historical milestone confidence. Remove from pilot runtime after milestone backfill dry-run/apply is approved and duplicate display is resolved.
- `backup_company_team`, `backup_company_clients`, `backup_company_offers`, `backup_company_offer_milestones`, and `backup_company_clients_tasks`: mirror-only company fallback. These should not be used for pilot/migrated companies unless an app-owned row is missing and the UI explicitly treats the result as legacy/imported.
- `src/lib/dashboardKpiSql.ts`: mirror-only performance fallback for large CST-preview walkthroughs. Replace with optimized canonical reporting views/RPCs before broad migration.
- `src/pages/Tables.tsx`, `src/pages/TableDetail.tsx`, `src/pages/SyncLog.tsx`, and `sync-glide*` functions: SuperAdmin-only dev/sync tooling. Leave until Glide is fully retired and exported.

### Per-Company Gate Before Pilot

1. Run the Glide/CST sync for the target company while users are paused from editing in Glide.
2. Run `npm run pilot:reconcile:company -- --company="Company Name"` and review missing/app-only rows, status distributions, assignments, activity, contracts, and milestone confidence.
3. Confirm active team members exist in `company_members` and archived/non-client-managing members are hidden from CSM dropdowns.
4. Confirm active clients exist in `clients`, with assigned CSM ids matching active app-owned team members.
5. Confirm active offers and milestones exist in `company_offers` / `company_offer_milestones`.
6. Dry-run historical backfill with `npm run pilot:backfill:company-activity -- --company="Company Name"` when contract/milestone history matters for reporting.
7. Decide whether to apply historical backfill. If applied, QA that Client Detail does not show confusing duplicate legacy/imported rows.
8. Move the company to `pilot` only after Jay approves the reconciliation report and QA checklist.

### Per-Company Gate Before Fully Migrated

1. Confirm RetainOS is the operational source of truth and Glide/CST editing is disabled for that company.
2. Re-run reconciliation after at least one real operating cycle in RetainOS.
3. Confirm write flows work for the company roles that will use the pilot: Quick Update, outcomes, status, profile, contracts, milestones, assignments, resources, and notifications/Daily Pulse as applicable.
4. Confirm dashboard/CSM report formulas are acceptable for that company volume.
5. Mark remaining mirror reads as either intentional archive/reference reads or blockers before setting `migration_status = migrated`.

## Implementation Note - 2026-06-08

Safe slices implemented after this audit:

- Added a shared app-owned-first loader for companies and team members.
- Updated the app shell company switcher/header to prefer `companies` for `pilot` / `migrated` companies, with `backup_companies` fallback for mirror-only companies.
- Updated the Super Admin SaaS Clients list to show app-owned companies/team members first while preserving mirror-only company discovery.
- Updated SaaS company detail loading to prefer the app-owned company shell.
- Stopped pilot/migrated company outcome dropdowns from quietly falling back to mirrored `backup_choices`; app-owned definitions are authoritative and safe defaults are used if definitions are empty.
- 2026-06-10: stopped pilot/migrated task surfaces from merging CST preview tasks where `client_tasks` already exists. `/tasks`, Client Detail > Tasks, Clients calendar task events, and Dashboard task-status charts now use `client_tasks` for app-owned companies and keep `backup_company_clients_tasks` only for mirror-only companies.

Decision still required before changing historical display behavior:

- **Contracts:** should pilot/migrated companies show mirrored historical contracts beside app-owned contracts, or only show app-owned/imported rows once backfill is approved?
- **Milestones:** should pilot/migrated companies show mirrored historical milestone rows beside app-owned milestone progress, or only show app-owned/imported rows once backfill is approved?

Current recommendation: keep historical mirror rows visible only until a per-company dry-run/backfill is approved, then switch that company to app-owned/imported historical rows only. This avoids duplicate timelines and keeps RetainOS as the operating source of truth.

## Implementation Note - 2026-06-15

Historical contract/milestone runtime pass:

- Applied `npm run pilot:backfill:company-contracts -- --company="Ethical Scaling" --include-paused-suspended --apply`.
  - Backfilled 7 current-summary contracts into `client_contracts`.
  - Follow-up dry-run now reports `totalContractsToBackfill = 0`.
- Applied `npm run pilot:backfill:company-activity -- --company="Ethical Scaling" --apply`.
  - Backfilled 32 historical client milestone rows into `client_milestones`.
  - Follow-up dry-run now reports `clientMilestonesToBackfill = 0`.
  - 2 CST mirror milestone rows were intentionally skipped because active `client_id + milestone_id` rows already existed; the script now reports these as active milestone conflicts instead of failing.
- Client Detail now skips `backup_company_clients_contracts` and `backup_company_clients_milestones` for `pilot` / `migrated` companies, while preserving mirror fallback for mirror-only companies.
- Remaining intentional dependencies for Ethical Scaling:
  - `backup_choices` / status references until canonical app-owned status definitions exist.
  - SuperAdmin/dev sync surfaces.
  - Reconciliation scripts.

Jay QA required:

- Verify Ethical Scaling contract and milestone tabs no longer show duplicate CST/imported rows.
- Spot-check Moves Method still loads read-only mirror contracts/milestones.

## Classification Key

- **Can move now to app-owned:** schema already exists or change is mostly source-selection/refactor.
- **Needs app-owned schema first:** current mirror source has no complete app-owned equivalent yet.
- **Mirror fallback only:** should be used for non-pilot/non-migrated companies, but Ethical Scaling should prefer app-owned rows.
- **Reference for now:** should stay as read-only seed/reference data until a broader feature needs ownership.

## Dependency Inventory

### Company Shell And SaaS Client Browsing

Current mirror usage:

- `src/components/Header.tsx`
  - Loads SuperAdmin company selector from `backup_companies`.
- `src/pages/SaasClients.tsx`
  - Lists SaaS companies from `backup_companies`.
  - Loads director/team snippets from `backup_company_team`.
- `src/pages/SaasClientDetail.tsx`
  - Still uses `backup_companies` for some company details.
  - Falls back to `backup_company_team`, `backup_company_offers`, `backup_company_offer_milestones`, and `backup_choices`.
- `src/pages/Dashboard.tsx`, `src/pages/Clients.tsx`, `src/pages/CsmReports.tsx`, `src/pages/Tasks.tsx`, `src/pages/Resources.tsx`
  - Company dropdown/context frequently starts from `backup_companies` and then joins app-owned company metadata.

Classification: **can move now to app-owned for Ethical Scaling; mirror fallback only for others.**

Recommended direction:

- Create a shared company context loader that returns app-owned `companies` for `pilot` / `migrated` companies first.
- Keep `backup_companies` only for mirror-only companies and SuperAdmin discovery until all active companies are migrated.
- For SuperAdmin SaaS Clients list, show app-owned companies when a matching `companies` row exists, with mirror fallback for unmigrated accounts.

Migration risk: low to medium. The risk is not data loss; it is breaking SuperAdmin View As or company selection if IDs are mixed. Keep legacy Glide id as the UI routing/filter id until all pages are converted.

### Login And Account Resolution

Current mirror usage:

- `src/lib/accountContext.tsx`
  - Resolves app-owned `company_members` first.
  - Falls back to `backup_company_team`.
- `supabase/functions/prepare-login/index.ts`
  - Checks app-owned membership first.
  - Falls back to `backup_company_team`.

Classification: **safe to leave as mirror fallback for non-migrated companies only.**

Recommended direction:

- No immediate Ethical Scaling change needed.
- Keep fallback until each company is seeded into `companies` and `company_members`.
- Add migration playbook QA that confirms pilot/migrated company users resolve from app-owned `company_members`, not backup rows.

Migration risk: low. This fallback is important while companies migrate one by one.

### Team / CSM / Assignment Data

Current mirror usage:

- `src/pages/ClientDetail.tsx`
  - Uses `company_members` for pilot/migrated companies, else `backup_company_team`.
- `src/pages/Clients.tsx`, `src/pages/Dashboard.tsx`, `src/pages/CsmReports.tsx`, `src/pages/Tasks.tsx`, `src/pages/Resources.tsx`
  - Prefer app-owned members for migrated companies but still contain `backup_company_team` fallback.
- `src/pages/SaasClients.tsx`
  - Still reads director/team snippets from `backup_company_team`.

Classification: **mostly can move now to app-owned for Ethical Scaling; mirror fallback only for others.**

Recommended direction:

- Normalize helper functions for team option loading so every page uses the same app-first logic.
- Convert SaaS Clients card/director summaries to prefer app-owned `company_members`.
- Keep `backup_company_team` fallback only when no app-owned company/member data exists.

Migration risk: low. The highest risk is duplicate/inactive member display; use the existing `status = active` and `hide_from_csm_list` rules.

### Clients Current State

Current mirror usage:

- `src/pages/Clients.tsx`
  - Uses `clients` for app-owned companies and `backup_company_clients` for mirror-only companies.
  - Still uses `backup_company_clients_tasks` for calendar task events.
- `src/pages/ClientDetail.tsx`
  - Loads `clients` first, then falls back to `backup_company_clients`.
- `src/pages/Dashboard.tsx`
  - Uses `clients` for app-owned companies and `backup_company_clients` for mirror-only companies.
- `src/pages/CsmReports.tsx`
  - Uses `clients` for app-owned companies and `backup_company_clients` for mirror-only companies.
- `supabase/functions/manage-client-quick-update/index.ts`
  - Reads `backup_company_clients` for legacy fallback/context.

Classification: **can move now to app-owned for Ethical Scaling; mirror fallback only for others.**

Recommended direction:

- For Ethical Scaling, all client roster/detail/reporting reads should continue to use `clients`.
- Remove remaining direct Ethical Scaling dependence on `backup_company_clients` from write functions where app-owned client lookup is sufficient.
- Keep mirror fallback for mirror-only companies and for reconciliation scripts only.

Migration risk: medium. App-owned clients are now the source of truth for pilot edits. Avoid any “sync overwrite” behavior from backup to app-owned after pilot starts; reconciliation should remain compare/missing-only unless explicitly approved.

### Program / Status / Outcome Choices

Current mirror usage:

- `src/pages/Clients.tsx`
  - Loads program/status labels from `backup_choices`.
  - Outcome labels still have legacy fallback.
- `src/pages/ClientDetail.tsx`
  - Loads program labels from `backup_choices`.
  - Uses app-owned `company_outcome_definitions` for pilot companies, else `backup_choices`.
- `src/pages/Dashboard.tsx`, `src/pages/CsmReports.tsx`, `src/pages/SaasClientDetail.tsx`
  - Still load some program/outcome choices from `backup_choices`.

Classification: **needs app-owned schema first for program/status definitions; outcome definitions are already partly app-owned.**

Recommended direction:

- Keep `backup_choices` as reference for program/status pills for now.
- Add app-owned company/global status definition table before trying to remove this dependency:
  - `program_status_definitions` or `company_program_status_definitions`
  - values: `front-end`, `back-end`, `paused`, `suspended`, `off-boarded`
  - label, emoji/color, active flag, order
- Outcomes should continue moving to `company_outcome_definitions`; eliminate old `backup_choices` outcome fallback for Ethical Scaling after QA confirms definitions are complete.

Migration risk: medium. Status labels/colors are visible everywhere. Do not rush this until a shared status display source is defined.

### Offers And Company Milestone Templates

Current mirror usage:

- `src/pages/Clients.tsx`, `src/pages/Dashboard.tsx`, `src/pages/SaasClientDetail.tsx`, `src/pages/ClientDetail.tsx`, `src/pages/Resources.tsx`
  - Prefer `company_offers` and `company_offer_milestones` for app-owned companies.
  - Fall back to `backup_company_offers` and `backup_company_offer_milestones`.
- `scripts/reconcile-company-pilot.mjs`
  - Intentionally compares app-owned rows against the mirror.

Classification: **can move now to app-owned for Ethical Scaling; mirror fallback only for others.**

Recommended direction:

- Ethical Scaling should use `company_offers` / `company_offer_milestones` everywhere except reconciliation/backfill scripts.
- Keep mirror fallback for read-only/mirror-only companies.
- Leave secondary offers as later product work.

Migration risk: low. Existing QA already validated app-owned offer/milestone config and client milestone progression.

### Client Milestone Progress

Current mirror usage:

- `src/pages/ClientDetail.tsx`
  - Merges app-owned `client_milestones` with mirrored `backup_company_clients_milestones`.
- `scripts/backfill-company-activity.mjs`
  - Reads `backup_company_clients_milestones` to backfill historical rows.
- `scripts/reconcile-company-pilot.mjs`
  - Compares mirrored and app-owned milestone coverage.

Classification: **can move now for current/future Ethical Scaling progress; historical backfill remains controlled/reviewed.**

Recommended direction:

- For Ethical Scaling UI, show app-owned `client_milestones` first and only show mirrored milestone rows as explicitly labeled historical/imported data if still needed.
- Apply historical milestone backfill only after dry-run review.
- Keep mirror reads in reconciliation/backfill scripts.

Migration risk: medium. The risk is duplicate timelines or confusing current milestone state if app + mirror rows both display without clear precedence.

### Contracts And Renewals

Current mirror usage:

- `src/pages/ClientDetail.tsx`
  - Merges app-owned `client_contracts` with `backup_company_clients_contracts`.
- `src/pages/Dashboard.tsx`
  - Uses app-owned contracts for pilot, but still references `backup_company_clients_contracts` for retention/renewal confidence and fallback.
- `scripts/backfill-company-activity.mjs`
  - Reads mirrored contracts for backfill.
- `scripts/reconcile-company-pilot.mjs`
  - Compares contract/renewal confidence.

Classification: **current/future contracts can move now; historical confidence/backfill should remain controlled.**

Recommended direction:

- For Ethical Scaling daily UI, treat `client_contracts` as authoritative for contracts created/edited in RetainOS.
- Continue showing mirrored historical contracts only if app-owned contract history is incomplete, preferably labeled as imported/legacy.
- Run dry-run/apply backfill per company when enough confidence exists.

Migration risk: medium to high. Contract history affects renewal, retention, LTV, pause extensions, and reporting. Ethical Scaling has limited data, so do not use it as the only validation model.

### Tasks

Current mirror usage:

- `src/pages/Tasks.tsx`
  - Shows app-owned `client_tasks` plus mirrored `backup_company_clients_tasks`.
  - Uses mirrored companies/team/clients fallback.
- `src/pages/Clients.tsx`
  - Calendar reads `backup_company_clients_tasks` for client-linked task events.
- `src/pages/ClientDetail.tsx`
  - Merges `client_tasks` and `backup_company_clients_tasks`.
- `src/pages/Dashboard.tsx`
  - Charts include `backup_company_clients_tasks`.

Classification: **needs cleanup, but not migration-critical for Ethical Scaling; can leave mirror fallback for now.**

Recommended direction:

- Since Ethical Scaling barely uses tasks, leave this as lower priority.
- When task usage becomes important, migrate current tasks to app-owned `client_tasks`, then make the app-owned table the only source for pilot/migrated companies.

Migration risk: low for Ethical Scaling, medium for high-volume companies if they use tasks heavily.

### Client History / Activity

Current mirror usage:

- `src/pages/Dashboard.tsx`
  - Still reads `backup_company_clients_history` for legacy retention/status transitions.
- `scripts/reconcile-company-pilot.mjs`
  - Reads `backup_company_clients_history` for comparison/confidence.
- `src/pages/ClientDetail.tsx`
  - Client History tab uses app-owned `client_history_events`, but old legacy history is not fully imported.

Classification: **needs historical backfill/model decision first.**

Recommended direction:

- Continue writing all new Ethical Scaling history to `client_history_events`.
- Keep mirrored history only for reporting/backfill confidence until a migration strategy is approved.
- Decide whether full legacy history should be imported into `client_history_events` or left archived externally.

Migration risk: medium. Full legacy history can be large/noisy and may not map cleanly to app-owned event types.

### Company Custom Fields

Current mirror/reference usage:

- Old Glide model used fixed company custom-field slots and client customfield values.
- No complete app-owned `company_custom_fields` / `client_custom_field_values` model exists yet.

Classification: **needs new app-owned table/schema first.**

Recommended direction:

- Add `company_custom_fields`:
  - company id, key/slug, label, type, options JSON, position, required flag, status.
- Add `client_custom_field_values`:
  - company id, client id, field id, value JSON/text, updated metadata.
- Seed Ethical Scaling definitions from current known custom field config only after confirming labels/types.

Migration risk: medium. Custom fields vary company-by-company and can create messy UI if inferred incorrectly.

### Resources And Client Webhook Guides

Current mirror usage:

- `src/pages/Resources.tsx`
  - Global resources are app-owned.
  - Zapier/client webhook guide loads company/team/offer IDs from app-owned tables for pilot/migrated companies and mirror tables for mirror-only companies.

Classification: **safe as-is; mirror fallback only for setup guides.**

Recommended direction:

- Keep the app-owned global resource library.
- Rename future user-facing guide language from “Zapier” to provider-neutral “Client Creation Webhook” where appropriate.

Migration risk: low.

### Dev Tools / Sync / Tables

Current mirror usage:

- `src/pages/Tables.tsx`
- `src/pages/TableDetail.tsx`
- `src/pages/SyncLog.tsx`
- `supabase/functions/sync-glide/*`
- `supabase/functions/sync-glide-table/*`

Classification: **should remain reference/dev sync for now.**

Recommended direction:

- Do not redesign or migrate these for pilot.
- Keep SuperAdmin-only.
- Long-term: deprecate after all active SaaS clients are migrated and Glide is retired/exported.

Migration risk: low if left alone; high wasted effort if rebuilt now.

## Recommended Implementation Order

### Slice 1: Shared App-Owned Company/Team/Offer Loaders

Goal: remove duplicated fallback logic and prevent pages from drifting.

Affected files:

- `src/pages/Clients.tsx`
- `src/pages/Dashboard.tsx`
- `src/pages/CsmReports.tsx`
- `src/pages/Tasks.tsx`
- `src/pages/Resources.tsx`
- `src/pages/SaasClients.tsx`
- `src/pages/SaasClientDetail.tsx`
- possible new helper: `src/lib/companyData.ts`

Work:

- Create shared app-first loaders for companies, team members, offers, and app-company lookup by legacy id.
- Preserve mirror fallback for `mirror_only`.
- Make SaaS Clients and Header prefer app-owned companies when available.

Risk: low/medium. Needs careful ID normalization.

### Slice 2: Ethical Scaling Current-State UI Uses App-Owned Only Where Available

Goal: stop accidental display of stale mirror rows on pilot/migrated surfaces.

Affected files:

- `src/pages/ClientDetail.tsx`
- `src/pages/Clients.tsx`
- `src/pages/Dashboard.tsx`
- `src/pages/CsmReports.tsx`
- `src/pages/Tasks.tsx`

Work:

- Ensure `clients`, `company_members`, `company_offers`, `company_offer_milestones`, `client_contracts`, `client_milestones`, and `client_tasks` are authoritative for pilot/migrated companies.
- If mirrored historical rows remain visible, label them as legacy/imported or hide them after backfill.

Risk: medium. Contracts/milestones/tasks may need product decisions before hiding legacy rows.

### Slice 3: App-Owned Program Status Definitions

Goal: remove `backup_choices` as the runtime source for status labels/colors.

Affected files:

- `src/lib/clientDisplay.tsx`
- `src/pages/Clients.tsx`
- `src/pages/ClientDetail.tsx`
- `src/pages/Dashboard.tsx`
- `src/pages/CsmReports.tsx`
- `src/pages/SaasClientDetail.tsx`

Work:

- Add status definition table or static app-owned config seeded by migration.
- Keep the canonical status values fixed: `front-end`, `back-end`, `paused`, `suspended`, `off-boarded`.
- Use company-level overrides only where already supported.

Risk: medium. This affects every status pill and filter.

### Slice 4: Historical Contract/Milestone Backfill Review

Goal: decide whether Ethical Scaling should show/import all old contract and milestone records.

Affected files/scripts:

- `scripts/backfill-company-activity.mjs`
- `scripts/reconcile-company-pilot.mjs`
- `src/pages/ClientDetail.tsx`
- `src/pages/Dashboard.tsx`

Work:

- Run dry-run for Ethical Scaling.
- Review historical rows that would be inserted.
- Apply only after explicit approval.
- After apply, hide mirrored duplicate historical rows for pilot/migrated companies.

Risk: medium/high. Contract history impacts renewal and retention confidence.

### Slice 5: Company Custom Fields Schema

Goal: unlock non-Ethical Scaling migration readiness.

Affected future files:

- new migration for `company_custom_fields` and `client_custom_field_values`
- `src/pages/SaasClientDetail.tsx`
- `src/pages/ClientDetail.tsx`
- `src/pages/Clients.tsx`
- `supabase/functions/manage-client-create`
- `supabase/functions/manage-client-profile`
- `supabase/functions/manage-client-quick-update`

Work:

- Build schema and Admin Hub editing.
- Render fields dynamically on client create/detail/edit.
- Plan per-company migration from Glide customfield slots.

Risk: medium. Requires product confirmation on field types and where values appear.

## Top Safe Implementation Slices

1. **Shared app-owned company/team/offer loaders.**
   - High cleanup value.
   - Low data risk.
   - Makes future migrations safer.

2. **SaaS Clients/Header app-owned company preference.**
   - Helps SuperAdmin/support flow feel fully RetainOS-owned for Ethical Scaling.
   - Keeps mirror fallback for all unmigrated companies.

3. **Outcome choices fallback removal for Ethical Scaling.**
   - App-owned outcome definitions already exist.
   - Safer than program statuses because the custom definition table is already in place.

4. **Task mirror usage defer/label.**
   - 2026-06-10: current task views now use `client_tasks` for pilot/migrated companies and `backup_company_clients_tasks` for mirror-only companies.
   - Remaining task work is CRUD/edit/archive polish, not mirror source selection for current pilot task reads.

## Open Questions Before Implementation

1. Should pilot/migrated company pages display legacy mirrored historical contract/milestone rows at all, or only app-owned/imported rows?
2. Should program/status definitions be global fixed reference data or company-customizable?
3. Should old Glide history be imported into `client_history_events`, or preserved outside RetainOS as an archive?
4. For company custom fields, should v1 support only text/dropdown/date/boolean, or also number/currency/url?
5. Should SuperAdmin SaaS Clients become app-owned-first now, even while some active SaaS clients remain mirror-only?
