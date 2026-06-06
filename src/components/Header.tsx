import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAccountContext } from "../lib/accountContext.tsx";
import { supabase } from "../lib/supabase.ts";

export function Header() {
  const [email, setEmail] = useState<string | null>(null);
  const location = useLocation();
  const { capabilities, isSuperAdmin, role, viewAsCompanyId } = useAccountContext();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setEmail(user?.email ?? null);
    });
  }, []);

  const isActive = (path: string) => {
    if (path === "/") {
      return (
        location.pathname === "/" || location.pathname.startsWith("/tables")
      );
    }
    return (
      location.pathname === path || location.pathname.startsWith(`${path}/`)
    );
  };

  const linkClass = (path: string) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive(path)
        ? "bg-indigo-100 text-indigo-700"
        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
    }`;

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
        <div className="flex items-center gap-1">
          <Link to="/dashboard" className="text-lg font-semibold text-gray-900 mr-6">
            RetainOS
          </Link>
          {capabilities.canAccessTables && (
            <>
              <Link to="/tables" className={linkClass("/tables")}>
                Tables
              </Link>
              <Link to="/logs" className={linkClass("/logs")}>
                Sync Log
              </Link>
            </>
          )}
          {capabilities.canAccessDashboard && (
            <Link to="/dashboard" className={linkClass("/dashboard")}>
              Dashboard
            </Link>
          )}
          {capabilities.canAccessCsmReports && (
            <Link to="/csm-reports" className={linkClass("/csm-reports")}>
              CSM Reports
            </Link>
          )}
          {capabilities.canAccessClients && (
            <Link to="/clients" className={linkClass("/clients")}>
              Clients
            </Link>
          )}
          {capabilities.canAccessTasks && (
            <Link to="/tasks" className={linkClass("/tasks")}>
              Tasks
            </Link>
          )}
          {capabilities.canAccessAdminHub && (
            <Link to="/admin" className={linkClass("/admin")}>
              Admin Hub
            </Link>
          )}
          {capabilities.canAccessSaasClients && (
            <Link to="/saas-clients" className={linkClass("/saas-clients")}>
              SaaS Clients
            </Link>
          )}
        </div>
        <div className="flex items-center gap-4">
          {isSuperAdmin && viewAsCompanyId && (
            <span className="hidden rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 md:inline">
              View as active
            </span>
          )}
          {role && (
            <span className="hidden rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium capitalize text-gray-600 md:inline">
              {role.replace("_", " ")}
            </span>
          )}
          {email && (
            <span className="text-sm text-gray-500 hidden sm:inline">
              {email}
            </span>
          )}
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-sm text-gray-500 hover:text-gray-700 cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
}
