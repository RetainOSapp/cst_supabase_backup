/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DELETE_ROLES = new Set(["director"]);

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

function getBearerToken(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? "";
}

async function resolveActor(
  supabase: ReturnType<typeof createClient>,
  userEmail: string,
  companyId: string,
) {
  const superAdminEmails = parseAllowlist(
    Deno.env.get("SUPER_ADMIN_EMAILS") ??
      Deno.env.get("VITE_SUPER_ADMIN_EMAILS"),
  );

  if (superAdminEmails.has(userEmail)) {
    return { role: "super_admin", memberId: null };
  }

  const { data, error } = await supabase
    .from("company_members")
    .select("id, role, status")
    .eq("company_id", companyId)
    .ilike("email", userEmail)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (data && DELETE_ROLES.has(data.role)) {
    return { role: data.role as string, memberId: data.id as string };
  }

  throw new Error("Only Directors and Super Admins can delete clients.");
}

async function deleteMatching(
  supabase: ReturnType<typeof createClient>,
  table: string,
  filters: Array<[string, string]>,
) {
  let query = supabase.from(table).delete({ count: "exact" });
  for (const [column, value] of filters) {
    query = query.eq(column, value);
  }
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
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

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const token = getBearerToken(req);
    if (!token) return jsonResponse({ error: "Missing authorization." }, 401);

    const { data: userData, error: userError } =
      await supabase.auth.getUser(token);
    if (userError || !userData.user?.email) {
      return jsonResponse({ error: "Invalid session." }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const clientLegacyId = cleanText(body.clientLegacyId);
    const reason = cleanText(body.reason);

    if (!clientLegacyId) {
      return jsonResponse({ error: "Missing client id." }, 400);
    }
    if (reason.length < 8) {
      return jsonResponse(
        { error: "Add a short reason before deleting this client." },
        400,
      );
    }

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("*")
      .eq("glide_row_id", clientLegacyId)
      .maybeSingle();

    if (clientError) throw clientError;
    if (!client) {
      return jsonResponse(
        { error: "This client is not enabled for RetainOS deletion." },
        404,
      );
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, legacy_glide_row_id, migration_status")
      .eq("id", client.company_id)
      .in("migration_status", ["pilot", "migrated"])
      .maybeSingle();

    if (companyError) throw companyError;
    if (!company) {
      return jsonResponse(
        { error: "This company is not enabled for RetainOS client writes." },
        400,
      );
    }

    const userEmail = normalizeEmail(userData.user.email);
    const actor = await resolveActor(supabase, userEmail, company.id);
    const companyLegacyId =
      (client.company_glide_row_id as string | null) ??
      (company.legacy_glide_row_id as string | null) ??
      "";
    const deletedAt = new Date().toISOString();

    const { error: archiveClientError } = await supabase
      .from("clients")
      .update({
        archived_at: deletedAt,
        metadata: {
          ...(client.metadata ?? {}),
          deleted_by_retainos: true,
          deleted_at: deletedAt,
          deletion_reason: reason,
        },
      })
      .eq("id", client.id);
    if (archiveClientError) throw archiveClientError;

    const [
      tasks,
      contracts,
      milestones,
      history,
      customFields,
      links,
      notificationsByLegacy,
      notificationsByUuid,
      timedCheckpoints,
      callAttendance,
    ] = await Promise.all([
      deleteMatching(supabase, "client_tasks", [
        ["company_glide_row_id", companyLegacyId],
        ["client_id", clientLegacyId],
      ]),
      deleteMatching(supabase, "client_contracts", [
        ["company_glide_row_id", companyLegacyId],
        ["client_id", clientLegacyId],
      ]),
      deleteMatching(supabase, "client_milestones", [
        ["company_glide_row_id", companyLegacyId],
        ["client_id", clientLegacyId],
      ]),
      deleteMatching(supabase, "client_history_events", [
        ["company_id", company.id],
        ["legacy_client_glide_row_id", clientLegacyId],
      ]),
      deleteMatching(supabase, "client_custom_field_values", [
        ["company_id", company.id],
        ["client_id", clientLegacyId],
      ]),
      deleteMatching(supabase, "client_links", [
        ["company_id", company.id],
        ["legacy_client_glide_row_id", clientLegacyId],
      ]),
      deleteMatching(supabase, "notifications", [
        ["company_id", company.id],
        ["legacy_client_id", clientLegacyId],
      ]),
      deleteMatching(supabase, "notifications", [
        ["company_id", company.id],
        ["client_id", client.id],
      ]),
      deleteMatching(supabase, "client_timed_checkpoint_completions", [
        ["company_id", company.id],
        ["legacy_client_id", clientLegacyId],
      ]),
      deleteMatching(supabase, "client_call_attendance_events", [
        ["company_id", company.id],
        ["client_legacy_id", clientLegacyId],
      ]),
    ]);

    const { error: deleteClientError } = await supabase
      .from("clients")
      .delete()
      .eq("id", client.id);
    if (deleteClientError) throw deleteClientError;

    const deletedCounts = {
      tasks,
      contracts,
      milestones,
      history,
      customFields,
      links,
      notifications: notificationsByLegacy + notificationsByUuid,
      timedCheckpoints,
      callAttendance,
    };

    await supabase.from("app_audit_events").insert({
      company_id: company.id,
      actor_auth_user_id: userData.user.id,
      actor_member_id: actor.memberId,
      event_type: "client_deleted",
      source: "client_delete",
      entity_table: "clients",
      entity_id: client.id,
      legacy_glide_row_id: clientLegacyId,
      title: "Client deleted",
      summary: `Deleted ${client.client_name ?? clientLegacyId}. Reason: ${reason}`,
      before_data: client,
      after_data: null,
      metadata: {
        actor_role: actor.role,
        reason,
        deleted_counts: deletedCounts,
      },
    });

    return jsonResponse({
      ok: true,
      deletedClientId: client.id,
      deletedClientLegacyId: clientLegacyId,
      deletedCounts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
