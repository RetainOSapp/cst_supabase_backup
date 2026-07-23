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

interface ResolvedAccountRow {
  account_role: AccountRole;
  company_legacy_id: string | null;
  team_member_id: string | null;
  membership_source: "registry" | "app" | "mirror";
}

export interface AccountCapabilities {
  canAccessSaasClients: boolean;
  canAccessDashboard: boolean;
  canAccessCsmReports: boolean;
  canAccessClients: boolean;
  canAccessResources: boolean;
  canAccessTasks: boolean;
  canAccessPipeline: boolean;
  canManagePipelineItems: boolean;
  canConfigurePipelines: boolean;
  canAccessCallAi: boolean;
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

function isAccountRole(value: unknown): value is AccountRole {
  return ["super_admin", "director", "csm", "support", "viewer"].includes(
    String(value),
  );
}

function capabilitiesForRole(
  role: AccountRole | null,
  callAiForCsms = false,
): AccountCapabilities {
  const isSuperAdmin = role === "super_admin";
  const isDirector = role === "director";
  const isCsm = role === "csm";
  const isSupport = role === "support";
  const isViewer = role === "viewer";
  const canWork = isSuperAdmin || isDirector || isCsm || isSupport;
  const canSeeClientData = isSuperAdmin || isDirector || isCsm || isSupport;

  return {
    canAccessSaasClients: isSuperAdmin,
    canAccessDashboard: isSuperAdmin || isDirector || isCsm || isSupport || isViewer,
    canAccessCsmReports: isSuperAdmin || isDirector || isSupport,
    canAccessClients: canSeeClientData,
    canAccessResources: canSeeClientData || isViewer,
    canAccessTasks: canWork,
    canAccessPipeline: canWork || isViewer,
    canManagePipelineItems: canWork,
    canConfigurePipelines: isSuperAdmin || isDirector,
    canAccessCallAi:
      isSuperAdmin || isDirector || isSupport || (isCsm && callAiForCsms),
    canAccessTables: isSuperAdmin,
    canAccessAdminHub: isSuperAdmin || isDirector,
    canUseCompanySwitcher: isSuperAdmin,
    canTriggerAiInsights: isSuperAdmin || isDirector,
    canQuickUpdate: canWork,
    canEditClient: canWork,
    canAdvanceClientMilestones: isSuperAdmin || isDirector || isCsm,
    canManageClientPathways: isSuperAdmin || isDirector || isCsm,
    canViewDirectorNotes: isSuperAdmin || isDirector,
    canManageTeam: isSuperAdmin || isDirector,
    canViewAllClients: isSuperAdmin || isDirector || isSupport,
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
  const [callAiForCsms, setCallAiForCsms] = useState(false);
  const [viewAsCompanyId, setStoredViewAsCompanyId] = useState(
    readStoredViewAsCompanyId,
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

      try {
        const { data, error } = await withTimeout(
          supabase.rpc("resolve_current_account"),
          12000,
          "RetainOS account lookup",
        );
        if (error) throw error;

        const account = (Array.isArray(data) ? data[0] : data) as
          | ResolvedAccountRow
          | null;
        if (!account || !isAccountRole(account.account_role)) {
          if (cancelled) return;
          setStatus("no_access");
          setAccessIssue("No active RetainOS company access was found for this email.");
          return;
        }

        if (cancelled) return;
        setRole(account.account_role);
        setCompanyId(account.company_legacy_id ?? "");
        setTeamMemberId(account.team_member_id ?? "");
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        setStatus("no_access");
        setAccessIssue(
          error instanceof Error
            ? error.message
            : "Account lookup failed. Supabase may be temporarily unavailable.",
        );
      }
    }

    void resolveAccount();

    return () => {
      cancelled = true;
    };
  }, [email]);

  const isSuperAdmin = role === "super_admin";
  const effectiveCompanyId = isSuperAdmin ? viewAsCompanyId : companyId;

  useEffect(() => {
    let cancelled = false;
    async function loadCallAiSetting() {
      setCallAiForCsms(false);
      if (role !== "csm" || !effectiveCompanyId) return;
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .select("id")
        .eq("legacy_glide_row_id", effectiveCompanyId)
        .in("migration_status", ["pilot", "migrated"])
        .maybeSingle();
      if (cancelled || companyError || !company?.id) return;
      const { data: settings, error: settingsError } = await supabase
        .from("company_settings")
        .select("enable_call_ai_for_csms")
        .eq("company_id", company.id)
        .maybeSingle();
      if (!cancelled && !settingsError) {
        setCallAiForCsms(settings?.enable_call_ai_for_csms === true);
      }
    }
    void loadCallAiSetting();
    return () => {
      cancelled = true;
    };
  }, [effectiveCompanyId, role]);

  const capabilities = useMemo(
    () => capabilitiesForRole(role, callAiForCsms),
    [callAiForCsms, role],
  );

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
