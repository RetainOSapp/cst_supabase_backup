# Call Intelligence V1 Completion Audit

Audit date: 2026-07-23
Branch: `codex/call-intelligence-v1`
Base: verified `origin/main` at `e096d48`
Production authorization: not granted

This audit distinguishes local implementation evidence from the external gates
that require a paid provider call or production change. A passing static check
is not treated as proof of production runtime behavior.

| Requirement | Status | Authoritative local evidence | Remaining evidence |
| --- | --- | --- | --- |
| Isolated workspace from production main | Proven locally | `/private/tmp/cst-call-intelligence-v1`; branch ancestry starts at `e096d48`; the original Pipeline worktree remains separate | None |
| Dedicated secure Fathom contract | Proven locally | `CALL_INTELLIGENCE_ZAPIER_CONTRACT.md`; contract parser and bounds tests | Pilot Zap delivery |
| Company-scoped token; no global fallback | Proven locally | `ingest-call-intelligence/index.ts`; Edge source gate | Invalid/valid token runtime probes after paused deploy |
| Separate call/transcript/participant storage | Proven as migration contract | foundation migration; DB verifier; rollback | Production migration apply/readback |
| One-client matching with multiple same-client/internal participants | Proven locally | matcher fixtures/tests | One real pilot call |
| Multi-client/no-client reconciliation | Proven locally | matcher fixtures/tests and management action source | One unknown and one multi-client pilot call |
| Provider-call deduplication and hash-drift conflict | Proven locally | unique DB contract, ingest duplicate path, source gates | Exact Zap replay plus altered-payload runtime probes |
| Transcript privacy | Proven locally | ignored private corpus, separate transcript table, metadata-only intake/audit, source/log scans | Production log inspection and role probes |
| Actor/tenant access | Proven as source/policy contract | RLS helper, management authorization, CSM company/assignment gate, Support read-only, Viewer denial | Production role/tenant runtime matrix |
| Automatic run dispatch | Proven locally | service-authenticated background dispatcher and dispatch tests | Paused/entitled runtime dispatch probes |
| Durable claim/dispatch/finalize lifecycle | Proven as migration/source contract | claim, dispatched marker, finalize RPC, non-retry provider test | Database transaction/runtime probes |
| Hard allowance and global pause | Proven as migration contract | locked claim, active hard USD allowance, reservation accounting, pause-on-overrun | Runtime allowance exhaustion/global-pause denial |
| Immutable price lineage and DB cost recomputation | Proven as migration contract | run/usage price fields, finalize recomputation, 52/52 DB contract | Runtime exact-cost finalization |
| Exact Glide prompt preservation | Proven locally | generated immutable `legacy_v1` prompt JSON/seed | Seed readback after migration |
| Structured V2 schema | Proven locally | strict Responses schema, post-provider exact-key/length/date validation, score arithmetic tests | Real transcript quality evaluation |
| Evidence grounding | Proven in harness | transcript quote-grounding scorer and evaluator tests | Paid private-corpus results |
| Legacy-vs-structured model evaluation | Harness proven; model run pending | synthetic/private dry-run manifests; cost/latency/schema/evidence/promotion aggregation | Execute 45-call Terra-medium private run, then selected challengers |
| On-demand prompts | Proven locally | seven company prompt seeds, authorized queue/dispatch path, real UI action | One pilot prompt result |
| Real Call Intelligence UI | Proven locally | actor-scoped management API; desktop 1440×1000 and mobile 320×900 browser QA; no horizontal overflow | Authenticated production pilot QA |
| Existing reconciliation preserved | Proven locally | `/call-ai` URL-tab implementation and frontend gate | Production navigation QA |
| No automatic client-profile writes | Proven locally | no client update path in ingest/manage/process; source gate | Pilot observation |
| Rollout and rollback | Documented | `CALL_INTELLIGENCE_ROLLOUT.md` and both pre-traffic SQL rollbacks | Execute only after approval |
| Production unchanged | Proven for this branch | no push/deploy/migration/token/entitlement/provider action in this worktree | Reconfirm immediately before rollout |

## Current verification matrix

- Edge/provider/dispatch tests: 14/14.
- Evaluation scorer tests: 3/3.
- Database/dependency/rollback contract: 53/53.
- Edge/source security: 33/33.
- Frontend/security/privacy: 19/19.
- TypeScript/Vite production build: pass.
- Synthetic evaluation manifest: 27 planned calls, dry-run only.
- Five-call private Fathom corpus: 253,045 characters, ignored by Git;
  45 planned Terra-medium calls, dry-run only.
- Browser QA: list, detail, URL navigation, filtering, desktop, and mobile pass.

## External gates

The local implementation objective is satisfied. Full end-to-end completion
remains unproven until:

1. a server-only OpenAI key and reviewed price card are available to the local
   private evaluator;
2. the paid private-corpus evaluation meets schema, grounding, attribution,
   injection, quality, latency, and cost promotion gates;
3. Jay explicitly approves the disabled-first production migration, paused
   function deployment, hidden frontend release, and Ethical Scaling pilot;
4. the production runtime matrix in the table above passes.
