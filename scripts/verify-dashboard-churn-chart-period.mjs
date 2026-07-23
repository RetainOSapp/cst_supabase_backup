#!/usr/bin/env node

import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260723120000_dashboard_churn_chart_period_filter.sql",
  "utf8",
);
const dashboard = readFileSync("src/pages/Dashboard.tsx", "utf8");
const types = readFileSync("src/types/supabase.ts", "utf8");

const checks = [];
function check(label, passed) {
  checks.push({ label, passed: Boolean(passed) });
}

check(
  "viewer-safe churn aggregate accepts a reporting-period start",
  /dashboard_churn_reason_rollup_actor_scoped\([\s\S]{0,700}p_date_range_start timestamptz default null/i.test(
    migration,
  ),
);
check(
  "aggregate requires a real recorded offboarding date",
  /client_age_date_offboarded[\s\S]{0,180}client_age_date_offboarded_for_filtering[\s\S]{0,120}is not null/i.test(
    migration,
  ),
);
check(
  "aggregate applies both inclusive start and exclusive end boundaries",
  /p_date_range_start[\s\S]{0,350}>= p_date_range_start[\s\S]{0,350}p_date_range_end[\s\S]{0,350}< p_date_range_end \+ interval '1 day'/i.test(
    migration,
  ),
);
check(
  "frontend sends both reporting-period boundaries to the aggregate",
  /p_date_range_start: rpcFilterParams\.p_date_range_start[\s\S]{0,120}p_date_range_end: rpcFilterParams\.p_date_range_end/i.test(
    dashboard,
  ),
);
check(
  "drilldown-capable chart data uses recorded offboarding dates",
  /const churnChartClients = clients\.filter\([\s\S]{0,500}recordedOffboardedDate\(client\)[\s\S]{0,180}appliedFilters\.dateRange\.startDate[\s\S]{0,120}appliedFilters\.dateRange\.endDate/i.test(
    dashboard,
  ),
);
check(
  "churn chart drilldown applies the same reporting period",
  /openChartDetail\([\s\S]{0,100}\"Churn Reason\"[\s\S]{0,500}recordedOffboardedDate\(client\)/i.test(
    dashboard,
  ),
);
check(
  "generated RPC types expose the new start parameter",
  /dashboard_churn_reason_rollup_actor_scoped:[\s\S]{0,350}p_date_range_start\?: string/i.test(
    types,
  ),
);

const failures = checks.filter((item) => !item.passed);
for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"} ${item.label}`);
}
console.log(
  `\n${checks.length - failures.length}/${checks.length} churn-chart period checks passed.`,
);
if (failures.length) process.exitCode = 1;
