import { supabase } from "./supabase.ts";
import type { ProgramChoice } from "./clientDisplay.tsx";

export type DefaultClientView = "list" | "card" | "calendar";
export type DefaultCalendarMode = "month" | "week" | "day";
export type ProgramStatusValue =
  | "front-end"
  | "back-end"
  | "paused"
  | "suspended"
  | "off-boarded";
export type ProgramStatusLabelMap = Record<ProgramStatusValue, string>;
export type ClientListColumnKey =
  | "csm"
  | "pathway"
  | "archetype"
  | "status"
  | "onboarded"
  | "renewal"
  | "last_contact"
  | "next_contact"
  | "weeks_in_program"
  | "weeks_left"
  | "buy_in"
  | "progress"
  | "actions";

export interface CompanyWorkspaceDefaults {
  profileUpkeepFreshnessDays: number;
  defaultClientView: DefaultClientView;
  defaultCalendarMode: DefaultCalendarMode;
  clientListColumns: ClientListColumnKey[];
  programStatusLabels: ProgramStatusLabelMap;
  source: "app_owned" | "fallback";
}

export type NotificationPreferenceType =
  | "next_contact_due"
  | "renewal_due"
  | "paused_return_due"
  | "churn_risk"
  | "rga_candidate"
  | "quiet_profile"
  | "task_due"
  | "diagnostic_due"
  | "strategic_review_due";

export interface NotificationPreference {
  notification_type: NotificationPreferenceType;
  in_app_enabled: boolean;
  email_enabled: boolean;
  lead_days: number;
  metadata?: Record<string, unknown> | null;
}

export const PROGRAM_STATUS_LABEL_OPTIONS: Array<{
  value: ProgramStatusValue;
  defaultLabel: string;
  description: string;
}> = [
  {
    value: "front-end",
    defaultLabel: "Front End",
    description: "Active clients in the first delivery phase.",
  },
  {
    value: "back-end",
    defaultLabel: "Back End",
    description: "Active clients in the later delivery phase.",
  },
  {
    value: "paused",
    defaultLabel: "Paused",
    description: "Temporarily paused clients with a planned return.",
  },
  {
    value: "suspended",
    defaultLabel: "Suspended",
    description: "Clients temporarily stopped or missing in action.",
  },
  {
    value: "off-boarded",
    defaultLabel: "Offboarded",
    description: "Clients who have completed or left the program.",
  },
];

export const DEFAULT_PROGRAM_STATUS_LABELS: ProgramStatusLabelMap =
  PROGRAM_STATUS_LABEL_OPTIONS.reduce((labels, option) => {
    labels[option.value] = option.defaultLabel;
    return labels;
  }, {} as ProgramStatusLabelMap);

const FALLBACK_WORKSPACE_DEFAULTS: CompanyWorkspaceDefaults = {
  profileUpkeepFreshnessDays: 14,
  defaultClientView: "list",
  defaultCalendarMode: "month",
  clientListColumns: [
    "csm",
    "status",
    "onboarded",
    "renewal",
    "last_contact",
    "next_contact",
    "buy_in",
    "progress",
    "actions",
  ],
  programStatusLabels: DEFAULT_PROGRAM_STATUS_LABELS,
  source: "fallback",
};

export const DEFAULT_CLIENT_LIST_COLUMNS =
  FALLBACK_WORKSPACE_DEFAULTS.clientListColumns;

export const CLIENT_LIST_COLUMN_OPTIONS: Array<{
  key: ClientListColumnKey;
  label: string;
  description: string;
}> = [
  { key: "status", label: "Status", description: "Front End, Back End, Paused, or other program status." },
  { key: "pathway", label: "Pathway", description: "Current primary pathway." },
  { key: "csm", label: "CSM", description: "Primary assigned team member." },
  { key: "onboarded", label: "Onboarded", description: "Client start/onboarded date." },
  { key: "renewal", label: "Renewal", description: "Current contract or renewal date." },
  { key: "weeks_in_program", label: "Weeks In", description: "Weeks since onboarded date." },
  { key: "weeks_left", label: "Weeks Left", description: "Weeks until current renewal date." },
  { key: "last_contact", label: "Last Contact", description: "Most recent contact date." },
  { key: "next_contact", label: "Next Contact", description: "Next scheduled contact date." },
  { key: "buy_in", label: "Buy In", description: "Current buy-in score." },
  { key: "progress", label: "Progress", description: "Current progress score." },
  { key: "archetype", label: "Archetype", description: "Client archetype." },
  { key: "actions", label: "Actions", description: "Quick Update and fast client actions." },
];

const CLIENT_LIST_COLUMN_KEYS = new Set<ClientListColumnKey>(
  CLIENT_LIST_COLUMN_OPTIONS.map((option) => option.key),
);
const CLIENT_LIST_COLUMN_ORDER = new Map<ClientListColumnKey, number>(
  CLIENT_LIST_COLUMN_OPTIONS.map((option, index) => [option.key, index]),
);

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreference[] = [
  {
    notification_type: "next_contact_due",
    in_app_enabled: true,
    email_enabled: false,
    lead_days: 0,
  },
  {
    notification_type: "renewal_due",
    in_app_enabled: true,
    email_enabled: false,
    lead_days: 7,
  },
  {
    notification_type: "paused_return_due",
    in_app_enabled: true,
    email_enabled: false,
    lead_days: 0,
  },
  {
    notification_type: "churn_risk",
    in_app_enabled: true,
    email_enabled: false,
    lead_days: 0,
  },
  {
    notification_type: "rga_candidate",
    in_app_enabled: true,
    email_enabled: false,
    lead_days: 0,
  },
  {
    notification_type: "quiet_profile",
    in_app_enabled: true,
    email_enabled: false,
    lead_days: 0,
  },
  {
    notification_type: "task_due",
    in_app_enabled: true,
    email_enabled: false,
    lead_days: 0,
  },
  {
    notification_type: "diagnostic_due",
    in_app_enabled: true,
    email_enabled: false,
    lead_days: 56,
    metadata: { recurrence: "once" },
  },
  {
    notification_type: "strategic_review_due",
    in_app_enabled: true,
    email_enabled: false,
    lead_days: 35,
  },
];

const NOTIFICATION_TYPES = new Set(
  DEFAULT_NOTIFICATION_PREFERENCES.map((preference) => preference.notification_type),
);

function normalizeClientView(value: unknown): DefaultClientView {
  return value === "card" || value === "calendar" ? value : "list";
}

function normalizeCalendarMode(value: unknown): DefaultCalendarMode {
  return value === "week" || value === "day" ? value : "month";
}

function normalizeFreshnessDays(value: unknown): number {
  const days = Number(value);
  if (!Number.isFinite(days)) return FALLBACK_WORKSPACE_DEFAULTS.profileUpkeepFreshnessDays;
  return Math.min(365, Math.max(1, Math.round(days)));
}

export function normalizeProgramStatusLabels(
  value: unknown,
  fallback: ProgramStatusLabelMap = DEFAULT_PROGRAM_STATUS_LABELS,
): ProgramStatusLabelMap {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return PROGRAM_STATUS_LABEL_OPTIONS.reduce((labels, option) => {
    const raw = record[option.value];
    const label =
      typeof raw === "string" && raw.trim()
        ? raw.trim().slice(0, 60)
        : fallback[option.value] || option.defaultLabel;
    labels[option.value] = label;
    return labels;
  }, {} as ProgramStatusLabelMap);
}

export function applyProgramStatusLabels<T extends ProgramChoice>(
  choices: T[],
  labels: ProgramStatusLabelMap = DEFAULT_PROGRAM_STATUS_LABELS,
): T[] {
  return choices.map((choice) => {
    const value = choice.program_value as ProgramStatusValue | null;
    return value && labels[value]
      ? { ...choice, program_label: labels[value] }
      : choice;
  });
}

export function programStatusChoicesWithLabels(
  labels: ProgramStatusLabelMap = DEFAULT_PROGRAM_STATUS_LABELS,
): ProgramChoice[] {
  return PROGRAM_STATUS_LABEL_OPTIONS.map((option) => ({
    program_value: option.value,
    program_label: labels[option.value] || option.defaultLabel,
    program_emoji: null,
  }));
}

export function normalizeClientListColumns(
  value: unknown,
  fallback: ClientListColumnKey[] = FALLBACK_WORKSPACE_DEFAULTS.clientListColumns,
) {
  if (!Array.isArray(value)) return fallback;
  const columns = value.flatMap((item) => {
    if (typeof item !== "string") return [];
    const normalized = item === "program" ? "pathway" : item;
    return CLIENT_LIST_COLUMN_KEYS.has(normalized as ClientListColumnKey)
      ? [normalized as ClientListColumnKey]
      : [];
  });
  return columns.length > 0
    ? [...new Set(columns)].sort(
        (left, right) =>
          (CLIENT_LIST_COLUMN_ORDER.get(left) ?? 999) -
          (CLIENT_LIST_COLUMN_ORDER.get(right) ?? 999),
      )
    : fallback;
}

function normalizeLeadDays(value: unknown, fallback: number): number {
  const days = Number(value);
  if (!Number.isFinite(days)) return fallback;
  return Math.min(365, Math.max(0, Math.round(days)));
}

export function mergeNotificationPreferences(
  rows: Partial<NotificationPreference>[] | null | undefined,
) {
  const byType = new Map(
    DEFAULT_NOTIFICATION_PREFERENCES.map((preference) => [
      preference.notification_type,
      { ...preference },
    ]),
  );

  for (const row of rows ?? []) {
    if (!NOTIFICATION_TYPES.has(row.notification_type as NotificationPreferenceType)) {
      continue;
    }
    const type = row.notification_type as NotificationPreferenceType;
    const fallback = byType.get(type) ?? DEFAULT_NOTIFICATION_PREFERENCES[0];
    byType.set(type, {
      notification_type: type,
      in_app_enabled:
        typeof row.in_app_enabled === "boolean"
          ? row.in_app_enabled
          : fallback.in_app_enabled,
      email_enabled: false,
      lead_days: normalizeLeadDays(row.lead_days, fallback.lead_days),
      metadata:
        row.metadata && typeof row.metadata === "object"
          ? { ...(fallback.metadata ?? {}), ...row.metadata }
          : fallback.metadata ?? {},
    });
  }

  return DEFAULT_NOTIFICATION_PREFERENCES.map((preference) => ({
    ...(byType.get(preference.notification_type) ?? preference),
    email_enabled: false,
  }));
}

export function enabledNotificationTypes(preferences: NotificationPreference[]) {
  return new Set(
    mergeNotificationPreferences(preferences)
      .filter((preference) => preference.in_app_enabled)
      .map((preference) => preference.notification_type),
  );
}

export async function loadCompanyWorkspaceDefaults(
  legacyCompanyId: string,
): Promise<CompanyWorkspaceDefaults> {
  if (!legacyCompanyId) return FALLBACK_WORKSPACE_DEFAULTS;

  const { data: appCompany, error: companyError } = await supabase
    .from("companies")
    .select("id")
    .eq("legacy_glide_row_id", legacyCompanyId)
    .in("migration_status", ["pilot", "migrated"])
    .maybeSingle();

  if (companyError) {
    console.error("Failed to load app-owned company for settings:", companyError);
  }

  if (!appCompany?.id) return FALLBACK_WORKSPACE_DEFAULTS;

  const { data, error } = await supabase
    .from("company_settings")
    .select(
      "profile_upkeep_freshness_days, default_client_view, default_calendar_mode, metadata",
    )
    .eq("company_id", appCompany.id)
    .maybeSingle();

  if (error) {
    console.error("Failed to load company workspace defaults:", error);
    return { ...FALLBACK_WORKSPACE_DEFAULTS, source: "app_owned" };
  }

  if (!data) return { ...FALLBACK_WORKSPACE_DEFAULTS, source: "app_owned" };

  return {
    profileUpkeepFreshnessDays: normalizeFreshnessDays(
      data.profile_upkeep_freshness_days,
    ),
    defaultClientView: normalizeClientView(data.default_client_view),
    defaultCalendarMode: normalizeCalendarMode(data.default_calendar_mode),
    clientListColumns: normalizeClientListColumns(
      data.metadata &&
        typeof data.metadata === "object" &&
        !Array.isArray(data.metadata)
        ? (data.metadata as Record<string, unknown>).client_list_columns
        : null,
    ),
    programStatusLabels: normalizeProgramStatusLabels(
      data.metadata &&
        typeof data.metadata === "object" &&
        !Array.isArray(data.metadata)
        ? (data.metadata as Record<string, unknown>).program_status_labels
        : null,
    ),
    source: "app_owned",
  };
}

export async function loadCompanyNotificationPreferences(
  legacyCompanyId: string,
): Promise<{ preferences: NotificationPreference[]; source: "app_owned" | "fallback" }> {
  if (!legacyCompanyId) {
    return {
      preferences: mergeNotificationPreferences(null),
      source: "fallback",
    };
  }

  const { data: appCompany, error: companyError } = await supabase
    .from("companies")
    .select("id")
    .eq("legacy_glide_row_id", legacyCompanyId)
    .in("migration_status", ["pilot", "migrated"])
    .maybeSingle();

  if (companyError) {
    console.error("Failed to load app-owned company for notifications:", companyError);
  }

  if (!appCompany?.id) {
    return {
      preferences: mergeNotificationPreferences(null),
      source: "fallback",
    };
  }

  const { data, error } = await supabase
    .from("notification_preferences")
    .select("notification_type, in_app_enabled, email_enabled, lead_days, metadata")
    .eq("company_id", appCompany.id)
    .is("member_id", null)
    .is("role", null);

  if (error) {
    console.error("Failed to load notification preferences:", error);
    return {
      preferences: mergeNotificationPreferences(null),
      source: "app_owned",
    };
  }

  return {
    preferences: mergeNotificationPreferences(
      (data ?? []) as Partial<NotificationPreference>[],
    ),
    source: "app_owned",
  };
}
