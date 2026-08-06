/// <reference path="../_shared/deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  interactionLabel,
  normalizeInteractionSettings,
} from "../_shared/clientInteractions.ts";

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

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeDateTime(value: unknown) {
  const raw = cleanText(value);
  if (!raw) return new Date().toISOString();
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
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

    const { data: companySettings, error: companySettingsError } = await supabase
      .from("company_settings")
      .select("enable_pipeline, metadata")
      .eq("company_id", company.id)
      .maybeSingle();
    if (companySettingsError) throw companySettingsError;
    const interactionSettings = normalizeInteractionSettings(
      companySettings?.metadata,
    );
    const occurredAt = normalizeDateTime(body.occurredAt);
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

    const existingMetadata = metadataRecord(existingCompletion?.metadata);
    const completionPayload = existingCompletion
      ? {
          ...payload,
          completed_at: existingCompletion.completed_at,
          metadata: {
            ...existingMetadata,
            ...payload.metadata,
          },
        }
      : payload;
    const { data: completion, error: completionError } = existingCompletion
      ? await supabase
          .from("client_timed_checkpoint_completions")
          .update(completionPayload)
          .eq("id", existingCompletion.id)
          .select("*")
          .single()
      : await supabase
          .from("client_timed_checkpoint_completions")
          .insert(completionPayload)
          .select("*")
          .single();

    if (completionError) throw completionError;

    const title = "Strategic review completed";
    const summary = `${actor.name} marked Strategic Review complete for ${client.client_name ?? "client"}.`;
    let historyEvent: Record<string, unknown> | null = null;
    const existingHistoryId = cleanText(existingMetadata.history_event_id);
    if (existingHistoryId) {
      const { data: existingHistory, error: existingHistoryError } = await supabase
        .from("client_history_events")
        .select("*")
        .eq("id", existingHistoryId)
        .maybeSingle();
      if (existingHistoryError) throw existingHistoryError;
      historyEvent = existingHistory as Record<string, unknown> | null;
    }
    if (!historyEvent) {
      const { data: insertedHistory, error: historyError } = await supabase
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
          last_contact_at: occurredAt,
          notes: nullableText(body.notes),
          payload: {
            action,
            checkpoint_type: checkpointType,
            due_at: dueAt,
            completion_id: completion.id,
            client,
          },
        })
        .select("*")
        .single();
      if (historyError) throw historyError;
      historyEvent = insertedHistory as Record<string, unknown>;
    }

    let callAttendanceEvent: Record<string, unknown> | null = null;
    const existingInteractionId = cleanText(existingMetadata.interaction_event_id);
    if (existingInteractionId) {
      const { data: existingInteraction, error: existingInteractionError } =
        await supabase
          .from("client_call_attendance_events")
          .select("*")
          .eq("id", existingInteractionId)
          .maybeSingle();
      if (existingInteractionError) throw existingInteractionError;
      callAttendanceEvent = existingInteraction as Record<string, unknown> | null;
    }
    if (!callAttendanceEvent) {
      const occurredTime = new Date(occurredAt).getTime();
      const { data: compatibleInteraction, error: compatibleInteractionError } =
        await supabase
          .from("client_call_attendance_events")
          .select("*")
          .eq("company_id", company.id)
          .eq("client_id", client.id)
          .eq("attendance_status", "attended")
          .gte(
            "occurred_at",
            new Date(occurredTime - 18 * 60 * 60 * 1000).toISOString(),
          )
          .lte(
            "occurred_at",
            new Date(occurredTime + 18 * 60 * 60 * 1000).toISOString(),
          )
          .contains("metadata", { interaction_type_key: "strategic_review" })
          .order("occurred_at", { ascending: false })
          .limit(1)
          .maybeSingle();
      if (compatibleInteractionError) throw compatibleInteractionError;
      callAttendanceEvent =
        compatibleInteraction as Record<string, unknown> | null;
    }
    if (callAttendanceEvent) {
      const { data: linkedInteraction, error: linkInteractionError } =
        await supabase
          .from("client_call_attendance_events")
          .update({
            metadata: {
              ...metadataRecord(callAttendanceEvent.metadata),
              checkpoint_completion_id: completion.id,
              interaction_type_key: "strategic_review",
              interaction_type_label: interactionLabel(
                interactionSettings,
                "strategic_review",
              ),
            },
          })
          .eq("id", callAttendanceEvent.id)
          .select("*")
          .single();
      if (linkInteractionError) throw linkInteractionError;
      callAttendanceEvent = linkedInteraction as Record<string, unknown>;
    } else {
      const { data: insertedInteraction, error: callAttendanceError } =
        await supabase
          .from("client_call_attendance_events")
          .insert({
            company_id: company.id,
            client_id: client.id,
            client_legacy_id: client.glide_row_id,
            company_legacy_id: companyLegacyId,
            attendance_status: "attended",
            occurred_at: occurredAt,
            source: "daily_pulse",
            notes: nullableText(body.notes),
            actor_member_id: actor.memberId,
            actor_member_legacy_id: actor.legacyMemberId,
            actor_auth_user_id: userData.user.id,
            history_event_id: historyEvent.id,
            metadata: {
              actor_role: actor.role,
              checkpoint_completion_id: completion.id,
              interaction_type_key: "strategic_review",
              interaction_type_label: interactionLabel(
                interactionSettings,
                "strategic_review",
              ),
            },
          })
          .select("*")
          .single();
      if (callAttendanceError) throw callAttendanceError;
      callAttendanceEvent = insertedInteraction as Record<string, unknown>;
    }

    let pipelineItem: Record<string, unknown> | null = null;
    let pipelineWarning: string | null = null;
    const rule = interactionSettings.strategicReviewPipeline;
    if (
      companySettings?.enable_pipeline === true &&
      rule.enabled &&
      rule.pipelineId &&
      rule.targetStageId
    ) {
      const { data: pipelineResult, error: pipelineError } = await supabase.rpc(
        "ensure_strategic_review_pipeline_item",
        {
          p_company_id: company.id,
          p_client_id: client.id,
          p_pipeline_id: rule.pipelineId,
          p_target_stage_id: rule.targetStageId,
          p_actor_auth_user_id: userData.user.id,
          p_actor_member_id: actor.memberId,
          p_actor_role: actor.role,
          p_note: nullableText(body.notes),
        },
      );
      if (pipelineError) {
        pipelineWarning =
          `Strategic Review was saved, but Pipeline could not update: ${pipelineError.message}`;
      } else {
        const result = (
          Array.isArray(pipelineResult) ? pipelineResult[0] : pipelineResult
        ) as Record<string, unknown> | null;
        pipelineItem =
          result?.item &&
          typeof result.item === "object" &&
          !Array.isArray(result.item)
            ? (result.item as Record<string, unknown>)
            : null;
        pipelineWarning =
          typeof result?.warning === "string" ? result.warning : null;
      }
    }

    const workflowMetadata = {
      ...metadataRecord(completion.metadata),
      history_event_id: historyEvent.id,
      interaction_event_id: callAttendanceEvent.id,
      pipeline_item_id: pipelineItem?.id ?? null,
      pipeline_stage_id: pipelineItem?.stage_id ?? null,
      pipeline_warning: pipelineWarning,
      workflow_complete: true,
    };
    const { data: completedWorkflow, error: completionUpdateError } = await supabase
      .from("client_timed_checkpoint_completions")
      .update({ metadata: workflowMetadata })
      .eq("id", completion.id)
      .select("*")
      .single();
    if (completionUpdateError) throw completionUpdateError;

    if (!existingMetadata.audit_event_id) {
      const { data: auditEvent, error: auditError } = await supabase
        .from("app_audit_events")
        .insert({
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
          before_data: existingCompletion,
          after_data: completedWorkflow,
          metadata: {
            history_event_id: historyEvent.id,
            interaction_event_id: callAttendanceEvent.id,
            pipeline_item_id: pipelineItem?.id ?? null,
            checkpoint_type: checkpointType,
            due_at: dueAt,
            actor_role: actor.role,
          },
        })
        .select("id")
        .single();
      if (auditError) throw auditError;
      await supabase
        .from("client_timed_checkpoint_completions")
        .update({
          metadata: {
            ...workflowMetadata,
            audit_event_id: auditEvent.id,
          },
        })
        .eq("id", completion.id);
    }

    return jsonResponse({
      completion: completedWorkflow,
      historyEvent,
      callAttendanceEvent,
      pipelineItem,
      pipelineWarning,
    });
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
