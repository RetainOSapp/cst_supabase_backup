/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WRITER_ROLES = new Set(["director", "support", "csm"]);

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

function parseDateTime(value: unknown) {
  const raw = cleanText(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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
    .maybeSingle();

  if (error) throw error;

  if (data?.status === "active" && WRITER_ROLES.has(data.role)) {
    return {
      role: data.role as string,
      memberId: data.id as string,
      legacyMemberId: data.legacy_glide_row_id as string | null,
    };
  }

  throw new Error("You do not have permission to quick update this client.");
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
    const companyLegacyId = cleanText(body.companyLegacyId);
    const clientLegacyId = cleanText(body.clientLegacyId);

    if (!companyLegacyId) {
      return jsonResponse({ error: "Missing company id." }, 400);
    }
    if (!clientLegacyId) {
      return jsonResponse({ error: "Missing client id." }, 400);
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
      .from("backup_company_clients")
      .select(
        "glide_row_id, company_id, client_name, csm_team_member_id, csm_secondary_assignee_id",
      )
      .eq("glide_row_id", clientLegacyId)
      .eq("company_id", companyLegacyId)
      .maybeSingle();

    if (clientError) throw clientError;
    if (!client) return jsonResponse({ error: "Client not found." }, 404);

    if (actor.role === "csm") {
      const legacyMemberId = actor.legacyMemberId;
      const isAssigned =
        legacyMemberId &&
        (client.csm_team_member_id === legacyMemberId ||
          client.csm_secondary_assignee_id === legacyMemberId);
      if (!isAssigned) {
        return jsonResponse(
          { error: "CSMs can quick update assigned clients only." },
          403,
        );
      }
    }

    const nextSteps = cleanText(body.nextSteps);
    const notes = cleanText(body.notes);
    const lastContactAt = parseDateTime(body.lastContactAt);
    const nextContactAt = parseDateTime(body.nextContactAt);
    const successStatus = cleanText(body.successStatus);
    const progressStatus = cleanText(body.progressStatus);
    const buyInStatus = cleanText(body.buyInStatus);

    if (
      !nextSteps &&
      !notes &&
      !lastContactAt &&
      !nextContactAt &&
      !successStatus &&
      !progressStatus &&
      !buyInStatus
    ) {
      return jsonResponse(
        { error: "Add at least one Quick Update field before saving." },
        400,
      );
    }

    const payload = {
      company_id: company.id,
      legacy_client_glide_row_id: clientLegacyId,
      actor_auth_user_id: userData.user.id,
      actor_member_id: actor.memberId,
      event_type: "quick_update",
      source: "client_quick_update",
      title: `Quick update for ${client.client_name ?? "client"}`,
      summary: notes || nextSteps || null,
      next_steps: nextSteps || null,
      last_contact_at: lastContactAt,
      next_contact_at: nextContactAt,
      success_status: successStatus || null,
      progress_status: progressStatus || null,
      buy_in_status: buyInStatus || null,
      notes: notes || null,
      payload: {
        actor_role: actor.role,
        client_name: client.client_name ?? null,
      },
    };

    const { data: event, error: insertError } = await supabase
      .from("client_history_events")
      .insert(payload)
      .select("*")
      .single();

    if (insertError) throw insertError;

    const clientUpdates = {
      next_steps_value: nextSteps || null,
      csm_date_of_last_contact: lastContactAt,
      csm_date_of_next_contact: nextContactAt,
      outcomes_success_value: successStatus || null,
      outcomes_success_value_for_filtering: successStatus || null,
      outcomes_success_date: successStatus ? new Date().toISOString() : null,
      outcomes_progress_value: progressStatus || null,
      outcomes_progress_for_filtering: progressStatus || null,
      outcomes_progress_date: progressStatus ? new Date().toISOString() : null,
      outcomes_buy_in_value: buyInStatus || null,
      outcomes_buy_in_for_filtering: buyInStatus || null,
      outcomes_buy_in_date: buyInStatus ? new Date().toISOString() : null,
    };

    const { data: updatedClient, error: updateClientError } = await supabase
      .from("clients")
      .update(clientUpdates)
      .eq("company_id", company.id)
      .eq("glide_row_id", clientLegacyId)
      .select("id, glide_row_id, client_name")
      .maybeSingle();

    if (updateClientError) throw updateClientError;

    await supabase.from("app_audit_events").insert({
      company_id: company.id,
      actor_auth_user_id: userData.user.id,
      actor_member_id: actor.memberId,
      event_type: "client_quick_update_created",
      source: "client_quick_update",
      entity_table: "client_history_events",
      entity_id: event.id,
      legacy_glide_row_id: clientLegacyId,
      title: "Client Quick Update created",
      summary: `Quick Update saved for ${client.client_name ?? clientLegacyId}.`,
      after_data: {
        event,
        updated_client: updatedClient,
      },
    });

    return jsonResponse({ ok: true, event, client: updatedClient });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
