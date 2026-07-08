import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  getProgramStatusDisplay,
  ProgramStatusPill,
  type ProgramChoice,
} from "../lib/clientDisplay.tsx";
import { useAccountContext } from "../lib/accountContext.tsx";
import {
  applyProgramStatusLabels,
  loadCompanyNotificationPreferences,
  mergeNotificationPreferences,
  normalizeProgramStatusLabels,
  type NotificationPreference,
} from "../lib/companySettings.ts";
import { supabase } from "../lib/supabase.ts";
import { uploadClientImage } from "../lib/clientImageUpload.ts";
import { ClientAdvocacyPanel } from "../components/ClientAdvocacyPanel.tsx";
import {
  buildAdvocacyEventDrafts,
  emptyAdvocacyDrafts,
  type AdvocacyType,
} from "../lib/clientAdvocacy.ts";

const CLIENTS_ROSTER_REFRESH_KEY = "retainos.clientsRosterRefresh.v1";
const clientArchetypeOptions = ["Doer", "Controller", "Worrier", "Follower"] as const;

type ClientRow = Record<string, unknown> & {
  glide_row_id: string;
  client_name?: string | null;
  client_image?: string | null;
  company_id?: string | null;
  company_glide_row_id?: string | null;
  csm_team_member_id?: string | null;
  csm_secondary_assignee_id?: string | null;
  program_status_value?: string | null;
  secondary_offer_milestones_current_offer_id?: string | null;
  secondary_offer_milestones_current_milestone_id?: string | null;
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
type CallAttendanceStatus = "attended" | "missed";
type CallAttendanceCounts = {
  attended: number;
  missed: number;
};
type OutcomeChoiceRow = {
  success_value?: string | null;
  success_display?: string | null;
  progress_value?: string | null;
  progress_display?: string | null;
  buy_in_value?: string | null;
  buy_in_display?: string | null;
};
type CompanyChurnReasonRow = {
  id: string;
  value: string;
  label: string;
  category?: string | null;
  requires_notes?: boolean | null;
  counts_as_churn?: boolean | null;
  position?: number | null;
  status?: string | null;
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
type ContractFilter = "active" | "old" | "archived" | "all";
const CONTRACT_SOURCE_KEY = "__retainos_contract_source";

function normalizeClientArchetype(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "doer") return "Doer";
  if (text === "controller") return "Controller";
  if (text === "worrier") return "Worrier";
  if (text === "follower") return "Follower";
  return "";
}
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
type MilestoneActionKind =
  | "start_milestone"
  | "complete_milestone"
  | "start_secondary_milestone"
  | "complete_secondary_milestone";
type OfferMilestoneRow = Record<string, unknown> & {
  glide_row_id?: string | null;
  offer_id?: string | null;
  name?: string | null;
  order?: number | null;
  target_days_to_complete_from_onboarding_date?: number | null;
  ttv_milestone?: boolean | null;
  final_milestone?: boolean | null;
};
type CurrentPathwayContext = {
  offerId: string;
  milestoneId: string;
  progress: ClientMilestoneRow | null;
};

function isCompleteMilestoneAction(action: MilestoneActionKind) {
  return (
    action === "complete_milestone" ||
    action === "complete_secondary_milestone"
  );
}

function isSecondaryMilestoneAction(action: MilestoneActionKind) {
  return (
    action === "start_secondary_milestone" ||
    action === "complete_secondary_milestone"
  );
}
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
  event_type?: string | null;
  source?: string | null;
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
  metadata?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
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
  is_visible_on_client_detail?: boolean | null;
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
  source_table?: string | null;
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
type ClientLinkRow = {
  id: string;
  label: string;
  url: string;
  link_type: "audit" | "drive" | "supporting_doc" | "other" | string;
  status?: string | null;
  sort_order?: number | null;
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
const nextStepsFieldCandidates =
  programFields.find(([label]) => label === "Next Steps")?.[1] ?? [
    "next_steps_value",
  ];
const CLIENT_DETAIL_RICH_PREVIEW_LIMIT = 320;
const lastContactFieldCandidates = [
  "csm_date_of_last_contact",
  "last_contact",
  "last_contact_date",
  "date_of_last_contact",
  "last_contact_at",
];
const nextContactFieldCandidates = [
  "csm_date_of_next_contact",
  "next_contact",
  "next_contact_date",
  "date_of_next_contact",
  "next_contact_at",
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
    "Pathway",
    [
      "offer_milestones_current_offer_id",
      "secondary_offer_milestones_current_offer_id",
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
      "secondary_offer_milestones_current_milestone_id",
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

function renewalDateConfidence(contract: Record<string, unknown>) {
  const linkedEndDate = valueFrom(contract, ["end_date"]);
  if (isPresent(linkedEndDate)) {
    return {
      value: linkedEndDate,
      sourceLabel: "Linked contract end date",
      confidenceLabel: "High",
    };
  }

  const filteringDate = valueFrom(contract, ["current_contract_end_date_for_filtering"]);
  if (isPresent(filteringDate)) {
    return {
      value: filteringDate,
      sourceLabel: "Client summary filtering date",
      confidenceLabel: "High",
    };
  }

  const explicitEndDate = valueFrom(contract, ["current_contract_end_date"]);
  if (isPresent(explicitEndDate)) {
    return {
      value: explicitEndDate,
      sourceLabel: "Client summary end date",
      confidenceLabel: "High",
    };
  }

  const calculatedEndDate = addDays(
    valueFrom(contract, ["start_date", "current_contract_start_date"]),
    valueFrom(contract, ["current_contract_of_days", "contract_days", "days"]),
  );
  if (isPresent(calculatedEndDate)) {
    return {
      value: calculatedEndDate,
      sourceLabel: "Calculated from start date and days",
      confidenceLabel: "Medium",
    };
  }

  return {
    value: null,
    sourceLabel: "Missing renewal date",
    confidenceLabel: "Missing",
  };
}

function contractSourceLabel(contract: Record<string, unknown>) {
  if (isCurrentSummaryContract(contract)) return "Client current summary";
  if (contract[CONTRACT_SOURCE_KEY] === "app") return "RetainOS contract history";
  if (contract[CONTRACT_SOURCE_KEY] === "mirror") return "CST mirror history";
  if (typeof contract.id === "string") return "RetainOS contract history";
  return "CST mirror history";
}

function isCurrentSummaryContract(contract: Record<string, unknown>) {
  return [
    "current_contract_start_date",
    "current_contract_of_days",
    "current_contract_end_date",
    "current_contract_end_date_for_filtering",
  ].some((key) => isPresent(contract[key]));
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
  return (daysUntilDate(end) ?? 0) >= 0 ? "Active" : "Expired";
}

function contractMatchesFilter(
  contract: Record<string, unknown>,
  filter: ContractFilter,
) {
  if (filter === "all") return true;
  const status = getContractStatus(contract);
  if (filter === "archived") return status === "Archived";
  if (filter === "old") return status === "Expired";
  return status === "Active" || status === "Open";
}

function isAppOwnedContract(contract: Record<string, unknown>) {
  if (contract[CONTRACT_SOURCE_KEY] === "mirror") return false;
  if (contract[CONTRACT_SOURCE_KEY] === "app") return true;
  return (
    typeof contract.id === "string" &&
    typeof contract.glide_row_id === "string" &&
    typeof contract.client_id === "string" &&
    typeof contract.company_id === "string"
  );
}

function withContractSource(contract: ContractRow, source: "app" | "mirror") {
  return { ...contract, [CONTRACT_SOURCE_KEY]: source };
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
  collapsible = false,
  onChange,
}: {
  client: ClientRow;
  fields: CompanyCustomFieldRow[];
  values: ClientCustomFieldValueRow[];
  drafts: CustomFieldDrafts;
  disabled: boolean;
  collapsible?: boolean;
  onChange: (fieldId: string, value: string) => void;
}) {
  const valueByFieldId = new Map(values.map((row) => [row.custom_field_id, row]));
  const [expanded, setExpanded] = useState(false);
  const activeFields = fields
    .filter((field) => field.status !== "archived")
    .sort((a, b) => {
      const positionA = typeof a.position === "number" ? a.position : 9999;
      const positionB = typeof b.position === "number" ? b.position : 9999;
      if (positionA !== positionB) return positionA - positionB;
      return a.label.localeCompare(b.label);
    });

  if (activeFields.length === 0) return null;

  const visibleFields = !collapsible || expanded;
  const filledFieldCount = activeFields.filter((field) => {
    const value =
      drafts[field.id] ??
      customFieldInputValue(field, valueByFieldId.get(field.id), client);
    return value.trim() !== "";
  }).length;
  const heading = (
    <>
      <div>
        <h3 className="text-sm font-semibold text-[#162b3e]">Custom fields</h3>
        <p className="mt-1 text-sm text-[#586273]">
          Update company-specific tracking fields for this client.
        </p>
      </div>
      {collapsible ? (
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-[#d6eafb] bg-white px-2.5 py-1 text-xs font-semibold text-[#2b79c4]">
            {filledFieldCount}/{activeFields.length} filled
          </span>
          <span className="text-xs font-semibold text-[#586273]">
            {expanded ? "Hide fields" : "Show fields"}
          </span>
        </div>
      ) : null}
    </>
  );

  return (
    <section className="rounded-lg border border-[#e4e9f0] bg-[#f8fafc] p-4">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          className="flex w-full flex-col gap-3 text-left sm:flex-row sm:items-center sm:justify-between"
        >
          {heading}
        </button>
      ) : (
        <div className="mb-4">{heading}</div>
      )}
      {visibleFields ? (
        <div
          className={`grid grid-cols-1 gap-4 md:grid-cols-2 ${
            collapsible ? "mt-4" : ""
          }`}
        >
        {activeFields.map((field) => {
          const value =
            drafts[field.id] ??
            customFieldInputValue(field, valueByFieldId.get(field.id), client);
          const commonClass =
            "mt-1 w-full rounded-md border border-[#cbd2dc] bg-white px-3 py-2 text-sm text-[#162b3e] disabled:bg-[#f1f4f8] disabled:text-[#7b8494]";
          return (
            <label key={field.id} className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#586273]">
                {field.label}
              </span>
              {field.field_type === "textarea" ? (
                <textarea
                  value={value}
                  onChange={(event) => onChange(field.id, event.target.value)}
                  disabled={disabled}
                  rows={3}
                  className={commonClass}
                />
              ) : field.field_type === "boolean" ? (
                <select
                  value={value}
                  onChange={(event) => onChange(field.id, event.target.value)}
                  disabled={disabled}
                  className={commonClass}
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
                  className={commonClass}
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
                  className={commonClass}
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
      ) : null}
    </section>
  );
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
function coerceOutcomeChoiceValue(value: string, choices: OutcomeChoice[]) {
  const normalized = normalizeOutcome(value).toLowerCase();
  if (!normalized) return "";
  const match = choices.find(
    (choice) =>
      choice.value.toLowerCase() === normalized ||
      choice.label.toLowerCase() === normalized,
  );
  return match?.value ?? "";
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
function linkifyHtmlUrls(value: string) {
  if (/<a\s/i.test(value)) return value;
  return value.replace(/https?:\/\/[^\s<]+/g, (url) => {
    const trailingMatch = url.match(/[),.;:]+$/);
    const trailing = trailingMatch?.[0] ?? "";
    const href = trailing ? url.slice(0, -trailing.length) : url;
    try {
      const parsed = new URL(href);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return url;
    } catch {
      return url;
    }
    return `<a href="${href}" target="_blank" rel="noreferrer">${href}</a>${trailing}`;
  });
}
function decodeBasicHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'");
}
function plainTextPreviewValue(value: unknown) {
  const text = displayValue(value);
  if (text === "--") return text;
  return decodeBasicHtmlEntities(
    text
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}
function RichValue({ value }: { value: unknown }) {
  const text = displayValue(value);
  if (text === "--") return <>{text}</>;
  const hasHtml = /<\/?[a-z][\s\S]*>/i.test(text);
  const html = linkifyHtmlUrls(
    hasHtml
      ? sanitizeHtml(text)
      : escapeHtml(text)
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br />"),
  );
  return (
    <div
      className="max-w-none text-sm leading-relaxed text-gray-800 [&_a]:text-indigo-600 [&_a]:underline [&_br]:leading-6 [&_li]:ml-4 [&_li]:list-disc [&_ol]:ml-4 [&_ol]:list-decimal [&_p]:mb-2 [&_strong]:font-semibold [&_ul]:ml-4"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
function RichPreviewValue({
  label,
  value,
  previewLimit = CLIENT_DETAIL_RICH_PREVIEW_LIMIT,
}: {
  label: string;
  value: unknown;
  previewLimit?: number;
}) {
  const [showFullValue, setShowFullValue] = useState(false);
  const previewText = plainTextPreviewValue(value);
  const canTruncate =
    previewText !== "--" &&
    previewLimit > 0 &&
    previewText.length > previewLimit;
  const truncatedPreview = canTruncate
    ? `${previewText.slice(0, previewLimit).trimEnd()}...`
    : previewText;
  const titleId = `client-detail-${label.toLowerCase().replace(/\s+/g, "-")}-details`;

  if (!canTruncate) return <RichValue value={value} />;

  return (
    <>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
        {truncatedPreview}
      </p>
      <button
        type="button"
        onClick={() => setShowFullValue(true)}
        className="mt-2 text-xs font-semibold text-[#2b79c4] hover:text-[#162b3e] cursor-pointer"
      >
        Read more
      </button>
      {showFullValue ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label={`Close ${label} details`}
            onClick={() => setShowFullValue(false)}
            className="absolute inset-0 bg-[#0e1b29]/55 backdrop-blur-[2px] cursor-pointer"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[#dbe3ee] bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#e4e9f0] px-5 py-4">
              <div>
                <div className="text-[11px] font-semibold uppercase text-[#2b79c4]">
                  Client detail context
                </div>
                <h3 id={titleId} className="mt-1 text-lg font-semibold text-[#162b3e]">
                  {label}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFullValue(false)}
                className="rounded-md p-1.5 text-[#98a2b3] hover:bg-[#f1f5f9] hover:text-[#162b3e] cursor-pointer"
              >
                <span className="sr-only">Close</span>
                <span className="text-xl leading-none">x</span>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <RichValue value={value} />
            </div>
          </div>
        </div>
      ) : null}
    </>
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

function dateTimeInputValue(value: unknown) {
  if (!isPresent(value)) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

async function loadCallAttendanceCounts(
  companyLegacyId: string,
  clientLegacyId: string,
) {
  if (!companyLegacyId || !clientLegacyId) {
    return { attended: 0, missed: 0 };
  }
  const { data, error } = await supabase
    .from("client_call_attendance_events")
    .select("attendance_status")
    .eq("company_legacy_id", companyLegacyId)
    .eq("client_legacy_id", clientLegacyId);
  if (error) throw error;
  return ((data ?? []) as Array<{ attendance_status?: string | null }>).reduce(
    (counts, row) => {
      if (row.attendance_status === "attended") counts.attended += 1;
      if (row.attendance_status === "missed") counts.missed += 1;
      return counts;
    },
    { attended: 0, missed: 0 },
  );
}

function CallAttendanceControls({
  counts,
  value,
  disabled,
  onChange,
}: {
  counts: CallAttendanceCounts;
  value: CallAttendanceStatus | "";
  disabled: boolean;
  onChange: (value: CallAttendanceStatus | "") => void;
}) {
  const options: Array<{
    value: CallAttendanceStatus;
    label: string;
    className: string;
  }> = [
    {
      value: "attended",
      label: "Attended",
      className:
        "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    },
    {
      value: "missed",
      label: "Missed",
      className: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
    },
  ];
  return (
    <section className="rounded-md border border-gray-200 bg-gray-50 px-3.5 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-gray-500">
            Calls
          </div>
          <p className="mt-1 text-sm font-medium text-gray-900">
            {counts.attended.toLocaleString()} attended |{" "}
            {counts.missed.toLocaleString()} missed
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {options.map((option) => {
            const selected = value === option.value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                onClick={() => onChange(selected ? "" : option.value)}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer ${
                  selected
                    ? option.className
                    : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
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
function clientMilestoneSortTime(row: ClientMilestoneRow) {
  return (
    dateFromValue(row.start_date)?.getTime() ??
    dateFromValue(row.created_at)?.getTime() ??
    dateFromValue(row.completion_date)?.getTime() ??
    0
  );
}
function clientMilestoneLane(row: ClientMilestoneRow) {
  const metadata = row.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "primary";
  }
  const lane = (metadata as Record<string, unknown>).pathway_lane;
  return lane === "secondary" ? "secondary" : "primary";
}
function deriveCurrentPathwayContext(
  client: ClientRow,
  clientMilestones: ClientMilestoneRow[],
  offerMilestones: OfferMilestoneRow[],
): CurrentPathwayContext {
  const activeProgress =
    clientMilestones
      .filter(
        (milestone) =>
          isPresent(milestone.milestone_id) &&
          clientMilestoneLane(milestone) !== "secondary" &&
          !isPresent(milestone.completion_date),
      )
      .slice()
      .sort((a, b) => clientMilestoneSortTime(b) - clientMilestoneSortTime(a))[0] ??
    null;
  const fallbackOfferId = textInputValue(
    valueFrom(client, ["offer_milestones_current_offer_id"]),
  );
  const fallbackMilestoneId = textInputValue(
    valueFrom(client, ["offer_milestones_current_milestone_id"]),
  );
  const activeMilestoneId = textInputValue(activeProgress?.milestone_id);
  const activeMilestoneOfferId =
    offerMilestones.find(
      (milestone) =>
        isPresent(milestone.glide_row_id) &&
        String(milestone.glide_row_id) === String(activeMilestoneId),
    )?.offer_id ?? "";
  const milestoneId = activeMilestoneId || fallbackMilestoneId;
  const offerId =
    textInputValue(activeProgress?.offer_id) ||
    textInputValue(activeMilestoneOfferId) ||
    fallbackOfferId;
  const progress =
    activeProgress ??
    clientMilestones.find(
      (milestone) =>
        clientMilestoneLane(milestone) !== "secondary" &&
        String(milestone.offer_id ?? "") === String(offerId) &&
        String(milestone.milestone_id ?? "") === String(milestoneId),
    ) ??
    null;

  return { offerId, milestoneId, progress };
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

type ProgramTimelineMarkerTone =
  | "purple"
  | "green"
  | "amber"
  | "orange"
  | "gray"
  | "navy";

type ProgramTimelineMarker = {
  key: string;
  label: string;
  day: number;
  tone: ProgramTimelineMarkerTone;
  position?: "top" | "bottom";
  labelLane?: number;
};

const PROGRAM_TIMELINE_OPTIONS = [
  { label: "3-month", days: 90 },
  { label: "6-month", days: 180 },
  { label: "12-month", days: 365 },
  { label: "2-year", days: 730 },
];

const PROGRAM_TIMELINE_TONE_CLASSES: Record<
  ProgramTimelineMarkerTone,
  { dot: string; text: string }
> = {
  purple: { dot: "bg-[#5b54c6]", text: "text-[#5b54c6]" },
  green: { dot: "bg-[#2db585]", text: "text-[#16845f]" },
  amber: { dot: "bg-[#f59e0b]", text: "text-[#b86f00]" },
  orange: { dot: "bg-[#e4572e]", text: "text-[#c2411f]" },
  gray: { dot: "bg-[#b7bbc3]", text: "text-[#8c919b]" },
  navy: { dot: "bg-[#162b3e]", text: "text-[#162b3e]" },
};

function nearestProgramTimelineOption(days: number | null) {
  if (!days || days <= 0) return PROGRAM_TIMELINE_OPTIONS[0];
  return PROGRAM_TIMELINE_OPTIONS.reduce((nearest, option) =>
    Math.abs(option.days - days) < Math.abs(nearest.days - days)
      ? option
      : nearest,
  );
}

function assignProgramTimelineLanes(
  markers: ProgramTimelineMarker[],
  totalDays: number,
) {
  const plannedMarkers = markers
    .filter((marker) => marker.key !== "kickoff" && marker.key !== "program-end")
    .sort((a, b) => a.day - b.day);
  const laneByKey = new Map<string, number>();
  let previousPercent: number | null = null;
  let nextLane = 0;

  for (const marker of plannedMarkers) {
    const percent = (marker.day / totalDays) * 100;
    if (previousPercent !== null && Math.abs(percent - previousPercent) < 7) {
      nextLane = nextLane === 0 ? 1 : 0;
    } else {
      nextLane = 0;
    }
    laneByKey.set(marker.key, nextLane);
    previousPercent = percent;
  }

  return markers.map((marker) => ({
    ...marker,
    labelLane: laneByKey.get(marker.key) ?? 0,
  }));
}

function ProgramTimelineMarkerDot({
  marker,
  totalDays,
}: {
  marker: ProgramTimelineMarker;
  totalDays: number;
}) {
  const tone = PROGRAM_TIMELINE_TONE_CLASSES[marker.tone];
  const percent = Math.max(0, Math.min(100, (marker.day / totalDays) * 100));
  const left = `${percent}%`;
  const edgePosition =
    percent <= 4
      ? "translate-x-0 items-start text-left"
      : percent >= 96
        ? "-translate-x-full items-end text-right"
        : "-translate-x-1/2 items-center text-center";
  const dotPosition =
    percent <= 4
      ? "translate-x-0"
      : percent >= 96
        ? "-translate-x-full"
        : "-translate-x-1/2";
  const labelOffset = marker.labelLane === 1 ? "bottom-11" : "bottom-5";
  const label = (
    <div
      className={`w-32 text-xs font-semibold leading-4 sm:w-36 ${tone.text}`}
    >
      <div>{marker.label}</div>
      <div className="font-medium text-[#6c7684]">Day {marker.day}</div>
    </div>
  );

  return (
    <div
      className="absolute top-0 z-20 -translate-y-1/2"
      style={{ left }}
    >
      <div className={`absolute ${labelOffset} ${edgePosition}`}>{label}</div>
      <div
        className={`h-4 w-4 ${dotPosition} rounded-full border-2 border-white shadow-sm ${tone.dot}`}
      />
    </div>
  );
}

function ClientProfileEditModal({
  client,
  teamMembers,
  canManageAssignment,
  secondaryAssigneeEnabled,
  canEditDirectorNotes,
  onClose,
  onSaved,
}: {
  client: ClientRow;
  teamMembers: TeamMember[];
  canManageAssignment: boolean;
  secondaryAssigneeEnabled: boolean;
  canEditDirectorNotes: boolean;
  onClose: () => void;
  onSaved: (client: ClientRow, event: ClientHistoryEventRow | null) => void;
}) {
  const [clientName, setClientName] = useState(textInputValue(client.client_name));
  const [clientBusiness, setClientBusiness] = useState(
    textInputValue(client.client_business),
  );
  const [clientEmail, setClientEmail] = useState(textInputValue(client.client_email));
  const [clientEmailSecondary, setClientEmailSecondary] = useState(
    textInputValue(client.client_email_secondary),
  );
  const [clientEmailTertiary, setClientEmailTertiary] = useState(
    textInputValue(client.client_email_tertiary),
  );
  const [clientImage, setClientImage] = useState(textInputValue(client.client_image));
  const [clientImageUploading, setClientImageUploading] = useState(false);
  const [clientArchetype, setClientArchetype] = useState(
    normalizeClientArchetype(client.client_archetype_value),
  );
  const [northStar, setNorthStar] = useState(
    textInputValue(valueFrom(client, ["north_star_value"])),
  );
  const [generalInfo, setGeneralInfo] = useState(
    textInputValue(
      valueFrom(client, [
        "client_general_info",
        "client_general_information",
        "general_info",
        "general_information",
      ]),
    ),
  );
  const [directorNotes, setDirectorNotes] = useState(
    textInputValue(valueFrom(client, ["client_director_notes"])),
  );
  const [csmTeamMemberId, setCsmTeamMemberId] = useState(
    client.csm_team_member_id ?? "",
  );
  const [csmSecondaryAssigneeId, setCsmSecondaryAssigneeId] = useState(
    client.csm_secondary_assignee_id ?? "",
  );
  const availableAssignees = teamMembers.filter(
    (member) =>
      member.is_archived !== true && member.role_hide_from_csm_list !== true,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleImageUpload(file: File | null) {
    if (!file) return;
    setClientImageUploading(true);
    setSaveError(null);
    try {
      const publicUrl = await uploadClientImage({
        file,
        companyLegacyId: client.company_glide_row_id ?? client.company_id ?? "",
        clientLegacyId: client.glide_row_id,
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
          clientEmailSecondary,
          clientEmailTertiary,
          clientImage,
          clientArchetype,
          northStar,
          generalInfo,
          directorNotes,
          ...(canManageAssignment
            ? {
                csmTeamMemberId,
                ...(secondaryAssigneeEnabled
                  ? { csmSecondaryAssigneeId }
                  : {}),
              }
            : {}),
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
              Saves client profile changes and history.
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
                  Email 2
                </span>
                <input
                  type="email"
                  value={clientEmailSecondary}
                  onChange={(event) => setClientEmailSecondary(event.target.value)}
                  placeholder="Optional alternate email"
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Email 3
                </span>
                <input
                  type="email"
                  value={clientEmailTertiary}
                  onChange={(event) => setClientEmailTertiary(event.target.value)}
                  placeholder="Optional alternate email"
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
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
                      className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 disabled:opacity-50"
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
                  Archetype
                </span>
                <select
                  value={clientArchetype}
                  onChange={(event) => setClientArchetype(event.target.value)}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                >
                  <option value="">No archetype</option>
                  {clientArchetypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {canManageAssignment ? (
              <div className="grid gap-4 md:grid-cols-2">
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
                {secondaryAssigneeEnabled ? (
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                      Secondary Assignee
                    </span>
                    <select
                      value={csmSecondaryAssigneeId}
                      onChange={(event) =>
                        setCsmSecondaryAssigneeId(event.target.value)
                      }
                      disabled={saving}
                      className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
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
              </div>
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
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                General Information
              </span>
              <textarea
                value={generalInfo}
                onChange={(event) => setGeneralInfo(event.target.value)}
                rows={4}
                placeholder="Evergreen context that is useful for supporting this client."
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
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

function ClientNextStepsModal({
  client,
  latestRecordingUrl,
  onClose,
  onSaved,
}: {
  client: ClientRow;
  latestRecordingUrl?: string | null;
  onClose: () => void;
  onSaved: (client: ClientRow, event: ClientHistoryEventRow | null) => void;
}) {
  const [nextSteps, setNextSteps] = useState(
    textInputValue(valueFrom(client, nextStepsFieldCandidates)),
  );
  const [lastContactAt, setLastContactAt] = useState(
    dateTimeInputValue(valueFrom(client, lastContactFieldCandidates)),
  );
  const [nextContactAt, setNextContactAt] = useState(
    dateInputValue(valueFrom(client, nextContactFieldCandidates)),
  );
  const [callAttendanceCounts, setCallAttendanceCounts] =
    useState<CallAttendanceCounts>({ attended: 0, missed: 0 });
  const [callAttendance, setCallAttendance] = useState<CallAttendanceStatus | "">(
    "",
  );
  const [lastContactTouched, setLastContactTouched] = useState(false);
  const [nextContactTouched, setNextContactTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const companyLegacyId = client.company_glide_row_id ?? client.company_id ?? "";

  useEffect(() => {
    let cancelled = false;
    loadCallAttendanceCounts(companyLegacyId, client.glide_row_id)
      .then((counts) => {
        if (!cancelled) setCallAttendanceCounts(counts);
      })
      .catch((error) => {
        console.error("Failed to load call attendance counts", error);
      });
    return () => {
      cancelled = true;
    };
  }, [companyLegacyId, client.glide_row_id]);

  function handleCallAttendanceChange(value: CallAttendanceStatus | "") {
    setCallAttendance(value);
    if (value === "attended" && !lastContactTouched) {
      setLastContactTouched(true);
      setLastContactAt(dateTimeInputValue(new Date().toISOString()));
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveError(null);

    const { data, error } = await supabase.functions.invoke(
      "manage-client-quick-update",
      {
        body: {
          companyLegacyId,
          clientLegacyId: client.glide_row_id,
          nextSteps,
          ...(lastContactTouched ? { lastContactAt } : {}),
          ...(nextContactTouched ? { nextContactAt } : {}),
          ...(callAttendance ? { callAttendance } : {}),
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
      if (data?.callAttendanceEvent && callAttendance) {
        const savedAttendance = callAttendance;
        setCallAttendanceCounts((current) => ({
          ...current,
          [savedAttendance]: current[savedAttendance] + 1,
        }));
        setCallAttendance("");
      }
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
        aria-label="Close next steps editor"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 cursor-pointer"
      />
      <div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Update Next Steps/Contact
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Saves Program context and contact dates to client history.
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
          <div className="grid grid-cols-1 gap-4 px-5 py-5 sm:grid-cols-3">
            <label className="block sm:col-span-3">
              <span className="mb-1 flex items-center justify-between gap-3 text-xs font-medium uppercase tracking-wider text-gray-500">
                <span>Next Steps</span>
                {latestRecordingUrl ? (
                  <a
                    href={latestRecordingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="normal-case tracking-normal text-[#2b79c4] underline-offset-2 hover:text-[#162b3e] hover:underline"
                  >
                    Open Fathom recording
                  </a>
                ) : null}
              </span>
              <textarea
                value={nextSteps}
                onChange={(event) => setNextSteps(event.target.value)}
                rows={8}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm leading-6 text-gray-900"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Date of Last Contact
              </span>
              <input
                type="datetime-local"
                value={lastContactAt}
                onChange={(event) => {
                  setLastContactTouched(true);
                  setLastContactAt(event.target.value);
                }}
                disabled={saving}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm leading-6 text-gray-900 disabled:bg-gray-50"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Date of Next Contact
              </span>
              <input
                type="date"
                value={nextContactAt}
                onChange={(event) => {
                  setNextContactTouched(true);
                  setNextContactAt(event.target.value);
                }}
                disabled={saving}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm leading-6 text-gray-900 disabled:bg-gray-50"
              />
            </label>
            <CallAttendanceControls
              counts={callAttendanceCounts}
              value={callAttendance}
              disabled={saving}
              onChange={handleCallAttendanceChange}
            />
            {saveError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:col-span-3">
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
              disabled={
                saving ||
                (!nextSteps.trim() &&
                  !lastContactTouched &&
                  !nextContactTouched &&
                  !callAttendance)
              }
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Saving..." : "Save Next Steps/Contact"}
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
  customFields,
  customFieldValues,
  onClose,
  onSaved,
}: {
  client: ClientRow;
  choices: OutcomeChoiceSets;
  customFields: CompanyCustomFieldRow[];
  customFieldValues: ClientCustomFieldValueRow[];
  onClose: () => void;
  onSaved: (
    client: ClientRow,
    event: ClientHistoryEventRow | null,
    customFields: CustomFieldChange[],
  ) => void;
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
  const [customFieldDrafts, setCustomFieldDrafts] = useState<CustomFieldDrafts>(
    () => customFieldDraftsFromValues(customFields, customFieldValues, client),
  );
  const [advocacyDrafts, setAdvocacyDrafts] = useState(emptyAdvocacyDrafts);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => {
    setCustomFieldDrafts(
      customFieldDraftsFromValues(customFields, customFieldValues, client),
    );
  }, [client.glide_row_id, customFieldValues, customFields, client]);

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
          customFields: customFields.map((field) => ({
            id: field.id,
            value: customFieldDrafts[field.id] ?? "",
          })),
          advocacyEvents: buildAdvocacyEventDrafts(advocacyDrafts),
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
        (data.customFields as CustomFieldChange[] | undefined) ?? [],
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

          {customFields.length > 0 ? (
            <div className="mt-4">
              <CustomFieldEditorGrid
                client={client}
                fields={customFields}
                values={customFieldValues}
                drafts={customFieldDrafts}
                disabled={saving}
                onChange={(fieldId, value) =>
                  setCustomFieldDrafts((current) => ({
                    ...current,
                    [fieldId]: value,
                  }))
                }
              />
            </div>
          ) : null}

          <div className="mt-4">
            <ClientAdvocacyPanel
              client={client}
              drafts={advocacyDrafts}
              disabled={saving}
              onChange={(type: AdvocacyType, draft) =>
                setAdvocacyDrafts((current) => ({ ...current, [type]: draft }))
              }
            />
          </div>

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
  customFields,
  customFieldValues,
  onSaved,
}: {
  client: ClientRow;
  choices: OutcomeChoiceSets;
  canEdit: boolean;
  customFields: CompanyCustomFieldRow[];
  customFieldValues: ClientCustomFieldValueRow[];
  onSaved: (
    client: ClientRow,
    event: ClientHistoryEventRow | null,
    customFields: CustomFieldChange[],
  ) => void;
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
  const [successStatus, setSuccessStatus] = useState("");
  const [progressStatus, setProgressStatus] = useState("");
  const [buyInStatus, setBuyInStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [customFieldDrafts, setCustomFieldDrafts] = useState<CustomFieldDrafts>(
    () => customFieldDraftsFromValues(customFields, customFieldValues, client),
  );
  const [advocacyDrafts, setAdvocacyDrafts] = useState(emptyAdvocacyDrafts);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const currentCustomFieldDrafts = useMemo(
    () => customFieldDraftsFromValues(customFields, customFieldValues, client),
    [client, customFieldValues, customFields],
  );
  const savedSuccessStatus = coerceOutcomeChoiceValue(currentSuccess, choices.success);
  const savedProgressStatus = coerceOutcomeChoiceValue(
    currentProgress,
    choices.progress,
  );
  const savedBuyInStatus = coerceOutcomeChoiceValue(currentBuyIn, choices.buyIn);
  const successUpdatedAt = valueFrom(client, ["outcomes_success_date"]);
  const progressUpdatedAt = valueFrom(client, ["outcomes_progress_date"]);
  const buyInUpdatedAt = valueFrom(client, ["outcomes_buy_in_date"]);
  const hasOutcomeChanges =
    successStatus !== "" || progressStatus !== "" || buyInStatus !== "";
  const advocacyEvents = buildAdvocacyEventDrafts(advocacyDrafts);

  useEffect(() => {
    setSuccessStatus("");
    setProgressStatus("");
    setBuyInStatus("");
    setCustomFieldDrafts(currentCustomFieldDrafts);
    setAdvocacyDrafts(emptyAdvocacyDrafts());
    setNotes("");
    setSaveError(null);
  }, [
    client.glide_row_id,
    currentBuyIn,
    currentCustomFieldDrafts,
    currentProgress,
    currentSuccess,
  ]);

  const hasChanges =
    hasOutcomeChanges ||
    advocacyEvents.length > 0 ||
    customFields.some(
      (field) =>
        (customFieldDrafts[field.id] ?? "") !==
        (currentCustomFieldDrafts[field.id] ?? ""),
    ) ||
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
          successStatus: successStatus || savedSuccessStatus,
          progressStatus: progressStatus || savedProgressStatus,
          buyInStatus: buyInStatus || savedBuyInStatus,
          outcomeUpdateTypes: [
            successStatus ? "success" : null,
            progressStatus ? "progress" : null,
            buyInStatus ? "buy_in" : null,
          ].filter(Boolean),
          notes,
          customFields: customFields.map((field) => ({
            id: field.id,
            value: customFieldDrafts[field.id] ?? "",
          })),
          advocacyEvents,
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
        (data.customFields as CustomFieldChange[] | undefined) ?? [],
      );
      setSuccessStatus("");
      setProgressStatus("");
      setBuyInStatus("");
      setAdvocacyDrafts(emptyAdvocacyDrafts());
      setNotes("");
    }
  }

  const renderSelect = (
    label: string,
    value: string,
    currentValue: string,
    updatedAt: unknown,
    options: OutcomeChoice[],
    onChange: (value: string) => void,
  ) => {
    return (
      <label className="block rounded-lg border border-[#e4e9f0] bg-[#f8fafc] p-4">
        <span className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#586273]">
            {label}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#dbe3ee] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#364152]">
            <span>
              Current:{" "}
              {options.find((option) => option.value === currentValue)?.label ??
                "Not set"}
            </span>
            <span className="font-medium text-[#6c7684]">
              {formatDate(updatedAt)}
            </span>
          </span>
        </span>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={!canEdit || saving}
          className="w-full rounded-md border border-[#cbd2dc] bg-white px-3 py-2 text-sm font-medium text-[#162b3e] disabled:bg-[#f1f4f8] disabled:text-[#7b8494]"
        >
          <option value="">No change</option>
          {options.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {renderSelect(
          "Success",
          successStatus,
          savedSuccessStatus,
          successUpdatedAt,
          choices.success,
          setSuccessStatus,
        )}
        {renderSelect(
          "Progress",
          progressStatus,
          savedProgressStatus,
          progressUpdatedAt,
          choices.progress,
          setProgressStatus,
        )}
        {renderSelect(
          "Buy-in",
          buyInStatus,
          savedBuyInStatus,
          buyInUpdatedAt,
          choices.buyIn,
          setBuyInStatus,
        )}
      </div>
      {customFields.length > 0 ? (
        <CustomFieldEditorGrid
          client={client}
          fields={customFields}
          values={customFieldValues}
          drafts={customFieldDrafts}
          disabled={!canEdit || saving}
          collapsible
          onChange={(fieldId, value) =>
            setCustomFieldDrafts((current) => ({
              ...current,
              [fieldId]: value,
            }))
          }
        />
      ) : null}
      <ClientAdvocacyPanel
        client={client}
        drafts={advocacyDrafts}
        disabled={!canEdit || saving}
        onChange={(type: AdvocacyType, draft) =>
          setAdvocacyDrafts((current) => ({ ...current, [type]: draft }))
        }
      />
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
  churnReasons,
  allowStatusChangeRetention,
  onClose,
  onSaved,
}: {
  client: ClientRow;
  programChoices: ProgramChoice[];
  churnReasons: CompanyChurnReasonRow[];
  allowStatusChangeRetention: boolean;
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
  const [offboardedAt, setOffboardedAt] = useState(todayInputValue());
  const [churnReason, setChurnReason] = useState("");
  const [customChurnReason, setCustomChurnReason] = useState("");
  const [goodFit, setGoodFit] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isOffboarding = targetStatus === "off-boarded";
  const sortedChurnReasons = useMemo(
    () =>
      churnReasons
        .filter((item) => item.status !== "archived")
        .slice()
        .sort((a, b) => {
          const byPosition = (a.position ?? 0) - (b.position ?? 0);
          if (byPosition !== 0) return byPosition;
          return a.label.localeCompare(b.label);
        }),
    [churnReasons],
  );
  const selectedChurnReason = sortedChurnReasons.find(
    (item) => item.value === churnReason,
  );
  const contractEndDateValue = valueFrom(client, [
    "current_contract_end_date_for_filtering",
    "current_contract_end_date",
  ]);
  const contractEndDateInput = dateInputValue(contractEndDateValue);
  const actualEndDate = dateFromValue(offboardedAt);
  const contractEndDate = dateFromValue(contractEndDateValue);
  const churned =
    isOffboarding && actualEndDate && contractEndDate
      ? actualEndDate.getTime() < contractEndDate.getTime()
      : null;
  const churnStatusLabel =
    churned === true
      ? "Churned"
      : churned === false
        ? "Completed - did not churn"
        : "Needs review";
  const offboardingReasonValue =
    sortedChurnReasons.length > 0
      ? selectedChurnReason?.value ?? ""
      : customChurnReason.trim();
  const requiresReason = ["paused", "suspended"].includes(targetStatus ?? "");
  const requiresReturnDate = targetStatus === "paused";
  const isReactivation =
    targetStatus === "front-end" || targetStatus === "back-end";
  const isRetentionStatusMove =
    (client.program_status_value === "front-end" && targetStatus === "back-end") ||
    (client.program_status_value === "back-end" && targetStatus === "back-end") ||
    (client.program_status_value === "front-end" && targetStatus === "front-end");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (isOffboarding) {
      if (!offboardedAt) {
        setSaveError("Add the client's actual end date.");
        return;
      }
      if (churned === true && !offboardingReasonValue) {
        setSaveError("Choose the churn reason for this offboarding.");
        return;
      }
      if (churned === true && !notes.trim()) {
        setSaveError("Add churn notes so the team has the context.");
        return;
      }
      if (!goodFit) {
        setSaveError("Choose whether this client was a good fit for the offer.");
        return;
      }
    }
    setSaving(true);
    setSaveError(null);

    const { data, error } = await supabase.functions.invoke(
      "manage-client-status",
      {
        body: {
          clientLegacyId: client.glide_row_id,
          targetStatus,
          reason: isOffboarding
            ? churned === true
              ? selectedChurnReason?.label ?? offboardingReasonValue
              : churned === false
                ? "Completed contract / did not churn"
                : "Offboarded - churn status needs review"
            : reason,
          returnDate,
          offboardedAt: isOffboarding ? offboardedAt : null,
          churnReason: isOffboarding && churned === true ? offboardingReasonValue : null,
          churnReasonLabel:
            isOffboarding && churned === true
              ? selectedChurnReason?.label ?? offboardingReasonValue
              : null,
          goodFit: isOffboarding ? goodFit === "yes" : null,
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
      window.localStorage.setItem(
        CLIENTS_ROSTER_REFRESH_KEY,
        JSON.stringify({
          clientId: client.glide_row_id,
          status: targetStatus,
          updatedAt: Date.now(),
        }),
      );
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
            {isRetentionStatusMove ? (
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                {allowStatusChangeRetention
                  ? "This company allows active status movements to count as retention. Add a Renewal or Upsell contract too if dates or value changed."
                  : "Pair this status change with a new contract marked Renewal or Upsell so retention reporting stays accurate."}
              </div>
            ) : null}
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
            {isOffboarding ? (
              <div className="space-y-4 rounded-md border border-gray-200 bg-gray-50 px-4 py-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                      Actual End Date
                    </span>
                    <input
                      type="date"
                      value={offboardedAt}
                      onChange={(event) => setOffboardedAt(event.target.value)}
                      required
                      disabled={saving}
                      className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
                    />
                  </label>
                  <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm">
                    <span className="block text-xs font-medium uppercase tracking-wider text-gray-500">
                      Contract End
                    </span>
                    <span className="mt-1 block font-medium text-gray-900">
                      {contractEndDateInput
                        ? formatDate(contractEndDateInput)
                        : "No contract end date"}
                    </span>
                  </div>
                </div>
                <div
                  className={`rounded-md border px-4 py-3 text-sm ${
                    churned === true
                      ? "border-red-200 bg-red-50 text-red-800"
                      : churned === false
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-amber-200 bg-amber-50 text-amber-800"
                  }`}
                >
                  RetainOS classification: <strong>{churnStatusLabel}</strong>
                  {churned === null ? (
                    <span className="ml-1">
                      Add or review the contract end date before relying on churn
                      reporting.
                    </span>
                  ) : null}
                </div>
                {churned === true ? (
                  sortedChurnReasons.length > 0 ? (
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                        Churn Reason
                      </span>
                      <select
                        value={churnReason}
                        onChange={(event) => setChurnReason(event.target.value)}
                        required
                        disabled={saving}
                        className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
                      >
                        <option value="">Choose a churn reason</option>
                        {sortedChurnReasons.map((item) => (
                          <option key={item.id} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                        Churn Reason
                      </span>
                      <input
                        type="text"
                        value={customChurnReason}
                        onChange={(event) => setCustomChurnReason(event.target.value)}
                        required
                        disabled={saving}
                        placeholder="Why did the client churn?"
                        className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 disabled:bg-gray-50"
                      />
                    </label>
                  )
                ) : null}
                <fieldset>
                  <legend className="mb-2 block text-xs font-medium uppercase tracking-wider text-gray-500">
                    Good Fit For This Offer?
                  </legend>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ["yes", "Yes"],
                      ["no", "No"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setGoodFit(value)}
                        disabled={saving}
                        className={`rounded-md border px-3 py-2 text-sm font-medium cursor-pointer disabled:opacity-50 ${
                          goodFit === value
                            ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                            : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                    {churned === true ? "Churn Notes" : "Offboarding Notes"}
                  </span>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={3}
                    required={churned === true}
                    disabled={saving}
                    placeholder={
                      churned === true
                        ? "What happened, and what should the team learn from it?"
                        : "Optional final context for history"
                    }
                    className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 disabled:bg-gray-50"
                  />
                </label>
              </div>
            ) : null}
            {isReactivation ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Moving back to Front End or Back End is the reactivation step.
              </div>
            ) : null}
            {!isOffboarding ? (
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
              {saving
                ? "Saving..."
                : isOffboarding
                  ? "Finalize Offboarding"
                  : "Save Status"}
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
                ? "Updates contract history and refreshes the client summary."
                : "Saves contract history and updates the client summary."}
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
                  Expected Duration Days
                </span>
                <input
                  type="number"
                  min="0"
                  value={contractDays}
                  onChange={(event) => setContractDays(event.target.value)}
                  placeholder="Optional"
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Used when no end/renewal date is set. If dates are set, the
                  renewal date wins.
                </p>
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
                Use this when the new contract represents a renewal or upsell.
                The contract start date becomes the retention date for Dashboard
                reporting.
              </p>
              {retentionType !== "none" ? (
                <p className="mt-2 text-xs text-indigo-700">
                  RetainOS will treat this as{" "}
                  {retentionType === "upsell"
                    ? "Front End to Back End"
                    : currentProgramStatus === "back-end"
                      ? "Back End restart"
                      : "Front End restart"}
                  .
                </p>
              ) : null}
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
  action: MilestoneActionKind;
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
  const isComplete = isCompleteMilestoneAction(action);
  const isSecondary = isSecondaryMilestoneAction(action);
  const currentOfferId =
    existingProgress?.offer_id ??
    textInputValue(
      valueFrom(
        client,
        isSecondary
          ? [
              "secondary_offer_milestones_current_offer_id",
              "offer_milestones_2nd_current_offer_id",
            ]
          : ["offer_milestones_current_offer_id"],
      ),
    );
  const currentMilestoneId =
    existingProgress?.milestone_id ??
    textInputValue(
      valueFrom(
        client,
        isSecondary
          ? [
              "secondary_offer_milestones_current_milestone_id",
              "offer_milestones_2nd_current_milestone_id",
            ]
          : ["offer_milestones_current_milestone_id"],
      ),
    );
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
  const startableMilestones = orderedMilestones.filter(
    (milestone) =>
      String(milestone.glide_row_id ?? "") !== String(currentMilestoneId ?? ""),
  );
  const defaultNextStartMilestoneId =
    nextConfiguredMilestone?.glide_row_id ??
    startableMilestones[0]?.glide_row_id ??
    "";
  const [startAnotherMilestone, setStartAnotherMilestone] = useState(false);
  const [nextStartMilestoneId, setNextStartMilestoneId] = useState(
    defaultNextStartMilestoneId,
  );
  const [nextStartDate, setNextStartDate] = useState(completionDate);
  const completesFinalMilestone =
    isComplete &&
    (Boolean(currentConfiguredMilestone?.final_milestone) || !nextConfiguredMilestone);
  const previewDuration = isComplete
    ? daysBetweenValues(startDate, completionDate)
    : null;
  const previewTimeToHit = isComplete
    ? daysBetweenValues(valueFrom(client, ["client_age_date_onboarded"]), completionDate)
    : null;

  useEffect(() => {
    setNextStartMilestoneId((current) => current || defaultNextStartMilestoneId);
  }, [defaultNextStartMilestoneId]);

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
          offerId: currentOfferId,
          milestoneId: currentMilestoneId,
          startDate,
          completionDate: isComplete ? completionDate : undefined,
          notes,
        },
      },
    );

    if (error) {
      setSaving(false);
      setSaveError(error.message);
      return;
    }
    if (data?.error) {
      setSaving(false);
      setSaveError(data.error);
      return;
    }
    if (data?.client && data?.clientMilestone) {
      onSaved(
        mapAppClientRow(data.client as Record<string, unknown>),
        data.clientMilestone as ClientMilestoneRow,
        (data.event as ClientHistoryEventRow | undefined) ?? null,
      );
      if (isComplete && startAnotherMilestone && nextStartMilestoneId) {
        const { data: startData, error: startError } =
          await supabase.functions.invoke("manage-client-milestone", {
            body: {
              action: isSecondary ? "start_secondary_milestone" : "start_milestone",
              clientLegacyId: client.glide_row_id,
              offerId: currentOfferId,
              milestoneId: nextStartMilestoneId,
              startDate: nextStartDate || completionDate,
              notes,
            },
          });
        if (startError) {
          setSaving(false);
          setSaveError(
            `Milestone completed, but RetainOS could not start the next milestone: ${startError.message}`,
          );
          return;
        }
        if (startData?.error) {
          setSaving(false);
          setSaveError(
            `Milestone completed, but RetainOS could not start the next milestone: ${startData.error}`,
          );
          return;
        }
        if (startData?.client && startData?.clientMilestone) {
          onSaved(
            mapAppClientRow(startData.client as Record<string, unknown>),
            startData.clientMilestone as ClientMilestoneRow,
            (startData.event as ClientHistoryEventRow | undefined) ?? null,
          );
        }
      }
      setSaving(false);
      onClose();
      return;
    }
    setSaving(false);
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
              {isComplete
                ? isSecondary
                  ? "Complete Secondary Milestone"
                  : "Complete Milestone"
                : isSecondary
                  ? "Start Secondary Milestone"
                  : "Start Milestone"}
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
                    {isSecondary ? "Completing Secondary" : "Completing"}
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
            {isComplete && startableMilestones.length > 0 ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <label className="flex items-start gap-3 text-sm font-medium text-gray-800">
                  <input
                    type="checkbox"
                    checked={startAnotherMilestone}
                    onChange={(event) => setStartAnotherMilestone(event.target.checked)}
                    disabled={saving}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300"
                  />
                  <span>
                    Start another {isSecondary ? "secondary " : ""}milestone after completing this one
                    <span className="mt-1 block text-xs font-normal text-gray-500">
                      Use the next milestone in line, or choose another active milestone.
                    </span>
                  </span>
                </label>
                {startAnotherMilestone ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                        Milestone To Start
                      </span>
                      <select
                        value={nextStartMilestoneId}
                        onChange={(event) => setNextStartMilestoneId(event.target.value)}
                        required
                        disabled={saving}
                        className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
                      >
                        {startableMilestones.map((milestone) => (
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
                        Start Date
                      </span>
                      <input
                        type="date"
                        value={nextStartDate}
                        onChange={(event) => setNextStartDate(event.target.value)}
                        required
                        disabled={saving}
                        className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
                      />
                    </label>
                  </div>
                ) : null}
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
              {saving
                ? "Saving..."
                : isComplete
                  ? isSecondary
                    ? "Complete Secondary Milestone"
                    : "Complete Milestone"
                  : isSecondary
                    ? "Start Secondary Milestone"
                    : "Start Milestone"}
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
  clientMilestones,
  offerMilestones,
  relationLookup,
  secondaryPathwaysEnabled,
  onClose,
  onSaved,
}: {
  client: ClientRow;
  offers: OfferRow[];
  clientMilestones: ClientMilestoneRow[];
  offerMilestones: OfferMilestoneRow[];
  relationLookup: Map<string, string>;
  secondaryPathwaysEnabled: boolean;
  onClose: () => void;
  onSaved: (
    client: ClientRow,
    milestone: ClientMilestoneRow | null,
    event: ClientHistoryEventRow | null,
  ) => void;
}) {
  const effectiveCurrent = deriveCurrentPathwayContext(
    client,
    clientMilestones,
    offerMilestones,
  );
  const initialOfferId =
    effectiveCurrent.offerId ||
    offers[0]?.glide_row_id ||
    "";
  const [offerId, setOfferId] = useState(initialOfferId);
  const milestonesForOffer = offerMilestones
    .filter((milestone) => milestone.offer_id === offerId)
    .sort((a, b) => milestoneSortValue(a) - milestoneSortValue(b));
  const initialMilestoneId =
    effectiveCurrent.milestoneId ||
    milestonesForOffer[0]?.glide_row_id ||
    "";
  const [milestoneId, setMilestoneId] = useState(initialMilestoneId);
  const initialSecondaryOfferId =
    textInputValue(valueFrom(client, [
      "secondary_offer_milestones_current_offer_id",
      "offer_milestones_2nd_current_offer_id",
    ])) || "";
  const [secondaryOfferId, setSecondaryOfferId] = useState(initialSecondaryOfferId);
  const secondaryMilestonesForOffer = offerMilestones
    .filter((milestone) => milestone.offer_id === secondaryOfferId)
    .sort((a, b) => milestoneSortValue(a) - milestoneSortValue(b));
  const initialSecondaryMilestoneId =
    textInputValue(valueFrom(client, [
      "secondary_offer_milestones_current_milestone_id",
      "offer_milestones_2nd_current_milestone_id",
    ])) || secondaryMilestonesForOffer[0]?.glide_row_id || "";
  const [secondaryMilestoneId, setSecondaryMilestoneId] = useState(
    initialSecondaryMilestoneId,
  );
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const currentOfferId = effectiveCurrent.offerId;
  const currentMilestoneId = effectiveCurrent.milestoneId;
  const currentProgress = effectiveCurrent.progress;
  const currentOfferMilestones = offerMilestones
    .filter((milestone) => String(milestone.offer_id ?? "") === String(currentOfferId))
    .sort((a, b) => milestoneSortValue(a) - milestoneSortValue(b));
  const currentMilestoneIndex = currentOfferMilestones.findIndex(
    (milestone) =>
      String(milestone.glide_row_id ?? "") === String(currentMilestoneId),
  );
  const currentConfiguredMilestone =
    currentMilestoneIndex >= 0 ? currentOfferMilestones[currentMilestoneIndex] : null;
  const nextConfiguredMilestone =
    currentMilestoneIndex >= 0
      ? currentOfferMilestones[currentMilestoneIndex + 1] ?? null
      : null;
  const startableMilestones = currentOfferMilestones.filter(
    (milestone) =>
      String(milestone.glide_row_id ?? "") !== String(currentMilestoneId),
  );
  const defaultNextStartMilestoneId =
    nextConfiguredMilestone?.glide_row_id ??
    startableMilestones[0]?.glide_row_id ??
    "";
  const [completionDate, setCompletionDate] = useState(todayInputValue());
  const [startAnotherMilestone, setStartAnotherMilestone] = useState(false);
  const [nextStartMilestoneId, setNextStartMilestoneId] = useState(
    defaultNextStartMilestoneId,
  );
  const [nextStartDate, setNextStartDate] = useState(todayInputValue());
  const currentOfferName = displayValue(
    currentOfferId,
    relationLookup,
  );
  const currentMilestoneName = displayValue(
    currentMilestoneId,
    relationLookup,
  );
  const hasCurrentMilestone = Boolean(currentOfferId && currentMilestoneId);
  const canCompleteCurrentMilestone =
    hasCurrentMilestone && !isPresent(currentProgress?.completion_date);

  useEffect(() => {
    setNextStartMilestoneId((current) => current || defaultNextStartMilestoneId);
  }, [defaultNextStartMilestoneId]);

  function handleOfferChange(nextOfferId: string) {
    setOfferId(nextOfferId);
    const firstMilestone = offerMilestones
      .filter((milestone) => milestone.offer_id === nextOfferId)
      .sort((a, b) => milestoneSortValue(a) - milestoneSortValue(b))[0];
    setMilestoneId(firstMilestone?.glide_row_id ?? "");
  }

  function handleSecondaryOfferChange(nextOfferId: string) {
    setSecondaryOfferId(nextOfferId);
    const firstMilestone = offerMilestones
      .filter((milestone) => milestone.offer_id === nextOfferId)
      .sort((a, b) => milestoneSortValue(a) - milestoneSortValue(b))[0];
    setSecondaryMilestoneId(firstMilestone?.glide_row_id ?? "");
  }

  async function saveSecondaryPathway() {
    if (saving) return false;
    const hadSecondaryPathway = Boolean(
      textInputValue(valueFrom(client, [
        "secondary_offer_milestones_current_offer_id",
        "offer_milestones_2nd_current_offer_id",
      ])),
    );
    const initialSecondaryOfferValue = textInputValue(valueFrom(client, [
      "secondary_offer_milestones_current_offer_id",
      "offer_milestones_2nd_current_offer_id",
    ]));
    const initialSecondaryMilestoneValue = textInputValue(valueFrom(client, [
      "secondary_offer_milestones_current_milestone_id",
      "offer_milestones_2nd_current_milestone_id",
    ]));
    const secondaryChanged =
      secondaryOfferId !== initialSecondaryOfferValue ||
      secondaryMilestoneId !== initialSecondaryMilestoneValue;
    if (!secondaryChanged) return true;
    const action =
      secondaryOfferId
        ? "set_secondary_pathway"
        : hadSecondaryPathway
          ? "clear_secondary_pathway"
          : "";
    if (!action) return true;
    const { data, error } = await supabase.functions.invoke(
      "manage-client-milestone",
      {
        body: {
          action,
          clientLegacyId: client.glide_row_id,
          offerId: secondaryOfferId || undefined,
          milestoneId: secondaryMilestoneId || undefined,
          notes,
        },
      },
    );
    if (error) {
      setSaveError(await functionErrorMessage(error));
      return false;
    }
    if (data?.error) {
      setSaveError(data.error);
      return false;
    }
    if (data?.client) {
      onSaved(
        mapAppClientRow(data.client as Record<string, unknown>),
        (data.clientMilestone as ClientMilestoneRow | undefined) ?? null,
        (data.event as ClientHistoryEventRow | undefined) ?? null,
      );
    }
    return true;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    let primarySaved = false;
    const primaryChanged =
      offerId !== currentOfferId || milestoneId !== currentMilestoneId;

    if (primaryChanged) {
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

      if (error) {
        setSaving(false);
        setSaveError(await functionErrorMessage(error));
        return;
      }
      if (data?.error) {
        setSaving(false);
        setSaveError(data.error);
        return;
      }
      if (data?.client && data?.clientMilestone) {
        primarySaved = true;
        onSaved(
          mapAppClientRow(data.client as Record<string, unknown>),
          data.clientMilestone as ClientMilestoneRow,
          (data.event as ClientHistoryEventRow | undefined) ?? null,
        );
      }
    }
    if (secondaryPathwaysEnabled) {
      const secondarySaved = await saveSecondaryPathway();
      if (!secondarySaved) {
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    if (primarySaved || secondaryPathwaysEnabled) {
      onClose();
    }
  }

  async function completeCurrentMilestone() {
    if (saving || !canCompleteCurrentMilestone) return;
    setSaving(true);
    setSaveError(null);

    const { data, error } = await supabase.functions.invoke(
      "manage-client-milestone",
      {
        body: {
          action: "complete_milestone",
          clientLegacyId: client.glide_row_id,
          offerId: currentOfferId,
          milestoneId: currentMilestoneId,
          startDate: dateInputValue(currentProgress?.start_date) || todayInputValue(),
          completionDate,
          notes,
        },
      },
    );

    if (error) {
      setSaving(false);
      setSaveError(error.message);
      return;
    }
    if (data?.error) {
      setSaving(false);
      setSaveError(data.error);
      return;
    }
    if (data?.client && data?.clientMilestone) {
      onSaved(
        mapAppClientRow(data.client as Record<string, unknown>),
        data.clientMilestone as ClientMilestoneRow,
        (data.event as ClientHistoryEventRow | undefined) ?? null,
      );
    }

    if (startAnotherMilestone && nextStartMilestoneId) {
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
        setSaving(false);
        setSaveError(
          `Milestone completed, but RetainOS could not start the next milestone: ${startError.message}`,
        );
        return;
      }
      if (startData?.error) {
        setSaving(false);
        setSaveError(
          `Milestone completed, but RetainOS could not start the next milestone: ${startData.error}`,
        );
        return;
      }
      if (startData?.client && startData?.clientMilestone) {
        onSaved(
          mapAppClientRow(startData.client as Record<string, unknown>),
          startData.clientMilestone as ClientMilestoneRow,
          (startData.event as ClientHistoryEventRow | undefined) ?? null,
        );
      }
    }

    setSaving(false);
    onClose();
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
              Change Pathway & Milestones
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Directors and Super Admins can change the active pathway and
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
                      {hasCurrentMilestone
                        ? `${currentOfferName || "Current pathway"} / ${displayValue(
                            currentConfiguredMilestone?.name ?? currentMilestoneName,
                            relationLookup,
                          )}`
                        : "No current milestone is configured for this client."}
                    </p>
                    {hasCurrentMilestone ? (
                      <p className="mt-1 text-xs text-[#6c7684]">
                        Next state:{" "}
                        {nextConfiguredMilestone
                          ? displayValue(nextConfiguredMilestone.name, relationLookup)
                          : "Final milestone completed"}
                      </p>
                    ) : null}
                  </div>
                  {hasCurrentMilestone ? (
                    <label className="block min-w-[180px]">
                      <span className="retainos-field-label">Completion Date</span>
                      <input
                        type="date"
                        value={completionDate}
                        onChange={(event) => {
                          setCompletionDate(event.target.value);
                          setNextStartDate((current) => current || event.target.value);
                        }}
                        disabled={saving || !canCompleteCurrentMilestone}
                        className="retainos-input"
                      />
                    </label>
                  ) : null}
                </div>
                {hasCurrentMilestone && startableMilestones.length > 0 ? (
                  <div className="rounded-lg border border-[#e4e9f0] bg-[#f7f9fc] px-4 py-3">
                    <label className="flex items-start gap-3 text-sm font-semibold text-[#364152]">
                      <input
                        type="checkbox"
                        checked={startAnotherMilestone}
                        onChange={(event) =>
                          setStartAnotherMilestone(event.target.checked)
                        }
                        disabled={saving || !canCompleteCurrentMilestone}
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
                            disabled={saving || !canCompleteCurrentMilestone}
                            className="retainos-input"
                          >
                            {startableMilestones.map((milestone) => (
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
                          <span className="retainos-field-label">Start Date</span>
                          <input
                            type="date"
                            value={nextStartDate}
                            onChange={(event) => setNextStartDate(event.target.value)}
                            disabled={saving || !canCompleteCurrentMilestone}
                            className="retainos-input"
                          />
                        </label>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {hasCurrentMilestone ? (
                  <button
                    type="button"
                    onClick={() => void completeCurrentMilestone()}
                    disabled={
                      saving || !completionDate || !canCompleteCurrentMilestone
                    }
                    className="rounded-full border border-[#34b389] bg-[#e7f6f0] px-4 py-2 text-sm font-semibold text-[#2a9272] hover:bg-white disabled:opacity-50 cursor-pointer"
                  >
                    {saving
                      ? "Completing..."
                      : canCompleteCurrentMilestone
                        ? "Complete current milestone"
                        : "Current milestone completed"}
                  </button>
                ) : null}
              </div>
            </section>
            <div className="border-t border-[#e4e9f0] pt-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#586273]">
                Change active pathway
              </div>
              <p className="mt-1 text-sm text-[#6c7684]">
                Use this only when the client should move to a different pathway or
                active milestone.
              </p>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Pathway
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
            {secondaryPathwaysEnabled ? (
              <div className="rounded-lg border border-[#e4e9f0] bg-[#f7f9fc] px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#586273]">
                  Secondary pathway
                </div>
                <p className="mt-1 text-sm text-[#6c7684]">
                  Optional add-on, call track, or parallel deliverable.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                      Pathway
                    </span>
                    <select
                      value={secondaryOfferId}
                      onChange={(event) =>
                        handleSecondaryOfferChange(event.target.value)
                      }
                      disabled={saving}
                      className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
                    >
                      <option value="">No secondary pathway</option>
                      {offers.map((offer) => (
                        <option key={offer.glide_row_id} value={offer.glide_row_id}>
                          {offer.name ?? offer.glide_row_id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                      Milestone
                    </span>
                    <select
                      value={secondaryMilestoneId}
                      onChange={(event) => setSecondaryMilestoneId(event.target.value)}
                      disabled={saving || !secondaryOfferId}
                      className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
                    >
                      <option value="">
                        {secondaryOfferId && secondaryMilestonesForOffer.length === 0
                          ? "No milestones for this pathway"
                          : "Choose milestone"}
                      </option>
                      {secondaryMilestonesForOffer.map((milestone) => (
                        <option
                          key={milestone.glide_row_id ?? milestone.name ?? "milestone"}
                          value={milestone.glide_row_id ?? ""}
                        >
                          {displayValue(milestone.name, relationLookup)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
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
  latestRecordingUrl,
  canEditNorthStar = false,
  onEditNorthStar,
}: {
  fields: [string, string[]][];
  client: ClientRow;
  programChoices: ProgramChoice[];
  relationLookup?: Map<string, string>;
  latestRecordingUrl?: string | null;
  canEditNorthStar?: boolean;
  onEditNorthStar?: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {fields.map(([label, candidates]) => (
        <div
          key={label}
          className="rounded-md border border-[#e4e9f0] bg-[#f7f9fc] px-4 py-4"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] font-semibold uppercase text-[#586273]">
              {label}
            </div>
            {label === "North Star" && canEditNorthStar && onEditNorthStar ? (
              <button
                type="button"
                onClick={onEditNorthStar}
                className="rounded-full border border-[#cbd2dc] bg-white px-2.5 py-1 text-xs font-semibold text-[#364152] hover:border-[#3b82f6] hover:text-[#1d4ed8] cursor-pointer"
              >
                Edit
              </button>
            ) : null}
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
              label === "Next Steps" ? (
                <>
                  <RichPreviewValue
                    label={label}
                    value={displayValue(valueFrom(client, candidates), relationLookup)}
                  />
                  {latestRecordingUrl ? (
                    <a
                      href={latestRecordingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex w-fit rounded-full border border-[#b9dcfa] bg-white px-3 py-1 text-xs font-semibold text-[#2b79c4] transition hover:border-[#59abf0] hover:text-[#162b3e]"
                    >
                      Open Fathom recording
                    </a>
                  ) : null}
                </>
              ) : (
                <RichValue
                  value={displayValue(valueFrom(client, candidates), relationLookup)}
                />
              )
            ) : (
              displayValue(valueFrom(client, candidates), relationLookup)
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

type ClientExternalLink = {
  key: string;
  label: string;
  url: string;
  description: string;
};

function firstUrlFrom(client: ClientRow, candidates: string[]) {
  const value = valueFrom(client, candidates);
  if (!isPresent(value)) return null;
  const text = String(value).trim();
  const match = text.match(/https?:\/\/[^\s<>"')]+/i);
  if (!match) return null;
  return match[0].replace(/[.,;:]+$/, "");
}

function getClientExternalLinks(client: ClientRow): ClientExternalLink[] {
  const definitions: Array<Omit<ClientExternalLink, "url"> & { candidates: string[] }> = [
    {
      key: "audits",
      label: "Audits",
      description: "Audit, diagnostic, or review document.",
      candidates: [
        "audit_link",
        "audits_link",
        "audit_url",
        "audits_url",
        "audit_folder",
        "audits_folder",
        "audit_drive_folder",
        "client_audit_link",
        "client_audits_link",
        "diagnostics_link",
        "diagnostic_link",
        "diagnostics_url",
        "diagnostic_url",
        "diagnostics_folder",
        "diagnostic_folder",
        "client_diagnostics_link",
      ],
    },
    {
      key: "drive",
      label: "Google Drive",
      description: "Client folder, assets, or shared workspace.",
      candidates: [
        "google_drive_folder",
        "google_drive_url",
        "google_drive_link",
        "drive_folder",
        "drive_folder_url",
        "drive_folder_link",
        "drive_link",
        "folder_url",
        "client_drive_folder",
        "client_drive_link",
        "client_folder",
      ],
    },
    {
      key: "workspace",
      label: "External Link",
      description: "Other operational link for this client.",
      candidates: [
        "external_link",
        "client_link",
        "notes_link",
        "document_link",
        "supporting_doc_link",
        "supporting_docs_link",
        "supporting_document_link",
        "workspace_link",
        "client_workspace_link",
        "slack_channel_link",
        "folder_link",
        "url",
      ],
    },
  ];

  const seen = new Set<string>();
  return definitions.flatMap((definition) => {
    const url = firstUrlFrom(client, definition.candidates);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [
      {
        key: definition.key,
        label: definition.label,
        description: definition.description,
        url,
      },
    ];
  });
}

function ClientExternalLinksSection({ client }: { client: ClientRow }) {
  const { capabilities } = useAccountContext();
  const detectedLinks = getClientExternalLinks(client);
  const [appLinks, setAppLinks] = useState<ClientLinkRow[]>([]);
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkType, setLinkType] = useState("supporting_doc");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isSavingLink, setIsSavingLink] = useState(false);
  const clientLegacyId =
    typeof client.glide_row_id === "string" ? client.glide_row_id : "";
  const isAppOwnedClient =
    Boolean(clientLegacyId) &&
    typeof client.id === "string" &&
    typeof client.company_glide_row_id === "string";
  const canManageLinks =
    isAppOwnedClient && capabilities.canEditClient && Boolean(clientLegacyId);

  useEffect(() => {
    if (!clientLegacyId || !isAppOwnedClient) {
      setAppLinks([]);
      return;
    }

    let cancelled = false;
    async function loadLinks() {
      setIsLoadingLinks(true);
      const { data, error } = await supabase
        .from("client_links")
        .select("id, label, url, link_type, status, sort_order")
        .eq("legacy_client_glide_row_id", clientLegacyId)
        .eq("status", "active")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error("Failed to load client links:", error);
        setAppLinks([]);
      } else {
        setAppLinks((data ?? []) as ClientLinkRow[]);
      }
      setIsLoadingLinks(false);
    }

    loadLinks();
    return () => {
      cancelled = true;
    };
  }, [clientLegacyId, isAppOwnedClient]);

  async function addClientLink(event: FormEvent) {
    event.preventDefault();
    if (!canManageLinks) return;
    setLinkError(null);
    setIsSavingLink(true);
    const { data, error } = await supabase.functions.invoke("manage-client-link", {
      body: {
        action: "create",
        clientLegacyId,
        label: linkLabel,
        url: linkUrl,
        linkType,
      },
    });
    setIsSavingLink(false);
    if (error || data?.error) {
      setLinkError(data?.error ?? error?.message ?? "Unable to add link.");
      return;
    }
    if (data?.item) {
      setAppLinks((links) => [...links, data.item as ClientLinkRow]);
      setLinkLabel("");
      setLinkUrl("");
      setLinkType("supporting_doc");
    }
  }

  async function archiveClientLink(link: ClientLinkRow) {
    if (!canManageLinks) return;
    setLinkError(null);
    const { data, error } = await supabase.functions.invoke("manage-client-link", {
      body: {
        action: "archive",
        clientLegacyId,
        linkId: link.id,
      },
    });
    if (error || data?.error) {
      setLinkError(data?.error ?? error?.message ?? "Unable to archive link.");
      return;
    }
    setAppLinks((links) => links.filter((item) => item.id !== link.id));
  }

  const links = [
    ...appLinks.map((link) => ({
      key: link.id,
      label: link.label,
      description:
        link.link_type === "audit"
          ? "Audit or diagnostic workspace."
          : link.link_type === "drive"
            ? "Client Drive folder."
            : "Supporting operational document.",
      url: link.url,
      source: "app" as const,
      appLink: link,
    })),
    ...detectedLinks.map((link) => ({
      ...link,
      source: "detected" as const,
      appLink: null,
    })),
  ];

  return (
    <div className="mt-5 rounded-md border border-[#e4e9f0] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#586273]">
            Client Links
          </h2>
          <p className="mt-1 text-sm text-[#6b7686]">
            Operational URLs such as audits, Drive folders, and supporting docs.
          </p>
        </div>
        <span className="rounded-full border border-[#e4e9f0] bg-[#f7f9fc] px-3 py-1 text-xs font-semibold text-[#586273]">
          {canManageLinks ? "RetainOS links" : "Read-only"}
        </span>
      </div>
      {canManageLinks ? (
        <form
          onSubmit={addClientLink}
          className="mt-4 grid gap-3 rounded-lg border border-[#e4e9f0] bg-[#f7f9fc] p-4 lg:grid-cols-[1fr_1.4fr_180px_auto]"
        >
          <input
            value={linkLabel}
            onChange={(event) => setLinkLabel(event.target.value)}
            placeholder="Label"
            className="rounded-md border border-[#d6dde8] bg-white px-3 py-2 text-sm"
          />
          <input
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            placeholder="https://..."
            className="rounded-md border border-[#d6dde8] bg-white px-3 py-2 text-sm"
          />
          <select
            value={linkType}
            onChange={(event) => setLinkType(event.target.value)}
            className="rounded-md border border-[#d6dde8] bg-white px-3 py-2 text-sm"
          >
            <option value="supporting_doc">Supporting doc</option>
            <option value="audit">Audit</option>
            <option value="drive">Drive folder</option>
            <option value="other">Other</option>
          </select>
          <button
            type="submit"
            disabled={isSavingLink}
            className="rounded-md bg-[#59abf0] px-4 py-2 text-sm font-semibold text-[#162b3e] disabled:opacity-50"
          >
            {isSavingLink ? "Adding..." : "Add link"}
          </button>
        </form>
      ) : null}
      {linkError ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {linkError}
        </div>
      ) : null}
      {links.length > 0 ? (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {links.map((link) => (
            <div
              key={`${link.key}-${link.url}`}
              className="retainos-focus rounded-lg border border-[#d6eafb] bg-[#f7fbff] p-4 text-sm transition hover:border-[#59abf0] hover:bg-white"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="font-semibold text-[#162b3e]">{link.label}</div>
                {link.source === "app" && canManageLinks ? (
                  <button
                    type="button"
                    onClick={() => archiveClientLink(link.appLink)}
                    className="text-xs font-semibold text-[#ba2532]"
                  >
                    Archive
                  </button>
                ) : null}
              </div>
              <p className="mt-1 text-xs leading-5 text-[#6b7686]">
                {link.description}
              </p>
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 block truncate text-xs font-semibold text-[#2b79c4]"
              >
                Open link
              </a>
            </div>
          ))}
        </div>
      ) : isLoadingLinks ? (
        <div className="mt-4 rounded-lg border border-dashed border-[#cbd2dc] bg-[#f7f9fc] px-4 py-5 text-sm text-[#6b7686]">
          Loading client links...
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-[#cbd2dc] bg-[#f7f9fc] px-4 py-5 text-sm text-[#6b7686]">
          No client-level links found yet. Add audit, Drive, or supporting-document
          URLs as part of the company migration mapping.
        </div>
      )}
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
  canDelete,
  onEdit,
  onArchive,
  onDelete,
}: {
  title: string;
  contract: Record<string, unknown>;
  isLatest?: boolean;
  canManage?: boolean;
  canDelete?: boolean;
  onEdit?: (contract: ContractRow) => void;
  onArchive?: (contract: ContractRow) => void;
  onDelete?: (contract: ContractRow) => void;
}) {
  const referenceLink = valueFrom(contract, [
    "reference_link",
    "current_contract_reference_link",
  ]);
  const notes = valueFrom(contract, ["notes", "current_contract_notes"]);
  const isEditable = canManage && isAppOwnedContract(contract);
  const isCurrentSummary = isCurrentSummaryContract(contract);
  const status = getContractStatus(contract);
  const isArchived = status === "Archived";
  const renewalDate = renewalDateConfidence(contract);

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
          {!isEditable && !isAppOwnedContract(contract) && !isCurrentSummary ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
              Read-only mirror
            </span>
          ) : null}
          <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">
            {contractSourceLabel(contract)}
          </span>
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
          {isEditable && !isArchived ? (
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
          {canDelete && isAppOwnedContract(contract) ? (
            <button
              type="button"
              onClick={() => onDelete?.(contract as ContractRow)}
              className="rounded-md border border-red-300 px-3 py-1 text-xs font-semibold text-red-800 hover:bg-red-50 cursor-pointer"
            >
              Delete
            </button>
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
          label="Renewal Source"
          value={`${renewalDate.sourceLabel} (${renewalDate.confidenceLabel})`}
        />
        <ContractField
          label="Expected Duration Days"
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
  canDeleteContract,
  onCreateContract,
  onEditContract,
  onArchiveContract,
  onDeleteContract,
}: {
  client?: ClientRow;
  contracts: ContractRow[];
  canCreateContract: boolean;
  canDeleteContract: boolean;
  onCreateContract: () => void;
  onEditContract: (contract: ContractRow) => void;
  onArchiveContract: (contract: ContractRow) => void;
  onDeleteContract: (contract: ContractRow) => void;
}) {
  const [showOlderContracts, setShowOlderContracts] = useState(false);
  const [contractFilter, setContractFilter] = useState<ContractFilter>("active");
  const showCurrent =
    hasCurrentContract(client) &&
    contractMatchesFilter((client ?? {}) as Record<string, unknown>, contractFilter);
  const filteredContracts = contracts.filter((contract) =>
    contractMatchesFilter(contract, contractFilter),
  );
  const [latestLinkedContract, ...olderLinkedContracts] = filteredContracts;
  const showCurrentSummary = showCurrent && filteredContracts.length === 0;
  const filterOptions: { value: ContractFilter; label: string }[] = [
    { value: "active", label: "Active" },
    { value: "old", label: "Old" },
    { value: "archived", label: "Archived" },
    { value: "all", label: "All" },
  ];
  const clientStatus =
    typeof client?.program_status_value === "string"
      ? client.program_status_value
      : "";
  const currentRenewalDate = renewalDateConfidence(
    (client ?? {}) as Record<string, unknown>,
  ).value;
  const daysUntilRenewal = daysUntilDate(currentRenewalDate);
  const showRenewalPrompt =
    canCreateContract &&
    ["front-end", "back-end"].includes(clientStatus) &&
    daysUntilRenewal !== null &&
    daysUntilRenewal <= 30;
  return (
    <div className="space-y-4">
      {canCreateContract ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setContractFilter(option.value);
                  setShowOlderContracts(false);
                }}
                className={`rounded-md border px-3 py-2 text-sm font-semibold transition cursor-pointer ${
                  contractFilter === option.value
                    ? "border-[#162b3e] bg-[#162b3e] text-white"
                    : "border-gray-200 bg-white text-gray-700 hover:border-[#59abf0]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onCreateContract}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 cursor-pointer"
          >
            + New Contract
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {filterOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setContractFilter(option.value);
                setShowOlderContracts(false);
              }}
              className={`rounded-md border px-3 py-2 text-sm font-semibold transition cursor-pointer ${
                contractFilter === option.value
                  ? "border-[#162b3e] bg-[#162b3e] text-white"
                  : "border-gray-200 bg-white text-gray-700 hover:border-[#59abf0]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
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
      {showCurrentSummary && (
        <ContractCard
          title="Current Contract Summary"
          contract={client as ClientRow}
          isLatest
        />
      )}
      {latestLinkedContract && (
        <ContractCard
          title={
            contractFilter === "archived"
              ? "Archived Contract"
              : contractFilter === "old"
                ? "Past Contract"
                : contractFilter === "all"
                  ? "Latest Contract"
                  : "Current Contract"
          }
          contract={latestLinkedContract}
          isLatest={!showCurrentSummary}
          canManage={canCreateContract}
          canDelete={canDeleteContract}
          onEdit={onEditContract}
          onArchive={onArchiveContract}
          onDelete={onDeleteContract}
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
                  canDelete={canDeleteContract}
                  onEdit={onEditContract}
                  onArchive={onArchiveContract}
                  onDelete={onDeleteContract}
                />
              ))}
            </div>
          )}
        </div>
      )}
      {!showCurrentSummary && !latestLinkedContract && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
          No {contractFilter === "all" ? "" : `${contractFilter} `}contract rows found
          for this client.
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
  notificationPreferences,
  secondaryPathwaysEnabled,
  canAdvanceMilestones,
  canManagePathways,
  onStartMilestone,
  onCompleteMilestone,
  onStartSecondaryMilestone,
  onCompleteSecondaryMilestone,
  onChangePathway,
}: {
  client: ClientRow;
  offers: OfferRow[];
  clientMilestones: ClientMilestoneRow[];
  offerMilestones: OfferMilestoneRow[];
  relationLookup: Map<string, string>;
  notificationPreferences: NotificationPreference[];
  secondaryPathwaysEnabled: boolean;
  canAdvanceMilestones: boolean;
  canManagePathways: boolean;
  onStartMilestone: (progress: ClientMilestoneRow | null) => void;
  onCompleteMilestone: (progress: ClientMilestoneRow | null) => void;
  onStartSecondaryMilestone: (progress: ClientMilestoneRow | null) => void;
  onCompleteSecondaryMilestone: (progress: ClientMilestoneRow | null) => void;
  onChangePathway: () => void;
}) {
  const effectiveCurrent = deriveCurrentPathwayContext(
    client,
    clientMilestones,
    offerMilestones,
  );
  const offerValue =
    effectiveCurrent.offerId ||
    valueFrom(client, [
      "offer_milestones_current_offer_id",
      "offer_milestones_2nd_current_offer_id",
      "offer_id",
      "offer_name",
    ]);
  const rawMilestoneValue =
    effectiveCurrent.milestoneId ||
    valueFrom(client, [
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
    effectiveCurrent.progress ??
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
  const totalConfiguredMilestones = sortedOfferMilestones.length;
  const completedConfiguredMilestones = sortedOfferMilestones.filter((milestone) => {
    const milestoneId = milestone.glide_row_id;
    if (!isPresent(milestoneId)) return false;
    return isPresent(progressByMilestoneId.get(String(milestoneId))?.completion_date);
  }).length;
  const milestoneProgressPercent =
    totalConfiguredMilestones > 0
      ? Math.round((completedConfiguredMilestones / totalConfiguredMilestones) * 100)
      : null;
  const contractStart = valueFrom(client, [
    "current_contract_start_date",
    "contract_start_date",
    "start_date",
  ]);
  const contractEnd = valueFrom(client, [
    "current_contract_end_date_for_filtering",
    "current_contract_end_date",
    "contract_end_date",
    "renewal_date",
    "end_date",
  ]);
  const contractStartDate = dateFromValue(contractStart);
  const contractEndDate = dateFromValue(contractEnd);
  const now = new Date();
  const contractTotalDays =
    contractStartDate && contractEndDate
      ? daysBetweenValues(contractStartDate.toISOString(), contractEndDate.toISOString())
      : null;
  const contractElapsedDays =
    contractStartDate && contractEndDate
      ? Math.min(
          contractTotalDays ?? 0,
          daysBetweenValues(contractStartDate.toISOString(), now.toISOString()) ?? 0,
        )
      : null;
  const contractProgressPercent =
    contractTotalDays && contractTotalDays > 0 && contractElapsedDays !== null
      ? Math.max(0, Math.min(100, Math.round((contractElapsedDays / contractTotalDays) * 100)))
      : null;
  const defaultTimelineOption = nearestProgramTimelineOption(contractTotalDays);
  const [timelineDays, setTimelineDays] = useState(defaultTimelineOption.days);
  useEffect(() => {
    setTimelineDays(defaultTimelineOption.days);
  }, [defaultTimelineOption.days]);
  const selectedTimelineDays = Math.max(30, timelineDays || defaultTimelineOption.days);
  const notificationPreferenceByType = new Map(
    mergeNotificationPreferences(notificationPreferences).map((preference) => [
      preference.notification_type,
      preference,
    ]),
  );
  const diagnosticPreference = notificationPreferenceByType.get("diagnostic_due");
  const strategicReviewPreference = notificationPreferenceByType.get(
    "strategic_review_due",
  );
  const diagnosticDay = Math.max(1, diagnosticPreference?.lead_days || 56);
  const diagnosticRecurrence =
    diagnosticPreference?.metadata?.recurrence === "recurring"
      ? "recurring"
      : "once";
  const diagnosticMarkers: ProgramTimelineMarker[] =
    diagnosticPreference?.in_app_enabled === false
      ? []
      : diagnosticRecurrence === "recurring"
        ? Array.from(
            {
              length: Math.max(1, Math.floor(selectedTimelineDays / diagnosticDay)),
            },
            (_, index) => ({
              key: `diagnostic-${index + 1}`,
              label: `Configured check-in ${index + 1}`,
              day: diagnosticDay * (index + 1),
              tone: "amber" as ProgramTimelineMarkerTone,
              position: "bottom" as const,
            }),
          )
        : [
            {
              key: "peak-diagnostic",
              label: "Peak Diagnostic",
              day: diagnosticDay,
              tone: "amber",
              position: "bottom",
            },
          ];
  const strategicReviewDay = Math.max(
    1,
    selectedTimelineDays - Math.max(0, strategicReviewPreference?.lead_days ?? 35),
  );
  const timelineMarkerCandidates: ProgramTimelineMarker[] = [
    { key: "kickoff", label: "Kickoff", day: 1, tone: "purple" },
    ...diagnosticMarkers,
    ...(strategicReviewPreference?.in_app_enabled === false
      ? []
      : [
          {
            key: "strategic-review",
            label: "Strategic review",
            day: strategicReviewDay,
            tone: "orange" as ProgramTimelineMarkerTone,
            position: "bottom" as const,
          },
        ]),
    {
      key: "program-end",
      label: "Program end",
      day: selectedTimelineDays,
      tone: "gray",
    },
  ];
  const timelineMarkers = assignProgramTimelineLanes(
    timelineMarkerCandidates.filter((marker) => marker.day <= selectedTimelineDays),
    selectedTimelineDays,
  );
  const currentTimelineDay =
    contractElapsedDays !== null
      ? Math.max(1, Math.min(selectedTimelineDays, contractElapsedDays + 1))
      : null;
  const secondaryOfferValue = valueFrom(client, [
    "secondary_offer_milestones_current_offer_id",
    "offer_milestones_2nd_current_offer_id",
  ]);
  const secondaryMilestoneValue = valueFrom(client, [
    "secondary_offer_milestones_current_milestone_id",
    "offer_milestones_2nd_current_milestone_id",
  ]);
  const hasSecondaryPathway =
    isPresent(secondaryOfferValue) || isPresent(secondaryMilestoneValue);
  const [secondaryExpanded, setSecondaryExpanded] = useState(false);
  const secondaryOfferMilestones = offerMilestones
    .filter((milestone) => {
      if (!isPresent(secondaryOfferValue)) return false;
      return String(milestone.offer_id) === String(secondaryOfferValue);
    })
    .sort((a, b) => milestoneSortValue(a) - milestoneSortValue(b));
  const secondaryProgressCandidates = clientMilestones.filter(
    (milestone) =>
      isPresent(milestone.milestone_id) &&
      (!isPresent(milestone.offer_id) ||
        !isPresent(secondaryOfferValue) ||
        String(milestone.offer_id) === String(secondaryOfferValue)),
  );
  const secondaryProgressByMilestoneId = new Map<string, ClientMilestoneRow>();
  for (const milestone of secondaryProgressCandidates) {
    if (!isPresent(milestone.milestone_id)) continue;
    const milestoneId = String(milestone.milestone_id);
    const existing = secondaryProgressByMilestoneId.get(milestoneId);
    if (!existing || clientMilestoneLane(milestone) === "secondary") {
      secondaryProgressByMilestoneId.set(milestoneId, milestone);
    }
  }
  const secondaryCurrentProgress = isPresent(secondaryMilestoneValue)
    ? secondaryProgressByMilestoneId.get(String(secondaryMilestoneValue)) ??
      ({
        client_id: client.glide_row_id,
        offer_id: String(secondaryOfferValue ?? ""),
        milestone_id: String(secondaryMilestoneValue),
        metadata: { pathway_lane: "secondary" },
      } as ClientMilestoneRow)
    : null;
  const secondaryCanAdvance =
    canAdvanceMilestones &&
    isPresent(secondaryOfferValue) &&
    isPresent(secondaryMilestoneValue);
  const secondaryHasStarted = isPresent(secondaryCurrentProgress?.start_date);
  const secondaryHasCompleted = isPresent(
    secondaryCurrentProgress?.completion_date,
  );
  const secondaryTimelineRows = secondaryOfferMilestones.map((milestone) => {
    const milestoneId = milestone.glide_row_id ?? null;
    const progress = milestoneId
      ? secondaryProgressByMilestoneId.get(String(milestoneId)) ?? null
      : null;
    const isCurrent =
      isPresent(milestoneId) &&
      isPresent(secondaryMilestoneValue) &&
      String(milestoneId) === String(secondaryMilestoneValue);
    let status = "Not started";
    if (isPresent(progress?.completion_date)) status = "Completed";
    else if (isCurrent) status = "Current";
    else if (isPresent(progress?.start_date)) status = "Started";
    return { milestone, progress, isCurrent, status };
  });
  const secondaryCompletedConfiguredMilestones = secondaryOfferMilestones.filter(
    (milestone) => {
      const milestoneId = milestone.glide_row_id;
      if (!isPresent(milestoneId)) return false;
      return isPresent(
        secondaryProgressByMilestoneId.get(String(milestoneId))?.completion_date,
      );
    },
  ).length;
  const secondaryProgressPercent =
    secondaryOfferMilestones.length > 0
      ? Math.round(
          (secondaryCompletedConfiguredMilestones / secondaryOfferMilestones.length) *
            100,
        )
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

      <div
        className={`grid gap-3 ${
          contractProgressPercent === null ? "lg:grid-cols-1" : "lg:grid-cols-2"
        }`}
      >
        <div className="rounded-lg border border-[#d6eafb] bg-[#f7fbff] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#586273]">
                Milestone Progress
              </div>
              <div className="mt-1 text-sm font-semibold text-[#162b3e]">
                {milestoneProgressPercent === null
                  ? "No configured milestone map"
                  : `${completedConfiguredMilestones}/${totalConfiguredMilestones} milestones complete`}
              </div>
            </div>
            <span className="text-2xl font-semibold text-[#2b79c4]">
              {milestoneProgressPercent === null ? "--" : `${milestoneProgressPercent}%`}
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#dbeafe]">
            <div
              className="h-full rounded-full bg-[#59abf0]"
              style={{ width: `${milestoneProgressPercent ?? 0}%` }}
            />
          </div>
        </div>

        {contractProgressPercent !== null ? (
          <div className="rounded-lg border border-[#e4e9f0] bg-[#f8fafc] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#586273]">
                  Contract / Program Timing
                </div>
                <div className="mt-1 text-sm font-semibold text-[#162b3e]">
                  {formatDate(contractStart)} to {formatDate(contractEnd)}
                </div>
              </div>
              <span className="text-2xl font-semibold text-[#162b3e]">
                {contractProgressPercent}%
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e2e8f0]">
              <div
                className="h-full rounded-full bg-[#162b3e]"
                style={{ width: `${contractProgressPercent}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-[#e4e9f0] bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#586273]">
              Program Timeline
            </div>
            <p className="mt-1 text-sm text-[#6c7684]">
              Read-only operating map using contract/program timing and
              company-configured Daily Pulse checkpoints.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {PROGRAM_TIMELINE_OPTIONS.map((option) => (
              <button
                key={option.days}
                type="button"
                onClick={() => setTimelineDays(option.days)}
                className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                  selectedTimelineDays === option.days
                    ? "border-[#162b3e] bg-[#162b3e] text-white"
                    : "border-[#d0d5dd] bg-white text-[#344054] hover:border-[#59abf0]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-[#586273]">
          {Array.from(
            new Map(
              timelineMarkers.map((marker) => [marker.label, marker.tone]),
            ).entries(),
          ).map(([label, tone]) => {
            const toneClasses =
              PROGRAM_TIMELINE_TONE_CLASSES[tone as ProgramTimelineMarkerTone];
            return (
              <span key={label} className="inline-flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${toneClasses.dot}`} />
                {label}
              </span>
            );
          })}
        </div>
        <div className="relative mt-6 h-44 overflow-hidden px-8">
          <div className="absolute left-10 right-10 top-[88px]">
            <div className="absolute inset-x-0 top-0 h-1 -translate-y-1/2 rounded-full bg-[#e5e7eb]" />
            {currentTimelineDay !== null ? (
              <div
                className="absolute top-0 z-10 -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${Math.max(
                    0,
                    Math.min(100, (currentTimelineDay / selectedTimelineDays) * 100),
                  )}%`,
                }}
              >
                <div className="h-5 w-5 rounded-full border-2 border-white bg-[#162b3e] shadow-md" />
                <div className="mt-1 w-20 -translate-x-[30px] text-center text-[11px] font-semibold text-[#162b3e]">
                  Current
                </div>
              </div>
            ) : null}
            {timelineMarkers.map((marker) => (
              <ProgramTimelineMarkerDot
                key={marker.key}
                marker={marker}
                totalDays={selectedTimelineDays}
              />
            ))}
          </div>
          <div className="absolute bottom-0 left-10 right-10 flex justify-between text-xs font-medium text-[#6c7684]">
            <span>0</span>
            <span>{Math.round(selectedTimelineDays / 4)}</span>
            <span>{Math.round(selectedTimelineDays / 2)}</span>
            <span>{Math.round((selectedTimelineDays * 3) / 4)}</span>
            <span>{selectedTimelineDays}</span>
          </div>
        </div>
      </div>

      {secondaryPathwaysEnabled ? (
        <div className="rounded-lg border border-[#e4e9f0] bg-[#fbfcfe] p-4">
          <button
            type="button"
            onClick={() => setSecondaryExpanded((current) => !current)}
            className="flex w-full flex-col gap-3 text-left sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#586273]">
                Secondary Pathway
              </div>
              {hasSecondaryPathway ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#586273]">
                  <span className="font-semibold text-[#162b3e]">
                    {displayValue(secondaryOfferValue, relationLookup)}
                  </span>
                  <span>/</span>
                  <span>{displayValue(secondaryMilestoneValue, relationLookup)}</span>
                </div>
              ) : (
                <p className="mt-2 text-sm text-[#6c7684]">
                  No secondary pathway configured.
                </p>
              )}
            </div>
            {hasSecondaryPathway ? (
              <div className="flex items-center gap-3">
                <span className="rounded-full border border-[#d6eafb] bg-white px-2.5 py-1 text-xs font-semibold text-[#2b79c4]">
                  {secondaryProgressPercent === null
                    ? "No progress map"
                    : `${secondaryProgressPercent}% complete`}
                </span>
                <span className="text-xs font-semibold text-[#586273]">
                  {secondaryExpanded ? "Hide progress" : "Show progress"}
                </span>
              </div>
            ) : null}
          </button>
          {secondaryExpanded && hasSecondaryPathway ? (
            <div className="mt-4 rounded-md border border-[#e4e9f0] bg-[#f7f9fc] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#586273]">
                    Secondary Milestone Progress
                  </div>
                  <div className="mt-1 text-sm font-semibold text-[#162b3e]">
                    {secondaryProgressPercent === null
                      ? "No configured milestone map"
                      : `${secondaryCompletedConfiguredMilestones}/${secondaryOfferMilestones.length} milestones complete`}
                  </div>
                </div>
                <span className="text-xl font-semibold text-[#2b79c4]">
                  {secondaryProgressPercent === null
                    ? "--"
                    : `${secondaryProgressPercent}%`}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#dbeafe]">
                <div
                  className="h-full rounded-full bg-[#59abf0]"
                  style={{ width: `${secondaryProgressPercent ?? 0}%` }}
                />
              </div>
              {secondaryCanAdvance ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {!secondaryHasStarted ? (
                    <button
                      type="button"
                      onClick={() =>
                        onStartSecondaryMilestone(secondaryCurrentProgress)
                      }
                      className="retainos-button-secondary cursor-pointer px-3 py-2 text-sm"
                    >
                      Start Secondary Milestone
                    </button>
                  ) : null}
                  {!secondaryHasCompleted ? (
                    <button
                      type="button"
                      onClick={() =>
                        onCompleteSecondaryMilestone(secondaryCurrentProgress)
                      }
                      className="retainos-button-primary cursor-pointer px-3 py-2 text-sm"
                    >
                      Complete Secondary Milestone
                    </button>
                  ) : (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                      Current secondary milestone completed
                    </span>
                  )}
                </div>
              ) : null}
              <div className="mt-3 space-y-2">
                {secondaryTimelineRows.length > 0 ? (
                  secondaryTimelineRows.map(
                    ({ milestone, progress, isCurrent, status }, index) => {
                      const milestoneId =
                        milestone.glide_row_id ?? progress?.milestone_id;
                      return (
                        <div
                          key={String(milestoneId ?? `secondary-milestone-${index}`)}
                          className={`rounded-md border bg-white px-3 py-3 text-sm ${
                            isCurrent
                              ? "border-indigo-200 ring-1 ring-indigo-100"
                              : "border-gray-200"
                          }`}
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <span className="font-medium text-gray-900">
                                {displayValue(milestone.name)}
                              </span>
                              <div className="mt-1 text-xs text-gray-500">
                                Start: {formatDate(progress?.start_date)} ·
                                Completed: {formatDate(progress?.completion_date)}
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
                    },
                  )
                ) : (
                  <div className="rounded-md border border-dashed border-gray-300 bg-white px-3 py-3 text-sm text-gray-600">
                    No milestones are configured for this secondary pathway.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <FieldGrid
        fields={[
          ["Pathway", ["offer_milestones_current_offer_id", "offer_id", "offer_name"]],
          ["Milestones", ["offer_milestones_current_milestone_id", "milestone_id"]],
          ["Last Contact", ["csm_date_of_last_contact"]],
          ["Next Contact", ["csm_date_of_next_contact"]],
        ]}
        client={{
          ...client,
          offer_milestones_current_offer_id: offerValue,
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
              const isTtvMilestone = Boolean(milestone?.ttv_milestone);
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
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {milestone
                          ? displayValue(milestone.name)
                          : displayValue(progress?.milestone_id, relationLookup)}
                      </span>
                      {isTtvMilestone ? (
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-sky-700">
                          Time to Value
                        </span>
                      ) : null}
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

function getHistorySourceLabel(event: ClientHistoryEventRow) {
  const eventType = String(event.event_type ?? "");
  const source = String(event.source ?? "");

  if (source === "cst_mirror") {
    return "Imported from CST";
  }

  if (eventType === "call_summary_webhook") {
    return "Updated via webhook";
  }

  if (source === "webhook" || source === "integration") {
    return "Updated via webhook";
  }

  if (source && !["manual", "retainos", "quick_update"].includes(source)) {
    return `Updated via ${source}`;
  }

  return null;
}

function legacyHistoryTitle(changeType: string) {
  const normalized = changeType.replace(/_/g, "-").toLowerCase();
  const compact = normalized.replace(/[\s-]+/g, "");
  if (changeType === "next-steps") return "Previous Next Steps";
  if (changeType === "call-tracker") return "Call / Communication";
  if (changeType === "contract") return "Contract history";
  if (normalized.includes("success")) return "Success update";
  if (normalized.includes("progress")) return "Progress update";
  if (compact.includes("buyin")) return "Buy In update";
  if (normalized.includes("health") || normalized.includes("outcome")) {
    return "Health score update";
  }
  if (normalized.includes("program")) return "Program update";
  return "CST history";
}

function normalizeLegacyHistoryValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function legacyHistoryHealthField(changeType: string) {
  const normalized = changeType.replace(/_/g, "-").toLowerCase();
  const compact = normalized.replace(/[\s-]+/g, "");
  if (normalized.includes("success")) return "success";
  if (normalized.includes("progress")) return "progress";
  if (compact.includes("buyin")) return "buy_in";
  if (normalized.includes("health") || normalized.includes("outcome")) {
    return "health";
  }
  return null;
}

function mapLegacyHistoryRow(row: Record<string, unknown>): ClientHistoryEventRow {
  const changeType = String(row.change_type_code ?? "legacy").trim();
  const value = normalizeLegacyHistoryValue(row.value);
  const isNextSteps = changeType === "next-steps";
  const isCall = changeType === "call-tracker";
  const healthField = legacyHistoryHealthField(changeType);
  const createdAt =
    typeof row.modified_date === "string"
      ? row.modified_date
      : typeof row.synced_at === "string"
        ? row.synced_at
        : null;
  const modifiedBy =
    typeof row.modified_by === "string" && row.modified_by.trim()
      ? row.modified_by.trim()
      : null;
  const callAiId =
    typeof row.call_ai_id === "string" && row.call_ai_id.trim()
      ? row.call_ai_id.trim()
      : null;

  return {
    id: `legacy:${String(row.glide_row_id ?? createdAt ?? row.client_id ?? "unknown")}`,
    legacy_client_glide_row_id:
      typeof row.client_id === "string" ? row.client_id : null,
    event_type: `legacy_${changeType.replace(/[^a-z0-9]+/gi, "_")}`,
    source: "cst_mirror",
    title: legacyHistoryTitle(changeType),
    summary: isNextSteps ? null : value || null,
    next_steps: isNextSteps ? value || null : null,
    notes: !isNextSteps && !isCall ? normalizeLegacyHistoryValue(row.context) || null : null,
    last_contact_at: isCall ? createdAt : null,
    success_status: healthField === "success" ? value || null : null,
    progress_status: healthField === "progress" ? value || null : null,
    buy_in_status: healthField === "buy_in" ? value || null : null,
    created_at: createdAt,
    metadata: {
      imported_from: "backup_company_clients_history",
      source_row_id: typeof row.glide_row_id === "string" ? row.glide_row_id : null,
      change_type_code: changeType,
      health_field: healthField,
      modified_by: modifiedBy,
      call_ai_id: callAiId,
      original_value: row.original_value ?? null,
    },
  };
}

function buildMigratedOutcomeHistoryRows(client: ClientRow): ClientHistoryEventRow[] {
  const configs = [
    {
      field: "success",
      label: "Success",
      value: valueFrom(client, [
        "outcomes_success_for_filtering",
        "outcomes_success_value_for_filtering",
        "outcomes_success_value",
        "success_status",
      ]),
      date: valueFrom(client, [
        "outcomes_success_date",
        "success_date",
        "success_updated_at",
      ]),
    },
    {
      field: "progress",
      label: "Progress",
      value: valueFrom(client, [
        "outcomes_progress_for_filtering",
        "outcomes_progress_value",
        "progress_status",
      ]),
      date: valueFrom(client, [
        "outcomes_progress_date",
        "progress_date",
        "progress_updated_at",
      ]),
    },
    {
      field: "buy_in",
      label: "Buy In",
      value: valueFrom(client, [
        "outcomes_buy_in_for_filtering",
        "outcomes_buy_in_value",
        "buy_in_status",
      ]),
      date: valueFrom(client, [
        "outcomes_buy_in_date",
        "buy_in_date",
        "buy_in_updated_at",
      ]),
    },
  ];

  const rows: ClientHistoryEventRow[] = [];
  for (const config of configs) {
    const value = normalizeOutcome(config.value);
    const date = typeof config.date === "string" ? config.date : "";
    if (!value || !date) continue;
    rows.push({
      id: `migrated-health:${client.glide_row_id}:${config.field}`,
      legacy_client_glide_row_id: client.glide_row_id,
      event_type: "migrated_health_score",
      source: "migrated_current_field",
      title: `${config.label} update`,
      summary: `${config.label}: ${outcomeLabel(value)}`,
      success_status: config.field === "success" ? value : null,
      progress_status: config.field === "progress" ? value : null,
      buy_in_status: config.field === "buy_in" ? value : null,
      created_at: date,
      metadata: {
        imported_from: "clients_current_outcome_fields",
        health_field: config.field,
        generated_from_current_field: true,
      },
    });
  }
  return rows;
}

function historyHealthKey(event: ClientHistoryEventRow) {
  const metadata = event.metadata ?? {};
  const healthField =
    typeof metadata.health_field === "string" ? metadata.health_field : "";
  const field =
    healthField ||
    (event.success_status
      ? "success"
      : event.progress_status
        ? "progress"
        : event.buy_in_status
          ? "buy_in"
          : "");
  if (!field) return null;
  const value =
    event.success_status ??
    event.progress_status ??
    event.buy_in_status ??
    event.summary ??
    "";
  return `${field}|${dateInputValue(event.created_at)}|${normalizeOutcome(value)}`;
}

function mergeSyntheticHealthHistory(
  events: ClientHistoryEventRow[],
  syntheticEvents: ClientHistoryEventRow[],
) {
  const existingKeys = new Set(
    events
      .map(historyHealthKey)
      .filter((key): key is string => Boolean(key)),
  );
  return [
    ...events,
    ...syntheticEvents.filter((event) => {
      const key = historyHealthKey(event);
      return !key || !existingKeys.has(key);
    }),
  ];
}

function historyTimestamp(event: ClientHistoryEventRow) {
  const value = event.created_at ?? "";
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function sortHistoryEvents(events: ClientHistoryEventRow[]) {
  return [...events].sort(
    (left, right) => historyTimestamp(right) - historyTimestamp(left),
  );
}

type HistoryFilter =
  | "all"
  | "calls"
  | "contract"
  | "last_contact"
  | "next_steps"
  | "health";

const HISTORY_FILTERS: { key: HistoryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "calls", label: "Calls" },
  { key: "contract", label: "Contract" },
  { key: "last_contact", label: "Last Contact" },
  { key: "next_steps", label: "Next Steps" },
  { key: "health", label: "Health Scores" },
];

function recordFromUnknown(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringFromUnknown(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function historyRecordingUrl(event: ClientHistoryEventRow) {
  const metadata = recordFromUnknown(event.metadata);
  const payload = recordFromUnknown(event.payload);
  const rawPayload = recordFromUnknown(payload.raw_payload);
  const url =
    stringFromUnknown(metadata.recording_url) ??
    stringFromUnknown(metadata.recordingUrl) ??
    stringFromUnknown(payload.recording_url) ??
    stringFromUnknown(payload.recordingUrl) ??
    stringFromUnknown(payload.url) ??
    stringFromUnknown(rawPayload.recording_url) ??
    stringFromUnknown(rawPayload.recordingUrl) ??
    stringFromUnknown(rawPayload.url);
  return url && /^https?:\/\//i.test(url) ? url : null;
}

function latestCallSummaryRecordingUrl(events: ClientHistoryEventRow[]) {
  for (const event of events) {
    const haystack = [event.event_type, event.source, event.title]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (
      haystack.includes("call_summary_webhook") ||
      haystack.includes("fathom") ||
      haystack.includes("call summary")
    ) {
      const url = historyRecordingUrl(event);
      if (url) return url;
    }
  }
  return null;
}

function historyEventMatchesFilter(event: ClientHistoryEventRow, filter: HistoryFilter) {
  if (filter === "all") return true;
  const haystack = [
    event.event_type,
    event.source,
    event.title,
    event.summary,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (filter === "calls") {
    const metadata = event.metadata ?? {};
    return (
      haystack.includes("call") ||
      haystack.includes("communication") ||
      haystack.includes("fathom") ||
      Boolean(metadata.recording_url || metadata.call_ai_id || historyRecordingUrl(event))
    );
  }
  if (filter === "contract") return haystack.includes("contract");
  if (filter === "last_contact") return Boolean(event.last_contact_at);
  if (filter === "next_steps") {
    return Boolean(event.next_steps) || haystack.includes("next steps");
  }
  if (filter === "health") {
    const metadata = event.metadata ?? {};
    const legacyChangeType =
      typeof metadata.change_type_code === "string"
        ? metadata.change_type_code
        : "";
    return (
      Boolean(event.success_status || event.progress_status || event.buy_in_status) ||
      Boolean(metadata.health_field) ||
      legacyHistoryHealthField(legacyChangeType) !== null
    );
  }
  return true;
}

function historyEventMatchesSearch(event: ClientHistoryEventRow, query: string) {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  return [
    event.title,
    event.summary,
    event.notes,
    event.next_steps,
    event.success_status,
    event.progress_status,
    event.buy_in_status,
    event.source,
    event.event_type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(text);
}

function historyActionSource(event: ClientHistoryEventRow) {
  return event.source === "cst_mirror" ? "cst" : "retainos";
}

function historyActionEventId(event: ClientHistoryEventRow) {
  if (event.source !== "cst_mirror") return event.id;
  const sourceRowId = event.metadata?.source_row_id;
  return typeof sourceRowId === "string"
    ? sourceRowId
    : event.id.replace(/^legacy:/, "");
}

function HistorySection({
  events,
  canManageHistory,
  onChangeDate,
  onDelete,
}: {
  events: ClientHistoryEventRow[];
  canManageHistory: boolean;
  onChangeDate: (event: ClientHistoryEventRow, eventDate: string) => Promise<void>;
  onDelete: (event: ClientHistoryEventRow) => Promise<void>;
}) {
  const [activeFilter, setActiveFilter] = useState<HistoryFilter>("all");
  const [search, setSearch] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<ClientHistoryEventRow | null>(null);
  const [deletingEvent, setDeletingEvent] = useState<ClientHistoryEventRow | null>(null);
  const [historyDate, setHistoryDate] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const visibleEvents = events.filter(
    (event) =>
      historyEventMatchesFilter(event, activeFilter) &&
      historyEventMatchesSearch(event, search),
  );

  function openDateEditor(event: ClientHistoryEventRow) {
    setMenuOpenId(null);
    setActionError(null);
    setEditingEvent(event);
    setHistoryDate(dateTimeInputValue(event.created_at));
  }

  function openDeleteConfirm(event: ClientHistoryEventRow) {
    setMenuOpenId(null);
    setActionError(null);
    setDeletingEvent(event);
  }

  async function submitDateChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingEvent || actionLoading) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await onChangeDate(editingEvent, historyDate);
      setEditingEvent(null);
      setHistoryDate("");
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Could not change history date.",
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function confirmDelete() {
    if (!deletingEvent || actionLoading) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await onDelete(deletingEvent);
      setDeletingEvent(null);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Could not delete history entry.",
      );
    } finally {
      setActionLoading(false);
    }
  }

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
        No RetainOS history has been saved for this client yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {HISTORY_FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setActiveFilter(filter.key)}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                  activeFilter === filter.key
                    ? "border-[#162b3e] bg-[#162b3e] text-white"
                    : "border-[#cbd2dc] bg-white text-[#586273] hover:border-[#59abf0] hover:text-[#2b79c4]"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <label className="block w-full lg:w-72">
            <span className="sr-only">Search history</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search history"
              className="block w-full rounded-md border border-[#cbd2dc] bg-white px-3 py-2 text-sm text-[#162b3e] placeholder:text-[#98a2b3] focus:border-[#59abf0] focus:outline-none focus:ring-1 focus:ring-[#59abf0]"
            />
          </label>
        </div>
      </div>

      {visibleEvents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          No history events match this filter.
        </div>
      ) : null}

      {visibleEvents.map((event) => {
        const sourceLabel = getHistorySourceLabel(event);
        const isLegacyHistory = event.source === "cst_mirror";
        const recordingUrl = historyRecordingUrl(event);
        const modifiedBy =
          typeof event.metadata?.modified_by === "string"
            ? event.metadata.modified_by
            : "";

        return (
          <article
            key={event.id}
            className="relative rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  {event.title ?? "Quick Update"}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  {formatDateTime(event.created_at)}
                </p>
                {sourceLabel ? (
                  <p className="mt-1 text-xs text-gray-500">
                    {sourceLabel}
                    {modifiedBy ? ` by ${modifiedBy}` : ""}
                    {!isLegacyHistory
                      ? ". Event time is when RetainOS received it."
                      : "."}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <span className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                  {isLegacyHistory ? "CST history" : "RetainOS history"}
                </span>
                {sourceLabel ? (
                  <span className="w-fit rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700">
                    {sourceLabel}
                  </span>
                ) : null}
                {recordingUrl ? (
                  <a
                    href={recordingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-fit rounded-full border border-[#59abf0] bg-[#eef7ff] px-2 py-1 text-xs font-semibold text-[#2b79c4] hover:border-[#2b79c4] hover:bg-[#dff0ff]"
                  >
                    Open recording
                  </a>
                ) : null}
                {canManageHistory ? (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setMenuOpenId((current) =>
                          current === event.id ? null : event.id,
                        )
                      }
                      className="rounded-md border border-gray-200 bg-white px-2 py-1 text-sm font-semibold text-gray-500 hover:border-[#59abf0] hover:text-[#2b79c4]"
                      aria-label="History actions"
                    >
                      ...
                    </button>
                    {menuOpenId === event.id ? (
                      <div className="absolute right-0 z-20 mt-2 w-44 rounded-lg border border-gray-200 bg-white py-2 shadow-lg">
                        <button
                          type="button"
                          onClick={() => openDateEditor(event)}
                          className="block w-full px-4 py-2 text-left text-sm font-medium text-[#162b3e] hover:bg-[#f3f7fb]"
                        >
                          Change date
                        </button>
                        <button
                          type="button"
                          onClick={() => openDeleteConfirm(event)}
                          className="block w-full px-4 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50"
                        >
                          Delete history entry
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            {event.notes ? (
              <div className="mt-4">
                <RichPreviewValue label="History notes" value={event.notes} />
              </div>
            ) : event.summary ? (
              <div className="mt-4">
                <RichPreviewValue label="History summary" value={event.summary} />
              </div>
            ) : null}
            {event.next_steps ? (
              <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-wider text-gray-500">
                  Next Steps
                </div>
                <div className="mt-1">
                  <RichPreviewValue label="Next Steps history" value={event.next_steps} />
                </div>
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
        );
      })}

      {editingEvent ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#162b3e]/40 p-4">
          <form
            onSubmit={submitDateChange}
            className="w-full max-w-md rounded-lg bg-white shadow-xl"
          >
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Change History Date
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                This changes where the entry appears in client history.
              </p>
            </div>
            <div className="space-y-3 px-5 py-4">
              <label className="block text-sm font-semibold text-[#586273]">
                History date
                <input
                  type="datetime-local"
                  value={historyDate}
                  onChange={(event) => setHistoryDate(event.target.value)}
                  className="mt-1 block w-full rounded-md border border-[#cbd2dc] px-3 py-2 text-sm text-[#162b3e] focus:border-[#59abf0] focus:outline-none focus:ring-1 focus:ring-[#59abf0]"
                  required
                />
              </label>
              {actionError ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {actionError}
                </div>
              ) : null}
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-200 px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  setEditingEvent(null);
                  setActionError(null);
                }}
                className="rounded-md border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="rounded-md bg-[#59abf0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2b79c4] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionLoading ? "Saving..." : "Save date"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {deletingEvent ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#162b3e]/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Delete History Entry?
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                This permanently removes the visible history entry. RetainOS keeps an internal audit record.
              </p>
            </div>
            {actionError ? (
              <div className="mx-5 mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {actionError}
              </div>
            ) : null}
            <div className="flex justify-end gap-3 px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  setDeletingEvent(null);
                  setActionError(null);
                }}
                className="rounded-md border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={actionLoading}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionLoading ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
export function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { capabilities, effectiveCompanyId, teamMemberId } = useAccountContext();
  const [client, setClient] = useState<ClientRow | null>(null);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [clientMilestones, setClientMilestones] = useState<ClientMilestoneRow[]>([]);
  const [offerMilestones, setOfferMilestones] = useState<OfferMilestoneRow[]>([]);
  const [tasks, setTasks] = useState<ClientTaskRow[]>([]);
  const [historyEvents, setHistoryEvents] = useState<ClientHistoryEventRow[]>([]);
  const [customFields, setCustomFields] = useState<CompanyCustomFieldRow[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<
    ClientCustomFieldValueRow[]
  >([]);
  const [churnReasons, setChurnReasons] = useState<CompanyChurnReasonRow[]>([]);
  const [programChoices, setProgramChoices] = useState<ProgramChoice[]>([]);
  const [outcomeChoices, setOutcomeChoices] = useState<OutcomeChoiceSets>({
    success: [],
    progress: [],
    buyIn: [],
  });
  const [relationLookup, setRelationLookup] = useState(new Map<string, string>());
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [notificationPreferences, setNotificationPreferences] = useState<
    NotificationPreference[]
  >(mergeNotificationPreferences(null));
  const [secondaryPathwaysEnabled, setSecondaryPathwaysEnabled] = useState(false);
  const [secondaryAssigneeEnabled, setSecondaryAssigneeEnabled] = useState(false);
  const [allowStatusChangeRetention, setAllowStatusChangeRetention] =
    useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("details");
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingNextSteps, setEditingNextSteps] = useState(false);
  const [editingOutcomes, setEditingOutcomes] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [creatingContract, setCreatingContract] = useState(false);
  const [editingContract, setEditingContract] = useState<ContractRow | null>(null);
  const [archivingContractId, setArchivingContractId] = useState<string | null>(null);
  const [deletingClient, setDeletingClient] = useState(false);
  const [isAppOwnedClient, setIsAppOwnedClient] = useState(false);
  const [milestoneAction, setMilestoneAction] = useState<{
    action: MilestoneActionKind;
    progress: ClientMilestoneRow | null;
  } | null>(null);
  const [changingPathway, setChangingPathway] = useState(false);
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    async function loadClient() {
      setLoading(true);
      setError(null);
      setSecondaryAssigneeEnabled(false);
      setSecondaryPathwaysEnabled(false);
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
        setCustomFields([]);
        setCustomFieldValues([]);
        setLoading(false);
        return;
      }
      const nextClient = data as ClientRow;
      if (effectiveCompanyId && nextClient.company_id !== effectiveCompanyId) {
        setError("This client is outside your current company access.");
        setClient(null);
        setIsAppOwnedClient(false);
        setCustomFields([]);
        setCustomFieldValues([]);
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
        setCustomFields([]);
        setCustomFieldValues([]);
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
        nextClient.secondary_offer_milestones_current_offer_id,
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
      const notificationPreferenceResult = companyGlideRowId
        ? await loadCompanyNotificationPreferences(companyGlideRowId)
        : { preferences: mergeNotificationPreferences(null), source: "fallback" as const };
      const companyOfferIds =
        companyOfferRows?.map((offer) => offer.glide_row_id).filter(Boolean) ??
        [];
      const useAppOwnedHistoricalActivity = Boolean(appPathwayCompany?.id);
      const [
        { data: contractRows },
        { data: appContractRows },
        { data: choices },
        { data: outcomeChoiceRows },
        churnReasonsResult,
        { data: milestoneRows },
        { data: appMilestoneRows },
        { data: offerMilestoneRows },
        { data: taskRows },
        { data: appTaskRows },
        { data: historyRows },
        { data: legacyHistoryRows },
        customFieldsResult,
        customFieldValuesResult,
        companySettingsResult,
      ] = await Promise.all([
        useAppOwnedHistoricalActivity
          ? Promise.resolve({ data: [] })
          : supabase
              .from("backup_company_clients_contracts")
              .select("*")
              .eq("client_id", nextClient.glide_row_id)
              .order("end_date", { ascending: false, nullsFirst: false }),
        supabase
          .from("client_contracts")
          .select("*")
          .eq("client_id", nextClient.glide_row_id)
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
        appPathwayCompany?.id
          ? supabase
              .from("company_churn_reasons")
              .select(
                "id, value, label, category, requires_notes, counts_as_churn, position, status",
              )
              .eq("company_id", appPathwayCompany.id)
              .eq("status", "active")
              .order("position", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        useAppOwnedHistoricalActivity
          ? Promise.resolve({ data: [] })
          : supabase
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
        appPathwayCompany?.id
          ? Promise.resolve({ data: [] })
          : supabase
              .from("backup_company_clients_tasks")
              .select("*")
              .eq("client_id", nextClient.glide_row_id)
              .order("task_due_date", { ascending: true, nullsFirst: false }),
        appPathwayCompany?.id
          ? supabase
              .from("client_tasks")
              .select("*")
              .eq("client_id", nextClient.glide_row_id)
              .order("task_due_date", { ascending: true, nullsFirst: false })
          : Promise.resolve({ data: [] }),
        supabase
          .from("client_history_events")
          .select("*")
          .eq("legacy_client_glide_row_id", nextClient.glide_row_id)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("backup_company_clients_history")
          .select("*")
          .eq("client_id", nextClient.glide_row_id)
          .order("modified_date", { ascending: false, nullsFirst: false })
          .limit(500),
        appPathwayCompany?.id
          ? supabase
              .from("company_custom_fields")
              .select(
                "id, key, label, description, field_type, options, is_visible_on_client_detail, position, source_key, status",
              )
              .eq("company_id", appPathwayCompany.id)
              .eq("entity_type", "client")
              .eq("status", "active")
              .order("position", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        appPathwayCompany?.id
          ? supabase
              .from("client_custom_field_values")
              .select(
                "id, custom_field_id, field_key, value_text, value_json, source_table, source_key",
              )
              .eq("company_id", appPathwayCompany.id)
              .eq("client_id", nextClient.glide_row_id)
          : Promise.resolve({ data: [], error: null }),
        appPathwayCompany?.id
          ? supabase
              .from("company_settings")
              .select(
                "enable_secondary_assignee, enable_secondary_offers, allow_status_change_retention, metadata",
              )
              .eq("company_id", appPathwayCompany.id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (!cancelled) {
        if (!companySettingsResult.error) {
          setSecondaryAssigneeEnabled(
            companySettingsResult.data?.enable_secondary_assignee === true,
          );
          setSecondaryPathwaysEnabled(
            companySettingsResult.data?.enable_secondary_offers === true,
          );
          setAllowStatusChangeRetention(
            companySettingsResult.data?.allow_status_change_retention === true,
          );
        } else {
          console.error(
            "Failed to load company settings:",
            companySettingsResult.error,
          );
          setSecondaryPathwaysEnabled(false);
          setSecondaryAssigneeEnabled(false);
          setAllowStatusChangeRetention(false);
        }
        if (customFieldsResult.error) {
          console.error("Failed to load company custom fields:", customFieldsResult.error);
        }
        if (customFieldValuesResult.error) {
          console.error(
            "Failed to load client custom field values:",
            customFieldValuesResult.error,
          );
        }
        if (churnReasonsResult.error) {
          console.error("Failed to load company churn reasons:", churnReasonsResult.error);
        }
        setContracts([
          ...((appContractRows ?? []) as ContractRow[]).map((contract) =>
            withContractSource(contract, "app"),
          ),
          ...((contractRows ?? []) as ContractRow[]).map((contract) =>
            withContractSource(contract, "mirror"),
          ),
        ]);
        const nextProgramStatusLabels = normalizeProgramStatusLabels(
          companySettingsResult.data?.metadata &&
            typeof companySettingsResult.data.metadata === "object" &&
            !Array.isArray(companySettingsResult.data.metadata)
            ? (companySettingsResult.data.metadata as Record<string, unknown>)
                .program_status_labels
            : null,
        );
        setProgramChoices(
          applyProgramStatusLabels(
            (choices ?? []) as ProgramChoice[],
            nextProgramStatusLabels,
          ),
        );
        setChurnReasons(
          churnReasonsResult.error
            ? []
            : ((churnReasonsResult.data ?? []) as CompanyChurnReasonRow[]),
        );
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
        setHistoryEvents(
          sortHistoryEvents(
            mergeSyntheticHealthHistory(
              [
                ...((historyRows ?? []) as ClientHistoryEventRow[]),
                ...((legacyHistoryRows ?? []) as Record<string, unknown>[]).map(
                  mapLegacyHistoryRow,
                ),
              ],
              buildMigratedOutcomeHistoryRows(nextClient),
            ),
          ),
        );
        setCustomFields(
          customFieldsResult.error
            ? []
            : ((customFieldsResult.data ?? []) as CompanyCustomFieldRow[]),
        );
        setCustomFieldValues(
          customFieldValuesResult.error
            ? []
            : ((customFieldValuesResult.data ?? []) as ClientCustomFieldValueRow[]),
        );
        setNotificationPreferences(notificationPreferenceResult.preferences);
      }
      const milestoneRelationIds = [
        ...((milestoneRows ?? []) as ClientMilestoneRow[]),
        ...((appMilestoneRows ?? []) as ClientMilestoneRow[]),
      ].flatMap((row) => [
        ...extractGlideIds(row.offer_id),
        ...extractGlideIds(row.milestone_id),
      ]);
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
  const latestFathomRecordingUrl = useMemo(
    () => latestCallSummaryRecordingUrl(historyEvents),
    [historyEvents],
  );
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
  const canDeleteContract = canEditProfile;
  const canManageHistory = canEditProfile;
  const canDeleteClient =
    canEditProfile &&
    !capabilities.canViewOnlyAssignedClients &&
    capabilities.canManageClientPathways;
  function applyCustomFieldChanges(changes: CustomFieldChange[]) {
    if (changes.length === 0) return;
    setCustomFieldValues((current) => {
      let next = current;
      for (const change of changes) {
        const field = customFields.find((item) => item.id === change.id);
        if (!field) continue;
        const existing = next.find((item) => item.custom_field_id === change.id);
        const updated: ClientCustomFieldValueRow = {
          id: existing?.id ?? `local-${change.id}`,
          custom_field_id: change.id,
          field_key: field.key,
          value_text: change.after ?? null,
          value_json: change.after ?? null,
          source_table: "client_custom_field_values",
          source_key: field.source_key ?? field.key,
        };
        next = existing
          ? next.map((item) =>
              item.custom_field_id === change.id ? { ...item, ...updated } : item,
            )
          : [...next, updated];
      }
      return next;
    });
  }
  async function changeHistoryDate(
    event: ClientHistoryEventRow,
    eventDate: string,
  ) {
    if (!client) throw new Error("Client not loaded.");
    const companyLegacyId =
      typeof client.company_glide_row_id === "string" && client.company_glide_row_id
        ? client.company_glide_row_id
        : typeof client.company_id === "string"
          ? client.company_id
          : "";
    if (!companyLegacyId) throw new Error("Missing company id.");
    const { data, error } = await supabase.functions.invoke(
      "manage-client-history",
      {
        body: {
          action: "update_date",
          source: historyActionSource(event),
          companyLegacyId,
          clientLegacyId: client.glide_row_id,
          eventId: historyActionEventId(event),
          eventDate,
        },
      },
    );
    if (error || data?.error) {
      throw new Error(data?.error ?? error?.message ?? "Could not change history date.");
    }
    const nextEvent =
      historyActionSource(event) === "cst"
        ? mapLegacyHistoryRow(data.event as Record<string, unknown>)
        : (data.event as ClientHistoryEventRow);
    setHistoryEvents((current) =>
      sortHistoryEvents(
        current.map((row) => (row.id === event.id ? nextEvent : row)),
      ),
    );
  }
  async function deleteHistoryEvent(event: ClientHistoryEventRow) {
    if (!client) throw new Error("Client not loaded.");
    const companyLegacyId =
      typeof client.company_glide_row_id === "string" && client.company_glide_row_id
        ? client.company_glide_row_id
        : typeof client.company_id === "string"
          ? client.company_id
          : "";
    if (!companyLegacyId) throw new Error("Missing company id.");
    const { data, error } = await supabase.functions.invoke(
      "manage-client-history",
      {
        body: {
          action: "delete",
          source: historyActionSource(event),
          companyLegacyId,
          clientLegacyId: client.glide_row_id,
          eventId: historyActionEventId(event),
        },
      },
    );
    if (error || data?.error) {
      throw new Error(data?.error ?? error?.message ?? "Could not delete history entry.");
    }
    setHistoryEvents((current) => current.filter((row) => row.id !== event.id));
  }
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
      const archived = withContractSource(data.contract as ContractRow, "app");
      setContracts((current) =>
        current.map((row) =>
          row.glide_row_id === archived.glide_row_id ? archived : row,
        ),
      );
    }
    if (data?.event) {
      setHistoryEvents((current) =>
        sortHistoryEvents([data.event as ClientHistoryEventRow, ...current]),
      );
    }
  }
  async function deleteContract(contract: ContractRow) {
    if (!client || !contract.glide_row_id || archivingContractId) return;
    const confirmed = window.confirm(
      "Delete this app-owned contract forever? Contract history and audit will record the deletion before the row is removed.",
    );
    if (!confirmed) return;
    setArchivingContractId(contract.glide_row_id);
    const { data, error } = await supabase.functions.invoke(
      "manage-client-contract",
      {
        body: {
          action: "delete",
          clientLegacyId: client.glide_row_id,
          contractId: contract.glide_row_id,
          notes: "Deleted from client contract tab.",
        },
      },
    );
    setArchivingContractId(null);
    if (error || data?.error) {
      window.alert(data?.error ?? error?.message ?? "Could not delete contract.");
      return;
    }
    if (data?.client) {
      setClient(mapAppClientRow(data.client as Record<string, unknown>));
    }
    if (data?.deletedContractId) {
      setContracts((current) =>
        current.filter((row) => row.glide_row_id !== data.deletedContractId),
      );
    }
    if (data?.event) {
      setHistoryEvents((current) =>
        [data.event as ClientHistoryEventRow, ...current].slice(0, 25),
      );
    }
  }
  async function deleteClient() {
    if (!client || deletingClient) return;
    const reason = window.prompt(
      `Delete ${client.client_name ?? "this client"} permanently from RetainOS?\n\nThis removes the app-owned client plus related tasks, contracts, history, links, notifications, and checkpoint data. Type a short reason to continue.`,
      "Ghost client / refunded before kickoff",
    );
    if (!reason?.trim()) return;
    const confirmed = window.confirm(
      `Final confirmation: permanently delete ${client.client_name ?? "this client"}? This cannot be undone from the app.`,
    );
    if (!confirmed) return;

    setDeletingClient(true);
    const { data, error } = await supabase.functions.invoke("manage-client-delete", {
      body: {
        clientLegacyId: client.glide_row_id,
        reason: reason.trim(),
      },
    });
    setDeletingClient(false);

    if (error || data?.error) {
      window.alert(
        data?.error ??
          (error ? await functionErrorMessage(error) : null) ??
          "Could not delete client.",
      );
      return;
    }

    window.localStorage.setItem(
      CLIENTS_ROSTER_REFRESH_KEY,
      JSON.stringify({
        clientId: client.glide_row_id,
        deleted: true,
        updatedAt: Date.now(),
      }),
    );
    navigate("/clients", { replace: true });
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
            {!canEditProfile ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Read-only preview
              </div>
            ) : null}
            {canDeleteClient ? (
              <button
                type="button"
                onClick={() => void deleteClient()}
                disabled={deletingClient}
                className="retainos-focus rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
              >
                {deletingClient ? "Deleting..." : "Delete Client"}
              </button>
            ) : null}
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
        <HistorySection
          events={historyEvents}
          canManageHistory={canManageHistory}
          onChangeDate={changeHistoryDate}
          onDelete={deleteHistoryEvent}
        />
      ) : activeTab === "contract" ? (
        <ContractSection
          client={client}
          contracts={contracts}
          canCreateContract={canCreateContract}
          canDeleteContract={canDeleteContract}
          onCreateContract={() => setCreatingContract(true)}
          onEditContract={(contract) => setEditingContract(contract)}
          onArchiveContract={(contract) => void archiveContract(contract)}
          onDeleteContract={(contract) => void deleteContract(contract)}
        />
      ) : activeTab === "pathways" ? (
        <PathwaysSection
          client={client}
          offers={offers}
          clientMilestones={clientMilestones}
          offerMilestones={offerMilestones}
          relationLookup={displayLookup}
          notificationPreferences={notificationPreferences}
          secondaryPathwaysEnabled={secondaryPathwaysEnabled}
          canAdvanceMilestones={canEditProfile && capabilities.canAdvanceClientMilestones}
          canManagePathways={canEditProfile && capabilities.canManageClientPathways}
          onStartMilestone={(progress) =>
            setMilestoneAction({ action: "start_milestone", progress })
          }
          onCompleteMilestone={(progress) =>
            setMilestoneAction({ action: "complete_milestone", progress })
          }
          onStartSecondaryMilestone={(progress) =>
            setMilestoneAction({ action: "start_secondary_milestone", progress })
          }
          onCompleteSecondaryMilestone={(progress) =>
            setMilestoneAction({
              action: "complete_secondary_milestone",
              progress,
            })
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
            customFields={customFields}
            customFieldValues={customFieldValues}
            onSaved={(updatedClient, event, customFieldChanges) => {
              setClient(updatedClient);
              applyCustomFieldChanges(customFieldChanges);
              if (event) {
                setHistoryEvents((current) => [event, ...current].slice(0, 25));
              }
            }}
          />
        </div>
      ) : (
        <>
          <div className="rounded-md border border-[#e4e9f0] bg-white p-5 shadow-sm">
            {activeTab === "program" ? (
              <div className="mb-4 flex flex-col gap-3 border-b border-[#e4e9f0] pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-700">
                    Program
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Update the operating notes that CSMs use between check-ins.
                  </p>
                </div>
                {canEditProfile ? (
                  <button
                    type="button"
                    onClick={() => setEditingNextSteps(true)}
                    className="retainos-button-secondary"
                  >
                    Update Next Steps/Contact
                  </button>
                ) : null}
              </div>
            ) : null}
            <FieldGrid
              fields={activeFields}
              client={client}
              programChoices={programChoices}
              relationLookup={displayLookup}
              latestRecordingUrl={
                activeTab === "program" ? latestFathomRecordingUrl : null
              }
              canEditNorthStar={activeTab === "program" && canEditProfile}
              onEditNorthStar={() => setEditingProfile(true)}
            />
          </div>
          {activeTab === "details" ? <ClientExternalLinksSection client={client} /> : null}
        </>
      )}
      {editingProfile ? (
        <ClientProfileEditModal
          client={client}
          teamMembers={teamMembers}
          canManageAssignment={canManageAssignment}
          secondaryAssigneeEnabled={secondaryAssigneeEnabled}
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
      {editingNextSteps ? (
        <ClientNextStepsModal
          client={client}
          latestRecordingUrl={latestFathomRecordingUrl}
          onClose={() => setEditingNextSteps(false)}
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
          customFields={customFields}
          customFieldValues={customFieldValues}
          onClose={() => setEditingOutcomes(false)}
          onSaved={(updatedClient, event, customFieldChanges) => {
            setClient(updatedClient);
            applyCustomFieldChanges(customFieldChanges);
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
          churnReasons={churnReasons}
          allowStatusChangeRetention={allowStatusChangeRetention}
          onClose={() => setChangingStatus(false)}
          onSaved={(updatedClient, event, updatedContract) => {
            setClient(updatedClient);
            if (updatedContract) {
              const appContract = withContractSource(updatedContract, "app");
              setContracts((current) => [
                appContract,
                ...current.filter(
                  (contract) => contract.glide_row_id !== appContract.glide_row_id,
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
            const appContract = withContractSource(contract, "app");
            setClient(updatedClient);
            setContracts((current) => [appContract, ...current]);
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
            const appContract = withContractSource(contract, "app");
            setClient(updatedClient);
            setContracts((current) => [
              appContract,
              ...current.filter((row) => row.glide_row_id !== appContract.glide_row_id),
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
          clientMilestones={clientMilestones}
          offerMilestones={offerMilestones}
          relationLookup={displayLookup}
          secondaryPathwaysEnabled={secondaryPathwaysEnabled}
          onClose={() => setChangingPathway(false)}
          onSaved={(updatedClient, milestone, event) => {
            setClient(updatedClient);
            if (milestone) upsertMilestone(milestone);
            if (event) {
              setHistoryEvents((current) => [event, ...current].slice(0, 25));
            }
          }}
        />
      ) : null}
    </div>
  );
}
