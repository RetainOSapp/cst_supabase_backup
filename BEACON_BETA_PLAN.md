# Beacon Secure Beta Plan

> Operational correction — 2026-07-14: the active launch path is
> `BEACON_DIRECT_ROLLOUT.md`. Beacon will use the existing RetainOS Supabase
> project and existing production database. This longer document is retained as
> security/design reference; its separate-environment gates are not the active
> rollout sequence.

- Status: local secure-beta candidate under G1/G2 review; not deployment authority
- Created: 2026-07-13
- Branch: `codex/beacon-secure-rebuild`
- Pilot order: Ethical Scaling, then Moves Method

## Outcome

Beacon should become a read-only, server-orchestrated assistant over explicitly
approved RetainOS data capabilities. The browser may render chat and send the
signed-in user's Supabase access token, but it must never hold an AI provider
credential, decide authorization scope, execute Beacon data queries, or receive a
privileged database credential.

This document is the review gate for beta implementation, QA, pilot rollout,
production rollout, observability, and rollback. It does not authorize a database
migration, Supabase secret change, Edge Function deploy, Vercel deploy, provider
call, or production entitlement change.

## Current Evidence

- The worktree is isolated on `codex/beacon-secure-rebuild` at `6901938`, aligned
  with the current production `main` worktree. The quarantined prototype and
  `retainos-conversation-ai-scope.md` are intentional untracked files.
- `BEACON_PROTOTYPE_REFERENCE_DO_NOT_COMMIT/` is reference material only. Its
  provider call used a Vite-exposed key and browser SDK mode. The confirmed build
  artifact leak and the server-side rebuild requirement are recorded in
  `SECURITY_PERFORMANCE_AUDIT.md`.
- The isolated branch now contains a new browser UI, three Edge Function
  candidates, mock-backed Edge tests, and unapplied schema/assignment-ledger/RPC
  migration candidates. They are uncommitted, undeployed, disabled by default,
  and remain subject to integrated schema, grant, rollback, and role-matrix review.
- Useful prototype behavior is limited to product/UX ideas: a floating widget,
  suggested prompts, progress state, clear errors, New Chat, selected-company
  reset, internal client links, and conversation continuity across navigation.
- Current server foundations include JWT validation, a UUID-bound SuperAdmin
  registry, exact-origin CORS helpers, role/company resolution, role-aware RLS,
  actor-scoped aggregate RPCs, and audit-event patterns.
- Current app-owned client policy gives Director and Support company-wide client
  reads, gives CSM current primary/secondary-assignment reads, and denies Viewer
  raw client rows. It does not implement historical CSM authorization.
- Ethical Scaling and Moves Method are app-owned companies. The beta should not
  query mirror tables.

## Non-Negotiable Boundaries

1. Use OpenAI through a server-side `beacon-chat` Supabase Edge Function.
2. Store `OPENAI_API_KEY` only as a Supabase secret. Never use a `VITE_` AI key,
   send a provider key to the browser, log the key, or commit it.
3. Authenticate every request with the signed-in user's Supabase JWT and resolve
   the actor again on every turn. Browser roles, company IDs, member IDs, feature
   flags, models, tools, and limits are untrusted input.
4. Apply two independent gates on every request:
   - entitlement: a RetainOS SuperAdmin has enabled paid Beacon for the company;
   - authorization: the server determines what the signed-in actor may access.
5. Expose only fixed, read-only Beacon RPCs with typed arguments and shaped
   outputs. The model may never supply SQL, table names, column names, RPC names,
   PostgREST expressions, arbitrary filters, or database credentials.
6. Keep the model outside the authorization boundary. Tool results are authorized
   and minimized before they reach OpenAI; model text is never trusted to expand
   scope.
7. No write tools, task creation, profile updates, email, external web search,
   generic database search, or automated action in the beta.
8. Re-resolve entitlement, role, company membership, assignment, and company
   status for every turn. A previously valid chat never confers continuing access.
9. Set provider storage off for every Responses API call (`store: false`). Do not
   use provider-managed conversation state for the beta.
10. Fail closed: if identity, entitlement, role, target company, assignment,
    limiter state, tool schema, or provider behavior is ambiguous, do not call the
    provider or return data.

## Product Decisions — Approved 2026-07-13

Jay's answers resolve D1-D6 and authorize the isolated local implementation
candidate. They do not authorize secret setup, migration apply, deployment,
provider calls, or company enablement.

### D1. Historical CSM scope — ever-assigned rule approved

- An active CSM may access a client when the CSM is currently a primary/secondary
  assignee or the server can prove that the CSM was previously assigned to that
  same app-owned client UUID in the same company.
- Once assignment is proven, the active CSM keeps the same approved Phase A client
  scope after reassignment. Access is not limited to the assignment dates, but
  free-form client-history search remains excluded from Phase 1.
- An inactive/archived member or ended company membership loses all Beacon access.
  Historical assignment never crosses a company boundary.
- Missing, ambiguous, or merely inferred assignment history fails closed. Existing
  JSON before/after snapshots may support a reviewed backfill, but they are not an
  authorization ledger by themselves.
- Phase 1 evidence coverage is explicitly “current at ledger cutover, captured
  changes after cutover, plus reviewed corrections.” A pre-cutover former
  assignment that is not verifiable from approved app-owned evidence does not
  grant access; the beta never pretends that missing history is complete.

A candidate append-only assignment ledger/readiness migration now exists locally.
CSM Beacon remains off until migration review, current-state seed/readiness proof,
actor-scoped RPC enforcement, and current/former/never-assigned QA pass.

### D2. Support access — approved for Phase 1

Support receives Director-like company-wide visibility through the approved
operational Beacon tools, but no company administration, resource management,
custom definitions, auth/team emails, integrations, audits, AI entitlements, or
secrets. This is a deliberate Beacon policy and must not reuse the current browser
`canTriggerAiInsights` capability, which excludes Support.

Phase 1 Beacon is read-only for every role. A later Phase 2 may add bounded writes
for Director, Support, and CSM, but only as a separate security design with
per-action authorization, confirmation, idempotency, audit, and rollback. General
application write permission does not implicitly authorize a Beacon write tool;
this plan does not change anyone's normal non-Beacon application permissions.

### D3. Conversation retention — memory-only approved

- Keep display conversation state in application memory so it survives route
  navigation but not reload, sign-out, tab close, company switch, or New Chat.
- Do not store raw prompts, model answers, or raw tool results in usage/audit logs.
- Set `store: false` on OpenAI requests.
- Use metadata-only operational usage retention. The proposed 90-day detailed and
  13-month aggregate periods remain tunable operational/legal defaults, not a
  reason to persist chat content.

Persisted chat history can be a separate later feature with an explicit retention
and deletion policy.

### D4. Initial capability set — approved

Phase A is the read-only allow-list below. Free-form history search remains gated
on ever-assigned authorization, prompt-injection, privacy, and retention QA.

### D5. Model, budget, and environment — approved direction

- Default to pinned `gpt-5.4-mini-2026-03-17` with reasoning set to `none` for the
  pilot. It is the cost-efficient starting point for tool selection plus coherent
  operational answers. Keep model and reasoning configuration server-side.
- Run `gpt-5.4-nano` as a lower-cost challenger on the golden set. Promote it only
  if it meets the same correctness, tool-selection, and authorization invariants;
  do not use GPT-5.5 for this initial workload.
- Use a provisional one-time $25 hard cap for the Ethical Scaling beta and Jay's
  approved one-time $100 hard cap for the Moves Method pilot. Those caps run
  until exhausted. Phase 1 has no budget-reset action; a later reset/regrant must
  be a separately designed, audited SuperAdmin operation. Later paid plans may
  use recurring monthly feature allowances, such as $100/month for Beacon.
- Create a separate OpenAI project/key for `Beacon Beta` with a low provider-side
  spend limit. Store its key only as the Supabase `OPENAI_API_KEY` secret after a
  separately approved secret/deployment step.
- The repo does not prove that a separate Supabase staging project exists. The
  minimal safe path is local/static and provider-mock testing first, then the real
  production Edge Function deployed with the global control paused and every
  company entitlement off. After direct-denial proof, a supervised test window may
  activate the global control plus only Ethical Scaling's entitlement, starting
  with SuperAdmin access. No production-data provider test occurs until that
  deployment and window are separately reviewed. A distinct OpenAI production
  project/key should be introduced before broad rollout.

Official model references: [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
and [GPT-5.4 nano](https://developers.openai.com/api/docs/models/gpt-5.4-nano).

### D6. Configuration scope — no Beacon configuration tool in Phase 1

"Sanitized SuperAdmin configuration access" meant allowing Beacon itself to
answer selected questions about company configuration. That is not needed for the
read-only operational beta, so no configuration-query tool ships in Phase 1.

This is separate from the AI Features management screen. RetainOS SuperAdmins do
need a server-backed company control surface in the SaaS-client view, near
integrations, where every AI feature is independently enabled and independently
metered. It must not appear in the ordinary customer Admin Hub.

## Trust Boundaries And Request Flow

```text
Browser UI (untrusted scope hints)
  -> Authorization: Bearer <Supabase user JWT>
  -> beacon-chat Edge Function
       1. exact-origin and method checks
       2. apply the hard JSON-body cap and strict request schema
       3. validate JWT with Supabase Auth
       4. resolve UUID-bound SuperAdmin or one active app membership/company
       5. derive role/member/assignment authorization server-side
       6. for an authorized role, check global/company Beacon entitlement
       7. sanitize input and untrusted display history
       8. atomically reserve user + company quota
       9. apply input moderation/abuse controls
      10. call OpenAI Responses API with store=false and fixed tools
      11. execute only hardcoded, service-only actor-bound RPC dispatch; SQL
          independently revalidates the authenticated actor and company scope
      12. shape/cap tool results; never expose privileged rows
      13. enforce tool-round/output/time limits
      14. return one bounded JSON response with plain text, safe activity,
          server-derived internal links, and truncation state
      15. finalize metadata-only usage/cost event
```

Use one server-only service client inside `beacon-chat` after validating the
signed user JWT with Supabase Auth. The Edge layer adds only server-derived actor
and canonical member UUIDs to fixed tool calls; every tool RPC independently
re-resolves that identity, role, company, CSM ledger, entitlement, and global
control. The eight tool RPCs are not executable by `anon` or `authenticated`, so
the browser cannot bypass Beacon quota/usage handling to reach historical scope.
Never accept actor/company/role parameters from the model or browser. For
SuperAdmin View As, the submitted target company is a selector only;
the Edge Function must first prove the actor is a registered SuperAdmin and then
resolve the company independently.

The browser may submit only the latest user message and a bounded display history
of user/assistant text. The server reconstructs the system prompt and tool list,
rejects browser-supplied system/tool/function roles and provider response IDs, and
never accepts prior tool results from the browser. Display history is untrusted
conversation context, never authorization or proof that a previous lookup remains
valid.

## Local Server-Owned Candidate — Unapplied And Unverified

Names and exact contracts remain subject to migration and integration review.

### `company_ai_feature_entitlements`

One independent row per company and feature:

- `company_id`, `feature_key` (`beacon`, `call_analysis`,
  `sentiment_analysis`, `automated_summaries`, future workflows);
- `status` (`disabled`, `pilot`, `enabled`, `paused`);
- optional pilot/effective dates and a reference to the active allowance policy;
- `enabled_by_auth_user_id`, `enabled_at`, `paused_at`, timestamps;
- versioned server config metadata with no credentials.

Only a dedicated SuperAdmin server action may mutate this table. Enabling one
feature must never enable another.

### `company_ai_feature_allowances`

One independently enforceable commercial allowance per company/feature/meter:

- `company_id`, `feature_key`, version/effective dates;
- `meter_type` (`usd_cents`, `analysis_count`, `token_count`, or
  `request_count`) and integer `limit_value`;
- `period_type` (`one_time` or `monthly`), timezone/reset rule, current period;
- warning thresholds, hard-stop behavior, override reason/actor, timestamps.

Examples are Call AI at 100 analyses/month, Beacon at $100/month, and a future
Slack-data AI workflow at its own $100/month. The generic schema/control surface
can represent one unique allowance per meter for future features. Phase 1 Beacon
requires exactly one positive `usd_cents` allowance; multi-meter Beacon reservation
is not supported in this beta. Currency is stored as integer cents, never floating
point.

### `ai_feature_global_controls`

One server-owned status per feature supplies the incident kill switch. The
`beacon-chat` Edge Function checks it before company entitlement, and only an
authorized internal/SuperAdmin control path may change it. Browser visibility is
not the kill switch.

### `ai_usage_events`

Append-only per attempt/provider call:

- feature key, request/correlation ID, company, actor auth/member IDs, role;
- entitlement decision and denied/error category;
- pinned model, tool names, tool call/row counts, latency;
- input, cached input, output, and reasoning token categories when returned;
- price-card version and estimated cost in integer micros/cents;
- metered unit name and quantity for non-token AI features such as call analysis;
- provider request ID, provider status class, limiter bucket metadata;
- no raw key, prompt, answer, unrestricted tool payload, or client record.

### `ai_usage_period_totals`

Company/feature/meter/period aggregates provide fast allowance and cost
visibility. Detailed events remain the audit source; aggregates must reconcile to
them.

### `client_assignment_intervals`

Append-only authorization provenance:

- company UUID, app-owned client UUID, and app-owned member UUID; legacy IDs are
  provenance only, never the authorization join key;
- assignment kind (`primary`, `secondary`);
- `granted_at`, `revoked_at`, source, source event/audit ID;
- uniqueness/overlap rules and indexes for actor/client/time checks.

For the approved ever-assigned policy, any verified row is durable assignment
proof while the CSM membership remains active. The timestamps preserve provenance
and support future policy changes; they do not restrict Phase 1 access to the
historical interval.

### Atomic quota RPCs

One service-only atomic reserve/finalize path must prevent concurrent requests
from racing past limits. Rejected requests must not reach OpenAI. Rate-limit
responses use 429 plus a bounded `Retry-After` value.

## AI Features Control Surface

Add independently controlled AI feature cards in the RetainOS SuperAdmin company
view, adjacent to the existing integrations area.

- Render/fetch only when `mode === "super_admin"` and the server confirms the actor
  is a registered SuperAdmin.
- Do not render or fetch entitlements in ordinary `/admin`, even though both
  routes currently share `SaasClientDetail`.
- Use a dedicated `manage-ai-feature-entitlement` Edge Function with
  `requireSuperAdmin`; do not reuse Director-manageable company feature gates.
- The released Beacon card shows status, meter/period, limit, used value, warning
  thresholds, and pause/enable actions, with only its one enforced currency
  meter. The generic schema retains currency, analysis-count, token, and request
  vocabulary for later features, but Phase 1 renders their cards as non-editable
  “Coming soon” placeholders and SQL rejects their mutation until each feature's
  own reviewed release migration. Pilot timestamps and persistent last-error
  history remain observability UI follow-ups.
- Beacon UI visibility is a convenience derived from a server status check. A
  hidden or stale UI never replaces the `beacon-chat` entitlement check.
- Include a global server kill switch checked before company entitlement. It is
  operational containment, not a substitute for per-company entitlements.

## Authorization Matrix

| Capability | SuperAdmin | Director | Support | CSM | Viewer |
| --- | --- | --- | --- | --- | --- |
| Invoke entitled Beacon | Selected entitled company | Own entitled company | Own entitled company | Own entitled company after ledger QA | Deny |
| Company metrics | Company | Company | Company operational metrics | Authorized clients only | Deny |
| Client lists/signals | Company | Company | Company | Current or ever-assigned clients | Deny |
| One client brief | Allowed | Allowed | Allowed, shaped | Authorized client only | Deny |
| Team workload | All books | All books | All books | Own book only | Deny |
| Client history | Not in Phase 1 | Not in Phase 1 | Not in Phase 1 | Not in Phase 1; any later version still requires ever-assigned authorization | Deny |
| Operating configuration | Omit in Phase 1 | Omit in Phase 1 | Deny | Deny | Deny |
| AI entitlement management | Never a tool | Deny | Deny | Deny | Deny |

Every role decision is enforced server-side. Frontend capabilities control only
presentation. A role's "all" scope always means all data returned by the approved
tool allow-list; it never means arbitrary tables, columns, configuration, or
secrets.

## Allow-Listed Data Capabilities

Each tool maps one-to-one to a fixed `beacon_*` RPC or a very small fixed family.
RPC arguments use strict schemas, enums, bounded date windows, bounded integers,
and exact IDs. RPCs return selected columns only.

### Phase A

1. `company_metrics`
   - canonical counts/amounts already supported by actor-scoped aggregate logic;
   - CSM aggregates are limited to authorized clients.
2. `list_clients`
   - fixed filters: active program status, exact health state, exact CSM/member,
     safe name fragment, bounded result count, allow-listed sort;
   - compact rows; default 25 and hard maximum 50.
3. `list_renewals`
   - bounded 0-365 day window; current contract summary only.
4. `list_contract_gaps`
   - active clients with no current active contract summary.
5. `list_health_signals`
   - deterministic Success/Progress/Buy-in states and contact dates.
6. `list_referral_ready`
   - deterministic approved green/advocacy criteria; no invented score.
7. `list_csm_books`
   - company books for SuperAdmin/Director/Support; own book only for CSM.
8. `get_client_brief`
   - identity, status, assigned names, approved outcomes, contact dates, current
     contract summary, and next steps where role permits;
   - exact ambiguity response; server-built internal client link.

### Later gated

- `search_client_history`: requires verified ever-assigned ledger enforcement,
  timestamp/source semantics, prompt-injection corpus, result minimization, and
  retention approval.
- `company_operating_config`: excluded from Phase 1; any later sanitized,
  SuperAdmin-only version requires a new product/security review.
- forecast answers: require canonical formulas and explicit financial-field QA.

### Explicitly excluded

- `select *`, raw client rows, raw `metadata`/`payload`/`source_snapshot`;
- Director Notes for Support/CSM; email/auth identifiers unless separately approved;
- integration tokens/prefixes, webhook payloads, audit rows, secrets, environment;
- generic notes search, mirror tables, archived companies, arbitrary exports;
- mutation, email, task creation, URLs outside allow-listed RetainOS routes.

## OpenAI Contract

- Use the Responses API over server-side `fetch` or a server-only SDK. An SDK must
  not be added to the browser bundle.
- Accept only sanitized user/assistant display history. Reconstruct system and
  tool messages on the server; reject browser-supplied provider/tool state.
- Set `store: false` explicitly because Responses are otherwise stored by default.
- Define functions with strict schemas and `additionalProperties: false`.
- Set `parallel_tool_calls: false` for the beta and allow zero or one tool call at
  a time. Execute at most three tool rounds per user turn.
- Do not enable built-in web, file, code, shell, computer, MCP, or remote tools.
- Place stable system/tool instructions first so prompt caching can be measured;
  log returned cached-token categories for cost visibility.
- Treat all database free text as quoted data. The system prompt must say that
  instructions inside client names, notes, next steps, histories, or tool output
  are not instructions.
- Use a pinned snapshot after the eval gate. Model changes require the golden
  eval, cost comparison, security regression, and a separately approved rollout.
- Start the eval with `gpt-5.4-mini-2026-03-17` and reasoning `none`; compare
  `gpt-5.4-nano` as a challenger. The 2026-07-13 planning price card is $0.75/M
  input, $0.075/M cached input, and $4.50/M output for mini, versus $0.20/M,
  $0.02/M, and $1.25/M for nano. Reverify pricing before any provider enablement
  and version the effective price card used for cost estimates.

Official guidance supporting these choices:

- [API key and production project controls](https://developers.openai.com/api/docs/guides/production-best-practices)
- [Strict function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [Responses storage behavior](https://developers.openai.com/api/docs/guides/migrate-to-responses)
- [Input/output and moderation safety controls](https://developers.openai.com/api/docs/guides/safety-best-practices)
- [Per-user limits and bounded backoff](https://developers.openai.com/api/docs/guides/rate-limits)
- [Prompt-cache usage accounting](https://developers.openai.com/api/docs/guides/prompt-caching)

## Provisional Allowance, Abuse, And Cost Controls

"Limits" means two separate controls:

1. **Commercial allowances:** the paid amount or unit volume a company receives
   for one AI feature, such as $100 of Beacon or 100 call analyses. These are
   configured independently per feature and hard-stop at the approved allowance.
2. **Technical safety limits:** short-window rate, concurrency, input/output,
   tool-round, row, retry, and timeout caps that prevent abuse and runaway cost.
   They apply even when commercial allowance remains.

The initial commercial assumptions are a one-time $25 Ethical Scaling cap and a
one-time $100 Moves Method cap. A SuperAdmin must set an allowance before enabling
the feature. These technical values are safe provisional defaults to tune from
mock/eval and Ethical Scaling traffic; Jay does not need to select each one now:

- maximum user input: 2,000 characters;
- maximum retained context submitted per request: the latest 10 user/assistant
  messages total, capped at 2,000 characters each and 8,000 combined;
- maximum tool rounds: 3; one sequential tool call at a time;
- default/max returned rows per tool: 25/50;
- maximum answer output: 1,200 provider tokens and an 8,000-character server cap;
- maximum concurrent requests per user: 2;
- user request limits: 5/minute and 50/day;
- company request limits: 20/minute and a configured daily limit (initial review
  candidates: 250 for Ethical Scaling, 500 for Moves Method);
- provider timeout: 25 seconds; total Edge request budget: 35 seconds;
- at most one bounded provider 429/5xx retry with jitter; never retry ambiguous
  network failures, auth, schema, safety, entitlement, quota, or deterministic
  tool errors;
- warning thresholds are configurable from 1-99 (UI default 75% and 90%); 100% is
  the hard stop, while alert delivery remains a pre-pilot observability gate;
- reservations remain counted until an append-only finalization/expiration
  terminal exists. Reserve/finalize opportunistically sweep stale reservations;
  a reviewed service-authority sweep at least once per minute for enabled pilot
  companies is an additional pre-pilot dependency;
- a dispatched provider timeout, network failure, or successful response without
  trustworthy usage is marked cost-uncertain and conservatively consumes the
  full 50-cent reservation; ambiguous paid work can never release quota as zero;
- moderation/input policy before provider execution, plus response safety handling;
- denials/failures are categorized without conversation content and never consume
  provider quota; repeated-denial alerting remains a pre-pilot observability gate;
- never expose provider error bodies or database details to the browser.

## Threat Model

| Threat | Primary control | Required proof |
| --- | --- | --- |
| Provider key extraction | Supabase secret; server-only provider call | Bundle/source scan has no provider credential or SDK path |
| Body-supplied role/company | JWT + DB-bound role/member resolution each turn | Crafted role/member/company values cannot change scope |
| Cross-tenant confused deputy | independent company resolution, entitlement, service-only actor-bound RPCs | Company A gets zero Company B rows through every tool |
| Stale role/assignment/chat | re-resolve every turn; no state-based authority | reassignment/deactivation takes effect on next request |
| Prompt injection in user/DB text | fixed instructions, data quoting, strict tools, no built-ins | injection corpus cannot reveal/expand/execute |
| Model-generated query injection | hardcoded dispatch and typed RPCs | SQL/table/column/RPC/filter strings fail closed |
| Over-fetch/exfiltration | shaped RPC outputs, row/date/token caps | wide-read and pagination bypass tests fail |
| Support/config leakage | per-tool field policy beyond table RLS | Support cannot retrieve config/audit/Director Notes |
| Historical CSM overreach | verified ever-assigned ledger plus active membership | never-assigned/fabricated/cross-company denied; former/current allowed |
| Entitlement bypass | separate server-owned feature row | authorized role + disabled feature makes zero provider calls |
| Rate/cost race | atomic reservation and hard budgets | concurrent requests cannot exceed cap |
| Provider retention | `store: false`; no provider conversation state | mocked request asserts storage disabled |
| Sensitive logs | metadata-only events and field allow-list | raw prompt/tool/client values absent from DB/log output |
| Malicious links/Markdown | server-built internal links; safe renderer | external/script/data URLs are not rendered as active links |
| Denial of service | size/time/tool/concurrency limits | oversized, slow, cyclic, and retry-storm cases terminate |

## Test Matrix

| Layer | Required proof |
| --- | --- |
| Static/build | No provider key, privileged key, provider call, AI SDK, service-role path, or Beacon data query in browser code/bundle; quarantine outside tracked/build scope |
| Schema/RLS | Entitlements, allowances, usage, limiter, assignment ledger, indexes, grants, rollback, and generated types match reviewed contract |
| Authentication | Missing/invalid/expired JWT is 401; inactive/ambiguous membership is denied; UUID-bound SuperAdmin required |
| Entitlement | Off/paused/budget-exhausted company makes zero provider calls; features remain independent; global kill switch wins |
| Role | Full five-role matrix, including Support shaping, CSM current/secondary scope, Viewer denial, and SuperAdmin target-company validation |
| Isolation | Cross-company IDs, client IDs, names, stale chats, crafted RPC/tool args, and company switching cannot leak data |
| Historical CSM | Current/former primary or secondary allowed; never-assigned, inactive membership, cross-company, missing/ambiguous/imported proof denied |
| Tool boundary | Unknown/invented tools, SQL-like strings, arbitrary names/filters/sorts/limits, malformed schema, and extra properties fail closed |
| Correctness | Golden answers/counts match canonical roster/dashboard/contract results at date/status/filter boundaries |
| Prompt injection | Stored/client text that asks to ignore policy, call tools, reveal secrets, or follow links remains inert data |
| Provider loop | Mock success, refusal, malformed tool call, 4xx, 429, 5xx, timeout, stream disconnect, tool error, max rounds, max output |
| Rate/abuse | Atomic burst/day/budget limits, concurrency, oversized input/history, repeated failures, 429/Retry-After, no paid call after rejection |
| Usage/cost | Every paid call reconciles tokens/cost/latency/status; denials recorded; cache categories handled; raw content absent |
| UI | Bubble visibility, direct-endpoint authority, New Chat, route continuity, company reset, errors, limit state, keyboard and screen-reader basics |
| SuperAdmin UI | AI Features present only in SuperAdmin company view; absent and unfetched in `/admin`; each feature independently managed |
| Rollback | entitlement/global off produces zero new provider calls; Edge/frontend versions can roll back independently; logs remain available |

Use existing source-oriented `scripts/verify-security-*.mjs` patterns for static,
migration-order, role-policy, and rollback invariants. Add focused tests for pure
Edge helpers and provider mocks rather than using real provider calls in routine
CI. A browser E2E harness is a later tooling decision; the first beta still needs
documented manual role/keyboard/company-switch QA.

## QA Gates

No gate may be skipped because the UI appears to work.

1. **G0 — Product approval — passed 2026-07-13**
   - Jay approved D1-D6: ever-assigned CSM scope, Support operational scope,
     memory-only chat, read-only Phase A, delegated model selection, Moves' $100
     pilot cap, and an independently metered AI Features control surface.
   - Ethical Scaling's $25 one-time cap and the technical limits are explicit
     provisional defaults to tune during the controlled beta.
2. **G1 — Design/security review**
   - Sol approves migration/RLS/RPC/Edge contracts, threat model coverage,
     failure modes, and exact rollback artifacts before implementation merges.
3. **G2 — Local/static proof**
   - build, secret/bundle scan, type check, schema verifier, auth/entitlement/tool
     tests, provider mocks, usage/cost reconciliation, and rollback verifier pass.
4. **G3 — Non-production provider proof**
   - separate OpenAI project/key with low spend cap; synthetic or approved test
     data only; model snapshot and limits pinned from the golden eval.
5. **G4 — Ethical Scaling controlled pilot**
   - Beacon entitlement enabled only for Ethical Scaling; begin SuperAdmin-only,
     then Director/Support, then CSM only after assignment-ledger implementation
     and ever-assigned policy QA.
6. **G5 — Ethical Scaling observation/go-no-go**
   - success thresholds below hold for at least 7 calendar days and Jay signs off.
7. **G6 — Moves Method scale pilot**
   - separately enable Moves Method; repeat role/isolation suite and add scale,
     latency, rate-limit, concurrency, and cost review for at least 7 days.
8. **G7 — Production availability**
   - opt-in only, one company at a time; no default entitlement; observation and
     rollback owner named for every wave.

## Pilot Success Criteria

Required before advancing a pilot:

- 100% pass on role, entitlement, cross-company, assignment, and Viewer-negative
  tests; any leak or authorization ambiguity is an immediate stop;
- zero provider keys/AI SDK credentials/privileged paths in browser source/bundle;
- zero model-generated database queries and zero unrecognized tool execution;
- at least 95% of the approved golden question set is factually correct, with
  100% correctness on company, client identity, renewal dates, contract gaps, and
  counts used for decisions;
- answers disclose truncation/count limits and link only to authorized RetainOS
  records;
- at least 90% successful-answer rate excluding explicit user/safety denials;
- p95 end-to-end latency target <= 15 seconds for normal Phase A questions, with
  no request exceeding the hard total timeout;
- usage events reconcile to provider token usage and daily company totals;
- no raw prompts/tool results/client rows in operational logs;
- spend stays within the approved company budget and no single user creates an
  unexplained dominant share;
- Jay completes role-based UX QA and confirms the results are useful enough to
  keep the feature enabled.

## Observability And Alerts

Per company, actor role, model, tool, and release version, expose:

- requests accepted/denied/rate-limited/budget-blocked;
- success/refusal/error counts and provider status classes;
- p50/p95 total, provider, and tool latency;
- input/cached/output/reasoning tokens and estimated cost;
- tool call count, rows returned, truncation, and max-round stops;
- cost per successful answer and daily/monthly budget consumption;
- repeated auth/isolation/tool-schema denials by actor and a privacy-preserving
  request fingerprint.

Starting alert candidates:

- any cross-tenant/assignment invariant failure: global pause immediately;
- provider/server errors > 5% for 15 minutes;
- p95 latency > 15 seconds for 30 minutes;
- rate-limited requests > 10% for 15 minutes;
- configured company warning thresholds and the 100% hard stop;
- one actor > 20% of company daily cost or repeated denied attempts;
- missing usage finalization or token/cost reconciliation mismatch.

Detailed events should be queryable only by authorized internal operators.
Company customers see their feature status and high-level usage/cost, not other
companies, provider identifiers, internal denial details, or raw conversation data.

## Rollout

### Phase 0 — Decisions and contracts

Product direction D1-D6 is approved. Sol must still approve schemas, RPC outputs,
security contracts, model-eval rubric, implementation artifacts, environment
preflight, success thresholds, and rollback ownership before deployment.

### Phase 1 — Entitlement/usage foundation candidate

The isolated branch contains migration, rollback, SuperAdmin entitlement Edge, and
AI Features UI candidates. Complete exact RPC/grant/static verification and
runtime SQL review before any migration apply. Because the schema is intentionally
unapplied in this task, regenerate `src/types/supabase.ts` from the reviewed
database immediately after an approved apply and before any consumer is allowed
to depend on the new definitions. All controls default paused/disabled.

### Phase 2 — Server chat candidate

The isolated branch contains a mock-tested `beacon-chat` candidate with
JWT/company/entitlement/role boundaries, fixed dispatch, limits, usage finalization,
and a global kill switch. Keep the provider secret absent from local/CI flows and
all company entitlements off.

### Phase 3 — Phase A RPC integration and eval

Review and integrate the minimal app-owned actor-scoped RPC candidates. Complete the
golden corpus, five-role negative matrix, prompt-injection corpus, cost comparison,
and snapshot selection.

### Phase 4 — Ethical Scaling

After a separately approved deploy and secret setup, enable only Ethical Scaling.
Start SuperAdmin-only, then Director and Support. Enable CSM only after assignment
ledger data is trustworthy and all ever-assigned and never-assigned tests pass.

### Phase 5 — Moves Method

After Ethical Scaling's observation gate, separately enable Moves Method. Re-run
role/isolation tests against MM scale and observe performance/cost for at least
seven days before any broader enablement.

### Phase 6 — Controlled production rollout

Remain opt-in. Enable one reviewed company/wave, observe, then continue. Do not
bundle call analysis, sentiment, summaries, or other AI entitlements with Beacon.
Each feature has its own server gate, limits, cost reporting, QA, and rollback.

## Rollback And Incident Response

Rollback controls, fastest first:

1. set the global Beacon kill switch to paused so `beacon-chat` returns a generic
   unavailable response before provider or data access;
2. pause Beacon entitlement for the affected company or every company;
3. remove/hide the chat entry point through a frontend rollback, while retaining
   server denial as the authoritative control;
4. redeploy the last reviewed `beacon-chat` function version;
5. rotate/revoke `OPENAI_API_KEY` if exposure or provider-account abuse is
   suspected;
6. preserve additive schema and metadata-only usage logs for incident review;
   database down-migration is last resort after all callers are disabled.

Every rollout artifact must include exact preflight/postflight commands and a
matching rollback. Stop at the first failed gate; roll back only the failing wave
unless an isolation/key incident requires the global pause.

Post-rollback proof:

- zero new provider calls after the effective pause time;
- direct `beacon-chat` calls denied even if a stale UI remains open;
- normal RetainOS role/client reads and non-AI integrations still work;
- usage events identify the last accepted request and affected release version;
- key rotation, if used, is verified without printing or scanning the key value.

## Agent Responsibilities

- **Luna:** inventories, generated types and other mechanical changes, focused
  static/unit tests, fixtures, verification scripts, and documentation updates.
- **Terra:** bounded `beacon_*` RPC/query refactors and contained UI/component
  seams after Sol approves the interface and authorization contract.
- **Sol:** threat model, schema/RLS/authorization boundaries, provider/tool
  orchestration, security review, synthesis, pilot go/no-go, rollout, incident,
  and rollback decisions.

For bounded work, use the lowest-cost model that can reliably pass the task's
focused acceptance tests. Security-sensitive design, authorization changes,
cross-tenant review, release synthesis, rollout, and rollback remain Sol-owned and
receive the strongest available review. No subtask may expand its own data scope,
deploy, or change an entitlement.

## Local Implementation Boundary

Local implementation may continue under G1/G2 review. These artifacts alone do
not authorize migration apply, secret creation, Edge/Vercel deployment, provider
calls, company entitlement, or pilot rollout. Do not restore the prototype, add a
browser AI SDK/credential, or commit the quarantined reference.
