import { useEffect, useMemo, useState } from "react";
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

export function Tasks() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { viewAsCompanyId, setViewAsCompanyId } = useAccountContext();
  const cached = useMemo(() => readTasksCache(), []);
  const [companyId, setCompanyId] = useState(
    searchParams.get("companyId") ?? cached?.companyId ?? viewAsCompanyId,
  );
  const [csmId, setCsmId] = useState(
    searchParams.get("csmId") ?? cached?.csmId ?? "",
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
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [clientById, setClientById] = useState(new Map<string, ClientRow>());
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);

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
    if (!viewAsCompanyId || viewAsCompanyId === companyId) return;
    setCompanyId(viewAsCompanyId);
    setCsmId("");
  }, [companyId, viewAsCompanyId]);

  useEffect(() => {
    async function loadCompanies() {
      const { data, error } = await supabase
        .from("backup_companies")
        .select("glide_row_id, name")
        .or("archived.is.null,archived.eq.false")
        .order("name", { ascending: true });
      if (error) console.error("Failed to load companies:", error);
      setCompanies((data ?? []) as Company[]);
      setLoadingCompanies(false);
    }
    void loadCompanies();
  }, []);

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
      if (csmId && !rows.some((member) => member.glide_row_id === csmId)) {
        setCsmId("");
      }
      setLoadingTeam(false);
    }
    void loadTeam();
    return () => {
      cancelled = true;
    };
  }, [companyId, csmId]);

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
      let query = supabase
        .from("backup_company_clients_tasks")
        .select("*")
        .eq("company_id", companyId);

      if (csmId) query = query.eq("assigned_to_id", csmId);
      if (search.trim()) {
        const q = `%${search.trim()}%`;
        query = query.or(`task_name.ilike.${q},task_description.ilike.${q}`);
      }
      query = query.order("task_due_date", {
        ascending: true,
        nullsFirst: false,
      });

      const { data, error } = await query.limit(250);
      if (cancelled) return;
      if (error) {
        setTasks([]);
        setClientById(new Map());
        setTasksError(error.message);
        setLoadingTasks(false);
        return;
      }

      let rows = (data ?? []) as TaskRow[];
      if (statusMode === "open") rows = rows.filter((task) => !isClosedTask(task));
      if (statusMode === "closed") rows = rows.filter(isClosedTask);
      setTasks(rows);

      const clientIds = [
        ...new Set(rows.map((task) => task.client_id).filter(Boolean)),
      ] as string[];
      if (clientIds.length > 0) {
        const { data: clients, error: clientsError } = await supabase
          .from("backup_company_clients")
          .select("glide_row_id, client_name, client_image, program_status_value")
          .in("glide_row_id", clientIds);
        if (!cancelled) {
          if (clientsError) console.error("Failed to load task clients:", clientsError);
          setClientById(
            new Map(
              ((clients ?? []) as ClientRow[]).map((client) => [
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
  }, [companyId, csmId, search, statusMode]);

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
            View client tasks by company and CSM.
          </p>
        </div>
        <button
          type="button"
          disabled
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white opacity-50"
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
                setViewAsCompanyId(event.target.value);
                setCompanyId(event.target.value);
                setCsmId("");
              }}
              disabled={loadingCompanies}
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
    </div>
  );
}
