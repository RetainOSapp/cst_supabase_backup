import { supabase } from "./supabase.ts";

export type MigrationStatus = "mirror_only" | "pilot" | "migrated";
export type DataSource = "app_owned" | "mirror";

export interface UnifiedCompany {
  glide_row_id: string;
  app_company_id: string | null;
  public_company_id: string | null;
  name: string | null;
  archived: boolean | null;
  admin_access_id?: string | null;
  synced_at: string | null;
  view_override: string | null;
  enable_secondary_assignee: boolean | null;
  enable_call_ai_for_csms: boolean | null;
  migration_status: MigrationStatus | "glide_mirror";
  source: DataSource;
}

export interface UnifiedTeamMember {
  glide_row_id: string;
  app_member_id: string | null;
  company_id: string | null;
  name: string | null;
  email: string | null;
  photo: string | null;
  role_id: number | null;
  role_is_saa_s_admin: boolean | null;
  role_hide_from_csm_list: boolean | null;
  role_read_only_user: boolean | null;
  capacity_number?: number | null;
  is_archived: boolean | null;
  source: DataSource;
}

interface AppCompanyRow {
  id: string;
  public_company_id: string | null;
  legacy_glide_row_id: string | null;
  name: string | null;
  status: "active" | "paused" | "archived" | null;
  migration_status: MigrationStatus;
  enable_secondary_assignee: boolean | null;
  enable_call_ai_for_csms: boolean | null;
  view_override: string | null;
  updated_at: string | null;
  archived_at: string | null;
}

interface MirrorCompanyRow {
  glide_row_id: string;
  name: string | null;
  archived: boolean | null;
  admin_access_id?: string | null;
  synced_at: string | null;
  view_override: string | null;
  enable_secondary_assignee: boolean | null;
  enable_call_ai_for_csms: boolean | null;
}

interface AppTeamMemberRow {
  id: string;
  legacy_glide_row_id: string | null;
  email: string | null;
  name: string | null;
  photo_url: string | null;
  company_id: string;
  role: "director" | "support" | "csm" | "viewer";
  is_read_only: boolean | null;
  hide_from_csm_list: boolean | null;
  capacity_number: number | null;
  status: "active" | "archived";
}

interface MirrorTeamMemberRow {
  glide_row_id: string;
  company_id: string | null;
  name: string | null;
  email: string | null;
  photo: string | null;
  role_id: number | null;
  role_is_saa_s_admin: boolean | null;
  role_hide_from_csm_list: boolean | null;
  role_read_only_user: boolean | null;
  capacity_number?: number | null;
  is_archived: boolean | null;
}

export function isAppOwnedMigrationStatus(
  status: string | null | undefined,
): status is "pilot" | "migrated" {
  return status === "pilot" || status === "migrated";
}

function mapAppCompany(row: AppCompanyRow): UnifiedCompany | null {
  const legacyId = row.legacy_glide_row_id?.trim();
  if (!legacyId || !isAppOwnedMigrationStatus(row.migration_status)) return null;

  return {
    glide_row_id: legacyId,
    app_company_id: row.id,
    public_company_id: row.public_company_id,
    name: row.name,
    archived: row.status === "archived" || Boolean(row.archived_at),
    synced_at: row.updated_at,
    view_override: row.view_override,
    enable_secondary_assignee: row.enable_secondary_assignee,
    enable_call_ai_for_csms: row.enable_call_ai_for_csms,
    migration_status: row.migration_status,
    source: "app_owned",
  };
}

function mapMirrorCompany(row: MirrorCompanyRow): UnifiedCompany {
  return {
    glide_row_id: row.glide_row_id,
    app_company_id: null,
    public_company_id: null,
    name: row.name,
    archived: row.archived,
    admin_access_id: row.admin_access_id,
    synced_at: row.synced_at,
    view_override: row.view_override,
    enable_secondary_assignee: row.enable_secondary_assignee,
    enable_call_ai_for_csms: row.enable_call_ai_for_csms,
    migration_status: "glide_mirror",
    source: "mirror",
  };
}

export function mapAppTeamMember(
  member: AppTeamMemberRow,
  legacyCompanyId: string,
): UnifiedTeamMember {
  const roleId =
    member.role === "director"
      ? 1
      : member.role === "support"
        ? 2
        : member.role === "csm"
          ? 3
          : null;

  return {
    glide_row_id: member.legacy_glide_row_id ?? member.id,
    app_member_id: member.id,
    email: member.email,
    name: member.name,
    photo: member.photo_url,
    company_id: legacyCompanyId,
    role_id: roleId,
    role_is_saa_s_admin: member.role === "director",
    role_hide_from_csm_list: member.hide_from_csm_list,
    role_read_only_user: member.role === "viewer" || member.is_read_only === true,
    capacity_number: member.capacity_number,
    is_archived: member.status === "archived",
    source: "app_owned",
  };
}

function mapMirrorTeamMember(member: MirrorTeamMemberRow): UnifiedTeamMember {
  return {
    ...member,
    app_member_id: null,
    source: "mirror",
  };
}

export async function loadUnifiedCompanies() {
  const [appResult, mirrorResult] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id, public_company_id, legacy_glide_row_id, name, status, migration_status, enable_secondary_assignee, enable_call_ai_for_csms, view_override, updated_at, archived_at",
      )
      .in("migration_status", ["pilot", "migrated"])
      .order("name", { ascending: true }),
    supabase
      .from("backup_companies")
      .select(
        "glide_row_id, name, archived, admin_access_id, synced_at, view_override, enable_secondary_assignee, enable_call_ai_for_csms",
      )
      .order("name", { ascending: true }),
  ]);

  if (appResult.error) throw appResult.error;
  if (mirrorResult.error) throw mirrorResult.error;

  const byLegacyId = new Map<string, UnifiedCompany>();
  for (const row of (appResult.data ?? []) as AppCompanyRow[]) {
    const company = mapAppCompany(row);
    if (company) byLegacyId.set(company.glide_row_id, company);
  }

  for (const row of (mirrorResult.data ?? []) as MirrorCompanyRow[]) {
    if (!byLegacyId.has(row.glide_row_id)) {
      byLegacyId.set(row.glide_row_id, mapMirrorCompany(row));
    }
  }

  return [...byLegacyId.values()].sort((left, right) =>
    (left.name ?? "").localeCompare(right.name ?? ""),
  );
}

export async function loadUnifiedCompanyByLegacyId(legacyCompanyId: string) {
  const [appResult, mirrorResult] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id, public_company_id, legacy_glide_row_id, name, status, migration_status, enable_secondary_assignee, enable_call_ai_for_csms, view_override, updated_at, archived_at",
      )
      .eq("legacy_glide_row_id", legacyCompanyId)
      .in("migration_status", ["pilot", "migrated"])
      .maybeSingle(),
    supabase
      .from("backup_companies")
      .select(
        "glide_row_id, name, archived, admin_access_id, synced_at, view_override, enable_secondary_assignee, enable_call_ai_for_csms",
      )
      .eq("glide_row_id", legacyCompanyId)
      .maybeSingle(),
  ]);

  if (appResult.error) throw appResult.error;
  if (mirrorResult.error) throw mirrorResult.error;

  const appCompany = appResult.data
    ? mapAppCompany(appResult.data as AppCompanyRow)
    : null;
  if (appCompany) return appCompany;
  return mirrorResult.data
    ? mapMirrorCompany(mirrorResult.data as MirrorCompanyRow)
    : null;
}

export async function loadUnifiedTeamMembers(companies: UnifiedCompany[]) {
  const appCompanies = companies.filter(
    (company) => company.source === "app_owned" && company.app_company_id,
  );
  const mirrorCompanyIds = companies
    .filter((company) => company.source === "mirror")
    .map((company) => company.glide_row_id);

  const appCompanyById = new Map(
    appCompanies.map((company) => [company.app_company_id as string, company]),
  );

  const [appResult, mirrorResult] = await Promise.all([
    appCompanies.length > 0
      ? supabase
          .from("company_members")
          .select(
            "id, legacy_glide_row_id, email, name, photo_url, company_id, role, is_read_only, hide_from_csm_list, capacity_number, status",
          )
          .in(
            "company_id",
            appCompanies.map((company) => company.app_company_id as string),
          )
          .order("name", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    mirrorCompanyIds.length > 0
      ? supabase
          .from("backup_company_team")
          .select(
            "glide_row_id, company_id, name, email, photo, role_id, role_is_saa_s_admin, role_hide_from_csm_list, role_read_only_user, capacity_number, is_archived",
          )
          .in("company_id", mirrorCompanyIds)
          .limit(5000)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (appResult.error) throw appResult.error;
  if (mirrorResult.error) throw mirrorResult.error;

  const appMembers = ((appResult.data ?? []) as AppTeamMemberRow[])
    .map((member) => {
      const company = appCompanyById.get(member.company_id);
      if (!company) return null;
      return mapAppTeamMember(member, company.glide_row_id);
    })
    .filter((member): member is UnifiedTeamMember => Boolean(member));

  const mirrorMembers = ((mirrorResult.data ?? []) as MirrorTeamMemberRow[]).map(
    mapMirrorTeamMember,
  );

  return [...appMembers, ...mirrorMembers];
}
