import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, loadDotEnv } from "./shared-env.mjs";

loadDotEnv();

const { url, serviceRoleKey } = getSupabaseEnv();
const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

const apply = process.argv.includes("--apply");

function readArg(name) {
  return process.argv.find((argument) => argument.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
}

const companyArgument = readArg("company");
const companyIdArgument = readArg("company-id");
const legacyCompanyIdArgument = readArg("legacy-company-id");

function fail(message, details = undefined) {
  console.error(JSON.stringify({ ok: false, message, details }, null, 2));
  process.exit(1);
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function cleanDate(value) {
  const text = cleanText(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function taskMetadata(task) {
  return task.metadata && typeof task.metadata === "object" && !Array.isArray(task.metadata)
    ? { ...task.metadata }
    : {};
}

function statusKey(value) {
  const key = cleanText(value)?.toLowerCase() ?? "";
  if (["in progress", "in_progress"].includes(key)) return "in-progress";
  if (["complete", "completed"].includes(key)) return "done";
  if (["todo", "in-progress", "waiting", "done", "dismissed", "archived"].includes(key)) {
    return key;
  }
  return "todo";
}

function isClosedTask(task) {
  const status = statusKey(task.status_value);
  return (
    ["done", "dismissed", "archived"].includes(status) ||
    Boolean(cleanDate(task.completion_date)) ||
    task.is_manually_archived === true
  );
}

function normalizedTaskName(task) {
  return cleanText(task.task_name)?.toLowerCase().replace(/\s+/g, " ") ?? "";
}

function isOnboardingOrPostKickoffTask(task) {
  const name = normalizedTaskName(task);
  return (
    /\bonboarding\b/.test(name) ||
    /post\s*kick[-\s]*off/.test(name) ||
    /post\s*kickoff/.test(name)
  );
}

function isEightWeekDiagnosticTask(task) {
  const name = normalizedTaskName(task);
  return (
    /8(?:th)?[-\s]*week/.test(name) ||
    /8\s*week/.test(name) ||
    /\bdiagnostic\b/.test(name)
  );
}

function isPauseReturnTask(task) {
  const name = normalizedTaskName(task);
  return /\breengage\b/.test(name) || /\bunpause\b/.test(name);
}

function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function overdueDays(task, today = startOfLocalDay()) {
  if (isClosedTask(task) || !task.task_due_date) return null;
  const due = startOfLocalDay(new Date(task.task_due_date));
  if (Number.isNaN(due.getTime())) return null;
  const days = Math.floor((today.getTime() - due.getTime()) / 86_400_000);
  return days > 0 ? days : 0;
}

function countBy(rows, getter) {
  return rows.reduce((counts, row) => {
    const key = getter(row) ?? "(blank)";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function sample(rows, limit = 10) {
  return rows.slice(0, limit);
}

async function queryAll(label, queryBuilder, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await queryBuilder().range(from, to);
    if (error) throw new Error(`${label}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function resolveCompany() {
  if (!companyArgument && !companyIdArgument && !legacyCompanyIdArgument) {
    fail("Company selector is required for this task cleanup script.", {
      usage:
        "node scripts/cleanup-company-tasks.mjs --company=\"Company Name\" [--apply]",
      selectors: ["--company", "--company-id", "--legacy-company-id"],
    });
  }

  let query = supabase
    .from("companies")
    .select("id, legacy_glide_row_id, name, migration_status, status");

  if (companyIdArgument) {
    query = query.eq("id", companyIdArgument);
  } else if (legacyCompanyIdArgument) {
    query = query.eq("legacy_glide_row_id", legacyCompanyIdArgument);
  } else {
    query = query.ilike("name", companyArgument);
  }

  const { data, error } = await query;
  if (error) throw error;
  if (!data?.length) {
    fail("No app-owned company matched the requested selector.", {
      company: companyArgument,
      companyId: companyIdArgument,
      legacyCompanyId: legacyCompanyIdArgument,
    });
  }
  if (data.length > 1) {
    fail("Multiple companies matched. Re-run with --company-id or --legacy-company-id.", {
      matches: data.map((company) => ({
        id: company.id,
        name: company.name,
        legacy_glide_row_id: company.legacy_glide_row_id,
      })),
    });
  }
  return data[0];
}

function memberMaps(members) {
  const activeIds = new Set();
  const inactiveIds = new Set();
  const byAnyId = new Map();

  members.forEach((member) => {
    const ids = [member.id, member.legacy_glide_row_id].filter(Boolean);
    ids.forEach((id) => {
      byAnyId.set(id, member);
      if (member.status === "active") activeIds.add(id);
      else inactiveIds.add(id);
    });
  });

  return { activeIds, inactiveIds, byAnyId };
}

function classifyTask(task, context) {
  const days = overdueDays(task, context.today);
  if (days === null || days <= 0) return null;

  const status = statusKey(task.status_value);
  const client = task.client_id ? context.clientById.get(task.client_id) : null;
  const assigneeId = cleanText(task.assigned_to_id);
  const assignedToInactiveMember =
    Boolean(assigneeId) &&
    (context.inactiveMemberIds.has(assigneeId) || !context.activeMemberIds.has(assigneeId));
  const clientMissing = Boolean(task.client_id) && !client;
  const clientOffboarded = client?.program_status_value === "off-boarded";
  const clientPausedOrSuspended = ["paused", "suspended"].includes(
    client?.program_status_value ?? "",
  );
  const clientActive = ["front-end", "back-end"].includes(client?.program_status_value ?? "");
  const primaryCsmId = cleanText(client?.csm_team_member_id);
  const primaryCsmIsActive = Boolean(primaryCsmId) && context.activeMemberIds.has(primaryCsmId);

  const dismissReasons = [];
  if (status === "waiting" && days > 60) dismissReasons.push("waiting_overdue_gt_60");
  if (status === "in-progress" && days > 60) dismissReasons.push("in_progress_overdue_gt_60");
  if (status === "todo" && days > 90) dismissReasons.push("todo_overdue_gt_90");
  if (clientOffboarded && days > 30) dismissReasons.push("offboarded_client_overdue_gt_30");
  if (clientMissing && days > 30) dismissReasons.push("missing_client_overdue_gt_30");
  if (status === "todo" && clientOffboarded) {
    dismissReasons.push("todo_offboarded_client_overdue");
  }
  if (status === "todo" && clientMissing) {
    dismissReasons.push("todo_missing_client_overdue");
  }
  if (
    status === "todo" &&
    clientPausedOrSuspended &&
    days > 30 &&
    !isPauseReturnTask(task)
  ) {
    dismissReasons.push("todo_paused_suspended_overdue_gt_30");
  }
  if (status === "todo" && days > 45 && isOnboardingOrPostKickoffTask(task)) {
    dismissReasons.push("todo_onboarding_post_kickoff_overdue_gt_45");
  }
  if (status === "todo" && days > 60 && isEightWeekDiagnosticTask(task)) {
    dismissReasons.push("todo_8_week_diagnostic_overdue_gt_60");
  }

  if (assignedToInactiveMember && days > 45) {
    dismissReasons.push("inactive_assignee_overdue_gt_45");
  }

  if (dismissReasons.length > 0) {
    return { action: "dismiss", reasons: dismissReasons, days };
  }

  if (
    assignedToInactiveMember &&
    days > 30 &&
    days <= 45 &&
    clientActive &&
    primaryCsmIsActive &&
    primaryCsmId &&
    primaryCsmId !== assigneeId
  ) {
    return {
      action: "reassign",
      reasons: ["inactive_assignee_overdue_31_45_active_client"],
      days,
      assignedToId: primaryCsmId,
    };
  }

  if (assignedToInactiveMember && days > 30) {
    return {
      action: "dismiss",
      reasons: ["inactive_assignee_overdue_gt_30_no_safe_reassign"],
      days,
    };
  }

  return null;
}

async function updateTask(taskId, payload) {
  const { error } = await supabase.from("client_tasks").update(payload).eq("id", taskId);
  if (error) throw error;
}

async function main() {
  const company = await resolveCompany();
  const [tasks, members, clients] = await Promise.all([
    queryAll("client tasks", () =>
      supabase
        .from("client_tasks")
        .select("*")
        .eq("company_id", company.id),
    ),
    queryAll("company members", () =>
      supabase
        .from("company_members")
        .select("id, legacy_glide_row_id, name, status")
        .eq("company_id", company.id),
    ),
    queryAll("clients", () =>
      supabase
        .from("clients")
        .select("glide_row_id, client_name, program_status_value, csm_team_member_id")
        .eq("company_id", company.id),
    ),
  ]);

  const { activeIds, inactiveIds, byAnyId } = memberMaps(members);
  const clientById = new Map(clients.map((client) => [client.glide_row_id, client]));
  const context = {
    activeMemberIds: activeIds,
    inactiveMemberIds: inactiveIds,
    memberByAnyId: byAnyId,
    clientById,
    today: startOfLocalDay(),
  };

  const openTasks = tasks.filter((task) => !isClosedTask(task));
  const decisions = openTasks
    .map((task) => ({ task, decision: classifyTask(task, context) }))
    .filter((row) => row.decision);

  const dismissals = decisions.filter((row) => row.decision.action === "dismiss");
  const reassignments = decisions.filter((row) => row.decision.action === "reassign");
  const now = new Date().toISOString();

  const report = {
    ok: true,
    apply,
    company,
    counts: {
      totalTasks: tasks.length,
      openTasks: openTasks.length,
      dismissals: dismissals.length,
      reassignments: reassignments.length,
      untouchedOpenTasks: openTasks.length - decisions.length,
    },
    openStatusCounts: countBy(openTasks, (task) => statusKey(task.status_value)),
    dismissalReasonCounts: countBy(
      dismissals.flatMap((row) => row.decision.reasons),
      (reason) => reason,
    ),
    reassignmentReasonCounts: countBy(
      reassignments.flatMap((row) => row.decision.reasons),
      (reason) => reason,
    ),
    dismissalSamples: sample(
      dismissals.map(({ task, decision }) => ({
        task: task.task_name,
        status: statusKey(task.status_value),
        due: task.task_due_date,
        overdueDays: decision.days,
        reasons: decision.reasons,
        client: context.clientById.get(task.client_id)?.client_name ?? null,
        clientStatus: context.clientById.get(task.client_id)?.program_status_value ?? null,
        assignee: context.memberByAnyId.get(task.assigned_to_id)?.name ?? null,
        assigneeStatus: context.memberByAnyId.get(task.assigned_to_id)?.status ?? null,
      })),
    ),
    reassignmentSamples: sample(
      reassignments.map(({ task, decision }) => ({
        task: task.task_name,
        status: statusKey(task.status_value),
        due: task.task_due_date,
        overdueDays: decision.days,
        reasons: decision.reasons,
        client: context.clientById.get(task.client_id)?.client_name ?? null,
        fromAssignee: context.memberByAnyId.get(task.assigned_to_id)?.name ?? null,
        toAssignee: context.memberByAnyId.get(decision.assignedToId)?.name ?? null,
      })),
    ),
  };

  console.log(JSON.stringify(report, null, 2));

  if (!apply) {
    console.log("Dry run only. Re-run with --apply after reviewing the cleanup candidates.");
    return;
  }

  for (const { task, decision } of dismissals) {
    await updateTask(task.id, {
      status_value: "dismissed",
      is_manually_archived: true,
      archived_at: cleanDate(task.archived_at) ?? now,
      completion_date: cleanDate(task.completion_date) ?? now,
      task_last_updated_date: now,
      metadata: {
        ...taskMetadata(task),
        cleanup: {
          applied_at: now,
          applied_by: "cleanup-company-tasks",
          action: "dismiss",
          reasons: decision.reasons,
          overdue_days: decision.days,
          previous_status_value: statusKey(task.status_value),
          previous_assigned_to_id: cleanText(task.assigned_to_id),
        },
      },
    });
  }

  for (const { task, decision } of reassignments) {
    await updateTask(task.id, {
      assigned_to_id: decision.assignedToId,
      task_last_updated_date: now,
      metadata: {
        ...taskMetadata(task),
        cleanup: {
          applied_at: now,
          applied_by: "cleanup-company-tasks",
          action: "reassign",
          reasons: decision.reasons,
          overdue_days: decision.days,
          previous_assigned_to_id: cleanText(task.assigned_to_id),
          reassigned_to_id: decision.assignedToId,
        },
      },
    });
  }

  const { error: auditError } = await supabase.from("app_audit_events").insert({
    company_id: company.id,
    event_type: "task_cleanup",
    source: "script",
    entity_table: "client_tasks",
    entity_id: null,
    legacy_glide_row_id: company.legacy_glide_row_id,
    title: "Task cleanup applied",
    summary: `Dismissed ${dismissals.length} stale tasks and reassigned ${reassignments.length} tasks.`,
    after_data: report,
  });
  if (auditError) throw auditError;

  console.log(
    JSON.stringify(
      {
        applied: true,
        dismissed: dismissals.length,
        reassigned: reassignments.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
