import { supabase } from "./supabase.ts";

export type DefaultClientView = "list" | "card" | "calendar";
export type DefaultCalendarMode = "month" | "week" | "day";

export interface CompanyWorkspaceDefaults {
  profileUpkeepFreshnessDays: number;
  defaultClientView: DefaultClientView;
  defaultCalendarMode: DefaultCalendarMode;
  source: "app_owned" | "fallback";
}

const FALLBACK_WORKSPACE_DEFAULTS: CompanyWorkspaceDefaults = {
  profileUpkeepFreshnessDays: 14,
  defaultClientView: "list",
  defaultCalendarMode: "month",
  source: "fallback",
};

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

