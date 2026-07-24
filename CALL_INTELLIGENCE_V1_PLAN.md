# Call Intelligence V1

Status: local release candidate on `codex/call-intelligence-v1`.
Nothing in this plan authorizes a production migration, Edge Function deploy,
provider call, company entitlement, token creation, or push to `main`.

## Product boundary

V1 analyzes a call for exactly one RetainOS client account. The call may contain
multiple company team members and multiple people associated with that same
client. Calls that resolve to more than one RetainOS client are group/multi-client
calls and must enter reconciliation rather than being analyzed automatically.

Call Intelligence is independent from `ingest-client-call-summary`:

- Call Intelligence stores a transcript and analysis.
- It never writes client Notes, Next Steps, contact dates, outcomes, or profile
  fields automatically.
- The existing call-summary/next-steps webhook remains unchanged.

## Release slices

1. Add the disabled data model, RLS, rollback, synthetic fixtures, and contract
   verification.
2. Add `ingest-call-intelligence`, authenticated by the existing
   `call_ai_transcript` company-token type. Ingestion performs deterministic
   matching and queues work; it does not call a model.
3. Add immutable `legacy_v1` and `structured_v2` prompt versions plus a private
   evaluation harness. Raw customer transcripts stay local and ignored.
4. Add server-side processing with a durable claim/finalize state machine,
   feature pause/entitlement enforcement, metadata-only usage accounting, and
   no ambiguous paid retry.
5. Replace dummy data in the approved Call Intelligence mock with actor-scoped
   queries/actions. Preserve reconciliation as a separate tab.
6. Pass database-contract, Edge mock, frontend/security, responsive browser,
   and production-build gates. Prepare a paused, disabled-by-default production
   rollout package.

## Inbound contract

Endpoint: `/functions/v1/ingest-call-intelligence`

Authentication: company-specific token with integration type
`call_ai_transcript`. There is no global fallback secret.

```json
{
  "schema_version": "call_intelligence.v1",
  "provider": "fathom",
  "company_id": "legacy-or-app-company-id",
  "external_call_id": "provider-stable-id",
  "title": "Renewal Call",
  "occurred_at": "2026-07-23T12:00:00Z",
  "duration_seconds": 2700,
  "recording_url": "https://fathom.video/calls/...",
  "share_url": "https://fathom.video/share/...",
  "host": {
    "name": "Team Member",
    "email": "team@example.test"
  },
  "participants": [
    {
      "name": "Client Person",
      "email": "client@example.test",
      "is_external": true
    }
  ],
  "transcript": "00:00:00 - Team Member: ..."
}
```

The transcript and recording URL are separate fields. Operational ledgers,
audit events, provider errors, and routine list queries must never contain the
transcript.

## Matching and states

Deterministic matching uses normalized participant emails against active
app-owned client email fields and active same-company member emails.

- One distinct client match: `matched` and `queued`.
- No client match: `unmatched` and `needs_reconciliation`.
- More than one distinct client match: `ambiguous` and
  `needs_reconciliation`.
- Replayed provider call ID: return the existing record; never create another
  call or automatic run.
- Same provider call ID with different transcript hash: preserve the existing
  record and mark the delivery for review; never silently replace source data.

## Access

- SuperAdmin: all companies and all actions.
- Director: company-wide calls, transcripts, results, and reconciliation.
- Support: company-wide matched call results, read-only; no reconciliation.
- CSM: matched calls for assigned clients only, and only when the company
  setting enabling Call AI for CSMs is on.
- Viewer: no Call Intelligence access.
- Service role: ingestion and processing only.

All browser writes go through authenticated Edge Functions. All tables use RLS.

## Prompt and model evaluation

The exact final-row Glide prompts are preserved as immutable `legacy_v1`.
`structured_v2` produces one schema-validated base result with:

- call type and title label;
- summary;
- client and team-member sentiment with confidence and evidence;
- zero to three positive and negative signals;
- four anchored score dimensions and a deterministic 0–28 total;
- review-only archetype with confidence, evidence, and
  `insufficient_evidence`.

Start with Terra at medium reasoning, then test low. Use Luna only as a cheap
challenger where available. Escalate individual ambiguous failures to Sol
instead of routing every call to Sol. Production selection is evaluation-driven.

Hard promotion gates include valid schema, correct tenant/client attribution,
no transcript-instruction compliance, no critical unsupported claim, evidence
support, usage accounting, and no automatic client-profile write.

## Privacy and retention

- Supplied Zap/Fathom exports and raw client transcripts never enter Git.
- Committed tests use invented names, domains, URLs, IDs, and transcript text.
- Transcript access is separated from list/metrics access.
- Provider requests use `store: false`.
- Provider requests explicitly use the standard service tier and disable
  implicit cache writes so the pinned model-scoped price card stays accurate.
- Logs and audit rows contain IDs, states, counts, hashes, and bounded safe
  diagnostics only.
- Transcript retention/deletion controls remain a rollout decision. Until then,
  production enablement stays blocked even if code is ready.

## Operational rollback

After any real traffic, rollback means:

1. pause the existing global `call_analysis` feature;
2. remove the company entitlement/allowance;
3. revoke the company `call_ai_transcript` token;
4. stop the worker;
5. preserve calls, transcripts, runs, and metadata-only audit evidence.

The SQL rollback that drops V1 tables is pre-traffic/disposable-environment only.

## Local evidence — 2026-07-24

- Edge/provider/dispatch tests: 20/20.
- Evaluation scoring/harness tests: 5/5.
- Database/dependency/rollback contract verification: 54/54, including
  immutable price lineage, database-side cost recomputation, compatibility with
  existing token/intake/AI-policy dependencies, and the current RPC rollback
  signature.
- Edge/source security verification: 56/56.
- Frontend/security/privacy verification: 19/19.
- Production TypeScript/Vite build: pass.
- Evaluation harness: dry-run pass; 3 synthetic calls, 8 legacy prompts plus
  structured V2, 27 planned Terra-medium calls. That manifest made no provider
  call; the separate private baseline below was executed.
- Jay's five real Fathom/Zapier examples remain a git-ignored 253,045-character
  private corpus. The 45-call Terra-medium baseline cost $1.849210: structured
  V2 was 100% schema-valid and 75.5% cheaper than the eight-prompt legacy flow,
  but 0/5 calls passed timestamp-scoped evidence grounding. The corrected
  evidence-v1 five-call retest completed for $0.372006 but also failed safely:
  55/67 unique evidence items were timestamp-grounded, 42/67 were correctly
  attributed, and 0/5 calls passed. Evidence-v2 sends an explicit
  speaker-role map, presents explicit timestamped utterance records, preserves
  unknown speakers, and constrains quote word count in the strict schema. Its
  five-call retest completed for $0.371111: raw output passed 3/5 calls at
  65/67 supported citations. A zero-provider-call replay through the production
  sanitizer/validator initially passed 5/5 technically, but transcript-level
  quality review found participant-role collisions in two calls, one unsupported
  next step, and two overconfident archetypes. Quality-v3 now quarantines the
  collided calls before provider dispatch, requires evidence for each next
  step, and suppresses weak archetypes. Its zero-cost replay passed 3/3 eligible
  calls with 44/44 retained citations; two calls were quarantined. Total
  provider evaluation spend remains $2.592327. A three-call quality-v3 plus
  one-call synthetic adversarial provider retest requires fresh approval; its
  combined dry-run ceiling is 936,559 micros ($0.94 rounded).
- Browser QA: desktop 1440×1000 and mobile 320×900, list/detail/filter/URL
  behavior, no horizontal overflow.
- Real Supabase migration/runtime, company token, entitlement, allowance,
  Zapier switch, production provider call, and production deploy remain
  explicit rollout gates in `CALL_INTELLIGENCE_ROLLOUT.md`.
- Requirement-by-requirement evidence and remaining runtime gates are recorded
  in `CALL_INTELLIGENCE_COMPLETION_AUDIT.md`.
