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
const prepareLogin = sources.get("prepare-login").source;
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

const clientUpdateWebhook = sources.get("webhook-update-client").source;
check(
  "client update webhook moves only stale received events to review",
  clientUpdateWebhook.includes("INTAKE_STALE_AFTER_MS = 30 * 60 * 1000") &&
    clientUpdateWebhook.includes("at most 400 seconds") &&
    clientUpdateWebhook.includes("moveStaleReceivedEventToReview") &&
    clientUpdateWebhook.includes('moved_to_review_reason: "stale_received_event"'),
);
check(
  "client update stale-event transition is optimistic and has no auto replay",
  clientUpdateWebhook.includes('.eq("status", "received")') &&
    clientUpdateWebhook.includes('.eq("updated_at", event.updated_at)') &&
    !clientUpdateWebhook.includes("claimRecoverableIntakeEvent"),
);
check(
  "client update catch cannot regress a terminal intake status",
  /error_message: message,[\s\S]{0,140}\.eq\("id", storedIntakeEvent\.id\)[\s\S]{0,80}\.eq\("status", "received"\)/.test(
    clientUpdateWebhook,
  ),
);

const callSummaryWebhook = sources.get("ingest-client-call-summary").source;
check(
  "call summary matching excludes archived clients without a five-row cap",
  callSummaryWebhook.includes('.is("archived_at", null)') &&
    !callSummaryWebhook.includes(".limit(5)") &&
    callSummaryWebhook.includes("hasIlikeWildcard"),
);
check(
  "call summary webhook moves only stale received events to review",
  callSummaryWebhook.includes("INTAKE_STALE_AFTER_MS = 30 * 60 * 1000") &&
    callSummaryWebhook.includes("moveStaleReceivedEventToReview") &&
    callSummaryWebhook.includes('moved_to_review_reason: "stale_received_event"'),
);
check(
  "call summary catch cannot regress a terminal intake status",
  /error_message: error instanceof Error[\s\S]{0,180}\.eq\("id", storedIntakeEvent\.id\)[\s\S]{0,80}\.eq\("status", "received"\)/.test(
    callSummaryWebhook,
  ),
);
check(
  "call summary audit completes before terminal intake status",
  callSummaryWebhook.indexOf("const { error: auditError }") <
    callSummaryWebhook.indexOf('status: "processed"') &&
    callSummaryWebhook.includes("if (auditError) throw auditError"),
);
check(
  "call summary checkpoints original client values before writes",
  callSummaryWebhook.includes("processing_checkpoint") &&
    callSummaryWebhook.includes("previous_next_steps: previousNextSteps") &&
    callSummaryWebhook.indexOf("processing_checkpoint") <
      callSummaryWebhook.indexOf('.from("clients")\n      .update({'),
);
check(
  "call summary rejects malformed timestamps instead of silently using now",
  callSummaryWebhook.includes("Invalid call timestamp") &&
    callSummaryWebhook.includes("error instanceof RequestValidationError") &&
    callSummaryWebhook.includes("isValidationError ? 400 : 500"),
);

const integrationReview = sources.get("manage-integration-review").source;
const callSummaryReview = integrationReview.slice(
  integrationReview.indexOf("async function applyCallSummary"),
  integrationReview.indexOf("async function applyClientUpdate"),
);
check(
  "integration review claims one operator with stale-claim recovery",
  integrationReview.includes("claimReviewEvent") &&
    integrationReview.includes("REVIEW_CLAIM_STALE_AFTER_MS = 30 * 60 * 1000") &&
    integrationReview.includes('.eq("updated_at", event.updated_at)'),
);
check(
  "integration review keeps claim-version ownership through terminal writes",
  integrationReview.includes("function reviewClaimVersion") &&
    integrationReview.includes("assertReviewClaimOwnership") &&
    integrationReview.includes('.eq("updated_at", reviewClaimVersion(event))') &&
    integrationReview.includes('.eq("updated_at", claimedReviewEventVersion)'),
);
check(
  "call summary review reuses history and restores attendance",
  callSummaryReview.includes("existingHistory") &&
    callSummaryReview.includes("processingCheckpoint") &&
    callSummaryReview.includes("existingAttendance") &&
    callSummaryReview.includes('from("client_call_attendance_events")'),
);
check(
  "call summary review reuses audit and closes intake last",
  callSummaryReview.includes("existingAudit") &&
    callSummaryReview.indexOf("existingAudit") <
      callSummaryReview.indexOf('status: "processed"') &&
    callSummaryReview.includes('.eq("status", "received")'),
);
check(
  "integration review preserves attendee-list matching without unsafe email learning",
  integrationReview.includes("function eventClientEmails") &&
    integrationReview.includes("findClientsByEmails") &&
    integrationReview.includes("hasIlikeWildcard") &&
    integrationReview.includes("if (submittedEmails.length !== 1) return null"),
);

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
  prepareLogin.includes('from("retainos_super_admins")') &&
    prepareLogin.includes("genericPreparedResponse"),
);
check(
  "prepare-login selects a real SuperAdmin registry column",
  /from\("retainos_super_admins"\)[\s\S]{0,160}\.select\("email"\)[\s\S]{0,160}\.eq\("email", email\)/.test(
    prepareLogin,
  ),
);
check(
  "prepare-login treats case-insensitive email matches as literals",
  prepareLogin.includes(
    'const POSTGREST_ILIKE_WILDCARDS = ["\\\\", "%", "_", "*"]',
  ) &&
    prepareLogin.includes("function hasIlikeWildcard") &&
    (prepareLogin.match(
      /hasIlikeWildcard\(email\)[\s\S]{0,120}\? baseQuery\.eq\("email", email\)[\s\S]{0,120}: baseQuery\.ilike\("email", email\)/g,
    )?.length ?? 0) === 2,
);
check(
  "prepare-login keeps valid-email internal failures generic",
  (prepareLogin.match(/return genericPreparedResponse\(req\);/g)?.length ?? 0) === 5 &&
    !/\b500\b/.test(prepareLogin),
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
