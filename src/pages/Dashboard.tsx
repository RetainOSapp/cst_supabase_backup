import {
  type Dispatch,
  type ReactNode,
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
import { useAccountContext } from "../lib/accountContext.tsx";

const MONTH_OPTIONS_COUNT = 25;

const COMPANY_QUERY_KEY = "companyId";
const CSM_QUERY_KEY = "csmId";
const SECONDARY_ASSIGNEE_QUERY_KEY = "secondaryAssigneeId";
const PROGRAM_QUERY_KEY = "program";
const OFFER_QUERY_KEY = "offerId";
const DETAIL_PAGE_SIZE = 25;

type DashboardTab = "overview" | "charts" | "ai";

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

interface Offer {
  glide_row_id: string;
  name: string | null;
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

interface ChartDatum {
  label: string;
  value: number;
}

interface DashboardChartData {
  programDistribution: ChartDatum[];
  buyInDistribution: ChartDatum[];
  progressDistribution: ChartDatum[];
  clientsByOffer: ChartDatum[];
  tasksByStatus: ChartDatum[];
  csmWorkload: ChartDatum[];
}

type ChartClientRow = Record<string, unknown> & {
  glide_row_id: string;
  program_status_value: string | null;
  outcomes_buy_in_for_filtering: string | null;
  outcomes_progress_for_filtering: string | null;
  offer_milestones_current_offer_id: string | null;
  csm_team_member_id: string | null;
};

type ChartTaskRow = {
  status_value: string | null;
  assigned_to_id: string | null;
};

type OfferKpiClientRow = Record<string, unknown> & {
  glide_row_id: string;
  client_name: string | null;
  client_image: string | null;
  csm_team_member_id: string | null;
  csm_secondary_assignee_id: string | null;
  program_status_value: string | null;
  offer_milestones_current_offer_id: string | null;
  client_age_date_onboarded: string | null;
  client_age_date_offboarded: string | null;
  client_age_date_offboarded_for_filtering: string | null;
  current_contract_start_date: string | null;
  current_contract_of_days: number | null;
  current_contract_end_date: string | null;
};

interface OfferKpiHistoryRow {
  client_id: string | null;
}

interface OfferKpiContractRow {
  client_id: string | null;
  end_date: string | null;
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
  offerId: string;
  program: string;
  dateRange: MonthDateFilterState;
  clientStartDate: MonthDateFilterState;
}

function emptyDashboardFilters(): DashboardFilters {
  return {
    companyId: "",
    csmId: "",
    secondaryAssigneeId: "",
    offerId: "",
    program: "",
    dateRange: clearedMonthDateFilter(),
    clientStartDate: clearedMonthDateFilter(),
  };
}

function dashboardFiltersFromSearchParams(
  searchParams: URLSearchParams,
  fallbackCompanyId = "",
): DashboardFilters {
  return {
    ...emptyDashboardFilters(),
    companyId: searchParams.get(COMPANY_QUERY_KEY) ?? fallbackCompanyId,
    csmId: searchParams.get(CSM_QUERY_KEY) ?? "",
    secondaryAssigneeId: searchParams.get(SECONDARY_ASSIGNEE_QUERY_KEY) ?? "",
    offerId: searchParams.get(OFFER_QUERY_KEY) ?? "",
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

function displayLabel(value: unknown) {
  if (value === null || value === undefined || value === "") return "Not set";
  const text = String(value).trim();
  if (!text || text.toLowerCase() === "x") return "Not set";
  return text
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function countBy<T>(
  rows: T[],
  getKey: (row: T) => string | null | undefined,
  labelMap = new Map<string, string>(),
) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const raw = getKey(row);
    const key = raw && String(raw).trim() ? String(raw).trim() : "not-set";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return [...counts.entries()]
    .map(([key, value]) => ({
      label: labelMap.get(key) ?? displayLabel(key),
      value,
    }))
    .sort((a, b) => b.value - a.value);
}

function chartTotal(data: ChartDatum[]) {
  return data.reduce((sum, item) => sum + item.value, 0);
}

function dateFromValue(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dayStart(value: string) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function dayAfter(value: string) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function isInDateRange(value: unknown, startDate: string, endDate: string) {
  const date = dateFromValue(value);
  if (!date) return false;
  const start = dayStart(startDate);
  const end = endDate ? addDays(new Date(`${endDate}T00:00:00.000Z`), 1) : null;
  return (!start || date >= start) && (!end || date < end);
}

function passesReportEndDate(client: OfferKpiClientRow, endDate: string) {
  if (!endDate) return true;
  const onboarded = dateFromValue(client.client_age_date_onboarded);
  const end = dayAfter(endDate);
  return !onboarded || !end || onboarded < end;
}

function calculatedContractEndDate(client: OfferKpiClientRow) {
  const explicitEnd = dateFromValue(client.current_contract_end_date);
  if (explicitEnd) return explicitEnd;
  const start = dateFromValue(
    client.current_contract_start_date ?? client.client_age_date_onboarded,
  );
  if (!start || client.current_contract_of_days == null) return null;
  return addDays(start, Number(client.current_contract_of_days));
}

function calculatedOffboardedDate(client: OfferKpiClientRow) {
  return (
    dateFromValue(client.client_age_date_offboarded) ??
    dateFromValue(client.client_age_date_offboarded_for_filtering) ??
    calculatedContractEndDate(client)
  );
}

function isChurnedClient(client: OfferKpiClientRow, startDate: string, endDate: string) {
  if (client.program_status_value !== "off-boarded") return false;
  const offboarded = calculatedOffboardedDate(client);
  const contractEnd = calculatedContractEndDate(client);
  if (!offboarded || !contractEnd || offboarded >= contractEnd) return false;
  return isInDateRange(offboarded, startDate, endDate);
}

function DonutChart({ data }: { data: ChartDatum[] }) {
  const total = chartTotal(data);
  const palette = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#60a5fa"];
  let offset = 25;

  if (total === 0) {
    return (
      <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-500">
        No data
      </div>
    );
  }

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 42 42" className="h-32 w-32 shrink-0 -rotate-90">
        <circle
          cx="21"
          cy="21"
          r="15.915"
          fill="transparent"
          stroke="#e5e7eb"
          strokeWidth="7"
        />
        {data.slice(0, 5).map((item, index) => {
          const dash = (item.value / total) * 100;
          const circle = (
            <circle
              key={item.label}
              cx="21"
              cy="21"
              r="15.915"
              fill="transparent"
              stroke={palette[index % palette.length]}
              strokeWidth="7"
              strokeDasharray={`${dash} ${100 - dash}`}
              strokeDashoffset={offset}
            />
          );
          offset -= dash;
          return circle;
        })}
      </svg>
      <div className="min-w-0 flex-1 space-y-2">
        {data.slice(0, 5).map((item, index) => (
          <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: palette[index % palette.length] }}
              />
              <span className="truncate text-gray-700">{item.label}</span>
            </div>
            <span className="font-medium text-gray-900">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarChart({ data }: { data: ChartDatum[] }) {
  const max = Math.max(...data.map((item) => item.value), 1);

  if (data.length === 0) {
    return (
      <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-500">
        No data
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.slice(0, 8).map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-gray-700">{item.label}</span>
            <span className="font-medium text-gray-900">{item.value}</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100">
            <div
              className="h-2 rounded-full bg-indigo-500"
              style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function DashboardTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-1 pb-3 text-sm font-medium transition-colors cursor-pointer ${
        active
          ? "border-indigo-600 text-indigo-600"
          : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

export function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    capabilities,
    effectiveCompanyId,
    setViewAsCompanyId,
    teamMemberId,
  } = useAccountContext();
  const [pendingFilters, setPendingFilters] = useState(() =>
    dashboardFiltersFromSearchParams(searchParams, effectiveCompanyId),
  );
  const [appliedFilters, setAppliedFilters] = useState(() =>
    dashboardFiltersFromSearchParams(searchParams, effectiveCompanyId),
  );
  const [reportVersion, setReportVersion] = useState(0);
  const [activeDashboardTab, setActiveDashboardTab] =
    useState<DashboardTab>("overview");

  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamMembersLoading, setTeamMembersLoading] = useState(false);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
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
  const [chartData, setChartData] = useState<DashboardChartData>({
    programDistribution: [],
    buyInDistribution: [],
    progressDistribution: [],
    clientsByOffer: [],
    tasksByStatus: [],
    csmWorkload: [],
  });
  const [chartsLoading, setChartsLoading] = useState(false);

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
    const cleared = {
      ...emptyDashboardFilters(),
      companyId: effectiveCompanyId,
      csmId: assignedTeamMemberId,
    };
    setPendingFilters(cleared);
    setAppliedFilters(cleared);
    setReportVersion((v) => v + 1);
    const next = new URLSearchParams();
    if (effectiveCompanyId) next.set(COMPANY_QUERY_KEY, effectiveCompanyId);
    if (assignedTeamMemberId) next.set(CSM_QUERY_KEY, assignedTeamMemberId);
    setSearchParams(next, { replace: true });
  };

  const applyFilters = () => {
    if (!pendingFilters.companyId) return;
    const next = {
      ...structuredClone(pendingFilters),
      companyId: effectiveCompanyId || pendingFilters.companyId,
      csmId: assignedTeamMemberId || pendingFilters.csmId,
    };
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
        if (next.offerId) p.set(OFFER_QUERY_KEY, next.offerId);
        else p.delete(OFFER_QUERY_KEY);
        if (next.program) p.set(PROGRAM_QUERY_KEY, next.program);
        else p.delete(PROGRAM_QUERY_KEY);
        return p;
      },
      { replace: true },
    );
    setReportVersion((v) => v + 1);
  };

  const assignedTeamMemberId = capabilities.canViewOnlyAssignedClients
    ? teamMemberId
    : "";
  const canUseCompanySwitcher = capabilities.canUseCompanySwitcher;

  useEffect(() => {
    if (activeDashboardTab === "ai" && !capabilities.canTriggerAiInsights) {
      setActiveDashboardTab("overview");
    }
  }, [activeDashboardTab, capabilities.canTriggerAiInsights]);

  useEffect(() => {
    if (!effectiveCompanyId || effectiveCompanyId === pendingFilters.companyId) return;
    setPendingFilters((prev) => ({
      ...prev,
      companyId: effectiveCompanyId,
      csmId: assignedTeamMemberId,
      secondaryAssigneeId: "",
      offerId: "",
      program: "",
    }));
    setAppliedFilters((prev) => ({
      ...prev,
      companyId: effectiveCompanyId,
      csmId: assignedTeamMemberId,
      secondaryAssigneeId: "",
      offerId: "",
      program: "",
    }));
    setReportVersion((v) => v + 1);
    updateSearchParams({
      [COMPANY_QUERY_KEY]: effectiveCompanyId,
      [CSM_QUERY_KEY]: assignedTeamMemberId || null,
      [SECONDARY_ASSIGNEE_QUERY_KEY]: null,
      [OFFER_QUERY_KEY]: null,
      [PROGRAM_QUERY_KEY]: null,
    });
  }, [assignedTeamMemberId, effectiveCompanyId, pendingFilters.companyId]);

  useEffect(() => {
    if (pendingFilters.companyId) return;
    setAppliedFilters(emptyDashboardFilters());
    updateSearchParams({
      [COMPANY_QUERY_KEY]: null,
      [CSM_QUERY_KEY]: null,
      [SECONDARY_ASSIGNEE_QUERY_KEY]: null,
      [OFFER_QUERY_KEY]: null,
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

  const offerOptions = useMemo(
    () =>
      offers.map((offer) => ({
        value: offer.glide_row_id,
        label: offer.name ?? "(unnamed)",
      })),
    [offers],
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
      offerId: appliedFilters.offerId,
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
        offerId: appliedFilters.offerId,
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
      let query = supabase
        .from("backup_companies")
        .select(
          "glide_row_id, name, enable_secondary_assignee, program_paused_override, program_suspended_override",
        )
        .or("archived.is.null,archived.eq.false")
        .order("name", { ascending: true });
      if (!canUseCompanySwitcher && effectiveCompanyId) {
        query = query.eq("glide_row_id", effectiveCompanyId);
      }
      const { data, error } = await query;

      if (error) {
        console.error("Failed to load companies:", error);
        setCompanies([]);
      } else {
        setCompanies((data ?? []) as Company[]);
      }

      setCompaniesLoading(false);
    }

    loadCompanies();
  }, [canUseCompanySwitcher, effectiveCompanyId]);

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
    if (!pendingFilters.companyId) {
      setOffers([]);
      setOffersLoading(false);
      return;
    }

    let cancelled = false;

    async function loadOffers() {
      setOffersLoading(true);

      const { data, error } = await supabase
        .from("backup_company_offers")
        .select("glide_row_id, name")
        .eq("company_id", pendingFilters.companyId)
        .order("name", { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error("Failed to load offers:", error);
        setOffers([]);
      } else {
        setOffers((data ?? []) as Offer[]);
      }

      setOffersLoading(false);
    }

    loadOffers();

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
        offerId: "",
        program: "",
      }));
      updateSearchParams({
        [COMPANY_QUERY_KEY]: null,
        [CSM_QUERY_KEY]: null,
        [SECONDARY_ASSIGNEE_QUERY_KEY]: null,
        [OFFER_QUERY_KEY]: null,
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
    if (!pendingFilters.offerId) return;

    const isValidOffer = offerOptions.some(
      (offer) => offer.value === pendingFilters.offerId,
    );

    if (!isValidOffer) {
      setPendingFilters((prev) => ({ ...prev, offerId: "" }));
    }
  }, [offerOptions, pendingFilters.offerId]);

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

    async function loadOfferFilteredKpis() {
      setPrimaryKpiLoading(true);
      setRetentionKpiLoading(true);

      let clientsQuery = supabase
        .from("backup_company_clients")
        .select(
          [
            "glide_row_id",
            "client_name",
            "client_image",
            "csm_team_member_id",
            "csm_secondary_assignee_id",
            "program_status_value",
            "offer_milestones_current_offer_id",
            "client_age_date_onboarded",
            "client_age_date_offboarded",
            "client_age_date_offboarded_for_filtering",
            "current_contract_start_date",
            "current_contract_of_days",
            "current_contract_end_date",
          ].join(", "),
        )
        .eq("company_id", appliedFilters.companyId)
        .eq("offer_milestones_current_offer_id", appliedFilters.offerId)
        .range(0, 4999);

      if (assignedTeamMemberId) {
        clientsQuery = clientsQuery.or(
          `csm_team_member_id.eq.${assignedTeamMemberId},csm_secondary_assignee_id.eq.${assignedTeamMemberId}`,
        );
      } else if (appliedFilters.csmId) {
        clientsQuery = clientsQuery.eq("csm_team_member_id", appliedFilters.csmId);
      }
      if (appliedShowSecondaryFilter && appliedFilters.secondaryAssigneeId) {
        clientsQuery = clientsQuery.eq(
          "csm_secondary_assignee_id",
          appliedFilters.secondaryAssigneeId,
        );
      }
      if (appliedFilters.program) {
        clientsQuery = clientsQuery.eq("program_status_value", appliedFilters.program);
      }
      if (appliedFilters.clientStartDate.startDate) {
        clientsQuery = clientsQuery.gte(
          "client_age_date_onboarded",
          `${appliedFilters.clientStartDate.startDate}T00:00:00.000Z`,
        );
      }
      if (appliedFilters.clientStartDate.endDate) {
        clientsQuery = clientsQuery.lt(
          "client_age_date_onboarded",
          addDays(
            new Date(`${appliedFilters.clientStartDate.endDate}T00:00:00.000Z`),
            1,
          ).toISOString(),
        );
      }

      const { data: clientRows, error: clientsError } = await clientsQuery;
      if (cancelled) return;

      if (clientsError) {
        console.error("Failed to load offer-filtered dashboard KPIs:", clientsError);
        setActiveClients(null);
        setFrontEndClients(null);
        setBackEndClients(null);
        setOffBoardedClients(null);
        setChurnedClientsCount(null);
        setChurnPercentage(null);
        setRetainedClients(null);
        setRenewingClientsCount(null);
        setRetentionPercentage(null);
        setActiveRenewingClients(null);
        setPrimaryKpiLoading(false);
        setRetentionKpiLoading(false);
        return;
      }

      const clients = (clientRows ?? []) as unknown as OfferKpiClientRow[];
      const reportClients = clients.filter((client) =>
        passesReportEndDate(client, appliedFilters.dateRange.endDate),
      );
      const clientIds = reportClients.map((client) => client.glide_row_id);
      const clientById = new Map(reportClients.map((client) => [client.glide_row_id, client]));

      const active = reportClients.filter((client) =>
        ["front-end", "back-end"].includes(client.program_status_value ?? ""),
      );
      const frontEnd = reportClients.filter(
        (client) => client.program_status_value === "front-end",
      );
      const backEnd = reportClients.filter(
        (client) => client.program_status_value === "back-end",
      );
      const offBoarded = clients.filter(
        (client) =>
          client.program_status_value === "off-boarded" &&
          isInDateRange(
            client.client_age_date_offboarded_for_filtering,
            appliedFilters.dateRange.startDate,
            appliedFilters.dateRange.endDate,
          ),
      );
      const churned = reportClients.filter((client) =>
        isChurnedClient(
          client,
          appliedFilters.dateRange.startDate,
          appliedFilters.dateRange.endDate,
        ),
      );

      setActiveClients(active.length);
      setFrontEndClients(frontEnd.length);
      setBackEndClients(backEnd.length);
      setOffBoardedClients(offBoarded.length);
      setChurnedClientsCount(churned.length);
      const churnBase = frontEnd.length + backEnd.length + offBoarded.length;
      setChurnPercentage(churnBase === 0 ? 0 : Math.round((churned.length / churnBase) * 100));
      setPrimaryKpiLoading(false);

      if (clientIds.length === 0) {
        setRetainedClients(0);
        setRenewingClientsCount(0);
        setRetentionPercentage(0);
        setActiveRenewingClients(0);
        setRetentionKpiLoading(false);
        return;
      }

      const [historyResult, contractsResult] = await Promise.all([
        supabase
          .from("backup_company_clients_history")
          .select("client_id")
          .in("client_id", clientIds)
          .eq("change_type_code", "program-status")
          .eq("value", "back-end")
          .in("original_value", ["front-end", "back-end"])
          .gte(
            "modified_date",
            appliedFilters.dateRange.startDate
              ? `${appliedFilters.dateRange.startDate}T00:00:00.000Z`
              : "0001-01-01T00:00:00.000Z",
          )
          .lt(
            "modified_date",
            appliedFilters.dateRange.endDate
              ? addDays(new Date(`${appliedFilters.dateRange.endDate}T00:00:00.000Z`), 1).toISOString()
              : "9999-12-31T00:00:00.000Z",
          ),
        supabase
          .from("backup_company_clients_contracts")
          .select("client_id, end_date")
          .in("client_id", clientIds)
          .not("end_date", "is", null),
      ]);

      if (cancelled) return;

      if (historyResult.error) {
        console.error("Failed to load offer-filtered retained history:", historyResult.error);
      }
      if (contractsResult.error) {
        console.error("Failed to load offer-filtered contract history:", contractsResult.error);
      }

      const retainedIds = new Set(
        ((historyResult.data ?? []) as OfferKpiHistoryRow[])
          .map((row) => row.client_id)
          .filter((id): id is string => Boolean(id)),
      );
      const churnedIds = new Set(churned.map((client) => client.glide_row_id));
      const renewingIds = new Set<string>();

      reportClients.forEach((client) => {
        if (["paused", "suspended"].includes(client.program_status_value ?? "")) return;
        if (churnedIds.has(client.glide_row_id)) return;
        const contractEnd = calculatedContractEndDate(client);
        if (contractEnd && isInDateRange(contractEnd, appliedFilters.dateRange.startDate, appliedFilters.dateRange.endDate)) {
          renewingIds.add(client.glide_row_id);
        }
      });

      ((contractsResult.data ?? []) as OfferKpiContractRow[]).forEach((contract) => {
        if (!contract.client_id || !contract.end_date) return;
        const client = clientById.get(contract.client_id);
        if (!client) return;
        if (["paused", "suspended"].includes(client.program_status_value ?? "")) return;
        if (churnedIds.has(contract.client_id)) return;
        if (isInDateRange(contract.end_date, appliedFilters.dateRange.startDate, appliedFilters.dateRange.endDate)) {
          renewingIds.add(contract.client_id);
        }
      });

      setRetainedClients(retainedIds.size);
      setRenewingClientsCount(renewingIds.size);
      setRetentionPercentage(
        renewingIds.size === 0
          ? 0
          : Math.round((retainedIds.size / renewingIds.size) * 100),
      );
      setActiveRenewingClients(
        [...renewingIds].filter((id) => {
          const client = clientById.get(id);
          return (
            client &&
            ["front-end", "back-end"].includes(client.program_status_value ?? "") &&
            !retainedIds.has(id)
          );
        }).length,
      );
      setRetentionKpiLoading(false);
    }

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

    if (appliedFilters.offerId) {
      void loadOfferFilteredKpis();
    } else {
      loadPrimaryKpis();
      loadRetentionKpis();
    }

    return () => {
      cancelled = true;
    };
  }, [
    appliedReportKey,
    appliedFilters.clientStartDate.endDate,
    appliedFilters.clientStartDate.startDate,
    appliedFilters.companyId,
    appliedFilters.csmId,
    appliedFilters.dateRange.endDate,
    appliedFilters.dateRange.startDate,
    appliedFilters.offerId,
    appliedFilters.program,
    appliedFilters.secondaryAssigneeId,
    appliedShowSecondaryFilter,
    reportVersion,
    rpcFilterParams,
    assignedTeamMemberId,
  ]);

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
    if (!appliedFilters.companyId) {
      setChartData({
        programDistribution: [],
        buyInDistribution: [],
        progressDistribution: [],
        clientsByOffer: [],
        tasksByStatus: [],
        csmWorkload: [],
      });
      setChartsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadCharts() {
      setChartsLoading(true);

      let clientsQuery = supabase
        .from("backup_company_clients")
        .select(
          "glide_row_id, program_status_value, outcomes_buy_in_for_filtering, outcomes_progress_for_filtering, offer_milestones_current_offer_id, csm_team_member_id, csm_secondary_assignee_id, client_age_date_onboarded",
        )
        .eq("company_id", appliedFilters.companyId)
        .range(0, 4999);

      if (assignedTeamMemberId) {
        clientsQuery = clientsQuery.or(
          `csm_team_member_id.eq.${assignedTeamMemberId},csm_secondary_assignee_id.eq.${assignedTeamMemberId}`,
        );
      } else if (appliedFilters.csmId) {
        clientsQuery = clientsQuery.eq("csm_team_member_id", appliedFilters.csmId);
      }
      if (appliedShowSecondaryFilter && appliedFilters.secondaryAssigneeId) {
        clientsQuery = clientsQuery.eq(
          "csm_secondary_assignee_id",
          appliedFilters.secondaryAssigneeId,
        );
      }
      if (appliedFilters.program) {
        clientsQuery = clientsQuery.eq("program_status_value", appliedFilters.program);
      }
      if (appliedFilters.offerId) {
        clientsQuery = clientsQuery.eq(
          "offer_milestones_current_offer_id",
          appliedFilters.offerId,
        );
      }
      if (appliedFilters.clientStartDate.startDate) {
        clientsQuery = clientsQuery.gte(
          "client_age_date_onboarded",
          `${appliedFilters.clientStartDate.startDate}T00:00:00.000Z`,
        );
      }
      if (appliedFilters.clientStartDate.endDate) {
        clientsQuery = clientsQuery.lte(
          "client_age_date_onboarded",
          `${appliedFilters.clientStartDate.endDate}T23:59:59.999Z`,
        );
      }

      let tasksQuery = supabase
        .from("backup_company_clients_tasks")
        .select("status_value, assigned_to_id")
        .eq("company_id", appliedFilters.companyId)
        .range(0, 4999);
      if (assignedTeamMemberId) {
        tasksQuery = tasksQuery.eq("assigned_to_id", assignedTeamMemberId);
      } else if (appliedFilters.csmId) {
        tasksQuery = tasksQuery.eq("assigned_to_id", appliedFilters.csmId);
      }

      const [{ data: clientRows, error: clientsError }, { data: taskRows, error: tasksError }] =
        await Promise.all([clientsQuery, tasksQuery]);

      if (cancelled) return;

      if (clientsError) {
        console.error("Failed to load dashboard chart clients:", clientsError);
      }
      if (tasksError) {
        console.error("Failed to load dashboard chart tasks:", tasksError);
      }

      const clients = ((clientRows ?? []) as ChartClientRow[]);
      const tasks = ((taskRows ?? []) as ChartTaskRow[]);
      const offerIds = [
        ...new Set(
          clients
            .map((client) => client.offer_milestones_current_offer_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      let offerNameById = new Map<string, string>();

      if (offerIds.length > 0) {
        const { data: offers, error: offersError } = await supabase
          .from("backup_company_offers")
          .select("glide_row_id, name")
          .in("glide_row_id", offerIds);
        if (!cancelled) {
          if (offersError) console.error("Failed to load offer labels:", offersError);
          offerNameById = new Map(
            ((offers ?? []) as { glide_row_id: string; name: string | null }[]).map(
              (offer) => [offer.glide_row_id, offer.name ?? offer.glide_row_id],
            ),
          );
        }
      }

      if (cancelled) return;

      setChartData({
        programDistribution: countBy(clients, (client) => client.program_status_value),
        buyInDistribution: countBy(
          clients,
          (client) => client.outcomes_buy_in_for_filtering,
        ),
        progressDistribution: countBy(
          clients,
          (client) => client.outcomes_progress_for_filtering,
        ),
        clientsByOffer: countBy(
          clients,
          (client) => client.offer_milestones_current_offer_id,
          offerNameById,
        ),
        tasksByStatus: countBy(tasks, (task) => task.status_value),
        csmWorkload: countBy(
          tasks,
          (task) => task.assigned_to_id,
          teamMemberNameById,
        ),
      });
      setChartsLoading(false);
    }

    void loadCharts();

    return () => {
      cancelled = true;
    };
  }, [
    appliedFilters.clientStartDate.endDate,
    appliedFilters.clientStartDate.startDate,
    appliedFilters.companyId,
    appliedFilters.csmId,
    appliedFilters.offerId,
    appliedFilters.program,
    appliedFilters.secondaryAssigneeId,
    appliedShowSecondaryFilter,
    assignedTeamMemberId,
    teamMemberNameById,
    reportVersion,
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
                if (canUseCompanySwitcher) setViewAsCompanyId(id);
                setPendingFilters((p) => ({
                  ...p,
                  companyId: id,
                  csmId: assignedTeamMemberId,
                  secondaryAssigneeId: "",
                  offerId: "",
                  ...(id ? {} : { program: "" }),
                }));
              }}
              disabled={companiesLoading || !canUseCompanySwitcher}
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
              {!capabilities.canViewOnlyAssignedClients && (
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
              )}

              {showSecondaryAssigneeFilter &&
                !capabilities.canViewOnlyAssignedClients && (
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

              <div>
                <label
                  htmlFor="offer-filter"
                  className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1"
                >
                  Offer
                </label>
                <select
                  id="offer-filter"
                  value={pendingFilters.offerId}
                  onChange={(e) =>
                    setPendingFilters((p) => ({ ...p, offerId: e.target.value }))
                  }
                  disabled={offersLoading}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">
                    {offersLoading ? "Loading offers..." : "All offers"}
                  </option>
                  {offerOptions.map((offer) => (
                    <option key={offer.value} value={offer.value}>
                      {offer.label}
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

      <div className="mb-5 border-b border-gray-200">
        <nav className="-mb-px flex gap-6 overflow-x-auto" aria-label="Dashboard sections">
          <DashboardTabButton
            active={activeDashboardTab === "overview"}
            onClick={() => setActiveDashboardTab("overview")}
          >
            Overview
          </DashboardTabButton>
          <DashboardTabButton
            active={activeDashboardTab === "charts"}
            onClick={() => setActiveDashboardTab("charts")}
          >
            Charts
          </DashboardTabButton>
          {capabilities.canTriggerAiInsights && (
            <DashboardTabButton
              active={activeDashboardTab === "ai"}
              onClick={() => setActiveDashboardTab("ai")}
            >
              AI Insights
            </DashboardTabButton>
          )}
        </nav>
      </div>

      {!pendingFilters.companyId ? (
        <div className="bg-white rounded-lg border border-dashed border-gray-300 p-10 text-center text-gray-500">
          <p>Select a company above to configure filters, then click Apply filters to load the dashboard.</p>
        </div>
      ) : !appliedFilters.companyId ? (
        <div className="bg-white rounded-lg border border-dashed border-amber-200 bg-amber-50/50 p-10 text-center text-amber-900">
          <p className="font-medium">Filters are set</p>
          <p className="mt-2 text-sm text-amber-800/90">
            Click <span className="font-semibold">Apply filters</span> to run the report and
            load dashboard data.
          </p>
        </div>
      ) : activeDashboardTab === "overview" ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
              Client Health
            </h2>
          </div>
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
            <OffBoardedClientsKpi
              value={offBoardedClients}
              loading={primaryKpiLoading}
              sqlParams={kpiSqlParams}
              onOpenInfo={openKpiInfoModal}
              onOpenList={() => openDetailDrawer("off-boarded")}
            />
          </div>

          <div className="pt-2">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
              Contracts & Retention
            </h2>
          </div>
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
            <UpForRenewalKpi
              value={activeRenewingClients}
              loading={retentionKpiLoading}
              sqlParams={kpiSqlParams}
              onOpenInfo={openKpiInfoModal}
              onOpenList={() => openDetailDrawer("active-renewing")}
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
        </div>
      ) : activeDashboardTab === "charts" ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <div className="text-xs uppercase tracking-wider text-gray-500">
                Visible Clients
              </div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {chartTotal(chartData.programDistribution).toLocaleString()}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <div className="text-xs uppercase tracking-wider text-gray-500">
                Visible Tasks
              </div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {chartTotal(chartData.tasksByStatus).toLocaleString()}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <div className="text-xs uppercase tracking-wider text-gray-500">
                Report
              </div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {chartsLoading ? "Loading charts..." : "Ready"}
              </div>
            </div>
          </div>

          {chartsLoading ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-64 rounded-lg border border-gray-200 bg-white shadow-sm"
                >
                  <div className="h-full animate-pulse rounded-lg bg-gray-50" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ChartCard
                title="Program Distribution"
                subtitle="Clients grouped by current program status"
              >
                <DonutChart data={chartData.programDistribution} />
              </ChartCard>
              <ChartCard
                title="Buy-in"
                subtitle="Client outcome buy-in distribution"
              >
                <DonutChart data={chartData.buyInDistribution} />
              </ChartCard>
              <ChartCard
                title="Progress"
                subtitle="Client outcome progress distribution"
              >
                <DonutChart data={chartData.progressDistribution} />
              </ChartCard>
              <ChartCard
                title="Clients By Offer"
                subtitle="Top current offers for filtered clients"
              >
                <BarChart data={chartData.clientsByOffer} />
              </ChartCard>
              <ChartCard
                title="Tasks By Status"
                subtitle="Client tasks for the selected company"
              >
                <BarChart data={chartData.tasksByStatus} />
              </ChartCard>
              <ChartCard
                title="CSM Workload"
                subtitle="Tasks grouped by assigned CSM"
              >
                <BarChart data={chartData.csmWorkload} />
              </ChartCard>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  AI Insights
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Read-only placeholder until we wire an approved AI generation path.
                </p>
              </div>
              <button
                type="button"
                disabled
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white opacity-50"
              >
                Generate AI Insights
              </button>
            </div>
            <div className="mt-6 space-y-4 text-sm leading-6 text-gray-700">
              <p>
                The selected report currently has{" "}
                <span className="font-semibold text-gray-900">
                  {activeClients?.toLocaleString() ?? "0"} active clients
                </span>
                , with{" "}
                <span className="font-semibold text-gray-900">
                  {frontEndClients?.toLocaleString() ?? "0"} front-end
                </span>{" "}
                and{" "}
                <span className="font-semibold text-gray-900">
                  {backEndClients?.toLocaleString() ?? "0"} back-end
                </span>{" "}
                clients.
              </p>
              <p>
                Retention and renewal signals should be reviewed alongside the
                Charts tab, especially CSM workload, client buy-in, and progress
                distribution. These are the first places to look for operational
                constraints before drawing conclusions from churn or renewal rates.
              </p>
              <p>
                Once AI generation is approved, this panel can summarize trend
                changes, highlight unusual segments, and suggest follow-up questions
                for the selected company, CSM, program, and date range.
              </p>
            </div>
          </section>
          <aside className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-700">
              Inputs For Future AI
            </h3>
            <div className="mt-4 space-y-3 text-sm text-gray-700">
              <div className="rounded-md bg-gray-50 px-3 py-2">
                KPI snapshot
              </div>
              <div className="rounded-md bg-gray-50 px-3 py-2">
                Chart aggregates
              </div>
              <div className="rounded-md bg-gray-50 px-3 py-2">
                Date range and CSM filters
              </div>
              <div className="rounded-md bg-gray-50 px-3 py-2">
                Client/task operational signals
              </div>
            </div>
          </aside>
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
