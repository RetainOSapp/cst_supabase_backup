import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
  [
    "Client Age",
    [
      "client_age",
      "client_age_value",
      "client_age_weeks",
      "client_age_weeks_value",
      "client_age_days",
    ],
  ],
];
const contractFields: [string, string[]][] = [
  ["Current Contract Start", ["current_contract_start_date"]],
  ["Current Contract End", ["current_contract_end_date"]],
  ["Contract Days", ["current_contract_of_days"]],
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
  ["Milestones", ["milestones", "milestones_value", "milestone", "milestone_name"]],
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
  const text = formatValue(value);
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
}: {
  fields: [string, string[]][];
  client: ClientRow;
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
            {isOutcomeField(label) ? (
              <OutcomePill value={valueFrom(client, candidates)} />
            ) : isRichField(label) ? (
              <RichValue value={valueFrom(client, candidates)} />
            ) : (
              formatValue(valueFrom(client, candidates))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
export function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();
  const [client, setClient] = useState<ClientRow | null>(null);
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
              <p className="mt-1 text-sm text-gray-500">
                {csmName} - {formatValue(client.program_status_value)}
              </p>
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
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
          Tasks will stay read-only here until we wire the dedicated task
          source.
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <FieldGrid fields={activeFields} client={client} />
        </div>
      )}
    </div>
  );
}
