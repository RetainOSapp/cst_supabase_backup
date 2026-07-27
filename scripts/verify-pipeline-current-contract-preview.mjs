import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260724173000_pipeline_current_contract_preview.sql");
const rollback = read("supabase/rollbacks/20260724173000_pipeline_current_contract_preview.rollback.sql");
const automation = read("supabase/functions/manage-pipeline-automation/index.ts");
const client = read("src/lib/pipeline.ts");
const page = read("src/pages/Pipeline.tsx");
const admin = read("src/components/pipeline/PipelineSetup.tsx");
const boundedContract = read("PIPELINE_BOUNDED_COHORT_API_CONTRACT.md");

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

check("preview starts from one row per company client",
  /from public\.clients client/i.test(migration));
check("current summary end is the preview source",
  /current_contract_end_date_for_filtering[\s\S]*current_contract_end_date/i.test(migration));
check("only a matching non-add-on current contract is evidence",
  /effective_end_at - current_dates\.current_end_at/i.test(migration)
  && /contract_type[\s\S]*<> 'add_on'/i.test(migration));
check("ambiguous or missing current-contract evidence fails closed",
  /missing_current_contract_evidence/i.test(migration)
  && /ambiguous_current_contract_evidence/i.test(migration));
check("unknown cadence is not excluded when fixed-term evidence exists",
  !/billing_cadence\s+in\s*\(\s*'open_ended'\s*,\s*'unknown'/i.test(migration));
check("existing current renewal is detected by source or renewal date",
  /source_contract_id = current_contract\.id/i.test(migration)
  && /renewal_at::date = current_dates\.current_end_at::date/i.test(migration));
check("preview privileges remain service-only",
  /revoke all on function[\s\S]*public, anon, authenticated/i.test(migration)
  && /grant execute on function[\s\S]*service_role/i.test(migration));
check("Edge preview delegates bounded selection and complete aggregates to the service RPC",
  /preview_renewal_pipeline_cohort/i.test(automation)
  && /totalEvaluated: Number\(result\.total_evaluated \?\? 0\)/i.test(automation)
  && /exclusionCounts: result\.exclusion_counts \?\? \{\}/i.test(automation));
check("frontend preview contract includes timing and complete counts",
  /interface RenewalPreviewResult/i.test(client)
  && /windowStart/i.test(client)
  && /totalEvaluated/i.test(client));
check("materialization is disabled until a non-empty matching preview exists",
  /previewMatchesCohort\(renewalPreview, renewalScanPipeline\.id, renewalCohort\)/i.test(page)
  && /selectedRenewalCount > 0/i.test(page)
  && /selectedRenewalCount <= renewalCohort\.maxItems/i.test(page));
check("initial cohort requires explicit dates and a hard 100-item maximum",
  /function cohortIsValid/i.test(page)
  && /cohort\.maxItems <= 100/i.test(page)
  && /type="date"/i.test(page)
  && /max="100"/i.test(page)
  && /renewalDateTo: addDays\(today, 7\)/i.test(page)
  && /maxItems: 10/i.test(page));
check("run requires an exact server preview binding, not just local state",
  /function previewMatchesCohort/i.test(page)
  && /bound\?\.previewToken/i.test(page)
  && /previewToken/i.test(client)
  && /action: "run_renewals"/i.test(client));
check("Director remains preview-only while SuperAdmin owns the run",
  /actorRole === "super_admin"/i.test(page)
  && /actorRole === "super_admin" \|\| workspace\?\.actorRole === "director"/i.test(page));
check("confirmation names the exact bounded cohort and leaves recurrence unchanged",
  /Add exactly \$\{selectedCount\} selected renewal/i.test(page)
  && /Recurring automation and schedules remain unchanged/i.test(page));
check("Admin status is read-only and degrades to explicit unknown",
  /Automation status/i.test(admin)
  && /This panel never enables, pauses, or schedules automation/i.test(admin)
  && /Treat pause, schedule, last-run, and failure state as unknown/i.test(admin));
check("bounded API and self-serve QA contract are documented",
  /binding\.previewToken/i.test(boundedContract)
  && /selectedCount/i.test(boundedContract)
  && /Self-serve QA checklist/i.test(boundedContract)
  && /status/i.test(boundedContract));
check("UI explains configured eligibility and lists the selected cohort",
  /Eligibility still respects the Renewal pipeline’s configured lead time, catch-up period, contract cadence, and client status/i.test(page)
  && /Review \{selectedRenewalCount\} selected client/i.test(page)
  && /selected for this run/i.test(page));
check("rollback fails preview closed",
  /preview is paused pending current-contract validation/i.test(rollback));

console.log(`\n${passed}/${passed + failed} current-contract preview checks passed.`);
if (failed > 0) process.exit(1);
