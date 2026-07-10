import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAccountContext } from "../lib/accountContext.tsx";
import { loadUnifiedCompanyByLegacyId } from "../lib/appOwnedData.ts";
import {
  CLIENT_LIST_COLUMN_OPTIONS,
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_PROGRAM_STATUS_LABELS,
  PROGRAM_STATUS_LABEL_OPTIONS,
  normalizeClientListColumns,
  normalizeProgramStatusLabels,
  mergeNotificationPreferences,
  type ClientListColumnKey,
  type NotificationPreference,
  type NotificationPreferenceType,
  type ProgramStatusLabelMap,
} from "../lib/companySettings.ts";
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
  enable_secondary_offers: boolean | null;
  enable_archetypes: boolean | null;
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

interface CompanyCustomFieldRow {
  id?: string;
  key: string;
  label: string;
  description?: string | null;
  entity_type?: "client" | "company_member" | "contract" | null;
  field_type:
    | "text"
    | "textarea"
    | "number"
    | "date"
    | "boolean"
    | "single_select"
    | "multi_select"
    | "url"
    | "email";
  options?: { value: string; label: string }[] | null;
  is_required?: boolean | null;
  is_visible_on_client_detail?: boolean | null;
  is_visible_on_client_list?: boolean | null;
  is_editable_by_csm?: boolean | null;
  position?: number | null;
  source_table?: string | null;
  source_key?: string | null;
  status?: "active" | "archived" | null;
  metadata?: Record<string, unknown> | null;
}

interface CompanyTaskTemplateRow {
  id?: string;
  name: string;
  description?: string | null;
  trigger_type: "manual" | "client_created" | "milestone_completed";
  applies_to_offer_id?: string | null;
  applies_to_milestone_id?: string | null;
  assign_to_type: "assigned_csm" | "director" | "support" | "specific_member" | "unassigned";
  assigned_member_legacy_id?: string | null;
  due_offset_days: number;
  recurring_is_recurring?: boolean | null;
  recurring_interval_days?: number | null;
  priority?: string | null;
  status_value: "todo" | "in-progress" | "waiting" | "done" | "dismissed" | "archived";
  is_enabled: boolean;
  position?: number | null;
  metadata?: Record<string, unknown> | null;
  archived_at?: string | null;
}

interface CompanyContractTemplateRow {
  id?: string;
  name: string;
  description?: string | null;
  applies_to_offer_id: string;
  contract_days: number;
  monthly_value?: number | null;
  reference_link?: string | null;
  notes?: string | null;
  auto_renew?: boolean | null;
  is_enabled: boolean;
  position?: number | null;
  metadata?: Record<string, unknown> | null;
  archived_at?: string | null;
}

interface CompanySettingsRow {
  id?: string;
  profile_upkeep_freshness_days: number;
  default_client_view: "list" | "card" | "calendar";
  default_calendar_mode: "month" | "week" | "day";
  enable_secondary_assignee: boolean;
  enable_secondary_offers: boolean;
  enable_archetypes: boolean;
  enable_call_ai_for_csms: boolean;
  enable_embeds: boolean;
  enable_zapier_client_create: boolean;
  allow_status_change_retention: boolean;
  client_list_columns?: ClientListColumnKey[];
  program_status_labels?: ProgramStatusLabelMap;
  metadata?: Record<string, unknown> | null;
  updated_at?: string | null;
}

const DEFAULT_CONTACT_TOUCH_NEXT_CONTACT_DAYS = 4;

type SettingsNotificationPreference = NotificationPreference;

interface IntegrationIntakeEventRow {
  id: string;
  integration_type: string;
  provider: string | null;
  external_event_id: string | null;
  status: "received" | "processed" | "needs_review" | "failed" | "ignored";
  match_status: "unmatched" | "matched" | "ambiguous";
  error_message: string | null;
  payload: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface IntegrationReviewClientOption {
  id: string;
  glide_row_id: string | null;
  client_name: string | null;
  client_business: string | null;
  client_email: string | null;
  program_status_value: string | null;
}

interface IntegrationTokenRow {
  id: string;
  integration_type: string;
  label: string | null;
  token_prefix: string | null;
  status: "active" | "revoked";
  expires_at: string | null;
  last_used_at: string | null;
  last_used_from: string | null;
  created_at: string;
  updated_at: string | null;
  revoked_at: string | null;
}

interface PathwayUsageCounts {
  offers: Record<string, number>;
  milestones: Record<string, number>;
}

interface ArchiveAffectedClient {
  glide_row_id?: string | null;
  client_name?: string | null;
  client_business?: string | null;
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

function formatDateTime(value: string | null | undefined) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function integrationValue(
  event: IntegrationIntakeEventRow,
  keys: string[],
): string | null {
  for (const source of [event.metadata, event.payload]) {
    for (const key of keys) {
      const value = source?.[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}

function normalizeIntegrationClientStatus(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

const ACTIVE_CLIENT_STATUSES = new Set(["front-end", "back-end"]);

function isActiveClientStatus(value: string | null | undefined) {
  return ACTIVE_CLIENT_STATUSES.has(normalizeIntegrationClientStatus(value));
}

function isMatchableIntegrationClient(client: IntegrationReviewClientOption) {
  const status = normalizeIntegrationClientStatus(client.program_status_value);
  return status !== "off-boarded" && status !== "offboarded";
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

function inviteErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Invite email could not be sent.";
}

function retainOsAppUrl() {
  const configuredUrl =
    (import.meta.env.VITE_RETAINOS_APP_URL as string | undefined) ??
    (import.meta.env.VITE_APP_URL as string | undefined);
  if (configuredUrl?.trim()) return configuredUrl.trim().replace(/\/$/, "");

  const isLocalHost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  return isLocalHost ? "https://app.retainos.ai" : window.location.origin;
}

function retainOsLoginUrl() {
  return `${retainOsAppUrl()}/login`;
}

async function sendRetainOsLoginEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new Error("This team member does not have a valid email.");
  }
  const loginUrl = retainOsLoginUrl();

  const { data: prepareData, error: prepareError } = await supabase.functions.invoke(
    "prepare-login",
    {
      body: { email: normalizedEmail },
    },
  );

  if (prepareError) {
    throw new Error(prepareError.message);
  }

  if (prepareData?.ok === false) {
    throw new Error(
      prepareData.error ?? "This email is not configured for RetainOS access.",
    );
  }

  const { error: otpError } = await supabase.auth.signInWithOtp({
    email: normalizedEmail,
    options: { shouldCreateUser: false, emailRedirectTo: loginUrl },
  });

  if (otpError) {
    throw new Error(otpError.message);
  }

  return { email: normalizedEmail, loginUrl };
}

const integrationTokenTypeOptions = [
  {
    value: "call_summary_next_steps",
    label: "Call summary / next steps",
  },
  { value: "client_update", label: "Client update webhook" },
  { value: "client_create", label: "New client webhook" },
  { value: "call_ai_transcript", label: "Call AI transcript" },
  { value: "course_completion", label: "Course completion" },
];

function integrationTokenLabel(value: string) {
  return (
    integrationTokenTypeOptions.find((option) => option.value === value)?.label ??
    value.replaceAll("_", " ")
  );
}

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
  onSendInvite,
}: {
  member: TeamRow;
  canManage: boolean;
  onEdit: (member: TeamRow) => void;
  onArchive: (member: TeamRow) => void;
  onSendInvite: (member: TeamRow) => void;
}) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex justify-end">
        {canManage ? (
          <div className="flex flex-wrap justify-end gap-2 text-xs">
            <button
              type="button"
              onClick={() => onSendInvite(member)}
              className="font-medium text-emerald-700 hover:text-emerald-800"
            >
              Send invite
            </button>
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
  onSaved: (message?: string) => void;
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

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
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

    const invite = data?.invite as
      | { sent?: boolean; error?: string; loginUrl?: string }
      | undefined;
    if (isEditing) {
      onSaved("Team member updated.");
      return;
    }

    if (invite?.sent) {
      onSaved(
        `Team member added. Invite sent to ${email.trim().toLowerCase()}. They can log in at ${invite.loginUrl ?? retainOsLoginUrl()}.`,
      );
      return;
    }

    try {
      const inviteResult = await sendRetainOsLoginEmail(email);
      onSaved(
        `Team member added. Invite sent to ${inviteResult.email}. They can log in at ${inviteResult.loginUrl}.`,
      );
    } catch (inviteError) {
      onSaved(
        invite?.error
          ? `Team member added, but the invite email failed: ${invite.error}`
          : `Team member added, but the invite email failed: ${inviteErrorMessage(
              inviteError,
            )}`,
      );
    }
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
                ? "Writes are enabled for this RetainOS workspace."
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

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
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
                {isEditing ? "Edit" : "New"} {isMilestone ? "milestone" : "pathway"}
              </h2>
              <p className="mt-1 text-sm text-[#6c7684]">
                This configuration will be available to RetainOS clients.
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
                  Final milestone in this pathway
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
      .map(
        (client) =>
          client.client_name ??
          client.client_business ??
          client.business_name ??
          client.glide_row_id,
      )
      .filter(Boolean)
      .join(", ");
    return `${fallback} Active clients: ${sample}${count > clients.length ? `, and ${count - clients.length} more` : ""}.`;
  }

  async function functionErrorPayload(error: unknown) {
    const context = (error as { context?: unknown } | null)?.context;
    if (context instanceof Response) {
      return (await context.clone().json().catch(() => null)) as
        | Record<string, unknown>
        | null;
    }
    return null;
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
      const errorData = data ?? (await functionErrorPayload(error));
      setActionError(
        archiveErrorMessage(
          typeof errorData?.error === "string"
            ? errorData.error
            : error?.message ?? "Unable to archive.",
          errorData as Record<string, unknown> | null | undefined,
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
          <h2 className="text-xl font-semibold text-[#162b3e]">Pathways & Milestones</h2>
          <p className="mt-1 text-sm text-[#6c7684]">
            Configure the primary client pathways and their ordered milestones.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!canManage}
            onClick={() => setEditingOffer(null)}
            className="rounded-md bg-[#59abf0] px-4 py-2 text-sm font-semibold text-[#162b3e] disabled:opacity-40"
          >
            + New Pathway
          </button>
        </div>
      </div>

      {source === "mirror" ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This company still reads pathway configuration from Glide. Editing unlocks when
          the company moves to RetainOS write mode.
        </div>
      ) : null}
      {actionError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      ) : null}

      {activeOffers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#cbd2dc] bg-white p-10 text-center text-sm text-[#6c7684]">
          No active pathways configured yet.
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
                    {usageCounts.offers[offer.glide_row_id] ?? 0} current active client
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
                        offer.name ?? "pathway",
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
                    No milestones configured for this pathway.
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
                            {usageCounts.milestones[milestone.glide_row_id] ?? 0} current
                            active client
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
            Archived pathways ({archivedOffers.length})
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
                    Restoring this pathway also restores its associated milestones.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!canManage}
                  onClick={() =>
                    void unarchiveItem(
                      "unarchive_offer",
                      offer.glide_row_id,
                      offer.name ?? "pathway",
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
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  readOnly?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-[#344054]">
      {label}
      <input
        required={required}
        readOnly={readOnly}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block w-full rounded-md border border-[#d0d5dd] px-3 py-2 text-sm shadow-sm focus:border-[#59abf0] focus:outline-none focus:ring-2 focus:ring-[#59abf0]/20 read-only:bg-[#f7f9fc] read-only:text-[#667085]"
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
              Success, Progress, and Buy-in stay as the constrained outcome
              structure. Rename labels carefully; values power validation and
              reporting.
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
              disabled={Boolean(item)}
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
            readOnly={Boolean(item)}
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

const customFieldTypeLabels: Record<CompanyCustomFieldRow["field_type"], string> = {
  text: "Text",
  textarea: "Long text",
  number: "Number",
  date: "Date",
  boolean: "Yes/No",
  single_select: "Single select",
  multi_select: "Multi select",
  url: "URL",
  email: "Email",
};

function CustomFieldModal({
  companyLegacyId,
  item,
  onClose,
  onSaved,
}: {
  companyLegacyId: string;
  item: CompanyCustomFieldRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [key, setKey] = useState(item?.key ?? "");
  const [label, setLabel] = useState(item?.label ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [fieldType, setFieldType] = useState<CompanyCustomFieldRow["field_type"]>(
    item?.field_type ?? "text",
  );
  const [position, setPosition] = useState(String(item?.position ?? 0));
  const [isRequired, setIsRequired] = useState(item?.is_required ?? false);
  const [showOnClientDetail, setShowOnClientDetail] = useState(
    item?.is_visible_on_client_detail ?? true,
  );
  const [showOnClientList, setShowOnClientList] = useState(
    item?.is_visible_on_client_list ?? false,
  );
  const [editableByCsm, setEditableByCsm] = useState(
    item?.is_editable_by_csm ?? false,
  );
  const [optionsText, setOptionsText] = useState(
    (item?.options ?? []).map((option) => option.label).join("\n"),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requiresOptions =
    fieldType === "single_select" || fieldType === "multi_select";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const options = optionsText
      .split("\n")
      .map((option) => option.trim())
      .filter(Boolean);
    const { data, error: invokeError } = await supabase.functions.invoke(
      "manage-company-customization",
      {
        body: {
          action: "upsert_custom_field",
          companyLegacyId,
          entityId: item?.id,
          key,
          label,
          description,
          fieldType,
          entityType: item?.entity_type ?? "client",
          position: Number(position) || 0,
          isRequired,
          isVisibleOnClientDetail: showOnClientDetail,
          isVisibleOnClientList: showOnClientList,
          isEditableByCsm: editableByCsm,
          options,
          sourceTable: item?.source_table,
          sourceKey: item?.source_key,
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
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[#101828]">
              {item ? "Edit custom field" : "New custom field"}
            </h2>
            <p className="mt-1 text-sm text-[#667085]">
              Definitions control recurring fields shown in Quick Update and
              Client Profile &gt; Outcomes.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-[#98a2b3]">
            Close
          </button>
        </div>
        <div className="mt-5 space-y-4">
          <CustomizationTextInput
            label="Key"
            value={key}
            onChange={setKey}
            required
          />
          <CustomizationTextInput
            label="Label"
            value={label}
            onChange={setLabel}
            required
          />
          <CustomizationTextInput
            label="Description"
            value={description}
            onChange={setDescription}
          />
          <label className="block text-sm font-medium text-[#344054]">
            Type
            <select
              value={fieldType}
              onChange={(event) =>
                setFieldType(event.target.value as CompanyCustomFieldRow["field_type"])
              }
              className="mt-1 block w-full rounded-md border border-[#d0d5dd] px-3 py-2 text-sm shadow-sm focus:border-[#59abf0] focus:outline-none focus:ring-2 focus:ring-[#59abf0]/20"
            >
              {Object.entries(customFieldTypeLabels).map(([type, display]) => (
                <option key={type} value={type}>
                  {display}
                </option>
              ))}
            </select>
          </label>
          <CustomizationTextInput
            label="Position"
            value={position}
            onChange={setPosition}
          />
          {requiresOptions ? (
            <label className="block text-sm font-medium text-[#344054]">
              Options
              <textarea
                value={optionsText}
                onChange={(event) => setOptionsText(event.target.value)}
                rows={4}
                className="mt-1 block w-full rounded-md border border-[#d0d5dd] px-3 py-2 text-sm shadow-sm focus:border-[#59abf0] focus:outline-none focus:ring-2 focus:ring-[#59abf0]/20"
              />
            </label>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm font-medium text-[#344054]">
              <input
                type="checkbox"
                checked={isRequired}
                onChange={(event) => setIsRequired(event.target.checked)}
                className="h-4 w-4 rounded border-[#d0d5dd] text-[#59abf0]"
              />
              Required
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-[#344054]">
              <input
                type="checkbox"
                checked={showOnClientDetail}
                onChange={(event) => setShowOnClientDetail(event.target.checked)}
                className="h-4 w-4 rounded border-[#d0d5dd] text-[#59abf0]"
              />
              Outcomes view
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-[#344054]">
              <input
                type="checkbox"
                checked={showOnClientList}
                onChange={(event) => setShowOnClientList(event.target.checked)}
                className="h-4 w-4 rounded border-[#d0d5dd] text-[#59abf0]"
              />
              Client list
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-[#344054]">
              <input
                type="checkbox"
                checked={editableByCsm}
                onChange={(event) => setEditableByCsm(event.target.checked)}
                className="h-4 w-4 rounded border-[#d0d5dd] text-[#59abf0]"
              />
              CSM editable
            </label>
          </div>
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
  if (
    seededFrom === "safe_defaults" ||
    seededFrom === "company_customization_v1_defaults" ||
    item.is_default
  ) {
    return "Default";
  }
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
  customFields,
  canManage,
  onReload,
}: {
  companyLegacyId: string;
  source: CustomizationSource;
  outcomes: CompanyOutcomeDefinitionRow[];
  churnReasons: CompanyChurnReasonRow[];
  customFields: CompanyCustomFieldRow[];
  canManage: boolean;
  onReload: () => void;
}) {
  const [editingOutcome, setEditingOutcome] =
    useState<CompanyOutcomeDefinitionRow | null>();
  const [editingChurnReason, setEditingChurnReason] =
    useState<CompanyChurnReasonRow | null>();
  const [editingCustomField, setEditingCustomField] =
    useState<CompanyCustomFieldRow | null>();
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
  const sortedCustomFields = [...customFields].sort(customizationSort);
  const activeCustomFields = sortedCustomFields.filter(
    (item) => item.status !== "archived",
  );
  const archivedCustomFields = sortedCustomFields.filter(
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
    action: "archive_outcome" | "archive_churn_reason" | "archive_custom_field",
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
            company is moved to RetainOS write mode. Custom field labels
            below are previewed from CST slots and become editable company-level
            update fields after migration.
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
        {customFields.length > 0 ? (
          <section className="rounded-lg border border-[#e4e9f0] bg-[#f7f9fc] p-4">
            <h3 className="text-sm font-semibold text-[#101828]">
              Mirrored custom fields
            </h3>
            <div className="mt-3 space-y-2">
              {activeCustomFields.map((item) => (
                <CustomizationRow
                  key={item.key}
                  primary={item.label}
                  secondary={`${item.key} · ${customFieldTypeLabels[item.field_type]}`}
                  badge={item.source_key ?? "CST slot"}
                  status={item.status}
                  canManage={false}
                  onEdit={() => undefined}
                  onArchive={() => undefined}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            RetainOS customization
          </span>
          <h2 className="mt-3 text-lg font-semibold text-[#101828]">
            Company Customization
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-[#667085]">
            Configure the definitions that client-facing workflows consume:
            constrained outcome dropdowns, recurring outcome tracking fields,
            and churn/offboarding reasons.
          </p>
        </div>
        {canManage ? (
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3 lg:w-auto lg:shrink-0">
            <button
              type="button"
              onClick={() => setEditingOutcome(null)}
              className="whitespace-nowrap rounded-md bg-[#59abf0] px-4 py-2 text-sm font-medium text-white hover:bg-[#3b95df]"
            >
              + Outcome
            </button>
            <button
              type="button"
              onClick={() => setEditingCustomField(null)}
              className="whitespace-nowrap rounded-md border border-[#d0d5dd] bg-white px-4 py-2 text-sm font-medium text-[#344054] hover:bg-[#f7f9fc]"
            >
              + Custom Field
            </button>
            <button
              type="button"
              onClick={() => setEditingChurnReason(null)}
              className="whitespace-nowrap rounded-md border border-[#d0d5dd] bg-white px-4 py-2 text-sm font-medium text-[#344054] hover:bg-[#f7f9fc]"
            >
              + Churn Reason
            </button>
          </div>
        ) : null}
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
            These values appear in Quick Update and Client Detail &gt; Outcomes.
            Keep labels short enough for dropdowns and reports.
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
            Custom fields
          </h3>
          <p className="mt-1 text-xs text-[#667085]">
            Define recurring company-level update fields here. Enabled fields
            appear in Quick Update and Client Profile &gt; Outcomes; client values
            are edited in those workflows.
          </p>
        </div>
        <div className="space-y-2 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">
              Active fields
            </p>
            <span className="rounded-full border border-[#e4e9f0] bg-white px-2.5 py-1 text-xs font-medium text-[#667085]">
              {activeCustomFields.length} active
            </span>
          </div>
          {activeCustomFields.length === 0 ? (
            <div className="rounded-md border border-dashed border-[#d0d5dd] bg-white px-4 py-3 text-sm text-[#667085]">
              No active custom fields. Add fields here when this company needs
              recurring client update prompts beyond the standard outcomes.
            </div>
          ) : (
            activeCustomFields.map((item) => (
              <CustomizationRow
                key={item.id ?? item.key}
                primary={item.label}
                secondary={`${item.key} · ${
                  customFieldTypeLabels[item.field_type]
                } · position ${item.position ?? 0}`}
                badge={item.source_key ? `Mapped from ${item.source_key}` : customizationOriginLabel(item)}
                status={item.status}
                canManage={canManage}
                onEdit={() => setEditingCustomField(item)}
                onArchive={() => archiveItem("archive_custom_field", item.id)}
              />
            ))
          )}
          {archivedCustomFields.length > 0 ? (
            <details className="pt-2">
              <summary className="cursor-pointer text-sm font-semibold text-[#586273]">
                Archived custom fields ({archivedCustomFields.length})
              </summary>
              <div className="mt-3 space-y-2">
                {archivedCustomFields.map((item) => (
                  <CustomizationRow
                    key={item.id ?? item.key}
                    primary={item.label}
                    secondary={`${item.key} · ${customFieldTypeLabels[item.field_type]}`}
                    badge={item.source_key ? `Mapped from ${item.source_key}` : customizationOriginLabel(item)}
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
            These company-level values support offboarding/churn classification
            and dashboard churn reason charts. Companies with no configured
            reasons start with Financial, Overwhelm, Paused, Spousal,
            Uncertainty, and Other.
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
              No active churn reasons. Add the reasons Directors and Support
              should choose from during offboarding.
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
      {editingCustomField !== undefined ? (
        <CustomFieldModal
          companyLegacyId={companyLegacyId}
          item={editingCustomField}
          onClose={() => setEditingCustomField(undefined)}
          onSaved={() => {
            setEditingCustomField(undefined);
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
    enable_secondary_offers: company?.enable_secondary_offers === true,
    enable_archetypes: company?.enable_archetypes === true,
    enable_call_ai_for_csms: company?.enable_call_ai_for_csms === true,
    enable_embeds: false,
    enable_zapier_client_create: false,
    allow_status_change_retention: false,
    client_list_columns: normalizeClientListColumns(null),
    program_status_labels: DEFAULT_PROGRAM_STATUS_LABELS,
    metadata: {
      contact_touch_sets_next_contact: false,
      contact_touch_next_contact_days: DEFAULT_CONTACT_TOUCH_NEXT_CONTACT_DAYS,
    },
  };
}

function settingsMetadata(settings: CompanySettingsRow) {
  return settings.metadata && typeof settings.metadata === "object"
    ? settings.metadata
    : {};
}

function clientListColumns(settings: CompanySettingsRow) {
  return normalizeClientListColumns(
    settings.client_list_columns ?? settingsMetadata(settings).client_list_columns,
  );
}

function updateClientListColumns(
  settings: CompanySettingsRow,
  columns: ClientListColumnKey[],
): CompanySettingsRow {
  return {
    ...settings,
    client_list_columns: normalizeClientListColumns(columns),
  };
}

function programStatusLabels(settings: CompanySettingsRow) {
  return normalizeProgramStatusLabels(
    settings.program_status_labels ??
      settingsMetadata(settings).program_status_labels,
  );
}

function updateProgramStatusLabel(
  settings: CompanySettingsRow,
  status: keyof ProgramStatusLabelMap,
  label: string,
): CompanySettingsRow {
  return {
    ...settings,
    program_status_labels: {
      ...programStatusLabels(settings),
      [status]: label,
    },
  };
}

function contactTouchSetsNextContact(settings: CompanySettingsRow) {
  return settingsMetadata(settings).contact_touch_sets_next_contact === true;
}

function contactTouchNextContactDays(settings: CompanySettingsRow) {
  const days = Number(settingsMetadata(settings).contact_touch_next_contact_days);
  if (!Number.isFinite(days)) return DEFAULT_CONTACT_TOUCH_NEXT_CONTACT_DAYS;
  return Math.min(365, Math.max(0, Math.round(days)));
}

function updateContactTouchMetadata(
  settings: CompanySettingsRow,
  patch: Partial<{
    contact_touch_sets_next_contact: boolean;
    contact_touch_next_contact_days: number;
  }>,
): CompanySettingsRow {
  return {
    ...settings,
    metadata: {
      ...settingsMetadata(settings),
      ...patch,
    },
  };
}

const NOTIFICATION_PREFERENCE_COPY: Record<
  NotificationPreferenceType,
  { label: string; description: string }
> = {
  next_contact_due: {
    label: "Next contact reminders",
    description:
      "Show next-contact reminders in the bell and today's contact list in Daily Pulse.",
  },
  renewal_due: {
    label: "Contract renewals",
    description:
      "Show renewal reminders in the bell and selected Daily Pulse date window.",
  },
  paused_return_due: {
    label: "Pause returns",
    description:
      "Show paused-client return reminders in the bell and selected Daily Pulse date window.",
  },
  churn_risk: {
    label: "Churn risk",
    description:
      "Show Daily Pulse cards for active clients with stale red Progress or Buy-in signals.",
  },
  rga_candidate: {
    label: "RGA candidates",
    description:
      "Show Daily Pulse cards for active clients with stale green Progress or Buy-in signals.",
  },
  quiet_profile: {
    label: "Quiet profiles",
    description:
      "Show Daily Pulse cards for active clients without a recent RetainOS profile/history signal.",
  },
  task_due: {
    label: "Task due reminders",
    description:
      "Show generated task due reminders in the bell when task notifications are available.",
  },
  diagnostic_due: {
    label: "Onboarding checkpoint",
    description:
      "Show Daily Pulse cards for onboarding-based diagnostics, audits, or recurring check-ins.",
  },
  strategic_review_due: {
    label: "Strategic reviews",
    description:
      "Show Daily Pulse cards before contract/program end for strategic review or renewal planning.",
  },
};

const NOTIFICATION_PREFERENCE_GROUPS: {
  title: string;
  description: string;
  types: NotificationPreferenceType[];
}[] = [
  {
    title: "Daily Pulse and reminder visibility",
    description:
      "Choose which operating signals this company sees. Bell reminders stay compact; Daily Pulse stays persistent.",
    types: [
      "next_contact_due",
      "renewal_due",
      "paused_return_due",
      "churn_risk",
      "rga_candidate",
      "quiet_profile",
      "task_due",
    ],
  },
  {
    title: "Company timing rules",
    description:
      "Set the company rhythm for onboarding checkpoints/check-ins and strategic review planning.",
    types: ["diagnostic_due", "strategic_review_due"],
  },
];

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

function ReminderTimingInput({
  preference,
  disabled,
  onChange,
}: {
  preference: SettingsNotificationPreference;
  disabled: boolean;
  onChange: (changes: Partial<SettingsNotificationPreference>) => void;
}) {
  if (preference.notification_type === "diagnostic_due") {
    const recurrence =
      preference.metadata?.recurrence === "recurring" ? "recurring" : "once";
    return (
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-[#586273]">
          Signal behavior
          <select
            disabled={disabled}
            value={recurrence}
            onChange={(event) =>
              onChange({ metadata: { recurrence: event.target.value } })
            }
            className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#101828] shadow-sm disabled:bg-[#f7f9fc] disabled:text-[#667085]"
          >
            <option value="once">One-time checkpoint after onboarding</option>
            <option value="recurring">Recurring check-in cadence</option>
          </select>
        </label>
        <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-[#586273]">
          {recurrence === "recurring" ? "Repeat every X days" : "Days after onboarding"}
          <input
            type="number"
            min="1"
            max="365"
            disabled={disabled}
            value={preference.lead_days || 56}
            onChange={(event) =>
              onChange({ lead_days: Number(event.target.value) || 56 })
            }
            className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#101828] shadow-sm disabled:bg-[#f7f9fc] disabled:text-[#667085]"
          />
          <span className="mt-1 block text-[11px] normal-case tracking-normal text-[#667085]">
            {recurrence === "recurring"
              ? "Example: 30 creates a monthly check-in signal."
              : "Example: 56 creates an eight-week checkpoint."}
          </span>
        </label>
      </div>
    );
  }

  if (preference.notification_type === "strategic_review_due") {
    return (
      <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.08em] text-[#586273]">
        Days before contract/program end
        <input
          type="number"
          min="0"
          max="365"
          disabled={disabled}
          value={preference.lead_days}
          onChange={(event) =>
            onChange({ lead_days: Number(event.target.value) || 0 })
          }
          className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#101828] shadow-sm disabled:bg-[#f7f9fc] disabled:text-[#667085]"
        />
        <span className="mt-1 block text-[11px] normal-case tracking-normal text-[#667085]">
          Example: 35 creates a five-week pre-renewal review signal.
        </span>
      </label>
    );
  }

  return null;
}

function TaskTemplatesModal({
  companyLegacyId,
  templates,
  offers,
  milestones,
  teamMembers,
  disabled,
  onClose,
  onReload,
}: {
  companyLegacyId: string;
  templates: CompanyTaskTemplateRow[];
  offers: CompanyOfferRow[];
  milestones: CompanyOfferMilestoneRow[];
  teamMembers: TeamRow[];
  disabled: boolean;
  onClose: () => void;
  onReload: () => void;
}) {
  const activeTeamMembers = teamMembers
    .filter((member) => member.is_archived !== true && member.role_read_only_user !== true)
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  const [editing, setEditing] = useState<CompanyTaskTemplateRow | null>(null);
  const [draft, setDraft] = useState<CompanyTaskTemplateRow>(() => ({
    name: "",
    description: "",
    trigger_type: "client_created",
    applies_to_offer_id: "",
    applies_to_milestone_id: "",
    assign_to_type: "assigned_csm",
    assigned_member_legacy_id: "",
    due_offset_days: 0,
    recurring_is_recurring: false,
    recurring_interval_days: 56,
    priority: "",
    status_value: "todo",
    is_enabled: true,
    position: templates.length * 10,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freshOffers, setFreshOffers] = useState<CompanyOfferRow[] | null>(null);
  const [freshMilestones, setFreshMilestones] = useState<
    CompanyOfferMilestoneRow[] | null
  >(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const availableOffers = freshOffers ?? offers;
  const availableMilestones = freshMilestones ?? milestones;
  const activeOffers = availableOffers.filter((offer) => offer.status !== "archived");
  const milestoneOptions = availableMilestones
    .filter(
      (milestone) =>
        milestone.status !== "archived" &&
        milestone.offer_id === draft.applies_to_offer_id,
    )
    .sort((a, b) => {
      const positionA =
        typeof a.position === "number"
          ? a.position
          : typeof a.order === "number"
            ? a.order
            : 9999;
      const positionB =
        typeof b.position === "number"
          ? b.position
          : typeof b.order === "number"
            ? b.order
            : 9999;
      if (positionA !== positionB) return positionA - positionB;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
  const offerNameById = new Map(
    activeOffers.map((offer) => [offer.glide_row_id, offer.name ?? "Unnamed pathway"]),
  );
  const milestoneNameById = new Map(
    availableMilestones.map((milestone) => [
      milestone.glide_row_id,
      milestone.name ?? "Unnamed milestone",
    ]),
  );
  const missingMilestoneTriggerFields =
    draft.trigger_type === "milestone_completed" &&
    (!draft.applies_to_offer_id || !draft.applies_to_milestone_id);

  useEffect(() => {
    let cancelled = false;

    async function loadFreshPathwayOptions() {
      setOptionsLoading(true);
      const { data: appCompany, error: companyError } = await supabase
        .from("companies")
        .select("id")
        .eq("legacy_glide_row_id", companyLegacyId)
        .in("migration_status", ["pilot", "migrated"])
        .maybeSingle();

      if (cancelled) return;
      if (companyError || !appCompany?.id) {
        if (companyError) {
          console.error("Failed to refresh task template pathways:", companyError);
        }
        setOptionsLoading(false);
        return;
      }

      const [offersResult, milestonesResult] = await Promise.all([
        supabase
          .from("company_offers")
          .select("glide_row_id, name, status")
          .eq("company_id", appCompany.id)
          .eq("status", "active")
          .order("name", { ascending: true }),
        supabase
          .from("company_offer_milestones")
          .select("glide_row_id, offer_id, name, position, status")
          .eq("company_id", appCompany.id)
          .eq("status", "active")
          .order("position", { ascending: true }),
      ]);

      if (cancelled) return;
      if (!offersResult.error) {
        setFreshOffers((offersResult.data ?? []) as CompanyOfferRow[]);
      } else {
        console.error("Failed to refresh task template offers:", offersResult.error);
      }
      if (!milestonesResult.error) {
        setFreshMilestones(
          (milestonesResult.data ?? []) as CompanyOfferMilestoneRow[],
        );
      } else {
        console.error(
          "Failed to refresh task template milestones:",
          milestonesResult.error,
        );
      }
      setOptionsLoading(false);
    }

    void loadFreshPathwayOptions();

    return () => {
      cancelled = true;
    };
  }, [companyLegacyId]);

  function templateTriggerLabel(template: CompanyTaskTemplateRow) {
    if (template.trigger_type === "client_created") {
      return "Auto-create when a client is added";
    }
    if (template.trigger_type === "milestone_completed") {
      return "Auto-create when a milestone is completed";
    }
    return "Preset available in New Task";
  }

  function resetDraft() {
    setEditing(null);
    setDraft({
      name: "",
      description: "",
      trigger_type: "client_created",
      applies_to_offer_id: "",
      applies_to_milestone_id: "",
      assign_to_type: "assigned_csm",
      assigned_member_legacy_id: "",
      due_offset_days: 0,
      recurring_is_recurring: false,
      recurring_interval_days: 56,
      priority: "",
      status_value: "todo",
      is_enabled: true,
      position: templates.length * 10,
    });
  }

  function editTemplate(template: CompanyTaskTemplateRow) {
    setEditing(template);
    setDraft({
      ...template,
      description: template.description ?? "",
      applies_to_offer_id: template.applies_to_offer_id ?? "",
      applies_to_milestone_id: template.applies_to_milestone_id ?? "",
      assigned_member_legacy_id: template.assigned_member_legacy_id ?? "",
      priority: template.priority ?? "",
      recurring_is_recurring: template.recurring_is_recurring === true,
      recurring_interval_days: template.recurring_interval_days ?? 56,
      position: template.position ?? 0,
    });
    setError(null);
  }

  function copyTemplate(template: CompanyTaskTemplateRow) {
    const { id: _id, archived_at: _archivedAt, ...copy } = template;
    const nextPosition =
      Math.max(
        0,
        ...templates.map((item) =>
          typeof item.position === "number" ? item.position : 0,
        ),
      ) + 10;
    setEditing(null);
    setDraft({
      ...copy,
      name: `Copy of ${template.name}`,
      description: template.description ?? "",
      applies_to_offer_id: template.applies_to_offer_id ?? "",
      applies_to_milestone_id: template.applies_to_milestone_id ?? "",
      assigned_member_legacy_id: template.assigned_member_legacy_id ?? "",
      priority: template.priority ?? "",
      recurring_is_recurring: template.recurring_is_recurring === true,
      recurring_interval_days: template.recurring_interval_days ?? 56,
      position: nextPosition,
    });
    setError(null);
  }

  async function saveTemplate(event: FormEvent) {
    event.preventDefault();
    if (disabled || saving) return;
    setSaving(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke(
      "manage-company-customization",
      {
        body: {
          action: "upsert_task_template",
          companyLegacyId,
          entityId: editing?.id,
          name: draft.name,
          description: draft.description,
          triggerType: draft.trigger_type,
          appliesToOfferId: draft.applies_to_offer_id || null,
          appliesToMilestoneId: draft.applies_to_milestone_id || null,
          assignToType: draft.assign_to_type,
          assignedMemberLegacyId: draft.assigned_member_legacy_id || null,
          dueOffsetDays: draft.due_offset_days,
          recurringIsRecurring: draft.recurring_is_recurring === true,
          recurringIntervalDays: draft.recurring_interval_days ?? 56,
          priority: draft.priority || null,
          statusValue: draft.status_value,
          isEnabled: draft.is_enabled,
          position: draft.position ?? 0,
        },
      },
    );
    setSaving(false);
    if (invokeError || data?.error) {
      setError(invokeError?.message ?? data.error);
      return;
    }
    resetDraft();
    onReload();
  }

  async function archiveTemplate(template: CompanyTaskTemplateRow) {
    if (disabled || saving || !template.id) return;
    const confirmed = window.confirm(`Archive task template "${template.name}"?`);
    if (!confirmed) return;
    setSaving(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke(
      "manage-company-customization",
      {
        body: {
          action: "archive_task_template",
          companyLegacyId,
          entityId: template.id,
        },
      },
    );
    setSaving(false);
    if (invokeError || data?.error) {
      setError(invokeError?.message ?? data.error);
      return;
    }
    if (editing?.id === template.id) resetDraft();
    onReload();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="retainos-modal max-h-[92vh] w-full max-w-5xl overflow-y-auto">
        <div className="retainos-modal-header sticky top-0 z-10 flex items-start justify-between gap-4 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-[#101828]">
              Task Templates
            </h2>
            <p className="mt-1 text-sm text-[#667085]">
              Configure reusable New Task presets and new-client auto-create rules.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[#d0d5dd] px-3 py-1.5 text-sm font-medium text-[#344054] hover:bg-[#f8fafc]"
          >
            Close
          </button>
        </div>

        <div className="grid gap-5 px-6 py-5 lg:grid-cols-[1fr_1.15fr]">
          <section>
            <h3 className="text-sm font-semibold text-[#101828]">
              Active templates
            </h3>
            <div className="mt-3 space-y-3">
              {templates.length === 0 ? (
                <div className="rounded-md border border-dashed border-[#d9e2ec] bg-[#f8fafc] px-4 py-6 text-sm text-[#667085]">
                  No task templates yet.
                </div>
              ) : (
                templates.map((template) => (
                  <div
                    key={template.id ?? template.name}
                    className="rounded-md border border-[#e4e9f0] bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold text-[#101828]">
                          {template.name}
                        </h4>
                        <p className="mt-1 text-xs text-[#667085]">
                          {templateTriggerLabel(template)}{" "}
                          · due in {template.due_offset_days} day
                          {template.due_offset_days === 1 ? "" : "s"}
                          {template.recurring_is_recurring
                            ? ` · repeats every ${template.recurring_interval_days ?? 56} days`
                            : ""}
                        </p>
                        {template.trigger_type === "milestone_completed" ? (
                          <p className="mt-1 text-xs text-[#667085]">
                            {offerNameById.get(template.applies_to_offer_id ?? "") ??
                              "Unknown pathway"}{" "}
                            /{" "}
                            {milestoneNameById.get(
                              template.applies_to_milestone_id ?? "",
                            ) ?? "Unknown milestone"}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                          template.is_enabled
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-50 text-slate-600"
                        }`}
                      >
                        {template.is_enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => editTemplate(template)}
                        className="rounded-md border border-[#d0d5dd] px-3 py-1.5 text-xs font-semibold text-[#344054] hover:bg-[#f8fafc]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => copyTemplate(template)}
                        className="rounded-md border border-[#d0d5dd] px-3 py-1.5 text-xs font-semibold text-[#344054] hover:bg-[#f8fafc]"
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        onClick={() => void archiveTemplate(template)}
                        className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        Archive
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <form onSubmit={saveTemplate} className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-[#101828]">
                {editing ? "Edit template" : "New template"}
              </h3>
              {editing ? (
                <button
                  type="button"
                  onClick={resetDraft}
                  className="text-xs font-semibold text-[#2f73b8] hover:text-[#1d4f8f]"
                >
                  New template
                </button>
              ) : null}
            </div>
            {error ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}
            <label className="block text-sm font-medium text-[#344054]">
              Template name
              <input
                value={draft.name}
                disabled={disabled || saving}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
                className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm shadow-sm"
              />
              <span className="mt-1 block text-xs text-[#667085]">
                Auto-created client tasks append the client name. You can also use
                {" {client_name}"} in the name or description.
              </span>
            </label>
            <label className="block text-sm font-medium text-[#344054]">
              Description
              <textarea
                value={draft.description ?? ""}
                disabled={disabled || saving}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={3}
                className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm shadow-sm"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <SettingsSelect
                label="Trigger"
                value={draft.trigger_type}
                disabled={disabled || saving}
                options={[
                  { value: "client_created", label: "When client is created" },
                  {
                    value: "milestone_completed",
                    label: "When milestone is completed",
                  },
                  { value: "manual", label: "Preset in New Task modal" },
                ]}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    trigger_type: value as CompanyTaskTemplateRow["trigger_type"],
                    applies_to_offer_id:
                      value === "milestone_completed"
                        ? current.applies_to_offer_id
                        : current.applies_to_offer_id,
                    applies_to_milestone_id:
                      value === "milestone_completed"
                        ? current.applies_to_milestone_id
                        : "",
                  }))
                }
              />
              <label className="block text-sm font-medium text-[#344054]">
                {draft.trigger_type === "milestone_completed"
                  ? "Pathway"
                  : "Applies to pathway"}
                <select
                  disabled={disabled || saving}
                  value={draft.applies_to_offer_id ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      applies_to_offer_id: event.target.value,
                      applies_to_milestone_id: "",
                    }))
                  }
                  className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm shadow-sm"
                >
                  <option value="">
                    {draft.trigger_type === "milestone_completed"
                      ? optionsLoading
                        ? "Refreshing pathways..."
                        : "Choose pathway"
                      : "All pathways"}
                  </option>
                  {activeOffers.map((offer) => (
                    <option key={offer.glide_row_id} value={offer.glide_row_id}>
                      {offer.name ?? "Unnamed pathway"}
                    </option>
                  ))}
                </select>
              </label>
              {draft.trigger_type === "milestone_completed" ? (
                <label className="block text-sm font-medium text-[#344054]">
                  Milestone completed
                  <select
                    disabled={disabled || saving || !draft.applies_to_offer_id}
                    value={draft.applies_to_milestone_id ?? ""}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        applies_to_milestone_id: event.target.value,
                      }))
                    }
                    className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm shadow-sm disabled:bg-[#f7f9fc] disabled:text-[#667085]"
                  >
                    <option value="">
                      {optionsLoading
                        ? "Refreshing milestones..."
                        : draft.applies_to_offer_id
                          ? "Choose milestone"
                          : "Choose pathway first"}
                    </option>
                    {milestoneOptions.map((milestone) => (
                      <option
                        key={milestone.glide_row_id}
                        value={milestone.glide_row_id}
                      >
                        {milestone.name ?? "Unnamed milestone"}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <SettingsSelect
                label="Assign to"
                value={draft.assign_to_type}
                disabled={disabled || saving}
                options={[
                  { value: "assigned_csm", label: "Assigned CSM" },
                  { value: "director", label: "Director" },
                  { value: "support", label: "Support" },
                  { value: "specific_member", label: "Specific team member" },
                  { value: "unassigned", label: "Unassigned" },
                ]}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    assign_to_type: value,
                    assigned_member_legacy_id:
                      value === "specific_member"
                        ? current.assigned_member_legacy_id
                        : "",
                  }))
                }
              />
              <label className="block text-sm font-medium text-[#344054]">
                Team member
                <select
                  disabled={
                    disabled || saving || draft.assign_to_type !== "specific_member"
                  }
                  value={draft.assigned_member_legacy_id ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      assigned_member_legacy_id: event.target.value,
                    }))
                  }
                  className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm shadow-sm disabled:bg-[#f7f9fc] disabled:text-[#667085]"
                >
                  <option value="">Choose member</option>
                  {activeTeamMembers.map((member) => (
                    <option key={member.glide_row_id} value={member.glide_row_id}>
                      {member.name ?? member.email ?? "Unnamed member"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-[#344054]">
                Due after X days
                <input
                  type="number"
                  min="0"
                  max="365"
                  disabled={disabled || saving}
                  value={draft.due_offset_days}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      due_offset_days: Number(event.target.value) || 0,
                    }))
                  }
                  className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm shadow-sm"
                />
              </label>
              <label className="block text-sm font-medium text-[#344054]">
                Priority
                <select
                  disabled={disabled || saving}
                  value={draft.priority ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      priority: event.target.value,
                    }))
                  }
                  className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm shadow-sm"
                >
                  <option value="">None</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>
              <div className="rounded-md border border-[#d9e2ec] bg-[#f8fafc] p-4 sm:col-span-2">
                <label className="flex items-start gap-3 text-sm font-semibold text-[#101828]">
                  <input
                    type="checkbox"
                    checked={draft.recurring_is_recurring === true}
                    disabled={disabled || saving}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        recurring_is_recurring: event.target.checked,
                        recurring_interval_days:
                          current.recurring_interval_days ?? 56,
                      }))
                    }
                    className="mt-1 h-4 w-4 rounded border-[#d0d5dd] text-[#2f73b8]"
                  />
                  <span>
                    Recurring task
                    <span className="mt-1 block text-xs font-normal text-[#667085]">
                      When a recurring client task is completed, RetainOS creates the
                      next one while the client is Front End or Back End.
                    </span>
                  </span>
                </label>
                <label className="mt-3 block text-sm font-medium text-[#344054]">
                  Repeat every X days
                  <input
                    type="number"
                    min="1"
                    max="365"
                    disabled={
                      disabled || saving || draft.recurring_is_recurring !== true
                    }
                    value={draft.recurring_interval_days ?? 56}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        recurring_interval_days: Number(event.target.value) || 56,
                      }))
                    }
                    className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm shadow-sm disabled:bg-[#f7f9fc] disabled:text-[#667085]"
                  />
                </label>
              </div>
            </div>
            <SettingsFlag
              label="Template enabled"
              description="Disabled templates stay saved but do not create tasks."
              checked={draft.is_enabled}
              disabled={disabled || saving}
              onChange={(checked) =>
                setDraft((current) => ({ ...current, is_enabled: checked }))
              }
            />
            <div className="retainos-modal-footer sticky bottom-0 flex justify-end gap-3 px-0 py-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-[#d0d5dd] px-4 py-2 text-sm font-medium text-[#344054] hover:bg-[#f8fafc]"
              >
                Done
              </button>
              <button
                type="submit"
                disabled={disabled || saving || missingMilestoneTriggerFields}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : editing ? "Save template" : "Create template"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function ContractTemplatesModal({
  companyLegacyId,
  templates,
  offers,
  disabled,
  onClose,
  onReload,
}: {
  companyLegacyId: string;
  templates: CompanyContractTemplateRow[];
  offers: CompanyOfferRow[];
  disabled: boolean;
  onClose: () => void;
  onReload: () => void;
}) {
  const activeOffers = offers.filter((offer) => offer.status !== "archived");
  const offerNameById = new Map(
    activeOffers.map((offer) => [offer.glide_row_id, offer.name ?? "Unnamed pathway"]),
  );
  const [editing, setEditing] = useState<CompanyContractTemplateRow | null>(null);
  const [draft, setDraft] = useState<CompanyContractTemplateRow>(() => ({
    name: "",
    description: "",
    applies_to_offer_id: "",
    contract_days: 90,
    monthly_value: null,
    reference_link: "",
    notes: "",
    auto_renew: false,
    is_enabled: true,
    position: templates.length * 10,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetDraft() {
    setEditing(null);
    setDraft({
      name: "",
      description: "",
      applies_to_offer_id: "",
      contract_days: 90,
      monthly_value: null,
      reference_link: "",
      notes: "",
      auto_renew: false,
      is_enabled: true,
      position: templates.length * 10,
    });
    setError(null);
  }

  function editTemplate(template: CompanyContractTemplateRow) {
    setEditing(template);
    setDraft({
      ...template,
      description: template.description ?? "",
      reference_link: template.reference_link ?? "",
      notes: template.notes ?? "",
      monthly_value: template.monthly_value ?? null,
      auto_renew: template.auto_renew === true,
      position: template.position ?? 0,
    });
    setError(null);
  }

  async function saveTemplate(event: FormEvent) {
    event.preventDefault();
    if (disabled || saving) return;
    setSaving(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke(
      "manage-company-customization",
      {
        body: {
          action: "upsert_contract_template",
          companyLegacyId,
          entityId: editing?.id,
          name: draft.name,
          description: draft.description,
          appliesToOfferId: draft.applies_to_offer_id,
          contractDays: draft.contract_days,
          monthlyValue: draft.monthly_value,
          referenceLink: draft.reference_link,
          notes: draft.notes,
          autoRenew: draft.auto_renew === true,
          isEnabled: draft.is_enabled,
          position: draft.position ?? 0,
        },
      },
    );
    setSaving(false);
    if (invokeError || data?.error) {
      setError(invokeError?.message ?? data.error);
      return;
    }
    resetDraft();
    onReload();
  }

  async function archiveTemplate(template: CompanyContractTemplateRow) {
    if (disabled || saving || !template.id) return;
    const confirmed = window.confirm(`Archive contract template "${template.name}"?`);
    if (!confirmed) return;
    setSaving(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke(
      "manage-company-customization",
      {
        body: {
          action: "archive_contract_template",
          companyLegacyId,
          entityId: template.id,
        },
      },
    );
    setSaving(false);
    if (invokeError || data?.error) {
      setError(invokeError?.message ?? data.error);
      return;
    }
    if (editing?.id === template.id) resetDraft();
    onReload();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="retainos-modal max-h-[92vh] w-full max-w-5xl overflow-y-auto">
        <div className="retainos-modal-header sticky top-0 z-10 flex items-start justify-between gap-4 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-[#101828]">
              Contract Templates
            </h2>
            <p className="mt-1 text-sm text-[#667085]">
              Auto-create initial contracts from the primary pathway assigned to a new client.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[#d0d5dd] px-3 py-1.5 text-sm font-medium text-[#344054] hover:bg-[#f8fafc]"
          >
            Close
          </button>
        </div>

        <div className="grid gap-5 px-6 py-5 lg:grid-cols-[1fr_1.15fr]">
          <section>
            <h3 className="text-sm font-semibold text-[#101828]">
              Active templates
            </h3>
            <div className="mt-3 space-y-3">
              {templates.length === 0 ? (
                <div className="rounded-md border border-dashed border-[#d9e2ec] bg-[#f8fafc] px-4 py-6 text-sm text-[#667085]">
                  No contract templates yet.
                </div>
              ) : (
                templates.map((template) => (
                  <div
                    key={template.id ?? template.name}
                    className="rounded-md border border-[#e4e9f0] bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold text-[#101828]">
                          {template.name}
                        </h4>
                        <p className="mt-1 text-xs text-[#667085]">
                          {offerNameById.get(template.applies_to_offer_id) ??
                            "Unknown pathway"}{" "}
                          · {template.contract_days} days
                        </p>
                        {template.monthly_value ? (
                          <p className="mt-1 text-xs text-[#667085]">
                            ${Number(template.monthly_value).toLocaleString()} / month
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                          template.is_enabled
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-50 text-slate-600"
                        }`}
                      >
                        {template.is_enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => editTemplate(template)}
                        className="rounded-md border border-[#d0d5dd] px-3 py-1.5 text-xs font-semibold text-[#344054] hover:bg-[#f8fafc]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void archiveTemplate(template)}
                        className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        Archive
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <form onSubmit={saveTemplate} className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-[#101828]">
                {editing ? "Edit template" : "New template"}
              </h3>
              {editing ? (
                <button
                  type="button"
                  onClick={resetDraft}
                  className="text-xs font-semibold text-[#2f73b8] hover:text-[#1d4f8f]"
                >
                  New template
                </button>
              ) : null}
            </div>
            {error ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}
            <label className="block text-sm font-medium text-[#344054]">
              Template name
              <input
                value={draft.name}
                disabled={disabled || saving}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
                className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm shadow-sm"
                placeholder="Inner Circle - 3 Months contract"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-[#344054]">
                Pathway
                <select
                  disabled={disabled || saving || Boolean(editing)}
                  value={draft.applies_to_offer_id}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      applies_to_offer_id: event.target.value,
                    }))
                  }
                  className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm shadow-sm disabled:bg-[#f7f9fc] disabled:text-[#667085]"
                >
                  <option value="">Choose pathway</option>
                  {activeOffers.map((offer) => (
                    <option key={offer.glide_row_id} value={offer.glide_row_id}>
                      {offer.name ?? "Unnamed pathway"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-[#344054]">
                Expected duration days
                <input
                  type="number"
                  min="1"
                  max="3650"
                  value={draft.contract_days}
                  disabled={disabled || saving}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      contract_days: Number(event.target.value) || 1,
                    }))
                  }
                  className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm shadow-sm"
                />
              </label>
              <label className="block text-sm font-medium text-[#344054]">
                Monthly value
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.monthly_value ?? ""}
                  disabled={disabled || saving}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      monthly_value: event.target.value
                        ? Number(event.target.value)
                        : null,
                    }))
                  }
                  className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm shadow-sm"
                />
              </label>
              <SettingsFlag
                label="Enabled"
                description="Use this template for new clients assigned to this pathway."
                checked={draft.is_enabled}
                disabled={disabled || saving}
                onChange={(checked) =>
                  setDraft((current) => ({ ...current, is_enabled: checked }))
                }
              />
            </div>
            <label className="block text-sm font-medium text-[#344054]">
              Reference link
              <input
                value={draft.reference_link ?? ""}
                disabled={disabled || saving}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    reference_link: event.target.value,
                  }))
                }
                className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm shadow-sm"
              />
            </label>
            <label className="block text-sm font-medium text-[#344054]">
              Notes
              <textarea
                value={draft.notes ?? ""}
                disabled={disabled || saving}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, notes: event.target.value }))
                }
                rows={3}
                className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm shadow-sm"
                placeholder="Optional default notes for auto-created contracts"
              />
            </label>
            <div className="flex justify-end gap-3 border-t border-[#e4e9f0] pt-4">
              <button
                type="button"
                onClick={resetDraft}
                disabled={disabled || saving}
                className="rounded-md border border-[#d0d5dd] px-4 py-2 text-sm font-semibold text-[#344054] hover:bg-[#f8fafc] disabled:opacity-50"
              >
                Reset
              </button>
              <button
                type="submit"
                disabled={disabled || saving}
                className="rounded-md bg-[#59abf0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2f73b8] disabled:opacity-50"
              >
                {saving ? "Saving..." : editing ? "Save template" : "Create template"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function CompanySettingsSetup({
  companyLegacyId,
  source,
  settings,
  notificationPreferences,
  taskTemplates,
  contractTemplates,
  taskTemplateOffers,
  taskTemplateMilestones,
  teamMembers,
  integrationEvents,
  integrationEventsLoading,
  integrationTokens,
  integrationTokensLoading,
  canManageTokens,
  canManage,
  onReload,
}: {
  companyLegacyId: string;
  source: SettingsSource;
  settings: CompanySettingsRow;
  notificationPreferences: SettingsNotificationPreference[];
  taskTemplates: CompanyTaskTemplateRow[];
  contractTemplates: CompanyContractTemplateRow[];
  taskTemplateOffers: CompanyOfferRow[];
  taskTemplateMilestones: CompanyOfferMilestoneRow[];
  teamMembers: TeamRow[];
  integrationEvents: IntegrationIntakeEventRow[];
  integrationEventsLoading: boolean;
  integrationTokens: IntegrationTokenRow[];
  integrationTokensLoading: boolean;
  canManageTokens: boolean;
  canManage: boolean;
  onReload: () => void;
}) {
  const [draft, setDraft] = useState<CompanySettingsRow>(settings);
  const [preferenceDraft, setPreferenceDraft] = useState<
    SettingsNotificationPreference[]
  >(mergeNotificationPreferences(notificationPreferences));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [taskTemplateModalOpen, setTaskTemplateModalOpen] = useState(false);
  const [contractTemplateModalOpen, setContractTemplateModalOpen] = useState(false);
  const [eventClientSelections, setEventClientSelections] = useState<
    Record<string, string>
  >({});
  const [eventClientSearches, setEventClientSearches] = useState<
    Record<string, string>
  >({});
  const [eventClientOptions, setEventClientOptions] = useState<
    Record<string, IntegrationReviewClientOption[]>
  >({});
  const [eventClientSearchLoading, setEventClientSearchLoading] = useState<
    Record<string, boolean>
  >({});
  const [eventClientSearchMessages, setEventClientSearchMessages] = useState<
    Record<string, string>
  >({});
  const [reviewAction, setReviewAction] = useState<string | null>(null);
  const [tokenAction, setTokenAction] = useState<string | null>(null);
  const [tokenDraft, setTokenDraft] = useState({
    integrationType: "call_summary_next_steps",
    label: "Default token",
  });
  const [generatedToken, setGeneratedToken] = useState<{
    rawToken: string;
    label: string;
    integrationType: string;
  } | null>(null);
  const [generatedTokenCopied, setGeneratedTokenCopied] = useState(false);

  useEffect(() => {
    setDraft(settings);
    setError(null);
    setSaved(false);
  }, [settings]);

  useEffect(() => {
    setPreferenceDraft(mergeNotificationPreferences(notificationPreferences));
    setError(null);
    setSaved(false);
  }, [notificationPreferences]);

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
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
          enableSecondaryOffers: draft.enable_secondary_offers,
          enableArchetypes: draft.enable_archetypes,
          enableCallAiForCsms: draft.enable_call_ai_for_csms,
          enableEmbeds: draft.enable_embeds,
          enableZapierClientCreate: draft.enable_zapier_client_create,
          allowStatusChangeRetention: draft.allow_status_change_retention,
          clientListColumns: clientListColumns(draft),
          programStatusLabels: programStatusLabels(draft),
          contactTouchSetsNextContact: contactTouchSetsNextContact(draft),
          contactTouchNextContactDays: contactTouchNextContactDays(draft),
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
    const { data: preferenceData, error: preferenceInvokeError } =
      await supabase.functions.invoke("manage-company-customization", {
        body: {
          action: "update_notification_preferences",
          companyLegacyId,
          preferences: preferenceDraft,
        },
      });
    if (preferenceInvokeError) {
      setError(preferenceInvokeError.message);
      return;
    }
    if (preferenceData?.error) {
      setError(preferenceData.error);
      return;
    }
    setSaved(true);
    onReload();
  }

  const disabled = !canManage || saving;
  const selectedClientListColumns = clientListColumns(draft);
  const selectedProgramStatusLabels = programStatusLabels(draft);

  async function handleIntegrationReviewAction(
    eventId: string,
    action: "match" | "retry" | "ignore",
  ) {
    if (!canManage || reviewAction) return;
    const selectedClientId = eventClientSelections[eventId] ?? "";
    if (action === "match" && !selectedClientId) {
      setError("Choose a client before matching this event.");
      setSaved(false);
      return;
    }
    setReviewAction(`${eventId}:${action}`);
    setError(null);
    setSaved(false);
    const { data, error: invokeError } = await supabase.functions.invoke(
      "manage-integration-review",
      {
        body: {
          action,
          companyLegacyId,
          eventId,
          clientId: selectedClientId || undefined,
        },
      },
    );
    setReviewAction(null);
    if (invokeError) {
      setError(invokeError.message);
      return;
    }
    if (data?.error) {
      setError(data.error);
      return;
    }
    setSaved(true);
    setEventClientSelections((current) => {
      const next = { ...current };
      delete next[eventId];
      return next;
    });
    onReload();
  }

  function integrationClientLabel(client: IntegrationReviewClientOption) {
    const label =
      client.client_name ||
      client.client_business ||
      client.client_email ||
      client.id;
    const detail = [
      client.client_email,
      client.program_status_value ? client.program_status_value : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return detail ? `${label} — ${detail}` : label;
  }

  function integrationSearchTerm(value: string) {
    return value.trim().replace(/[,%]/g, " ");
  }

  async function handleIntegrationClientSearch(eventId: string) {
    const query = integrationSearchTerm(eventClientSearches[eventId] ?? "");
    if (query.length < 2) {
      setEventClientOptions((current) => ({ ...current, [eventId]: [] }));
      setEventClientSearchMessages((current) => ({
        ...current,
        [eventId]: "Type at least 2 characters to search clients.",
      }));
      return;
    }

    setEventClientSearchLoading((current) => ({ ...current, [eventId]: true }));
    setEventClientSearchMessages((current) => ({ ...current, [eventId]: "" }));

    const pattern = `%${query}%`;
    const { data, error: searchError } = await supabase
      .from("clients")
      .select(
        "id, glide_row_id, client_name, client_business, client_email, program_status_value",
      )
      .eq("company_glide_row_id", companyLegacyId)
      .is("archived_at", null)
      .or(
        `client_name.ilike.${pattern},client_email.ilike.${pattern},client_business.ilike.${pattern}`,
      )
      .order("client_name", { ascending: true })
      .limit(20);

    setEventClientSearchLoading((current) => ({ ...current, [eventId]: false }));

    if (searchError) {
      setEventClientOptions((current) => ({ ...current, [eventId]: [] }));
      setEventClientSearchMessages((current) => ({
        ...current,
        [eventId]: searchError.message,
      }));
      return;
    }

    const options = ((data ?? []) as IntegrationReviewClientOption[]).filter(
      isMatchableIntegrationClient,
    );
    setEventClientOptions((current) => ({ ...current, [eventId]: options }));
    setEventClientSearchMessages((current) => ({
      ...current,
      [eventId]:
        options.length > 0
          ? `${options.length} result${options.length === 1 ? "" : "s"} found.`
          : "No clients found. Try a different name or email.",
    }));
  }

  async function handleIntegrationTokenAction(
    action: "create" | "revoke" | "revoke_all",
    tokenId?: string,
    integrationType?: string,
  ) {
    if (!canManageTokens || tokenAction) return;
    if (action === "revoke_all") {
      const confirmed = window.confirm(
        "Revoke all active integration tokens for this company? Incoming webhooks will stop processing until new tokens are created.",
      );
      if (!confirmed) return;
    }
    if (action === "revoke") {
      const confirmed = window.confirm(
        "Revoke this integration token? Any Zap or workflow using it will stop writing to RetainOS.",
      );
      if (!confirmed) return;
    }
    setTokenAction(`${action}:${tokenId ?? integrationType ?? "all"}`);
    setError(null);
    setSaved(false);
    const { data, error: invokeError } = await supabase.functions.invoke(
      "manage-integration-token",
      {
        body: {
          action,
          companyId: companyLegacyId,
          tokenId,
          integrationType: integrationType ?? tokenDraft.integrationType,
          label: tokenDraft.label,
        },
      },
    );
    setTokenAction(null);
    if (invokeError) {
      setError(invokeError.message);
      return;
    }
    if (data?.error) {
      setError(data.error);
      return;
    }
    if (action === "create") {
      setGeneratedToken({
        rawToken: data.rawToken,
        label: data.token?.label ?? tokenDraft.label,
        integrationType: data.token?.integration_type ?? tokenDraft.integrationType,
      });
      setGeneratedTokenCopied(false);
    } else {
      setGeneratedToken(null);
      setGeneratedTokenCopied(false);
    }
    setSaved(true);
    onReload();
  }

  const activeIntegrationTokens = integrationTokens.filter(
    (token) => token.status === "active",
  );
  const hasOpenIntegrationEvents = integrationEvents.length > 0;

  return (
    <div className="mt-6 space-y-6">
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
          <p className="mt-1 max-w-3xl text-sm text-[#667085]">
            Set workspace defaults, feature gates, and Daily Pulse/reminder
            behavior for this company.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={disabled}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save settings"}
        </button>
      </div>

      {source === "mirror" ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Settings are read-only until this company is moved to RetainOS write mode.
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
          <p className="mt-1 text-xs text-[#667085]">
            These defaults are consumed by Clients and CSM Reports. They change
            the starting workspace behavior, not historical client data.
          </p>
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
          <h3 className="text-sm font-semibold text-[#101828]">
            Client list columns
          </h3>
          <p className="mt-1 text-xs text-[#667085]">
            Choose which columns show in Clients List view. Client name is always
            visible and freezes while the rest of the table scrolls.
          </p>
        </div>
        <div className="grid gap-3 p-4 lg:grid-cols-2">
          {CLIENT_LIST_COLUMN_OPTIONS.map((option) => {
            const checked = selectedClientListColumns.includes(option.key);
            const isLastChecked = checked && selectedClientListColumns.length === 1;
            return (
              <label
                key={option.key}
                className="flex items-start gap-3 rounded-md border border-[#e4e9f0] bg-white px-4 py-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled || isLastChecked}
                  onChange={(event) =>
                    setDraft((current) => {
                      const currentColumns = clientListColumns(current);
                      const nextColumns = event.target.checked
                        ? [...currentColumns, option.key]
                        : currentColumns.filter((column) => column !== option.key);
                      return updateClientListColumns(current, nextColumns);
                    })
                  }
                  className="mt-1 h-4 w-4 rounded border-[#d0d5dd] text-[#2b79c4]"
                />
                <span>
                  <span className="block font-semibold text-[#101828]">
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-[#667085]">
                    {option.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-[#e4e9f0] bg-[#f7f9fc]">
        <div className="border-b border-[#e4e9f0] px-5 py-4">
          <h3 className="text-sm font-semibold text-[#101828]">
            Program status labels
          </h3>
          <p className="mt-1 text-xs text-[#667085]">
            Rename status labels for this company without changing the underlying
            status values used by reports, filters, and automations.
          </p>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          {PROGRAM_STATUS_LABEL_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="block rounded-md border border-[#e4e9f0] bg-white px-4 py-3 text-sm"
            >
              <span className="font-semibold text-[#101828]">
                {option.defaultLabel}
              </span>
              <span className="mt-0.5 block text-xs text-[#667085]">
                {option.description}
              </span>
              <input
                type="text"
                disabled={disabled}
                value={
                  selectedProgramStatusLabels[option.value] ??
                  option.defaultLabel
                }
                onChange={(event) =>
                  setDraft((current) =>
                    updateProgramStatusLabel(
                      current,
                      option.value,
                      event.target.value,
                    ),
                  )
                }
                className="mt-3 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm shadow-sm disabled:bg-[#f7f9fc] disabled:text-[#667085]"
              />
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-[#e4e9f0] bg-[#f7f9fc]">
        <div className="border-b border-[#e4e9f0] px-5 py-4">
          <h3 className="text-sm font-semibold text-[#101828]">
            Contact cadence automation
          </h3>
          <p className="mt-1 text-xs text-[#667085]">
            Configure the fast contacted action used by CSMs from the client roster.
          </p>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <SettingsFlag
            label="Set next contact with last contact"
            description="When a team member marks a client as contacted, automatically schedule the next contact date."
            checked={contactTouchSetsNextContact(draft)}
            disabled={disabled}
            onChange={(checked) =>
              setDraft((current) =>
                updateContactTouchMetadata(current, {
                  contact_touch_sets_next_contact: checked,
                }),
              )
            }
          />
          <label className="block text-sm font-medium text-[#344054]">
            Number of days
            <input
              type="number"
              min="0"
              max="365"
              disabled={disabled || !contactTouchSetsNextContact(draft)}
              value={contactTouchNextContactDays(draft)}
              onChange={(event) =>
                setDraft((current) =>
                  updateContactTouchMetadata(current, {
                    contact_touch_next_contact_days: Number.isFinite(
                      Number(event.target.value),
                    )
                      ? Number(event.target.value)
                      : DEFAULT_CONTACT_TOUCH_NEXT_CONTACT_DAYS,
                  }),
                )
              }
              className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm shadow-sm disabled:bg-[#f7f9fc] disabled:text-[#667085]"
            />
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-[#e4e9f0] bg-[#f7f9fc]">
        <div className="border-b border-[#e4e9f0] px-5 py-4">
          <h3 className="text-sm font-semibold text-[#101828]">
            Feature gates
          </h3>
          <p className="mt-1 text-xs text-[#667085]">
            Turn company-level capabilities on or off. Deeper setup still lives
            in the feature area that uses the capability.
          </p>
        </div>
        <div className="grid gap-3 p-4 lg:grid-cols-2">
          <SettingsFlag
            label="Secondary assignee"
            description="Allow clients to carry a secondary CSM or support assignment where workflows support it."
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
            label="Secondary pathway"
            description="Allow client profiles to track a second pathway/milestone pair for add-ons, call tracks, or parallel deliverables."
            checked={draft.enable_secondary_offers}
            disabled={disabled}
            onChange={(checked) =>
              setDraft((current) => ({
                ...current,
                enable_secondary_offers: checked,
              }))
            }
          />
          <SettingsFlag
            label="Client archetypes"
            description="Show client archetypes in roster views so teams can quickly personalize coaching and support."
            checked={draft.enable_archetypes}
            disabled={disabled}
            onChange={(checked) =>
              setDraft((current) => ({
                ...current,
                enable_archetypes: checked,
              }))
            }
          />
          <SettingsFlag
            label="Call AI for CSMs"
            description="Allow CSM access to company Call AI surfaces when Call AI is enabled."
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
            description="Allow embedded resources or content where supported."
            checked={draft.enable_embeds}
            disabled={disabled}
            onChange={(checked) =>
              setDraft((current) => ({ ...current, enable_embeds: checked }))
            }
          />
          <SettingsFlag
            label="Client creation webhook"
            description="Allow external automations such as Zapier or n8n to create clients when a valid company token is configured."
            checked={draft.enable_zapier_client_create}
            disabled={disabled}
            onChange={(checked) =>
              setDraft((current) => ({
                ...current,
                enable_zapier_client_create: checked,
              }))
            }
          />
          <SettingsFlag
            label="Status-only retention"
            description="Allow active Front End or Back End status movements to count as retention without requiring a renewal or upsell contract."
            checked={draft.allow_status_change_retention}
            disabled={disabled}
            onChange={(checked) =>
              setDraft((current) => ({
                ...current,
                allow_status_change_retention: checked,
              }))
            }
          />
        </div>
      </section>

      <section className="rounded-lg border border-[#e4e9f0] bg-[#f7f9fc]">
        <div className="flex flex-col gap-3 border-b border-[#e4e9f0] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[#101828]">
              Task templates and auto-create
            </h3>
            <p className="mt-1 text-xs text-[#667085]">
              Reusable task rules for onboarding and company operating workflows.
            </p>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setTaskTemplateModalOpen(true)}
            className="rounded-md border border-[#d0d5dd] bg-white px-4 py-2 text-sm font-semibold text-[#344054] hover:bg-[#f8fafc] disabled:opacity-50"
          >
            Manage task templates
          </button>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-4">
          <div className="rounded-md border border-[#e4e9f0] bg-white px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">
              Templates
            </div>
            <div className="mt-1 text-lg font-semibold text-[#101828]">
              {taskTemplates.length}
            </div>
          </div>
          <div className="rounded-md border border-[#e4e9f0] bg-white px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">
              Auto-create
            </div>
            <div className="mt-1 text-lg font-semibold text-[#101828]">
              {
                taskTemplates.filter(
                  (template) =>
                    template.is_enabled &&
                    template.trigger_type === "client_created",
                ).length
              }
            </div>
          </div>
          <div className="rounded-md border border-[#e4e9f0] bg-white px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">
              Milestone
            </div>
            <div className="mt-1 text-lg font-semibold text-[#101828]">
              {
                taskTemplates.filter(
                  (template) =>
                    template.is_enabled &&
                    template.trigger_type === "milestone_completed",
                ).length
              }
            </div>
          </div>
          <div className="rounded-md border border-[#e4e9f0] bg-white px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">
              Manual
            </div>
            <div className="mt-1 text-lg font-semibold text-[#101828]">
              {
                taskTemplates.filter(
                  (template) =>
                    template.is_enabled && template.trigger_type === "manual",
                ).length
              }
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[#e4e9f0] bg-[#f7f9fc]">
        <div className="flex flex-col gap-3 border-b border-[#e4e9f0] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[#101828]">
              Contract templates
            </h3>
            <p className="mt-1 text-xs text-[#667085]">
              Auto-create initial contracts from the primary pathway assigned to a new client.
            </p>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setContractTemplateModalOpen(true)}
            className="rounded-md border border-[#d0d5dd] bg-white px-4 py-2 text-sm font-semibold text-[#344054] hover:bg-[#f8fafc] disabled:opacity-50"
          >
            Manage contract templates
          </button>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-3">
          <div className="rounded-md border border-[#e4e9f0] bg-white px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">
              Templates
            </div>
            <div className="mt-1 text-lg font-semibold text-[#101828]">
              {contractTemplates.length}
            </div>
          </div>
          <div className="rounded-md border border-[#e4e9f0] bg-white px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">
              Enabled
            </div>
            <div className="mt-1 text-lg font-semibold text-[#101828]">
              {contractTemplates.filter((template) => template.is_enabled).length}
            </div>
          </div>
          <div className="rounded-md border border-[#e4e9f0] bg-white px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">
              Pathways covered
            </div>
            <div className="mt-1 text-lg font-semibold text-[#101828]">
              {
                new Set(
                  contractTemplates.map((template) => template.applies_to_offer_id),
                ).size
              }
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[#e4e9f0] bg-[#f7f9fc]">
        <div className="border-b border-[#e4e9f0] px-5 py-4">
          <h3 className="text-sm font-semibold text-[#101828]">
            Notification and reminder preferences
          </h3>
          <p className="mt-1 text-xs text-[#667085]">
            These power Daily Pulse and the notification bell. Timing rules are
            company-specific operating signals. Email delivery remains off until
            the inbox and delivery flow are QAed.
          </p>
        </div>
        <div className="space-y-5 p-4">
          {NOTIFICATION_PREFERENCE_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="mb-3">
                <h4 className="text-sm font-semibold text-[#101828]">
                  {group.title}
                </h4>
                <p className="mt-1 text-xs text-[#667085]">{group.description}</p>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {group.types.map((notificationType) => {
                  const preference =
                    DEFAULT_NOTIFICATION_PREFERENCES.find(
                      (item) => item.notification_type === notificationType,
                    ) ?? DEFAULT_NOTIFICATION_PREFERENCES[0];
                  const current =
                    preferenceDraft.find(
                      (item) => item.notification_type === notificationType,
                    ) ?? preference;
                  const copy = NOTIFICATION_PREFERENCE_COPY[notificationType];
                  return (
                    <div
                      key={notificationType}
                      className="rounded-md border border-[#e4e9f0] bg-white px-4 py-3"
                    >
                      <SettingsFlag
                        label={copy.label}
                        description={copy.description}
                        checked={current.in_app_enabled}
                        disabled={disabled}
                        onChange={(checked) =>
                          setPreferenceDraft((preferences) =>
                            mergeNotificationPreferences(preferences).map((item) =>
                              item.notification_type === notificationType
                                ? {
                                    ...item,
                                    in_app_enabled: checked,
                                    email_enabled: false,
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                      <ReminderTimingInput
                        preference={current}
                        disabled={disabled}
                        onChange={(leadDays) =>
                          setPreferenceDraft((preferences) =>
                            mergeNotificationPreferences(preferences).map((item) =>
                              item.notification_type === notificationType
                                ? {
                                    ...item,
                                    ...leadDays,
                                    metadata: {
                                      ...(item.metadata ?? {}),
                                      ...(leadDays.metadata ?? {}),
                                    },
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {taskTemplateModalOpen ? (
        <TaskTemplatesModal
          companyLegacyId={companyLegacyId}
          templates={taskTemplates}
          offers={taskTemplateOffers}
          milestones={taskTemplateMilestones}
          teamMembers={teamMembers}
          disabled={disabled}
          onClose={() => setTaskTemplateModalOpen(false)}
          onReload={onReload}
        />
      ) : null}

      {contractTemplateModalOpen ? (
        <ContractTemplatesModal
          companyLegacyId={companyLegacyId}
          templates={contractTemplates}
          offers={taskTemplateOffers}
          disabled={disabled}
          onClose={() => setContractTemplateModalOpen(false)}
          onReload={onReload}
        />
      ) : null}

      <details
        open={hasOpenIntegrationEvents}
        className="overflow-hidden rounded-lg border border-[#e4e9f0] bg-white"
      >
        <summary className="cursor-pointer list-none border-b border-[#e4e9f0] px-5 py-4 [&::-webkit-details-marker]:hidden">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#101828]">
                Integration review queue
              </h3>
              <p className="mt-1 text-xs text-[#667085]">
                Operations inbox for webhook events that need human review. This
                sits here temporarily until integrations get their own operating
                area.
              </p>
            </div>
            <span className="w-fit rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
              {integrationEvents.length} open
            </span>
          </div>
        </summary>
        {source === "mirror" ? (
          <div className="px-5 py-4 text-sm text-[#667085]">
            Integration review is available once this company is running on
            RetainOS app-owned data.
          </div>
        ) : integrationEventsLoading ? (
          <div className="px-5 py-4 text-sm text-[#667085]">
            Loading integration events...
          </div>
        ) : integrationEvents.length === 0 ? (
          <div className="px-5 py-4 text-sm text-[#667085]">
            No unmatched or ambiguous webhook events need review.
          </div>
        ) : (
          <div className="divide-y divide-[#e4e9f0]">
            {integrationEvents.map((event) => {
              const clientEmail = integrationValue(event, [
                "client_email",
                "clientEmail",
                "email",
              ]);
              const title = integrationValue(event, ["title", "meeting_title"]);
              const summary = integrationValue(event, [
                "summary",
                "notes",
                "next_steps",
                "nextSteps",
              ]);
              const recordingUrl = integrationValue(event, [
                "recording_url",
                "recordingUrl",
                "url",
              ]);
              const selectedClientId = eventClientSelections[event.id] ?? "";
              const actionBusy = reviewAction?.startsWith(`${event.id}:`) ?? false;
              const clientSearch = eventClientSearches[event.id] ?? "";
              const clientOptions = eventClientOptions[event.id] ?? [];
              const clientSearchLoading =
                eventClientSearchLoading[event.id] === true;
              const clientSearchMessage =
                eventClientSearchMessages[event.id] ?? "";
              return (
                <article key={event.id} className="px-5 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[#101828]">
                          {title || clientEmail || "Webhook event"}
                        </span>
                        <span className="rounded-full border border-[#d0d5dd] bg-[#f8fafc] px-2 py-0.5 text-[11px] font-semibold uppercase text-[#586273]">
                          {event.provider || "unknown"}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${
                            event.match_status === "ambiguous"
                              ? "border-orange-200 bg-orange-50 text-orange-700"
                              : "border-amber-200 bg-amber-50 text-amber-800"
                          }`}
                        >
                          {event.match_status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[#667085]">
                        Received {formatDateTime(event.created_at)}
                        {event.external_event_id
                          ? ` · External ID ${event.external_event_id}`
                          : ""}
                      </p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">
                        {event.integration_type.replaceAll("_", " ")}
                      </p>
                      <p className="mt-2 text-sm text-[#344054]">
                        {event.error_message || "Needs manual review before writing."}
                      </p>
                    </div>
                    {recordingUrl ? (
                      <a
                        href={recordingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="retainos-button-secondary w-fit px-3 py-2 text-sm"
                      >
                        Open recording
                      </a>
                    ) : null}
                  </div>
                  <dl className="mt-3 grid gap-3 md:grid-cols-3">
                    <div className="rounded-md bg-[#f7f9fc] px-3 py-2">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#667085]">
                        Client email
                      </dt>
                      <dd className="mt-1 break-words text-sm text-[#101828]">
                        {clientEmail || "--"}
                      </dd>
                    </div>
                    <div className="rounded-md bg-[#f7f9fc] px-3 py-2 md:col-span-2">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#667085]">
                        Summary preview
                      </dt>
                      <dd className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-[#101828]">
                        {summary || "--"}
                      </dd>
                    </div>
                  </dl>
                  {canManage ? (
                    <div className="mt-4 rounded-lg border border-[#e4e9f0] bg-[#fbfcfe] p-3">
                      <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-end">
                        <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-[#586273]">
                          Search client
                          <div className="mt-1 flex gap-2">
                            <input
                              type="search"
                              value={clientSearch}
                              disabled={actionBusy || clientSearchLoading}
                              placeholder="Type name or email"
                              onChange={(inputEvent) => {
                                const value = inputEvent.target.value;
                                setEventClientSearches((current) => ({
                                  ...current,
                                  [event.id]: value,
                                }));
                                setEventClientSelections((current) => {
                                  const next = { ...current };
                                  delete next[event.id];
                                  return next;
                                });
                              }}
                              onKeyDown={(keyEvent) => {
                                if (keyEvent.key === "Enter") {
                                  keyEvent.preventDefault();
                                  void handleIntegrationClientSearch(event.id);
                                }
                              }}
                              className="block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#101828] shadow-sm disabled:bg-[#f7f9fc] disabled:text-[#667085]"
                            />
                            <button
                              type="button"
                              disabled={actionBusy || clientSearchLoading}
                              onClick={() =>
                                void handleIntegrationClientSearch(event.id)
                              }
                              className="retainos-button-secondary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {clientSearchLoading ? "Searching..." : "Search"}
                            </button>
                          </div>
                          <select
                            value={selectedClientId}
                            disabled={actionBusy || clientSearchLoading}
                            onChange={(selectEvent) =>
                              setEventClientSelections((current) => ({
                                ...current,
                                [event.id]: selectEvent.target.value,
                              }))
                            }
                            className="mt-2 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#101828] shadow-sm disabled:bg-[#f7f9fc] disabled:text-[#667085]"
                          >
                            <option value="">
                              {clientOptions.length > 0
                                ? "Choose from search results..."
                                : "Search first"}
                            </option>
                            {clientOptions.map((client) => (
                              <option key={client.id} value={client.id}>
                                {integrationClientLabel(client)}
                              </option>
                            ))}
                          </select>
                          {clientSearchMessage ? (
                            <p className="mt-1 text-xs normal-case tracking-normal text-[#667085]">
                              {clientSearchMessage}
                            </p>
                          ) : null}
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={actionBusy || !selectedClientId}
                            onClick={() =>
                              handleIntegrationReviewAction(event.id, "match")
                            }
                            className="retainos-button-secondary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Match to client
                          </button>
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() =>
                              handleIntegrationReviewAction(event.id, "retry")
                            }
                            className="retainos-button-secondary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Retry apply
                          </button>
                        </div>
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() =>
                            handleIntegrationReviewAction(event.id, "ignore")
                          }
                          className="w-fit rounded-full border border-[#d0d5dd] bg-white px-4 py-2 text-sm font-semibold text-[#586273] shadow-sm transition hover:border-[#98a2b3] hover:text-[#101828] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Ignore
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </details>

      <section className="rounded-lg border border-[#e4e9f0] bg-white">
        <div className="border-b border-[#e4e9f0] px-5 py-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#101828]">
                Integration tokens
              </h3>
              <p className="mt-1 text-xs text-[#667085]">
                Generate company-specific webhook tokens for Zapier, n8n, Fathom,
                Otter, Grain, and future integrations. Raw tokens are shown once.
              </p>
            </div>
            <span className="w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              {activeIntegrationTokens.length} active
            </span>
          </div>
        </div>
        {source === "mirror" ? (
          <div className="px-5 py-4 text-sm text-[#667085]">
            Tokens are available once this company is running on RetainOS
            app-owned data.
          </div>
        ) : !canManageTokens ? (
          <div className="px-5 py-4 text-sm text-[#667085]">
            Integration tokens are Super Admin-only because they allow external
            systems to write into RetainOS.
          </div>
        ) : (
          <div className="space-y-4 p-5">
            {generatedToken ? (
              <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-amber-700">
                      One-time token
                    </p>
                    <h4 className="mt-1 text-base font-semibold text-amber-950">
                      Copy this token now
                    </h4>
                    <p className="mt-1 text-sm text-amber-900">
                      This {integrationTokenLabel(generatedToken.integrationType)}
                      token authorizes external systems to write to this company.
                      It is only shown once. The listed token prefix below cannot
                      be used to configure Zapier or n8n.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard?.writeText(
                          generatedToken.rawToken,
                        );
                        setGeneratedTokenCopied(true);
                      }}
                      className="retainos-button-primary w-fit px-4 py-2 text-sm"
                    >
                      {generatedTokenCopied ? "Copied" : "Copy token"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGeneratedToken(null);
                        setGeneratedTokenCopied(false);
                      }}
                      className="retainos-button-secondary w-fit px-4 py-2 text-sm"
                    >
                      Dismiss after storing
                    </button>
                  </div>
                </div>
                <code className="mt-3 block break-all rounded-md border border-amber-200 bg-white px-3 py-2 text-xs text-[#101828]">
                  {generatedToken.rawToken}
                </code>
              </div>
            ) : null}

            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-950">
              <span className="font-semibold">Company ID</span> routes a webhook
              to the right SaaS account.{" "}
              <span className="font-semibold">Integration token</span> proves
              the webhook is allowed to write for that company and integration.
            </div>

            <div className="grid gap-3 rounded-lg border border-[#e4e9f0] bg-[#f7f9fc] p-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
              <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-[#586273]">
                Integration type
                <select
                  value={tokenDraft.integrationType}
                  disabled={Boolean(tokenAction)}
                  onChange={(event) =>
                    setTokenDraft((current) => ({
                      ...current,
                      integrationType: event.target.value,
                    }))
                  }
                  className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#101828] shadow-sm disabled:bg-[#f7f9fc] disabled:text-[#667085]"
                >
                  {integrationTokenTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-[#586273]">
                Label
                <input
                  type="text"
                  value={tokenDraft.label}
                  disabled={Boolean(tokenAction)}
                  onChange={(event) =>
                    setTokenDraft((current) => ({
                      ...current,
                      label: event.target.value,
                    }))
                  }
                  className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#101828] shadow-sm disabled:bg-[#f7f9fc] disabled:text-[#667085]"
                />
              </label>
              <button
                type="button"
                disabled={Boolean(tokenAction)}
                onClick={() => handleIntegrationTokenAction("create")}
                className="retainos-button-primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                Generate token
              </button>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-amber-900">
                    Offboarding safety
                  </h4>
                  <p className="mt-1 text-xs text-amber-800">
                    If a SaaS client is paused, archived, or offboarded, revoke
                    active tokens here. RetainOS will reject future webhook
                    writes even if an external Zap or workflow keeps firing.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={Boolean(tokenAction) || activeIntegrationTokens.length === 0}
                  onClick={() => handleIntegrationTokenAction("revoke_all")}
                  className="w-fit rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 shadow-sm transition hover:border-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Revoke all active tokens
                </button>
              </div>
            </div>

            {integrationTokensLoading ? (
              <div className="text-sm text-[#667085]">Loading tokens...</div>
            ) : integrationTokens.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#d0d5dd] px-4 py-5 text-sm text-[#667085]">
                No integration tokens have been created yet.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-[#e4e9f0]">
                <table className="min-w-full divide-y divide-[#e4e9f0] text-sm">
                  <thead className="bg-[#f7f9fc] text-left text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">
                    <tr>
                      <th className="px-4 py-3">Integration</th>
                      <th className="px-4 py-3">Token</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Last used</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e4e9f0] bg-white">
                    {integrationTokens.map((token) => {
                      const isActive = token.status === "active";
                      return (
                        <tr key={token.id}>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-[#101828]">
                              {integrationTokenLabel(token.integration_type)}
                            </div>
                            <div className="text-xs text-[#667085]">
                              {token.label || "Default token"}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <code className="rounded bg-[#f7f9fc] px-2 py-1 text-xs text-[#344054]">
                              {token.token_prefix || "--"}...
                            </code>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full border px-2 py-1 text-xs font-semibold ${
                                isActive
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-slate-200 bg-slate-50 text-slate-600"
                              }`}
                            >
                              {token.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[#667085]">
                            {token.last_used_at
                              ? formatDateTime(token.last_used_at)
                              : "Never"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {isActive ? (
                              <button
                                type="button"
                                disabled={Boolean(tokenAction)}
                                onClick={() =>
                                  handleIntegrationTokenAction(
                                    "revoke",
                                    token.id,
                                    token.integration_type,
                                  )
                                }
                                className="rounded-full border border-[#d0d5dd] px-3 py-1.5 text-xs font-semibold text-[#586273] hover:border-red-300 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Revoke
                              </button>
                            ) : (
                              <span className="text-xs text-[#98a2b3]">
                                Revoked {formatDate(token.revoked_at)}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-dashed border-[#d0d5dd] bg-white px-5 py-4">
        <h3 className="text-sm font-semibold text-[#101828]">
          Managed in other tabs
        </h3>
        <p className="mt-1 text-sm text-[#667085]">
          Outcome definitions, custom fields, and churn reasons live in
          Customization. Pathways and milestones live in Pathways &amp; Milestones.
          Resource setup guides live in Resources. Dashboard preferences and
          client-list column presets remain later migration-hardening work.
        </p>
      </section>
    </div>
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
  const { capabilities, isSuperAdmin, setViewAsCompanyId, viewAsCompanyId } =
    useAccountContext();
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
  const [teamActionSuccess, setTeamActionSuccess] = useState<string | null>(null);
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
  const [customFields, setCustomFields] = useState<CompanyCustomFieldRow[]>([]);
  const [customizationLoading, setCustomizationLoading] = useState(false);
  const [customizationReloadKey, setCustomizationReloadKey] = useState(0);
  const [settingsSource, setSettingsSource] = useState<SettingsSource>("mirror");
  const [companySettings, setCompanySettings] = useState<CompanySettingsRow>(
    defaultCompanySettings(null),
  );
  const [notificationPreferences, setNotificationPreferences] = useState<
    SettingsNotificationPreference[]
  >(mergeNotificationPreferences(null));
  const [integrationReviewEvents, setIntegrationReviewEvents] = useState<
    IntegrationIntakeEventRow[]
  >([]);
  const [integrationTokens, setIntegrationTokens] = useState<IntegrationTokenRow[]>(
    [],
  );
  const [taskTemplates, setTaskTemplates] = useState<CompanyTaskTemplateRow[]>([]);
  const [contractTemplates, setContractTemplates] = useState<
    CompanyContractTemplateRow[]
  >([]);
  const [taskTemplateOffers, setTaskTemplateOffers] = useState<CompanyOfferRow[]>([]);
  const [taskTemplateMilestones, setTaskTemplateMilestones] = useState<
    CompanyOfferMilestoneRow[]
  >([]);
  const [integrationReviewLoading, setIntegrationReviewLoading] = useState(false);
  const [integrationTokensLoading, setIntegrationTokensLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsReloadKey, setSettingsReloadKey] = useState(0);
  const canManageCompanyDefinitions = capabilities.canManageTeam;

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
              "program_status_value, offer_milestones_current_offer_id, offer_milestones_current_milestone_id, secondary_offer_milestones_current_offer_id, secondary_offer_milestones_current_milestone_id",
            )
            .eq("company_id", appCompany.id)
            .is("archived_at", null),
        ]);
        if (cancelled) return;
        if (!offersResult.error && !milestonesResult.error) {
          const usageRows =
            !usageResult.error && usageResult.data
              ? (usageResult.data as {
                  program_status_value?: string | null;
                  offer_milestones_current_offer_id?: string | null;
                  offer_milestones_current_milestone_id?: string | null;
                  secondary_offer_milestones_current_offer_id?: string | null;
                  secondary_offer_milestones_current_milestone_id?: string | null;
                }[])
              : [];
          const nextUsageCounts: PathwayUsageCounts = { offers: {}, milestones: {} };
          for (const row of usageRows) {
            if (!isActiveClientStatus(row.program_status_value)) continue;
            const offerIds = new Set(
              [
                row.offer_milestones_current_offer_id,
                row.secondary_offer_milestones_current_offer_id,
              ].filter(Boolean) as string[],
            );
            const milestoneIds = new Set(
              [
                row.offer_milestones_current_milestone_id,
                row.secondary_offer_milestones_current_milestone_id,
              ].filter(Boolean) as string[],
            );
            for (const offerId of offerIds) {
              nextUsageCounts.offers[offerId] =
                (nextUsageCounts.offers[offerId] ?? 0) + 1;
            }
            for (const milestoneId of milestoneIds) {
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
        const [outcomesResult, churnResult, customFieldsResult] = await Promise.all([
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
          supabase
            .from("company_custom_fields")
            .select(
              "id, key, label, description, entity_type, field_type, options, is_required, is_visible_on_client_detail, is_visible_on_client_list, is_editable_by_csm, position, source_table, source_key, status, metadata",
            )
            .eq("company_id", appCompany.id)
            .order("position", { ascending: true }),
        ]);
        if (cancelled) return;
        if (!outcomesResult.error && !churnResult.error) {
          let loadedChurnReasons =
            (churnResult.data ?? []) as CompanyChurnReasonRow[];
          if (loadedChurnReasons.length === 0 && canManageCompanyDefinitions) {
            const { data: seededData, error: seedError } =
              await supabase.functions.invoke("manage-company-customization", {
                body: {
                  action: "seed_default_churn_reasons",
                  companyLegacyId: legacyCompanyId,
                },
              });
            if (cancelled) return;
            if (seedError || seededData?.error) {
              console.error(
                "Failed to seed default churn reasons:",
                seedError ?? seededData?.error,
              );
            } else if (Array.isArray(seededData?.items)) {
              loadedChurnReasons =
                seededData.items as CompanyChurnReasonRow[];
            }
          }
          setOutcomeDefinitions(
            (outcomesResult.data ?? []) as CompanyOutcomeDefinitionRow[],
          );
          setChurnReasons(loadedChurnReasons);
          if (customFieldsResult.error) {
            console.error(
              "Failed to load app-owned custom fields:",
              customFieldsResult.error,
            );
            setCustomFields([]);
          } else {
            setCustomFields(
              (customFieldsResult.data ?? []) as CompanyCustomFieldRow[],
            );
          }
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
        setCustomFields([]);
        setCustomizationSource("app_owned");
        setCustomizationLoading(false);
        return;
      }

      const [choicesResult, mirrorCompanyResult] = await Promise.all([
        supabase
          .from("backup_choices")
          .select(
            "success_value, success_display, progress_value, progress_display, buy_in_value, buy_in_display, index",
          )
          .order("index", { ascending: true }),
        supabase
          .from("backup_companies")
          .select(
            "customfield1, customfield2, customfield3, customfield4, customfield5, customfield6, customfield7",
          )
          .eq("glide_row_id", legacyCompanyId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      if (choicesResult.error)
        console.error("Failed to load mirrored customization:", choicesResult.error);
      if (mirrorCompanyResult.error) {
        console.error("Failed to load mirrored custom fields:", mirrorCompanyResult.error);
      }

      const seen = new Set<string>();
      const mirroredOutcomes: CompanyOutcomeDefinitionRow[] = [];
      for (const row of (choicesResult.data ?? []) as Record<string, unknown>[]) {
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
      const mirroredCustomFields: CompanyCustomFieldRow[] = [];
      const mirrorCompany = (mirrorCompanyResult.data ?? {}) as Record<
        string,
        unknown
      >;
      for (let index = 1; index <= 7; index += 1) {
        const sourceKey = `customfield${index}`;
        const rawLabel = mirrorCompany[sourceKey];
        const label = typeof rawLabel === "string" ? rawLabel.trim() : "";
        if (!label) continue;
        mirroredCustomFields.push({
          key: sourceKey,
          label,
          field_type: "text",
          position: index * 10,
          source_table: "backup_companies",
          source_key: sourceKey,
          status: "active",
          metadata: { seeded_from: "backup_companies" },
        });
      }
      setOutcomeDefinitions(mirroredOutcomes);
      setChurnReasons([]);
      setCustomFields(mirroredCustomFields);
      setCustomizationSource("mirror");
      setCustomizationLoading(false);
    }

    void loadCustomization();
    return () => {
      cancelled = true;
    };
  }, [activeTab, canManageCompanyDefinitions, companyId, customizationReloadKey]);

  useEffect(() => {
    if (!companyId || activeTab !== "settings") return;
    const legacyCompanyId = companyId;
    let cancelled = false;

    async function loadSettings() {
      setSettingsLoading(true);
      setIntegrationReviewLoading(true);
      setIntegrationTokensLoading(true);
      const { data: appCompany } = await supabase
        .from("companies")
        .select("id, migration_status")
        .eq("legacy_glide_row_id", legacyCompanyId)
        .in("migration_status", ["pilot", "migrated"])
        .maybeSingle();

      if (appCompany?.id) {
        const [
          settingsResult,
          preferencesResult,
          integrationResult,
          integrationTokensResult,
          taskTemplatesResult,
          contractTemplatesResult,
          taskTemplateOffersResult,
          taskTemplateMilestonesResult,
        ] = await Promise.all([
          supabase
            .from("company_settings")
            .select(
              "id, profile_upkeep_freshness_days, default_client_view, default_calendar_mode, enable_secondary_assignee, enable_secondary_offers, enable_archetypes, enable_call_ai_for_csms, enable_embeds, enable_zapier_client_create, allow_status_change_retention, metadata, updated_at",
            )
            .eq("company_id", appCompany.id)
            .maybeSingle(),
          supabase
            .from("notification_preferences")
            .select("notification_type, in_app_enabled, email_enabled, lead_days, metadata")
            .eq("company_id", appCompany.id)
            .is("member_id", null)
            .is("role", null),
          supabase
            .from("integration_intake_events")
            .select(
              "id, integration_type, provider, external_event_id, status, match_status, error_message, payload, metadata, created_at, updated_at",
            )
            .eq("company_id", appCompany.id)
            .in("status", ["needs_review", "failed"])
            .order("created_at", { ascending: false })
            .limit(12),
          isSuperAdmin
            ? supabase.functions.invoke("manage-integration-token", {
                body: {
                  action: "list",
                  companyId: legacyCompanyId,
                },
              })
            : Promise.resolve({ data: { tokens: [] }, error: null }),
          supabase
            .from("company_task_templates")
            .select(
              "id, name, description, trigger_type, applies_to_offer_id, applies_to_milestone_id, assign_to_type, assigned_member_legacy_id, due_offset_days, recurring_is_recurring, recurring_interval_days, priority, status_value, is_enabled, position, metadata, archived_at",
            )
            .eq("company_id", appCompany.id)
            .is("archived_at", null)
            .order("position", { ascending: true })
            .order("name", { ascending: true }),
          supabase
            .from("company_contract_templates")
            .select(
              "id, name, description, applies_to_offer_id, contract_days, monthly_value, reference_link, notes, auto_renew, is_enabled, position, metadata, archived_at",
            )
            .eq("company_id", appCompany.id)
            .is("archived_at", null)
            .order("position", { ascending: true })
            .order("name", { ascending: true }),
          supabase
            .from("company_offers")
            .select("glide_row_id, name, status")
            .eq("company_id", appCompany.id)
            .eq("status", "active")
            .order("name", { ascending: true }),
          supabase
            .from("company_offer_milestones")
            .select("glide_row_id, offer_id, name, position, status")
            .eq("company_id", appCompany.id)
            .eq("status", "active")
            .order("position", { ascending: true }),
        ]);
        if (cancelled) return;
        if (!preferencesResult.error) {
          setNotificationPreferences(
            mergeNotificationPreferences(
              (preferencesResult.data ?? []) as Partial<NotificationPreference>[],
            ),
          );
        } else {
          console.error(
            "Failed to load notification preferences:",
            preferencesResult.error,
          );
          setNotificationPreferences(mergeNotificationPreferences(null));
        }
        if (!integrationResult.error) {
          setIntegrationReviewEvents(
            (integrationResult.data ?? []) as IntegrationIntakeEventRow[],
          );
        } else {
          console.error(
            "Failed to load integration review events:",
            integrationResult.error,
          );
          setIntegrationReviewEvents([]);
        }
        if (!integrationTokensResult.error && integrationTokensResult.data?.tokens) {
          setIntegrationTokens(
            integrationTokensResult.data.tokens as IntegrationTokenRow[],
          );
        } else {
          if (integrationTokensResult.error) {
            console.error(
              "Failed to load integration tokens:",
              integrationTokensResult.error,
            );
          }
          setIntegrationTokens([]);
        }
        if (!taskTemplatesResult.error) {
          setTaskTemplates(
            (taskTemplatesResult.data ?? []) as CompanyTaskTemplateRow[],
          );
        } else {
          console.error("Failed to load task templates:", taskTemplatesResult.error);
          setTaskTemplates([]);
        }
        if (!contractTemplatesResult.error) {
          setContractTemplates(
            (contractTemplatesResult.data ?? []) as CompanyContractTemplateRow[],
          );
        } else {
          console.error(
            "Failed to load contract templates:",
            contractTemplatesResult.error,
          );
          setContractTemplates([]);
        }
        if (!taskTemplateOffersResult.error) {
          setTaskTemplateOffers(
            (taskTemplateOffersResult.data ?? []) as CompanyOfferRow[],
          );
        } else {
          console.error(
            "Failed to load task template offers:",
            taskTemplateOffersResult.error,
          );
          setTaskTemplateOffers([]);
        }
        if (!taskTemplateMilestonesResult.error) {
          setTaskTemplateMilestones(
            (taskTemplateMilestonesResult.data ?? []) as CompanyOfferMilestoneRow[],
          );
        } else {
          console.error(
            "Failed to load task template milestones:",
            taskTemplateMilestonesResult.error,
          );
          setTaskTemplateMilestones([]);
        }
        setIntegrationReviewLoading(false);
        setIntegrationTokensLoading(false);
        if (!settingsResult.error && settingsResult.data) {
          const loadedSettings = settingsResult.data as CompanySettingsRow;
          setCompanySettings({
            ...loadedSettings,
            client_list_columns: clientListColumns(loadedSettings),
            program_status_labels: programStatusLabels(loadedSettings),
          });
          setSettingsSource("app_owned");
          setSettingsLoading(false);
          return;
        }
        if (settingsResult.error) {
          console.error(
            "Failed to load app-owned company settings:",
            settingsResult.error,
          );
        }
        setCompanySettings(defaultCompanySettings(company));
        setSettingsSource("app_owned");
        setSettingsLoading(false);
        return;
      }

      setCompanySettings(defaultCompanySettings(company));
      setNotificationPreferences(mergeNotificationPreferences(null));
      setIntegrationReviewEvents([]);
      setIntegrationTokens([]);
      setTaskTemplates([]);
      setContractTemplates([]);
      setTaskTemplateOffers([]);
      setTaskTemplateMilestones([]);
      setIntegrationReviewLoading(false);
      setIntegrationTokensLoading(false);
      setSettingsSource("mirror");
      setSettingsLoading(false);
    }

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [activeTab, company, companyId, isSuperAdmin, settingsReloadKey]);

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
    setTeamActionSuccess(null);
  }

  function handleCloseTeamModal() {
    setShowTeamModal(false);
    setEditingMember(null);
  }

  function handleTeamSaved(message?: string) {
    handleCloseTeamModal();
    setTeamActionSuccess(message ?? "Team member saved.");
    setTeamReloadKey((key) => key + 1);
  }

  async function handleSendInvite(member: TeamRow) {
    if (!canManagePilotTeam || !member.app_member_id || !companyId) return;
    if (!member.email) {
      setTeamActionError("This team member does not have a valid email.");
      setTeamActionSuccess(null);
      return;
    }

    setTeamActionError(null);
    setTeamActionSuccess(null);
    const { data, error: invokeError } = await supabase.functions.invoke(
      "manage-company-member",
      {
        body: {
          action: "send_invite",
          companyLegacyId: companyId,
          memberId: member.app_member_id,
        },
      },
    );

    if (invokeError) {
      try {
        const inviteResult = await sendRetainOsLoginEmail(member.email);
        setTeamActionSuccess(
          `Invite sent to ${inviteResult.email}. They can log in at ${inviteResult.loginUrl}.`,
        );
      } catch (inviteError) {
        setTeamActionError(`Invite failed: ${inviteErrorMessage(inviteError)}`);
      }
      return;
    }

    if (data?.error) {
      try {
        const inviteResult = await sendRetainOsLoginEmail(member.email);
        setTeamActionSuccess(
          `Invite sent to ${inviteResult.email}. They can log in at ${inviteResult.loginUrl}.`,
        );
      } catch (inviteError) {
        setTeamActionError(
          `Invite failed: ${data.error || inviteErrorMessage(inviteError)}`,
        );
      }
      return;
    }

    const invite = data?.invite as
      | { sent?: boolean; error?: string; loginUrl?: string }
      | undefined;
    if (invite?.sent) {
      setTeamActionSuccess(
        `Invite sent to ${member.email ?? "team member"}. They can log in at ${invite.loginUrl ?? retainOsLoginUrl()}.`,
      );
      return;
    }

    try {
      const inviteResult = await sendRetainOsLoginEmail(member.email);
      setTeamActionSuccess(
        `Invite sent to ${inviteResult.email}. They can log in at ${inviteResult.loginUrl}.`,
      );
    } catch (inviteError) {
      setTeamActionError(
        invite?.error
          ? `Invite failed: ${invite.error}`
          : `Invite failed: ${inviteErrorMessage(inviteError)}`,
      );
    }
  }

  async function handleArchiveMember(member: TeamRow) {
    if (!canManagePilotTeam || !member.app_member_id || !companyId) return;
    const label = member.name ?? member.email ?? "this team member";
    const confirmed = window.confirm(`Archive ${label}?`);
    if (!confirmed) return;

    setTeamActionError(null);
    setTeamActionSuccess(null);
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
    setTeamActionSuccess(`${label} was archived.`);
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
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Company workspace
              </p>
              <h1 className="truncate text-2xl font-semibold text-gray-900">
                {companyName}
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
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
          {teamActionSuccess ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {teamActionSuccess}
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
                            onSendInvite={handleSendInvite}
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
                        onSendInvite={handleSendInvite}
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
            customFields={customFields}
            canManage={
              customizationSource === "app_owned" && canManageCompanyDefinitions
            }
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
        settingsLoading && settingsSource === "mirror" && !companySettings.id ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#59abf0]" />
          </div>
        ) : (
          <CompanySettingsSetup
            companyLegacyId={companyId ?? ""}
            source={settingsSource}
            settings={companySettings}
            notificationPreferences={notificationPreferences}
            taskTemplates={taskTemplates}
            contractTemplates={contractTemplates}
            taskTemplateOffers={taskTemplateOffers}
            taskTemplateMilestones={taskTemplateMilestones}
            teamMembers={teamMembers}
            integrationEvents={integrationReviewEvents}
            integrationEventsLoading={integrationReviewLoading}
            integrationTokens={integrationTokens}
            integrationTokensLoading={integrationTokensLoading}
            canManageTokens={isSuperAdmin && settingsSource === "app_owned"}
            canManage={settingsSource === "app_owned" && canManageCompanyDefinitions}
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
