import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ProgramStatusPill } from "../lib/clientDisplay.tsx";
import { useAccountContext } from "../lib/accountContext.tsx";
import { supabase } from "../lib/supabase.ts";

type ViewMode = "board" | "list";
type StatusMode = "open" | "all" | "closed";

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
}

const TASKS_CACHE_KEY = "cst.tasksPageState.v1";

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
  const status = displayValue(task.status_value).toLowerCase();
  return (
    status === "done" ||
    status === "complete" ||
    status === "completed" ||
    isPresent(task.completion_date) ||
    task.is_manually_archived === true
  );
}

function isOverdue(task: TaskRow) {
  if (isClosedTask(task) || !task.task_due_date) return false;
  const due = new Date(task.task_due_date);
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < Date.now();
}

function statusClasses(status: unknown) {
  const key = displayValue(status).toLowerCase();
  if (key === "done" || key === "complete" || key === "completed")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (key === "in-progress" || key === "in progress")
    return "border-blue-200 bg-blue-50 text-blue-700";
  if (key === "todo" || key === "to do")
    return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-gray-200 bg-gray-50 text-gray-600";
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
}: {
  task: TaskRow;
  client: ClientRow | undefined;
  teamMemberNameById: Map<string, string>;
}) {
  const assignedTo = task.assigned_to_id
    ? (teamMemberNameById.get(task.assigned_to_id) ?? task.assigned_to_id)
    : "Unassigned";

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">
            {displayValue(task.task_name)}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusClasses(task.status_value)}`}
            >
              {displayValue(task.status_value)}
            </span>
            {isPresent(task.priority) && (
              <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700">
                {displayValue(task.priority)}
              </span>
            )}
            {isOverdue(task) && (
              <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                Overdue
              </span>
            )}
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
}: {
  tasks: TaskRow[];
  clientById: Map<string, ClientRow>;
  teamMemberNameById: Map<string, string>;
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
            return (
              <tr key={task.glide_row_id}>
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
                    {displayValue(task.status_value)}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {displayValue(task.priority)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {formatDate(task.task_due_date)}
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
  clients,
  teamMembers,
  assignedTeamMemberId,
  onClose,
  onCreated,
}: {
  companyId: string;
  clients: ClientRow[];
  teamMembers: TeamMember[];
  assignedTeamMemberId: string;
  onClose: () => void;
  onCreated: (task: TaskRow) => void;
}) {
  const [taskName, setTaskName] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [clientId, setClientId] = useState("");
  const [assignedToId, setAssignedToId] = useState(assignedTeamMemberId);
  const [taskDueDate, setTaskDueDate] = useState("");
  const [priority, setPriority] = useState("");
  const [statusValue, setStatusValue] = useState("todo");
  const [externalLink, setExternalLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const availableTeamMembers = teamMembers.filter(
    (member) =>
      member.is_archived !== true && member.role_hide_from_csm_list !== true,
  );

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
          taskName,
          taskDescription,
          clientId,
          assignedToId,
          taskDueDate,
          priority,
          statusValue,
          externalLink,
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
      onCreated(data.task as TaskRow);
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
            <h2 className="text-lg font-semibold text-gray-900">New Task</h2>
            <p className="mt-1 text-sm text-gray-500">
              Creates a RetainOS pilot task. Glide mirror tasks stay unchanged.
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
                onChange={(event) => setStatusValue(event.target.value)}
                disabled={saving}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
              >
                <option value="todo">To Do</option>
                <option value="in-progress">In Progress</option>
                <option value="done">Done</option>
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
              {saving ? "Creating..." : "Create Task"}
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
    setViewAsCompanyId,
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
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);

  const assignedTeamMemberId = capabilities.canViewOnlyAssignedClients
    ? teamMemberId
    : "";
  const canUseCompanySwitcher = capabilities.canUseCompanySwitcher;
  const isUsingAppTasks = appTaskCompanyIds.has(companyId);
  const canCreateTask = capabilities.canAccessTasks && Boolean(companyId);

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
          .select("legacy_glide_row_id, migration_status")
          .in("migration_status", ["pilot", "migrated"]),
      ]);
      const { data, error } = backupCompaniesResult;
      if (error) console.error("Failed to load companies:", error);
      if (appCompaniesResult.error)
        console.error("Failed to load app companies:", appCompaniesResult.error);
      setCompanies((data ?? []) as Company[]);
      setAppTaskCompanyIds(
        new Set(
          (appCompaniesResult.data ?? [])
            .map((company) => company.legacy_glide_row_id)
            .filter((id): id is string => typeof id === "string" && id !== ""),
        ),
      );
      setLoadingCompanies(false);
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
      const { data, error } = await supabase
        .from("backup_company_team")
        .select("glide_row_id, name, is_archived, role_hide_from_csm_list")
        .eq("company_id", companyId)
        .order("name", { ascending: true });
      if (cancelled) return;
      if (error) console.error("Failed to load team members:", error);
      const rows = (data ?? []) as TeamMember[];
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
  }, [assignedTeamMemberId, companyId, csmId]);

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
        .select("glide_row_id, client_name, client_image, program_status_value")
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
    if (!companyId) {
      setTasks([]);
      setClientById(new Map());
      return;
    }
    let cancelled = false;
    async function loadTasks() {
      setLoadingTasks(true);
      setTasksError(null);
      let backupQuery = supabase
        .from("backup_company_clients_tasks")
        .select("*")
        .eq("company_id", companyId);

      let appQuery = supabase
        .from("client_tasks")
        .select("*")
        .eq("company_glide_row_id", companyId);

      if (assignedTeamMemberId) {
        backupQuery = backupQuery.eq("assigned_to_id", assignedTeamMemberId);
        appQuery = appQuery.eq("assigned_to_id", assignedTeamMemberId);
      } else if (csmId) {
        backupQuery = backupQuery.eq("assigned_to_id", csmId);
        appQuery = appQuery.eq("assigned_to_id", csmId);
      }
      if (search.trim()) {
        const q = `%${search.trim()}%`;
        backupQuery = backupQuery.or(
          `task_name.ilike.${q},task_description.ilike.${q}`,
        );
        appQuery = appQuery.or(`task_name.ilike.${q},task_description.ilike.${q}`);
      }
      backupQuery = backupQuery.order("task_due_date", {
        ascending: true,
        nullsFirst: false,
      });
      appQuery = appQuery.order("task_due_date", {
        ascending: true,
        nullsFirst: false,
      });

      const [backupResult, appResult] = await Promise.all([
        backupQuery.limit(250),
        appTaskCompanyIds.has(companyId)
          ? appQuery.limit(250)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (cancelled) return;
      if (backupResult.error || appResult.error) {
        setTasks([]);
        setClientById(new Map());
        setTasksError(
          backupResult.error?.message ??
            appResult.error?.message ??
            "Failed to load tasks",
        );
        setLoadingTasks(false);
        return;
      }

      let rows = [
        ...((appResult.data ?? []) as TaskRow[]),
        ...((backupResult.data ?? []) as TaskRow[]),
      ];
      if (statusMode === "open") rows = rows.filter((task) => !isClosedTask(task));
      if (statusMode === "closed") rows = rows.filter(isClosedTask);
      setTasks(rows);

      const clientIds = [
        ...new Set(rows.map((task) => task.client_id).filter(Boolean)),
      ] as string[];
      if (clientIds.length > 0) {
        const [backupClientsResult, appClientsResult] = await Promise.all([
          supabase
            .from("backup_company_clients")
            .select("glide_row_id, client_name, client_image, program_status_value")
            .in("glide_row_id", clientIds),
          appTaskCompanyIds.has(companyId)
            ? supabase
                .from("clients")
                .select("glide_row_id, client_name, client_image, program_status_value")
                .in("glide_row_id", clientIds)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (!cancelled) {
          if (backupClientsResult.error)
            console.error("Failed to load backup task clients:", backupClientsResult.error);
          if (appClientsResult.error)
            console.error("Failed to load app task clients:", appClientsResult.error);
          const clients = [
            ...((backupClientsResult.data ?? []) as ClientRow[]),
            ...((appClientsResult.data ?? []) as ClientRow[]),
          ];
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
    const todo = tasks.filter(
      (task) => displayValue(task.status_value).toLowerCase() === "todo",
    );
    const inProgress = tasks.filter((task) =>
      ["in-progress", "in progress"].includes(
        displayValue(task.status_value).toLowerCase(),
      ),
    );
    const done = tasks.filter(isClosedTask);
    const other = tasks.filter(
      (task) =>
        !todo.includes(task) && !inProgress.includes(task) && !done.includes(task),
    );
    return [
      { key: "todo", label: "To Do", tasks: todo },
      { key: "in-progress", label: "In Progress", tasks: inProgress },
      { key: "done", label: "Done", tasks: done },
      { key: "other", label: "Other", tasks: other },
    ].filter((column) => column.tasks.length > 0 || column.key !== "other");
  }, [tasks]);

  const overdueCount = tasks.filter(isOverdue).length;
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
              ? "RetainOS pilot tasks plus mirrored Glide tasks for this company."
              : "Read-only task view mirrored from Glide into Supabase."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNewTaskOpen(true)}
          disabled={!canCreateTask}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
        >
          New Task
        </button>
      </div>

      <div className="mb-5 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
          <div>
            <label
              htmlFor="tasks-company"
              className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500"
            >
              Company
            </label>
            <select
              id="tasks-company"
              value={companyId}
              onChange={(event) => {
                if (canUseCompanySwitcher) setViewAsCompanyId(event.target.value);
                setCompanyId(event.target.value);
                setCsmId(assignedTeamMemberId);
              }}
              disabled={loadingCompanies || !canUseCompanySwitcher}
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">
                {loadingCompanies ? "Loading companies..." : "Select company"}
              </option>
              {companies.map((company) => (
                <option key={company.glide_row_id} value={company.glide_row_id}>
                  {company.name ?? "(unnamed)"}
                </option>
              ))}
            </select>
          </div>

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

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
        <TaskListTable
          tasks={tasks}
          clientById={clientById}
          teamMemberNameById={teamMemberNameById}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {columns.map((column) => (
            <section
              key={column.key}
              className="min-h-80 rounded-lg border border-gray-200 bg-gray-50"
            >
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-800">
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
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {newTaskOpen ? (
        <NewTaskModal
          companyId={companyId}
          clients={companyClients}
          teamMembers={teamMembers}
          assignedTeamMemberId={assignedTeamMemberId}
          onClose={() => setNewTaskOpen(false)}
          onCreated={(task) => {
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
    </div>
  );
}
