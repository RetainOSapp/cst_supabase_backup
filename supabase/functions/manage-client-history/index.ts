/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WRITER_ROLES = new Set(["director", "support", "csm"]);
const HISTORY_SOURCES = new Set(["retainos", "cst"]);
const HISTORY_ACTIONS = new Set(["update_date", "delete"]);

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

function parseRequiredDateTime(value: unknown) {
  const raw = cleanText(value);
  if (!raw) throw new Error("Choose a history date first.");
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Choose a valid history date.");
  }
  return date.toISOString();
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
    return { role: "super_admin", memberId: null, legacyMemberId: null };
  }

  const { data, error } = await supabase
    .from("company_members")
    .select("id, legacy_glide_row_id, role, status")
    .eq("company_id", companyId)
    .ilike("email", userEmail)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  if (data && WRITER_ROLES.has(data.role)) {
    return {
      role: data.role as string,
      memberId: data.id as string,
      legacyMemberId: data.legacy_glide_row_id as string | null,
    };
  }

  throw new Error("You do not have permission to manage client history.");
}

function actorAssignmentIds(actor: {
  memberId: string | null;
  legacyMemberId: string | null;
}) {
  return [actor.legacyMemberId, actor.memberId].filter(
    (id): id is string => Boolean(id),
  );
}

function appOwnedHistorySelect() {
  return [
    "id",
    "company_id",
    "legacy_client_glide_row_id",
    "event_type",
    "source",
    "title",
    "summary",
    "next_steps",
    "last_contact_at",
    "next_contact_at",
    "success_status",
    "progress_status",
    "buy_in_status",
    "notes",
    "created_at",
    "metadata",
  ].join(", ");
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

    const userEmail = normalizeEmail(userData.user.email);
    const body = await req.json().catch(() => ({}));
    const action = cleanText(body.action);
    const source = cleanText(body.source);
    const companyLegacyId = cleanText(body.companyLegacyId);
    const clientLegacyId = cleanText(body.clientLegacyId);
    const eventId = cleanText(body.eventId);
    const eventDate =
      action === "update_date" ? parseRequiredDateTime(body.eventDate) : null;

    if (!HISTORY_ACTIONS.has(action)) {
      return jsonResponse({ error: "Choose a valid history action." }, 400);
    }
    if (!HISTORY_SOURCES.has(source)) {
      return jsonResponse({ error: "Choose a valid history source." }, 400);
    }
    if (!companyLegacyId) {
      return jsonResponse({ error: "Missing company id." }, 400);
    }
    if (!clientLegacyId) {
      return jsonResponse({ error: "Missing client id." }, 400);
    }
    if (!eventId) {
      return jsonResponse({ error: "Missing history entry id." }, 400);
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, legacy_glide_row_id, migration_status")
      .eq("legacy_glide_row_id", companyLegacyId)
      .in("migration_status", ["pilot", "migrated"])
      .maybeSingle();

    if (companyError) throw companyError;
    if (!company) {
      return jsonResponse(
        { error: "This company is not enabled for RetainOS client writes." },
        400,
      );
    }

    const actor = await resolveActor(supabase, userEmail, company.id);

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select(
        "id, glide_row_id, company_id, company_glide_row_id, client_name, csm_team_member_id, csm_secondary_assignee_id",
      )
      .eq("glide_row_id", clientLegacyId)
      .eq("company_id", company.id)
      .maybeSingle();

    if (clientError) throw clientError;
    if (!client) return jsonResponse({ error: "Client not found." }, 404);

    if (actor.role === "csm") {
      const assignmentIds = actorAssignmentIds(actor);
      const isAssigned =
        assignmentIds.includes(client.csm_team_member_id ?? "") ||
        assignmentIds.includes(client.csm_secondary_assignee_id ?? "");
      if (!isAssigned) {
        return jsonResponse(
          { error: "CSMs can manage history for assigned clients only." },
          403,
        );
      }
    }

    const auditBase = {
      company_id: company.id,
      actor_auth_user_id: userData.user.id,
      actor_member_id: actor.memberId,
      source: "client_history_management",
      legacy_glide_row_id: client.glide_row_id,
      metadata: {
        actor_role: actor.role,
        client_id: client.id,
        client_legacy_id: client.glide_row_id,
        history_source: source,
      },
    };

    if (source === "retainos") {
      const { data: before, error: beforeError } = await supabase
        .from("client_history_events")
        .select(appOwnedHistorySelect())
        .eq("id", eventId)
        .eq("company_id", company.id)
        .eq("legacy_client_glide_row_id", client.glide_row_id)
        .maybeSingle();

      if (beforeError) throw beforeError;
      if (!before) {
        return jsonResponse({ error: "History entry not found." }, 404);
      }

      if (action === "delete") {
        const { error: deleteError } = await supabase
          .from("client_history_events")
          .delete()
          .eq("id", eventId)
          .eq("company_id", company.id);

        if (deleteError) throw deleteError;

        await supabase.from("app_audit_events").insert({
          ...auditBase,
          event_type: "client_history_deleted",
          entity_table: "client_history_events",
          entity_id: eventId,
          title: "Client history entry deleted",
          summary: `Deleted history entry for ${client.client_name ?? client.glide_row_id}.`,
          before_data: before,
          after_data: null,
        });

        return jsonResponse({ ok: true, source, eventId, deleted: true });
      }

      const { data: event, error: updateError } = await supabase
        .from("client_history_events")
        .update({ created_at: eventDate })
        .eq("id", eventId)
        .eq("company_id", company.id)
        .select(appOwnedHistorySelect())
        .single();

      if (updateError) throw updateError;

      await supabase.from("app_audit_events").insert({
        ...auditBase,
        event_type: "client_history_date_updated",
        entity_table: "client_history_events",
        entity_id: eventId,
        title: "Client history date updated",
        summary: `Updated history entry date for ${client.client_name ?? client.glide_row_id}.`,
        before_data: before,
        after_data: event,
      });

      return jsonResponse({ ok: true, source, event });
    }

    const { data: before, error: beforeError } = await supabase
      .from("backup_company_clients_history")
      .select("*")
      .eq("glide_row_id", eventId)
      .eq("client_id", client.glide_row_id)
      .maybeSingle();

    if (beforeError) throw beforeError;
    if (!before) {
      return jsonResponse({ error: "History entry not found." }, 404);
    }

    if (action === "delete") {
      const { error: deleteError } = await supabase
        .from("backup_company_clients_history")
        .delete()
        .eq("glide_row_id", eventId)
        .eq("client_id", client.glide_row_id);

      if (deleteError) throw deleteError;

      await supabase.from("app_audit_events").insert({
        ...auditBase,
        event_type: "client_history_deleted",
        entity_table: "backup_company_clients_history",
        entity_id: eventId,
        title: "CST history entry deleted",
        summary: `Deleted imported CST history entry for ${client.client_name ?? client.glide_row_id}.`,
        before_data: before,
        after_data: null,
      });

      return jsonResponse({ ok: true, source, eventId, deleted: true });
    }

    const { data: event, error: updateError } = await supabase
      .from("backup_company_clients_history")
      .update({ modified_date: eventDate })
      .eq("glide_row_id", eventId)
      .eq("client_id", client.glide_row_id)
      .select("*")
      .single();

    if (updateError) throw updateError;

    await supabase.from("app_audit_events").insert({
      ...auditBase,
      event_type: "client_history_date_updated",
      entity_table: "backup_company_clients_history",
      entity_id: eventId,
      title: "CST history date updated",
      summary: `Updated imported CST history entry date for ${client.client_name ?? client.glide_row_id}.`,
      before_data: before,
      after_data: event,
    });

    return jsonResponse({ ok: true, source, event });
  } catch (error) {
    console.error("manage-client-history error", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      400,
    );
  }
});
