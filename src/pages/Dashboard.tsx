import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase.ts";

const MONTH_OPTIONS_COUNT = 25;

const COMPANY_QUERY_KEY = "companyId";
const CSM_QUERY_KEY = "csmId";
const SECONDARY_ASSIGNEE_QUERY_KEY = "secondaryAssigneeId";
const PROGRAM_QUERY_KEY = "program";
const DETAIL_PAGE_SIZE = 25;

type KpiDetailKey = "active" | "front-end" | "back-end";

interface Company {
  glide_row_id: string;
  name: string | null;
  enable_secondary_assignee: boolean | null;
  program_paused_override: string | null;
  program_suspended_override: string | null;
}

interface TeamMember {
  glide_row_id: string;
  name: string | null;
  is_archived: boolean | null;
  role_hide_from_csm_list: boolean | null;
}

interface ProgramChoice {
  program_value: string | null;
  program_label: string | null;
  program_emoji: string | null;
}

interface ClientRow {
  glide_row_id: string;
  client_name: string | null;
  client_image: string | null;
  csm_team_member_id: string | null;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function getMonthKeyFromDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function getMonthBoundsFromKey(monthKey: string) {
  const [ys, ms] = monthKey.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const start = `${y}-${pad2(m)}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${pad2(m)}-${pad2(lastDay)}`;
  return { start, end };
}

function formatMonthLabel(monthKey: string) {
  const [ys, ms] = monthKey.split("-");
  const y = Number(ys);
  const m = Number(ms);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function listMonthOptionsDescending() {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < MONTH_OPTIONS_COUNT; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = getMonthKeyFromDate(d);
    out.push({ value: key, label: formatMonthLabel(key) });
  }
  return out;
}

function getNextDateIso(dateIso: string) {
  const d = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

interface MonthDateFilterState {
  monthKey: string | null;
  startDate: string;
  endDate: string;
  dropdownOpen: boolean;
  search: string;
  editingCustom: boolean;
}

function clearedMonthDateFilter(): MonthDateFilterState {
  return {
    monthKey: null,
    startDate: "",
    endDate: "",
    dropdownOpen: false,
    search: "",
    editingCustom: false,
  };
}

interface MonthDateRangeFilterProps {
  label: string;
  state: MonthDateFilterState;
  onChange: Dispatch<SetStateAction<MonthDateFilterState>>;
}

function MonthDateRangeFilter({ label, state, onChange }: MonthDateRangeFilterProps) {
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const monthOptions = useMemo(() => listMonthOptionsDescending(), []);

  const filteredMonths = useMemo(() => {
    const q = state.search.trim().toLowerCase();
    if (!q) return monthOptions;
    return monthOptions.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [monthOptions, state.search]);

  useEffect(() => {
    if (!state.dropdownOpen) return;

    function handlePointerDown(event: MouseEvent) {
      const el = rootRef.current;
      if (!el || !(event.target instanceof Node) || el.contains(event.target)) return;
      onChange((prev) => ({ ...prev, dropdownOpen: false }));
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [onChange, state.dropdownOpen]);

  const summaryText =
    state.monthKey !== null ? formatMonthLabel(state.monthKey) : "—";

  const pickMonth = (value: string | null) => {
    if (value === null || value === "") {
      onChange(clearedMonthDateFilter());
      return;
    }
    const { start, end } = getMonthBoundsFromKey(value);
    onChange((prev) => ({
      ...prev,
      monthKey: value,
      startDate: start,
      endDate: end,
      dropdownOpen: false,
      search: "",
      editingCustom: false,
    }));
  };

  return (
    <div ref={rootRef} className="relative">
      <label
        htmlFor={`${baseId}-trigger`}
        className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1"
      >
        {label}
      </label>

      {!state.editingCustom && (
        <div className="flex items-center gap-1">
          <button
            id={`${baseId}-trigger`}
            type="button"
            onClick={() =>
              onChange((prev) => ({
                ...prev,
                dropdownOpen: !prev.dropdownOpen,
              }))
            }
            className="min-w-0 flex-1 flex items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-900 hover:border-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <span className="truncate">{summaryText}</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4 shrink-0 text-gray-400"
            >
              <path
                fillRule="evenodd"
                d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          {state.monthKey !== null && (
            <>
              <button
                type="button"
                title="Edit custom dates"
                onClick={() =>
                  onChange((prev) => ({
                    ...prev,
                    editingCustom: true,
                    dropdownOpen: false,
                  }))
                }
                className="shrink-0 rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 hover:text-gray-800 cursor-pointer transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4"
                >
                  <path d="M2.695 14.295a1 1 0 0 0-.26.465l-.8 3.2a1 1 0 0 0 1.215 1.215l3.2-.8a1 1 0 0 0 .465-.26l6.3-6.3-4.242-4.242-6.3 6.3ZM12.42 4.57a1 1 0 0 0 0 1.415l1.414 1.414a1 1 0 0 0 1.415 0l.879-.879a1 1 0 0 0 0-1.414l-1.88-1.88a1 1 0 0 0-1.414 0l-.88.88Z" />
                </svg>
              </button>
              <button
                type="button"
                title="Clear"
                onClick={() => onChange(clearedMonthDateFilter())}
                className="shrink-0 rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 hover:text-gray-800 cursor-pointer transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4"
                >
                  <path d="M4.22 4.22a.75.75 0 0 1 1.06 0L10 8.94l4.72-4.72a.75.75 0 1 1 1.06 1.06L11.06 10l4.72 4.72a.75.75 0 1 1-1.06 1.06L10 11.06l-4.72 4.72a.75.75 0 1 1-1.06-1.06L8.94 10 4.22 5.28a.75.75 0 0 1 0-1.06Z" />
                </svg>
              </button>
            </>
          )}
        </div>
      )}

      {state.dropdownOpen && !state.editingCustom && (
        <div className="absolute z-40 mt-1 w-full min-w-[240px] rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 p-2">
            <div className="relative">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              >
                <path
                  fillRule="evenodd"
                  d="M9 3.5a5.5 5.5 0 1 0 3.473 9.765l2.63 2.631a.75.75 0 1 0 1.06-1.06l-2.63-2.632A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"
                  clipRule="evenodd"
                />
              </svg>
              <input
                type="search"
                value={state.search}
                onChange={(e) =>
                  onChange((prev) => ({ ...prev, search: e.target.value }))
                }
                placeholder="Search"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => pickMonth(null)}
              className={`flex w-full items-center px-3 py-2 text-left text-sm hover:bg-gray-50 cursor-pointer ${
                state.monthKey === null ? "bg-gray-100" : ""
              }`}
            >
              —
            </button>
            {filteredMonths.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => pickMonth(opt.value)}
                className={`flex w-full items-center px-3 py-2 text-left text-sm hover:bg-gray-50 cursor-pointer ${
                  state.monthKey === opt.value ? "bg-gray-100" : ""
                }`}
              >
                {opt.label}
              </button>
            ))}
            {filteredMonths.length === 0 && (
              <div className="px-3 py-4 text-center text-sm text-gray-500">
                No matches
              </div>
            )}
          </div>
        </div>
      )}

      {state.editingCustom && state.monthKey !== null && (
        <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-900">Custom Dates</div>
              <div className="mt-0.5 text-xs text-gray-500">
                Set a specific start and end date
              </div>
            </div>
            <button
              type="button"
              onClick={() => onChange((prev) => ({ ...prev, editingCustom: false }))}
              className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700 cursor-pointer"
              title="Close"
            >
              <span className="sr-only">Close custom dates</span>
              <span className="text-lg leading-none">−</span>
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <div>
              <label
                htmlFor={`${baseId}-start`}
                className="block text-xs font-medium text-gray-500 mb-1"
              >
                Start date
              </label>
              <input
                id={`${baseId}-start`}
                type="date"
                value={state.startDate}
                onChange={(e) =>
                  onChange((prev) => ({ ...prev, startDate: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label
                htmlFor={`${baseId}-end`}
                className="block text-xs font-medium text-gray-500 mb-1"
              >
                End date
              </label>
              <input
                id={`${baseId}-end`}
                type="date"
                value={state.endDate}
                onChange={(e) =>
                  onChange((prev) => ({ ...prev, endDate: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface KpiCardProps {
  label: string;
  value: string | number;
  description?: string;
  loading?: boolean;
  onClick?: () => void;
}

function getInitials(name: string | null) {
  if (!name) return "--";

  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "--";

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function KpiCard({ label, value, description, loading, onClick }: KpiCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          {label}
        </div>
        {onClick && (
          <span className="text-xs font-medium text-indigo-600">View list</span>
        )}
      </div>
      <div className="mt-2 text-3xl font-semibold text-gray-900 tabular-nums">
        {loading ? (
          <span className="inline-block h-8 w-20 rounded bg-gray-100 animate-pulse" />
        ) : (
          value
        )}
      </div>
      {description && (
        <div className="mt-1 text-sm text-gray-500">{description}</div>
      )}
    </>
  );

  if (!onClick) {
    return <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 text-left transition-all hover:border-indigo-300 hover:shadow-md cursor-pointer"
    >
      {content}
    </button>
  );
}

export function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCompanyId = searchParams.get(COMPANY_QUERY_KEY) ?? "";
  const selectedCsmId = searchParams.get(CSM_QUERY_KEY) ?? "";
  const selectedSecondaryAssigneeId =
    searchParams.get(SECONDARY_ASSIGNEE_QUERY_KEY) ?? "";
  const selectedProgram = searchParams.get(PROGRAM_QUERY_KEY) ?? "";

  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamMembersLoading, setTeamMembersLoading] = useState(false);
  const [baseProgramChoices, setBaseProgramChoices] = useState<ProgramChoice[]>([]);
  const [programChoicesLoading, setProgramChoicesLoading] = useState(false);

  const [activeClients, setActiveClients] = useState<number | null>(null);
  const [frontEndClients, setFrontEndClients] = useState<number | null>(null);
  const [backEndClients, setBackEndClients] = useState<number | null>(null);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [activeDetailKey, setActiveDetailKey] = useState<KpiDetailKey | null>(null);
  const [detailSearch, setDetailSearch] = useState("");
  const [detailPage, setDetailPage] = useState(1);
  const [detailRows, setDetailRows] = useState<ClientRow[]>([]);
  const [detailTotalCount, setDetailTotalCount] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);

  const [dateRangeFilter, setDateRangeFilter] = useState(clearedMonthDateFilter);
  const [clientStartDateFilter, setClientStartDateFilter] = useState(
    clearedMonthDateFilter,
  );

  const updateSearchParams = (updates: Record<string, string | null>) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);

        Object.entries(updates).forEach(([key, value]) => {
          if (value) next.set(key, value);
          else next.delete(key);
        });

        return next;
      },
      { replace: true },
    );
  };

  const clearAllFilters = () => {
    setSearchParams({}, { replace: true });
    setDateRangeFilter(clearedMonthDateFilter());
    setClientStartDateFilter(clearedMonthDateFilter());
  };

  const setSelectedCompanyId = (id: string) => {
    updateSearchParams({
      [COMPANY_QUERY_KEY]: id || null,
      [CSM_QUERY_KEY]: null,
      [SECONDARY_ASSIGNEE_QUERY_KEY]: null,
      ...(id ? {} : { [PROGRAM_QUERY_KEY]: null }),
    });
  };

  const selectedCompany = useMemo(
    () => companies.find((company) => company.glide_row_id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId],
  );

  const availableTeamMembers = useMemo(
    () =>
      teamMembers.filter(
        (member) =>
          member.is_archived !== true &&
          member.role_hide_from_csm_list !== true,
      ),
    [teamMembers],
  );

  const showCompanyScopedFilters = Boolean(selectedCompanyId);
  const showSecondaryAssigneeFilter =
    selectedCompany?.enable_secondary_assignee === true;

  const teamMemberNameById = useMemo(
    () =>
      new Map(
        teamMembers.map((member) => [member.glide_row_id, member.name ?? "Unassigned"]),
      ),
    [teamMembers],
  );

  const programChoices = useMemo(
    () =>
      baseProgramChoices
        .filter((choice) => choice.program_value)
        .map((choice) => {
          let displayLabel = choice.program_label ?? choice.program_value ?? "";

          if (
            choice.program_value === "paused" &&
            selectedCompany?.program_paused_override
          ) {
            displayLabel = selectedCompany.program_paused_override;
          }

          if (
            choice.program_value === "suspended" &&
            selectedCompany?.program_suspended_override
          ) {
            displayLabel = selectedCompany.program_suspended_override;
          }

          return {
            value: choice.program_value ?? "",
            label: choice.program_emoji
              ? `${choice.program_emoji} ${displayLabel}`
              : displayLabel,
          };
        }),
    [baseProgramChoices, selectedCompany],
  );

  const detailTitle = useMemo(() => {
    if (activeDetailKey === "active") return "Active Clients";
    if (activeDetailKey === "front-end") return "Front-end Clients";
    if (activeDetailKey === "back-end") return "Back-end Clients";
    return "";
  }, [activeDetailKey]);

  const detailPageCount = Math.max(1, Math.ceil(detailTotalCount / DETAIL_PAGE_SIZE));
  const detailStart = detailTotalCount === 0 ? 0 : (detailPage - 1) * DETAIL_PAGE_SIZE + 1;
  const detailEnd = Math.min(detailPage * DETAIL_PAGE_SIZE, detailTotalCount);

  const openDetailDrawer = (key: KpiDetailKey) => {
    setActiveDetailKey(key);
    setDetailSearch("");
    setDetailPage(1);
  };

  const closeDetailDrawer = () => {
    setActiveDetailKey(null);
    setDetailSearch("");
    setDetailPage(1);
  };

  const buildClientQuery = (
    programFilter: KpiDetailKey | string[],
    options?: {
      includeRows?: boolean;
      search?: string;
      page?: number;
      pageSize?: number;
    },
  ) => {
    const includeRows = options?.includeRows ?? false;

    let query = supabase
      .from("backup_company_clients")
      .select(
        includeRows
          ? "glide_row_id,client_name,client_image,csm_team_member_id"
          : "*",
        { count: "exact", head: !includeRows },
      )
      .eq("company_id", selectedCompanyId);

    if (selectedCsmId) {
      query = query.eq("csm_team_member_id", selectedCsmId);
    }

    if (showSecondaryAssigneeFilter && selectedSecondaryAssigneeId) {
      query = query.eq("csm_secondary_assignee_id", selectedSecondaryAssigneeId);
    }

    if (selectedProgram) {
      query = query.eq("program_status_value", selectedProgram);
    }

    if (clientStartDateFilter.startDate) {
      query = query.gte(
        "client_age_date_onboarded",
        `${clientStartDateFilter.startDate}T00:00:00`,
      );
    }

    if (clientStartDateFilter.endDate) {
      const endExclusive = getNextDateIso(clientStartDateFilter.endDate);
      if (endExclusive) {
        query = query.lt("client_age_date_onboarded", `${endExclusive}T00:00:00`);
      }
    }

    // Date Range contributes an additional cutoff filter:
    // keep clients onboarded before the selected range end date.
    if (dateRangeFilter.endDate) {
      query = query.lt(
        "client_age_date_onboarded",
        `${dateRangeFilter.endDate}T00:00:00`,
      );
    }

    if (Array.isArray(programFilter)) {
      query = query.in("program_status_value", programFilter);
    } else if (programFilter === "active") {
      query = query.in("program_status_value", ["front-end", "back-end"]);
    } else {
      query = query.eq("program_status_value", programFilter);
    }

    const search = options?.search?.trim();
    if (search) {
      query = query.ilike("client_name", `%${search}%`);
    }

    if (includeRows) {
      const page = options?.page ?? 1;
      const pageSize = options?.pageSize ?? DETAIL_PAGE_SIZE;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      query = query.order("client_name", { ascending: true }).range(from, to);
    }

    return query;
  };

  useEffect(() => {
    async function loadCompanies() {
      const { data, error } = await supabase
        .from("backup_companies")
        .select(
          "glide_row_id, name, enable_secondary_assignee, program_paused_override, program_suspended_override",
        )
        .or("archived.is.null,archived.eq.false")
        .order("name", { ascending: true });

      if (error) {
        console.error("Failed to load companies:", error);
        setCompanies([]);
      } else {
        setCompanies((data ?? []) as Company[]);
      }

      setCompaniesLoading(false);
    }

    loadCompanies();
  }, []);

  useEffect(() => {
    if (!selectedCompanyId) {
      setTeamMembers([]);
      setTeamMembersLoading(false);
      return;
    }

    let cancelled = false;

    async function loadTeamMembers() {
      setTeamMembersLoading(true);

      const { data, error } = await supabase
        .from("backup_company_team")
        .select("glide_row_id, name, is_archived, role_hide_from_csm_list")
        .eq("company_id", selectedCompanyId)
        .order("name", { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error("Failed to load team members:", error);
        setTeamMembers([]);
      } else {
        setTeamMembers((data ?? []) as TeamMember[]);
      }

      setTeamMembersLoading(false);
    }

    loadTeamMembers();

    return () => {
      cancelled = true;
    };
  }, [selectedCompanyId]);

  useEffect(() => {
    if (!selectedCompanyId || baseProgramChoices.length > 0) return;

    let cancelled = false;

    async function loadProgramChoices() {
      setProgramChoicesLoading(true);

      const { data, error } = await supabase
        .from("backup_choices")
        .select("program_value, program_label, program_emoji")
        .not("program_value", "is", null)
        .order("index", { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error("Failed to load program choices:", error);
        setBaseProgramChoices([]);
      } else {
        setBaseProgramChoices((data ?? []) as ProgramChoice[]);
      }

      setProgramChoicesLoading(false);
    }

    loadProgramChoices();

    return () => {
      cancelled = true;
    };
  }, [baseProgramChoices.length, selectedCompanyId]);

  useEffect(() => {
    if (companiesLoading || !selectedCompanyId) return;

    const validCompany = companies.some(
      (company) => company.glide_row_id === selectedCompanyId,
    );

    if (!validCompany) {
      updateSearchParams({
        [COMPANY_QUERY_KEY]: null,
        [CSM_QUERY_KEY]: null,
        [SECONDARY_ASSIGNEE_QUERY_KEY]: null,
        [PROGRAM_QUERY_KEY]: null,
      });
    }
  }, [companies, companiesLoading, selectedCompanyId]);

  useEffect(() => {
    if (!selectedCsmId) return;

    const isValidCsm = availableTeamMembers.some(
      (member) => member.glide_row_id === selectedCsmId,
    );

    if (!isValidCsm) {
      updateSearchParams({ [CSM_QUERY_KEY]: null });
    }
  }, [availableTeamMembers, selectedCsmId]);

  useEffect(() => {
    if (!selectedSecondaryAssigneeId) return;

    if (!showSecondaryAssigneeFilter) {
      updateSearchParams({ [SECONDARY_ASSIGNEE_QUERY_KEY]: null });
      return;
    }

    const isValidSecondaryAssignee = availableTeamMembers.some(
      (member) => member.glide_row_id === selectedSecondaryAssigneeId,
    );

    if (!isValidSecondaryAssignee) {
      updateSearchParams({ [SECONDARY_ASSIGNEE_QUERY_KEY]: null });
    }
  }, [
    availableTeamMembers,
    selectedSecondaryAssigneeId,
    showSecondaryAssigneeFilter,
  ]);

  useEffect(() => {
    if (!selectedProgram) return;

    const isValidProgram = programChoices.some(
      (choice) => choice.value === selectedProgram,
    );

    if (!isValidProgram) {
      updateSearchParams({ [PROGRAM_QUERY_KEY]: null });
    }
  }, [programChoices, selectedProgram]);

  useEffect(() => {
    if (!selectedCompanyId) {
      setActiveClients(null);
      setFrontEndClients(null);
      setBackEndClients(null);
      closeDetailDrawer();
      return;
    }

    let cancelled = false;

    async function loadKpis() {
      setKpiLoading(true);

      const [activeRes, frontRes, backRes] = await Promise.all([
        buildClientQuery("active"),
        buildClientQuery("front-end"),
        buildClientQuery("back-end"),
      ]);

      if (cancelled) return;

      if (activeRes.error) {
        console.error("Failed to load active clients:", activeRes.error);
        setActiveClients(null);
      } else {
        setActiveClients(activeRes.count ?? 0);
      }

      if (frontRes.error) {
        console.error("Failed to load front-end clients:", frontRes.error);
        setFrontEndClients(null);
      } else {
        setFrontEndClients(frontRes.count ?? 0);
      }

      if (backRes.error) {
        console.error("Failed to load back-end clients:", backRes.error);
        setBackEndClients(null);
      } else {
        setBackEndClients(backRes.count ?? 0);
      }

      setKpiLoading(false);
    }

    loadKpis();

    return () => {
      cancelled = true;
    };
  }, [
    selectedCompanyId,
    selectedCsmId,
    selectedProgram,
    selectedSecondaryAssigneeId,
    showSecondaryAssigneeFilter,
    clientStartDateFilter.startDate,
    clientStartDateFilter.endDate,
    dateRangeFilter.endDate,
  ]);

  useEffect(() => {
    if (!activeDetailKey || !selectedCompanyId) {
      setDetailRows([]);
      setDetailTotalCount(0);
      setDetailLoading(false);
      return;
    }

    let cancelled = false;
    const detailKey = activeDetailKey;

    async function loadDetailRows() {
      setDetailLoading(true);

      const { data, count, error } = await buildClientQuery(detailKey, {
        includeRows: true,
        search: detailSearch,
        page: detailPage,
      });

      if (cancelled) return;

      if (error) {
        console.error("Failed to load KPI detail rows:", error);
        setDetailRows([]);
        setDetailTotalCount(0);
      } else {
        setDetailRows(((data ?? []) as unknown) as ClientRow[]);
        setDetailTotalCount(count ?? 0);
      }

      setDetailLoading(false);
    }

    loadDetailRows();

    return () => {
      cancelled = true;
    };
  }, [
    activeDetailKey,
    detailPage,
    detailSearch,
    selectedCompanyId,
    selectedCsmId,
    selectedProgram,
    selectedSecondaryAssigneeId,
    showSecondaryAssigneeFilter,
    clientStartDateFilter.startDate,
    clientStartDateFilter.endDate,
    dateRangeFilter.endDate,
  ]);

  useEffect(() => {
    if (detailPage > detailPageCount) {
      setDetailPage(detailPageCount);
    }
  }, [detailPage, detailPageCount]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label
              htmlFor="company-filter"
              className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1"
            >
              Company
            </label>
            <select
              id="company-filter"
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              disabled={companiesLoading}
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="">
                {companiesLoading ? "Loading companies..." : "Select a company"}
              </option>
              {companies.map((company) => (
                <option key={company.glide_row_id} value={company.glide_row_id}>
                  {company.name ?? "(unnamed)"}
                </option>
              ))}
            </select>
          </div>

          {showCompanyScopedFilters && (
            <>
              <div>
                <label
                  htmlFor="csm-filter"
                  className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1"
                >
                  CSM
                </label>
                <select
                  id="csm-filter"
                  value={selectedCsmId}
                  onChange={(e) =>
                    updateSearchParams({ [CSM_QUERY_KEY]: e.target.value || null })
                  }
                  disabled={teamMembersLoading}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">
                    {teamMembersLoading ? "Loading team..." : "All CSMs"}
                  </option>
                  {availableTeamMembers.map((member) => (
                    <option key={member.glide_row_id} value={member.glide_row_id}>
                      {member.name ?? "(unnamed)"}
                    </option>
                  ))}
                </select>
              </div>

              {showSecondaryAssigneeFilter && (
                <div>
                  <label
                    htmlFor="secondary-assignee-filter"
                    className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1"
                  >
                    Secondary Assignee
                  </label>
                  <select
                    id="secondary-assignee-filter"
                    value={selectedSecondaryAssigneeId}
                    onChange={(e) =>
                      updateSearchParams({
                        [SECONDARY_ASSIGNEE_QUERY_KEY]: e.target.value || null,
                      })
                    }
                    disabled={teamMembersLoading}
                    className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
                  >
                    <option value="">
                      {teamMembersLoading
                        ? "Loading team..."
                        : "All secondary assignees"}
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
                  htmlFor="program-filter"
                  className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1"
                >
                  Program
                </label>
                <select
                  id="program-filter"
                  value={selectedProgram}
                  onChange={(e) =>
                    updateSearchParams({
                      [PROGRAM_QUERY_KEY]: e.target.value || null,
                    })
                  }
                  disabled={programChoicesLoading}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">
                    {programChoicesLoading ? "Loading programs..." : "All programs"}
                  </option>
                  {programChoices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </div>

              <MonthDateRangeFilter
                label="Date Range"
                state={dateRangeFilter}
                onChange={setDateRangeFilter}
              />
              <MonthDateRangeFilter
                label="Client Start Date"
                state={clientStartDateFilter}
                onChange={setClientStartDateFilter}
              />
            </>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={clearAllFilters}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors cursor-pointer"
          >
            Clear All Filters
          </button>
        </div>
      </div>

      <div className="mb-3">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
          KPIs
        </h2>
      </div>

      {!selectedCompanyId ? (
        <div className="bg-white rounded-lg border border-dashed border-gray-300 p-10 text-center text-gray-500">
          <p>Select a company above to load filters and KPI counts.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Active Clients 🎫"
            value={activeClients !== null ? activeClients.toLocaleString() : "--"}
            description="clients in front end or back end"
            loading={kpiLoading}
            onClick={() => openDetailDrawer("active")}
          />
          <KpiCard
            label="Front End Clients 🥇"
            value={frontEndClients !== null ? frontEndClients.toLocaleString() : "--"}
            description="clients in front end"
            loading={kpiLoading}
            onClick={() => openDetailDrawer("front-end")}
          />
          <KpiCard
            label="Back End Clients 🥈"
            value={backEndClients !== null ? backEndClients.toLocaleString() : "--"}
            description="clients in back end"
            loading={kpiLoading}
            onClick={() => openDetailDrawer("back-end")}
          />
        </div>
      )}

      {activeDetailKey && (
        <div className="fixed inset-0 z-30">
          <button
            type="button"
            aria-label="Close detail drawer"
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px] cursor-pointer"
            onClick={closeDetailDrawer}
          />

          <aside className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl border-l border-gray-200 flex flex-col">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-5">
              <div>
                <h3 className="text-2xl font-semibold text-gray-900">{detailTitle}</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {detailTotalCount.toLocaleString()} result
                  {detailTotalCount === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDetailDrawer}
                className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 cursor-pointer transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-5 w-5"
                >
                  <path d="M4.22 4.22a.75.75 0 0 1 1.06 0L10 8.94l4.72-4.72a.75.75 0 1 1 1.06 1.06L11.06 10l4.72 4.72a.75.75 0 1 1-1.06 1.06L10 11.06l-4.72 4.72a.75.75 0 1 1-1.06-1.06L8.94 10 4.22 5.28a.75.75 0 0 1 0-1.06Z" />
                </svg>
              </button>
            </div>

            <div className="border-b border-gray-200 px-6 py-4">
              <div className="relative">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
                >
                  <path
                    fillRule="evenodd"
                    d="M9 3.5a5.5 5.5 0 1 0 3.473 9.765l2.63 2.631a.75.75 0 1 0 1.06-1.06l-2.63-2.632A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"
                    clipRule="evenodd"
                  />
                </svg>
                <input
                  type="search"
                  value={detailSearch}
                  onChange={(e) => {
                    setDetailSearch(e.target.value);
                    setDetailPage(1);
                  }}
                  placeholder="Search clients"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4 border-b border-gray-200 px-1 pb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <span>Name</span>
                <span>CSM</span>
              </div>

              {detailLoading ? (
                <div className="space-y-3 py-4">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4 border-b border-gray-100 py-3"
                    >
                      <div className="h-10 rounded-lg bg-gray-100 animate-pulse" />
                      <div className="h-10 rounded-lg bg-gray-100 animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : detailRows.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-500">
                  No clients matched these filters.
                </div>
              ) : (
                <div>
                  {detailRows.map((client) => (
                    <div
                      key={client.glide_row_id}
                      className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4 border-b border-gray-100 py-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {client.client_image ? (
                          <img
                            src={client.client_image}
                            alt=""
                            className="h-10 w-10 rounded-xl object-cover border border-gray-200 bg-gray-50"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-xs font-semibold text-indigo-700 border border-indigo-100">
                            {getInitials(client.client_name)}
                          </div>
                        )}
                        <span className="truncate text-sm font-medium text-gray-900">
                          {client.client_name ?? "Unnamed client"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-700">
                          {getInitials(
                            teamMemberNameById.get(client.csm_team_member_id ?? "") ?? "Unassigned",
                          )}
                        </div>
                        <span className="truncate text-sm text-gray-700">
                          {teamMemberNameById.get(client.csm_team_member_id ?? "") ??
                            "Unassigned"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-gray-200 px-6 py-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-gray-500">
                  {detailTotalCount === 0
                    ? "Showing 0 results"
                    : `Showing ${detailStart}-${detailEnd} of ${detailTotalCount.toLocaleString()}`}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDetailPage((page) => Math.max(1, page - 1))}
                    disabled={detailPage === 1}
                    className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:text-gray-400 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {detailPage} of {detailPageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setDetailPage((page) => Math.min(detailPageCount, page + 1))
                    }
                    disabled={detailPage >= detailPageCount}
                    className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:text-gray-400 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
