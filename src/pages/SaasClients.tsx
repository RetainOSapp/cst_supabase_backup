import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAccountContext } from "../lib/accountContext.tsx";
import {
  loadUnifiedCompanies,
  loadUnifiedTeamMembers,
  type DataSource,
} from "../lib/appOwnedData.ts";
import { supabase } from "../lib/supabase.ts";

type StatusFilter = "active" | "paused" | "archived";

interface CompanyRow {
  glide_row_id: string;
  app_company_id?: string | null;
  public_company_id?: string | null;
  name: string | null;
  archived: boolean | null;
  admin_access_id: string | null;
  synced_at: string | null;
  view_override: string | null;
  enable_secondary_assignee: boolean | null;
  enable_call_ai_for_csms: boolean | null;
  migration_status?: string | null;
  source?: DataSource;
  metadata?: Record<string, unknown> | null;
}

interface TeamRow {
  glide_row_id: string;
  app_member_id?: string | null;
  company_id: string | null;
  name: string | null;
  email: string | null;
  photo: string | null;
  role_id: number | null;
  role_is_saa_s_admin: boolean | null;
  role_hide_from_csm_list: boolean | null;
  role_read_only_user: boolean | null;
  is_archived: boolean | null;
  source?: DataSource;
}

function getInitials(name: string | null | undefined) {
  if (!name) return "--";
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "--"
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function roleLabel(member: TeamRow) {
  if (member.role_read_only_user) return "Viewer";
  if (member.role_id === 1 || member.role_is_saa_s_admin) return "Director";
  if (member.role_id === 2) return "Support";
  if (member.role_id === 3) return "CSM";
  if (member.role_hide_from_csm_list) return "Support";
  return "CSM";
}

function AddSaasClientModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (companyKey: string) => void;
}) {
  const [name, setName] = useState("");
  const [directorName, setDirectorName] = useState("");
  const [directorEmail, setDirectorEmail] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [subscriptionTier, setSubscriptionTier] = useState("pro_enterprise_dfy");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke(
      "manage-saas-company",
      { body: { name, directorName, directorEmail, logoUrl, subscriptionTier } },
    );
    setSaving(false);
    if (invokeError) {
      const response = invokeError.context;
      const responseBody = response instanceof Response
        ? await response.json().catch(() => null)
        : null;
      setError(responseBody?.error ?? invokeError.message ?? "Unable to create workspace.");
      return;
    }
    if (data?.error || !data?.company?.companyKey) {
      setError(data?.error ?? "Unable to create workspace.");
      return;
    }
    onCreated(String(data.company.companyKey));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close add SaaS client modal"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40"
      />
      <form onSubmit={handleSubmit} className="relative w-full max-w-xl rounded-lg border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Add New SaaS Client
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Create a private RetainOS workspace for DFY installation. The Director invite is held until setup is complete.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <span className="sr-only">Close</span>
            <span className="text-xl leading-none">x</span>
          </button>
        </div>
        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Company Name*</label>
            <input required disabled={saving} value={name} onChange={(event) => setName(event.target.value)} placeholder="Acme Inc" className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">First Director*</label>
              <input required disabled={saving} value={directorName} onChange={(event) => setDirectorName(event.target.value)} placeholder="Jane Smith" className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Director Email*</label>
              <input required type="email" disabled={saving} value={directorEmail} onChange={(event) => setDirectorEmail(event.target.value)} placeholder="jane@example.com" className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Logo URL</label>
            <input
              type="url" disabled={saving} value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="https://…"
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Subscription Tier
            </label>
            <select
              disabled={saving} value={subscriptionTier} onChange={(event) => setSubscriptionTier(event.target.value)}
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
            >
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="pro_enterprise_dfy">Pro / Enterprise / DFY</option>
            </select>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            A RetainOS workspace ID is generated automatically. No Glide/CST record, migration, or sync is created.
          </div>
          {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? "Creating…" : "Create Private Workspace"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function SaasClients() {
  const navigate = useNavigate();
  const { setViewAsCompanyId, viewAsCompanyId } = useAccountContext();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [activatingCompanyKey, setActivatingCompanyKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSaasClients() {
      setLoading(true);
      setError(null);

      let companyRows: CompanyRow[] = [];
      let teamRows: TeamRow[] = [];
      let loadError: string | null = null;

      try {
        const unifiedCompanies = await loadUnifiedCompanies();
        companyRows = unifiedCompanies as CompanyRow[];
        teamRows = (await loadUnifiedTeamMembers(unifiedCompanies)) as TeamRow[];
      } catch (error) {
        loadError = error instanceof Error ? error.message : "Failed to load SaaS clients.";
      }

      if (cancelled) return;

      if (loadError) {
        setCompanies([]);
        setTeamMembers([]);
        setError(loadError);
        setLoading(false);
        return;
      }

      setCompanies(companyRows);
      setTeamMembers(teamRows);

      if (!cancelled) setLoading(false);
    }

    void loadSaasClients();

    return () => {
      cancelled = true;
    };
  }, []);

  const teamByCompanyId = useMemo(() => {
    const map = new Map<string, TeamRow[]>();
    teamMembers.forEach((member) => {
      if (!member.company_id || member.is_archived === true) return;
      const list = map.get(member.company_id) ?? [];
      list.push(member);
      map.set(member.company_id, list);
    });
    return map;
  }, [teamMembers]);

  const filteredCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter((company) => {
      const archived = company.archived === true;
      if (statusFilter === "active" && archived) return false;
      if (statusFilter === "archived" && !archived) return false;
      if (statusFilter === "paused") return false;
      if (!q) return true;
      const team = teamByCompanyId.get(company.glide_row_id) ?? [];
      return (
        (company.name ?? "").toLowerCase().includes(q) ||
        company.glide_row_id.toLowerCase().includes(q) ||
        team.some(
          (member) =>
            (member.name ?? "").toLowerCase().includes(q) ||
            (member.email ?? "").toLowerCase().includes(q),
        )
      );
    });
  }, [companies, search, statusFilter, teamByCompanyId]);

  const statusCounts = useMemo(
    () => ({
      active: companies.filter((company) => company.archived !== true).length,
      paused: 0,
      archived: companies.filter((company) => company.archived === true).length,
    }),
    [companies],
  );

  function viewAsCompany(companyId: string) {
    setViewAsCompanyId(companyId);
    navigate("/dashboard");
  }

  async function activateAndInviteDirector(companyKey: string) {
    if (activatingCompanyKey) return;
    setActivatingCompanyKey(companyKey);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke(
      "manage-saas-company",
      { body: { action: "activate_and_invite_director", companyKey } },
    );
    setActivatingCompanyKey(null);
    if (invokeError) {
      const response = invokeError.context;
      const responseBody = response instanceof Response
        ? await response.json().catch(() => null)
        : null;
      setError(responseBody?.error ?? invokeError.message ?? "Unable to activate the Director.");
      return;
    }
    if (data?.error) {
      setError(data.error);
      return;
    }
    window.location.reload();
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
            Super Admin
          </p>
          <h1 className="mt-1 text-xl font-semibold text-gray-900">
            SaaS Clients
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage company accounts and choose the company you want to view as.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + Add New SaaS Client
        </button>
      </div>

      <div className="mb-5 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div>
            <label
              htmlFor="saas-search"
              className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500"
            >
              Search
            </label>
            <input
              id="saas-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Company, team member, or email"
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="inline-flex rounded-md border border-gray-200 bg-white p-1">
            {(["active", "paused", "archived"] as StatusFilter[]).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded px-3 py-1.5 text-sm font-medium capitalize ${
                  statusFilter === status
                    ? "bg-indigo-600 text-white"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {status} {statusCounts[status]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="h-56 animate-pulse rounded-lg border border-gray-200 bg-white shadow-sm"
            />
          ))}
        </div>
      ) : filteredCompanies.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
          No SaaS clients matched this view.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredCompanies.map((company) => {
            const team = teamByCompanyId.get(company.glide_row_id) ?? [];
            const director =
              team.find((member) => member.role_is_saa_s_admin) ?? team[0];
            const isViewing = viewAsCompanyId === company.glide_row_id;
            const isPrivateSetup =
              company.metadata?.data_origin === "retainos_native" &&
              company.metadata?.onboarding_state === "private_setup";

            return (
              <article
                key={company.glide_row_id}
                className={`rounded-lg border bg-white shadow-sm ${
                  isViewing ? "border-indigo-300 ring-2 ring-indigo-100" : "border-gray-200"
                }`}
              >
                <div className="flex h-24 items-center justify-center rounded-t-lg bg-slate-100">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-sm font-semibold text-slate-500">
                    {getInitials(company.name)}
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to={`/saas-clients/${encodeURIComponent(company.glide_row_id)}`}
                        className="truncate text-sm font-semibold text-gray-900 hover:text-indigo-700"
                      >
                        {company.name ?? "Unnamed company"}
                      </Link>
                      <p className="mt-1 truncate text-xs text-gray-500">
                        {director
                          ? `${director.name ?? "Unnamed director"} · ${roleLabel(director)}`
                          : "No team configured"}
                      </p>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                      isPrivateSetup
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}>
                      {isPrivateSetup ? "Private setup" : company.archived ? "Archived" : "Active"}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-gray-500">
                    <div>
                      <div className="uppercase tracking-wider">Team</div>
                      <div className="mt-0.5 font-semibold text-gray-900">
                        {team.length}
                      </div>
                    </div>
                    <div>
                      <div className="uppercase tracking-wider">Synced</div>
                      <div className="mt-0.5 font-semibold text-gray-900">
                        {company.source === "app_owned"
                          ? "RetainOS"
                          : formatDate(company.synced_at)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Link
                      to={`/saas-clients/${encodeURIComponent(company.glide_row_id)}`}
                      className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      View
                    </Link>
                    <button
                      type="button"
                      onClick={() => viewAsCompany(company.glide_row_id)}
                      className="flex-1 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                      {isViewing ? "Viewing" : "View as"}
                    </button>
                  </div>
                  {isPrivateSetup ? (
                    <button
                      type="button"
                      onClick={() => void activateAndInviteDirector(company.glide_row_id)}
                      disabled={activatingCompanyKey !== null}
                      className="mt-2 w-full rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                    >
                      {activatingCompanyKey === company.glide_row_id
                        ? "Activating…"
                        : "Activate & invite Director"}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {showAddModal && (
        <AddSaasClientModal
          onClose={() => setShowAddModal(false)}
          onCreated={(companyKey) => {
            setShowAddModal(false);
            setViewAsCompanyId(companyKey);
            navigate(`/saas-clients/${encodeURIComponent(companyKey)}`);
          }}
        />
      )}
    </div>
  );
}
