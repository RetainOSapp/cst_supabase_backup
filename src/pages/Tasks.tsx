import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ProgramStatusPill } from "../lib/clientDisplay.tsx";
import { useAccountContext } from "../lib/accountContext.tsx";
import { supabase } from "../lib/supabase.ts";
import { ComingSoonPanel } from "../components/ComingSoon.tsx";

type ViewMode = "board" | "list";
type StatusMode = "open" | "all" | "closed";
type TaskStatus = "todo" | "in-progress" | "waiting" | "done" | "dismissed" | "archived";

interface Company {
  glide_row_id: string;
  name: string | null;
}

interface TeamMember {
  glide_row_id: string;
  name: string | null;
  is_archived: boolean | null;
  role_hide_from_csm_list: boolean | null;
}

type TaskRow = Record<string, unknown> & {
  glide_row_id: string;
  company_id: string | null;
  client_id: string | null;
  task_name: string | null;
  task_description: string | null;
  task_due_date: string | null;
  task_last_updated_date: string | null;
  start_date: string | null;
  completion_date: string | null;
  recurring_is_recurring: boolean | null;
  is_manually_archived: boolean | null;
  created_by_id: string | null;
  assigned_to_id: string | null;
  priority: string | null;
  status_value: string | null;
  external_link: string | null;
};

interface ClientRow {
  glide_row_id: string;
  client_name: string | null;
  client_image: string | null;
  program_status_value: string | null;
  csm_team_member_id?: string | null;
}

interface TaskTemplateRow {
  id: string;
  name: string;
  description: string | null;
  trigger_type: "manual" | "client_created";
  applies_to_offer_id: string | null;
  assign_to_type: "assigned_csm" | "director" | "support" | "specific_member" | "unassigned";
  assigned_member_legacy_id: string | null;
  due_offset_days: number;
  priority: string | null;
  status_value: TaskStatus;
  is_enabled: boolean;
}

const TASKS_CACHE_KEY = "cst.tasksPageState.v1";

const TASK_STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: "todo", label: "To Do" },
  { value: "in-progress", label: "In Progress" },
  { value: "waiting", label: "Waiting" },
  { value: "done", label: "Done" },
  { value: "dismissed", label: "Dismissed" },
  { value: "archived", label: "Archived" },
];
const ALLOWED_TASK_STATUS_VALUES = new Set<TaskStatus>(
  TASK_STATUS_OPTIONS.map((option) => option.value),
);

function isPresent(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function displayValue(value: unknown) {
  if (!isPresent(value)) return "--";
  if (typeof value === "string") return value.trim() || "--";
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return JSON.stringify(value);
}

function formatDate(value: unknown) {
  if (!isPresent(value)) return "--";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return displayValue(value);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getInitials(name: string | null | undefined) {
  if (!name) return "--";
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "--"
  );
}

function isClosedTask(task: TaskRow) {
  const status = taskStatusKey(task.status_value);
  return (
    status === "done" ||
    status === "dismissed" ||
    status === "archived" ||
    isPresent(task.completion_date) ||
    task.is_manually_archived === true
  );
}

function taskStatusKey(value: unknown): TaskStatus {
  const key = displayValue(value).toLowerCase();
  if (key === "in progress" || key === "in-progress" || key === "in_progress")
    return "in-progress";
  if (key === "complete" || key === "completed") return "done";
  if (key === "waiting") return "waiting";
  if (key === "done") return "done";
  if (key === "dismissed") return "dismissed";
  if (key === "archived") return "archived";
  return "todo";
}

function taskStatusLabel(value: unknown) {
  const key = taskStatusKey(value);
  return TASK_STATUS_OPTIONS.find((option) => option.value === key)?.label ?? "To Do";
}

function isOverdue(task: TaskRow) {
  if (isClosedTask(task) || !task.task_due_date) return false;
  const due = new Date(task.task_due_date);
  if (Number.isNaN(due.getTime())) return false;
  return startOfLocalDay(due).getTime() < startOfLocalDay().getTime();
}

function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysUntilDue(task: TaskRow) {
  if (isClosedTask(task) || !task.task_due_date) return null;
  const due = new Date(task.task_due_date);
  if (Number.isNaN(due.getTime())) return null;
  return Math.round(
    (startOfLocalDay(due).getTime() - startOfLocalDay().getTime()) /
      86_400_000,
  );
}

function isDueSoon(task: TaskRow) {
  const days = daysUntilDue(task);
  return days !== null && days >= 0 && days <= 3;
}

function dueBadge(task: TaskRow) {
  const days = daysUntilDue(task);
  if (days === null) return null;
  if (days < 0) {
    return {
      label: "Overdue",
      className: "border-red-200 bg-red-50 text-red-700",
    };
  }
  if (days === 0) {
    return {
      label: "Due today",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }
  if (days <= 3) {
    return {
      label: `Due in ${days}d`,
      className: "border-blue-200 bg-blue-50 text-blue-700",
    };
  }
  return null;
}

function taskMetadata(task: TaskRow | null | undefined) {
  return task?.metadata && typeof task.metadata === "object" && !Array.isArray(task.metadata)
    ? (task.metadata as Record<string, unknown>)
    : {};
}

function getRecurringIntervalDays(task: TaskRow | null | undefined) {
  const days = Number(taskMetadata(task).recurring_interval_days ?? 7);
  return Number.isFinite(days) ? Math.min(365, Math.max(1, Math.round(days))) : 7;
}

function statusClasses(status: unknown) {
  const key = taskStatusKey(status);
  if (key === "done")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (key === "in-progress")
    return "border-blue-200 bg-blue-50 text-blue-700";
  if (key === "waiting")
    return "border-purple-200 bg-purple-50 text-purple-700";
  if (key === "dismissed" || key === "archived")
    return "border-gray-200 bg-gray-100 text-gray-600";
  if (key === "todo")
    return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-gray-200 bg-gray-50 text-gray-600";
}

function statusSurfaceClasses(status: unknown) {
  const key = taskStatusKey(status);
  if (key === "todo")
    return "border-[#E0922F]/30 bg-[#FCF3E6]/55";
  if (key === "in-progress")
    return "border-[#CBD2DC]/80 bg-[#F1F4F9]/70";
  if (key === "waiting")
    return "border-[#E0922F]/35 bg-[#FCF3E6]/75";
  if (key === "done")
    return "border-[#34B389]/30 bg-[#E7F6F0]/65";
  if (key === "dismissed" || key === "archived")
    return "border-[#586273]/25 bg-[#232932]/[0.06]";
  return "border-gray-200 bg-gray-50";
}

function statusHeaderClasses(status: unknown) {
  const key = taskStatusKey(status);
  if (key === "todo")
    return "border-[#E0922F]/20 bg-[#FCF3E6]/75 text-[#7a4a14]";
  if (key === "in-progress")
    return "border-[#CBD2DC]/70 bg-[#F7F9FC] text-[#3C4450]";
  if (key === "waiting")
    return "border-[#E0922F]/25 bg-[#FCF3E6] text-[#7a4a14]";
  if (key === "done")
    return "border-[#34B389]/25 bg-[#E7F6F0] text-[#2A9272]";
  if (key === "dismissed" || key === "archived")
    return "border-[#586273]/20 bg-[#232932]/[0.08] text-[#3C4450]";
  return "border-gray-200 bg-gray-50 text-gray-800";
}

function readTasksCache() {
  try {
    const raw = window.sessionStorage.getItem(TASKS_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as {
      companyId?: string;
      csmId?: string;
      statusMode?: StatusMode;
      viewMode?: ViewMode;
      search?: string;
    };
  } catch {
    return null;
  }
}

function TaskCard({
  task,
  client,
  teamMemberNameById,
  canManage,
  isMoving,
  onClick,
  onDragStart,
  onDragEnd,
}: {
  task: TaskRow;
  client: ClientRow | undefined;
  teamMemberNameById: Map<string, string>;
  canManage: boolean;
  isMoving: boolean;
  onClick: () => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: (event: DragEvent<HTMLElement>) => void;
}) {
  const assignedTo = task.assigned_to_id
    ? (teamMemberNameById.get(task.assigned_to_id) ?? task.assigned_to_id)
    : "Unassigned";
  const dueSignal = dueBadge(task);

  return (
    <article
      draggable={canManage}
      onDragStart={canManage ? onDragStart : undefined}
      onDragEnd={canManage ? onDragEnd : undefined}
      onClick={onClick}
      className={`relative rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-indigo-200 hover:shadow-md ${canManage ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
    >
      {isMoving ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/75">
          <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-indigo-600" />
        </div>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">
            {displayValue(task.task_name)}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusClasses(task.status_value)}`}
            >
              {taskStatusLabel(task.status_value)}
            </span>
            {isPresent(task.priority) && (
              <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700">
                {displayValue(task.priority)}
              </span>
            )}
            {dueSignal ? (
              <span
                className={`rounded-full border px-2 py-0.5 text-xs font-medium ${dueSignal.className}`}
              >
                {dueSignal.label}
              </span>
            ) : null}
            {task.recurring_is_recurring === true ? (
              <span className="rounded-full border border-[#CBD2DC] bg-[#F7F9FC] px-2 py-0.5 text-xs font-medium text-[#586273]">
                Recurring
              </span>
            ) : null}
          </div>
        </div>
        {task.external_link && (
          <a
            href={task.external_link}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-indigo-600 underline"
          >
            Link
          </a>
        )}
      </div>

      {isPresent(task.task_description) && (
        <p className="mt-3 whitespace-pre-line text-sm leading-6 text-gray-700">
          {task.task_description}
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-gray-500">
        <div>
          <div className="uppercase tracking-wider">Due</div>
          <div className="mt-0.5 font-medium text-gray-800">
            {formatDate(task.task_due_date)}
          </div>
        </div>
        <div>
          <div className="uppercase tracking-wider">Assigned</div>
          <div className="mt-0.5 truncate font-medium text-gray-800">
            {assignedTo}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
        <Link
          to={client ? `/clients/${encodeURIComponent(client.glide_row_id)}` : "#"}
          onClick={(event) => event.stopPropagation()}
          className="flex min-w-0 items-center gap-2 text-sm font-medium text-gray-800 hover:text-indigo-700"
        >
          {client?.client_image ? (
            <img
              src={client.client_image}
              alt=""
              className="h-7 w-7 rounded-lg border border-gray-200 object-cover"
            />
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-indigo-100 bg-indigo-50 text-xs font-semibold text-indigo-700">
              {getInitials(client?.client_name)}
            </span>
          )}
          <span className="truncate">{client?.client_name ?? "Unknown client"}</span>
        </Link>
        {client?.program_status_value && (
          <ProgramStatusPill value={client.program_status_value} />
        )}
      </div>
    </article>
  );
}

function TaskListTable({
  tasks,
  clientById,
  teamMemberNameById,
  canManage,
  movingTaskId,
  onOpenTask,
  onDragStart,
  onDragEnd,
}: {
  tasks: TaskRow[];
  clientById: Map<string, ClientRow>;
  teamMemberNameById: Map<string, string>;
  canManage: boolean;
  movingTaskId: string | null;
  onOpenTask: (task: TaskRow) => void;
  onDragStart: (event: DragEvent<HTMLElement>, task: TaskRow) => void;
  onDragEnd: (event: DragEvent<HTMLElement>) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {["Task", "Client", "Status", "Priority", "Due", "Assigned"].map(
              (heading) => (
                <th
                  key={heading}
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  {heading}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {tasks.map((task) => {
            const client = task.client_id
              ? clientById.get(task.client_id)
              : undefined;
            const dueSignal = dueBadge(task);
            return (
              <tr
                key={task.glide_row_id}
                draggable={canManage}
                onDragStart={
                  canManage ? (event) => onDragStart(event, task) : undefined
                }
                onDragEnd={canManage ? onDragEnd : undefined}
                onClick={() => onOpenTask(task)}
                className={`cursor-pointer hover:bg-gray-50 ${
                  movingTaskId === task.glide_row_id ? "opacity-50" : ""
                } ${canManage ? "active:cursor-grabbing" : ""}`}
              >
                <td className="max-w-sm px-4 py-3">
                  <div className="text-sm font-medium text-gray-900">
                    {displayValue(task.task_name)}
                  </div>
                  {isPresent(task.task_description) && (
                    <div className="mt-1 line-clamp-2 text-xs text-gray-500">
                      {task.task_description}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {client ? (
                    <Link
                      to={`/clients/${encodeURIComponent(client.glide_row_id)}`}
                      className="font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      {client.client_name ?? "Unnamed client"}
                    </Link>
                  ) : (
                    "Unknown client"
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusClasses(task.status_value)}`}
                  >
                    {taskStatusLabel(task.status_value)}
                  </span>
                  {task.recurring_is_recurring === true ? (
                    <span className="ml-2 rounded-full border border-[#CBD2DC] bg-[#F7F9FC] px-2 py-0.5 text-xs font-medium text-[#586273]">
                      Recurring
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {displayValue(task.priority)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{formatDate(task.task_due_date)}</span>
                    {dueSignal ? (
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${dueSignal.className}`}
                      >
                        {dueSignal.label}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {task.assigned_to_id
                    ? (teamMemberNameById.get(task.assigned_to_id) ??
                      task.assigned_to_id)
                    : "Unassigned"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NewTaskModal({
  companyId,
  task,
  clients,
  teamMembers,
  taskTemplates,
  assignedTeamMemberId,
  onClose,
  onSaved,
}: {
  companyId: string;
  task?: TaskRow | null;
  clients: ClientRow[];
  teamMembers: TeamMember[];
  taskTemplates: TaskTemplateRow[];
  assignedTeamMemberId: string;
  onClose: () => void;
  onSaved: (task: TaskRow) => void;
}) {
  const isEditing = Boolean(task);
  const [taskName, setTaskName] = useState(task?.task_name ?? "");
  const [taskDescription, setTaskDescription] = useState(task?.task_description ?? "");
  const [clientId, setClientId] = useState(task?.client_id ?? "");
  const [assignedToId, setAssignedToId] = useState(
    task?.assigned_to_id ?? assignedTeamMemberId,
  );
  const [taskDueDate, setTaskDueDate] = useState(
    task?.task_due_date ? task.task_due_date.slice(0, 10) : "",
  );
  const [priority, setPriority] = useState(task?.priority ?? "");
  const [statusValue, setStatusValue] = useState<TaskStatus>(
    taskStatusKey(task?.status_value ?? "todo"),
  );
  const [externalLink, setExternalLink] = useState(task?.external_link ?? "");
  const [recurringIsRecurring, setRecurringIsRecurring] = useState(
    task?.recurring_is_recurring === true,
  );
  const [recurringIntervalDays, setRecurringIntervalDays] = useState(
    getRecurringIntervalDays(task),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const availableTeamMembers = teamMembers.filter(
    (member) =>
      member.is_archived !== true && member.role_hide_from_csm_list !== true,
  );

  function dateAfterToday(days: number) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function applyTemplate(templateId: string) {
    const template = taskTemplates.find((item) => item.id === templateId);
    if (!template) return;
    setTaskName(template.name);
    setTaskDescription(template.description ?? "");
    setPriority(template.priority ?? "");
    setStatusValue(taskStatusKey(template.status_value));
    setTaskDueDate(dateAfterToday(template.due_offset_days));
    setRecurringIsRecurring(false);
    if (template.assign_to_type === "specific_member") {
      setAssignedToId(template.assigned_member_legacy_id ?? "");
    } else if (template.assign_to_type === "assigned_csm") {
      const client = clients.find((row) => row.glide_row_id === clientId);
      setAssignedToId(client?.csm_team_member_id ?? assignedTeamMemberId ?? "");
    } else if (template.assign_to_type === "unassigned") {
      setAssignedToId("");
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveError(null);

    const { data, error } = await supabase.functions.invoke(
      "manage-client-task",
      {
        body: {
          companyGlideId: companyId,
          action: isEditing ? "update" : "create",
          taskId: task?.glide_row_id,
          taskName,
          taskDescription,
          clientId,
          assignedToId,
          taskDueDate,
          priority,
          statusValue,
          externalLink,
          recurringIsRecurring,
          recurringIntervalDays,
        },
      },
    );

    setSaving(false);

    if (error) {
      setSaveError(error.message);
      return;
    }
    if (data?.error) {
      setSaveError(data.error);
      return;
    }
    if (data?.task) {
      onSaved(data.task as TaskRow);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close new task"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 cursor-pointer"
      />
      <div className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {isEditing ? "Task Details" : "New Task"}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {isEditing
                ? "Update task details, assignment, due date, or status."
                : "Creates a RetainOS task. CST preview tasks stay unchanged."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 cursor-pointer"
          >
            <span className="sr-only">Close</span>
            <span className="text-xl leading-none">x</span>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-4 px-5 py-5 md:grid-cols-2">
            {!isEditing && taskTemplates.length > 0 ? (
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Start From Template
                </span>
                <select
                  defaultValue=""
                  onChange={(event) => applyTemplate(event.target.value)}
                  disabled={saving}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
                >
                  <option value="">Choose a task template</option>
                  {taskTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="block md:col-span-2">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Task Name
              </span>
              <input
                value={taskName}
                onChange={(event) => setTaskName(event.target.value)}
                required
                disabled={saving}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Description
              </span>
              <textarea
                value={taskDescription}
                onChange={(event) => setTaskDescription(event.target.value)}
                rows={3}
                disabled={saving}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Client
              </span>
              <select
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                disabled={saving}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
              >
                <option value="">Company-level task</option>
                {clients.map((client) => (
                  <option key={client.glide_row_id} value={client.glide_row_id}>
                    {client.client_name ?? "Unnamed client"}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Assigned To
              </span>
              <select
                value={assignedToId}
                onChange={(event) => setAssignedToId(event.target.value)}
                disabled={saving || Boolean(assignedTeamMemberId)}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
              >
                <option value="">Unassigned</option>
                {availableTeamMembers.map((member) => (
                  <option key={member.glide_row_id} value={member.glide_row_id}>
                    {member.name ?? "(unnamed)"}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Due Date
              </span>
              <input
                type="date"
                value={taskDueDate}
                onChange={(event) => setTaskDueDate(event.target.value)}
                disabled={saving}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Priority
              </span>
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
                disabled={saving}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
              >
                <option value="">Not set</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Status
              </span>
              <select
                value={statusValue}
                onChange={(event) =>
                  setStatusValue(event.target.value as TaskStatus)
                }
                disabled={saving}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
              >
                {TASK_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                External Link
              </span>
              <input
                value={externalLink}
                onChange={(event) => setExternalLink(event.target.value)}
                disabled={saving}
                placeholder="Optional"
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 disabled:bg-gray-50"
              />
            </label>
            <label className="flex items-start gap-3 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 md:col-span-2">
              <input
                type="checkbox"
                checked={recurringIsRecurring}
                onChange={(event) => setRecurringIsRecurring(event.target.checked)}
                disabled={saving}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-gray-900">
                  Recurring task
                </span>
                <span className="mt-1 block text-xs text-gray-500">
                  When this task is completed, RetainOS creates the next one.
                </span>
              </span>
              <span className="w-36">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Every days
                </span>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={recurringIntervalDays}
                  onChange={(event) =>
                    setRecurringIntervalDays(Number(event.target.value) || 7)
                  }
                  disabled={saving || !recurringIsRecurring}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-500"
                />
              </span>
            </label>
            {saveError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 md:col-span-2">
                {saveError}
              </div>
            ) : null}
          </div>
          <div className="flex justify-end gap-3 border-t border-gray-200 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !taskName.trim()}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Saving..." : isEditing ? "Save Task" : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function Tasks() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    capabilities,
    effectiveCompanyId,
    teamMemberId,
  } = useAccountContext();
  const cached = useMemo(() => readTasksCache(), []);
  const [companyId, setCompanyId] = useState(
    effectiveCompanyId || searchParams.get("companyId") || cached?.companyId || "",
  );
  const [csmId, setCsmId] = useState(
    capabilities.canViewOnlyAssignedClients
      ? teamMemberId
      : searchParams.get("csmId") ?? cached?.csmId ?? "",
  );
  const [statusMode, setStatusMode] = useState<StatusMode>(
    cached?.statusMode ?? "open",
  );
  const [viewMode, setViewMode] = useState<ViewMode>(
    cached?.viewMode ?? "board",
  );
  const [search, setSearch] = useState(cached?.search ?? "");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [appTaskCompanyIds, setAppTaskCompanyIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [clientById, setClientById] = useState(new Map<string, ClientRow>());
  const [companyClients, setCompanyClients] = useState<ClientRow[]>([]);
  const [taskTemplates, setTaskTemplates] = useState<TaskTemplateRow[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null);
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const dragHandledRef = useRef(false);

  const assignedTeamMemberId = capabilities.canViewOnlyAssignedClients
    ? teamMemberId
    : "";
  const canUseCompanySwitcher = capabilities.canUseCompanySwitcher;
  const isUsingAppTasks = appTaskCompanyIds.has(companyId);
  const canManageTasks =
    capabilities.canAccessTasks && Boolean(companyId) && isUsingAppTasks;

  const availableTeamMembers = useMemo(
    () =>
      teamMembers.filter(
        (member) =>
          member.is_archived !== true &&
          member.role_hide_from_csm_list !== true,
      ),
    [teamMembers],
  );

  const teamMemberNameById = useMemo(
    () =>
      new Map(
        teamMembers.map((member) => [
          member.glide_row_id,
          member.name ?? "Unassigned",
        ]),
      ),
    [teamMembers],
  );

  useEffect(() => {
    window.sessionStorage.setItem(
      TASKS_CACHE_KEY,
      JSON.stringify({ companyId, csmId, statusMode, viewMode, search }),
    );
    const next = new URLSearchParams();
    if (companyId) next.set("companyId", companyId);
    if (csmId) next.set("csmId", csmId);
    setSearchParams(next, { replace: true });
  }, [companyId, csmId, search, setSearchParams, statusMode, viewMode]);

  useEffect(() => {
    if (!effectiveCompanyId || effectiveCompanyId === companyId) return;
    setCompanyId(effectiveCompanyId);
    setCsmId(assignedTeamMemberId);
  }, [assignedTeamMemberId, companyId, effectiveCompanyId]);

  useEffect(() => {
    async function loadCompanies() {
      let query = supabase
        .from("backup_companies")
        .select("glide_row_id, name")
        .or("archived.is.null,archived.eq.false")
        .order("name", { ascending: true });
      if (!canUseCompanySwitcher && effectiveCompanyId) {
        query = query.eq("glide_row_id", effectiveCompanyId);
      }
      const [backupCompaniesResult, appCompaniesResult] = await Promise.all([
        query,
        supabase
          .from("companies")
          .select("legacy_glide_row_id, name, migration_status")
          .in("migration_status", ["pilot", "migrated"]),
      ]);
      const { data, error } = backupCompaniesResult;
      if (error) console.error("Failed to load companies:", error);
      if (appCompaniesResult.error)
        console.error("Failed to load app companies:", appCompaniesResult.error);
      let rows = [...((data ?? []) as Company[])];
      const existingCompanyIds = new Set(
        rows.map((company) => company.glide_row_id),
      );
      (appCompaniesResult.data ?? []).forEach((company) => {
        const legacyId = company.legacy_glide_row_id;
        if (typeof legacyId !== "string" || legacyId === "") return;
        if (existingCompanyIds.has(legacyId)) return;
        rows.push({
          glide_row_id: legacyId,
          name: company.name ?? null,
        });
      });
      if (!canUseCompanySwitcher && effectiveCompanyId) {
        rows = rows.filter((company) => company.glide_row_id === effectiveCompanyId);
      }
      setCompanies(
        rows.sort((left, right) =>
          (left.name ?? "").localeCompare(right.name ?? ""),
        ),
      );
      setAppTaskCompanyIds(
        new Set(
          (appCompaniesResult.data ?? [])
            .map((company) => company.legacy_glide_row_id)
            .filter((id): id is string => typeof id === "string" && id !== ""),
        ),
      );
    }
    void loadCompanies();
  }, [canUseCompanySwitcher, effectiveCompanyId]);

  useEffect(() => {
    if (!companyId) {
      setTeamMembers([]);
      setCsmId("");
      return;
    }
    let cancelled = false;
    async function loadTeam() {
      setLoadingTeam(true);
      let rows: TeamMember[] = [];
      if (appTaskCompanyIds.has(companyId)) {
        const { data: appCompany, error: companyError } = await supabase
          .from("companies")
          .select("id")
          .eq("legacy_glide_row_id", companyId)
          .in("migration_status", ["pilot", "migrated"])
          .maybeSingle();
        if (companyError) console.error("Failed to load app company:", companyError);
        if (appCompany?.id) {
          const { data, error } = await supabase
            .from("company_members")
            .select("id, legacy_glide_row_id, name, status, hide_from_csm_list")
            .eq("company_id", appCompany.id)
            .eq("status", "active")
            .order("name", { ascending: true });
          if (cancelled) return;
          if (error) console.error("Failed to load app team members:", error);
          rows = ((data ?? []) as Array<{
            id: string;
            legacy_glide_row_id: string | null;
            name: string | null;
            status: string | null;
            hide_from_csm_list: boolean | null;
          }>).map((member) => ({
            glide_row_id: member.legacy_glide_row_id ?? member.id,
            name: member.name,
            is_archived: member.status === "archived",
            role_hide_from_csm_list: member.hide_from_csm_list,
          }));
        }
      } else {
        const { data, error } = await supabase
          .from("backup_company_team")
          .select("glide_row_id, name, is_archived, role_hide_from_csm_list")
          .eq("company_id", companyId)
          .order("name", { ascending: true });
        if (cancelled) return;
        if (error) console.error("Failed to load team members:", error);
        rows = (data ?? []) as TeamMember[];
      }
      if (cancelled) return;
      setTeamMembers(rows);
      if (
        csmId &&
        !assignedTeamMemberId &&
        !rows.some((member) => member.glide_row_id === csmId)
      ) {
        setCsmId("");
      }
      setLoadingTeam(false);
    }
    void loadTeam();
    return () => {
      cancelled = true;
    };
  }, [appTaskCompanyIds, assignedTeamMemberId, companyId, csmId]);

  useEffect(() => {
    if (!companyId) {
      setCompanyClients([]);
      return;
    }
    let cancelled = false;
    async function loadCompanyClients() {
      const sourceTable = appTaskCompanyIds.has(companyId)
        ? "clients"
        : "backup_company_clients";
      const { data, error } = await supabase
        .from(sourceTable)
        .select("glide_row_id, client_name, client_image, program_status_value, csm_team_member_id")
        .eq(
          sourceTable === "clients" ? "company_glide_row_id" : "company_id",
          companyId,
        )
        .order("client_name", { ascending: true, nullsFirst: false })
        .limit(500);
      if (cancelled) return;
      if (error) {
        console.error("Failed to load company clients:", error);
        setCompanyClients([]);
      } else {
        setCompanyClients((data ?? []) as ClientRow[]);
      }
    }
    void loadCompanyClients();
    return () => {
      cancelled = true;
    };
  }, [appTaskCompanyIds, companyId]);

  useEffect(() => {
    if (!companyId || !appTaskCompanyIds.has(companyId)) {
      setTaskTemplates([]);
      return;
    }
    let cancelled = false;
    async function loadTaskTemplates() {
      const { data: appCompany, error: companyError } = await supabase
        .from("companies")
        .select("id")
        .eq("legacy_glide_row_id", companyId)
        .in("migration_status", ["pilot", "migrated"])
        .maybeSingle();
      if (companyError) console.error("Failed to load app company:", companyError);
      if (!appCompany?.id) {
        if (!cancelled) setTaskTemplates([]);
        return;
      }
      const { data, error } = await supabase
        .from("company_task_templates")
        .select(
          "id, name, description, trigger_type, applies_to_offer_id, assign_to_type, assigned_member_legacy_id, due_offset_days, priority, status_value, is_enabled",
        )
        .eq("company_id", appCompany.id)
        .eq("trigger_type", "manual")
        .eq("is_enabled", true)
        .is("archived_at", null)
        .order("position", { ascending: true })
        .order("name", { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error("Failed to load task templates:", error);
        setTaskTemplates([]);
      } else {
        setTaskTemplates((data ?? []) as TaskTemplateRow[]);
      }
    }
    void loadTaskTemplates();
    return () => {
      cancelled = true;
    };
  }, [appTaskCompanyIds, companyId]);

  useEffect(() => {
    if (!companyId) {
      setTasks([]);
      setClientById(new Map());
      return;
    }
    let cancelled = false;
    async function loadTasks() {
      setLoadingTasks(true);
      setTasksError(null);
      const usesAppTasks = appTaskCompanyIds.has(companyId);
      let tasksQuery = supabase
        .from(usesAppTasks ? "client_tasks" : "backup_company_clients_tasks")
        .select("*")
        .eq(usesAppTasks ? "company_glide_row_id" : "company_id", companyId);

      if (assignedTeamMemberId) {
        tasksQuery = tasksQuery.eq("assigned_to_id", assignedTeamMemberId);
      } else if (csmId) {
        tasksQuery = tasksQuery.eq("assigned_to_id", csmId);
      }
      if (search.trim()) {
        const q = `%${search.trim()}%`;
        tasksQuery = tasksQuery.or(
          `task_name.ilike.${q},task_description.ilike.${q}`,
        );
      }
      tasksQuery = tasksQuery.order("task_due_date", {
        ascending: true,
        nullsFirst: false,
      });

      const tasksResult = await tasksQuery.limit(250);
      if (cancelled) return;
      if (tasksResult.error) {
        setTasks([]);
        setClientById(new Map());
        setTasksError(
          tasksResult.error?.message ?? "Failed to load tasks",
        );
        setLoadingTasks(false);
        return;
      }

      let rows = (tasksResult.data ?? []) as TaskRow[];
      if (statusMode === "open") rows = rows.filter((task) => !isClosedTask(task));
      if (statusMode === "closed") rows = rows.filter(isClosedTask);
      setTasks(rows);

      const clientIds = [
        ...new Set(rows.map((task) => task.client_id).filter(Boolean)),
      ] as string[];
      if (clientIds.length > 0) {
        const clientsResult = await supabase
          .from(usesAppTasks ? "clients" : "backup_company_clients")
          .select("glide_row_id, client_name, client_image, program_status_value, csm_team_member_id")
          .in("glide_row_id", clientIds);
        if (!cancelled) {
          if (clientsResult.error)
            console.error("Failed to load task clients:", clientsResult.error);
          const clients = (clientsResult.data ?? []) as ClientRow[];
          setClientById(
            new Map(
              clients.map((client) => [
                client.glide_row_id,
                client,
              ]),
            ),
          );
        }
      } else {
        setClientById(new Map());
      }

      if (!cancelled) setLoadingTasks(false);
    }
    void loadTasks();
    return () => {
      cancelled = true;
    };
  }, [appTaskCompanyIds, assignedTeamMemberId, companyId, csmId, search, statusMode]);

  const columns = useMemo(() => {
    const todo = tasks.filter((task) => taskStatusKey(task.status_value) === "todo");
    const inProgress = tasks.filter(
      (task) => taskStatusKey(task.status_value) === "in-progress",
    );
    const waiting = tasks.filter(
      (task) => taskStatusKey(task.status_value) === "waiting",
    );
    const done = tasks.filter((task) => taskStatusKey(task.status_value) === "done");
    const dismissed = tasks.filter((task) =>
      ["dismissed", "archived"].includes(taskStatusKey(task.status_value)),
    );
    const allColumns = [
      { key: "todo", label: "To Do", tasks: todo },
      { key: "in-progress", label: "In Progress", tasks: inProgress },
      { key: "waiting", label: "Waiting", tasks: waiting },
      { key: "done", label: "Done", tasks: done },
      { key: "dismissed", label: "Dismissed", tasks: dismissed },
    ];
    return statusMode === "closed"
      ? allColumns.filter((column) => ["done", "dismissed"].includes(column.key))
      : allColumns;
  }, [statusMode, tasks]);

  async function saveTaskUpdate(taskId: string, updates: Record<string, unknown>) {
    setMovingTaskId(taskId);
    setTasksError(null);
    const { data, error } = await supabase.functions.invoke("manage-client-task", {
      body: {
        companyGlideId: companyId,
        action: "update",
        taskId,
        ...updates,
      },
    });
    setMovingTaskId(null);
    if (error || data?.error) {
      setTasksError(error?.message ?? data?.error ?? "Failed to update task");
      return null;
    }
    if (!data?.task) return null;
    const updatedTask = data.task as TaskRow;
    setTasks((current) =>
      [
        ...current.map((task) =>
          task.glide_row_id === updatedTask.glide_row_id ? updatedTask : task,
        ),
        ...(data.nextTask ? [data.nextTask as TaskRow] : []),
      ],
    );
    setSelectedTask((current) =>
      current?.glide_row_id === updatedTask.glide_row_id ? updatedTask : current,
    );
    return updatedTask;
  }

  function handleDragStart(event: DragEvent<HTMLElement>, task: TaskRow) {
    dragHandledRef.current = false;
    setDraggingTaskId(task.glide_row_id);
    event.dataTransfer.setData("text/plain", task.glide_row_id);
    event.dataTransfer.effectAllowed = "move";
  }

  async function moveTaskToStatus(taskId: string, status: TaskStatus) {
    if (!taskId || !canManageTasks) return;
    const task = tasks.find((row) => row.glide_row_id === taskId);
    if (!task || taskStatusKey(task.status_value) === status) return;
    const previousTasks = tasks;
    setTasks((current) =>
      current.map((row) =>
        row.glide_row_id === taskId ? { ...row, status_value: status } : row,
      ),
    );
    const updated = await saveTaskUpdate(taskId, { statusValue: status });
    if (!updated) setTasks(previousTasks);
  }

  async function handleDrop(event: DragEvent<HTMLElement>, status: TaskStatus) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/plain") || draggingTaskId;
    dragHandledRef.current = true;
    setDragOverStatus(null);
    setDraggingTaskId(null);
    if (!taskId) return;
    await moveTaskToStatus(taskId, status);
  }

  async function handleDragEnd(event: DragEvent<HTMLElement>) {
    if (dragHandledRef.current) {
      dragHandledRef.current = false;
      return;
    }
    const taskId = draggingTaskId;
    setDragOverStatus(null);
    setDraggingTaskId(null);
    if (!taskId || !canManageTasks) return;
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const target = element?.closest<HTMLElement>("[data-task-status]");
    const status = target?.dataset.taskStatus as TaskStatus | undefined;
    if (!status || !ALLOWED_TASK_STATUS_VALUES.has(status)) return;
    await moveTaskToStatus(taskId, status);
  }

  const overdueCount = tasks.filter(isOverdue).length;
  const dueSoonCount = tasks.filter(isDueSoon).length;
  const selectedCompanyName =
    companies.find((company) => company.glide_row_id === companyId)?.name ??
    "No company selected";

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Tasks</h1>
          <p className="mt-1 text-sm text-gray-500">
            {isUsingAppTasks
              ? "RetainOS task data for this company."
              : "Read-only task view mirrored from CST into RetainOS."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNewTaskOpen(true)}
          disabled={!canManageTasks}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
        >
          New Task
        </button>
      </div>

      <div className="mb-5 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {!capabilities.canViewOnlyAssignedClients && (
            <div>
              <label
                htmlFor="tasks-csm"
                className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                View As
              </label>
              <select
                id="tasks-csm"
                value={csmId}
                onChange={(event) => setCsmId(event.target.value)}
                disabled={!companyId || loadingTeam}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="">
                  {loadingTeam ? "Loading CSMs..." : "All CSMs"}
                </option>
                {availableTeamMembers.map((member) => (
                  <option key={member.glide_row_id} value={member.glide_row_id}>
                    {member.name ?? "(unnamed)"}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label
              htmlFor="tasks-status"
              className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500"
            >
              Status
            </label>
            <select
              id="tasks-status"
              value={statusMode}
              onChange={(event) => setStatusMode(event.target.value as StatusMode)}
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="open">Open tasks</option>
              <option value="all">All tasks</option>
              <option value="closed">Closed tasks</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="tasks-search"
              className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500"
            >
              Search
            </label>
            <input
              id="tasks-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Task name or notes"
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <div className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
              View
            </div>
            <div className="inline-flex w-full rounded-md border border-gray-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setViewMode("board")}
                className={`flex-1 rounded px-3 py-1.5 text-sm font-medium cursor-pointer ${viewMode === "board" ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
              >
                Board
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`flex-1 rounded px-3 py-1.5 text-sm font-medium cursor-pointer ${viewMode === "list" ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
              >
                List
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-xs uppercase tracking-wider text-gray-500">
            Company
          </div>
          <div className="mt-1 text-sm font-semibold text-gray-900">
            {selectedCompanyName}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-xs uppercase tracking-wider text-gray-500">
            Visible Tasks
          </div>
          <div className="mt-1 text-sm font-semibold text-gray-900">
            {loadingTasks ? "Loading..." : tasks.length.toLocaleString()}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-xs uppercase tracking-wider text-gray-500">
            Overdue
          </div>
          <div className="mt-1 text-sm font-semibold text-gray-900">
            {overdueCount.toLocaleString()}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-xs uppercase tracking-wider text-gray-500">
            Due Soon
          </div>
          <div className="mt-1 text-sm font-semibold text-gray-900">
            {dueSoonCount.toLocaleString()}
          </div>
        </div>
      </div>

      {!companyId ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
          Select a company to load tasks.
        </div>
      ) : tasksError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {tasksError}
        </div>
      ) : loadingTasks ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-indigo-600" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
          No tasks matched this view.
        </div>
      ) : viewMode === "list" ? (
        <div className="space-y-4">
          {columns.map((column) => (
            <section
              key={column.key}
              data-task-status={column.key}
              onDragOver={(event) => {
                if (!canManageTasks) return;
                event.preventDefault();
                setDragOverStatus(column.key as TaskStatus);
              }}
              onDragLeave={() => setDragOverStatus(null)}
              onDrop={(event) => void handleDrop(event, column.key as TaskStatus)}
              className={`rounded-lg border transition ${
                dragOverStatus === column.key
                  ? "border-indigo-300 bg-indigo-50"
                  : statusSurfaceClasses(column.key)
              }`}
            >
              <div
                className={`flex items-center justify-between border-b px-4 py-3 ${statusHeaderClasses(
                  column.key,
                )}`}
              >
                <h2 className="text-sm font-semibold">
                  {column.label}
                </h2>
                <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-600">
                  {column.tasks.length}
                </span>
              </div>
              {column.tasks.length === 0 ? (
                <div className="px-4 py-6 text-sm text-gray-500">
                  No tasks in this status.
                </div>
              ) : (
                <TaskListTable
                  tasks={column.tasks}
                  clientById={clientById}
                  teamMemberNameById={teamMemberNameById}
                  canManage={canManageTasks}
                  movingTaskId={movingTaskId}
                  onOpenTask={(task) => {
                    if (canManageTasks) setSelectedTask(task);
                  }}
                  onDragStart={(event, task) => handleDragStart(event, task)}
                  onDragEnd={(event) => void handleDragEnd(event)}
                />
              )}
            </section>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
          {columns.map((column) => (
            <section
              key={column.key}
              data-task-status={column.key}
              onDragOver={(event) => {
                if (!canManageTasks) return;
                event.preventDefault();
                setDragOverStatus(column.key as TaskStatus);
              }}
              onDragLeave={() => setDragOverStatus(null)}
              onDrop={(event) => void handleDrop(event, column.key as TaskStatus)}
              className={`min-h-80 rounded-lg border transition ${
                dragOverStatus === column.key
                  ? "border-indigo-300 bg-indigo-50"
                  : statusSurfaceClasses(column.key)
              }`}
            >
              <div
                className={`flex items-center justify-between border-b px-4 py-3 ${statusHeaderClasses(
                  column.key,
                )}`}
              >
                <h2 className="text-sm font-semibold">
                  {column.label}
                </h2>
                <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-600">
                  {column.tasks.length}
                </span>
              </div>
              <div className="space-y-3 p-3">
                {column.tasks.map((task) => (
                  <TaskCard
                    key={task.glide_row_id}
                    task={task}
                    client={
                      task.client_id ? clientById.get(task.client_id) : undefined
                    }
                    teamMemberNameById={teamMemberNameById}
                    canManage={canManageTasks}
                    isMoving={movingTaskId === task.glide_row_id}
                    onClick={() => {
                      if (canManageTasks) setSelectedTask(task);
                    }}
                    onDragStart={(event) => handleDragStart(event, task)}
                    onDragEnd={(event) => void handleDragEnd(event)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {!isUsingAppTasks ? (
        <div className="mt-6">
          <ComingSoonPanel
            compact
            title="Read-only mirrored tasks"
            description="Task updates are available after this company is migrated into RetainOS app-owned task data."
          />
        </div>
      ) : null}
      {newTaskOpen ? (
        <NewTaskModal
          companyId={companyId}
          clients={companyClients}
          teamMembers={teamMembers}
          taskTemplates={taskTemplates}
          assignedTeamMemberId={assignedTeamMemberId}
          onClose={() => setNewTaskOpen(false)}
          onSaved={(task) => {
            setTasks((current) => [task, ...current]);
            if (task.client_id && !clientById.has(task.client_id)) {
              const client = companyClients.find(
                (row) => row.glide_row_id === task.client_id,
              );
              if (client) {
                setClientById((current) => {
                  const next = new Map(current);
                  next.set(client.glide_row_id, client);
                  return next;
                });
              }
            }
          }}
        />
      ) : null}
      {selectedTask ? (
        <NewTaskModal
          companyId={companyId}
          task={selectedTask}
          clients={companyClients}
          teamMembers={teamMembers}
          taskTemplates={taskTemplates}
          assignedTeamMemberId={assignedTeamMemberId}
          onClose={() => setSelectedTask(null)}
          onSaved={(task) => {
            setTasks((current) =>
              current.map((row) =>
                row.glide_row_id === task.glide_row_id ? task : row,
              ),
            );
          }}
        />
      ) : null}
    </div>
  );
}
