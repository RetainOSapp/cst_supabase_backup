import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAccountContext } from "../lib/accountContext.tsx";
import { supabase } from "../lib/supabase.ts";

type DetailTab = "team" | "customization" | "pathways" | "settings";
type TeamSource = "mirror" | "app_owned";
type TeamRole = "director" | "support" | "csm" | "viewer";
type TeamStatusFilter = "active" | "archived";

interface CompanyRow {
  glide_row_id: string;
  name: string | null;
  archived: boolean | null;
  synced_at: string | null;
  view_override: string | null;
  enable_secondary_assignee: boolean | null;
  enable_call_ai_for_csms: boolean | null;
}

interface AppCompanyRow {
  id: string;
  legacy_glide_row_id: string | null;
  migration_status: "mirror_only" | "pilot" | "migrated";
}

interface TeamRow {
  glide_row_id: string;
  app_member_id?: string | null;
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

interface AppTeamRow {
  id: string;
  legacy_glide_row_id: string | null;
  email: string | null;
  name: string | null;
  photo_url: string | null;
  company_id: string;
  role: "director" | "support" | "csm" | "viewer";
  is_read_only: boolean | null;
  hide_from_csm_list: boolean | null;
  capacity_number: number | null;
  status: "active" | "archived";
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

function roleValue(member: TeamRow): TeamRole {
  if (member.role_read_only_user) return "viewer";
  if (member.role_id === 1 || member.role_is_saa_s_admin) return "director";
  if (member.role_id === 2) return "support";
  if (member.role_id === 3) return "csm";
  if (member.role_hide_from_csm_list) return "support";
  return "csm";
}

const roleOptions: { label: string; value: TeamRole }[] = [
  { label: "Director", value: "director" },
  { label: "CSM", value: "csm" },
  { label: "Support", value: "support" },
  { label: "Viewer", value: "viewer" },
];

function mapAppTeamMember(member: AppTeamRow, legacyCompanyId: string): TeamRow {
  const roleId =
    member.role === "director"
      ? 1
      : member.role === "support"
        ? 2
        : member.role === "csm"
          ? 3
          : null;

  return {
    glide_row_id: member.legacy_glide_row_id ?? member.id,
    app_member_id: member.id,
    email: member.email,
    name: member.name,
    photo: member.photo_url,
    company_id: legacyCompanyId,
    role_id: roleId,
    role_is_saa_s_admin: member.role === "director",
    role_hide_from_csm_list: member.hide_from_csm_list,
    role_read_only_user: member.role === "viewer" || member.is_read_only === true,
    capacity_number: member.capacity_number,
    is_archived: member.status === "archived",
  };
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

function TeamMemberCard({
  member,
  canManage,
  onEdit,
  onArchive,
}: {
  member: TeamRow;
  canManage: boolean;
  onEdit: (member: TeamRow) => void;
  onArchive: (member: TeamRow) => void;
}) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex justify-end">
        {canManage ? (
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => onEdit(member)}
              className="font-medium text-indigo-600 hover:text-indigo-700"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onArchive(member)}
              className="font-medium text-red-600 hover:text-red-700"
            >
              Archive
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled
            title="Actions are locked in read-only mode"
            className="text-gray-300"
          >
            ...
          </button>
        )}
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
  companyLegacyId,
  canManage,
  member,
  onClose,
  onSaved,
  onArchive,
}: {
  companyName: string;
  companyLegacyId: string;
  canManage: boolean;
  member?: TeamRow | null;
  onClose: () => void;
  onSaved: () => void;
  onArchive: (member: TeamRow) => void;
}) {
  const isEditing = Boolean(member?.app_member_id);
  const [name, setName] = useState(member?.name ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [photoUrl, setPhotoUrl] = useState(member?.photo ?? "");
  const [role, setRole] = useState<TeamRole>(member ? roleValue(member) : "director");
  const [capacityNumber, setCapacityNumber] = useState(
    member?.capacity_number === null || member?.capacity_number === undefined
      ? ""
      : String(member.capacity_number),
  );
  const [hideFromCsmList, setHideFromCsmList] = useState(
    member?.role_hide_from_csm_list === true,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setError(null);

    const { data, error: invokeError } = await supabase.functions.invoke(
      "manage-company-member",
      {
        body: {
          action: isEditing ? "update" : "create",
          companyLegacyId,
          memberId: member?.app_member_id,
          name,
          email,
          photoUrl,
          role,
          capacityNumber: capacityNumber === "" ? null : Number(capacityNumber),
          hideFromCsmList,
        },
      },
    );

    setSaving(false);

    if (invokeError) {
      setError(invokeError.message);
      return;
    }

    if (data?.error) {
      setError(data.error);
      return;
    }

    onSaved();
  }

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
              {isEditing ? "Edit Team Member" : "New Team Member"}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {canManage
                ? `Manage directors, CSMs, support, or viewers for ${companyName}.`
                : `Team writes are not enabled for ${companyName}.`}
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
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 px-6 py-5">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Name*
              </label>
              <input
                required
                disabled={!canManage || saving}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Email*
              </label>
              <input
                required
                type="email"
                disabled={!canManage || saving}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Profile picture URL
              </label>
              <input
                disabled={!canManage || saving}
                value={photoUrl}
                onChange={(event) => setPhotoUrl(event.target.value)}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Capacity %
              </label>
              <input
                type="number"
                min="0"
                max="1000"
                disabled={!canManage || saving}
                value={capacityNumber}
                onChange={(event) => setCapacityNumber(event.target.value)}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
            <div>
              <div className="mb-2 block text-sm font-medium text-gray-700">Role*</div>
              <div className="flex flex-wrap gap-2">
                {roleOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={!canManage || saving}
                    onClick={() => setRole(option.value)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                      role === option.value
                        ? "border-slate-700 bg-slate-700 text-white"
                        : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300"
                    } disabled:opacity-60`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                disabled={!canManage || saving}
                checked={hideFromCsmList}
                onChange={(event) => setHideFromCsmList(event.target.checked)}
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
              />
              The assigned person does not manage clients.
            </label>
            <div
              className={`rounded-md border px-4 py-3 text-sm ${
                canManage
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              {canManage
                ? "Writes are enabled for this RetainOS pilot company."
                : "Editing is locked while this reads from the Glide mirror."}
            </div>
            {error ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-3 border-t border-gray-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {isEditing && member ? (
                <button
                  type="button"
                  onClick={() => onArchive(member)}
                  disabled={!canManage || saving}
                  className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Archive member
                </button>
              ) : null}
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canManage || saving}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? "Saving..." : isEditing ? "Save changes" : "Submit"}
              </button>
            </div>
          </div>
        </form>
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

function TeamStatusButton({
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
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
        active
          ? "bg-slate-800 text-white"
          : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

export function SaasClientDetail({
  companyIdOverride,
  mode = "super_admin",
}: {
  companyIdOverride?: string;
  mode?: "super_admin" | "admin";
}) {
  const navigate = useNavigate();
  const params = useParams();
  const companyId = companyIdOverride ?? params.companyId;
  const { setViewAsCompanyId, viewAsCompanyId } = useAccountContext();
  const [company, setCompany] = useState<CompanyRow | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamRow[]>([]);
  const [activeTab, setActiveTab] = useState<DetailTab>("team");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamRow | null>(null);
  const [teamSource, setTeamSource] = useState<TeamSource>("mirror");
  const [teamReloadKey, setTeamReloadKey] = useState(0);
  const [teamActionError, setTeamActionError] = useState<string | null>(null);
  const [teamStatusFilter, setTeamStatusFilter] =
    useState<TeamStatusFilter>("active");

  useEffect(() => {
    if (!companyId) return;
    const legacyCompanyId = companyId;
    let cancelled = false;

    async function loadCompany() {
      setLoading(true);
      setError(null);
      setTeamActionError(null);

      const [{ data: companyData, error: companyError }, { data: appCompany }] =
        await Promise.all([
          supabase
            .from("backup_companies")
            .select(
              "glide_row_id, name, archived, synced_at, view_override, enable_secondary_assignee, enable_call_ai_for_csms",
            )
            .eq("glide_row_id", legacyCompanyId)
            .maybeSingle(),
          supabase
            .from("companies")
            .select("id, legacy_glide_row_id, migration_status")
            .eq("legacy_glide_row_id", legacyCompanyId)
            .in("migration_status", ["pilot", "migrated"])
            .maybeSingle(),
        ]);

      if (cancelled) return;

      if (companyError) {
        setError(companyError.message);
        setCompany(null);
      } else {
        setCompany(companyData as CompanyRow | null);
      }

      const appCompanyRow = appCompany as AppCompanyRow | null;
      if (appCompanyRow) {
        const { data: appTeam, error: appTeamError } = await supabase
          .from("company_members")
          .select(
            "id, legacy_glide_row_id, email, name, photo_url, company_id, role, is_read_only, hide_from_csm_list, capacity_number, status",
          )
          .eq("company_id", appCompanyRow.id)
          .order("name", { ascending: true });

        if (cancelled) return;

        if (appTeamError) {
          console.error("Failed to load app-owned SaaS team:", appTeamError);
          setTeamSource("mirror");
        } else {
          setTeamMembers(
            ((appTeam ?? []) as AppTeamRow[]).map((member) =>
              mapAppTeamMember(member, legacyCompanyId),
            ),
          );
          setTeamSource("app_owned");
          setLoading(false);
          return;
        }
      }

      const { data: teamData, error: teamError } = await supabase
        .from("backup_company_team")
        .select(
          "glide_row_id, email, name, photo, company_id, role_id, role_is_saa_s_admin, role_hide_from_csm_list, role_read_only_user, capacity_number, is_archived",
        )
        .eq("company_id", legacyCompanyId)
        .order("name", { ascending: true });

      if (cancelled) return;

      if (teamError) console.error("Failed to load SaaS team:", teamError);
      setTeamMembers((teamData ?? []) as TeamRow[]);
      setTeamSource("mirror");
      setLoading(false);
    }

    void loadCompany();

    return () => {
      cancelled = true;
    };
  }, [companyId, teamReloadKey]);

  const groupedTeam = useMemo(() => {
    const activeMembers = teamMembers.filter((member) => member.is_archived !== true);
    return {
      Director: activeMembers.filter((member) => roleLabel(member) === "Director"),
      CSM: activeMembers.filter((member) => roleLabel(member) === "CSM"),
      Support: activeMembers.filter((member) => roleLabel(member) === "Support"),
      Viewer: activeMembers.filter((member) => roleLabel(member) === "Viewer"),
    };
  }, [teamMembers]);

  const archivedTeamMembers = useMemo(
    () => teamMembers.filter((member) => member.is_archived === true),
    [teamMembers],
  );

  const companyName = company?.name ?? "Unnamed company";
  const isViewing = viewAsCompanyId === companyId;
  const canManagePilotTeam = teamSource === "app_owned";

  function handleViewAs() {
    if (!companyId) return;
    setViewAsCompanyId(companyId);
    navigate("/dashboard");
  }

  function handleOpenTeamModal(member?: TeamRow) {
    setEditingMember(member ?? null);
    setShowTeamModal(true);
    setTeamActionError(null);
  }

  function handleCloseTeamModal() {
    setShowTeamModal(false);
    setEditingMember(null);
  }

  function handleTeamSaved() {
    handleCloseTeamModal();
    setTeamReloadKey((key) => key + 1);
  }

  async function handleArchiveMember(member: TeamRow) {
    if (!canManagePilotTeam || !member.app_member_id || !companyId) return;
    const label = member.name ?? member.email ?? "this team member";
    const confirmed = window.confirm(`Archive ${label}?`);
    if (!confirmed) return;

    setTeamActionError(null);
    const { data, error: invokeError } = await supabase.functions.invoke(
      "manage-company-member",
      {
        body: {
          action: "archive",
          companyLegacyId: companyId,
          memberId: member.app_member_id,
        },
      },
    );

    if (invokeError) {
      setTeamActionError(invokeError.message);
      return;
    }

    if (data?.error) {
      setTeamActionError(data.error);
      return;
    }

    setTeamReloadKey((key) => key + 1);
    handleCloseTeamModal();
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
      {mode === "super_admin" ? (
        <Link to="/saas-clients" className="text-sm font-medium text-indigo-600">
          Back to SaaS clients
        </Link>
      ) : (
        <p className="text-sm font-medium text-gray-500">Admin Hub</p>
      )}

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
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              <TeamStatusButton
                active={teamStatusFilter === "active"}
                onClick={() => setTeamStatusFilter("active")}
              >
                Active
              </TeamStatusButton>
              <TeamStatusButton
                active={teamStatusFilter === "archived"}
                onClick={() => setTeamStatusFilter("archived")}
              >
                Archived ({archivedTeamMembers.length})
              </TeamStatusButton>
            </div>
            <div className="flex flex-wrap items-center gap-3 md:justify-end">
              {teamSource === "app_owned" ? (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  RetainOS pilot data
                </span>
              ) : (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                  Glide mirror data
                </span>
              )}
              <button
                type="button"
                onClick={() => handleOpenTeamModal()}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                + New Team Member
              </button>
            </div>
          </div>

          {teamActionError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {teamActionError}
            </div>
          ) : null}

          {teamStatusFilter === "active" ? (
            (["Director", "CSM", "Support", "Viewer"] as const).map((role) => {
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
                          <TeamMemberCard
                            key={member.glide_row_id}
                            member={member}
                            canManage={canManagePilotTeam}
                            onEdit={handleOpenTeamModal}
                            onArchive={handleArchiveMember}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              );
            })
          ) : (
            <section className="rounded-lg border border-gray-200 bg-gray-50">
              <div className="border-b border-gray-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-900">
                  Archived team members
                </h2>
              </div>
              <div className="p-4">
                {archivedTeamMembers.length === 0 ? (
                  <EmptyTeamSection role="archived team member" />
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {archivedTeamMembers.map((member) => (
                      <TeamMemberCard
                        key={member.glide_row_id}
                        member={member}
                        canManage={false}
                        onEdit={handleOpenTeamModal}
                        onArchive={handleArchiveMember}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="mt-6 rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
          This tab is parked for the next phase.
        </div>
      )}

      {showTeamModal && (
        <NewTeamMemberModal
          companyName={companyName}
          companyLegacyId={companyId ?? ""}
          canManage={canManagePilotTeam}
          member={editingMember}
          onClose={handleCloseTeamModal}
          onSaved={handleTeamSaved}
          onArchive={handleArchiveMember}
        />
      )}
    </div>
  );
}
