import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const migrationPath =
  "supabase/migrations/20260723200000_call_intelligence_v1_foundation.sql";
const rollbackPath =
  "supabase/rollbacks/20260723200000_call_intelligence_v1_foundation.sql";
const promptSeedPath =
  "supabase/migrations/20260723201000_call_intelligence_prompt_seed.sql";
const promptSeedRollbackPath =
  "supabase/rollbacks/20260723201000_call_intelligence_prompt_seed.sql";
const adminPolicyReleasePath =
  "supabase/migrations/20260724160000_call_intelligence_admin_policy_release.sql";
const adminPolicyRollbackPath =
  "supabase/rollbacks/20260724160000_call_intelligence_admin_policy_release.sql";
const allowanceRoundingFixPath =
  "supabase/migrations/20260724161000_ai_allowance_zero_rounding_fix.sql";
const allowanceRoundingRollbackPath =
  "supabase/rollbacks/20260724161000_ai_allowance_zero_rounding_fix.sql";
const esManualPilotPath =
  "supabase/migrations/20260724162000_enable_es_call_intelligence_manual_pilot.sql";
const esManualPilotRollbackPath =
  "supabase/rollbacks/20260724162000_enable_es_call_intelligence_manual_pilot.sql";
const configPath = "supabase/config.toml";
const generatedTypesPath = "src/types/supabase.ts";
const aiFoundationPath =
  "supabase/migrations/20260714010000_ai_feature_foundation.sql";
const aiServiceRpcPath =
  "supabase/migrations/20260714012000_beacon_service_rpcs.sql";
const roleAuthorityPath =
  "supabase/migrations/20260713010000_security_phase1a_role_authority.sql";
const companyReadPolicyPath =
  "supabase/migrations/20260713021000_security_phase1b_company_reads.sql";

const [
  migration,
  rollback,
  promptSeed,
  promptSeedRollback,
  adminPolicyRelease,
  adminPolicyRollback,
  allowanceRoundingFix,
  allowanceRoundingRollback,
  esManualPilot,
  esManualPilotRollback,
  config,
  generatedTypes,
  aiFoundation,
  aiServiceRpcs,
  roleAuthority,
  companyReadPolicy,
] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile(rollbackPath, "utf8"),
  readFile(promptSeedPath, "utf8"),
  readFile(promptSeedRollbackPath, "utf8"),
  readFile(adminPolicyReleasePath, "utf8"),
  readFile(adminPolicyRollbackPath, "utf8"),
  readFile(allowanceRoundingFixPath, "utf8"),
  readFile(allowanceRoundingRollbackPath, "utf8"),
  readFile(esManualPilotPath, "utf8"),
  readFile(esManualPilotRollbackPath, "utf8"),
  readFile(configPath, "utf8"),
  readFile(generatedTypesPath, "utf8"),
  readFile(aiFoundationPath, "utf8"),
  readFile(aiServiceRpcPath, "utf8"),
  readFile(roleAuthorityPath, "utf8"),
  readFile(companyReadPolicyPath, "utf8"),
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
  [
    "rollback drops current claim signature",
    /claim_call_intelligence_run\(\s*uuid, text, text, bigint, text, bigint, bigint, bigint\s*\)/,
  ],
  ["JWT-off inbound function", /\[functions\.ingest-call-intelligence\]\s+verify_jwt = false/],
  ["JWT-on management function", /\[functions\.manage-call-intelligence\]\s+verify_jwt = true/],
  ["JWT-on worker function", /\[functions\.process-call-intelligence\]\s+verify_jwt = true/],
];

assert.match(
  promptSeed,
  /structured_v2_quality_v4/,
  "prompt seed uses current structured version",
);
assert.match(
  promptSeedRollback,
  /structured_v2_quality_v4/,
  "prompt seed rollback removes current structured version",
);

const adminPolicyChecks = [
  [
    "admin policy releases only Beacon and Call Intelligence",
    adminPolicyRelease,
    /p_feature_key not in \('beacon', 'call_analysis'\)/,
  ],
  [
    "admin policy keeps other features fail closed",
    adminPolicyRelease,
    /Only released AI features may be configured/,
  ],
  [
    "admin policy requires the installed guard",
    adminPolicyRelease,
    /Expected AI Features release guard was not found/,
  ],
  [
    "admin policy rollback restores Beacon-only management",
    adminPolicyRollback,
    /p_feature_key <> 'beacon'/,
  ],
  [
    "admin policy rollback preserves operational rows",
    adminPolicyRollback,
    /preserving existing[\s\S]+entitlement, allowance, usage, and audit rows/,
  ],
  [
    "zero usage uses integer consumed division",
    allowanceRoundingFix,
    /sum\(event\.actual_cost_micros\), 0\)::bigint \+ 9999\) \/ 10000/,
  ],
  [
    "zero usage uses integer reserved division",
    allowanceRoundingFix,
    /sum\(reservation\.reserved_cost_micros\), 0\)::bigint \+ 9999\) \/ 10000/,
  ],
  [
    "zero-usage correction is reversible",
    allowanceRoundingRollback,
    /v_buggy_consumed[\s\S]+v_buggy_reserved/,
  ],
  [
    "ES pilot starts tokenless",
    esManualPilot,
    /integration_type = 'call_ai_transcript'[\s\S]+pilot must begin without tokens or traffic/,
  ],
  [
    "ES pilot has one-dollar hard stop",
    esManualPilot,
    /limit_value = 100[\s\S]+allowance\.hard_stop/,
  ],
  [
    "ES pilot is the only enabled company",
    esManualPilot,
    /company_id <> v_company_id[\s\S]+status in \('pilot', 'enabled'\)/,
  ],
  [
    "ES pilot source is authenticated manual upload",
    esManualPilot,
    /'pilot_source', 'authenticated_manual_upload'/,
  ],
  [
    "ES pilot rollback pauses global before closing company policy",
    esManualPilotRollback,
    /update public\.ai_feature_global_controls[\s\S]+update public\.company_ai_feature_entitlements[\s\S]+update public\.company_ai_feature_allowances/,
  ],
  [
    "ES pilot rollback preserves evidence",
    esManualPilotRollback,
    /Preserve call,[\s\S]+transcript, run, usage, and audit evidence/,
  ],
];

function generatedTableBlock(name) {
  const marker = `      ${name}: {`;
  const start = generatedTypes.indexOf(marker);
  assert.notEqual(start, -1, `generated types must contain ${name}`);
  const nextTable = generatedTypes
    .slice(start + marker.length)
    .search(/^      [a-z0-9_]+: \{$/m);
  return nextTable < 0
    ? generatedTypes.slice(start)
    : generatedTypes.slice(start, start + marker.length + nextTable);
}

const companySecretTypes = generatedTableBlock("company_integration_secrets");
const intakeEventTypes = generatedTableBlock("integration_intake_events");
const clientTypes = generatedTableBlock("clients");
const companySettingTypes = generatedTableBlock("company_settings");

let passed = 0;
passed += 2;
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

const dependencyChecks = [
  [
    "company token hash dependency",
    companySecretTypes,
    /token_hash: string/,
  ],
  [
    "company token usage dependency",
    companySecretTypes,
    /last_used_from: string \| null/,
  ],
  [
    "intake external event dependency",
    intakeEventTypes,
    /external_event_id: string \| null/,
  ],
  [
    "intake match dependency",
    intakeEventTypes,
    /matched_client_id: string \| null/,
  ],
  [
    "client secondary identity dependency",
    clientTypes,
    /client_email_secondary: string \| null/,
  ],
  [
    "client tertiary identity dependency",
    clientTypes,
    /client_email_tertiary: string \| null/,
  ],
  [
    "client primary assignment dependency",
    clientTypes,
    /csm_team_member_id: string \| null/,
  ],
  [
    "client secondary assignment dependency",
    clientTypes,
    /csm_secondary_assignee_id: string \| null/,
  ],
  [
    "company setting dependency",
    companySettingTypes,
    /enable_call_ai_for_csms: boolean/,
  ],
  [
    "global AI control dependency",
    aiFoundation,
    /create table if not exists public\.ai_feature_global_controls[\s\S]+max_reserve_cost_micros_per_request/,
  ],
  [
    "AI entitlement dependency",
    aiFoundation,
    /create table if not exists public\.company_ai_feature_entitlements/,
  ],
  [
    "AI allowance dependency",
    aiFoundation,
    /create table if not exists public\.company_ai_feature_allowances[\s\S]+meter_type[\s\S]+limit_value/,
  ],
  [
    "allowance period dependency",
    aiServiceRpcs,
    /create or replace function public\.beacon_allowance_period/,
  ],
  [
    "super-admin policy dependency",
    roleAuthority,
    /create or replace function public\.is_retainos_super_admin_bound/,
  ],
  [
    "actor company policy dependency",
    companyReadPolicy,
    /create or replace function public\.current_actor_app_policy_company_id/,
  ],
  [
    "actor role and member policy dependencies",
    companyReadPolicy,
    /current_actor_app_policy_role[\s\S]+current_actor_app_policy_member_ids/,
  ],
];

for (const [label, source, pattern] of dependencyChecks) {
  assert.match(source, pattern, label);
  passed += 1;
}

for (const [label, source, pattern] of adminPolicyChecks) {
  assert.match(source, pattern, label);
  passed += 1;
}

execFileSync(
  process.execPath,
  ["scripts/sync-call-intelligence-structured-seed.mjs", "--check"],
  { stdio: "pipe" },
);
passed += 1;

console.log(
  `Call Intelligence database contract: ${passed}/${checks.length + 6 + dependencyChecks.length + adminPolicyChecks.length} passed`,
);
