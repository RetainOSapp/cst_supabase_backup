/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WRITER_ROLES = new Set(["director", "support", "csm"]);
const SUCCESS_VALUES = new Set(["yes", "no"]);
const HEALTH_VALUES = new Set(["green", "yellow", "red"]);

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

  throw new Error("You do not have permission to edit client outcomes.");
}

function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  return Object.keys(after).filter((key) => {
    const beforeValue = before[key] ?? null;
    const afterValue = after[key] ?? null;
    return beforeValue !== afterValue;
  });
}

function validateChoice(
  label: string,
  value: string | null,
  allowed: Set<string>,
) {
  if (value && !allowed.has(value)) {
    throw new Error(`${label} is not a supported outcome value.`);
  }
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
      .select("*")
      .eq("glide_row_id", clientLegacyId)
      .maybeSingle();

    if (clientError) throw clientError;
    if (!client) {
      return jsonResponse(
        { error: "This client is not enabled for RetainOS outcome edits." },
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
          { error: "CSMs can edit assigned clients only." },
          403,
        );
      }
    }

    const now = new Date().toISOString();
    const successStatus = nullableText(body.successStatus);
    const progressStatus = nullableText(body.progressStatus);
    const buyInStatus = nullableText(body.buyInStatus);
    const notes = nullableText(body.notes);

    validateChoice("Success", successStatus, SUCCESS_VALUES);
    validateChoice("Progress", progressStatus, HEALTH_VALUES);
    validateChoice("Buy-in", buyInStatus, HEALTH_VALUES);

    const nextOutcomes: Record<string, unknown> = {
      outcomes_success_value: successStatus,
      outcomes_success_value_for_filtering: successStatus,
      outcomes_progress_value: progressStatus,
      outcomes_progress_for_filtering: progressStatus,
      outcomes_buy_in_value: buyInStatus,
      outcomes_buy_in_for_filtering: buyInStatus,
    };

    if ((client.outcomes_success_value ?? null) !== successStatus) {
      nextOutcomes.outcomes_success_date = successStatus ? now : null;
    }
    if ((client.outcomes_progress_value ?? null) !== progressStatus) {
      nextOutcomes.outcomes_progress_date = progressStatus ? now : null;
    }
    if ((client.outcomes_buy_in_value ?? null) !== buyInStatus) {
      nextOutcomes.outcomes_buy_in_date = buyInStatus ? now : null;
    }

    const changes = changedFields(client, nextOutcomes);
    if (changes.length === 0 && !notes) {
      return jsonResponse({ error: "No outcome changes to save." }, 400);
    }

    const { data: updatedClient, error: updateError } = changes.length
      ? await supabase
          .from("clients")
          .update(nextOutcomes)
          .eq("id", client.id)
          .select("*")
          .single()
      : { data: client, error: null };

    if (updateError) throw updateError;

    const { data: event, error: historyError } = await supabase
      .from("client_history_events")
      .insert({
        company_id: company.id,
        legacy_client_glide_row_id: clientLegacyId,
        actor_auth_user_id: userData.user.id,
        actor_member_id: actor.memberId,
        event_type: "client_outcomes_updated",
        source: "client_outcomes",
        title: `Outcomes updated for ${updatedClient.client_name ?? "client"}`,
        summary:
          notes ??
          `Updated ${changes.length > 0 ? changes.join(", ") : "outcome notes"}.`,
        success_status: successStatus,
        progress_status: progressStatus,
        buy_in_status: buyInStatus,
        notes,
        payload: {
          actor_role: actor.role,
          changed_fields: changes,
          before: {
            outcomes_success_value: client.outcomes_success_value ?? null,
            outcomes_progress_value: client.outcomes_progress_value ?? null,
            outcomes_buy_in_value: client.outcomes_buy_in_value ?? null,
          },
          after: {
            outcomes_success_value: updatedClient.outcomes_success_value ?? null,
            outcomes_progress_value: updatedClient.outcomes_progress_value ?? null,
            outcomes_buy_in_value: updatedClient.outcomes_buy_in_value ?? null,
          },
        },
      })
      .select("*")
      .single();

    if (historyError) throw historyError;

    await supabase.from("app_audit_events").insert({
      company_id: company.id,
      actor_auth_user_id: userData.user.id,
      actor_member_id: actor.memberId,
      event_type: "client_outcomes_updated",
      source: "client_outcomes",
      entity_table: "clients",
      entity_id: updatedClient.id,
      legacy_glide_row_id: clientLegacyId,
      title: "Client outcomes updated",
      summary: `Outcomes updated for ${updatedClient.client_name ?? clientLegacyId}.`,
      before_data: client,
      after_data: updatedClient,
      metadata: {
        changed_fields: changes,
        history_event_id: event.id,
      },
    });

    return jsonResponse({ ok: true, client: updatedClient, event });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
