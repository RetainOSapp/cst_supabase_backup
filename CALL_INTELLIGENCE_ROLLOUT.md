# Call Intelligence V1: Disabled-First Rollout

Status: Phases A–C are live and the Ethical Scaling authenticated-manual-upload
pilot is enabled with a one-time $1 hard cap. Webhook/Zapier enablement remains
separately gated.

## Release candidate

- Branch/worktree: `codex/call-intelligence-v1` at
  `/private/tmp/cst-call-intelligence-v1`
- Merged with verified `origin/main` at `d9d5fae`; the dirty Pipeline workspace
  is untouched.
- Production database, Edge boundaries, and frontend are deployed. Ethical
  Scaling is the sole `call_analysis` pilot entitlement with a one-time
  100-cent hard allowance. No webhook token, call, transcript, run, usage
  event, provider call, or Zapier change exists before Jay's first upload.
- V1 boundary: one RetainOS client account per call; multiple company members
  and participants from that same client are supported.

## Required secrets and configuration

Prefer a dedicated `CALL_INTELLIGENCE_OPENAI_API_KEY` so Call Intelligence can
be rotated and observed independently. If omitted, the worker can use the
existing server-only `OPENAI_API_KEY`; no browser key is ever used.

The release candidate contains a model-scoped immutable standard-tier price card
versioned `openai-standard-2026-07-23`, based on OpenAI's published prices:

- Luna: $1 input / $0.10 cached input / $6 output per 1M tokens.
- Terra: $2.50 input / $0.25 cached input / $15 output per 1M tokens.
- Sol: $5 input / $0.50 cached input / $30 output per 1M tokens.

Provider calls explicitly select the standard service tier and explicit prompt
caching mode without breakpoints. This keeps the stored rates accurate by
preventing priority-tier charges and implicit cache-write charges. Review and
version the price card whenever OpenAI pricing changes.

The candidate starts with `gpt-5.6-terra` at medium reasoning. The private
evaluation decides whether Terra-low or Luna-low is acceptable and whether any
individual failures require Sol.

## Phase A — database, disabled

Completed 2026-07-24:

- foundation SHA-256:
  `a6a12b62f68719ef9ee5929fc46978d54cd46be89a08ed47078e4b462f03ecc9`;
- prompt seed SHA-256:
  `2b9e2594b46506e347a72d1fb7040936bb47862119032b1a0058d4f1b565336c`;
- both migrations applied to `zjauqflzxzsbpnivzsct`;
- all six tables read back successfully; prompt seed contains
  `structured_v2_quality_v4`;
- `call_analysis` remains paused with zero entitlements, allowances, tokens,
  calls, transcripts, participants, runs, and usage events.

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

Completed 2026-07-24:

- `ingest-call-intelligence` v1, JWT off,
  `6d155f29fdb409e8c8cdd0f2fa9ce6ed96f359d578213a63b70e87b370c78aac`;
- `manage-call-intelligence` v1, JWT on,
  `b596c9379a0b414266f53c2718ef7a0229bef145a4ff7a18a61a09b9406d8a4a`;
- `process-call-intelligence` v1, JWT on,
  `0a0bedce509878d71ebc20513acb7424b703389470c335de73a833663bcdd85d`;
- missing and invalid company-token probes returned 401;
- anonymous management and processing probes returned 401;
- post-probe readback remained globally paused with zero customer or usage
  records and zero provider spend.

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

Completed 2026-07-24:

- production `main` advanced to `90655e0`;
- Vercel deployment `dpl_7XjJuKTVbVEdCBCEGVWaepHzRBXQ` reached Ready and is
  aliased to `https://app.retainos.ai`;
- production asset `/assets/index-d7Z3gHvp.js` contains Call Intelligence,
  Sales / Discovery, and deterministic matched-client UI;
- the DEV fixture is absent from the production asset and
  `/__dev/call-intelligence` redirects to login;
- the browser bundle contains no provider secret name or credential-shaped
  value;
- post-release readback remains paused with zero entitlements, allowances,
  tokens, calls, transcripts, runs, and usage events.

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
   After the baseline comparison, prompt/schema corrections should be retested
   with `--structured-only` so the eight legacy calls are not purchased again.
5. Promotion requires schema validity, exact 0–28 arithmetic, correct
   attribution, supported evidence, injection resistance, acceptable cost, and
   no automatic client-profile/Notes/Next Steps writes.
   The evaluator writes per-profile legacy/structured token, cost, latency,
   schema-pass, evidence-grounding, expectation, and hard-promotion rates.
6. Pin model, reasoning, prompt version, price lineage, and transcript retention
   before pilot enablement.

## Phase E — Ethical Scaling pilot

Manual-pilot checkpoint completed 2026-07-24:

- secure `+ Add transcript` form released in production commit `b713b33`;
- `manage-call-intelligence` v2 is active with JWT verification and anonymous
  manual-upload denial confirmed at 401;
- policy-release migration `20260724160000` applied at
  `ed90d76c424efaaa1d83b5138c59ca66f7da96780ab1a131110b1455b8129a9a`;
- zero-usage display correction `20260724161000` applied at
  `2357d9378c9d0d97b18300ac5260cf2d09c6332cd457864e870e71eb18e234f4`;
- ES-only activation `20260724162000` applied at
  `2141c928b283b364ccc64e3edf8cbddbdd858e2185a20b1e4082a9444648c8a5`;
- global `call_analysis` is active at config v2; Ethical Scaling is the only
  pilot entitlement and its one-time 100-cent hard allowance reads 0 used;
- no `call_ai_transcript` token exists, so only authenticated
  SuperAdmin/Director manual upload is possible;
- CSM processing access, all other companies, webhooks, and Zapier remain off.

Next:

1. Jay uploads one known-client 1:1 transcript and reviews the result.
2. Validate the first call's structured output, evidence navigation, usage, and
   exact provider cost.
3. Create one company-scoped `call_ai_transcript` token only after the manual
   pilot passes.
4. Configure the separate Zap from
   `CALL_INTELLIGENCE_ZAPIER_CONTRACT.md`.
5. Test automatic known-client ingestion, exact replay/dedupe, unknown-client
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
