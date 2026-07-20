# Pipeline Phase 3–4 Local Candidate Plan

Status: local candidate complete within the frozen implementation boundary. This plan does not authorize a
database migration, Edge Function deployment, company enablement, commit, push,
or production change.

## Phase 3 — Renewal Automation

- Materialize at most one open renewal item per eligible source contract when
  its fixed end date enters the configured renewal lead window.
- Require the company Pipeline gate, an enabled Renewal pipeline, an enabled
  first Open stage, an active app-owned client, and a non-archived contract.
- Exclude auto-renewing contracts unless the pipeline explicitly includes them.
  Contracts without an end date remain excluded because they have no renewal
  decision date; the month-to-month setting is reserved for a later explicit
  cadence design.
- Preserve `source_contract_id` as the expiring contract and use its value/date
  snapshot. The existing partial unique index supplies the idempotency boundary.
- A contract created from a Pipeline Won action closes that exact item in the
  same transaction. An independently created contract recorded as a renewal
  closes an open renewal item only when exactly one candidate exists; ambiguous
  candidates return a conflict before any write.
- Moving a client to Off-boarded closes their open Renewal items as Lost in the
  same transaction. Moving an item to Lost does not offboard the client; the UI
  presents a direct offboarding next step.
- Task templates may target a Pipeline stage. A task is created once per
  template and stage event, linked through metadata to the client, Pipeline item,
  stage event, and template.

## Phase 4 — Bounded Expansion Foundation

- Expansion items support an optional target pathway/offer and expected close
  date without replacing the client's current journey.
- Client Detail receives a small Add expansion opportunity entry point only when
  Pipeline and an Expansion definition are enabled.
- An Expansion Won action may create an add-on contract and close the exact item
  atomically. It may offer the existing secondary pathway capability; it does
  not invent a tertiary pathway or replace the primary pathway.
- Independently created add-on/upsell contracts close an Expansion item only
  when the request identifies the exact Pipeline item. No fuzzy automatic
  matching is allowed for expansion.

## Explicit Deferrals

- Tertiary or arbitrary concurrent pathways/offers.
- Automatic primary-pathway replacement.
- Month-to-month synthetic renewal cadence.
- Daily Pulse consumption, dashboard conversion funnels, weighted forecasts,
  health scoring, email/Slack reminders, and AI analysis.
- Production scheduler registration or any environment action.

## Completion Gates

1. Phase 3 migration/rollback, server boundaries, prototype, verifier, build,
   and independent P0/P1 review pass before Phase 4 integration begins.
2. Phase 4 remains limited to target-offer capture, safe opportunity entry, and
   Won/add-on resolution using existing secondary-pathway behavior.
3. The resettable local sandbox demonstrates every new user-visible state with
   no Supabase access and remains excluded from the production build.
4. Environment/runtime, role-account, scheduler, and real-data checks remain in
   the QA handoff as not run.

## Local Completion — 2026-07-15

- Phase 3 completed before Phase 4 integration resumed.
- The resettable sandbox covers renewal scan/idempotency, exact and ambiguous
  contract synchronization, renewal-only offboarding reconciliation, stage-task
  idempotency, explicit automation configuration, and guided Won/Lost flows.
- The bounded Phase 4 foundation covers optional target offers, safe Client
  Detail opportunity entry, item deep links, and add-on Won contracts without
  primary-pathway or primary-contract-summary replacement.
- Live SQL, Edge, role, scheduler, and company QA remain separately gated.
