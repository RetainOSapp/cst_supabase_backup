import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getProgramStatusDisplay,
  ProgramStatusPill,
  type ProgramChoice,
} from "../lib/clientDisplay.tsx";
import { useAccountContext } from "../lib/accountContext.tsx";
import { supabase } from "../lib/supabase.ts";

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
interface TeamMember {
  glide_row_id: string;
  name: string | null;
  is_archived?: boolean | null;
  role_hide_from_csm_list?: boolean | null;
}
type OutcomeChoice = {
  value: string;
  label: string;
};
type OutcomeChoiceSets = {
  success: OutcomeChoice[];
  progress: OutcomeChoice[];
  buyIn: OutcomeChoice[];
};
type OutcomeChoiceRow = {
  success_value?: string | null;
  success_display?: string | null;
  progress_value?: string | null;
  progress_display?: string | null;
  buy_in_value?: string | null;
  buy_in_display?: string | null;
};
type OfferRow = Record<string, unknown> & {
  glide_row_id: string;
  name?: string | null;
};
type ContractRow = Record<string, unknown> & {
  id?: string | null;
  glide_row_id?: string | null;
  client_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  monthly_value?: number | string | null;
  reference_link?: string | null;
  notes?: string | null;
  auto_renew?: boolean | null;
  status?: string | null;
  archived_at?: string | null;
  last_modified_time?: string | null;
  last_modified_by?: string | null;
};
const contractTypeOptions = [
  { value: "standard", label: "Standard" },
  { value: "renewal", label: "Renewal" },
  { value: "upsell", label: "Upsell" },
  { value: "pause_extension", label: "Pause Extension" },
  { value: "add_on", label: "Add-on" },
  { value: "other", label: "Other" },
];
type ClientMilestoneRow = Record<string, unknown> & {
  id?: string | null;
  glide_row_id?: string | null;
  milestone_id?: string | null;
  offer_id?: string | null;
  start_date?: string | null;
  completion_date?: string | null;
  duration_days?: number | string | null;
  time_to_hit_days?: number | string | null;
};
type OfferMilestoneRow = Record<string, unknown> & {
  glide_row_id?: string | null;
  offer_id?: string | null;
  name?: string | null;
  order?: number | null;
  target_days_to_complete_from_onboarding_date?: number | null;
  ttv_milestone?: boolean | null;
  final_milestone?: boolean | null;
};
type ClientTaskRow = Record<string, unknown> & {
  glide_row_id?: string | null;
  company_id?: string | null;
  client_id?: string | null;
  task_name?: string | null;
  task_description?: string | null;
  task_due_date?: string | null;
  task_last_updated_date?: string | null;
  start_date?: string | null;
  completion_date?: string | null;
  recurring_is_recurring?: boolean | null;
  recurring_weekday?: string | null;
  is_manually_archived?: boolean | null;
  task_dismissed?: boolean | null;
  task_read?: boolean | null;
  created_by_id?: string | null;
  assigned_to_id?: string | null;
  priority?: string | null;
  status_value?: string | null;
  external_link?: string | null;
};
type ClientHistoryEventRow = Record<string, unknown> & {
  id: string;
  legacy_client_glide_row_id?: string | null;
  title?: string | null;
  summary?: string | null;
  next_steps?: string | null;
  last_contact_at?: string | null;
  next_contact_at?: string | null;
  success_status?: string | null;
  progress_status?: string | null;
  buy_in_status?: string | null;
  notes?: string | null;
  created_at?: string | null;
};
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
const basicInfoFields: [string, string[]][] = [
  ["Business Name", ["business_name", "client_business", "client_name"]],
  [
    "Archetype",
    [
      "archetype",
      "archetype_value",
      "archetypeValue",
      "client_archetype",
      "client_archetype_value",
    ],
  ],
  ["Status", ["program_status_value"]],
  ["Date Onboarded", ["client_age_date_onboarded"]],
  ["Client Age", ["client_age_date_onboarded"]],
];
const offboardedDateCandidates = [
  "client_age_date_offboarded",
  "client_age_date_offboarded_for_filtering",
  "client_age_date_off_boarded",
  "date_offboarded",
  "date_off_boarded",
  "offboarded_date",
  "off_boarded_date",
  "offboarding_date",
  "offboard_date",
  "client_offboarded_date",
  "client_offboarding_date",
];
const contractFields: [string, string[]][] = [
  ["Start Date", ["start_date", "contract_start_date", "current_contract_start_date"]],
  ["End Date", ["end_date", "contract_end_date", "current_contract_end_date"]],
  ["Contract Days", ["contract_days", "days", "of_days", "current_contract_of_days"]],
  ["Status", ["status", "contract_status"]],
  [
    "Offboarded Date",
    ["client_age_date_offboarded", "client_age_date_offboarded_for_filtering"],
  ],
];
const programFields: [string, string[]][] = [
  [
    "North Star",
    [
      "north_star",
      "north_star_value",
      "north_star_text",
      "client_north_star",
      "client_north_star_value",
      "program_north_star",
      "program_north_star_value",
      "csm_north_star",
      "current_north_star",
    ],
  ],
  [
    "Next Steps",
    [
      "next_steps",
      "next_steps_value",
      "next_steps_text",
      "client_next_steps",
      "program_next_steps",
      "program_next_steps_value",
      "csm_next_steps",
      "next_step",
    ],
  ],
  [
    "Director Notes",
    [
      "client_director_notes",
      "director_notes",
      "director_notes_value",
      "director_notes_text",
      "director_note",
      "csm_director_notes",
      "notes",
    ],
  ],
  [
    "General Information",
    [
      "general_information",
      "general_information_value",
      "general_info",
      "client_general_information",
      "client_general_info",
      "csm_general_information",
    ],
  ],
];
const outcomeFields: [string, string[]][] = [
  [
    "Success",
    [
      "outcomes_success_for_filtering",
      "success",
      "success_value",
      "success_status",
    ],
  ],
  [
    "Progress",
    [
      "outcomes_progress_for_filtering",
      "outcomes_progress_value",
      "progress",
      "progress_value",
      "progress_status",
    ],
  ],
  [
    "Buy In",
    [
      "outcomes_buy_in_for_filtering",
      "outcomes_buy_in_value",
      "buy_in",
      "buy_in_value",
      "buy_in_status",
    ],
  ],
  ["Testimonial Asked", ["testimonial_date_asked", "testimonial_asked_date"]],
  ["Review Asked", ["review_date_asked", "review_asked_date"]],
  ["Referral Asked", ["referral_date_asked", "referral_asked_date"]],
];
const pathwayFields: [string, string[]][] = [
  [
    "Offer",
    [
      "offer_milestones_current_offer_id",
      "offer_milestones_2nd_current_offer_id",
      "offer_id",
      "offer_current_value",
      "offer_name",
    ],
  ],
  [
    "Pathways & Milestones",
    [
      "pathways_and_milestones",
      "pathways_milestones",
      "pathways_milestones_value",
      "pathway_and_milestone",
      "pathway_milestone",
      "client_pathways_milestones",
    ],
  ],
  ["Pathway", ["pathway", "pathways", "pathway_name", "pathway_value"]],
  [
    "Milestones",
    [
      "offer_milestones_current_milestone_id",
      "offer_milestones_2nd_current_milestone_id",
      "milestone_id",
      "milestone_name",
      "milestone_current_value",
    ],
  ],
  [
    "Last Contact",
    [
      "csm_date_of_last_contact",
      "last_contact",
      "last_contact_date",
      "date_of_last_contact",
    ],
  ],
  [
    "Next Contact",
    [
      "csm_date_of_next_contact",
      "next_contact",
      "next_contact_date",
      "date_of_next_contact",
    ],
  ],
];
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
  if (typeof value === "string") {
    const date = new Date(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(date.getTime()))
      return date.toLocaleDateString();
    return value;
  }
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

function formatClientAge(value: unknown, endValue?: unknown) {
  if (!isPresent(value)) return "--";
  const onboarded = new Date(String(value));
  if (Number.isNaN(onboarded.getTime())) return displayValue(value);
  if (endValue === false) return "--";
  const ended =
    isPresent(endValue) && !Number.isNaN(new Date(String(endValue)).getTime())
      ? new Date(String(endValue))
      : new Date();
  const diffMs = ended.getTime() - onboarded.getTime();
  const days = Math.max(0, Math.floor(diffMs / 86_400_000));
  return `${days.toLocaleString()} day${days === 1 ? "" : "s"}`;
}

function isOffboardedStatus(
  value: unknown,
  programChoices: ProgramChoice[] = [],
) {
  const raw = String(value ?? "").toLowerCase();
  const display = getProgramStatusDisplay(
    typeof value === "string" ? value : null,
    programChoices,
  ).text.toLowerCase();
  return raw.includes("offboard") || display.includes("offboard");
}

function formatCurrency(value: unknown) {
  if (!isPresent(value)) return "--";
  const amount = Number(value);
  if (Number.isNaN(amount)) return displayValue(value);
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function formatBoolean(value: unknown) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "--";
}

function formatDateTime(value: unknown) {
  if (!isPresent(value)) return "--";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return displayValue(value);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function addDays(dateValue: unknown, daysValue: unknown) {
  if (!isPresent(dateValue) || !isPresent(daysValue)) return null;
  const date = new Date(String(dateValue));
  const days = Number(daysValue);
  if (Number.isNaN(date.getTime()) || Number.isNaN(days)) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function contractEndDate(contract: Record<string, unknown>) {
  return (
    valueFrom(contract, [
      "end_date",
      "current_contract_end_date",
      "current_contract_end_date_for_filtering",
      "current_contract_select_end_date",
    ]) ??
    addDays(
      valueFrom(contract, ["start_date", "current_contract_start_date"]),
      valueFrom(contract, ["current_contract_of_days", "contract_days", "days"]),
    )
  );
}

function getContractStatus(contract: Record<string, unknown>) {
  const status = valueFrom(contract, ["status"]);
  if (typeof status === "string" && status.toLowerCase() === "archived") {
    return "Archived";
  }
  if (isPresent(valueFrom(contract, ["archived_at"]))) return "Archived";
  const end = contractEndDate(contract);
  if (!isPresent(end)) return "Open";
  const endDate = new Date(String(end));
  if (Number.isNaN(endDate.getTime())) return "Open";
  return endDate.getTime() >= Date.now() ? "Active" : "Expired";
}

function isAppOwnedContract(contract: Record<string, unknown>) {
  return (
    typeof contract.id === "string" &&
    typeof contract.glide_row_id === "string" &&
    contract.glide_row_id.startsWith("contract_")
  );
}

function getContractTypeValue(contract: Record<string, unknown>) {
  const metadata = contract.metadata;
  const value =
    metadata && typeof metadata === "object" && "contract_type" in metadata
      ? (metadata as Record<string, unknown>).contract_type
      : valueFrom(contract, ["contract_type"]);
  return typeof value === "string" && value.trim() ? value : "standard";
}

function getContractTypeLabel(contract: Record<string, unknown>) {
  const value = getContractTypeValue(contract);
  return (
    contractTypeOptions.find((option) => option.value === value)?.label ?? "Standard"
  );
}

function daysUntilDate(value: unknown) {
  const date = dateFromValue(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function hasCurrentContract(client: ClientRow | null | undefined) {
  if (!client) return false;
  return [
    "current_contract_start_date",
    "current_contract_of_days",
    "current_contract_end_date",
    "current_contract_end_date_for_filtering",
    "current_contract_monthly_value",
    "current_contract_reference_link",
    "current_contract_notes",
    "current_contract_auto_renew",
  ].some((key) => isPresent(client[key]));
}
const displayNameKeys = [
  "name",
  "title",
  "label",
  "program_label",
  "offer_name",
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

function extractGlideIds(value: unknown): string[] {
  const ids = new Set<string>();
  const visit = (next: unknown) => {
    if (!isPresent(next)) return;
    if (typeof next === "string") {
      const trimmed = next.trim();
      if (
        (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]"))
      ) {
        try {
          visit(JSON.parse(trimmed));
          return;
        } catch {
          // Keep checking the raw string below.
        }
      }
      if (/^[A-Za-z0-9_.-]{12,}$/.test(trimmed)) ids.add(trimmed);
      return;
    }
    if (Array.isArray(next)) {
      next.forEach(visit);
      return;
    }
    if (typeof next === "object") {
      Object.values(next as Record<string, unknown>).forEach(visit);
    }
  };
  visit(value);
  return [...ids];
}

function bestDisplayName(row: Record<string, unknown>) {
  for (const key of displayNameKeys) {
    const value = row[key];
    if (isPresent(value)) return displayValue(value);
  }
  const rawData = row.data;
  if (rawData && typeof rawData === "object" && !Array.isArray(rawData)) {
    for (const key of displayNameKeys) {
      const value = (rawData as Record<string, unknown>)[key];
      if (isPresent(value)) return displayValue(value);
    }
  }
  return null;
}

async function resolveRelationNames(ids: string[]) {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  const resolved = new Map<string, string>();
  if (uniqueIds.length === 0) return resolved;

  const tables = [
    "backup_company_offers",
    "backup_company_offer_milestones",
    "backup_company_clients_milestones",
    "backup_company_clients_pathways_and_milestones",
    "backup_company_pathways_and_milestones",
    "backup_pathways_and_milestones",
    "backup_pathways_milestones",
    "backup_company_client_pathways",
    "backup_company_pathways",
    "backup_pathways",
    "backup_company_milestones",
    "backup_milestones",
    "backup_choices",
  ];

  for (const table of tables) {
    const remaining = uniqueIds.filter((id) => !resolved.has(id));
    if (remaining.length === 0) break;
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .in("glide_row_id", remaining);
    if (error) continue;
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const id = row.glide_row_id;
      const name = bestDisplayName(row);
      if (typeof id === "string" && name) resolved.set(id, name);
    }
  }

  return resolved;
}
function normalizeOutcome(value: unknown) {
  const raw = formatValue(value).trim();
  if (!raw || raw === "--" || raw.toLowerCase() === "x") return "";
  return raw;
}
function titleize(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
function outcomeLabel(value: string, display?: string | null) {
  if (display && display.trim()) return display.trim();
  return titleize(value);
}
function outcomeChoicesFromRows(rows: OutcomeChoiceRow[] | null | undefined) {
  const seen = {
    success: new Set<string>(),
    progress: new Set<string>(),
    buyIn: new Set<string>(),
  };
  const choices: OutcomeChoiceSets = { success: [], progress: [], buyIn: [] };

  for (const row of rows ?? []) {
    if (row.success_value && !seen.success.has(row.success_value)) {
      seen.success.add(row.success_value);
      choices.success.push({
        value: row.success_value,
        label: outcomeLabel(row.success_value, row.success_display),
      });
    }
    if (
      row.progress_value &&
      row.progress_value !== "offtrack" &&
      !seen.progress.has(row.progress_value)
    ) {
      seen.progress.add(row.progress_value);
      choices.progress.push({
        value: row.progress_value,
        label: outcomeLabel(row.progress_value, row.progress_display),
      });
    }
    if (row.buy_in_value && !seen.buyIn.has(row.buy_in_value)) {
      seen.buyIn.add(row.buy_in_value);
      choices.buyIn.push({
        value: row.buy_in_value,
        label: outcomeLabel(row.buy_in_value, row.buy_in_display),
      });
    }
  }

  return choices;
}

function outcomeChoicesFromDefinitions(rows: Record<string, unknown>[] | null | undefined) {
  const choices: OutcomeChoiceSets = { success: [], progress: [], buyIn: [] };
  for (const row of rows ?? []) {
    const value = normalizeOutcome(row.value);
    if (!value) continue;
    const label = normalizeOutcome(row.label) || outcomeLabel(value);
    if (row.outcome_type === "success") choices.success.push({ value, label });
    if (row.outcome_type === "progress") choices.progress.push({ value, label });
    if (row.outcome_type === "buy_in") choices.buyIn.push({ value, label });
  }
  return choices;
}
async function functionErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "context" in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const payload = (await context.clone().json()) as {
          error?: string;
          message?: string;
        };
        if (payload.error) return payload.error;
        if (payload.message) return payload.message;
      } catch {
        // Fall back to the SDK error message.
      }
    }
  }
  return error instanceof Error ? error.message : "Unable to save outcomes.";
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
function isOutcomeField(label: string) {
  return ["Success", "Progress", "Buy In"].includes(label);
}
function isRichField(label: string) {
  return [
    "North Star",
    "Next Steps",
    "Director Notes",
    "General Information",
    "Pathways & Milestones",
    "Pathway",
    "Milestones",
  ].includes(label);
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

function textInputValue(value: unknown) {
  const shown = displayValue(value);
  return shown === "--" ? "" : shown;
}

function dateInputValue(value: unknown) {
  if (!isPresent(value)) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function milestoneSortValue(milestone: OfferMilestoneRow) {
  const order = Number(milestone.order);
  return Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER;
}

function dateFromValue(value: unknown) {
  if (!isPresent(value)) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetweenValues(startValue: unknown, endValue: unknown) {
  const start = dateFromValue(startValue);
  const end = dateFromValue(endValue);
  if (!start || !end) return null;
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / msPerDay));
}

function milestoneStatusClasses(status: string) {
  if (status === "Final completed") {
    return "border-emerald-300 bg-emerald-100 text-emerald-800";
  }
  if (status === "Completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "Current") {
    return "border-indigo-200 bg-indigo-50 text-indigo-700";
  }
  if (status === "Started") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  return "border-gray-200 bg-gray-50 text-gray-600";
}

function ClientProfileEditModal({
  client,
  teamMembers,
  canManageAssignment,
  canEditDirectorNotes,
  onClose,
  onSaved,
}: {
  client: ClientRow;
  teamMembers: TeamMember[];
  canManageAssignment: boolean;
  canEditDirectorNotes: boolean;
  onClose: () => void;
  onSaved: (client: ClientRow, event: ClientHistoryEventRow | null) => void;
}) {
  const [clientName, setClientName] = useState(textInputValue(client.client_name));
  const [clientBusiness, setClientBusiness] = useState(
    textInputValue(client.client_business),
  );
  const [clientEmail, setClientEmail] = useState(textInputValue(client.client_email));
  const [clientArchetype, setClientArchetype] = useState(
    textInputValue(client.client_archetype_value),
  );
  const [northStar, setNorthStar] = useState(
    textInputValue(valueFrom(client, ["north_star_value"])),
  );
  const [directorNotes, setDirectorNotes] = useState(
    textInputValue(valueFrom(client, ["client_director_notes"])),
  );
  const [csmTeamMemberId, setCsmTeamMemberId] = useState(
    client.csm_team_member_id ?? "",
  );
  const availableAssignees = teamMembers.filter(
    (member) =>
      member.is_archived !== true && member.role_hide_from_csm_list !== true,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveError(null);

    const { data, error } = await supabase.functions.invoke(
      "manage-client-profile",
      {
        body: {
          clientLegacyId: client.glide_row_id,
          clientName,
          clientBusiness,
          clientEmail,
          clientArchetype,
          northStar,
          directorNotes,
          ...(canManageAssignment ? { csmTeamMemberId } : {}),
        },
      },
    );

    setSaving(false);

    if (error) {
      setSaveError(await functionErrorMessage(error));
      return;
    }
    if (data?.error) {
      setSaveError(data.error);
      return;
    }
    if (data?.client) {
      onSaved(
        mapAppClientRow(data.client as Record<string, unknown>),
        (data.event as ClientHistoryEventRow | undefined) ?? null,
      );
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close edit profile"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 cursor-pointer"
      />
      <div className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Edit Client Profile
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Saves to RetainOS pilot client data and history.
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
          <div className="space-y-4 px-5 py-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Client Name
                </span>
                <input
                  value={clientName}
                  onChange={(event) => setClientName(event.target.value)}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Business Name
                </span>
                <input
                  value={clientBusiness}
                  onChange={(event) => setClientBusiness(event.target.value)}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
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
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Archetype
                </span>
                <input
                  value={clientArchetype}
                  onChange={(event) => setClientArchetype(event.target.value)}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                />
              </label>
            </div>
            {canManageAssignment ? (
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Primary CSM
                </span>
                <select
                  value={csmTeamMemberId}
                  onChange={(event) => setCsmTeamMemberId(event.target.value)}
                  disabled={saving}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
                >
                  <option value="">Unassigned</option>
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
                North Star
              </span>
              <textarea
                value={northStar}
                onChange={(event) => setNorthStar(event.target.value)}
                rows={5}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              />
            </label>
            {canEditDirectorNotes ? (
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Director Notes
                </span>
                <textarea
                  value={directorNotes}
                  onChange={(event) => setDirectorNotes(event.target.value)}
                  rows={4}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                />
              </label>
            ) : null}
            {saveError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
              disabled={saving}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Saving..." : "Save Profile"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ClientOutcomesEditModal({
  client,
  choices,
  onClose,
  onSaved,
}: {
  client: ClientRow;
  choices: OutcomeChoiceSets;
  onClose: () => void;
  onSaved: (client: ClientRow, event: ClientHistoryEventRow | null) => void;
}) {
  const [successStatus, setSuccessStatus] = useState(
    textInputValue(
      valueFrom(client, [
        "outcomes_success_value",
        "outcomes_success_for_filtering",
        "success_status",
      ]),
    ),
  );
  const [progressStatus, setProgressStatus] = useState(
    textInputValue(
      valueFrom(client, [
        "outcomes_progress_value",
        "outcomes_progress_for_filtering",
        "progress_status",
      ]),
    ),
  );
  const [buyInStatus, setBuyInStatus] = useState(
    textInputValue(
      valueFrom(client, [
        "outcomes_buy_in_value",
        "outcomes_buy_in_for_filtering",
        "buy_in_status",
      ]),
    ),
  );
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveError(null);

    const { data, error } = await supabase.functions.invoke(
      "manage-client-outcomes",
      {
        body: {
          clientLegacyId: client.glide_row_id,
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
    if (data?.client) {
      onSaved(
        mapAppClientRow(data.client as Record<string, unknown>),
        (data.event as ClientHistoryEventRow | undefined) ?? null,
      );
      onClose();
    }
  }

  const renderSelect = (
    label: string,
    value: string,
    options: OutcomeChoice[],
    onChange: (value: string) => void,
  ) => (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        <option value="">Not set</option>
        {options.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close edit outcomes"
        className="absolute inset-0 bg-gray-900/40"
        onClick={onClose}
      />
      <div className="relative w-full max-w-xl rounded-lg bg-white shadow-xl">
        <form onSubmit={handleSubmit} className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Edit Outcomes
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Update success, progress, and buy-in for this client.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 cursor-pointer"
              aria-label="Close"
            >
              &times;
            </button>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {renderSelect(
              "Success",
              successStatus,
              choices.success,
              setSuccessStatus,
            )}
            {renderSelect(
              "Progress",
              progressStatus,
              choices.progress,
              setProgressStatus,
            )}
            {renderSelect("Buy-in", buyInStatus, choices.buyIn, setBuyInStatus)}
          </div>

          <label className="mt-4 block">
            <span className="text-sm font-medium text-gray-700">
              Notes
              <span className="ml-1 font-normal text-gray-400">(optional)</span>
            </span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>

          {saveError ? (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {saveError}
            </div>
          ) : null}

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Saving..." : "Save Outcomes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ClientOutcomesInlineEditor({
  client,
  choices,
  canEdit,
  onSaved,
}: {
  client: ClientRow;
  choices: OutcomeChoiceSets;
  canEdit: boolean;
  onSaved: (client: ClientRow, event: ClientHistoryEventRow | null) => void;
}) {
  const currentSuccess = textInputValue(
    valueFrom(client, [
      "outcomes_success_value",
      "outcomes_success_for_filtering",
      "success_status",
    ]),
  );
  const currentProgress = textInputValue(
    valueFrom(client, [
      "outcomes_progress_value",
      "outcomes_progress_for_filtering",
      "progress_status",
    ]),
  );
  const currentBuyIn = textInputValue(
    valueFrom(client, [
      "outcomes_buy_in_value",
      "outcomes_buy_in_for_filtering",
      "buy_in_status",
    ]),
  );
  const [successStatus, setSuccessStatus] = useState(currentSuccess);
  const [progressStatus, setProgressStatus] = useState(currentProgress);
  const [buyInStatus, setBuyInStatus] = useState(currentBuyIn);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setSuccessStatus(currentSuccess);
    setProgressStatus(currentProgress);
    setBuyInStatus(currentBuyIn);
    setNotes("");
    setSaveError(null);
  }, [client.glide_row_id, currentBuyIn, currentProgress, currentSuccess]);

  const hasChanges =
    successStatus !== currentSuccess ||
    progressStatus !== currentProgress ||
    buyInStatus !== currentBuyIn ||
    notes.trim() !== "";

  async function handleSave() {
    if (!canEdit || saving || !hasChanges) return;
    setSaving(true);
    setSaveError(null);

    const { data, error } = await supabase.functions.invoke(
      "manage-client-outcomes",
      {
        body: {
          clientLegacyId: client.glide_row_id,
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
    if (data?.client) {
      onSaved(
        mapAppClientRow(data.client as Record<string, unknown>),
        (data.event as ClientHistoryEventRow | undefined) ?? null,
      );
      setNotes("");
    }
  }

  const renderSelect = (
    label: string,
    value: string,
    options: OutcomeChoice[],
    onChange: (value: string) => void,
  ) => (
    <label className="block rounded-lg border border-[#e4e9f0] bg-[#f8fafc] p-4">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[#586273]">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={!canEdit || saving}
        className="w-full rounded-md border border-[#cbd2dc] bg-white px-3 py-2 text-sm font-medium text-[#162b3e] disabled:bg-[#f1f4f8] disabled:text-[#7b8494]"
      >
        <option value="">Not set</option>
        {options.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {renderSelect("Success", successStatus, choices.success, setSuccessStatus)}
        {renderSelect("Progress", progressStatus, choices.progress, setProgressStatus)}
        {renderSelect("Buy-in", buyInStatus, choices.buyIn, setBuyInStatus)}
      </div>
      {canEdit ? (
        <>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#586273]">
              Notes for history
            </span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              disabled={saving}
              placeholder="Optional context for this outcomes update"
              className="block w-full rounded-md border border-[#cbd2dc] bg-white px-3 py-2 text-sm text-[#162b3e] placeholder:text-[#7b8494] disabled:bg-[#f1f4f8]"
            />
          </label>
          {saveError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {saveError}
            </div>
          ) : null}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !hasChanges}
              className="retainos-button-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Outcomes"}
            </button>
          </div>
        </>
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Outcomes are read-only for this client.
        </div>
      )}
    </div>
  );
}

function ClientStatusModal({
  client,
  programChoices,
  onClose,
  onSaved,
}: {
  client: ClientRow;
  programChoices: ProgramChoice[];
  onClose: () => void;
  onSaved: (
    client: ClientRow,
    event: ClientHistoryEventRow | null,
    updatedContract: ContractRow | null,
  ) => void;
}) {
  const allowedStatuses = new Set([
    "front-end",
    "back-end",
    "paused",
    "suspended",
    "off-boarded",
  ]);
  const statusOptions = programChoices
    .filter(
      (choice) =>
        choice.program_value && allowedStatuses.has(choice.program_value),
    )
    .sort((a, b) => {
      const order = ["front-end", "back-end", "paused", "suspended", "off-boarded"];
      return (
        order.indexOf(a.program_value ?? "") -
        order.indexOf(b.program_value ?? "")
      );
    });
  const fallbackOptions =
    statusOptions.length > 0
      ? statusOptions
      : [
          { program_value: "front-end", program_label: "Front End", program_emoji: null },
          { program_value: "back-end", program_label: "Back End", program_emoji: null },
          { program_value: "paused", program_label: "Paused", program_emoji: null },
          { program_value: "suspended", program_label: "Suspended", program_emoji: null },
          { program_value: "off-boarded", program_label: "Offboarded", program_emoji: null },
        ];
  const [targetStatus, setTargetStatus] = useState(
    fallbackOptions.find(
      (choice) => choice.program_value !== client.program_status_value,
    )?.program_value ?? "front-end",
  );
  const [reason, setReason] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const requiresReason = ["paused", "suspended", "off-boarded"].includes(
    targetStatus ?? "",
  );
  const requiresReturnDate = targetStatus === "paused";
  const isReactivation =
    targetStatus === "front-end" || targetStatus === "back-end";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveError(null);

    const { data, error } = await supabase.functions.invoke(
      "manage-client-status",
      {
        body: {
          clientLegacyId: client.glide_row_id,
          targetStatus,
          reason,
          returnDate,
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
    if (data?.client) {
      onSaved(
        mapAppClientRow(data.client as Record<string, unknown>),
        (data.event as ClientHistoryEventRow | undefined) ?? null,
        (data.updatedContract as ContractRow | undefined) ?? null,
      );
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close status change"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 cursor-pointer"
      />
      <div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Change Client Status
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Uses existing program statuses and records the change in history.
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
          <div className="space-y-4 px-5 py-5">
            <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              Current status:{" "}
              <ProgramStatusPill
                value={client.program_status_value}
                choices={programChoices}
              />
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                New Status
              </span>
              <select
                value={targetStatus ?? ""}
                onChange={(event) => setTargetStatus(event.target.value)}
                disabled={saving}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
              >
                {fallbackOptions.map((choice) => (
                  <option
                    key={choice.program_value ?? ""}
                    value={choice.program_value ?? ""}
                    disabled={choice.program_value === client.program_status_value}
                  >
                    {choice.program_label ?? choice.program_value}
                  </option>
                ))}
              </select>
            </label>
            {requiresReason ? (
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Reason
                </span>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  required
                  disabled={saving}
                  placeholder={
                    targetStatus === "paused"
                      ? "Leadership-approved pause reason"
                      : targetStatus === "suspended"
                        ? "Payment or delinquency context"
                        : "Offboarding reason"
                  }
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 disabled:bg-gray-50"
                />
              </label>
            ) : null}
            {requiresReturnDate ? (
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Return Date
                </span>
                <input
                  type="date"
                  value={returnDate}
                  onChange={(event) => setReturnDate(event.target.value)}
                  required
                  disabled={saving}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
                />
                <span className="mt-1 block text-xs text-gray-500">
                  Paused clients extend the app-owned contract by the approved
                  pause window.
                </span>
              </label>
            ) : null}
            {isReactivation ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Moving back to Front End or Back End is the reactivation step.
              </div>
            ) : null}
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Notes
              </span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                disabled={saving}
                placeholder="Optional extra context for history"
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 disabled:bg-gray-50"
              />
            </label>
            {saveError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
              disabled={saving}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Saving..." : "Save Status"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewContractModal({
  client,
  contract,
  onClose,
  onSaved,
}: {
  client: ClientRow;
  contract?: ContractRow | null;
  onClose: () => void;
  onSaved: (
    contract: ContractRow,
    client: ClientRow,
    event: ClientHistoryEventRow | null,
    retentionEvent: ClientHistoryEventRow | null,
  ) => void;
}) {
  const isEditing = Boolean(contract);
  const [startDate, setStartDate] = useState(
    dateInputValue(
      isEditing
        ? valueFrom(contract ?? {}, ["start_date"])
        : valueFrom(client, ["current_contract_start_date"]),
    ),
  );
  const [endDate, setEndDate] = useState(
    dateInputValue(valueFrom(contract ?? {}, ["end_date"])),
  );
  const [contractDays, setContractDays] = useState(
    isPresent(valueFrom(contract ?? {}, ["contract_days"]))
      ? String(valueFrom(contract ?? {}, ["contract_days"]))
      : "",
  );
  const [monthlyValue, setMonthlyValue] = useState(
    isPresent(valueFrom(contract ?? {}, ["monthly_value"]))
      ? String(valueFrom(contract ?? {}, ["monthly_value"]))
      : "",
  );
  const [totalContractValue, setTotalContractValue] = useState(
    isPresent(valueFrom(contract ?? {}, ["total_contract_value"]))
      ? String(valueFrom(contract ?? {}, ["total_contract_value"]))
      : "",
  );
  const [referenceLink, setReferenceLink] = useState(
    typeof contract?.reference_link === "string" ? contract.reference_link : "",
  );
  const [notes, setNotes] = useState(
    typeof contract?.notes === "string" ? contract.notes : "",
  );
  const [autoRenew, setAutoRenew] = useState(Boolean(contract?.auto_renew));
  const [status, setStatus] = useState(contract?.status ?? "active");
  const [contractType, setContractType] = useState(
    getContractTypeValue(contract ?? {}),
  );
  const currentProgramStatus =
    typeof client.program_status_value === "string"
      ? client.program_status_value
      : "";
  const canRecordRetention = ["front-end", "back-end"].includes(currentProgramStatus);
  const [retentionType, setRetentionType] = useState("none");
  const [retentionTargetStatus, setRetentionTargetStatus] = useState(
    currentProgramStatus || "front-end",
  );
  const [markSuccess, setMarkSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveError(null);

    const { data, error } = await supabase.functions.invoke(
      "manage-client-contract",
      {
        body: {
          clientLegacyId: client.glide_row_id,
          action: isEditing ? "update" : "create",
          contractId: contract?.glide_row_id,
          startDate,
          endDate,
          contractDays,
          monthlyValue,
          totalContractValue,
          referenceLink,
          notes,
          autoRenew,
          status,
          contractType,
          retentionType: isEditing ? "none" : retentionType,
          retentionTargetStatus,
          markSuccess: isEditing ? false : markSuccess,
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
    if (data?.contract && data?.client) {
      onSaved(
        data.contract as ContractRow,
        mapAppClientRow(data.client as Record<string, unknown>),
        (data.event as ClientHistoryEventRow | undefined) ?? null,
        (data.retentionEvent as ClientHistoryEventRow | undefined) ?? null,
      );
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={isEditing ? "Close edit contract" : "Close new contract"}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 cursor-pointer"
      />
      <div className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {isEditing ? "Edit Contract" : "New Contract"}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {isEditing
                ? "Updates RetainOS pilot contract data and refreshes the client summary."
                : "Saves to RetainOS pilot contract data and updates the client summary."}
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
          <div className="space-y-4 px-5 py-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Start Date
                </span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  End / Renewal Date
                </span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Contract Days
                </span>
                <input
                  type="number"
                  min="0"
                  value={contractDays}
                  onChange={(event) => setContractDays(event.target.value)}
                  placeholder="Optional"
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
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
                  value={monthlyValue}
                  onChange={(event) => setMonthlyValue(event.target.value)}
                  placeholder="Optional"
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Total Contract Value
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={totalContractValue}
                  onChange={(event) => setTotalContractValue(event.target.value)}
                  placeholder="Optional"
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </span>
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                >
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="expired">Expired</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Contract Type
                </span>
                <select
                  value={contractType}
                  onChange={(event) => setContractType(event.target.value)}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                >
                  {contractTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={autoRenew}
                onChange={(event) => setAutoRenew(event.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600"
              />
              Auto renew
            </label>
            {!isEditing ? (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-indigo-700">
                  Retention Outcome
                </span>
                <select
                  value={retentionType}
                  onChange={(event) => {
                    const nextType = event.target.value;
                    setRetentionType(nextType);
                    setMarkSuccess(nextType !== "none");
                    if (nextType === "upsell") {
                      setRetentionTargetStatus("back-end");
                    } else if (nextType === "renewal") {
                      setRetentionTargetStatus(currentProgramStatus || "front-end");
                    }
                  }}
                  disabled={!canRecordRetention}
                  className="block w-full rounded-md border border-indigo-200 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="none">Do not record retention</option>
                  <option value="renewal">Renew current program</option>
                  {currentProgramStatus === "front-end" ? (
                    <option value="upsell">Renew and move to Back End</option>
                  ) : null}
                </select>
              </label>
              <p className="mt-2 text-xs text-indigo-700">
                Use this when the new contract represents a renewal or upsell. It
                writes a RetainOS retention event for Dashboard reporting.
              </p>
              {retentionType !== "none" ? (
                <label className="mt-3 flex items-center gap-2 text-sm font-medium text-indigo-900">
                  <input
                    type="checkbox"
                    checked={markSuccess}
                    onChange={(event) => setMarkSuccess(event.target.checked)}
                    className="h-4 w-4 rounded border-indigo-300 text-indigo-600"
                  />
                  Mark success with this renewal
                </label>
              ) : null}
              {!canRecordRetention ? (
                <p className="mt-2 text-xs text-amber-700">
                  Retention can only be recorded for active Front End or Back End clients.
                </p>
              ) : null}
            </div>
            ) : null}
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Contract Link
              </span>
              <input
                type="url"
                value={referenceLink}
                onChange={(event) => setReferenceLink(event.target.value)}
                placeholder="https://..."
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Notes
              </span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={4}
                placeholder="Optional context"
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
              />
            </label>
            {saveError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
              disabled={saving}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Saving..." : isEditing ? "Update Contract" : "Save Contract"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MilestoneActionModal({
  client,
  action,
  currentMilestoneName,
  offerMilestones,
  relationLookup,
  existingProgress,
  onClose,
  onSaved,
}: {
  client: ClientRow;
  action: "start_milestone" | "complete_milestone";
  currentMilestoneName: string;
  offerMilestones: OfferMilestoneRow[];
  relationLookup: Map<string, string>;
  existingProgress: ClientMilestoneRow | null;
  onClose: () => void;
  onSaved: (
    client: ClientRow,
    milestone: ClientMilestoneRow,
    event: ClientHistoryEventRow | null,
  ) => void;
}) {
  const [startDate, setStartDate] = useState(
    dateInputValue(existingProgress?.start_date) || todayInputValue(),
  );
  const [completionDate, setCompletionDate] = useState(todayInputValue());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isComplete = action === "complete_milestone";
  const currentOfferId =
    existingProgress?.offer_id ??
    textInputValue(valueFrom(client, ["offer_milestones_current_offer_id"]));
  const currentMilestoneId =
    existingProgress?.milestone_id ??
    textInputValue(valueFrom(client, ["offer_milestones_current_milestone_id"]));
  const orderedMilestones = offerMilestones
    .filter((milestone) => String(milestone.offer_id ?? "") === String(currentOfferId))
    .sort((a, b) => milestoneSortValue(a) - milestoneSortValue(b));
  const currentMilestoneIndex = orderedMilestones.findIndex(
    (milestone) => String(milestone.glide_row_id ?? "") === String(currentMilestoneId),
  );
  const currentConfiguredMilestone =
    currentMilestoneIndex >= 0 ? orderedMilestones[currentMilestoneIndex] : null;
  const nextConfiguredMilestone =
    currentMilestoneIndex >= 0
      ? orderedMilestones[currentMilestoneIndex + 1] ?? null
      : null;
  const completesFinalMilestone =
    isComplete &&
    (Boolean(currentConfiguredMilestone?.final_milestone) || !nextConfiguredMilestone);
  const previewDuration = isComplete
    ? daysBetweenValues(startDate, completionDate)
    : null;
  const previewTimeToHit = isComplete
    ? daysBetweenValues(valueFrom(client, ["client_age_date_onboarded"]), completionDate)
    : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveError(null);

    const { data, error } = await supabase.functions.invoke(
      "manage-client-milestone",
      {
        body: {
          action,
          clientLegacyId: client.glide_row_id,
          offerId:
            existingProgress?.offer_id ??
            valueFrom(client, ["offer_milestones_current_offer_id"]),
          milestoneId:
            existingProgress?.milestone_id ??
            valueFrom(client, ["offer_milestones_current_milestone_id"]),
          startDate,
          completionDate: isComplete ? completionDate : undefined,
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
    if (data?.client && data?.clientMilestone) {
      onSaved(
        mapAppClientRow(data.client as Record<string, unknown>),
        data.clientMilestone as ClientMilestoneRow,
        (data.event as ClientHistoryEventRow | undefined) ?? null,
      );
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close milestone action"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 cursor-pointer"
      />
      <div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {isComplete ? "Complete Milestone" : "Start Milestone"}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {currentMilestoneName}
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
          <div className="space-y-4 px-5 py-5">
            {isComplete ? (
              <div className="grid gap-3 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wider text-indigo-700">
                    Completing
                  </div>
                  <div className="mt-1 text-sm font-semibold text-indigo-950">
                    {displayValue(
                      currentConfiguredMilestone?.name ?? currentMilestoneName,
                      relationLookup,
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wider text-indigo-700">
                    Next State
                  </div>
                  <div className="mt-1 text-sm font-semibold text-indigo-950">
                    {completesFinalMilestone
                      ? "Final milestone completed"
                      : displayValue(nextConfiguredMilestone?.name, relationLookup)}
                  </div>
                </div>
                <div className="text-xs text-indigo-800">
                  Duration: {previewDuration === null ? "--" : `${previewDuration} days`}
                </div>
                <div className="text-xs text-indigo-800">
                  Time to hit:{" "}
                  {previewTimeToHit === null ? "--" : `${previewTimeToHit} days`}
                </div>
              </div>
            ) : null}
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Start Date
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                required={!isComplete}
                disabled={saving}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
              />
              {isComplete ? (
                <span className="mt-1 block text-xs text-gray-500">
                  Optional override. If left as-is, RetainOS uses the saved
                  start date for duration and the onboarded date for time to hit.
                </span>
              ) : null}
            </label>
            {isComplete ? (
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Completion Date
                </span>
                <input
                  type="date"
                  value={completionDate}
                  onChange={(event) => setCompletionDate(event.target.value)}
                  required
                  disabled={saving}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
                />
              </label>
            ) : null}
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Notes
              </span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                disabled={saving}
                placeholder="Optional context for history"
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 disabled:bg-gray-50"
              />
            </label>
            {saveError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
              disabled={saving}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Saving..." : isComplete ? "Complete Milestone" : "Start Milestone"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PathwayChangeModal({
  client,
  offers,
  offerMilestones,
  relationLookup,
  onClose,
  onSaved,
}: {
  client: ClientRow;
  offers: OfferRow[];
  offerMilestones: OfferMilestoneRow[];
  relationLookup: Map<string, string>;
  onClose: () => void;
  onSaved: (
    client: ClientRow,
    milestone: ClientMilestoneRow,
    event: ClientHistoryEventRow | null,
  ) => void;
}) {
  const initialOfferId =
    textInputValue(valueFrom(client, ["offer_milestones_current_offer_id"])) ||
    offers[0]?.glide_row_id ||
    "";
  const [offerId, setOfferId] = useState(initialOfferId);
  const milestonesForOffer = offerMilestones
    .filter((milestone) => milestone.offer_id === offerId)
    .sort((a, b) => milestoneSortValue(a) - milestoneSortValue(b));
  const initialMilestoneId =
    textInputValue(valueFrom(client, ["offer_milestones_current_milestone_id"])) ||
    milestonesForOffer[0]?.glide_row_id ||
    "";
  const [milestoneId, setMilestoneId] = useState(initialMilestoneId);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function handleOfferChange(nextOfferId: string) {
    setOfferId(nextOfferId);
    const firstMilestone = offerMilestones
      .filter((milestone) => milestone.offer_id === nextOfferId)
      .sort((a, b) => milestoneSortValue(a) - milestoneSortValue(b))[0];
    setMilestoneId(firstMilestone?.glide_row_id ?? "");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveError(null);

    const { data, error } = await supabase.functions.invoke(
      "manage-client-milestone",
      {
        body: {
          action: "set_pathway",
          clientLegacyId: client.glide_row_id,
          offerId,
          milestoneId,
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
    if (data?.client && data?.clientMilestone) {
      onSaved(
        mapAppClientRow(data.client as Record<string, unknown>),
        data.clientMilestone as ClientMilestoneRow,
        (data.event as ClientHistoryEventRow | undefined) ?? null,
      );
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close pathway change"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 cursor-pointer"
      />
      <div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Change Pathway
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Directors and Super Admins can change the active offer and
              milestone.
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
          <div className="space-y-4 px-5 py-5">
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Offer / Pathway
              </span>
              <select
                value={offerId}
                onChange={(event) => handleOfferChange(event.target.value)}
                required
                disabled={saving}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
              >
                {offers.map((offer) => (
                  <option key={offer.glide_row_id} value={offer.glide_row_id}>
                    {offer.name ?? offer.glide_row_id}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Current Milestone
              </span>
              <select
                value={milestoneId}
                onChange={(event) => setMilestoneId(event.target.value)}
                required
                disabled={saving}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
              >
                {milestonesForOffer.map((milestone) => (
                  <option
                    key={milestone.glide_row_id ?? milestone.name ?? "milestone"}
                    value={milestone.glide_row_id ?? ""}
                  >
                    {displayValue(milestone.name, relationLookup)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Notes
              </span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                disabled={saving}
                placeholder="Optional context for history"
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 disabled:bg-gray-50"
              />
            </label>
            {saveError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
              disabled={saving || !offerId || !milestoneId}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Saving..." : "Save Pathway"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FieldGrid({
  fields,
  client,
  programChoices,
  relationLookup,
}: {
  fields: [string, string[]][];
  client: ClientRow;
  programChoices: ProgramChoice[];
  relationLookup?: Map<string, string>;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {fields.map(([label, candidates]) => (
        <div
          key={label}
          className="rounded-md border border-[#e4e9f0] bg-[#f7f9fc] px-4 py-4"
        >
          <div className="text-[11px] font-semibold uppercase text-[#586273]">
            {label}
          </div>
          <div className="mt-2 text-sm font-medium text-[#162b3e]">
            {label === "Status" ? (
              <ProgramStatusPill
                value={String(valueFrom(client, candidates) ?? "")}
                choices={programChoices}
              />
            ) : label === "Date Onboarded" ||
              label === "Last Contact" ||
              label === "Next Contact" ? (
              formatDate(valueFrom(client, candidates))
            ) : label === "Client Age" ? (
              formatClientAge(
                valueFrom(client, candidates),
                isOffboardedStatus(
                  valueFrom(client, ["program_status_value"]),
                  programChoices,
                )
                  ? valueFrom(client, offboardedDateCandidates) || false
                  : null,
              )
            ) : isOutcomeField(label) ? (
              <OutcomePill value={valueFrom(client, candidates)} />
            ) : isRichField(label) ? (
              <RichValue
                value={displayValue(valueFrom(client, candidates), relationLookup)}
              />
            ) : (
              displayValue(valueFrom(client, candidates), relationLookup)
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ContractField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-gray-900">{value}</div>
    </div>
  );
}

function ContractCard({
  title,
  contract,
  isLatest,
  canManage,
  onEdit,
  onArchive,
}: {
  title: string;
  contract: Record<string, unknown>;
  isLatest?: boolean;
  canManage?: boolean;
  onEdit?: (contract: ContractRow) => void;
  onArchive?: (contract: ContractRow) => void;
}) {
  const referenceLink = valueFrom(contract, [
    "reference_link",
    "current_contract_reference_link",
  ]);
  const notes = valueFrom(contract, ["notes", "current_contract_notes"]);
  const isEditable = canManage && isAppOwnedContract(contract);
  const status = getContractStatus(contract);
  const contractTypeLabel = getContractTypeLabel(contract);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-700">
          {title}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {isLatest && (
            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
              Latest
            </span>
          )}
          {!isEditable && !isAppOwnedContract(contract) ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
              Read-only mirror
            </span>
          ) : null}
          <span
            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
              status === "Active"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : status === "Expired" || status === "Archived"
                  ? "border-slate-200 bg-slate-50 text-slate-700"
                  : "border-gray-200 bg-gray-50 text-gray-600"
            }`}
          >
            {status}
          </span>
          <span className="rounded-full border border-[#cbdff5] bg-[#f2f8fd] px-2 py-0.5 text-xs font-medium text-[#2b79c4]">
            {contractTypeLabel}
          </span>
          {isEditable ? (
            <>
              <button
                type="button"
                onClick={() => onEdit?.(contract as ContractRow)}
                className="rounded-md border border-[#cbdff5] px-3 py-1 text-xs font-semibold text-[#2b79c4] hover:bg-[#f2f8fd] cursor-pointer"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => onArchive?.(contract as ContractRow)}
                className="rounded-md border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 cursor-pointer"
              >
                Archive
              </button>
            </>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <ContractField
          label="Start Date"
          value={formatDate(
            valueFrom(contract, ["start_date", "current_contract_start_date"]),
          )}
        />
        <ContractField label="End Date" value={formatDate(contractEndDate(contract))} />
        <ContractField
          label="Contract Days"
          value={displayValue(
            valueFrom(contract, [
              "current_contract_of_days",
              "contract_days",
              "days",
            ]),
          )}
        />
        <ContractField
          label="Monthly Value"
          value={formatCurrency(
            valueFrom(contract, ["monthly_value", "current_contract_monthly_value"]),
          )}
        />
        <ContractField
          label="Auto Renew"
          value={formatBoolean(
            valueFrom(contract, ["auto_renew", "current_contract_auto_renew"]),
          )}
        />
        <ContractField
          label="Last Modified"
          value={formatDate(valueFrom(contract, ["last_modified_time"]))}
        />
        <ContractField
          label="Last Modified By"
          value={displayValue(valueFrom(contract, ["last_modified_by"]))}
        />
        <ContractField
          label="Reference"
          value={
            typeof referenceLink === "string" && referenceLink.trim() ? (
              <a
                href={referenceLink}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 underline"
              >
                Open link
              </a>
            ) : (
              "--"
            )
          }
        />
      </div>
      {isPresent(notes) && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wider text-gray-500">
            Notes
          </div>
          <div className="mt-1 text-sm font-medium text-gray-900">
            <RichValue value={notes} />
          </div>
        </div>
      )}
    </div>
  );
}

function ContractSection({
  client,
  contracts,
  canCreateContract,
  onCreateContract,
  onEditContract,
  onArchiveContract,
}: {
  client?: ClientRow;
  contracts: ContractRow[];
  canCreateContract: boolean;
  onCreateContract: () => void;
  onEditContract: (contract: ContractRow) => void;
  onArchiveContract: (contract: ContractRow) => void;
}) {
  const [showOlderContracts, setShowOlderContracts] = useState(false);
  const showCurrent = hasCurrentContract(client);
  const [latestLinkedContract, ...olderLinkedContracts] = contracts;
  const clientStatus =
    typeof client?.program_status_value === "string"
      ? client.program_status_value
      : "";
  const currentRenewalDate = contractEndDate((client ?? {}) as Record<string, unknown>);
  const daysUntilRenewal = daysUntilDate(currentRenewalDate);
  const showRenewalPrompt =
    canCreateContract &&
    ["front-end", "back-end"].includes(clientStatus) &&
    daysUntilRenewal !== null &&
    daysUntilRenewal <= 30;
  return (
    <div className="space-y-4">
      {canCreateContract ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCreateContract}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 cursor-pointer"
          >
            + New Contract
          </button>
        </div>
      ) : null}
      {showRenewalPrompt ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-sky-950">
                Contract renewal prompt
              </h2>
              <p className="mt-1 text-sm text-sky-800">
                {daysUntilRenewal !== null && daysUntilRenewal < 0
                  ? `This contract ended ${Math.abs(daysUntilRenewal)} day${
                      Math.abs(daysUntilRenewal) === 1 ? "" : "s"
                    } ago.`
                  : `This contract is up for renewal in ${daysUntilRenewal} day${
                      daysUntilRenewal === 1 ? "" : "s"
                    }.`}{" "}
                Add the next contract and choose a retention outcome to keep Dashboard
                retention clean.
              </p>
            </div>
            <button
              type="button"
              onClick={onCreateContract}
              className="w-fit rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 cursor-pointer"
            >
              Add Renewal Contract
            </button>
          </div>
        </div>
      ) : null}
      {showCurrent && (
        <ContractCard title="Current Contract" contract={client as ClientRow} isLatest />
      )}
      {latestLinkedContract && (
        <ContractCard
          title={showCurrent ? "Latest Linked Contract" : "Linked Contract"}
          contract={latestLinkedContract}
          isLatest={!showCurrent}
          canManage={canCreateContract}
          onEdit={onEditContract}
          onArchive={onArchiveContract}
        />
      )}
      {olderLinkedContracts.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <button
            type="button"
            onClick={() => setShowOlderContracts((open) => !open)}
            className="flex w-full items-center justify-between gap-3 text-left cursor-pointer"
          >
            <span className="text-sm font-semibold uppercase tracking-wider text-gray-700">
              Older Contracts ({olderLinkedContracts.length})
            </span>
            <span className="text-sm font-medium text-indigo-600">
              {showOlderContracts ? "Hide" : "Show"}
            </span>
          </button>
          {showOlderContracts && (
            <div className="mt-4 space-y-4">
              {olderLinkedContracts.map((contract, index) => (
                <ContractCard
                  key={
                    contract.glide_row_id ??
                    `${contract.client_id ?? "contract"}-${index + 1}`
                  }
                  title={`Older Contract ${index + 1}`}
                  contract={contract}
                  canManage={canCreateContract}
                  onEdit={onEditContract}
                  onArchive={onArchiveContract}
                />
              ))}
            </div>
          )}
        </div>
      )}
      {!showCurrent && !latestLinkedContract && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
          No contract rows found for this client.
        </div>
      )}
    </div>
  );
}

function PathwaysSection({
  client,
  offers,
  clientMilestones,
  offerMilestones,
  relationLookup,
  canAdvanceMilestones,
  canManagePathways,
  onStartMilestone,
  onCompleteMilestone,
  onChangePathway,
}: {
  client: ClientRow;
  offers: OfferRow[];
  clientMilestones: ClientMilestoneRow[];
  offerMilestones: OfferMilestoneRow[];
  relationLookup: Map<string, string>;
  canAdvanceMilestones: boolean;
  canManagePathways: boolean;
  onStartMilestone: (progress: ClientMilestoneRow | null) => void;
  onCompleteMilestone: (progress: ClientMilestoneRow | null) => void;
  onChangePathway: () => void;
}) {
  const offerValue = valueFrom(client, [
    "offer_milestones_current_offer_id",
    "offer_milestones_2nd_current_offer_id",
    "offer_id",
    "offer_name",
  ]);
  const rawMilestoneValue = valueFrom(client, [
    "offer_milestones_current_milestone_id",
    "offer_milestones_2nd_current_milestone_id",
    "milestone_id",
    "milestone_name",
  ]);
  const currentOfferMilestones = offerMilestones.filter((milestone) => {
    if (!isPresent(offerValue)) return false;
    return String(milestone.offer_id) === String(offerValue);
  });
  const sortedOfferMilestones = currentOfferMilestones
    .slice()
    .sort((a, b) => milestoneSortValue(a) - milestoneSortValue(b));
  const progressByMilestoneId = new Map(
    clientMilestones
      .filter(
        (milestone) =>
          isPresent(milestone.milestone_id) &&
          (!isPresent(milestone.offer_id) ||
            !isPresent(offerValue) ||
            String(milestone.offer_id) === String(offerValue)),
      )
      .map((milestone) => [String(milestone.milestone_id), milestone]),
  );
  const fallbackMilestone =
    sortedOfferMilestones.find((milestone) => {
      const milestoneId = milestone.glide_row_id;
      if (!isPresent(milestoneId)) return false;
      return !isPresent(
        progressByMilestoneId.get(String(milestoneId))?.completion_date,
      );
    }) ??
    sortedOfferMilestones[0] ??
    null;
  const milestoneValue = isPresent(rawMilestoneValue)
    ? rawMilestoneValue
    : fallbackMilestone?.glide_row_id ?? null;
  const currentProgress =
    clientMilestones.find(
      (milestone) => milestone.milestone_id === milestoneValue,
    ) ??
    (isPresent(offerValue) && isPresent(milestoneValue)
      ? ({
          client_id: client.glide_row_id,
          offer_id: String(offerValue),
          milestone_id: String(milestoneValue),
        } as ClientMilestoneRow)
      : null);
  const currentConfiguredMilestone = sortedOfferMilestones.find(
    (milestone) =>
      isPresent(milestone.glide_row_id) &&
      String(milestone.glide_row_id) === String(milestoneValue),
  );
  const currentConfiguredIndex = currentConfiguredMilestone
    ? sortedOfferMilestones.findIndex(
        (milestone) =>
          String(milestone.glide_row_id ?? "") ===
          String(currentConfiguredMilestone.glide_row_id ?? ""),
      )
    : -1;
  const nextConfiguredMilestone =
    currentConfiguredIndex >= 0
      ? sortedOfferMilestones[currentConfiguredIndex + 1] ?? null
      : null;
  const canShowActions =
    canAdvanceMilestones && isPresent(offerValue) && isPresent(milestoneValue);
  const configuredMilestoneIds = new Set(
    sortedOfferMilestones
      .filter((milestone) => isPresent(milestone.glide_row_id))
      .map((milestone) => String(milestone.glide_row_id)),
  );
  const timelineRows = sortedOfferMilestones.map((milestone) => {
    const milestoneId = milestone.glide_row_id ?? null;
    const progress = milestoneId
      ? progressByMilestoneId.get(String(milestoneId)) ?? null
      : null;
    const isCurrent =
      isPresent(milestoneId) && String(milestoneId) === String(milestoneValue);
    let status = "Not started";
    if (
      isCurrent &&
      isPresent(progress?.completion_date) &&
      (milestone.final_milestone || !nextConfiguredMilestone)
    ) {
      status = "Final completed";
    } else if (isPresent(progress?.completion_date)) status = "Completed";
    else if (isCurrent) status = "Current";
    else if (isPresent(progress?.start_date)) status = "Started";

    return {
      milestone,
      progress,
      isCurrent,
      status,
    };
  });
  const extraProgressRows = clientMilestones
    .filter((milestone) => {
      if (isPresent(milestone.offer_id) && isPresent(offerValue)) {
        if (String(milestone.offer_id) !== String(offerValue)) return false;
      }
      if (!isPresent(milestone.milestone_id)) return false;
      return (
        String(milestone.milestone_id) === String(milestoneValue) ||
        !configuredMilestoneIds.has(String(milestone.milestone_id))
      );
    })
    .map((progress) => ({
      milestone: null,
      progress,
      isCurrent:
        isPresent(progress.milestone_id) &&
        String(progress.milestone_id) === String(milestoneValue),
      status: isPresent(progress.completion_date)
        ? "Completed"
        : isPresent(progress.start_date)
          ? "Started"
          : "Not started",
    }));
  const visibleTimelineRows =
    timelineRows.length > 0 ? timelineRows : extraProgressRows;
  const completedMilestones = clientMilestones
    .filter((milestone) => {
      if (!isPresent(milestone.completion_date)) return false;
      if (!isPresent(milestone.offer_id) || !isPresent(offerValue)) return true;
      return String(milestone.offer_id) === String(offerValue);
    })
    .slice()
    .sort((a, b) => {
      const aDate = dateFromValue(a.completion_date)?.getTime() ?? 0;
      const bDate = dateFromValue(b.completion_date)?.getTime() ?? 0;
      return bDate - aDate;
    });
  const lastCompletedMilestone = completedMilestones[0] ?? null;
  const hasCurrentStarted = isPresent(currentProgress?.start_date);
  const hasCurrentCompleted = isPresent(currentProgress?.completion_date);
  const hasFinalCompleted =
    hasCurrentCompleted &&
    (Boolean(currentConfiguredMilestone?.final_milestone) || !nextConfiguredMilestone);
  const showStartAction = canShowActions && !hasCurrentStarted;
  const showCompleteAction = canShowActions && !hasCurrentCompleted;
  const daysInCurrentMilestone =
    hasCurrentStarted && !hasCurrentCompleted
      ? daysBetweenValues(currentProgress?.start_date, new Date().toISOString())
      : null;

  return (
    <div className="space-y-5 rounded-md border border-[#e4e9f0] bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase text-[#6c7684]">
            Current Pathway
          </div>
          <h2 className="mt-1 text-lg font-semibold text-[#162b3e]">
            {displayValue(offerValue, relationLookup)}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#586273]">
            <span className="font-medium text-[#162b3e]">
              {displayValue(milestoneValue, relationLookup)}
            </span>
            {hasFinalCompleted ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                Final milestone completed
              </span>
            ) : hasCurrentCompleted ? (
              <span>Completed {formatDate(currentProgress?.completion_date)}</span>
            ) : isPresent(currentProgress?.start_date) ? (
              <span>Started {formatDate(currentProgress?.start_date)}</span>
            ) : (
              <span>Not started yet</span>
            )}
            {daysInCurrentMilestone !== null ? (
              <span>{daysInCurrentMilestone} days in milestone</span>
            ) : null}
          </div>
          {lastCompletedMilestone ? (
            <p className="mt-2 text-sm text-[#6c7684]">
              Last completed:{" "}
              <span className="font-medium text-[#162b3e]">
                {displayValue(lastCompletedMilestone.milestone_id, relationLookup)}
              </span>{" "}
              on {formatDate(lastCompletedMilestone.completion_date)}
            </p>
          ) : null}
        </div>
        {(canManagePathways || showStartAction || showCompleteAction) && (
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {showStartAction ? (
              <button
                type="button"
                onClick={() => onStartMilestone(currentProgress)}
                className="retainos-button-secondary cursor-pointer px-4 py-2 text-sm"
              >
                Start Milestone
              </button>
            ) : null}
            {showCompleteAction ? (
              <button
                type="button"
                onClick={() => onCompleteMilestone(currentProgress)}
                className="retainos-button-primary cursor-pointer px-4 py-2 text-sm"
              >
                Complete Milestone
              </button>
            ) : null}
            {canManagePathways && offers.length > 0 ? (
              <button
                type="button"
                onClick={onChangePathway}
                className="retainos-button-secondary cursor-pointer px-4 py-2 text-sm"
              >
                Change Pathway & Milestones
              </button>
            ) : null}
          </div>
        )}
      </div>

      <FieldGrid
        fields={[
          ["Offer", ["offer_milestones_current_offer_id", "offer_id", "offer_name"]],
          ["Milestones", ["offer_milestones_current_milestone_id", "milestone_id"]],
          ["Last Contact", ["csm_date_of_last_contact"]],
          ["Next Contact", ["csm_date_of_next_contact"]],
        ]}
        client={{
          ...client,
          offer_milestones_current_milestone_id: milestoneValue,
        }}
        programChoices={[]}
        relationLookup={relationLookup}
      />

      <div className="rounded-md border border-[#e4e9f0] bg-[#f7f9fc] px-4 py-3">
        <div className="text-[11px] font-semibold uppercase text-[#6c7684]">
          Milestone Timeline
        </div>
        <div className="mt-3 space-y-2">
          {visibleTimelineRows.length > 0 ? (
            visibleTimelineRows.map(({ milestone, progress, isCurrent, status }, index) => {
              const milestoneId = milestone?.glide_row_id ?? progress?.milestone_id;
              const targetDays =
                milestone?.target_days_to_complete_from_onboarding_date;
              const duration =
                progress?.duration_days ??
                daysBetweenValues(progress?.start_date, progress?.completion_date);
              return (
              <div
                key={String(milestoneId ?? `milestone-${index}`)}
                className={`rounded-md border bg-white px-3 py-3 text-sm ${
                  isCurrent ? "border-indigo-200 ring-1 ring-indigo-100" : "border-gray-200"
                }`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="font-medium text-gray-900">
                      {milestone
                        ? displayValue(milestone.name)
                        : displayValue(progress?.milestone_id, relationLookup)}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      Start: {formatDate(progress?.start_date)} · Completed:{" "}
                      {formatDate(progress?.completion_date)}
                      {isPresent(duration) ? ` · Duration ${duration} days` : ""}
                      {isPresent(progress?.time_to_hit_days)
                        ? ` · Time to hit ${progress?.time_to_hit_days} days`
                        : ""}
                      {isPresent(targetDays) ? ` · Target ${targetDays} days` : ""}
                    </div>
                  </div>
                  <span
                    className={`w-fit rounded-full border px-2 py-0.5 text-xs font-medium ${milestoneStatusClasses(status)}`}
                  >
                    {status}
                  </span>
                </div>
              </div>
              );
            })
          ) : (
            <div className="text-sm font-medium text-gray-900">--</div>
          )}
        </div>
      </div>
    </div>
  );
}

function taskStatusClasses(status: unknown) {
  const key = displayValue(status).toLowerCase();
  if (key === "done" || key === "complete" || key === "completed")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (key === "in-progress" || key === "in progress")
    return "border-blue-200 bg-blue-50 text-blue-700";
  if (key === "todo" || key === "to do")
    return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-gray-200 bg-gray-50 text-gray-600";
}

function TaskCard({
  task,
  teamMemberNameById,
}: {
  task: ClientTaskRow;
  teamMemberNameById: Map<string, string>;
}) {
  const assignedTo = task.assigned_to_id
    ? (teamMemberNameById.get(task.assigned_to_id) ?? task.assigned_to_id)
    : "Unassigned";
  const createdBy = task.created_by_id
    ? (teamMemberNameById.get(task.created_by_id) ?? task.created_by_id)
    : "--";

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">
            {displayValue(task.task_name)}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-medium ${taskStatusClasses(task.status_value)}`}
            >
              {displayValue(task.status_value)}
            </span>
            {isPresent(task.priority) && (
              <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700">
                {displayValue(task.priority)}
              </span>
            )}
            {task.recurring_is_recurring === true && (
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                Recurring
              </span>
            )}
          </div>
        </div>
        {typeof task.external_link === "string" && task.external_link.trim() && (
          <a
            href={task.external_link}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-indigo-600 underline"
          >
            Open link
          </a>
        )}
      </div>

      {isPresent(task.task_description) && (
        <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
          <RichValue value={task.task_description} />
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
        <ContractField label="Due" value={formatDate(task.task_due_date)} />
        <ContractField label="Assigned To" value={assignedTo} />
        <ContractField label="Created By" value={createdBy} />
        <ContractField label="Started" value={formatDate(task.start_date)} />
        <ContractField label="Completed" value={formatDate(task.completion_date)} />
        <ContractField
          label="Last Updated"
          value={formatDateTime(task.task_last_updated_date)}
        />
      </div>
    </div>
  );
}

function isClosedTask(task: ClientTaskRow) {
  const status = displayValue(task.status_value).toLowerCase();
  return (
    status === "done" ||
    status === "complete" ||
    status === "completed" ||
    isPresent(task.completion_date) ||
    task.is_manually_archived === true
  );
}

function TasksSection({
  tasks,
  teamMemberNameById,
}: {
  tasks: ClientTaskRow[];
  teamMemberNameById: Map<string, string>;
}) {
  const [showClosedTasks, setShowClosedTasks] = useState(false);
  const openTasks = tasks.filter((task) => !isClosedTask(task));
  const closedTasks = tasks.filter(isClosedTask);

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
        No task rows found for this client.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {(openTasks.length > 0 ? openTasks : closedTasks.slice(0, 1)).map((task) => (
          <TaskCard
            key={task.glide_row_id ?? task.task_name ?? "task"}
            task={task}
            teamMemberNameById={teamMemberNameById}
          />
        ))}
      </div>
      {closedTasks.length > (openTasks.length > 0 ? 0 : 1) && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <button
            type="button"
            onClick={() => setShowClosedTasks((open) => !open)}
            className="flex w-full items-center justify-between gap-3 text-left cursor-pointer"
          >
            <span className="text-sm font-semibold uppercase tracking-wider text-gray-700">
              Closed Tasks ({closedTasks.length - (openTasks.length > 0 ? 0 : 1)})
            </span>
            <span className="text-sm font-medium text-indigo-600">
              {showClosedTasks ? "Hide" : "Show"}
            </span>
          </button>
          {showClosedTasks && (
            <div className="mt-4 space-y-3">
              {closedTasks
                .slice(openTasks.length > 0 ? 0 : 1)
                .map((task) => (
                  <TaskCard
                    key={task.glide_row_id ?? task.task_name ?? "task"}
                    task={task}
                    teamMemberNameById={teamMemberNameById}
                  />
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HistorySection({ events }: { events: ClientHistoryEventRow[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
        No RetainOS history has been saved for this client yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {events.map((event) => (
        <article
          key={event.id}
          className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                {event.title ?? "Quick Update"}
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                {formatDateTime(event.created_at)}
              </p>
            </div>
            <span className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
              RetainOS history
            </span>
          </div>
          {event.notes ? (
            <p className="mt-4 whitespace-pre-wrap text-sm text-gray-800">
              {event.notes}
            </p>
          ) : event.summary ? (
            <p className="mt-4 whitespace-pre-wrap text-sm text-gray-800">
              {event.summary}
            </p>
          ) : null}
          {event.next_steps ? (
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wider text-gray-500">
                Next Steps
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-900">
                {event.next_steps}
              </p>
            </div>
          ) : null}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <ContractField
              label="Last Contact"
              value={formatDate(event.last_contact_at)}
            />
            <ContractField
              label="Next Contact"
              value={formatDate(event.next_contact_at)}
            />
            <ContractField
              label="Success"
              value={event.success_status || "--"}
            />
            <ContractField
              label="Progress"
              value={event.progress_status || "--"}
            />
            <ContractField
              label="Buy In"
              value={event.buy_in_status || "--"}
            />
          </div>
        </article>
      ))}
    </div>
  );
}
export function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();
  const { capabilities, effectiveCompanyId, teamMemberId } = useAccountContext();
  const [client, setClient] = useState<ClientRow | null>(null);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [clientMilestones, setClientMilestones] = useState<ClientMilestoneRow[]>([]);
  const [offerMilestones, setOfferMilestones] = useState<OfferMilestoneRow[]>([]);
  const [tasks, setTasks] = useState<ClientTaskRow[]>([]);
  const [historyEvents, setHistoryEvents] = useState<ClientHistoryEventRow[]>([]);
  const [programChoices, setProgramChoices] = useState<ProgramChoice[]>([]);
  const [outcomeChoices, setOutcomeChoices] = useState<OutcomeChoiceSets>({
    success: [],
    progress: [],
    buyIn: [],
  });
  const [relationLookup, setRelationLookup] = useState(new Map<string, string>());
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("details");
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingOutcomes, setEditingOutcomes] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [creatingContract, setCreatingContract] = useState(false);
  const [editingContract, setEditingContract] = useState<ContractRow | null>(null);
  const [archivingContractId, setArchivingContractId] = useState<string | null>(null);
  const [isAppOwnedClient, setIsAppOwnedClient] = useState(false);
  const [milestoneAction, setMilestoneAction] = useState<{
    action: "start_milestone" | "complete_milestone";
    progress: ClientMilestoneRow | null;
  } | null>(null);
  const [changingPathway, setChangingPathway] = useState(false);
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    async function loadClient() {
      setLoading(true);
      setError(null);
      const { data: appClient, error: appClientError } = await supabase
        .from("clients")
        .select("*")
        .eq("glide_row_id", clientId)
        .maybeSingle();

      let data: Record<string, unknown> | null = appClient
        ? mapAppClientRow(appClient as Record<string, unknown>)
        : null;
      let clientError = appClientError;

      if (!data) {
        const backupResult = await supabase
          .from("backup_company_clients")
          .select("*")
          .eq("glide_row_id", clientId)
          .single();
        data = backupResult.data as Record<string, unknown> | null;
        clientError = backupResult.error;
      }

      if (cancelled) return;
      if (clientError) {
        setError(clientError.message);
        setClient(null);
        setIsAppOwnedClient(false);
        setLoading(false);
        return;
      }
      const nextClient = data as ClientRow;
      if (effectiveCompanyId && nextClient.company_id !== effectiveCompanyId) {
        setError("This client is outside your current company access.");
        setClient(null);
        setIsAppOwnedClient(false);
        setLoading(false);
        return;
      }
      if (
        capabilities.canViewOnlyAssignedClients &&
        nextClient.csm_team_member_id !== teamMemberId &&
        nextClient.csm_secondary_assignee_id !== teamMemberId
      ) {
        setError("This client is not assigned to your account.");
        setClient(null);
        setIsAppOwnedClient(false);
        setLoading(false);
        return;
      }
      setClient(nextClient);
      setIsAppOwnedClient(Boolean(appClient));
      const relationIds = pathwayFields.flatMap(([, candidates]) =>
        extractGlideIds(valueFrom(nextClient, candidates)),
      );
      const offerIds = [
        nextClient.offer_milestones_current_offer_id,
        nextClient.offer_milestones_2nd_current_offer_id,
      ].filter((id): id is string => typeof id === "string" && id.trim() !== "");
      const companyGlideRowId =
        typeof nextClient.company_glide_row_id === "string"
          ? nextClient.company_glide_row_id
          : typeof nextClient.company_id === "string"
            ? nextClient.company_id
            : "";
      const { data: appPathwayCompany } = companyGlideRowId
        ? await supabase
            .from("companies")
            .select("id")
            .eq("legacy_glide_row_id", companyGlideRowId)
            .in("migration_status", ["pilot", "migrated"])
            .maybeSingle()
        : { data: null };
      const { data: companyOfferRows } = companyGlideRowId
        ? appPathwayCompany?.id
          ? await supabase
              .from("company_offers")
              .select("*")
              .eq("company_id", appPathwayCompany.id)
              .eq("status", "active")
              .order("name", { ascending: true })
          : await supabase
              .from("backup_company_offers")
              .select("*")
              .eq("company_id", companyGlideRowId)
              .order("name", { ascending: true })
        : { data: [] };
      const companyOfferIds =
        companyOfferRows?.map((offer) => offer.glide_row_id).filter(Boolean) ??
        [];
      const [
        { data: contractRows },
        { data: appContractRows },
        { data: choices },
        { data: outcomeChoiceRows },
        { data: milestoneRows },
        { data: appMilestoneRows },
        { data: offerMilestoneRows },
        { data: taskRows },
        { data: appTaskRows },
        { data: historyRows },
      ] = await Promise.all([
        supabase
          .from("backup_company_clients_contracts")
          .select("*")
          .eq("client_id", nextClient.glide_row_id)
          .order("end_date", { ascending: false, nullsFirst: false }),
        supabase
          .from("client_contracts")
          .select("*")
          .eq("client_id", nextClient.glide_row_id)
          .is("archived_at", null)
          .order("end_date", { ascending: false, nullsFirst: false }),
        supabase
          .from("backup_choices")
          .select("program_value, program_label, program_emoji")
          .not("program_value", "is", null)
          .order("index", { ascending: true }),
        appPathwayCompany?.id
          ? supabase
              .from("company_outcome_definitions")
              .select("outcome_type, value, label, position")
              .eq("company_id", appPathwayCompany.id)
              .eq("status", "active")
              .order("position", { ascending: true })
          : supabase
              .from("backup_choices")
              .select(
                "success_value, success_display, progress_value, progress_display, buy_in_value, buy_in_display",
              )
              .order("index", { ascending: true }),
        supabase
          .from("backup_company_clients_milestones")
          .select("*")
          .eq("client_id", nextClient.glide_row_id)
          .order("start_date", { ascending: false, nullsFirst: false }),
        supabase
          .from("client_milestones")
          .select("*")
          .eq("client_id", nextClient.glide_row_id)
          .order("created_at", { ascending: false }),
        companyOfferIds.length > 0 || offerIds.length > 0
          ? appPathwayCompany?.id
            ? supabase
                .from("company_offer_milestones")
                .select(
                  "*, order:position, target_days_to_complete_from_onboarding_date:target_days_to_complete, ttv_milestone:is_ttv_milestone, final_milestone:is_final_milestone",
                )
                .in("offer_id", companyOfferIds.length > 0 ? companyOfferIds : offerIds)
                .eq("status", "active")
                .order("position", { ascending: true, nullsFirst: false })
            : supabase
                .from("backup_company_offer_milestones")
                .select("*")
                .in("offer_id", companyOfferIds.length > 0 ? companyOfferIds : offerIds)
                .order("order", { ascending: true, nullsFirst: false })
          : Promise.resolve({ data: [] }),
        supabase
          .from("backup_company_clients_tasks")
          .select("*")
          .eq("client_id", nextClient.glide_row_id)
          .order("task_due_date", { ascending: true, nullsFirst: false }),
        supabase
          .from("client_tasks")
          .select("*")
          .eq("client_id", nextClient.glide_row_id)
          .order("task_due_date", { ascending: true, nullsFirst: false }),
        supabase
          .from("client_history_events")
          .select("*")
          .eq("legacy_client_glide_row_id", nextClient.glide_row_id)
          .order("created_at", { ascending: false })
          .limit(25),
      ]);
      if (!cancelled) {
        setContracts([
          ...((appContractRows ?? []) as ContractRow[]),
          ...((contractRows ?? []) as ContractRow[]),
        ]);
        setProgramChoices((choices ?? []) as ProgramChoice[]);
        const nextOutcomeChoices = appPathwayCompany?.id
          ? outcomeChoicesFromDefinitions(
              (outcomeChoiceRows ?? []) as Record<string, unknown>[],
            )
          : outcomeChoicesFromRows(
              (outcomeChoiceRows ?? []) as OutcomeChoiceRow[],
            );
        const hasAppOutcomeChoices =
          nextOutcomeChoices.success.length > 0 ||
          nextOutcomeChoices.progress.length > 0 ||
          nextOutcomeChoices.buyIn.length > 0;
        setOutcomeChoices(
          appPathwayCompany?.id && !hasAppOutcomeChoices
            ? {
                success: [
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                ],
                progress: [
                  { value: "green", label: "Green" },
                  { value: "yellow", label: "Yellow" },
                  { value: "red", label: "Red" },
                ],
                buyIn: [
                  { value: "green", label: "Green" },
                  { value: "yellow", label: "Yellow" },
                  { value: "red", label: "Red" },
                ],
              }
            : nextOutcomeChoices,
        );
        setOffers((companyOfferRows ?? []) as OfferRow[]);
        setClientMilestones([
          ...((appMilestoneRows ?? []) as ClientMilestoneRow[]),
          ...((milestoneRows ?? []) as ClientMilestoneRow[]),
        ]);
        setOfferMilestones((offerMilestoneRows ?? []) as OfferMilestoneRow[]);
        setTasks([
          ...((appTaskRows ?? []) as ClientTaskRow[]),
          ...((taskRows ?? []) as ClientTaskRow[]),
        ]);
        setHistoryEvents((historyRows ?? []) as ClientHistoryEventRow[]);
      }
      const milestoneRelationIds = [
        ...((milestoneRows ?? []) as ClientMilestoneRow[]),
        ...((appMilestoneRows ?? []) as ClientMilestoneRow[]),
      ].flatMap((row) => extractGlideIds(row.milestone_id));
      const lookup = await resolveRelationNames([
        ...relationIds,
        ...milestoneRelationIds,
      ]);
      if (!cancelled) setRelationLookup(lookup);
      if (nextClient.company_id) {
        const { data: appCompany } = await supabase
          .from("companies")
          .select("id")
          .eq("legacy_glide_row_id", nextClient.company_id)
          .in("migration_status", ["pilot", "migrated"])
          .maybeSingle();
        if (appCompany?.id) {
          const { data: appMembers } = await supabase
            .from("company_members")
            .select("id, legacy_glide_row_id, name, status, hide_from_csm_list")
            .eq("company_id", appCompany.id)
            .order("name", { ascending: true });
          if (!cancelled) {
            setTeamMembers(
              (appMembers ?? []).map((member) => ({
                glide_row_id: member.legacy_glide_row_id ?? member.id,
                name: member.name,
                is_archived: member.status === "archived",
                role_hide_from_csm_list: member.hide_from_csm_list,
              })),
            );
          }
        } else {
          const { data: members } = await supabase
            .from("backup_company_team")
            .select("glide_row_id, name, is_archived, role_hide_from_csm_list")
            .eq("company_id", nextClient.company_id)
            .order("name", { ascending: true });
          if (!cancelled) setTeamMembers((members ?? []) as TeamMember[]);
        }
      }
      setLoading(false);
    }
    void loadClient();
    return () => {
      cancelled = true;
    };
  }, [capabilities.canViewOnlyAssignedClients, clientId, effectiveCompanyId, teamMemberId]);
  const csmName = useMemo(() => {
    if (!client?.csm_team_member_id) return "Unassigned";
    return (
      teamMembers.find(
        (member) => member.glide_row_id === client.csm_team_member_id,
      )?.name ?? "Unassigned"
    );
  }, [client, teamMembers]);
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
  const displayLookup = useMemo(() => {
    const next = new Map(relationLookup);
    for (const offer of offers) {
      if (offer.glide_row_id && offer.name) {
        next.set(offer.glide_row_id, offer.name);
      }
    }
    for (const milestone of offerMilestones) {
      if (milestone.glide_row_id && milestone.name) {
        next.set(milestone.glide_row_id, milestone.name);
      }
    }
    return next;
  }, [offers, offerMilestones, relationLookup]);
  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#59abf0]" />
      </div>
    );
  if (error || !client)
    return (
      <div>
        <Link
          to="/clients"
          className="text-sm font-medium text-[#2b79c4] hover:text-[#162b3e]"
        >
          &larr; Back to clients
        </Link>
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error ?? "Client not found"}
        </div>
      </div>
    );
  const visibleProgramFields = capabilities.canViewDirectorNotes
    ? programFields
    : programFields.filter(([label]) => label !== "Director Notes");
  const tabs = [
    { key: "details", label: "Client Details", fields: basicInfoFields },
    { key: "contract", label: "Contract", fields: contractFields },
    { key: "program", label: "Program", fields: visibleProgramFields },
    { key: "outcomes", label: "Outcomes", fields: outcomeFields },
    { key: "pathways", label: "Pathways & Milestones", fields: pathwayFields },
  ];
  const activeFields =
    tabs.find((tab) => tab.key === activeTab)?.fields ?? basicInfoFields;
  const canEditProfile =
    capabilities.canEditClient && isAppOwnedClient;
  const canManageAssignment =
    canEditProfile &&
    capabilities.canViewAllClients &&
    !capabilities.canViewOnlyAssignedClients;
  const canChangeStatus = canEditProfile;
  const canCreateContract = canEditProfile;
  async function archiveContract(contract: ContractRow) {
    if (!client || !contract.glide_row_id || archivingContractId) return;
    const confirmed = window.confirm(
      "Archive this contract? It will be hidden from active contract management but kept in history.",
    );
    if (!confirmed) return;
    setArchivingContractId(contract.glide_row_id);
    const { data, error } = await supabase.functions.invoke(
      "manage-client-contract",
      {
        body: {
          action: "archive",
          clientLegacyId: client.glide_row_id,
          contractId: contract.glide_row_id,
          notes: "Archived from client contract tab.",
        },
      },
    );
    setArchivingContractId(null);
    if (error || data?.error) {
      window.alert(data?.error ?? error?.message ?? "Could not archive contract.");
      return;
    }
    if (data?.client) {
      setClient(mapAppClientRow(data.client as Record<string, unknown>));
    }
    if (data?.contract) {
      const archived = data.contract as ContractRow;
      setContracts((current) =>
        current.filter((row) => row.glide_row_id !== archived.glide_row_id),
      );
    }
    if (data?.event) {
      setHistoryEvents((current) =>
        [data.event as ClientHistoryEventRow, ...current].slice(0, 25),
      );
    }
  }
  const upsertMilestone = (milestone: ClientMilestoneRow) => {
    setClientMilestones((current) => [
      milestone,
      ...current.filter(
        (row) =>
          row.id !== milestone.id &&
          row.glide_row_id !== milestone.glide_row_id &&
          row.milestone_id !== milestone.milestone_id,
      ),
    ]);
  };
  return (
    <div>
      <div className="mb-4">
        <Link
          to="/clients"
          className="text-sm font-medium text-[#2b79c4] hover:text-[#162b3e]"
        >
          &larr; Back to clients
        </Link>
      </div>
      <div className="mb-6 rounded-md border border-[#e4e9f0] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            {client.client_image ? (
              <img
                src={client.client_image}
                alt=""
                className="h-16 w-16 rounded-md border border-[#e4e9f0] bg-[#f7f9fc] object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-md border border-[#d6eafb] bg-[#eaf4fe] text-lg font-semibold text-[#2b79c4]">
                {getInitials(client.client_name)}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold text-[#162b3e]">
                {client.client_name ?? "Unnamed client"}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[#586273]">
                <span>{csmName}</span>
                <span aria-hidden="true">-</span>
                <ProgramStatusPill
                  value={client.program_status_value}
                  choices={programChoices}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {canChangeStatus ? (
              <button
                type="button"
                onClick={() => setChangingStatus(true)}
                className="retainos-button-secondary"
              >
                Change Status
              </button>
            ) : null}
            {canEditProfile ? (
              <button
                type="button"
                onClick={() => setEditingProfile(true)}
                className="retainos-button-primary"
              >
                Edit Profile
              </button>
            ) : null}
            <div
              className={`rounded-md border px-3 py-2 text-sm ${
                canEditProfile
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              {canEditProfile ? "RetainOS pilot data" : "Read-only preview"}
            </div>
          </div>
        </div>
      </div>
      <div className="mb-5 border-b border-[#e4e9f0]">
        <nav
          className="-mb-px flex gap-5 overflow-x-auto"
          aria-label="Client sections"
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors cursor-pointer ${activeTab === tab.key ? "border-[#59abf0] text-[#2b79c4]" : "border-transparent text-[#586273] hover:border-[#cbd2dc] hover:text-[#162b3e]"}`}
            >
              {tab.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setActiveTab("tasks")}
            className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors cursor-pointer ${activeTab === "tasks" ? "border-[#59abf0] text-[#2b79c4]" : "border-transparent text-[#586273] hover:border-[#cbd2dc] hover:text-[#162b3e]"}`}
          >
            Tasks
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors cursor-pointer ${activeTab === "history" ? "border-[#59abf0] text-[#2b79c4]" : "border-transparent text-[#586273] hover:border-[#cbd2dc] hover:text-[#162b3e]"}`}
          >
            History
          </button>
        </nav>
      </div>
      {activeTab === "tasks" ? (
        <TasksSection tasks={tasks} teamMemberNameById={teamMemberNameById} />
      ) : activeTab === "history" ? (
        <HistorySection events={historyEvents} />
      ) : activeTab === "contract" ? (
        <ContractSection
          client={client}
          contracts={contracts}
          canCreateContract={canCreateContract}
          onCreateContract={() => setCreatingContract(true)}
          onEditContract={(contract) => setEditingContract(contract)}
          onArchiveContract={(contract) => void archiveContract(contract)}
        />
      ) : activeTab === "pathways" ? (
        <PathwaysSection
          client={client}
          offers={offers}
          clientMilestones={clientMilestones}
          offerMilestones={offerMilestones}
          relationLookup={displayLookup}
          canAdvanceMilestones={canEditProfile && capabilities.canAdvanceClientMilestones}
          canManagePathways={canEditProfile && capabilities.canManageClientPathways}
          onStartMilestone={(progress) =>
            setMilestoneAction({ action: "start_milestone", progress })
          }
          onCompleteMilestone={(progress) =>
            setMilestoneAction({ action: "complete_milestone", progress })
          }
          onChangePathway={() => setChangingPathway(true)}
        />
      ) : activeTab === "outcomes" ? (
        <div className="rounded-md border border-[#e4e9f0] bg-white p-5 shadow-sm">
          <div className="mb-4">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-700">
                Outcomes
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Update success, progress, and buy-in directly from this tab. Changes
                are saved to RetainOS history.
              </p>
            </div>
          </div>
          <ClientOutcomesInlineEditor
            client={client}
            choices={outcomeChoices}
            canEdit={canEditProfile}
            onSaved={(updatedClient, event) => {
              setClient(updatedClient);
              if (event) {
                setHistoryEvents((current) => [event, ...current].slice(0, 25));
              }
            }}
          />
        </div>
      ) : (
        <div className="rounded-md border border-[#e4e9f0] bg-white p-5 shadow-sm">
          <FieldGrid
            fields={activeFields}
            client={client}
            programChoices={programChoices}
            relationLookup={displayLookup}
          />
        </div>
      )}
      {editingProfile ? (
        <ClientProfileEditModal
          client={client}
          teamMembers={teamMembers}
          canManageAssignment={canManageAssignment}
          canEditDirectorNotes={capabilities.canViewDirectorNotes}
          onClose={() => setEditingProfile(false)}
          onSaved={(updatedClient, event) => {
            setClient(updatedClient);
            if (event) {
              setHistoryEvents((current) => [event, ...current].slice(0, 25));
            }
          }}
        />
      ) : null}
      {editingOutcomes ? (
        <ClientOutcomesEditModal
          client={client}
          choices={outcomeChoices}
          onClose={() => setEditingOutcomes(false)}
          onSaved={(updatedClient, event) => {
            setClient(updatedClient);
            if (event) {
              setHistoryEvents((current) => [event, ...current].slice(0, 25));
            }
          }}
        />
      ) : null}
      {changingStatus ? (
        <ClientStatusModal
          client={client}
          programChoices={programChoices}
          onClose={() => setChangingStatus(false)}
          onSaved={(updatedClient, event, updatedContract) => {
            setClient(updatedClient);
            if (updatedContract) {
              setContracts((current) => [
                updatedContract,
                ...current.filter(
                  (contract) => contract.glide_row_id !== updatedContract.glide_row_id,
                ),
              ]);
            }
            if (event) {
              setHistoryEvents((current) => [event, ...current].slice(0, 25));
            }
          }}
        />
      ) : null}
      {creatingContract ? (
        <NewContractModal
          client={client}
          onClose={() => setCreatingContract(false)}
          onSaved={(contract, updatedClient, event, retentionEvent) => {
            setClient(updatedClient);
            setContracts((current) => [contract, ...current]);
            if (event || retentionEvent) {
              setHistoryEvents((current) =>
                [retentionEvent, event, ...current]
                  .filter((row): row is ClientHistoryEventRow => Boolean(row))
                  .slice(0, 25),
              );
            }
          }}
        />
      ) : null}
      {editingContract ? (
        <NewContractModal
          client={client}
          contract={editingContract}
          onClose={() => setEditingContract(null)}
          onSaved={(contract, updatedClient, event) => {
            setClient(updatedClient);
            setContracts((current) => [
              contract,
              ...current.filter((row) => row.glide_row_id !== contract.glide_row_id),
            ]);
            if (event) {
              setHistoryEvents((current) => [event, ...current].slice(0, 25));
            }
          }}
        />
      ) : null}
      {milestoneAction ? (
        <MilestoneActionModal
          client={client}
          action={milestoneAction.action}
          currentMilestoneName={displayValue(
            milestoneAction.progress?.milestone_id ??
              valueFrom(client, [
                "offer_milestones_current_milestone_id",
                "milestone_id",
                "milestone_name",
              ]),
            displayLookup,
          )}
          offerMilestones={offerMilestones}
          relationLookup={displayLookup}
          existingProgress={milestoneAction.progress}
          onClose={() => setMilestoneAction(null)}
          onSaved={(updatedClient, milestone, event) => {
            setClient(updatedClient);
            upsertMilestone(milestone);
            if (event) {
              setHistoryEvents((current) => [event, ...current].slice(0, 25));
            }
          }}
        />
      ) : null}
      {changingPathway ? (
        <PathwayChangeModal
          client={client}
          offers={offers}
          offerMilestones={offerMilestones}
          relationLookup={displayLookup}
          onClose={() => setChangingPathway(false)}
          onSaved={(updatedClient, milestone, event) => {
            setClient(updatedClient);
            upsertMilestone(milestone);
            if (event) {
              setHistoryEvents((current) => [event, ...current].slice(0, 25));
            }
          }}
        />
      ) : null}
    </div>
  );
}
