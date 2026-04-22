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
import { ActiveClientsKpi } from "../components/dashboard/kpis/ActiveClientsKpi.tsx";
import { BackEndClientsKpi } from "../components/dashboard/kpis/BackEndClientsKpi.tsx";
import { ChurnPercentageKpi } from "../components/dashboard/kpis/ChurnPercentageKpi.tsx";
import { FrontEndClientsKpi } from "../components/dashboard/kpis/FrontEndClientsKpi.tsx";
import { OffBoardedClientsKpi } from "../components/dashboard/kpis/OffBoardedClientsKpi.tsx";
import { RetainedClientsKpi } from "../components/dashboard/kpis/RetainedClientsKpi.tsx";
import { RetentionPercentageKpi } from "../components/dashboard/kpis/RetentionPercentageKpi.tsx";
import { UpForRenewalKpi } from "../components/dashboard/kpis/UpForRenewalKpi.tsx";
import { supabase } from "../lib/supabase.ts";
import { type DashboardKpiSqlParams } from "../lib/dashboardKpiSql.ts";

const MONTH_OPTIONS_COUNT = 25;

const COMPANY_QUERY_KEY = "companyId";
const CSM_QUERY_KEY = "csmId";
const SECONDARY_ASSIGNEE_QUERY_KEY = "secondaryAssigneeId";
const PROGRAM_QUERY_KEY = "program";
const DETAIL_PAGE_SIZE = 25;

type KpiDetailKey =
  | "active"
  | "front-end"
  | "back-end"
  | "off-boarded"
  | "retained"
  | "churned"
  | "renewing"
  | "active-renewing";

interface DashboardRpcFilterParams {
  p_company_id: string;
  p_csm_id: string | null;
  p_secondary_assignee_id: string | null;
  p_program_value: string | null;
  p_client_start_date_from: string | null;
  p_client_start_date_to: string | null;
  p_date_range_start: string | null;
  p_date_range_end: string | null;
}

interface PrimaryKpiCountsRow {
  active_clients: number | null;
  front_end_clients: number | null;
  back_end_clients: number | null;
  off_boarded_clients: number | null;
  churned_clients: number | null;
  churn_percentage: number | string | null;
}

interface RetentionKpiCountsRow {
  retained_clients: number | null;
  renewing_clients: number | null;
  retention_percentage: number | string | null;
  active_renewing_clients: number | null;
}

interface ClientsListRow {
  glide_row_id: string;
  client_name: string | null;
  client_image: string | null;
  csm_team_member_id: string | null;
  total_count: number | string | null;
}

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

interface DashboardFilters {
  companyId: string;
  csmId: string;
  secondaryAssigneeId: string;
  program: string;
  dateRange: MonthDateFilterState;
  clientStartDate: MonthDateFilterState;
}

function emptyDashboardFilters(): DashboardFilters {
  return {
    companyId: "",
    csmId: "",
    secondaryAssigneeId: "",
    program: "",
    dateRange: clearedMonthDateFilter(),
    clientStartDate: clearedMonthDateFilter(),
  };
}

function dashboardFiltersFromSearchParams(searchParams: URLSearchParams): DashboardFilters {
  return {
    ...emptyDashboardFilters(),
    companyId: searchParams.get(COMPANY_QUERY_KEY) ?? "",
    csmId: searchParams.get(CSM_QUERY_KEY) ?? "",
    secondaryAssigneeId: searchParams.get(SECONDARY_ASSIGNEE_QUERY_KEY) ?? "",
    program: searchParams.get(PROGRAM_QUERY_KEY) ?? "",
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

function getInitials(name: string | null) {
  if (!name) return "--";

  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "--";

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [pendingFilters, setPendingFilters] = useState(() =>
    dashboardFiltersFromSearchParams(searchParams),
  );
  const [appliedFilters, setAppliedFilters] = useState(() =>
    dashboardFiltersFromSearchParams(searchParams),
  );
  const [reportVersion, setReportVersion] = useState(0);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamMembersLoading, setTeamMembersLoading] = useState(false);
  const [baseProgramChoices, setBaseProgramChoices] = useState<ProgramChoice[]>([]);
  const [programChoicesLoading, setProgramChoicesLoading] = useState(false);

  const [activeClients, setActiveClients] = useState<number | null>(null);
  const [frontEndClients, setFrontEndClients] = useState<number | null>(null);
  const [backEndClients, setBackEndClients] = useState<number | null>(null);
  const [offBoardedClients, setOffBoardedClients] = useState<number | null>(null);
  const [retainedClients, setRetainedClients] = useState<number | null>(null);
  const [churnedClientsCount, setChurnedClientsCount] = useState<number | null>(null);
  const [churnPercentage, setChurnPercentage] = useState<number | null>(null);
  const [renewingClientsCount, setRenewingClientsCount] = useState<number | null>(null);
  const [retentionPercentage, setRetentionPercentage] = useState<number | null>(null);
  const [activeRenewingClients, setActiveRenewingClients] = useState<number | null>(null);
  const [primaryKpiLoading, setPrimaryKpiLoading] = useState(false);
  const [retentionKpiLoading, setRetentionKpiLoading] = useState(false);
  const kpiLoading = primaryKpiLoading || retentionKpiLoading;
  const [activeDetailKey, setActiveDetailKey] = useState<KpiDetailKey | null>(null);
  const [detailSearch, setDetailSearch] = useState("");
  const [detailPage, setDetailPage] = useState(1);
  const [detailRows, setDetailRows] = useState<ClientRow[]>([]);
  const [detailTotalCount, setDetailTotalCount] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [kpiInfoModal, setKpiInfoModal] = useState<{
    title: string;
    description: string;
    sql: string;
  } | null>(null);
  const [kpiInfoSqlCopied, setKpiInfoSqlCopied] = useState(false);

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
    const cleared = emptyDashboardFilters();
    setPendingFilters(cleared);
    setAppliedFilters(cleared);
    setReportVersion((v) => v + 1);
    setSearchParams({}, { replace: true });
  };

  const applyFilters = () => {
    if (!pendingFilters.companyId) return;
    const next = structuredClone(pendingFilters);
    setAppliedFilters(next);
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next.companyId) p.set(COMPANY_QUERY_KEY, next.companyId);
        else p.delete(COMPANY_QUERY_KEY);
        if (next.csmId) p.set(CSM_QUERY_KEY, next.csmId);
        else p.delete(CSM_QUERY_KEY);
        if (next.secondaryAssigneeId) p.set(SECONDARY_ASSIGNEE_QUERY_KEY, next.secondaryAssigneeId);
        else p.delete(SECONDARY_ASSIGNEE_QUERY_KEY);
        if (next.program) p.set(PROGRAM_QUERY_KEY, next.program);
        else p.delete(PROGRAM_QUERY_KEY);
        return p;
      },
      { replace: true },
    );
    setReportVersion((v) => v + 1);
  };

  useEffect(() => {
    if (pendingFilters.companyId) return;
    setAppliedFilters(emptyDashboardFilters());
    updateSearchParams({
      [COMPANY_QUERY_KEY]: null,
      [CSM_QUERY_KEY]: null,
      [SECONDARY_ASSIGNEE_QUERY_KEY]: null,
      [PROGRAM_QUERY_KEY]: null,
    });
  }, [pendingFilters.companyId]);

  const pendingCompany = useMemo(
    () =>
      companies.find((company) => company.glide_row_id === pendingFilters.companyId) ??
      null,
    [companies, pendingFilters.companyId],
  );

  const appliedCompany = useMemo(
    () =>
      companies.find((company) => company.glide_row_id === appliedFilters.companyId) ??
      null,
    [companies, appliedFilters.companyId],
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

  const showCompanyScopedFilters = Boolean(pendingFilters.companyId);
  const showSecondaryAssigneeFilter =
    pendingCompany?.enable_secondary_assignee === true;

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
            pendingCompany?.program_paused_override
          ) {
            displayLabel = pendingCompany.program_paused_override;
          }

          if (
            choice.program_value === "suspended" &&
            pendingCompany?.program_suspended_override
          ) {
            displayLabel = pendingCompany.program_suspended_override;
          }

          return {
            value: choice.program_value ?? "",
            label: choice.program_emoji
              ? `${choice.program_emoji} ${displayLabel}`
              : displayLabel,
          };
        }),
    [baseProgramChoices, pendingCompany],
  );

  const detailTitle = useMemo(() => {
    if (activeDetailKey === "active") return "Active Clients";
    if (activeDetailKey === "front-end") return "Front-end Clients";
    if (activeDetailKey === "back-end") return "Back-end Clients";
    if (activeDetailKey === "off-boarded") return "Off-boarded Clients";
    if (activeDetailKey === "retained") return "Retained Clients";
    if (activeDetailKey === "churned") return "Churned Clients";
    if (activeDetailKey === "renewing") return "Clients Up For Renewal";
    if (activeDetailKey === "active-renewing") return "Active Clients Up For Renewal";
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

  const openKpiInfoModal = (title: string, description: string, sql: string) => {
    setKpiInfoModal({ title, description, sql });
    setKpiInfoSqlCopied(false);
  };

  const closeKpiInfoModal = () => {
    setKpiInfoModal(null);
    setKpiInfoSqlCopied(false);
  };

  const copyKpiSql = async () => {
    if (!kpiInfoModal?.sql) return;
    try {
      await navigator.clipboard.writeText(kpiInfoModal.sql);
      setKpiInfoSqlCopied(true);
    } catch (error) {
      console.error("Failed to copy KPI SQL:", error);
      setKpiInfoSqlCopied(false);
    }
  };

  const appliedShowSecondaryFilter =
    appliedCompany?.enable_secondary_assignee === true;

  const rpcFilterParams = useMemo<DashboardRpcFilterParams>(
    () => ({
      p_company_id: appliedFilters.companyId,
      p_csm_id: appliedFilters.csmId || null,
      p_secondary_assignee_id: appliedShowSecondaryFilter
        ? appliedFilters.secondaryAssigneeId || null
        : null,
      p_program_value: appliedFilters.program || null,
      p_client_start_date_from: appliedFilters.clientStartDate.startDate || null,
      p_client_start_date_to: appliedFilters.clientStartDate.endDate || null,
      p_date_range_start: appliedFilters.dateRange.startDate || null,
      p_date_range_end: appliedFilters.dateRange.endDate || null,
    }),
    [
      appliedFilters.clientStartDate.endDate,
      appliedFilters.clientStartDate.startDate,
      appliedFilters.dateRange.endDate,
      appliedFilters.dateRange.startDate,
      appliedFilters.companyId,
      appliedFilters.csmId,
      appliedFilters.program,
      appliedFilters.secondaryAssigneeId,
      appliedShowSecondaryFilter,
    ],
  );

  const kpiSqlParams = useMemo<DashboardKpiSqlParams>(
    () => ({
      companyId: appliedFilters.companyId,
      csmId: appliedFilters.csmId,
      secondaryAssigneeId: appliedShowSecondaryFilter
        ? appliedFilters.secondaryAssigneeId
        : "",
      programValue: appliedFilters.program,
      clientStartDateFrom: appliedFilters.clientStartDate.startDate,
      clientStartDateTo: appliedFilters.clientStartDate.endDate,
      dateRangeStart: appliedFilters.dateRange.startDate,
      dateRangeEnd: appliedFilters.dateRange.endDate,
    }),
    [
      appliedFilters.clientStartDate.endDate,
      appliedFilters.clientStartDate.startDate,
      appliedFilters.dateRange.startDate,
      appliedFilters.dateRange.endDate,
      appliedFilters.companyId,
      appliedFilters.csmId,
      appliedFilters.program,
      appliedFilters.secondaryAssigneeId,
      appliedShowSecondaryFilter,
    ],
  );

  const appliedReportKey = useMemo(
    () =>
      JSON.stringify({
        companyId: appliedFilters.companyId,
        csmId: appliedFilters.csmId,
        secondaryAssigneeId: appliedFilters.secondaryAssigneeId,
        program: appliedFilters.program,
        drs: appliedFilters.dateRange.startDate,
        dre: appliedFilters.dateRange.endDate,
        csf: appliedFilters.clientStartDate.startDate,
        cst: appliedFilters.clientStartDate.endDate,
        sec: appliedShowSecondaryFilter,
      }),
    [appliedFilters, appliedShowSecondaryFilter],
  );

  const setPendingDateRange: Dispatch<SetStateAction<MonthDateFilterState>> = (action) => {
    setPendingFilters((prev) => ({
      ...prev,
      dateRange: typeof action === "function" ? action(prev.dateRange) : action,
    }));
  };

  const setPendingClientStartDate: Dispatch<SetStateAction<MonthDateFilterState>> = (
    action,
  ) => {
    setPendingFilters((prev) => ({
      ...prev,
      clientStartDate:
        typeof action === "function" ? action(prev.clientStartDate) : action,
    }));
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
    if (!pendingFilters.companyId) {
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
        .eq("company_id", pendingFilters.companyId)
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
  }, [pendingFilters.companyId]);

  useEffect(() => {
    if (!pendingFilters.companyId || baseProgramChoices.length > 0) return;

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
  }, [baseProgramChoices.length, pendingFilters.companyId]);

  useEffect(() => {
    if (companiesLoading || !pendingFilters.companyId) return;

    const validCompany = companies.some(
      (company) => company.glide_row_id === pendingFilters.companyId,
    );

    if (!validCompany) {
      setPendingFilters((prev) => ({
        ...prev,
        companyId: "",
        csmId: "",
        secondaryAssigneeId: "",
        program: "",
      }));
      updateSearchParams({
        [COMPANY_QUERY_KEY]: null,
        [CSM_QUERY_KEY]: null,
        [SECONDARY_ASSIGNEE_QUERY_KEY]: null,
        [PROGRAM_QUERY_KEY]: null,
      });
    }
  }, [companies, companiesLoading, pendingFilters.companyId]);

  useEffect(() => {
    if (!pendingFilters.csmId) return;

    const isValidCsm = availableTeamMembers.some(
      (member) => member.glide_row_id === pendingFilters.csmId,
    );

    if (!isValidCsm) {
      setPendingFilters((prev) => ({ ...prev, csmId: "" }));
    }
  }, [availableTeamMembers, pendingFilters.csmId]);

  useEffect(() => {
    if (!pendingFilters.secondaryAssigneeId) return;

    if (!showSecondaryAssigneeFilter) {
      setPendingFilters((prev) => ({ ...prev, secondaryAssigneeId: "" }));
      return;
    }

    const isValidSecondaryAssignee = availableTeamMembers.some(
      (member) => member.glide_row_id === pendingFilters.secondaryAssigneeId,
    );

    if (!isValidSecondaryAssignee) {
      setPendingFilters((prev) => ({ ...prev, secondaryAssigneeId: "" }));
    }
  }, [
    availableTeamMembers,
    pendingFilters.secondaryAssigneeId,
    showSecondaryAssigneeFilter,
  ]);

  useEffect(() => {
    if (!pendingFilters.program) return;

    const isValidProgram = programChoices.some(
      (choice) => choice.value === pendingFilters.program,
    );

    if (!isValidProgram) {
      setPendingFilters((prev) => ({ ...prev, program: "" }));
    }
  }, [programChoices, pendingFilters.program]);

  useEffect(() => {
    if (!appliedFilters.companyId) {
      setActiveClients(null);
      setFrontEndClients(null);
      setBackEndClients(null);
      setOffBoardedClients(null);
      setRetainedClients(null);
      setChurnedClientsCount(null);
      setChurnPercentage(null);
      setRenewingClientsCount(null);
      setRetentionPercentage(null);
      setActiveRenewingClients(null);
      closeDetailDrawer();
      return;
    }

    let cancelled = false;

    async function loadPrimaryKpis() {
      setPrimaryKpiLoading(true);

      const { data, error } = await supabase.rpc(
        "dashboard_kpi_counts_primary",
        rpcFilterParams,
      );

      if (cancelled) return;

      if (error) {
        console.error("Failed to load primary dashboard KPIs:", error);
        setActiveClients(null);
        setFrontEndClients(null);
        setBackEndClients(null);
        setOffBoardedClients(null);
        setChurnedClientsCount(null);
        setChurnPercentage(null);
      } else {
        const row = ((data ?? []) as PrimaryKpiCountsRow[])[0] ?? null;
        setActiveClients(Number(row?.active_clients ?? 0));
        setFrontEndClients(Number(row?.front_end_clients ?? 0));
        setBackEndClients(Number(row?.back_end_clients ?? 0));
        setOffBoardedClients(Number(row?.off_boarded_clients ?? 0));
        setChurnedClientsCount(Number(row?.churned_clients ?? 0));
        setChurnPercentage(
          row?.churn_percentage == null ? 0 : Number(row.churn_percentage),
        );
      }

      setPrimaryKpiLoading(false);
    }

    async function loadRetentionKpis() {
      setRetentionKpiLoading(true);

      const { data, error } = await supabase.rpc(
        "dashboard_kpi_counts_retention",
        rpcFilterParams,
      );

      if (cancelled) return;

      if (error) {
        console.error("Failed to load retention dashboard KPIs:", error);
        setRetainedClients(null);
        setRenewingClientsCount(null);
        setRetentionPercentage(null);
        setActiveRenewingClients(null);
      } else {
        const row = ((data ?? []) as RetentionKpiCountsRow[])[0] ?? null;
        setRetainedClients(Number(row?.retained_clients ?? 0));
        setRenewingClientsCount(Number(row?.renewing_clients ?? 0));
        setRetentionPercentage(
          row?.retention_percentage == null ? 0 : Number(row.retention_percentage),
        );
        setActiveRenewingClients(Number(row?.active_renewing_clients ?? 0));
      }

      setRetentionKpiLoading(false);
    }

    loadPrimaryKpis();
    loadRetentionKpis();

    return () => {
      cancelled = true;
    };
  }, [appliedReportKey, appliedFilters.companyId, reportVersion, rpcFilterParams]);

  useEffect(() => {
    if (!activeDetailKey || !appliedFilters.companyId) {
      setDetailRows([]);
      setDetailTotalCount(0);
      setDetailLoading(false);
      return;
    }

    let cancelled = false;
    const detailKey = activeDetailKey;

    async function loadDetailRows() {
      setDetailLoading(true);

      const { data, error } = await supabase.rpc("dashboard_clients_list", {
        ...rpcFilterParams,
        p_detail_key: detailKey,
        p_search: detailSearch || null,
        p_limit: DETAIL_PAGE_SIZE,
        p_offset: (detailPage - 1) * DETAIL_PAGE_SIZE,
      });

      if (cancelled) return;

      if (error) {
        console.error("Failed to load KPI detail rows:", error);
        setDetailRows([]);
        setDetailTotalCount(0);
      } else {
        const rows = ((data ?? []) as ClientsListRow[]);
        const totalCount = rows.length > 0 ? Number(rows[0].total_count ?? 0) : 0;
        setDetailRows(
          rows.map((row) => ({
            glide_row_id: row.glide_row_id,
            client_name: row.client_name,
            client_image: row.client_image,
            csm_team_member_id: row.csm_team_member_id,
          })),
        );
        setDetailTotalCount(totalCount);
      }

      setDetailLoading(false);
    }

    loadDetailRows();

    return () => {
      cancelled = true;
    };
  }, [
    activeDetailKey,
    appliedFilters.companyId,
    detailPage,
    detailSearch,
    rpcFilterParams,
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
              value={pendingFilters.companyId}
              onChange={(e) => {
                const id = e.target.value;
                setPendingFilters((p) => ({
                  ...p,
                  companyId: id,
                  csmId: "",
                  secondaryAssigneeId: "",
                  ...(id ? {} : { program: "" }),
                }));
              }}
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
                  value={pendingFilters.csmId}
                  onChange={(e) =>
                    setPendingFilters((p) => ({ ...p, csmId: e.target.value }))
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
                    value={pendingFilters.secondaryAssigneeId}
                    onChange={(e) =>
                      setPendingFilters((p) => ({
                        ...p,
                        secondaryAssigneeId: e.target.value,
                      }))
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
                  value={pendingFilters.program}
                  onChange={(e) =>
                    setPendingFilters((p) => ({ ...p, program: e.target.value }))
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
                state={pendingFilters.dateRange}
                onChange={setPendingDateRange}
              />
              <MonthDateRangeFilter
                label="Client Start Date"
                state={pendingFilters.clientStartDate}
                onChange={setPendingClientStartDate}
              />
            </>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={applyFilters}
            disabled={!pendingFilters.companyId || kpiLoading}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-indigo-600"
          >
            Apply filters
          </button>
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

      {!pendingFilters.companyId ? (
        <div className="bg-white rounded-lg border border-dashed border-gray-300 p-10 text-center text-gray-500">
          <p>Select a company above to configure filters, then click Apply filters to load KPIs.</p>
        </div>
      ) : !appliedFilters.companyId ? (
        <div className="bg-white rounded-lg border border-dashed border-amber-200 bg-amber-50/50 p-10 text-center text-amber-900">
          <p className="font-medium">Filters are set</p>
          <p className="mt-2 text-sm text-amber-800/90">
            Click <span className="font-semibold">Apply filters</span> to run the report and
            load KPI counts.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Row 1: Active, Front End, Back End; fourth column intentionally empty */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <ActiveClientsKpi
              value={activeClients}
              loading={primaryKpiLoading}
              sqlParams={kpiSqlParams}
              onOpenInfo={openKpiInfoModal}
              onOpenList={() => openDetailDrawer("active")}
            />
            <FrontEndClientsKpi
              value={frontEndClients}
              loading={primaryKpiLoading}
              sqlParams={kpiSqlParams}
              onOpenInfo={openKpiInfoModal}
              onOpenList={() => openDetailDrawer("front-end")}
            />
            <BackEndClientsKpi
              value={backEndClients}
              loading={primaryKpiLoading}
              sqlParams={kpiSqlParams}
              onOpenInfo={openKpiInfoModal}
              onOpenList={() => openDetailDrawer("back-end")}
            />
            <div className="hidden lg:block" aria-hidden="true" />
          </div>

          {/* Row 2: Retained, Retention %, Off-boarded, Churn */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <RetainedClientsKpi
              value={retainedClients}
              loading={retentionKpiLoading}
              sqlParams={kpiSqlParams}
              onOpenInfo={openKpiInfoModal}
              onOpenList={() => openDetailDrawer("retained")}
            />
            <RetentionPercentageKpi
              percentage={retentionPercentage}
              renewingClientsCount={renewingClientsCount}
              loading={retentionKpiLoading}
              sqlParams={kpiSqlParams}
              onOpenInfo={openKpiInfoModal}
              onOpenList={() => openDetailDrawer("renewing")}
            />
            <OffBoardedClientsKpi
              value={offBoardedClients}
              loading={primaryKpiLoading}
              sqlParams={kpiSqlParams}
              onOpenInfo={openKpiInfoModal}
              onOpenList={() => openDetailDrawer("off-boarded")}
            />
            <ChurnPercentageKpi
              percentage={churnPercentage}
              churnedClientsCount={churnedClientsCount}
              loading={primaryKpiLoading}
              sqlParams={kpiSqlParams}
              onOpenInfo={openKpiInfoModal}
              onOpenList={() => openDetailDrawer("churned")}
            />
          </div>

          {/* Row 3: first column empty on large screens; Up for Renewal in second column */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="hidden lg:block" aria-hidden="true" />
            <UpForRenewalKpi
              value={activeRenewingClients}
              loading={retentionKpiLoading}
              sqlParams={kpiSqlParams}
              onOpenInfo={openKpiInfoModal}
              onOpenList={() => openDetailDrawer("active-renewing")}
            />
          </div>
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

      {kpiInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close KPI info dialog"
            onClick={closeKpiInfoModal}
            className="absolute inset-0 bg-slate-900/40 cursor-pointer"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{kpiInfoModal.title}</h3>
                <p className="mt-1 text-sm text-gray-500">Calculation details</p>
              </div>
              <button
                type="button"
                onClick={closeKpiInfoModal}
                className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 cursor-pointer"
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
            <div className="px-5 py-4 space-y-4">
              <p className="text-sm leading-6 text-gray-700 whitespace-pre-line">
                {kpiInfoModal.description}
              </p>
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                    SQL Query
                  </p>
                  <button
                    type="button"
                    onClick={copyKpiSql}
                    className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 cursor-pointer transition-colors"
                  >
                    {kpiInfoSqlCopied ? "Copied" : "Copy SQL"}
                  </button>
                </div>
                <pre className="max-h-72 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs leading-5 text-gray-800">
                  <code>{kpiInfoModal.sql}</code>
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
