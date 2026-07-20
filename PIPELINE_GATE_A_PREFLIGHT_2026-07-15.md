# Pipeline Gate A Preflight — 2026-07-15

Status: Gate A approved, applied inertly, verified, and closed on 2026-07-15.
Gate B remains separately approval-gated.

## Candidate

- Branch and local `main`: `07946191495f0604a68c4d34fcc61d16aa9aefd2`
- Phase 0–2 migration: `7a99ec95a3be3b0f5f129b16f123c586290fd36e6583851b1e19c73207388923`
- Phase 3–4 migration: `182dd70ba986d83a9858ba7294505d25fdd23883bf5f7a19f6d7d1f519412f68`
- Phase 3–4 rollback: `55eceab9167ac149e2db9b8615da985e8c493aa03a66c258998e4ecce8e12489`
- Phase 0–2 rollback: `1f8fb3045330cf073a413d093b2415d36ebcc0d7ab9c1bc76c7488bfecf06c7a`

## Local Evidence

- Phase 0–2: 55/55
- Phase 3–4: 37/37
- Production build: pass; existing bundle-size advisory only
- Diff check: pass
- Jay local/manual QA: all pass
- Final independent rollout security review: no remaining P0/P1
- Two review blockers were fixed before this packet: preview is now explicitly
  bound to a selected Renewal pipeline while execution remains off, and run keys
  reject changed immutable inputs.

## Timestamped Read-Only Production Baseline

Latest fail-closed capture at `2026-07-15T20:00:45.084Z` with
`npm run pipeline:preflight:gate-a`.

| Object | Count |
| --- | ---: |
| companies | 2 |
| company_settings | 2 |
| clients | 4,762 |
| client_contracts | 2,924 |
| client_tasks | 7,681 |
| company_task_templates | 8 |
| client_history_events | 5,413 |
| app_audit_events | 5,619 |

Pre-apply absence proof:

- All five future Pipeline tables return PostgREST `PGRST205` (not present in
  the schema cache).
- `company_settings.enable_pipeline` returns PostgreSQL `42703` (column absent).
- Therefore no Pipeline rows, company gates, or automation runs exist before
  Gate A.

Exact rollout companies:

- Ethical Scaling: `8c2e9c88-d939-49f8-b2ef-563b3c96c70c`, legacy
  `chvcRSSPTJaaoK2zbhGplQ`, status `pilot`.
- Moves Method: `21586391-9a84-4072-9ae6-20436b27bea9`, legacy
  `wd7vy0vaQK2hgB3IRqy17w`, status `migrated`.
- No app-owned Saleskick row exists yet; Saleskick cannot be enabled by Gate A.

## Pre-Apply Preconditions — Completed

- Confirm a low-traffic apply window and bounded lock/statement timeouts.
- Re-run the read-only baseline immediately before apply and stop if counts or
  schema state changed unexpectedly.
- The guarded executor captures its own immediate pre-apply counts and compares
  them with postflight counts; ordinary live traffic that changes them causes a
  stop for review rather than a false success.
- Apply Phase 0–2 then Phase 3–4 in one `exec_sql` transaction; no seed,
  configuration, backfill, function deployment, or company enablement.
- Execute every Gate A readback in the rollout runbook and stop for review.
- Jay must explicitly approve this exact inert apply. Approval does not include
  Gate B or any later gate.

The local Supabase CLI is intentionally not linked to production, so it cannot
read the hosted migration ledger. The apply packet therefore uses exact source
hashes, live pre/post schema probes, and the repository/ROADMAP deployment
record rather than silently linking the CLI.

## Gate A Result

- Applied project: `zjauqflzxzsbpnivzsct`.
- Combined transaction SHA-256:
  `147217eeca2546acbf106aaa57417d6422d0774307124af41916ba5fd21d48bb`.
- Both migrations applied in one RPC transaction; no seed, configuration,
  function deployment, company enablement, automation, commit, or push.
- Immediate before/after counts matched; all Pipeline tables remained empty and
  every company gate remained off.
- Catalog, RLS, ACL, trigger, constraint, index, anonymous-denial, zero-residue,
  contract-default, task-link, and app/login readbacks passed.
- Final independent review: no remaining P0/P1.
