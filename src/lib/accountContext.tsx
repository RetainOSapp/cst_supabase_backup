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

interface AccountContextValue {
  email: string | null;
  isSuperAdmin: boolean;
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

export function AccountProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [viewAsCompanyId, setStoredViewAsCompanyId] = useState(
    readStoredViewAsCompanyId,
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

  const allowlist = useMemo(
    () => parseAllowlist(import.meta.env.VITE_SUPER_ADMIN_EMAILS as string | undefined),
    [],
  );

  const isSuperAdmin = useMemo(() => {
    if (!email) return false;
    if (allowlist.size === 0) return true;
    return allowlist.has(email.toLowerCase());
  }, [allowlist, email]);

  const setViewAsCompanyId = useCallback((companyId: string) => {
    setStoredViewAsCompanyId(companyId);
    writeStoredViewAsCompanyId(companyId);
  }, []);

  const clearViewAsCompany = useCallback(() => setViewAsCompanyId(""), [
    setViewAsCompanyId,
  ]);

  const value = useMemo(
    () => ({
      email,
      isSuperAdmin,
      viewAsCompanyId,
      setViewAsCompanyId,
      clearViewAsCompany,
    }),
    [clearViewAsCompany, email, isSuperAdmin, setViewAsCompanyId, viewAsCompanyId],
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
