/// <reference path="../_shared/deno.d.ts" />

import {
  AuthError,
  createServiceClient,
  getBearerToken,
  isRegisteredSuperAdmin,
  requireAuthenticatedActor,
  type AuthenticatedActor,
  type SupabaseServiceClient,
} from "../_shared/auth.ts";
import {
  jsonResponse as sharedJsonResponse,
  optionsResponse,
} from "../_shared/http.ts";

const WRITER_ROLES = new Set(["director", "support", "csm"]);
const ALLOWED_STATUS_VALUES = new Set([
  "todo",
  "in-progress",
  "waiting",
  "done",
  "dismissed",
  "archived",
]);

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

function normalizeDate(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function addDaysIso(value: unknown, days: number) {
  const date = value ? new Date(String(value)) : new Date();
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function optionalBoundedInteger(value: unknown, fallback: number, min: number, max: number) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function taskMetadata(task: Record<string, unknown>) {
  return task.metadata && typeof task.metadata === "object" && !Array.isArray(task.metadata)
    ? { ...(task.metadata as Record<string, unknown>) }
    : {};
}

function normalizeProgramStatus(value: unknown) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

function isActiveClientStatus(value: unknown) {
  const status = normalizeProgramStatus(value);
  return status === "front-end" || status === "back-end";
}

function normalizeStatus(value: unknown) {
  const text = cleanText(value).toLowerCase();
  if (!text) return null;
  if (text === "in progress") return "in-progress";
  if (text === "complete" || text === "completed") return "done";
  if (!ALLOWED_STATUS_VALUES.has(text)) return null;
  return text;
}

async function findCompanyMemberByAssignmentId(
  supabase: SupabaseServiceClient,
  companyId: string,
  assignmentId: string,
) {
  if (isUuid(assignmentId)) {
    const { data, error } = await supabase
      .from("company_members")
      .select("id, legacy_glide_row_id, status")
      .eq("company_id", companyId)
      .eq("id", assignmentId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  const { data, error } = await supabase
    .from("company_members")
    .select("id, legacy_glide_row_id, status")
    .eq("company_id", companyId)
    .eq("legacy_glide_row_id", assignmentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function resolveActor(
  supabase: SupabaseServiceClient,
  actor: AuthenticatedActor,
  companyId: string,
) {
  if (await isRegisteredSuperAdmin(supabase, actor)) {
    return { role: "super_admin", memberId: null, legacyMemberId: null };
  }

  const { data: uuidMembership, error: uuidMembershipError } = await supabase
    .from("company_members")
    .select("id, legacy_glide_row_id, role, status")
    .eq("company_id", companyId)
    .eq("auth_user_id", actor.id)
    .maybeSingle();

  if (uuidMembershipError) throw uuidMembershipError;

  let membership = uuidMembership;
  if (!membership) {
    const { data: emailMembership, error: emailMembershipError } = await supabase
      .from("company_members")
      .select("id, legacy_glide_row_id, role, status")
      .eq("company_id", companyId)
      .ilike("email", normalizeEmail(actor.email))
      .maybeSingle();
    if (emailMembershipError) throw emailMembershipError;
    membership = emailMembership;
  }

  if (membership?.status === "active" && WRITER_ROLES.has(membership.role)) {
    return {
      role: membership.role as string,
      memberId: membership.id as string,
      legacyMemberId: membership.legacy_glide_row_id as string | null,
    };
  }

  throw new AuthError("You do not have permission to manage tasks.", 403);
}

function actorAssignmentIds(actor: {
  memberId: string | null;
  legacyMemberId: string | null;
}) {
  return [actor.legacyMemberId, actor.memberId].filter(
    (id): id is string => Boolean(id),
  );
}

function actorPrimaryAssignmentId(actor: {
  memberId: string | null;
  legacyMemberId: string | null;
}) {
  return actor.legacyMemberId ?? actor.memberId;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return optionsResponse(req);
  }

  const respond = (body: unknown, status = 200) =>
    sharedJsonResponse(req, body, status);

  if (req.method !== "POST") {
    return respond({ error: "Method not allowed" }, 405);
  }

  try {
    const supabase = createServiceClient();

    const token = getBearerToken(req);
    const authenticatedActor = await requireAuthenticatedActor(supabase, token);
    const body = await req.json().catch(() => ({}));
    const action = cleanText(body.action) || "create";
    const companyGlideId = cleanText(body.companyGlideId);

    if (!companyGlideId) return respond({ error: "Missing company." }, 400);

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, legacy_glide_row_id, migration_status")
      .eq("legacy_glide_row_id", companyGlideId)
      .in("migration_status", ["pilot", "migrated"])
      .maybeSingle();

    if (companyError) throw companyError;
    if (!company) {
      return respond(
        { error: "This company is not enabled for RetainOS task writes." },
        400,
      );
    }

    const actor = await resolveActor(supabase, authenticatedActor, company.id);

    if (action !== "create") {
      const taskLegacyId = cleanText(body.taskId);
      if (!taskLegacyId) return respond({ error: "Missing task." }, 400);

      const { data: existingTask, error: existingTaskError } = await supabase
        .from("client_tasks")
        .select("*")
        .eq("company_id", company.id)
        .eq("glide_row_id", taskLegacyId)
        .maybeSingle();
      if (existingTaskError) throw existingTaskError;
      if (!existingTask) return respond({ error: "Task not found." }, 404);

      if (actor.role === "csm") {
        const assignmentIds = actorAssignmentIds(actor);
        const actorOwnsTask =
          assignmentIds.includes(existingTask.assigned_to_id ?? "") ||
          assignmentIds.includes(existingTask.created_by_id ?? "");
        if (!actorOwnsTask) {
          return respond(
            { error: "CSMs can update assigned or created tasks only." },
            403,
          );
        }
      }

      const nextClientId =
        body.clientId === undefined
          ? existingTask.client_id
          : nullableText(body.clientId);
      // Imported tasks can point at legacy client ids that are not app-owned yet.
      // Re-validate client assignment only when the user changes the client link.
      if (body.clientId !== undefined && nextClientId) {
        const { data: client, error: clientError } = await supabase
          .from("clients")
          .select("glide_row_id, company_id, csm_team_member_id, csm_secondary_assignee_id")
          .eq("glide_row_id", nextClientId)
          .eq("company_id", company.id)
          .maybeSingle();
        if (clientError) throw clientError;
        if (!client) return respond({ error: "Linked client not found." }, 400);
        if (actor.role === "csm") {
          const assignmentIds = actorAssignmentIds(actor);
          const isAssigned =
            assignmentIds.includes(client.csm_team_member_id ?? "") ||
            assignmentIds.includes(client.csm_secondary_assignee_id ?? "");
          if (!isAssigned) {
            return respond(
              { error: "CSMs can link tasks to assigned clients only." },
              403,
            );
          }
        }
      }

      const requestedAssigneeId =
        body.assignedToId === undefined
          ? existingTask.assigned_to_id
          : nullableText(body.assignedToId);
      const assignedToId =
        actor.role === "csm" ? actorPrimaryAssignmentId(actor) : requestedAssigneeId;
      const isChangingAssignee =
        body.assignedToId !== undefined || actor.role === "csm";

      if (isChangingAssignee && assignedToId) {
        const member = await findCompanyMemberByAssignmentId(
          supabase,
          company.id as string,
          assignedToId,
        );
        if (!member || member.status !== "active") {
          return respond({ error: "Assigned team member is not active." }, 400);
        }
      }

      const requestedStatus =
        body.statusValue === undefined
          ? existingTask.status_value
          : normalizeStatus(body.statusValue);
      if (body.statusValue !== undefined && !requestedStatus) {
        return respond({ error: "Invalid task status." }, 400);
      }

      const now = new Date().toISOString();
      const updatePayload: Record<string, unknown> = {
        task_last_updated_date: now,
      };

      if (body.taskName !== undefined) {
        const taskName = cleanText(body.taskName);
        if (!taskName) return respond({ error: "Task name is required." }, 400);
        updatePayload.task_name = taskName;
      }
      if (body.taskDescription !== undefined) {
        updatePayload.task_description = nullableText(body.taskDescription);
      }
      if (body.clientId !== undefined) updatePayload.client_id = nextClientId;
      if (body.assignedToId !== undefined || actor.role === "csm") {
        updatePayload.assigned_to_id = assignedToId;
      }
      if (body.taskDueDate !== undefined) {
        updatePayload.task_due_date = normalizeDate(body.taskDueDate);
      }
      if (body.priority !== undefined) {
        updatePayload.priority = nullableText(body.priority);
      }
      if (body.externalLink !== undefined) {
        updatePayload.external_link = nullableText(body.externalLink);
      }
      if (
        body.recurringIsRecurring !== undefined ||
        body.recurringIntervalDays !== undefined
      ) {
        const intervalDays = optionalBoundedInteger(
          body.recurringIntervalDays,
          Number(taskMetadata(existingTask).recurring_interval_days ?? 7),
          1,
          365,
        );
        updatePayload.recurring_is_recurring = Boolean(body.recurringIsRecurring);
        updatePayload.metadata = {
          ...taskMetadata(existingTask),
          recurring_interval_days: intervalDays,
        };
      }
      if (body.statusValue !== undefined) {
        updatePayload.status_value = requestedStatus;
        if (requestedStatus === "done") {
          updatePayload.completion_date = existingTask.completion_date ?? now;
          updatePayload.is_manually_archived = false;
          updatePayload.archived_at = null;
        } else if (requestedStatus === "archived" || requestedStatus === "dismissed") {
          updatePayload.is_manually_archived = true;
          updatePayload.archived_at = existingTask.archived_at ?? now;
          if (!existingTask.completion_date) updatePayload.completion_date = now;
        } else {
          updatePayload.completion_date = null;
          updatePayload.is_manually_archived = false;
          updatePayload.archived_at = null;
        }
      }

      const { data: task, error: taskError } = await supabase
        .from("client_tasks")
        .update(updatePayload)
        .eq("id", existingTask.id)
        .select("*")
        .single();
      if (taskError) throw taskError;

      let nextTask = null;
      const recurringMeta = taskMetadata(task);
      const shouldCreateNextRecurringTask =
        requestedStatus === "done" &&
        existingTask.completion_date === null &&
        task.recurring_is_recurring === true &&
        task.task_due_date;
      if (shouldCreateNextRecurringTask) {
        const intervalDays = optionalBoundedInteger(
          recurringMeta.recurring_interval_days,
          7,
          1,
          365,
        );
        const nextDueDate = addDaysIso(task.task_due_date, intervalDays);
        let recurringClientIsActive = true;
        if (task.client_id) {
          const { data: linkedClient, error: linkedClientError } = await supabase
            .from("clients")
            .select("program_status_value")
            .eq("company_id", company.id)
            .eq("glide_row_id", task.client_id)
            .maybeSingle();
          if (linkedClientError) throw linkedClientError;
          recurringClientIsActive = isActiveClientStatus(
            linkedClient?.program_status_value,
          );
        }
        if (nextDueDate && recurringClientIsActive) {
          const { data: createdNextTask, error: nextTaskError } = await supabase
            .from("client_tasks")
            .insert({
              company_id: task.company_id,
              company_glide_row_id: task.company_glide_row_id,
              glide_row_id: `task_${crypto.randomUUID()}`,
              client_id: task.client_id,
              task_name: task.task_name,
              task_description: task.task_description,
              task_due_date: nextDueDate,
              task_last_updated_date: now,
              start_date: now,
              recurring_is_recurring: true,
              created_by_id: actorPrimaryAssignmentId(actor),
              assigned_to_id: task.assigned_to_id,
              priority: task.priority,
              status_value: "todo",
              external_link: task.external_link,
              metadata: {
                ...recurringMeta,
                recurring_interval_days: intervalDays,
                recurring_parent_task_id: task.glide_row_id,
                created_in: "recurring_task_completion",
              },
            })
            .select("*")
            .single();
          if (nextTaskError) throw nextTaskError;
          nextTask = createdNextTask;
        }
      }

      const { data: event, error: historyError } = await supabase
        .from("client_history_events")
        .insert({
          company_id: company.id,
          legacy_client_glide_row_id: task.client_id ?? task.glide_row_id,
          actor_auth_user_id: authenticatedActor.id,
          actor_member_id: actor.memberId,
          event_type: "task_updated",
          source: "task_update",
          title: `Task updated: ${task.task_name}`,
          summary: `Updated task ${task.task_name}.`,
          payload: {
            actor_role: actor.role,
            before: existingTask,
            after: task,
          },
        })
        .select("*")
        .single();
      if (historyError) throw historyError;

      await supabase.from("app_audit_events").insert({
        company_id: company.id,
        actor_auth_user_id: authenticatedActor.id,
        actor_member_id: actor.memberId,
        event_type: "task_updated",
        source: "task_update",
        entity_table: "client_tasks",
        entity_id: task.id,
        legacy_glide_row_id: task.glide_row_id,
        title: "Task updated",
        summary: `Updated task ${task.task_name}.`,
        before_data: existingTask,
        after_data: task,
        metadata: {
          history_event_id: event.id,
          actor_role: actor.role,
        },
      });

      return respond({ ok: true, task, event, nextTask });
    }

    const taskName = cleanText(body.taskName);
    if (!taskName) return respond({ error: "Task name is required." }, 400);
    const clientId = nullableText(body.clientId);
    const requestedAssigneeId = nullableText(body.assignedToId);
    const assignedToId =
      actor.role === "csm" ? actorPrimaryAssignmentId(actor) : requestedAssigneeId;

    if (actor.role === "csm" && !assignedToId) {
      return respond(
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
      if (!client) return respond({ error: "Linked client not found." }, 400);
      if (actor.role === "csm") {
        const assignmentIds = actorAssignmentIds(actor);
        const isAssigned =
          assignmentIds.includes(client.csm_team_member_id ?? "") ||
          assignmentIds.includes(client.csm_secondary_assignee_id ?? "");
        if (!isAssigned) {
          return respond(
            { error: "CSMs can create tasks for assigned clients only." },
            403,
          );
        }
      }
    }

    if (assignedToId) {
      const member = await findCompanyMemberByAssignmentId(
        supabase,
        company.id as string,
        assignedToId,
      );
      if (!member || member.status !== "active") {
        return respond({ error: "Assigned team member is not active." }, 400);
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
      recurring_is_recurring: Boolean(body.recurringIsRecurring),
      created_by_id: actorPrimaryAssignmentId(actor),
      assigned_to_id: assignedToId,
      priority: nullableText(body.priority),
      status_value: normalizeStatus(body.statusValue) ?? "todo",
      external_link: nullableText(body.externalLink),
      metadata: {
        created_in: "retainos_task_write_pilot",
        actor_role: actor.role,
        recurring_interval_days: optionalBoundedInteger(
          body.recurringIntervalDays,
          7,
          1,
          365,
        ),
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
        actor_auth_user_id: authenticatedActor.id,
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
      actor_auth_user_id: authenticatedActor.id,
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

    return respond({ ok: true, task, event });
  } catch (error) {
    console.error(error);
    return respond(
      {
        error: error instanceof AuthError
          ? error.message
          : "Unexpected task management error.",
      },
      error instanceof AuthError ? error.status : 500,
    );
  }
});
