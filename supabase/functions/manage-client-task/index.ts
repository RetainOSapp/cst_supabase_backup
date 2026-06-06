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

  if (data?.status === "active" && WRITER_ROLES.has(data.role)) {
    return {
      role: data.role as string,
      memberId: data.id as string,
      legacyMemberId: data.legacy_glide_row_id as string | null,
    };
  }

  throw new Error("You do not have permission to manage tasks.");
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
    const taskName = cleanText(body.taskName);

    if (!companyGlideId) return jsonResponse({ error: "Missing company." }, 400);
    if (!taskName) return jsonResponse({ error: "Task name is required." }, 400);

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, legacy_glide_row_id, migration_status")
      .eq("legacy_glide_row_id", companyGlideId)
      .in("migration_status", ["pilot", "migrated"])
      .maybeSingle();

    if (companyError) throw companyError;
    if (!company) {
      return jsonResponse(
        { error: "This company is not enabled for RetainOS task writes." },
        400,
      );
    }

    const actor = await resolveActor(supabase, userEmail, company.id);
    const clientId = nullableText(body.clientId);
    const requestedAssigneeId = nullableText(body.assignedToId);
    const assignedToId =
      actor.role === "csm" ? actor.legacyMemberId : requestedAssigneeId;

    if (actor.role === "csm" && !assignedToId) {
      return jsonResponse(
        { error: "Your account is missing a team member assignment." },
        403,
      );
    }

    if (clientId) {
      const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("glide_row_id, company_id, csm_team_member_id, csm_secondary_assignee_id")
        .eq("glide_row_id", clientId)
        .eq("company_id", company.id)
        .maybeSingle();
      if (clientError) throw clientError;
      if (!client) return jsonResponse({ error: "Linked client not found." }, 400);
      if (actor.role === "csm") {
        const isAssigned =
          actor.legacyMemberId &&
          (client.csm_team_member_id === actor.legacyMemberId ||
            client.csm_secondary_assignee_id === actor.legacyMemberId);
        if (!isAssigned) {
          return jsonResponse(
            { error: "CSMs can create tasks for assigned clients only." },
            403,
          );
        }
      }
    }

    if (assignedToId) {
      const { data: member, error: memberError } = await supabase
        .from("company_members")
        .select("legacy_glide_row_id, status")
        .eq("company_id", company.id)
        .eq("legacy_glide_row_id", assignedToId)
        .maybeSingle();
      if (memberError) throw memberError;
      if (!member || member.status !== "active") {
        return jsonResponse({ error: "Assigned team member is not active." }, 400);
      }
    }

    const glideRowId = `task_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const insertPayload = {
      company_id: company.id,
      company_glide_row_id: company.legacy_glide_row_id,
      glide_row_id: glideRowId,
      client_id: clientId,
      task_name: taskName,
      task_description: nullableText(body.taskDescription),
      task_due_date: normalizeDate(body.taskDueDate),
      task_last_updated_date: now,
      start_date: now,
      created_by_id: actor.legacyMemberId,
      assigned_to_id: assignedToId,
      priority: nullableText(body.priority),
      status_value: nullableText(body.statusValue) ?? "todo",
      external_link: nullableText(body.externalLink),
      metadata: {
        created_in: "retainos_task_write_pilot",
        actor_role: actor.role,
      },
    };

    const { data: task, error: taskError } = await supabase
      .from("client_tasks")
      .insert(insertPayload)
      .select("*")
      .single();

    if (taskError) throw taskError;

    const { data: event, error: historyError } = await supabase
      .from("client_history_events")
      .insert({
        company_id: company.id,
        legacy_client_glide_row_id: clientId ?? glideRowId,
        actor_auth_user_id: userData.user.id,
        actor_member_id: actor.memberId,
        event_type: "task_created",
        source: "task_create",
        title: `Task created: ${task.task_name}`,
        summary: clientId
          ? `Created task for linked client.`
          : `Created company-level task.`,
        payload: {
          actor_role: actor.role,
          task,
        },
      })
      .select("*")
      .single();

    if (historyError) throw historyError;

    await supabase.from("app_audit_events").insert({
      company_id: company.id,
      actor_auth_user_id: userData.user.id,
      actor_member_id: actor.memberId,
      event_type: "task_created",
      source: "task_create",
      entity_table: "client_tasks",
      entity_id: task.id,
      legacy_glide_row_id: glideRowId,
      title: "Task created",
      summary: `Created task ${task.task_name}.`,
      after_data: task,
      metadata: {
        history_event_id: event.id,
        actor_role: actor.role,
      },
    });

    return jsonResponse({ ok: true, task, event });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
