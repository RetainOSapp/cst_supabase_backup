import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BeaconWidget } from "./beacon/BeaconWidget.tsx";
import { useAccountContext } from "../lib/accountContext.tsx";
import { loadUnifiedCompanies, loadUnifiedCompanyByLegacyId } from "../lib/appOwnedData.ts";
import { supabase } from "../lib/supabase.ts";

interface SidebarCompany {
  glide_row_id: string;
  name: string | null;
  source?: "app_owned" | "mirror";
}

type IconName =
  | "dashboard"
  | "pulse"
  | "reports"
  | "clients"
  | "resources"
  | "tasks"
  | "pipeline"
  | "call-ai"
  | "groups"
  | "admin"
  | "saas"
  | "tables"
  | "logs";

function NavIcon({ name }: { name: IconName }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": true,
  };
  const strokeProps = {
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (name === "dashboard") {
    return <svg {...common}><path d="M4 4h6v6H4zM14 4h6v10h-6zM4 14h6v6H4zM14 18h6v2h-6z" {...strokeProps} /></svg>;
  }
  if (name === "pulse") {
    return <svg {...common}><path d="M3 12h4l2-7 4 14 2-7h6" {...strokeProps} /></svg>;
  }
  if (name === "reports") {
    return <svg {...common}><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" {...strokeProps} /></svg>;
  }
  if (name === "clients" || name === "saas") {
    return <svg {...common}><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-2a4 4 0 0 0-3-3.87M16 2.13a4 4 0 0 1 0 7.75" {...strokeProps} /></svg>;
  }
  if (name === "resources") {
    return <svg {...common}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5zM8 6h8M8 10h6" {...strokeProps} /></svg>;
  }
  if (name === "tasks") {
    return <svg {...common}><path d="m9 11 3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" {...strokeProps} /></svg>;
  }
  if (name === "pipeline") {
    return <svg {...common}><path d="M3 5h18l-7 8v5l-4 2v-7z" {...strokeProps} /></svg>;
  }
  if (name === "call-ai") {
    return <svg {...common}><path d="M12 3v3M12 18v3M5.64 5.64l2.12 2.12M16.24 16.24l2.12 2.12M3 12h3M18 12h3M5.64 18.36l2.12-2.12M16.24 7.76l2.12-2.12M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z" {...strokeProps} /></svg>;
  }
  if (name === "groups") {
    return <svg {...common}><path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M14 14h2a4 4 0 0 1 4 4v2" {...strokeProps} /></svg>;
  }
  if (name === "admin") {
    return <svg {...common}><path d="M12 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1V21H9.4v-.1a1.7 1.7 0 0 0-1.4-1.5 1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 3.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4H2V9.4h.1A1.7 1.7 0 0 0 3.6 8a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.06 3.2l.06.06A1.7 1.7 0 0 0 8 3.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1V2h4.2v.1A1.7 1.7 0 0 0 15 3.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 8a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1 .4h.1v4.2H21a1.7 1.7 0 0 0-1.6 1.4Z" {...strokeProps} /></svg>;
  }
  if (name === "tables") {
    return <svg {...common}><path d="M4 4h16v16H4zM4 10h16M10 4v16" {...strokeProps} /></svg>;
  }
  return <svg {...common}><path d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5" {...strokeProps} /></svg>;
}

function RetainOsMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg width={compact ? 25 : 28} height={compact ? 25 : 28} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20.5 8.5A9 9 0 1 0 21 13" stroke="#59ABF0" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M20.8 3.6 21.4 9 16 8.2z" fill="#59ABF0" />
      </svg>
      <span className="text-lg font-bold text-white">RetainOS</span>
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companies, setCompanies] = useState<SidebarCompany[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [pipelineVisible, setPipelineVisible] = useState(false);
  const [pipelineVisibilityVersion, setPipelineVisibilityVersion] = useState(0);
  const {
    capabilities,
    email,
    effectiveCompanyId,
    isSuperAdmin,
    role,
    setViewAsCompanyId,
    viewAsCompanyId,
  } = useAccountContext();

  useEffect(() => setMobileOpen(false), [location.pathname]);

  useEffect(() => {
    let cancelled = false;
    if (!effectiveCompanyId) {
      setCompanyName("");
      return;
    }
    loadUnifiedCompanyByLegacyId(effectiveCompanyId)
      .then((data) => {
        if (!cancelled) setCompanyName(data?.name ?? "");
      })
      .catch((error) => {
        console.error("Failed to load active company name:", error);
        if (!cancelled) setCompanyName("");
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveCompanyId]);

  useEffect(() => {
    const refreshPipelineVisibility = (event: Event) => {
      const detail = (event as CustomEvent<{ companyLegacyId?: string }>).detail;
      if (!detail?.companyLegacyId || detail.companyLegacyId === effectiveCompanyId) {
        setPipelineVisibilityVersion((current) => current + 1);
      }
    };
    window.addEventListener("retainos:pipeline-visibility-changed", refreshPipelineVisibility);
    return () => {
      window.removeEventListener("retainos:pipeline-visibility-changed", refreshPipelineVisibility);
    };
  }, [effectiveCompanyId]);

  useEffect(() => {
    let cancelled = false;
    setPipelineVisible(false);
    if (!effectiveCompanyId || !capabilities.canAccessPipeline) return;

    supabase.functions
      .invoke("manage-pipeline-workspace", {
        body: {
          action: "access",
          companyLegacyId: effectiveCompanyId,
        },
      })
      .then(({ data, error }) => {
        if (cancelled || error || data?.error) return;
        const viewerAllowed = role !== "viewer" || data?.viewerAccess === true;
        setPipelineVisible(data?.enabled === true && viewerAllowed);
      })
      .catch(() => {
        if (!cancelled) setPipelineVisible(false);
      });

    return () => {
      cancelled = true;
    };
  }, [capabilities.canAccessPipeline, effectiveCompanyId, pipelineVisibilityVersion, role]);

  useEffect(() => {
    let cancelled = false;
    if (!capabilities.canUseCompanySwitcher) {
      setCompanies([]);
      return;
    }
    setCompaniesLoading(true);
    loadUnifiedCompanies()
      .then((data) => {
        if (cancelled) return;
        setCompanies(
          data
            .filter((company) => company.archived !== true)
            .map((company) => ({
              glide_row_id: company.glide_row_id,
              name: company.name,
              source: company.source,
            })),
        );
        setCompaniesLoading(false);
      })
      .catch((error) => {
        console.error("Failed to load company switcher:", error);
        if (!cancelled) {
          setCompanies([]);
          setCompaniesLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [capabilities.canUseCompanySwitcher]);

  const firstName = useMemo(() => {
    const local = email?.split("@")[0]?.split(/[.+_-]/)[0] ?? "";
    return local ? `${local.charAt(0).toUpperCase()}${local.slice(1)}` : "there";
  }, [email]);

  function switchCompany(companyId: string) {
    setViewAsCompanyId(companyId);
    if (companyId) {
      navigate(`/dashboard?companyId=${encodeURIComponent(companyId)}`);
    }
  }

  const nav = [
    { path: "/dashboard", label: "Dashboard", icon: "dashboard" as const, show: capabilities.canAccessDashboard },
    { path: "/daily-pulse", label: "Daily Pulse", icon: "pulse" as const, show: capabilities.canAccessClients },
    { path: "/clients", label: "Clients", icon: "clients" as const, show: capabilities.canAccessClients },
    { path: "/csm-reports", label: "CSM Reports", icon: "reports" as const, show: capabilities.canAccessCsmReports },
    { path: "/tasks", label: "Tasks", icon: "tasks" as const, show: capabilities.canAccessTasks },
    { path: "/pipeline", label: "Pipeline", icon: "pipeline" as const, show: pipelineVisible },
    { path: "/call-ai", label: "Call AI", icon: "call-ai" as const, show: capabilities.canAccessCallAi },
    { path: "/groups", label: "Groups", icon: "groups" as const, show: capabilities.canAccessClients },
    { path: "/resources", label: "Resources", icon: "resources" as const, show: capabilities.canAccessResources },
    { path: "/admin", label: "Admin Hub", icon: "admin" as const, show: capabilities.canAccessAdminHub },
    { path: "/saas-clients", label: "SaaS Clients", icon: "saas" as const, show: capabilities.canAccessSaasClients },
  ].filter((item) => item.show);

  const devNav = [
    { path: "/tables", label: "Tables", icon: "tables" as const },
    { path: "/logs", label: "Sync Log", icon: "logs" as const },
  ];

  const active = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  const sidebar = (
    <aside className="flex h-full flex-col bg-[#162b3e] text-[#e8eef5]">
      <Link to="/dashboard" className="px-5 pb-4 pt-5">
        <RetainOsMark />
      </Link>
      <div className="mx-3 mb-2 rounded-lg bg-white/5 px-3 py-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8fa3b8]">
          {isSuperAdmin ? "Viewing company" : "Company"}
        </div>
        {capabilities.canUseCompanySwitcher ? (
          <select
            aria-label="View as company"
            value={viewAsCompanyId}
            onChange={(event) => switchCompany(event.target.value)}
            disabled={companiesLoading}
            className="mt-2 block w-full rounded-md border border-white/10 bg-[#1e3a52] px-2.5 py-2 text-xs font-semibold text-white focus:border-[#59abf0] disabled:text-[#8fa3b8]"
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
        ) : (
          <div className="mt-1 truncate text-sm font-semibold text-white">
            {companyName || (effectiveCompanyId ? "Company selected" : "No company")}
          </div>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {nav.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${
              active(item.path)
                ? "bg-[#59abf0] text-white"
                : "text-[#8fa3b8] hover:bg-white/6 hover:text-white"
            }`}
          >
            <NavIcon name={item.icon} />
            {item.label}
          </Link>
        ))}
        {capabilities.canAccessTables && (
          <>
            <div className="px-3 pb-2 pt-5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8fa3b8]">
              Dev Tools
            </div>
            {devNav.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${
                  active(item.path)
                    ? "bg-[#59abf0] text-white"
                    : "text-[#8fa3b8] hover:bg-white/6 hover:text-white"
                }`}
              >
                <NavIcon name={item.icon} />
                {item.label}
              </Link>
            ))}
          </>
        )}
      </nav>
      <div className="border-t border-white/8 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[#2b4d6a] text-xs font-bold text-white">
            {firstName.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-white">{firstName}</div>
            <div className="truncate text-[10px] capitalize text-[#8fa3b8]">
              {role?.replace("_", " ") ?? email}
            </div>
          </div>
          <button
            type="button"
            title="Sign out"
            onClick={() => supabase.auth.signOut()}
            className="retainos-focus ml-auto rounded-md p-2 text-[#8fa3b8] hover:bg-white/6 hover:text-white"
          >
            <span aria-hidden="true">↪</span>
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-[#f7f9fc] lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <div className="hidden h-screen lg:sticky lg:top-0 lg:block">{sidebar}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-[#0e1b29]/55"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative h-full w-[280px] max-w-[85vw]">{sidebar}</div>
        </div>
      )}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-[#e4e9f0] bg-white px-4 sm:px-6 lg:px-7">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
            className="retainos-focus rounded-lg border border-[#e4e9f0] px-3 py-2 text-[#586273] lg:hidden"
          >
            ☰
          </button>
          <div className="hidden whitespace-nowrap text-sm font-semibold text-[#162b3e] sm:block">
            Welcome back, {firstName}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {isSuperAdmin && viewAsCompanyId && (
              <span className="hidden items-center gap-2 rounded-full border border-[#d6eafb] bg-[#eaf4fe] px-3 py-1.5 text-xs font-semibold text-[#2b79c4] sm:flex">
                <span className="h-2 w-2 rounded-full bg-[#34b389]" />
                View as active
              </span>
            )}
          </div>
        </header>
        {children}
        <BeaconWidget />
      </div>
    </div>
  );
}
