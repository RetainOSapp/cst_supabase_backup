# Beacon direct rollout

Date: 2026-07-14
Target: existing RetainOS Supabase project `zjauqflzxzsbpnivzsct`
First company: Ethical Scaling only

This is the active Beacon launch checklist. It replaces the earlier assumption
that Beacon needs a separate Supabase project or a long staging program. The
larger beta plan and morning QA matrix remain security reference material, not a
sequence of launch blockers.

## What stays

- The Beacon experience already validated locally: floating, memory-only chat.
- OpenAI runs only inside the existing RetainOS `beacon-chat` Edge Function.
- `OPENAI_API_KEY` exists only as a Supabase secret.
- The server re-resolves the signed-in company, role, membership, and CSM scope.
- Eight fixed read-only tools; no model-generated SQL and no Beacon writes.
- One company enable/disable control, a hard currency allowance, basic rate/token
  limits, and metadata-only usage records.
- AI Features remains a RetainOS SuperAdmin control, not customer Admin Hub.

The three small Edge endpoints and five additive migration files are deployment
slices inside the existing RetainOS application. They are not separate services,
databases, or products. Recombining them solely to reduce file count would add
change risk without simplifying the live system.

## What is deferred

- A separate Supabase project or parallel database.
- A separate OpenAI project; the first key may use Jay's existing OpenAI account.
- A formal multi-week staging, golden-set, or performance program.
- A mandatory scheduled reservation sweep for the small Ethical Scaling beta;
  request-path sweeps remain active. Add a schedule before broader traffic if
  real usage shows it is needed.
- Moves Method, write tools, persistent chat, Slack, Call AI, sentiment, summaries,
  and all non-Beacon AI mutations.
- Exhaustive role/corpus/load testing before Ethical Scaling. Keep the detailed
  QA matrix for regression work and broader rollout.

## Exact minimal sequence

Every environment-changing step remains separately stop-gated. Do not continue
after a failed step.

### 1. Freeze and review the local candidate

Already complete: database verifier 53/53, Edge tests 33/33, Edge invariant
verification across 20 files, frontend/security 25/25, production build, and
independent review with no P0/P1 finding.

Before rollout, commit only the secure candidate. Exclude `.env*`, `dist/`,
`BEACON_PROTOTYPE_REFERENCE_DO_NOT_COMMIT/`, and
`retainos-conversation-ai-scope.md`.

### 2. Apply the additive migrations to existing RetainOS production

Applied 2026-07-14 to `zjauqflzxzsbpnivzsct` with the exact hashes below. All
five rollout-history rows exist. Global Beacon and every future AI feature are
paused; company entitlements and allowances both remain empty.

Post-apply assignment correction completed 2026-07-14. Ethical Scaling has 161
current assignment values that each map exactly to one company member; 72 belong
to active CSMs and all 72 have verified ledger evidence. Archived/non-CSM members
are ineligible and grant nothing but no longer block unrelated active CSMs.
Unresolved values are zero, readiness is true, and no history was inferred.

First run the guarded dry-run form and record each SHA-256:

```bash
npm run db:apply:sql -- supabase/migrations/20260714010000_ai_feature_foundation.sql
npm run db:apply:sql -- supabase/migrations/20260714011000_beacon_assignment_ledger.sql
npm run db:apply:sql -- supabase/migrations/20260714012000_beacon_service_rpcs.sql
npm run db:apply:sql -- supabase/migrations/20260714013000_beacon_phase_a_read_rpcs.sql
npm run db:apply:sql -- supabase/migrations/20260714014000_beacon_assignment_readiness_active_csm.sql
```

Recorded dry-run evidence on 2026-07-14:

| Migration | Bytes | SHA-256 |
| --- | ---: | --- |
| `20260714010000_ai_feature_foundation.sql` | 26,072 | `3e0205877d62fa04de9bbfff520dd0f0c216a6ef883b5bdd87aeba9f8de4f5ad` |
| `20260714011000_beacon_assignment_ledger.sql` | 21,359 | `2cade879430772072ef71ee8b6ca7d085692f04b0c1c8d72175810ef99f28c72` |
| `20260714012000_beacon_service_rpcs.sql` | 61,938 | `f26651eb818eab1845fe785b29d5e78fcd68c1ce7af3ee4cfb91a47f817f01fd` |
| `20260714013000_beacon_phase_a_read_rpcs.sql` | 32,006 | `49db155e3f1689b751cf90c1532d25637f0df5537df3507f447faf8ca18adb66` |
| `20260714014000_beacon_assignment_readiness_active_csm.sql` | 5,450 | `f645dec39465bf18c6a677c9d767f65081c2d541b905469b8aae246e4d432db8` |

The approved apply used the same commands with `--apply --allow-production`, in
that order. All defaults are disabled/paused; applying schema did not expose
Beacon or call OpenAI.

Stop unless all five rollout-history rows exist, global Beacon is paused, every
company entitlement is disabled, and Ethical Scaling assignment readiness is
truthful. Missing historical evidence must fail CSM access closed.

### 3. Deploy the three Edge Functions while Beacon remains off

Completed 2026-07-14 against `zjauqflzxzsbpnivzsct`. All three functions are
active at version 1 with Supabase JWT verification enabled:

| Function | Version | Deployed SHA-256 |
| --- | ---: | --- |
| `beacon-access` | 1 | `6f36fa8bab7bd124ee82881d5d1905fc974139c0e659e0b7457f227e1650cbe6` |
| `beacon-chat` | 1 | `a655ac5ee2b3ba02b03daba42e31cc5123445630a016230d24c007b44675e6a5` |
| `manage-ai-feature-entitlement` | 1 | `afccd872b334dd61e222eeee06d9b7069fc023f003e36d95eae9a7ef33e29574` |

```bash
npx supabase functions deploy beacon-access --project-ref zjauqflzxzsbpnivzsct
npx supabase functions deploy beacon-chat --project-ref zjauqflzxzsbpnivzsct
npx supabase functions deploy manage-ai-feature-entitlement --project-ref zjauqflzxzsbpnivzsct
```

Confirm unauthenticated requests deny, Viewer denies, ordinary customer roles
cannot manage AI Features, and paused/disabled chat stops before provider work.
No OpenAI key is required for this proof.

Production post-deploy proof: all three endpoints returned `401 unauthenticated`
for an anonymous token. Beacon remained globally `paused`, with 0 company
entitlements, 0 allowances, and 0 usage events. No OpenAI secret or provider call
was involved. Signed-role and disabled-chat checks remain part of the pilot smoke
pass after the frontend and test accounts are available.

### 4. Add the existing-account OpenAI key

Jay creates the key in the existing OpenAI account and stores it directly as the
Supabase `OPENAI_API_KEY` secret. Do not paste it into chat, a shell command,
source, Vercel, or any `VITE_` variable. Keep global Beacon paused.

Completed 2026-07-14. Supabase reports the `OPENAI_API_KEY` secret name for
project `zjauqflzxzsbpnivzsct`; its value was neither read nor displayed.
Post-save verification confirmed Beacon remains globally `paused`, with 0
entitlements, 0 allowances, and 0 usage events. No provider call occurred.

### 5. Ship the frontend hidden-by-default

Commit the reviewed secure files, merge through the normal RetainOS flow, and let
Vercel deploy from `main`. The widget remains absent because no company is enabled.
Confirm ordinary RetainOS pages and Admin Hub are unchanged; AI Features appears
only in the RetainOS SuperAdmin SaaS-client view.

Completed 2026-07-14 in production commit `d76d90e`. Vercel reported the
production deployment ready; `https://app.retainos.ai/` and `/login` returned
HTTP 200. The live browser bundle contains the Beacon client and contains no
OpenAI/Anthropic endpoint or provider credential name. Final database readback
still showed Beacon globally `paused`, with 0 entitlements, 0 allowances, and 0
usage events. The widget therefore remains hidden from every company.

### 6. Enable Ethical Scaling only

In AI Features, set Beacon to a one-time `$25.00` allowance and pilot status for
Ethical Scaling. Leave Moves Method and every other company disabled. Then make
the global Beacon control active.

Enabled 2026-07-14. Ethical Scaling is the only Beacon entitlement, with status
`pilot` and one active `usd_cents`/`one_time` hard allowance of 2,500 cents;
warning thresholds are 75% and 90%. The global Beacon control is active at
configuration version 2, while all other companies remain without an
entitlement. Usage was zero immediately after enablement.

The first enablement attempt exposed a PostgreSQL ambiguity in the management
RPC's `ON CONFLICT` target and stopped before global activation. Narrow migration
`20260714015000_beacon_admin_feature_conflict_fix` corrected the target by naming
the existing entitlement primary-key constraint. It was applied with SHA-256
`1b23bcff57d4a11419b78061a58db625aa6b33cc0d442979d9f35e3b7516e8d8`;
the database verifier now passes 57/57.

Run a short smoke pass using existing accounts:

1. SuperAdmin/Director can ask a normal company question.
2. Support receives operational data but no configuration or sensitive fields.
3. An active assigned CSM can ask about an authorized client; a never-assigned
   client denies.
4. Viewer has no Beacon.
5. A Moves Method company/client identifier returns no Moves data.
6. One question from each of the eight allow-listed capabilities returns sensible
   RetainOS data; an SQL/write/configuration request refuses.
7. Usage records contain metadata and cost only, never chat or client content.
8. Pause Ethical Scaling and confirm the next request stops; then resume only if
   that test passes.

### 7. Observe, then decide on Moves Method

Use Beacon normally with Ethical Scaling. Review errors, answer quality, usage,
and remaining allowance after real use, not after an artificial multi-week gate.
Moves Method remains a separate decision with its one-time `$100.00` allowance.

## Immediate rollback

The fastest rollback is configuration, not schema deletion:

1. Pause the global Beacon control.
2. Disable Ethical Scaling Beacon.
3. If needed, redeploy the previous frontend/Edge version or revoke the OpenAI key.
4. Preserve additive tables and metadata-only usage evidence.

Only use the reverse-order SQL rollbacks if the additive database objects
themselves cause a verified problem. Beacon being paused must not affect normal
RetainOS reads, writes, or integrations.
