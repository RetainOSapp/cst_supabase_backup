import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const migration = read(
  "supabase/migrations/20260806120000_pipeline_strategic_review_catchup.sql",
);
const rollback = read(
  "supabase/rollbacks/20260806120000_pipeline_strategic_review_catchup.sql",
);
const repairGate = read(
  "supabase/release-gates/20260806130000_pipeline_mm_strategic_review_repair.sql",
);
const checkpoint = read(
  "supabase/functions/manage-client-timed-checkpoint/index.ts",
);
const pipeline = read("src/pages/Pipeline.tsx");
const dailyPulse = read("src/pages/DailyPulse.tsx");

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

const dollarQuotes = (value) => (value.match(/\$\$/g) ?? []).length;

check(
  "migration and rollback balance dollar quotes",
  dollarQuotes(migration) % 2 === 0 && dollarQuotes(rollback) % 2 === 0,
);
check(
  "Strategic Review helper is company/client locked and Pipeline gated",
  /ensure_strategic_review_pipeline_item/i.test(migration) &&
    /pg_advisory_xact_lock/i.test(migration) &&
    /is_company_pipeline_enabled/i.test(migration),
);
check(
  "missing-card creation uses canonical current-contract eligibility",
  /preview_due_renewal_pipeline_items/i.test(migration) &&
    /eligibility_status <> 'eligible'/i.test(migration) &&
    /renewal_contract:/i.test(migration),
);
check(
  "missing-card creation is idempotent and lands in the configured target stage",
  /on conflict\(company_id, automation_key\)/i.test(migration) &&
    /v_target_stage\.id/i.test(migration) &&
    /created_directly_in_target_stage/i.test(migration),
);
check(
  "created cards preserve stage, history, audit, owner-trigger, and task evidence",
  /client_pipeline_stage_events/i.test(migration) &&
    /client_history_events/i.test(migration) &&
    /app_audit_events/i.test(migration) &&
    /create_pipeline_tasks_for_stage_event/i.test(migration),
);
check(
  "helper remains service-only and rollback removes only the helper behavior",
  /revoke all on function public\.ensure_strategic_review_pipeline_item[\s\S]*from public, anon, authenticated/i.test(
    migration,
  ) &&
    /grant execute on function public\.ensure_strategic_review_pipeline_item[\s\S]*to service_role/i.test(
      migration,
    ) &&
    /drop function if exists public\.ensure_strategic_review_pipeline_item/i.test(
      rollback,
    ),
);
check(
  "checkpoint Edge flow delegates create-or-move atomically and preserves warnings",
  /supabase\.rpc\(\s*"ensure_strategic_review_pipeline_item"/i.test(
    checkpoint,
  ) &&
    /pipelineWarning[\s\S]*result\?\.warning/i.test(checkpoint),
);
check(
  "daily recurrence rechecks configured catch-up through lead horizon",
  /automation_settings ->> 'catch_up_days'/i.test(migration) &&
    /v_evaluation - make_interval\(days => v_catchup\)/i.test(migration) &&
    /v_evaluation \+ make_interval\(days => v_lead\)/i.test(migration),
);
check(
  "rolling catch-up retains existing per-company and global caps",
  /v_cap := least\([\s\S]*v_controls\.per_company_max_create/i.test(
    migration,
  ) &&
    /least\(p_max_total_create, v_controls\.max_total_create\)/i.test(
      migration,
    ) &&
    /materialize_renewal_pipeline_window/i.test(migration),
);
check(
  "rollback restores the exact-day recurring window",
  /p_as_of \+ make_interval\(days => v_lead\)/i.test(rollback) &&
    /v_setting\.recurring_window_days/i.test(rollback),
);
check(
  "preview automatically applies the matching Renewal custom range",
  /setDateKind\("renewal"\)/i.test(pipeline) &&
    /setDateWindow\("custom"\)/i.test(pipeline) &&
    /setCustomDateFrom\(renewalCohort\.renewalDateFrom\)/i.test(pipeline) &&
    /setCustomDateTo\(renewalCohort\.renewalDateTo\)/i.test(pipeline),
);
check(
  "board custom range filters inclusively on the selected timing value",
  /dateWindow === "custom"/i.test(pipeline) &&
    /value < customDateFrom/i.test(pipeline) &&
    /value > customDateTo/i.test(pipeline),
);
check(
  "UI keeps the 100-write cap explicit and explains repeated safe batches",
  /Maximum items per run/i.test(pipeline) &&
    /max="100"/i.test(pipeline) &&
    /additional eligible renewal/i.test(pipeline) &&
    /preview the same dates again/i.test(pipeline),
);
check(
  "Daily Pulse treats contract end and Strategic Review due dates as calendar dates",
  /function parseCalendarDate/i.test(dailyPulse) &&
    /isCalendarDateWithin\(\s*client\.current_contract_end_date_for_filtering/i.test(
      dailyPulse,
    ) &&
    /const contractEnd = parseCalendarDate/i.test(dailyPulse) &&
    /formatCalendarDate\(client\.current_contract_end_date_for_filtering\)/i.test(
      dailyPulse,
    ),
);
check(
  "MM repair is bound to exactly 13 completions and 11 date corrections",
  /cardinality\(v_completion_ids\) <> 13/i.test(repairGate) &&
    /v_due_dates_corrected <> 11/i.test(repairGate) &&
    /completion\.id = any\(v_completion_ids\)/i.test(repairGate),
);
check(
  "MM repair requires all current contracts eligible and exact Review Complete configuration",
  /preview_due_renewal_pipeline_items/i.test(repairGate) &&
    /eligibility\.eligibility_status = 'eligible'/i.test(repairGate) &&
    /stage\.name = 'Review Complete'/i.test(repairGate) &&
    /strategic_review_pipeline_automation/i.test(repairGate),
);
check(
  "MM repair links completion metadata and appends aggregate audit evidence",
  /'pipeline_item_id', v_item_id/i.test(repairGate) &&
    /'previous_due_at', v_completion\.due_at/i.test(repairGate) &&
    /pipeline_strategic_review_repair_completed/i.test(repairGate),
);
check(
  "correction SQL never touches Glide backup tables",
  !/backup_/i.test(migration) &&
    !/backup_/i.test(rollback) &&
    !/backup_/i.test(repairGate),
);

console.log(`\n${passed}/${passed + failed} Pipeline feedback checks passed.`);
if (failed > 0) process.exit(1);
