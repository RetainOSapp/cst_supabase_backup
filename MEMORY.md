# Project Memory

This file is the fast session-start router for RetainOS. It should stay short.
Feature status belongs in `ROADMAP.md`; historical session logs belong in
`MEMORY_ARCHIVE.md`; scoped plans/checklists belong in dedicated `.md` files.

## Start Here

At the start of a session:

1. Read this file.
2. Check `git status --short`.
3. Ask what mode the session is in if it is not obvious: planning, QA, deploy, implementation, or cleanup.
4. Open `ROADMAP.md` only when Jay asks for planning, pending QA, priorities, roadmap status, or "what next?"
5. Open a dedicated scope doc only when the session touches that area.
6. Use `ARCHITECTURE_MAP.md` / Graphify before non-trivial implementation or impact analysis, not as a mandatory startup step. Treat Graphify as orientation only and verify exact behavior with `rg` / source reads.

## Source Of Truth Split

- `MEMORY.md`: hard rules, current operational facts, dirty-work warnings, routing.
- `ROADMAP.md`: shipped/open/planned status, priorities, pending QA, pending deploys.
- `MEMORY_ARCHIVE.md`: full historical session log copied from the old memory file.
- `ARCHITECTURE_MAP.md`: distilled Graphify architecture map.
- Active / reusable scope docs:
  - `SUPABASE_WRITE_PLAN.md`: app-owned write-mode plan.
  - `OFFICIAL_COMPANY_ROLLOUT_CHECKLIST.md`: internal migration runbook.
  - `CLIENT_FACING_MIGRATION_QA_CHECKLIST.md`: customer-facing migration signoff.
  - `CONTRACT_BACKFILL_RENEWAL_PLAN.md`: contract backfill and renewal confidence planning.
  - `DASHBOARD_FORMULA_VALIDATION.md`: dashboard formula validation.
  - `CSV_BULK_IMPORT_EXPORT.md`: CSV import/export behavior.
- Closed / reference scope docs should not be loaded by default. Search them only when relevant:
  - `PATHWAYS_MILESTONES_POLISH_PLAN.md`
  - `RETAINOS_RESOURCES_MIGRATION.md`
  - `MOVES_METHOD_MIGRATION_READINESS.md`
  - `ETHICAL_SCALING_APP_OWNED_AUDIT.md`

## Hard Rules

- Never commit secrets. `.env`, `.env.*`, and `.env.graphify` are local-only.
- `VITE_BEACON_ANTHROPIC_KEY` currently holds a real key.
- Vercel deploys from `main`; anything pushed there is live.
- Use the repo git identity `retainOS <retainOS@users.noreply.github.com>`.
- GitHub auth for this repo should use the `retainOS` account, not `atlas-thebrain`.
- The untracked `old glide project test/` folder is a local Glide/reference copy. Do not commit it unless Jay explicitly asks.
- `backup_*` tables are read-only Glide mirror/reference sources. New RetainOS writes go to app-owned tables.
- Do not reopen closed V1 roadmap work unless Jay finds a real regression. New improvements become V2/polish items.

## Current Dirty Work / Commit Warnings

There may be intentional uncommitted local work. Before staging/committing, inspect
`git status --short` and compare against this list.

- Beacon local pilot is intentionally uncommitted and must not be committed/deployed as-is:
  - `src/components/Beacon.tsx`
  - `src/lib/beacon/*`
  - Beacon mount/import changes in `src/components/Header.tsx`
  - related `package.json` / `package-lock.json` Anthropic dependency changes
- Beacon v1 uses a browser-direct Anthropic call. Promotion path before commit/rollout:
  - move chat loop into a `beacon-chat` Supabase Edge Function
  - store `ANTHROPIC_API_KEY` as a Supabase secret
  - enforce server-side company/role scoping
  - add a proper `canAccessBeacon` capability before Director/CSM access
- Pathways/Milestones local code/function changes may be uncommitted until Jay asks for commit/deploy.

## Deploy / Environment Notes

- Local dev server usually runs on Vite; use `npm run dev`.
- Build check: `npm run build`.
- Known build warnings currently include Beacon/Anthropic browser externalization and Vite large chunk warning.
- Supabase project ref: `zjauqflzxzsbpnivzsct`.
- Supabase CLI default profile is the RetainOS org. Do not pass `--profile retainos`; that named profile is malformed.
- `prepare-login` must be deployed with JWT verification disabled because public login calls it before a user session exists.

Useful command:

```bash
npx supabase functions deploy prepare-login --project-ref zjauqflzxzsbpnivzsct --no-verify-jwt
```

## Current Operational State

- Ethical Scaling is the controlled pilot / app-owned company.
- Mirror-only companies still read from Glide backup tables.
- Validated migrated/pilot surfaces prefer app-owned tables where built.
- Resources seed migration has been applied; seeded RetainOS resources include published dynamic integration guides and draft rewrite/re-record resources.
- Daily Pulse + notification product polish was QA-approved.
- Clients filter polish was QA-approved.
- Company Pathways & Milestones V1/polish is closed in `ROADMAP.md`; any remaining deploy or future enhancement belongs there, not here.
- Ali/contracts need separate contract-page investigation; track that in `ROADMAP.md` / a contract scope doc.
- Client-facing migration signoff spreadsheet is approved as a v1 template for Moves Method testing; roadmap owns the status.

## Active Routing

For a day-planning question:

1. Read `ROADMAP.md` top sections and active `[priority: high]` / `[priority: medium]` items.
2. Use the `Jay QA Queue` as the only source for active Jay QA asks.
3. If the work touches a specific area, open its scope doc before editing.

For migration work:

1. Start from `OFFICIAL_COMPANY_ROLLOUT_CHECKLIST.md`.
2. Use `CLIENT_FACING_MIGRATION_QA_CHECKLIST.md` for customer signoff.
3. Use company-specific readiness docs when present.
4. Add status/open items to `ROADMAP.md`, not this file.

For historical context:

1. Search `MEMORY_ARCHIVE.md` with `rg`.
2. Promote only durable operational facts back into this file.
3. Put feature status or next work into `ROADMAP.md`.

## Latest Checkpoint - 2026-06-17

- `MEMORY_ARCHIVE.md` was created from the old 1,673-line `MEMORY.md`.
- `MEMORY.md` was reduced to this router format so session startup is faster.
- Keep this file under roughly 300 lines.
- Future session notes should be short. Detailed work logs should go to archive or dedicated scope docs.
- Pathways closure: `npm run build` passed; deployed `manage-company-pathway` and `manage-client-milestone` to Supabase project `zjauqflzxzsbpnivzsct`.
- Commit scope for Pathways closure excludes Beacon local pilot files, `package.json`, `package-lock.json`, `src/components/Header.tsx`, and `old glide project test/`.
- Contract sanity: deployed `manage-client-contract` fix so start date + expected duration days sync a calculated end/filtering date to `clients`; repaired four Ethical Scaling pilot summaries. Ali Back End still has duplicate QA-created contract history rows, which can be tidied later via SuperAdmin delete.
