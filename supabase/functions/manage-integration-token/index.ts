/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ACTIONS = new Set(["list", "create", "revoke", "revoke_all"]);
const INTEGRATION_TYPES = new Set([
  "call_summary_next_steps",
  "call_ai_transcript",
  "client_create",
  "client_update",
  "course_completion",
]);

type SupabaseClient = ReturnType<typeof createClient>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown) {
  return cleanText(value).toLowerCase();
}

function parseAllowlist(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function getBearerToken(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  return auth.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
}

function describeError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = [
      record.message,
      record.details,
      record.hint,
      record.code ? `code: ${record.code}` : null,
    ]
      .filter(Boolean)
      .map(String);
    if (parts.length > 0) return parts.join(" | ");
  }
  return "Unexpected error.";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function randomTokenSegment() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createRawToken(integrationType: string) {
  const prefix = integrationType
    .split("_")
    .map((part) => part[0])
    .join("")
    .slice(0, 6);
  return `rtos_${prefix}_${randomTokenSegment()}`;
}

async function assertSuperAdmin(supabase: SupabaseClient, token: string) {
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user?.email) {
    throw new Error("Invalid session.");
  }

  const superAdminEmails = parseAllowlist(
    Deno.env.get("SUPER_ADMIN_EMAILS") ??
      Deno.env.get("VITE_SUPER_ADMIN_EMAILS"),
  );
  const email = normalizeEmail(userData.user.email);
  if (!superAdminEmails.has(email)) {
    throw new Error("Only Super Admins can manage integration tokens.");
  }

  return userData.user;
}

async function resolveCompany(supabase: SupabaseClient, rawCompanyId: string) {
  const query = supabase
    .from("companies")
    .select("id, legacy_glide_row_id, name, migration_status")
    .in("migration_status", ["pilot", "migrated"]);

  const { data, error } = isUuid(rawCompanyId)
    ? await query.eq("id", rawCompanyId).maybeSingle()
    : await query.eq("legacy_glide_row_id", rawCompanyId).maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(
      "Integration tokens are available for app-owned pilot or migrated companies only.",
    );
  }
  return data;
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
      return jsonResponse({ error: "Missing Supabase configuration." }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const token = getBearerToken(req);
    if (!token) return jsonResponse({ error: "Missing authorization." }, 401);

    const actor = await assertSuperAdmin(supabase, token);
    const body = await req.json().catch(() => ({}));
    const action = cleanText(body.action);
    if (!ACTIONS.has(action)) {
      return jsonResponse({ error: "Choose a valid token action." }, 400);
    }

    const company = await resolveCompany(supabase, cleanText(body.companyId));
    const integrationType = cleanText(body.integrationType);

    if (action === "list") {
      const { data, error } = await supabase
        .from("company_integration_secrets")
        .select(
          "id, integration_type, label, token_prefix, status, expires_at, last_used_at, last_used_from, created_at, updated_at, revoked_at",
        )
        .eq("company_id", company.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return jsonResponse({ ok: true, tokens: data ?? [] });
    }

    if (action === "create") {
      if (!INTEGRATION_TYPES.has(integrationType)) {
        return jsonResponse({ error: "Choose a valid integration type." }, 400);
      }

      const rawToken = createRawToken(integrationType);
      const tokenHash = await sha256Hex(rawToken);
      const now = new Date().toISOString();
      const label = cleanText(body.label) || "Default token";
      const expiresAt = cleanText(body.expiresAt) || null;

      const { data, error } = await supabase
        .from("company_integration_secrets")
        .insert({
          company_id: company.id,
          integration_type: integrationType,
          label,
          token_hash: tokenHash,
          token_prefix: rawToken.slice(0, 14),
          status: "active",
          expires_at: expiresAt,
          metadata: {
            created_by_email: actor.email,
            created_by_auth_user_id: actor.id,
            created_from: "manage-integration-token",
          },
          created_at: now,
          updated_at: now,
        })
        .select(
          "id, integration_type, label, token_prefix, status, expires_at, last_used_at, last_used_from, created_at, updated_at, revoked_at",
        )
        .single();
      if (error) throw error;

      await supabase.from("app_audit_events").insert({
        actor_auth_user_id: actor.id,
        event_type: "integration_token_create",
        source: "company_settings",
        entity_table: "company_integration_secrets",
        entity_id: data.id,
        title: "integration token created",
        summary: `${integrationType} token created for ${company.name}.`,
        after_data: {
          ...data,
          raw_token: "[returned_once_to_super_admin]",
        },
      });

      return jsonResponse({ ok: true, token: data, rawToken });
    }

    const tokenId = cleanText(body.tokenId);
    if (action === "revoke") {
      if (!tokenId) return jsonResponse({ error: "Missing token id." }, 400);
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("company_integration_secrets")
        .update({
          status: "revoked",
          revoked_at: now,
          updated_at: now,
          metadata: {
            revoked_by_email: actor.email,
            revoked_by_auth_user_id: actor.id,
            revoked_from: "manage-integration-token",
          },
        })
        .eq("id", tokenId)
        .eq("company_id", company.id)
        .select(
          "id, integration_type, label, token_prefix, status, expires_at, last_used_at, last_used_from, created_at, updated_at, revoked_at",
        )
        .single();
      if (error) throw error;
      return jsonResponse({ ok: true, token: data });
    }

    if (action === "revoke_all") {
      const update = supabase
        .from("company_integration_secrets")
        .update({
          status: "revoked",
          revoked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: {
            revoked_by_email: actor.email,
            revoked_by_auth_user_id: actor.id,
            revoked_from: "manage-integration-token:revoke_all",
          },
        })
        .eq("company_id", company.id)
        .eq("status", "active");
      const { data, error } = integrationType
        ? await update.eq("integration_type", integrationType).select("id")
        : await update.select("id");
      if (error) throw error;
      return jsonResponse({ ok: true, revokedCount: data?.length ?? 0 });
    }

    return jsonResponse({ error: "Unsupported action." }, 400);
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: describeError(error) }, 500);
  }
});
