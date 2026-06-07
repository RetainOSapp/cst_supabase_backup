/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function parseAllowlist(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function hasActiveAppMembership(
  supabase: ReturnType<typeof createClient>,
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
  supabase: ReturnType<typeof createClient>,
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("supabase_service_role");

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
        500,
      );
    }

    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);

    if (!email || !email.includes("@")) {
      return jsonResponse({
        ok: false,
        error: "Enter a valid email address.",
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const superAdminEmails = parseAllowlist(
      Deno.env.get("SUPER_ADMIN_EMAILS") ??
        Deno.env.get("VITE_SUPER_ADMIN_EMAILS"),
    );
    const isSuperAdmin = superAdminEmails.has(email);

    let hasActiveMembership = false;
    try {
      hasActiveMembership = await hasActiveAppMembership(supabase, email);
      if (!hasActiveMembership) {
        hasActiveMembership = await hasActiveMirrorMembership(supabase, email);
      }
    } catch (error) {
      return jsonResponse(
        {
          error:
            error instanceof Error
              ? error.message
              : "Could not verify RetainOS access.",
        },
        500,
      );
    }

    if (!isSuperAdmin && !hasActiveMembership) {
      return jsonResponse({
        ok: false,
        error: "No active RetainOS access was found for this email.",
      });
    }

    const { error: createError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
    });

    if (
      createError &&
      !createError.message.toLowerCase().includes("already")
    ) {
      return jsonResponse({ error: createError.message }, 500);
    }

    return jsonResponse({
      ok: true,
      provisioned: !createError,
      access: isSuperAdmin ? "super_admin" : "company_user",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
