import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase.ts";

export function Header() {
  const [email, setEmail] = useState<string | null>(null);
  const location = useLocation();

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
          <Link to="/" className="text-lg font-semibold text-gray-900 mr-6">
            Glide Sync
          </Link>
          <Link to="/" className={linkClass("/")}>
            Tables
          </Link>
          <Link to="/logs" className={linkClass("/logs")}>
            Sync Log
          </Link>
          <Link to="/dashboard" className={linkClass("/dashboard")}>
            Dashboard
          </Link>
          <Link to="/clients" className={linkClass("/clients")}>
            Clients
          </Link>
        </div>
        <div className="flex items-center gap-4">
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
