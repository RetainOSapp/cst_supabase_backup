#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260720010000_early_renewal_scheduled_activation.sql");
const rollback = read("supabase/rollbacks/20260720010000_early_renewal_scheduled_activation.sql");
const historyEventHotfix = read("supabase/migrations/20260720020000_early_renewal_history_event_types.sql");
const historyEventHotfixRollback = read("supabase/rollbacks/20260720020000_early_renewal_history_event_types.sql");
const contracts = read("supabase/functions/manage-client-contract/index.ts");
const workspace = read("supabase/functions/manage-pipeline-workspace/index.ts");
const pipelinePage = read("src/pages/Pipeline.tsx");
const clientDetail = read("src/pages/ClientDetail.tsx");

const checks = [];
function check(label, passed) {
  checks.push({ label, passed: Boolean(passed) });
}

check("migration and rollback balance dollar quotes", (migration.match(/\$\$/g) ?? []).length % 2 === 0 && (rollback.match(/\$\$/g) ?? []).length % 2 === 0);
check("history-event hotfix and rollback balance dollar quotes", (historyEventHotfix.match(/\$rollback_guard\$/g) ?? []).length % 2 === 0 && (historyEventHotfixRollback.match(/\$rollback_guard\$/g) ?? []).length % 2 === 0);
check("scheduled activation history types are permitted explicitly", ["scheduled_contract_activation_created", "scheduled_contract_activation_completed", "scheduled_contract_activation_blocked"].every((value) => historyEventHotfix.includes(`'${value}'`)) && /validate constraint client_history_events_event_type_check/i.test(historyEventHotfix) && /refusing rollback while scheduled-activation client history evidence exists/i.test(historyEventHotfixRollback));
check("scheduled activation evidence is additive and company-scoped", /create table if not exists public\.scheduled_contract_activations/i.test(migration) && /company_id uuid not null/i.test(migration) && /client_id uuid not null/i.test(migration));
check("only one pending activation is allowed per client", /scheduled_contract_activations_client_pending_unique[\s\S]*where status = 'pending'/i.test(migration));
check("future contracts are pending and never replace the current summary early", /coalesce\(p_auto_renew, false\), 'pending', 'renewal'/i.test(migration) && /contract\.start_date <= p_as_of/i.test(migration) && /contract\.contract_type[\s\S]{0,140}<> 'add_on'/i.test(migration));
check("same-program Front End and Back End renewals are both accepted", /p_target_status <> v_client\.program_status_value[\s\S]{0,180}front-end[\s\S]{0,80}back-end/i.test(migration));
check("Front End to Back End retention remains a primary renewal contract", /retentionType === "upsell"\) return "renewal"/i.test(contracts));
check("retention is recorded at signing with the future effective date", /client_retention_recorded/i.test(migration) && /'retention_date', p_start_date/i.test(migration) && /'decision_recorded_at', now\(\)/i.test(migration));
check("future Pipeline Won closes commercially while linking the pending contract", /lifecycle_status = 'won'/i.test(migration) && /result_contract_id = v_contract\.id/i.test(migration) && /scheduled_activation', true/i.test(migration));
check("due processor is idempotent and concurrency-safe", /where status = 'pending' and scheduled_for <= p_as_of/i.test(migration) && /for update skip locked/i.test(migration) && /set status = 'completed'/i.test(migration));
check("due processor fails closed when client or evidence changed", /client_not_active/i.test(migration) && /client_status_changed/i.test(migration) && /pipeline_evidence_mismatch/i.test(migration) && /set status = 'blocked'/i.test(migration));
check("contract edits, archives, and deletes reconcile pending activation", /reconcile_scheduled_contract_activation/i.test(migration) && ["archive", "delete", "update"].every((action) => new RegExp(`reconcileScheduledActivation\\([\\s\\S]{0,220}\"${action}\"`).test(contracts)));
check("scheduled functions are service-only", (migration.match(/to service_role/g) ?? []).length >= 4 && /revoke all on function public\.process_due_scheduled_contract_activations[\s\S]*public, anon, authenticated/i.test(migration));
check("rollback refuses to discard activation evidence", /Rollback refused: scheduled contract activation evidence exists/i.test(rollback));
check("both server creation paths invoke the scheduled contract RPC", /create_scheduled_retention_contract/i.test(contracts) && /create_scheduled_retention_contract/i.test(workspace));
check("both UIs explain pending activation and offer start-date timing", /remains Pending and becomes current automatically/i.test(clientDetail) && /Move to Back End/i.test(clientDetail) && /remains Pending and becomes current automatically/i.test(pipelinePage) && /On contract start date/i.test(pipelinePage));
check("Client Detail renders pending contracts distinctly", /return "Pending"/i.test(clientDetail) && /border-sky-200 bg-sky-50 text-sky-700/i.test(clientDetail));
check("production release excludes the local scheduled-activation mock", !existsSync("src/lib/pipelineMock.ts") && !existsSync("src/pages/PipelineMockPreview.tsx") && !/__RETAINOS_PIPELINE_MOCK__|retainos-local-pipeline-preview/i.test(pipelinePage + clientDetail));
check("migration never writes backup tables", !/\b(?:insert into|update|delete from)\s+public\.backup_/i.test(migration));

const failures = checks.filter((item) => !item.passed);
for (const item of checks) console.log(`${item.passed ? "PASS" : "FAIL"} ${item.label}`);
console.log(`\n${checks.length - failures.length}/${checks.length} early-renewal checks passed.`);
if (failures.length) process.exitCode = 1;
