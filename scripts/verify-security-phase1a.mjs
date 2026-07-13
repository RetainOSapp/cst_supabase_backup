import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const migrationPath = path.join(
  root,
  "supabase/migrations/20260713010000_security_phase1a_role_authority.sql",
);
const rollbackPath = path.join(
  root,
  "supabase/rollbacks/20260713010000_security_phase1a_role_authority.sql",
);
const accountPath = path.join(root, "src/lib/accountContext.tsx");
const supersededDraftPath = path.join(
  root,
  "supabase/migrations/20260705110000_security_phase1_tenant_rls.sql",
);

const migration = fs.readFileSync(migrationPath, "utf8");
const rollback = fs.readFileSync(rollbackPath, "utf8");
const account = fs.readFileSync(accountPath, "utf8");

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

function functionBody(name) {
  const marker = `create or replace function public.${name}`;
  const start = migration.indexOf(marker);
  if (start < 0) return "";
  const end = migration.indexOf("$$;", start);
  return end < 0 ? "" : migration.slice(start, end + 3);
}

const helperNames = [
  "is_retainos_super_admin_bound()",
  "current_actor_app_scope()",
  "current_actor_mirror_scope()",
  "can_read_app_company(target_company_id uuid)",
  "can_read_mirror_company(\n  target_company_legacy_id text\n)",
  "can_read_app_client(target_client_id uuid)",
  "can_read_app_client_legacy(\n  target_company_id uuid,\n  target_client_legacy_id text\n)",
  "can_read_mirror_client(\n  target_company_legacy_id text,\n  target_client_legacy_id text\n)",
  "resolve_current_account()",
];

check(
  "Phase 1A migration is additive and changes no table policy",
  !/\b(?:create|drop)\s+policy\b/i.test(migration) &&
    !/enable\s+row\s+level\s+security/i.test(migration) &&
    migration.includes("'policy_changes', false"),
);
check(
  "superseded blanket Phase 1 draft is excluded from the clean candidate",
  !fs.existsSync(supersededDraftPath),
);
check(
  "all role-authority helpers are present",
  helperNames.every((signature) =>
    migration.includes(`create or replace function public.${signature}`)
  ),
);

for (const name of [
  "is_retainos_super_admin_bound",
  "current_actor_app_scope",
  "current_actor_mirror_scope",
  "can_read_app_company",
  "can_read_mirror_company",
  "can_read_app_client",
  "can_read_app_client_legacy",
  "can_read_mirror_client",
  "resolve_current_account",
]) {
  const body = functionBody(name);
  check(
    `${name} is stable, security-definer, and search-path pinned`,
    body.includes("stable") &&
      body.includes("security definer") &&
      body.includes("set search_path = ''"),
  );
}

const boundAdmin = functionBody("is_retainos_super_admin_bound");
check(
  "SuperAdmin authority requires the bound Auth UUID",
  boundAdmin.includes("admin.auth_user_id = (select auth.uid())") &&
    !boundAdmin.includes("auth.jwt"),
);

const appScope = functionBody("current_actor_app_scope");
check(
  "app membership fallback uses email only for unbound rows",
  appScope.includes("member.auth_user_id is null") &&
    appScope.includes("lower(member.email) = actor.email"),
);
check(
  "app scope fails closed for multiple memberships",
  appScope.includes("count(*) over () as match_count") &&
    appScope.includes("where matches.match_count = 1") &&
    appScope.includes("company.legacy_glide_row_id is not null"),
);

const mirrorScope = functionBody("current_actor_mirror_scope");
check(
  "mirror scope prefers the app-owned membership and rejects ambiguous mirror memberships",
  mirrorScope.includes("not exists (select 1 from app_scope)") &&
    mirrorScope.includes("mirror_matches.match_count = 1"),
);
check(
  "mirror roles preserve Director, Support, CSM, and Viewer mapping",
  ["'director'", "'support'", "'csm'", "'viewer'"]
    .every((role) => mirrorScope.includes(role)),
);

const appClient = functionBody("can_read_app_client");
check(
  "app client authority is broad only for Director and Support",
  appClient.includes("scope.scope_role in ('director', 'support')") &&
    !appClient.includes("'viewer'"),
);
check(
  "app CSM authority requires primary or secondary assignment",
  appClient.includes("client.csm_team_member_id") &&
    appClient.includes("client.csm_secondary_assignee_id") &&
    appClient.includes("scope.scope_member_id::text") &&
    appClient.includes("scope.scope_member_legacy_id"),
);

const mirrorClient = functionBody("can_read_mirror_client");
check(
  "mirror CSM authority requires primary or secondary legacy assignment",
  mirrorClient.includes("scope.scope_role = 'csm'") &&
    mirrorClient.includes("client.csm_team_member_id") &&
    mirrorClient.includes("client.csm_secondary_assignee_id"),
);
check(
  "Viewer raw client reads remain fail-closed",
  !appClient.includes("'viewer'") && !mirrorClient.includes("'viewer'"),
);

check(
  "internal scope functions are not directly executable by authenticated users",
  migration.includes(
    "revoke all on function public.current_actor_app_scope()\n  from public, anon, authenticated;",
  ) &&
    migration.includes(
      "revoke all on function public.current_actor_mirror_scope()\n  from public, anon, authenticated;",
    ),
);
const accountResolver = functionBody("resolve_current_account");
check(
  "account resolver uses bound SuperAdmin and app-before-mirror precedence",
  accountResolver.includes("public.is_retainos_super_admin_bound()") &&
    accountResolver.includes("not exists (select 1 from app_scope)") &&
    accountResolver.includes("'registry'::text") &&
    accountResolver.includes("'app'::text") &&
    accountResolver.includes("'mirror'::text"),
);
check(
  "mirror membership and assignment indexes are included",
  [
    "security_phase1a_backup_team_actor_idx",
    "security_phase1a_backup_clients_company_client_idx",
    "security_phase1a_backup_clients_primary_csm_idx",
    "security_phase1a_backup_clients_secondary_csm_idx",
  ].every((name) => migration.includes(name)),
);
check(
  "rollback removes every Phase 1A helper and index",
  [
    "can_read_mirror_client(text, text)",
    "can_read_app_client_legacy(uuid, text)",
    "can_read_app_client(uuid)",
    "can_read_mirror_company(text)",
    "can_read_app_company(uuid)",
    "current_actor_mirror_scope()",
    "current_actor_app_scope()",
    "is_retainos_super_admin_bound()",
    "resolve_current_account()",
    "security_phase1a_backup_team_actor_idx",
    "security_phase1a_backup_clients_company_client_idx",
    "security_phase1a_backup_clients_primary_csm_idx",
    "security_phase1a_backup_clients_secondary_csm_idx",
  ].every((name) => rollback.includes(name)),
);
check(
  "rollback does not restore a broad authenticated policy",
  !/\bcreate\s+policy\b/i.test(rollback) && !/using\s*\(\s*true\s*\)/i.test(rollback),
);
check(
  "apply and rollback both reload the PostgREST schema cache",
  migration.includes("notify pgrst, 'reload schema';") &&
    rollback.includes("notify pgrst, 'reload schema';"),
);
check(
  "browser SuperAdmin authority comes from the DB registry RPC",
  account.includes('supabase.rpc("resolve_current_account")') &&
    !account.includes("VITE_SUPER_ADMIN_EMAILS"),
);
check(
  "browser consumes the same account resolver instead of direct membership tables",
  !account.includes('.from("company_members")') &&
    !account.includes('.from("backup_company_team")') &&
    account.includes("account.company_legacy_id") &&
    account.includes("account.team_member_id"),
);

console.log(`\n${passed}/${passed + failed} Phase 1A checks passed.`);
if (failed > 0) process.exitCode = 1;
