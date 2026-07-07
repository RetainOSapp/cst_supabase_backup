/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WRITER_ROLES = new Set(["director", "support", "csm"]);
const CHECKPOINT_TYPES = new Set(["strategic_review"]);

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
  const raw = cleanText(value);
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
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
    return {
      role: "super_admin",
      memberId: null,
      legacyMemberId: null,
      name: "Super Admin",
    };
  }

  const { data, error } = await supabase
    .from("company_members")
    .select("id, legacy_glide_row_id, role, status, name")
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
      name: (data.name as string | null) ?? userEmail,
    };
  }

  throw new Error("You do not have permission to manage this checkpoint.");
}

function actorAssignmentIds(actor: {
  memberId: string | null;
  legacyMemberId: string | null;
}) {
  return [actor.legacyMemberId, actor.memberId].filter(
    (id): id is string => Boolean(id),
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
    const action = cleanText(body.action);
    const companyLegacyId = cleanText(body.companyLegacyId);
    const clientLegacyId = cleanText(body.clientLegacyId);
    const checkpointType = cleanText(body.checkpointType);
    const dueAt = normalizeDate(body.dueAt);

    if (action !== "complete") {
      return jsonResponse({ error: "Choose a valid checkpoint action." }, 400);
    }
    if (!companyLegacyId) {
      return jsonResponse({ error: "Missing company id." }, 400);
    }
    if (!clientLegacyId) {
      return jsonResponse({ error: "Missing client id." }, 400);
    }
    if (!CHECKPOINT_TYPES.has(checkpointType)) {
      return jsonResponse({ error: "Choose a valid checkpoint type." }, 400);
    }
    if (!dueAt) {
      return jsonResponse({ error: "Choose a valid checkpoint due date." }, 400);
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

    const actor = await resolveActor(
      supabase,
      normalizeEmail(userData.user.email),
      company.id,
    );

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select(
        "id, glide_row_id, company_id, company_glide_row_id, client_name, csm_team_member_id, csm_secondary_assignee_id, current_contract_end_date_for_filtering",
      )
      .eq("company_id", company.id)
      .eq("glide_row_id", clientLegacyId)
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
          { error: "CSMs can complete checkpoints for assigned clients only." },
          403,
        );
      }
    }

    const completedAt = new Date().toISOString();
    const payload = {
      company_id: company.id,
      company_glide_row_id: companyLegacyId,
      client_id: client.id,
      legacy_client_id: client.glide_row_id,
      checkpoint_type: checkpointType,
      due_at: dueAt,
      completed_at: completedAt,
      completed_by_member_id: actor.memberId,
      completed_by_name: actor.name,
      notes: nullableText(body.notes),
      metadata: {
        actor_role: actor.role,
        source: "daily_pulse",
        client_name: client.client_name,
        contract_end_date: client.current_contract_end_date_for_filtering,
      },
      archived_at: null,
    };

    const { data: existingCompletion, error: existingCompletionError } =
      await supabase
        .from("client_timed_checkpoint_completions")
        .select("*")
        .eq("company_id", company.id)
        .eq("legacy_client_id", client.glide_row_id)
        .eq("checkpoint_type", checkpointType)
        .eq("due_at", dueAt)
        .is("archived_at", null)
        .maybeSingle();

    if (existingCompletionError) throw existingCompletionError;

    const { data: completion, error: completionError } = existingCompletion
      ? await supabase
          .from("client_timed_checkpoint_completions")
          .update(payload)
          .eq("id", existingCompletion.id)
          .select("*")
          .single()
      : await supabase
          .from("client_timed_checkpoint_completions")
          .insert(payload)
          .select("*")
          .single();

    if (completionError) throw completionError;

    const title = "Strategic review completed";
    const summary = `${actor.name} marked Strategic Review complete for ${client.client_name ?? "client"}.`;

    const { data: historyEvent, error: historyError } = await supabase
      .from("client_history_events")
      .insert({
        company_id: company.id,
        legacy_client_glide_row_id: client.glide_row_id,
        actor_auth_user_id: userData.user.id,
        actor_member_id: actor.memberId,
        event_type: "client_timed_checkpoint_completed",
        source: "daily_pulse",
        title,
        summary,
        notes: nullableText(body.notes),
        payload: {
          action,
          checkpoint_type: checkpointType,
          due_at: dueAt,
          completion,
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
      event_type: "client_timed_checkpoint_completed",
      source: "daily_pulse",
      entity_table: "client_timed_checkpoint_completions",
      entity_id: completion.id,
      legacy_glide_row_id: completion.legacy_client_id,
      title,
      summary,
      before_data: null,
      after_data: completion,
      metadata: {
        history_event_id: historyEvent.id,
        checkpoint_type: checkpointType,
        due_at: dueAt,
        actor_role: actor.role,
      },
    });

    return jsonResponse({ completion, historyEvent });
  } catch (error) {
    console.error("manage-client-timed-checkpoint error", error);
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected checkpoint error.",
      },
      500,
    );
  }
});
