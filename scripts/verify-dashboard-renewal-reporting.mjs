#!/usr/bin/env node

import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260723100000_dashboard_renewal_decision_month.sql",
  "utf8",
);
const migratedEvidenceCorrection = readFileSync(
  "supabase/migrations/20260723103000_dashboard_migrated_contract_source_evidence.sql",
  "utf8",
);

const checks = [];
function check(label, passed) {
  checks.push({ label, passed: Boolean(passed) });
}

check(
  "paused and suspended/MIA clients are excluded",
  /program_status_value not in \('paused', 'suspended'\)/i.test(migration),
);
check(
  "pre-end churn is excluded from renewal eligibility",
  /client_age_date_offboarded[\s\S]{0,400}::date >= candidate\.contract_end_date::date/i.test(
    migration,
  ),
);
check(
  "renewal reporting uses the later expiry or renewal date",
  /greatest\([\s\S]{0,180}candidate\.contract_end_date[\s\S]{0,180}retention\.retained_at/i.test(
    migration,
  ),
);
check(
  "period filters use the derived reporting date",
  /p_date_range_start[\s\S]{0,100}eligible\.reporting_date[\s\S]{0,180}p_date_range_end[\s\S]{0,100}eligible\.reporting_date/i.test(
    migration,
  ),
);
check(
  "migrated status snapshots contribute prior contract ends",
  /migrated_snapshot_contract_ends[\s\S]{0,500}payload -> 'before' ->> 'current_contract_end_date'/i.test(
    migration,
  ) &&
    /source_snapshot'[\s\S]{0,120}current_contract_end_date/i.test(
      migratedEvidenceCorrection,
    ),
);
check(
  "each retention event is matched to only its nearest contract end",
  /partition by event\.event_key/i.test(migration) &&
    /where link\.match_rank = 1/i.test(migration),
);
check(
  "internal cohort function stays service-role only",
  /revoke all on function public\._dashboard_renewal_cohort_counts_fast_unchecked[\s\S]*from public, anon, authenticated[\s\S]*grant execute[\s\S]*to service_role/i.test(
    migration,
  ),
);

const failures = checks.filter((item) => !item.passed);
for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"} ${item.label}`);
}
console.log(
  `\n${checks.length - failures.length}/${checks.length} renewal-reporting checks passed.`,
);
if (failures.length) process.exitCode = 1;
