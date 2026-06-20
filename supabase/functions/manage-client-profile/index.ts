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

  throw new Error("You do not have permission to edit this client.");
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

async function claimUnassignedClientTasks(
  supabase: ReturnType<typeof createClient>,
  client: Record<string, unknown>,
  assignedCsmId: string | null,
) {
  if (!assignedCsmId) return { claimedTasks: [] as Record<string, unknown>[] };
  const { data, error } = await supabase
    .from("client_tasks")
    .update({
      assigned_to_id: assignedCsmId,
      task_last_updated_date: new Date().toISOString(),
    })
    .eq("company_id", client.company_id)
    .eq("client_id", client.glide_row_id)
    .is("assigned_to_id", null)
    .is("archived_at", null)
    .eq("is_manually_archived", false)
    .not("status_value", "in", '("done","completed","closed","dismissed","archived")')
    .select("id, glide_row_id, task_name, assigned_to_id");
  if (error) throw error;
  return { claimedTasks: (data ?? []) as Record<string, unknown>[] };
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
        "id, company_id, glide_row_id, company_glide_row_id, client_name, client_business, client_email, client_archetype_value, north_star_value, client_director_notes, csm_team_member_id, csm_secondary_assignee_id",
      )
      .eq("glide_row_id", clientLegacyId)
      .maybeSingle();

    if (clientError) throw clientError;
    if (!client) {
      return jsonResponse(
        { error: "This client is not enabled for RetainOS profile edits." },
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

    const nextProfile: Record<string, unknown> = {
      client_name: nullableText(body.clientName) ?? client.client_name,
      client_business: nullableText(body.clientBusiness),
      client_email: nullableText(body.clientEmail),
      client_archetype_value: nullableText(body.clientArchetype),
      north_star_value: nullableText(body.northStar),
    };

    if (actor.role === "super_admin" || actor.role === "director") {
      nextProfile.client_director_notes = nullableText(body.directorNotes);
    }

    let assignmentName: string | null = null;
    if (
      actor.role === "super_admin" ||
      actor.role === "director" ||
      actor.role === "support"
    ) {
      const requestedCsmId = nullableText(body.csmTeamMemberId);
      if (requestedCsmId) {
        const { data: members, error: memberError } = await supabase
          .from("company_members")
          .select("id, legacy_glide_row_id, status, hide_from_csm_list")
          .eq("company_id", company.id)
          .eq("status", "active");
        if (memberError) throw memberError;

        const member = members?.find(
          (candidate) =>
            candidate.id === requestedCsmId ||
            candidate.legacy_glide_row_id === requestedCsmId,
        );
        if (!member || member.hide_from_csm_list === true) {
          return jsonResponse(
            { error: "Assigned CSM is not an active client manager." },
            400,
          );
        }
        const { data: memberName } = await supabase
          .from("company_members")
          .select("name")
          .eq("id", member.id)
          .single();
        assignmentName = memberName?.name ?? null;
      }
      nextProfile.csm_team_member_id = requestedCsmId;
    }

    const changes = changedFields(client, nextProfile);
    if (changes.length === 0) {
      return jsonResponse({ error: "No profile changes to save." }, 400);
    }

    const { data: updatedClient, error: updateError } = await supabase
      .from("clients")
      .update(nextProfile)
      .eq("id", client.id)
      .select("*")
      .single();

    if (updateError) throw updateError;

    const assignmentChanged = changes.includes("csm_team_member_id");
    const claimResult = assignmentChanged
      ? await claimUnassignedClientTasks(
          supabase,
          updatedClient,
          (updatedClient.csm_team_member_id as string | null | undefined) ?? null,
        )
      : { claimedTasks: [] as Record<string, unknown>[] };
    const readableChanges = changes
      .filter((field) => field !== "csm_team_member_id")
      .map((field) => field.replaceAll("_", " "));
    if (assignmentChanged) {
      readableChanges.push(
        assignmentName
          ? `Primary CSM assigned to ${assignmentName}`
          : "Primary CSM unassigned",
      );
      if (claimResult.claimedTasks.length > 0) {
        readableChanges.push(
          `${claimResult.claimedTasks.length} unassigned client task${
            claimResult.claimedTasks.length === 1 ? "" : "s"
          } claimed`,
        );
      }
    }

    const { data: event, error: historyError } = await supabase
      .from("client_history_events")
      .insert({
        company_id: company.id,
        legacy_client_glide_row_id: clientLegacyId,
        actor_auth_user_id: userData.user.id,
        actor_member_id: actor.memberId,
        event_type: "profile_update",
        source: "client_profile_edit",
        title: `Profile updated for ${updatedClient.client_name ?? "client"}`,
        summary: readableChanges.join(". ") + ".",
        payload: {
          actor_role: actor.role,
          changed_fields: changes,
          before: client,
          after: updatedClient,
          claimed_tasks: claimResult.claimedTasks,
        },
      })
      .select("*")
      .single();

    if (historyError) throw historyError;

    await supabase.from("app_audit_events").insert({
      company_id: company.id,
      actor_auth_user_id: userData.user.id,
      actor_member_id: actor.memberId,
      event_type: "client_profile_updated",
      source: "client_profile_edit",
      entity_table: "clients",
      entity_id: updatedClient.id,
      legacy_glide_row_id: clientLegacyId,
      title: "Client profile updated",
      summary: `Profile updated for ${updatedClient.client_name ?? clientLegacyId}.`,
      before_data: client,
      after_data: updatedClient,
      metadata: {
        changed_fields: changes,
        history_event_id: event.id,
        claimed_task_count: claimResult.claimedTasks.length,
      },
    });

    return jsonResponse({
      ok: true,
      client: updatedClient,
      event,
      claimedTasks: claimResult.claimedTasks,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
