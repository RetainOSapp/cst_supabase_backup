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

    const { data: memberships, error: membershipError } = await supabase
      .from("backup_company_team")
      .select("glide_row_id, company_id, is_archived")
      .ilike("email", email);

    if (membershipError) {
      return jsonResponse({ error: membershipError.message }, 500);
    }

    const hasActiveMembership = (memberships ?? []).some(
      (membership) =>
        membership.is_archived !== true && Boolean(membership.company_id),
    );

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
