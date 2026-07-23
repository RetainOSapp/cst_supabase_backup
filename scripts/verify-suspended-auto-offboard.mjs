#!/usr/bin/env node

import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260723130000_suspended_auto_offboard_policy.sql",
  "utf8",
);
const enablement = readFileSync(
  "supabase/migrations/20260723133000_enable_mm_suspended_auto_offboard.sql",
  "utf8",
);
const settingsPage = readFileSync("src/pages/SaasClientDetail.tsx", "utf8");
const settingsFunction = readFileSync(
  "supabase/functions/manage-company-customization/index.ts",
  "utf8",
);
const dashboard = readFileSync("src/pages/Dashboard.tsx", "utf8");

const checks = [];
function check(label, passed) {
  checks.push({ label, passed: Boolean(passed) });
}

check(
  "company policy defaults off with a 28-day bounded grace period",
  /enable_suspended_auto_offboard boolean[\s\S]{0,80}default false/i.test(
    migration,
  ) &&
    /suspended_auto_offboard_days integer[\s\S]{0,80}default 28/i.test(
      migration,
    ) &&
    /suspended_auto_offboard_days between 1 and 365/i.test(migration),
);
check(
  "only currently suspended clients with a recorded start date become due",
  /program_status_value = 'suspended'[\s\S]{0,180}program_latest_suspended_date is not null[\s\S]{0,260}make_interval\(days => settings\.suspended_auto_offboard_days\)/i.test(
    migration,
  ),
);
check(
  "effective churn date is suspension timestamp plus configured days",
  /v_effective_at :=[\s\S]{0,180}program_latest_suspended_date[\s\S]{0,120}make_interval\(days => v_due\.suspended_auto_offboard_days\)/i.test(
    migration,
  ) &&
    /client_age_date_offboarded = v_effective_at[\s\S]{0,120}client_age_date_offboarded_for_filtering = v_effective_at/i.test(
      migration,
    ),
);
check(
  "automatic change writes client history and internal audit evidence",
  /insert into public\.client_history_events[\s\S]{0,900}'suspended_auto_offboard'/i.test(
    migration,
  ) &&
    /insert into public\.app_audit_events[\s\S]{0,900}'suspended_auto_offboard'/i.test(
      migration,
    ),
);
check(
  "worker is idempotent, concurrency-safe, service-only, and scheduled",
  /for update of client skip locked/i.test(migration) &&
    /where client\.id = v_due\.id[\s\S]{0,240}program_status_value = 'suspended'/i.test(
      migration,
    ) &&
    /revoke all on function public\.process_due_suspended_auto_offboards[\s\S]{0,180}public, anon, authenticated/i.test(
      migration,
    ) &&
    /retainos-suspended-auto-offboards[\s\S]{0,180}\*\/15 \* \* \* \*/i.test(
      migration,
    ),
);
check(
  "automatic MIA churn remains churn and never becomes renewal eligible",
  /churn_reason_value = 'auto_suspended_timeout'/i.test(migration) &&
    /dashboard_kpi_counts_actor_scoped[\s\S]{0,1800}source\.churn_reason_value = 'auto_suspended_timeout'/i.test(
      migration,
    ) &&
    /source\.churn_reason_value = 'auto_suspended_timeout'[\s\S]{0,900}_dashboard_renewal_cohort_counts_fast_unchecked/i.test(
      migration,
    ) &&
    /client\.churn_reason_value !== "auto_suspended_timeout"/i.test(dashboard),
);
check(
  "undated legacy offboards are not assigned a contract-end reporting date",
  /function calculatedOffboardedDate[\s\S]{0,220}client_age_date_offboarded_for_filtering\)[\s\S]{0,30};/i.test(
    dashboard,
  ) &&
    !/function calculatedOffboardedDate[\s\S]{0,260}calculatedContractEndDate\(client\)/i.test(
      dashboard,
    ),
);
check(
  "Company Admin exposes dynamic-label on/off and days controls",
  /const suspendedStatusLabel[\s\S]{0,100}selectedProgramStatusLabels\.suspended/i.test(
    settingsPage,
  ) &&
    /Automatically offboard \$\{suspendedStatusLabel\} clients/i.test(
      settingsPage,
    ) &&
    /Days before offboarding/i.test(settingsPage) &&
    /enableSuspendedAutoOffboard: draft\.enable_suspended_auto_offboard/i.test(
      settingsPage,
    ) &&
    /suspendedAutoOffboardDays: draft\.suspended_auto_offboard_days/i.test(
      settingsPage,
    ),
);
check(
  "server validates and saves the new company policy",
  /enable_suspended_auto_offboard: Boolean\([\s\S]{0,100}body\.enableSuspendedAutoOffboard/i.test(
    settingsFunction,
  ) &&
    /suspended_auto_offboard_days: requiredBoundedInteger\([\s\S]{0,120}body\.suspendedAutoOffboardDays[\s\S]{0,80}28,[\s\S]{0,40}1,[\s\S]{0,40}365/i.test(
      settingsFunction,
    ),
);
check(
  "only Moves Method is enabled at 28 days",
  /21586391-9a84-4072-9ae6-20436b27bea9/i.test(enablement) &&
    /legacy_glide_row_id = 'wd7vy0vaQK2hgB3IRqy17w'/i.test(enablement) &&
    /enable_suspended_auto_offboard = true[\s\S]{0,80}suspended_auto_offboard_days = 28/i.test(
      enablement,
    ),
);

const failures = checks.filter((item) => !item.passed);
for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"} ${item.label}`);
}
console.log(
  `\n${checks.length - failures.length}/${checks.length} Suspended/MIA auto-offboard checks passed.`,
);
if (failures.length) process.exitCode = 1;
