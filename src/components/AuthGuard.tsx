import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.ts";
import type { Session } from "@supabase/supabase-js";
import { withTimeout } from "../lib/async.ts";

export function AuthGuard({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    withTimeout(supabase.auth.getSession(), 10000, "Auth session check")
      .then(({ data: { session: s } }) => {
        if (!mounted) return;
        setSession(s);
        if (!s) navigate("/login", { replace: true });
      })
      .catch((err: Error) => {
        if (!mounted) return;
        setError(err.message);
        setSession(null);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setError(null);
      setSession(s);
      if (!s) navigate("/login", { replace: true });
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-lg border border-amber-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">RetainOS is temporarily unavailable</h1>
          <p className="mt-2 text-sm text-gray-600">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-lg bg-[#162b3e] px-4 py-2 text-sm font-semibold text-white"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!session) return null;

  return <>{children}</>;
}
