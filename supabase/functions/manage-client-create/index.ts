/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CREATOR_ROLES = new Set(["director", "support", "csm"]);

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
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
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

  if (data?.status === "active" && CREATOR_ROLES.has(data.role)) {
    return {
      role: data.role as string,
      memberId: data.id as string,
      legacyMemberId: data.legacy_glide_row_id as string | null,
    };
  }

  throw new Error("You do not have permission to create clients.");
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
    const companyGlideId = cleanText(body.companyGlideId);
    const clientName = cleanText(body.clientName);

    if (!companyGlideId) return jsonResponse({ error: "Missing company." }, 400);
    if (!clientName) return jsonResponse({ error: "Client name is required." }, 400);

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, legacy_glide_row_id, migration_status")
      .eq("legacy_glide_row_id", companyGlideId)
      .in("migration_status", ["pilot", "migrated"])
      .maybeSingle();

    if (companyError) throw companyError;
    if (!company) {
      return jsonResponse(
        { error: "This company is not enabled for RetainOS client creation." },
        400,
      );
    }

    const actor = await resolveActor(supabase, userEmail, company.id);
    const requestedCsmId = nullableText(body.csmTeamMemberId);
    const assignedCsmId =
      actor.role === "csm" ? actor.legacyMemberId : requestedCsmId;

    if (actor.role === "csm" && !assignedCsmId) {
      return jsonResponse(
        { error: "Your account is missing a team member assignment." },
        403,
      );
    }

    if (assignedCsmId) {
      const { data: members, error: memberError } = await supabase
        .from("company_members")
        .select("id, legacy_glide_row_id, status, hide_from_csm_list")
        .eq("company_id", company.id)
        .eq("status", "active");
      if (memberError) throw memberError;
      const member = members?.find(
        (candidate) =>
          candidate.id === assignedCsmId ||
          candidate.legacy_glide_row_id === assignedCsmId,
      );
      if (!member || member.hide_from_csm_list === true) {
        return jsonResponse(
          { error: "Assigned CSM is not an active client manager." },
          400,
        );
      }
    }

    const glideRowId = `ro_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const onboardedAt = normalizeDate(body.dateOnboarded) ?? now;
    const programStatus = nullableText(body.programStatusValue) ?? "front-end";

    const insertPayload = {
      glide_row_id: glideRowId,
      company_id: company.id,
      company_glide_row_id: company.legacy_glide_row_id,
      client_name: clientName,
      client_business: nullableText(body.clientBusiness),
      client_email: nullableText(body.clientEmail),
      client_archetype_value: nullableText(body.clientArchetype),
      north_star_value: nullableText(body.northStar),
      csm_team_member_id: assignedCsmId,
      csm_secondary_assignee_id:
        actor.role === "csm" ? null : nullableText(body.secondaryAssigneeId),
      client_age_date_onboarded: onboardedAt,
      program_status_value: programStatus,
      metadata: {
        created_in: "retainos_client_create_pilot",
        actor_role: actor.role,
      },
    };

    const { data: client, error: createError } = await supabase
      .from("clients")
      .insert(insertPayload)
      .select("*")
      .single();

    if (createError) throw createError;

    const { data: event, error: historyError } = await supabase
      .from("client_history_events")
      .insert({
        company_id: company.id,
        legacy_client_glide_row_id: glideRowId,
        actor_auth_user_id: userData.user.id,
        actor_member_id: actor.memberId,
        event_type: "client_created",
        source: "client_create",
        title: `Client created: ${client.client_name}`,
        summary: `Created ${client.client_name} in RetainOS pilot client data.`,
        payload: {
          actor_role: actor.role,
          client,
        },
      })
      .select("*")
      .single();

    if (historyError) throw historyError;

    await supabase.from("app_audit_events").insert({
      company_id: company.id,
      actor_auth_user_id: userData.user.id,
      actor_member_id: actor.memberId,
      event_type: "client_created",
      source: "client_create",
      entity_table: "clients",
      entity_id: client.id,
      legacy_glide_row_id: glideRowId,
      title: "Client created",
      summary: `Created ${client.client_name}.`,
      after_data: client,
      metadata: {
        history_event_id: event.id,
        actor_role: actor.role,
      },
    });

    return jsonResponse({ ok: true, client, event });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
