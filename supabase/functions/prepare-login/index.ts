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

const POSTGREST_ILIKE_WILDCARDS = ["\\", "%", "_", "*"];

function hasIlikeWildcard(value: string) {
  return POSTGREST_ILIKE_WILDCARDS.some((character) =>
    value.includes(character)
  );
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
  const baseQuery = supabase
    .from("company_members")
    .select("id, status, company:companies!inner(id, migration_status)");
  const emailQuery = hasIlikeWildcard(email)
    ? baseQuery.eq("email", email)
    : baseQuery.ilike("email", email);
  const { data, error } = await emailQuery
    .eq("status", "active")
    .in("company.migration_status", ["pilot", "migrated"]);

  if (error) throw error;

  return (data ?? []).length > 0;
}

async function hasActiveMirrorMembership(
  supabase: SupabaseServiceClient,
  email: string,
) {
  const baseQuery = supabase
    .from("backup_company_team")
    .select("glide_row_id, company_id, is_archived");
  const emailQuery = hasIlikeWildcard(email)
    ? baseQuery.eq("email", email)
    : baseQuery.ilike("email", email);
  const { data, error } = await emailQuery;

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
    .select("email")
    .eq("email", email)
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
      return genericPreparedResponse(req);
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
      return genericPreparedResponse(req);
    }

    return genericPreparedResponse(req);
  } catch (error) {
    console.error(error);
    return genericPreparedResponse(req);
  }
});
