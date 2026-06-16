import { supabase } from "./supabase.ts";

export type DefaultClientView = "list" | "card" | "calendar";
export type DefaultCalendarMode = "month" | "week" | "day";

export interface CompanyWorkspaceDefaults {
  profileUpkeepFreshnessDays: number;
  defaultClientView: DefaultClientView;
  defaultCalendarMode: DefaultCalendarMode;
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

const FALLBACK_WORKSPACE_DEFAULTS: CompanyWorkspaceDefaults = {
  profileUpkeepFreshnessDays: 14,
  defaultClientView: "list",
  defaultCalendarMode: "month",
  source: "fallback",
};

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
      "profile_upkeep_freshness_days, default_client_view, default_calendar_mode",
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
