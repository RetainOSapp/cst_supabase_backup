#!/usr/bin/env node

import fs from "node:fs";

const functionNames = [
  "sync-glide",
  "zapier-create-client",
  "webhook-update-client",
  "ingest-client-call-summary",
  "manage-client-task",
  "manage-integration-review",
  "manage-integration-token",
  "manage-resource",
  "prepare-login",
];

const sources = new Map(
  functionNames.map((name) => {
    const file = `supabase/functions/${name}/index.ts`;
    return [name, { file, source: fs.readFileSync(file, "utf8") }];
  }),
);

const sharedAuth = fs.readFileSync("supabase/functions/_shared/auth.ts", "utf8");
const sharedHttp = fs.readFileSync("supabase/functions/_shared/http.ts", "utf8");
const functionConfig = fs.readFileSync("supabase/config.toml", "utf8");
const checks = [];

function check(label, condition, detail = "") {
  checks.push({ label, ok: Boolean(condition), detail });
}

for (const [name, { source }] of sources) {
  check(
    `${name} has no wildcard CORS response`,
    !/Access-Control-Allow-Origin["']?\s*:\s*["']\*["']/.test(source),
  );
  check(
    `${name} does not use a raw PostgREST or filter`,
    !source.includes(".or("),
  );
  check(
    `${name} does not persist a wholesale request body`,
    !/\b(?:raw_payload|payload)\s*:\s*body\b/.test(source),
  );
  check(
    `${name} does not scan 10,000 clients in memory`,
    !source.includes(".limit(10000)"),
  );
}

for (const name of [
  "sync-glide",
  "manage-client-task",
  "manage-integration-review",
  "manage-integration-token",
  "manage-resource",
  "prepare-login",
]) {
  check(
    `${name} uses shared origin-aware HTTP responses`,
    sources.get(name).source.includes('../_shared/http.ts'),
  );
}

for (const name of ["webhook-update-client", "ingest-client-call-summary"]) {
  const source = sources.get(name).source;
  check(
    `${name} short-circuits existing intake events before side effects`,
    source.includes("isExisting") && source.includes("duplicate: true"),
  );
}

check(
  "live client-create contract and recurring-task behavior is preserved",
  sources.get("zapier-create-client").source.includes("resolveContractTemplate") &&
    sources.get("zapier-create-client").source.includes("recurring_interval_days"),
);
check(
  "live optional secondary-milestone update behavior is preserved",
  sources.get("webhook-update-client").source.includes(
    "Secondary milestone requires secondary_pathway_id.",
  ),
);
check(
  "live call attendance and next-contact behavior is preserved",
  sources.get("ingest-client-call-summary").source.includes(
    'from("client_call_attendance_events")',
  ) && sources.get("ingest-client-call-summary").source.includes(
    "nextContactFromCompanySetting",
  ),
);
check(
  "live recurring-task active-client guard is preserved",
  sources.get("manage-client-task").source.includes("recurringClientIsActive"),
);
check(
  "live manual-match email learning is preserved",
  sources.get("manage-integration-review").source.includes(
    "learnClientEmailFromManualMatch",
  ),
);

for (const name of [
  "sync-glide",
  "manage-client-task",
  "manage-integration-review",
  "manage-integration-token",
  "manage-resource",
]) {
  const source = sources.get(name).source;
  check(
    `${name} does not authorize SuperAdmins from an environment email list`,
    !source.includes("SUPER_ADMIN_EMAILS") &&
      !source.includes("VITE_SUPER_ADMIN_EMAILS"),
  );
}

const syncGlide = sources.get("sync-glide").source;
check(
  "sync-glide requires the DB-backed SuperAdmin helper",
  syncGlide.includes("requireSuperAdmin"),
);
check(
  "sync-glide verifies service-role job requests",
  syncGlide.includes("isServiceRoleRequest") &&
    syncGlide.includes('mode === "job_batch"'),
);
check(
  "sync-glide rejects request-supplied Glide credentials",
  !syncGlide.includes("body.glideToken"),
);
check(
  "sync-glide gives newly discovered tables a SuperAdmin-only read policy",
  syncGlide.includes("public.is_retainos_super_admin()") &&
    !syncGlide.includes("FOR SELECT TO authenticated USING (true)"),
);

for (const name of [
  "zapier-create-client",
  "webhook-update-client",
  "ingest-client-call-summary",
]) {
  check(
    `${name} gates the legacy global secret behind an explicit opt-in`,
    sources.get(name).source.includes("getEnabledGlobalWebhookFallbackSecret"),
  );
}

check(
  "shared SuperAdmin authority reads retainos_super_admins",
  sharedAuth.includes('from("retainos_super_admins")') &&
    sharedAuth.includes('.eq("auth_user_id", actor.id)') &&
    sharedAuth.includes('.eq("status", "active")'),
);
check(
  "global webhook fallback is disabled by default",
  sharedAuth.includes('Deno.env.get("ALLOW_GLOBAL_WEBHOOK_FALLBACK") !== "true"'),
);
check(
  "shared CORS defaults are exact origins only",
  sharedHttp.includes('"https://app.retainos.ai"') &&
    !sharedHttp.includes(".vercel.app") &&
    !sharedHttp.includes('"*"'),
);
check(
  "prepare-login uses the SuperAdmin registry and generic success",
  sources.get("prepare-login").source.includes('from("retainos_super_admins")') &&
    sources.get("prepare-login").source.includes("genericPreparedResponse"),
);
for (const name of [
  "sync-glide",
  "manage-client-task",
  "manage-integration-review",
  "manage-integration-token",
  "manage-resource",
]) {
  check(
    `${name} is pinned to gateway JWT verification`,
    functionConfig.includes(`[functions.${name}]\nverify_jwt = true`),
  );
}
for (const name of [
  "prepare-login",
  "zapier-create-client",
  "ingest-client-call-summary",
  "webhook-update-client",
]) {
  check(
    `${name} is explicitly public only for its internal auth flow`,
    functionConfig.includes(`[functions.${name}]\nverify_jwt = false`),
  );
}

for (const result of checks) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.label}`);
  if (!result.ok && result.detail) console.log(`  ${result.detail}`);
}

const failed = checks.filter((result) => !result.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} Phase 0.5 checks passed.`);
if (failed.length > 0) process.exit(1);
