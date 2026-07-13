#!/usr/bin/env node

/**
 * Preview or apply the DB-side RetainOS super-admin registry from local env.
 *
 * Required:
 *   VITE_SUPABASE_URL or SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   VITE_SUPER_ADMIN_EMAILS or SUPER_ADMIN_EMAILS
 *
 * Run after the Security identity-bootstrap migration creates
 * public.retainos_super_admins.
 *
 * Usage:
 *   node scripts/sync-super-admins.mjs
 *   node scripts/sync-super-admins.mjs --apply
 *   node scripts/sync-super-admins.mjs --apply --archive-missing
 *
 * Production writes additionally require --allow-production.
 */

import { createClient } from "@supabase/supabase-js";
import { loadDotEnv } from "./shared-env.mjs";

loadDotEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rawEmails = process.env.SUPER_ADMIN_EMAILS || process.env.VITE_SUPER_ADMIN_EMAILS || "";
const args = new Set(process.argv.slice(2));
const supportedArgs = new Set([
  "--apply",
  "--archive-missing",
  "--allow-production",
]);
const unknownArgs = [...args].filter((arg) => !supportedArgs.has(arg));

if (unknownArgs.length > 0) {
  console.error(`Unknown arguments: ${unknownArgs.join(", ")}`);
  process.exit(1);
}

const shouldApply = args.has("--apply");
const shouldArchiveMissing = args.has("--archive-missing");
const allowProduction = args.has("--allow-production");
const productionProjectRefs = new Set([
  "zjauqflzxzsbpnivzsct",
  ...(process.env.RETAINOS_ADDITIONAL_PRODUCTION_SUPABASE_PROJECT_REFS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
]);

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing VITE_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

let projectRef = "";
try {
  projectRef = new URL(supabaseUrl).hostname.split(".")[0] ?? "";
} catch {
  console.error("SUPABASE_URL is not a valid URL.");
  process.exit(1);
}

if (shouldApply && productionProjectRefs.has(projectRef) && !allowProduction) {
  console.error(
    "Refusing to modify the production SuperAdmin registry without --allow-production.",
  );
  process.exit(1);
}

const emails = [...new Set(
  rawEmails
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
)];

if (emails.length === 0) {
  console.error("No super-admin emails found in SUPER_ADMIN_EMAILS/VITE_SUPER_ADMIN_EMAILS.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function listAllUsers() {
  const users = [];
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    users.push(...(data.users ?? []));
    if ((data.users ?? []).length < 1000) break;
  }
  return users;
}

const users = await listAllUsers();
const usersByEmail = new Map(
  users
    .filter((user) => user.email)
    .map((user) => [String(user.email).toLowerCase(), user]),
);

async function loadExistingAdmins() {
  let lastError = null;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const { data, error } = await supabase
      .from("retainos_super_admins")
      .select("email, auth_user_id, status")
      .order("email");

    if (!error) return data ?? [];
    lastError = error;
    if (attempt < 5) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }

  throw lastError;
}

let existingAdmins = [];
try {
  existingAdmins = await loadExistingAdmins();
} catch (existingAdminsError) {
  console.error(existingAdminsError);
  process.exit(1);
}

const existingAdminsByEmail = new Map(
  existingAdmins.map((admin) => [String(admin.email).toLowerCase(), admin]),
);
const existingAdminsByAuthUserId = new Map(
  existingAdmins
    .filter((admin) => admin.auth_user_id)
    .map((admin) => [String(admin.auth_user_id), admin]),
);
const payload = emails.map((email) => {
  const authUserId =
    usersByEmail.get(email)?.id ??
    existingAdminsByEmail.get(email)?.auth_user_id ??
    null;
  return {
    email,
    auth_user_id: authUserId,
    status: "active",
    notes: "Seeded from SUPER_ADMIN_EMAILS by scripts/sync-super-admins.mjs",
  };
});
const configuredEmailSet = new Set(emails);
const adminsToArchive = shouldArchiveMissing
  ? existingAdmins
      .filter(
        (admin) =>
          admin.status === "active" &&
          !configuredEmailSet.has(String(admin.email).toLowerCase()),
      )
      .map((admin) => String(admin.email).toLowerCase())
  : [];
const missingAuthUserEmails = payload
  .filter((admin) => !admin.auth_user_id)
  .map((admin) => admin.email);
const authUserIdConflicts = payload
  .filter((admin) => {
    if (!admin.auth_user_id) return false;
    const existing = existingAdminsByAuthUserId.get(admin.auth_user_id);
    return existing && String(existing.email).toLowerCase() !== admin.email;
  })
  .map((admin) => ({
    configuredEmail: admin.email,
    existingEmail: String(
      existingAdminsByAuthUserId.get(admin.auth_user_id).email,
    ).toLowerCase(),
    auth_user_id: admin.auth_user_id,
  }));

const summary = {
  mode: shouldApply ? "apply" : "dry-run",
  projectRef,
  configuredAdmins: payload.map((admin) => ({
    email: admin.email,
    auth_user_id: admin.auth_user_id,
  })),
  missingAuthUserEmails,
  authUserIdConflicts,
  adminsToArchive,
};

if (!shouldApply) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

if (authUserIdConflicts.length > 0) {
  console.error(
    "Refusing to apply: an Auth user id is already bound to another registry email.",
  );
  console.error(JSON.stringify(authUserIdConflicts, null, 2));
  process.exit(1);
}

const payloadWithAuthUserIds = payload.filter((admin) => admin.auth_user_id);
const payloadWithoutAuthUserIds = payload
  .filter((admin) => !admin.auth_user_id)
  .map(({ auth_user_id: _authUserId, ...admin }) => admin);

for (const batch of [payloadWithAuthUserIds, payloadWithoutAuthUserIds]) {
  if (batch.length === 0) continue;
  const { error } = await supabase
    .from("retainos_super_admins")
    .upsert(batch, { onConflict: "email" });

  if (error) {
    console.error(error);
    process.exit(1);
  }
}

if (adminsToArchive.length > 0) {
  const { error: archiveError } = await supabase
    .from("retainos_super_admins")
    .update({ status: "archived" })
    .in("email", adminsToArchive);

  if (archiveError) {
    console.error(archiveError);
    process.exit(1);
  }
}

console.log(
  JSON.stringify(
    {
      ...summary,
      synced: payload.length,
      archived: adminsToArchive.length,
    },
    null,
    2,
  ),
);
