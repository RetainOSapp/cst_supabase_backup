#!/usr/bin/env node

import { readFileSync } from "node:fs";

const deleteFunction = readFileSync(
  "supabase/functions/manage-client-delete/index.ts",
  "utf8",
);
const clientDetail = readFileSync("src/pages/ClientDetail.tsx", "utf8");
const dashboard = readFileSync("src/pages/Dashboard.tsx", "utf8");

const checks = [];
function check(label, passed) {
  checks.push({ label, passed: Boolean(passed) });
}

check(
  "client deletion archives an immutable tombstone and excludes analytics",
  /archived_at: deletedAt/.test(deleteFunction) &&
    /exclude_from_dashboard_analytics: true/.test(deleteFunction) &&
    /deletion_strategy: "archived_tombstone"/.test(deleteFunction),
);
check(
  "client deletion no longer hard-deletes rows referenced by immutable evidence",
  !/from\("clients"\)[\s\S]{0,100}\.delete\(\)/.test(deleteFunction) &&
    /deletionMode: "archived_tombstone"/.test(deleteFunction),
);
check(
  "direct deleted-client URLs do not fall back to stale mirror records",
  /if \(appClient\?\.archived_at\)/.test(clientDetail) &&
    /This client has been deleted from RetainOS/.test(clientDetail),
);
check(
  "dashboard app-owned client queries exclude archived tombstones",
  (
    dashboard.match(
      /eq\("exclude_from_dashboard_analytics", false\)[\s\S]{0,80}\.is\("archived_at", null\)/g,
    ) ?? []
  ).length >= 5,
);

const failures = checks.filter((item) => !item.passed);
for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"} ${item.label}`);
}
console.log(
  `\n${checks.length - failures.length}/${checks.length} client deletion checks passed.`,
);
if (failures.length) process.exitCode = 1;
