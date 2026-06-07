import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useAccountContext } from "../lib/accountContext.tsx";
import { supabase } from "../lib/supabase.ts";

interface CompanyRow {
  id: string;
  legacy_glide_row_id: string | null;
  name: string | null;
  migration_status: string | null;
}

interface TeamMemberOption {
  id: string;
  labelId: string;
  name: string;
  email: string;
}

interface OfferOption {
  id: string;
  name: string;
}

type ResourceType = "guide" | "video" | "template";
type ResourceStatus = "draft" | "published" | "archived";

interface ResourceRow {
  id: string;
  slug: string;
  title: string;
  type: ResourceType;
  description: string;
  content: string;
  loom_embed_url: string | null;
  status: ResourceStatus;
  is_dynamic: boolean;
  dynamic_key: string | null;
  sort_order: number;
}

const typeLabels: Record<ResourceType, string> = {
  guide: "Guide",
  video: "Video",
  template: "Template",
};

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="retainos-focus rounded-full border border-[#cbd2dc] px-4 py-2 text-xs font-semibold text-[#162b3e] hover:border-[#59abf0] hover:text-[#2b79c4]"
    >
      {copied ? "Copied" : label}
    </button>
  );
}

function resourceBadge(resource: ResourceRow) {
  if (resource.status === "published") return "Ready";
  if (resource.status === "archived") return "Archived";
  return "Draft";
}

function toLoomEmbedUrl(value?: string | null) {
  const url = value?.trim();
  if (!url) return null;
  return url.replace("loom.com/share/", "loom.com/embed/");
}

function ResourceCard({
  resource,
  isSuperAdmin,
  onEdit,
  onOpen,
}: {
  resource: ResourceRow;
  isSuperAdmin: boolean;
  onEdit: (resource: ResourceRow) => void;
  onOpen: (resource: ResourceRow) => void;
}) {
  const status = resourceBadge(resource);
  const isReady = status === "Ready";

  return (
    <article className="flex h-full flex-col rounded-lg border border-[#e4e9f0] bg-white p-5 shadow-sm transition hover:border-[#cbd2dc] hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-full bg-[#eaf4fe] px-3 py-1 text-xs font-semibold text-[#2b79c4]">
          {typeLabels[resource.type]}
        </span>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            isReady
              ? "bg-[#e7f6f0] text-[#2a9272]"
              : "bg-[#f1f4f9] text-[#6b7686]"
          }`}
        >
          {status}
        </span>
      </div>
      <h3 className="mt-4 text-base font-semibold text-[#162b3e]">{resource.title}</h3>
      <p className="mt-2 flex-1 text-sm leading-6 text-[#586273]">
        {resource.description || "Resource details are being drafted."}
      </p>
      <button
        type="button"
        onClick={() => onOpen(resource)}
        className={`retainos-focus mt-5 rounded-full px-4 py-2 text-sm font-semibold ${
          isReady
            ? "bg-[#162b3e] text-white hover:bg-[#1e3a52]"
            : "border border-[#e4e9f0] bg-[#f7f9fc] text-[#6b7686] hover:border-[#cbd2dc]"
        }`}
      >
        {isReady ? "View resource" : "Preview draft"}
      </button>
      {isSuperAdmin && (
        <button
          type="button"
          onClick={() => onEdit(resource)}
          className="retainos-focus mt-2 rounded-full border border-[#cbd2dc] px-4 py-2 text-sm font-semibold text-[#162b3e] hover:border-[#59abf0] hover:text-[#2b79c4]"
        >
          Edit resource
        </button>
      )}
    </article>
  );
}

function VideoResource({
  title,
  description,
  loomUrl,
}: {
  title: string;
  description: string;
  loomUrl?: string | null;
}) {
  return (
    <div className="rounded-lg border border-[#e4e9f0] bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#162b3e]">{title}</h2>
          <p className="mt-1 text-sm text-[#586273]">{description}</p>
        </div>
        <span className="rounded-full bg-[#f1f4f9] px-3 py-1 text-xs font-semibold text-[#6b7686]">
          Loom-ready
        </span>
      </div>
      <div className="aspect-video overflow-hidden rounded-lg border border-[#e4e9f0] bg-[#f1f4f9]">
        {toLoomEmbedUrl(loomUrl) ? (
          <iframe
            title={title}
            src={toLoomEmbedUrl(loomUrl) ?? undefined}
            allowFullScreen
            className="h-full w-full"
          />
        ) : (
          <div className="grid h-full place-items-center p-8 text-center">
            <div>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#d6eafb] text-lg font-bold text-[#2b79c4]">
                Play
              </div>
              <p className="mt-4 text-sm font-semibold text-[#162b3e]">
                Loom embed placeholder
              </p>
              <p className="mt-1 max-w-md text-xs leading-5 text-[#6b7686]">
                Paste a Loom embed URL into this resource and RetainOS will render
                the video inline.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CodeBlock({ value }: { value: string }) {
  return (
    <pre className="max-h-[420px] overflow-auto rounded-lg border border-[#e4e9f0] bg-[#0e1b29] p-4 text-xs leading-6 text-[#e8eef5]">
      <code>{value}</code>
    </pre>
  );
}

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[#e4e9f0] bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-[#162b3e]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function GenericResourceDetail({ resource }: { resource: ResourceRow }) {
  const paragraphs = resource.content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <div className="space-y-6">
      {resource.type === "video" || resource.loom_embed_url ? (
        <VideoResource
          title={resource.title}
          description={resource.description || "Resource walkthrough"}
          loomUrl={resource.loom_embed_url}
        />
      ) : null}

      <Section title={resource.title}>
        {paragraphs.length > 0 ? (
          <div className="space-y-4 text-sm leading-7 text-[#586273]">
            {paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-[#e4e9f0] bg-[#f7f9fc] p-6 text-sm text-[#6b7686]">
            This resource is ready for content. Add written instructions, a Loom
            URL, or both from the Super Admin editor.
          </div>
        )}
      </Section>
    </div>
  );
}

function ParameterTable() {
  const rows = [
    ["client_name", "Required", "Full name of the client."],
    ["client_email", "Required", "Email address of the client."],
    ["business_name", "Optional", "Business or company name for the client."],
    ["client_phone", "Optional", "Client phone number. Stored as webhook metadata for now."],
    ["north_star", "Optional", "Client North Star."],
    ["mailing_address", "Optional", "Stored as webhook metadata for now."],
    ["assigned_to", "Optional", "Team member ID or email for the CSM assignment."],
    ["offer_id", "Optional", "Offer ID to attach to the client journey."],
    ["contract_start_date", "Optional", "Contract start date."],
    ["contract_end_date", "Optional", "Contract end date."],
    ["contract_monthly_value", "Optional", "Monthly contract value."],
    ["notes", "Optional", "Initial notes or next steps."],
    ["archetype", "Optional", "Must be doer, controller, worrier, or follower."],
    ["external_id", "Optional", "External CRM/deal ID for duplicate protection."],
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-[#e4e9f0]">
      <table className="min-w-full divide-y divide-[#e4e9f0] text-sm">
        <thead className="bg-[#f1f4f9] text-left text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7686]">
          <tr>
            <th className="px-4 py-3">Parameter</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#eef2f6] bg-white text-[#364152]">
          {rows.map(([parameter, type, notes]) => (
            <tr key={parameter}>
              <td className="px-4 py-3 font-semibold text-[#162b3e]">{parameter}</td>
              <td className="px-4 py-3">{type}</td>
              <td className="px-4 py-3">{notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResourceEditModal({
  resource,
  onClose,
  onSaved,
}: {
  resource: ResourceRow | null;
  onClose: () => void;
  onSaved: (resource: ResourceRow) => void;
}) {
  const [title, setTitle] = useState(resource?.title ?? "");
  const [slug, setSlug] = useState(resource?.slug ?? "");
  const [type, setType] = useState<ResourceType>(resource?.type ?? "guide");
  const [status, setStatus] = useState<ResourceStatus>(resource?.status ?? "draft");
  const [description, setDescription] = useState(resource?.description ?? "");
  const [content, setContent] = useState(resource?.content ?? "");
  const [loomEmbedUrl, setLoomEmbedUrl] = useState(resource?.loom_embed_url ?? "");
  const [sortOrder, setSortOrder] = useState(String(resource?.sort_order ?? 100));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const { data, error: invokeError } = await supabase.functions.invoke(
      "manage-resource",
      {
        body: {
          action: resource ? "update_resource" : "create_resource",
          resourceId: resource?.id,
          title,
          slug,
          type,
          status,
          description,
          content,
          loomEmbedUrl,
          sortOrder: Number(sortOrder),
          isDynamic: resource?.is_dynamic ?? false,
          dynamicKey: resource?.dynamic_key ?? null,
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
    onSaved(data.resource as ResourceRow);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close resource editor"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40"
      />
      <form
        onSubmit={handleSubmit}
        className="relative max-h-[92vh] w-full max-w-3xl overflow-auto rounded-lg border border-[#e4e9f0] bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#e4e9f0] px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-[#162b3e]">
              {resource ? "Edit Resource" : "New Resource"}
            </h2>
            <p className="mt-1 text-sm text-[#6b7686]">
              Resources are global. Dynamic guides can still show company-specific IDs.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="retainos-focus rounded-full border border-[#e4e9f0] px-3 py-1 text-sm font-semibold text-[#586273] hover:border-[#cbd2dc]"
          >
            Close
          </button>
        </div>

        <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7686]">
              Title
            </span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="retainos-focus w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm"
              required
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7686]">
              Slug
            </span>
            <input
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="auto-generated from title"
              className="retainos-focus w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7686]">
              Type
            </span>
            <select
              value={type}
              onChange={(event) => setType(event.target.value as ResourceType)}
              className="retainos-focus w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm"
            >
              <option value="guide">Guide</option>
              <option value="video">Video</option>
              <option value="template">Template</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7686]">
              Status
            </span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as ResourceStatus)}
              className="retainos-focus w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7686]">
              Short Description
            </span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              className="retainos-focus w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7686]">
              Loom Embed URL
            </span>
            <input
              value={loomEmbedUrl}
              onChange={(event) => setLoomEmbedUrl(event.target.value)}
              placeholder="https://www.loom.com/embed/..."
              className="retainos-focus w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7686]">
              Written Content
            </span>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={10}
              className="retainos-focus w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm leading-6"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7686]">
              Sort Order
            </span>
            <input
              type="number"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
              className="retainos-focus w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm"
            />
          </label>
        </div>

        {error && (
          <div className="mx-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-[#e4e9f0] px-6 py-5">
          <button
            type="button"
            onClick={onClose}
            className="retainos-focus rounded-full border border-[#cbd2dc] px-5 py-2 text-sm font-semibold text-[#162b3e] hover:border-[#59abf0]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="retainos-focus rounded-full bg-[#162b3e] px-5 py-2 text-sm font-semibold text-white hover:bg-[#1e3a52] disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save resource"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function Resources() {
  const { effectiveCompanyId, isSuperAdmin } = useAccountContext();
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [editingResource, setEditingResource] = useState<ResourceRow | null>(null);
  const [isCreatingResource, setIsCreatingResource] = useState(false);
  const [company, setCompany] = useState<CompanyRow | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMemberOption[]>([]);
  const [offers, setOffers] = useState<OfferOption[]>([]);
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [resourceError, setResourceError] = useState<string | null>(null);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/zapier-create-client`;
  const selectedResource = resources.find((resource) => resource.id === selectedResourceId);

  const bodyTemplate = useMemo(
    () =>
      JSON.stringify(
        {
          company_id: effectiveCompanyId || "{{company_id}}",
          client_name: "{{client_name}}",
          client_email: "{{client_email}}",
          business_name: "{{business_name}}",
          client_phone: "{{client_phone}}",
          north_star: "{{north_star}}",
          mailing_address: "{{mailing_address}}",
          assigned_to: "{{assigned_to}}",
          offer_id: "{{offer_id}}",
          contract_start_date: "{{contract_start_date}}",
          contract_end_date: "{{contract_end_date}}",
          contract_monthly_value: "{{contract_monthly_value}}",
          notes: "{{notes}}",
          archetype: "{{archetype}}",
          external_id: "{{external_id}}",
          customfield1: "{{customfield1}}",
          customfield2: "{{customfield2}}",
          customfield3: "{{customfield3}}",
          customfield4: "{{customfield4}}",
          customfield5: "{{customfield5}}",
          customfield6: "{{customfield6}}",
          customfield7: "{{customfield7}}",
        },
        null,
        2,
      ),
    [effectiveCompanyId],
  );

  async function loadResources() {
    const { data, error } = await supabase
      .from("resources")
      .select(
        "id, slug, title, type, description, content, loom_embed_url, status, is_dynamic, dynamic_key, sort_order",
      )
      .neq("status", "archived")
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true });

    if (error) {
      setResourceError(error.message);
      return;
    }

    const rows = (data ?? []) as ResourceRow[];
    setResources(isSuperAdmin ? rows : rows.filter((resource) => resource.status === "published"));
    setResourceError(null);
  }

  useEffect(() => {
    void loadResources();
  }, [isSuperAdmin]);

  useEffect(() => {
    let cancelled = false;

    async function loadCompanyContext() {
      setCompany(null);
      setTeamMembers([]);
      setOffers([]);

      if (!effectiveCompanyId) return;

      setLoading(true);

      const { data: appCompany } = await supabase
        .from("companies")
        .select("id, legacy_glide_row_id, name, migration_status")
        .eq("legacy_glide_row_id", effectiveCompanyId)
        .in("migration_status", ["pilot", "migrated"])
        .maybeSingle();

      if (cancelled) return;

      if (appCompany) {
        setCompany(appCompany as CompanyRow);

        const [membersResult, offersResult] = await Promise.all([
          supabase
            .from("company_members")
            .select("id, legacy_glide_row_id, name, email, hide_from_csm_list, status")
            .eq("company_id", appCompany.id)
            .eq("status", "active")
            .order("name", { ascending: true }),
          supabase
            .from("company_offers")
            .select("glide_row_id, name, status")
            .eq("company_id", appCompany.id)
            .eq("status", "active")
            .order("name", { ascending: true }),
        ]);

        if (cancelled) return;

        setTeamMembers(
          (membersResult.data ?? [])
            .filter((member) => member.hide_from_csm_list !== true)
            .map((member) => ({
              id: member.id,
              labelId: member.legacy_glide_row_id ?? member.id,
              name: member.name ?? "Unnamed member",
              email: member.email ?? "",
            })),
        );
        setOffers(
          (offersResult.data ?? []).map((offer) => ({
            id: offer.glide_row_id,
            name: offer.name ?? "Unnamed offer",
          })),
        );
        setLoading(false);
        return;
      }

      const [companyResult, membersResult, offersResult] = await Promise.all([
        supabase
          .from("backup_companies")
          .select("glide_row_id, name")
          .eq("glide_row_id", effectiveCompanyId)
          .maybeSingle(),
        supabase
          .from("backup_company_team")
          .select("glide_row_id, name, email, role_hide_from_csm_list, is_archived")
          .eq("company_id", effectiveCompanyId)
          .eq("is_archived", false)
          .order("name", { ascending: true }),
        supabase
          .from("backup_company_offers")
          .select("glide_row_id, name")
          .eq("company_id", effectiveCompanyId)
          .order("name", { ascending: true }),
      ]);

      if (cancelled) return;

      setCompany({
        id: effectiveCompanyId,
        legacy_glide_row_id: effectiveCompanyId,
        name: companyResult.data?.name ?? null,
        migration_status: "glide_mirror",
      });
      setTeamMembers(
        (membersResult.data ?? [])
          .filter((member) => member.role_hide_from_csm_list !== true)
          .map((member) => ({
            id: member.glide_row_id,
            labelId: member.glide_row_id,
            name: member.name ?? "Unnamed member",
            email: member.email ?? "",
          })),
      );
      setOffers(
        (offersResult.data ?? []).map((offer) => ({
          id: offer.glide_row_id,
          name: offer.name ?? "Unnamed offer",
        })),
      );
      setLoading(false);
    }

    void loadCompanyContext();
    return () => {
      cancelled = true;
    };
  }, [effectiveCompanyId]);

  function handleResourceSaved(resource: ResourceRow) {
    setEditingResource(null);
    setIsCreatingResource(false);
    setSelectedResourceId(resource.id);
    void loadResources();
  }

  if (!effectiveCompanyId) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center text-amber-900">
        {isSuperAdmin
          ? "Select a company before opening Resources."
          : "Your company access is still loading."}
      </div>
    );
  }

  if (selectedResource) {
    const isZapierGuide = selectedResource.dynamic_key === "zapier_client_webhook";

    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => setSelectedResourceId(null)}
          className="retainos-focus text-sm font-semibold text-[#2b79c4] hover:text-[#162b3e]"
        >
          Back to resources
        </button>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#59abf0]">
              {resourceBadge(selectedResource)} {typeLabels[selectedResource.type]}
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-[#162b3e]">
              {selectedResource.title}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-[#586273]">
              {selectedResource.description}
            </p>
          </div>
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setEditingResource(selectedResource)}
              className="retainos-focus rounded-full border border-[#cbd2dc] px-4 py-2 text-sm font-semibold text-[#162b3e] hover:border-[#59abf0] hover:text-[#2b79c4]"
            >
              Edit resource
            </button>
          )}
        </div>

        {isZapierGuide ? (
          <>
            <Section
              title="1. Copy the Webhook URL"
              action={<CopyButton value={webhookUrl} />}
            >
              <p className="mb-3 text-sm text-[#586273]">
                In Zapier, use Webhooks by Zapier and send a POST request to this URL.
              </p>
              <div className="break-all rounded-lg border border-[#e4e9f0] bg-[#f7f9fc] p-4 text-sm font-semibold text-[#162b3e]">
                {webhookUrl}
              </div>
            </Section>

            <Section
              title="2. Add Your Company ID"
              action={<CopyButton value={effectiveCompanyId} />}
            >
              <p className="mb-3 text-sm text-[#586273]">
                This ID is unique for the selected company and must be included in
                every webhook request so RetainOS routes the client to the right
                account.
              </p>
              <div className="break-all rounded-lg border border-[#d6eafb] bg-[#eaf4fe] p-4 text-sm font-semibold text-[#162b3e]">
                {effectiveCompanyId}
              </div>
            </Section>

            <Section
              title="3. Configure Headers"
              action={
                <CopyButton value={"Authorization: Bearer YOUR_WEBHOOK_SECRET\nContent-Type: application/json"} />
              }
            >
              <p className="mb-3 text-sm text-[#586273]">
                RetainOS support will provide the webhook secret. Do not paste this
                secret into public docs or share it outside the client setup process.
              </p>
              <CodeBlock value={"Authorization: Bearer YOUR_WEBHOOK_SECRET\nContent-Type: application/json"} />
            </Section>

            <Section
              title="4. Add Client Information"
              action={<CopyButton value={bodyTemplate} />}
            >
              <p className="mb-3 text-sm text-[#586273]">
                Copy this JSON body into Zapier and map the dynamic fields from your
                CRM, checkout, form, or automation tool. RetainOS accepts the old
                Glide parameter names for easier migration.
              </p>
              <CodeBlock value={bodyTemplate} />
            </Section>

            <Section title="Required and Optional Fields">
              <ParameterTable />
            </Section>

            <div className="grid gap-6 xl:grid-cols-2">
              <Section title="Team Member IDs">
                <p className="mb-4 text-sm text-[#586273]">
                  Use one of these values for assigned_to, or pass the team member
                  email instead.
                </p>
                {teamMembers.length === 0 ? (
                  <div className="rounded-lg border border-[#e4e9f0] bg-[#f7f9fc] p-4 text-sm text-[#6b7686]">
                    No assignable team members found yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {teamMembers.map((member) => (
                      <div
                        key={member.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#e4e9f0] bg-[#f7f9fc] p-3"
                      >
                        <div>
                          <div className="font-semibold text-[#162b3e]">{member.name}</div>
                          <div className="text-xs text-[#6b7686]">{member.email}</div>
                          <div className="mt-1 break-all text-xs text-[#586273]">
                            {member.labelId}
                          </div>
                        </div>
                        <CopyButton value={member.labelId} />
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              <Section title="Offer IDs">
                <p className="mb-4 text-sm text-[#586273]">
                  Use one of these values for offer_id when the new client should be
                  created inside a specific journey.
                </p>
                {offers.length === 0 ? (
                  <div className="rounded-lg border border-[#e4e9f0] bg-[#f7f9fc] p-4 text-sm text-[#6b7686]">
                    No active offers found yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {offers.map((offer) => (
                      <div
                        key={offer.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#e4e9f0] bg-[#f7f9fc] p-3"
                      >
                        <div>
                          <div className="font-semibold text-[#162b3e]">{offer.name}</div>
                          <div className="mt-1 break-all text-xs text-[#586273]">
                            {offer.id}
                          </div>
                        </div>
                        <CopyButton value={offer.id} />
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </div>

            <Section title="Verify and Troubleshoot">
              <div className="grid gap-4 text-sm text-[#586273] md:grid-cols-2">
                <div className="rounded-lg border border-[#e4e9f0] bg-[#f7f9fc] p-4">
                  <h3 className="font-semibold text-[#162b3e]">After sending the webhook</h3>
                  <p className="mt-2">
                    The client should appear on the Clients page. If assigned_to was
                    provided, they will appear under that team member. If no assignee
                    was provided, they will be created without a CSM assignment.
                  </p>
                </div>
                <div className="rounded-lg border border-[#e4e9f0] bg-[#f7f9fc] p-4">
                  <h3 className="font-semibold text-[#162b3e]">If the client does not appear</h3>
                  <p className="mt-2">
                    Check company_id, client_name, client_email, the webhook secret,
                    and the Zapier request history. Archetype must be doer, controller,
                    worrier, or follower when included.
                  </p>
                </div>
              </div>
            </Section>
          </>
        ) : (
          <GenericResourceDetail resource={selectedResource} />
        )}

        {editingResource && (
          <ResourceEditModal
            resource={editingResource}
            onClose={() => setEditingResource(null)}
            onSaved={handleResourceSaved}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#59abf0]">
            Resources
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-[#162b3e]">
            Resource Library
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-[#586273]">
            Guides, templates, and walkthroughs for setting up and operating
            RetainOS. Resources are shared globally; dynamic guides inject the
            selected company’s IDs when needed.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[#d6eafb] bg-[#eaf4fe] px-4 py-2 text-xs font-semibold text-[#2b79c4]">
            {company?.name ?? "Company"}{loading ? " loading..." : ""}
          </span>
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setIsCreatingResource(true)}
              className="retainos-focus rounded-full bg-[#162b3e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e3a52]"
            >
              + New resource
            </button>
          )}
        </div>
      </div>

      {resourceError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {resourceError}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {resources.map((resource) => (
          <ResourceCard
            key={resource.id}
            resource={resource}
            isSuperAdmin={isSuperAdmin}
            onEdit={setEditingResource}
            onOpen={(item) => setSelectedResourceId(item.id)}
          />
        ))}
      </section>

      {resources.length === 0 && !resourceError && (
        <div className="rounded-lg border border-[#e4e9f0] bg-white p-8 text-center text-sm text-[#6b7686]">
          No resources found yet.
        </div>
      )}

      {(editingResource || isCreatingResource) && (
        <ResourceEditModal
          resource={editingResource}
          onClose={() => {
            setEditingResource(null);
            setIsCreatingResource(false);
          }}
          onSaved={handleResourceSaved}
        />
      )}
    </div>
  );
}
