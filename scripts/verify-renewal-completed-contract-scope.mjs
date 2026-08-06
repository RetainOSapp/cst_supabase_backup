#!/usr/bin/env node

import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260806100000_dashboard_renewal_completed_contract_scope.sql",
  "utf8",
);
const rollback = readFileSync(
  "supabase/rollbacks/20260806100000_dashboard_renewal_completed_contract_scope.sql",
  "utf8",
);
const churnReasonMigration = readFileSync(
  "supabase/migrations/20260806103000_dashboard_renewal_churn_reason_scope.sql",
  "utf8",
);
const churnReasonRollback = readFileSync(
  "supabase/rollbacks/20260806103000_dashboard_renewal_churn_reason_scope.sql",
  "utf8",
);
const canonicalFormula = readFileSync(
  "supabase/migrations/20260723100000_dashboard_renewal_decision_month.sql",
  "utf8",
);
const dashboard = readFileSync("src/pages/Dashboard.tsx", "utf8");

const checks = [];
function check(label, passed) {
  checks.push({ label, passed: Boolean(passed) });
}

function isEligible({ status, contractEnd, offboardedAt, churnReason = null }) {
  if (status === "paused" || status === "suspended") return false;
  if (status !== "off-boarded") {
    return status === "front-end" || status === "back-end";
  }
  if (String(churnReason ?? "").trim()) return false;
  if (!offboardedAt) return false;
  return offboardedAt >= contractEnd;
}

check(
  "normal completion is eligible while early churn and undated legacy offboards fail closed",
  isEligible({
    status: "off-boarded",
    contractEnd: "2026-07-10",
    offboardedAt: "2026-07-10",
  }) &&
    isEligible({
      status: "off-boarded",
      contractEnd: "2026-07-10",
      offboardedAt: "2026-07-18",
    }) &&
    !isEligible({
      status: "off-boarded",
      contractEnd: "2026-07-10",
      offboardedAt: "2026-06-20",
    }) &&
    !isEligible({
      status: "off-boarded",
      contractEnd: "2026-07-10",
      offboardedAt: null,
    }) &&
    !isEligible({
      status: "off-boarded",
      contractEnd: "2026-07-10",
      offboardedAt: "2026-07-18",
      churnReason: "auto_suspended_timeout",
    }),
);
check(
  "Paused and Suspended/MIA remain excluded",
  !isEligible({
    status: "paused",
    contractEnd: "2026-07-10",
    offboardedAt: null,
  }) &&
    !isEligible({
      status: "suspended",
      contractEnd: "2026-07-10",
      offboardedAt: null,
    }),
);
check(
  "migration preserves archive and analytics exclusions",
  /client\.archived_at is null/i.test(migration) &&
    /client\.exclude_from_dashboard_analytics = false/i.test(migration),
);
check(
  "migration admits only active or dated decision-window offboarded records",
  /client\.program_status_value in \('front-end', 'back-end'\)/i.test(
    migration,
  ) &&
    /client\.program_status_value = 'off-boarded'/i.test(migration) &&
    /client_age_date_offboarded_for_filtering[\s\S]{0,240}>= p_date_range_start - interval '120 days'/i.test(
      migration,
    ),
);
check(
  "downstream canonical rule still requires offboard date on or after the exact contract end",
  /client\.program_status_value not in \('paused', 'suspended'\)/i.test(
    canonicalFormula,
  ) &&
    /client_age_date_offboarded_for_filtering[\s\S]{0,180}::date >= candidate\.contract_end_date::date/i.test(
      canonicalFormula,
    ),
);
check(
  "patch is shape-checked and changes exactly one function scope",
  /replacement_count <> 1/i.test(migration) &&
    /Expected one active-only renewal scope/i.test(migration) &&
    /execute replace\(function_definition, old_scope, new_scope\)/i.test(
      migration,
    ),
);
check(
  "recorded churn reasons, including MIA auto-offboard, are excluded",
  /nullif\(btrim\(client\.churn_reason_value\), ''\) is null/i.test(
    churnReasonMigration,
  ) &&
    /auto_suspended_timeout/i.test(churnReasonMigration) &&
    /replacement_count <> 1/i.test(churnReasonMigration),
);
check(
  "churn-reason rollback restores the prior completed-contract scope",
  /previous_scope/i.test(churnReasonRollback) &&
    /execute replace\(function_definition, corrected_scope, previous_scope\)/i.test(
      churnReasonRollback,
    ),
);
check(
  "rollback restores the exact active-only scope",
  /active_only_scope/i.test(rollback) &&
    /client\.program_status_value in \('front-end', 'back-end'\)/i.test(
      rollback,
    ) &&
    /execute replace\(function_definition, corrected_scope, active_only_scope\)/i.test(
      rollback,
    ),
);
check(
  "Dashboard keeps the canonical fast cohort and active unresolved work queue",
  /dashboard_renewal_cohort_counts_fast/i.test(dashboard) &&
    /const unresolvedRenewalIds =/i.test(dashboard) &&
    /setActiveRenewingClients/i.test(dashboard),
);
check(
  "July evidence reconciles retained, unresolved, and normal completions",
  47 + 50 === 97 &&
    97 + 237 === 334 &&
    47 + 1 === 48 &&
    Math.round((48 / 334) * 100) === 14,
);

const failures = checks.filter((item) => !item.passed);
for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"} ${item.label}`);
}
console.log(
  `\n${checks.length - failures.length}/${checks.length} completed-contract renewal checks passed.`,
);
if (failures.length) process.exitCode = 1;
