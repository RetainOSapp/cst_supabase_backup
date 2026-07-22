import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ProgramStatusPill, type ProgramChoice } from "../lib/clientDisplay.tsx";
import {
  loadUnifiedCompanyByLegacyId,
  loadUnifiedTeamMembers,
  type UnifiedCompany,
  type UnifiedTeamMember,
} from "../lib/appOwnedData.ts";
import {
  DEFAULT_PROGRAM_STATUS_LABELS,
  enabledNotificationTypes,
  loadCompanyWorkspaceDefaults,
  loadCompanyNotificationPreferences,
  mergeNotificationPreferences,
  notificationPreferenceLabel,
  programStatusChoicesWithLabels,
  type ProgramStatusLabelMap,
  type NotificationPreference,
  type NotificationPreferenceType,
} from "../lib/companySettings.ts";
import { useAccountContext } from "../lib/accountContext.tsx";
import { supabase } from "../lib/supabase.ts";

type PulseWindow = "today" | "week" | "month";
type CsmRelationshipFilter = "both" | "primary" | "secondary";

const PULSE_WINDOW_LABELS: Record<PulseWindow, string> = {
  today: "today",
  week: "this week",
  month: "this month",
};

const CSM_RELATIONSHIP_LABELS: Record<CsmRelationshipFilter, string> = {
  both: "Both",
  primary: "Primary clients",
  secondary: "Secondary clients",
};

interface PulseClient {
  glide_row_id: string;
  client_name: string | null;
  company_id: string | null;
  company_glide_row_id: string | null;
  csm_team_member_id: string | null;
  csm_secondary_assignee_id: string | null;
  program_status_value: string | null;
  csm_date_of_last_contact: string | null;
  csm_date_of_next_contact: string | null;
  program_paused_return_date: string | null;
  current_contract_end_date_for_filtering: string | null;
  outcomes_progress_for_filtering: string | null;
  outcomes_buy_in_for_filtering: string | null;
  outcomes_progress_date: string | null;
  outcomes_buy_in_date: string | null;
  client_age_date_onboarded: string | null;
}

interface HistoryRow {
  legacy_client_glide_row_id: string | null;
  created_at: string;
}

interface PulseTask {
  glide_row_id: string;
  client_id: string | null;
  task_name: string | null;
  task_due_date: string | null;
  assigned_to_id: string | null;
  status_value: string | null;
  is_manually_archived: boolean | null;
  archived_at: string | null;
}

interface TimedCheckpointCompletion {
  id: string;
  legacy_client_id: string;
  checkpoint_type: "strategic_review";
  due_at: string;
  completed_at: string;
  completed_by_name: string | null;
}

interface PulseItem {
  id: string;
  client?: PulseClient;
  label: string;
  detail: string;
  date?: string | null;
  tone: "blue" | "amber" | "red" | "green" | "slate";
  href?: string;
  checkpoint?: {
    type: "strategic_review";
    dueAt: string;
    completion?: TimedCheckpointCompletion;
  };
}

interface PulseSection {
  id: string;
  title: string;
  description: string;
  items: PulseItem[];
}

interface CsmOption {
  id: string;
  name: string;
}

const ACTIVE_STATUSES = new Set(["front-end", "back-end"]);
const APP_PULSE_CLIENT_SELECT = [
  "id",
  "glide_row_id",
  "client_name",
  "company_id",
  "company_glide_row_id",
  "csm_team_member_id",
  "csm_secondary_assignee_id",
  "program_status_value",
  "csm_date_of_last_contact",
  "csm_date_of_next_contact",
  "program_paused_return_date",
  "current_contract_end_date_for_filtering",
  "current_contract_end_date",
  "outcomes_progress_for_filtering",
  "outcomes_progress_value",
  "outcomes_buy_in_for_filtering",
  "outcomes_buy_in_value",
  "outcomes_progress_date",
  "outcomes_buy_in_date",
  "client_age_date_onboarded",
].join(", ");
const MIRROR_PULSE_CLIENT_SELECT = [
  "glide_row_id",
  "client_name",
  "company_id",
  "csm_team_member_id",
  "csm_secondary_assignee_id",
  "program_status_value",
  "csm_date_of_last_contact",
  "csm_date_of_next_contact",
  "current_contract_end_date_for_filtering",
  "current_contract_end_date",
  "outcomes_progress_for_filtering",
  "outcomes_progress_value",
  "outcomes_buy_in_for_filtering",
  "outcomes_buy_in_value",
  "outcomes_progress_date",
  "outcomes_buy_in_date",
  "client_age_date_onboarded",
].join(", ");

function mapClient(row: Record<string, unknown>): PulseClient {
  return {
    glide_row_id: String(row.glide_row_id ?? row.id ?? ""),
    client_name: (row.client_name as string | null | undefined) ?? null,
    company_id:
      (row.company_glide_row_id as string | null | undefined) ??
      (row.company_id as string | null | undefined) ??
      null,
    company_glide_row_id:
      (row.company_glide_row_id as string | null | undefined) ??
      (row.company_id as string | null | undefined) ??
      null,
    csm_team_member_id:
      (row.csm_team_member_id as string | null | undefined) ?? null,
    csm_secondary_assignee_id:
      (row.csm_secondary_assignee_id as string | null | undefined) ?? null,
    program_status_value:
      (row.program_status_value as string | null | undefined) ?? null,
    csm_date_of_last_contact:
      ((row.csm_date_of_last_contact ??
        row.last_contact_at ??
        row.last_contact_date) as string | null | undefined) ?? null,
    csm_date_of_next_contact:
      ((row.csm_date_of_next_contact ??
        row.next_contact_at ??
        row.next_contact_date) as string | null | undefined) ?? null,
    program_paused_return_date:
      (row.program_paused_return_date as string | null | undefined) ?? null,
    current_contract_end_date_for_filtering:
      ((row.current_contract_end_date_for_filtering ??
        row.current_contract_end_date ??
        row.renewal_date) as string | null | undefined) ?? null,
    outcomes_progress_for_filtering:
      ((row.outcomes_progress_for_filtering ??
        row.outcomes_progress_value ??
        row.progress_status) as string | null | undefined) ?? null,
    outcomes_buy_in_for_filtering:
      ((row.outcomes_buy_in_for_filtering ??
        row.outcomes_buy_in_value ??
        row.buy_in_status) as string | null | undefined) ?? null,
    outcomes_progress_date:
      (row.outcomes_progress_date as string | null | undefined) ?? null,
    outcomes_buy_in_date:
      (row.outcomes_buy_in_date as string | null | undefined) ?? null,
    client_age_date_onboarded:
      ((row.client_age_date_onboarded ?? row.date_onboarded) as
        | string
        | null
        | undefined) ?? null,
  };
}

function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date = new Date()) {
  const start = startOfDay(date);
  const day = start.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + mondayOffset);
  return start;
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function nextMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isWithin(value: string | null | undefined, start: Date, end: Date) {
  const date = parseDate(value);
  return Boolean(date && date >= start && date < end);
}

function daysBetween(later: Date, earlier: Date) {
  return Math.floor(
    (startOfDay(later).getTime() - startOfDay(earlier).getTime()) /
      86_400_000,
  );
}

function dateOnlyIso(date: Date) {
  return startOfDay(date).toISOString();
}

function dateOnlyKey(value: string | Date | null | undefined) {
  const date = value instanceof Date ? value : parseDate(value);
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

function checkpointCompletionKey(
  clientId: string,
  checkpointType: string,
  dueAt: string | Date,
) {
  return `${clientId}:${checkpointType}:${dateOnlyKey(dueAt)}`;
}

function recurringDueDateInRange(
  anchorValue: string | null | undefined,
  intervalDays: number,
  start: Date,
  end: Date,
) {
  const anchor = parseDate(anchorValue);
  if (!anchor || intervalDays <= 0) return null;
  const anchorDay = startOfDay(anchor);
  if (anchorDay >= end) return null;

  const daysFromAnchor = Math.max(0, daysBetween(start, anchorDay));
  const intervalsElapsed = Math.max(1, Math.ceil(daysFromAnchor / intervalDays));
  const dueDate = addDays(anchorDay, intervalsElapsed * intervalDays);
  return dueDate >= start && dueDate < end ? dueDate : null;
}

function formatDate(value: string | null | undefined) {
  const date = parseDate(value);
  if (!date) return "--";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isActiveClient(client: PulseClient) {
  return ACTIVE_STATUSES.has(String(client.program_status_value ?? ""));
}

function teamMemberOptionId(member: UnifiedTeamMember) {
  return member.glide_row_id || member.app_member_id || "";
}

function managesClients(member: UnifiedTeamMember) {
  if (!teamMemberOptionId(member)) return false;
  if (member.is_archived === true) return false;
  if (member.role_hide_from_csm_list === true) return false;
  if (member.role_read_only_user === true) return false;
  if (member.role_id === null) return false;
  return true;
}

function csmOptionsFromTeam(teamMembers: UnifiedTeamMember[]) {
  const seen = new Set<string>();
  return teamMembers
    .filter(managesClients)
    .map((member) => ({
      id: teamMemberOptionId(member),
      name: member.name?.trim() || member.email?.trim() || "Unnamed CSM",
    }))
    .filter((option) => {
      if (!option.id || seen.has(option.id)) return false;
      seen.add(option.id);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function filterClientsByCsmRelationship(
  clients: PulseClient[],
  csmId: string,
  relationship: CsmRelationshipFilter,
) {
  if (!csmId || relationship === "both") return clients;
  if (relationship === "primary") {
    return clients.filter((client) => client.csm_team_member_id === csmId);
  }
  return clients.filter((client) => client.csm_secondary_assignee_id === csmId);
}

function clientUrl(client: PulseClient) {
  return `/clients/${encodeURIComponent(client.glide_row_id)}`;
}

function taskUrl() {
  return "/tasks";
}

function mostRecentDate(values: Array<string | null | undefined>) {
  return values
    .map(parseDate)
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
}

function makeItem(
  sectionId: string,
  client: PulseClient | undefined,
  label: string,
  detail: string,
  tone: PulseItem["tone"],
  date?: string | null,
  href?: string,
  checkpoint?: PulseItem["checkpoint"],
): PulseItem {
  return {
    id: `${sectionId}:${client?.glide_row_id ?? href ?? "company"}:${label}:${date ?? ""}`,
    client,
    label,
    detail,
    date,
    tone,
    href,
    checkpoint,
  };
}

function outcomeSignalItems({
  clients,
  sectionId,
  outcomeValue,
  thresholdDays,
  today,
  tone,
}: {
  clients: PulseClient[];
  sectionId: string;
  outcomeValue: "red" | "green";
  thresholdDays: number;
  today: Date;
  tone: PulseItem["tone"];
}) {
  return clients
    .map((client) => {
      const reasons: string[] = [];
      const dates: string[] = [];
      const progressDate = parseDate(client.outcomes_progress_date);
      const buyInDate = parseDate(client.outcomes_buy_in_date);

      if (
        client.outcomes_progress_for_filtering === outcomeValue &&
        progressDate &&
        daysBetween(today, progressDate) >= thresholdDays
      ) {
        reasons.push(`Progress ${outcomeValue}`);
        dates.push(client.outcomes_progress_date as string);
      }

      if (
        client.outcomes_buy_in_for_filtering === outcomeValue &&
        buyInDate &&
        daysBetween(today, buyInDate) >= thresholdDays
      ) {
        reasons.push(`Buy-in ${outcomeValue}`);
        dates.push(client.outcomes_buy_in_date as string);
      }

      if (reasons.length === 0) return null;

      const oldestDate = dates
        .map(parseDate)
        .filter((date): date is Date => Boolean(date))
        .sort((a, b) => a.getTime() - b.getTime())[0];
      const label =
        reasons.length === 1
          ? reasons[0]
          : `${reasons.length} ${outcomeValue} signals`;

      return makeItem(
        sectionId,
        client,
        label,
        `${reasons.join(" and ")} for ${thresholdDays}+ days`,
        tone,
        oldestDate?.toISOString() ?? null,
      );
    })
    .filter((item): item is PulseItem => Boolean(item));
}

function buildPulseSections(
  clients: PulseClient[],
  tasks: PulseTask[],
  latestHistoryByClient: Map<string, string>,
  checkpointCompletions: Map<string, TimedCheckpointCompletion>,
  window: PulseWindow,
  enabledTypes = enabledNotificationTypes([]),
  notificationPreferences: NotificationPreference[] = [],
) {
  const today = startOfDay();
  const ranges = {
    today: { start: today, end: addDays(today, 1) },
    week: { start: startOfWeek(today), end: addDays(startOfWeek(today), 7) },
    month: { start: startOfMonth(today), end: nextMonth(today) },
  };
  const range = ranges[window];
  const activeClients = clients.filter(isActiveClient);
  const clientById = new Map(clients.map((client) => [client.glide_row_id, client]));
  const pausedClients = clients.filter(
    (client) => client.program_status_value === "paused",
  );
  const preferenceByType = new Map(
    mergeNotificationPreferences(notificationPreferences).map((preference) => [
      preference.notification_type,
      preference,
    ]),
  );
  const diagnosticPreference = preferenceByType.get("diagnostic_due");
  const configuredDiagnosticCadence = diagnosticPreference?.lead_days ?? 56;
  const diagnosticCadenceDays =
    configuredDiagnosticCadence > 0 ? configuredDiagnosticCadence : 56;
  const diagnosticRecurrence =
    diagnosticPreference?.metadata?.recurrence === "recurring"
      ? "recurring"
      : "once";
  const diagnosticLabel = notificationPreferenceLabel(
    diagnosticPreference,
    "Onboarding checkpoint",
  );
  const strategicReviewPreference = preferenceByType.get(
    "strategic_review_due",
  );
  const strategicReviewLabel = notificationPreferenceLabel(
    strategicReviewPreference,
    "Strategic Review",
  );
  const strategicReviewLeadDays = Math.max(
    0,
    strategicReviewPreference?.lead_days ?? 35,
  );

  const sections: PulseSection[] = [];

  if (enabledTypes.has("task_due")) {
    sections.push({
      id: `tasks-${window}`,
      title:
        window === "today"
          ? "Tasks Due Today"
          : window === "week"
            ? "Tasks Due This Week"
            : "Tasks Due This Month",
      description: "Open tasks due in the selected operating window.",
      items: tasks
        .filter((task) => {
          const status = String(task.status_value ?? "");
          if (["done", "completed", "closed", "dismissed", "archived"].includes(status)) {
            return false;
          }
          if (task.is_manually_archived === true || task.archived_at) return false;
          return isWithin(task.task_due_date, range.start, range.end);
        })
        .map((task) => {
          const client = task.client_id ? clientById.get(task.client_id) : undefined;
          return makeItem(
            `tasks-${window}`,
            client,
            "Task due",
            `${task.task_name ?? "Task"} is due ${formatDate(task.task_due_date)}`,
            isWithin(task.task_due_date, today, addDays(today, 1)) ? "amber" : "blue",
            task.task_due_date,
            client ? clientUrl(client) : taskUrl(),
          );
        }),
    });
  }

  if (window === "today" && enabledTypes.has("next_contact_due")) {
    sections.push({
      id: "contact-today",
      title: "Needs Contact Today",
      description: "Active clients with a next contact date today.",
      items: activeClients
        .filter((client) => isWithin(client.csm_date_of_next_contact, range.start, range.end))
        .map((client) =>
          makeItem(
            "contact-today",
            client,
            "Next contact",
            `Next contact is ${formatDate(client.csm_date_of_next_contact)}`,
            "blue",
            client.csm_date_of_next_contact,
          ),
        ),
    });
  }

  if (enabledTypes.has("paused_return_due")) {
    sections.push({
      id: `pause-return-${window}`,
      title:
        window === "today"
          ? "Pause Returns Today"
          : window === "week"
            ? "Pause Returns This Week"
            : "Pause Returns This Month",
      description: "Paused clients whose agreed return date lands in this period.",
      items: pausedClients
        .filter((client) =>
          isWithin(client.program_paused_return_date, range.start, range.end),
        )
        .map((client) =>
          makeItem(
            `pause-return-${window}`,
            client,
            "Pause return",
            `Return date is ${formatDate(client.program_paused_return_date)}`,
            "amber",
            client.program_paused_return_date,
          ),
        ),
    });
  }

  if (enabledTypes.has("renewal_due")) {
    sections.push({
      id: `renewals-${window}`,
      title:
        window === "today"
          ? "Renewals Due Today"
          : window === "week"
            ? "Renewals Due This Week"
            : "Renewals Due This Month",
      description:
        "Active clients whose current contract/renewal date lands in this period.",
      items: activeClients
        .filter((client) =>
          isWithin(client.current_contract_end_date_for_filtering, range.start, range.end),
        )
        .map((client) =>
          makeItem(
            `renewals-${window}`,
            client,
            "Renewal",
            `Renewal date is ${formatDate(client.current_contract_end_date_for_filtering)}`,
            "amber",
            client.current_contract_end_date_for_filtering,
          ),
        ),
    });
  }

  if (enabledTypes.has("diagnostic_due")) {
    sections.push({
      id: `diagnostics-${window}`,
      title:
        window === "today"
          ? `${diagnosticLabel} Due Today`
          : window === "week"
            ? `${diagnosticLabel} Due This Week`
            : `${diagnosticLabel} Due This Month`,
      description:
        diagnosticRecurrence === "recurring"
          ? `Active clients due for recurring ${diagnosticLabel} check-ins every ${diagnosticCadenceDays} days from onboarding.`
          : `Active clients due for their one-time ${diagnosticLabel} ${diagnosticCadenceDays} days from onboarding.`,
      items: activeClients
        .map((client) => {
          const dueDate =
            diagnosticRecurrence === "recurring"
              ? recurringDueDateInRange(
                  client.client_age_date_onboarded,
                  diagnosticCadenceDays,
                  range.start,
                  range.end,
                )
              : (() => {
                  const onboarded = parseDate(client.client_age_date_onboarded);
                  if (!onboarded) return null;
                  const date = addDays(startOfDay(onboarded), diagnosticCadenceDays);
                  return isWithin(dateOnlyIso(date), range.start, range.end)
                    ? date
                    : null;
                })();
          if (!dueDate) return null;
          return makeItem(
            `diagnostics-${window}`,
            client,
            diagnosticLabel,
            `${diagnosticLabel} is due ${formatDate(dateOnlyIso(dueDate))}`,
            "blue",
            dateOnlyIso(dueDate),
          );
        })
        .filter((item): item is PulseItem => Boolean(item)),
    });
  }

  if (enabledTypes.has("strategic_review_due")) {
    sections.push({
      id: `strategic-review-${window}`,
      title:
        window === "today"
          ? `${strategicReviewLabel} Today`
          : window === "week"
            ? `${strategicReviewLabel} This Week`
            : `${strategicReviewLabel} This Month`,
      description:
        `Active clients ${strategicReviewLeadDays} days before renewal or contract end for ${strategicReviewLabel} planning.`,
      items: activeClients
        .map((client) => {
          const contractEnd = parseDate(client.current_contract_end_date_for_filtering);
          if (!contractEnd) return null;
          const reviewDate = addDays(startOfDay(contractEnd), -strategicReviewLeadDays);
          if (reviewDate < range.start || reviewDate >= range.end) return null;
          const dueAt = dateOnlyKey(reviewDate);
          const completion = checkpointCompletions.get(
            checkpointCompletionKey(client.glide_row_id, "strategic_review", dueAt),
          );
          return makeItem(
            `strategic-review-${window}`,
            client,
            completion ? `${strategicReviewLabel} complete` : `${strategicReviewLabel} pending`,
            completion
              ? `${strategicReviewLabel} completed ${formatDate(completion.completed_at)}${
                  completion.completed_by_name
                    ? ` by ${completion.completed_by_name}`
                    : ""
                }. Renewal date is ${formatDate(client.current_contract_end_date_for_filtering)}`
              : `${strategicReviewLabel} due before renewal on ${formatDate(client.current_contract_end_date_for_filtering)}`,
            completion ? "green" : "amber",
            dueAt,
            undefined,
            {
              type: "strategic_review",
              dueAt,
              completion,
            },
          );
        })
        .filter((item): item is PulseItem => Boolean(item)),
    });
  }

  if (window !== "month") {
    const thresholdDays = window === "today" ? 14 : 7;
    if (enabledTypes.has("churn_risk")) {
      sections.push({
        id: `churn-risk-${window}`,
        title:
          window === "today"
            ? "Churn Risk Signals"
            : "Churn Risk Signals This Week",
        description: `Active clients red on Progress or Buy-in for ${thresholdDays}+ days.`,
        items: outcomeSignalItems({
          clients: activeClients,
          sectionId: `churn-risk-${window}`,
          outcomeValue: "red",
          thresholdDays,
          today,
          tone: "red",
        }),
      });
    }

    if (enabledTypes.has("rga_candidate")) {
      sections.push({
        id: `rga-${window}`,
        title: window === "today" ? "RGA Candidates" : "RGA Candidates This Week",
        description: `Active clients green on Progress or Buy-in for ${thresholdDays}+ days.`,
        items: outcomeSignalItems({
          clients: activeClients,
          sectionId: `rga-${window}`,
          outcomeValue: "green",
          thresholdDays,
          today,
          tone: "green",
        }),
      });
    }
  }

  const staleDays = window === "week" ? 14 : 30;
  if (enabledTypes.has("quiet_profile")) {
    sections.push({
      id: `stale-${window}`,
      title:
        window === "week"
          ? "Profiles Quiet 14+ Days"
          : "Profiles Quiet 30+ Days",
      description: "Active clients without a recent RetainOS history/profile signal.",
      items: activeClients
        .filter((client) => {
          const latestHistory = latestHistoryByClient.get(client.glide_row_id);
          const latest = mostRecentDate([
            latestHistory,
            client.csm_date_of_next_contact,
            client.csm_date_of_last_contact,
            client.outcomes_progress_date,
            client.outcomes_buy_in_date,
            client.client_age_date_onboarded,
          ]);
          return !latest || daysBetween(today, latest) >= staleDays;
        })
        .map((client) => {
          const latestHistory = latestHistoryByClient.get(client.glide_row_id);
          const latest = mostRecentDate([
            latestHistory,
            client.csm_date_of_next_contact,
            client.csm_date_of_last_contact,
            client.outcomes_progress_date,
            client.outcomes_buy_in_date,
            client.client_age_date_onboarded,
          ]);
          return makeItem(
            `stale-${window}`,
            client,
            "Profile quiet",
            latest
              ? `Last signal was ${formatDate(latest.toISOString())}`
              : "No profile activity signal found",
            "slate",
            latest?.toISOString() ?? null,
          );
        }),
    });
  }

  return sections.map((section) => ({
    ...section,
    items: section.items.sort(
      (a, b) =>
        (parseDate(a.date)?.getTime() ?? Number.MAX_SAFE_INTEGER) -
          (parseDate(b.date)?.getTime() ?? Number.MAX_SAFE_INTEGER) ||
        (a.client?.client_name ?? "").localeCompare(b.client?.client_name ?? ""),
    ),
  }));
}

function toneClass(tone: PulseItem["tone"]) {
  if (tone === "red") return "border-red-200 bg-red-50 text-red-700";
  if (tone === "amber") return "border-amber-200 bg-amber-50 text-amber-700";
  if (tone === "green") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "blue") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function WindowButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`retainos-focus rounded-lg px-4 py-2 text-sm font-semibold ${
        active
          ? "bg-[#162b3e] text-white shadow-sm"
          : "border border-[#e2e8f0] bg-white text-[#4b5565] hover:bg-[#f8fafc]"
      }`}
    >
      {children}
    </button>
  );
}

function PulseSectionCard({
  section,
  completingCheckpointKey,
  onCompleteCheckpoint,
  programChoices,
}: {
  section: PulseSection;
  completingCheckpointKey: string | null;
  onCompleteCheckpoint: (item: PulseItem) => void;
  programChoices: ProgramChoice[];
}) {
  const [open, setOpen] = useState(section.items.length > 0);

  useEffect(() => {
    setOpen(section.items.length > 0);
  }, [section.id, section.items.length]);

  return (
    <section className="rounded-lg border border-[#e2e8f0] bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="retainos-focus flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-[#162b3e]">{section.title}</h2>
            <span className="rounded-full bg-[#eef6ff] px-2.5 py-1 text-xs font-semibold text-[#2f73b8]">
              {section.items.length}
            </span>
          </div>
          <p className="mt-1 text-sm text-[#697586]">{section.description}</p>
        </div>
        <span className="text-xl text-[#697586]">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="border-t border-[#eef2f6] px-5 py-4">
          {section.items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#d9e2ec] bg-[#f8fafc] px-4 py-6 text-sm text-[#697586]">
              No clients match this signal in the selected window.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {section.items.map((item) => (
                <Link
                  key={item.id}
                  to={item.href ?? (item.client ? clientUrl(item.client) : taskUrl())}
                  className="retainos-focus rounded-lg border border-[#e2e8f0] bg-[#fbfcfe] p-4 transition hover:-translate-y-0.5 hover:border-[#59abf0] hover:bg-white hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-[#162b3e]">
                        {item.client?.client_name ?? "Company task"}
                      </h3>
                      <p className="mt-1 text-sm text-[#697586]">{item.detail}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${toneClass(
                        item.tone,
                      )}`}
                    >
                      {item.label}
                    </span>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    {item.client ? (
                      <ProgramStatusPill
                        value={item.client.program_status_value}
                        choices={programChoices}
                      />
                    ) : (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        Company-level
                      </span>
                    )}
                    <span className="text-xs font-semibold text-[#697586]">
                      {item.client ? "Open client" : "Open tasks"}
                    </span>
                  </div>
                  {item.checkpoint && !item.checkpoint.completion ? (
                    <div className="mt-4 border-t border-[#e8edf3] pt-3">
                      <button
                        type="button"
                        disabled={
                          completingCheckpointKey ===
                          checkpointCompletionKey(
                            item.client?.glide_row_id ?? "",
                            item.checkpoint.type,
                            item.checkpoint.dueAt,
                          )
                        }
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onCompleteCheckpoint(item);
                        }}
                        className="retainos-focus rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-60"
                      >
                        {completingCheckpointKey ===
                        checkpointCompletionKey(
                          item.client?.glide_row_id ?? "",
                          item.checkpoint.type,
                          item.checkpoint.dueAt,
                        )
                          ? "Saving..."
                          : "Mark SR complete"}
                      </button>
                    </div>
                  ) : null}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function DailyPulse() {
  const { capabilities, effectiveCompanyId, teamMemberId } = useAccountContext();
  const [windowMode, setWindowMode] = useState<PulseWindow>("today");
  const [csmRelationshipFilter, setCsmRelationshipFilter] =
    useState<CsmRelationshipFilter>("both");
  const [companyName, setCompanyName] = useState("");
  const [selectedCsmId, setSelectedCsmId] = useState("");
  const [csmOptions, setCsmOptions] = useState<CsmOption[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [clients, setClients] = useState<PulseClient[]>([]);
  const [tasks, setTasks] = useState<PulseTask[]>([]);
  const [latestHistoryByClient, setLatestHistoryByClient] = useState(
    new Map<string, string>(),
  );
  const [checkpointCompletions, setCheckpointCompletions] = useState(
    new Map<string, TimedCheckpointCompletion>(),
  );
  const [enabledTypes, setEnabledTypes] = useState<Set<NotificationPreferenceType>>(
    enabledNotificationTypes([]),
  );
  const [notificationPreferences, setNotificationPreferences] = useState<
    NotificationPreference[]
  >(mergeNotificationPreferences([]));
  const [programStatusLabels, setProgramStatusLabels] =
    useState<ProgramStatusLabelMap>(DEFAULT_PROGRAM_STATUS_LABELS);
  const [loading, setLoading] = useState(false);
  const [completingCheckpointKey, setCompletingCheckpointKey] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const canFilterByCsm = !capabilities.canViewOnlyAssignedClients;
  const activeCsmScopeId =
    capabilities.canViewOnlyAssignedClients && teamMemberId
      ? teamMemberId
      : selectedCsmId;
  const showRelationshipFilter = Boolean(activeCsmScopeId);
  const programChoices = useMemo(
    () => programStatusChoicesWithLabels(programStatusLabels),
    [programStatusLabels],
  );

  useEffect(() => {
    let cancelled = false;
    if (!effectiveCompanyId) {
      setCompanyName("");
      setCsmOptions([]);
      setEnabledTypes(enabledNotificationTypes([]));
      setNotificationPreferences(mergeNotificationPreferences([]));
      return;
    }
    loadUnifiedCompanyByLegacyId(effectiveCompanyId)
      .then((company) => {
        if (!cancelled) setCompanyName(company?.name ?? "");
      })
      .catch(() => {
        if (!cancelled) setCompanyName("");
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveCompanyId]);

  useEffect(() => {
    let cancelled = false;
    async function loadWorkspaceDefaults() {
      if (!effectiveCompanyId) {
        setProgramStatusLabels(DEFAULT_PROGRAM_STATUS_LABELS);
        return;
      }
      const defaults = await loadCompanyWorkspaceDefaults(effectiveCompanyId);
      if (!cancelled) setProgramStatusLabels(defaults.programStatusLabels);
    }

    void loadWorkspaceDefaults();
    return () => {
      cancelled = true;
    };
  }, [effectiveCompanyId]);

  useEffect(() => {
    let cancelled = false;
    async function loadPreferences() {
      if (!effectiveCompanyId) {
        setEnabledTypes(enabledNotificationTypes([]));
        setNotificationPreferences(mergeNotificationPreferences([]));
        return;
      }
      const result = await loadCompanyNotificationPreferences(effectiveCompanyId);
      if (!cancelled) {
        setEnabledTypes(enabledNotificationTypes(result.preferences));
        setNotificationPreferences(mergeNotificationPreferences(result.preferences));
      }
    }

    void loadPreferences();
    return () => {
      cancelled = true;
    };
  }, [effectiveCompanyId]);

  useEffect(() => {
    setSelectedCsmId("");
    setCsmRelationshipFilter("both");
  }, [effectiveCompanyId]);

  useEffect(() => {
    let cancelled = false;

    async function loadTeamOptions() {
      if (!effectiveCompanyId || !canFilterByCsm) {
        setCsmOptions([]);
        return;
      }

      setTeamLoading(true);
      try {
        const company = await loadUnifiedCompanyByLegacyId(effectiveCompanyId);
        if (!company) {
          if (!cancelled) setCsmOptions([]);
          return;
        }
        const teamMembers = await loadUnifiedTeamMembers([company as UnifiedCompany]);
        if (!cancelled) setCsmOptions(csmOptionsFromTeam(teamMembers));
      } catch (loadError) {
        console.error("Failed to load Daily Pulse CSM options:", loadError);
        if (!cancelled) setCsmOptions([]);
      } finally {
        if (!cancelled) setTeamLoading(false);
      }
    }

    void loadTeamOptions();

    return () => {
      cancelled = true;
    };
  }, [canFilterByCsm, effectiveCompanyId]);

  useEffect(() => {
    let cancelled = false;

    async function loadPulseData() {
      if (!effectiveCompanyId) {
        setClients([]);
        setTasks([]);
        setLatestHistoryByClient(new Map());
        setCheckpointCompletions(new Map());
        return;
      }
      if (capabilities.canViewOnlyAssignedClients && !teamMemberId) {
        setClients([]);
        setTasks([]);
        setLatestHistoryByClient(new Map());
        setCheckpointCompletions(new Map());
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const company = await loadUnifiedCompanyByLegacyId(effectiveCompanyId);
        const usesAppClients = company?.source === "app_owned";
        let query = supabase
          .from(usesAppClients ? "clients" : "backup_company_clients")
          .select(
            usesAppClients
              ? APP_PULSE_CLIENT_SELECT
              : MIRROR_PULSE_CLIENT_SELECT,
          )
          .eq(
            usesAppClients ? "company_glide_row_id" : "company_id",
            effectiveCompanyId,
          )
          .limit(5000);

        const scopedCsmId =
          capabilities.canViewOnlyAssignedClients && teamMemberId
            ? teamMemberId
            : selectedCsmId;

        if (scopedCsmId) {
          query = query.or(
            `csm_team_member_id.eq.${scopedCsmId},csm_secondary_assignee_id.eq.${scopedCsmId}`,
          );
        }

        const { data, error: clientsError } = await query;
        if (clientsError) throw clientsError;

        const mappedClients = (((data ?? []) as unknown) as Record<string, unknown>[])
          .map(mapClient)
          .filter((client) => client.glide_row_id);
        const visibleClients = scopedCsmId
          ? filterClientsByCsmRelationship(
              mappedClients,
              scopedCsmId,
              csmRelationshipFilter,
            )
          : mappedClients;
        const visibleClientIds = new Set(
          visibleClients.map((client) => client.glide_row_id),
        );

        const historyByClient = new Map<string, string>();
        const completionsByClientDue = new Map<string, TimedCheckpointCompletion>();
        let taskRows: PulseTask[] = [];

        if (usesAppClients) {
          let tasksQuery = supabase
            .from("client_tasks")
            .select(
              "glide_row_id, client_id, task_name, task_due_date, assigned_to_id, status_value, is_manually_archived, archived_at",
            )
            .eq("company_glide_row_id", effectiveCompanyId)
            .not("task_due_date", "is", null)
            .limit(1000);

          if (scopedCsmId) {
            tasksQuery = tasksQuery.eq("assigned_to_id", scopedCsmId);
          }

          const { data: tasksData, error: tasksError } = await tasksQuery;
          if (tasksError) {
            console.warn("Daily Pulse task data unavailable:", tasksError);
          } else {
            taskRows = ((tasksData ?? []) as PulseTask[]).filter(
              (task) => !task.client_id || visibleClientIds.has(task.client_id),
            );
          }
        }

        const clientIds = usesAppClients
          ? visibleClients.map((client) => client.glide_row_id)
          : [];

        if (clientIds.length > 0) {
          const { data: history, error: historyError } = await supabase
            .from("client_history_events")
            .select("legacy_client_glide_row_id, created_at")
            .in("legacy_client_glide_row_id", clientIds)
            .order("created_at", { ascending: false })
            .limit(5000);

          if (historyError) {
            console.warn("Daily Pulse history fallback unavailable:", historyError);
          } else {
            for (const row of (history ?? []) as HistoryRow[]) {
              if (!row.legacy_client_glide_row_id) continue;
              if (!historyByClient.has(row.legacy_client_glide_row_id)) {
                historyByClient.set(row.legacy_client_glide_row_id, row.created_at);
              }
            }
          }

          if (company?.app_company_id) {
            const { data: completions, error: completionsError } = await supabase
              .from("client_timed_checkpoint_completions")
              .select(
                "id, legacy_client_id, checkpoint_type, due_at, completed_at, completed_by_name",
              )
              .eq("company_id", company.app_company_id)
              .eq("checkpoint_type", "strategic_review")
              .in("legacy_client_id", clientIds)
              .is("archived_at", null)
              .limit(5000);

            if (completionsError) {
              console.warn(
                "Daily Pulse timed checkpoint completions unavailable:",
                completionsError,
              );
            } else {
              for (const row of (completions ?? []) as TimedCheckpointCompletion[]) {
                completionsByClientDue.set(
                  checkpointCompletionKey(
                    row.legacy_client_id,
                    row.checkpoint_type,
                    row.due_at,
                  ),
                  row,
                );
              }
            }
          }
        }

        if (!cancelled) {
          setClients(visibleClients);
          setTasks(taskRows);
          setLatestHistoryByClient(historyByClient);
          setCheckpointCompletions(completionsByClientDue);
        }
      } catch (loadError) {
        console.error("Failed to load Daily Pulse:", loadError);
        if (!cancelled) {
          setClients([]);
          setTasks([]);
          setLatestHistoryByClient(new Map());
          setCheckpointCompletions(new Map());
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Daily Pulse could not load.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPulseData();

    return () => {
      cancelled = true;
    };
  }, [
    capabilities.canViewOnlyAssignedClients,
    csmRelationshipFilter,
    effectiveCompanyId,
    selectedCsmId,
    teamMemberId,
  ]);

  const sections = useMemo(
    () =>
      buildPulseSections(
        clients,
        tasks,
        latestHistoryByClient,
        checkpointCompletions,
        windowMode,
        enabledTypes,
        notificationPreferences,
      ),
    [
      checkpointCompletions,
      clients,
      enabledTypes,
      latestHistoryByClient,
      notificationPreferences,
      tasks,
      windowMode,
    ],
  );

  const totalItems = sections.reduce((sum, section) => sum + section.items.length, 0);
  const enabledSignalCount = enabledTypes.size;

  async function handleCompleteCheckpoint(item: PulseItem) {
    if (!effectiveCompanyId || !item.client || !item.checkpoint) return;
    const key = checkpointCompletionKey(
      item.client.glide_row_id,
      item.checkpoint.type,
      item.checkpoint.dueAt,
    );
    setCompletingCheckpointKey(key);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "manage-client-timed-checkpoint",
        {
          body: {
            action: "complete",
            companyLegacyId: effectiveCompanyId,
            clientLegacyId: item.client.glide_row_id,
            checkpointType: item.checkpoint.type,
            dueAt: item.checkpoint.dueAt,
          },
        },
      );

      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);

      const completion = data?.completion as TimedCheckpointCompletion | undefined;
      if (completion) {
        setCheckpointCompletions((current) => {
          const next = new Map(current);
          next.set(
            checkpointCompletionKey(
              completion.legacy_client_id,
              completion.checkpoint_type,
              completion.due_at,
            ),
            completion,
          );
          return next;
        });
      }
    } catch (completeError) {
      setError(
        completeError instanceof Error
          ? completeError.message
          : "Could not complete Strategic Review.",
      );
    } finally {
      setCompletingCheckpointKey(null);
    }
  }

  if (!effectiveCompanyId) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center text-amber-900">
        Select a company before opening Daily Pulse.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[#d8e0ea] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#697586]">
              {companyName || "Company workspace"}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-[#162b3e]">
              Daily Pulse
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-[#697586]">
              Start-of-day operating view for CSM action items. Daily Pulse is
              persistent by design; the notification bell stays lightweight for
              short-term reminders.
            </p>
          </div>
          <div className="rounded-full bg-[#eef6ff] px-4 py-2 text-sm font-semibold text-[#2f73b8]">
            {loading ? "Loading..." : `${totalItems} open signal${totalItems === 1 ? "" : "s"}`}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <WindowButton active={windowMode === "today"} onClick={() => setWindowMode("today")}>
            Today
          </WindowButton>
          <WindowButton active={windowMode === "week"} onClick={() => setWindowMode("week")}>
            This Week
          </WindowButton>
          <WindowButton active={windowMode === "month"} onClick={() => setWindowMode("month")}>
            This Month
          </WindowButton>
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          {showRelationshipFilter && (
            <label className="flex w-full flex-col gap-1 text-sm font-semibold text-[#4b5565] sm:w-56">
              Assignment view
              <select
                value={csmRelationshipFilter}
                onChange={(event) =>
                  setCsmRelationshipFilter(
                    event.target.value as CsmRelationshipFilter,
                  )
                }
                className="retainos-focus h-11 rounded-lg border border-[#d8e0ea] bg-white px-3 text-sm font-semibold text-[#162b3e] shadow-sm"
              >
                {Object.entries(CSM_RELATIONSHIP_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {canFilterByCsm && (
            <label className="flex w-full flex-col gap-1 text-sm font-semibold text-[#4b5565] sm:w-72">
              CSM view
              <select
                value={selectedCsmId}
                onChange={(event) => setSelectedCsmId(event.target.value)}
                className="retainos-focus h-11 rounded-lg border border-[#d8e0ea] bg-white px-3 text-sm font-semibold text-[#162b3e] shadow-sm"
              >
                <option value="">
                  {teamLoading ? "Loading CSMs..." : "All CSMs"}
                </option>
                {csmOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-[#e2e8f0] bg-white p-8 text-center text-sm text-[#697586] shadow-sm">
          Loading Daily Pulse...
        </div>
      ) : sections.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#d9e2ec] bg-white p-8 text-center shadow-sm">
          <h2 className="text-base font-semibold text-[#162b3e]">
            Daily Pulse is hidden for this company
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-[#697586]">
            No Daily Pulse sections are enabled in Company Settings. The
            compact bell can still show generated reminders that do not belong
            on the persistent operating page.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {totalItems === 0 ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
              No open Daily Pulse signals {PULSE_WINDOW_LABELS[windowMode]} across{" "}
              {enabledSignalCount} enabled signal
              {enabledSignalCount === 1 ? "" : "s"}.
            </div>
          ) : null}
          {sections.map((section) => (
            <PulseSectionCard
              key={section.id}
              section={section}
              completingCheckpointKey={completingCheckpointKey}
              onCompleteCheckpoint={handleCompleteCheckpoint}
              programChoices={programChoices}
            />
          ))}
        </div>
      )}
    </div>
  );
}
