import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "./supabase.ts";
import { withTimeout } from "./async.ts";

const VIEW_AS_COMPANY_KEY = "retainOS.viewAsCompanyId.v1";

export type AccountRole =
  | "super_admin"
  | "director"
  | "csm"
  | "support"
  | "viewer";

export type AccountStatus = "loading" | "ready" | "no_access";

interface MirrorTeamMembershipRow {
  glide_row_id: string;
  company_id: string | null;
  role_id: number | null;
  role_read_only_user: boolean | null;
  is_archived: boolean | null;
}

interface AppTeamMembershipRow {
  id: string;
  legacy_glide_row_id: string | null;
  company_id: string | null;
  role: Exclude<AccountRole, "super_admin">;
  is_read_only: boolean | null;
  status: "active" | "archived" | null;
  companies:
    | {
        legacy_glide_row_id: string | null;
        migration_status: string | null;
      }
    | Array<{
        legacy_glide_row_id: string | null;
        migration_status: string | null;
      }>
    | null;
}

interface ResolvedMembership {
  role: AccountRole;
  companyId: string;
  teamMemberId: string;
}

export interface AccountCapabilities {
  canAccessSaasClients: boolean;
  canAccessDashboard: boolean;
  canAccessCsmReports: boolean;
  canAccessClients: boolean;
  canAccessResources: boolean;
  canAccessTasks: boolean;
  canAccessTables: boolean;
  canAccessAdminHub: boolean;
  canUseCompanySwitcher: boolean;
  canTriggerAiInsights: boolean;
  canQuickUpdate: boolean;
  canEditClient: boolean;
  canAdvanceClientMilestones: boolean;
  canManageClientPathways: boolean;
  canViewDirectorNotes: boolean;
  canManageTeam: boolean;
  canViewAllClients: boolean;
  canViewOnlyAssignedClients: boolean;
  canViewCompanyDashboard: boolean;
}

interface AccountContextValue {
  email: string | null;
  status: AccountStatus;
  accessIssue: string | null;
  role: AccountRole | null;
  isSuperAdmin: boolean;
  companyId: string;
  teamMemberId: string;
  effectiveCompanyId: string;
  capabilities: AccountCapabilities;
  viewAsCompanyId: string;
  setViewAsCompanyId: (companyId: string) => void;
  clearViewAsCompany: () => void;
}

const AccountContext = createContext<AccountContextValue | null>(null);

function parseAllowlist(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function readStoredViewAsCompanyId() {
  try {
    return window.localStorage.getItem(VIEW_AS_COMPANY_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeStoredViewAsCompanyId(companyId: string) {
  try {
    if (companyId) window.localStorage.setItem(VIEW_AS_COMPANY_KEY, companyId);
    else window.localStorage.removeItem(VIEW_AS_COMPANY_KEY);
  } catch {
    // Local storage is a convenience; app state still works without it.
  }
}

function roleFromMirrorMembership(row: MirrorTeamMembershipRow): AccountRole {
  if (row.role_read_only_user) return "viewer";
  if (row.role_id === 1) return "director";
  if (row.role_id === 2) return "support";
  if (row.role_id === 3) return "csm";
  return "viewer";
}

function companyFromAppMembership(row: AppTeamMembershipRow) {
  return Array.isArray(row.companies) ? row.companies[0] : row.companies;
}

function roleFromAppMembership(row: AppTeamMembershipRow): AccountRole {
  if (row.is_read_only) return "viewer";
  return row.role;
}

function resolveAppMembership(row: AppTeamMembershipRow): ResolvedMembership | null {
  if (row.status !== "active") return null;
  const company = companyFromAppMembership(row);
  if (!company?.legacy_glide_row_id) return null;
  return {
    role: roleFromAppMembership(row),
    companyId: company.legacy_glide_row_id,
    teamMemberId: row.legacy_glide_row_id ?? row.id,
  };
}

function resolveMirrorMembership(row: MirrorTeamMembershipRow): ResolvedMembership | null {
  if (row.is_archived === true || !row.company_id) return null;
  return {
    role: roleFromMirrorMembership(row),
    companyId: row.company_id,
    teamMemberId: row.glide_row_id,
  };
}

function capabilitiesForRole(role: AccountRole | null): AccountCapabilities {
  const isSuperAdmin = role === "super_admin";
  const isDirector = role === "director";
  const isCsm = role === "csm";
  const isSupport = role === "support";
  const isViewer = role === "viewer";
  const canWork = isSuperAdmin || isDirector || isCsm || isSupport;
  const canSeeCompany = isSuperAdmin || isDirector || isCsm || isSupport || isViewer;

  return {
    canAccessSaasClients: isSuperAdmin,
    canAccessDashboard: isSuperAdmin || isDirector || isCsm || isSupport || isViewer,
    canAccessCsmReports: isSuperAdmin || isDirector || isSupport,
    canAccessClients: canSeeCompany,
    canAccessResources: canSeeCompany,
    canAccessTasks: canWork,
    canAccessTables: isSuperAdmin,
    canAccessAdminHub: isSuperAdmin || isDirector,
    canUseCompanySwitcher: isSuperAdmin,
    canTriggerAiInsights: isSuperAdmin || isDirector,
    canQuickUpdate: canWork,
    canEditClient: canWork,
    canAdvanceClientMilestones: isSuperAdmin || isDirector || isCsm,
    canManageClientPathways: isSuperAdmin || isDirector,
    canViewDirectorNotes: isSuperAdmin || isDirector,
    canManageTeam: isSuperAdmin || isDirector,
    canViewAllClients: isSuperAdmin || isDirector || isSupport || isViewer,
    canViewOnlyAssignedClients: isCsm,
    canViewCompanyDashboard: isSuperAdmin || isDirector || isSupport || isViewer,
  };
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [status, setStatus] = useState<AccountStatus>("loading");
  const [accessIssue, setAccessIssue] = useState<string | null>(null);
  const [role, setRole] = useState<AccountRole | null>(null);
  const [companyId, setCompanyId] = useState("");
  const [teamMemberId, setTeamMemberId] = useState("");
  const [viewAsCompanyId, setStoredViewAsCompanyId] = useState(
    readStoredViewAsCompanyId,
  );

  const allowlist = useMemo(
    () => parseAllowlist(import.meta.env.VITE_SUPER_ADMIN_EMAILS as string | undefined),
    [],
  );

  useEffect(() => {
    let mounted = true;

    withTimeout(supabase.auth.getUser(), 10000, "Auth user check")
      .then(({ data: { user } }) => {
        if (mounted) setEmail(user?.email ?? null);
      })
      .catch(() => {
        if (mounted) setEmail(null);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function resolveAccount() {
      setStatus("loading");
      setAccessIssue(null);
      setRole(null);
      setCompanyId("");
      setTeamMemberId("");

      if (email === undefined) {
        return;
      }

      if (!email) {
        setStatus("no_access");
        setAccessIssue("Sign in to access RetainOS.");
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();

      if (allowlist.has(normalizedEmail)) {
        if (cancelled) return;
        setRole("super_admin");
        setStatus("ready");
        return;
      }

      if (allowlist.size === 0) {
        if (cancelled) return;
        setStatus("no_access");
        setAccessIssue("Super Admin allowlist is not configured.");
        return;
      }

      let appData: AppTeamMembershipRow[] | null = null;
      let mirrorData: MirrorTeamMembershipRow[] | null = null;
      let error: { message: string } | null = null;

      try {
        const appResult = await withTimeout(
          supabase
            .from("company_members")
            .select(
              "id, legacy_glide_row_id, company_id, role, is_read_only, status, companies!inner(legacy_glide_row_id, migration_status)",
            )
            .ilike("email", normalizedEmail)
            .in("companies.migration_status", ["pilot", "migrated"]),
          12000,
          "App account lookup",
        );
        appData = appResult.data as AppTeamMembershipRow[] | null;
        error = appResult.error;

        if (!error) {
          const activeAppMemberships = (appData ?? [])
            .map(resolveAppMembership)
            .filter((membership): membership is ResolvedMembership =>
              Boolean(membership),
            );

          if (activeAppMemberships.length > 0) {
            if (activeAppMemberships.length > 1) {
              setStatus("no_access");
              setAccessIssue(
                "This email belongs to multiple companies. Ask a Super Admin to clean up access before signing in.",
              );
              return;
            }

            const membership = activeAppMemberships[0];
            setRole(membership.role);
            setCompanyId(membership.companyId);
            setTeamMemberId(membership.teamMemberId);
            setStatus("ready");
            return;
          }
        }

        const mirrorResult = await withTimeout(
          supabase
            .from("backup_company_team")
            .select("glide_row_id, company_id, role_id, role_read_only_user, is_archived")
            .ilike("email", normalizedEmail),
          12000,
          "Mirror account lookup",
        );
        mirrorData = mirrorResult.data as MirrorTeamMembershipRow[] | null;
        error = mirrorResult.error;
      } catch (err) {
        error = {
          message:
            err instanceof Error
              ? err.message
              : "Account lookup failed. Supabase may be temporarily unavailable.",
        };
      }

      if (cancelled) return;

      if (error) {
        setStatus("no_access");
        setAccessIssue(error.message);
        return;
      }

      const activeMemberships = (mirrorData ?? [])
        .map(resolveMirrorMembership)
        .filter((membership): membership is ResolvedMembership =>
          Boolean(membership),
        );

      if (activeMemberships.length === 0) {
        setStatus("no_access");
        setAccessIssue("No active RetainOS company access was found for this email.");
        return;
      }

      if (activeMemberships.length > 1) {
        setStatus("no_access");
        setAccessIssue(
          "This email belongs to multiple companies. Ask a Super Admin to clean up access before signing in.",
        );
        return;
      }

      const membership = activeMemberships[0];
      setRole(membership.role);
      setCompanyId(membership.companyId);
      setTeamMemberId(membership.teamMemberId);
      setStatus("ready");
    }

    void resolveAccount();

    return () => {
      cancelled = true;
    };
  }, [allowlist, email]);

  const isSuperAdmin = role === "super_admin";
  const effectiveCompanyId = isSuperAdmin ? viewAsCompanyId : companyId;
  const capabilities = useMemo(() => capabilitiesForRole(role), [role]);

  const setViewAsCompanyId = useCallback((companyId: string) => {
    setStoredViewAsCompanyId(companyId);
    writeStoredViewAsCompanyId(companyId);
  }, []);

  const clearViewAsCompany = useCallback(() => setViewAsCompanyId(""), [
    setViewAsCompanyId,
  ]);

  const value = useMemo(
    () => ({
      email: email ?? null,
      status,
      accessIssue,
      role,
      isSuperAdmin,
      companyId,
      teamMemberId,
      effectiveCompanyId,
      capabilities,
      viewAsCompanyId,
      setViewAsCompanyId,
      clearViewAsCompany,
    }),
    [
      accessIssue,
      capabilities,
      clearViewAsCompany,
      companyId,
      effectiveCompanyId,
      email,
      isSuperAdmin,
      role,
      setViewAsCompanyId,
      status,
      teamMemberId,
      viewAsCompanyId,
    ],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccountContext() {
  const value = useContext(AccountContext);
  if (!value) {
    throw new Error("useAccountContext must be used inside AccountProvider");
  }
  return value;
}
