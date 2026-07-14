import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const migrationNames = [
  "20260714010000_ai_feature_foundation.sql",
  "20260714011000_beacon_assignment_ledger.sql",
  "20260714012000_beacon_service_rpcs.sql",
  "20260714013000_beacon_phase_a_read_rpcs.sql",
  "20260714014000_beacon_assignment_readiness_active_csm.sql",
  "20260714015000_beacon_admin_feature_conflict_fix.sql",
  "20260714016000_beacon_role_controls_and_aggregate_cost.sql",
  "20260714017000_beacon_nano_price_lineage.sql",
  "20260714018000_beacon_reservation_model_binding.sql",
  "20260714019000_beacon_natural_language_queries.sql",
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const migrations = Object.fromEntries(
  migrationNames.map((name) => [
    name,
    read(`supabase/migrations/${name}`),
  ]),
);
const rollbacks = Object.fromEntries(
  migrationNames.map((name) => [
    name,
    read(`supabase/rollbacks/${name}`),
  ]),
);
const foundation = migrations[migrationNames[0]];
const assignments = migrations[migrationNames[1]];
const service = migrations[migrationNames[2]];
const reads = migrations[migrationNames[3]];
const readinessCorrection = migrations[migrationNames[4]];
const adminConflictCorrection = migrations[migrationNames[5]];
const roleCostCorrection = migrations[migrationNames[6]];
const nanoPriceLineage = migrations[migrationNames[7]];
const reservationModelBinding = migrations[migrationNames[8]];
const naturalLanguageQueries = migrations[migrationNames[9]];
const allSql = Object.values(migrations).join("\n");
const contracts = read("supabase/functions/beacon-chat/_shared/contracts.mjs");
const database = read("supabase/functions/beacon-chat/_shared/database.mjs");
const provider = read("supabase/functions/beacon-chat/_shared/provider.mjs");
const toolSource = read("supabase/functions/beacon-chat/_shared/tools.mjs");
const usageTableDefinition = foundation.slice(
  foundation.indexOf("create table if not exists public.ai_usage_events"),
  foundation.indexOf("comment on table public.ai_usage_events"),
);

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

function occurrences(source, fragment) {
  return source.split(fragment).length - 1;
}

function functionBody(source, name) {
  const marker = `create or replace function public.${name}`;
  const start = source.indexOf(marker);
  if (start < 0) return "";
  const end = source.indexOf("$$;", start);
  return end < 0 ? "" : source.slice(start, end + 3);
}

for (const name of migrationNames) {
  check(`${name} has a rollback`, Boolean(rollbacks[name]));
  check(
    `${name} has balanced dollar-quote delimiters`,
    occurrences(migrations[name], "$$") % 2 === 0,
  );
  check(
    `${name} rollback has balanced dollar-quote delimiters`,
    occurrences(rollbacks[name], "$$") % 2 === 0,
  );
}

const requiredTables = [
  "company_ai_feature_entitlements",
  "company_ai_feature_allowances",
  "ai_feature_global_controls",
  "ai_usage_events",
  "ai_usage_period_totals",
];
check(
  "all AI foundation tables are additive",
  requiredTables.every((name) =>
    foundation.includes(`create table if not exists public.${name}`)
  ),
);
check(
  "assignment evidence table is additive",
  assignments.includes(
    "create table if not exists public.client_assignment_intervals",
  ),
);
check(
  "all feature defaults fail closed",
  foundation.includes("status text not null default 'disabled'") &&
    foundation.includes("status text not null default 'paused'") &&
    foundation.includes("('beacon', 'paused'") &&
    !/\bOPENAI_API_KEY\b|sk-[A-Za-z0-9_-]+/.test(allSql),
);
check(
  "management RPC uses an unambiguous entitlement conflict target",
  adminConflictCorrection.includes(
    "on conflict on constraint company_ai_feature_entitlements_pkey do update",
  ) &&
    adminConflictCorrection.includes(
      "public.beacon_admin_update_ai_feature(uuid,uuid,text,text,jsonb)",
    ),
);
check(
  "meter vocabulary matches the Edge contract with no usd_micros drift",
  !allSql.includes("usd_micros") &&
    ["usd_cents", "analysis_count", "token_count", "request_count"]
      .every((meter) => foundation.includes(`'${meter}'`)),
);
check(
  "active allowance policies are always hard-stop",
  foundation.includes("check (status <> 'active' or hard_stop)"),
);
check(
  "allowance policy versions use immutable lineages",
  foundation.includes("policy_lineage_id uuid not null") &&
    foundation.includes("lineage_started_at timestamptz not null") &&
    foundation.includes(
      "new.policy_lineage_id is distinct from old.policy_lineage_id",
    ) &&
    service.includes("Allowance period type cannot change after usage has started") &&
    service.includes("version.policy_lineage_id = target.policy_lineage_id"),
);
check(
  "period totals have one server-owned row per lineage period",
  foundation.includes("unique (policy_lineage_id, period_start, period_end)") &&
    foundation.includes("v_allowance.policy_lineage_id <> new.policy_lineage_id") &&
    service.includes(
      "on conflict (policy_lineage_id, period_start, period_end) do update",
    ),
);
check(
  "usage ledger is content-free, append-only, and category-complete",
  foundation.includes("reasoning_tokens integer not null") &&
    foundation.includes("total_tokens = input_tokens + output_tokens") &&
    foundation.includes("ai_usage_events_append_only") &&
    foundation.includes("pg_column_size(limiter_metadata) <= 2048") &&
    !/\b(prompt|answer|response_text|tool_result|customer_content)\s+(?:text|jsonb)/i
      .test(usageTableDefinition),
);
check(
  "usage terminal events structurally bind to their reservation",
  foundation.includes("v_reservation.request_id <> new.request_id") &&
    foundation.includes("v_reservation.company_id <> new.company_id") &&
    foundation.includes("v_reservation.actor_auth_user_id <> new.actor_auth_user_id") &&
    foundation.includes("v_reservation.allowance_id is distinct from new.allowance_id") &&
    foundation.includes("v_reservation.price_card_version is distinct from new.price_card_version") &&
    foundation.includes("Late finalization requires an existing expiration terminal"),
);

check(
  "assignment evidence enforces same-company CSM identity and append-only revisions",
  assignments.includes("v_client_company_id <> new.company_id") &&
    assignments.includes("v_member_company_id <> new.company_id") &&
    assignments.includes("v_member_role <> 'csm'") &&
    assignments.includes("v_previous.proof_key <> new.proof_key") &&
    assignments.includes("client_assignment_intervals_append_only"),
);
check(
  "assignment inserts serialize duplicate-proof checks",
  functionBody(assignments, "beacon_validate_assignment_interval_insert")
    .includes("pg_advisory_xact_lock"),
);
check(
  "current assignment seed and forward trigger use exact legacy member mapping",
  assignments.includes("'current_state_seed'") &&
    assignments.includes("clients_capture_beacon_assignment_insert") &&
    assignments.includes("clients_capture_beacon_assignment_update") &&
    assignments.includes("member.legacy_glide_row_id = slot.assignment_value") &&
    assignments.includes("having count(*) = 1") &&
    !assignments.includes("backup_company"),
);
check(
  "client company changes are forbidden before assignment evidence can cross tenants",
  assignments.includes("clients_forbid_company_change") &&
    assignments.includes("clients.company_id is immutable"),
);
check(
  "verified assignment corrections require bound reviewer provenance",
  assignments.includes("new.source = 'verified_correction'") &&
    assignments.includes("public.retainos_super_admins") &&
    assignments.includes("review_reason"),
);
check(
  "ledger coverage truthfully starts at cutover and does not infer older history",
  occurrences(
    assignments,
    "current_at_cutover_plus_forward_and_verified_corrections",
  ) >= 2 && assignments.includes("'historical_inference', false"),
);
check(
  "readiness ignores exact ineligible members but fails closed on missing, ambiguous, or unverified active CSM evidence",
  readinessCorrection.includes("count(member.id) as member_matches") &&
    readinessCorrection.includes("as active_csm_matches") &&
    readinessCorrection.includes("checked.member_matches <> 1") &&
    readinessCorrection.includes("checked.active_csm_matches = 1") &&
    readinessCorrection.includes("and not checked.verified_open") &&
    readinessCorrection.includes("'historical_inference', false"),
);

const serviceRpcNames = [
  "beacon_resolve_access_context",
  "beacon_feature_gate_status",
  "beacon_reserve_usage",
  "beacon_finalize_usage",
  "beacon_admin_list_ai_features",
  "beacon_admin_update_ai_feature",
  "beacon_role_access_allowed",
  "beacon_admin_get_ai_feature_access",
  "beacon_admin_update_ai_feature_access",
];
const readRpcNames = [
  "beacon_company_metrics",
  "beacon_list_clients",
  "beacon_list_renewals",
  "beacon_list_contract_gaps",
  "beacon_list_health_signals",
  "beacon_list_referral_ready",
  "beacon_list_csm_books",
  "beacon_get_client_brief",
];
check(
  "Edge SQL_CONTRACT contains all 17 exact RPC names",
  [...serviceRpcNames, ...readRpcNames].every((name) =>
    contracts.includes(`"${name}"`)
  ),
);
check(
  "database defines all 17 exact Edge RPC names",
  serviceRpcNames.every((name) =>
    allSql.includes(`create or replace function public.${name}`)
  ) && readRpcNames.every((name) =>
    reads.includes(`create or replace function public.${name}`)
  ),
);
check(
  "company selector resolution fails closed on cross-column ambiguity",
  service.includes("company_candidates as") &&
    service.includes("count(*) over () as match_count") &&
    service.includes("where candidate.match_count = 1"),
);
check(
  "management RPCs independently require UUID-bound active SuperAdmin",
  [
    [service, "beacon_admin_list_ai_features"],
    [service, "beacon_admin_update_ai_feature"],
    [roleCostCorrection, "beacon_admin_get_ai_feature_access"],
    [roleCostCorrection, "beacon_admin_update_ai_feature_access"],
  ].every(([source, name]) => {
    const body = functionBody(source, name);
    return body.includes("admin.auth_user_id = p_actor_auth_user_id") &&
      body.includes("admin.status = 'active'");
  }),
);
check(
  "company role access is server-owned with SuperAdmin implicit and Viewer denied",
  roleCostCorrection.includes("allowed_roles text[] not null") &&
    roleCostCorrection.includes("when p_actor_role = 'super_admin' then true") &&
    roleCostCorrection.includes("when p_actor_role = 'viewer' then false") &&
    roleCostCorrection.includes("public.beacon_role_access_allowed(") &&
    database.includes("roleAccessAllowed: roleAccess === true"),
);
check(
  "commercial usage rounds aggregate provider micros instead of each request",
  roleCostCorrection.includes("sum(event.actual_cost_micros)") &&
    roleCostCorrection.includes("sum(reservation.reserved_cost_micros)") &&
    !roleCostCorrection.includes("v_new_consumed constant text := 'select sum(event.actual_meter_value)'")
);
check(
  "management update versions and audits policy without accepting usage",
  service.includes("status = 'superseded'") &&
    service.includes("allowance.policy_version") &&
    service.includes("ai_feature_policy_updated") &&
    !functionBody(service, "beacon_admin_update_ai_feature")
      .includes("used_value"),
);
check(
  "Phase 1 management lists future cards but mutates Beacon only",
  service.includes("('call_analysis'::text, 2)") &&
    service.includes("('sentiment_analysis'::text, 3)") &&
    service.includes("('automated_summaries'::text, 4)") &&
    service.includes("('slack_data'::text, 5)") &&
    functionBody(service, "beacon_admin_update_ai_feature")
      .includes("if p_feature_key <> 'beacon' then") &&
    functionBody(service, "beacon_admin_update_ai_feature")
      .includes("Only Beacon may be configured in Phase 1"),
);
check(
  "Beacon executable policy is exactly one positive usd_cents allowance",
  service.includes("Beacon requires exactly one usd_cents allowance while enabled") &&
    service.includes("Beacon currently supports only a usd_cents allowance") &&
    service.includes("v_limit_value < 1"),
);

const reserve = functionBody(service, "beacon_reserve_usage");
const finalize = functionBody(service, "beacon_finalize_usage");
const expire = functionBody(service, "beacon_expire_usage_reservations");
const snapshot = functionBody(service, "beacon_allowance_usage_snapshot");
check(
  "quota reservation is atomic, idempotent, actor-bound, and DB-capped",
  reserve.includes("pg_advisory_xact_lock") &&
    reserve.includes("duplicate_request_mismatch") &&
    reserve.includes("p_reserved_cost_micros <> 500000") &&
    reserve.includes("p_reserved_cost_micros > v_control.max_reserve_cost_micros_per_request") &&
    foundation.includes("max_reserve_cost_micros_per_request bigint not null default 500000") &&
    contracts.includes("maxReservedCostMicros: 500_000") &&
    reserve.includes("member.auth_user_id = p_actor_auth_user_id") &&
    reserve.includes("v_actor_role <> p_actor_role"),
);
check(
  "quota enforcement derives finalized and active reserved usage from events",
  snapshot.includes("version.policy_lineage_id = target.policy_lineage_id") &&
    snapshot.includes("'late_finalization'") &&
    snapshot.includes("'expiration'") &&
    snapshot.includes("not exists") &&
    !snapshot.includes("reservation.reservation_expires_at >"),
);
check(
  "reservation expiry is an explicit locked terminal transition",
  reserve.includes("beacon_expire_usage_reservations") &&
    finalize.includes("beacon_expire_usage_reservations") &&
    expire.includes("'expiration'") &&
    expire.includes("v_reservation.reserved_meter_value") &&
    expire.includes("v_reservation.reserved_cost_micros") &&
    expire.includes("'accounting_basis', 'conservative_reservation'"),
);
check(
  "pinned price reservation and actual-cost anomaly pause fail closed",
  allSql.includes("gpt-5.4-mini-2026-03-17-2026-07-13") &&
    nanoPriceLineage.includes("gpt-5.4-nano-2026-03-17-2026-07-14") &&
    nanoPriceLineage.includes("Usage finalization model price lineage is invalid") &&
    nanoPriceLineage.includes("p_estimated_cost_micros <> (case p_model") &&
    nanoPriceLineage.includes("greatest(p_input_tokens - p_cached_input_tokens, 0) * 0.2") &&
    nanoPriceLineage.includes("case p_model") &&
    reservationModelBinding.includes("p_release_version = 'beacon-edge-beta-v1-nano'") &&
    reservationModelBinding.includes("v_reservation.release_version is distinct from p_release_version") &&
    finalize.includes("actual_cost_exceeded_reservation") &&
    finalize.includes("update public.ai_feature_global_controls") &&
    finalize.includes("update public.company_ai_feature_entitlements") &&
    finalize.includes("ai_cost_safety_pause"),
);
check(
  "ambiguous provider billing conservatively consumes the full reservation",
  finalize.includes("p_cost_uncertain boolean") &&
    finalize.includes("when p_cost_uncertain then greatest") &&
    finalize.includes("v_reservation.reserved_cost_micros") &&
    finalize.includes("'accounting_basis', case") &&
    finalize.includes("'conservative_reservation'") &&
    database.includes("p_cost_uncertain: costUncertain === true") &&
    provider.includes("costUncertain: true"),
);
check(
  "late billed usage records only incremental meter overage and pauses company",
  finalize.includes("v_event_kind = 'late_finalization' then v_overage") &&
    finalize.includes("late_cost_after_expiration") &&
    foundation.includes("ai_usage_events_one_late_finalization_per_request_idx"),
);

check(
  "Phase A RPCs are service-only with no authenticated execute grant",
  !/grant\s+execute[\s\S]*?to\s+authenticated\s*;/i.test(reads) &&
    readRpcNames.every((name) => {
      const grantPattern = new RegExp(
        `grant\\s+execute\\s+on\\s+function\\s+public\\.${name}\\(`,
        "i",
      );
      return grantPattern.test(reads);
    }) && occurrences(reads, "to service_role;") >= readRpcNames.length,
);
check(
  "Phase A RPCs are actor-bound with canonical membership revalidation",
  readRpcNames.every((name) => {
    const body = functionBody(reads, name);
    return body.includes("p_actor_auth_user_id uuid") &&
      body.includes("p_actor_member_id uuid");
  }) &&
    functionBody(reads, "beacon_actor_company_scope")
      .includes("from auth.users") &&
    functionBody(reads, "beacon_actor_company_scope")
      .includes("member.archived_at is null") &&
    functionBody(reads, "beacon_actor_company_scope")
      .includes("member.status = 'active'"),
);
check(
  "Viewer is denied and CSM scope is current-or-latest-verified historical evidence",
  functionBody(reads, "beacon_actor_company_scope")
    .includes("in ('director', 'support', 'csm')") &&
    functionBody(reads, "beacon_actor_company_scope")
      .includes("case when member.is_read_only then 'viewer'") &&
    reads.includes("scope.actor_role = 'csm'") &&
    reads.includes("interval_row.assertion_status = 'verified'") &&
    reads.includes("newer.revision > interval_row.revision"),
);
check(
  "read RPC source excludes mirror and sensitive client/config columns",
  !reads.includes("backup_") &&
    [
      "client_director_notes",
      "client_email",
      "current_contract_notes",
      "current_contract_reference_link",
      "source_snapshot",
      "server_metadata",
    ].every((name) => !reads.includes(name)) &&
    !/select\s+\*/i.test(reads),
);
check(
  "natural-name and upcoming-contact filters stay actor-bound, bounded, and ambiguity-safe",
  functionBody(naturalLanguageQueries, "beacon_list_clients").includes("p_csm_name text") &&
    functionBody(naturalLanguageQueries, "beacon_list_clients").includes("p_next_contact_days integer") &&
    functionBody(naturalLanguageQueries, "beacon_list_clients").includes("p_next_contact_days between 0 and 365") &&
    functionBody(naturalLanguageQueries, "beacon_get_client_brief").includes("p_client_name text") &&
    functionBody(naturalLanguageQueries, "beacon_get_client_brief").includes("count(*) over () as match_count") &&
    functionBody(naturalLanguageQueries, "beacon_get_client_brief").includes("where client.match_count = 1") &&
    naturalLanguageQueries.includes("from public, anon, authenticated") &&
    naturalLanguageQueries.includes("to service_role") &&
    toolSource.includes("p_csm_name: args.csmName") &&
    toolSource.includes("p_next_contact_days: args.nextContactDays") &&
    contracts.includes('maximum: 365'),
);
check(
  "canonical retention uses app-owned history only",
  reads.includes("from public.client_history_events history") &&
    reads.includes("history.event_type = 'client_retention_recorded'") &&
    !reads.includes("backup_company_clients_history"),
);
check(
  "tool rows, dates, names, and long-form text are SQL-bounded",
  occurrences(reads, "p_limit between 1 and 50") >= 6 &&
    reads.includes("p_days between 0 and 365") &&
    occurrences(reads, "left(client.client_name, 256)") >= 4 &&
    reads.includes("left(client.north_star_value, 2000)") &&
    reads.includes("left(client.next_steps_value, 2000)"),
);
check(
  "internal paths require the full safe frontend route identifier",
  occurrences(reads, "^[A-Za-z0-9_-]{1,128}$") ===
    occurrences(reads, "'/clients/' ||") &&
    occurrences(reads, "'/clients/' ||") === 6,
);
check(
  "every read RPC is search-path pinned and security-definer",
  [...readRpcNames, "beacon_actor_company_scope", "beacon_authorized_client_ids"]
    .every((name) => {
      const body = functionBody(reads, name);
      return body.includes("stable") &&
        body.includes("security definer") &&
        body.includes("set search_path = ''");
    }),
);

check(
  "all rollbacks cover their owned functions/tables and guard dependent slices",
  requiredTables.every((name) =>
    rollbacks[migrationNames[0]].includes(`drop table if exists public.${name}`)
  ) &&
    rollbacks[migrationNames[1]].includes(
      "drop table if exists public.client_assignment_intervals",
    ) &&
    serviceRpcNames.slice(0, 6).every((name) =>
      rollbacks[migrationNames[2]].includes(`public.${name}`)
    ) &&
    [
      "beacon_role_access_allowed",
      "beacon_admin_get_ai_feature_access",
      "beacon_admin_update_ai_feature_access",
    ].every((name) => rollbacks[migrationNames[6]].includes(`public.${name}`)) &&
    readRpcNames.every((name) =>
      rollbacks[migrationNames[3]].includes(`public.${name}`)
    ) &&
    Object.values(rollbacks).every((sql) =>
      sql.includes("migration_name like 'beacon_%'") &&
      sql.includes("migration_name like 'ai_feature_%'")
    ),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
