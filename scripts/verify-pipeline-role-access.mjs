import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260724170000_pipeline_role_access_and_manual_scan.sql");
const rollback = read("supabase/rollbacks/20260724170000_pipeline_role_access_and_manual_scan.rollback.sql");
const configuration = read("supabase/functions/manage-company-pipeline/index.ts");
const workspace = read("supabase/functions/manage-pipeline-workspace/index.ts");
const automation = read("supabase/functions/manage-pipeline-automation/index.ts");
const setup = read("src/components/pipeline/PipelineSetup.tsx");
const pipeline = read("src/pages/Pipeline.tsx");
const header = read("src/components/Header.tsx");

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

check("role gates are additive and preserve prior behavior by default",
  ["director", "support", "csm"].every((role) =>
    new RegExp(`enable_pipeline_${role}_access boolean not null default true`, "i").test(migration),
  ));
check("migration does not enable the Pipeline master gate",
  !/update\s+public\.company_settings[\s\S]{0,300}enable_pipeline\s*=\s*true/i.test(migration));
check("role changes are SuperAdmin-only and audited transactionally",
  /Only a Super Admin can change Pipeline role access/i.test(configuration)
  && /update_company_pipeline_role_access_with_audit/i.test(configuration)
  && /company_pipeline_role_access_updated/i.test(migration)
  && /pg_advisory_xact_lock/i.test(migration));
check("browser roles cannot call the role mutation RPC",
  /revoke all on function public\.update_company_pipeline_role_access_with_audit[\s\S]*public, anon, authenticated/i.test(migration)
  && /grant execute on function public\.update_company_pipeline_role_access_with_audit[\s\S]*service_role/i.test(migration));
check("workspace access and mutations share the server role gate",
  /function roleAccessAllowed/i.test(workspace)
  && /assertReadable\(actor, settings\)/i.test(workspace)
  && /!settings\.enabled \|\| !roleAccessAllowed\(actor, settings\)/i.test(workspace));
check("sidebar requires the server role decision",
  /data\?\.roleAllowed === true/i.test(header));
check("CSM assignment scoping remains intact behind its company gate",
  /actor\.role !== "csm"/i.test(workspace)
  && /CSMs can manage Pipeline items for assigned clients only/i.test(workspace));
check("Admin Hub exposes separate role controls with SuperAdmin ownership",
  /Workspace access by role/i.test(setup)
  && /Directors/i.test(setup)
  && /Support/i.test(setup)
  && /CSMs/i.test(setup)
  && /Viewers/i.test(setup)
  && /Super Admin controlled/i.test(setup));
check("preview is read-only and available independently from recurring execution",
  /preview_due_renewal_pipeline_items/i.test(automation)
  && /Preview renewal scan/i.test(pipeline)
  && /No records were changed/i.test(pipeline));
check("one-time scan stays SuperAdmin-only and requires confirmation",
  /Only a Super Admin can run renewal materialization/i.test(workspace)
  && /window\.confirm/i.test(pipeline)
  && /Recurring automation will remain unchanged/i.test(pipeline));
check("manual scan is pipeline-bound and recurring mode keeps every kill switch",
  /p\.id::text = split_part\(p_run_key, ':', 2\)/i.test(migration)
  && /p\.auto_create_renewal_items[\s\S]*automation_paused[\s\S]*renewal_generation_enabled/i.test(migration));
check("renewal materialization remains contract-idempotent and evidence-backed",
  /renewal_contract:'\|\|v_row\.contract_id/i.test(migration)
  && /on conflict\(company_id,automation_key\)[\s\S]*do nothing/i.test(migration)
  && /client_pipeline_stage_events/i.test(migration)
  && /client_history_events/i.test(migration)
  && /app_audit_events/i.test(migration));
check("rollback disables manual-once execution and restores legacy role access",
  /select false/i.test(rollback)
  && ["director", "support", "csm"].every((role) =>
    new RegExp(`enable_pipeline_${role}_access = true`, "i").test(rollback),
  ));
check("Director preview obeys the Director role gate",
  /actor\.role === "director" && !pipelineAccess\.directorAccess/i.test(automation));

console.log(`\n${passed}/${passed + failed} Pipeline role-access checks passed.`);
if (failed > 0) process.exit(1);
