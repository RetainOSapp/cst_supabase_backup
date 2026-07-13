#!/usr/bin/env node

import { readFileSync } from "node:fs";

const apply = readFileSync(
  new URL("../supabase/migrations/20260713025000_security_advisor_cleanup.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("../supabase/rollbacks/20260713025000_security_advisor_cleanup.sql", import.meta.url),
  "utf8",
);

const checks = [
  ["Phase 1E requires Phase 1D", apply.includes("20260713024000")],
  ["Phase 1E records its rollout", apply.includes("20260713025000")],
  ["retention implementation is hidden", apply.includes("_dashboard_retention_counts_fast_unchecked")],
  ["anonymous retention execution is revoked", /from public, anon;/.test(apply)],
  ["authenticated retention uses an actor-scoped wrapper", apply.includes("current_actor_app_scope()")],
  ["missing and Viewer retention scope is denied", apply.includes("v_scope_role is null") && apply.includes("not in ('director', 'support', 'csm')")],
  ["CSM retention scope is forced to the actor", apply.includes("v_effective_assignee_id := coalesce")],
  ["all mutable function search paths are pinned", (apply.match(/set search_path =/g) ?? []).length >= 4],
  ["all 13 inert policies are removed", (apply.match(/drop policy if exists .*_no_anon_access/g) ?? []).length === 13],
  ["only two confirmed duplicate indexes are removed", (apply.match(/drop index if exists/g) ?? []).length === 2],
  ["mirror read policies are untouched", !/drop policy[^;]*backup_/is.test(apply)],
  ["rollback restores the original retention function name", rollback.includes("rename to dashboard_retention_counts_fast")],
  ["rollback restores all 13 inert policies", (rollback.match(/create policy .*_no_anon_access/g) ?? []).length === 13],
  ["rollback restores both duplicate indexes", (rollback.match(/create index if not exists/g) ?? []).length === 2],
  ["apply and rollback reload PostgREST", apply.includes("notify pgrst") && rollback.includes("notify pgrst")],
];

let passed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (ok) passed += 1;
}

console.log(`\n${passed}/${checks.length} Phase 1E checks passed.`);
if (passed !== checks.length) process.exit(1);
