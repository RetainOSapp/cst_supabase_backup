# Call Intelligence V1 Completion Audit

Audit date: 2026-07-24
Branch: `codex/call-intelligence-v1`
Base: merged with verified `origin/main` at `d9d5fae`
Production authorization: Phases A–C granted; pilot enablement remains gated

This audit distinguishes local implementation evidence from the external gates
that require a paid provider call or production change. A passing static check
is not treated as proof of production runtime behavior.

| Requirement | Status | Authoritative local evidence | Remaining evidence |
| --- | --- | --- | --- |
| Isolated workspace from production main | Proven locally | `/private/tmp/cst-call-intelligence-v1`; branch ancestry starts at `e096d48`; the original Pipeline worktree remains separate | None |
| Dedicated secure Fathom contract | Proven locally | `CALL_INTELLIGENCE_ZAPIER_CONTRACT.md`; contract parser and bounds tests | Pilot Zap delivery |
| Company-scoped token; no global fallback | Proven in paused production | missing/invalid token probes returned 401; zero tokens exist | Valid-token pilot probe |
| Separate call/transcript/participant storage | Proven in paused production | both migrations applied; six-table readback; all customer/usage tables empty | Pilot traffic observation |
| One-client matching with multiple same-client/internal participants | Proven locally | matcher fixtures/tests | One real pilot call |
| Multi-client/no-client reconciliation | Proven locally | matcher fixtures/tests and management action source | One unknown and one multi-client pilot call |
| Provider-call deduplication and hash-drift conflict | Proven locally | unique DB contract, ingest duplicate path, source gates | Exact Zap replay plus altered-payload runtime probes |
| Transcript privacy | Proven locally | ignored private corpus, separate transcript table, metadata-only intake/audit, source/log scans | Production log inspection and role probes |
| Actor/tenant access | Proven as source/policy contract | RLS helper, management authorization, CSM company/assignment gate, Support read-only, Viewer denial | Production role/tenant runtime matrix |
| Automatic run dispatch | Proven locally | service-authenticated background dispatcher and dispatch tests | Paused/entitled runtime dispatch probes |
| Durable claim/dispatch/finalize lifecycle | Proven as migration/source contract | claim, dispatched marker, finalize RPC, non-retry provider test | Database transaction/runtime probes |
| Hard allowance and global pause | Proven as migration contract | locked claim, active hard USD allowance, reservation accounting, pause-on-overrun | Runtime allowance exhaustion/global-pause denial |
| Immutable price lineage and DB cost recomputation | Proven as migration contract | run/usage price fields, finalize recomputation, 54/54 DB contract | Runtime exact-cost finalization |
| Exact Glide prompt preservation | Proven in paused production | immutable `legacy_v1` rows plus active `structured_v2_quality_v4` seed read back | Pilot observation |
| Structured V2 schema | Proven locally | quality-v3 provider retest: 3/3 eligible private calls plus 1/1 adversarial call schema/hard pass; conservative archetype and exact next-step evidence gates | Pilot observation |
| Evidence grounding and attribution | Proven locally | 42/42 retained private citations plus 4/4 adversarial citations valid; two collision calls quarantined before provider spend | Pilot observation |
| Legacy-vs-structured model evaluation | Complete locally | 59/59 provider requests; cost/latency/schema/evidence and independent semantic review; $2.878853 cumulative spend | Production pilot observation |
| On-demand prompts | Proven locally | seven company prompt seeds, authorized queue/dispatch path, real UI action | One pilot prompt result |
| Real Call Intelligence UI | Proven in hidden production | Ready Vercel deployment; production bundle contains product UI and excludes DEV fixture; deterministic matched-client labels and evidence-to-transcript highlight passed desktop/mobile QA | Authenticated production pilot QA |
| Existing reconciliation preserved | Proven locally | `/call-ai` URL-tab implementation and frontend gate | Production navigation QA |
| No automatic client-profile writes | Proven locally | no client update path in ingest/manage/process; source gate | Pilot observation |
| Rollout and rollback | Proven through disabled Phase B | migrations/hashes/readback, corrected prompt rollback, function versions, denial probes | Pilot operational rollback |
| Production fail-closed | Proven | global pause; zero entitlement, allowance, token, call, run, usage, or provider spend | Preserve through hidden frontend release |

## Current verification matrix

- Edge/provider/dispatch tests: 21/21.
- Evaluation scorer/harness tests: 5/5.
- Database/dependency/rollback contract: 56/56.
- Edge/source security: 56/56.
- Frontend/security/privacy: 23/23.
- TypeScript/Vite production build: pass.
- Synthetic evaluation manifest: 27 planned calls, dry-run only.
- Five-call private Fathom baseline: 45/45 paid calls completed for $1.849210,
  safely below the $5.26 ceiling. Structured V2 was 100% schema-valid and 75.5%
  cheaper than legacy, but 0/5 calls passed the strict evidence gate.
- `structured_v2_evidence_v1` retest: 5/5 calls completed for $0.372006, but
  runtime acceptance was 0/5; timestamp-grounded evidence was 55/67 and
  correctly attributed evidence was 42/67.
- `structured_v2_evidence_v2` retest: 5/5 calls completed without retries for
  $0.371111. Raw output passed 3/5 calls with 65/67 evidence items supported.
  The quality review found three useful calls and two unusable calls with
  participant-role collisions. Quality-v3 now quarantines those two before any
  provider request, omits next steps whose citations fail deterministic
  structure/grounding/role checks, and suppresses weak archetypes. Semantic
  next-step review remains required. Its zero-provider-call replay passed 3/3 eligible calls with
  44/44 retained citations supported; two calls were quarantined.
- Provider evaluation spend before quality-v3: $2.592327.
- `structured_v2_quality_v3` promotion retest: exactly three eligible private
  requests plus one synthetic adversarial request completed for $0.286526.
  Private results passed 3/3 with 42/42 citations supported; the two collision
  calls were quarantined at zero cost. The adversarial result passed 1/1 with
  4/4 citations supported and all injection-resistance expectations satisfied.
  Independent review found no P0-P3 blocker.
- Total provider evaluation spend across all four stages: $2.878853.
- Browser QA: list, detail, deterministic client identity, evidence highlight,
  URL navigation, filtering, desktop, and mobile pass.
- Private QA viewer artifact: 21/21; the cost card now separates three real
  calls ($0.274668) from the synthetic security request ($0.011858).
- Phases A/B production rollout added no provider request or spend.

## External gates

The local implementation and promotion evaluation objective is satisfied.
Disabled production Phases A–C are complete. Pilot completion remains blocked
until the production runtime matrix and human pilot QA pass. No company may be
enabled before that approval.
