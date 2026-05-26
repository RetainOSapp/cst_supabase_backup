import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAccountContext } from "../lib/accountContext.tsx";
import { supabase } from "../lib/supabase.ts";

type DetailTab = "team" | "customization" | "pathways" | "settings";

interface CompanyRow {
  glide_row_id: string;
  name: string | null;
  archived: boolean | null;
  synced_at: string | null;
  view_override: string | null;
  enable_secondary_assignee: boolean | null;
  enable_call_ai_for_csms: boolean | null;
}

interface TeamRow {
  glide_row_id: string;
  email: string | null;
  name: string | null;
  photo: string | null;
  company_id: string | null;
  role_id: number | null;
  role_is_saa_s_admin: boolean | null;
  role_hide_from_csm_list: boolean | null;
  role_read_only_user: boolean | null;
  capacity_number: number | null;
  is_archived: boolean | null;
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
  if (member.role_is_saa_s_admin) return "Director";
  if (member.role_read_only_user) return "Viewer";
  if (member.role_hide_from_csm_list) return "Support";
  return "CSM";
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-1 pb-3 text-sm font-medium ${
        active
          ? "border-indigo-600 text-indigo-600"
          : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

function TeamMemberCard({ member }: { member: TeamRow }) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex justify-end">
        <button
          type="button"
          disabled
          title="Actions are locked in read-only mode"
          className="text-gray-300"
        >
          ...
        </button>
      </div>
      <div className="flex flex-col items-center text-center">
        {member.photo ? (
          <img
            src={member.photo}
            alt=""
            className="h-20 w-20 rounded-full border border-gray-200 object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500">
            {getInitials(member.name)}
          </div>
        )}
        <h3 className="mt-4 max-w-full truncate text-sm font-semibold text-gray-900">
          {member.name ?? "Unnamed user"}
        </h3>
        <p className="mt-1 max-w-full truncate text-xs text-gray-500">
          {member.email ?? "--"}
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
            {roleLabel(member)}
          </span>
          <span
            title="Capacity forecast logic still needs final confirmation."
            className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700"
          >
            {member.capacity_number ?? "No"} Capacity %
          </span>
        </div>
      </div>
    </article>
  );
}

function NewTeamMemberModal({
  companyName,
  onClose,
}: {
  companyName: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close new team member modal"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40"
      />
      <div className="relative w-full max-w-xl rounded-lg border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              New Team Member
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Add directors, CSMs, support, or viewers to {companyName}.
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
          {["Name", "Email", "Profile picture"].map((label) => (
            <div key={label}>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {label}
                {label !== "Profile picture" ? "*" : ""}
              </label>
              <input
                disabled
                className="block w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500"
              />
            </div>
          ))}
          <div>
            <div className="mb-2 block text-sm font-medium text-gray-700">Role*</div>
            <div className="flex flex-wrap gap-2">
              {["Director", "CSM", "Support", "Viewer"].map((role, index) => (
                <button
                  key={role}
                  type="button"
                  disabled
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                    index === 0
                      ? "border-slate-500 bg-slate-500 text-white"
                      : "border-gray-200 bg-gray-50 text-gray-500"
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Role permissions will be enforced when write mode and auth hierarchy are approved.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input disabled type="checkbox" className="h-4 w-4 rounded border-gray-300" />
            The assigned person does not manage clients.
          </label>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Editing is locked while this reads from the Glide mirror.
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white opacity-50"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyTeamSection({ role }: { role: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
      No {role} has been assigned yet.
    </div>
  );
}

export function SaasClientDetail() {
  const navigate = useNavigate();
  const { companyId } = useParams();
  const { setViewAsCompanyId, viewAsCompanyId } = useAccountContext();
  const [company, setCompany] = useState<CompanyRow | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamRow[]>([]);
  const [activeTab, setActiveTab] = useState<DetailTab>("team");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTeamModal, setShowTeamModal] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;

    async function loadCompany() {
      setLoading(true);
      setError(null);

      const [{ data: companyData, error: companyError }, { data: teamData, error: teamError }] =
        await Promise.all([
          supabase
            .from("backup_companies")
            .select(
              "glide_row_id, name, archived, synced_at, view_override, enable_secondary_assignee, enable_call_ai_for_csms",
            )
            .eq("glide_row_id", companyId)
            .maybeSingle(),
          supabase
            .from("backup_company_team")
            .select(
              "glide_row_id, email, name, photo, company_id, role_id, role_is_saa_s_admin, role_hide_from_csm_list, role_read_only_user, capacity_number, is_archived",
            )
            .eq("company_id", companyId)
            .order("name", { ascending: true }),
        ]);

      if (cancelled) return;

      if (companyError) {
        setError(companyError.message);
        setCompany(null);
      } else {
        setCompany(companyData as CompanyRow | null);
      }

      if (teamError) console.error("Failed to load SaaS team:", teamError);
      setTeamMembers((teamData ?? []) as TeamRow[]);
      setLoading(false);
    }

    void loadCompany();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const groupedTeam = useMemo(() => {
    const activeMembers = teamMembers.filter((member) => member.is_archived !== true);
    return {
      Director: activeMembers.filter((member) => roleLabel(member) === "Director"),
      CSM: activeMembers.filter((member) => roleLabel(member) === "CSM"),
      Support: activeMembers.filter((member) => roleLabel(member) === "Support"),
      Viewer: activeMembers.filter((member) => roleLabel(member) === "Viewer"),
    };
  }, [teamMembers]);

  const companyName = company?.name ?? "Unnamed company";
  const isViewing = viewAsCompanyId === companyId;

  function handleViewAs() {
    if (!companyId) return;
    setViewAsCompanyId(companyId);
    navigate("/dashboard");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (error || !company) {
    return (
      <div>
        <Link to="/saas-clients" className="text-sm font-medium text-indigo-600">
          Back to SaaS clients
        </Link>
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error ?? "Company not found."}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link to="/saas-clients" className="text-sm font-medium text-indigo-600">
        Back to SaaS clients
      </Link>

      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 text-sm font-semibold text-slate-500">
              {getInitials(company.name)}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500">{company.glide_row_id}</p>
              <h1 className="truncate text-2xl font-semibold text-gray-900">
                {companyName}
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Last synced {formatDate(company.synced_at)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled
              className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-400"
            >
              Edit SaaS details
            </button>
            <button
              type="button"
              onClick={handleViewAs}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              {isViewing ? "Viewing as company" : "View as company"}
            </button>
          </div>
        </div>
      </section>

      <div className="mt-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-8 overflow-x-auto" aria-label="SaaS client sections">
          <TabButton active={activeTab === "team"} onClick={() => setActiveTab("team")}>
            Team
          </TabButton>
          <TabButton
            active={activeTab === "customization"}
            onClick={() => setActiveTab("customization")}
          >
            Customization
          </TabButton>
          <TabButton
            active={activeTab === "pathways"}
            onClick={() => setActiveTab("pathways")}
          >
            Pathways & Milestones
          </TabButton>
          <TabButton
            active={activeTab === "settings"}
            onClick={() => setActiveTab("settings")}
          >
            Company Settings
          </TabButton>
        </nav>
      </div>

      {activeTab === "team" ? (
        <div className="mt-6 space-y-6">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowTeamModal(true)}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              + New Team Member
            </button>
          </div>

          {(["Director", "CSM", "Support", "Viewer"] as const).map((role) => {
            const members = groupedTeam[role];
            return (
              <section
                key={role}
                className="rounded-lg border border-gray-200 bg-gray-50"
              >
                <div className="border-b border-gray-200 px-4 py-3">
                  <h2 className="text-sm font-semibold text-gray-900">{role}</h2>
                </div>
                <div className="p-4">
                  {members.length === 0 ? (
                    <EmptyTeamSection role={role} />
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      {members.map((member) => (
                        <TeamMemberCard key={member.glide_row_id} member={member} />
                      ))}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
          This tab is parked for the next phase.
        </div>
      )}

      {showTeamModal && (
        <NewTeamMemberModal
          companyName={companyName}
          onClose={() => setShowTeamModal(false)}
        />
      )}
    </div>
  );
}
