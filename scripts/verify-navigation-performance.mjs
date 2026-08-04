import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const checks = [];

function check(name, assertion) {
  assert.ok(assertion, name);
  checks.push(name);
  console.log(`PASS ${name}`);
}

const app = read("src/App.tsx");
const dashboard = read("src/pages/Dashboard.tsx");
const dailyPulse = read("src/pages/DailyPulse.tsx");
const tasks = read("src/pages/Tasks.tsx");
const clients = read("src/pages/Clients.tsx");
const csmReports = read("src/pages/CsmReports.tsx");
const resources = read("src/pages/Resources.tsx");

check(
  "sidebar pages are route-split behind React lazy",
  app.includes('const Dashboard = lazy(() =>') &&
    app.includes('const DailyPulse = lazy(() =>') &&
    app.includes('const Clients = lazy(() =>') &&
    app.includes('const Tasks = lazy(() =>') &&
    app.includes('const CsmReports = lazy(() =>') &&
    app.includes("<Suspense fallback={<PageLoading />}>"),
);

const canonicalKpiLoad = dashboard.indexOf(
  "const loadedCanonical = await loadCanonicalKpis();",
);
const clientSideFallback = dashboard.indexOf(
  "await loadClientSideFilteredKpis();",
  canonicalKpiLoad,
);
check(
  "app-owned dashboard loads canonical aggregates before client-side fallback",
  canonicalKpiLoad >= 0 && clientSideFallback > canonicalKpiLoad,
);
check(
  "app-owned advocacy overview uses aggregate rollups",
  dashboard.includes('dashboard_overview_rollups_actor_scoped') &&
    dashboard.includes("if (appCompany?.id) return;"),
);

check(
  "Daily Pulse roster excludes analytics-disabled and irrelevant status rows",
  dailyPulse.includes('.eq("exclude_from_dashboard_analytics", false)') &&
    dailyPulse.includes('.in("program_status_value", PULSE_ROSTER_STATUSES)'),
);
check(
  "Daily Pulse filters closed tasks before transfer",
  dailyPulse.includes(
    '"status_value.is.null,status_value.not.in.(done,completed,closed,dismissed,archived)"',
  ) &&
    dailyPulse.includes('.is("completion_date", null)'),
);
check(
  "Daily Pulse only loads history and checkpoints for enabled signals",
  dailyPulse.includes('enabledTypes.has("quiet_profile")') &&
    dailyPulse.includes('enabledTypes.has("strategic_review_due")'),
);

check(
  "Tasks applies status and due-window filters in PostgREST",
  tasks.includes('const closedStatuses =') &&
    tasks.includes('statusMode === "overdue"') &&
    tasks.includes('.lt("task_due_date", afterDueSoon.toISOString())'),
);

check(
  "Clients calendar bounds client rows to visible event dates",
  clients.includes("const calendarDateFilter = [") &&
    clients.includes("current_contract_end_date_for_filtering.gte.") &&
    clients.includes("csm_date_of_next_contact.gte."),
);
check(
  "Clients calendar restores task-linked clients outside the date query",
  clients.includes("const missingTaskClientIds = [") &&
    clients.includes('"Failed to load calendar task clients:"'),
);

check(
  "CSM Reports uses bounded concurrent history batches",
  csmReports.includes("offset += 4") &&
    csmReports.includes("const batchResults = await Promise.all("),
);

check(
  "Resources scopes non-superadmin reads before transferring content",
  resources.includes("if (!isSuperAdmin)") &&
    resources.includes("scope.eq.retainos_help"),
);

console.log(`\n${checks.length}/${checks.length} navigation performance checks passed.`);
