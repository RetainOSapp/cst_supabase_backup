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
import {
  loadCompanyWorkspaceDefaults,
  type DefaultCalendarMode,
  type DefaultClientView,
} from "../lib/companySettings.ts";
import { useAccountContext } from "../lib/accountContext.tsx";
import { supabase } from "../lib/supabase.ts";
import { uploadClientImage } from "../lib/clientImageUpload.ts";
import { ClientAdvocacyPanel } from "../components/ClientAdvocacyPanel.tsx";
import {
  advocacyDefinitions,
  buildAdvocacyEventDrafts,
  emptyAdvocacyDrafts,
  type AdvocacyType,
} from "../lib/clientAdvocacy.ts";

const PAGE_SIZE = 12;
const NOTE_SEARCH_PAGE_SIZE = 12;
const CLIENTS_ROSTER_REFRESH_KEY = "retainos.clientsRosterRefresh.v1";
const UNASSIGNED_CSM_FILTER = "__unassigned";
const clientArchetypeOptions = ["Doer", "Controller", "Worrier", "Follower"] as const;
type ViewMode = "list" | "card" | "calendar" | "notes";
type CalendarMode = "month" | "week" | "day";
type SortField =
  | "client_name"
  | "onboarded"
  | "renewal"
  | "last_contact"
  | "next_contact";
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
type CompanyCustomFieldRow = {
  id: string;
  key: string;
  label: string;
  description?: string | null;
  field_type:
    | "text"
    | "textarea"
    | "number"
    | "date"
    | "boolean"
    | "single_select"
    | "multi_select"
    | "url"
    | "email";
  options?: { value: string; label: string }[] | null;
  position?: number | null;
  source_key?: string | null;
  status?: "active" | "archived" | null;
};
type ClientCustomFieldValueRow = {
  id: string;
  custom_field_id: string;
  field_key: string;
  value_text?: string | null;
  value_json?: unknown;
  source_key?: string | null;
};
type CustomFieldDrafts = Record<string, string>;
type CustomFieldChange = {
  id: string;
  key?: string | null;
  label?: string | null;
  before?: string | null;
  after?: string | null;
};
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
  enable_archetypes?: boolean | null;
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
  position?: number | null;
  order?: number | null;
}
type ClientMilestoneProgress = Record<string, unknown> & {
  id?: string | null;
  glide_row_id?: string | null;
  offer_id?: string | null;
  milestone_id?: string | null;
  start_date?: string | null;
  completion_date?: string | null;
};
interface PilotReminder {
  id: string;
  type: "next-contact" | "renewal" | "paused-return" | "task-due";
  label: string;
  date: string;
  client: ClientRow;
}
interface NotificationRow {
  id: string;
  type: string;
  title: string | null;
  due_at: string | null;
  client_id: string | null;
  legacy_client_id: string | null;
  metadata?: Record<string, unknown> | null;
}
interface NoteSearchResult {
  source_key: string;
  source_type: string | null;
  source_label: string | null;
  client_id: string;
  client_name: string | null;
  client_image: string | null;
  csm_team_member_id: string | null;
  event_date: string | null;
  matched_text: string | null;
  total_count: number | null;
}
interface ClientFilters {
  companyId: string;
  csmId: string;
  secondaryAssigneeId: string;
  offerId: string;
  milestoneId: string;
  programs: string[];
  clientName: string;
  lastContact: string;
  lastContactAge: string;
  nextContactWindow: string;
  renewalWindow: string;
  successStatus: string;
  progressStatus: string;
  buyInStatus: string;
  reviewAdvocacyStatus: string;
  testimonialAdvocacyStatus: string;
  referralAdvocacyStatus: string;
  renewalUpsellAdvocacyStatus: string;
}
type AdvocacyFilterField =
  | "reviewAdvocacyStatus"
  | "testimonialAdvocacyStatus"
  | "referralAdvocacyStatus"
  | "renewalUpsellAdvocacyStatus";
const emptyFilters: ClientFilters = {
  companyId: "",
  csmId: "",
  secondaryAssigneeId: "",
  offerId: "",
  milestoneId: "",
  programs: [],
  clientName: "",
  lastContact: "",
  lastContactAge: "",
  nextContactWindow: "",
  renewalWindow: "",
  successStatus: "",
  progressStatus: "",
  buyInStatus: "",
  reviewAdvocacyStatus: "",
  testimonialAdvocacyStatus: "",
  referralAdvocacyStatus: "",
  renewalUpsellAdvocacyStatus: "",
};
const CLIENTS_CACHE_KEY = "cst.clientsRosterState.v1";

const renewalWindowOptions = [
  { value: "overdue", label: "Overdue" },
  { value: "next_7", label: "Next 7 days" },
  { value: "next_14", label: "Next 14 days" },
  { value: "next_30", label: "Next 30 days" },
  { value: "next_60", label: "Next 60 days" },
  { value: "next_90", label: "Next 90 days" },
];

const lastContactAgeOptions = [
  { value: "never", label: "Never contacted" },
  { value: "older_7", label: "More than 7 days ago" },
  { value: "older_14", label: "More than 14 days ago" },
  { value: "older_30", label: "More than 30 days ago" },
  { value: "older_60", label: "More than 60 days ago" },
  { value: "older_90", label: "More than 90 days ago" },
  { value: "older_180", label: "More than 180 days ago" },
  { value: "older_365", label: "More than 365 days ago" },
];

const nextContactWindowOptions = [
  { value: "overdue", label: "Overdue" },
  { value: "none", label: "No next contact set" },
  { value: "next_7", label: "Next 7 days" },
  { value: "next_14", label: "Next 14 days" },
  { value: "next_30", label: "Next 30 days" },
  { value: "next_60", label: "Next 60 days" },
  { value: "next_90", label: "Next 90 days" },
];

const healthFilterOptions = [
  { value: "green", label: "Green" },
  { value: "yellow", label: "Yellow" },
  { value: "red", label: "Red" },
];

const successFilterOptions = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

const advocacyFilterOptions = [
  { value: "not_asked", label: "Not asked" },
  { value: "asked", label: "Asked" },
  { value: "received", label: "Received" },
];

const advocacyFilterFields: Record<AdvocacyType, AdvocacyFilterField> = {
  review: "reviewAdvocacyStatus",
  testimonial: "testimonialAdvocacyStatus",
  referral: "referralAdvocacyStatus",
  renewal_upsell: "renewalUpsellAdvocacyStatus",
};

const advocacyStatusColumns: Record<AdvocacyType, string> = {
  review: "advocacy_review_status",
  testimonial: "advocacy_testimonial_status",
  referral: "advocacy_referral_status",
  renewal_upsell: "advocacy_renewal_upsell_status",
};

function startOfTodayIso() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function endOfDayIso(daysFromToday: number) {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  date.setDate(date.getDate() + daysFromToday);
  return date.toISOString();
}

function startOfDayIso(daysFromToday: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + daysFromToday);
  return date.toISOString();
}

function daysFromWindow(value: string) {
  const match = value.match(/_(\d+)$/);
  return match ? Number(match[1]) : null;
}

function clientFiltersEqual(left: ClientFilters, right: ClientFilters) {
  return (
    left.companyId === right.companyId &&
    left.csmId === right.csmId &&
    left.secondaryAssigneeId === right.secondaryAssigneeId &&
    left.offerId === right.offerId &&
    left.milestoneId === right.milestoneId &&
    left.clientName === right.clientName &&
    left.lastContact === right.lastContact &&
    left.lastContactAge === right.lastContactAge &&
    left.nextContactWindow === right.nextContactWindow &&
    left.renewalWindow === right.renewalWindow &&
    left.successStatus === right.successStatus &&
    left.progressStatus === right.progressStatus &&
    left.buyInStatus === right.buyInStatus &&
    left.reviewAdvocacyStatus === right.reviewAdvocacyStatus &&
    left.testimonialAdvocacyStatus === right.testimonialAdvocacyStatus &&
    left.referralAdvocacyStatus === right.referralAdvocacyStatus &&
    left.renewalUpsellAdvocacyStatus === right.renewalUpsellAdvocacyStatus &&
    left.programs.length === right.programs.length &&
    left.programs.every((program) => right.programs.includes(program))
  );
}

interface ClientsCacheState {
  filters: ClientFilters;
  appliedFilters: ClientFilters;
  page: number;
  viewMode: ViewMode;
  viewModeCompanyId?: string;
  viewModeUserOverride?: boolean;
  calendarMode?: CalendarMode;
  calendarModeCompanyId?: string;
  calendarModeUserOverride?: boolean;
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
        parsed.viewMode === "card" ||
        parsed.viewMode === "calendar" ||
        parsed.viewMode === "notes"
          ? parsed.viewMode
          : "list",
      viewModeCompanyId:
        typeof parsed.viewModeCompanyId === "string"
          ? parsed.viewModeCompanyId
          : undefined,
      viewModeUserOverride: parsed.viewModeUserOverride === true,
      calendarMode:
        parsed.calendarMode === "week" || parsed.calendarMode === "day"
          ? parsed.calendarMode
          : "month",
      calendarModeCompanyId:
        typeof parsed.calendarModeCompanyId === "string"
          ? parsed.calendarModeCompanyId
          : undefined,
      calendarModeUserOverride: parsed.calendarModeUserOverride === true,
      sortField:
        parsed.sortField === "onboarded" ||
        parsed.sortField === "renewal" ||
        parsed.sortField === "last_contact" ||
        parsed.sortField === "next_contact"
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

function toViewMode(value: DefaultClientView): ViewMode {
  return value;
}

function toCalendarMode(value: DefaultCalendarMode): CalendarMode {
  return value;
}

function normalizeClientArchetype(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "doer") return "Doer";
  if (text === "controller") return "Controller";
  if (text === "worrier") return "Worrier";
  if (text === "follower") return "Follower";
  return "";
}

function mapAppClientRow(row: Record<string, unknown>): ClientRow {
  const companyId =
    typeof row.company_glide_row_id === "string"
      ? row.company_glide_row_id
      : (row.company_id as string | null | undefined);
  const lastContact =
    row.csm_date_of_last_contact ?? row.last_contact_at ?? row.last_contact_date ?? null;
  const nextContact =
    row.csm_date_of_next_contact ?? row.next_contact_at ?? row.next_contact_date ?? null;
  const success =
    row.outcomes_success_for_filtering ??
    row.outcomes_success_value_for_filtering ??
    row.outcomes_success_value ??
    row.success_status ??
    null;
  const progress =
    row.outcomes_progress_for_filtering ??
    row.outcomes_progress_value ??
    row.progress_status ??
    null;
  const buyIn =
    row.outcomes_buy_in_for_filtering ??
    row.outcomes_buy_in_value ??
    row.buy_in_status ??
    null;

  return {
    ...row,
    company_id: companyId,
    company_glide_row_id: companyId,
    csm_date_of_last_contact: lastContact,
    last_contact: lastContact,
    last_contact_date: lastContact,
    date_of_last_contact: lastContact,
    csm_date_of_next_contact: nextContact,
    next_contact: nextContact,
    next_contact_date: nextContact,
    date_of_next_contact: nextContact,
    outcomes_success_for_filtering: success,
    outcomes_success_value_for_filtering: success,
    outcomes_success_value: success,
    success_status: success,
    outcomes_progress_for_filtering: progress,
    outcomes_progress_value: progress,
    progress_status: progress,
    outcomes_buy_in_for_filtering: buyIn,
    outcomes_buy_in_value: buyIn,
    buy_in_status: buyIn,
  } as unknown as ClientRow;
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
  if (field === "last_contact") return "csm_date_of_last_contact";
  if (field === "next_contact") return "csm_date_of_next_contact";
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

function customFieldRawValueFromClient(
  client: ClientRow,
  field: CompanyCustomFieldRow,
) {
  const metadata =
    client.metadata && typeof client.metadata === "object" && !Array.isArray(client.metadata)
      ? (client.metadata as Record<string, unknown>)
      : {};
  const customFields =
    metadata.custom_fields &&
    typeof metadata.custom_fields === "object" &&
    !Array.isArray(metadata.custom_fields)
      ? (metadata.custom_fields as Record<string, unknown>)
      : {};
  const candidates = [
    field.key,
    field.source_key,
    `custom_fields.${field.key}`,
    `custom_fields.${field.source_key ?? field.key}`,
  ].filter((key): key is string => Boolean(key));

  for (const key of candidates) {
    if (key.startsWith("custom_fields.")) {
      const nestedKey = key.replace("custom_fields.", "");
      const value = customFields[nestedKey];
      if (isPresent(value)) return value;
      continue;
    }
    const directValue = client[key];
    if (isPresent(directValue)) return directValue;
    const metadataValue = metadata[key];
    if (isPresent(metadataValue)) return metadataValue;
    const customValue = customFields[key];
    if (isPresent(customValue)) return customValue;
  }

  return null;
}

function customFieldInputValue(
  field: CompanyCustomFieldRow,
  valueRow: ClientCustomFieldValueRow | undefined,
  client: ClientRow,
) {
  const value =
    valueRow?.value_json ?? valueRow?.value_text ?? customFieldRawValueFromClient(client, field);
  if (!isPresent(value)) return "";
  if (field.field_type === "boolean") {
    const normalized = String(value).trim().toLowerCase();
    if (["true", "yes", "1"].includes(normalized)) return "true";
    if (["false", "no", "0"].includes(normalized)) return "false";
  }
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  return String(value);
}

function customFieldDraftsFromValues(
  fields: CompanyCustomFieldRow[],
  values: ClientCustomFieldValueRow[],
  client: ClientRow,
) {
  const valueByFieldId = new Map(values.map((row) => [row.custom_field_id, row]));
  return fields.reduce<CustomFieldDrafts>((drafts, field) => {
    drafts[field.id] = customFieldInputValue(
      field,
      valueByFieldId.get(field.id),
      client,
    );
    return drafts;
  }, {});
}

function CustomFieldEditorGrid({
  client,
  fields,
  values,
  drafts,
  disabled,
  onChange,
}: {
  client: ClientRow;
  fields: CompanyCustomFieldRow[];
  values: ClientCustomFieldValueRow[];
  drafts: CustomFieldDrafts;
  disabled: boolean;
  onChange: (fieldId: string, value: string) => void;
}) {
  const valueByFieldId = new Map(values.map((row) => [row.custom_field_id, row]));
  const activeFields = fields
    .filter((field) => field.status !== "archived")
    .sort((a, b) => {
      const positionA = typeof a.position === "number" ? a.position : 9999;
      const positionB = typeof b.position === "number" ? b.position : 9999;
      if (positionA !== positionB) return positionA - positionB;
      return a.label.localeCompare(b.label);
    });

  if (activeFields.length === 0) return null;

  return (
    <section className="retainos-section overflow-hidden">
      <div className="border-b border-[#e4e9f0] bg-[#f7f9fc] px-4 py-3">
        <h3 className="retainos-section-title">Custom fields</h3>
        <p className="retainos-section-copy mt-1">
          Update company-specific tracking fields for this client.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 px-4 py-4 md:grid-cols-2">
        {activeFields.map((field) => {
          const value =
            drafts[field.id] ??
            customFieldInputValue(field, valueByFieldId.get(field.id), client);
          return (
            <label key={field.id} className="block">
              <span className="retainos-field-label">{field.label}</span>
              {field.field_type === "textarea" ? (
                <textarea
                  value={value}
                  onChange={(event) => onChange(field.id, event.target.value)}
                  disabled={disabled}
                  rows={3}
                  className="retainos-input"
                />
              ) : field.field_type === "boolean" ? (
                <select
                  value={value}
                  onChange={(event) => onChange(field.id, event.target.value)}
                  disabled={disabled}
                  className="retainos-input"
                >
                  <option value="">Not set</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : field.field_type === "single_select" &&
                (field.options?.length ?? 0) > 0 ? (
                <select
                  value={value}
                  onChange={(event) => onChange(field.id, event.target.value)}
                  disabled={disabled}
                  className="retainos-input"
                >
                  <option value="">Not set</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={
                    field.field_type === "number"
                      ? "number"
                      : field.field_type === "date"
                        ? "date"
                        : field.field_type === "email"
                          ? "email"
                          : field.field_type === "url"
                            ? "url"
                            : "text"
                  }
                  value={value}
                  onChange={(event) => onChange(field.id, event.target.value)}
                  disabled={disabled}
                  placeholder={
                    field.field_type === "multi_select"
                      ? "Comma-separated values"
                      : undefined
                  }
                  className="retainos-input"
                />
              )}
              {field.description ? (
                <span className="mt-1 block text-xs text-[#7b8494]">
                  {field.description}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </section>
  );
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

function plainText(value: unknown) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function noteSnippet(value: unknown, query: string) {
  const text = plainText(value);
  const trimmedQuery = query.trim().toLowerCase();
  if (!text || !trimmedQuery) return text;
  const index = text.toLowerCase().indexOf(trimmedQuery);
  if (index < 0) return text.length > 260 ? `${text.slice(0, 260)}...` : text;
  const start = Math.max(0, index - 100);
  const end = Math.min(text.length, index + trimmedQuery.length + 180);
  return `${start > 0 ? "... " : ""}${text.slice(start, end)}${end < text.length ? " ..." : ""}`;
}

function HighlightedSnippet({ text, query }: { text: string; query: string }) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return <>{text}</>;
  const lowerText = text.toLowerCase();
  const lowerQuery = trimmedQuery.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let index = lowerText.indexOf(lowerQuery);

  while (index >= 0) {
    if (index > cursor) {
      parts.push(text.slice(cursor, index));
    }
    parts.push(
      <mark
        key={`${index}-${parts.length}`}
        className="rounded bg-[#fff1a8] px-0.5 text-[#162b3e]"
      >
        {text.slice(index, index + trimmedQuery.length)}
      </mark>,
    );
    cursor = index + trimmedQuery.length;
    index = lowerText.indexOf(lowerQuery, cursor);
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }
  return <>{parts}</>;
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
export function notificationReminderType(type: string): PilotReminder["type"] | null {
  if (type === "next_contact_due") return "next-contact";
  if (type === "renewal_due") return "renewal";
  if (type === "paused_return_due") return "paused-return";
  if (type === "task_due") return "task-due";
  return null;
}
export function notificationReminderLabel(notification: NotificationRow) {
  if (notification.type === "next_contact_due") return "Next contact";
  if (notification.type === "renewal_due") return "Contract renewal";
  if (notification.type === "paused_return_due") return "Paused client return";
  if (notification.type === "task_due") return "Task due";
  return notification.title ?? "Reminder";
}
export function buildClientFieldReminders(rawClients: Record<string, unknown>[]) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const oldest = new Date(start);
  oldest.setDate(oldest.getDate() - 30);
  const end = new Date(start);
  end.setDate(end.getDate() + 8);
  const reminders: PilotReminder[] = [];

  for (const rawClient of rawClients) {
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
  return reminders;
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
function toDateTimeInputValue(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function toDateInputValue(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}
function dateFromValue(value: unknown) {
  if (!isPresent(value)) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}
function milestoneSortValue(milestone: OfferMilestone) {
  const position = Number(milestone.position);
  if (Number.isFinite(position) && position > 0) return position;
  const order = Number(milestone.order);
  return Number.isFinite(order) ? order : 9999;
}
function textInputValue(value: unknown) {
  const text = String(value ?? "").trim();
  return text === "--" ? "" : text;
}
function clientMilestoneSortTime(row: ClientMilestoneProgress) {
  return (
    dateFromValue(row.start_date)?.getTime() ??
    dateFromValue(row.created_at)?.getTime() ??
    dateFromValue(row.completion_date)?.getTime() ??
    0
  );
}
function pickActiveClientMilestone(rows: ClientMilestoneProgress[]) {
  return (
    rows
      .filter(
        (row) => isPresent(row.milestone_id) && !isPresent(row.completion_date),
      )
      .slice()
      .sort((a, b) => clientMilestoneSortTime(b) - clientMilestoneSortTime(a))[0] ??
    null
  );
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
const defaultSuccessChoices: OutcomeChoice[] = [
  { value: "yes", display: "Yes" },
  { value: "no", display: "No" },
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

function outcomeChoicesFromDefinitions(
  rows: Record<string, unknown>[],
  outcomeType: "success" | "progress" | "buy_in",
) {
  return rows
    .filter((row) => row.outcome_type === outcomeType)
    .map((row) => ({
      value: normalizeOutcome(row.value),
      display: normalizeOutcome(row.label) || titleize(normalizeOutcome(row.value)),
    }))
    .filter((choice) => choice.value);
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

function applyAdvocacyStatusFilters<TQuery>(
  query: TQuery,
  filters: ClientFilters,
  useAppClients: boolean,
): TQuery {
  if (!useAppClients) return query;
  let nextQuery = query as unknown as {
    eq: (column: string, value: string) => unknown;
  };
  for (const definition of advocacyDefinitions) {
    const value = filters[advocacyFilterFields[definition.type]];
    if (!value) continue;
    nextQuery = nextQuery.eq(advocacyStatusColumns[definition.type], value) as {
      eq: (column: string, value: string) => unknown;
    };
  }
  return nextQuery as unknown as TQuery;
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
  tone = "slate",
}: {
  label: string;
  value: unknown;
  display?: "plain" | "rich" | "outcome";
  lookup?: Map<string, string>;
  tone?: "blue" | "green" | "amber" | "slate";
}) {
  const shownValue = lookup ? displayValue(value, lookup) : value;
  const toneClasses = {
    blue: "border-[#bfdbfe] bg-[#eff6ff]",
    green: "border-[#bbf7d0] bg-[#f0fdf4]",
    amber: "border-[#fde68a] bg-[#fffbeb]",
    slate: "border-[#dbe3ee] bg-[#f8fafc]",
  }[tone];
  return (
    <div className={`rounded-md border px-3.5 py-3 ${toneClasses}`}>
      <div className="text-[11px] font-semibold uppercase text-[#586273]">
        {label}
      </div>
      <div className="mt-1.5 text-sm font-medium text-[#162b3e]">
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
      <span className="retainos-field-label">{label}</span>
      <select
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="retainos-input"
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
  onClientUpdated,
}: {
  client: ClientRow;
  onClose: () => void;
  onClientUpdated: (client: ClientRow) => void;
}) {
  const [isPilotCompany, setIsPilotCompany] = useState(false);
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
    toDateInputValue(valueFrom(client, nextContactColumns)),
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
  const [customFields, setCustomFields] = useState<CompanyCustomFieldRow[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<
    ClientCustomFieldValueRow[]
  >([]);
  const [customFieldDrafts, setCustomFieldDrafts] = useState<CustomFieldDrafts>({});
  const [advocacyDrafts, setAdvocacyDrafts] = useState(emptyAdvocacyDrafts);
  const [notes, setNotes] = useState("");
  const [currentOfferName, setCurrentOfferName] = useState("");
  const [currentMilestoneName, setCurrentMilestoneName] = useState("");
  const [currentOfferMilestones, setCurrentOfferMilestones] = useState<
    OfferMilestone[]
  >([]);
  const [completingMilestone, setCompletingMilestone] = useState(false);
  const [completionDate, setCompletionDate] = useState(todayInputValue());
  const [startAnotherMilestone, setStartAnotherMilestone] = useState(false);
  const [nextStartMilestoneId, setNextStartMilestoneId] = useState("");
  const [nextStartDate, setNextStartDate] = useState(todayInputValue());
  const companyLegacyId = client.company_id ?? "";
  const [currentOfferId, setCurrentOfferId] = useState(
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
      const { data: appCompany } = companyLegacyId
        ? await supabase
            .from("companies")
            .select("id")
            .eq("legacy_glide_row_id", companyLegacyId)
            .in("migration_status", ["pilot", "migrated"])
            .maybeSingle()
        : { data: null };

      if (appCompany?.id) {
        const { data: definitions, error: definitionsError } = await supabase
          .from("company_outcome_definitions")
          .select("outcome_type, value, label, position")
          .eq("company_id", appCompany.id)
          .eq("status", "active")
          .order("position", { ascending: true });
        if (cancelled) return;
        if (!definitionsError) {
          const rows = (definitions ?? []) as Record<string, unknown>[];
          const nextSuccessChoices = outcomeChoicesFromDefinitions(rows, "success");
          const nextProgressChoices = outcomeChoicesFromDefinitions(rows, "progress");
          const nextBuyInChoices = outcomeChoicesFromDefinitions(rows, "buy_in");
          setSuccessChoices(
            nextSuccessChoices.length > 0
              ? nextSuccessChoices
              : defaultSuccessChoices,
          );
          setProgressChoices(
            nextProgressChoices.length > 0
              ? nextProgressChoices
              : defaultOutcomeChoices,
          );
          setBuyInChoices(
            nextBuyInChoices.length > 0 ? nextBuyInChoices : defaultOutcomeChoices,
          );
          return;
        } else {
          console.error(
            "Failed to load app-owned outcome choices:",
            definitionsError,
          );
        }
        setSuccessChoices(defaultSuccessChoices);
        setProgressChoices(defaultOutcomeChoices);
        setBuyInChoices(defaultOutcomeChoices);
        return;
      }

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
  }, [companyLegacyId]);

  useEffect(() => {
    let cancelled = false;
    async function loadCurrentMilestone() {
      let effectiveOfferId = currentOfferId;
      let effectiveMilestoneId = currentMilestoneId;

      const { data: progressRows, error: progressError } = await supabase
        .from("client_milestones")
        .select("*")
        .eq("client_id", client.glide_row_id)
        .order("created_at", { ascending: false });

      if (!cancelled && progressError) {
        console.error("Failed to load client milestone progress:", progressError);
      }

      const activeProgress = pickActiveClientMilestone(
        ((progressRows ?? []) as ClientMilestoneProgress[]),
      );
      if (activeProgress) {
        effectiveMilestoneId =
          textInputValue(activeProgress.milestone_id) || effectiveMilestoneId;
        effectiveOfferId = textInputValue(activeProgress.offer_id) || effectiveOfferId;
      }

      if (!effectiveOfferId && effectiveMilestoneId) {
        const { data: milestoneOffer } = await supabase
          .from("company_offer_milestones")
          .select("offer_id")
          .eq("glide_row_id", effectiveMilestoneId)
          .maybeSingle();
        effectiveOfferId =
          textInputValue(milestoneOffer?.offer_id) || effectiveOfferId;
      }

      if (!effectiveOfferId || !effectiveMilestoneId) {
        setCurrentOfferName("");
        setCurrentMilestoneName("");
        setCurrentOfferMilestones([]);
        return;
      }
      if (effectiveOfferId !== currentOfferId) setCurrentOfferId(effectiveOfferId);
      if (effectiveMilestoneId !== currentMilestoneId) {
        setCurrentMilestoneId(effectiveMilestoneId);
      }
      const [appOfferResult, appMilestoneResult] = await Promise.all([
        supabase
          .from("company_offers")
          .select("name")
          .eq("glide_row_id", effectiveOfferId)
          .maybeSingle(),
        supabase
          .from("company_offer_milestones")
          .select("name")
          .eq("glide_row_id", effectiveMilestoneId)
          .maybeSingle(),
      ]);
      const appMilestonesResult = await supabase
        .from("company_offer_milestones")
        .select("glide_row_id, offer_id, name, position")
        .eq("offer_id", effectiveOfferId)
        .eq("status", "active")
        .order("position", { ascending: true, nullsFirst: false });
      const [offerResult, milestoneResult] = await Promise.all([
        appOfferResult.data
          ? Promise.resolve(appOfferResult)
          : supabase
              .from("backup_company_offers")
              .select("name")
              .eq("glide_row_id", effectiveOfferId)
              .maybeSingle(),
        appMilestoneResult.data
          ? Promise.resolve(appMilestoneResult)
          : supabase
              .from("backup_company_offer_milestones")
              .select("name")
              .eq("glide_row_id", effectiveMilestoneId)
              .maybeSingle(),
      ]);
      const mirrorMilestonesResult =
        appMilestonesResult.error || (appMilestonesResult.data ?? []).length === 0
          ? await supabase
              .from("backup_company_offer_milestones")
              .select("glide_row_id, offer_id, name, order")
              .eq("offer_id", effectiveOfferId)
              .order("order", { ascending: true, nullsFirst: false })
          : null;
      if (cancelled) return;
      setCurrentOfferName(offerResult.data?.name ?? effectiveOfferId);
      setCurrentMilestoneName(milestoneResult.data?.name ?? effectiveMilestoneId);
      setCurrentOfferMilestones(
        (((appMilestonesResult.data ?? []).length > 0
          ? appMilestonesResult.data
          : mirrorMilestonesResult?.data ?? []) as OfferMilestone[]).sort(
          (a, b) => milestoneSortValue(a) - milestoneSortValue(b),
        ),
      );
    }
    void loadCurrentMilestone();
    return () => {
      cancelled = true;
    };
  }, [client.glide_row_id, currentMilestoneId, currentOfferId]);

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
        setCustomFields([]);
        setCustomFieldValues([]);
        setCustomFieldDrafts({});
        setLoadingPilotState(false);
        return;
      }

      setIsPilotCompany(true);
      const [customFieldsResult, customFieldValuesResult] =
        await Promise.all([
          supabase
            .from("company_custom_fields")
            .select(
              "id, key, label, description, field_type, options, position, source_key, status",
            )
            .eq("company_id", company.id)
            .eq("entity_type", "client")
            .eq("status", "active")
            .order("position", { ascending: true })
            .order("label", { ascending: true }),
          supabase
            .from("client_custom_field_values")
            .select(
              "id, custom_field_id, field_key, value_text, value_json, source_key",
            )
            .eq("company_id", company.id)
            .eq("client_id", client.glide_row_id),
        ]);

      if (cancelled) return;

      const nextCustomFields = customFieldsResult.error
        ? []
        : ((customFieldsResult.data ?? []) as CompanyCustomFieldRow[]);
      const nextCustomFieldValues = customFieldValuesResult.error
        ? []
        : ((customFieldValuesResult.data ?? []) as ClientCustomFieldValueRow[]);
      if (customFieldsResult.error) {
        console.error("Failed to load custom fields:", customFieldsResult.error);
      }
      if (customFieldValuesResult.error) {
        console.error(
          "Failed to load custom field values:",
          customFieldValuesResult.error,
        );
      }
      setCustomFields(nextCustomFields);
      setCustomFieldValues(nextCustomFieldValues);
      setCustomFieldDrafts(
        customFieldDraftsFromValues(nextCustomFields, nextCustomFieldValues, client),
      );
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

  function applyCustomFieldChanges(changes: CustomFieldChange[]) {
    if (changes.length === 0) return;
    setCustomFieldValues((current) => {
      const byFieldId = new Map(current.map((row) => [row.custom_field_id, row]));
      for (const change of changes) {
        const updated: ClientCustomFieldValueRow = {
          ...(byFieldId.get(change.id) ?? {
            id: change.id,
            custom_field_id: change.id,
            field_key: change.key ?? "",
          }),
          custom_field_id: change.id,
          field_key: change.key ?? byFieldId.get(change.id)?.field_key ?? "",
          value_text: change.after ?? null,
          value_json: null,
        };
        byFieldId.set(change.id, updated);
      }
      return Array.from(byFieldId.values());
    });
  }

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
          customFields: customFields.map((field) => ({
            id: field.id,
            value: customFieldDrafts[field.id] ?? "",
          })),
          advocacyEvents: buildAdvocacyEventDrafts(advocacyDrafts),
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

    const customFieldChanges = Array.isArray(data?.customFields)
      ? (data.customFields as CustomFieldChange[])
      : [];
    applyCustomFieldChanges(customFieldChanges);
    if (data?.client) {
      onClientUpdated(mapAppClientRow(data.client as Record<string, unknown>));
    }
    setNotes("");
    setAdvocacyDrafts(emptyAdvocacyDrafts());
    onClose();
  }

  const currentMilestoneIndex = currentOfferMilestones.findIndex(
    (milestone) => milestone.glide_row_id === currentMilestoneId,
  );
  const nextConfiguredMilestone =
    currentMilestoneIndex >= 0
      ? currentOfferMilestones[currentMilestoneIndex + 1] ?? null
      : null;
  const startableMilestones = currentOfferMilestones.filter(
    (milestone) => milestone.glide_row_id !== currentMilestoneId,
  );
  const firstStartableMilestoneId = startableMilestones[0]?.glide_row_id ?? "";

  useEffect(() => {
    const defaultNextId =
      nextConfiguredMilestone?.glide_row_id ??
      firstStartableMilestoneId ??
      "";
    setNextStartMilestoneId(defaultNextId);
  }, [firstStartableMilestoneId, nextConfiguredMilestone?.glide_row_id]);

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
          completionDate,
          notes,
        },
      },
    );
    if (error) {
      setCompletingMilestone(false);
      setSaveError(error.message);
      return;
    }
    if (data?.error) {
      setCompletingMilestone(false);
      setSaveError(data.error);
      return;
    }
    if (data?.client) {
      onClientUpdated(mapAppClientRow(data.client as Record<string, unknown>));
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
    if (startAnotherMilestone && nextStartMilestoneId) {
      const selectedStartMilestone = startableMilestones.find(
        (milestone) => milestone.glide_row_id === nextStartMilestoneId,
      );
      const { data: startData, error: startError } =
        await supabase.functions.invoke("manage-client-milestone", {
          body: {
            action: "start_milestone",
            clientLegacyId: client.glide_row_id,
            offerId: currentOfferId,
            milestoneId: nextStartMilestoneId,
            startDate: nextStartDate || completionDate,
            notes,
          },
        });
      if (startError) {
        setCompletingMilestone(false);
        setSaveError(
          `Milestone completed, but RetainOS could not start the next milestone: ${startError.message}`,
        );
        return;
      }
      if (startData?.error) {
        setCompletingMilestone(false);
        setSaveError(
          `Milestone completed, but RetainOS could not start the next milestone: ${startData.error}`,
        );
        return;
      }
      if (startData?.client) {
        onClientUpdated(mapAppClientRow(startData.client as Record<string, unknown>));
      }
      setCurrentMilestoneId(nextStartMilestoneId);
      setCurrentMilestoneName(selectedStartMilestone?.name ?? nextStartMilestoneId);
    }
    setCompletingMilestone(false);
    setSaveMessage(
      startAnotherMilestone && nextStartMilestoneId
        ? "Milestone completed and the selected next milestone was started."
        : nextName
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
        className="absolute inset-0 bg-[#0e1b29]/55 backdrop-blur-[2px] cursor-pointer"
      />
      <div className="retainos-modal relative max-h-[92vh] w-full max-w-4xl overflow-y-auto">
        <div className="retainos-modal-header sticky top-0 z-10 flex items-start justify-between gap-4 px-6 py-5">
          <div>
            <div className="text-[11px] font-semibold uppercase text-[#2b79c4]">
              Client interaction
            </div>
            <h2 className="mt-1 text-xl font-semibold text-[#162b3e]">
              Quick Update · {client.client_name ?? "Unnamed client"}
            </h2>
            <p className="mt-1 text-sm text-[#586273]">
              {isPilotCompany
                ? "Record the latest client context, outcomes, and pathway progress."
                : "Read-only preview while this company remains on CST data."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[#98a2b3] hover:bg-white hover:text-[#162b3e] cursor-pointer"
          >
            <span className="sr-only">Close</span>
            <span className="text-xl leading-none">x</span>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="space-y-5 px-6 py-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ReadOnlyField
                label="North Star"
                value={valueFrom(client, northStarColumns)}
                display="rich"
                tone="blue"
              />
              <ReadOnlyField
                label="Next Steps"
                value={valueFrom(client, nextStepsColumns)}
                display="rich"
                tone="green"
              />
              <ReadOnlyField
                label="Date of Last Contact"
                value={formatDate(valueFrom(client, lastContactColumns))}
                tone="slate"
              />
              <ReadOnlyField
                label="Date of Next Contact"
                value={formatDate(valueFrom(client, nextContactColumns))}
                tone="amber"
              />
            </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block">
              <span className="retainos-field-label">Next Steps</span>
              <textarea
                disabled={!isPilotCompany || saving}
                value={nextSteps}
                onChange={(event) => setNextSteps(event.target.value)}
                rows={4}
                className="retainos-input"
              />
            </label>
            <label className="block">
              <span className="retainos-field-label">Notes</span>
              <textarea
                disabled={!isPilotCompany || saving}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={4}
                placeholder="Add context from the client interaction"
                className="retainos-input"
              />
            </label>
            <label className="block">
              <span className="retainos-field-label">Date of Last Contact</span>
              <input
                type="datetime-local"
                disabled={!isPilotCompany || saving}
                value={lastContactAt}
                onChange={(event) => setLastContactAt(event.target.value)}
                className="retainos-input"
              />
            </label>
            <label className="block">
              <span className="retainos-field-label">Date of Next Contact</span>
              <input
                type="date"
                disabled={!isPilotCompany || saving}
                value={nextContactAt}
                onChange={(event) => setNextContactAt(event.target.value)}
                className="retainos-input"
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
          <CustomFieldEditorGrid
            client={client}
            fields={customFields}
            values={customFieldValues}
            drafts={customFieldDrafts}
            disabled={!isPilotCompany || saving}
            onChange={(fieldId, value) =>
              setCustomFieldDrafts((current) => ({
                ...current,
                [fieldId]: value,
              }))
            }
          />
          <section className="retainos-section overflow-hidden">
            <div className="border-b border-[#e4e9f0] bg-[#f7f9fc] px-4 py-3">
              <h3 className="retainos-section-title">Pathway progress</h3>
              <p className="retainos-section-copy mt-1">
                Complete the current milestone when the client is ready to advance.
              </p>
            </div>
            <div className="space-y-4 px-4 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase text-[#586273]">
                    Current pathway / milestone
                  </div>
                  <p className="mt-1.5 text-sm font-semibold text-[#162b3e]">
                    {currentMilestoneName
                      ? `${currentOfferName || "Current pathway"} / ${currentMilestoneName}`
                      : "No current milestone is configured for this client."}
                  </p>
                  {currentMilestoneName ? (
                    <p className="mt-1 text-xs text-[#6c7684]">
                      Next state:{" "}
                      {nextConfiguredMilestone?.name ??
                        "Final milestone completed"}
                    </p>
                  ) : null}
                </div>
                {currentMilestoneName ? (
                  <label className="block min-w-[180px]">
                    <span className="retainos-field-label">Completion Date</span>
                    <input
                      type="date"
                      value={completionDate}
                      onChange={(event) => {
                        setCompletionDate(event.target.value);
                        setNextStartDate((current) => current || event.target.value);
                      }}
                      disabled={!isPilotCompany || saving || completingMilestone}
                      className="retainos-input"
                    />
                  </label>
                ) : null}
              </div>
              {currentMilestoneName && startableMilestones.length > 0 ? (
                <div className="rounded-lg border border-[#e4e9f0] bg-[#f7f9fc] px-4 py-3">
                  <label className="flex items-start gap-3 text-sm font-semibold text-[#364152]">
                    <input
                      type="checkbox"
                      checked={startAnotherMilestone}
                      onChange={(event) =>
                        setStartAnotherMilestone(event.target.checked)
                      }
                      disabled={!isPilotCompany || saving || completingMilestone}
                      className="mt-0.5 h-4 w-4 rounded border-[#cbd2dc]"
                    />
                    <span>
                      Start another milestone after completing this one
                      <span className="mt-1 block text-xs font-normal text-[#6c7684]">
                        Use the next milestone in line, or choose another active
                        milestone.
                      </span>
                    </span>
                  </label>
                  {startAnotherMilestone ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="retainos-field-label">
                          Milestone To Start
                        </span>
                        <select
                          value={nextStartMilestoneId}
                          onChange={(event) =>
                            setNextStartMilestoneId(event.target.value)
                          }
                          disabled={!isPilotCompany || saving || completingMilestone}
                          className="retainos-input"
                        >
                          {startableMilestones.map((milestone) => (
                            <option
                              key={milestone.glide_row_id}
                              value={milestone.glide_row_id}
                            >
                              {milestone.name ?? milestone.glide_row_id}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="retainos-field-label">Start Date</span>
                        <input
                          type="date"
                          value={nextStartDate}
                          onChange={(event) => setNextStartDate(event.target.value)}
                          disabled={!isPilotCompany || saving || completingMilestone}
                          className="retainos-input"
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {currentMilestoneName ? (
                <button
                  type="button"
                  onClick={completeCurrentMilestone}
                  disabled={!isPilotCompany || saving || completingMilestone}
                  className="rounded-full border border-[#34b389] bg-[#e7f6f0] px-4 py-2 text-sm font-semibold text-[#2a9272] hover:bg-white disabled:opacity-50 cursor-pointer"
                >
                  {completingMilestone
                    ? "Completing..."
                    : "Complete current milestone"}
                </button>
              ) : null}
            </div>
          </section>
          <ClientAdvocacyPanel
            client={client}
            drafts={advocacyDrafts}
            disabled={!isPilotCompany || saving}
            onChange={(type: AdvocacyType, draft) =>
              setAdvocacyDrafts((current) => ({ ...current, [type]: draft }))
            }
          />
          <div
            className={`rounded-md border px-4 py-3 text-sm ${
              isPilotCompany
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            {loadingPilotState
              ? "Checking write status..."
              : isPilotCompany
                ? "Quick Updates save to client history."
                : "Editing is locked for now while this reads from CST into RetainOS."}
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
          </div>
          <div className="retainos-modal-footer sticky bottom-0 flex justify-end gap-3 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="retainos-button-secondary"
          >
            Done
          </button>
          <button
            type="submit"
            disabled={!isPilotCompany || saving}
            className="retainos-button-primary"
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
  secondaryAssigneeEnabled,
  canEditDirectorNotes,
  onClose,
  onCreated,
}: {
  companyLegacyId: string;
  teamMembers: TeamMember[];
  programChoices: ProgramChoice[];
  offers: Offer[];
  assignedTeamMemberId: string;
  secondaryAssigneeEnabled: boolean;
  canEditDirectorNotes: boolean;
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
  const [clientImage, setClientImage] = useState("");
  const [clientImageUploading, setClientImageUploading] = useState(false);
  const [clientArchetype, setClientArchetype] = useState("");
  const [northStar, setNorthStar] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [directorNotes, setDirectorNotes] = useState("");
  const [dateOnboarded, setDateOnboarded] = useState(today);
  const [programStatusValue, setProgramStatusValue] = useState(
    programChoices[0]?.program_value ?? "front-end",
  );
  const [csmTeamMemberId, setCsmTeamMemberId] = useState(assignedTeamMemberId);
  const [secondaryAssigneeId, setSecondaryAssigneeId] = useState("");
  const [offerId, setOfferId] = useState("");
  const [offerMilestones, setOfferMilestones] = useState<OfferMilestone[]>([]);
  const [milestoneId, setMilestoneId] = useState("");
  const [createInitialContract, setCreateInitialContract] = useState(false);
  const [contractStartDate, setContractStartDate] = useState(today);
  const [contractEndDate, setContractEndDate] = useState("");
  const [contractMonthlyValue, setContractMonthlyValue] = useState("");
  const [contractReferenceLink, setContractReferenceLink] = useState("");
  const [contractNotes, setContractNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleImageUpload(file: File | null) {
    if (!file) return;
    setClientImageUploading(true);
    setSaveError(null);
    try {
      const publicUrl = await uploadClientImage({
        file,
        companyLegacyId,
      });
      setClientImage(publicUrl);
    } catch (uploadError) {
      setSaveError(
        uploadError instanceof Error
          ? uploadError.message
          : "Unable to upload client image.",
      );
    } finally {
      setClientImageUploading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadMilestones() {
      if (!offerId) {
        setOfferMilestones([]);
        setMilestoneId("");
        return;
      }
      const appResult = await supabase
        .from("company_offer_milestones")
        .select("glide_row_id, offer_id, name, position")
        .eq("offer_id", offerId)
        .eq("status", "active")
        .order("position", { ascending: true, nullsFirst: false });
      const mirrorResult =
        appResult.error || (appResult.data ?? []).length === 0
          ? await supabase
              .from("backup_company_offer_milestones")
              .select("glide_row_id, offer_id, name, order")
              .eq("offer_id", offerId)
              .order("order", { ascending: true, nullsFirst: false })
          : null;
      if (cancelled) return;
      const error = appResult.error && mirrorResult?.error;
      if (error) {
        setSaveError(mirrorResult?.error?.message ?? appResult.error?.message ?? "");
        return;
      }
      const rows = ((appResult.data ?? []).length > 0
        ? appResult.data
        : mirrorResult?.data ?? []) as OfferMilestone[];
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
          clientImage,
          clientArchetype,
          northStar,
          nextSteps,
          ...(canEditDirectorNotes ? { directorNotes } : {}),
          dateOnboarded,
          programStatusValue,
          csmTeamMemberId,
          ...(secondaryAssigneeEnabled && !assignedTeamMemberId
            ? { secondaryAssigneeId }
            : {}),
          offerId,
          milestoneId,
          contractStartDate: createInitialContract ? contractStartDate : "",
          contractEndDate: createInitialContract ? contractEndDate : "",
          contractMonthlyValue: createInitialContract ? contractMonthlyValue : "",
          contractReferenceLink: createInitialContract ? contractReferenceLink : "",
          contractNotes: createInitialContract ? contractNotes : "",
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
        className="absolute inset-0 bg-[#0e1b29]/55 backdrop-blur-[2px] cursor-pointer"
      />
      <div className="retainos-modal relative max-h-[92vh] w-full max-w-4xl overflow-y-auto">
        <div className="retainos-modal-header sticky top-0 z-10 flex items-start justify-between gap-4 px-6 py-5">
          <div>
            <div className="text-[11px] font-semibold uppercase text-[#2b79c4]">
              Client setup
            </div>
            <h2 className="mt-1 text-xl font-semibold text-[#162b3e]">New Client</h2>
            <p className="mt-1 text-sm text-[#586273]">
              Create the client, assign ownership, and optionally configure their initial journey and contract.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[#98a2b3] hover:bg-white hover:text-[#162b3e] cursor-pointer"
          >
            <span className="sr-only">Close</span>
            <span className="text-xl leading-none">x</span>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-4 px-6 py-6 md:grid-cols-2">
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
            <label className="block md:col-span-2">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Profile Image
              </span>
              <div className="grid gap-3 md:grid-cols-[auto_1fr]">
                <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-full border border-gray-200 bg-gray-50 text-xs font-semibold text-gray-500">
                  {clientImage ? (
                    <img
                      src={clientImage}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    "Image"
                  )}
                </div>
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      void handleImageUpload(file);
                      event.target.value = "";
                    }}
                    disabled={saving || clientImageUploading}
                    className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-[#eaf4fe] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[#2b79c4] disabled:opacity-50"
                  />
                  <input
                    type="url"
                    value={clientImage}
                    onChange={(event) => setClientImage(event.target.value)}
                    disabled={saving || clientImageUploading}
                    placeholder={
                      clientImageUploading
                        ? "Uploading..."
                        : "Or paste an image URL"
                    }
                    className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 disabled:bg-gray-50"
                  />
                </div>
              </div>
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
            {secondaryAssigneeEnabled && !assignedTeamMemberId ? (
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Secondary Assignee
                </span>
                <select
                  value={secondaryAssigneeId}
                  onChange={(event) => setSecondaryAssigneeId(event.target.value)}
                  disabled={saving}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                >
                  <option value="">No secondary assignee</option>
                  {availableAssignees.map((member) => (
                    <option key={member.glide_row_id} value={member.glide_row_id}>
                      {member.name ?? "(unnamed)"}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Archetype
              </span>
              <select
                value={clientArchetype}
                onChange={(event) => setClientArchetype(event.target.value)}
                disabled={saving}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
              >
                <option value="">No archetype</option>
                {clientArchetypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
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
            <label className="block md:col-span-2">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Next Steps
              </span>
              <textarea
                value={nextSteps}
                onChange={(event) => setNextSteps(event.target.value)}
                rows={3}
                disabled={saving}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
              />
            </label>
            {canEditDirectorNotes ? (
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Director Notes
                </span>
                <textarea
                  value={directorNotes}
                  onChange={(event) => setDirectorNotes(event.target.value)}
                  rows={3}
                  disabled={saving}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
                />
              </label>
            ) : null}
            <div className="md:col-span-2 border-t border-[#e4e9f0] pt-5">
              <h3 className="retainos-section-title">
                Initial journey and contract
              </h3>
              <p className="retainos-section-copy mt-1">
                Optional setup that saves follow-up work after creating the client.
              </p>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Pathway
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
                  {offerId ? "Select milestone" : "Select a pathway first"}
                </option>
                {offerMilestones.map((milestone) => (
                  <option key={milestone.glide_row_id} value={milestone.glide_row_id}>
                    {milestone.name ?? "(unnamed)"}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 rounded-md border border-[#e4e9f0] bg-[#f7f9fc] px-3 py-3 md:col-span-2">
              <input
                type="checkbox"
                checked={createInitialContract}
                onChange={(event) => setCreateInitialContract(event.target.checked)}
                disabled={saving}
                className="h-4 w-4 rounded border-[#cbd2dc] text-[#3b8fd9] focus:ring-[#59abf0]"
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
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Monthly Value
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={contractMonthlyValue}
                onChange={(event) => setContractMonthlyValue(event.target.value)}
                disabled={saving || !createInitialContract}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Contract Link
              </span>
              <input
                type="url"
                value={contractReferenceLink}
                onChange={(event) => setContractReferenceLink(event.target.value)}
                disabled={saving || !createInitialContract}
                placeholder="https://..."
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 disabled:bg-gray-50"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Contract Notes
              </span>
              <textarea
                value={contractNotes}
                onChange={(event) => setContractNotes(event.target.value)}
                rows={3}
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
          <div className="retainos-modal-footer sticky bottom-0 flex justify-end gap-3 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="retainos-button-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !clientName.trim()}
              className="retainos-button-primary"
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
        className="block w-full rounded-md border border-[#cbd2dc] bg-white px-3 py-2.5 text-sm text-[#162b3e] placeholder:text-[#98a2b3] focus:border-[#59abf0] focus:outline-none focus:ring-2 focus:ring-[#d6eafb]"
      />
    </div>
  );
}

function FilterSection({
  title,
  activeCount,
  open,
  onToggle,
  children,
}: {
  title: string;
  activeCount: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-[#edf1f5] pt-4 sm:col-span-2 lg:col-span-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-1 text-left transition-colors hover:bg-[#f7f9fc] cursor-pointer"
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-[#586273]">
          {title}
        </span>
        <span className="flex items-center gap-2 text-xs font-semibold text-[#586273]">
          {activeCount > 0 ? (
            <span className="rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-2 py-0.5 text-[#2b79c4]">
              {activeCount} active
            </span>
          ) : null}
          <span className="text-[#98a2b3]">{open ? "Hide" : "Show"}</span>
        </span>
      </button>
      {open ? (
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {children}
        </div>
      ) : null}
    </section>
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
      ? "border-[#e0922f] bg-[#fcf3e6] text-[#7f4d11]"
      : "border-[#cbd2dc] bg-white text-[#586273]";
  return (
    <div
      className={`rounded-md border border-dashed p-10 text-center text-sm ${classes}`}
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
      className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors cursor-pointer ${active ? "bg-[#162b3e] text-white shadow-sm" : "text-[#586273] hover:bg-[#eaf4fe] hover:text-[#162b3e]"}`}
    >
      {children}
    </button>
  );
}
function MiniMeta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[#98a2b3]">
        {label}
      </div>
      <div className="mt-0.5 truncate font-medium text-[#162b3e]">{value}</div>
    </div>
  );
}
function ClientNotificationsBell({
  reminders,
  onOpenClient,
}: {
  reminders: PilotReminder[];
  onOpenClient: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const today = dateKey(new Date());
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="retainos-focus relative grid h-11 w-11 place-items-center rounded-full border border-[#d6eafb] bg-[#f7fbff] text-[#2b79c4] shadow-sm transition hover:border-[#59abf0] hover:bg-[#eaf4fe]"
        aria-label="Open notifications"
        aria-expanded={open}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {reminders.length > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#e02d3c] px-1 text-[10px] font-bold text-white">
            {reminders.length > 9 ? "9+" : reminders.length}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-3 w-[min(360px,calc(100vw-48px))] overflow-hidden rounded-md border border-[#dfe6ef] bg-white shadow-xl">
          <div className="border-b border-[#edf1f5] px-4 py-3">
            <div className="text-sm font-semibold text-[#162b3e]">
              Reminder bell
            </div>
            <div className="mt-0.5 text-xs text-[#6c7684]">
              Short-term client reminders. Use Daily Pulse for the full operating view.
            </div>
          </div>
          {reminders.length === 0 ? (
            <div className="px-4 py-6 text-sm text-[#6c7684]">
              No generated reminders are due or coming up in the next 7 days.
            </div>
          ) : (
            <div className="max-h-[360px] overflow-y-auto py-1">
              {reminders.slice(0, 12).map((reminder) => {
                const reminderKey = dateKeyFromValue(reminder.date);
                const overdue = Boolean(reminderKey && reminderKey < today);
                return (
                  <button
                    key={reminder.id}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onOpenClient(reminder.client.glide_row_id);
                    }}
                    className="block w-full border-b border-[#f1f4f8] px-4 py-3 text-left transition hover:bg-[#f7fbff]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-[#162b3e]">
                          {reminder.client.client_name ?? "Unnamed client"}
                        </div>
                        <div className="mt-1 text-xs text-[#586273]">
                          {reminder.label}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          overdue
                            ? "bg-red-50 text-red-700"
                            : "bg-[#fcf3e6] text-[#9b5c0f]"
                        }`}
                      >
                        {overdue ? "Overdue" : formatDate(reminder.date)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
export function Clients() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    capabilities,
    effectiveCompanyId,
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
  const cachedViewModeMatchesCompany =
    cachedCompanyMatches &&
    cachedState?.viewModeUserOverride === true &&
    (!cachedState?.viewModeCompanyId ||
      cachedState.viewModeCompanyId === initialCompanyId);
  const cachedCalendarModeMatchesCompany =
    cachedCompanyMatches &&
    cachedState?.calendarModeUserOverride === true &&
    (!cachedState?.calendarModeCompanyId ||
      cachedState.calendarModeCompanyId === initialCompanyId);
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
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamMembersLoading, setTeamMembersLoading] = useState(false);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [filterMilestones, setFilterMilestones] = useState<OfferMilestone[]>([]);
  const [filterMilestonesLoading, setFilterMilestonesLoading] = useState(false);
  const [programChoices, setProgramChoices] = useState<ProgramChoice[]>([]);
  const [programChoicesLoading, setProgramChoicesLoading] = useState(false);
  const [appClientCompanyIdsLoaded, setAppClientCompanyIdsLoaded] = useState(false);
  const [appClientCompanyIds, setAppClientCompanyIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [rosterRefreshToken, setRosterRefreshToken] = useState(() =>
    window.localStorage.getItem(CLIENTS_ROSTER_REFRESH_KEY) ?? "",
  );
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [calendarClients, setCalendarClients] = useState<ClientRow[]>([]);
  const [calendarTasks, setCalendarTasks] = useState<CalendarTaskRow[]>([]);
  const [calendarMode, setCalendarMode] = useState<CalendarMode>(
    cachedCalendarModeMatchesCompany
      ? (cachedState?.calendarMode ?? "month")
      : "month",
  );
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [noteSearch, setNoteSearch] = useState("");
  const [appliedNoteSearch, setAppliedNoteSearch] = useState("");
  const [noteResults, setNoteResults] = useState<NoteSearchResult[]>([]);
  const [noteResultsLoading, setNoteResultsLoading] = useState(false);
  const [noteResultsError, setNoteResultsError] = useState<string | null>(null);
  const [noteResultsTotal, setNoteResultsTotal] = useState(0);
  const [noteResultsPage, setNoteResultsPage] = useState(1);
  const [pilotReminders, setPilotReminders] = useState<PilotReminder[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [totalClients, setTotalClients] = useState(0);
  const [page, setPage] = useState(cachedState?.page ?? 1);
  const [viewMode, setViewMode] = useState<ViewMode>(
    cachedViewModeMatchesCompany ? (cachedState?.viewMode ?? "list") : "list",
  );
  const [sortField, setSortField] = useState<SortField>(
    cachedState?.sortField ?? "client_name",
  );
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    cachedState?.sortDirection ?? "asc",
  );
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  const statusFilterRef = useRef<HTMLFieldSetElement>(null);
  const viewModeTouchedRef = useRef(cachedViewModeMatchesCompany);
  const calendarModeTouchedRef = useRef(cachedCalendarModeMatchesCompany);
  const defaultAppliedCompanyRef = useRef("");
  const [quickUpdateClient, setQuickUpdateClient] = useState<ClientRow | null>(
    null,
  );
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [expandedFilterSections, setExpandedFilterSections] = useState({
    journey: true,
    health: false,
    advocacy: false,
  });
  const selectedCompany = useMemo(
    () =>
      companies.find((company) => company.glide_row_id === filters.companyId) ??
      null,
    [companies, filters.companyId],
  );
  const showSecondaryAssigneeFilter =
    selectedCompany?.enable_secondary_assignee === true;
  const showAdvocacyFilters = appClientCompanyIds.has(filters.companyId);
  const journeyFilterCount = [filters.milestoneId, filters.renewalWindow].filter(
    Boolean,
  ).length;
  const healthFilterCount = [
    filters.successStatus,
    filters.progressStatus,
    filters.buyInStatus,
  ].filter(Boolean).length;
  const advocacyFilterCount = [
    filters.reviewAdvocacyStatus,
    filters.testimonialAdvocacyStatus,
    filters.referralAdvocacyStatus,
    filters.renewalUpsellAdvocacyStatus,
  ].filter(Boolean).length;
  const journeyFiltersOpen = expandedFilterSections.journey;
  const healthFiltersOpen = expandedFilterSections.health;
  const advocacyFiltersOpen = expandedFilterSections.advocacy;
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
  const offerNameById = useMemo(
    () =>
      new Map(
        offers.map((offer) => [offer.glide_row_id, offer.name ?? "Unnamed offer"]),
      ),
    [offers],
  );
  const visibleFilterMilestones = useMemo(
    () =>
      filterMilestones.filter(
        (milestone) => !filters.offerId || milestone.offer_id === filters.offerId,
      ),
    [filterMilestones, filters.offerId],
  );
  const totalPages = Math.max(1, Math.ceil(totalClients / PAGE_SIZE));
  const pageStart = totalClients === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(page * PAGE_SIZE, totalClients);
  const noteResultsTotalPages = Math.max(
    1,
    Math.ceil(noteResultsTotal / NOTE_SEARCH_PAGE_SIZE),
  );
  const noteResultsPageStart =
    noteResultsTotal === 0 ? 0 : (noteResultsPage - 1) * NOTE_SEARCH_PAGE_SIZE + 1;
  const noteResultsPageEnd = Math.min(
    noteResultsPage * NOTE_SEARCH_PAGE_SIZE,
    noteResultsTotal,
  );
  const assignedTeamMemberId = capabilities.canViewOnlyAssignedClients
    ? teamMemberId
    : "";
  const canUseCompanySwitcher = capabilities.canUseCompanySwitcher;
  const isUsingAppClients = appClientCompanyIds.has(
    appliedFilters.companyId || filters.companyId,
  );
  const canCreateClient =
    capabilities.canEditClient &&
    isUsingAppClients &&
    Boolean(appliedFilters.companyId || filters.companyId);
  const canQuickUpdateClients = capabilities.canQuickUpdate && isUsingAppClients;

  useEffect(() => {
    writeClientsCache({
      filters,
      appliedFilters,
      page,
      viewMode,
      viewModeCompanyId: appliedFilters.companyId || filters.companyId || "",
      viewModeUserOverride: viewModeTouchedRef.current,
      calendarMode,
      calendarModeCompanyId: appliedFilters.companyId || filters.companyId || "",
      calendarModeUserOverride: calendarModeTouchedRef.current,
      sortField,
      sortDirection,
    });
  }, [
    appliedFilters,
    calendarMode,
    filters,
    page,
    sortDirection,
    sortField,
    viewMode,
  ]);

  useEffect(() => {
    const companyId = filters.companyId || appliedFilters.companyId;
    if (!companyId) return;
    if (defaultAppliedCompanyRef.current === companyId) return;

    viewModeTouchedRef.current = false;
    calendarModeTouchedRef.current = false;
    let cancelled = false;

    async function applyCompanyDefaults() {
      const defaults = await loadCompanyWorkspaceDefaults(companyId);
      if (cancelled) return;
      if (!viewModeTouchedRef.current) {
        setViewMode(toViewMode(defaults.defaultClientView));
      }
      if (!calendarModeTouchedRef.current) {
        setCalendarMode(toCalendarMode(defaults.defaultCalendarMode));
      }
      defaultAppliedCompanyRef.current = companyId;
    }

    void applyCompanyDefaults();
    return () => {
      cancelled = true;
    };
  }, [appliedFilters.companyId, filters.companyId]);
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
      milestoneId: "",
    }));
    setAppliedFilters((prev) => ({
      ...prev,
      companyId: effectiveCompanyId,
      csmId: assignedTeamMemberId,
      secondaryAssigneeId: "",
      offerId: "",
      milestoneId: "",
    }));
    setPage(1);
    setSearchParams({ companyId: effectiveCompanyId }, { replace: true });
  }, [assignedTeamMemberId, effectiveCompanyId, searchParams, setSearchParams]);
  useEffect(() => {
    function syncRosterRefreshToken() {
      const nextToken =
        window.localStorage.getItem(CLIENTS_ROSTER_REFRESH_KEY) ?? "";
      setRosterRefreshToken((current) =>
        current === nextToken ? current : nextToken,
      );
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        syncRosterRefreshToken();
      }
    }

    window.addEventListener("focus", syncRosterRefreshToken);
    window.addEventListener("storage", syncRosterRefreshToken);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", syncRosterRefreshToken);
      window.removeEventListener("storage", syncRosterRefreshToken);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    async function loadCompanies() {
      setAppClientCompanyIdsLoaded(false);
      const [backupCompaniesResult, appCompaniesResult] = await Promise.all([
        supabase
          .from("backup_companies")
          .select("glide_row_id, name, enable_secondary_assignee")
          .or("archived.is.null,archived.eq.false")
          .order("name", { ascending: true }),
        supabase
          .from("companies")
          .select(
            "legacy_glide_row_id, migration_status, enable_secondary_assignee, enable_archetypes",
          )
          .in("migration_status", ["pilot", "migrated"]),
      ]);

      const appCompanySettingsByLegacyId = new Map(
        (appCompaniesResult.data ?? [])
          .filter(
            (company) =>
              typeof company.legacy_glide_row_id === "string" &&
              company.legacy_glide_row_id !== "",
          )
          .map((company) => [
            company.legacy_glide_row_id as string,
            {
              enable_secondary_assignee:
                company.enable_secondary_assignee === true,
              enable_archetypes: company.enable_archetypes === true,
            },
          ]),
      );
      let rows = ((backupCompaniesResult.data ?? []) as Company[]).map((company) => {
        const appSettings =
          appCompanySettingsByLegacyId.get(company.glide_row_id);
        return appSettings === undefined
          ? company
          : {
              ...company,
              enable_secondary_assignee: appSettings.enable_secondary_assignee,
              enable_archetypes: appSettings.enable_archetypes,
            };
      });
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
      setAppClientCompanyIdsLoaded(true);
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
      const usesAppOffers = appClientCompanyIds.has(filters.companyId);
      const { data, error } = usesAppOffers
        ? await supabase
            .from("company_offers")
            .select("glide_row_id, name")
            .eq("company_glide_row_id", filters.companyId)
            .eq("status", "active")
            .order("name", { ascending: true })
        : await supabase
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
        setFilters((prev) => ({ ...prev, offerId: "", milestoneId: "" }));
      }
      setOffersLoading(false);
    }
    void loadOffers();
    return () => {
      cancelled = true;
    };
  }, [appClientCompanyIds, filters.companyId, filters.offerId]);

  useEffect(() => {
    if (!filters.companyId) {
      setFilterMilestones([]);
      setFilterMilestonesLoading(false);
      return;
    }
    let cancelled = false;
    async function loadFilterMilestones() {
      setFilterMilestonesLoading(true);
      const usesAppMilestones = appClientCompanyIds.has(filters.companyId);
      const offerIds = offers
        .map((offer) => offer.glide_row_id)
        .filter((id): id is string => typeof id === "string" && id.trim() !== "");
      const { data, error } = usesAppMilestones
        ? await supabase
            .from("company_offer_milestones")
            .select("glide_row_id, offer_id, name, position")
            .eq("company_glide_row_id", filters.companyId)
            .eq("status", "active")
            .order("position", { ascending: true, nullsFirst: false })
        : offerIds.length > 0
          ? await supabase
              .from("backup_company_offer_milestones")
              .select("glide_row_id, offer_id, name, order")
              .in("offer_id", offerIds)
              .order("order", { ascending: true, nullsFirst: false })
          : { data: [], error: null };
      if (cancelled) return;
      if (error) console.error("Failed to load filter milestones:", error);
      const rows = (data ?? []) as OfferMilestone[];
      setFilterMilestones(rows);
      if (
        filters.milestoneId &&
        !rows.some((milestone) => milestone.glide_row_id === filters.milestoneId)
      ) {
        setFilters((prev) => ({ ...prev, milestoneId: "" }));
      }
      setFilterMilestonesLoading(false);
    }
    void loadFilterMilestones();
    return () => {
      cancelled = true;
    };
  }, [appClientCompanyIds, filters.companyId, filters.milestoneId, offers]);
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
    if (!appClientCompanyIdsLoaded) {
      setClientsLoading(true);
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
      query =
        appliedFilters.csmId === UNASSIGNED_CSM_FILTER
          ? query.is("csm_team_member_id", null)
          : query.eq("csm_team_member_id", appliedFilters.csmId);
    }
    if (appliedFilters.secondaryAssigneeId)
      query = query.eq(
        "csm_secondary_assignee_id",
        appliedFilters.secondaryAssigneeId,
      );
    if (appliedFilters.offerId)
      query = query.eq("offer_milestones_current_offer_id", appliedFilters.offerId);
    if (appliedFilters.milestoneId)
      query = query.eq(
        "offer_milestones_current_milestone_id",
        appliedFilters.milestoneId,
      );
    if (appliedFilters.programs.length > 0)
      query = query.in("program_status_value", appliedFilters.programs);
    if (appliedFilters.renewalWindow === "overdue") {
      query = query.lt("current_contract_end_date_for_filtering", startOfTodayIso());
    } else if (appliedFilters.renewalWindow) {
      const days = daysFromWindow(appliedFilters.renewalWindow);
      if (days !== null) {
        query = query
          .gte("current_contract_end_date_for_filtering", startOfTodayIso())
          .lte("current_contract_end_date_for_filtering", endOfDayIso(days));
      }
    }
    if (appliedFilters.lastContactAge === "never") {
      query = query.is("csm_date_of_last_contact", null);
    } else if (appliedFilters.lastContactAge) {
      const days = daysFromWindow(appliedFilters.lastContactAge);
      if (days !== null) {
        query = query.lt("csm_date_of_last_contact", startOfDayIso(-days));
      }
    }
    if (appliedFilters.nextContactWindow === "overdue") {
      query = query.lt("csm_date_of_next_contact", startOfTodayIso());
    } else if (appliedFilters.nextContactWindow === "none") {
      query = query.is("csm_date_of_next_contact", null);
    } else if (appliedFilters.nextContactWindow) {
      const days = daysFromWindow(appliedFilters.nextContactWindow);
      if (days !== null) {
        query = query
          .gte("csm_date_of_next_contact", startOfTodayIso())
          .lte("csm_date_of_next_contact", endOfDayIso(days));
      }
    }
    if (appliedFilters.successStatus) {
      query = query.eq(
        "outcomes_success_value_for_filtering",
        appliedFilters.successStatus,
      );
    }
    if (appliedFilters.progressStatus) {
      query = query.eq("outcomes_progress_for_filtering", appliedFilters.progressStatus);
    }
    if (appliedFilters.buyInStatus) {
      query = query.eq("outcomes_buy_in_for_filtering", appliedFilters.buyInStatus);
    }
    query = applyAdvocacyStatusFilters(query, appliedFilters, useAppClients);
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
    appClientCompanyIdsLoaded,
    appliedFilters,
    assignedTeamMemberId,
    page,
    rosterRefreshToken,
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
    if (!appClientCompanyIdsLoaded) {
      setCalendarLoading(true);
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
      query =
        appliedFilters.csmId === UNASSIGNED_CSM_FILTER
          ? query.is("csm_team_member_id", null)
          : query.eq("csm_team_member_id", appliedFilters.csmId);
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
    if (appliedFilters.milestoneId) {
      query = query.eq(
        "offer_milestones_current_milestone_id",
        appliedFilters.milestoneId,
      );
    }
    if (appliedFilters.programs.length > 0) {
      query = query.in("program_status_value", appliedFilters.programs);
    }
    if (appliedFilters.renewalWindow === "overdue") {
      query = query.lt("current_contract_end_date_for_filtering", startOfTodayIso());
    } else if (appliedFilters.renewalWindow) {
      const days = daysFromWindow(appliedFilters.renewalWindow);
      if (days !== null) {
        query = query
          .gte("current_contract_end_date_for_filtering", startOfTodayIso())
          .lte("current_contract_end_date_for_filtering", endOfDayIso(days));
      }
    }
    if (appliedFilters.lastContactAge === "never") {
      query = query.is("csm_date_of_last_contact", null);
    } else if (appliedFilters.lastContactAge) {
      const days = daysFromWindow(appliedFilters.lastContactAge);
      if (days !== null) {
        query = query.lt("csm_date_of_last_contact", startOfDayIso(-days));
      }
    }
    if (appliedFilters.nextContactWindow === "overdue") {
      query = query.lt("csm_date_of_next_contact", startOfTodayIso());
    } else if (appliedFilters.nextContactWindow === "none") {
      query = query.is("csm_date_of_next_contact", null);
    } else if (appliedFilters.nextContactWindow) {
      const days = daysFromWindow(appliedFilters.nextContactWindow);
      if (days !== null) {
        query = query
          .gte("csm_date_of_next_contact", startOfTodayIso())
          .lte("csm_date_of_next_contact", endOfDayIso(days));
      }
    }
    if (appliedFilters.successStatus) {
      query = query.eq(
        "outcomes_success_value_for_filtering",
        appliedFilters.successStatus,
      );
    }
    if (appliedFilters.progressStatus) {
      query = query.eq("outcomes_progress_for_filtering", appliedFilters.progressStatus);
    }
    if (appliedFilters.buyInStatus) {
      query = query.eq("outcomes_buy_in_for_filtering", appliedFilters.buyInStatus);
    }
    query = applyAdvocacyStatusFilters(query, appliedFilters, useAppClients);

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
    appClientCompanyIdsLoaded,
    appliedFilters,
    assignedTeamMemberId,
    calendarDate,
    calendarMode,
    rosterRefreshToken,
    viewMode,
  ]);
  useEffect(() => {
    void loadCalendarClients();
  }, [loadCalendarClients]);
  const loadNoteResults = useCallback(async () => {
    if (viewMode !== "notes") {
      setNoteResultsLoading(false);
      return;
    }
    if (!appliedFilters.companyId) {
      setNoteResults([]);
      setNoteResultsTotal(0);
      setNoteResultsLoading(false);
      return;
    }

    const searchTerm = appliedNoteSearch.trim();
    if (searchTerm.length < 2) {
      setNoteResults([]);
      setNoteResultsTotal(0);
      setNoteResultsError(null);
      setNoteResultsLoading(false);
      return;
    }

    setNoteResultsLoading(true);
    setNoteResultsError(null);

    const { data, error } = await supabase.rpc("search_client_notes", {
      p_company_id: appliedFilters.companyId,
      p_search: searchTerm,
      p_client_name: appliedFilters.clientName || null,
      p_csm_id: assignedTeamMemberId ? null : appliedFilters.csmId || null,
      p_assigned_team_member_id: assignedTeamMemberId || null,
      p_secondary_assignee_id: appliedFilters.secondaryAssigneeId || null,
      p_program_values:
        appliedFilters.programs.length > 0 ? appliedFilters.programs : null,
      p_offer_id: appliedFilters.offerId || null,
      p_milestone_id: appliedFilters.milestoneId || null,
      p_renewal_window: appliedFilters.renewalWindow || null,
      p_last_contact_age: appliedFilters.lastContactAge || null,
      p_next_contact_window: appliedFilters.nextContactWindow || null,
      p_success_status: appliedFilters.successStatus || null,
      p_progress_status: appliedFilters.progressStatus || null,
      p_buy_in_status: appliedFilters.buyInStatus || null,
      p_review_advocacy_status: appliedFilters.reviewAdvocacyStatus || null,
      p_testimonial_advocacy_status:
        appliedFilters.testimonialAdvocacyStatus || null,
      p_referral_advocacy_status: appliedFilters.referralAdvocacyStatus || null,
      p_renewal_upsell_advocacy_status:
        appliedFilters.renewalUpsellAdvocacyStatus || null,
      p_limit: NOTE_SEARCH_PAGE_SIZE,
      p_offset: (noteResultsPage - 1) * NOTE_SEARCH_PAGE_SIZE,
    });

    if (error) {
      console.error("Failed to search client notes:", error);
      setNoteResults([]);
      setNoteResultsTotal(0);
      setNoteResultsError(error.message);
    } else {
      const rows = (data ?? []) as NoteSearchResult[];
      setNoteResults(rows);
      setNoteResultsTotal(Number(rows[0]?.total_count ?? 0));
    }
    setNoteResultsLoading(false);
  }, [
    appliedFilters,
    appliedNoteSearch,
    assignedTeamMemberId,
    noteResultsPage,
    viewMode,
  ]);
  useEffect(() => {
    void loadNoteResults();
  }, [loadNoteResults]);
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
      let fallbackQuery = supabase
        .from("clients")
        .select("*")
        .eq("company_glide_row_id", appliedFilters.companyId)
        .range(0, 4999);
      if (assignedTeamMemberId) {
        fallbackQuery = fallbackQuery.or(
          `csm_team_member_id.eq.${assignedTeamMemberId},csm_secondary_assignee_id.eq.${assignedTeamMemberId}`,
        );
      }

      const { data: appCompany, error: appCompanyError } = await supabase
        .from("companies")
        .select("id")
        .eq("legacy_glide_row_id", appliedFilters.companyId)
        .in("migration_status", ["pilot", "migrated"])
        .maybeSingle();

      const fallbackToClientFields = async () => {
        const { data, error } = await fallbackQuery;
        if (cancelled) return;
        if (error) {
          console.error("Failed to load RetainOS reminders:", error);
          setPilotReminders([]);
          return;
        }
        setPilotReminders(
          buildClientFieldReminders((data ?? []) as Record<string, unknown>[]),
        );
      };

      if (appCompanyError || !appCompany?.id) {
        if (appCompanyError)
          console.error("Failed to resolve app company reminders:", appCompanyError);
        await fallbackToClientFields();
        return;
      }

      const { error: generationError } = await supabase.rpc(
        "generate_company_notifications",
        { p_company_id: appCompany.id },
      );
      if (generationError) {
        console.error("Failed to generate RetainOS notifications:", generationError);
        await fallbackToClientFields();
        return;
      }

      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const oldest = new Date(start);
      oldest.setDate(oldest.getDate() - 30);
      const end = new Date(start);
      end.setDate(end.getDate() + 8);
      const { data: notificationRows, error: notificationsError } = await supabase
        .from("notifications")
        .select(
          "id, type, title, due_at, client_id, legacy_client_id, metadata",
        )
        .eq("company_id", appCompany.id)
        .is("resolved_at", null)
        .is("dismissed_at", null)
        .in("type", [
          "next_contact_due",
          "renewal_due",
          "paused_return_due",
          "task_due",
        ])
        .gte("due_at", oldest.toISOString())
        .lt("due_at", end.toISOString())
        .order("due_at", { ascending: true, nullsFirst: false })
        .range(0, 199);
      if (cancelled) return;
      if (notificationsError) {
        console.error("Failed to load RetainOS notifications:", notificationsError);
        await fallbackToClientFields();
        return;
      }

      const notifications = (notificationRows ?? []) as NotificationRow[];
      const clientIds = [
        ...new Set(
          notifications
            .map((notification) => notification.client_id)
            .filter((id): id is string => typeof id === "string" && id !== ""),
        ),
      ];
      if (clientIds.length === 0) {
        setPilotReminders([]);
        return;
      }
      const { data: clientRows, error: clientsError } = await supabase
        .from("clients")
        .select("*")
        .in("id", clientIds)
        .range(0, 199);
      if (cancelled) return;
      if (clientsError) {
        console.error("Failed to load notification clients:", clientsError);
        await fallbackToClientFields();
        return;
      }

      const clientsById = new Map(
        ((clientRows ?? []) as Record<string, unknown>[]).map((row) => [
          String(row.id ?? ""),
          mapAppClientRow(row),
        ]),
      );
      const reminderRows = notifications.flatMap((notification) => {
        const type = notificationReminderType(notification.type);
        const date = notification.due_at;
        const client = notification.client_id
          ? clientsById.get(notification.client_id)
          : undefined;
        if (!type || !date || !client) return [];
        if (
          assignedTeamMemberId &&
          client.csm_team_member_id !== assignedTeamMemberId &&
          client.csm_secondary_assignee_id !== assignedTeamMemberId
        ) {
          return [];
        }
        return [
          {
            id: notification.id,
            type,
            label: notificationReminderLabel(notification),
            date,
            client,
          },
        ];
      });
      const reminders = [
        ...new Map(
          reminderRows.map((reminder) => [
            `${reminder.client.glide_row_id}:${reminder.type}:${dateKeyFromValue(reminder.date)}`,
            reminder,
          ]),
        ).values(),
      ].sort(
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
  const hasPendingFilterChanges = useMemo(() => {
    if (!filters.companyId) return false;
    const nextAppliedFilters = {
      ...filters,
      companyId: effectiveCompanyId || filters.companyId,
      csmId: assignedTeamMemberId || filters.csmId,
      secondaryAssigneeId: showSecondaryAssigneeFilter
        ? filters.secondaryAssigneeId
        : "",
      reviewAdvocacyStatus: showAdvocacyFilters ? filters.reviewAdvocacyStatus : "",
      testimonialAdvocacyStatus: showAdvocacyFilters
        ? filters.testimonialAdvocacyStatus
        : "",
      referralAdvocacyStatus: showAdvocacyFilters
        ? filters.referralAdvocacyStatus
        : "",
      renewalUpsellAdvocacyStatus: showAdvocacyFilters
        ? filters.renewalUpsellAdvocacyStatus
        : "",
    };
    return !clientFiltersEqual(nextAppliedFilters, appliedFilters);
  }, [
    appliedFilters,
    assignedTeamMemberId,
    effectiveCompanyId,
    filters,
    showAdvocacyFilters,
    showSecondaryAssigneeFilter,
  ]);
  function applyFilters() {
    if (!filters.companyId) return;
    const next = {
      ...filters,
      companyId: effectiveCompanyId || filters.companyId,
      csmId: assignedTeamMemberId || filters.csmId,
      secondaryAssigneeId: showSecondaryAssigneeFilter
        ? filters.secondaryAssigneeId
        : "",
      reviewAdvocacyStatus: showAdvocacyFilters ? filters.reviewAdvocacyStatus : "",
      testimonialAdvocacyStatus: showAdvocacyFilters
        ? filters.testimonialAdvocacyStatus
        : "",
      referralAdvocacyStatus: showAdvocacyFilters
        ? filters.referralAdvocacyStatus
        : "",
      renewalUpsellAdvocacyStatus: showAdvocacyFilters
        ? filters.renewalUpsellAdvocacyStatus
        : "",
    };
    setAppliedFilters(next);
    setPage(1);
    setNoteResultsPage(1);
    setSearchParams(next.companyId ? { companyId: next.companyId } : {}, {
      replace: true,
    });
  }
  function clearFilters() {
    const defaultCompanyId =
      effectiveCompanyId || filters.companyId || appliedFilters.companyId;
    const baseFilters = {
      ...emptyFilters,
      companyId: defaultCompanyId,
      csmId: assignedTeamMemberId,
    };
    setFilters(baseFilters);
    setAppliedFilters(baseFilters);
    setClients([]);
    setTotalClients(0);
    setPage(1);
    setNoteResults([]);
    setNoteResultsTotal(0);
    setNoteResultsPage(1);
    setSortField("client_name");
    setSortDirection("asc");
    viewModeTouchedRef.current = false;
    calendarModeTouchedRef.current = false;
    defaultAppliedCompanyRef.current = "";
    window.localStorage.removeItem(CLIENTS_CACHE_KEY);
    window.sessionStorage.removeItem(CLIENTS_CACHE_KEY);
    if (defaultCompanyId) {
      void loadCompanyWorkspaceDefaults(defaultCompanyId).then((defaults) => {
        if (!viewModeTouchedRef.current) {
          setViewMode(toViewMode(defaults.defaultClientView));
        }
        if (!calendarModeTouchedRef.current) {
          setCalendarMode(toCalendarMode(defaults.defaultCalendarMode));
        }
        defaultAppliedCompanyRef.current = defaultCompanyId;
      });
    }
    setSearchParams(defaultCompanyId ? { companyId: defaultCompanyId } : {}, {
      replace: true,
    });
  }
  const renderClientAvatar = (client: ClientRow, size = "h-9 w-9") =>
    client.client_image ? (
      <img
        src={client.client_image}
        alt=""
        className={`${size} rounded-full border border-[#e4e9f0] bg-[#f7f9fc] object-cover`}
      />
    ) : (
      <div
        className={`${size} flex items-center justify-center rounded-full border border-[#d6eafb] bg-[#eaf4fe] text-xs font-semibold text-[#2b79c4]`}
      >
        {getInitials(client.client_name)}
      </div>
    );
  const clientMeta = (client: ClientRow) => ({
    last: valueFrom(client, lastContactColumns),
    next: valueFrom(client, nextContactColumns),
    buyIn: valueFrom(client, buyInColumns),
    archetype: normalizeClientArchetype(
      valueFrom(client, [
        "client_archetype_value",
        "client_archetype",
        "archetype_value",
        "archetype",
      ]),
    ),
    pathway: valueFrom(client, pathwayColumns),
    progress: valueFrom(client, progressColumns),
    onboarded: valueFrom(client, onboardedColumns),
    renewal: valueFrom(client, renewalColumns),
  });
  return (
    <div className="space-y-6">
      <div className="rounded-md border border-[#cbd2dc] bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[#162b3e]">Clients</h1>
            <p className="mt-1 text-sm text-[#586273]">
              Manage the selected company's roster, follow-ups, contracts, and client operating views.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ClientNotificationsBell
              reminders={pilotReminders}
              onOpenClient={(id) => navigate(`/clients/${encodeURIComponent(id)}`)}
            />
            {canCreateClient ? (
              <button
                type="button"
                onClick={() => setNewClientOpen(true)}
                className="rounded-full bg-[#59abf0] px-5 py-2.5 text-sm font-semibold text-[#162b3e] shadow-sm transition-colors hover:bg-[#3b8fd9] hover:text-white cursor-pointer"
              >
                + New Client
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="rounded-md border border-[#e4e9f0] bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                <legend className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#586273]">
                  Status
                </legend>
                <button
                  type="button"
                  onClick={() => setStatusFilterOpen((open) => !open)}
                  disabled={programChoicesLoading}
                  className="flex w-full items-center justify-between rounded-md border border-[#cbd2dc] bg-white px-3 py-2.5 text-left text-sm text-[#162b3e] focus:border-[#59abf0] focus:outline-none focus:ring-2 focus:ring-[#d6eafb] disabled:bg-[#f7f9fc] disabled:text-[#98a2b3] cursor-pointer"
                >
                  <span>
                    {programChoicesLoading
                      ? "Loading statuses..."
                      : filters.programs.length === 0
                        ? "All statuses"
                        : `${filters.programs.length} selected`}
                  </span>
                  <span className="text-[#98a2b3]">⌄</span>
                </button>
                {statusFilterOpen && !programChoicesLoading && (
                  <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-[#cbd2dc] bg-white p-2 shadow-xl">
                    <button
                      type="button"
                      onClick={() =>
                        setFilters((prev) => ({ ...prev, programs: [] }))
                      }
                      className="mb-1 w-full rounded px-2 py-1.5 text-left text-sm text-[#586273] hover:bg-[#eaf4fe] cursor-pointer"
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
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-[#162b3e] hover:bg-[#eaf4fe]"
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
                            className="h-4 w-4 rounded border-[#cbd2dc] text-[#3b8fd9] focus:ring-[#59abf0]"
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
                    className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#586273]"
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
                    className="block w-full rounded-md border border-[#cbd2dc] bg-white px-3 py-2.5 text-sm text-[#162b3e] focus:border-[#59abf0] focus:outline-none focus:ring-2 focus:ring-[#d6eafb] disabled:bg-[#f7f9fc] disabled:text-[#98a2b3]"
                  >
                    <option value="">
                      {teamMembersLoading ? "Loading team..." : "All CSMs"}
                    </option>
                    <option value={UNASSIGNED_CSM_FILTER}>Unassigned</option>
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
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#586273]"
                >
                  Pathway
                </label>
                <select
                  id="clients-offer-filter"
                  value={filters.offerId}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      offerId: e.target.value,
                      milestoneId: "",
                    }))
                  }
                  disabled={offersLoading}
                  className="block w-full rounded-md border border-[#cbd2dc] bg-white px-3 py-2.5 text-sm text-[#162b3e] focus:border-[#59abf0] focus:outline-none focus:ring-2 focus:ring-[#d6eafb] disabled:bg-[#f7f9fc] disabled:text-[#98a2b3]"
                >
                  <option value="">
                    {offersLoading ? "Loading pathways..." : "All pathways"}
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
                    className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#586273]"
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
                    className="block w-full rounded-md border border-[#cbd2dc] bg-white px-3 py-2.5 text-sm text-[#162b3e] focus:border-[#59abf0] focus:outline-none focus:ring-2 focus:ring-[#d6eafb] disabled:bg-[#f7f9fc] disabled:text-[#98a2b3]"
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
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#586273]"
                >
                  Last Contact
                </label>
                <select
                  id="clients-last-contact-filter"
                  value={filters.lastContactAge}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      lastContactAge: event.target.value,
                    }))
                  }
                  className="block w-full rounded-md border border-[#cbd2dc] bg-white px-3 py-2.5 text-sm text-[#162b3e] focus:border-[#59abf0] focus:outline-none focus:ring-2 focus:ring-[#d6eafb]"
                >
                  <option value="">Any last contact</option>
                  {lastContactAgeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="clients-next-contact-filter"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#586273]"
                >
                  Next Contact
                </label>
                <select
                  id="clients-next-contact-filter"
                  value={filters.nextContactWindow}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      nextContactWindow: event.target.value,
                    }))
                  }
                  className="block w-full rounded-md border border-[#cbd2dc] bg-white px-3 py-2.5 text-sm text-[#162b3e] focus:border-[#59abf0] focus:outline-none focus:ring-2 focus:ring-[#d6eafb]"
                >
                  <option value="">Any next contact</option>
                  {nextContactWindowOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <FilterSection
                title="Journey & Contract"
                activeCount={journeyFilterCount}
                open={journeyFiltersOpen}
                onToggle={() =>
                  setExpandedFilterSections((current) => ({
                    ...current,
                    journey: !journeyFiltersOpen,
                  }))
                }
              >
                <div>
                  <label
                    htmlFor="clients-milestone-filter"
                    className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#586273]"
                  >
                    Milestone
                  </label>
                  <select
                    id="clients-milestone-filter"
                    value={filters.milestoneId}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        milestoneId: e.target.value,
                      }))
                    }
                    disabled={
                      filterMilestonesLoading ||
                      visibleFilterMilestones.length === 0
                    }
                    className="block w-full rounded-md border border-[#cbd2dc] bg-white px-3 py-2.5 text-sm text-[#162b3e] focus:border-[#59abf0] focus:outline-none focus:ring-2 focus:ring-[#d6eafb] disabled:bg-[#f7f9fc] disabled:text-[#98a2b3]"
                  >
                    <option value="">
                      {filterMilestonesLoading
                        ? "Loading milestones..."
                        : "All milestones"}
                    </option>
                    {visibleFilterMilestones.map((milestone) => {
                      const offerName = offerNameById.get(milestone.offer_id ?? "");
                      return (
                        <option
                          key={milestone.glide_row_id}
                          value={milestone.glide_row_id}
                        >
                          {filters.offerId || !offerName
                            ? (milestone.name ?? "(unnamed)")
                            : `${offerName} / ${milestone.name ?? "(unnamed)"}`}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="clients-renewal-window-filter"
                    className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#586273]"
                  >
                    Renewals
                  </label>
                  <select
                    id="clients-renewal-window-filter"
                    value={filters.renewalWindow}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        renewalWindow: event.target.value,
                      }))
                    }
                    className="block w-full rounded-md border border-[#cbd2dc] bg-white px-3 py-2.5 text-sm text-[#162b3e] focus:border-[#59abf0] focus:outline-none focus:ring-2 focus:ring-[#d6eafb]"
                  >
                    <option value="">All renewal dates</option>
                    {renewalWindowOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </FilterSection>
              <FilterSection
                title="Health & Outcomes"
                activeCount={healthFilterCount}
                open={healthFiltersOpen}
                onToggle={() =>
                  setExpandedFilterSections((current) => ({
                    ...current,
                    health: !healthFiltersOpen,
                  }))
                }
                >
                <div>
                  <label
                    htmlFor="clients-success-filter"
                    className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#586273]"
                  >
                    Success
                  </label>
                  <select
                    id="clients-success-filter"
                    value={filters.successStatus}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        successStatus: event.target.value,
                      }))
                    }
                    className="block w-full rounded-md border border-[#cbd2dc] bg-white px-3 py-2.5 text-sm text-[#162b3e] focus:border-[#59abf0] focus:outline-none focus:ring-2 focus:ring-[#d6eafb]"
                  >
                    <option value="">Any success</option>
                    {successFilterOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="clients-progress-filter"
                    className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#586273]"
                  >
                    Progress
                  </label>
                  <select
                    id="clients-progress-filter"
                    value={filters.progressStatus}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        progressStatus: event.target.value,
                      }))
                    }
                    className="block w-full rounded-md border border-[#cbd2dc] bg-white px-3 py-2.5 text-sm text-[#162b3e] focus:border-[#59abf0] focus:outline-none focus:ring-2 focus:ring-[#d6eafb]"
                  >
                    <option value="">Any progress</option>
                    {healthFilterOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="clients-buy-in-filter"
                    className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#586273]"
                  >
                    Buy-In
                  </label>
                  <select
                    id="clients-buy-in-filter"
                    value={filters.buyInStatus}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        buyInStatus: event.target.value,
                      }))
                    }
                    className="block w-full rounded-md border border-[#cbd2dc] bg-white px-3 py-2.5 text-sm text-[#162b3e] focus:border-[#59abf0] focus:outline-none focus:ring-2 focus:ring-[#d6eafb]"
                  >
                    <option value="">Any buy-in</option>
                    {healthFilterOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </FilterSection>
              {showAdvocacyFilters ? (
                <FilterSection
                  title="Advocacy & Growth"
                  activeCount={advocacyFilterCount}
                  open={advocacyFiltersOpen}
                  onToggle={() =>
                    setExpandedFilterSections((current) => ({
                      ...current,
                      advocacy: !advocacyFiltersOpen,
                    }))
                  }
                >
                  {advocacyDefinitions.map((definition) => {
                    const field = advocacyFilterFields[definition.type];
                    const selectId = `clients-${definition.type.replace("_", "-")}-advocacy-filter`;
                    return (
                      <div key={definition.type}>
                        <label
                          htmlFor={selectId}
                          className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#586273]"
                        >
                          {definition.shortLabel}
                        </label>
                        <select
                          id={selectId}
                          value={filters[field] as string}
                          onChange={(event) =>
                            setFilters((prev) => ({
                              ...prev,
                              [field]: event.target.value,
                            }))
                          }
                          className="block w-full rounded-md border border-[#cbd2dc] bg-white px-3 py-2.5 text-sm text-[#162b3e] focus:border-[#59abf0] focus:outline-none focus:ring-2 focus:ring-[#d6eafb]"
                        >
                          <option value="">Any {definition.shortLabel.toLowerCase()}</option>
                          {advocacyFilterOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </FilterSection>
              ) : null}
            </>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          {hasPendingFilterChanges ? (
            <p className="mr-auto text-sm font-medium text-[#9b5c0f]">
              Apply filters to update results.
            </p>
          ) : null}
          <button
            type="button"
            onClick={applyFilters}
            disabled={!filters.companyId || clientsLoading}
            className="rounded-full bg-[#59abf0] px-5 py-2.5 text-sm font-semibold text-[#162b3e] shadow-sm transition-colors hover:bg-[#3b8fd9] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            Apply filters
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-full border border-[#cbd2dc] bg-white px-5 py-2.5 text-sm font-semibold text-[#586273] transition-colors hover:bg-[#f7f9fc] hover:text-[#162b3e] cursor-pointer"
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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[#162b3e]">
                {viewMode === "notes" ? "Client Notes" : "Client List"}
              </h2>
              <p className="mt-1 text-sm text-[#586273]">
                {viewMode === "notes"
                  ? appliedNoteSearch.trim().length >= 2
                    ? noteResultsLoading
                      ? "Searching notes..."
                      : `${noteResultsTotal.toLocaleString()} note result${noteResultsTotal === 1 ? "" : "s"}`
                    : "Search notes, next steps, and history across filtered clients"
                  : clientsLoading
                  ? "Loading clients..."
                  : `${totalClients.toLocaleString()} client${totalClients === 1 ? "" : "s"}`}
              </p>
            </div>
            <div className="inline-flex rounded-md border border-[#e4e9f0] bg-white p-1 shadow-sm">
              <ViewButton
                active={viewMode === "list"}
                onClick={() => {
                  viewModeTouchedRef.current = true;
                  defaultAppliedCompanyRef.current =
                    appliedFilters.companyId || filters.companyId || "";
                  setViewMode("list");
                }}
              >
                List
              </ViewButton>
              <ViewButton
                active={viewMode === "card"}
                onClick={() => {
                  viewModeTouchedRef.current = true;
                  defaultAppliedCompanyRef.current =
                    appliedFilters.companyId || filters.companyId || "";
                  setViewMode("card");
                }}
              >
                Cards
              </ViewButton>
              <ViewButton
                active={viewMode === "calendar"}
                onClick={() => {
                  viewModeTouchedRef.current = true;
                  defaultAppliedCompanyRef.current =
                    appliedFilters.companyId || filters.companyId || "";
                  setViewMode("calendar");
                }}
              >
                Calendar
              </ViewButton>
              <ViewButton
                active={viewMode === "notes"}
                onClick={() => {
                  viewModeTouchedRef.current = true;
                  defaultAppliedCompanyRef.current =
                    appliedFilters.companyId || filters.companyId || "";
                  setViewMode("notes");
                  setNoteResultsPage(1);
                }}
              >
                Notes
              </ViewButton>
            </div>
            {viewMode === "list" || viewMode === "card" ? (
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor="clients-sort-field"
                  className="text-xs font-semibold uppercase tracking-wider text-[#586273]"
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
                  className="rounded-md border border-[#cbd2dc] bg-white px-3 py-2 text-sm text-[#162b3e] focus:border-[#59abf0] focus:outline-none focus:ring-2 focus:ring-[#d6eafb]"
                >
                  <option value="client_name">Client name</option>
                  <option value="onboarded">Onboarded date</option>
                  <option value="renewal">Renewal date</option>
                  <option value="last_contact">Last contact</option>
                  <option value="next_contact">Next contact</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setSortDirection((direction) =>
                      direction === "asc" ? "desc" : "asc",
                    );
                    setPage(1);
                  }}
                  className="rounded-md border border-[#cbd2dc] bg-white px-3 py-2 text-sm font-semibold text-[#586273] hover:bg-[#f7f9fc] hover:text-[#162b3e]"
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
                <div className="inline-flex rounded-md border border-[#e4e9f0] bg-white p-1 shadow-sm">
                  {(["month", "week", "day"] as CalendarMode[]).map((mode) => (
                    <ViewButton
                      key={mode}
                      active={calendarMode === mode}
                      onClick={() => {
                        calendarModeTouchedRef.current = true;
                        defaultAppliedCompanyRef.current =
                          appliedFilters.companyId || filters.companyId || "";
                        setCalendarMode(mode);
                      }}
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
                  className="rounded-md border border-[#cbd2dc] bg-white px-3 py-2 text-sm font-medium text-[#586273] hover:bg-[#f7f9fc]"
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
                  className="rounded-md border border-[#cbd2dc] bg-white px-3 py-2 text-sm text-[#162b3e] focus:border-[#59abf0] focus:outline-none focus:ring-2 focus:ring-[#d6eafb]"
                />
                <button
                  type="button"
                  onClick={() =>
                    setCalendarDate((date) =>
                      addCalendarPeriod(date, calendarMode, 1),
                    )
                  }
                  className="rounded-md border border-[#cbd2dc] bg-white px-3 py-2 text-sm font-medium text-[#586273] hover:bg-[#f7f9fc]"
                >
                  Next
                </button>
              </div>
            )}
          </div>
          {viewMode === "notes" ? (
            <NoteSearchPanel
              search={noteSearch}
              appliedSearch={appliedNoteSearch}
              onSearchChange={setNoteSearch}
              onSubmit={() => {
                setAppliedNoteSearch(noteSearch.trim());
                setNoteResultsPage(1);
              }}
              results={noteResults}
              loading={noteResultsLoading}
              error={noteResultsError}
              total={noteResultsTotal}
              page={noteResultsPage}
              totalPages={noteResultsTotalPages}
              pageStart={noteResultsPageStart}
              pageEnd={noteResultsPageEnd}
              onPageChange={setNoteResultsPage}
              teamMemberNameById={teamMemberNameById}
              renderClientAvatar={renderClientAvatar}
              onOpenClient={(id) =>
                navigate(`/clients/${encodeURIComponent(id)}`)
              }
            />
          ) : clientsError && viewMode !== "calendar" ? (
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
              onQuickUpdate={canQuickUpdateClients ? setQuickUpdateClient : undefined}
            />
          ) : clientsLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#59abf0]" />
            </div>
          ) : clients.length === 0 ? (
            <div className="rounded-md border border-dashed border-[#cbd2dc] bg-white p-10 text-center">
              <p className="text-sm font-semibold text-[#162b3e]">
                No clients matched these filters.
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-[#586273]">
                Try clearing status, CSM, offer, milestone, renewal, contact, or
                health filters to see more clients.
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 rounded-full border border-[#cbd2dc] bg-white px-5 py-2.5 text-sm font-semibold text-[#586273] transition-colors hover:bg-[#f7f9fc] hover:text-[#162b3e] cursor-pointer"
              >
                Clear filters
              </button>
            </div>
          ) : viewMode === "list" ? (
            <ClientTable
              clients={clients}
              programChoices={programChoices}
              teamMemberNameById={teamMemberNameById}
              renderClientAvatar={renderClientAvatar}
              clientMeta={clientMeta}
              showArchetypes={selectedCompany?.enable_archetypes === true}
              onOpenClient={(id) =>
                navigate(`/clients/${encodeURIComponent(id)}`)
              }
              onQuickUpdate={canQuickUpdateClients ? setQuickUpdateClient : undefined}
            />
          ) : (
            <ClientCards
              clients={clients}
              programChoices={programChoices}
              teamMemberNameById={teamMemberNameById}
              renderClientAvatar={renderClientAvatar}
              clientMeta={clientMeta}
              showArchetypes={selectedCompany?.enable_archetypes === true}
              onOpenClient={(id) =>
                navigate(`/clients/${encodeURIComponent(id)}`)
              }
              onQuickUpdate={canQuickUpdateClients ? setQuickUpdateClient : undefined}
            />
          )}
          {(viewMode === "list" || viewMode === "card") &&
            !clientsLoading &&
            totalClients > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-[#586273]">
                Showing {pageStart}-{pageEnd} of {totalClients.toLocaleString()}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page === 1}
                  className="rounded-md border border-[#cbd2dc] bg-white px-3 py-2 text-sm font-medium text-[#586273] transition-colors hover:bg-[#f7f9fc] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
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
                  className="rounded-md border border-[#cbd2dc] bg-white px-3 py-2 text-sm font-medium text-[#586273] transition-colors hover:bg-[#f7f9fc] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
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
          onClientUpdated={(updatedClient) => {
            setQuickUpdateClient(updatedClient);
            setClients((current) =>
              current.map((client) =>
                client.glide_row_id === updatedClient.glide_row_id ? updatedClient : client,
              ),
            );
          }}
        />
      )}
      {newClientOpen ? (
        <NewClientModal
          companyLegacyId={appliedFilters.companyId || filters.companyId}
          teamMembers={teamMembers}
          programChoices={programChoices}
          offers={offers}
          assignedTeamMemberId={assignedTeamMemberId}
          secondaryAssigneeEnabled={selectedCompany?.enable_secondary_assignee === true}
          canEditDirectorNotes={capabilities.canViewDirectorNotes}
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
  showArchetypes,
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
    archetype: unknown;
  };
  showArchetypes: boolean;
  onOpenClient: (id: string) => void;
  onQuickUpdate?: (client: ClientRow) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-[#e4e9f0] bg-white shadow-sm">
      <table className="min-w-full divide-y divide-[#e4e9f0]">
        <thead className="bg-[#f7f9fc]">
          <tr>
            {[
              "Client",
              "CSM",
              ...(showArchetypes ? ["Archetype"] : []),
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
                className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#586273]"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e4e9f0]">
          {clients.map((client) => {
            const meta = clientMeta(client);
            return (
              <tr
                key={client.glide_row_id}
                className="transition-colors hover:bg-[#f7f9fc]"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {renderClientAvatar(client)}
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onOpenClient(client.glide_row_id)}
                        className="truncate text-left text-sm font-semibold text-[#162b3e] hover:text-[#2b79c4] cursor-pointer"
                      >
                        {client.client_name ?? "Unnamed client"}
                      </button>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-[#586273]">
                  {teamMemberNameById.get(client.csm_team_member_id ?? "") ??
                    "Unassigned"}
                </td>
                {showArchetypes ? (
                  <td className="px-4 py-3 text-sm text-[#586273]">
                    {displayValue(meta.archetype)}
                  </td>
                ) : null}
                <td className="px-4 py-3">
                  <ProgramStatusPill
                    value={client.program_status_value}
                    choices={programChoices}
                  />
                </td>
                <td className="px-4 py-3 text-sm text-[#586273]">
                  {formatDate(meta.onboarded)}
                </td>
                <td className="px-4 py-3 text-sm text-[#586273]">
                  {formatDate(meta.renewal)}
                </td>
                <td className="px-4 py-3 text-sm text-[#586273]">
                  {formatDate(meta.last)}
                </td>
                <td className="px-4 py-3 text-sm text-[#586273]">
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
                      className="rounded-full border border-[#59abf0] bg-white px-3 py-1.5 text-xs font-semibold text-[#2b79c4] transition-colors hover:bg-[#eaf4fe] cursor-pointer"
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
  showArchetypes,
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
    archetype: unknown;
  };
  showArchetypes: boolean;
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
            className="rounded-md border border-[#e4e9f0] bg-white p-5 shadow-sm transition-all hover:border-[#59abf0] hover:shadow-md cursor-pointer"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {renderClientAvatar(client, "h-10 w-10")}
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[#162b3e]">
                    {client.client_name ?? "Unnamed client"}
                  </div>
                  <div className="truncate text-xs text-[#586273]">
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
              {showArchetypes ? (
                <MiniMeta label="Archetype" value={displayValue(meta.archetype)} />
              ) : null}
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
                  className="rounded-full border border-[#59abf0] bg-white px-3 py-1.5 text-xs font-semibold text-[#2b79c4] transition-colors hover:bg-[#eaf4fe] cursor-pointer"
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

function sourceTypeTone(sourceType: string | null) {
  if (sourceType?.includes("current")) return "bg-[#eaf4fe] text-[#2b79c4]";
  if (sourceType?.includes("call")) return "bg-violet-50 text-violet-700";
  if (sourceType?.includes("legacy")) return "bg-amber-50 text-amber-700";
  if (sourceType?.includes("next_steps")) return "bg-emerald-50 text-emerald-700";
  return "bg-[#f1f4f8] text-[#586273]";
}

function NoteSearchPanel({
  search,
  appliedSearch,
  onSearchChange,
  onSubmit,
  results,
  loading,
  error,
  total,
  page,
  totalPages,
  pageStart,
  pageEnd,
  onPageChange,
  teamMemberNameById,
  renderClientAvatar,
  onOpenClient,
}: {
  search: string;
  appliedSearch: string;
  onSearchChange: (value: string) => void;
  onSubmit: () => void;
  results: NoteSearchResult[];
  loading: boolean;
  error: string | null;
  total: number;
  page: number;
  totalPages: number;
  pageStart: number;
  pageEnd: number;
  onPageChange: (page: number) => void;
  teamMemberNameById: Map<string, string>;
  renderClientAvatar: (client: ClientRow, size?: string) => React.ReactNode;
  onOpenClient: (id: string) => void;
}) {
  const trimmedSearch = appliedSearch.trim();
  return (
    <div className="space-y-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className="rounded-md border border-[#e4e9f0] bg-white p-4 shadow-sm"
      >
        <label
          htmlFor="clients-note-search"
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#586273]"
        >
          Search Notes
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="clients-note-search"
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search notes, next steps, call summaries, and history"
            className="block min-w-0 flex-1 rounded-md border border-[#cbd2dc] bg-white px-3 py-2.5 text-sm text-[#162b3e] placeholder:text-[#98a2b3] focus:border-[#59abf0] focus:outline-none focus:ring-2 focus:ring-[#d6eafb]"
          />
          <button
            type="submit"
            disabled={loading || search.trim().length < 2}
            className="rounded-full bg-[#59abf0] px-5 py-2.5 text-sm font-semibold text-[#162b3e] shadow-sm transition-colors hover:bg-[#3b8fd9] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>
      </form>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {trimmedSearch.length < 2 ? (
        <EmptyState text="Enter at least two characters to search across client notes and history." />
      ) : loading ? (
        <div className="flex items-center justify-center rounded-md border border-[#e4e9f0] bg-white py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#59abf0]" />
        </div>
      ) : results.length === 0 ? (
        <EmptyState text="No notes matched that search inside the current filters." />
      ) : (
        <div className="overflow-hidden rounded-md border border-[#e4e9f0] bg-white shadow-sm">
          <div className="divide-y divide-[#edf1f5]">
            {results.map((result) => {
              const client: ClientRow = {
                glide_row_id: result.client_id,
                client_name: result.client_name,
                client_image: result.client_image,
                csm_team_member_id: result.csm_team_member_id,
              };
              const snippet = noteSnippet(result.matched_text, trimmedSearch);
              return (
                <article key={result.source_key} className="px-5 py-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${sourceTypeTone(result.source_type)}`}
                        >
                          {result.source_label ?? "History"}
                        </span>
                        <span className="text-xs font-medium text-[#7b8494]">
                          {formatDate(result.event_date)}
                        </span>
                      </div>
                      <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[#162b3e]">
                        <HighlightedSnippet text={snippet} query={trimmedSearch} />
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center justify-between gap-4 rounded-md border border-[#edf1f5] bg-[#f7f9fc] px-3 py-3 md:w-72">
                      <div className="flex min-w-0 items-center gap-3">
                        {renderClientAvatar(client, "h-10 w-10")}
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => onOpenClient(result.client_id)}
                            className="block truncate text-left text-sm font-semibold text-[#162b3e] hover:text-[#2b79c4] cursor-pointer"
                          >
                            {result.client_name ?? "Unnamed client"}
                          </button>
                          <div className="truncate text-xs text-[#586273]">
                            {teamMemberNameById.get(result.csm_team_member_id ?? "") ??
                              "Unassigned"}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenClient(result.client_id)}
                        className="shrink-0 text-sm font-semibold text-[#2b79c4] hover:text-[#162b3e] cursor-pointer"
                      >
                        View
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {!loading && total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-[#586273]">
            Showing {pageStart}-{pageEnd} of {total.toLocaleString()}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page === 1}
              className="rounded-md border border-[#cbd2dc] bg-white px-3 py-2 text-sm font-medium text-[#586273] transition-colors hover:bg-[#f7f9fc] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="rounded-md border border-[#cbd2dc] bg-white px-3 py-2 text-sm font-medium text-[#586273] transition-colors hover:bg-[#f7f9fc] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
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
  if (type === "next-contact") return "border-[#59abf0]";
  if (type === "last-contact") return "border-emerald-200";
  if (type === "task") return "border-amber-200";
  if (type === "renewal") return "border-rose-200";
  return "border-sky-200";
}

function eventTagClass(type: CalendarEventType) {
  if (type === "next-contact") return "bg-[#eaf4fe] text-[#2b79c4]";
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
    <div className="rounded-md border border-[#e4e9f0] bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4e9f0] px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-[#162b3e]">
            Contact Calendar
          </h3>
          <p className="mt-1 text-sm text-[#586273]">
            {loading
              ? "Loading client timeline..."
              : `${eventCount.toLocaleString()} calendar event${eventCount === 1 ? "" : "s"} in ${rangeLabel}`}
          </p>
        </div>
        <CalendarLegend />
      </div>
      {mode !== "day" ? (
        <div className="grid grid-cols-7 border-b border-[#e4e9f0] bg-[#f7f9fc] text-xs font-semibold uppercase tracking-wider text-[#586273]">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="px-3 py-2">
              {day}
            </div>
          ))}
        </div>
      ) : null}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#59abf0]" />
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
                        ? "bg-[#59abf0] text-[#162b3e]"
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
                        className="block w-full truncate text-left text-xs font-semibold text-[#162b3e] hover:text-[#2b79c4]"
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
                            className="rounded-full border border-[#59abf0] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#2b79c4] hover:bg-[#eaf4fe]"
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
