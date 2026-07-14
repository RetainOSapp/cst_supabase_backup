# Beacon database pre-pilot gate

> Reference correction — 2026-07-14: no separate staging database is required.
> The active database sequence is in `BEACON_DIRECT_ROLLOUT.md` and targets the
> existing RetainOS Supabase project with all Beacon controls paused/disabled.

This is a release gate, not an apply runbook. The migrations remain unapplied
until Jay approves the security/QA candidate.

## Execution status — 2026-07-14

The safe static portion is green: database verifier 49/49, JavaScript syntax,
matching four-migration rollback coverage, and `git diff --check` passed. No
local runtime execution was possible because this worktree has no Docker or
PostgreSQL server. Jay has chosen a direct existing-project rollout: after file
and hash review, apply the four additive migrations to RetainOS production while
Beacon remains globally paused and every company remains disabled.

Production apply completed on 2026-07-14 with all four recorded hashes. Readback
confirmed four rollout-history rows, global Beacon paused, zero company
entitlements, and zero allowances. Ethical Scaling readiness is intentionally
false: 72 active-CSM values are verified, while 89 values map to archived CSMs or
non-CSM members. CSM access remains denied until a narrow readiness correction is
reviewed; other authorized roles are unaffected.

Correction applied 2026-07-14 as `20260714014000`: readiness now ignores only
exact mappings to ineligible archived/non-CSM members while still denying missing,
duplicate, or unverified active-CSM mappings. Ethical Scaling readback is 161
exactly mapped assignment values, 72 verified active-CSM values, zero unresolved,
and `ledger_ready = true`. All global AI controls remain paused; entitlements and
allowances remain empty.

## Required before any provider enablement

1. Run `node scripts/verify-beacon-foundation.mjs` and the Edge/function test
   suite. Any failed security assertion is a stop.
2. Apply and inspect the assignment-ledger readiness result for the pilot
   company. Coverage means
   `current_at_cutover_plus_forward_and_verified_corrections`; it does **not**
   claim pre-cutover historical completeness. Any current assignment value that
   is not exactly resolved and seeded makes CSM Beacon access fail closed.
3. Confirm Beacon has exactly one active `usd_cents` allowance and that its
   one-time limit matches the approved pilot cap. Policy replacements must keep
   the same `policy_lineage_id`; current-period consumed usage and live
   reservations must remain unchanged after a limit edit.
4. Configure a server-side scheduled sweep, at least once per minute per enabled
   pilot company, to call `beacon_expire_usage_reservations(company, 'beacon',
   100)` with service-role authority. The chat reserve/finalize paths also sweep
   opportunistically, but the scheduled sweep is required before pilot traffic.
5. Keep the global Beacon control paused and all company entitlements disabled
   until role/cross-company/Viewer/CSM-history, rate, concurrency, budget, and
   cost-reconciliation tests pass.
6. Treat the Phase 1 AI Features catalog as roadmap visibility only for call
   analysis, sentiment analysis, automated summaries, and Slack data. The
   management RPC must reject mutations for every feature except Beacon until a
   later feature-specific security migration deliberately releases it.

## Cost and failure invariants

- A reservation counts until a finalization or expiration event exists; the
  timestamp alone never releases it.
- The Edge and database reservation contract is pinned to 500,000 micros (50
  cents) per request. A mismatch fails closed before quota accounting.
- Expiration conservatively consumes the full reserved cents. If billed usage is
  reported later, only cost above that reservation is added to the commercial
  meter, while raw actual micros remain visible in the late event.
- A dispatched provider timeout, network failure, or malformed successful usage
  is cost-uncertain and conservatively consumes the full reservation. It must
  never be finalized as zero merely because trustworthy usage was unavailable.
- Late billed usage pauses the affected company entitlement. Actual cost above
  the pinned reservation also pauses the global Beacon control. Both paths append
  a bounded audit event and require review before re-enable.
- Operational logs/events contain metadata and counts only—never prompts,
  answers, raw tool results, or client rows.

## Rollback order

Pause the global Beacon control first, then roll back in reverse order:

1. `20260714013000_beacon_phase_a_read_rpcs.sql`
2. `20260714012000_beacon_service_rpcs.sql`
3. `20260714011000_beacon_assignment_ledger.sql`
4. `20260714010000_ai_feature_foundation.sql`

Do not remove usage or assignment evidence as an operational rollback shortcut.
