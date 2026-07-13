/// <reference path="../_shared/deno.d.ts" />

import {
  createServiceClient,
  type SupabaseServiceClient,
} from "../_shared/auth.ts";
import {
  jsonResponse as sharedJsonResponse,
  optionsResponse,
} from "../_shared/http.ts";

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function jsonResponse(req: Request, body: unknown, status = 200) {
  return sharedJsonResponse(req, body, status);
}

function genericPreparedResponse(req: Request) {
  return jsonResponse(req, { ok: true });
}

async function hasActiveAppMembership(
  supabase: SupabaseServiceClient,
  email: string,
) {
  const { data, error } = await supabase
    .from("company_members")
    .select("id, status, company:companies!inner(id, migration_status)")
    .ilike("email", email)
    .eq("status", "active")
    .in("company.migration_status", ["pilot", "migrated"]);

  if (error) throw error;

  return (data ?? []).length > 0;
}

async function hasActiveMirrorMembership(
  supabase: SupabaseServiceClient,
  email: string,
) {
  const { data, error } = await supabase
    .from("backup_company_team")
    .select("glide_row_id, company_id, is_archived")
    .ilike("email", email);

  if (error) throw error;

  return (data ?? []).some(
    (membership) =>
      membership.is_archived !== true && Boolean(membership.company_id),
  );
}

async function hasActiveSuperAdminEntry(
  supabase: SupabaseServiceClient,
  email: string,
) {
  const { data, error } = await supabase
    .from("retainos_super_admins")
    .select("id")
    .ilike("email", email)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return optionsResponse(req);
  }

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);

    if (!email || !email.includes("@")) {
      return jsonResponse(req, {
        ok: false,
        error: "Enter a valid email address.",
      });
    }

    const supabase = createServiceClient();

    let hasActiveMembership = false;
    let isSuperAdmin = false;
    try {
      isSuperAdmin = await hasActiveSuperAdminEntry(supabase, email);
      hasActiveMembership = await hasActiveAppMembership(supabase, email);
      if (!hasActiveMembership) {
        hasActiveMembership = await hasActiveMirrorMembership(supabase, email);
      }
    } catch (error) {
      console.error(error);
      return jsonResponse(req, { error: "Could not prepare login right now." }, 500);
    }

    if (!isSuperAdmin && !hasActiveMembership) {
      return genericPreparedResponse(req);
    }

    const { error: createError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
    });

    if (
      createError &&
      !createError.message.toLowerCase().includes("already")
    ) {
      console.error(createError);
      return jsonResponse(req, { error: "Could not prepare login right now." }, 500);
    }

    return genericPreparedResponse(req);
  } catch (error) {
    console.error(error);
    return jsonResponse(req, { error: "Could not prepare login right now." }, 500);
  }
});
