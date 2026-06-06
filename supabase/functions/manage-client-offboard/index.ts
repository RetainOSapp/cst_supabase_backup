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

function nullableText(value: unknown) {
  const text = cleanText(value);
  return text || null;
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

function normalizeDate(value: unknown) {
  const text = cleanText(value);
  if (!text) return new Date().toISOString();
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
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
    .maybeSingle();

  if (error) throw error;

  if (data?.status === "active" && WRITER_ROLES.has(data.role)) {
    return {
      role: data.role as string,
      memberId: data.id as string,
      legacyMemberId: data.legacy_glide_row_id as string | null,
    };
  }

  throw new Error("You do not have permission to offboard this client.");
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
    const clientLegacyId = cleanText(body.clientLegacyId);

    if (!clientLegacyId) {
      return jsonResponse({ error: "Missing client id." }, 400);
    }

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select(
        "id, company_id, glide_row_id, company_glide_row_id, client_name, program_status_value, client_age_date_offboarded, csm_team_member_id, csm_secondary_assignee_id",
      )
      .eq("glide_row_id", clientLegacyId)
      .maybeSingle();

    if (clientError) throw clientError;
    if (!client) {
      return jsonResponse(
        { error: "This client is not enabled for RetainOS offboarding." },
        404,
      );
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, migration_status")
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

    const actor = await resolveActor(supabase, userEmail, company.id);

    if (actor.role === "csm") {
      const legacyMemberId = actor.legacyMemberId;
      const isAssigned =
        legacyMemberId &&
        (client.csm_team_member_id === legacyMemberId ||
          client.csm_secondary_assignee_id === legacyMemberId);
      if (!isAssigned) {
        return jsonResponse(
          { error: "CSMs can offboard assigned clients only." },
          403,
        );
      }
    }

    if (client.program_status_value === "off-boarded") {
      return jsonResponse({ error: "This client is already offboarded." }, 400);
    }

    const offboardedAt = normalizeDate(body.offboardedAt);
    const updatePayload = {
      program_status_value: "off-boarded",
      client_age_date_offboarded: offboardedAt,
      client_age_date_offboarded_for_filtering: offboardedAt,
      churn_reason_value: nullableText(body.churnReason),
      churn_comments: nullableText(body.notes),
    };

    const { data: updatedClient, error: updateError } = await supabase
      .from("clients")
      .update(updatePayload)
      .eq("id", client.id)
      .select("*")
      .single();

    if (updateError) throw updateError;

    const { data: event, error: historyError } = await supabase
      .from("client_history_events")
      .insert({
        company_id: company.id,
        legacy_client_glide_row_id: clientLegacyId,
        actor_auth_user_id: userData.user.id,
        actor_member_id: actor.memberId,
        event_type: "client_offboarded",
        source: "client_offboard",
        title: `Client offboarded: ${updatedClient.client_name ?? "client"}`,
        summary: nullableText(body.notes) ??
          `Offboarded on ${offboardedAt.slice(0, 10)}.`,
        notes: nullableText(body.notes),
        payload: {
          actor_role: actor.role,
          churn_reason: nullableText(body.churnReason),
          offboarded_at: offboardedAt,
          before: client,
          after: updatedClient,
        },
      })
      .select("*")
      .single();

    if (historyError) throw historyError;

    await supabase.from("app_audit_events").insert({
      company_id: company.id,
      actor_auth_user_id: userData.user.id,
      actor_member_id: actor.memberId,
      event_type: "client_offboarded",
      source: "client_offboard",
      entity_table: "clients",
      entity_id: updatedClient.id,
      legacy_glide_row_id: clientLegacyId,
      title: "Client offboarded",
      summary: `Offboarded ${updatedClient.client_name ?? clientLegacyId}.`,
      before_data: client,
      after_data: updatedClient,
      metadata: {
        history_event_id: event.id,
        actor_role: actor.role,
        churn_reason: nullableText(body.churnReason),
      },
    });

    return jsonResponse({ ok: true, client: updatedClient, event });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
