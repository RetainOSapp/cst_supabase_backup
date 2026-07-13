import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const aggregatePath = path.join(
  root,
  "supabase/migrations/20260713020000_security_phase1b_dashboard_aggregates.sql",
);
const churnAggregatePath = path.join(
  root,
  "supabase/migrations/20260713020200_security_phase1b_churn_reason_aggregate.sql",
);
const releaseGatePath = path.join(
  root,
  "supabase/release-gates/20260713020500_security_phase1b_frontend_verified.sql",
);
const companyPath = path.join(
  root,
  "supabase/migrations/20260713021000_security_phase1b_company_reads.sql",
);
const clientPath = path.join(
  root,
  "supabase/migrations/20260713022000_security_phase1b_client_reads.sql",
);
const policyQaGatePath = path.join(
  root,
  "supabase/release-gates/20260713022500_security_phase1b_policy_qa_verified.sql",
);
const lockdownPath = path.join(
  root,
  "supabase/migrations/20260713023000_security_phase1b_legacy_dashboard_rpc_lockdown.sql",
);
const aggregateRollbackPath = path.join(
  root,
  "supabase/rollbacks/20260713020000_security_phase1b_dashboard_aggregates.sql",
);
const churnAggregateRollbackPath = path.join(
  root,
  "supabase/rollbacks/20260713020200_security_phase1b_churn_reason_aggregate.sql",
);
const releaseGateRollbackPath = path.join(
  root,
  "supabase/rollbacks/20260713020500_security_phase1b_frontend_verified.sql",
);
const releaseGateRunnerPath = path.join(
  root,
  "scripts/apply-release-gate-sql-file.mjs",
);
const companyRollbackPath = path.join(
  root,
  "supabase/rollbacks/20260713021000_security_phase1b_company_reads.sql",
);
const clientRollbackPath = path.join(
  root,
  "supabase/rollbacks/20260713022000_security_phase1b_client_reads.sql",
);
const policyQaGateRollbackPath = path.join(
  root,
  "supabase/rollbacks/20260713022500_security_phase1b_policy_qa_verified.sql",
);
const lockdownRollbackPath = path.join(
  root,
  "supabase/rollbacks/20260713023000_security_phase1b_legacy_dashboard_rpc_lockdown.sql",
);
const dashboardPath = path.join(root, "src/pages/Dashboard.tsx");

for (const file of [
  aggregatePath,
  churnAggregatePath,
  releaseGatePath,
  companyPath,
  clientPath,
  policyQaGatePath,
  lockdownPath,
  aggregateRollbackPath,
  churnAggregateRollbackPath,
  releaseGateRollbackPath,
  releaseGateRunnerPath,
  companyRollbackPath,
  clientRollbackPath,
  policyQaGateRollbackPath,
  lockdownRollbackPath,
  dashboardPath,
]) {
  if (!fs.existsSync(file)) {
    console.error(`Missing Phase 1B file: ${path.relative(root, file)}`);
    process.exit(1);
  }
}

const aggregate = fs.readFileSync(aggregatePath, "utf8");
const churnAggregate = fs.readFileSync(churnAggregatePath, "utf8");
const releaseGate = fs.readFileSync(releaseGatePath, "utf8");
const company = fs.readFileSync(companyPath, "utf8");
const client = fs.readFileSync(clientPath, "utf8");
const policyQaGate = fs.readFileSync(policyQaGatePath, "utf8");
const lockdown = fs.readFileSync(lockdownPath, "utf8");
const aggregateRollback = fs.readFileSync(aggregateRollbackPath, "utf8");
const churnAggregateRollback = fs.readFileSync(
  churnAggregateRollbackPath,
  "utf8",
);
const releaseGateRollback = fs.readFileSync(releaseGateRollbackPath, "utf8");
const releaseGateRunner = fs.readFileSync(releaseGateRunnerPath, "utf8");
const companyRollback = fs.readFileSync(companyRollbackPath, "utf8");
const clientRollback = fs.readFileSync(clientRollbackPath, "utf8");
const policyQaGateRollback = fs.readFileSync(
  policyQaGateRollbackPath,
  "utf8",
);
const lockdownRollback = fs.readFileSync(lockdownRollbackPath, "utf8");
const dashboard = fs.readFileSync(dashboardPath, "utf8");

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

function functionBody(sql, name) {
  const marker = `create or replace function public.${name}`;
  const start = sql.indexOf(marker);
  if (start < 0) return "";
  const end = sql.indexOf("$$;", start);
  return end < 0 ? "" : sql.slice(start, end + 3);
}

function policyBody(sql, name) {
  const quotedMarker = `create policy \"${name}\"`;
  const unquotedMarker = `create policy ${name}`;
  const start = Math.max(
    sql.indexOf(quotedMarker),
    sql.indexOf(unquotedMarker),
  );
  if (start < 0) return "";
  const end = sql.indexOf(";", start);
  return end < 0 ? "" : sql.slice(start, end + 1);
}

check(
  "Phase 1B slices enforce their rollout order",
  aggregate.includes("where rollout.version = '20260713010000'") &&
    churnAggregate.includes("where rollout.version = '20260713020000'") &&
    releaseGate.includes("'20260713020000'") &&
    releaseGate.includes("'20260713020200'") &&
    company.includes("where rollout.version = '20260713020500'") &&
    client.includes("where rollout.version = '20260713021000'") &&
    policyQaGate.includes("where rollout.version = '20260713021000'") &&
    policyQaGate.includes("where rollout.version = '20260713022000'") &&
    lockdown.includes("where rollout.version = '20260713020500'") &&
    lockdown.includes("where rollout.version = '20260713022000'") &&
    lockdown.includes("where rollout.version = '20260713022500'"),
);

const churnReasonAggregate = functionBody(
  churnAggregate,
  "dashboard_churn_reason_rollup_actor_scoped",
);
check(
  "churn reason RPC is actor-scoped and returns aggregates only",
  churnReasonAggregate.includes("stable") &&
    churnReasonAggregate.includes("security definer") &&
    churnReasonAggregate.includes("set search_path = ''") &&
    churnReasonAggregate.includes("dashboard_authorized_app_clients(") &&
    churnReasonAggregate.includes("'churn_reason'::text") &&
    churnReasonAggregate.includes("count(*)::bigint") &&
    !churnReasonAggregate.includes("client_name") &&
    !churnReasonAggregate.includes("client_email"),
);
check(
  "churn reason aggregate is reversible before the frontend gate",
  churnAggregateRollback.includes(
    "drop function if exists public.dashboard_churn_reason_rollup_actor_scoped",
  ) &&
    churnAggregateRollback.includes("'20260713020500'") &&
    aggregateRollback.includes("'20260713020200'"),
);
check(
  "frontend release gate is manual, production-guarded, and outside migrations",
  releaseGate.includes("actor_scoped_frontend_deployed_and_role_qa_passed") &&
    policyQaGate.includes(
      "phase1b_read_policies_role_and_isolation_qa_passed",
    ) &&
    releaseGateRunner.includes('"supabase/release-gates"') &&
    releaseGateRunner.includes("--allow-production") &&
    releaseGateRunner.includes("release-gate-dry-run"),
);

for (const name of [
  "dashboard_authorized_app_clients",
  "dashboard_kpi_counts_actor_scoped",
  "dashboard_overview_rollups_actor_scoped",
  "dashboard_chart_rollups_actor_scoped",
]) {
  const body = functionBody(aggregate, name);
  check(
    `${name} is stable, security-definer, and search-path pinned`,
    body.includes("stable") &&
      body.includes("security definer") &&
      body.includes("set search_path = ''"),
  );
}

const authorizedClients = functionBody(
  aggregate,
  "dashboard_authorized_app_clients",
);
check(
  "private Dashboard client scope resolves only active app-owned companies",
  authorizedClients.includes("company.migration_status in ('pilot', 'migrated')") &&
    authorizedClients.includes("company.archived_at is null") &&
    authorizedClients.includes("company.id::text = p_company_id") &&
    authorizedClients.includes("company.legacy_glide_row_id = p_company_id"),
);
check(
  "private Dashboard client scope enforces primary or secondary CSM assignment",
  authorizedClients.includes("company.actor_role = 'csm'") &&
    authorizedClients.includes("client.csm_team_member_id = any") &&
    authorizedClients.includes("client.csm_secondary_assignee_id = any"),
);
check(
  "private Dashboard client scope validates bounded programs, dates, pathways, and team filters",
  authorizedClients.includes("cardinality(p_program_values) between 1 and 10") &&
    authorizedClients.includes("p_client_start_date_from <= p_client_start_date_to") &&
    authorizedClients.includes("from public.company_offers offer") &&
    authorizedClients.includes("from public.company_members member"),
);
check(
  "private client-row helper is not executable by browser roles",
  aggregate.includes(
    "from public, anon, authenticated;\ngrant execute on function public.dashboard_authorized_app_clients",
  ) &&
    aggregate.includes(") to service_role;"),
);

const kpi = functionBody(aggregate, "dashboard_kpi_counts_actor_scoped");
check(
  "KPI RPC validates app and mirror company authority",
  kpi.includes("public.can_read_app_company(v_company_id)") &&
    kpi.includes("public.can_read_mirror_company(v_mirror_company_id)"),
);
check(
  "mirror CSM KPI scope includes primary and secondary assignments",
  kpi.includes("from public.backup_company_clients client") &&
    kpi.includes("select distinct on (client.glide_row_id)") &&
    kpi.includes("client.csm_team_member_id = v_actor_member_id") &&
    kpi.includes("client.csm_secondary_assignee_id = v_actor_member_id") &&
    !kpi.includes("from public.dashboard_kpi_counts_canonical("),
);
check(
  "KPI RPC preserves app contract and history parity without returning identities",
  kpi.includes("from public.client_contracts contract") &&
    kpi.includes("from public.backup_company_clients_contracts contract") &&
    kpi.includes("from public.client_history_events history") &&
    kpi.includes("from public.backup_company_clients_history history") &&
    !kpi.match(/returns table \([\s\S]*client_name/),
);
check(
  "legacy broad KPI RPCs lose browser execution",
  [
    "dashboard_kpi_counts_canonical",
    "dashboard_kpi_counts_primary",
    "dashboard_kpi_counts_retention",
  ].every((name) => lockdown.includes(`'${name}'`)) &&
    lockdown.includes(
      "revoke all on function %s from public, anon, authenticated",
    ) &&
    lockdown.includes("grant execute on function %s to service_role"),
);

const overview = functionBody(
  aggregate,
  "dashboard_overview_rollups_actor_scoped",
);
const overviewSignature = overview.slice(0, overview.indexOf("language sql"));
check(
  "overview RPC returns only advocacy and TTV aggregates",
  overview.includes("returns table (\n  advocacy jsonb,\n  ttv jsonb") &&
    overview.includes("join authorized_clients client") &&
    overview.includes("jsonb_build_object(") &&
    !overviewSignature.includes("client_id"),
);

const charts = functionBody(
  aggregate,
  "dashboard_chart_rollups_actor_scoped",
);
check(
  "chart RPC returns bucketed values with optional capacity only",
  charts.includes("metric text") &&
    charts.includes("bucket_key text") &&
    charts.includes("bucket_label text") &&
    charts.includes("value bigint") &&
    charts.includes("capacity numeric"),
);
check(
  "chart RPC covers all Viewer chart families without client identities",
  [
    "'program'::text",
    "'buy_in'::text",
    "'progress'::text",
    "'task_status'::text",
    "'csm_workload'::text",
    "'csm_capacity'::text",
  ].every((metric) => charts.includes(metric)) &&
    !charts.includes("client_name") &&
    !charts.includes("client_image"),
);

for (const name of [
  "current_actor_app_policy_company_id",
  "current_actor_app_policy_company_legacy_id",
  "current_actor_app_policy_role",
  "current_actor_app_policy_member_ids",
  "current_actor_effective_policy_company_legacy_id",
  "current_actor_effective_policy_role",
]) {
  const body = functionBody(company, name);
  check(
    `${name} is a pinned, stable policy helper`,
    body.includes("stable") &&
      body.includes("security definer") &&
      body.includes("set search_path = ''"),
  );
}

check(
  "company and member policies are tenant-scoped with bound SuperAdmin override",
  policyBody(company, "companies_authenticated_read").includes(
    "is_retainos_super_admin_bound",
  ) &&
    policyBody(company, "companies_authenticated_read").includes(
      "current_actor_app_policy_company_id",
    ) &&
    policyBody(company, "company_members_authenticated_read").includes(
      "current_actor_app_policy_company_id",
    ),
);
check(
  "company configuration policies do not use broad true predicates",
  [
    "company_offers_authenticated_read",
    "company_offer_milestones_authenticated_read",
    "company_settings_authenticated_read",
    "company_outcome_definitions_authenticated_read",
    "company_churn_reasons_authenticated_read",
    "company_custom_fields_authenticated_read",
    "company_task_templates_authenticated_read",
  ].every((name) => {
    const body = policyBody(company, name);
    return body && !/using\s*\(\s*true\s*\)/i.test(body);
  }),
);
check(
  "integration intake is Director-only while audit reads remain Director/Support",
  policyBody(company, "integration_intake_events_authenticated_read").includes(
    "= 'director'",
  ) &&
    !policyBody(
      company,
      "integration_intake_events_authenticated_read",
    ).includes("'support'") &&
    policyBody(company, "app_audit_events_authenticated_read").includes(
      "'support'",
    ),
);
check(
  "Resources preserve mirror fallback and restrict draft visibility to Directors",
  policyBody(company, "resources_authenticated_read").includes(
    "current_actor_effective_policy_company_legacy_id",
  ) &&
    policyBody(company, "resources_authenticated_read").includes(
      "status = 'published'",
    ) &&
    policyBody(company, "resources_authenticated_read").includes(
      "status = 'draft'",
    ) &&
    policyBody(company, "resources_authenticated_read").includes(
      "current_actor_effective_policy_role",
    ),
);
check(
  "Phase 1B leaves notification policies and mirror tables untouched",
  !/on public\.notifications/i.test(`${company}\n${client}`) &&
    !/on public\.notification_preferences/i.test(`${company}\n${client}`) &&
    !/on public\.backup_/i.test(`${company}\n${client}`),
);

const clientPolicy = policyBody(client, "clients_authenticated_read");
check(
  "raw client policy allows Director/Support and assigned CSM, but not Viewer",
  clientPolicy.includes("'director'") &&
    clientPolicy.includes("'support'") &&
    clientPolicy.includes("= 'csm'") &&
    clientPolicy.includes("csm_team_member_id = any") &&
    clientPolicy.includes("csm_secondary_assignee_id = any") &&
    !clientPolicy.includes("'viewer'"),
);

for (const name of [
  "client_history_events_authenticated_read",
  "client_contracts_authenticated_read",
  "client_milestones_authenticated_read",
  "client_custom_field_values_authenticated_read",
  "client_links_authenticated_read",
  "client_advocacy_events_authenticated_read",
]) {
  const body = policyBody(client, name);
  check(
    `${name} is client-assignment-aware and Viewer-denied`,
    body.includes("from public.clients client") &&
      body.includes("csm_team_member_id = any") &&
      body.includes("csm_secondary_assignee_id = any") &&
      !body.includes("'viewer'") &&
      !/using\s*\(\s*true\s*\)/i.test(body),
  );
}

const taskPolicy = policyBody(client, "client_tasks_authenticated_read");
check(
  "task policy gives CSMs self-assigned and assigned-client task paths only",
  taskPolicy.includes("assigned_to_id = any") &&
    taskPolicy.includes("client_id is not null") &&
    taskPolicy.includes("from public.clients client") &&
    !taskPolicy.includes("'viewer'"),
);
check(
  "client-child RLS hot paths have composite indexes",
  [
    "security_phase1b_clients_company_legacy_idx",
    "security_phase1b_history_company_client_idx",
    "security_phase1b_tasks_company_client_idx",
    "security_phase1b_tasks_company_assignee_idx",
    "security_phase1b_contracts_company_client_idx",
    "security_phase1b_milestones_company_client_idx",
    "security_phase1b_links_company_client_uuid_idx",
    "security_phase1b_advocacy_company_client_uuid_idx",
  ].every((name) => client.includes(name)),
);

check(
  "Dashboard uses only actor-scoped KPI functions",
  dashboard.includes('"dashboard_kpi_counts_actor_scoped"') &&
    !dashboard.includes('"dashboard_kpi_counts_canonical"') &&
    !dashboard.includes('"dashboard_kpi_counts_primary"') &&
    !dashboard.includes('"dashboard_kpi_counts_retention"'),
);
check(
  "Viewer app-owned overview uses aggregate advocacy and TTV rollups",
  dashboard.includes('"dashboard_overview_rollups_actor_scoped"') &&
    dashboard.includes("!canUseDashboardDrilldowns && appCompany?.id") &&
    dashboard.includes("!canUseDashboardDrilldowns && usesAppTtv"),
);
check(
  "Viewer app-owned charts use bucket rollups and retain no raw rows",
    dashboard.includes('"dashboard_chart_rollups_actor_scoped"') &&
    dashboard.includes('"dashboard_churn_reason_rollup_actor_scoped"') &&
    dashboard.includes(
      'churnReasonDistribution: chartRows("churn_reason", false)',
    ) &&
    dashboard.includes("!canUseDashboardDrilldowns && appliedUsesAppClients") &&
    dashboard.includes("setChartClients([])") &&
    dashboard.includes("setProfileUpkeep(null)"),
);
check(
  "Dashboard fails closed until app-versus-mirror source resolution succeeds",
  dashboard.includes('"loading" | "ready" | "error"') &&
    dashboard.includes('setAppCompanySourceStatus("error")') &&
    dashboard.includes('appCompanySourceStatus !== "ready"') &&
    dashboard.includes('setChartsLoading(appCompanySourceStatus === "loading")'),
);
check(
  "canonical KPI failures clear loading state for every role",
  dashboard.includes(
    'console.error("Failed to load canonical dashboard KPIs:", error);',
  ) &&
    dashboard.includes("setPrimaryKpiLoading(false);") &&
    dashboard.includes("setRetentionKpiLoading(false);") &&
    !dashboard.includes("if (!canUseDashboardDrilldowns) {\n          setActiveClients(null)"),
);
check(
  "Viewer and fallback advocacy paths always clear loading state",
  dashboard.includes(
    "if (!canUseDashboardDrilldowns) {\n        setAdvocacyLoading(false);\n        setTtvLoading(false);",
  ) &&
    dashboard.includes(
      "setAdvocacyMetrics(\n          advocacyDefinitions.map",
    ) &&
    dashboard.includes("setAdvocacyLoading(false);\n        return;"),
);
check(
  "Dashboard no longer selects company-member email for filters",
  !dashboard.includes(
    "id, legacy_glide_row_id, name, email, role, hide_from_csm_list",
  ),
);

check(
  "aggregate rollback drops only the new actor-scoped RPCs",
  [
    "dashboard_chart_rollups_actor_scoped",
    "dashboard_overview_rollups_actor_scoped",
    "dashboard_kpi_counts_actor_scoped",
    "dashboard_authorized_app_clients",
  ].every((name) => aggregateRollback.includes(`drop function if exists public.${name}`)) &&
    !aggregateRollback.includes("grant execute on function %s to public"),
);
check(
  "company rollback restores each prior broad policy and removes policy helpers",
  (companyRollback.match(/using \(true\);/g) ?? []).length >= 12 &&
    companyRollback.includes(
      "drop function if exists public.current_actor_effective_policy_role()",
    ) &&
    companyRollback.includes(
      "drop function if exists public.current_actor_app_policy_company_id()",
    ),
);
check(
  "client rollback restores broad policies plus Phase 0 link/advocacy predicates",
  (clientRollback.match(/using \(true\);/g) ?? []).length >= 6 &&
    (clientRollback.match(/using \(public\.can_read_company\(company_id\)\);/g) ?? [])
      .length === 2 &&
    clientRollback.includes(
      "drop index if exists public.security_phase1b_clients_company_legacy_idx",
    ),
);
check(
  "Phase 1B rollbacks enforce strict reverse dependency order",
  aggregateRollback.includes("20260713020500") &&
    aggregateRollback.includes("20260713022500") &&
    aggregateRollback.includes("20260713023000") &&
    companyRollback.includes("20260713022000") &&
    companyRollback.includes("20260713023000") &&
    clientRollback.includes("20260713022500") &&
    clientRollback.includes("20260713023000") &&
    releaseGateRollback.includes("20260713021000") &&
    releaseGateRollback.includes("20260713022500") &&
    releaseGateRollback.includes("20260713023000") &&
    policyQaGateRollback.includes("20260713023000"),
);
check(
  "legacy Dashboard lockdown rollback restores browser execution",
  [
    "dashboard_kpi_counts_canonical",
    "dashboard_kpi_counts_primary",
    "dashboard_kpi_counts_retention",
  ].every((name) => lockdownRollback.includes(`'${name}'`)) &&
    lockdownRollback.includes("grant execute on function %s to public"),
);
check(
  "all Phase 1B apply and rollback slices reload PostgREST",
  [
    aggregate,
    releaseGate,
    company,
    client,
    policyQaGate,
    lockdown,
    aggregateRollback,
    releaseGateRollback,
    companyRollback,
    clientRollback,
    policyQaGateRollback,
    lockdownRollback,
  ].every((sql) => sql.includes("notify pgrst, 'reload schema';")),
);

console.log(`\n${passed}/${passed + failed} Phase 1B checks passed.`);
if (failed > 0) process.exitCode = 1;
