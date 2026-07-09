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
import { Link, useSearchParams } from "react-router-dom";
import { ActiveClientsKpi } from "../components/dashboard/kpis/ActiveClientsKpi.tsx";
import { BackEndClientsKpi } from "../components/dashboard/kpis/BackEndClientsKpi.tsx";
import { ChurnPercentageKpi } from "../components/dashboard/kpis/ChurnPercentageKpi.tsx";
import { FrontEndClientsKpi } from "../components/dashboard/kpis/FrontEndClientsKpi.tsx";
import { OffBoardedClientsKpi } from "../components/dashboard/kpis/OffBoardedClientsKpi.tsx";
import { RetainedClientsKpi } from "../components/dashboard/kpis/RetainedClientsKpi.tsx";
import { RetentionPercentageKpi } from "../components/dashboard/kpis/RetentionPercentageKpi.tsx";
import { UpForRenewalKpi } from "../components/dashboard/kpis/UpForRenewalKpi.tsx";
import { ComingSoonModal, ComingSoonPanel } from "../components/ComingSoon.tsx";
import { supabase } from "../lib/supabase.ts";
import { useAccountContext } from "../lib/accountContext.tsx";
import {
  DEFAULT_PROGRAM_STATUS_LABELS,
  applyProgramStatusLabels,
  loadCompanyWorkspaceDefaults,
  type ProgramStatusLabelMap,
} from "../lib/companySettings.ts";
import {
  advocacyDefinitions,
  type AdvocacyAction,
  type AdvocacyType,
} from "../lib/clientAdvocacy.ts";

const MONTH_OPTIONS_COUNT = 25;
const FUTURE_MONTH_OPTIONS_COUNT = 12;

const COMPANY_QUERY_KEY = "companyId";
const CSM_QUERY_KEY = "csmId";
const SECONDARY_ASSIGNEE_QUERY_KEY = "secondaryAssigneeId";
const PROGRAM_QUERY_KEY = "program";
const OFFER_QUERY_KEY = "offerId";
const DETAIL_PAGE_SIZE = 25;
const DASHBOARD_QUERY_PAGE_SIZE = 1000;
const DASHBOARD_IN_FILTER_CHUNK_SIZE = 500;
const ACTIVE_CLIENT_STATUSES = new Set(["front-end", "back-end"]);
const PROFILE_UPKEEP_FRESHNESS_DAYS = 14;
const MILESTONE_MISMATCH_KEY = "milestone-mismatch";
const CHURN_REASON_COLOR_MAP: Record<string, string> = {
  financial: "#22c55e",
  overwhelm: "#2563eb",
  medical: "#facc15",
  refund: "#ef4444",
  paused: "#f59e0b",
  drop_off: "#a855f7",
  other: "#94a3b8",
  Other: "#94a3b8",
};

type DashboardTab = "overview" | "charts" | "ai";

type AdvocacyDetailKey = `advocacy:${AdvocacyType}:${AdvocacyAction}`;

type KpiDetailKey =
  | "active"
  | "front-end"
  | "back-end"
  | "off-boarded"
  | "retained"
  | "churned"
  | "renewing"
  | "active-renewing"
  | AdvocacyDetailKey;

interface DashboardRpcFilterParams {
  p_company_id: string;
  p_csm_id: string | null;
  p_secondary_assignee_id: string | null;
  p_program_value: string | null;
  p_program_values?: string[] | null;
  p_offer_id?: string | null;
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

interface CanonicalKpiCountsRow
  extends PrimaryKpiCountsRow,
    RetentionKpiCountsRow {
  paused_clients: number | null;
  suspended_clients: number | null;
}

async function fetchPagedDashboardRows<T>(
  buildQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown | null }>,
) {
  const rows: T[] = [];

  for (let from = 0; ; from += DASHBOARD_QUERY_PAGE_SIZE) {
    const to = from + DASHBOARD_QUERY_PAGE_SIZE - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) return { data: rows, error };

    const page = data ?? [];
    rows.push(...page);
    if (page.length < DASHBOARD_QUERY_PAGE_SIZE) break;
  }

  return { data: rows, error: null };
}

async function fetchDashboardRowsInChunksPaged<T>(
  ids: string[],
  buildQuery: (
    chunk: string[],
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown | null }>,
) {
  const rows: T[] = [];

  for (let index = 0; index < ids.length; index += DASHBOARD_IN_FILTER_CHUNK_SIZE) {
    const chunk = ids.slice(index, index + DASHBOARD_IN_FILTER_CHUNK_SIZE);

    for (let from = 0; ; from += DASHBOARD_QUERY_PAGE_SIZE) {
      const to = from + DASHBOARD_QUERY_PAGE_SIZE - 1;
      const { data, error } = await buildQuery(chunk, from, to);
      if (error) return { data: rows, error };
      rows.push(...(data ?? []));
      if ((data ?? []).length < DASHBOARD_QUERY_PAGE_SIZE) break;
    }
  }

  return { data: rows, error: null };
}

interface Company {
  glide_row_id: string;
  name: string | null;
  enable_secondary_assignee: boolean | null;
  program_paused_override: string | null;
  program_suspended_override: string | null;
}

interface AppCompany {
  id: string;
  legacy_glide_row_id: string | null;
  name?: string | null;
  enable_secondary_assignee?: boolean | null;
  migration_status: string | null;
}

interface TeamMember {
  id?: string | null;
  legacy_glide_row_id?: string | null;
  glide_row_id?: string | null;
  name: string | null;
  email?: string | null;
  is_archived: boolean | null;
  role?: string | null;
  role_id?: number | null;
  role_read_only_user?: boolean | null;
  role_hide_from_csm_list: boolean | null;
  hide_from_csm_list?: boolean | null;
  status?: string | null;
  capacity_number?: number | null;
}

interface Offer {
  glide_row_id: string;
  name: string | null;
}

interface OfferMilestone {
  glide_row_id: string;
  offer_id?: string | null;
  name: string | null;
  position?: number | null;
  order?: number | null;
  status?: string | null;
  archived_at?: string | null;
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
  renewal_date?: string | null;
}

interface ChartDatum {
  key: string;
  label: string;
  value: number;
}

interface DashboardChartData {
  programDistribution: ChartDatum[];
  buyInDistribution: ChartDatum[];
  progressDistribution: ChartDatum[];
  churnReasonDistribution: ChartDatum[];
  clientsByJourney: ChartDatum[];
  journeyMilestoneIds: string[];
  tasksByStatus: ChartDatum[];
  csmWorkload: ChartDatum[];
}

interface CapacityRow {
  id: string;
  name: string;
  activeClients: number;
  capacity: number | null;
}

interface AdvocacyMetric {
  type: AdvocacyType;
  label: string;
  asked: number;
  received: number;
}

interface AdvocacyDetail {
  type: AdvocacyType;
  action: AdvocacyAction;
  label: string;
}

type AdvocacySummaryColumn =
  | "advocacy_review_last_asked_at"
  | "advocacy_review_last_received_at"
  | "advocacy_testimonial_last_asked_at"
  | "advocacy_testimonial_last_received_at"
  | "advocacy_referral_last_asked_at"
  | "advocacy_referral_last_received_at"
  | "advocacy_renewal_upsell_last_asked_at"
  | "advocacy_renewal_upsell_last_received_at";

const advocacySummaryDateColumns: Record<
  AdvocacyType,
  Record<AdvocacyAction, AdvocacySummaryColumn>
> = {
  review: {
    asked: "advocacy_review_last_asked_at",
    received: "advocacy_review_last_received_at",
  },
  testimonial: {
    asked: "advocacy_testimonial_last_asked_at",
    received: "advocacy_testimonial_last_received_at",
  },
  referral: {
    asked: "advocacy_referral_last_asked_at",
    received: "advocacy_referral_last_received_at",
  },
  renewal_upsell: {
    asked: "advocacy_renewal_upsell_last_asked_at",
    received: "advocacy_renewal_upsell_last_received_at",
  },
};

interface TtvMetric {
  averageDays: number | null;
  reachedCount: number;
  configuredMilestones: number;
  reachedClients: ChartClientRow[];
  ttvMilestones: Array<{
    id: string;
    name: string;
    offerId: string | null;
    offerName: string;
  }>;
}

type ChartClientRow = Record<string, unknown> & {
  glide_row_id: string;
  client_name: string | null;
  client_image?: string | null;
  program_status_value: string | null;
  outcomes_buy_in_for_filtering: string | null;
  outcomes_progress_for_filtering: string | null;
  next_steps_value?: string | null;
  csm_date_of_last_contact?: string | null;
  csm_date_of_next_contact?: string | null;
  offer_milestones_current_milestone_id?: string | null;
  offer_milestones_current_milestone_change_date?: string | null;
  outcomes_progress_date?: string | null;
  outcomes_buy_in_date?: string | null;
  churn_reason_value?: string | null;
  offer_milestones_current_offer_id: string | null;
  csm_team_member_id: string | null;
  csm_secondary_assignee_id?: string | null;
  client_age_date_onboarded?: string | null;
  client_age_date_offboarded?: string | null;
  client_age_date_offboarded_for_filtering?: string | null;
  current_contract_start_date?: string | null;
  current_contract_of_days?: number | null;
  current_contract_end_date?: string | null;
};

interface ProfileUpkeepHistoryRow {
  legacy_client_glide_row_id: string | null;
  event_type: string | null;
  next_steps: string | null;
  last_contact_at: string | null;
  next_contact_at: string | null;
  progress_status: string | null;
  buy_in_status: string | null;
  created_at: string | null;
}

type ProfileUpkeepFieldKey =
  | "nextSteps"
  | "milestone"
  | "lastContact"
  | "nextContact"
  | "progress"
  | "buyIn";

interface ProfileUpkeepSummary {
  clientCount: number;
  checkedFieldCount: number;
  freshFieldCount: number;
  averageScore: number;
  completeClientCount: number;
  fieldScores: Record<ProfileUpkeepFieldKey, number>;
  clients: Array<{
    client: ChartClientRow;
    score: number;
    complete: boolean;
    fields: Record<ProfileUpkeepFieldKey, boolean>;
  }>;
}

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
  current_contract_end_date_for_filtering?: string | null;
};

interface OfferKpiHistoryRow {
  client_id: string | null;
  modified_date?: string | null;
  original_value?: string | null;
  value?: string | null;
}

interface AppKpiHistoryRow {
  legacy_client_glide_row_id: string | null;
  event_type: string | null;
  created_at?: string | null;
  payload: Record<string, unknown> | null;
}

interface CompanyRetentionSettingsRow {
  allow_status_change_retention: boolean | null;
}

interface DashboardRetentionFastRow {
  retained_clients: number | string | null;
  retained_client_ids: string[] | null;
  retained_events:
    | Array<{
        client_id?: string | null;
        retained_at?: string | null;
      }>
    | null;
}

interface OfferKpiContractRow {
  client_id: string | null;
  end_date: string | null;
}

type TtvClientRow = {
  glide_row_id: string;
  client_name?: string | null;
  client_image?: string | null;
  csm_team_member_id?: string | null;
  client_age_date_onboarded?: string | null;
  current_contract_start_date?: string | null;
};

type TtvProgressRow = {
  client_id: string | null;
  milestone_id: string | null;
  completion_date: string | null;
  time_to_hit_days?: number | null;
};

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

function listMonthOptionsDescending(futureMonthCount = 0) {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = futureMonthCount; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const key = getMonthKeyFromDate(d);
    out.push({ value: key, label: formatMonthLabel(key) });
  }
  for (let i = 1; i < MONTH_OPTIONS_COUNT; i++) {
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

function programValuesFromFilter(value: string) {
  return value
    .split(",")
    .map((program) => program.trim())
    .filter(Boolean);
}

function programFilterFromValues(values: string[]) {
  return [...new Set(values.filter(Boolean))].join(",");
}

function chartKey(value: string | null | undefined) {
  const raw = value && String(value).trim() ? String(value).trim() : "";
  return raw || "not-set";
}

interface MonthDateRangeFilterProps {
  label: string;
  helpText?: string;
  futureMonthCount?: number;
  state: MonthDateFilterState;
  onChange: Dispatch<SetStateAction<MonthDateFilterState>>;
}

function MonthDateRangeFilter({
  label,
  helpText,
  futureMonthCount = 0,
  state,
  onChange,
}: MonthDateRangeFilterProps) {
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const monthOptions = useMemo(
    () => listMonthOptionsDescending(futureMonthCount),
    [futureMonthCount],
  );

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
      {helpText ? (
        <p className="mb-1.5 text-xs leading-snug text-gray-500">{helpText}</p>
      ) : null}

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

function MultiSelectDropdown({
  label,
  values,
  options,
  loading,
  loadingLabel,
  allLabel,
  onChange,
}: {
  label: string;
  values: string[];
  options: { value: string; label: string }[];
  loading: boolean;
  loadingLabel: string;
  allLabel: string;
  onChange: (values: string[]) => void;
}) {
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selectedLabels = options
    .filter((option) => values.includes(option.value))
    .map((option) => option.label);
  const summary =
    loading
      ? loadingLabel
      : selectedLabels.length === 0
        ? allLabel
        : selectedLabels.length <= 2
          ? selectedLabels.join(", ")
          : `${selectedLabels.slice(0, 2).join(", ")} +${selectedLabels.length - 2}`;

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      const el = rootRef.current;
      if (!el || !(event.target instanceof Node) || el.contains(event.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function toggleValue(value: string, checked: boolean) {
    if (checked) {
      onChange([...values, value]);
    } else {
      onChange(values.filter((selected) => selected !== value));
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <label
        htmlFor={`${baseId}-trigger`}
        className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1"
      >
        {label}
      </label>
      <button
        id={`${baseId}-trigger`}
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={loading}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
      >
        <span className="truncate">{summary}</span>
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

      {open ? (
        <div className="absolute z-40 mt-1 w-full min-w-[16rem] rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
          <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <input
              type="checkbox"
              checked={values.length === 0}
              onChange={() => onChange([])}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            {allLabel}
          </label>
          <div className="my-1 border-t border-gray-100" />
          <div className="max-h-56 overflow-y-auto">
            {options.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={values.includes(option.value)}
                  onChange={(event) =>
                    toggleValue(option.value, event.target.checked)
                  }
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="truncate">{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
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

function teamMemberOptionId(member: TeamMember) {
  return member.glide_row_id || member.legacy_glide_row_id || member.id || "";
}

function managesClients(member: TeamMember) {
  if (!teamMemberOptionId(member)) return false;
  if (member.is_archived === true) return false;
  if (member.status && member.status !== "active") return false;
  if (member.hide_from_csm_list === true) return false;
  if (member.role_hide_from_csm_list === true) return false;
  if (member.role_read_only_user === true) return false;
  if (member.role === "viewer") return false;
  return true;
}

function isActiveClientStatus(value: string | null | undefined) {
  return ACTIVE_CLIENT_STATUSES.has(value ?? "");
}

function mapAppChartClientRow(row: Record<string, unknown>): ChartClientRow {
  return {
    ...row,
    outcomes_buy_in_for_filtering:
      (row.outcomes_buy_in_for_filtering as string | null | undefined) ??
      null,
    outcomes_progress_for_filtering:
      (row.outcomes_progress_for_filtering as string | null | undefined) ??
      null,
  } as ChartClientRow;
}

function countBy<T>(
  rows: T[],
  getKey: (row: T) => string | null | undefined,
  labelMap = new Map<string, string>(),
) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const raw = getKey(row);
    const key = chartKey(raw);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return [...counts.entries()]
    .map(([key, value]) => ({
      key,
      label: labelMap.get(key) ?? displayLabel(key),
      value,
    }))
    .sort((a, b) => b.value - a.value);
}

function countByOrdered<T>(
  rows: T[],
  getKey: (row: T) => string | null | undefined,
  labelMap = new Map<string, string>(),
  orderMap = new Map<string, number>(),
) {
  return countBy(rows, getKey, labelMap).sort((a, b) => {
    const aOrder = orderMap.get(a.key) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = orderMap.get(b.key) ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    if (a.value !== b.value) return b.value - a.value;
    return a.label.localeCompare(b.label);
  });
}

function chartTotal(data: ChartDatum[]) {
  return data.reduce((sum, item) => sum + item.value, 0);
}

function advocacyDetailKey(type: AdvocacyType, action: AdvocacyAction): AdvocacyDetailKey {
  return `advocacy:${type}:${action}`;
}

function parseAdvocacyDetailKey(key: KpiDetailKey | null): AdvocacyDetail | null {
  if (!key?.startsWith("advocacy:")) return null;
  const [, rawType, rawAction] = key.split(":");
  const definition = advocacyDefinitions.find(
    (item) => item.type === rawType,
  );
  const action =
    rawAction === "asked" || rawAction === "received" ? rawAction : null;
  if (!definition || !action) return null;
  return {
    type: definition.type,
    action,
    label: definition.label,
  };
}

function advocacyDateInWindow(
  value: unknown,
  startDate: string,
  endDate: string,
) {
  const date = dateFromValue(value);
  if (!date) return false;
  if (startDate && date < new Date(`${startDate}T00:00:00.000Z`)) return false;
  if (endDate && date >= addDays(new Date(`${endDate}T00:00:00.000Z`), 1)) {
    return false;
  }
  return true;
}

function dateFromValue(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetweenDates(start: Date, end: Date) {
  return Math.max(
    0,
    Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
  );
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

function dateInputValueFromDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(value: unknown) {
  const date = dateFromValue(value);
  if (!date) return "--";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function renewalKpiDateRange(dateRange: MonthDateFilterState) {
  if (dateRange.startDate || dateRange.endDate) {
    return {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      usesDefaultHorizon: false,
    };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return {
    startDate: "",
    endDate: dateInputValueFromDate(addDays(today, 30)),
    usesDefaultHorizon: true,
  };
}

function isInDateRange(value: unknown, startDate: string, endDate: string) {
  const date = dateFromValue(value);
  if (!date) return false;
  const start = dayStart(startDate);
  const end = endDate ? addDays(new Date(`${endDate}T00:00:00.000Z`), 1) : null;
  return (!start || date >= start) && (!end || date < end);
}

function isFreshDate(value: unknown, freshnessStart: Date) {
  const date = dateFromValue(value);
  return Boolean(date && date >= freshnessStart);
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function calculateProfileUpkeep(
  clients: ChartClientRow[],
  historyRows: ProfileUpkeepHistoryRow[],
  freshnessStart: Date,
): ProfileUpkeepSummary {
  const activeClients = clients.filter((client) =>
    isActiveClientStatus(client.program_status_value),
  );
  const historyByClientId = new Map<string, ProfileUpkeepHistoryRow[]>();

  historyRows.forEach((row) => {
    if (!row.legacy_client_glide_row_id) return;
    const existing = historyByClientId.get(row.legacy_client_glide_row_id) ?? [];
    existing.push(row);
    historyByClientId.set(row.legacy_client_glide_row_id, existing);
  });

  const fieldFreshCounts: Record<ProfileUpkeepFieldKey, number> = {
    nextSteps: 0,
    milestone: 0,
    lastContact: 0,
    nextContact: 0,
    progress: 0,
    buyIn: 0,
  };
  let completeClientCount = 0;
  const clientScores: ProfileUpkeepSummary["clients"] = [];

  activeClients.forEach((client) => {
    const clientHistory = historyByClientId.get(client.glide_row_id) ?? [];
    const hasRecentHistory = (predicate: (row: ProfileUpkeepHistoryRow) => boolean) =>
      clientHistory.some((row) => isFreshDate(row.created_at, freshnessStart) && predicate(row));
    const fieldFreshness: Record<ProfileUpkeepFieldKey, boolean> = {
      nextSteps: hasRecentHistory((row) => hasText(row.next_steps)),
      milestone:
        hasRecentHistory((row) =>
          [
            "client_pathway_changed",
            "client_milestone_started",
            "client_milestone_completed",
          ].includes(row.event_type ?? ""),
        ) ||
        (hasText(client.offer_milestones_current_milestone_id) &&
          isFreshDate(
            client.offer_milestones_current_milestone_change_date,
            freshnessStart,
          )),
      lastContact:
        hasRecentHistory((row) => Boolean(row.last_contact_at)) ||
        isFreshDate(client.csm_date_of_last_contact, freshnessStart),
      nextContact:
        hasRecentHistory((row) => Boolean(row.next_contact_at)) ||
        isFreshDate(client.csm_date_of_next_contact, freshnessStart),
      progress:
        hasRecentHistory((row) => hasText(row.progress_status)) ||
        isFreshDate(client.outcomes_progress_date, freshnessStart),
      buyIn:
        hasRecentHistory((row) => hasText(row.buy_in_status)) ||
        isFreshDate(client.outcomes_buy_in_date, freshnessStart),
    };

    const freshForClient = Object.entries(fieldFreshness).filter(([, fresh]) => fresh);
    freshForClient.forEach(([field]) => {
      fieldFreshCounts[field as ProfileUpkeepFieldKey] += 1;
    });
    if (freshForClient.length === Object.keys(fieldFreshness).length) {
      completeClientCount += 1;
    }
    clientScores.push({
      client,
      score: Math.round(
        (freshForClient.length / Object.keys(fieldFreshness).length) * 100,
      ),
      complete: freshForClient.length === Object.keys(fieldFreshness).length,
      fields: fieldFreshness,
    });
  });

  const fieldKeys = Object.keys(fieldFreshCounts) as ProfileUpkeepFieldKey[];
  const checkedFieldCount = activeClients.length * fieldKeys.length;
  const freshFieldCount = fieldKeys.reduce(
    (sum, field) => sum + fieldFreshCounts[field],
    0,
  );

  return {
    clientCount: activeClients.length,
    checkedFieldCount,
    freshFieldCount,
    averageScore:
      checkedFieldCount === 0
        ? 0
        : Math.round((freshFieldCount / checkedFieldCount) * 100),
    completeClientCount,
    fieldScores: fieldKeys.reduce((scores, field) => {
      scores[field] =
        activeClients.length === 0
          ? 0
          : Math.round((fieldFreshCounts[field] / activeClients.length) * 100);
      return scores;
    }, {} as Record<ProfileUpkeepFieldKey, number>),
    clients: clientScores.sort(
      (a, b) =>
        a.score - b.score ||
        (a.client.client_name ?? "").localeCompare(b.client.client_name ?? ""),
    ),
  };
}

function passesReportEndDate(client: OfferKpiClientRow, endDate: string) {
  if (!endDate) return true;
  const onboarded = dateFromValue(client.client_age_date_onboarded);
  const end = dayAfter(endDate);
  return !onboarded || !end || onboarded < end;
}

function calculatedContractEndDate(client: OfferKpiClientRow) {
  const filteringEnd = dateFromValue(client.current_contract_end_date_for_filtering);
  if (filteringEnd) return filteringEnd;
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

function normalizedProgramStatus(value: unknown) {
  const key = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-");
  if (["front-end", "frontend", "front"].includes(key)) return "front-end";
  if (["back-end", "backend", "back"].includes(key)) return "back-end";
  return key || null;
}

function isLegacyRetainedStatusTransition(
  fromStatus: unknown,
  toStatus: unknown,
) {
  const from = normalizedProgramStatus(fromStatus);
  const to = normalizedProgramStatus(toStatus);
  return (
    (from === "front-end" && to === "back-end") ||
    (from === "back-end" && to === "back-end")
  );
}

function isRetainOsRetainedStatusTransition(
  fromStatus: unknown,
  toStatus: unknown,
) {
  const from = normalizedProgramStatus(fromStatus);
  const to = normalizedProgramStatus(toStatus);
  return (
    (from === "front-end" && to === "front-end") ||
    (from === "front-end" && to === "back-end") ||
    (from === "back-end" && to === "back-end")
  );
}

function appRetentionDate(row: AppKpiHistoryRow) {
  if (row.event_type !== "client_retention_recorded") return null;
  const contract =
    row.payload && typeof row.payload === "object"
      ? (row.payload.contract as Record<string, unknown> | undefined)
      : undefined;
  return (
    dateFromValue(contract?.start_date) ??
    dateFromValue(contract?.startDate) ??
    dateFromValue(row.payload?.retention_date) ??
    dateFromValue(row.created_at)
  );
}

function appRetainedEventDate(
  row: AppKpiHistoryRow,
  allowStatusChangeRetention: boolean,
) {
  if (row.event_type === "client_retention_recorded") {
    return appRetentionDate(row);
  }
  if (!allowStatusChangeRetention || row.event_type !== "client_status_changed") {
    return null;
  }
  if (
    !isRetainOsRetainedStatusTransition(
      row.payload?.from_status,
      row.payload?.to_status,
    )
  ) {
    return null;
  }
  return dateFromValue(row.created_at);
}

async function loadStatusChangeRetentionSetting(companyId?: string | null) {
  if (!companyId) return false;
  const { data, error } = await supabase
    .from("company_settings")
    .select("allow_status_change_retention")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) {
    console.error("Failed to load retention settings:", error);
    return false;
  }
  return (
    (data as CompanyRetentionSettingsRow | null)?.allow_status_change_retention ===
    true
  );
}

function DonutChart({
  data,
  onItemClick,
  colorMap,
  maxItems = 5,
}: {
  data: ChartDatum[];
  onItemClick?: (item: ChartDatum) => void;
  colorMap?: Record<string, string>;
  maxItems?: number;
}) {
  const visibleData = data.slice(0, maxItems);
  const total = chartTotal(visibleData);
  const palette = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#60a5fa"];
  const colorForItem = (item: ChartDatum, index: number) =>
    colorMap?.[item.key] ?? palette[index % palette.length];
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
        {visibleData.map((item, index) => {
          const dash = (item.value / total) * 100;
          const circle = (
            <circle
              key={item.key}
              cx="21"
              cy="21"
              r="15.915"
              fill="transparent"
              stroke={colorForItem(item, index)}
              strokeWidth="7"
              strokeDasharray={`${dash} ${100 - dash}`}
              strokeDashoffset={offset}
              pointerEvents="none"
            />
          );
          offset -= dash;
          return circle;
        })}
      </svg>
      <div className="min-w-0 flex-1 space-y-2">
        {visibleData.map((item, index) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onItemClick?.(item)}
            disabled={!onItemClick}
            className="flex w-full items-center justify-between gap-3 rounded-sm text-left text-sm disabled:cursor-default enabled:cursor-pointer enabled:hover:text-indigo-700"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: colorForItem(item, index) }}
              />
              <span className="truncate text-gray-700">{item.label}</span>
            </div>
            <span className="font-medium text-gray-900">{item.value}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function BarChart({
  data,
  onItemClick,
}: {
  data: ChartDatum[];
  onItemClick?: (item: ChartDatum) => void;
}) {
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
        <button
          key={item.key}
          type="button"
          onClick={() => onItemClick?.(item)}
          disabled={!onItemClick}
          className="block w-full rounded-sm text-left disabled:cursor-default enabled:cursor-pointer enabled:hover:text-indigo-700"
        >
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
        </button>
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
    role,
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
  const [exportComingSoon, setExportComingSoon] = useState(false);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [appCompanyByLegacyId, setAppCompanyByLegacyId] = useState(
    new Map<string, AppCompany>(),
  );
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamMembersLoading, setTeamMembersLoading] = useState(false);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [baseProgramChoices, setBaseProgramChoices] = useState<ProgramChoice[]>([]);
  const [programChoicesLoading, setProgramChoicesLoading] = useState(false);
  const [programStatusLabels, setProgramStatusLabels] =
    useState<ProgramStatusLabelMap>(DEFAULT_PROGRAM_STATUS_LABELS);

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
  const [advocacyMetrics, setAdvocacyMetrics] = useState<AdvocacyMetric[]>(() =>
    advocacyDefinitions.map((definition) => ({
      type: definition.type,
      label: definition.label,
      asked: 0,
      received: 0,
    })),
  );
  const [advocacyLoading, setAdvocacyLoading] = useState(false);
  const [ttvMetric, setTtvMetric] = useState<TtvMetric>({
    averageDays: null,
    reachedCount: 0,
    configuredMilestones: 0,
    reachedClients: [],
    ttvMilestones: [],
  });
  const [ttvLoading, setTtvLoading] = useState(false);
  const [ttvMilestonesOpen, setTtvMilestonesOpen] = useState(false);
  const kpiLoading = primaryKpiLoading || retentionKpiLoading;
  const [activeDetailKey, setActiveDetailKey] = useState<KpiDetailKey | null>(null);
  const [detailSearch, setDetailSearch] = useState("");
  const [detailPage, setDetailPage] = useState(1);
  const [detailRenewalSortDirection, setDetailRenewalSortDirection] =
    useState<"asc" | "desc">("asc");
  const [detailRows, setDetailRows] = useState<ClientRow[]>([]);
  const [detailTotalCount, setDetailTotalCount] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [kpiInfoModal, setKpiInfoModal] = useState<{
    title: string;
    description: string;
  } | null>(null);
  const [chartData, setChartData] = useState<DashboardChartData>({
    programDistribution: [],
    buyInDistribution: [],
    progressDistribution: [],
    churnReasonDistribution: [],
    clientsByJourney: [],
    journeyMilestoneIds: [],
    tasksByStatus: [],
    csmWorkload: [],
  });
  const [capacityRows, setCapacityRows] = useState<CapacityRow[]>([]);
  const [chartClients, setChartClients] = useState<ChartClientRow[]>([]);
  const [, setProfileUpkeep] =
    useState<ProfileUpkeepSummary | null>(null);
  const [chartDetail, setChartDetail] = useState<{
    title: string;
    rows: ChartClientRow[];
  } | null>(null);
  const canUseDashboardDrilldowns = role !== "viewer";
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

  const appliedAppCompany = appliedFilters.companyId
    ? appCompanyByLegacyId.get(appliedFilters.companyId) ?? null
    : null;
  const appliedUsesAppClients =
    appliedAppCompany?.migration_status === "pilot" ||
    appliedAppCompany?.migration_status === "migrated";
  const pendingProgramValues = useMemo(
    () => programValuesFromFilter(pendingFilters.program),
    [pendingFilters.program],
  );
  const appliedProgramValues = useMemo(
    () => programValuesFromFilter(appliedFilters.program),
    [appliedFilters.program],
  );

  const availableTeamMembers = useMemo(
    () => teamMembers.filter(managesClients),
    [teamMembers],
  );

  const activeManagerIds = useMemo(
    () => new Set(availableTeamMembers.map(teamMemberOptionId).filter(Boolean)),
    [availableTeamMembers],
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
    () => {
      const map = new Map<string, string>();
      for (const member of teamMembers) {
        const name = member.name ?? "Unassigned";
        for (const id of [
          member.glide_row_id,
          member.legacy_glide_row_id,
          member.id,
        ]) {
          if (id) map.set(id, name);
        }
      }
      return map;
    },
    [teamMembers],
  );

  const programChoices = useMemo(
    () =>
      applyProgramStatusLabels(
        baseProgramChoices.filter((choice) => choice.program_value),
        programStatusLabels,
      )
        .map((choice) => {
          let displayLabel = choice.program_label ?? choice.program_value ?? "";

          if (
            choice.program_value === "paused" &&
            programStatusLabels.paused === DEFAULT_PROGRAM_STATUS_LABELS.paused &&
            pendingCompany?.program_paused_override
          ) {
            displayLabel = pendingCompany.program_paused_override;
          }

          if (
            choice.program_value === "suspended" &&
            programStatusLabels.suspended ===
              DEFAULT_PROGRAM_STATUS_LABELS.suspended &&
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
    [baseProgramChoices, pendingCompany, programStatusLabels],
  );

  const detailTitle = useMemo(() => {
    const advocacyDetail = parseAdvocacyDetailKey(activeDetailKey);
    if (advocacyDetail) {
      return `${advocacyDetail.label} ${
        advocacyDetail.action === "asked" ? "Asked" : "Received"
      }`;
    }
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
  const detailShowsRenewalDate =
    activeDetailKey === "renewing" || activeDetailKey === "active-renewing";
  const detailGridClass = detailShowsRenewalDate
    ? "grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.85fr)_minmax(7.5rem,0.65fr)] gap-4"
    : "grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4";

  const openDetailDrawer = (key: KpiDetailKey) => {
    if (!canUseDashboardDrilldowns) return;
    setActiveDetailKey(key);
    setDetailSearch("");
    setDetailPage(1);
    setDetailRenewalSortDirection("asc");
  };

  const closeDetailDrawer = () => {
    setActiveDetailKey(null);
    setDetailSearch("");
    setDetailPage(1);
    setDetailRenewalSortDirection("asc");
  };

  const openKpiInfoModal = (title: string, description: string) => {
    setKpiInfoModal({ title, description });
  };

  const closeKpiInfoModal = () => {
    setKpiInfoModal(null);
  };

  const openChartDetail = (
    title: string,
    item: ChartDatum,
    getKey: (client: ChartClientRow) => string | null | undefined,
  ) => {
    if (!canUseDashboardDrilldowns) return;
    setChartDetail({
      title: `${title}: ${item.label}`,
      rows: chartClients.filter((client) => chartKey(getKey(client)) === item.key),
    });
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
      p_program_value:
        appliedProgramValues.length === 1 ? appliedProgramValues[0] : null,
      p_program_values:
        appliedProgramValues.length > 0 ? appliedProgramValues : null,
      p_offer_id: appliedFilters.offerId || null,
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
      appliedFilters.offerId,
      appliedProgramValues,
      appliedFilters.secondaryAssigneeId,
      appliedShowSecondaryFilter,
    ],
  );

  const appliedRenewalDateRange = useMemo(
    () => renewalKpiDateRange(appliedFilters.dateRange),
    [appliedFilters.dateRange.endDate, appliedFilters.dateRange.startDate],
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
      const [backupResult, appResult] = await Promise.all([
        query,
        supabase
          .from("companies")
          .select("id, legacy_glide_row_id, name, migration_status, enable_secondary_assignee"),
      ]);

      if (backupResult.error) {
        console.error("Failed to load companies:", backupResult.error);
        setCompanies([]);
      } else {
        const rows = [...((backupResult.data ?? []) as Company[])];
        const existingCompanyIds = new Set(
          rows.map((company) => company.glide_row_id),
        );
        ((appResult.data ?? []) as AppCompany[]).forEach((company) => {
          if (!company.legacy_glide_row_id) return;
          if (existingCompanyIds.has(company.legacy_glide_row_id)) return;
          rows.push({
            glide_row_id: company.legacy_glide_row_id,
            name: company.name ?? null,
            enable_secondary_assignee:
              company.enable_secondary_assignee ?? null,
            program_paused_override: null,
            program_suspended_override: null,
          });
        });
        setCompanies(
          rows.sort((left, right) =>
            (left.name ?? "").localeCompare(right.name ?? ""),
          ),
        );
      }

      if (appResult.error) {
        console.error("Failed to load app companies:", appResult.error);
      } else {
        setAppCompanyByLegacyId(
          new Map(
            ((appResult.data ?? []) as AppCompany[])
              .filter((company) => company.legacy_glide_row_id)
              .map((company) => [
                company.legacy_glide_row_id as string,
                company,
              ]),
          ),
        );
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

      const appCompany = appCompanyByLegacyId.get(pendingFilters.companyId);
      const usesAppCompany =
        appCompany?.migration_status === "pilot" ||
        appCompany?.migration_status === "migrated";
      if (appCompany && usesAppCompany) {
        const { data, error } = await supabase
          .from("company_members")
          .select(
            "id, legacy_glide_row_id, name, email, role, hide_from_csm_list, capacity_number, status",
          )
          .eq("company_id", appCompany.id)
          .eq("status", "active")
          .order("name", { ascending: true });
        if (cancelled) return;
        if (error) {
          console.error("Failed to load app team members:", error);
          setTeamMembers([]);
        } else {
          setTeamMembers(
            ((data ?? []) as unknown as TeamMember[]).map((member) => ({
              ...member,
              glide_row_id: member.legacy_glide_row_id || member.id || "",
              is_archived: false,
            })),
          );
        }
      } else {
        const { data, error } = await supabase
          .from("backup_company_team")
          .select(
            "glide_row_id, name, email, is_archived, role_id, role_read_only_user, role_hide_from_csm_list, capacity_number",
          )
          .eq("company_id", pendingFilters.companyId)
          .order("name", { ascending: true });
        if (cancelled) return;
        if (error) console.error("Failed to load team members:", error);
        const rows = ((data ?? []) as unknown as TeamMember[]).map(
          (member) => ({ ...member, glide_row_id: member.glide_row_id ?? "" }),
        );
        setTeamMembers(rows);
      }

      setTeamMembersLoading(false);
    }

    loadTeamMembers();

    return () => {
      cancelled = true;
    };
  }, [appCompanyByLegacyId, pendingFilters.companyId]);

  useEffect(() => {
    if (!pendingFilters.companyId) {
      setOffers([]);
      setOffersLoading(false);
      return;
    }

    let cancelled = false;

    async function loadOffers() {
      setOffersLoading(true);

      const appCompany = appCompanyByLegacyId.get(pendingFilters.companyId);
      const usesAppCompany =
        appCompany?.migration_status === "pilot" ||
        appCompany?.migration_status === "migrated";
      const { data, error } = appCompany && usesAppCompany
        ? await supabase
            .from("company_offers")
            .select("glide_row_id, name")
            .eq("company_id", appCompany.id)
            .eq("status", "active")
            .order("name", { ascending: true })
        : await supabase
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
  }, [appCompanyByLegacyId, pendingFilters.companyId]);

  useEffect(() => {
    if (!pendingFilters.companyId) {
      setProgramStatusLabels(DEFAULT_PROGRAM_STATUS_LABELS);
      return;
    }

    let cancelled = false;

    async function loadWorkspaceDefaults() {
      const defaults = await loadCompanyWorkspaceDefaults(pendingFilters.companyId);
      if (!cancelled) setProgramStatusLabels(defaults.programStatusLabels);
    }

    void loadWorkspaceDefaults();

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
      (member) => teamMemberOptionId(member) === pendingFilters.csmId,
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
      (member) => teamMemberOptionId(member) === pendingFilters.secondaryAssigneeId,
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
    if (pendingProgramValues.length === 0) return;

    const validProgramValues = new Set(programChoices.map((choice) => choice.value));
    const validSelectedPrograms = pendingProgramValues.filter((value) =>
      validProgramValues.has(value),
    );

    if (validSelectedPrograms.length !== pendingProgramValues.length) {
      setPendingFilters((prev) => ({
        ...prev,
        program: programFilterFromValues(validSelectedPrograms),
      }));
    }
  }, [pendingProgramValues, programChoices]);

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
    const {
      p_program_values: _canonicalProgramValues,
      p_offer_id: _canonicalOfferId,
      ...legacyRpcFilterParams
    } = rpcFilterParams;

    async function loadClientSideFilteredKpis() {
      setPrimaryKpiLoading(true);
      setRetentionKpiLoading(true);

      const clientSourceTable = appliedUsesAppClients
        ? "clients"
        : "backup_company_clients";
      const companyColumn = appliedUsesAppClients
        ? "company_glide_row_id"
        : "company_id";
      const clientSelect = [
        "glide_row_id",
        "client_name",
        "client_image",
        ...(appliedUsesAppClients ? ["company_glide_row_id"] : []),
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
        "current_contract_end_date_for_filtering",
        ...(appliedUsesAppClients
          ? [
              "advocacy_review_last_asked_at",
              "advocacy_review_last_received_at",
              "advocacy_testimonial_last_asked_at",
              "advocacy_testimonial_last_received_at",
              "advocacy_referral_last_asked_at",
              "advocacy_referral_last_received_at",
              "advocacy_renewal_upsell_last_asked_at",
              "advocacy_renewal_upsell_last_received_at",
            ]
          : []),
      ].join(", ");

      const buildClientRowsQuery = (from: number, to: number) => {
        let query = supabase
          .from(clientSourceTable)
          .select(clientSelect)
          .eq(companyColumn, appliedFilters.companyId)
          .range(from, to);

        if (appliedFilters.offerId) {
          query = query.eq(
            "offer_milestones_current_offer_id",
            appliedFilters.offerId,
          );
        }
        if (assignedTeamMemberId) {
          query = query.or(
            `csm_team_member_id.eq.${assignedTeamMemberId},csm_secondary_assignee_id.eq.${assignedTeamMemberId}`,
          );
        } else if (appliedFilters.csmId) {
          query = query.eq("csm_team_member_id", appliedFilters.csmId);
        }
        if (appliedShowSecondaryFilter && appliedFilters.secondaryAssigneeId) {
          query = query.eq(
            "csm_secondary_assignee_id",
            appliedFilters.secondaryAssigneeId,
          );
        }
        if (appliedProgramValues.length === 1) {
          query = query.eq("program_status_value", appliedProgramValues[0]);
        } else if (appliedProgramValues.length > 1) {
          query = query.in("program_status_value", appliedProgramValues);
        }
        if (appliedFilters.clientStartDate.startDate) {
          query = query.gte(
            "client_age_date_onboarded",
            `${appliedFilters.clientStartDate.startDate}T00:00:00.000Z`,
          );
        }
        if (appliedFilters.clientStartDate.endDate) {
          query = query.lt(
            "client_age_date_onboarded",
            addDays(
              new Date(`${appliedFilters.clientStartDate.endDate}T00:00:00.000Z`),
              1,
            ).toISOString(),
          );
        }

        return query;
      };

      const { data: clientRows, error: clientsError } =
        await fetchPagedDashboardRows<OfferKpiClientRow>((from, to) =>
          buildClientRowsQuery(from, to) as unknown as PromiseLike<{
            data: OfferKpiClientRow[] | null;
            error: unknown | null;
          }>,
        );
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
            calculatedOffboardedDate(client),
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

      const renewalDateRange = appliedRenewalDateRange;
      const allowStatusChangeRetention = appliedUsesAppClients
        ? await loadStatusChangeRetentionSetting(appliedAppCompany?.id)
        : false;
      if (cancelled) return;
      const appRetentionEventTypes = allowStatusChangeRetention
        ? ["client_retention_recorded", "client_status_changed"]
        : ["client_retention_recorded"];
      const retentionFastQuery = appliedUsesAppClients
        ? supabase.rpc("dashboard_retention_counts_fast", {
            p_company_id: appliedFilters.companyId,
            p_csm_id: appliedFilters.csmId || null,
            p_secondary_assignee_id:
              appliedShowSecondaryFilter && appliedFilters.secondaryAssigneeId
                ? appliedFilters.secondaryAssigneeId
                : null,
            p_program_values:
              appliedProgramValues.length > 0 ? appliedProgramValues : null,
            p_offer_id: appliedFilters.offerId || null,
            p_client_start_date_from:
              appliedFilters.clientStartDate.startDate || null,
            p_client_start_date_to:
              appliedFilters.clientStartDate.endDate || null,
            p_date_range_start: renewalDateRange.startDate || null,
            p_date_range_end: renewalDateRange.endDate || null,
            p_assigned_team_member_id: assignedTeamMemberId || null,
          })
        : Promise.resolve({ data: [], error: null });
      const appHistoryQuery = appliedUsesAppClients
        ? fetchDashboardRowsInChunksPaged<AppKpiHistoryRow>(clientIds, (chunk, from, to) =>
            supabase
              .from("client_history_events")
              .select("legacy_client_glide_row_id, event_type, payload, created_at")
              .in("legacy_client_glide_row_id", chunk)
              .in("event_type", appRetentionEventTypes)
              .range(from, to),
          )
        : Promise.resolve({ data: [], error: null });
      const appContractsQuery = appliedUsesAppClients
        ? fetchDashboardRowsInChunksPaged<OfferKpiContractRow>(clientIds, (chunk, from, to) =>
            supabase
              .from("client_contracts")
              .select("client_id, end_date")
              .in("client_id", chunk)
              .is("archived_at", null)
              .or("status.is.null,status.neq.archived")
              .not("end_date", "is", null)
              .range(from, to),
          )
        : Promise.resolve({ data: [], error: null });
      const legacyHistoryQuery = fetchDashboardRowsInChunksPaged<OfferKpiHistoryRow>(
        clientIds,
        (chunk, from, to) =>
          supabase
            .from("backup_company_clients_history")
            .select("client_id, modified_date, original_value, value")
            .in("client_id", chunk)
            .eq("change_type_code", "program-status")
            .gte(
              "modified_date",
              renewalDateRange.startDate
                ? `${renewalDateRange.startDate}T00:00:00.000Z`
                : "0001-01-01T00:00:00.000Z",
            )
            .lt(
              "modified_date",
              renewalDateRange.endDate
                ? addDays(
                    new Date(`${renewalDateRange.endDate}T00:00:00.000Z`),
                    1,
                  ).toISOString()
                : "9999-12-31T00:00:00.000Z",
            )
            .range(from, to),
      );
      const legacyContractsQuery = fetchDashboardRowsInChunksPaged<OfferKpiContractRow>(
        clientIds,
        (chunk, from, to) =>
          supabase
            .from("backup_company_clients_contracts")
            .select("client_id, end_date")
            .in("client_id", chunk)
            .not("end_date", "is", null)
            .range(from, to),
      );

      const [
        appHistoryResult,
        legacyHistoryResult,
        appContractsResult,
        legacyContractsResult,
        retentionFastResult,
      ] = await Promise.all([
        appHistoryQuery,
        legacyHistoryQuery,
        appContractsQuery,
        legacyContractsQuery,
        retentionFastQuery,
      ]);

      if (cancelled) return;

      if (appHistoryResult.error) {
        console.error("Failed to load app-owned retained history:", appHistoryResult.error);
      }
      if (legacyHistoryResult.error) {
        console.error("Failed to load legacy retained history:", legacyHistoryResult.error);
      }
      if (appContractsResult.error) {
        console.error("Failed to load app-owned contract history:", appContractsResult.error);
      }
      if (legacyContractsResult.error) {
        console.error("Failed to load legacy contract history:", legacyContractsResult.error);
      }
      if (retentionFastResult.error) {
        console.error("Failed to load fast dashboard retention:", retentionFastResult.error);
      }

      const retainedIds = new Set<string>();
      let retainedEventCount = 0;
      ((appHistoryResult.data ?? []) as AppKpiHistoryRow[]).forEach((row) => {
        const clientId = row.legacy_client_glide_row_id;
        if (!clientId) return;
        const retentionDate = appRetainedEventDate(
          row,
          allowStatusChangeRetention,
        );
        if (
          retentionDate &&
          isInDateRange(
            retentionDate,
            renewalDateRange.startDate,
            renewalDateRange.endDate,
          )
        ) {
          retainedIds.add(clientId);
          retainedEventCount += 1;
        }
      });
      ((legacyHistoryResult.data ?? []) as OfferKpiHistoryRow[])
        .filter((row) =>
          isLegacyRetainedStatusTransition(row.original_value, row.value),
        )
        .forEach((row) => {
          if (!row.client_id) return;
          retainedIds.add(row.client_id);
          retainedEventCount += 1;
        });
      if (appliedUsesAppClients && !retentionFastResult.error) {
        retainedIds.clear();
        retainedEventCount = 0;
        const fastRow = (
          (retentionFastResult.data ?? []) as DashboardRetentionFastRow[]
        )[0];
        (fastRow?.retained_client_ids ?? []).forEach((clientId) => {
          if (clientById.has(clientId)) retainedIds.add(clientId);
        });
        retainedEventCount = Number(fastRow?.retained_clients ?? retainedIds.size);
      }
      const churnedIds = new Set(churned.map((client) => client.glide_row_id));
      const renewingIds = new Set<string>();
      const currentSummaryRenewingIds = new Set<string>();

      reportClients.forEach((client) => {
        if (["paused", "suspended"].includes(client.program_status_value ?? "")) return;
        if (churnedIds.has(client.glide_row_id)) return;
        const contractEnd = calculatedContractEndDate(client);
        if (
          contractEnd &&
          isInDateRange(
            contractEnd,
            renewalDateRange.startDate,
            renewalDateRange.endDate,
          )
        ) {
          renewingIds.add(client.glide_row_id);
          currentSummaryRenewingIds.add(client.glide_row_id);
        }
      });

      const contractRows = [
        ...((appContractsResult.data ?? []) as OfferKpiContractRow[]),
        ...((legacyContractsResult.data ?? []) as OfferKpiContractRow[]),
      ];
      contractRows.forEach((contract) => {
        if (!contract.client_id || !contract.end_date) return;
        const client = clientById.get(contract.client_id);
        if (!client) return;
        if (["paused", "suspended"].includes(client.program_status_value ?? "")) return;
        if (churnedIds.has(contract.client_id)) return;
        if (
          isInDateRange(
            contract.end_date,
            renewalDateRange.startDate,
            renewalDateRange.endDate,
          )
        ) {
          renewingIds.add(contract.client_id);
        }
      });

      setRetainedClients(retainedEventCount);
      setRenewingClientsCount(renewingIds.size);
      setRetentionPercentage(
        renewingIds.size === 0
          ? 0
          : Math.round((retainedEventCount / renewingIds.size) * 100),
      );
      setActiveRenewingClients(
        [...currentSummaryRenewingIds].filter((id) => {
          const client = clientById.get(id);
          return (
            client &&
            ["front-end", "back-end"].includes(client.program_status_value ?? "")
          );
        }).length,
      );
      setRetentionKpiLoading(false);
    }

    async function loadCanonicalKpis() {
      setPrimaryKpiLoading(true);
      setRetentionKpiLoading(true);

      const { data, error } = await supabase.rpc(
        "dashboard_kpi_counts_canonical",
        {
          p_company_id: rpcFilterParams.p_company_id,
          p_csm_id: assignedTeamMemberId || rpcFilterParams.p_csm_id,
          p_secondary_assignee_id: rpcFilterParams.p_secondary_assignee_id,
          p_program_values: rpcFilterParams.p_program_values ?? null,
          p_offer_id: rpcFilterParams.p_offer_id ?? null,
          p_client_start_date_from: rpcFilterParams.p_client_start_date_from,
          p_client_start_date_to: rpcFilterParams.p_client_start_date_to,
          p_date_range_start: rpcFilterParams.p_date_range_start,
          p_date_range_end: rpcFilterParams.p_date_range_end,
        },
      );

      if (cancelled) return true;

      if (error) {
        console.error("Failed to load canonical dashboard KPIs:", error);
        return false;
      }

      const row = ((data ?? []) as CanonicalKpiCountsRow[])[0] ?? null;
      setActiveClients(Number(row?.active_clients ?? 0));
      setFrontEndClients(Number(row?.front_end_clients ?? 0));
      setBackEndClients(Number(row?.back_end_clients ?? 0));
      setOffBoardedClients(Number(row?.off_boarded_clients ?? 0));
      setChurnedClientsCount(Number(row?.churned_clients ?? 0));
      setChurnPercentage(
        row?.churn_percentage == null ? 0 : Number(row.churn_percentage),
      );
      setRetainedClients(Number(row?.retained_clients ?? 0));
      setRenewingClientsCount(Number(row?.renewing_clients ?? 0));
      setRetentionPercentage(
        row?.retention_percentage == null ? 0 : Number(row.retention_percentage),
      );
      setActiveRenewingClients(Number(row?.active_renewing_clients ?? 0));
      setPrimaryKpiLoading(false);
      setRetentionKpiLoading(false);
      return true;
    }

    async function loadPrimaryKpis() {
      setPrimaryKpiLoading(true);

      const { data, error } = await supabase.rpc(
        "dashboard_kpi_counts_primary",
        legacyRpcFilterParams,
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
        legacyRpcFilterParams,
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

    void (async () => {
      const shouldUseCanonicalKpis =
        !appliedUsesAppClients &&
        (Boolean(appliedFilters.offerId) || appliedProgramValues.length > 1);

      if (shouldUseCanonicalKpis) {
        const loadedCanonical = await loadCanonicalKpis();
        if (cancelled || loadedCanonical) return;
      }

      if (
        appliedUsesAppClients ||
        appliedFilters.offerId ||
        appliedProgramValues.length > 1
      ) {
        await loadClientSideFilteredKpis();
      } else {
        loadPrimaryKpis();
        loadRetentionKpis();
      }
    })();

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
    appliedRenewalDateRange.endDate,
    appliedRenewalDateRange.startDate,
    appliedFilters.offerId,
    appliedFilters.program,
    appliedFilters.secondaryAssigneeId,
    appliedShowSecondaryFilter,
    appliedAppCompany?.id,
    appliedUsesAppClients,
    appliedProgramValues,
    reportVersion,
    rpcFilterParams,
    assignedTeamMemberId,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadAdvocacyMetrics() {
      const appCompany = appCompanyByLegacyId.get(appliedFilters.companyId);
      if (!appCompany?.id) {
        setAdvocacyMetrics(
          advocacyDefinitions.map((definition) => ({
            type: definition.type,
            label: definition.label,
            asked: 0,
            received: 0,
          })),
        );
        return;
      }

      setAdvocacyLoading(true);

      const advocacySummarySelect = [
        "glide_row_id",
        "advocacy_review_last_asked_at",
        "advocacy_review_last_received_at",
        "advocacy_testimonial_last_asked_at",
        "advocacy_testimonial_last_received_at",
        "advocacy_referral_last_asked_at",
        "advocacy_referral_last_received_at",
        "advocacy_renewal_upsell_last_asked_at",
        "advocacy_renewal_upsell_last_received_at",
      ].join(", ");

      let clientQuery = supabase
        .from("clients")
        .select(advocacySummarySelect)
        .eq("company_id", appCompany.id);

      if (appliedFilters.offerId) {
        clientQuery = clientQuery.eq(
          "offer_milestones_current_offer_id",
          appliedFilters.offerId,
        );
      }
      if (appliedProgramValues.length === 1) {
        clientQuery = clientQuery.eq("program_status_value", appliedProgramValues[0]);
      } else if (appliedProgramValues.length > 1) {
        clientQuery = clientQuery.in("program_status_value", appliedProgramValues);
      }
      if (appliedFilters.clientStartDate.startDate) {
        clientQuery = clientQuery.gte(
          "client_age_date_onboarded",
          appliedFilters.clientStartDate.startDate,
        );
      }
      if (appliedFilters.clientStartDate.endDate) {
        clientQuery = clientQuery.lt(
          "client_age_date_onboarded",
          `${appliedFilters.clientStartDate.endDate}T23:59:59.999`,
        );
      }
      if (appliedShowSecondaryFilter && appliedFilters.secondaryAssigneeId) {
        clientQuery = clientQuery.eq(
          "csm_secondary_assignee_id",
          appliedFilters.secondaryAssigneeId,
        );
      }
      if (appliedFilters.csmId) {
        clientQuery = clientQuery.eq("csm_team_member_id", appliedFilters.csmId);
      }

      const { data: clientRows, error: clientError } = await clientQuery.limit(5000);
      if (clientError) {
        console.error("Failed to load advocacy client summary rows:", clientError);
        if (!cancelled) setAdvocacyLoading(false);
        return;
      }

      let eventQuery = supabase
        .from("client_advocacy_events")
        .select("advocacy_type, action, client_legacy_id")
        .eq("company_id", appCompany.id);

      if (appliedFilters.csmId) {
        eventQuery = eventQuery.eq("csm_team_member_id", appliedFilters.csmId);
      }
      if (appliedFilters.dateRange.startDate) {
        eventQuery = eventQuery.gte("occurred_at", appliedFilters.dateRange.startDate);
      }
      if (appliedFilters.dateRange.endDate) {
        eventQuery = eventQuery.lt(
          "occurred_at",
          `${appliedFilters.dateRange.endDate}T23:59:59.999`,
        );
      }

      const { data: events, error } = await eventQuery.limit(5000);
      if (error) {
        console.error("Failed to load advocacy metrics:", error);
        if (!cancelled) setAdvocacyLoading(false);
        return;
      }

      const nextMetrics = advocacyDefinitions.map((definition) => {
        const matchingEvents = ((events ?? []) as Record<string, unknown>[]).filter(
          (event) =>
            event.advocacy_type === definition.type,
        );
        const askedClientIds = new Set(
          matchingEvents
            .filter((event) => event.action === "asked")
            .map((event) => String(event.client_legacy_id ?? ""))
            .filter(Boolean),
        );
        const receivedClientIds = new Set(
          matchingEvents
            .filter((event) => event.action === "received")
            .map((event) => String(event.client_legacy_id ?? ""))
            .filter(Boolean),
        );

        for (const row of ((clientRows ?? []) as unknown as Record<
          string,
          unknown
        >[])) {
          const clientId = String(row.glide_row_id ?? "");
          if (!clientId) continue;
          for (const action of ["asked", "received"] as AdvocacyAction[]) {
            const column = advocacySummaryDateColumns[definition.type][action];
            if (
              advocacyDateInWindow(
                row[column],
                appliedFilters.dateRange.startDate,
                appliedFilters.dateRange.endDate,
              )
            ) {
              (action === "asked" ? askedClientIds : receivedClientIds).add(clientId);
            }
          }
        }

        return {
          type: definition.type,
          label: definition.label,
          asked: askedClientIds.size,
          received: receivedClientIds.size,
        };
      });

      if (!cancelled) {
        setAdvocacyMetrics(nextMetrics);
        setAdvocacyLoading(false);
      }
    }

    void loadAdvocacyMetrics();

    return () => {
      cancelled = true;
    };
  }, [
    appCompanyByLegacyId,
    appliedFilters.clientStartDate.endDate,
    appliedFilters.clientStartDate.startDate,
    appliedFilters.companyId,
    appliedFilters.csmId,
    appliedFilters.dateRange.endDate,
    appliedFilters.dateRange.startDate,
    appliedRenewalDateRange.endDate,
    appliedRenewalDateRange.startDate,
    appliedFilters.offerId,
    appliedFilters.program,
    appliedFilters.secondaryAssigneeId,
    appliedProgramValues,
    appliedShowSecondaryFilter,
    reportVersion,
  ]);

  useEffect(() => {
    let cancelled = false;
    const resetMetric = () =>
      setTtvMetric({
        averageDays: null,
        reachedCount: 0,
        configuredMilestones: 0,
        reachedClients: [],
        ttvMilestones: [],
      });

    async function loadTtvMetric() {
      if (!appliedFilters.companyId) {
        resetMetric();
        setTtvLoading(false);
        return;
      }

      setTtvLoading(true);
      const appCompany = appCompanyByLegacyId.get(appliedFilters.companyId);
      const usesAppTtv =
        appCompany?.migration_status === "pilot" ||
        appCompany?.migration_status === "migrated";

      const offerIds = appliedFilters.offerId
        ? [appliedFilters.offerId]
        : offers
            .map((offer) => offer.glide_row_id)
            .filter((id): id is string => Boolean(id));

      if (!usesAppTtv && offerIds.length === 0) {
        if (!cancelled) {
          resetMetric();
          setTtvLoading(false);
        }
        return;
      }

      let ttvMilestoneResult;
      if (usesAppTtv && appCompany?.id) {
        let milestoneQuery = supabase
          .from("company_offer_milestones")
          .select("glide_row_id, offer_id, name")
          .eq("company_id", appCompany.id)
          .eq("is_ttv_milestone", true)
          .eq("status", "active");
        if (appliedFilters.offerId) {
          milestoneQuery = milestoneQuery.eq("offer_id", appliedFilters.offerId);
        }
        ttvMilestoneResult = await milestoneQuery;
      } else {
        ttvMilestoneResult = await supabase
          .from("backup_company_offer_milestones")
          .select("glide_row_id, offer_id, name")
          .in("offer_id", offerIds)
          .eq("ttv_milestone", true);
      }

      if (cancelled) return;
      if (ttvMilestoneResult.error) {
        console.error("Failed to load TTV milestones:", ttvMilestoneResult.error);
        resetMetric();
        setTtvLoading(false);
        return;
      }

      const ttvMilestoneIds = [
        ...new Set(
          ((ttvMilestoneResult.data ?? []) as { glide_row_id?: string | null }[])
            .map((milestone) => milestone.glide_row_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const offerNameById = new Map(
        offers.map((offer) => [
          offer.glide_row_id,
          offer.name ?? offer.glide_row_id,
        ]),
      );
      const ttvMilestones = (
        (ttvMilestoneResult.data ?? []) as {
          glide_row_id?: string | null;
          offer_id?: string | null;
          name?: string | null;
        }[]
      )
        .filter((milestone) => Boolean(milestone.glide_row_id))
        .map((milestone) => ({
          id: String(milestone.glide_row_id),
          name: milestone.name ?? String(milestone.glide_row_id),
          offerId: milestone.offer_id ?? null,
          offerName:
            (milestone.offer_id && offerNameById.get(milestone.offer_id)) ??
            milestone.offer_id ??
            "Unknown pathway",
        }));

      if (ttvMilestoneIds.length === 0) {
        resetMetric();
        setTtvLoading(false);
        return;
      }

      const clientTable = usesAppTtv ? "clients" : "backup_company_clients";
      const companyColumn = usesAppTtv ? "company_id" : "company_id";
      const companyValue = usesAppTtv && appCompany?.id
        ? appCompany.id
        : appliedFilters.companyId;
      let clientQuery = supabase
        .from(clientTable)
        .select(
          [
            "glide_row_id",
            "client_name",
            "client_image",
            "client_age_date_onboarded",
            "current_contract_start_date",
            "csm_team_member_id",
            "csm_secondary_assignee_id",
            "program_status_value",
            "offer_milestones_current_offer_id",
          ].join(", "),
        )
        .eq(companyColumn, companyValue)
        .range(0, 4999);

      if (assignedTeamMemberId) {
        clientQuery = clientQuery.or(
          `csm_team_member_id.eq.${assignedTeamMemberId},csm_secondary_assignee_id.eq.${assignedTeamMemberId}`,
        );
      } else if (appliedFilters.csmId) {
        clientQuery = clientQuery.eq("csm_team_member_id", appliedFilters.csmId);
      }
      if (appliedShowSecondaryFilter && appliedFilters.secondaryAssigneeId) {
        clientQuery = clientQuery.eq(
          "csm_secondary_assignee_id",
          appliedFilters.secondaryAssigneeId,
        );
      }
      if (appliedProgramValues.length === 1) {
        clientQuery = clientQuery.eq("program_status_value", appliedProgramValues[0]);
      } else if (appliedProgramValues.length > 1) {
        clientQuery = clientQuery.in("program_status_value", appliedProgramValues);
      }
      if (appliedFilters.offerId) {
        clientQuery = clientQuery.eq(
          "offer_milestones_current_offer_id",
          appliedFilters.offerId,
        );
      }
      if (appliedFilters.clientStartDate.startDate) {
        clientQuery = clientQuery.gte(
          "client_age_date_onboarded",
          `${appliedFilters.clientStartDate.startDate}T00:00:00.000Z`,
        );
      }
      if (appliedFilters.clientStartDate.endDate) {
        clientQuery = clientQuery.lt(
          "client_age_date_onboarded",
          addDays(
            new Date(`${appliedFilters.clientStartDate.endDate}T00:00:00.000Z`),
            1,
          ).toISOString(),
        );
      }

      const { data: clientsData, error: clientsError } = await clientQuery;
      if (cancelled) return;
      if (clientsError) {
        console.error("Failed to load TTV client rows:", clientsError);
        resetMetric();
        setTtvLoading(false);
        return;
      }

      const clients = ((clientsData ?? []) as unknown) as TtvClientRow[];
      const clientIds = clients
        .map((client) => client.glide_row_id)
        .filter((id): id is string => Boolean(id));
      if (clientIds.length === 0) {
        setTtvMetric({
          averageDays: null,
          reachedCount: 0,
          configuredMilestones: ttvMilestoneIds.length,
          reachedClients: [],
          ttvMilestones,
        });
        setTtvLoading(false);
        return;
      }

      const startDateByClientId = new Map(
        clients.map((client) => [
          client.glide_row_id,
          dateFromValue(
            client.client_age_date_onboarded ?? client.current_contract_start_date,
          ),
        ]),
      );
      const progressSelect = usesAppTtv
        ? "client_id, milestone_id, completion_date, time_to_hit_days"
        : "client_id, milestone_id, completion_date";
      let progressQuery = supabase
        .from(usesAppTtv ? "client_milestones" : "backup_company_clients_milestones")
        .select(progressSelect)
        .in("client_id", clientIds)
        .in("milestone_id", ttvMilestoneIds)
        .not("completion_date", "is", null)
        .range(0, 4999);

      if (usesAppTtv && appCompany?.id) {
        progressQuery = progressQuery.eq("company_id", appCompany.id);
      }
      if (appliedFilters.dateRange.startDate) {
        progressQuery = progressQuery.gte(
          "completion_date",
          `${appliedFilters.dateRange.startDate}T00:00:00.000Z`,
        );
      }
      if (appliedFilters.dateRange.endDate) {
        progressQuery = progressQuery.lt(
          "completion_date",
          addDays(
            new Date(`${appliedFilters.dateRange.endDate}T00:00:00.000Z`),
            1,
          ).toISOString(),
        );
      }

      const { data: progressData, error: progressError } = await progressQuery;
      if (cancelled) return;
      if (progressError) {
        console.error("Failed to load TTV milestone progress:", progressError);
        resetMetric();
        setTtvLoading(false);
        return;
      }

      const daysByClientId = new Map<string, number>();
      (((progressData ?? []) as unknown) as TtvProgressRow[]).forEach((progress) => {
        if (!progress.client_id) return;
        const completionDate = dateFromValue(progress.completion_date);
        const startDate = startDateByClientId.get(progress.client_id) ?? null;
        const days =
          startDate && completionDate
            ? daysBetweenDates(startDate, completionDate)
            : typeof progress.time_to_hit_days === "number"
              ? progress.time_to_hit_days
              : null;
        if (days === null || !Number.isFinite(days)) return;
        const previous = daysByClientId.get(progress.client_id);
        if (previous === undefined || days < previous) {
          daysByClientId.set(progress.client_id, days);
        }
      });

      const dayValues = [...daysByClientId.values()];
      const reachedClients = clients
        .filter((client) => daysByClientId.has(client.glide_row_id))
        .map((client) => ({
          ...client,
          client_name: client.client_name ?? null,
          client_image: client.client_image ?? null,
          csm_team_member_id: client.csm_team_member_id ?? null,
          csm_secondary_assignee_id: null,
          program_status_value: null,
          outcomes_buy_in_for_filtering: null,
          outcomes_progress_for_filtering: null,
          offer_milestones_current_offer_id: null,
        })) as ChartClientRow[];
      setTtvMetric({
        averageDays:
          dayValues.length > 0
            ? Math.round(dayValues.reduce((sum, value) => sum + value, 0) / dayValues.length)
            : null,
        reachedCount: dayValues.length,
        configuredMilestones: ttvMilestoneIds.length,
        reachedClients,
        ttvMilestones,
      });
      setTtvLoading(false);
    }

    void loadTtvMetric();

    return () => {
      cancelled = true;
    };
  }, [
    appCompanyByLegacyId,
    appliedFilters.clientStartDate.endDate,
    appliedFilters.clientStartDate.startDate,
    appliedFilters.companyId,
    appliedFilters.csmId,
    appliedFilters.dateRange.endDate,
    appliedFilters.dateRange.startDate,
    appliedFilters.offerId,
    appliedFilters.program,
    appliedFilters.secondaryAssigneeId,
    appliedProgramValues,
    appliedShowSecondaryFilter,
    assignedTeamMemberId,
    offers,
    reportVersion,
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
      const clientSourceTable = appliedUsesAppClients
        ? "clients"
        : "backup_company_clients";
      const companyColumn = appliedUsesAppClients
        ? "company_glide_row_id"
        : "company_id";
      const clientSelect = [
        "glide_row_id",
        "client_name",
        "client_image",
        ...(appliedUsesAppClients ? ["company_glide_row_id"] : []),
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
        "current_contract_end_date_for_filtering",
      ].join(", ");

      const buildDetailClientRowsQuery = (from: number, to: number) => {
        let query = supabase
          .from(clientSourceTable)
          .select(clientSelect)
          .eq(companyColumn, appliedFilters.companyId)
          .range(from, to);

        if (appliedFilters.offerId) {
          query = query.eq(
            "offer_milestones_current_offer_id",
            appliedFilters.offerId,
          );
        }
        if (assignedTeamMemberId) {
          query = query.or(
            `csm_team_member_id.eq.${assignedTeamMemberId},csm_secondary_assignee_id.eq.${assignedTeamMemberId}`,
          );
        } else if (appliedFilters.csmId) {
          query = query.eq("csm_team_member_id", appliedFilters.csmId);
        }
        if (appliedShowSecondaryFilter && appliedFilters.secondaryAssigneeId) {
          query = query.eq(
            "csm_secondary_assignee_id",
            appliedFilters.secondaryAssigneeId,
          );
        }
        if (appliedProgramValues.length === 1) {
          query = query.eq("program_status_value", appliedProgramValues[0]);
        } else if (appliedProgramValues.length > 1) {
          query = query.in("program_status_value", appliedProgramValues);
        }
        if (appliedFilters.clientStartDate.startDate) {
          query = query.gte(
            "client_age_date_onboarded",
            `${appliedFilters.clientStartDate.startDate}T00:00:00.000Z`,
          );
        }
        if (appliedFilters.clientStartDate.endDate) {
          query = query.lt(
            "client_age_date_onboarded",
            addDays(
              new Date(`${appliedFilters.clientStartDate.endDate}T00:00:00.000Z`),
              1,
            ).toISOString(),
          );
        }

        return query;
      };

      const { data: clientRows, error: clientsError } =
        await fetchPagedDashboardRows<OfferKpiClientRow>((from, to) =>
          buildDetailClientRowsQuery(from, to) as unknown as PromiseLike<{
            data: OfferKpiClientRow[] | null;
            error: unknown | null;
          }>,
        );
      if (cancelled) return;

      if (clientsError) {
        console.error("Failed to load KPI detail clients:", clientsError);
        setDetailRows([]);
        setDetailTotalCount(0);
        setDetailLoading(false);
        return;
      }

      const clients = (clientRows ?? []) as unknown as OfferKpiClientRow[];
      const reportClients = clients.filter((client) =>
        passesReportEndDate(client, appliedFilters.dateRange.endDate),
      );
      const clientIds = reportClients
        .map((client) => client.glide_row_id)
        .filter(Boolean);
      const clientById = new Map(
        reportClients.map((client) => [client.glide_row_id, client]),
      );

      const advocacyDetail = parseAdvocacyDetailKey(detailKey);
      if (advocacyDetail) {
        const appCompany = appCompanyByLegacyId.get(appliedFilters.companyId);
        if (!appCompany?.id) {
          setDetailRows([]);
          setDetailTotalCount(0);
          setDetailLoading(false);
          return;
        }

        let eventQuery = supabase
          .from("client_advocacy_events")
          .select("client_legacy_id")
          .eq("company_id", appCompany.id)
          .eq("advocacy_type", advocacyDetail.type)
          .eq("action", advocacyDetail.action);

        const eventCsmId = assignedTeamMemberId || appliedFilters.csmId;
        if (eventCsmId) {
          eventQuery = eventQuery.eq("csm_team_member_id", eventCsmId);
        }
        if (appliedFilters.dateRange.startDate) {
          eventQuery = eventQuery.gte(
            "occurred_at",
            `${appliedFilters.dateRange.startDate}T00:00:00.000Z`,
          );
        }
        if (appliedFilters.dateRange.endDate) {
          eventQuery = eventQuery.lt(
            "occurred_at",
            addDays(
              new Date(`${appliedFilters.dateRange.endDate}T00:00:00.000Z`),
              1,
            ).toISOString(),
          );
        }

        const { data: advocacyEvents, error: advocacyError } = await eventQuery
          .range(0, 4999);
        if (cancelled) return;
        if (advocacyError) {
          console.error("Failed to load advocacy KPI detail rows:", advocacyError);
          setDetailRows([]);
          setDetailTotalCount(0);
          setDetailLoading(false);
          return;
        }

        const advocacyClientIds = new Set(
          ((advocacyEvents ?? []) as { client_legacy_id?: string | null }[])
            .map((event) => event.client_legacy_id)
            .filter((id): id is string => Boolean(id)),
        );
        const summaryColumn =
          advocacySummaryDateColumns[advocacyDetail.type][advocacyDetail.action];
        let rows = reportClients.filter((client) =>
          advocacyClientIds.has(client.glide_row_id) ||
          advocacyDateInWindow(
            client[summaryColumn],
            appliedFilters.dateRange.startDate,
            appliedFilters.dateRange.endDate,
          ),
        );

        const search = detailSearch.trim().toLowerCase();
        if (search) {
          rows = rows.filter((client) =>
            String(client.client_name ?? "").toLowerCase().includes(search),
          );
        }

        rows = rows.sort((a, b) =>
          String(a.client_name ?? "").localeCompare(String(b.client_name ?? "")),
        );

        const totalCount = rows.length;
        const start = (detailPage - 1) * DETAIL_PAGE_SIZE;
        const pageRows = rows.slice(start, start + DETAIL_PAGE_SIZE);
        setDetailRows(
          pageRows.map((row) => ({
            glide_row_id: row.glide_row_id,
            client_name: row.client_name,
            client_image: row.client_image,
            csm_team_member_id: row.csm_team_member_id,
            renewal_date: null,
          })),
        );
        setDetailTotalCount(totalCount);
        setDetailLoading(false);
        return;
      }

      let retainedIds = new Set<string>();
      let retainedEventRows: Array<{
        client: OfferKpiClientRow;
        retainedAt: string | null;
      }> = [];
      let renewingIds = new Set<string>();
      let currentSummaryRenewingIds = new Set<string>();
      let churnedIds = new Set<string>();
      const renewalDateByClientId = new Map<string, string>();
      const detailRenewalDateRange = ["renewing", "active-renewing"].includes(
        detailKey,
      )
        ? appliedRenewalDateRange
        : appliedFilters.dateRange;
      const recordRenewalDate = (clientId: string, value: unknown) => {
        const candidate = dateFromValue(value);
        if (!candidate) return;
        const existing = dateFromValue(renewalDateByClientId.get(clientId));
        if (!existing || candidate > existing) {
          renewalDateByClientId.set(clientId, candidate.toISOString());
        }
      };

      if (detailKey === "renewing" || detailKey === "active-renewing") {
        currentSummaryRenewingIds = new Set<string>();
        reportClients.forEach((client) => {
          if (["paused", "suspended"].includes(client.program_status_value ?? "")) return;
          const contractEnd = calculatedContractEndDate(client);
          if (
            contractEnd &&
            isInDateRange(
              contractEnd,
              detailRenewalDateRange.startDate,
              detailRenewalDateRange.endDate,
            )
          ) {
            currentSummaryRenewingIds.add(client.glide_row_id);
            recordRenewalDate(client.glide_row_id, contractEnd);
          }
        });
        renewingIds = new Set(currentSummaryRenewingIds);
      }

      if (
        ["retained", "renewing", "active-renewing", "churned"].includes(
          detailKey,
        ) &&
        clientIds.length > 0
      ) {
        const allowStatusChangeRetention = appliedUsesAppClients
          ? await loadStatusChangeRetentionSetting(appliedAppCompany?.id)
          : false;
        if (cancelled) return;
        const appRetentionEventTypes = allowStatusChangeRetention
          ? ["client_retention_recorded", "client_status_changed"]
          : ["client_retention_recorded"];
        const retentionFastQuery = appliedUsesAppClients
          ? supabase.rpc("dashboard_retention_counts_fast", {
              p_company_id: appliedFilters.companyId,
              p_csm_id: appliedFilters.csmId || null,
              p_secondary_assignee_id:
                appliedShowSecondaryFilter && appliedFilters.secondaryAssigneeId
                  ? appliedFilters.secondaryAssigneeId
                  : null,
              p_program_values:
                appliedProgramValues.length > 0 ? appliedProgramValues : null,
              p_offer_id: appliedFilters.offerId || null,
              p_client_start_date_from:
                appliedFilters.clientStartDate.startDate || null,
              p_client_start_date_to:
                appliedFilters.clientStartDate.endDate || null,
              p_date_range_start: detailRenewalDateRange.startDate || null,
              p_date_range_end: detailRenewalDateRange.endDate || null,
              p_assigned_team_member_id: assignedTeamMemberId || null,
            })
          : Promise.resolve({ data: [], error: null });
        const appHistoryQuery = appliedUsesAppClients
          ? fetchDashboardRowsInChunksPaged<AppKpiHistoryRow>(clientIds, (chunk, from, to) =>
              supabase
                .from("client_history_events")
                .select("legacy_client_glide_row_id, event_type, payload, created_at")
                .in("legacy_client_glide_row_id", chunk)
                .in("event_type", appRetentionEventTypes)
                .range(from, to),
            )
          : Promise.resolve({ data: [], error: null });
        const appContractsQuery = appliedUsesAppClients
          ? fetchDashboardRowsInChunksPaged<OfferKpiContractRow>(clientIds, (chunk, from, to) =>
              supabase
                .from("client_contracts")
                .select("client_id, end_date")
                .in("client_id", chunk)
                .is("archived_at", null)
                .or("status.is.null,status.neq.archived")
                .not("end_date", "is", null)
                .range(from, to),
            )
          : Promise.resolve({ data: [], error: null });
        const legacyHistoryQuery = fetchDashboardRowsInChunksPaged<OfferKpiHistoryRow>(
          clientIds,
          (chunk, from, to) =>
            supabase
              .from("backup_company_clients_history")
              .select("client_id, modified_date, original_value, value")
              .in("client_id", chunk)
              .eq("change_type_code", "program-status")
              .gte(
                "modified_date",
                detailRenewalDateRange.startDate
                  ? `${detailRenewalDateRange.startDate}T00:00:00.000Z`
                  : "0001-01-01T00:00:00.000Z",
              )
              .lt(
                "modified_date",
                detailRenewalDateRange.endDate
                  ? addDays(
                      new Date(
                        `${detailRenewalDateRange.endDate}T00:00:00.000Z`,
                      ),
                      1,
                    ).toISOString()
                  : "9999-12-31T00:00:00.000Z",
              )
              .range(from, to),
        );
        const legacyContractsQuery = fetchDashboardRowsInChunksPaged<OfferKpiContractRow>(
          clientIds,
          (chunk, from, to) =>
            supabase
              .from("backup_company_clients_contracts")
              .select("client_id, end_date")
              .in("client_id", chunk)
              .not("end_date", "is", null)
              .range(from, to),
        );

        const [
          appHistoryResult,
          legacyHistoryResult,
          appContractsResult,
          legacyContractsResult,
          retentionFastResult,
        ] = await Promise.all([
          appHistoryQuery,
          legacyHistoryQuery,
          appContractsQuery,
          legacyContractsQuery,
          retentionFastQuery,
        ]);

        if (cancelled) return;

        if (appHistoryResult.error) {
          console.error("Failed to load app-owned KPI detail history:", appHistoryResult.error);
        }
        if (legacyHistoryResult.error) {
          console.error("Failed to load legacy KPI detail history:", legacyHistoryResult.error);
        }
        if (appContractsResult.error) {
          console.error("Failed to load app-owned KPI detail contracts:", appContractsResult.error);
        }
        if (legacyContractsResult.error) {
          console.error("Failed to load legacy KPI detail contracts:", legacyContractsResult.error);
        }
        if (retentionFastResult.error) {
          console.error("Failed to load fast KPI detail retention:", retentionFastResult.error);
        }

        retainedIds = new Set<string>();
        retainedEventRows = [];
        ((appHistoryResult.data ?? []) as AppKpiHistoryRow[]).forEach((row) => {
          const clientId = row.legacy_client_glide_row_id;
          if (!clientId) return;
          const retentionDate = appRetainedEventDate(
            row,
            allowStatusChangeRetention,
          );
          const client = clientById.get(clientId);
          if (
            retentionDate &&
            client &&
            isInDateRange(
              retentionDate,
              detailRenewalDateRange.startDate,
              detailRenewalDateRange.endDate,
            )
          ) {
            retainedIds.add(clientId);
            retainedEventRows.push({
              client,
              retainedAt: retentionDate.toISOString(),
            });
          }
        });
        ((legacyHistoryResult.data ?? []) as OfferKpiHistoryRow[])
          .filter((row) =>
            isLegacyRetainedStatusTransition(row.original_value, row.value),
          )
          .forEach((row) => {
            if (!row.client_id) return;
            const client = clientById.get(row.client_id);
            if (!client) return;
            retainedIds.add(row.client_id);
            retainedEventRows.push({
              client,
              retainedAt: row.modified_date ?? null,
            });
          });
        if (appliedUsesAppClients && !retentionFastResult.error) {
          retainedIds = new Set<string>();
          retainedEventRows = [];
          const fastRow = (
            (retentionFastResult.data ?? []) as DashboardRetentionFastRow[]
          )[0];
          const fastEvents = fastRow?.retained_events ?? [];
          const fastClientIds =
            fastEvents.length > 0
              ? fastEvents.flatMap((event) =>
                  event.client_id ? [event.client_id] : [],
                )
              : fastRow?.retained_client_ids ?? [];
          fastClientIds.forEach((clientId) => {
            const client = clientById.get(clientId);
            if (!client) return;
            retainedIds.add(clientId);
            retainedEventRows.push({
              client,
              retainedAt:
                fastEvents.find((event) => event.client_id === clientId)
                  ?.retained_at ?? null,
            });
          });
        }

        churnedIds = new Set(
          reportClients
            .filter((client) =>
              isChurnedClient(
                client,
                appliedFilters.dateRange.startDate,
                appliedFilters.dateRange.endDate,
              ),
            )
            .map((client) => client.glide_row_id),
        );

        renewingIds = new Set<string>();
        currentSummaryRenewingIds.forEach((id) => renewingIds.add(id));
        reportClients.forEach((client) => {
          if (["paused", "suspended"].includes(client.program_status_value ?? "")) return;
          if (churnedIds.has(client.glide_row_id)) return;
          const contractEnd = calculatedContractEndDate(client);
          if (
            contractEnd &&
            isInDateRange(
              contractEnd,
              detailRenewalDateRange.startDate,
              detailRenewalDateRange.endDate,
            )
          ) {
            renewingIds.add(client.glide_row_id);
            recordRenewalDate(client.glide_row_id, contractEnd);
          }
        });

        const contractRows = [
          ...((appContractsResult.data ?? []) as OfferKpiContractRow[]),
          ...((legacyContractsResult.data ?? []) as OfferKpiContractRow[]),
        ];
        contractRows.forEach((contract) => {
          if (!contract.client_id || !contract.end_date) return;
          const client = clientById.get(contract.client_id);
          if (!client) return;
          if (["paused", "suspended"].includes(client.program_status_value ?? "")) return;
          if (churnedIds.has(contract.client_id)) return;
          if (
            isInDateRange(
              contract.end_date,
              detailRenewalDateRange.startDate,
              detailRenewalDateRange.endDate,
            )
          ) {
            renewingIds.add(contract.client_id);
            recordRenewalDate(contract.client_id, contract.end_date);
          }
        });
      }

      if (detailKey === "retained") {
        let rows = retainedEventRows;
        const search = detailSearch.trim().toLowerCase();
        if (search) {
          rows = rows.filter(({ client }) =>
            String(client.client_name ?? "").toLowerCase().includes(search),
          );
        }
        rows = rows.sort((a, b) => {
          const aDate = dateFromValue(a.retainedAt);
          const bDate = dateFromValue(b.retainedAt);
          if (aDate && bDate && aDate.getTime() !== bDate.getTime()) {
            return bDate.getTime() - aDate.getTime();
          }
          if (aDate && !bDate) return -1;
          if (!aDate && bDate) return 1;
          return String(a.client.client_name ?? "").localeCompare(
            String(b.client.client_name ?? ""),
          );
        });
        const totalCount = rows.length;
        const start = (detailPage - 1) * DETAIL_PAGE_SIZE;
        const pageRows = rows.slice(start, start + DETAIL_PAGE_SIZE);
        setDetailRows(
          pageRows.map(({ client, retainedAt }) => ({
            glide_row_id: client.glide_row_id,
            client_name: client.client_name,
            client_image: client.client_image,
            csm_team_member_id: client.csm_team_member_id,
            renewal_date: retainedAt,
          })),
        );
        setDetailTotalCount(totalCount);
        setDetailLoading(false);
        return;
      }

      let rows = reportClients.filter((client) => {
        if (detailKey === "active") {
          return ["front-end", "back-end"].includes(client.program_status_value ?? "");
        }
        if (detailKey === "front-end" || detailKey === "back-end") {
          return client.program_status_value === detailKey;
        }
        if (detailKey === "off-boarded") {
          return (
            client.program_status_value === "off-boarded" &&
            isInDateRange(
              calculatedOffboardedDate(client),
              appliedFilters.dateRange.startDate,
              appliedFilters.dateRange.endDate,
            )
          );
        }
        if (detailKey === "churned") return churnedIds.has(client.glide_row_id);
        if (detailKey === "renewing") return renewingIds.has(client.glide_row_id);
        if (detailKey === "active-renewing") {
          return (
            currentSummaryRenewingIds.has(client.glide_row_id) &&
            ["front-end", "back-end"].includes(client.program_status_value ?? "")
          );
        }
        return false;
      });

      const search = detailSearch.trim().toLowerCase();
      if (search) {
        rows = rows.filter((client) =>
          String(client.client_name ?? "").toLowerCase().includes(search),
        );
      }

      rows = rows.sort((a, b) => {
        if (detailKey === "renewing" || detailKey === "active-renewing") {
          const aDate = dateFromValue(renewalDateByClientId.get(a.glide_row_id));
          const bDate = dateFromValue(renewalDateByClientId.get(b.glide_row_id));
          if (aDate && bDate && aDate.getTime() !== bDate.getTime()) {
            return detailRenewalSortDirection === "asc"
              ? aDate.getTime() - bDate.getTime()
              : bDate.getTime() - aDate.getTime();
          }
          if (aDate && !bDate) return detailRenewalSortDirection === "asc" ? -1 : 1;
          if (!aDate && bDate) return detailRenewalSortDirection === "asc" ? 1 : -1;
        }
        return String(a.client_name ?? "").localeCompare(
          String(b.client_name ?? ""),
        );
      });
      const totalCount = rows.length;
      const start = (detailPage - 1) * DETAIL_PAGE_SIZE;
      const pageRows = rows.slice(start, start + DETAIL_PAGE_SIZE);
      setDetailRows(
        pageRows.map((row) => ({
          glide_row_id: row.glide_row_id,
          client_name: row.client_name,
          client_image: row.client_image,
          csm_team_member_id: row.csm_team_member_id,
          renewal_date: renewalDateByClientId.get(row.glide_row_id) ?? null,
        })),
      );
      setDetailTotalCount(totalCount);

      setDetailLoading(false);
    }

    loadDetailRows();

    return () => {
      cancelled = true;
    };
  }, [
    activeDetailKey,
    appliedFilters.companyId,
    appliedFilters.clientStartDate.endDate,
    appliedFilters.clientStartDate.startDate,
    appliedFilters.csmId,
    appliedFilters.dateRange.endDate,
    appliedFilters.dateRange.startDate,
    appliedFilters.offerId,
    appliedFilters.program,
    appliedFilters.secondaryAssigneeId,
    appCompanyByLegacyId,
    appliedAppCompany?.id,
    appliedProgramValues,
    appliedShowSecondaryFilter,
    appliedUsesAppClients,
    assignedTeamMemberId,
    detailPage,
    detailRenewalSortDirection,
    detailSearch,
  ]);

  const shouldLoadDashboardCharts = activeDashboardTab === "charts";

  useEffect(() => {
    if (!appliedFilters.companyId) {
      setChartData({
        programDistribution: [],
        buyInDistribution: [],
        progressDistribution: [],
        churnReasonDistribution: [],
        clientsByJourney: [],
        journeyMilestoneIds: [],
        tasksByStatus: [],
        csmWorkload: [],
      });
      setCapacityRows([]);
      setChartClients([]);
      setProfileUpkeep(null);
      setChartsLoading(false);
      return;
    }

    if (!shouldLoadDashboardCharts) {
      setChartsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadCharts() {
      setChartsLoading(true);

      const clientSourceTable = appliedUsesAppClients
        ? "clients"
        : "backup_company_clients";
      const clientSelect = appliedUsesAppClients
        ? [
            "glide_row_id",
            "client_name",
            "client_image",
            "company_glide_row_id",
            "program_status_value",
            "outcomes_buy_in_for_filtering",
            "outcomes_progress_for_filtering",
            "next_steps_value",
            "csm_date_of_last_contact",
            "csm_date_of_next_contact",
            "offer_milestones_current_milestone_id",
            "offer_milestones_current_milestone_change_date",
            "outcomes_progress_date",
            "outcomes_buy_in_date",
            "churn_reason_value",
            "offer_milestones_current_offer_id",
            "csm_team_member_id",
            "csm_secondary_assignee_id",
            "client_age_date_onboarded",
          ].join(", ")
        : [
            "glide_row_id",
            "client_name",
            "client_image",
            "program_status_value",
            "outcomes_buy_in_for_filtering",
            "outcomes_progress_for_filtering",
            "next_steps_value",
            "csm_date_of_last_contact",
            "csm_date_of_next_contact",
            "offer_milestones_current_milestone_id",
            "offer_milestones_current_milestone_change_date",
            "outcomes_progress_date",
            "outcomes_buy_in_date",
            "churn_reason_value",
            "offer_milestones_current_offer_id",
            "csm_team_member_id",
            "csm_secondary_assignee_id",
            "client_age_date_onboarded",
          ].join(", ");
      const buildClientsQuery = (from: number, to: number) => {
        let query = supabase
          .from(clientSourceTable)
          .select(clientSelect)
          .eq(
            appliedUsesAppClients ? "company_glide_row_id" : "company_id",
            appliedFilters.companyId,
          )
          .range(from, to);

        if (assignedTeamMemberId) {
          query = query.or(
            `csm_team_member_id.eq.${assignedTeamMemberId},csm_secondary_assignee_id.eq.${assignedTeamMemberId}`,
          );
        } else if (appliedFilters.csmId) {
          query = query.eq("csm_team_member_id", appliedFilters.csmId);
        }
        if (appliedShowSecondaryFilter && appliedFilters.secondaryAssigneeId) {
          query = query.eq(
            "csm_secondary_assignee_id",
            appliedFilters.secondaryAssigneeId,
          );
        }
        if (appliedProgramValues.length === 1) {
          query = query.eq("program_status_value", appliedProgramValues[0]);
        } else if (appliedProgramValues.length > 1) {
          query = query.in("program_status_value", appliedProgramValues);
        }
        if (appliedFilters.offerId) {
          query = query.eq(
            "offer_milestones_current_offer_id",
            appliedFilters.offerId,
          );
        }
        if (appliedFilters.clientStartDate.startDate) {
          query = query.gte(
            "client_age_date_onboarded",
            `${appliedFilters.clientStartDate.startDate}T00:00:00.000Z`,
          );
        }
        if (appliedFilters.clientStartDate.endDate) {
          query = query.lte(
            "client_age_date_onboarded",
            `${appliedFilters.clientStartDate.endDate}T23:59:59.999Z`,
          );
        }
        return query;
      };

      const buildTasksQuery = (from: number, to: number) => {
        let query = supabase
          .from(appliedUsesAppClients ? "client_tasks" : "backup_company_clients_tasks")
          .select("status_value, assigned_to_id")
          .eq(
            appliedUsesAppClients ? "company_glide_row_id" : "company_id",
            appliedFilters.companyId,
          )
          .range(from, to);
        if (assignedTeamMemberId) {
          query = query.eq("assigned_to_id", assignedTeamMemberId);
        } else if (appliedFilters.csmId) {
          query = query.eq("assigned_to_id", appliedFilters.csmId);
        }
        return query;
      };

      const [{ data: clientRows, error: clientsError }, { data: taskRows, error: tasksError }] =
        await Promise.all([
          fetchPagedDashboardRows(buildClientsQuery),
          fetchPagedDashboardRows(buildTasksQuery),
        ]);

      if (cancelled) return;

      if (clientsError) {
        console.error("Failed to load dashboard chart clients:", clientsError);
      }
      if (tasksError) {
        console.error("Failed to load dashboard chart tasks:", tasksError);
      }

      const clients = (appliedUsesAppClients
        ? ((clientRows ?? []) as unknown as Record<string, unknown>[]).map(
            mapAppChartClientRow,
          )
        : ((clientRows ?? []) as unknown as ChartClientRow[]));
      const activeClientsForWorkload = clients.filter(
        (client) =>
          isActiveClientStatus(client.program_status_value) &&
          client.csm_team_member_id &&
          activeManagerIds.has(client.csm_team_member_id),
      );
      const activeClientsForUpkeep = clients.filter((client) =>
        isActiveClientStatus(client.program_status_value),
      );
      const upkeepFreshnessStart = addDays(new Date(), -PROFILE_UPKEEP_FRESHNESS_DAYS);
      let profileUpkeepHistoryRows: ProfileUpkeepHistoryRow[] = [];
      const activeClientIdsForUpkeep = activeClientsForUpkeep
        .map((client) => client.glide_row_id)
        .filter(Boolean);

      if (
        appliedUsesAppClients &&
        appliedAppCompany?.id &&
        activeClientIdsForUpkeep.length > 0
      ) {
        const { data: historyRows, error: historyError } = await supabase
          .from("client_history_events")
          .select(
            [
              "legacy_client_glide_row_id",
              "event_type",
              "next_steps",
              "last_contact_at",
              "next_contact_at",
              "progress_status",
              "buy_in_status",
              "created_at",
            ].join(", "),
          )
          .eq("company_id", appliedAppCompany.id)
          .in("legacy_client_glide_row_id", activeClientIdsForUpkeep)
          .gte("created_at", upkeepFreshnessStart.toISOString())
          .range(0, 4999);

        if (historyError) {
          console.error("Failed to load profile upkeep history:", historyError);
        } else {
          profileUpkeepHistoryRows =
            (historyRows ?? []) as unknown as ProfileUpkeepHistoryRow[];
        }
      }

      const activeClientsByManager = new Map<string, number>();
      activeClientsForWorkload.forEach((client) => {
        if (!client.csm_team_member_id) return;
        activeClientsByManager.set(
          client.csm_team_member_id,
          (activeClientsByManager.get(client.csm_team_member_id) ?? 0) + 1,
        );
      });
      const tasks = ((taskRows ?? []) as ChartTaskRow[]);
      setChartClients(clients);
      setProfileUpkeep(
        calculateProfileUpkeep(
          clients,
          profileUpkeepHistoryRows,
          upkeepFreshnessStart,
        ),
      );
      setCapacityRows(
        availableTeamMembers
          .map((member) => {
            const id = teamMemberOptionId(member);
            return {
              id,
              name: member.name ?? "Unassigned",
              activeClients: activeClientsByManager.get(id) ?? 0,
              capacity:
                member.capacity_number === null ||
                member.capacity_number === undefined
                  ? null
                  : Number(member.capacity_number),
            };
          })
          .filter((row) => row.activeClients > 0 || row.capacity !== null)
          .sort((a, b) => b.activeClients - a.activeClients || a.name.localeCompare(b.name)),
      );
      const offerIds = [
        ...new Set(
          clients
            .map((client) => client.offer_milestones_current_offer_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      let offerNameById = new Map<string, string>();
      let milestoneNameById = new Map<string, string>();
      let milestoneOrderById = new Map<string, number>();
      let journeyMilestoneIds: string[] = [];

      if (offerIds.length > 0) {
        const { data: offers, error: offersError } = await supabase
          .from(appliedUsesAppClients ? "company_offers" : "backup_company_offers")
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

      if (appliedFilters.offerId) {
        const { data: milestones, error: milestonesError } = appliedUsesAppClients
          ? await supabase
              .from("company_offer_milestones")
              .select("glide_row_id, offer_id, name, position, status, archived_at")
              .eq("offer_id", appliedFilters.offerId)
              .order("position", { ascending: true, nullsFirst: false })
          : await supabase
              .from("backup_company_offer_milestones")
              .select("glide_row_id, offer_id, name, order")
              .eq("offer_id", appliedFilters.offerId)
              .order("order", { ascending: true, nullsFirst: false });
        if (!cancelled) {
          if (milestonesError) {
            console.error("Failed to load milestone labels:", milestonesError);
          }
          const rows = (milestones ?? []) as OfferMilestone[];
          journeyMilestoneIds = rows.map((milestone) => milestone.glide_row_id);

          milestoneNameById = new Map(
            rows.map((milestone) => [
              milestone.glide_row_id,
              `${milestone.name ?? milestone.glide_row_id}${
                milestone.status === "archived" || milestone.archived_at
                  ? " (Archived)"
                  : ""
              }`,
            ]),
          );
          milestoneNameById.set("not-set", "No current milestone");
          milestoneNameById.set(MILESTONE_MISMATCH_KEY, "Milestone mismatch");
          milestoneOrderById = new Map(
            rows.map((milestone, index) => [
              milestone.glide_row_id,
              Number(milestone.position ?? milestone.order ?? index),
            ]),
          );
          milestoneOrderById.set(MILESTONE_MISMATCH_KEY, Number.MAX_SAFE_INTEGER - 1);
        }
      }

      if (cancelled) return;

      const journeyMilestoneIdSet = new Set(journeyMilestoneIds);
      const getJourneyMilestoneKey = (client: ChartClientRow) => {
        const milestoneId = client.offer_milestones_current_milestone_id;
        if (!milestoneId) return null;
        return journeyMilestoneIdSet.has(milestoneId)
          ? milestoneId
          : MILESTONE_MISMATCH_KEY;
      };
      const clientsByJourney = appliedFilters.offerId
        ? countByOrdered(
            clients,
            getJourneyMilestoneKey,
            milestoneNameById,
            milestoneOrderById,
          )
        : countBy(
            clients,
            (client) => client.offer_milestones_current_offer_id,
            offerNameById,
          );
      let churnReasonNameByValue = new Map<string, string>();
      let churnReasonOrderByValue = new Map<string, number>();

      if (appliedUsesAppClients && appliedAppCompany?.id) {
        const { data: churnReasons, error: churnReasonsError } = await supabase
          .from("company_churn_reasons")
          .select("value, label, position, status")
          .eq("company_id", appliedAppCompany.id)
          .order("position", { ascending: true, nullsFirst: false });

        if (!cancelled) {
          if (churnReasonsError) {
            console.error("Failed to load churn reason labels:", churnReasonsError);
          }
          const rows = (churnReasons ?? []) as {
            value: string | null;
            label: string | null;
            position: number | null;
            status?: string | null;
          }[];
          churnReasonNameByValue = new Map(
            rows
              .filter((reason) => reason.value)
              .map((reason) => [
                reason.value as string,
                `${reason.label ?? reason.value}${
                  reason.status === "archived" ? " (Archived)" : ""
                }`,
              ]),
          );
          churnReasonOrderByValue = new Map(
            rows
              .filter((reason) => reason.value)
              .map((reason, index) => [
                reason.value as string,
                Number(reason.position ?? index),
              ]),
          );
        }
      }

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
        churnReasonDistribution: countByOrdered(
          clients.filter((client) => chartKey(client.churn_reason_value) !== "not-set"),
          (client) => client.churn_reason_value,
          churnReasonNameByValue,
          churnReasonOrderByValue,
        ),
        clientsByJourney,
        journeyMilestoneIds,
        tasksByStatus: countBy(tasks, (task) => task.status_value),
        csmWorkload: countBy(
          activeClientsForWorkload,
          (client) => client.csm_team_member_id,
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
    appliedProgramValues,
    appliedFilters.secondaryAssigneeId,
    appliedShowSecondaryFilter,
    appliedAppCompany?.id,
    appliedUsesAppClients,
    activeManagerIds,
    activeDashboardTab,
    assignedTeamMemberId,
    availableTeamMembers,
    shouldLoadDashboardCharts,
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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <button
          type="button"
          onClick={() => setExportComingSoon(true)}
          className="rounded-full border border-[#59abf0] bg-white px-5 py-2 text-sm font-semibold text-[#2b79c4] hover:bg-[#eaf4fe]"
        >
          Export
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                      <option key={teamMemberOptionId(member)} value={teamMemberOptionId(member)}>
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
                      <option key={teamMemberOptionId(member)} value={teamMemberOptionId(member)}>
                        {member.name ?? "(unnamed)"}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <MultiSelectDropdown
                label="Program"
                values={pendingProgramValues}
                options={programChoices}
                loading={programChoicesLoading}
                loadingLabel="Loading programs..."
                allLabel="All programs"
                onChange={(values) =>
                  setPendingFilters((p) => ({
                    ...p,
                    program: programFilterFromValues(values),
                  }))
                }
              />

              <div>
                <label
                  htmlFor="offer-filter"
                  className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1"
                >
                  Pathway
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
                    {offersLoading ? "Loading pathways..." : "All pathways"}
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
                helpText="Window for retained/offb/churn/renewal."
                futureMonthCount={FUTURE_MONTH_OPTIONS_COUNT}
                state={pendingFilters.dateRange}
                onChange={setPendingDateRange}
              />
              <MonthDateRangeFilter
                label="Client Start Date"
                helpText="Filters clients by onboarding/start date."
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
              onOpenInfo={openKpiInfoModal}
              onOpenList={
                canUseDashboardDrilldowns
                  ? () => openDetailDrawer("active")
                  : undefined
              }
            />
            <FrontEndClientsKpi
              value={frontEndClients}
              loading={primaryKpiLoading}
              onOpenInfo={openKpiInfoModal}
              onOpenList={
                canUseDashboardDrilldowns
                  ? () => openDetailDrawer("front-end")
                  : undefined
              }
            />
            <BackEndClientsKpi
              value={backEndClients}
              loading={primaryKpiLoading}
              onOpenInfo={openKpiInfoModal}
              onOpenList={
                canUseDashboardDrilldowns
                  ? () => openDetailDrawer("back-end")
                  : undefined
              }
            />
            <OffBoardedClientsKpi
              value={offBoardedClients}
              loading={primaryKpiLoading}
              onOpenInfo={openKpiInfoModal}
              onOpenList={
                canUseDashboardDrilldowns
                  ? () => openDetailDrawer("off-boarded")
                  : undefined
              }
            />
          </div>

          <div className="pt-2">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
              Journey
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Avg. Time to Value
              </div>
              <div className="mt-2 text-3xl font-semibold text-gray-900">
                {ttvLoading
                  ? "..."
                  : ttvMetric.averageDays === null
                    ? "--"
                    : `${ttvMetric.averageDays}`}
              </div>
              <div className="mt-1 text-sm text-gray-500">
                {ttvMetric.averageDays === null ? "days" : "days average"}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <button
                  type="button"
                  onClick={() =>
                    setChartDetail({
                      title: "Avg. Time to Value: Reached",
                      rows: ttvMetric.reachedClients,
                    })
                  }
                  disabled={ttvLoading || ttvMetric.reachedCount === 0}
                  className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-left transition enabled:cursor-pointer enabled:hover:border-indigo-200 enabled:hover:bg-indigo-50 disabled:cursor-default"
                >
                  <div className="text-xs uppercase tracking-wider text-gray-500">
                    Reached
                  </div>
                  <div className="mt-1 font-semibold text-gray-900">
                    {ttvLoading ? "..." : ttvMetric.reachedCount}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setTtvMilestonesOpen(true)}
                  disabled={ttvLoading || ttvMetric.configuredMilestones === 0}
                  className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-left transition enabled:cursor-pointer enabled:hover:border-indigo-200 enabled:hover:bg-indigo-50 disabled:cursor-default"
                >
                  <div className="text-xs uppercase tracking-wider text-gray-500">
                    TTV Points
                  </div>
                  <div className="mt-1 font-semibold text-gray-900">
                    {ttvLoading ? "..." : ttvMetric.configuredMilestones}
                  </div>
                </button>
              </div>
            </div>
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
              onOpenInfo={openKpiInfoModal}
              onOpenList={
                canUseDashboardDrilldowns
                  ? () => openDetailDrawer("retained")
                  : undefined
              }
            />
            <RetentionPercentageKpi
              percentage={retentionPercentage}
              renewingClientsCount={renewingClientsCount}
              loading={retentionKpiLoading}
              onOpenInfo={openKpiInfoModal}
              onOpenList={
                canUseDashboardDrilldowns
                  ? () => openDetailDrawer("renewing")
                  : undefined
              }
            />
            <UpForRenewalKpi
              value={activeRenewingClients}
              loading={retentionKpiLoading}
              onOpenInfo={openKpiInfoModal}
              onOpenList={
                canUseDashboardDrilldowns
                  ? () => openDetailDrawer("active-renewing")
                  : undefined
              }
            />
            <ChurnPercentageKpi
              percentage={churnPercentage}
              churnedClientsCount={churnedClientsCount}
              loading={primaryKpiLoading}
              onOpenInfo={openKpiInfoModal}
              onOpenList={
                canUseDashboardDrilldowns
                  ? () => openDetailDrawer("churned")
                  : undefined
              }
            />
          </div>

          <div className="pt-2">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
              Advocacy & Growth
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {advocacyMetrics.map((metric) => {
              const conversion =
                metric.asked > 0
                  ? Math.round((metric.received / metric.asked) * 100)
                  : null;
              const canOpenReceived =
                canUseDashboardDrilldowns && !advocacyLoading && metric.received > 0;
              const canOpenAsked =
                canUseDashboardDrilldowns && !advocacyLoading && metric.asked > 0;
              return (
                <div
                  key={metric.type}
                  className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      disabled={!canOpenReceived}
                      onClick={() =>
                        openDetailDrawer(advocacyDetailKey(metric.type, "received"))
                      }
                      className="min-w-0 rounded-md text-left transition enabled:cursor-pointer enabled:hover:text-indigo-700 disabled:cursor-default"
                    >
                      <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                        {metric.label}
                      </div>
                      <div className="mt-2 text-3xl font-semibold text-gray-900">
                        {advocacyLoading ? "..." : metric.received}
                      </div>
                      <div className="mt-1 text-sm text-gray-500">
                        received
                      </div>
                    </button>
                    <div className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                      {conversion === null ? "--" : `${conversion}%`}
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <button
                      type="button"
                      disabled={!canOpenAsked}
                      onClick={() =>
                        openDetailDrawer(advocacyDetailKey(metric.type, "asked"))
                      }
                      className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-left transition enabled:cursor-pointer enabled:hover:border-indigo-200 enabled:hover:bg-indigo-50 disabled:cursor-default"
                    >
                      <div className="text-xs uppercase tracking-wider text-gray-500">
                        Asked
                      </div>
                      <div className="mt-1 font-semibold text-gray-900">
                        {advocacyLoading ? "..." : metric.asked}
                      </div>
                    </button>
                    <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
                      <div className="text-xs uppercase tracking-wider text-gray-500">
                        Ratio
                      </div>
                      <div className="mt-1 font-semibold text-gray-900">
                        {advocacyLoading
                          ? "..."
                          : metric.asked > 0
                            ? `${metric.asked}:${metric.received}`
                            : "--"}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      ) : activeDashboardTab === "charts" ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <div className="text-xs uppercase tracking-wider text-gray-500">
                Visible Client Total
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
                <DonutChart
                  data={chartData.programDistribution}
                  onItemClick={
                    canUseDashboardDrilldowns
                      ? (item) =>
                          openChartDetail(
                            "Program Distribution",
                            item,
                            (client) => client.program_status_value,
                          )
                      : undefined
                  }
                />
              </ChartCard>
              <ChartCard
                title="Buy-in"
                subtitle="Client outcome buy-in distribution"
              >
                <DonutChart
                  data={chartData.buyInDistribution}
                  onItemClick={
                    canUseDashboardDrilldowns
                      ? (item) =>
                          openChartDetail(
                            "Buy-in",
                            item,
                            (client) => client.outcomes_buy_in_for_filtering,
                          )
                      : undefined
                  }
                />
              </ChartCard>
              <ChartCard
                title="Progress"
                subtitle="Client outcome progress distribution"
              >
                <DonutChart
                  data={chartData.progressDistribution}
                  onItemClick={
                    canUseDashboardDrilldowns
                      ? (item) =>
                          openChartDetail(
                            "Progress",
                            item,
                            (client) => client.outcomes_progress_for_filtering,
                          )
                      : undefined
                  }
                />
              </ChartCard>
              <ChartCard
                title="Churn Reason"
                subtitle="Clients grouped by recorded churn/offboarding reason"
              >
                <DonutChart
                  data={chartData.churnReasonDistribution}
                  colorMap={CHURN_REASON_COLOR_MAP}
                  maxItems={8}
                  onItemClick={
                    canUseDashboardDrilldowns
                      ? (item) =>
                          openChartDetail(
                            "Churn Reason",
                            item,
                            (client) => client.churn_reason_value,
                          )
                      : undefined
                  }
                />
              </ChartCard>
              <ChartCard
                title={
                  appliedFilters.offerId
                    ? "Clients By Milestone"
                    : "Clients By Pathway"
                }
                subtitle={
                  appliedFilters.offerId
                    ? "Current milestone breakdown for the selected pathway"
                    : "Top current pathways for filtered clients"
                }
              >
                <BarChart
                  data={chartData.clientsByJourney}
                  onItemClick={
                    canUseDashboardDrilldowns
                        ? (item) =>
                          openChartDetail(
                            appliedFilters.offerId
                              ? "Clients By Milestone"
                              : "Clients By Pathway",
                            item,
                            (client) => {
                              if (!appliedFilters.offerId) {
                                return client.offer_milestones_current_offer_id;
                              }
                              const milestoneId =
                                client.offer_milestones_current_milestone_id;
                              if (!milestoneId) return null;
                              return chartData.journeyMilestoneIds.includes(milestoneId)
                                ? milestoneId
                                : MILESTONE_MISMATCH_KEY;
                            },
                          )
                      : undefined
                  }
                />
              </ChartCard>
              <ChartCard
                title="Tasks By Status"
                subtitle="Client tasks for the selected company"
              >
                <BarChart data={chartData.tasksByStatus} />
              </ChartCard>
              <ChartCard
                title="CSM Active Client Workload"
                subtitle="Active Front End and Back End clients grouped by client-managing CSM"
              >
                <BarChart data={chartData.csmWorkload} />
              </ChartCard>
              <ChartCard
                title="CSM Capacity"
                subtitle="Active clients against configured team member capacity"
              >
                {capacityRows.length === 0 ? (
                  <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-500">
                    No capacity data
                  </div>
                ) : (
                  <div className="space-y-3">
                    {capacityRows.slice(0, 8).map((row) => {
                      const utilization =
                        row.capacity && row.capacity > 0
                          ? Math.round((row.activeClients / row.capacity) * 100)
                          : null;
                      return (
                        <div key={row.id} className="rounded-lg border border-gray-100 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-gray-900">
                                {row.name}
                              </div>
                              <div className="mt-0.5 text-xs text-gray-500">
                                {row.activeClients} active client
                                {row.activeClients === 1 ? "" : "s"} /{" "}
                                {row.capacity ?? "Not set"} capacity
                              </div>
                            </div>
                            <span
                              className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${
                                utilization === null
                                  ? "border-gray-200 bg-gray-50 text-gray-600"
                                  : utilization >= 90
                                    ? "border-red-200 bg-red-50 text-red-700"
                                    : utilization >= 75
                                      ? "border-amber-200 bg-amber-50 text-amber-700"
                                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                              }`}
                            >
                              {utilization === null ? "Not set" : `${utilization}%`}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ChartCard>
            </div>
          )}
        </div>
      ) : (
        <ComingSoonPanel
          title="Dashboard AI Insights"
          description="AI-generated summaries, risk signals, and recommended actions will use the selected dashboard filters when this feature launches."
        />
      )}

      {exportComingSoon ? (
        <ComingSoonModal
          title="Dashboard Export"
          description="Exportable dashboard reports, PDFs, CSVs, and shareable HTML views are planned for a later rollout phase."
          onClose={() => setExportComingSoon(false)}
        />
      ) : null}

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
              <div className={`${detailGridClass} border-b border-gray-200 px-1 pb-3 text-xs font-semibold uppercase tracking-wider text-gray-500`}>
                <span>Name</span>
                <span>CSM</span>
                {detailShowsRenewalDate ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDetailRenewalSortDirection((direction) =>
                        direction === "asc" ? "desc" : "asc",
                      );
                      setDetailPage(1);
                    }}
                    className="flex items-center gap-1 text-left font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-900 cursor-pointer"
                  >
                    <span>Renewal Date</span>
                    <span aria-hidden="true">
                      {detailRenewalSortDirection === "asc" ? "↑" : "↓"}
                    </span>
                  </button>
                ) : null}
              </div>

              {detailLoading ? (
                <div className="space-y-3 py-4">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <div
                      key={index}
                      className={`${detailGridClass} border-b border-gray-100 py-3`}
                    >
                      <div className="h-10 rounded-lg bg-gray-100 animate-pulse" />
                      <div className="h-10 rounded-lg bg-gray-100 animate-pulse" />
                      {detailShowsRenewalDate ? (
                        <div className="h-10 rounded-lg bg-gray-100 animate-pulse" />
                      ) : null}
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
                      className={`${detailGridClass} border-b border-gray-100 py-3`}
                    >
                      <Link
                        to={`/clients/${encodeURIComponent(client.glide_row_id)}`}
                        onClick={closeDetailDrawer}
                        className="flex min-w-0 items-center gap-3 rounded-lg -m-1 p-1 hover:bg-gray-50"
                      >
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
                      </Link>

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
                      {detailShowsRenewalDate ? (
                        <div className="flex items-center text-sm font-medium text-gray-800">
                          {formatDisplayDate(client.renewal_date)}
                        </div>
                      ) : null}
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

      {chartDetail && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close chart detail dialog"
            onClick={() => setChartDetail(null)}
            className="absolute inset-0 bg-slate-900/40 cursor-pointer"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-gray-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {chartDetail.title}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {chartDetail.rows.length.toLocaleString()} client
                  {chartDetail.rows.length === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setChartDetail(null)}
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
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {chartDetail.rows.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-500">
                  No clients matched this chart segment.
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {chartDetail.rows.map((client) => (
                    <Link
                      key={client.glide_row_id}
                      to={`/clients/${client.glide_row_id}`}
                      className="flex items-center justify-between gap-4 py-3 hover:bg-gray-50"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        {client.client_image ? (
                          <img
                            src={client.client_image}
                            alt=""
                            className="h-10 w-10 rounded-xl border border-gray-200 object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-xs font-semibold text-indigo-700">
                            {getInitials(client.client_name)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-gray-900">
                            {client.client_name ?? "Unnamed client"}
                          </div>
                          <div className="truncate text-xs text-gray-500">
                            {teamMemberNameById.get(client.csm_team_member_id ?? "") ??
                              "Unassigned"}
                          </div>
                        </div>
                      </div>
                      <span className="shrink-0 text-xs font-medium text-indigo-600">
                        View
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
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
                <p className="mt-1 text-sm text-gray-500">How this card works</p>
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
            <div className="px-5 py-4">
              <p className="text-sm leading-6 text-gray-700 whitespace-pre-line">
                {kpiInfoModal.description}
              </p>
            </div>
          </div>
        </div>
      )}

      {ttvMilestonesOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close TTV points dialog"
            onClick={() => setTtvMilestonesOpen(false)}
            className="absolute inset-0 bg-slate-900/40 cursor-pointer"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-gray-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Configured TTV Points
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {ttvMetric.ttvMilestones.length.toLocaleString()} configured
                  milestone
                  {ttvMetric.ttvMilestones.length === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTtvMilestonesOpen(false)}
                className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 cursor-pointer"
              >
                <span className="sr-only">Close</span>
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
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {ttvMetric.ttvMilestones.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-500">
                  No TTV milestones are configured for the selected filters.
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {ttvMetric.ttvMilestones.map((milestone) => (
                    <div key={milestone.id} className="py-3">
                      <div className="text-sm font-medium text-gray-900">
                        {milestone.name}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {milestone.offerName}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
