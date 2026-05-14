import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ProgramStatusPill,
  type ProgramChoice,
} from "../lib/clientDisplay.tsx";
import { supabase } from "../lib/supabase.ts";

type ClientRow = Record<string, unknown> & {
  glide_row_id: string;
  client_name?: string | null;
  client_image?: string | null;
  company_id?: string | null;
  csm_team_member_id?: string | null;
  program_status_value?: string | null;
};
interface TeamMember {
  glide_row_id: string;
  name: string | null;
}
type ContractRow = Record<string, unknown> & {
  glide_row_id?: string | null;
  client_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  monthly_value?: number | string | null;
  reference_link?: string | null;
  notes?: string | null;
  auto_renew?: boolean | null;
  last_modified_time?: string | null;
  last_modified_by?: string | null;
};
type ClientMilestoneRow = Record<string, unknown> & {
  glide_row_id?: string | null;
  milestone_id?: string | null;
  offer_id?: string | null;
  start_date?: string | null;
  completion_date?: string | null;
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
const basicInfoFields: [string, string[]][] = [
  ["Business Name", ["business_name", "client_name"]],
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

function formatClientAge(value: unknown) {
  if (!isPresent(value)) return "--";
  const onboarded = new Date(String(value));
  if (Number.isNaN(onboarded.getTime())) return displayValue(value);
  const diffMs = Date.now() - onboarded.getTime();
  const days = Math.max(0, Math.floor(diffMs / 86_400_000));
  return `${days.toLocaleString()} day${days === 1 ? "" : "s"}`;
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
  const end = contractEndDate(contract);
  if (!isPresent(end)) return "Open";
  const endDate = new Date(String(end));
  if (Number.isNaN(endDate.getTime())) return "Open";
  return endDate.getTime() >= Date.now() ? "Active" : "Expired";
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
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {fields.map(([label, candidates]) => (
        <div
          key={label}
          className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3"
        >
          <div className="text-xs font-medium uppercase tracking-wider text-gray-500">
            {label}
          </div>
          <div className="mt-1 text-sm font-medium text-gray-900">
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
              formatClientAge(valueFrom(client, candidates))
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
}: {
  title: string;
  contract: Record<string, unknown>;
  isLatest?: boolean;
}) {
  const referenceLink = valueFrom(contract, [
    "reference_link",
    "current_contract_reference_link",
  ]);
  const notes = valueFrom(contract, ["notes", "current_contract_notes"]);

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
          <span
            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
              getContractStatus(contract) === "Active"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : getContractStatus(contract) === "Expired"
                  ? "border-slate-200 bg-slate-50 text-slate-700"
                  : "border-gray-200 bg-gray-50 text-gray-600"
            }`}
          >
            {getContractStatus(contract)}
          </span>
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
}: {
  client?: ClientRow;
  contracts: ContractRow[];
}) {
  const [showOlderContracts, setShowOlderContracts] = useState(false);
  const showCurrent = hasCurrentContract(client);
  const [latestLinkedContract, ...olderLinkedContracts] = contracts;
  return (
    <div className="space-y-4">
      {showCurrent && (
        <ContractCard title="Current Contract" contract={client as ClientRow} isLatest />
      )}
      {latestLinkedContract && (
        <ContractCard
          title={showCurrent ? "Latest Linked Contract" : "Linked Contract"}
          contract={latestLinkedContract}
          isLatest={!showCurrent}
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
  clientMilestones,
  offerMilestones,
  relationLookup,
}: {
  client: ClientRow;
  clientMilestones: ClientMilestoneRow[];
  offerMilestones: OfferMilestoneRow[];
  relationLookup: Map<string, string>;
}) {
  const offerValue = valueFrom(client, [
    "offer_milestones_current_offer_id",
    "offer_milestones_2nd_current_offer_id",
    "offer_id",
    "offer_name",
  ]);

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <FieldGrid
        fields={[
          ["Offer", ["offer_milestones_current_offer_id", "offer_id", "offer_name"]],
          ["Last Contact", ["csm_date_of_last_contact"]],
          ["Next Contact", ["csm_date_of_next_contact"]],
        ]}
        client={client}
        programChoices={[]}
        relationLookup={relationLookup}
      />

      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-wider text-gray-500">
          Milestones
        </div>
        <div className="mt-3 space-y-2">
          {clientMilestones.length > 0 ? (
            clientMilestones.map((milestone, index) => (
              <div
                key={milestone.glide_row_id ?? `${milestone.milestone_id ?? "milestone"}-${index}`}
                className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                <div className="font-medium text-gray-900">
                  {displayValue(milestone.milestone_id, relationLookup)}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  Start: {formatDate(milestone.start_date)} · Completed:{" "}
                  {formatDate(milestone.completion_date)}
                </div>
              </div>
            ))
          ) : offerMilestones.length > 0 ? (
            offerMilestones.map((milestone, index) => (
              <div
                key={milestone.glide_row_id ?? `${offerValue ?? "offer"}-${index}`}
                className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                <div className="font-medium text-gray-900">
                  {displayValue(milestone.name)}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  Configured for this offer
                  {isPresent(milestone.target_days_to_complete_from_onboarding_date)
                    ? ` · Target ${milestone.target_days_to_complete_from_onboarding_date} days`
                    : ""}
                </div>
              </div>
            ))
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
export function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();
  const [client, setClient] = useState<ClientRow | null>(null);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [clientMilestones, setClientMilestones] = useState<ClientMilestoneRow[]>([]);
  const [offerMilestones, setOfferMilestones] = useState<OfferMilestoneRow[]>([]);
  const [tasks, setTasks] = useState<ClientTaskRow[]>([]);
  const [programChoices, setProgramChoices] = useState<ProgramChoice[]>([]);
  const [relationLookup, setRelationLookup] = useState(new Map<string, string>());
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("details");
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    async function loadClient() {
      setLoading(true);
      setError(null);
      const { data, error: clientError } = await supabase
        .from("backup_company_clients")
        .select("*")
        .eq("glide_row_id", clientId)
        .single();
      if (cancelled) return;
      if (clientError) {
        setError(clientError.message);
        setClient(null);
        setLoading(false);
        return;
      }
      const nextClient = data as ClientRow;
      setClient(nextClient);
      const relationIds = pathwayFields.flatMap(([, candidates]) =>
        extractGlideIds(valueFrom(nextClient, candidates)),
      );
      const offerIds = [
        nextClient.offer_milestones_current_offer_id,
        nextClient.offer_milestones_2nd_current_offer_id,
      ].filter((id): id is string => typeof id === "string" && id.trim() !== "");
      const [
        { data: contractRows },
        { data: choices },
        { data: milestoneRows },
        { data: offerMilestoneRows },
        { data: taskRows },
      ] = await Promise.all([
        supabase
          .from("backup_company_clients_contracts")
          .select("*")
          .eq("client_id", nextClient.glide_row_id)
          .order("end_date", { ascending: false, nullsFirst: false }),
        supabase
          .from("backup_choices")
          .select("program_value, program_label, program_emoji")
          .not("program_value", "is", null)
          .order("index", { ascending: true }),
        supabase
          .from("backup_company_clients_milestones")
          .select("*")
          .eq("client_id", nextClient.glide_row_id)
          .order("start_date", { ascending: false, nullsFirst: false }),
        offerIds.length > 0
          ? supabase
              .from("backup_company_offer_milestones")
              .select("*")
              .in("offer_id", offerIds)
              .order("order", { ascending: true, nullsFirst: false })
          : Promise.resolve({ data: [] }),
        supabase
          .from("backup_company_clients_tasks")
          .select("*")
          .eq("client_id", nextClient.glide_row_id)
          .order("task_due_date", { ascending: true, nullsFirst: false }),
      ]);
      if (!cancelled) {
        setContracts((contractRows ?? []) as ContractRow[]);
        setProgramChoices((choices ?? []) as ProgramChoice[]);
        setClientMilestones((milestoneRows ?? []) as ClientMilestoneRow[]);
        setOfferMilestones((offerMilestoneRows ?? []) as OfferMilestoneRow[]);
        setTasks((taskRows ?? []) as ClientTaskRow[]);
      }
      const milestoneRelationIds = ((milestoneRows ?? []) as ClientMilestoneRow[])
        .flatMap((row) => extractGlideIds(row.milestone_id));
      const lookup = await resolveRelationNames([
        ...relationIds,
        ...milestoneRelationIds,
      ]);
      if (!cancelled) setRelationLookup(lookup);
      if (nextClient.company_id) {
        const { data: members } = await supabase
          .from("backup_company_team")
          .select("glide_row_id, name")
          .eq("company_id", nextClient.company_id)
          .order("name", { ascending: true });
        if (!cancelled) setTeamMembers((members ?? []) as TeamMember[]);
      }
      setLoading(false);
    }
    void loadClient();
    return () => {
      cancelled = true;
    };
  }, [clientId]);
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
  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-indigo-600" />
      </div>
    );
  if (error || !client)
    return (
      <div>
        <Link
          to="/clients"
          className="text-sm text-indigo-600 hover:text-indigo-800"
        >
          &larr; Back to clients
        </Link>
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error ?? "Client not found"}
        </div>
      </div>
    );
  const tabs = [
    { key: "details", label: "Client Details", fields: basicInfoFields },
    { key: "contract", label: "Contract", fields: contractFields },
    { key: "program", label: "Program", fields: programFields },
    { key: "outcomes", label: "Outcomes", fields: outcomeFields },
    { key: "pathways", label: "Pathways & Milestones", fields: pathwayFields },
  ];
  const activeFields =
    tabs.find((tab) => tab.key === activeTab)?.fields ?? basicInfoFields;
  return (
    <div>
      <div className="mb-4">
        <Link
          to="/clients"
          className="text-sm text-indigo-600 hover:text-indigo-800"
        >
          &larr; Back to clients
        </Link>
      </div>
      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            {client.client_image ? (
              <img
                src={client.client_image}
                alt=""
                className="h-16 w-16 rounded-2xl border border-gray-200 bg-gray-50 object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-indigo-100 bg-indigo-50 text-lg font-semibold text-indigo-700">
                {getInitials(client.client_name)}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold text-gray-900">
                {client.client_name ?? "Unnamed client"}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                <span>{csmName}</span>
                <span aria-hidden="true">-</span>
                <ProgramStatusPill
                  value={client.program_status_value}
                  choices={programChoices}
                />
              </div>
            </div>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Read-only preview
          </div>
        </div>
      </div>
      <div className="mb-5 border-b border-gray-200">
        <nav
          className="-mb-px flex gap-5 overflow-x-auto"
          aria-label="Client sections"
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors cursor-pointer ${activeTab === tab.key ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"}`}
            >
              {tab.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setActiveTab("tasks")}
            className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors cursor-pointer ${activeTab === "tasks" ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"}`}
          >
            Tasks
          </button>
        </nav>
      </div>
      {activeTab === "tasks" ? (
        <TasksSection tasks={tasks} teamMemberNameById={teamMemberNameById} />
      ) : activeTab === "contract" ? (
        <ContractSection client={client} contracts={contracts} />
      ) : activeTab === "pathways" ? (
        <PathwaysSection
          client={client}
          clientMilestones={clientMilestones}
          offerMilestones={offerMilestones}
          relationLookup={relationLookup}
        />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <FieldGrid
            fields={activeFields}
            client={client}
            programChoices={programChoices}
            relationLookup={relationLookup}
          />
        </div>
      )}
    </div>
  );
}
