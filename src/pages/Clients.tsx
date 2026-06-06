import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ProgramStatusPill,
  type ProgramChoice,
} from "../lib/clientDisplay.tsx";
import { useAccountContext } from "../lib/accountContext.tsx";
import { supabase } from "../lib/supabase.ts";

const PAGE_SIZE = 12;
type ViewMode = "list" | "card" | "calendar";
type CalendarMode = "month" | "week" | "day";
type SortField = "client_name" | "onboarded" | "renewal";
type SortDirection = "asc" | "desc";
type ClientRow = Record<string, unknown> & {
  glide_row_id: string;
  client_name?: string | null;
  client_image?: string | null;
  company_id?: string | null;
  company_glide_row_id?: string | null;
  csm_team_member_id?: string | null;
  csm_secondary_assignee_id?: string | null;
  program_status_value?: string | null;
};
interface ClientHistoryEvent {
  id: string;
  legacy_client_glide_row_id: string;
  next_steps: string | null;
  last_contact_at: string | null;
  next_contact_at: string | null;
  success_status: string | null;
  progress_status: string | null;
  buy_in_status: string | null;
  notes: string | null;
  created_at: string;
}
interface CalendarTaskRow {
  glide_row_id: string;
  client_id: string | null;
  task_name: string | null;
  task_due_date: string | null;
  status_value?: string | null;
  assigned_to_id?: string | null;
}
interface OutcomeChoice {
  value: string;
  display: string;
}
interface Company {
  glide_row_id: string;
  name: string | null;
  enable_secondary_assignee: boolean | null;
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
interface OfferMilestone {
  glide_row_id: string;
  offer_id: string | null;
  name: string | null;
  order?: number | null;
}
interface PilotReminder {
  id: string;
  type: "next-contact" | "renewal" | "paused-return";
  label: string;
  date: string;
  client: ClientRow;
}
interface ClientFilters {
  companyId: string;
  csmId: string;
  secondaryAssigneeId: string;
  offerId: string;
  programs: string[];
  clientName: string;
  lastContact: string;
}
const emptyFilters: ClientFilters = {
  companyId: "",
  csmId: "",
  secondaryAssigneeId: "",
  offerId: "",
  programs: [],
  clientName: "",
  lastContact: "",
};
const CLIENTS_CACHE_KEY = "cst.clientsRosterState.v1";

interface ClientsCacheState {
  filters: ClientFilters;
  appliedFilters: ClientFilters;
  page: number;
  viewMode: ViewMode;
  sortField: SortField;
  sortDirection: SortDirection;
}

function readClientsCache(): ClientsCacheState | null {
  try {
    const raw =
      window.localStorage.getItem(CLIENTS_CACHE_KEY) ??
      window.sessionStorage.getItem(CLIENTS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ClientsCacheState>;
    return {
      filters: { ...emptyFilters, ...(parsed.filters ?? {}) },
      appliedFilters: { ...emptyFilters, ...(parsed.appliedFilters ?? {}) },
      page: Math.max(1, Number(parsed.page) || 1),
      viewMode:
        parsed.viewMode === "card" || parsed.viewMode === "calendar"
          ? parsed.viewMode
          : "list",
      sortField:
        parsed.sortField === "onboarded" || parsed.sortField === "renewal"
          ? parsed.sortField
          : "client_name",
      sortDirection: parsed.sortDirection === "desc" ? "desc" : "asc",
    };
  } catch {
    return null;
  }
}

function writeClientsCache(state: ClientsCacheState) {
  window.localStorage.setItem(CLIENTS_CACHE_KEY, JSON.stringify(state));
}
function mapAppClientRow(row: Record<string, unknown>): ClientRow {
  return {
    ...row,
    company_id:
      typeof row.company_glide_row_id === "string"
        ? row.company_glide_row_id
        : (row.company_id as string | null | undefined),
  } as ClientRow;
}
const lastContactColumns = [
  "csm_date_of_last_contact",
  "last_contact",
  "last_contact_date",
  "date_of_last_contact",
  "client_last_contact",
  "last_contacted_at",
  "last_contacted",
  "date_last_contact",
  "last_touch",
  "last_touchpoint",
];
const nextContactColumns = [
  "csm_date_of_next_contact",
  "next_contact",
  "next_contact_date",
  "date_of_next_contact",
  "client_next_contact",
];
const northStarColumns = [
  "north_star",
  "north_star_value",
  "north_star_text",
  "client_north_star",
  "client_north_star_value",
  "program_north_star",
  "program_north_star_value",
  "csm_north_star",
  "current_north_star",
];
const nextStepsColumns = [
  "next_steps",
  "next_steps_value",
  "next_steps_text",
  "client_next_steps",
  "program_next_steps",
  "program_next_steps_value",
  "csm_next_steps",
  "next_step",
];
const pathwayColumns = [
  "pathways_and_milestones",
  "pathways_milestones",
  "pathways_milestones_value",
  "pathway_and_milestone",
  "pathway_milestone",
  "client_pathways_milestones",
  "pathway",
  "pathways",
  "pathway_name",
  "pathway_value",
  "milestones",
  "milestones_value",
  "milestone",
  "milestone_name",
];
const progressColumns = [
  "outcomes_progress_for_filtering",
  "outcomes_progress_value",
  "outcomes_progress_date",
  "progress",
  "progress_value",
  "progress_status",
  "client_progress",
  "client_progress_value",
];
const successColumns = [
  "outcomes_success_for_filtering",
  "success",
  "success_value",
  "success_status",
];
const buyInColumns = [
  "outcomes_buy_in_for_filtering",
  "outcomes_buy_in_value",
  "outcomes_buy_in_date",
  "buy_in",
  "buy_in_value",
  "buy_in_status",
  "buyin",
  "buyin_value",
  "client_buy_in",
  "client_buy_in_value",
];
const onboardedColumns = ["client_age_date_onboarded", "date_onboarded"];
const renewalColumns = [
  "current_contract_end_date_for_filtering",
  "current_contract_end_date",
  "renewal_date",
  "next_renewal_date",
];

function sortColumnFor(field: SortField) {
  if (field === "onboarded") return "client_age_date_onboarded";
  if (field === "renewal") return "current_contract_end_date_for_filtering";
  return "client_name";
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isPresent(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function candidateTokens(candidates: string[]) {
  return candidates
    .map(normalizeKey)
    .map((candidate) =>
      candidate.split("_").filter((token) => token.length > 1),
    );
}

function fuzzyValueFromObject(
  source: Record<string, unknown>,
  candidates: string[],
) {
  const directCandidates = candidates.map(normalizeKey);
  const tokenGroups = candidateTokens(candidates);

  for (const [key, value] of Object.entries(source)) {
    if (!isPresent(value)) continue;
    const normalizedKey = normalizeKey(key);
    if (
      candidates.some((candidate) => normalizeKey(candidate).includes("milestone")) &&
      normalizedKey.includes("offer") &&
      normalizedKey.endsWith("offer_id")
    ) {
      continue;
    }
    if (
      directCandidates.some(
        (candidate) =>
          normalizedKey === candidate || normalizedKey.includes(candidate),
      )
    ) {
      return value;
    }
    if (
      tokenGroups.some(
        (tokens) =>
          tokens.length > 0 &&
          tokens.every((token) => normalizedKey.includes(token)),
      )
    ) {
      return value;
    }
  }

  return null;
}

function valueFrom(row: Record<string, unknown>, candidates: string[]) {
  for (const key of candidates) {
    const value = row[key];
    if (isPresent(value)) return value;
  }

  const rowFuzzyValue = fuzzyValueFromObject(row, candidates);
  if (isPresent(rowFuzzyValue)) return rowFuzzyValue;

  const rawData = row.data;
  if (rawData && typeof rawData === "object" && !Array.isArray(rawData)) {
    const data = rawData as Record<string, unknown>;
    for (const key of candidates) {
      const value = data[key];
      if (isPresent(value)) return value;
    }

    const dataFuzzyValue = fuzzyValueFromObject(data, candidates);
    if (isPresent(dataFuzzyValue)) return dataFuzzyValue;
  }

  return null;
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "--";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return JSON.stringify(value);
}
const displayNameKeys = [
  "name",
  "title",
  "label",
  "program_label",
  "pathway_name",
  "milestone_name",
  "pathways_milestones_name",
  "pathways_and_milestones",
  "pathway",
  "milestone",
];

function displayValue(value: unknown, lookup = new Map<string, string>()): string {
  if (value === null || value === undefined || value === "") return "--";
  if (typeof value === "string") {
    const trimmed = value.trim();
    const mapped = lookup.get(trimmed);
    if (mapped) return mapped;
    if (trimmed.toLowerCase() === "x") return "--";
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        return displayValue(JSON.parse(trimmed), lookup);
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => displayValue(item, lookup))
      .filter((item) => item !== "--");
    return parts.length > 0 ? parts.join(", ") : "--";
  }
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    for (const key of displayNameKeys) {
      const candidate = row[key];
      if (isPresent(candidate)) return displayValue(candidate, lookup);
    }
    const id = row.glide_row_id ?? row.id;
    if (typeof id === "string") {
      const mapped = lookup.get(id);
      if (mapped) return mapped;
    }
  }
  return formatValue(value);
}

function formatDate(value: unknown) {
  if (!value) return "--";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? formatValue(value)
    : date.toLocaleDateString();
}
function monthInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(date: Date) {
  return date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}
function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function dateKeyFromValue(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : dateKey(date);
}
function monthBounds(monthDate: Date) {
  const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const next = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
  return { start, next };
}
function weekBounds(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - start.getDay());
  const next = new Date(start);
  next.setDate(start.getDate() + 7);
  return { start, next };
}
function dayBounds(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const next = new Date(start);
  next.setDate(start.getDate() + 1);
  return { start, next };
}
function calendarBounds(mode: CalendarMode, date: Date) {
  if (mode === "day") return dayBounds(date);
  if (mode === "week") return weekBounds(date);
  return monthBounds(date);
}
function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}
function addCalendarPeriod(date: Date, mode: CalendarMode, amount: number) {
  if (mode === "month") return addMonths(date, amount);
  const next = new Date(date);
  next.setDate(date.getDate() + amount * (mode === "week" ? 7 : 1));
  return next;
}
function isDateInRange(value: unknown, start: Date, next: Date) {
  if (!value) return false;
  const date = new Date(String(value));
  return !Number.isNaN(date.getTime()) && date >= start && date < next;
}
function formatDateTime(value: unknown) {
  if (!value) return "--";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? formatValue(value)
    : date.toLocaleString();
}
function toDateTimeInputValue(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function normalizeOutcome(value: unknown) {
  const raw = formatValue(value).trim();
  if (!raw || raw === "--" || raw.toLowerCase() === "x") return "";
  return raw;
}
const defaultOutcomeChoices: OutcomeChoice[] = [
  { value: "green", display: "Green" },
  { value: "yellow", display: "Yellow" },
  { value: "red", display: "Red" },
];

function outcomeChoicesFromRows(
  rows: Record<string, unknown>[],
  valueKey: string,
  displayKey: string,
) {
  const seen = new Set<string>();
  const choices: OutcomeChoice[] = [];
  for (const row of rows) {
    const value = normalizeOutcome(row[valueKey]);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    choices.push({
      value,
      display: normalizeOutcome(row[displayKey]) || titleize(value),
    });
  }
  return choices;
}

function choiceDisplay(
  value: string | null | undefined,
  choices: OutcomeChoice[],
) {
  const normalized = normalizeOutcome(value);
  if (!normalized) return "";
  const match = choices.find(
    (choice) => choice.value === normalized || choice.display === normalized,
  );
  return match?.display ?? titleize(normalized);
}

function coerceChoiceValue(value: string, choices: OutcomeChoice[]) {
  const normalized = normalizeOutcome(value);
  if (!normalized) return "";
  const match = choices.find(
    (choice) => choice.value === normalized || choice.display === normalized,
  );
  return match?.value ?? normalized;
}
function titleize(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function sanitizeHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+=["'][^"']*["']/gi, "")
    .replace(/javascript:/gi, "");
}
function RichValue({ value }: { value: unknown }) {
  const text = displayValue(value);
  if (text === "--") return <>{text}</>;
  const hasHtml = /<\/?[a-z][\s\S]*>/i.test(text);
  const html = hasHtml
    ? sanitizeHtml(text)
    : escapeHtml(text)
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br />");
  return (
    <div
      className="max-w-none text-sm leading-relaxed text-gray-800 [&_a]:text-indigo-600 [&_a]:underline [&_br]:leading-6 [&_li]:ml-4 [&_li]:list-disc [&_ol]:ml-4 [&_ol]:list-decimal [&_p]:mb-2 [&_strong]:font-semibold [&_ul]:ml-4"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
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
function OutcomePill({ value }: { value: unknown }) {
  const normalized = normalizeOutcome(value);
  if (!normalized) {
    return (
      <span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500">
        Not set
      </span>
    );
  }
  const key = normalized.toLowerCase();
  const color = key.includes("green")
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : key.includes("yellow")
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : key.includes("red")
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-gray-200 bg-gray-50 text-gray-700";
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${color}`}
    >
      {titleize(normalized)}
    </span>
  );
}
function ReadOnlyField({
  label,
  value,
  display = "plain",
  lookup,
}: {
  label: string;
  value: unknown;
  display?: "plain" | "rich" | "outcome";
  lookup?: Map<string, string>;
}) {
  const shownValue = lookup ? displayValue(value, lookup) : value;
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
        {display === "rich" ? (
          <RichValue value={shownValue} />
        ) : display === "outcome" ? (
          <OutcomePill value={value} />
        ) : (
          displayValue(shownValue)
        )}
      </div>
    </div>
  );
}
function OutcomeSelect({
  label,
  value,
  choices,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  choices: OutcomeChoice[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const hasCurrentValue =
    value !== "" && !choices.some((choice) => choice.value === value);
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
        {label}
      </span>
      <select
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
      >
        <option value="">Not set</option>
        {hasCurrentValue ? (
          <option value={value}>{choiceDisplay(value, choices)}</option>
        ) : null}
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.display}
          </option>
        ))}
      </select>
    </label>
  );
}
function QuickUpdateModal({
  client,
  onClose,
}: {
  client: ClientRow;
  onClose: () => void;
}) {
  const [isPilotCompany, setIsPilotCompany] = useState(false);
  const [historyEvents, setHistoryEvents] = useState<ClientHistoryEvent[]>([]);
  const [loadingPilotState, setLoadingPilotState] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [nextSteps, setNextSteps] = useState(
    formatValue(valueFrom(client, nextStepsColumns)) === "--"
      ? ""
      : formatValue(valueFrom(client, nextStepsColumns)),
  );
  const [lastContactAt, setLastContactAt] = useState(
    toDateTimeInputValue(valueFrom(client, lastContactColumns)),
  );
  const [nextContactAt, setNextContactAt] = useState(
    toDateTimeInputValue(valueFrom(client, nextContactColumns)),
  );
  const [successStatus, setSuccessStatus] = useState(
    normalizeOutcome(valueFrom(client, successColumns)),
  );
  const [progressStatus, setProgressStatus] = useState(
    normalizeOutcome(valueFrom(client, progressColumns)),
  );
  const [buyInStatus, setBuyInStatus] = useState(
    normalizeOutcome(valueFrom(client, buyInColumns)),
  );
  const [successChoices, setSuccessChoices] = useState<OutcomeChoice[]>([]);
  const [progressChoices, setProgressChoices] = useState<OutcomeChoice[]>([]);
  const [buyInChoices, setBuyInChoices] = useState<OutcomeChoice[]>([]);
  const [notes, setNotes] = useState("");
  const [currentOfferName, setCurrentOfferName] = useState("");
  const [currentMilestoneName, setCurrentMilestoneName] = useState("");
  const [completingMilestone, setCompletingMilestone] = useState(false);
  const companyLegacyId = client.company_id ?? "";
  const [currentOfferId] = useState(
    typeof client.offer_milestones_current_offer_id === "string"
      ? client.offer_milestones_current_offer_id
      : "",
  );
  const [currentMilestoneId, setCurrentMilestoneId] = useState(
    typeof client.offer_milestones_current_milestone_id === "string"
      ? client.offer_milestones_current_milestone_id
      : "",
  );

  useEffect(() => {
    let cancelled = false;

    async function loadOutcomeChoices() {
      const { data, error } = await supabase
        .from("backup_choices")
        .select(
          "success_value, success_display, progress_value, progress_display, buy_in_value, buy_in_display, index",
        )
        .order("index", { ascending: true });

      if (cancelled) return;
      if (error) {
        console.error("Failed to load outcome choices:", error);
        setSuccessChoices(defaultOutcomeChoices);
        setProgressChoices(defaultOutcomeChoices);
        setBuyInChoices(defaultOutcomeChoices);
        return;
      }

      const rows = (data ?? []) as Record<string, unknown>[];
      const nextSuccessChoices =
        outcomeChoicesFromRows(rows, "success_value", "success_display");
      const nextProgressChoices =
        outcomeChoicesFromRows(rows, "progress_value", "progress_display").filter(
          (choice) => choice.value !== "offtrack",
        );
      const nextBuyInChoices =
        outcomeChoicesFromRows(rows, "buy_in_value", "buy_in_display");

      setSuccessChoices(
        nextSuccessChoices.length > 0
          ? nextSuccessChoices
          : defaultOutcomeChoices,
      );
      setProgressChoices(
        nextProgressChoices.length > 0
          ? nextProgressChoices
          : defaultOutcomeChoices,
      );
      setBuyInChoices(
        nextBuyInChoices.length > 0 ? nextBuyInChoices : defaultOutcomeChoices,
      );
    }

    void loadOutcomeChoices();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadCurrentMilestone() {
      if (!currentOfferId || !currentMilestoneId) {
        setCurrentOfferName("");
        setCurrentMilestoneName("");
        return;
      }
      const [offerResult, milestoneResult] = await Promise.all([
        supabase
          .from("backup_company_offers")
          .select("name")
          .eq("glide_row_id", currentOfferId)
          .maybeSingle(),
        supabase
          .from("backup_company_offer_milestones")
          .select("name")
          .eq("glide_row_id", currentMilestoneId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setCurrentOfferName(offerResult.data?.name ?? currentOfferId);
      setCurrentMilestoneName(milestoneResult.data?.name ?? currentMilestoneId);
    }
    void loadCurrentMilestone();
    return () => {
      cancelled = true;
    };
  }, [currentMilestoneId, currentOfferId]);

  useEffect(() => {
    if (successChoices.length === 0) return;
    setSuccessStatus((current) => coerceChoiceValue(current, successChoices));
  }, [successChoices]);

  useEffect(() => {
    if (progressChoices.length === 0) return;
    setProgressStatus((current) => coerceChoiceValue(current, progressChoices));
  }, [progressChoices]);

  useEffect(() => {
    if (buyInChoices.length === 0) return;
    setBuyInStatus((current) => coerceChoiceValue(current, buyInChoices));
  }, [buyInChoices]);

  useEffect(() => {
    let cancelled = false;

    async function loadPilotState() {
      setLoadingPilotState(true);
      setSaveError(null);

      const { data: company, error: companyError } = await supabase
        .from("companies")
        .select("id, migration_status")
        .eq("legacy_glide_row_id", companyLegacyId)
        .in("migration_status", ["pilot", "migrated"])
        .maybeSingle();

      if (cancelled) return;

      if (companyError || !company) {
        setIsPilotCompany(false);
        setHistoryEvents([]);
        setLoadingPilotState(false);
        return;
      }

      setIsPilotCompany(true);
      const { data: events, error: eventsError } = await supabase
        .from("client_history_events")
        .select(
          "id, legacy_client_glide_row_id, next_steps, last_contact_at, next_contact_at, success_status, progress_status, buy_in_status, notes, created_at",
        )
        .eq("legacy_client_glide_row_id", client.glide_row_id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (cancelled) return;

      if (eventsError) {
        setSaveError(eventsError.message);
      } else {
        setHistoryEvents((events ?? []) as ClientHistoryEvent[]);
      }
      setLoadingPilotState(false);
    }

    if (companyLegacyId) void loadPilotState();
    else {
      setIsPilotCompany(false);
      setLoadingPilotState(false);
    }

    return () => {
      cancelled = true;
    };
  }, [client.glide_row_id, companyLegacyId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isPilotCompany || saving) return;

    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    const { data, error } = await supabase.functions.invoke(
      "manage-client-quick-update",
      {
        body: {
          companyLegacyId,
          clientLegacyId: client.glide_row_id,
          nextSteps,
          lastContactAt,
          nextContactAt,
          successStatus,
          progressStatus,
          buyInStatus,
          notes,
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

    if (data?.event) {
      setHistoryEvents((current) =>
        [data.event as ClientHistoryEvent, ...current].slice(0, 5),
      );
    }
    setNotes("");
    setSaveMessage("Quick Update saved to RetainOS pilot history.");
  }

  async function completeCurrentMilestone() {
    if (
      !isPilotCompany ||
      !currentOfferId ||
      !currentMilestoneId ||
      completingMilestone
    ) {
      return;
    }
    setCompletingMilestone(true);
    setSaveError(null);
    setSaveMessage(null);
    const { data, error } = await supabase.functions.invoke(
      "manage-client-milestone",
      {
        body: {
          action: "complete_milestone",
          clientLegacyId: client.glide_row_id,
          offerId: currentOfferId,
          milestoneId: currentMilestoneId,
          completionDate: new Date().toISOString(),
          notes,
        },
      },
    );
    setCompletingMilestone(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    if (data?.error) {
      setSaveError(data.error);
      return;
    }
    const nextName =
      typeof data?.nextMilestone?.name === "string"
        ? data.nextMilestone.name
        : "";
    const nextId =
      typeof data?.nextMilestone?.glide_row_id === "string"
        ? data.nextMilestone.glide_row_id
        : "";
    if (nextId) setCurrentMilestoneId(nextId);
    setCurrentMilestoneName(nextName || currentMilestoneName);
    setSaveMessage(
      nextName
        ? `Milestone completed. ${nextName} is now current.`
        : "Milestone completed.",
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close quick update"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 cursor-pointer"
      />
      <div className="relative max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Quick Update
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {isPilotCompany
                ? `RetainOS pilot write for ${client.client_name ?? "Unnamed client"}`
                : `Read-only preview for ${client.client_name ?? "Unnamed client"}`}
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
          <div className="space-y-5 px-5 py-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ReadOnlyField
                label="North Star"
                value={valueFrom(client, northStarColumns)}
                display="rich"
              />
              <ReadOnlyField
                label="Next Steps"
                value={valueFrom(client, nextStepsColumns)}
                display="rich"
              />
              <ReadOnlyField
                label="Date of Last Contact"
                value={formatDate(valueFrom(client, lastContactColumns))}
              />
              <ReadOnlyField
                label="Date of Next Contact"
                value={formatDate(valueFrom(client, nextContactColumns))}
              />
            </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Next Steps
              </span>
              <textarea
                disabled={!isPilotCompany || saving}
                value={nextSteps}
                onChange={(event) => setNextSteps(event.target.value)}
                rows={4}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Notes
              </span>
              <textarea
                disabled={!isPilotCompany || saving}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={4}
                placeholder="Add context from the client interaction"
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Date of Last Contact
              </span>
              <input
                type="datetime-local"
                disabled={!isPilotCompany || saving}
                value={lastContactAt}
                onChange={(event) => setLastContactAt(event.target.value)}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Date of Next Contact
              </span>
              <input
                type="datetime-local"
                disabled={!isPilotCompany || saving}
                value={nextContactAt}
                onChange={(event) => setNextContactAt(event.target.value)}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <OutcomeSelect
              label="Success"
              value={successStatus}
              choices={successChoices}
              disabled={!isPilotCompany || saving}
              onChange={setSuccessStatus}
            />
            <OutcomeSelect
              label="Progress"
              value={progressStatus}
              choices={progressChoices}
              disabled={!isPilotCompany || saving}
              onChange={setProgressStatus}
            />
            <OutcomeSelect
              label="Buy In"
              value={buyInStatus}
              choices={buyInChoices}
              disabled={!isPilotCompany || saving}
              onChange={setBuyInStatus}
            />
          </div>
          <section className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  Current milestone
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  {currentMilestoneName
                    ? `${currentOfferName || "Current offer"} / ${currentMilestoneName}`
                    : "No current milestone is configured for this client."}
                </p>
              </div>
              {currentMilestoneName ? (
                <button
                  type="button"
                  onClick={completeCurrentMilestone}
                  disabled={!isPilotCompany || saving || completingMilestone}
                  className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 cursor-pointer"
                >
                  {completingMilestone
                    ? "Completing..."
                    : "Complete current milestone"}
                </button>
              ) : null}
            </div>
          </section>
          <div
            className={`rounded-md border px-4 py-3 text-sm ${
              isPilotCompany
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            {loadingPilotState
              ? "Checking RetainOS write status..."
              : isPilotCompany
                ? "Quick Updates save to RetainOS pilot history. Glide mirror fields remain unchanged."
                : "Editing is locked for now while this reads from the Glide mirror."}
          </div>
          {saveError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {saveError}
            </div>
          ) : null}
          {saveMessage ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {saveMessage}
            </div>
          ) : null}
          {historyEvents.length > 0 ? (
            <section className="rounded-lg border border-gray-200 bg-gray-50">
              <div className="border-b border-gray-200 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-900">
                  RetainOS pilot history
                </h3>
              </div>
              <div className="divide-y divide-gray-200">
                {historyEvents.map((historyEvent) => (
                  <article
                    key={historyEvent.id}
                    className="space-y-2 px-4 py-3 text-sm"
                  >
                    <div className="font-medium text-gray-900">
                      {formatDateTime(historyEvent.created_at)}
                    </div>
                    {historyEvent.notes ? (
                      <p className="text-gray-700">{historyEvent.notes}</p>
                    ) : null}
                    {historyEvent.next_steps ? (
                      <p className="text-gray-700">
                        <span className="font-medium">Next steps:</span>{" "}
                        {historyEvent.next_steps}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                      {historyEvent.success_status ? (
                        <span className="rounded-full bg-white px-2 py-1">
                          Success:{" "}
                          {choiceDisplay(
                            historyEvent.success_status,
                            successChoices,
                          )}
                        </span>
                      ) : null}
                      {historyEvent.progress_status ? (
                        <span className="rounded-full bg-white px-2 py-1">
                          Progress:{" "}
                          {choiceDisplay(
                            historyEvent.progress_status,
                            progressChoices,
                          )}
                        </span>
                      ) : null}
                      {historyEvent.buy_in_status ? (
                        <span className="rounded-full bg-white px-2 py-1">
                          Buy In:{" "}
                          {choiceDisplay(
                            historyEvent.buy_in_status,
                            buyInChoices,
                          )}
                        </span>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
          </div>
          <div className="flex justify-end gap-3 border-t border-gray-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
          >
            Done
          </button>
          <button
            type="submit"
            disabled={!isPilotCompany || saving}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
          >
            {saving ? "Saving..." : "Save Quick Update"}
          </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewClientModal({
  companyLegacyId,
  teamMembers,
  programChoices,
  offers,
  assignedTeamMemberId,
  onClose,
  onCreated,
}: {
  companyLegacyId: string;
  teamMembers: TeamMember[];
  programChoices: ProgramChoice[];
  offers: Offer[];
  assignedTeamMemberId: string;
  onClose: () => void;
  onCreated: (client: ClientRow) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const availableAssignees = teamMembers.filter(
    (member) =>
      member.is_archived !== true && member.role_hide_from_csm_list !== true,
  );
  const [clientName, setClientName] = useState("");
  const [clientBusiness, setClientBusiness] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientArchetype, setClientArchetype] = useState("");
  const [northStar, setNorthStar] = useState("");
  const [dateOnboarded, setDateOnboarded] = useState(today);
  const [programStatusValue, setProgramStatusValue] = useState(
    programChoices[0]?.program_value ?? "front-end",
  );
  const [csmTeamMemberId, setCsmTeamMemberId] = useState(assignedTeamMemberId);
  const [offerId, setOfferId] = useState("");
  const [offerMilestones, setOfferMilestones] = useState<OfferMilestone[]>([]);
  const [milestoneId, setMilestoneId] = useState("");
  const [createInitialContract, setCreateInitialContract] = useState(false);
  const [contractStartDate, setContractStartDate] = useState(today);
  const [contractEndDate, setContractEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadMilestones() {
      if (!offerId) {
        setOfferMilestones([]);
        setMilestoneId("");
        return;
      }
      const { data, error } = await supabase
        .from("backup_company_offer_milestones")
        .select("glide_row_id, offer_id, name, order")
        .eq("offer_id", offerId)
        .order("order", { ascending: true, nullsFirst: false });
      if (cancelled) return;
      if (error) {
        setSaveError(error.message);
        return;
      }
      const rows = (data ?? []) as OfferMilestone[];
      setOfferMilestones(rows);
      setMilestoneId(rows[0]?.glide_row_id ?? "");
    }
    void loadMilestones();
    return () => {
      cancelled = true;
    };
  }, [offerId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveError(null);

    const { data, error } = await supabase.functions.invoke(
      "manage-client-create",
      {
        body: {
          companyGlideId: companyLegacyId,
          clientName,
          clientBusiness,
          clientEmail,
          clientArchetype,
          northStar,
          dateOnboarded,
          programStatusValue,
          csmTeamMemberId,
          offerId,
          milestoneId,
          contractStartDate: createInitialContract ? contractStartDate : "",
          contractEndDate: createInitialContract ? contractEndDate : "",
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
    if (data?.client) {
      onCreated(mapAppClientRow(data.client as Record<string, unknown>));
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close new client"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 cursor-pointer"
      />
      <div className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">New Client</h2>
            <p className="mt-1 text-sm text-gray-500">
              Creates a RetainOS pilot client record. Glide mirror data stays unchanged.
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
                Client Name
              </span>
              <input
                value={clientName}
                onChange={(event) => setClientName(event.target.value)}
                required
                disabled={saving}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Business Name
              </span>
              <input
                value={clientBusiness}
                onChange={(event) => setClientBusiness(event.target.value)}
                disabled={saving}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Email
              </span>
              <input
                type="email"
                value={clientEmail}
                onChange={(event) => setClientEmail(event.target.value)}
                disabled={saving}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Status
              </span>
              <select
                value={programStatusValue}
                onChange={(event) => setProgramStatusValue(event.target.value)}
                disabled={saving}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
              >
                {programChoices.length === 0 ? (
                  <option value="front-end">Front End</option>
                ) : (
                  programChoices.map((choice) => (
                    <option
                      key={choice.program_value ?? ""}
                      value={choice.program_value ?? ""}
                    >
                      {choice.program_label ?? choice.program_value}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Date Onboarded
              </span>
              <input
                type="date"
                value={dateOnboarded}
                onChange={(event) => setDateOnboarded(event.target.value)}
                disabled={saving}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Primary CSM
              </span>
              <select
                value={csmTeamMemberId}
                onChange={(event) => setCsmTeamMemberId(event.target.value)}
                disabled={saving || Boolean(assignedTeamMemberId)}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
              >
                <option value="">Unassigned</option>
                {availableAssignees.map((member) => (
                  <option key={member.glide_row_id} value={member.glide_row_id}>
                    {member.name ?? "(unnamed)"}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Archetype
              </span>
              <input
                value={clientArchetype}
                onChange={(event) => setClientArchetype(event.target.value)}
                disabled={saving}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                North Star
              </span>
              <textarea
                value={northStar}
                onChange={(event) => setNorthStar(event.target.value)}
                rows={3}
                disabled={saving}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
              />
            </label>
            <div className="md:col-span-2 border-t border-gray-200 pt-4">
              <h3 className="text-sm font-semibold text-gray-900">
                Initial journey and contract
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Optional setup that saves follow-up work after creating the client.
              </p>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Offer / Pathway
              </span>
              <select
                value={offerId}
                onChange={(event) => setOfferId(event.target.value)}
                disabled={saving}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
              >
                <option value="">Set up later</option>
                {offers.map((offer) => (
                  <option key={offer.glide_row_id} value={offer.glide_row_id}>
                    {offer.name ?? "(unnamed)"}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Starting Milestone
              </span>
              <select
                value={milestoneId}
                onChange={(event) => setMilestoneId(event.target.value)}
                disabled={saving || !offerId}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
              >
                <option value="">
                  {offerId ? "Select milestone" : "Select an offer first"}
                </option>
                {offerMilestones.map((milestone) => (
                  <option key={milestone.glide_row_id} value={milestone.glide_row_id}>
                    {milestone.name ?? "(unnamed)"}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 md:col-span-2">
              <input
                type="checkbox"
                checked={createInitialContract}
                onChange={(event) => setCreateInitialContract(event.target.checked)}
                disabled={saving}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm font-medium text-gray-800">
                Add initial contract now
              </span>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Contract Start
              </span>
              <input
                type="date"
                value={contractStartDate}
                onChange={(event) => setContractStartDate(event.target.value)}
                disabled={saving || !createInitialContract}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Contract End / Renewal Date
              </span>
              <input
                type="date"
                value={contractEndDate}
                onChange={(event) => setContractEndDate(event.target.value)}
                disabled={saving || !createInitialContract}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
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
              disabled={saving || !clientName.trim()}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Creating..." : "Create Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FilterInput({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500"
      >
        {label}
      </label>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
    </div>
  );
}
function EmptyState({
  text,
  tone = "gray",
}: {
  text: string;
  tone?: "gray" | "amber";
}) {
  const classes =
    tone === "amber"
      ? "border-amber-200 bg-amber-50/60 text-amber-900"
      : "border-gray-300 bg-white text-gray-500";
  return (
    <div
      className={`rounded-lg border border-dashed p-10 text-center ${classes}`}
    >
      {text}
    </div>
  );
}
function ViewButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${active ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
    >
      {children}
    </button>
  );
}
function MiniMeta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div className="truncate font-medium text-gray-800">{value}</div>
    </div>
  );
}
function PilotReminders({
  reminders,
  onOpenClient,
}: {
  reminders: PilotReminder[];
  onOpenClient: (id: string) => void;
}) {
  if (reminders.length === 0) return null;
  const today = dateKey(new Date());
  return (
    <section className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-amber-950">Pilot reminders</h2>
          <p className="mt-1 text-sm text-amber-800">
            Due or coming up in the next 7 days. Use the calendar for the full timeline.
          </p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-amber-800">
          {reminders.length}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-3">
        {reminders.slice(0, 9).map((reminder) => {
          const reminderKey = dateKeyFromValue(reminder.date);
          const overdue = Boolean(reminderKey && reminderKey < today);
          return (
            <button
              key={reminder.id}
              type="button"
              onClick={() => onOpenClient(reminder.client.glide_row_id)}
              className="rounded-md border border-amber-200 bg-white px-3 py-2 text-left hover:border-amber-300 hover:bg-amber-100/40 cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-gray-900">
                  {reminder.client.client_name ?? "Unnamed client"}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    overdue
                      ? "bg-red-50 text-red-700"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {overdue ? "Overdue" : formatDate(reminder.date)}
                </span>
              </div>
              <div className="mt-1 text-xs text-gray-600">{reminder.label}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
export function Clients() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    capabilities,
    effectiveCompanyId,
    setViewAsCompanyId,
    teamMemberId,
  } = useAccountContext();
  const cachedState = useMemo(() => readClientsCache(), []);
  const initialCompanyId =
    effectiveCompanyId ||
    (searchParams.get("companyId") ?? cachedState?.filters.companyId ?? "");
  const cachedCompanyMatches =
    Boolean(cachedState) &&
    cachedState?.filters.companyId === initialCompanyId &&
    cachedState?.appliedFilters.companyId === initialCompanyId;
  const [filters, setFilters] = useState<ClientFilters>(() =>
    cachedCompanyMatches
      ? (cachedState?.filters ?? emptyFilters)
      : initialCompanyId
        ? { ...emptyFilters, companyId: initialCompanyId }
      : (cachedState?.filters ?? emptyFilters),
  );
  const [appliedFilters, setAppliedFilters] = useState<ClientFilters>(() =>
    cachedCompanyMatches
      ? (cachedState?.appliedFilters ?? emptyFilters)
      : initialCompanyId
        ? { ...emptyFilters, companyId: initialCompanyId }
      : (cachedState?.appliedFilters ?? emptyFilters),
  );
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamMembersLoading, setTeamMembersLoading] = useState(false);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [programChoices, setProgramChoices] = useState<ProgramChoice[]>([]);
  const [programChoicesLoading, setProgramChoicesLoading] = useState(false);
  const [appClientCompanyIds, setAppClientCompanyIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [calendarClients, setCalendarClients] = useState<ClientRow[]>([]);
  const [calendarTasks, setCalendarTasks] = useState<CalendarTaskRow[]>([]);
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("month");
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [pilotReminders, setPilotReminders] = useState<PilotReminder[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [totalClients, setTotalClients] = useState(0);
  const [page, setPage] = useState(cachedState?.page ?? 1);
  const [viewMode, setViewMode] = useState<ViewMode>(
    cachedState?.viewMode ?? "list",
  );
  const [sortField, setSortField] = useState<SortField>(
    cachedState?.sortField ?? "client_name",
  );
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    cachedState?.sortDirection ?? "asc",
  );
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  const statusFilterRef = useRef<HTMLFieldSetElement>(null);
  const [quickUpdateClient, setQuickUpdateClient] = useState<ClientRow | null>(
    null,
  );
  const [newClientOpen, setNewClientOpen] = useState(false);
  const selectedCompany = useMemo(
    () =>
      companies.find((company) => company.glide_row_id === filters.companyId) ??
      null,
    [companies, filters.companyId],
  );
  const showSecondaryAssigneeFilter =
    selectedCompany?.enable_secondary_assignee === true;
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
  const totalPages = Math.max(1, Math.ceil(totalClients / PAGE_SIZE));
  const pageStart = totalClients === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(page * PAGE_SIZE, totalClients);
  const assignedTeamMemberId = capabilities.canViewOnlyAssignedClients
    ? teamMemberId
    : "";
  const canUseCompanySwitcher = capabilities.canUseCompanySwitcher;
  const isUsingAppClients = appClientCompanyIds.has(
    appliedFilters.companyId || filters.companyId,
  );
  const canCreateClient =
    capabilities.canEditClient && Boolean(appliedFilters.companyId || filters.companyId);

  useEffect(() => {
    writeClientsCache({
      filters,
      appliedFilters,
      page,
      viewMode,
      sortField,
      sortDirection,
    });
  }, [appliedFilters, filters, page, sortDirection, sortField, viewMode]);
  useEffect(() => {
    if (!statusFilterOpen) return;
    function closeStatusFilter(event: MouseEvent) {
      if (
        statusFilterRef.current &&
        !statusFilterRef.current.contains(event.target as Node)
      ) {
        setStatusFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", closeStatusFilter);
    return () => document.removeEventListener("mousedown", closeStatusFilter);
  }, [statusFilterOpen]);
  useEffect(() => {
    if (!effectiveCompanyId || searchParams.get("companyId") === effectiveCompanyId) {
      return;
    }
    setFilters((prev) => ({
      ...prev,
      companyId: effectiveCompanyId,
      csmId: assignedTeamMemberId,
      secondaryAssigneeId: "",
      offerId: "",
    }));
    setAppliedFilters((prev) => ({
      ...prev,
      companyId: effectiveCompanyId,
      csmId: assignedTeamMemberId,
      secondaryAssigneeId: "",
      offerId: "",
    }));
    setPage(1);
    setSearchParams({ companyId: effectiveCompanyId }, { replace: true });
  }, [assignedTeamMemberId, effectiveCompanyId, searchParams, setSearchParams]);
  useEffect(() => {
    async function loadCompanies() {
      const [backupCompaniesResult, appCompaniesResult] = await Promise.all([
        supabase
        .from("backup_companies")
        .select("glide_row_id, name, enable_secondary_assignee")
        .or("archived.is.null,archived.eq.false")
          .order("name", { ascending: true }),
        supabase
          .from("companies")
          .select("legacy_glide_row_id, migration_status")
          .in("migration_status", ["pilot", "migrated"]),
      ]);

      let rows = (backupCompaniesResult.data ?? []) as Company[];
      if (!canUseCompanySwitcher && effectiveCompanyId) {
        rows = rows.filter((company) => company.glide_row_id === effectiveCompanyId);
      }
      if (backupCompaniesResult.error)
        console.error("Failed to load companies:", backupCompaniesResult.error);
      if (appCompaniesResult.error)
        console.error("Failed to load app companies:", appCompaniesResult.error);
      setCompanies(rows);
      setAppClientCompanyIds(
        new Set(
          (appCompaniesResult.data ?? [])
            .map((company) => company.legacy_glide_row_id)
            .filter((id): id is string => typeof id === "string" && id !== ""),
        ),
      );
      setCompaniesLoading(false);
    }
    void loadCompanies();
  }, [canUseCompanySwitcher, effectiveCompanyId]);
  useEffect(() => {
    if (!filters.companyId) {
      setTeamMembers([]);
      setTeamMembersLoading(false);
      return;
    }
    let cancelled = false;
    async function loadTeamMembers() {
      setTeamMembersLoading(true);
      const { data: appCompany } = await supabase
        .from("companies")
        .select("id")
        .eq("legacy_glide_row_id", filters.companyId)
        .in("migration_status", ["pilot", "migrated"])
        .maybeSingle();
      if (appCompany?.id) {
        const { data, error } = await supabase
          .from("company_members")
          .select("id, legacy_glide_row_id, name, status, hide_from_csm_list")
          .eq("company_id", appCompany.id)
          .order("name", { ascending: true });
        if (cancelled) return;
        if (error) console.error("Failed to load app-owned team members:", error);
        setTeamMembers(
          (data ?? []).map((member) => ({
            glide_row_id: member.legacy_glide_row_id ?? member.id,
            name: member.name,
            is_archived: member.status === "archived",
            role_hide_from_csm_list: member.hide_from_csm_list,
          })),
        );
      } else {
        const { data, error } = await supabase
          .from("backup_company_team")
          .select("glide_row_id, name, is_archived, role_hide_from_csm_list")
          .eq("company_id", filters.companyId)
          .order("name", { ascending: true });
        if (cancelled) return;
        if (error) console.error("Failed to load mirrored team members:", error);
        setTeamMembers((data ?? []) as TeamMember[]);
      }
      setTeamMembersLoading(false);
    }
    void loadTeamMembers();
    return () => {
      cancelled = true;
    };
  }, [filters.companyId]);
  useEffect(() => {
    if (!filters.companyId) {
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
        .eq("company_id", filters.companyId)
        .order("name", { ascending: true });
      if (cancelled) return;
      if (error) console.error("Failed to load offers:", error);
      const rows = (data ?? []) as Offer[];
      setOffers(rows);
      if (
        filters.offerId &&
        !rows.some((offer) => offer.glide_row_id === filters.offerId)
      ) {
        setFilters((prev) => ({ ...prev, offerId: "" }));
      }
      setOffersLoading(false);
    }
    void loadOffers();
    return () => {
      cancelled = true;
    };
  }, [filters.companyId, filters.offerId]);
  useEffect(() => {
    if (!filters.companyId || programChoices.length > 0) return;
    let cancelled = false;
    async function loadProgramChoices() {
      setProgramChoicesLoading(true);
      const { data, error } = await supabase
        .from("backup_choices")
        .select("program_value, program_label, program_emoji")
        .not("program_value", "is", null)
        .order("index", { ascending: true });
      if (cancelled) return;
      if (error) console.error("Failed to load program choices:", error);
      setProgramChoices((data ?? []) as ProgramChoice[]);
      setProgramChoicesLoading(false);
    }
    void loadProgramChoices();
    return () => {
      cancelled = true;
    };
  }, [filters.companyId, programChoices.length]);
  const loadClients = useCallback(async () => {
    if (!appliedFilters.companyId) {
      setClients([]);
      setTotalClients(0);
      setClientsLoading(false);
      return;
    }
    setClientsLoading(true);
    setClientsError(null);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const useAppClients = appClientCompanyIds.has(appliedFilters.companyId);
    let query = supabase
      .from(useAppClients ? "clients" : "backup_company_clients")
      .select("*", { count: "exact" })
      .eq(
        useAppClients ? "company_glide_row_id" : "company_id",
        appliedFilters.companyId,
      )
      .range(from, to);
    if (appliedFilters.clientName.trim())
      query = query.ilike(
        "client_name",
        `%${appliedFilters.clientName.trim()}%`,
      );
    if (assignedTeamMemberId) {
      query = query.or(
        `csm_team_member_id.eq.${assignedTeamMemberId},csm_secondary_assignee_id.eq.${assignedTeamMemberId}`,
      );
    } else if (appliedFilters.csmId) {
      query = query.eq("csm_team_member_id", appliedFilters.csmId);
    }
    if (appliedFilters.secondaryAssigneeId)
      query = query.eq(
        "csm_secondary_assignee_id",
        appliedFilters.secondaryAssigneeId,
      );
    if (appliedFilters.offerId)
      query = query.eq("offer_milestones_current_offer_id", appliedFilters.offerId);
    if (appliedFilters.programs.length > 0)
      query = query.in("program_status_value", appliedFilters.programs);
    if (appliedFilters.lastContact) {
      const dayStart = new Date(
        `${appliedFilters.lastContact}T00:00:00.000Z`,
      ).toISOString();
      const dayEnd = new Date(
        `${appliedFilters.lastContact}T23:59:59.999Z`,
      ).toISOString();
      query = query
        .gte("csm_date_of_last_contact", dayStart)
        .lte("csm_date_of_last_contact", dayEnd);
    }
    query = query
      .order(sortColumnFor(sortField), {
        ascending: sortDirection === "asc",
        nullsFirst: false,
      })
      .order("client_name", { ascending: true, nullsFirst: false });
    const { data, error, count } = await query;
    if (error) {
      console.error("Failed to load clients:", error);
      setClients([]);
      setTotalClients(0);
      setClientsError(error.message);
    } else {
      const rows = useAppClients
        ? ((data ?? []) as Record<string, unknown>[]).map(mapAppClientRow)
        : ((data ?? []) as ClientRow[]);
      setClients(rows);
      setTotalClients(count ?? rows.length);
    }
    setClientsLoading(false);
  }, [
    appClientCompanyIds,
    appliedFilters,
    assignedTeamMemberId,
    page,
    sortDirection,
    sortField,
  ]);
  useEffect(() => {
    void loadClients();
  }, [loadClients]);
  const loadCalendarClients = useCallback(async () => {
    if (!appliedFilters.companyId || viewMode !== "calendar") {
      setCalendarClients([]);
      setCalendarTasks([]);
      setCalendarLoading(false);
      return;
    }

    setCalendarLoading(true);
    setCalendarError(null);

    const useAppClients = appClientCompanyIds.has(appliedFilters.companyId);
    const bounds = calendarBounds(calendarMode, calendarDate);
    let query = supabase
      .from(useAppClients ? "clients" : "backup_company_clients")
      .select("*")
      .eq(
        useAppClients ? "company_glide_row_id" : "company_id",
        appliedFilters.companyId,
      )
      .order("client_name", { ascending: true, nullsFirst: false })
      .range(0, 4999);

    if (appliedFilters.clientName.trim()) {
      query = query.ilike(
        "client_name",
        `%${appliedFilters.clientName.trim()}%`,
      );
    }
    if (assignedTeamMemberId) {
      query = query.or(
        `csm_team_member_id.eq.${assignedTeamMemberId},csm_secondary_assignee_id.eq.${assignedTeamMemberId}`,
      );
    } else if (appliedFilters.csmId) {
      query = query.eq("csm_team_member_id", appliedFilters.csmId);
    }
    if (appliedFilters.secondaryAssigneeId) {
      query = query.eq(
        "csm_secondary_assignee_id",
        appliedFilters.secondaryAssigneeId,
      );
    }
    if (appliedFilters.offerId) {
      query = query.eq("offer_milestones_current_offer_id", appliedFilters.offerId);
    }
    if (appliedFilters.programs.length > 0) {
      query = query.in("program_status_value", appliedFilters.programs);
    }
    if (appliedFilters.lastContact) {
      const dayStart = new Date(
        `${appliedFilters.lastContact}T00:00:00.000Z`,
      ).toISOString();
      const dayEnd = new Date(
        `${appliedFilters.lastContact}T23:59:59.999Z`,
      ).toISOString();
      query = query
        .gte("csm_date_of_last_contact", dayStart)
        .lte("csm_date_of_last_contact", dayEnd);
    }

    const appTasksQuery = useAppClients
      ? supabase
          .from("client_tasks")
          .select(
            "glide_row_id, client_id, task_name, task_due_date, status_value, assigned_to_id",
          )
          .eq("company_glide_row_id", appliedFilters.companyId)
          .not("client_id", "is", null)
          .not("task_due_date", "is", null)
          .gte("task_due_date", bounds.start.toISOString())
          .lt("task_due_date", bounds.next.toISOString())
          .order("task_due_date", { ascending: true, nullsFirst: false })
          .range(0, 4999)
      : Promise.resolve({ data: [], error: null });
    const backupTasksQuery = supabase
      .from("backup_company_clients_tasks")
      .select(
        "glide_row_id, client_id, task_name, task_due_date, status_value, assigned_to_id",
      )
      .eq("company_id", appliedFilters.companyId)
      .not("client_id", "is", null)
      .not("task_due_date", "is", null)
      .gte("task_due_date", bounds.start.toISOString())
      .lt("task_due_date", bounds.next.toISOString())
      .order("task_due_date", { ascending: true, nullsFirst: false })
      .range(0, 4999);

    const [{ data, error }, appTasksResult, backupTasksResult] = await Promise.all([
      query,
      appTasksQuery,
      backupTasksQuery,
    ]);

    if (error) {
      console.error("Failed to load contact calendar:", error);
      setCalendarClients([]);
      setCalendarTasks([]);
      setCalendarError(error.message);
    } else {
      const rows = useAppClients
        ? ((data ?? []) as Record<string, unknown>[]).map(mapAppClientRow)
        : ((data ?? []) as ClientRow[]);
      setCalendarClients(rows);
      if (appTasksResult.error)
        console.error("Failed to load app calendar tasks:", appTasksResult.error);
      if (backupTasksResult.error)
        console.error(
          "Failed to load mirrored calendar tasks:",
          backupTasksResult.error,
        );
      const appRows = (appTasksResult.data ?? []) as CalendarTaskRow[];
      const backupRows = (backupTasksResult.data ?? []) as CalendarTaskRow[];
      const appTaskIds = new Set(appRows.map((task) => task.glide_row_id));
      setCalendarTasks([
        ...appRows,
        ...backupRows.filter((task) => !appTaskIds.has(task.glide_row_id)),
      ]);
    }
    setCalendarLoading(false);
  }, [
    appClientCompanyIds,
    appliedFilters,
    assignedTeamMemberId,
    calendarDate,
    calendarMode,
    viewMode,
  ]);
  useEffect(() => {
    void loadCalendarClients();
  }, [loadCalendarClients]);
  useEffect(() => {
    let cancelled = false;
    async function loadPilotReminders() {
      if (
        !appliedFilters.companyId ||
        !appClientCompanyIds.has(appliedFilters.companyId)
      ) {
        setPilotReminders([]);
        return;
      }
      let query = supabase
        .from("clients")
        .select("*")
        .eq("company_glide_row_id", appliedFilters.companyId)
        .range(0, 4999);
      if (assignedTeamMemberId) {
        query = query.or(
          `csm_team_member_id.eq.${assignedTeamMemberId},csm_secondary_assignee_id.eq.${assignedTeamMemberId}`,
        );
      }
      const { data, error } = await query;
      if (cancelled) return;
      if (error) {
        console.error("Failed to load pilot reminders:", error);
        setPilotReminders([]);
        return;
      }
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const oldest = new Date(start);
      oldest.setDate(oldest.getDate() - 30);
      const end = new Date(start);
      end.setDate(end.getDate() + 8);
      const reminders: PilotReminder[] = [];
      for (const rawClient of (data ?? []) as Record<string, unknown>[]) {
        const client = mapAppClientRow(rawClient);
        const candidates = [
          {
            type: "next-contact" as const,
            label: "Next contact",
            date: client.csm_date_of_next_contact,
            enabled: ["front-end", "back-end"].includes(
              String(client.program_status_value ?? ""),
            ),
          },
          {
            type: "renewal" as const,
            label: "Contract renewal",
            date: client.current_contract_end_date_for_filtering,
            enabled: ["front-end", "back-end"].includes(
              String(client.program_status_value ?? ""),
            ),
          },
          {
            type: "paused-return" as const,
            label: "Paused client return",
            date: client.program_paused_return_date,
            enabled: client.program_status_value === "paused",
          },
        ];
        for (const candidate of candidates) {
          if (!candidate.enabled || typeof candidate.date !== "string") continue;
          const date = new Date(candidate.date);
          if (Number.isNaN(date.getTime()) || date < oldest || date >= end) continue;
          reminders.push({
            id: `${client.glide_row_id}:${candidate.type}`,
            type: candidate.type,
            label: candidate.label,
            date: candidate.date,
            client,
          });
        }
      }
      reminders.sort(
        (a, b) =>
          new Date(a.date).getTime() - new Date(b.date).getTime() ||
          String(a.client.client_name ?? "").localeCompare(
            String(b.client.client_name ?? ""),
          ),
      );
      setPilotReminders(reminders);
    }
    void loadPilotReminders();
    return () => {
      cancelled = true;
    };
  }, [appClientCompanyIds, appliedFilters.companyId, assignedTeamMemberId]);
  function applyFilters() {
    if (!filters.companyId) return;
    const next = {
      ...filters,
      companyId: effectiveCompanyId || filters.companyId,
      csmId: assignedTeamMemberId || filters.csmId,
      secondaryAssigneeId: showSecondaryAssigneeFilter
        ? filters.secondaryAssigneeId
        : "",
    };
    setAppliedFilters(next);
    setPage(1);
    setSearchParams(next.companyId ? { companyId: next.companyId } : {}, {
      replace: true,
    });
  }
  function clearFilters() {
    const baseFilters = {
      ...emptyFilters,
      companyId: effectiveCompanyId,
      csmId: assignedTeamMemberId,
    };
    setFilters(baseFilters);
    setAppliedFilters(baseFilters);
    setClients([]);
    setTotalClients(0);
    setPage(1);
    setSortField("client_name");
    setSortDirection("asc");
    window.sessionStorage.removeItem(CLIENTS_CACHE_KEY);
    setSearchParams(effectiveCompanyId ? { companyId: effectiveCompanyId } : {}, {
      replace: true,
    });
  }
  const renderClientAvatar = (client: ClientRow, size = "h-9 w-9") =>
    client.client_image ? (
      <img
        src={client.client_image}
        alt=""
        className={`${size} rounded-xl border border-gray-200 bg-gray-50 object-cover`}
      />
    ) : (
      <div
        className={`${size} flex items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-xs font-semibold text-indigo-700`}
      >
        {getInitials(client.client_name)}
      </div>
    );
  const clientMeta = (client: ClientRow) => ({
    last: valueFrom(client, lastContactColumns),
    next: valueFrom(client, nextContactColumns),
    buyIn: valueFrom(client, buyInColumns),
    pathway: valueFrom(client, pathwayColumns),
    progress: valueFrom(client, progressColumns),
    onboarded: valueFrom(client, onboardedColumns),
    renewal: valueFrom(client, renewalColumns),
  });
  return (
    <div>
      <div className="mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Clients</h1>
            <p className="mt-1 text-sm text-gray-500">
              {isUsingAppClients
                ? "RetainOS pilot client data for this company. Quick Updates write to app-owned client state and history."
                : "Read-only view of clients mirrored from Glide into Supabase."}
            </p>
          </div>
          {canCreateClient ? (
            <button
              type="button"
              onClick={() => setNewClientOpen(true)}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 cursor-pointer"
            >
              + New Client
            </button>
          ) : null}
        </div>
      </div>
      <PilotReminders
        reminders={pilotReminders}
        onOpenClient={(id) => navigate(`/clients/${encodeURIComponent(id)}`)}
      />
      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label
              htmlFor="clients-company-filter"
              className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500"
            >
              Company
            </label>
            <select
              id="clients-company-filter"
              value={filters.companyId}
              onChange={(e) => {
                if (canUseCompanySwitcher) setViewAsCompanyId(e.target.value);
                setFilters((prev) => ({
                  ...prev,
                  companyId: e.target.value,
                  csmId: "",
                  secondaryAssigneeId: "",
                  offerId: "",
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
          {filters.companyId && (
            <>
              <FilterInput
                id="clients-name-filter"
                label="Client Name"
                value={filters.clientName}
                placeholder="Search clients"
                onChange={(clientName) =>
                  setFilters((prev) => ({ ...prev, clientName }))
                }
              />
              <fieldset ref={statusFilterRef} className="relative">
                <legend className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </legend>
                <button
                  type="button"
                  onClick={() => setStatusFilterOpen((open) => !open)}
                  disabled={programChoicesLoading}
                  className="flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 cursor-pointer"
                >
                  <span>
                    {programChoicesLoading
                      ? "Loading statuses..."
                      : filters.programs.length === 0
                        ? "All statuses"
                        : `${filters.programs.length} selected`}
                  </span>
                  <span className="text-gray-400">v</span>
                </button>
                {statusFilterOpen && !programChoicesLoading && (
                  <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-gray-200 bg-white p-2 shadow-lg">
                    <button
                      type="button"
                      onClick={() =>
                        setFilters((prev) => ({ ...prev, programs: [] }))
                      }
                      className="mb-1 w-full rounded px-2 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-50 cursor-pointer"
                    >
                      All statuses
                    </button>
                    {programChoices.map((choice) => {
                      const value = choice.program_value ?? "";
                      if (!value) return null;
                      const checked = filters.programs.includes(value);
                      return (
                        <label
                          key={value}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              setFilters((prev) => ({
                                ...prev,
                                programs: event.target.checked
                                  ? [...prev.programs, value]
                                  : prev.programs.filter(
                                      (program) => program !== value,
                                    ),
                              }))
                            }
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>
                            {choice.program_emoji
                              ? `${choice.program_emoji} ${choice.program_label ?? value}`
                              : (choice.program_label ?? value)}
                          </span>
                        </label>
                      );
                    })}
                    {programChoices.length === 0 && (
                      <p className="px-2 py-1.5 text-sm text-gray-400">
                        No statuses found
                      </p>
                    )}
                  </div>
                )}
              </fieldset>
              {!capabilities.canViewOnlyAssignedClients && (
                <div>
                  <label
                    htmlFor="clients-csm-filter"
                    className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500"
                  >
                    CSM
                  </label>
                  <select
                    id="clients-csm-filter"
                    value={filters.csmId}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, csmId: e.target.value }))
                    }
                    disabled={teamMembersLoading}
                    className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
                  >
                    <option value="">
                      {teamMembersLoading ? "Loading team..." : "All CSMs"}
                    </option>
                    {availableTeamMembers.map((member) => (
                      <option
                        key={member.glide_row_id}
                        value={member.glide_row_id}
                      >
                        {member.name ?? "(unnamed)"}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label
                  htmlFor="clients-offer-filter"
                  className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  Offer
                </label>
                <select
                  id="clients-offer-filter"
                  value={filters.offerId}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, offerId: e.target.value }))
                  }
                  disabled={offersLoading}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">
                    {offersLoading ? "Loading offers..." : "All offers"}
                  </option>
                  {offers.map((offer) => (
                    <option key={offer.glide_row_id} value={offer.glide_row_id}>
                      {offer.name ?? "(unnamed)"}
                    </option>
                  ))}
                </select>
              </div>
              {showSecondaryAssigneeFilter && (
                <div>
                  <label
                    htmlFor="clients-secondary-filter"
                    className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500"
                  >
                    Secondary Assignee
                  </label>
                  <select
                    id="clients-secondary-filter"
                    value={filters.secondaryAssigneeId}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        secondaryAssigneeId: e.target.value,
                      }))
                    }
                    disabled={teamMembersLoading}
                    className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
                  >
                    <option value="">All secondary assignees</option>
                    {availableTeamMembers.map((member) => (
                      <option
                        key={member.glide_row_id}
                        value={member.glide_row_id}
                      >
                        {member.name ?? "(unnamed)"}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label
                  htmlFor="clients-last-contact-filter"
                  className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  Last Contact
                </label>
                <input
                  id="clients-last-contact-filter"
                  type="date"
                  value={filters.lastContact}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      lastContact: event.target.value,
                    }))
                  }
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={applyFilters}
            disabled={!filters.companyId || clientsLoading}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-indigo-600 cursor-pointer"
          >
            Apply filters
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 cursor-pointer"
          >
            Clear All Filters
          </button>
        </div>
      </div>
      {!filters.companyId ? (
        <EmptyState text="Select a company above to load clients." />
      ) : !appliedFilters.companyId ? (
        <EmptyState text="Click Apply filters to load clients." tone="amber" />
      ) : (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-700">
                Client List
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {clientsLoading
                  ? "Loading clients..."
                  : `${totalClients.toLocaleString()} client${totalClients === 1 ? "" : "s"}`}
              </p>
            </div>
            <div className="inline-flex rounded-md border border-gray-200 bg-white p-1 shadow-sm">
              <ViewButton
                active={viewMode === "list"}
                onClick={() => setViewMode("list")}
              >
                List
              </ViewButton>
              <ViewButton
                active={viewMode === "card"}
                onClick={() => setViewMode("card")}
              >
                Cards
              </ViewButton>
              <ViewButton
                active={viewMode === "calendar"}
                onClick={() => setViewMode("calendar")}
              >
                Calendar
              </ViewButton>
            </div>
            {viewMode !== "calendar" ? (
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor="clients-sort-field"
                  className="text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  Sort
                </label>
                <select
                  id="clients-sort-field"
                  value={sortField}
                  onChange={(event) => {
                    setSortField(event.target.value as SortField);
                    setPage(1);
                  }}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="client_name">Client name</option>
                  <option value="onboarded">Onboarded date</option>
                  <option value="renewal">Renewal date</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setSortDirection((direction) =>
                      direction === "asc" ? "desc" : "asc",
                    );
                    setPage(1);
                  }}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {sortField === "client_name"
                    ? sortDirection === "asc"
                      ? "A-Z"
                      : "Z-A"
                    : sortDirection === "asc"
                      ? "Oldest first"
                      : "Newest first"}
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-md border border-gray-200 bg-white p-1 shadow-sm">
                  {(["month", "week", "day"] as CalendarMode[]).map((mode) => (
                    <ViewButton
                      key={mode}
                      active={calendarMode === mode}
                      onClick={() => setCalendarMode(mode)}
                    >
                      {mode[0].toUpperCase() + mode.slice(1)}
                    </ViewButton>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setCalendarDate((date) =>
                      addCalendarPeriod(date, calendarMode, -1),
                    )
                  }
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Previous
                </button>
                <input
                  type={calendarMode === "month" ? "month" : "date"}
                  value={
                    calendarMode === "month"
                      ? monthInputValue(calendarDate)
                      : dateKey(calendarDate)
                  }
                  onChange={(event) => {
                    if (calendarMode === "month") {
                      const [year, month] = event.target.value
                        .split("-")
                        .map(Number);
                      if (year && month) setCalendarDate(new Date(year, month - 1, 1));
                    } else {
                      const next = new Date(`${event.target.value}T00:00:00`);
                      if (!Number.isNaN(next.getTime())) setCalendarDate(next);
                    }
                  }}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() =>
                    setCalendarDate((date) =>
                      addCalendarPeriod(date, calendarMode, 1),
                    )
                  }
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            )}
          </div>
          {clientsError && viewMode !== "calendar" ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {clientsError}
            </div>
          ) : viewMode === "calendar" ? (
            <ContactCalendar
              mode={calendarMode}
              anchorDate={calendarDate}
              clients={calendarClients}
              tasks={calendarTasks}
              loading={calendarLoading}
              error={calendarError}
              programChoices={programChoices}
              teamMemberNameById={teamMemberNameById}
              clientMeta={clientMeta}
              onOpenClient={(id) =>
                navigate(`/clients/${encodeURIComponent(id)}`)
              }
              onQuickUpdate={
                capabilities.canQuickUpdate ? setQuickUpdateClient : undefined
              }
            />
          ) : clientsLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-indigo-600" />
            </div>
          ) : clients.length === 0 ? (
            <EmptyState text="No clients matched these filters." />
          ) : viewMode === "list" ? (
            <ClientTable
              clients={clients}
              programChoices={programChoices}
              teamMemberNameById={teamMemberNameById}
              renderClientAvatar={renderClientAvatar}
              clientMeta={clientMeta}
              onOpenClient={(id) =>
                navigate(`/clients/${encodeURIComponent(id)}`)
              }
              onQuickUpdate={
                capabilities.canQuickUpdate ? setQuickUpdateClient : undefined
              }
            />
          ) : (
            <ClientCards
              clients={clients}
              programChoices={programChoices}
              teamMemberNameById={teamMemberNameById}
              renderClientAvatar={renderClientAvatar}
              clientMeta={clientMeta}
              onOpenClient={(id) =>
                navigate(`/clients/${encodeURIComponent(id)}`)
              }
              onQuickUpdate={
                capabilities.canQuickUpdate ? setQuickUpdateClient : undefined
              }
            />
          )}
          {viewMode !== "calendar" && !clientsLoading && totalClients > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-gray-500">
                Showing {pageStart}-{pageEnd} of {totalClients.toLocaleString()}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page === 1}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPage((prev) => Math.min(totalPages, prev + 1))
                  }
                  disabled={page >= totalPages}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {quickUpdateClient && (
        <QuickUpdateModal
          client={quickUpdateClient}
          onClose={() => setQuickUpdateClient(null)}
        />
      )}
      {newClientOpen ? (
        <NewClientModal
          companyLegacyId={appliedFilters.companyId || filters.companyId}
          teamMembers={teamMembers}
          programChoices={programChoices}
          offers={offers}
          assignedTeamMemberId={assignedTeamMemberId}
          onClose={() => setNewClientOpen(false)}
          onCreated={(client) => {
            setClients((current) => [client, ...current].slice(0, PAGE_SIZE));
            setTotalClients((current) => current + 1);
            setPage(1);
          }}
        />
      ) : null}
    </div>
  );
}
function ClientTable({
  clients,
  programChoices,
  teamMemberNameById,
  renderClientAvatar,
  clientMeta,
  onOpenClient,
  onQuickUpdate,
}: {
  clients: ClientRow[];
  programChoices: ProgramChoice[];
  teamMemberNameById: Map<string, string>;
  renderClientAvatar: (client: ClientRow) => React.ReactNode;
  clientMeta: (client: ClientRow) => {
    last: unknown;
    next: unknown;
    onboarded: unknown;
    renewal: unknown;
    buyIn: unknown;
    progress: unknown;
  };
  onOpenClient: (id: string) => void;
  onQuickUpdate?: (client: ClientRow) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {[
              "Client",
              "CSM",
              "Status",
              "Onboarded",
              "Renewal",
              "Last Contact",
              "Next Contact",
              "Buy In",
              "Progress",
              "Actions",
            ].map((heading) => (
              <th
                key={heading}
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {clients.map((client) => {
            const meta = clientMeta(client);
            return (
              <tr
                key={client.glide_row_id}
                className="transition-colors hover:bg-gray-50"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {renderClientAvatar(client)}
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onOpenClient(client.glide_row_id)}
                        className="truncate text-left text-sm font-medium text-gray-900 hover:text-indigo-700 cursor-pointer"
                      >
                        {client.client_name ?? "Unnamed client"}
                      </button>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {teamMemberNameById.get(client.csm_team_member_id ?? "") ??
                    "Unassigned"}
                </td>
                <td className="px-4 py-3">
                  <ProgramStatusPill
                    value={client.program_status_value}
                    choices={programChoices}
                  />
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {formatDate(meta.onboarded)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {formatDate(meta.renewal)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {formatDate(meta.last)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {formatDate(meta.next)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  <OutcomePill value={meta.buyIn} />
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  <OutcomePill value={meta.progress} />
                </td>
                <td className="px-4 py-3 text-sm">
                  {onQuickUpdate ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onQuickUpdate(client);
                      }}
                      className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100 cursor-pointer"
                    >
                      Quick Update
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400">Read-only</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
function ClientCards({
  clients,
  programChoices,
  teamMemberNameById,
  renderClientAvatar,
  clientMeta,
  onOpenClient,
  onQuickUpdate,
}: {
  clients: ClientRow[];
  programChoices: ProgramChoice[];
  teamMemberNameById: Map<string, string>;
  renderClientAvatar: (client: ClientRow, size?: string) => React.ReactNode;
  clientMeta: (client: ClientRow) => {
    last: unknown;
    pathway: unknown;
    onboarded: unknown;
    renewal: unknown;
    buyIn: unknown;
    progress: unknown;
  };
  onOpenClient: (id: string) => void;
  onQuickUpdate?: (client: ClientRow) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {clients.map((client) => {
        const meta = clientMeta(client);
        return (
          <div
            key={client.glide_row_id}
            role="button"
            tabIndex={0}
            onClick={() => onOpenClient(client.glide_row_id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpenClient(client.glide_row_id);
              }
            }}
            className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-indigo-300 hover:shadow-md cursor-pointer"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {renderClientAvatar(client, "h-10 w-10")}
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-gray-900">
                    {client.client_name ?? "Unnamed client"}
                  </div>
                  <div className="truncate text-xs text-gray-500">
                    {teamMemberNameById.get(client.csm_team_member_id ?? "") ??
                      "Unassigned"}
                  </div>
                </div>
              </div>
              <ProgramStatusPill
                value={client.program_status_value}
                choices={programChoices}
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <MiniMeta label="Buy In" value={<OutcomePill value={meta.buyIn} />} />
              <MiniMeta
                label="Progress"
                value={<OutcomePill value={meta.progress} />}
              />
              <MiniMeta label="Last Contact" value={formatDate(meta.last)} />
              <MiniMeta label="Onboarded" value={formatDate(meta.onboarded)} />
              <MiniMeta label="Renewal" value={formatDate(meta.renewal)} />
              <MiniMeta label="Pathway" value={displayValue(meta.pathway)} />
            </div>
            {onQuickUpdate && (
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onQuickUpdate(client);
                  }}
                  className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100 cursor-pointer"
                >
                  Quick Update
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
type CalendarEventType =
  | "onboarded"
  | "renewal"
  | "last-contact"
  | "next-contact"
  | "task";

function eventSortOrder(type: CalendarEventType) {
  if (type === "next-contact") return 1;
  if (type === "last-contact") return 2;
  if (type === "task") return 3;
  if (type === "renewal") return 4;
  return 5;
}

function eventBorderClass(type: CalendarEventType) {
  if (type === "next-contact") return "border-indigo-200";
  if (type === "last-contact") return "border-emerald-200";
  if (type === "task") return "border-amber-200";
  if (type === "renewal") return "border-rose-200";
  return "border-sky-200";
}

function eventTagClass(type: CalendarEventType) {
  if (type === "next-contact") return "bg-indigo-50 text-indigo-700";
  if (type === "last-contact") return "bg-emerald-50 text-emerald-700";
  if (type === "task") return "bg-amber-50 text-amber-700";
  if (type === "renewal") return "bg-rose-50 text-rose-700";
  return "bg-sky-50 text-sky-700";
}

function CalendarLegend() {
  const items: { type: CalendarEventType; label: string }[] = [
    { type: "next-contact", label: "Next" },
    { type: "last-contact", label: "Last" },
    { type: "task", label: "Task" },
    { type: "renewal", label: "Renewal" },
    { type: "onboarded", label: "Onboarded" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((item) => (
        <span
          key={item.type}
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${eventTagClass(item.type)}`}
        >
          {item.label}
        </span>
      ))}
    </div>
  );
}

function ContactCalendar({
  mode,
  anchorDate,
  clients,
  tasks,
  loading,
  error,
  programChoices,
  teamMemberNameById,
  clientMeta,
  onOpenClient,
  onQuickUpdate,
}: {
  mode: CalendarMode;
  anchorDate: Date;
  clients: ClientRow[];
  tasks: CalendarTaskRow[];
  loading: boolean;
  error: string | null;
  programChoices: ProgramChoice[];
  teamMemberNameById: Map<string, string>;
  clientMeta: (client: ClientRow) => {
    last: unknown;
    next: unknown;
    onboarded: unknown;
    renewal: unknown;
  };
  onOpenClient: (id: string) => void;
  onQuickUpdate?: (client: ClientRow) => void;
}) {
  const todayKey = dateKey(new Date());
  const { start, next } = calendarBounds(mode, anchorDate);
  const firstGridDay = new Date(start);
  if (mode === "month") firstGridDay.setDate(start.getDate() - start.getDay());

  const dayCount = mode === "month" ? 42 : mode === "week" ? 7 : 1;
  const days = Array.from({ length: dayCount }, (_, index) => {
    const day = new Date(firstGridDay);
    day.setDate(firstGridDay.getDate() + index);
    return day;
  });

  type CalendarEvent = {
    id: string;
    type: CalendarEventType;
    label: string;
    date: unknown;
    client: ClientRow;
    task?: CalendarTaskRow;
  };
  const clientById = new Map(clients.map((client) => [client.glide_row_id, client]));
  const eventsByDay = new Map<string, CalendarEvent[]>();
  const addEvent = (event: CalendarEvent) => {
    if (!isDateInRange(event.date, start, next)) return;
    const key = dateKeyFromValue(event.date);
    if (!key) return;
    const rows = eventsByDay.get(key) ?? [];
    rows.push(event);
    eventsByDay.set(key, rows);
  };

  for (const client of clients) {
    const meta = clientMeta(client);
    addEvent({
      id: `${client.glide_row_id}:onboarded`,
      type: "onboarded",
      label: "Onboarded",
      date: meta.onboarded,
      client,
    });
    addEvent({
      id: `${client.glide_row_id}:renewal`,
      type: "renewal",
      label: "Renewal",
      date: meta.renewal,
      client,
    });
    addEvent({
      id: `${client.glide_row_id}:last-contact`,
      type: "last-contact",
      label: "Last contact",
      date: meta.last,
      client,
    });
    addEvent({
      id: `${client.glide_row_id}:next-contact`,
      type: "next-contact",
      label: "Next contact",
      date: meta.next,
      client,
    });
  }
  for (const task of tasks) {
    if (!task.client_id) continue;
    const client = clientById.get(task.client_id);
    if (!client) continue;
    addEvent({
      id: `${task.glide_row_id}:task`,
      type: "task",
      label: task.task_name ? `Task: ${task.task_name}` : "Task due",
      date: task.task_due_date,
      client,
      task,
    });
  }
  for (const events of eventsByDay.values()) {
    events.sort(
      (a, b) =>
        String(a.client.client_name ?? "").localeCompare(
          String(b.client.client_name ?? ""),
        ) || eventSortOrder(a.type) - eventSortOrder(b.type),
    );
  }

  const rangeLabel =
    mode === "month"
      ? monthLabel(anchorDate)
      : mode === "week"
        ? `${formatDate(start)} - ${formatDate(new Date(next.getTime() - 1))}`
        : formatDate(anchorDate);
  const eventCount = [...eventsByDay.values()].reduce(
    (sum, rows) => sum + rows.length,
    0,
  );

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-700">
            Contact Calendar
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {loading
              ? "Loading client timeline..."
              : `${eventCount.toLocaleString()} calendar event${eventCount === 1 ? "" : "s"} in ${rangeLabel}`}
          </p>
        </div>
        <CalendarLegend />
      </div>
      {mode !== "day" ? (
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wider text-gray-500">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="px-3 py-2">
              {day}
            </div>
          ))}
        </div>
      ) : null}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-indigo-600" />
        </div>
      ) : (
        <div className={`grid grid-cols-1 ${mode === "day" ? "" : "sm:grid-cols-7"}`}>
          {days.map((day) => {
            const key = dateKey(day);
            const dayEvents = eventsByDay.get(key) ?? [];
            const inCurrentMonth = mode !== "month" || day.getMonth() === anchorDate.getMonth();
            const isToday = key === todayKey;
            return (
              <div
                key={key}
                className={`${mode === "day" ? "min-h-96" : "min-h-36"} border-b border-r border-gray-100 p-2 ${
                  inCurrentMonth ? "bg-white" : "bg-gray-50 text-gray-400"
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                      isToday
                        ? "bg-indigo-600 text-white"
                        : inCurrentMonth
                          ? "text-gray-700"
                          : "text-gray-400"
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  {dayEvents.length > 0 ? (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      {dayEvents.length}
                    </span>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  {dayEvents.slice(0, mode === "day" ? 40 : 5).map((event) => (
                    <div
                      key={event.id}
                      className={`rounded-md border bg-white p-2 shadow-sm ${eventBorderClass(event.type)}`}
                    >
                      <button
                        type="button"
                        onClick={() => onOpenClient(event.client.glide_row_id)}
                        className="block w-full truncate text-left text-xs font-semibold text-gray-900 hover:text-indigo-700"
                        title={event.client.client_name ?? "Unnamed client"}
                      >
                        {event.client.client_name ?? "Unnamed client"}
                      </button>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${eventTagClass(event.type)}`}
                        >
                          {event.label}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-[11px] text-gray-500">
                        {teamMemberNameById.get(event.client.csm_team_member_id ?? "") ??
                          "Unassigned"}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <ProgramStatusPill
                          value={event.client.program_status_value}
                          choices={programChoices}
                        />
                        {onQuickUpdate && event.type !== "onboarded" ? (
                          <button
                            type="button"
                            onClick={() => onQuickUpdate(event.client)}
                            className="rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100"
                          >
                            Update
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {dayEvents.length > (mode === "day" ? 40 : 5) ? (
                    <div className="rounded-md bg-gray-50 px-2 py-1 text-xs text-gray-500">
                      +{dayEvents.length - (mode === "day" ? 40 : 5)} more
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!loading && eventCount === 0 ? (
        <div className="border-t border-gray-100 px-4 py-8 text-center text-sm text-gray-500">
          No calendar events found for this range.
        </div>
      ) : null}
    </div>
  );
}
