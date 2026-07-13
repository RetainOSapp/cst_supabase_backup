import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const apply = fs.readFileSync(
  path.join(root, "supabase/migrations/20260713024000_security_phase1d_immediate_cleanup.sql"),
  "utf8",
);
const rollback = fs.readFileSync(
  path.join(root, "supabase/rollbacks/20260713024000_security_phase1d_immediate_cleanup.sql"),
  "utf8",
);

const checks = [];
function check(name, condition) {
  checks.push({ name, condition });
}

check("Phase 1D requires completed Phase 1B", apply.includes("20260713023000"));
check("Phase 1D records its rollout", apply.includes("20260713024000"));
check("Phase 1D does not touch backup tables", !/public\.backup_[a-z_]+/.test(apply));
check(
  "attendance is assignment-aware",
  apply.includes("client_call_attendance_events.client_legacy_id") &&
    apply.includes("client.csm_secondary_assignee_id") &&
    apply.includes("security_phase1d_attendance_legacy_client_idx"),
);
check(
  "timed checkpoints are assignment-aware",
  apply.includes("client_timed_checkpoint_completions.legacy_client_id") &&
    apply.includes("security_phase1d_timed_checkpoint_lookup_idx"),
);
check(
  "contract templates are Director-scoped",
  /company_contract_templates_authenticated_read[\s\S]*current_actor_app_policy_role\(\)\) = 'director'/.test(
    apply,
  ),
);
check(
  "unscoped AI analysis has no browser policy",
  apply.includes("drop policy if exists auth_read_ccaa") &&
    !/create policy auth_read_ccaa/.test(apply),
);

for (const table of [
  "glide_sync_jobs",
  "glide_sync_runs",
  "sync_table_list",
]) {
  check(
    `${table} is bound-SuperAdmin-only`,
    new RegExp(`on public\\.${table}[\\s\\S]*?is_retainos_super_admin_bound`).test(
      apply,
    ),
  );
}

for (const [table, policy] of [
  ["glide_rows", "auth_read_glide_rows"],
  ["glide_tables", "auth_read_glide_tables"],
  ["sync_config", "auth_read_sync_config"],
]) {
  check(
    `${table} has no browser policy`,
    apply.includes(`drop policy if exists ${policy}`) &&
      !new RegExp(`create policy ${policy}`).test(apply),
  );
}

check(
  "job cancellation remains cancellation-only",
  /auth_cancel_glide_sync_jobs[\s\S]*status = 'cancelled'/.test(apply),
);
check(
  "rollback restores every previous broad policy",
  [
    "client_call_attendance_events_authenticated_read",
    "client_timed_checkpoint_authenticated_read",
    "company_contract_templates_authenticated_read",
    "auth_read_ccaa",
    "auth_read_glide_rows",
    "auth_read_glide_sync_jobs",
    "auth_cancel_glide_sync_jobs",
    "auth_read_glide_sync_runs",
    "auth_read_glide_tables",
    "auth_read_sync_config",
    "auth_read_sync_table_list",
    "auth_update_sync_table_list",
  ].every((policy) => rollback.includes(policy)),
);
check(
  "apply and rollback reload PostgREST",
  apply.includes("notify pgrst, 'reload schema'") &&
    rollback.includes("notify pgrst, 'reload schema'"),
);

let failed = 0;
for (const result of checks) {
  console.log(`${result.condition ? "PASS" : "FAIL"} ${result.name}`);
  if (!result.condition) failed += 1;
}
console.log(`\n${checks.length - failed}/${checks.length} Phase 1D checks passed.`);
if (failed) process.exit(1);
