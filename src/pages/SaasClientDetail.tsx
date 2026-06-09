import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAccountContext } from "../lib/accountContext.tsx";
import { loadUnifiedCompanyByLegacyId } from "../lib/appOwnedData.ts";
import { supabase } from "../lib/supabase.ts";

type DetailTab = "team" | "customization" | "pathways" | "settings";
type TeamSource = "mirror" | "app_owned";
type PathwaySource = "mirror" | "app_owned";
type CustomizationSource = "mirror" | "app_owned";
type SettingsSource = "mirror" | "app_owned";
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

interface CompanyOfferRow {
  glide_row_id: string;
  name: string | null;
  company_id?: string | null;
  status?: "active" | "archived" | null;
}

interface CompanyOfferMilestoneRow {
  glide_row_id: string;
  offer_id: string | null;
  name: string | null;
  position?: number | null;
  order?: number | null;
  target_days_to_complete?: number | null;
  target_days_to_complete_from_onboarding_date?: number | null;
  is_ttv_milestone?: boolean | null;
  ttv_milestone?: boolean | null;
  is_final_milestone?: boolean | null;
  final_milestone?: boolean | null;
  status?: "active" | "archived" | null;
}

interface CompanyOutcomeDefinitionRow {
  id?: string;
  outcome_type: "success" | "progress" | "buy_in" | "suitable";
  value: string;
  label: string;
  color?: string | null;
  emoji?: string | null;
  positive_rank?: number | null;
  position?: number | null;
  is_default?: boolean | null;
  status?: "active" | "archived" | null;
  metadata?: Record<string, unknown> | null;
}

interface CompanyChurnReasonRow {
  id?: string;
  value: string;
  label: string;
  category?: string | null;
  requires_notes?: boolean | null;
  counts_as_churn?: boolean | null;
  position?: number | null;
  status?: "active" | "archived" | null;
  metadata?: Record<string, unknown> | null;
}

interface CompanySettingsRow {
  id?: string;
  profile_upkeep_freshness_days: number;
  default_client_view: "list" | "card" | "calendar";
  default_calendar_mode: "month" | "week" | "day";
  enable_secondary_assignee: boolean;
  enable_call_ai_for_csms: boolean;
  enable_embeds: boolean;
  enable_zapier_client_create: boolean;
  metadata?: Record<string, unknown> | null;
  updated_at?: string | null;
}

interface PathwayUsageCounts {
  offers: Record<string, number>;
  milestones: Record<string, number>;
}

interface ArchiveAffectedClient {
  glide_row_id?: string | null;
  client_name?: string | null;
  business_name?: string | null;
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
                : "Editing is locked while this reads from CST into RetainOS."}
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

function PathwaySetupModal({
  companyLegacyId,
  offer,
  milestone,
  defaultOfferId,
  onClose,
  onSaved,
}: {
  companyLegacyId: string;
  offer?: CompanyOfferRow | null;
  milestone?: CompanyOfferMilestoneRow | null;
  defaultOfferId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isMilestone = milestone !== undefined;
  const isEditing = Boolean(offer || milestone);
  const [name, setName] = useState(offer?.name ?? milestone?.name ?? "");
  const [targetDays, setTargetDays] = useState(
    String(
      milestone?.target_days_to_complete ??
        milestone?.target_days_to_complete_from_onboarding_date ??
        "",
    ),
  );
  const [isTtvMilestone, setIsTtvMilestone] = useState(
    milestone?.is_ttv_milestone ?? milestone?.ttv_milestone ?? false,
  );
  const [isFinalMilestone, setIsFinalMilestone] = useState(
    milestone?.is_final_milestone ?? milestone?.final_milestone ?? false,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const action = isMilestone
      ? isEditing
        ? "update_milestone"
        : "create_milestone"
      : isEditing
        ? "update_offer"
        : "create_offer";
    const { data, error: invokeError } = await supabase.functions.invoke(
      "manage-company-pathway",
      {
        body: {
          action,
          companyLegacyId,
          entityId: milestone?.glide_row_id ?? offer?.glide_row_id,
          offerId: milestone?.offer_id ?? defaultOfferId,
          name,
          targetDays,
          isTtvMilestone,
          isFinalMilestone,
        },
      },
    );
    setSaving(false);
    if (invokeError || data?.error) {
      setError(data?.error ?? invokeError?.message ?? "Unable to save.");
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-xl rounded-lg border border-[#e4e9f0] bg-white shadow-2xl">
        <form onSubmit={handleSubmit}>
          <div className="flex items-center justify-between border-b border-[#e4e9f0] px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-[#162b3e]">
                {isEditing ? "Edit" : "New"} {isMilestone ? "milestone" : "offer"}
              </h2>
              <p className="mt-1 text-sm text-[#6c7684]">
                This configuration will be available to RetainOS pilot clients.
              </p>
            </div>
            <button type="button" onClick={onClose} className="text-2xl text-[#6c7684]">
              ×
            </button>
          </div>
          <div className="space-y-4 px-6 py-5">
            <label className="block text-sm font-semibold text-[#364152]">
              Name
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 block w-full rounded-md border border-[#cbd2dc] px-3 py-2.5 text-sm"
              />
            </label>
            {isMilestone ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-semibold text-[#364152]">
                    Target days from onboarding
                    <input
                      type="number"
                      min="0"
                      value={targetDays}
                      onChange={(event) => setTargetDays(event.target.value)}
                      className="mt-1 block w-full rounded-md border border-[#cbd2dc] px-3 py-2.5 text-sm"
                    />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-sm text-[#364152]">
                  <input
                    type="checkbox"
                    checked={isTtvMilestone}
                    onChange={(event) => setIsTtvMilestone(event.target.checked)}
                  />
                  Counts as the time-to-value milestone
                </label>
                <label className="flex items-center gap-2 text-sm text-[#364152]">
                  <input
                    type="checkbox"
                    checked={isFinalMilestone}
                    onChange={(event) => setIsFinalMilestone(event.target.checked)}
                  />
                  Final milestone in this offer
                </label>
              </>
            ) : null}
            {error ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}
          </div>
          <div className="flex justify-end gap-3 border-t border-[#e4e9f0] px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-[#cbd2dc] px-4 py-2 text-sm font-semibold text-[#586273]"
            >
              Cancel
            </button>
            <button
              disabled={saving}
              className="rounded-md bg-[#59abf0] px-4 py-2 text-sm font-semibold text-[#162b3e] disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PathwaysSetup({
  companyLegacyId,
  source,
  offers,
  milestones,
  usageCounts,
  canManage,
  onReload,
  onMilestonesReordered,
}: {
  companyLegacyId: string;
  source: PathwaySource;
  offers: CompanyOfferRow[];
  milestones: CompanyOfferMilestoneRow[];
  usageCounts: PathwayUsageCounts;
  canManage: boolean;
  onReload: () => void;
  onMilestonesReordered: (offerId: string, milestones: CompanyOfferMilestoneRow[]) => void;
}) {
  const [editingOffer, setEditingOffer] = useState<CompanyOfferRow | null | undefined>();
  const [editingMilestone, setEditingMilestone] =
    useState<CompanyOfferMilestoneRow | null | undefined>();
  const [newMilestoneOfferId, setNewMilestoneOfferId] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [reorderingOfferId, setReorderingOfferId] = useState<string | null>(null);

  function archiveErrorMessage(
    fallback: string,
    data: Record<string, unknown> | null | undefined,
  ) {
    const count = typeof data?.affectedCount === "number" ? data.affectedCount : null;
    const clients = Array.isArray(data?.affectedClients)
      ? (data.affectedClients as ArchiveAffectedClient[])
      : [];
    if (!count || clients.length === 0) return fallback;
    const sample = clients
      .map((client) => client.client_name ?? client.business_name ?? client.glide_row_id)
      .filter(Boolean)
      .join(", ");
    return `${fallback} Active clients: ${sample}${count > clients.length ? `, and ${count - clients.length} more` : ""}.`;
  }

  async function archiveItem(
    action: "archive_offer" | "archive_milestone",
    entityId: string,
    label: string,
  ) {
    if (!window.confirm(`Archive ${label}?`)) return;
    setActionError(null);
    const { data, error } = await supabase.functions.invoke("manage-company-pathway", {
      body: { action, companyLegacyId, entityId },
    });
    if (error || data?.error) {
      setActionError(
        archiveErrorMessage(
          data?.error ?? error?.message ?? "Unable to archive.",
          data as Record<string, unknown> | null | undefined,
        ),
      );
      return;
    }
    onReload();
  }

  async function unarchiveItem(
    action: "unarchive_offer" | "unarchive_milestone",
    entityId: string,
    label: string,
  ) {
    if (!window.confirm(`Restore ${label}?`)) return;
    setActionError(null);
    const { data, error } = await supabase.functions.invoke("manage-company-pathway", {
      body: { action, companyLegacyId, entityId },
    });
    if (error || data?.error) {
      setActionError(data?.error ?? error?.message ?? "Unable to restore.");
      return;
    }
    onReload();
  }

  async function reorderMilestone(
    offerId: string,
    offerMilestones: CompanyOfferMilestoneRow[],
    milestoneId: string,
    direction: "up" | "down",
  ) {
    const currentIndex = offerMilestones.findIndex(
      (milestone) => milestone.glide_row_id === milestoneId,
    );
    const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || swapIndex < 0 || swapIndex >= offerMilestones.length) return;
    const nextOrder = offerMilestones.map((milestone) => milestone.glide_row_id);
    [nextOrder[currentIndex], nextOrder[swapIndex]] = [
      nextOrder[swapIndex],
      nextOrder[currentIndex],
    ];
    setActionError(null);
    setReorderingOfferId(offerId);
    const { data, error } = await supabase.functions.invoke("manage-company-pathway", {
      body: {
        action: "reorder_milestones",
        companyLegacyId,
        offerId,
        milestoneIds: nextOrder,
      },
    });
    setReorderingOfferId(null);
    if (error || data?.error) {
      setActionError(data?.error ?? error?.message ?? "Unable to reorder milestones.");
      return;
    }
    if (Array.isArray(data?.items)) {
      onMilestonesReordered(offerId, data.items as CompanyOfferMilestoneRow[]);
      return;
    }
    onReload();
  }

  function isArchivedTemporaryTestOffer(offer: CompanyOfferRow) {
    return /temporary\s+test\s+offer/i.test(offer.name ?? "");
  }

  const activeOffers = offers.filter((offer) => offer.status !== "archived");
  const archivedOffers = offers.filter(
    (offer) =>
      offer.status === "archived" && !isArchivedTemporaryTestOffer(offer),
  );

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[#162b3e]">Offers & Milestones</h2>
          <p className="mt-1 text-sm text-[#6c7684]">
            Configure the primary client journeys and their ordered milestones.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              source === "app_owned"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-slate-50 text-slate-600"
            }`}
          >
            {source === "app_owned" ? "RetainOS pilot data" : "CST preview data"}
          </span>
          <button
            type="button"
            disabled={!canManage}
            onClick={() => setEditingOffer(null)}
            className="rounded-md bg-[#59abf0] px-4 py-2 text-sm font-semibold text-[#162b3e] disabled:opacity-40"
          >
            + New Offer
          </button>
        </div>
      </div>

      {source === "mirror" ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This company still reads journey configuration from Glide. Editing unlocks when
          the company enters the RetainOS pilot.
        </div>
      ) : null}
      {actionError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      ) : null}

      {activeOffers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#cbd2dc] bg-white p-10 text-center text-sm text-[#6c7684]">
          No active offers configured yet.
        </div>
      ) : (
        activeOffers.map((offer) => {
          const offerMilestones = milestones
            .filter(
              (milestone) =>
                milestone.offer_id === offer.glide_row_id &&
                milestone.status !== "archived",
            )
            .sort(
              (a, b) =>
                Number(a.position ?? a.order ?? 0) - Number(b.position ?? b.order ?? 0),
            );
          const archivedMilestones = milestones
            .filter(
              (milestone) =>
                milestone.offer_id === offer.glide_row_id &&
                milestone.status === "archived",
            )
            .sort(
              (a, b) =>
                Number(a.position ?? a.order ?? 0) - Number(b.position ?? b.order ?? 0),
            );
          return (
            <section
              key={offer.glide_row_id}
              className="rounded-lg border border-[#e4e9f0] bg-white shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4e9f0] px-5 py-4">
                <div>
                  <h3 className="font-semibold text-[#162b3e]">{offer.name}</h3>
                  <p className="mt-1 text-xs text-[#6c7684]">
                    {offerMilestones.length} active milestone
                    {offerMilestones.length === 1 ? "" : "s"}
                    {" · "}
                    {usageCounts.offers[offer.glide_row_id] ?? 0} active client
                    {(usageCounts.offers[offer.glide_row_id] ?? 0) === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!canManage}
                    onClick={() => setEditingOffer(offer)}
                    className="rounded-md border border-[#cbd2dc] px-3 py-1.5 text-sm font-semibold text-[#586273] disabled:opacity-40"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={!canManage}
                    onClick={() => {
                      setNewMilestoneOfferId(offer.glide_row_id);
                      setEditingMilestone(null);
                    }}
                    className="rounded-md border border-[#59abf0] px-3 py-1.5 text-sm font-semibold text-[#2b79c4] disabled:opacity-40"
                  >
                    + Milestone
                  </button>
                  <button
                    type="button"
                    disabled={!canManage}
                    onClick={() =>
                      void archiveItem(
                        "archive_offer",
                        offer.glide_row_id,
                        offer.name ?? "offer",
                      )
                    }
                    className="rounded-md px-3 py-1.5 text-sm font-semibold text-red-600 disabled:opacity-40"
                  >
                    Archive
                  </button>
                </div>
              </div>
              <div className="divide-y divide-[#e4e9f0]">
                {offerMilestones.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-[#6c7684]">
                    No milestones configured for this offer.
                  </p>
                ) : (
                  offerMilestones.map((milestone, index) => (
                    <div
                      key={milestone.glide_row_id}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#eaf4fe] text-xs font-bold text-[#2b79c4]">
                          {index + 1}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-[#162b3e]">
                            {milestone.name}
                          </p>
                          <p className="mt-1 text-xs text-[#6c7684]">
                            Target:{" "}
                            {milestone.target_days_to_complete ??
                              milestone.target_days_to_complete_from_onboarding_date ??
                              "--"}{" "}
                            days
                            {milestone.is_ttv_milestone || milestone.ttv_milestone
                              ? " · Time to value"
                              : ""}
                            {milestone.is_final_milestone || milestone.final_milestone
                              ? " · Final"
                              : ""}
                            {" · "}
                            {usageCounts.milestones[milestone.glide_row_id] ?? 0} active
                            client
                            {(usageCounts.milestones[milestone.glide_row_id] ?? 0) === 1
                              ? ""
                              : "s"}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          aria-label={`Move ${milestone.name ?? "milestone"} up`}
                          title="Move up"
                          disabled={!canManage || index === 0 || reorderingOfferId === offer.glide_row_id}
                          onClick={() =>
                            void reorderMilestone(
                              offer.glide_row_id,
                              offerMilestones,
                              milestone.glide_row_id,
                              "up",
                            )
                          }
                          className="rounded-md border border-[#cbd2dc] px-2 py-1 text-sm font-semibold text-[#586273] disabled:opacity-40"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${milestone.name ?? "milestone"} down`}
                          title="Move down"
                          disabled={
                            !canManage ||
                            index === offerMilestones.length - 1 ||
                            reorderingOfferId === offer.glide_row_id
                          }
                          onClick={() =>
                            void reorderMilestone(
                              offer.glide_row_id,
                              offerMilestones,
                              milestone.glide_row_id,
                              "down",
                            )
                          }
                          className="rounded-md border border-[#cbd2dc] px-2 py-1 text-sm font-semibold text-[#586273] disabled:opacity-40"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          disabled={!canManage}
                          onClick={() => setEditingMilestone(milestone)}
                          className="text-sm font-semibold text-[#2b79c4] disabled:opacity-40"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={!canManage}
                          onClick={() =>
                            void archiveItem(
                              "archive_milestone",
                              milestone.glide_row_id,
                              milestone.name ?? "milestone",
                            )
                          }
                          className="text-sm font-semibold text-red-600 disabled:opacity-40"
                        >
                          Archive
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {archivedMilestones.length > 0 ? (
                <details className="border-t border-[#e4e9f0] bg-[#f7f9fc] px-5 py-4">
                  <summary className="cursor-pointer text-sm font-semibold text-[#586273]">
                    Archived milestones ({archivedMilestones.length})
                  </summary>
                  <div className="mt-3 divide-y divide-[#e4e9f0] rounded-md border border-[#e4e9f0] bg-white">
                    {archivedMilestones.map((milestone) => (
                      <div
                        key={milestone.glide_row_id}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-semibold text-[#162b3e]">
                            {milestone.name}
                          </p>
                          <p className="mt-1 text-xs text-[#6c7684]">
                            Restoring appends this milestone to the end of the active
                            order.
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={!canManage}
                          onClick={() =>
                            void unarchiveItem(
                              "unarchive_milestone",
                              milestone.glide_row_id,
                              milestone.name ?? "milestone",
                            )
                          }
                          className="rounded-md border border-emerald-200 px-3 py-1.5 text-sm font-semibold text-emerald-700 disabled:opacity-40"
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </section>
          );
        })
      )}

      {archivedOffers.length > 0 ? (
        <details className="rounded-lg border border-[#e4e9f0] bg-white px-5 py-4">
          <summary className="cursor-pointer text-sm font-semibold text-[#586273]">
            Archived offers ({archivedOffers.length})
          </summary>
          <div className="mt-4 space-y-2">
            {archivedOffers.map((offer) => (
              <div
                key={offer.glide_row_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#e4e9f0] bg-[#f7f9fc] px-4 py-3 text-sm text-[#6c7684]"
              >
                <div>
                  <p className="font-semibold text-[#162b3e]">{offer.name}</p>
                  <p className="mt-1 text-xs text-[#6c7684]">
                    Milestones remain archived until restored individually.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!canManage}
                  onClick={() =>
                    void unarchiveItem(
                      "unarchive_offer",
                      offer.glide_row_id,
                      offer.name ?? "offer",
                    )
                  }
                  className="rounded-md border border-emerald-200 px-3 py-1.5 text-sm font-semibold text-emerald-700 disabled:opacity-40"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {editingOffer !== undefined ? (
        <PathwaySetupModal
          companyLegacyId={companyLegacyId}
          offer={editingOffer}
          onClose={() => setEditingOffer(undefined)}
          onSaved={() => {
            setEditingOffer(undefined);
            onReload();
          }}
        />
      ) : null}
      {editingMilestone !== undefined ? (
        <PathwaySetupModal
          companyLegacyId={companyLegacyId}
          milestone={editingMilestone}
          defaultOfferId={newMilestoneOfferId}
          onClose={() => {
            setEditingMilestone(undefined);
            setNewMilestoneOfferId("");
          }}
          onSaved={() => {
            setEditingMilestone(undefined);
            setNewMilestoneOfferId("");
            onReload();
          }}
        />
      ) : null}
    </div>
  );
}

const outcomeTypeLabels: Record<CompanyOutcomeDefinitionRow["outcome_type"], string> = {
  success: "Success",
  progress: "Progress",
  buy_in: "Buy-in",
  suitable: "Suitable",
};

function titleize(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function CustomizationTextInput({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-[#344054]">
      {label}
      <input
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block w-full rounded-md border border-[#d0d5dd] px-3 py-2 text-sm shadow-sm focus:border-[#59abf0] focus:outline-none focus:ring-2 focus:ring-[#59abf0]/20"
      />
    </label>
  );
}

function OutcomeDefinitionModal({
  companyLegacyId,
  item,
  onClose,
  onSaved,
}: {
  companyLegacyId: string;
  item: CompanyOutcomeDefinitionRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [outcomeType, setOutcomeType] =
    useState<CompanyOutcomeDefinitionRow["outcome_type"]>(
      item?.outcome_type ?? "progress",
    );
  const [value, setValue] = useState(item?.value ?? "");
  const [label, setLabel] = useState(item?.label ?? "");
  const [position, setPosition] = useState(String(item?.position ?? 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke(
      "manage-company-customization",
      {
        body: {
          action: "upsert_outcome",
          companyLegacyId,
          entityId: item?.id,
          outcomeType,
          value,
          label,
          position: Number(position) || 0,
          isDefault: item?.is_default ?? false,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[#101828]">
              {item ? "Edit outcome" : "New outcome"}
            </h2>
            <p className="mt-1 text-sm text-[#667085]">
              Values are stored in lowercase for validation and reporting.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-[#98a2b3]">
            Close
          </button>
        </div>
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-medium text-[#344054]">
            Outcome type
            <select
              value={outcomeType}
              onChange={(event) =>
                setOutcomeType(
                  event.target.value as CompanyOutcomeDefinitionRow["outcome_type"],
                )
              }
              className="mt-1 block w-full rounded-md border border-[#d0d5dd] px-3 py-2 text-sm shadow-sm focus:border-[#59abf0] focus:outline-none focus:ring-2 focus:ring-[#59abf0]/20"
            >
              {Object.entries(outcomeTypeLabels).map(([type, display]) => (
                <option key={type} value={type}>
                  {display}
                </option>
              ))}
            </select>
          </label>
          <CustomizationTextInput
            label="Value"
            value={value}
            onChange={setValue}
            required
          />
          <CustomizationTextInput
            label="Label"
            value={label}
            onChange={setLabel}
            required
          />
          <CustomizationTextInput
            label="Position"
            value={position}
            onChange={setPosition}
          />
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[#d0d5dd] px-4 py-2 text-sm font-medium text-[#344054]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-[#59abf0] px-4 py-2 text-sm font-medium text-white hover:bg-[#3b95df] disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ChurnReasonModal({
  companyLegacyId,
  item,
  onClose,
  onSaved,
}: {
  companyLegacyId: string;
  item: CompanyChurnReasonRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(item?.value ?? "");
  const [label, setLabel] = useState(item?.label ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [position, setPosition] = useState(String(item?.position ?? 0));
  const [requiresNotes, setRequiresNotes] = useState(
    item?.requires_notes ?? false,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke(
      "manage-company-customization",
      {
        body: {
          action: "upsert_churn_reason",
          companyLegacyId,
          entityId: item?.id,
          value,
          label,
          category,
          requiresNotes,
          countsAsChurn: item?.counts_as_churn ?? true,
          position: Number(position) || 0,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[#101828]">
              {item ? "Edit churn reason" : "New churn reason"}
            </h2>
            <p className="mt-1 text-sm text-[#667085]">
              Selected values continue to save into client churn reason fields.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-[#98a2b3]">
            Close
          </button>
        </div>
        <div className="mt-5 space-y-4">
          <CustomizationTextInput
            label="Value"
            value={value}
            onChange={setValue}
            required
          />
          <CustomizationTextInput
            label="Label"
            value={label}
            onChange={setLabel}
            required
          />
          <CustomizationTextInput
            label="Category"
            value={category}
            onChange={setCategory}
          />
          <CustomizationTextInput
            label="Position"
            value={position}
            onChange={setPosition}
          />
          <label className="flex items-center gap-2 text-sm font-medium text-[#344054]">
            <input
              type="checkbox"
              checked={requiresNotes}
              onChange={(event) => setRequiresNotes(event.target.checked)}
              className="h-4 w-4 rounded border-[#d0d5dd] text-[#59abf0]"
            />
            Requires notes
          </label>
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[#d0d5dd] px-4 py-2 text-sm font-medium text-[#344054]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-[#59abf0] px-4 py-2 text-sm font-medium text-white hover:bg-[#3b95df] disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function CustomizationRow({
  primary,
  secondary,
  badge,
  status,
  canManage,
  onEdit,
  onArchive,
}: {
  primary: string;
  secondary: string;
  badge?: string | null;
  status?: string | null;
  canManage: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-[#e4e9f0] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-[#101828]">{primary}</p>
        <p className="mt-1 text-xs text-[#667085]">{secondary}</p>
      </div>
      <div className="flex items-center gap-3">
        {badge ? (
          <span className="rounded-full border border-[#d8e2ef] bg-[#f7f9fc] px-2.5 py-1 text-xs font-medium text-[#586273]">
            {badge}
          </span>
        ) : null}
        <span className="rounded-full border border-[#e4e9f0] bg-[#f7f9fc] px-2.5 py-1 text-xs font-medium text-[#667085]">
          {status ?? "active"}
        </span>
        {canManage ? (
          <div className="flex gap-2 text-xs font-medium">
            <button type="button" onClick={onEdit} className="text-indigo-600">
              Edit
            </button>
            <button type="button" onClick={onArchive} className="text-red-600">
              Archive
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function customizationOriginLabel(item: {
  metadata?: Record<string, unknown> | null;
  is_default?: boolean | null;
}) {
  const seededFrom =
    typeof item.metadata?.seeded_from === "string" ? item.metadata.seeded_from : "";
  const createdFrom =
    typeof item.metadata?.created_from === "string"
      ? item.metadata.created_from
      : "";
  if (seededFrom === "safe_defaults" || item.is_default) return "Default";
  if (seededFrom) return "Imported";
  if (createdFrom) return "Custom";
  return null;
}

function customizationSort<
  T extends {
    label?: string | null;
    position?: number | null;
    status?: string | null;
  },
>(a: T, b: T) {
  const statusA = a.status === "archived" ? 1 : 0;
  const statusB = b.status === "archived" ? 1 : 0;
  if (statusA !== statusB) return statusA - statusB;
  const positionA = typeof a.position === "number" ? a.position : 9999;
  const positionB = typeof b.position === "number" ? b.position : 9999;
  if (positionA !== positionB) return positionA - positionB;
  return String(a.label ?? "").localeCompare(String(b.label ?? ""));
}

function CustomizationSetup({
  companyLegacyId,
  source,
  outcomes,
  churnReasons,
  canManage,
  onReload,
}: {
  companyLegacyId: string;
  source: CustomizationSource;
  outcomes: CompanyOutcomeDefinitionRow[];
  churnReasons: CompanyChurnReasonRow[];
  canManage: boolean;
  onReload: () => void;
}) {
  const [editingOutcome, setEditingOutcome] =
    useState<CompanyOutcomeDefinitionRow | null>();
  const [editingChurnReason, setEditingChurnReason] =
    useState<CompanyChurnReasonRow | null>();
  const [actionError, setActionError] = useState<string | null>(null);
  const sortedOutcomes = [...outcomes].sort(customizationSort);
  const activeOutcomes = sortedOutcomes.filter(
    (item) => item.status !== "archived",
  );
  const archivedOutcomes = sortedOutcomes.filter(
    (item) => item.status === "archived",
  );
  const sortedChurnReasons = [...churnReasons].sort(customizationSort);
  const activeChurnReasons = sortedChurnReasons.filter(
    (item) => item.status !== "archived",
  );
  const archivedChurnReasons = sortedChurnReasons.filter(
    (item) => item.status === "archived",
  );
  const outcomesByType = activeOutcomes.reduce(
    (grouped, item) => {
      grouped[item.outcome_type] = grouped[item.outcome_type] ?? [];
      grouped[item.outcome_type].push(item);
      return grouped;
    },
    {} as Record<CompanyOutcomeDefinitionRow["outcome_type"], CompanyOutcomeDefinitionRow[]>,
  );
  const visibleOutcomeTypes = (
    Object.keys(outcomeTypeLabels) as CompanyOutcomeDefinitionRow["outcome_type"][]
  ).filter((type) => type !== "suitable" || (outcomesByType.suitable?.length ?? 0) > 0);

  async function archiveItem(
    action: "archive_outcome" | "archive_churn_reason",
    entityId?: string,
  ) {
    if (!entityId) return;
    const confirmed = window.confirm("Archive this customization item?");
    if (!confirmed) return;
    setActionError(null);
    const { data, error: invokeError } = await supabase.functions.invoke(
      "manage-company-customization",
      { body: { action, companyLegacyId, entityId } },
    );
    if (invokeError) {
      setActionError(invokeError.message);
      return;
    }
    if (data?.error) {
      setActionError(data.error);
      return;
    }
    onReload();
  }

  if (source === "mirror") {
    return (
      <div className="mt-6 space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-5 py-4">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
            CST preview
          </span>
          <h2 className="mt-4 text-lg font-semibold text-[#101828]">
            Customization is read-only for this company
          </h2>
          <p className="mt-1 text-sm text-[#667085]">
            Outcome choices are still loaded from CST until this
            company is moved to pilot or migrated status.
          </p>
        </div>
        {outcomes.length > 0 ? (
          <section className="rounded-lg border border-[#e4e9f0] bg-[#f7f9fc] p-4">
            <h3 className="text-sm font-semibold text-[#101828]">
              Mirrored outcome choices
            </h3>
            <div className="mt-3 grid gap-4 lg:grid-cols-3">
              {visibleOutcomeTypes.map((type) => {
                const rows = outcomesByType[type] ?? [];
                if (rows.length === 0) return null;
                return (
                  <div
                    key={type}
                    className="rounded-lg border border-[#e4e9f0] bg-white p-4"
                  >
                    <h4 className="text-sm font-semibold text-[#101828]">
                      {outcomeTypeLabels[type]}
                    </h4>
                    <div className="mt-3 space-y-2">
                      {rows.map((item) => (
                        <div
                          key={`${item.outcome_type}-${item.value}`}
                          className="rounded-md border border-[#eef2f6] bg-[#f8fafc] px-3 py-2 text-sm"
                        >
                          <span className="font-medium text-[#101828]">
                            {item.label}
                          </span>
                          <span className="ml-2 text-xs text-[#667085]">
                            {item.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            RetainOS customization
          </span>
          <h2 className="mt-3 text-lg font-semibold text-[#101828]">
            Company Customization
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditingOutcome(null)}
            className="rounded-md bg-[#59abf0] px-4 py-2 text-sm font-medium text-white hover:bg-[#3b95df]"
          >
            + Outcome
          </button>
          <button
            type="button"
            onClick={() => setEditingChurnReason(null)}
            className="rounded-md border border-[#d0d5dd] bg-white px-4 py-2 text-sm font-medium text-[#344054] hover:bg-[#f7f9fc]"
          >
            + Churn Reason
          </button>
        </div>
      </div>

      {actionError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      ) : null}

      <section className="rounded-lg border border-[#e4e9f0] bg-[#f7f9fc]">
        <div className="border-b border-[#e4e9f0] px-5 py-4">
          <h3 className="text-sm font-semibold text-[#101828]">
            Outcome definitions
          </h3>
          <p className="mt-1 text-xs text-[#667085]">
            Each outcome type has its own active definition list.
          </p>
        </div>
        <div className="grid gap-4 p-4 xl:grid-cols-2">
          {visibleOutcomeTypes.map((type) => {
            const rows = outcomesByType[type] ?? [];
            return (
              <div
                key={type}
                className="rounded-lg border border-[#d8e2ef] bg-white p-4 shadow-sm"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="text-base font-semibold text-[#101828]">
                    {outcomeTypeLabels[type]}
                  </h4>
                  <span className="rounded-full border border-[#e4e9f0] bg-[#f7f9fc] px-2.5 py-1 text-xs font-medium text-[#667085]">
                    {rows.length} active
                  </span>
                </div>
                <div className="space-y-2">
                  {rows.length === 0 ? (
                    <div className="rounded-md border border-dashed border-[#d0d5dd] bg-white px-4 py-3 text-sm text-[#667085]">
                      No active definitions.
                    </div>
                  ) : (
                    rows.map((item) => (
                      <CustomizationRow
                        key={item.id ?? `${item.outcome_type}-${item.value}`}
                        primary={item.label}
                        secondary={`${item.value} · position ${item.position ?? 0}`}
                        badge={customizationOriginLabel(item)}
                        status={item.status}
                        canManage={canManage}
                        onEdit={() => setEditingOutcome(item)}
                        onArchive={() => archiveItem("archive_outcome", item.id)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="px-4 pb-4">
          {archivedOutcomes.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-[#586273]">
                Archived outcomes ({archivedOutcomes.length})
              </summary>
              <div className="mt-3 space-y-2">
                {archivedOutcomes.map((item) => (
                  <CustomizationRow
                    key={item.id ?? `${item.outcome_type}-${item.value}`}
                    primary={item.label}
                    secondary={`${outcomeTypeLabels[item.outcome_type]} · ${item.value}`}
                    badge={customizationOriginLabel(item)}
                    status="archived"
                    canManage={false}
                    onEdit={() => undefined}
                    onArchive={() => undefined}
                  />
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </section>

      <section className="rounded-lg border border-[#e4e9f0] bg-[#f7f9fc]">
        <div className="border-b border-[#e4e9f0] px-5 py-4">
          <h3 className="text-sm font-semibold text-[#101828]">
            Churn reasons
          </h3>
          <p className="mt-1 text-xs text-[#667085]">
            Active reasons are sorted by position, then label. Imported Glide
            values are tagged separately from safe defaults and custom additions.
          </p>
        </div>
        <div className="space-y-2 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">
              Active reasons
            </p>
            <span className="rounded-full border border-[#e4e9f0] bg-white px-2.5 py-1 text-xs font-medium text-[#667085]">
              {activeChurnReasons.length} active
            </span>
          </div>
          {activeChurnReasons.length === 0 ? (
            <div className="rounded-md border border-dashed border-[#d0d5dd] bg-white px-4 py-3 text-sm text-[#667085]">
              No active churn reasons.
            </div>
          ) : (
            activeChurnReasons.map((item) => (
              <CustomizationRow
                key={item.id ?? item.value}
                primary={item.label}
                secondary={`${item.value} · ${
                  item.requires_notes ? "notes required" : "notes optional"
                }`}
                badge={customizationOriginLabel(item)}
                status={item.status}
                canManage={canManage}
                onEdit={() => setEditingChurnReason(item)}
                onArchive={() => archiveItem("archive_churn_reason", item.id)}
              />
            ))
          )}
          {archivedChurnReasons.length > 0 ? (
            <details className="pt-2">
              <summary className="cursor-pointer text-sm font-semibold text-[#586273]">
                Archived churn reasons ({archivedChurnReasons.length})
              </summary>
              <div className="mt-3 space-y-2">
                {archivedChurnReasons.map((item) => (
                  <CustomizationRow
                    key={item.id ?? item.value}
                    primary={item.label}
                    secondary={item.value}
                    badge={customizationOriginLabel(item)}
                    status="archived"
                    canManage={false}
                    onEdit={() => undefined}
                    onArchive={() => undefined}
                  />
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </section>

      {editingOutcome !== undefined ? (
        <OutcomeDefinitionModal
          companyLegacyId={companyLegacyId}
          item={editingOutcome}
          onClose={() => setEditingOutcome(undefined)}
          onSaved={() => {
            setEditingOutcome(undefined);
            onReload();
          }}
        />
      ) : null}
      {editingChurnReason !== undefined ? (
        <ChurnReasonModal
          companyLegacyId={companyLegacyId}
          item={editingChurnReason}
          onClose={() => setEditingChurnReason(undefined)}
          onSaved={() => {
            setEditingChurnReason(undefined);
            onReload();
          }}
        />
      ) : null}
    </div>
  );
}

function defaultCompanySettings(company: CompanyRow | null): CompanySettingsRow {
  const defaultView =
    company?.view_override === "card" || company?.view_override === "calendar"
      ? company.view_override
      : "list";
  return {
    profile_upkeep_freshness_days: 14,
    default_client_view: defaultView,
    default_calendar_mode: "month",
    enable_secondary_assignee: company?.enable_secondary_assignee === true,
    enable_call_ai_for_csms: company?.enable_call_ai_for_csms === true,
    enable_embeds: false,
    enable_zapier_client_create: false,
  };
}

function SettingsSelect<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <label className="block text-sm font-medium text-[#344054]">
      {label}
      <select
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm shadow-sm disabled:bg-[#f7f9fc] disabled:text-[#667085]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SettingsFlag({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-md border border-[#e4e9f0] bg-white px-4 py-3">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 rounded border-[#d0d5dd] text-[#59abf0] disabled:opacity-50"
      />
      <span>
        <span className="block text-sm font-semibold text-[#101828]">{label}</span>
        <span className="mt-1 block text-xs text-[#667085]">{description}</span>
      </span>
    </label>
  );
}

function CompanySettingsSetup({
  companyLegacyId,
  source,
  settings,
  canManage,
  onReload,
}: {
  companyLegacyId: string;
  source: SettingsSource;
  settings: CompanySettingsRow;
  canManage: boolean;
  onReload: () => void;
}) {
  const [draft, setDraft] = useState<CompanySettingsRow>(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(settings);
    setError(null);
    setSaved(false);
  }, [settings]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const { data, error: invokeError } = await supabase.functions.invoke(
      "manage-company-customization",
      {
        body: {
          action: "update_settings",
          companyLegacyId,
          profileUpkeepFreshnessDays: draft.profile_upkeep_freshness_days,
          defaultClientView: draft.default_client_view,
          defaultCalendarMode: draft.default_calendar_mode,
          enableSecondaryAssignee: draft.enable_secondary_assignee,
          enableCallAiForCsms: draft.enable_call_ai_for_csms,
          enableEmbeds: draft.enable_embeds,
          enableZapierClientCreate: draft.enable_zapier_client_create,
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
    setSaved(true);
    onReload();
  }

  const disabled = !canManage || saving;

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              source === "app_owned"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-slate-50 text-slate-600"
            }`}
          >
            {source === "app_owned" ? "RetainOS settings" : "CST preview"}
          </span>
          <h2 className="mt-3 text-lg font-semibold text-[#101828]">
            Company Settings
          </h2>
        </div>
        <button
          type="submit"
          disabled={disabled}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save settings"}
        </button>
      </div>

      {source === "mirror" ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Settings are read-only until this company is moved to RetainOS pilot or
          migrated status.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {saved ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Company settings saved.
        </div>
      ) : null}

      <section className="rounded-lg border border-[#e4e9f0] bg-[#f7f9fc]">
        <div className="border-b border-[#e4e9f0] px-5 py-4">
          <h3 className="text-sm font-semibold text-[#101828]">
            Client workspace defaults
          </h3>
        </div>
        <div className="grid gap-4 p-4 md:grid-cols-3">
          <label className="block text-sm font-medium text-[#344054]">
            Profile upkeep freshness days
            <input
              type="number"
              min="1"
              max="365"
              disabled={disabled}
              value={draft.profile_upkeep_freshness_days}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  profile_upkeep_freshness_days: Number(event.target.value) || 14,
                }))
              }
              className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm shadow-sm disabled:bg-[#f7f9fc] disabled:text-[#667085]"
            />
          </label>
          <SettingsSelect
            label="Default client view"
            value={draft.default_client_view}
            disabled={disabled}
            options={[
              { value: "list", label: "List" },
              { value: "card", label: "Card" },
              { value: "calendar", label: "Calendar" },
            ]}
            onChange={(value) =>
              setDraft((current) => ({ ...current, default_client_view: value }))
            }
          />
          <SettingsSelect
            label="Default calendar mode"
            value={draft.default_calendar_mode}
            disabled={disabled}
            options={[
              { value: "month", label: "Month" },
              { value: "week", label: "Week" },
              { value: "day", label: "Day" },
            ]}
            onChange={(value) =>
              setDraft((current) => ({ ...current, default_calendar_mode: value }))
            }
          />
        </div>
      </section>

      <section className="rounded-lg border border-[#e4e9f0] bg-[#f7f9fc]">
        <div className="border-b border-[#e4e9f0] px-5 py-4">
          <h3 className="text-sm font-semibold text-[#101828]">Simple flags</h3>
        </div>
        <div className="grid gap-3 p-4 lg:grid-cols-2">
          <SettingsFlag
            label="Secondary assignee"
            description="Allow clients to carry a secondary CSM assignment."
            checked={draft.enable_secondary_assignee}
            disabled={disabled}
            onChange={(checked) =>
              setDraft((current) => ({
                ...current,
                enable_secondary_assignee: checked,
              }))
            }
          />
          <SettingsFlag
            label="Call AI for CSMs"
            description="Show the company-level Call AI capability flag."
            checked={draft.enable_call_ai_for_csms}
            disabled={disabled}
            onChange={(checked) =>
              setDraft((current) => ({
                ...current,
                enable_call_ai_for_csms: checked,
              }))
            }
          />
          <SettingsFlag
            label="Embeds"
            description="Reserve embedded surfaces for this company."
            checked={draft.enable_embeds}
            disabled={disabled}
            onChange={(checked) =>
              setDraft((current) => ({ ...current, enable_embeds: checked }))
            }
          />
          <SettingsFlag
            label="Zapier client create"
            description="Allow the existing Zapier client creation pathway when configured."
            checked={draft.enable_zapier_client_create}
            disabled={disabled}
            onChange={(checked) =>
              setDraft((current) => ({
                ...current,
                enable_zapier_client_create: checked,
              }))
            }
          />
        </div>
      </section>

      <section className="rounded-lg border border-dashed border-[#d0d5dd] bg-white px-5 py-4">
        <h3 className="text-sm font-semibold text-[#101828]">Still coming soon</h3>
        <p className="mt-1 text-sm text-[#667085]">
          Custom fields, notification rules, dashboard preferences, and client-list
          column presets are intentionally left out of this settings slice.
        </p>
      </section>
    </form>
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
  const [pathwaySource, setPathwaySource] = useState<PathwaySource>("mirror");
  const [offers, setOffers] = useState<CompanyOfferRow[]>([]);
  const [offerMilestones, setOfferMilestones] = useState<
    CompanyOfferMilestoneRow[]
  >([]);
  const [pathwayUsageCounts, setPathwayUsageCounts] = useState<PathwayUsageCounts>({
    offers: {},
    milestones: {},
  });
  const [pathwaysLoading, setPathwaysLoading] = useState(false);
  const [pathwaysReloadKey, setPathwaysReloadKey] = useState(0);
  const [customizationSource, setCustomizationSource] =
    useState<CustomizationSource>("mirror");
  const [outcomeDefinitions, setOutcomeDefinitions] = useState<
    CompanyOutcomeDefinitionRow[]
  >([]);
  const [churnReasons, setChurnReasons] = useState<CompanyChurnReasonRow[]>([]);
  const [customizationLoading, setCustomizationLoading] = useState(false);
  const [customizationReloadKey, setCustomizationReloadKey] = useState(0);
  const [settingsSource, setSettingsSource] = useState<SettingsSource>("mirror");
  const [companySettings, setCompanySettings] = useState<CompanySettingsRow>(
    defaultCompanySettings(null),
  );
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsReloadKey, setSettingsReloadKey] = useState(0);

  useEffect(() => {
    if (!companyId) return;
    const legacyCompanyId = companyId;
    let cancelled = false;

    async function loadCompany() {
      setLoading(true);
      setError(null);
      setTeamActionError(null);

      const [{ data: appCompany }, unifiedCompanyResult] = await Promise.all([
        supabase
          .from("companies")
          .select("id, legacy_glide_row_id, migration_status")
          .eq("legacy_glide_row_id", legacyCompanyId)
          .in("migration_status", ["pilot", "migrated"])
          .maybeSingle(),
        loadUnifiedCompanyByLegacyId(legacyCompanyId)
          .then((data) => ({ data, error: null as Error | null }))
          .catch((error) => ({
            data: null,
            error: error instanceof Error ? error : new Error("Company load failed"),
          })),
      ]);

      if (cancelled) return;

      if (unifiedCompanyResult.error) {
        setError(unifiedCompanyResult.error.message);
        setCompany(null);
      } else {
        setCompany(unifiedCompanyResult.data as CompanyRow | null);
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

  useEffect(() => {
    if (!companyId || activeTab !== "pathways") return;
    const legacyCompanyId = companyId;
    let cancelled = false;

    async function loadPathways() {
      setPathwaysLoading(true);
      const { data: appCompany } = await supabase
        .from("companies")
        .select("id, migration_status")
        .eq("legacy_glide_row_id", legacyCompanyId)
        .in("migration_status", ["pilot", "migrated"])
        .maybeSingle();

      if (appCompany) {
        const [offersResult, milestonesResult, usageResult] = await Promise.all([
          supabase
            .from("company_offers")
            .select("glide_row_id, name, status")
            .eq("company_id", appCompany.id)
            .order("name", { ascending: true }),
          supabase
            .from("company_offer_milestones")
            .select(
              "glide_row_id, offer_id, name, position, target_days_to_complete, is_ttv_milestone, is_final_milestone, status",
            )
            .eq("company_id", appCompany.id)
            .order("position", { ascending: true }),
          supabase
            .from("clients")
            .select(
              "offer_milestones_current_offer_id, offer_milestones_current_milestone_id",
            )
            .eq("company_id", appCompany.id)
            .is("archived_at", null),
        ]);
        if (cancelled) return;
        if (!offersResult.error && !milestonesResult.error) {
          const usageRows =
            !usageResult.error && usageResult.data
              ? (usageResult.data as {
                  offer_milestones_current_offer_id?: string | null;
                  offer_milestones_current_milestone_id?: string | null;
                }[])
              : [];
          const nextUsageCounts: PathwayUsageCounts = { offers: {}, milestones: {} };
          for (const row of usageRows) {
            const offerId = row.offer_milestones_current_offer_id;
            const milestoneId = row.offer_milestones_current_milestone_id;
            if (offerId) {
              nextUsageCounts.offers[offerId] =
                (nextUsageCounts.offers[offerId] ?? 0) + 1;
            }
            if (milestoneId) {
              nextUsageCounts.milestones[milestoneId] =
                (nextUsageCounts.milestones[milestoneId] ?? 0) + 1;
            }
          }
          setOffers((offersResult.data ?? []) as CompanyOfferRow[]);
          setOfferMilestones(
            (milestonesResult.data ?? []) as CompanyOfferMilestoneRow[],
          );
          setPathwayUsageCounts(nextUsageCounts);
          setPathwaySource("app_owned");
          setPathwaysLoading(false);
          return;
        }
        console.error(
          "Failed to load app-owned pathway setup:",
          offersResult.error ?? milestonesResult.error,
        );
      }

      const [offersResult, milestonesResult] = await Promise.all([
        supabase
          .from("backup_company_offers")
          .select("glide_row_id, company_id, name")
          .eq("company_id", legacyCompanyId)
          .order("name", { ascending: true }),
        supabase
          .from("backup_company_offer_milestones")
          .select(
            "glide_row_id, offer_id, name, order, target_days_to_complete_from_onboarding_date, ttv_milestone, final_milestone",
          )
          .order("order", { ascending: true, nullsFirst: false }),
      ]);
      if (cancelled) return;
      const mirrorOffers = (offersResult.data ?? []) as CompanyOfferRow[];
      const offerIds = new Set(mirrorOffers.map((offer) => offer.glide_row_id));
      setOffers(mirrorOffers);
      setOfferMilestones(
        ((milestonesResult.data ?? []) as CompanyOfferMilestoneRow[]).filter(
          (milestone) => milestone.offer_id && offerIds.has(milestone.offer_id),
        ),
      );
      setPathwayUsageCounts({ offers: {}, milestones: {} });
      setPathwaySource("mirror");
      setPathwaysLoading(false);
    }

    void loadPathways();
    return () => {
      cancelled = true;
    };
  }, [activeTab, companyId, pathwaysReloadKey]);

  useEffect(() => {
    if (!companyId || activeTab !== "customization") return;
    const legacyCompanyId = companyId;
    let cancelled = false;

    async function loadCustomization() {
      setCustomizationLoading(true);
      const { data: appCompany } = await supabase
        .from("companies")
        .select("id, migration_status")
        .eq("legacy_glide_row_id", legacyCompanyId)
        .in("migration_status", ["pilot", "migrated"])
        .maybeSingle();

      if (appCompany?.id) {
        const [outcomesResult, churnResult] = await Promise.all([
          supabase
            .from("company_outcome_definitions")
            .select(
              "id, outcome_type, value, label, color, emoji, positive_rank, position, is_default, status, metadata",
            )
            .eq("company_id", appCompany.id)
            .order("outcome_type", { ascending: true })
            .order("position", { ascending: true }),
          supabase
            .from("company_churn_reasons")
            .select(
              "id, value, label, category, requires_notes, counts_as_churn, position, status, metadata",
            )
            .eq("company_id", appCompany.id)
            .order("position", { ascending: true }),
        ]);
        if (cancelled) return;
        if (!outcomesResult.error && !churnResult.error) {
          setOutcomeDefinitions(
            (outcomesResult.data ?? []) as CompanyOutcomeDefinitionRow[],
          );
          setChurnReasons((churnResult.data ?? []) as CompanyChurnReasonRow[]);
          setCustomizationSource("app_owned");
          setCustomizationLoading(false);
          return;
        }
        console.error(
          "Failed to load app-owned company customization:",
          outcomesResult.error ?? churnResult.error,
        );
        setOutcomeDefinitions([]);
        setChurnReasons([]);
        setCustomizationSource("app_owned");
        setCustomizationLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("backup_choices")
        .select(
          "success_value, success_display, progress_value, progress_display, buy_in_value, buy_in_display, index",
        )
        .order("index", { ascending: true });
      if (cancelled) return;
      if (error) console.error("Failed to load mirrored customization:", error);

      const seen = new Set<string>();
      const mirroredOutcomes: CompanyOutcomeDefinitionRow[] = [];
      for (const row of (data ?? []) as Record<string, unknown>[]) {
        (
          [
            ["success", row.success_value, row.success_display],
            ["progress", row.progress_value, row.progress_display],
            ["buy_in", row.buy_in_value, row.buy_in_display],
          ] as const
        ).forEach(([outcomeType, rawValue, rawLabel]) => {
          const value =
            typeof rawValue === "string" ? rawValue.trim().toLowerCase() : "";
          if (!value || value === "offtrack") return;
          const key = `${outcomeType}:${value}`;
          if (seen.has(key)) return;
          seen.add(key);
          const label =
            typeof rawLabel === "string" && rawLabel.trim()
              ? rawLabel.trim()
              : titleize(value);
          mirroredOutcomes.push({
            outcome_type: outcomeType,
            value,
            label,
            position: typeof row.index === "number" ? row.index : 0,
            status: "active",
          });
        });
      }
      setOutcomeDefinitions(mirroredOutcomes);
      setChurnReasons([]);
      setCustomizationSource("mirror");
      setCustomizationLoading(false);
    }

    void loadCustomization();
    return () => {
      cancelled = true;
    };
  }, [activeTab, companyId, customizationReloadKey]);

  useEffect(() => {
    if (!companyId || activeTab !== "settings") return;
    const legacyCompanyId = companyId;
    let cancelled = false;

    async function loadSettings() {
      setSettingsLoading(true);
      const { data: appCompany } = await supabase
        .from("companies")
        .select("id, migration_status")
        .eq("legacy_glide_row_id", legacyCompanyId)
        .in("migration_status", ["pilot", "migrated"])
        .maybeSingle();

      if (appCompany?.id) {
        const { data, error: settingsError } = await supabase
          .from("company_settings")
          .select(
            "id, profile_upkeep_freshness_days, default_client_view, default_calendar_mode, enable_secondary_assignee, enable_call_ai_for_csms, enable_embeds, enable_zapier_client_create, metadata, updated_at",
          )
          .eq("company_id", appCompany.id)
          .maybeSingle();
        if (cancelled) return;
        if (!settingsError && data) {
          setCompanySettings(data as CompanySettingsRow);
          setSettingsSource("app_owned");
          setSettingsLoading(false);
          return;
        }
        if (settingsError) {
          console.error("Failed to load app-owned company settings:", settingsError);
        }
        setCompanySettings(defaultCompanySettings(company));
        setSettingsSource("app_owned");
        setSettingsLoading(false);
        return;
      }

      setCompanySettings(defaultCompanySettings(company));
      setSettingsSource("mirror");
      setSettingsLoading(false);
    }

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [activeTab, company, companyId, settingsReloadKey]);

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
                  CST preview data
                </span>
              )}
              {canManagePilotTeam ? (
                <button
                  type="button"
                  onClick={() => handleOpenTeamModal()}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  + New Team Member
                </button>
              ) : null}
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
      ) : activeTab === "customization" ? (
        customizationLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#59abf0]" />
          </div>
        ) : (
          <CustomizationSetup
            companyLegacyId={companyId ?? ""}
            source={customizationSource}
            outcomes={outcomeDefinitions}
            churnReasons={churnReasons}
            canManage={customizationSource === "app_owned"}
            onReload={() => setCustomizationReloadKey((key) => key + 1)}
          />
        )
      ) : activeTab === "pathways" ? (
        pathwaysLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#59abf0]" />
          </div>
        ) : (
          <PathwaysSetup
            companyLegacyId={companyId ?? ""}
            source={pathwaySource}
            offers={offers}
            milestones={offerMilestones}
            usageCounts={pathwayUsageCounts}
            canManage={pathwaySource === "app_owned"}
            onReload={() => setPathwaysReloadKey((key) => key + 1)}
            onMilestonesReordered={(offerId, reorderedMilestones) => {
              const reorderedById = new Map(
                reorderedMilestones.map((milestone) => [
                  milestone.glide_row_id,
                  milestone,
                ]),
              );
              setOfferMilestones((current) =>
                current.map((milestone) => {
                  if (milestone.offer_id !== offerId) return milestone;
                  const reordered = reorderedById.get(milestone.glide_row_id);
                  return reordered ? { ...milestone, ...reordered } : milestone;
                }),
              );
            }}
          />
        )
      ) : (
        settingsLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#59abf0]" />
          </div>
        ) : (
          <CompanySettingsSetup
            companyLegacyId={companyId ?? ""}
            source={settingsSource}
            settings={companySettings}
            canManage={settingsSource === "app_owned"}
            onReload={() => setSettingsReloadKey((key) => key + 1)}
          />
        )
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
