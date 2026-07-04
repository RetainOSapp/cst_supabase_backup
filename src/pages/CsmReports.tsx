import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAccountContext } from "../lib/accountContext.tsx";
import { ProgramStatusPill, type ProgramChoice } from "../lib/clientDisplay.tsx";
import { loadCompanyWorkspaceDefaults } from "../lib/companySettings.ts";
import { supabase } from "../lib/supabase.ts";

type DatePreset = "today" | "7" | "14" | "30" | "custom";
type SortField = "client" | "csm" | "status" | "updated";
type SortDirection = "asc" | "desc";

const ACTIVE_CLIENT_STATUSES = new Set(["front-end", "back-end"]);
const HISTORY_CLIENT_ID_CHUNK_SIZE = 250;

interface AppCompany {
  id: string;
  legacy_glide_row_id: string | null;
  migration_status: string | null;
}

interface TeamMember {
  id?: string | null;
  legacy_glide_row_id?: string | null;
  glide_row_id?: string | null;
  name: string | null;
  email?: string | null;
  is_archived?: boolean | null;
  role_id?: number | null;
  role_is_saa_s_admin?: boolean | null;
  role_read_only_user?: boolean | null;
  role_hide_from_csm_list?: boolean | null;
  hide_from_csm_list?: boolean | null;
  role?: string | null;
  status?: string | null;
}

interface ClientRow {
  glide_row_id: string;
  client_name: string | null;
  client_image?: string | null;
  company_id?: string | null;
  company_glide_row_id?: string | null;
  csm_team_member_id: string | null;
  csm_secondary_assignee_id?: string | null;
  program_status_value?: string | null;
  outcomes_success_for_filtering?: string | null;
  outcomes_progress_for_filtering?: string | null;
  outcomes_buy_in_for_filtering?: string | null;
  next_steps_value?: string | null;
  offer_milestones_current_milestone_id?: string | null;
  offer_milestones_current_milestone_change_date?: string | null;
  outcomes_progress_date?: string | null;
  outcomes_buy_in_date?: string | null;
  csm_date_of_last_contact?: string | null;
  csm_date_of_next_contact?: string | null;
}

interface HistoryEventRow {
  id: string;
  legacy_client_glide_row_id: string;
  actor_member_id: string | null;
  event_type: string | null;
  title: string | null;
  summary: string | null;
  notes: string | null;
  next_steps?: string | null;
  last_contact_at?: string | null;
  next_contact_at?: string | null;
  progress_status?: string | null;
  buy_in_status?: string | null;
  created_at: string | null;
}

interface MirrorHistoryRow {
  client_id: string | null;
  change_type_code: string | null;
  value: string | null;
  original_value: string | null;
  modified_date: string | null;
}

interface ReportRow {
  client: ClientRow;
  csmName: string;
  latestEvent: HistoryEventRow | null;
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
    client: ClientRow;
    csmName: string;
    score: number;
    complete: boolean;
    fields: Record<ProfileUpkeepFieldKey, boolean>;
  }>;
}

function isoDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return isoDateInput(date);
}

function defaultEndDate() {
  return isoDateInput(new Date());
}

function freshnessStartDate(days: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - Math.max(1, Math.round(days)));
  return date;
}

function presetStartDate(preset: Exclude<DatePreset, "custom">) {
  if (preset === "today") return defaultEndDate();
  return daysAgo(Number(preset));
}

function formatDate(value: unknown) {
  if (!value) return "--";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value: unknown) {
  if (!value) return "--";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function dateFromValue(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isDateInRange(value: unknown, rangeStart: Date, rangeEnd: Date) {
  const date = dateFromValue(value);
  return Boolean(date && date >= rangeStart && date <= rangeEnd);
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
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

function mapAppClientRow(row: Record<string, unknown>): ClientRow {
  return {
    ...row,
    company_id:
      typeof row.company_glide_row_id === "string"
        ? row.company_glide_row_id
        : (row.company_id as string | null | undefined),
  } as ClientRow;
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

function isActiveClient(client: ClientRow) {
  return ACTIVE_CLIENT_STATUSES.has(client.program_status_value ?? "");
}

function sortText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function calculateProfileUpkeep(
  rows: ReportRow[],
  historyRows: HistoryEventRow[],
  rangeStart: Date,
  rangeEnd: Date,
): ProfileUpkeepSummary {
  const historyByClientId = new Map<string, HistoryEventRow[]>();

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

  rows.forEach((row) => {
    const clientHistory = historyByClientId.get(row.client.glide_row_id) ?? [];
    const hasRecentHistory = (predicate: (event: HistoryEventRow) => boolean) =>
      clientHistory.some((event) => {
        const eventDate = dateFromValue(event.created_at);
        return (
          Boolean(eventDate && eventDate >= rangeStart && eventDate <= rangeEnd) &&
          predicate(event)
        );
      });
    const fieldFreshness: Record<ProfileUpkeepFieldKey, boolean> = {
      nextSteps: hasRecentHistory((event) => hasText(event.next_steps)),
      milestone:
        hasRecentHistory((event) =>
          [
            "client_pathway_changed",
            "client_milestone_started",
            "client_milestone_completed",
          ].includes(event.event_type ?? ""),
        ) ||
        (hasText(row.client.offer_milestones_current_milestone_id) &&
          isDateInRange(
            row.client.offer_milestones_current_milestone_change_date,
            rangeStart,
            rangeEnd,
          )),
      lastContact:
        hasRecentHistory((event) => Boolean(event.last_contact_at)) ||
        isDateInRange(row.client.csm_date_of_last_contact, rangeStart, rangeEnd),
      nextContact:
        hasRecentHistory((event) => Boolean(event.next_contact_at)) ||
        isDateInRange(row.client.csm_date_of_next_contact, rangeStart, rangeEnd),
      progress:
        hasRecentHistory((event) => hasText(event.progress_status)) ||
        isDateInRange(row.client.outcomes_progress_date, rangeStart, rangeEnd),
      buyIn:
        hasRecentHistory((event) => hasText(event.buy_in_status)) ||
        isDateInRange(row.client.outcomes_buy_in_date, rangeStart, rangeEnd),
    };

    const freshForClient = Object.entries(fieldFreshness).filter(([, fresh]) => fresh);
    freshForClient.forEach(([field]) => {
      fieldFreshCounts[field as ProfileUpkeepFieldKey] += 1;
    });
    if (freshForClient.length === Object.keys(fieldFreshness).length) {
      completeClientCount += 1;
    }
    clientScores.push({
      client: row.client,
      csmName: row.csmName,
      score: Math.round(
        (freshForClient.length / Object.keys(fieldFreshness).length) * 100,
      ),
      complete: freshForClient.length === Object.keys(fieldFreshness).length,
      fields: fieldFreshness,
    });
  });

  const fieldKeys = Object.keys(fieldFreshCounts) as ProfileUpkeepFieldKey[];
  const checkedFieldCount = rows.length * fieldKeys.length;
  const freshFieldCount = fieldKeys.reduce(
    (sum, field) => sum + fieldFreshCounts[field],
    0,
  );

  return {
    clientCount: rows.length,
    checkedFieldCount,
    freshFieldCount,
    averageScore:
      checkedFieldCount === 0
        ? 0
        : Math.round((freshFieldCount / checkedFieldCount) * 100),
    completeClientCount,
    fieldScores: fieldKeys.reduce((scores, field) => {
      scores[field] =
        rows.length === 0
          ? 0
          : Math.round((fieldFreshCounts[field] / rows.length) * 100);
      return scores;
    }, {} as Record<ProfileUpkeepFieldKey, number>),
    clients: clientScores.sort(
      (a, b) =>
        a.score - b.score ||
        (a.client.client_name ?? "").localeCompare(b.client.client_name ?? ""),
    ),
  };
}

export function CsmReports() {
  const {
    capabilities,
    effectiveCompanyId,
    teamMemberId,
  } = useAccountContext();
  const [appCompanyByLegacyId, setAppCompanyByLegacyId] = useState(
    new Map<string, AppCompany>(),
  );
  const [companyId, setCompanyId] = useState(effectiveCompanyId);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [programChoices, setProgramChoices] = useState<ProgramChoice[]>([]);
  const [csmId, setCsmId] = useState("");
  const [preset, setPreset] = useState<DatePreset>("30");
  const [startDate, setStartDate] = useState(presetStartDate("30"));
  const [endDate, setEndDate] = useState(defaultEndDate());
  const [profileUpkeepFreshnessDays, setProfileUpkeepFreshnessDays] =
    useState(14);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [profileUpkeep, setProfileUpkeep] =
    useState<ProfileUpkeepSummary | null>(null);
  const [profileUpkeepDetail, setProfileUpkeepDetail] = useState<{
    title: string;
    summary: string;
    updatedLabel: string;
    missingLabel: string;
    updated: ProfileUpkeepSummary["clients"];
    missing: ProfileUpkeepSummary["clients"];
  } | null>(null);
  const [csmSummaryDetail, setCsmSummaryDetail] = useState<{
    title: string;
    rows: ReportRow[];
  } | null>(null);
  const [sortField, setSortField] = useState<SortField>("csm");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedAppCompany = companyId
    ? appCompanyByLegacyId.get(companyId) ?? null
    : null;
  const usesAppClients =
    selectedAppCompany?.migration_status === "pilot" ||
    selectedAppCompany?.migration_status === "migrated";

  const visibleTeamMembers = useMemo(
    () => teamMembers.filter(managesClients),
    [teamMembers],
  );

  const visibleTeamMemberIds = useMemo(
    () => new Set(visibleTeamMembers.map(teamMemberOptionId).filter(Boolean)),
    [visibleTeamMembers],
  );

  const teamNameByMemberId = useMemo(() => {
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
  }, [teamMembers]);

  const latestByClientId = useMemo(() => {
    const map = new Map<string, HistoryEventRow>();
    for (const row of rows) {
      if (row.latestEvent) {
        map.set(row.client.glide_row_id, row.latestEvent);
      }
    }
    return map;
  }, [rows]);

  const updatedRows = rows.filter((row) => row.latestEvent);
  const updateRate =
    rows.length === 0 ? 0 : Math.round((updatedRows.length / rows.length) * 100);

  const csmSummaryRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.client.csm_team_member_id &&
          visibleTeamMemberIds.has(row.client.csm_team_member_id) &&
          row.csmName !== "Unassigned",
      ),
    [rows, visibleTeamMemberIds],
  );

  const csmSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        csmId: string;
        csmName: string;
        total: number;
        updated: number;
        notUpdated: number;
      }
    >();
    for (const row of csmSummaryRows) {
      const key = row.client.csm_team_member_id ?? "unassigned";
      const current =
        map.get(key) ??
        {
          csmId: key,
          csmName: row.csmName,
          total: 0,
          updated: 0,
          notUpdated: 0,
        };
      current.total += 1;
      if (row.latestEvent) current.updated += 1;
      else current.notUpdated += 1;
      map.set(key, current);
    }
    return [...map.values()].sort((a, b) => a.csmName.localeCompare(b.csmName));
  }, [csmSummaryRows]);

  const sortedRows = useMemo(() => {
    const nextRows = [...rows];
    nextRows.sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      if (sortField === "client") {
        aValue = sortText(a.client.client_name);
        bValue = sortText(b.client.client_name);
      } else if (sortField === "csm") {
        aValue = sortText(a.csmName);
        bValue = sortText(b.csmName);
      } else if (sortField === "status") {
        aValue = sortText(a.client.program_status_value);
        bValue = sortText(b.client.program_status_value);
      } else {
        aValue = a.latestEvent ? 1 : 0;
        bValue = b.latestEvent ? 1 : 0;
      }

      const result =
        typeof aValue === "number" && typeof bValue === "number"
          ? aValue - bValue
          : String(aValue).localeCompare(String(bValue));
      return sortDirection === "asc" ? result : -result;
    });
    return nextRows;
  }, [rows, sortDirection, sortField]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDirection(field === "updated" ? "desc" : "asc");
  }

  function sortLabel(field: SortField) {
    if (sortField !== field) return "";
    return sortDirection === "asc" ? " ↑" : " ↓";
  }

  function openCsmSummaryDetail(csmId: string, csmName: string) {
    const detailRows = csmSummaryRows
      .filter((row) => row.client.csm_team_member_id === csmId)
      .sort((a, b) => {
        const updatedSort =
          Number(Boolean(a.latestEvent)) - Number(Boolean(b.latestEvent));
        return (
          updatedSort ||
          sortText(a.client.client_name).localeCompare(
            sortText(b.client.client_name),
          )
        );
      });
    setCsmSummaryDetail({
      title: `${csmName} Profile Updates`,
      rows: detailRows,
    });
  }

  function openProfileUpkeepFieldDetail(
    field: ProfileUpkeepFieldKey,
    label: string,
  ) {
    if (!profileUpkeep) return;
    const updated = profileUpkeep.clients.filter((row) => row.fields[field]);
    const missing = profileUpkeep.clients.filter((row) => !row.fields[field]);
    setProfileUpkeepDetail({
      title: `Field Upkeep: ${label}`,
      summary: `${updated.length.toLocaleString()} updated · ${missing.length.toLocaleString()} not updated`,
      updatedLabel: `${label} updated`,
      missingLabel: `${label} not updated`,
      updated,
      missing,
    });
  }

  function openProfileUpkeepCompleteDetail() {
    if (!profileUpkeep) return;
    const complete = profileUpkeep.clients.filter((row) => row.complete);
    const incomplete = profileUpkeep.clients.filter((row) => !row.complete);
    setProfileUpkeepDetail({
      title: "Field Upkeep: Complete Profiles",
      summary: `${complete.length.toLocaleString()} complete · ${incomplete.length.toLocaleString()} incomplete`,
      updatedLabel: "Complete profiles",
      missingLabel: "Incomplete profiles",
      updated: complete,
      missing: incomplete,
    });
  }

  useEffect(() => {
    if (!effectiveCompanyId || effectiveCompanyId === companyId) return;
    setCompanyId(effectiveCompanyId);
    setCsmId("");
  }, [companyId, effectiveCompanyId]);

  useEffect(() => {
    let cancelled = false;
    async function loadCompanies() {
      const appResult = await supabase
        .from("companies")
        .select("id, legacy_glide_row_id, migration_status");

      if (cancelled) return;
      if (appResult.error) console.error("Failed to load app companies:", appResult.error);
      setAppCompanyByLegacyId(
        new Map(
          ((appResult.data ?? []) as AppCompany[])
            .filter((company) => company.legacy_glide_row_id)
            .map((company) => [company.legacy_glide_row_id as string, company]),
        ),
      );
    }
    void loadCompanies();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!companyId) {
      setTeamMembers([]);
      return;
    }
    let cancelled = false;
    async function loadTeam() {
      const appCompany = usesAppClients
        ? appCompanyByLegacyId.get(companyId)
        : null;
      if (appCompany) {
        const { data, error } = await supabase
          .from("company_members")
          .select(
            "id, legacy_glide_row_id, name, email, role, hide_from_csm_list, status",
          )
          .eq("company_id", appCompany.id)
          .eq("status", "active")
          .order("name", { ascending: true });
        if (cancelled) return;
        if (error) console.error("Failed to load app team:", error);
        const rows = ((data ?? []) as unknown as TeamMember[]).map((member) => ({
          ...member,
          glide_row_id: member.legacy_glide_row_id || member.id || "",
          is_archived: false,
        }));
        setTeamMembers(rows);
        if (csmId && !rows.some((member) => teamMemberOptionId(member) === csmId)) {
          setCsmId("");
        }
        return;
      }

      const { data, error } = await supabase
        .from("backup_company_team")
        .select(
          "glide_row_id, name, email, is_archived, role_id, role_is_saa_s_admin, role_read_only_user, role_hide_from_csm_list",
        )
        .eq("company_id", companyId)
        .order("name", { ascending: true });
      if (cancelled) return;
      if (error) console.error("Failed to load backup team:", error);
      const rows = ((data ?? []) as unknown as TeamMember[]).map((member) => ({
        ...member,
        glide_row_id: member.glide_row_id ?? "",
      }));
      setTeamMembers(rows);
      if (csmId && !rows.some((member) => teamMemberOptionId(member) === csmId)) {
        setCsmId("");
      }
    }
    void loadTeam();
    return () => {
      cancelled = true;
    };
  }, [appCompanyByLegacyId, companyId, csmId, usesAppClients]);

  useEffect(() => {
    if (!companyId) {
      setProfileUpkeepFreshnessDays(14);
      return;
    }
    let cancelled = false;
    async function loadWorkspaceDefaults() {
      const defaults = await loadCompanyWorkspaceDefaults(companyId);
      if (cancelled) return;
      setProfileUpkeepFreshnessDays(defaults.profileUpkeepFreshnessDays);
    }
    void loadWorkspaceDefaults();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  useEffect(() => {
    if (programChoices.length > 0) return;
    let cancelled = false;
    async function loadProgramChoices() {
      const { data, error } = await supabase
        .from("backup_choices")
        .select("program_value, program_label, program_emoji")
        .not("program_value", "is", null)
        .order("index", { ascending: true });
      if (cancelled) return;
      if (error) console.error("Failed to load program choices:", error);
      setProgramChoices((data ?? []) as ProgramChoice[]);
    }
    void loadProgramChoices();
    return () => {
      cancelled = true;
    };
  }, [programChoices.length]);

  const loadReport = useCallback(async () => {
    if (!companyId) {
      setRows([]);
      setProfileUpkeep(null);
      return;
    }
    setLoading(true);
    setError(null);

    const sourceTable = usesAppClients ? "clients" : "backup_company_clients";
    const clientSelect = usesAppClients
      ? [
          "glide_row_id",
          "client_name",
          "client_image",
          "company_id",
          "company_glide_row_id",
          "csm_team_member_id",
          "csm_secondary_assignee_id",
          "program_status_value",
          "outcomes_success_value_for_filtering",
          "outcomes_progress_for_filtering",
          "outcomes_buy_in_for_filtering",
          "next_steps_value",
          "offer_milestones_current_milestone_id",
          "offer_milestones_current_milestone_change_date",
          "outcomes_progress_date",
          "outcomes_buy_in_date",
          "csm_date_of_last_contact",
          "csm_date_of_next_contact",
        ].join(", ")
      : [
          "glide_row_id",
          "client_name",
          "client_image",
          "company_id",
          "csm_team_member_id",
          "csm_secondary_assignee_id",
          "program_status_value",
          "outcomes_progress_for_filtering",
          "outcomes_buy_in_for_filtering",
          "next_steps_value",
          "offer_milestones_current_milestone_id",
          "offer_milestones_current_milestone_change_date",
          "outcomes_progress_date",
          "outcomes_buy_in_date",
          "csm_date_of_last_contact",
          "csm_date_of_next_contact",
        ].join(", ");
    let clientsQuery = supabase
      .from(sourceTable)
      .select(clientSelect)
      .eq(usesAppClients ? "company_glide_row_id" : "company_id", companyId)
      .in("program_status_value", [...ACTIVE_CLIENT_STATUSES])
      .order("client_name", { ascending: true, nullsFirst: false })
      .limit(5000);

    if (teamMemberId && capabilities.canViewOnlyAssignedClients) {
      clientsQuery = clientsQuery.or(
        `csm_team_member_id.eq.${teamMemberId},csm_secondary_assignee_id.eq.${teamMemberId}`,
      );
    } else if (csmId) {
      clientsQuery = clientsQuery.eq("csm_team_member_id", csmId);
    }

    const { data: clientData, error: clientsError } = await clientsQuery;
    if (clientsError) {
      setRows([]);
      setError(clientsError.message);
      setLoading(false);
      return;
    }

    const clients = (usesAppClients
      ? ((clientData ?? []) as unknown as Record<string, unknown>[]).map(
          mapAppClientRow,
        )
      : ((clientData ?? []) as unknown as ClientRow[])).filter(isActiveClient);
    const clientIds = clients.map((client) => client.glide_row_id);
    const appCompany = usesAppClients
      ? appCompanyByLegacyId.get(companyId)
      : null;

    let historyRows: HistoryEventRow[] = [];
    const reportStartDate = new Date(`${startDate}T00:00:00.000Z`);
    const reportEndDate = new Date(`${endDate}T23:59:59.999Z`);
    const upkeepStartDate = freshnessStartDate(profileUpkeepFreshnessDays);
    const upkeepEndDate = new Date();
    upkeepEndDate.setHours(23, 59, 59, 999);
    const historyStartDate =
      reportStartDate < upkeepStartDate ? reportStartDate : upkeepStartDate;
    const historyEndDate =
      reportEndDate > upkeepEndDate ? reportEndDate : upkeepEndDate;
    if (appCompany && clientIds.length > 0) {
      for (const clientIdChunk of chunkArray(clientIds, HISTORY_CLIENT_ID_CHUNK_SIZE)) {
        const { data: historyData, error: historyError } = await supabase
          .from("client_history_events")
          .select(
            [
              "id",
              "legacy_client_glide_row_id",
              "actor_member_id",
              "event_type",
              "title",
              "summary",
              "notes",
              "next_steps",
              "last_contact_at",
              "next_contact_at",
              "progress_status",
              "buy_in_status",
              "created_at",
            ].join(", "),
          )
          .eq("company_id", appCompany.id)
          .in("legacy_client_glide_row_id", clientIdChunk)
          .gte("created_at", historyStartDate.toISOString())
          .lte("created_at", historyEndDate.toISOString())
          .order("created_at", { ascending: false });

        if (historyError) {
          setError(historyError.message);
          break;
        }
        historyRows.push(...((historyData ?? []) as unknown as HistoryEventRow[]));
      }
    } else if (clientIds.length > 0) {
      const mirrorRows: MirrorHistoryRow[] = [];
      for (const clientIdChunk of chunkArray(clientIds, HISTORY_CLIENT_ID_CHUNK_SIZE)) {
        const { data: mirrorHistoryData, error: mirrorHistoryError } = await supabase
          .from("backup_company_clients_history")
          .select("client_id, change_type_code, value, original_value, modified_date")
          .in("client_id", clientIdChunk)
          .gte("modified_date", historyStartDate.toISOString())
          .lte("modified_date", historyEndDate.toISOString())
          .order("modified_date", { ascending: false })
          .limit(5000);

        if (mirrorHistoryError) {
          console.error("Failed to load mirror CSM report history:", mirrorHistoryError);
          break;
        }
        mirrorRows.push(...((mirrorHistoryData ?? []) as MirrorHistoryRow[]));
      }
      historyRows = mirrorRows
        .filter((row) => row.client_id && row.modified_date)
        .map((row, index) => ({
            id: `mirror-${row.client_id}-${row.modified_date}-${index}`,
            legacy_client_glide_row_id: row.client_id as string,
            actor_member_id: null,
            event_type: row.change_type_code ?? "glide_profile_change",
            title: row.change_type_code
              ? `CST ${row.change_type_code} change`
              : "CST profile change",
            summary:
              row.original_value || row.value
                ? `${row.original_value ?? "--"} -> ${row.value ?? "--"}`
                : null,
            notes: null,
            created_at: row.modified_date,
          }));
    }

    const latest = new Map<string, HistoryEventRow>();
    for (const event of historyRows) {
      const eventDate = dateFromValue(event.created_at);
      if (
        eventDate &&
        !Number.isNaN(reportStartDate.getTime()) &&
        eventDate < reportStartDate
      ) {
        continue;
      }
      if (
        eventDate &&
        !Number.isNaN(reportEndDate.getTime()) &&
        eventDate > reportEndDate
      ) {
        continue;
      }
      if (!latest.has(event.legacy_client_glide_row_id)) {
        latest.set(event.legacy_client_glide_row_id, event);
      }
    }

    const reportRows = clients.map((client) => ({
        client,
        csmName:
          teamNameByMemberId.get(client.csm_team_member_id ?? "") ?? "Unassigned",
        latestEvent: latest.get(client.glide_row_id) ?? null,
      }));
    setRows(reportRows);
    setProfileUpkeep(
      calculateProfileUpkeep(
        reportRows,
        historyRows,
        upkeepStartDate,
        upkeepEndDate,
      ),
    );
    setLoading(false);
  }, [
    appCompanyByLegacyId,
    capabilities.canViewOnlyAssignedClients,
    companyId,
    csmId,
    endDate,
    profileUpkeepFreshnessDays,
    startDate,
    teamMemberId,
    teamNameByMemberId,
    usesAppClients,
  ]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  function applyPreset(nextPreset: DatePreset) {
    setPreset(nextPreset);
    if (nextPreset !== "custom") {
      setStartDate(presetStartDate(nextPreset));
      setEndDate(defaultEndDate());
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">CSM Reports</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track profile update compliance for the selected company and CSM.
        </p>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
              CSM
            </span>
            <select
              value={csmId}
              onChange={(event) => setCsmId(event.target.value)}
              disabled={capabilities.canViewOnlyAssignedClients}
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="">All CSMs</option>
              {visibleTeamMembers.map((member) => (
                <option
                  key={teamMemberOptionId(member)}
                  value={teamMemberOptionId(member)}
                >
                  {member.name ?? "(unnamed)"}
                </option>
              ))}
            </select>
          </label>

          <div className="lg:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
              Date Range
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyPreset("today")}
                className={`rounded-md border px-3 py-2 text-sm font-medium cursor-pointer ${
                  preset === "today"
                    ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                Today
              </button>
              {(["7", "14", "30"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => applyPreset(value)}
                  className={`rounded-md border px-3 py-2 text-sm font-medium cursor-pointer ${
                    preset === value
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Last {value} days
                </button>
              ))}
              <button
                type="button"
                onClick={() => applyPreset("custom")}
                className={`rounded-md border px-3 py-2 text-sm font-medium cursor-pointer ${
                  preset === "custom"
                    ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                Custom
              </button>
            </div>
          </div>

          {preset === "custom" ? (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
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
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  End Date
                </span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                />
              </label>
            </>
          ) : null}
        </div>
      </section>

      {!companyId ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
          Select a company to load CSM Reports.
        </div>
      ) : (
        <>
          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  Field Upkeep
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  Active clients only. Field freshness uses this company's
                  {` ${profileUpkeepFreshnessDays}`}-day upkeep window; client
                  update rate uses the selected report date range.
                </p>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Client Update Rate
                    </div>
                    <div className="mt-1 flex items-end gap-2">
                      <span className="text-2xl font-semibold text-gray-900">
                        {loading ? "--" : `${updateRate}%`}
                      </span>
                      <span className="pb-0.5 text-sm text-gray-500">
                        {loading
                          ? "Checking clients"
                          : `${updatedRows.length}/${rows.length} clients touched`}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Field Upkeep Score
                    </div>
                    <div className="mt-1 flex items-end gap-2">
                      <span className="text-2xl font-semibold text-gray-900">
                        {loading || !profileUpkeep
                          ? "--"
                          : `${profileUpkeep.averageScore}%`}
                      </span>
                      <span className="pb-0.5 text-sm text-gray-500">
                        {loading || !profileUpkeep
                          ? "Checking fields"
                          : `${profileUpkeep.freshFieldCount}/${profileUpkeep.checkedFieldCount} fields updated`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={openProfileUpkeepCompleteDetail}
                disabled={!profileUpkeep || loading}
                className="w-fit rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600 transition-colors enabled:cursor-pointer enabled:hover:border-indigo-200 enabled:hover:bg-indigo-50 enabled:hover:text-indigo-700 disabled:cursor-default"
              >
                {profileUpkeep
                  ? `${profileUpkeep.completeClientCount}/${profileUpkeep.clientCount} complete profiles`
                  : "RetainOS metric"}
              </button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  key: "nextSteps" as const,
                  label: "Next Steps",
                  score: profileUpkeep?.fieldScores.nextSteps,
                },
                {
                  key: "milestone" as const,
                  label: "Milestone",
                  score: profileUpkeep?.fieldScores.milestone,
                },
                {
                  key: "lastContact" as const,
                  label: "Last Contact",
                  score: profileUpkeep?.fieldScores.lastContact,
                },
                {
                  key: "nextContact" as const,
                  label: "Next Contact",
                  score: profileUpkeep?.fieldScores.nextContact,
                },
                {
                  key: "progress" as const,
                  label: "Progress",
                  score: profileUpkeep?.fieldScores.progress,
                },
                {
                  key: "buyIn" as const,
                  label: "Buy-in",
                  score: profileUpkeep?.fieldScores.buyIn,
                },
              ].map(({ key, label, score }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => openProfileUpkeepFieldDetail(key, label)}
                  disabled={!profileUpkeep || loading}
                  className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-left transition-colors enabled:cursor-pointer enabled:hover:border-indigo-200 enabled:hover:bg-indigo-50 disabled:cursor-default"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-gray-700">
                      {label}
                    </span>
                    <span className="text-sm font-semibold text-gray-900">
                      {loading || score === undefined ? "--" : `${score}%`}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-gray-200">
                    <div
                      className="h-1.5 rounded-full bg-emerald-500"
                      style={{
                        width: `${loading || typeof score !== "number" ? 0 : score}%`,
                      }}
                    />
                  </div>
                </button>
              ))}
            </div>
          </section>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  CSM Summary
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  Updated means at least one{" "}
                  {usesAppClients ? "RetainOS history event" : "CST history change"}{" "}
                  in the selected date range.
                </p>
              </div>
              <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
                {usesAppClients ? "RetainOS data" : "CST roster preview"}
              </span>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      CSM
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Clients
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Updated
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Not Updated
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Rate
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {csmSummary.map((summary) => (
                    <tr key={summary.csmName}>
                      <td className="px-3 py-2 font-medium text-gray-900">
                        <button
                          type="button"
                          onClick={() =>
                            openCsmSummaryDetail(summary.csmId, summary.csmName)
                          }
                          className="font-medium text-gray-900 hover:text-indigo-700 cursor-pointer"
                        >
                          {summary.csmName}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        <button
                          type="button"
                          onClick={() =>
                            openCsmSummaryDetail(summary.csmId, summary.csmName)
                          }
                          className="hover:text-indigo-700 cursor-pointer"
                        >
                          {summary.total}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right text-emerald-700">
                        <button
                          type="button"
                          onClick={() =>
                            openCsmSummaryDetail(summary.csmId, summary.csmName)
                          }
                          className="hover:text-indigo-700 cursor-pointer"
                        >
                          {summary.updated}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right text-amber-700">
                        <button
                          type="button"
                          onClick={() =>
                            openCsmSummaryDetail(summary.csmId, summary.csmName)
                          }
                          className="hover:text-indigo-700 cursor-pointer"
                        >
                          {summary.notUpdated}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {summary.total === 0
                          ? "0%"
                          : `${Math.round((summary.updated / summary.total) * 100)}%`}
                      </td>
                    </tr>
                  ))}
                  {!loading && csmSummary.length === 0 ? (
                    <tr>
                      <td className="px-3 py-8 text-center text-gray-500" colSpan={5}>
                        No clients found for this report.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  Client Profile Updates
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  Showing {formatDate(startDate)} to {formatDate(endDate)}.
                </p>
              </div>
              {loading ? (
                <span className="text-sm text-gray-500">Loading...</span>
              ) : null}
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      <button
                        type="button"
                        onClick={() => toggleSort("client")}
                        className="cursor-pointer uppercase tracking-wider hover:text-indigo-700"
                      >
                        Client{sortLabel("client")}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      <button
                        type="button"
                        onClick={() => toggleSort("csm")}
                        className="cursor-pointer uppercase tracking-wider hover:text-indigo-700"
                      >
                        CSM{sortLabel("csm")}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      <button
                        type="button"
                        onClick={() => toggleSort("status")}
                        className="cursor-pointer uppercase tracking-wider hover:text-indigo-700"
                      >
                        Status{sortLabel("status")}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Progress
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Buy In
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Latest Update
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                      <button
                        type="button"
                        onClick={() => toggleSort("updated")}
                        className="cursor-pointer uppercase tracking-wider hover:text-indigo-700"
                      >
                        Updated?{sortLabel("updated")}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {sortedRows.map((row) => {
                    const updated = latestByClientId.has(row.client.glide_row_id);
                    return (
                      <tr key={row.client.glide_row_id}>
                        <td className="px-3 py-2">
                          <Link
                            to={`/clients/${row.client.glide_row_id}`}
                            className="flex items-center gap-2 font-medium text-gray-900 hover:text-indigo-700"
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-xs font-semibold text-indigo-700">
                              {getInitials(row.client.client_name)}
                            </span>
                            <span>{row.client.client_name ?? "(unnamed)"}</span>
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-gray-700">{row.csmName}</td>
                        <td className="px-3 py-2">
                          <ProgramStatusPill
                            value={row.client.program_status_value}
                            choices={programChoices}
                          />
                        </td>
                        <td className="px-3 py-2 text-gray-700">
                          {row.client.outcomes_progress_for_filtering ?? "--"}
                        </td>
                        <td className="px-3 py-2 text-gray-700">
                          {row.client.outcomes_buy_in_for_filtering ?? "--"}
                        </td>
                        <td className="px-3 py-2 text-gray-700">
                          {row.latestEvent ? (
                            <div>
                              <div className="font-medium text-gray-900">
                                {row.latestEvent.title ??
                                  row.latestEvent.event_type ??
                                  "Update"}
                              </div>
                              <div className="text-xs text-gray-500">
                                {formatDateTime(row.latestEvent.created_at)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-400">No update in range</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                              updated
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                            }`}
                          >
                            {updated ? "Updated" : "Not updated"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {!loading && rows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-10 text-center text-gray-500" colSpan={7}>
                        No client rows found for this report.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {csmSummaryDetail ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close CSM summary detail dialog"
            onClick={() => setCsmSummaryDetail(null)}
            className="absolute inset-0 bg-slate-900/40 cursor-pointer"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative flex max-h-[82vh] w-full max-w-3xl flex-col rounded-xl border border-gray-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {csmSummaryDetail.title}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {csmSummaryDetail.rows.length.toLocaleString()} active client
                  {csmSummaryDetail.rows.length === 1 ? "" : "s"} in this report.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCsmSummaryDetail(null)}
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
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                {csmSummaryDetail.rows.map((row) => (
                  <Link
                    key={row.client.glide_row_id}
                    to={`/clients/${row.client.glide_row_id}`}
                    className="flex items-center justify-between gap-4 px-3 py-3 hover:bg-gray-50"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {row.client.client_image ? (
                        <img
                          src={row.client.client_image}
                          alt=""
                          className="h-10 w-10 rounded-xl border border-gray-200 object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-xs font-semibold text-indigo-700">
                          {getInitials(row.client.client_name)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-gray-900">
                          {row.client.client_name ?? "Unnamed client"}
                        </div>
                        <div className="mt-1">
                          <ProgramStatusPill
                            value={row.client.program_status_value}
                            choices={programChoices}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                          row.latestEvent
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                        }`}
                      >
                        {row.latestEvent ? "Updated" : "Not updated"}
                      </span>
                      <div className="mt-1 text-xs text-gray-500">
                        {row.latestEvent
                          ? formatDateTime(row.latestEvent.created_at)
                          : "No update in range"}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {profileUpkeepDetail ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close profile upkeep detail dialog"
            onClick={() => setProfileUpkeepDetail(null)}
            className="absolute inset-0 bg-slate-900/40 cursor-pointer"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative flex max-h-[82vh] w-full max-w-3xl flex-col rounded-xl border border-gray-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {profileUpkeepDetail.title}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {profileUpkeepDetail.summary}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProfileUpkeepDetail(null)}
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
              {[
                {
                  label: profileUpkeepDetail.updatedLabel,
                  rows: profileUpkeepDetail.updated,
                  tone: "green",
                },
                {
                  label: profileUpkeepDetail.missingLabel,
                  rows: profileUpkeepDetail.missing,
                  tone: "amber",
                },
              ].map((section) => (
                <section key={section.label} className="mb-5 last:mb-0">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-gray-900">
                      {section.label}
                    </h4>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                        section.tone === "green"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                    >
                      {section.rows.length}
                    </span>
                  </div>
                  {section.rows.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center text-sm text-gray-500">
                      No clients in this group.
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                      {section.rows.map(({ client, csmName, score }) => (
                        <Link
                          key={client.glide_row_id}
                          to={`/clients/${client.glide_row_id}`}
                          className="flex items-center justify-between gap-4 px-3 py-3 hover:bg-gray-50"
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
                                {csmName}
                              </div>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700">
                              {score}%
                            </span>
                            <span className="text-xs font-medium text-indigo-600">
                              View
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
