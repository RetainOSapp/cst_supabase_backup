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

const VIEW_AS_COMPANY_KEY = "retainOS.viewAsCompanyId.v1";

export type AccountRole =
  | "super_admin"
  | "director"
  | "csm"
  | "support"
  | "viewer";

export type AccountStatus = "loading" | "ready" | "no_access";

interface TeamMembershipRow {
  glide_row_id: string;
  company_id: string | null;
  role_id: number | null;
  role_read_only_user: boolean | null;
  is_archived: boolean | null;
}

export interface AccountCapabilities {
  canAccessSaasClients: boolean;
  canAccessDashboard: boolean;
  canAccessCsmReports: boolean;
  canAccessClients: boolean;
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

function roleFromMembership(row: TeamMembershipRow): AccountRole {
  if (row.role_read_only_user) return "viewer";
  if (row.role_id === 1) return "director";
  if (row.role_id === 2) return "support";
  if (row.role_id === 3) return "csm";
  return "viewer";
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
    canAccessDashboard: isSuperAdmin || isDirector || isCsm || isSupport,
    canAccessCsmReports: isSuperAdmin || isDirector || isSupport,
    canAccessClients: canSeeCompany,
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
    canViewCompanyDashboard: isSuperAdmin || isDirector || isSupport,
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

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (mounted) setEmail(user?.email ?? null);
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

      const { data, error } = await supabase
        .from("backup_company_team")
        .select("glide_row_id, company_id, role_id, role_read_only_user, is_archived")
        .ilike("email", normalizedEmail);

      if (cancelled) return;

      if (error) {
        setStatus("no_access");
        setAccessIssue(error.message);
        return;
      }

      const activeMemberships = ((data ?? []) as TeamMembershipRow[]).filter(
        (membership) =>
          membership.is_archived !== true && Boolean(membership.company_id),
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
      setRole(roleFromMembership(membership));
      setCompanyId(membership.company_id ?? "");
      setTeamMemberId(membership.glide_row_id);
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
