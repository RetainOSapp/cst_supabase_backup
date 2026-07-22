#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";

const root = process.cwd();
const TABLES = [
  "company_pipelines",
  "company_pipeline_stages",
  "client_pipeline_items",
  "client_pipeline_stage_events",
];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

function filesBelow(relativeDirectory) {
  const directory = path.join(root, relativeDirectory);
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) return filesBelow(relativePath);
    return statSync(path.join(root, relativePath)).isFile() ? [relativePath] : [];
  });
}

function pipelineSqlFile(directory) {
  return filesBelow(directory)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => ({ file, source: read(file) }))
    .filter(({ source }) => TABLES.every((table) => source.includes(table)))
    .sort((left, right) => left.file.localeCompare(right.file))
    .at(-1);
}

const phase02MigrationPath = "supabase/migrations/20260715010000_pipeline_phase_0_2_foundation.sql";
const migrationEntry = existsSync(path.join(root, phase02MigrationPath))
  ? { file: phase02MigrationPath, source: read(phase02MigrationPath) }
  : pipelineSqlFile("supabase/migrations");
const migration = migrationEntry?.source ?? "";
const migrationBasename = migrationEntry ? path.basename(migrationEntry.file) : "";
const exactRollbackPath = migrationBasename
  ? path.join("supabase/rollbacks", migrationBasename)
  : "";
const rollbackEntry = exactRollbackPath && existsSync(path.join(root, exactRollbackPath))
  ? { file: exactRollbackPath, source: read(exactRollbackPath) }
  : pipelineSqlFile("supabase/rollbacks");
const rollback = rollbackEntry?.source ?? "";

const pipelineFunctionFiles = filesBelow("supabase/functions")
  .filter((file) => /pipeline/i.test(file) && /\.(?:ts|mjs)$/.test(file));
const pipelineFunctionSource = pipelineFunctionFiles.map(read).join("\n");
const workspaceFunction = read("supabase/functions/manage-pipeline-workspace/index.ts");
const customizationFunction = read("supabase/functions/manage-company-customization/index.ts");
const pipelinePage = read("src/pages/Pipeline.tsx");
const pipelineSetup = read("src/components/pipeline/PipelineSetup.tsx");
const config = read("supabase/config.toml");

const frontendFiles = [
  "src/App.tsx",
  "src/components/Header.tsx",
  "src/lib/accountContext.tsx",
  "src/pages/SaasClientDetail.tsx",
  ...filesBelow("src").filter(
    (file) => /pipeline/i.test(file) && /\.(?:ts|tsx)$/.test(file),
  ),
];
const uniqueFrontendFiles = [...new Set(frontendFiles)];
const frontendSource = uniqueFrontendFiles.map(read).join("\n");
const app = read("src/App.tsx");
const header = read("src/components/Header.tsx");
const admin = read("src/pages/SaasClientDetail.tsx");
const pipelineBrowserSource = uniqueFrontendFiles
  .filter((file) => /pipeline/i.test(file))
  .map(read)
  .join("\n");

const normalizedMigration = migration.replace(/\s+/g, " ");
const normalizedRollback = rollback.replace(/\s+/g, " ");

const checks = [];
function check(label, passed, evidence = "") {
  checks.push({ label, passed: Boolean(passed), evidence });
}

check(
  "Pipeline migration exists and owns all four Phase 0-2 tables",
  Boolean(migrationEntry),
  migrationEntry?.file ?? "no matching migration",
);
check(
  "matching timestamped rollback exists",
  Boolean(rollbackEntry) && Boolean(migrationBasename) &&
    path.basename(rollbackEntry?.file ?? "") === migrationBasename,
  rollbackEntry?.file ?? "no matching rollback",
);
check(
  "migration and rollback have balanced dollar-quote delimiters",
  Boolean(migration) && Boolean(rollback) &&
    (migration.match(/\$\$/g) ?? []).length % 2 === 0 &&
    (rollback.match(/\$\$/g) ?? []).length % 2 === 0,
);

for (const table of TABLES) {
  check(
    `${table} is created additively`,
    new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?public\\.${table}\\b`, "i").test(migration),
  );
  check(
    `${table} has RLS enabled`,
    new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i").test(normalizedMigration),
  );
  check(
    `${table} is covered by the rollback`,
    new RegExp(`drop\\s+table\\s+if\\s+exists\\s+public\\.${table}`, "i").test(normalizedRollback),
  );
}

check(
  "master Pipeline gate defaults false",
  /enable_pipeline\s+boolean\s+not\s+null\s+default\s+false/i.test(normalizedMigration),
);
check(
  "Viewer Pipeline gate defaults false",
  /enable_pipeline_viewer_access\s+boolean\s+not\s+null\s+default\s+false/i.test(normalizedMigration),
);
check(
  "migration does not seed or enable company Pipeline data",
  !/update\s+public\.company_settings[\s\S]{0,500}enable_pipeline\s*=\s*true/i.test(migration) &&
    !/select\s+public\.apply_pipeline_configuration_with_audit\s*\(/i.test(migration),
);
check(
  "pipeline definitions and stages have company/order lookup indexes",
  /create\s+(?:unique\s+)?index[\s\S]{0,180}company_pipelines/i.test(migration) &&
    /create\s+(?:unique\s+)?index[\s\S]{0,180}company_pipeline_stages/i.test(migration),
);
check(
  "active Won and Lost stages are unique per pipeline at the database boundary",
  /company_pipeline_stages_active_terminal_unique_idx/i.test(migration) &&
    /stage_type\s+in\s*\(\s*'won'\s*,\s*'lost'\s*\)/i.test(normalizedMigration),
);
check(
  "pipeline items have company/pipeline/stage/client lookup indexes",
  /create\s+(?:unique\s+)?index[\s\S]{0,220}client_pipeline_items/i.test(migration),
);
check(
  "stage events have item/time lookup coverage",
  /create\s+(?:unique\s+)?index[\s\S]{0,220}client_pipeline_stage_events/i.test(migration),
);
check(
  "stage-event evidence is append-only",
  /append.only|reject.*(?:update|delete)|immutable/i.test(migration) &&
    /client_pipeline_stage_events/i.test(migration),
);
check(
  "composite foreign keys keep clients, pipelines, stages, and items in one company",
  /client_pipeline_items_client_company_fkey/i.test(migration) &&
    /client_pipeline_items_pipeline_company_fkey/i.test(migration) &&
    /client_pipeline_items_stage_pipeline_company_fkey/i.test(migration) &&
    /client_pipeline_stage_events_item_company_fkey/i.test(migration),
);
check(
  "item value and currency fields are bounded",
  /estimated_value_cents[\s\S]{0,180}>=\s*0/i.test(migration) &&
    /actual_value_cents[\s\S]{0,180}>=\s*0/i.test(migration) &&
    /currency_code[\s\S]{0,180}\^\[A-Z\]\{3\}/i.test(migration),
);
check(
  "Pipeline activity is admitted to Client History",
  /client_history_events_event_type_check/i.test(migration) &&
    /pipeline_activity/i.test(migration),
);
check(
  "database read policies enforce Viewer gate and CSM assignment scope",
  /is_company_pipeline_viewer_access_enabled/i.test(migration) &&
    /current_actor_app_policy_role/i.test(migration) &&
    /csm_team_member_id/i.test(migration) &&
    /csm_secondary_assignee_id/i.test(migration),
);
check(
  "migration does not add a broad authenticated write policy",
  !/for\s+(?:all|insert|update|delete)\s+to\s+authenticated[\s\S]{0,120}(?:using|with\s+check)\s*\(\s*true\s*\)/i.test(migration),
);
check(
  "rollback removes gates and reloads the API schema",
  /drop\s+column\s+if\s+exists\s+enable_pipeline/i.test(normalizedRollback) &&
    /drop\s+column\s+if\s+exists\s+enable_pipeline_viewer_access/i.test(normalizedRollback) &&
    /notify\s+pgrst\s*,\s*'reload schema'/i.test(rollback),
);

check(
  "authenticated Pipeline server boundary exists",
  pipelineFunctionFiles.length > 0 &&
    /getBearerToken|authorization/i.test(pipelineFunctionSource) &&
    /requireAuthenticatedActor|auth\.getUser/i.test(pipelineFunctionSource),
  pipelineFunctionFiles.join(", ") || "no Pipeline function source",
);
check(
  "server boundary resolves company and app-owned migration status",
  /company_id|companyId/i.test(pipelineFunctionSource) &&
    /migration_status/i.test(pipelineFunctionSource) &&
    /pilot|migrated/i.test(pipelineFunctionSource),
);
check(
  "server boundary enforces the master and Viewer gates",
  /enable_pipeline/i.test(pipelineFunctionSource) &&
    /enable_pipeline_viewer_access/i.test(pipelineFunctionSource) &&
    /viewer/i.test(pipelineFunctionSource),
);
check(
  "configuration authorization is restricted to Super Admin and Director",
  /super_admin/i.test(pipelineFunctionSource) &&
    /director/i.test(pipelineFunctionSource) &&
    /config|pipeline definition|manage pipeline/i.test(pipelineFunctionSource),
);
check(
  "company gate writes deny read-only Directors and use atomic gate audit RPC",
  /auth_user_id/i.test(customizationFunction) &&
    /is_read_only/i.test(customizationFunction) &&
    /update_company_pipeline_gates_with_audit/i.test(customizationFunction),
);
check(
  "item authorization covers Support and assigned CSMs",
  /support/i.test(pipelineFunctionSource) &&
    /csm/i.test(pipelineFunctionSource) &&
    /csm_team_member_id/i.test(pipelineFunctionSource) &&
    /csm_secondary_assignee_id/i.test(pipelineFunctionSource),
);
check(
  "Pipeline mutations write stage events, Client History, and audit evidence",
  /client_pipeline_stage_events/i.test(migration) &&
    /client_history_events/i.test(migration) &&
    /app_audit_events/i.test(migration) &&
    /create_pipeline_item_with_evidence|mutate_pipeline_item_with_evidence/i.test(workspaceFunction),
);
check(
  "item creation and mutation evidence are transactional database operations",
  /create\s+or\s+replace\s+function\s+public\.create_pipeline_item_with_evidence/i.test(migration) &&
    /create\s+or\s+replace\s+function\s+public\.mutate_pipeline_item_with_evidence/i.test(migration) &&
    /client_pipeline_stage_events/i.test(migration) &&
    /client_history_events/i.test(migration) &&
    /app_audit_events/i.test(migration),
);
check(
  "item and configuration mutations share a company transaction lock and revalidate active targets",
  (migration.match(/perform\s+pg_advisory_xact_lock\s*\(\s*hashtextextended\s*\(\s*p_company_id::text/gi) ?? []).length >= 4 &&
    /Pipeline or stage is not enabled/i.test(migration) &&
    /Pipeline or target stage is not enabled/i.test(migration) &&
    /is_company_pipeline_enabled\s*\(\s*p_company_id\s*\)/i.test(migration),
);
check(
  "transactional mutation helpers are service-role only and rolled back before tables",
  /revoke all on function public\.create_pipeline_item_with_evidence[\s\S]*from public, anon, authenticated/i.test(migration) &&
    /grant execute on function public\.create_pipeline_item_with_evidence[\s\S]*to service_role/i.test(migration) &&
    /revoke all on function public\.mutate_pipeline_item_with_evidence[\s\S]*from public, anon, authenticated/i.test(migration) &&
    /grant execute on function public\.mutate_pipeline_item_with_evidence[\s\S]*to service_role/i.test(migration) &&
    normalizedRollback.indexOf("drop function if exists public.mutate_pipeline_item_with_evidence") <
      normalizedRollback.indexOf("drop table if exists public.client_pipeline_items"),
);
check(
  "workspace item writes use transactional RPC helpers instead of direct table mutation",
  (/\.rpc\(\s*["']create_pipeline_item_with_evidence["']/i.test(workspaceFunction) ||
    /createRpc\s*=\s*pipeline\.pipeline_type[\s\S]{0,220}create_pipeline_item_with_evidence/i.test(workspaceFunction)) &&
    /\.rpc\(\s*["']mutate_pipeline_item_with_evidence["']/i.test(workspaceFunction) &&
    !/\.from\(\s*["']client_pipeline_items["']\s*\)\s*\.(?:insert|update|delete)/i.test(workspaceFunction),
);
check(
  "workspace validates required notes and invalid cents before mutation",
  /stage\.requires_note/i.test(workspaceFunction) &&
    /Value must be non-negative whole cents/i.test(workspaceFunction),
);
check(
  "configuration writes and gate changes use service-only transactional audit helpers",
  /create\s+or\s+replace\s+function\s+public\.apply_pipeline_configuration_with_audit/i.test(migration) &&
    /create\s+or\s+replace\s+function\s+public\.update_company_pipeline_gates_with_audit/i.test(migration) &&
    /grant execute on function public\.apply_pipeline_configuration_with_audit[\s\S]*to service_role/i.test(migration) &&
    /grant execute on function public\.update_company_pipeline_gates_with_audit[\s\S]*to service_role/i.test(migration) &&
    /\.rpc\(\s*["']apply_pipeline_configuration_with_audit["']/i.test(pipelineFunctionSource) &&
    normalizedRollback.indexOf("drop function if exists public.apply_pipeline_configuration_with_audit") <
      normalizedRollback.indexOf("drop table if exists public.company_pipelines"),
);
check(
  "pipeline and stage reorder operations are transactional and audited",
  /["']reorder_pipelines["']/i.test(pipelineFunctionSource) &&
    /p_operation\s*=\s*'reorder_pipelines'/i.test(migration) &&
    /p_operation\s*=\s*'reorder_stages'/i.test(migration) &&
    /company_pipelines_reordered/i.test(pipelineFunctionSource) &&
    /company_pipeline_stages_reordered/i.test(pipelineFunctionSource),
);
check(
  "locked configuration mutations repeat enablement, archive, and complete-reorder invariants",
  /Pipeline reorder must include every active pipeline exactly once/i.test(migration) &&
    /Stage reorder must include every active stage exactly once/i.test(migration) &&
    /Archive all pipeline items before archiving this pipeline/i.test(migration) &&
    /Move or archive stage items before archiving this stage/i.test(migration) &&
    /An enabled pipeline requires open, Won, and Lost stages/i.test(migration) &&
    /An enabled pipeline must keep at least one open stage/i.test(migration),
);
check(
  "Pipeline server code contains no backup-table access",
  !/\.from\s*\(\s*["']backup_/i.test(pipelineFunctionSource) &&
    !/(?:insert|update|delete)\s+(?:into|from)?\s*public\.backup_/i.test(pipelineFunctionSource),
);
check(
  "Pipeline function gateway configuration keeps JWT verification enabled",
  pipelineFunctionFiles.length > 0 &&
    /\[functions\.[^\]]*pipeline[^\]]*\]\s+verify_jwt\s*=\s*true/i.test(config),
);

check(
  "top-level /pipeline route mounts a Pipeline workspace",
  /path=["']pipeline["']/i.test(app) && /<Pipeline\b/i.test(app),
);
check(
  "sidebar places Pipeline between Tasks and Call AI",
  /path:\s*["']\/tasks["'][\s\S]*path:\s*["']\/pipeline["'][\s\S]*path:\s*["']\/call-ai["']/i.test(header),
);
check(
  "sidebar visibility follows the saved master gate even before starter pipelines exist",
  /if\s*\(action\s*===\s*["']access["']\)[\s\S]{0,260}enabled:\s*settings\.enabled/i.test(workspaceFunction) &&
    !/if\s*\(action\s*===\s*["']access["']\)[\s\S]{0,500}company_pipelines/i.test(workspaceFunction) &&
    /retainos:pipeline-visibility-changed/i.test(header) &&
    /retainos:pipeline-visibility-changed/i.test(admin),
);
check(
  "Admin Hub exposes a Pipelines tab before Company Settings",
  /Pipelines[\s\S]*Company Settings/i.test(admin) && /pipeline/i.test(admin),
);
check(
  "workspace exposes Board/List, search, filtering, and a detail drawer",
  /kanban|board/i.test(pipelineBrowserSource) &&
    /list/i.test(pipelineBrowserSource) &&
    /search/i.test(pipelineBrowserSource) &&
    /pathway/i.test(pipelineBrowserSource) &&
    /owner/i.test(pipelineBrowserSource) &&
    /follow.?up|renewal/i.test(pipelineBrowserSource) &&
    /drawer|detail/i.test(pipelineBrowserSource),
);
check(
  "workspace exposes visible pipeline selection, drag/drop, and compact summaries",
  /selectedPipeline|pipelineSelection|togglePipeline|All/i.test(pipelineBrowserSource) &&
    /draggable|onDragStart|dragstart/i.test(pipelineBrowserSource) &&
    /summary|projected|follow.?ups due|open opportunities/i.test(pipelineBrowserSource),
);
check(
  "drawer stage and detail save is one workspace mutation and totals preserve currencies",
  /updatePipelineItem[\s\S]{0,300}stageId/i.test(pipelinePage) &&
    /formatMoneyTotals/i.test(pipelinePage),
);
check(
  "Admin Pipeline setup exposes pipeline reorder, currency, and required-note controls",
  /reorder_pipelines/i.test(pipelineSetup) &&
    />Currency</i.test(pipelineSetup) &&
    /Require note/i.test(pipelineSetup),
);
check(
  "browser Pipeline modules do not write Pipeline tables directly",
  !new RegExp(`\\.from\\s*\\(\\s*["'](?:${TABLES.join("|")})["']`, "i").test(pipelineBrowserSource) &&
    /functions\.invoke|invokeSignedFunction/i.test(pipelineBrowserSource),
);
check(
  "Pipeline frontend has disabled, loading, empty, and error states",
  /disabled/i.test(frontendSource) &&
    /loading/i.test(pipelineBrowserSource) &&
    /empty|no pipeline|no items/i.test(pipelineBrowserSource) &&
    /error/i.test(pipelineBrowserSource),
);

let failures = 0;
for (const { label, passed, evidence } of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}${evidence ? ` — ${evidence}` : ""}`);
  if (!passed) failures += 1;
}

console.log(`\n${checks.length - failures}/${checks.length} Pipeline Phase 0-2 checks passed.`);
if (failures) process.exit(1);
