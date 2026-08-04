import { readFileSync } from "node:fs";

const dashboard = readFileSync("src/pages/Dashboard.tsx", "utf8");
const clientDetail = readFileSync("src/pages/ClientDetail.tsx", "utf8");
const clients = readFileSync("src/pages/Clients.tsx", "utf8");
const calendarDate = readFileSync("src/lib/calendarDate.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260803190000_migrated_contract_summary_compatibility.sql",
  "utf8",
);
const reconciliationMigration = readFileSync(
  "supabase/migrations/20260803191000_audited_contract_summary_reconciliation.sql",
  "utf8",
);
const repair = readFileSync(
  "scripts/reconcile-mm-contract-summaries.mjs",
  "utf8",
);

const checks = [];
function check(label, passed) {
  checks.push({ label, passed: Boolean(passed) });
}

check(
  "explicit-period active renewal count uses canonical cohort ids",
  /canonicalRenewalClientIds[\s\S]{0,700}canonicalRetainedClientIds[\s\S]{0,900}setActiveRenewingClients\(reportedActiveRenewingClients\)/.test(
    dashboard,
  ),
);
check(
  "active renewal drawer uses the same canonical cohort and excludes retained clients",
  /\["retained", "renewing", "active-renewing"\]\.includes\(detailKey\)[\s\S]{0,450}dashboard_renewal_cohort_counts_fast/.test(
    dashboard,
  ) &&
    /detailKey === "active-renewing"[\s\S]{0,450}retainedCohortClientIds\.has\(clientId\)[\s\S]{0,350}currentSummaryRenewingIds\.add\(clientId\)/.test(
      dashboard,
    ),
);
check(
  "canonical KPI path resolves active rows from canonical unresolved ids",
  dashboard.includes("const unresolvedRenewalIds =") &&
    dashboard.includes("Failed to resolve active clients from renewal cohort:") &&
    dashboard.includes('["front-end", "back-end"].includes(') &&
    dashboard.includes("activeRenewingSetFromCohort = true"),
);
check(
  "explicit-period renewal failures do not fall back to mixed legacy formulas",
  /hasExplicitRenewalPeriod &&[\s\S]{0,100}renewalCohortResult\.error[\s\S]{0,240}setRetainedClients\(null\)[\s\S]{0,240}setRetentionPercentage\(null\)/.test(
    dashboard,
  ) &&
    /else if \(hasExplicitRenewalPeriod\)[\s\S]{0,300}setRetainedClients\(null\)[\s\S]{0,240}setRetentionPercentage\(null\)/.test(
      dashboard,
    ),
);
check(
  "migrated current-summary contracts participate in summary refresh",
  /contract\.status[\s\S]{0,80}in \('active', 'current_summary'\)/i.test(
    migration,
  ),
);
check(
  "summary refresh remains service-role only",
  /revoke all on function public\.refresh_client_contract_summary[\s\S]*from public, anon, authenticated[\s\S]*grant execute[\s\S]*to service_role/i.test(
    migration,
  ),
);
check(
  "calendar dates render in UTC rather than browser-local time",
  /timeZone: "UTC"/.test(calendarDate) &&
    /formatCalendarDate/.test(clientDetail) &&
    /formatCalendarDate/.test(clients) &&
    /formatCalendarDate\(client\.renewal_date\)/.test(dashboard),
);
check(
  "reconciliation is dry-run by default and applies only explicit safe repairs",
  /const apply = process\.argv\.includes\("--apply"\)/.test(repair) &&
    /if \(!apply\) return/.test(repair) &&
    /safeRepairs/.test(repair) &&
    /appEditedContract/.test(repair),
);
check(
  "Lisa stays pending manual date confirmation",
  /lfl3JCLnTsiN5QpK9APKGg/.test(repair) &&
    /pendingManualClientIds/.test(repair),
);
check(
  "each applied summary repair writes before-and-after audit evidence",
  /reconcile_client_contract_summary/.test(repair) &&
    /'contract_summary_reconciled'/.test(reconciliationMigration) &&
    /v_before/.test(reconciliationMigration) &&
    /v_after/.test(reconciliationMigration) &&
    /grant execute[\s\S]*to service_role/i.test(reconciliationMigration),
);

const failures = checks.filter((item) => !item.passed);
for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"} ${item.label}`);
}
console.log(
  `\n${checks.length - failures.length}/${checks.length} renewal consistency checks passed.`,
);
if (failures.length) process.exitCode = 1;
