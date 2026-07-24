import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260724173000_pipeline_current_contract_preview.sql");
const rollback = read("supabase/rollbacks/20260724173000_pipeline_current_contract_preview.rollback.sql");
const automation = read("supabase/functions/manage-pipeline-automation/index.ts");
const client = read("src/lib/pipeline.ts");
const page = read("src/pages/Pipeline.tsx");

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
check("Edge preview paginates and returns complete aggregates",
  /\.range\(from, from \+ pageSize - 1\)/i.test(automation)
  && /totalEvaluated: rows\.length/i.test(automation)
  && /exclusionCounts/i.test(automation));
check("frontend preview contract includes timing and complete counts",
  /interface RenewalPreviewResult/i.test(client)
  && /windowStart/i.test(client)
  && /totalEvaluated/i.test(client));
check("materialization is disabled until a non-empty matching preview exists",
  /renewalPreview\?\.pipelineId === renewalScanPipeline\.id/i.test(page)
  && /renewalPreview\.eligibleCount > 0/i.test(page));
check("UI distinguishes operational timing and lists eligible clients",
  /This is the configured Pipeline window, not a calendar-month Dashboard total/i.test(page)
  && /Review \{renewalPreview\.eligibleCount\} eligible client/i.test(page));
check("rollback fails preview closed",
  /preview is paused pending current-contract validation/i.test(rollback));

console.log(`\n${passed}/${passed + failed} current-contract preview checks passed.`);
if (failed > 0) process.exit(1);
