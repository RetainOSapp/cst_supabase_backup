# Call Intelligence V1: Disabled-First Rollout

Status: release candidate only. This checklist does not authorize production
changes. Apply each production phase only after Jay explicitly approves it.

## Release candidate

- Branch/worktree: `codex/call-intelligence-v1` at
  `/private/tmp/cst-call-intelligence-v1`
- Based on verified `origin/main`; the dirty Pipeline workspace is untouched.
- No production migration, Edge deployment, token, entitlement, provider call,
  frontend push, or Zapier change has occurred.
- V1 boundary: one RetainOS client account per call; multiple company members
  and participants from that same client are supported.

## Required secrets and configuration

Prefer a dedicated `CALL_INTELLIGENCE_OPENAI_API_KEY` so Call Intelligence can
be rotated and observed independently. If omitted, the worker can use the
existing server-only `OPENAI_API_KEY`; no browser key is ever used.

Set an immutable price card before processing:

- `CALL_INTELLIGENCE_PRICE_CARD_VERSION`
- `CALL_INTELLIGENCE_INPUT_MICROS_PER_MILLION_TOKENS`
- `CALL_INTELLIGENCE_CACHED_INPUT_MICROS_PER_MILLION_TOKENS`
- `CALL_INTELLIGENCE_OUTPUT_MICROS_PER_MILLION_TOKENS`

The candidate starts with `gpt-5.6-terra` at medium reasoning. The private
evaluation decides whether Terra-low or Luna-low is acceptable and whether any
individual failures require Sol.

## Phase A — database, disabled

1. Record hashes for both migrations and rollbacks.
2. Apply:
   - `20260723200000_call_intelligence_v1_foundation.sql`
   - `20260723201000_call_intelligence_prompt_seed.sql`
3. Re-run `npm run call-intelligence:verify:db`.
4. Read back:
   - six Call Intelligence tables exist with RLS;
   - `call_analysis` remains paused unless already deliberately active;
   - zero new entitlements, allowances, tokens, calls, runs, and usage events;
   - prompt versions exist, but no customer traffic is enabled.
5. Stop on any unexpected existing data or policy mismatch.

Pre-traffic rollback may use the supplied drop scripts. After any traffic,
never drop the tables; use operational rollback below.

## Phase B — Edge Functions, still disabled

Deploy:

```bash
npx supabase functions deploy ingest-call-intelligence --project-ref zjauqflzxzsbpnivzsct --no-verify-jwt
npx supabase functions deploy manage-call-intelligence --project-ref zjauqflzxzsbpnivzsct
npx supabase functions deploy process-call-intelligence --project-ref zjauqflzxzsbpnivzsct
```

Then verify:

- anonymous management/processing calls deny;
- ingestion with a missing/invalid company token denies;
- no global fallback webhook secret is accepted;
- logs contain IDs/states/categories only, never transcript text or participant
  email lists;
- no entitlement, allowance, token, or provider call exists yet.

## Phase C — hidden frontend

Merge/push only after the database and paused functions pass. Production
continues to fail closed because role access, company entitlement, a hard
allowance, and a valid company token are all required.

Verify:

- Reconciliation remains available to SuperAdmin/Director;
- Support sees matched results read-only;
- CSM access requires `enable_call_ai_for_csms` and assigned-client scope;
- Viewer is denied;
- no public sample-data route exists in production;
- the development fixture route redirects to login in production builds.

## Phase D — private evaluation, no customer traffic

1. Start with the five real Fathom/Zapier runs already converted into ignored
   `.call-intelligence-private/fathom-zapier-corpus.json`; add 5–10 more
   representative calls before final model lock.
   To rebuild it from a new local export:

```bash
npm run call-intelligence:eval:prepare-private -- /absolute/path/to/zapier-runs.json
```
2. Dry-run:

```bash
npm run call-intelligence:eval -- --corpus .call-intelligence-private/fathom-zapier-corpus.json
```

3. Explicitly approve the paid call count before adding `--execute`.
4. Compare legacy V1 with structured V2 on Terra-medium, then
   Terra-low/Luna-low. Use Sol only for ambiguous high-value failures.
5. Promotion requires schema validity, exact 0–28 arithmetic, correct
   attribution, supported evidence, injection resistance, acceptable cost, and
   no automatic client-profile/Notes/Next Steps writes.
6. Pin model, reasoning, prompt version, price lineage, and transcript retention
   before pilot enablement.

## Phase E — Ethical Scaling pilot

1. Create one company-scoped `call_ai_transcript` token.
2. Create a pilot `call_analysis` entitlement and small hard USD-cent allowance.
3. Keep CSM access off initially; use SuperAdmin/Director.
4. Configure the separate Zap from
   `CALL_INTELLIGENCE_ZAPIER_CONTRACT.md`.
5. Test known-client ingestion, exact replay/dedupe, unknown-client
   reconciliation, same-client multi-participant, deliberate multi-client hold,
   structured analysis, one on-demand prompt, hard allowance, and global pause.
6. Confirm the existing call-summary/Notes Zap is unchanged.
7. Enable CSM access only after assigned-client tenant tests pass.

## Operational rollback after traffic

1. Pause global `call_analysis`.
2. Disable/remove the pilot company entitlement and allowance.
3. Revoke the company `call_ai_transcript` token.
4. Stop the Fathom/Zapier Call Intelligence Zap.
5. Preserve calls, transcripts, runs, usage, and metadata-only audit evidence.
6. Investigate by IDs/hashes/categories only; never paste transcripts into logs
   or tickets.

## Production acceptance

Production V1 remains `[~]` until Jay validates one end-to-end pilot call,
dedupe, reconciliation, structured output quality, on-demand prompt, role
scope, hard-budget denial, and rollback/pause behavior.
