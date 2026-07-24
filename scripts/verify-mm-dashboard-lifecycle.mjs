import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const foundation = read(
  "supabase/migrations/20260724110000_dashboard_analytics_exclusions.sql",
);
const reconciliation = read(
  "supabase/migrations/20260724113000_mm_lifecycle_reconciliation.sql",
);
const dashboard = read("src/pages/Dashboard.tsx");
const pausedCard = read(
  "src/components/dashboard/kpis/PausedClientsKpi.tsx",
);

const checks = [
  [
    "analytics exclusions default off for every company",
    /dashboard_exclude_unassigned_clients boolean[\s\S]{0,60}default false/i.test(
      foundation,
    ),
  ],
  [
    "clients carry a shared dashboard inclusion decision",
    /exclude_from_dashboard_analytics boolean[\s\S]{0,60}default false/i.test(
      foundation,
    ) &&
      /dashboard_analytics_exclusion_reason/i.test(foundation),
  ],
  [
    "new assignments recompute dashboard inclusion",
    /clients_set_dashboard_analytics_exclusion[\s\S]{0,180}before insert or update of company_id, csm_team_member_id/i.test(
      foundation,
    ),
  ],
  [
    "canonical dashboard authority excludes flagged clients",
    /dashboard_authorized_app_clients[\s\S]{0,12000}client\.exclude_from_dashboard_analytics = false/i.test(
      foundation,
    ),
  ],
  [
    "MM exclusion policy is company scoped",
    /21586391-9a84-4072-9ae6-20436b27bea9[\s\S]{0,500}dashboard_exclude_unassigned_clients = true/i.test(
      reconciliation,
    ) &&
      /lower\(btrim\(name\)\) = 'jhoyce'/i.test(reconciliation),
  ],
  [
    "safe CST offboard correction rejects later app changes",
    /'safe_cst_offboard_date'/i.test(reconciliation) &&
      /mm_clients_with_app_status_change[\s\S]{0,900}audit\.event_type = 'client_status_changed'/i.test(
        reconciliation,
      ) &&
      /not exists \([\s\S]{0,180}mm_clients_with_app_status_change/i.test(
        reconciliation,
      ),
  ],
  [
    "Christopher has only the confirmed CST exception",
    /HeeH6xHKT8K0MJBuJzn1aw[\s\S]{0,600}2026-05-12T07:53:06\.471Z/i.test(
      reconciliation,
    ),
  ],
  [
    "ambiguous app-owned date mismatches remain review only",
    /app_status_date_review[\s\S]{0,80}'review_required'/i.test(
      reconciliation,
    ),
  ],
  [
    "MIA/offboard contradictions reconcile from recorded date",
    /status_offboard_date_contradiction[\s\S]{0,2500}program_status_value = 'off-boarded'/i.test(
      reconciliation,
    ),
  ],
  [
    "missing MIA timers recover only from CST suspended history",
    /'mia_timer_backfill'/i.test(reconciliation) &&
      /mm_cst_program_status[\s\S]{0,900}backup_company_clients_history/i.test(
        reconciliation,
      ) &&
      /join pg_temp\.mm_latest_cst_program_status history[\s\S]{0,500}history\.value = 'suspended'/i.test(
        reconciliation,
      ),
  ],
  [
    "frontend direct app-owned reads use the shared exclusion flag",
    (dashboard.match(
      /exclude_from_dashboard_analytics", false/g,
    )?.length ?? 0) >= 5,
  ],
  [
    "Paused card uses the workspace label and has a drilldown",
    /<PausedClientsKpi[\s\S]{0,350}statusDistributionLabels\.get\("paused"\)[\s\S]{0,350}openDetailDrawer\("paused"\)/i.test(
      dashboard,
    ) &&
      /underlying Paused status/i.test(pausedCard),
  ],
  [
    "Paused count comes from canonical and client-side paths",
    /setPausedClients\(paused\.length\)/i.test(dashboard) &&
      /setPausedClients\(Number\(row\?\.paused_clients \?\? 0\)\)/i.test(
        dashboard,
      ),
  ],
];

const failures = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
}

if (failures.length > 0) {
  process.exitCode = 1;
}

console.log(
  `\n${checks.length - failures.length}/${checks.length} MM dashboard lifecycle checks passed.`,
);
