import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath =
  "supabase/migrations/20260723200000_call_intelligence_v1_foundation.sql";
const rollbackPath =
  "supabase/rollbacks/20260723200000_call_intelligence_v1_foundation.sql";
const configPath = "supabase/config.toml";

const [migration, rollback, config] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile(rollbackPath, "utf8"),
  readFile(configPath, "utf8"),
]);

const checks = [
  ["separate calls table", /create table if not exists public\.call_intelligence_calls/],
  ["separate transcript table", /create table if not exists public\.call_intelligence_transcripts/],
  ["participant table", /create table if not exists public\.call_intelligence_participants/],
  ["immutable prompt versions", /create table if not exists public\.call_intelligence_prompt_definitions/],
  ["run state table", /create table if not exists public\.call_intelligence_runs/],
  ["automation usage ledger", /create table if not exists public\.call_intelligence_usage_events/],
  ["provider deduplication", /unique \(company_id, provider, provider_call_id\)/],
  ["intake event linkage", /integration_intake_event_id uuid unique/],
  ["transcript upper bound", /length\(transcript_text\) between 1 and 500000/],
  ["multi-client reconciliation state", /'needs_reconciliation'/],
  ["usage user attribution rule", /trigger_kind = 'user' and actor_auth_user_id is not null/],
  ["read helper is security definer", /function public\.can_read_call_intelligence_call[\s\S]+security definer/],
  ["CSM company flag", /enable_call_ai_for_csms = true/],
  ["CSM assignment restriction", /csm_secondary_assignee_id = any/],
  ["Support cannot read reconciliation", /current_actor_app_policy_role\(\) = 'support'[\s\S]+target_match_status = 'matched'/],
  ["RLS on calls", /alter table public\.call_intelligence_calls enable row level security/],
  ["RLS on transcripts", /alter table public\.call_intelligence_transcripts enable row level security/],
  ["usage remains server-only", /revoke all on public\.call_intelligence_usage_events from anon, authenticated/],
  ["claim RPC", /function public\.claim_call_intelligence_run/],
  ["global feature gate", /feature_key = 'call_analysis'[\s\S]+v_control\.status <> 'active'/],
  ["company entitlement gate", /v_entitlement\.status not in \('pilot', 'enabled'\)/],
  ["hard allowance gate", /v_consumed_micros \+ v_reserved_micros \+ p_reserved_cost_micros/],
  ["dispatch ambiguity marker", /function public\.mark_call_intelligence_run_dispatched/],
  ["ambiguous dispatch is not retried", /'ambiguous_provider_dispatch'/],
  ["server finalization RPC", /function public\.finalize_call_intelligence_run/],
  ["cost overrun pauses feature", /actual cost exceeded reservation/],
  ["immutable price lineage", /price_card_version text not null/],
  ["database cost recomputation", /v_recomputed_cost_micros[\s\S]+cost does not match price lineage/],
  ["pre-traffic rollback warning", /PRE-TRAFFIC \/ DISPOSABLE-ENVIRONMENT rollback only/],
  ["rollback drops usage first", /drop table if exists public\.call_intelligence_usage_events/],
  ["JWT-off inbound function", /\[functions\.ingest-call-intelligence\]\s+verify_jwt = false/],
  ["JWT-on management function", /\[functions\.manage-call-intelligence\]\s+verify_jwt = true/],
  ["JWT-on worker function", /\[functions\.process-call-intelligence\]\s+verify_jwt = true/],
];

let passed = 0;
for (const [label, pattern] of checks) {
  const source = label.includes("rollback")
    ? rollback
    : label.includes("JWT-")
      ? config
      : migration;
  assert.match(source, pattern, label);
  passed += 1;
}

assert.doesNotMatch(
  migration,
  /sk-[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9._-]{20,}/,
  "migration must not contain credentials",
);
passed += 1;
assert.doesNotMatch(
  migration,
  /\bor\s*\(\s*or\s*\(/i,
  "RLS predicates must not contain duplicated OR branches",
);
passed += 1;
assert.doesNotMatch(
  migration,
  /processing_attempts\s*=\s*processing_attempts\s*\+\s*1,\s*processing_attempts\s*=/i,
  "claim updates must not assign processing_attempts twice",
);
passed += 1;

console.log(`Call Intelligence database contract: ${passed}/${checks.length + 3} passed`);
