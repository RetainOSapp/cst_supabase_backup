#!/usr/bin/env node

import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260727130000_pipeline_primary_owner_assignment.sql");
const rollback = read("supabase/rollbacks/20260727130000_pipeline_primary_owner_assignment.sql");
const ownerGate = read("supabase/release-gates/20260727132000_pipeline_mm_owner_backfill.sql");
const recurringGate = read("supabase/release-gates/20260727133000_pipeline_mm_recurring_enable.sql");
const recurringRollback = read("supabase/rollbacks/20260727133000_pipeline_mm_recurring_enable.sql");
const header = read("src/components/Header.tsx");

const checks = [];
const check = (label, passed) => checks.push({ label, passed: Boolean(passed) });

check("owner resolver requires one exact active primary mapping",
  /member\.legacy_glide_row_id = client\.csm_team_member_id/i.test(migration)
  && /member\.status = 'active'/i.test(migration)
  && /member\.is_read_only = false/i.test(migration)
  && /when count\(\*\) = 1/i.test(migration));
check("owner trigger is limited to contract-linked Renewal inserts",
  /before insert on public\.client_pipeline_items/i.test(migration)
  && /new\.source_contract_id is null/i.test(migration)
  && /pipeline\.pipeline_type = 'renewal'/i.test(migration));
check("owner functions are unavailable to browser roles",
  /revoke all on function public\.resolve_pipeline_primary_owner_member_id[\s\S]*public, anon, authenticated/i.test(migration));
check("owner rollback stops only future assignment",
  /drop trigger if exists client_pipeline_items_assign_primary_owner/i.test(rollback)
  && !/\bupdate public\.client_pipeline_items/i.test(rollback));
check("MM owner backfill requires the exact approved twelve and uses audited mutation",
  /v_count <> 12/i.test(ownerGate)
  && /mutate_pipeline_item_with_evidence/i.test(ownerGate)
  && /system_rollout/i.test(ownerGate));
check("MM recurrence gate is company/pipeline bound and refuses other enrollment",
  /21586391-9a84-4072-9ae6-20436b27bea9/i.test(recurringGate)
  && /70bb9fe9-759d-4594-a8c3-e129d984893f/i.test(recurringGate)
  && /Another company or pipeline is already enrolled/i.test(recurringGate));
check("MM recurrence starts without first backfill and keeps optional automations off",
  /first_backfill_enabled,[\s\S]*recurring_enabled/i.test(recurringGate)
  && /false,[\s\S]*true,[\s\S]*now\(\),[\s\S]*1/i.test(recurringGate)
  && /'offboard_sync_enabled', false/i.test(recurringGate)
  && /'stage_task_creation_enabled', false/i.test(recurringGate));
check("MM recurrence has a fail-closed pause rollback",
  /scheduler_paused = true/i.test(recurringRollback)
  && /renewal_materialization_paused = true/i.test(recurringRollback)
  && /recurring_enabled = false/i.test(recurringRollback)
  && /renewal_generation_enabled', false/i.test(recurringRollback));
check("navigation uses company-and-role scoped verified session caching",
  /pipelineVisibilityCacheKey/i.test(header)
  && /sessionStorage/i.test(header)
  && /effectiveCompanyId/i.test(header)
  && /role/i.test(header));
check("visibility refresh invalidates cached access before refetch",
  /retainos:pipeline-visibility-changed/i.test(header)
  && /removeItem/i.test(header));

const failures = checks.filter(({ passed }) => !passed);
for (const { label, passed } of checks) console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
console.log(`\n${checks.length - failures.length}/${checks.length} owner/navigation checks passed.`);
if (failures.length) process.exitCode = 1;
