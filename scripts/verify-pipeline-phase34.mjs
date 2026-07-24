#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260715020000_pipeline_phase_3_4_workflows.sql");
const rollback = read("supabase/rollbacks/20260715020000_pipeline_phase_3_4_workflows.sql");
const previewHotfix = read("supabase/migrations/20260716213000_pipeline_preview_stage_qualification_fix.sql");
const previewHotfixRollback = read("supabase/rollbacks/20260716213000_pipeline_preview_stage_qualification_fix.sql");
const workspace = read("supabase/functions/manage-pipeline-workspace/index.ts");
const automation = read("supabase/functions/manage-pipeline-automation/index.ts");
const contracts = read("supabase/functions/manage-client-contract/index.ts");
const status = read("supabase/functions/manage-client-status/index.ts");
const customization = read("supabase/functions/manage-company-customization/index.ts");
const sharedAuth = read("supabase/functions/_shared/auth.ts");
const functionsConfig = read("supabase/config.toml");
const pipelineConfiguration = read("supabase/functions/manage-company-pipeline/index.ts");
const admin = read("src/pages/SaasClientDetail.tsx");
const pipelineSetup = read("src/components/pipeline/PipelineSetup.tsx");
const pipelineLib = read("src/lib/pipeline.ts");
const pipelinePage = read("src/pages/Pipeline.tsx");
const clientDetail = read("src/pages/ClientDetail.tsx");
const earlyRenewalMigration = read("supabase/migrations/20260720010000_early_renewal_scheduled_activation.sql");

const checks = [];
function check(label, value) {
  checks.push({ label, passed: Boolean(value) });
}

check("workflow migration is disabled by default", /auto_create_renewal_items boolean not null default false/i.test(migration));
check("one active source contract is database-enforced per company", /client_pipeline_items_active_source_contract_unique_idx[\s\S]*company_id\s*,\s*source_contract_id/i.test(migration));
check("renewal automation key is database-enforced", /client_pipeline_items_active_automation_key_unique_idx/i.test(migration));
check("automation run ledger has RLS and no anonymous access", /pipeline_automation_runs enable row level security/i.test(migration) && /pipeline_automation_runs_no_anon_access/i.test(migration));
check("preview is pipeline-bound and non-materializing while generation enforces every kill switch", /preview_due_renewal_pipeline_items\(p_company_id uuid,p_pipeline_id uuid/i.test(migration) && /p\.id=p_pipeline_id/i.test(migration) && /company_pipeline_stages st where st\.id=v_stage and st\.pipeline_id=v_pipeline\.id/i.test(migration) && /preview_due_renewal_pipeline_items\(p_company_id,v_pipeline_id,p_as_of\)/i.test(migration) && /p_pipeline_id: pipelineId/i.test(automation) && /Preview is deliberately available while execution remains paused/i.test(migration) && (migration.match(/enable_pipeline/g) ?? []).length >= 2 && /p\.auto_create_renewal_items[\s\S]*renewal_generation_enabled[\s\S]*automation_paused/i.test(migration));
check("Gate C2 preview hotfix only qualifies the read-only stage lookup", /create or replace function public\.preview_due_renewal_pipeline_items/i.test(previewHotfix) && /company_pipeline_stages st[\s\S]*st\.pipeline_id = v_pipeline\.id/i.test(previewHotfix) && !/\b(?:insert into|update|delete from|alter table|drop table|create table)\b/i.test(previewHotfix) && /revoke all on function public\.preview_due_renewal_pipeline_items[\s\S]*public, anon, authenticated/i.test(previewHotfix) && /grant execute on function public\.preview_due_renewal_pipeline_items[\s\S]*service_role/i.test(previewHotfix));
check("Gate C2 preview hotfix has an exact fail-closed rollback", /create or replace function public\.preview_due_renewal_pipeline_items/i.test(previewHotfixRollback) && /where id = v_stage[\s\S]*pipeline_id = v_pipeline\.id/i.test(previewHotfixRollback) && /grant execute on function public\.preview_due_renewal_pipeline_items[\s\S]*service_role/i.test(previewHotfixRollback));
check("renewal eligibility has catch-up and core exclusions", /catch_up_days/i.test(migration) && /placeholder_end_date/i.test(migration) && /auto_renew/i.test(migration) && /month_to_month/i.test(migration) && /offboarded_client/i.test(migration));
check("renewal generation and resolution share a company lock", (migration.match(/pg_advisory_xact_lock/g) ?? []).length >= 4);
check("source and result contracts are modeled separately", /source_contract_id/i.test(migration) && /result_contract_id/i.test(migration));
check("Won creates contract and Pipeline evidence transactionally", /create_contract_and_close_pipeline_item/i.test(migration) && /client_pipeline_stage_events/i.test(migration) && /client_history_events/i.test(migration) && /app_audit_events/i.test(migration));
check("Lost requires a reason and does not directly churn", /Loss reason is required/i.test(migration) && !/update public\.clients[\s\S]{0,240}program_status_value='off-boarded'/i.test(migration));
check("offboarding synchronization is renewal-only and kill-switched", /close_renewal_pipeline_items_on_offboard/i.test(migration) && /pipeline_type='renewal'/i.test(migration) && /offboard_sync_enabled/i.test(migration));
check("stage task templates have durable links and idempotency", /pipeline_stage_event_id/i.test(migration) && /task_template_id/i.test(migration) && /client_tasks_stage_event_template_unique/i.test(migration));
check("normal stage evidence triggers stage-template tasks", /client_pipeline_stage_events_create_template_tasks/i.test(migration) && /new\.event_type in \('created','stage_changed'\)/i.test(migration));
check("run keys reject changed immutable inputs and preserve completed results", /on conflict\(company_id,run_key\) do update set run_key=excluded\.run_key/i.test(migration) && /v_run\.pipeline_id is distinct from v_pipeline_id/i.test(migration) && /v_run\.as_of_at is distinct from p_as_of/i.test(migration) && /already bound to different immutable inputs/i.test(migration) && /if v_run\.status='completed' then return jsonb_build_object/i.test(migration));
check("workflow RPCs are unavailable to browser roles", /revoke all on function public\.generate_due_renewal_pipeline_items[\s\S]*public,anon,authenticated/i.test(migration) && /grant execute on function public\.generate_due_renewal_pipeline_items[\s\S]*service_role/i.test(migration));
check("workspace terminal moves require guided flows", /Won and Lost require the guided resolution flow/i.test(workspace));
check("archived Pipeline items leave local workspace state immediately", /item\.archived_at\s*\|\|\s*item\.lifecycle_status\s*===\s*["']archived["'][\s\S]{0,180}current\.items\.filter\(\(row\)\s*=>\s*row\.id\s*!==\s*item\.id\)/i.test(pipelinePage));
check("manual renewal scan is Super Admin only", /Only a Super Admin can run renewal materialization/i.test(workspace));
check("independent renewal contract matching refuses ambiguity", /More than one open renewal item matches this client/i.test(contracts));
check("matched renewal contracts preserve retention status and success semantics", /p_retention_target_status/i.test(migration) && /client_retention_recorded/i.test(migration) && /p_mark_success/i.test(contracts));
check("ordinary contract writes persist renewal eligibility classifications", /contract_type: persistedContractType/i.test(contracts) && /billing_cadence: billingCadence/i.test(contracts) && /currency_code: contractCurrency/i.test(contracts));
check("add-on contracts cannot replace the primary summary", /contract\.contract_type[\s\S]{0,140}<> 'add_on'/i.test(earlyRenewalMigration));
check("Expansion creation persists optional same-company target offers atomically", /create_expansion_pipeline_item_with_target/i.test(migration) && /pipeline_type='expansion'/i.test(migration) && /o\.company_id=p_company_id/i.test(migration) && /create_expansion_pipeline_item_with_target/i.test(workspace));
check("Expansion target-offer edits are service-only and evidence-backed", /set_pipeline_item_target_offer_with_evidence/i.test(migration) && /grant execute on function public\.set_pipeline_item_target_offer_with_evidence[\s\S]*service_role/i.test(migration) && /set_pipeline_item_target_offer_with_evidence/i.test(workspace));
check("Expansion Won creates an add-on without primary pathway mutation", /v_type:=case when v_pipeline\.pipeline_type='renewal' then 'renewal' else 'add_on' end/i.test(migration) && /if v_type='renewal' then[\s\S]*update public\.clients/i.test(migration) && !/update public\.clients set[\s\S]{0,240}offer_milestones/i.test(migration));
check("Pipeline UI captures and displays target offers with add-on wording", /Target offer/i.test(pipelinePage) && /add-on contract/i.test(pipelinePage) && /primary pathway is not replaced/i.test(pipelinePage));
check("Client Detail shortcut is authorized-scope gated", /loadPipelineWorkspace/i.test(clientDetail) && /clientIsInAuthorizedScope/i.test(clientDetail) && /Add expansion opportunity/i.test(clientDetail));
check("production release excludes local Pipeline mock modules", !existsSync("src/lib/pipelineMock.ts") && !existsSync("src/pages/PipelineMockPreview.tsx") && !existsSync("src/pipeline-preview-main.tsx"));
check("task-template server validation supports Pipeline stages", /pipeline_stage_entered/i.test(customization) && /applies_to_pipeline_stage_id/i.test(customization));
check("task-template Admin UI supports Pipeline stages", /pipeline_stage_entered/i.test(admin) && /applies_to_pipeline_stage_id/i.test(admin));
check("renewal automation configuration is locked, audited, and service-only", /configure_pipeline_automation_with_audit/i.test(migration) && /pg_advisory_xact_lock/i.test(migration) && /grant execute on function public\.configure_pipeline_automation_with_audit[\s\S]*service_role/i.test(migration));
check("configuration Edge validates and invokes the automation RPC", /update_pipeline_automation/i.test(pipelineConfiguration) && /configure_pipeline_automation_with_audit/i.test(pipelineConfiguration) && /p_auto_create_renewal_items/i.test(pipelineConfiguration) && /p_auto_create_renewal_items boolean/i.test(migration) && /Enable this pipeline before configuring its automations/i.test(pipelineConfiguration));
check("Admin Pipeline UI exposes explicit renewal automation controls", /Automatically add eligible renewals/i.test(pipelineSetup) && /Active Open entry stage/i.test(pipelineSetup) && /Catch-up days/i.test(pipelineSetup) && /Sync offboarding to Lost/i.test(pipelineSetup) && /Enable stage-task templates/i.test(pipelineSetup));
check("automation Edge boundary authenticates and is configured", /requireAuthenticatedActor/i.test(automation) && /manage-pipeline-automation/i.test(read("supabase/config.toml")));
check("Gate B closures pin the reviewed Supabase client version", [sharedAuth, contracts, status, customization].every((source) => /https:\/\/esm\.sh\/@supabase\/supabase-js@2\.101\.1/.test(source)) && ![sharedAuth, contracts, status, customization].some((source) => /supabase-js@2["']/.test(source)));
check("Gate B membership fallback treats authenticated email as an exact value", [pipelineConfiguration, workspace, automation].every((source) => !source.includes('.ilike("email"')));
check("all six Gate B functions explicitly require gateway JWT verification", ["manage-company-pipeline", "manage-pipeline-workspace", "manage-pipeline-automation", "manage-client-contract", "manage-client-status", "manage-company-customization"].every((name) => new RegExp(`\\[functions\\.${name}\\]\\s*verify_jwt\\s*=\\s*true`, "m").test(functionsConfig)));
check("legacy writers resolve auth user first and reject read-only actors with controlled 403", [contracts, status].every((source) => /auth_user_id/i.test(source) && /is_read_only/i.test(source) && /class AuthError/i.test(source) && /error instanceof AuthError \? error\.status : 500/i.test(source)));
check("customization permission denials are controlled and read-only safe", /auth_user_id/i.test(customization) && /is_read_only/i.test(customization) && /throw new AuthError[\s\S]{0,180}403/i.test(customization) && /error instanceof AuthError \? error\.status : 500/i.test(customization));
check("disabled Pipeline preview is empty and run denies before materialization", /if \(!pipelineAccess\.enabled\)[\s\S]{0,700}enabled: false[\s\S]{0,500}Pipeline is disabled for this company/i.test(automation) && automation.indexOf("if (!pipelineAccess.enabled)") < automation.indexOf('rpc(\n      "generate_due_renewal_pipeline_items"'));
check("production workspace client invokes the JWT Edge boundary directly", /supabase\.functions\.invoke\([\s\S]{0,100}["']manage-pipeline-workspace["']/i.test(pipelineLib) && !/__RETAINOS_PIPELINE_MOCK__|retainos-local-pipeline-preview/i.test(pipelineLib));
check("production Admin configuration invokes the JWT Edge boundary directly", /supabase\.functions\.invoke\([\s\S]{0,100}["']manage-company-pipeline["']/i.test(pipelineSetup) && !/__RETAINOS_PIPELINE_MOCK__|retainos-local-pipeline-preview/i.test(pipelineSetup));
check("rollback disables automations before dropping trigger/functions", rollback.indexOf("set auto_create_renewal_items = false") < rollback.indexOf("drop trigger") && rollback.indexOf("drop trigger") < rollback.indexOf("drop function"));
check("rollback refuses to discard workflow evidence", (rollback.match(/Rollback refused/g) ?? []).length >= 4);
check("workflow SQL never mutates Glide backup tables", !/\b(?:insert into|update|delete from)\s+public\.backup_/i.test(migration));

const failures = checks.filter((item) => !item.passed);
for (const item of checks) console.log(`${item.passed ? "PASS" : "FAIL"} ${item.label}`);
console.log(`\n${checks.length - failures.length}/${checks.length} checks passed.`);
if (failures.length) process.exitCode = 1;
