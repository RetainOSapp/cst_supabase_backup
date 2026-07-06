# Project Memory

Fast startup router for RetainOS. Keep this file under 150 lines.
Feature status belongs in `ROADMAP.md`; historical logs belong in `MEMORY_ARCHIVE.md`; scoped work belongs in dedicated docs.

## Start Here

1. Read this file.
2. Run `git status --short` before edits, deploys, or commits.
3. Open `ROADMAP.md` only when Jay asks for priorities, pending QA, roadmap status, or "what next?"
4. Open scope docs only for the area being touched.
5. Use `ARCHITECTURE_MAP.md` / Graphify before non-trivial implementation or impact checks, then verify exact behavior with `rg` and source reads.

## Source Of Truth

- `MEMORY.md`: hard rules, current operational facts, dirty-work warnings, routing.
- `ROADMAP.md`: shipped/open/planned status, priorities, Jay QA queue, deploy gaps.
- `MEMORY_ARCHIVE.md`: searchable historical session log. Do not load by default.
- `ARCHITECTURE_MAP.md`: distilled Graphify architecture map.
- Active scope docs:
  - `OFFICIAL_COMPANY_ROLLOUT_CHECKLIST.md`: internal migration runbook.
  - `CLIENT_FACING_MIGRATION_QA_CHECKLIST.md`: customer-facing signoff.
  - `CONTRACT_BACKFILL_RENEWAL_PLAN.md`: contract/renewal planning.
  - `DASHBOARD_FORMULA_VALIDATION.md`: dashboard and CSM formula validation.
  - `CSV_BULK_IMPORT_EXPORT.md`: CSV import/export behavior.
- Closed/reference docs: search only when relevant, do not load by default:
  - `RETAINOS_RESOURCES_MIGRATION.md`
  - `PATHWAYS_MILESTONES_POLISH_PLAN.md`
  - `MOVES_METHOD_MIGRATION_READINESS.md`
  - `ETHICAL_SCALING_APP_OWNED_AUDIT.md`

## Hard Rules

- Never commit secrets. `.env`, `.env.*`, and `.env.graphify` are local-only.
- `VITE_BEACON_ANTHROPIC_KEY` currently holds a real key.
- Vercel deploys from `main`; anything pushed there is live.
- Use repo git identity `retainOS <retainOS@users.noreply.github.com>`.
- GitHub auth for this repo should use `retainOS`, not `atlas-thebrain`.
- The untracked `old glide project test/` folder is local Glide/reference material. Do not commit it unless Jay explicitly asks.
- `backup_*` tables are read-only Glide/CST mirror/reference sources. New RetainOS writes go to app-owned tables.
- Do not reopen closed V1 roadmap work unless Jay finds a real regression. New improvements become V2/polish roadmap items.
- Do not append detailed completed-work logs here. Put them in `ROADMAP.md` if status-related or `MEMORY_ARCHIVE.md` if historical only.

## Dirty Work / Commit Warnings

Before staging/committing, inspect `git status --short`. Uncommitted work may be intentional.

- Beacon local pilot is intentionally uncommitted and must not be committed/deployed as-is:
  - `src/components/Beacon.tsx`
  - `src/lib/beacon/*`
  - Beacon mount/import changes in `src/components/Header.tsx`
  - related `package.json` / `package-lock.json` Anthropic dependency changes
- Beacon promotion path before rollout: move chat loop into a Supabase Edge Function, store `ANTHROPIC_API_KEY` as a Supabase secret, enforce server-side company/role scoping, and add `canAccessBeacon` gating.
- The separate `security-phase-0` branch/workspace is unrelated to MM launch hotfixes. Do not mix it into RetainOS launch commits.

## Deploy / Environment Notes

- Local dev server: `npm run dev`.
- Build check: `npm run build`.
- Known build warnings may include Beacon/Anthropic browser externalization and Vite large chunk warning while Beacon remains local-only.
- Supabase project ref: `zjauqflzxzsbpnivzsct`.
- Supabase CLI default profile is the RetainOS org. Do not pass `--profile retainos`; that named profile is malformed.
- `prepare-login` must be deployed with JWT verification disabled because public login calls it before a user session exists:

```bash
npx supabase functions deploy prepare-login --project-ref zjauqflzxzsbpnivzsct --no-verify-jwt
```

- GitHub/network DNS may be blocked in the default sandbox. When Jay explicitly asks to push, use the approved/escalated `git push` path directly.

## Current Operational State

- Ethical Scaling is the controlled pilot/app-owned company.
- Moves Method was migrated to app-owned write mode on 2026-07-04 and is the first large live migrated company.
- Mirror-only companies still read from Glide/CST backup tables.
- Validated migrated/pilot surfaces prefer app-owned tables where built.
- App-owned MM webhooks are live for new client, client update, and call-summary/next-steps flows; customer Zap maintenance remains operational.
- MM launch hotfixes through 2026-07-06 included task dismissal, contacted shortcut, contact cadence automation, legacy/current history visibility, history date/delete controls, secondary pathway no-milestone support, and dashboard KPI info privacy.
- History edit/delete audit lives internally in `app_audit_events`; no user-facing audit log exists yet.
- Full feature state and remaining QA belong in `ROADMAP.md`, not here.

## Routing

For planning/priorities:

1. Read `ROADMAP.md` top sections and active high/medium-priority items.
2. Use the Jay QA Queue as the only active Jay QA source.
3. Open relevant scope docs only when the work touches that area.

For migration work:

1. Start from `OFFICIAL_COMPANY_ROLLOUT_CHECKLIST.md`.
2. Use `CLIENT_FACING_MIGRATION_QA_CHECKLIST.md` for customer signoff.
3. Put migration status and open items in `ROADMAP.md`.

For historical context:

1. Search `MEMORY_ARCHIVE.md` with `rg`.
2. Promote only durable operational facts back into this file.
3. Keep active `MEMORY.md` below 150 lines.

## Latest Checkpoint - 2026-07-06 Memory Cleanup

- Active `MEMORY.md` was reduced from 669 lines to this short router/current-state file.
- The stale active block from `Latest Checkpoint - 2026-06-17` onward was moved under `## Active MEMORY Archive Before 2026-07-06 Cleanup` in `MEMORY_ARCHIVE.md` for search-only history.
- Resource migration details should live in `RETAINOS_RESOURCES_MIGRATION.md`, resource SQL migrations, `ROADMAP.md`, or archive, not active memory.
- Future entries here must be durable operational facts only; completed work summaries should go to roadmap/archive.
