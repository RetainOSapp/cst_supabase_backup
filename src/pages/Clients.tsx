import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase.ts";

const PAGE_SIZE = 12;
type ViewMode = "list" | "card";
type ClientRow = Record<string, unknown> & {
  glide_row_id: string;
  client_name?: string | null;
  client_image?: string | null;
  csm_team_member_id?: string | null;
  csm_secondary_assignee_id?: string | null;
  program_status_value?: string | null;
};
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
interface ProgramChoice {
  program_value: string | null;
  program_label: string | null;
  program_emoji: string | null;
}
interface ClientFilters {
  companyId: string;
  csmId: string;
  secondaryAssigneeId: string;
  programs: string[];
  clientName: string;
  lastContact: string;
}
const emptyFilters: ClientFilters = {
  companyId: "",
  csmId: "",
  secondaryAssigneeId: "",
  programs: [],
  clientName: "",
  lastContact: "",
};
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
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return JSON.stringify(value);
}
function formatDate(value: unknown) {
  if (!value) return "--";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? formatValue(value)
    : date.toLocaleDateString();
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
function StatusPill({ value }: { value: string | null | undefined }) {
  const label = value
    ? value
        .split("-")
        .map((part) => part[0]?.toUpperCase() + part.slice(1))
        .join(" ")
    : "Unknown";
  const color =
    value === "front-end"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : value === "back-end"
        ? "bg-blue-50 text-blue-700 border-blue-200"
        : value === "off-boarded"
          ? "bg-slate-50 text-slate-700 border-slate-200"
          : value === "paused" || value === "suspended"
            ? "bg-amber-50 text-amber-700 border-amber-200"
            : "bg-gray-50 text-gray-600 border-gray-200";
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${color}`}
    >
      {label}
    </span>
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
}: {
  label: string;
  value: unknown;
  display?: "plain" | "rich" | "outcome";
}) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
        {display === "rich" ? (
          <RichValue value={value} />
        ) : display === "outcome" ? (
          <OutcomePill value={value} />
        ) : (
          formatValue(value)
        )}
      </div>
    </div>
  );
}
function QuickUpdateModal({
  client,
  onClose,
}: {
  client: ClientRow;
  onClose: () => void;
}) {
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
              Read-only preview for {client.client_name ?? "Unnamed client"}
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
          <ReadOnlyField
            label="Pathways & Milestones"
            value={valueFrom(client, pathwayColumns)}
            display="rich"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ReadOnlyField
              label="Success"
              value={valueFrom(client, successColumns)}
              display="outcome"
            />
            <ReadOnlyField
              label="Progress"
              value={valueFrom(client, progressColumns)}
              display="outcome"
            />
            <ReadOnlyField
              label="Buy In"
              value={valueFrom(client, buyInColumns)}
              display="outcome"
            />
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Editing is locked for now while this reads from the Glide mirror.
          </div>
        </div>
        <div className="flex justify-end border-t border-gray-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 cursor-pointer"
          >
            Done
          </button>
        </div>
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
export function Clients() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<ClientFilters>(() => ({
    ...emptyFilters,
    companyId: searchParams.get("companyId") ?? "",
  }));
  const [appliedFilters, setAppliedFilters] = useState<ClientFilters>(() => ({
    ...emptyFilters,
    companyId: searchParams.get("companyId") ?? "",
  }));
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamMembersLoading, setTeamMembersLoading] = useState(false);
  const [programChoices, setProgramChoices] = useState<ProgramChoice[]>([]);
  const [programChoicesLoading, setProgramChoicesLoading] = useState(false);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [totalClients, setTotalClients] = useState(0);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  const [quickUpdateClient, setQuickUpdateClient] = useState<ClientRow | null>(
    null,
  );
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
  useEffect(() => {
    async function loadCompanies() {
      const { data, error } = await supabase
        .from("backup_companies")
        .select("glide_row_id, name, enable_secondary_assignee")
        .or("archived.is.null,archived.eq.false")
        .order("name", { ascending: true });
      if (error) console.error("Failed to load companies:", error);
      setCompanies((data ?? []) as Company[]);
      setCompaniesLoading(false);
    }
    void loadCompanies();
  }, []);
  useEffect(() => {
    if (!filters.companyId) {
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
        .eq("company_id", filters.companyId)
        .order("name", { ascending: true });
      if (cancelled) return;
      if (error) console.error("Failed to load team members:", error);
      setTeamMembers((data ?? []) as TeamMember[]);
      setTeamMembersLoading(false);
    }
    void loadTeamMembers();
    return () => {
      cancelled = true;
    };
  }, [filters.companyId]);
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
    let query = supabase
      .from("backup_company_clients")
      .select("*", { count: "exact" })
      .eq("company_id", appliedFilters.companyId)
      .range(from, to);
    if (appliedFilters.clientName.trim())
      query = query.ilike(
        "client_name",
        `%${appliedFilters.clientName.trim()}%`,
      );
    if (appliedFilters.csmId)
      query = query.eq("csm_team_member_id", appliedFilters.csmId);
    if (appliedFilters.secondaryAssigneeId)
      query = query.eq(
        "csm_secondary_assignee_id",
        appliedFilters.secondaryAssigneeId,
      );
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
    query = query.order("client_name", { ascending: true, nullsFirst: false });
    const { data, error, count } = await query;
    if (error) {
      console.error("Failed to load clients:", error);
      setClients([]);
      setTotalClients(0);
      setClientsError(error.message);
    } else {
      const rows = (data ?? []) as ClientRow[];
      setClients(rows);
      setTotalClients(count ?? rows.length);
    }
    setClientsLoading(false);
  }, [appliedFilters, page]);
  useEffect(() => {
    void loadClients();
  }, [loadClients]);
  function applyFilters() {
    if (!filters.companyId) return;
    const next = {
      ...filters,
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
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setClients([]);
    setTotalClients(0);
    setPage(1);
    setSearchParams({}, { replace: true });
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
  });
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Clients</h1>
        <p className="mt-1 text-sm text-gray-500">
          Read-only view of clients mirrored from Glide into Supabase.
        </p>
      </div>
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
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  companyId: e.target.value,
                  csmId: "",
                  secondaryAssigneeId: "",
                }))
              }
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
              <fieldset className="relative">
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
            </div>
          </div>
          {clientsError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {clientsError}
            </div>
          ) : clientsLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-indigo-600" />
            </div>
          ) : clients.length === 0 ? (
            <EmptyState text="No clients matched these filters." />
          ) : viewMode === "list" ? (
            <ClientTable
              clients={clients}
              teamMemberNameById={teamMemberNameById}
              renderClientAvatar={renderClientAvatar}
              clientMeta={clientMeta}
              onOpenClient={(id) =>
                navigate(`/clients/${encodeURIComponent(id)}`)
              }
              onQuickUpdate={setQuickUpdateClient}
            />
          ) : (
            <ClientCards
              clients={clients}
              teamMemberNameById={teamMemberNameById}
              renderClientAvatar={renderClientAvatar}
              clientMeta={clientMeta}
              onOpenClient={(id) =>
                navigate(`/clients/${encodeURIComponent(id)}`)
              }
              onQuickUpdate={setQuickUpdateClient}
            />
          )}
          {!clientsLoading && totalClients > 0 && (
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
    </div>
  );
}
function ClientTable({
  clients,
  teamMemberNameById,
  renderClientAvatar,
  clientMeta,
  onOpenClient,
  onQuickUpdate,
}: {
  clients: ClientRow[];
  teamMemberNameById: Map<string, string>;
  renderClientAvatar: (client: ClientRow) => React.ReactNode;
  clientMeta: (client: ClientRow) => {
    last: unknown;
    next: unknown;
    buyIn: unknown;
    progress: unknown;
  };
  onOpenClient: (id: string) => void;
  onQuickUpdate: (client: ClientRow) => void;
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
                  <StatusPill value={client.program_status_value} />
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
  teamMemberNameById,
  renderClientAvatar,
  clientMeta,
  onOpenClient,
  onQuickUpdate,
}: {
  clients: ClientRow[];
  teamMemberNameById: Map<string, string>;
  renderClientAvatar: (client: ClientRow, size?: string) => React.ReactNode;
  clientMeta: (client: ClientRow) => {
    last: unknown;
    pathway: unknown;
    buyIn: unknown;
    progress: unknown;
  };
  onOpenClient: (id: string) => void;
  onQuickUpdate: (client: ClientRow) => void;
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
              <StatusPill value={client.program_status_value} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <MiniMeta label="Buy In" value={<OutcomePill value={meta.buyIn} />} />
              <MiniMeta
                label="Progress"
                value={<OutcomePill value={meta.progress} />}
              />
              <MiniMeta label="Last Contact" value={formatDate(meta.last)} />
              <MiniMeta label="Pathway" value={formatValue(meta.pathway)} />
            </div>
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
          </div>
        );
      })}
    </div>
  );
}
