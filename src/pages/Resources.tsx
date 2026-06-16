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
type ResourceScope = "retainos_help" | "company";
type ResourceCategory =
  | "all"
  | "setup_onboarding"
  | "working_with_clients"
  | "using_dashboard"
  | "automations";
type IntegrationType =
  | "call_summary_next_steps"
  | "call_ai_transcript"
  | "client_create"
  | "client_update"
  | "course_completion";

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
  scope?: ResourceScope | null;
  company_legacy_id?: string | null;
}

interface IntegrationTokenStatus {
  id: string;
  integration_type: IntegrationType;
  token_prefix: string | null;
  status: "active" | "revoked";
  created_at: string | null;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

const typeLabels: Record<ResourceType, string> = {
  guide: "Guide",
  video: "Video",
  template: "Template",
};

const integrationLabels: Record<IntegrationType, string> = {
  call_summary_next_steps: "Call summary / next steps",
  call_ai_transcript: "Call transcript",
  client_create: "New client webhook",
  client_update: "Client update webhook",
  course_completion: "Course completion",
};

const resourceCategoryLabels: Record<ResourceCategory, string> = {
  all: "All",
  setup_onboarding: "Setup & Onboarding",
  working_with_clients: "Working with Clients",
  using_dashboard: "Using the Dashboard",
  automations: "Automations",
};

const retainOsResourceCategories: ResourceCategory[] = [
  "all",
  "setup_onboarding",
  "working_with_clients",
  "using_dashboard",
  "automations",
];

const resourceCategoryOverrides: Record<string, ResourceCategory> = {
  "invite-team-member": "setup_onboarding",
  "customize-milestones-offers": "setup_onboarding",
  "admin-tools-overview": "setup_onboarding",
  "csv-client-upload": "setup_onboarding",
  "assign-new-clients-csm": "setup_onboarding",
  "zapier-template-walkthrough": "setup_onboarding",
  "retainos-terminology-guide": "setup_onboarding",
  "custom-fields": "setup_onboarding",
  "add-clients-manually": "setup_onboarding",
  "client-details-screen": "working_with_clients",
  "csm-performance-view": "using_dashboard",
  "filter-dashboard-results": "using_dashboard",
  "analyze-performance": "using_dashboard",
  "cohort-analysis": "using_dashboard",
  "tracking-time-to-value": "using_dashboard",
  "milestone-progress-breakdown-by-offer": "using_dashboard",
  "retention-churn-metrics": "using_dashboard",
  "zapier-client-webhook": "automations",
  "course-completion-webhook": "automations",
  "call-ai-transcript-webhook": "automations",
  "client-call-summary-webhook": "automations",
  "client-update-webhook": "automations",
  "webhook-add-new-task": "automations",
  "webhook-update-client-program": "automations",
  "tracking-group-calls": "automations",
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

function resourceScope(resource: ResourceRow): ResourceScope {
  return resource.scope === "company" ? "company" : "retainos_help";
}

function resourceScopeLabel(resource: ResourceRow) {
  return resourceScope(resource) === "company" ? "Company Resources" : "RetainOS Help";
}

function resourceSearchText(resource: ResourceRow) {
  return [
    resource.slug,
    resource.title,
    resource.description,
    resource.content,
    resource.dynamic_key,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function retainOsResourceCategory(resource: ResourceRow): ResourceCategory {
  const override = resourceCategoryOverrides[resource.slug];
  if (override) return override;

  const text = resourceSearchText(resource);
  const dynamicKey = resource.dynamic_key ?? "";

  if (
    dynamicKey.includes("webhook") ||
    text.includes("zapier") ||
    text.includes("webhook") ||
    text.includes("automation") ||
    text.includes("call transcript") ||
    text.includes("course completion")
  ) {
    return "automations";
  }

  if (
    text.includes("dashboard") ||
    text.includes("performance") ||
    text.includes("filter the results") ||
    text.includes("cohort") ||
    text.includes("time to value") ||
    text.includes("ttv") ||
    text.includes("retention") ||
    text.includes("churn") ||
    text.includes("milestone progress breakdown")
  ) {
    return "using_dashboard";
  }

  if (
    text.includes("client detail") ||
    text.includes("client details") ||
    text.includes("quick update") ||
    text.includes("client profile") ||
    text.includes("assigning new clients")
  ) {
    return "working_with_clients";
  }

  return "setup_onboarding";
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
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-[#eaf4fe] px-3 py-1 text-xs font-semibold text-[#2b79c4]">
            {typeLabels[resource.type]}
          </span>
          <span className="rounded-full bg-[#f1f4f9] px-3 py-1 text-xs font-semibold text-[#586273]">
            {resourceScopeLabel(resource)}
          </span>
        </div>
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

function IntegrationParameterTable({
  rows,
}: {
  rows: Array<[string, "Required" | "Optional", string]>;
}) {
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

function PlaceholderEndpointNotice() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
      This guide is for setup planning only. The endpoint is intentionally not
      active yet, so do not turn on a live Zap, n8n flow, Make scenario, or LMS
      automation for this workflow until RetainOS marks it live.
    </div>
  );
}

function IntegrationTokenPanel({
  integrationType,
  tokens,
  isSuperAdmin,
  error,
}: {
  integrationType: IntegrationType;
  tokens: IntegrationTokenStatus[];
  isSuperAdmin: boolean;
  error?: string | null;
}) {
  const activeTokens = tokens.filter(
    (token) =>
      token.integration_type === integrationType &&
      token.status === "active" &&
      (!token.expires_at || new Date(token.expires_at).getTime() > Date.now()),
  );
  const activePrefixes = activeTokens
    .map((token) => token.token_prefix)
    .filter(Boolean)
    .join(", ");

  if (error) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Token status could not load: {error}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#d6eafb] bg-[#f7fbff] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#2b79c4]">
            Integration token
          </p>
          <h3 className="mt-1 text-base font-semibold text-[#162b3e]">
            {integrationLabels[integrationType]}
          </h3>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            activeTokens.length > 0
              ? "bg-[#e7f6f0] text-[#2a9272]"
              : "bg-[#fff7e8] text-[#9a5a12]"
          }`}
        >
          {activeTokens.length > 0 ? "Enabled" : "No active token"}
        </span>
      </div>
      {activeTokens.length > 0 ? (
        <p className="mt-3 text-sm leading-6 text-[#586273]">
          This company has {activeTokens.length} active token
          {activeTokens.length === 1 ? "" : "s"} for this integration
          {activePrefixes ? ` (${activePrefixes})` : ""}. Full tokens are shown
          only once when created. If you need the full value again, revoke this
          token and create a fresh one in Admin Hub.
        </p>
      ) : (
        <p className="mt-3 text-sm leading-6 text-[#586273]">
          {isSuperAdmin
            ? "Create a token in Admin Hub > Company Settings > Integration Tokens, then paste the one-time token into your automation tool."
            : "Ask RetainOS support to enable this integration token for your company."}
        </p>
      )}
      <div className="mt-3 rounded-lg border border-[#e4e9f0] bg-white p-3 text-xs leading-5 text-[#586273]">
        <span className="font-semibold text-[#162b3e]">Remember:</span> Company ID
        routes the request to the right account. The integration token authorizes
        this specific workflow for that company.
      </div>
    </div>
  );
}

function CallTranscriptWebhookGuide({
  endpointUrl,
  companyId,
  bodyTemplate,
  tokenStatus,
  tokenError,
  isSuperAdmin,
}: {
  endpointUrl: string;
  companyId: string;
  bodyTemplate: string;
  tokenStatus: IntegrationTokenStatus[];
  tokenError: string | null;
  isSuperAdmin: boolean;
}) {
  const rows: Array<[string, "Required" | "Optional", string]> = [
    ["companyId", "Required", "Your selected company ID. RetainOS uses this to route the transcript to the right account."],
    ["transcript", "Required", "The full text transcript from Fathom, Otter, Grain, n8n, Zapier, Make, or another transcription source."],
    ["title", "Optional", "Meeting title or call descriptor."],
    ["attendeeEmails", "Optional", "Comma-separated participant emails. Useful for future client matching."],
    ["timestamp", "Optional", "Call date/time. Use ISO format when possible."],
    ["url", "Optional", "Recording, transcript, or meeting URL."],
  ];

  return (
    <>
      <PlaceholderEndpointNotice />
      <IntegrationTokenPanel
        integrationType="call_ai_transcript"
        tokens={tokenStatus}
        error={tokenError}
        isSuperAdmin={isSuperAdmin}
      />

      <Section
        title="1. Future Webhook Endpoint"
        action={<CopyButton value={endpointUrl} />}
      >
        <p className="mb-3 text-sm text-[#586273]">
          This is the planned RetainOS endpoint for transcript intake. Keep it
          as a mapping reference for Fathom, Otter, Grain, Zapier, n8n, Make, or
          another transcription source, but do not enable production sends yet.
        </p>
        <div className="break-all rounded-lg border border-[#e4e9f0] bg-[#f7f9fc] p-4 text-sm font-semibold text-[#162b3e]">
          {endpointUrl}
        </div>
      </Section>

      <Section title="2. Configure Method and Header">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7686]">
              Method
            </p>
            <CodeBlock value="POST" />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7686]">
              Header
            </p>
            <CodeBlock value={"Authorization: Bearer YOUR_COMPANY_INTEGRATION_TOKEN\nContent-Type: application/json"} />
          </div>
        </div>
        <p className="mt-3 text-sm text-[#586273]">
          Tokens can be prepared at the company level, but transcript processing
          will not run until the Call AI transcript intake endpoint is built.
        </p>
      </Section>

      <Section
        title="3. Add Your Company ID"
        action={<CopyButton value={companyId} />}
      >
        <p className="mb-3 text-sm text-[#586273]">
          This ID is unique for the selected company and must be included in every
          future transcript request.
        </p>
        <div className="break-all rounded-lg border border-[#d6eafb] bg-[#eaf4fe] p-4 text-sm font-semibold text-[#162b3e]">
          {companyId}
        </div>
      </Section>

      <Section
        title="4. Copy the Request Body"
        action={<CopyButton value={bodyTemplate} />}
      >
        <p className="mb-3 text-sm text-[#586273]">
          Map each value from your transcription provider or automation tool. Only
          companyId and transcript are required for this planned flow.
        </p>
        <CodeBlock value={bodyTemplate} />
      </Section>

      <Section title="Required and Optional Fields">
        <IntegrationParameterTable rows={rows} />
      </Section>

      <Section title="Future RetainOS Behavior">
        <div className="grid gap-4 text-sm text-[#586273] md:grid-cols-2">
          <div className="rounded-lg border border-[#e4e9f0] bg-[#f7f9fc] p-4">
            <h3 className="font-semibold text-[#162b3e]">Client matching</h3>
            <p className="mt-2">
              RetainOS should match the call to a client from attendee emails when
              possible, store the call date/time, and keep the recording URL.
            </p>
          </div>
          <div className="rounded-lg border border-[#e4e9f0] bg-[#f7f9fc] p-4">
            <h3 className="font-semibold text-[#162b3e]">Manual correction</h3>
            <p className="mt-2">
              When matching fails, the call should stay in a review queue so the
              team can select the right client before any notes or analysis run.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Verify and Troubleshoot">
        <div className="grid gap-4 text-sm text-[#586273] md:grid-cols-2">
          <div className="rounded-lg border border-[#e4e9f0] bg-[#f7f9fc] p-4">
            <h3 className="font-semibold text-[#162b3e]">After sending the webhook</h3>
            <p className="mt-2">
              Once this endpoint is live, transcripts should appear in Call AI
              under New Calls, where the team can review details, link clients,
              and queue processing.
            </p>
          </div>
          <div className="rounded-lg border border-[#e4e9f0] bg-[#f7f9fc] p-4">
            <h3 className="font-semibold text-[#162b3e]">If the call does not appear</h3>
            <p className="mt-2">
              When this endpoint becomes live, check that companyId is exact,
              the token belongs to this company, the JSON payload is valid,
              required fields are present, and attendeeEmails are comma-separated.
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}

function ClientCallSummaryWebhookGuide({
  endpointUrl,
  companyId,
  bodyTemplate,
  tokenStatus,
  tokenError,
  isSuperAdmin,
}: {
  endpointUrl: string;
  companyId: string;
  bodyTemplate: string;
  tokenStatus: IntegrationTokenStatus[];
  tokenError: string | null;
  isSuperAdmin: boolean;
}) {
  const rows: Array<[string, "Required" | "Optional", string]> = [
    ["company_id", "Required", "Your selected company ID. RetainOS uses this to route the summary to the right account."],
    ["client_email", "Required", "The exact client email as it appears in RetainOS."],
    ["summary", "Required", "The summary, notes, or next steps to save for the client."],
    ["started_at", "Optional", "Call date/time. RetainOS uses this as Date of Last Contact when present."],
    ["external_call_id", "Optional", "Provider call ID. Recommended because it prevents duplicate processing when a Zap retries."],
    ["recording_url", "Optional", "Recording, transcript, or meeting URL for history context."],
    ["title", "Optional", "Meeting title or descriptor."],
  ];

  return (
    <>
      <IntegrationTokenPanel
        integrationType="call_summary_next_steps"
        tokens={tokenStatus}
        error={tokenError}
        isSuperAdmin={isSuperAdmin}
      />

      <Section
        title="1. Copy the Webhook Endpoint"
        action={<CopyButton value={endpointUrl} />}
      >
        <p className="mb-3 text-sm text-[#586273]">
          Use this RetainOS endpoint when a call recording or automation tool has
          a summary that should update a specific client.
        </p>
        <div className="break-all rounded-lg border border-[#e4e9f0] bg-[#f7f9fc] p-4 text-sm font-semibold text-[#162b3e]">
          {endpointUrl}
        </div>
      </Section>

      <Section
        title="2. Configure Method and Headers"
        action={
          <CopyButton value={"Authorization: Bearer YOUR_COMPANY_INTEGRATION_TOKEN\nContent-Type: application/json"} />
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7686]">
              Method
            </p>
            <CodeBlock value="POST" />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7686]">
              Headers
            </p>
            <CodeBlock value={"Authorization: Bearer YOUR_COMPANY_INTEGRATION_TOKEN\nContent-Type: application/json"} />
          </div>
        </div>
        <p className="mt-3 text-sm text-[#586273]">
          RetainOS support will provide a token for this company. The token must
          match the company_id in the request and should not be reused across
          other RetainOS accounts.
        </p>
      </Section>

      <Section
        title="3. Add Your Company ID"
        action={<CopyButton value={companyId} />}
      >
        <p className="mb-3 text-sm text-[#586273]">
          This ID is unique for the selected company and must be included in every
          notes update request.
        </p>
        <div className="break-all rounded-lg border border-[#d6eafb] bg-[#eaf4fe] p-4 text-sm font-semibold text-[#162b3e]">
          {companyId}
        </div>
      </Section>

      <Section
        title="4. Copy the Request Body"
        action={<CopyButton value={bodyTemplate} />}
      >
        <p className="mb-3 text-sm text-[#586273]">
          The client email must match exactly. RetainOS updates the client Next
          Steps, sets Date of Last Contact from started_at when provided, and
          preserves the previous values in client history.
        </p>
        <CodeBlock value={bodyTemplate} />
      </Section>

      <Section title="Required Fields">
        <IntegrationParameterTable rows={rows} />
      </Section>

      <Section title="RetainOS Behavior">
        <div className="grid gap-4 text-sm text-[#586273] md:grid-cols-2">
          <div className="rounded-lg border border-[#e4e9f0] bg-[#f7f9fc] p-4">
            <h3 className="font-semibold text-[#162b3e]">Contact and notes update</h3>
            <p className="mt-2">
              RetainOS matches the email to one active client, updates last
              contact from the call timestamp when provided, and saves the summary
              to Next Steps.
            </p>
          </div>
          <div className="rounded-lg border border-[#e4e9f0] bg-[#f7f9fc] p-4">
            <h3 className="font-semibold text-[#162b3e]">History protection</h3>
            <p className="mt-2">
              Previous values are preserved in client history, and unmatched or
              ambiguous emails are stored for review instead of updating the wrong
              client.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Verify and Troubleshoot">
        <div className="grid gap-4 text-sm text-[#586273] md:grid-cols-2">
          <div className="rounded-lg border border-[#e4e9f0] bg-[#f7f9fc] p-4">
            <h3 className="font-semibold text-[#162b3e]">After sending the webhook</h3>
            <p className="mt-2">
              The summary should update the client Next Steps, refresh Date of
              Last Contact, and appear in the client History tab.
            </p>
          </div>
          <div className="rounded-lg border border-[#e4e9f0] bg-[#f7f9fc] p-4">
            <h3 className="font-semibold text-[#162b3e]">If the client does not update</h3>
            <p className="mt-2">
              Check company_id, the company-specific integration token, exact
              client_email, valid JSON formatting, and that summary is present
              before retrying.
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}

function ClientUpdateWebhookGuide({
  endpointUrl,
  companyId,
  bodyTemplate,
  tokenStatus,
  tokenError,
  isSuperAdmin,
}: {
  endpointUrl: string;
  companyId: string;
  bodyTemplate: string;
  tokenStatus: IntegrationTokenStatus[];
  tokenError: string | null;
  isSuperAdmin: boolean;
}) {
  const rows: Array<[string, "Required" | "Optional", string]> = [
    ["company_id", "Required", "Your selected company ID. The submitted token must belong to this same company."],
    ["client_email", "Required", "Exact client email for matching. If matching is unclear, the event goes to the Integration Review Queue."],
    ["next_steps", "Optional", "Replace the client's Next Steps."],
    ["notes", "Optional", "History context or note body for the webhook update."],
    ["last_contact", "Optional", "Date or timestamp for Date of Last Contact."],
    ["next_contact", "Optional", "Date or timestamp for Date of Next Contact."],
    ["assigned_to", "Optional", "Active team member ID, legacy ID, or email."],
    ["offer_id", "Optional", "Active offer ID for the selected company."],
    ["external_event_id", "Optional", "External event ID for duplicate protection."],
  ];

  return (
    <>
      <IntegrationTokenPanel
        integrationType="client_update"
        tokens={tokenStatus}
        error={tokenError}
        isSuperAdmin={isSuperAdmin}
      />

      <Section
        title="1. Copy the Webhook Endpoint"
        action={<CopyButton value={endpointUrl} />}
      >
        <p className="mb-3 text-sm text-[#586273]">
          Use this endpoint when a CRM, automation, or call tool needs to update
          an existing app-owned client record.
        </p>
        <div className="break-all rounded-lg border border-[#e4e9f0] bg-[#f7f9fc] p-4 text-sm font-semibold text-[#162b3e]">
          {endpointUrl}
        </div>
      </Section>

      <Section
        title="2. Configure Method and Headers"
        action={
          <CopyButton value={"Authorization: Bearer YOUR_COMPANY_INTEGRATION_TOKEN\nContent-Type: application/json"} />
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7686]">
              Method
            </p>
            <CodeBlock value="POST" />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7686]">
              Headers
            </p>
            <CodeBlock value={"Authorization: Bearer YOUR_COMPANY_INTEGRATION_TOKEN\nContent-Type: application/json"} />
          </div>
        </div>
      </Section>

      <Section
        title="3. Add Your Company ID"
        action={<CopyButton value={companyId} />}
      >
        <p className="mb-3 text-sm text-[#586273]">
          This ID is unique for the selected company and must be included in every
          client update request.
        </p>
        <div className="break-all rounded-lg border border-[#d6eafb] bg-[#eaf4fe] p-4 text-sm font-semibold text-[#162b3e]">
          {companyId}
        </div>
      </Section>

      <Section
        title="4. Copy the Request Body"
        action={<CopyButton value={bodyTemplate} />}
      >
        <p className="mb-3 text-sm text-[#586273]">
          This V1 endpoint updates a narrow safe set of client fields. Program
          status changes stay in RetainOS lifecycle workflows.
        </p>
        <CodeBlock value={bodyTemplate} />
      </Section>

      <Section title="Supported Fields">
        <IntegrationParameterTable rows={rows} />
      </Section>
    </>
  );
}

function CourseCompletionWebhookGuide({
  endpointUrl,
  companyId,
  bodyTemplate,
  tokenStatus,
  tokenError,
  isSuperAdmin,
}: {
  endpointUrl: string;
  companyId: string;
  bodyTemplate: string;
  tokenStatus: IntegrationTokenStatus[];
  tokenError: string | null;
  isSuperAdmin: boolean;
}) {
  const rows: Array<[string, "Required" | "Optional", string]> = [
    ["company_id", "Required", "Your selected company ID. RetainOS uses this to route the completion event."],
    ["client_email", "Required", "Exact client email for matching."],
    ["course_name", "Required", "Course, module, or curriculum name."],
    ["completion_percentage", "Optional", "Completion percentage from the LMS."],
    ["completed_at", "Optional", "Date/time the completion happened."],
    ["course_id", "Optional", "External LMS course ID."],
    ["external_event_id", "Optional", "External event ID for duplicate protection."],
  ];

  return (
    <>
      <PlaceholderEndpointNotice />
      <IntegrationTokenPanel
        integrationType="course_completion"
        tokens={tokenStatus}
        error={tokenError}
        isSuperAdmin={isSuperAdmin}
      />

      <Section
        title="1. Copy the Future Webhook Endpoint"
        action={<CopyButton value={endpointUrl} />}
      >
        <p className="mb-3 text-sm text-[#586273]">
          This guide defines the intended LMS completion payload. The endpoint is
          not live yet; use it for setup planning and field mapping before
          RetainOS turns this workflow on.
        </p>
        <div className="break-all rounded-lg border border-[#e4e9f0] bg-[#f7f9fc] p-4 text-sm font-semibold text-[#162b3e]">
          {endpointUrl}
        </div>
      </Section>

      <Section title="2. Future Method and Headers">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7686]">
              Method
            </p>
            <CodeBlock value="POST" />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7686]">
              Headers
            </p>
            <CodeBlock value={"Authorization: Bearer YOUR_COMPANY_INTEGRATION_TOKEN\nContent-Type: application/json"} />
          </div>
        </div>
        <p className="mt-3 text-sm text-[#586273]">
          Tokens can be prepared at the company level, but LMS completion
          processing will not run until the course completion endpoint is built.
        </p>
      </Section>

      <Section
        title="3. Add Your Company ID"
        action={<CopyButton value={companyId} />}
      >
        <div className="break-all rounded-lg border border-[#d6eafb] bg-[#eaf4fe] p-4 text-sm font-semibold text-[#162b3e]">
          {companyId}
        </div>
      </Section>

      <Section
        title="4. Copy the Request Body"
        action={<CopyButton value={bodyTemplate} />}
      >
        <p className="mb-3 text-sm text-[#586273]">
          Map these fields from your LMS, course platform, Zapier, n8n, or Make.
          This payload is the planned shape, not an active production endpoint.
        </p>
        <CodeBlock value={bodyTemplate} />
      </Section>

      <Section title="Planned Fields">
        <IntegrationParameterTable rows={rows} />
      </Section>
    </>
  );
}

function ResourceEditModal({
  resource,
  companyLegacyId,
  defaultScope = "retainos_help",
  onClose,
  onSaved,
}: {
  resource: ResourceRow | null;
  companyLegacyId: string;
  defaultScope?: ResourceScope;
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
  const [scope, setScope] = useState<ResourceScope>(
    resource ? resourceScope(resource) : defaultScope,
  );
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
          scope,
          companyLegacyId: scope === "company" ? companyLegacyId : null,
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
              RetainOS Help is shared across companies. Company Resources only
              show inside the selected company workspace.
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
              Library
            </span>
            <select
              value={scope}
              disabled={Boolean(resource?.is_dynamic)}
              onChange={(event) => setScope(event.target.value as ResourceScope)}
              className="retainos-focus w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm disabled:bg-[#f7f9fc] disabled:text-[#6b7686]"
            >
              <option value="retainos_help">RetainOS Help</option>
              <option value="company">Company Resources for selected company</option>
            </select>
            {resource?.is_dynamic ? (
              <p className="text-xs text-[#6b7686]">
                Dynamic setup guides stay in RetainOS Help so every company can use
                the same instructions with their own IDs.
              </p>
            ) : null}
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
  const [activeLibrary, setActiveLibrary] = useState<ResourceScope>("retainos_help");
  const [activeRetainOsCategory, setActiveRetainOsCategory] =
    useState<ResourceCategory>("all");
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [editingResource, setEditingResource] = useState<ResourceRow | null>(null);
  const [isCreatingResource, setIsCreatingResource] = useState(false);
  const [company, setCompany] = useState<CompanyRow | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMemberOption[]>([]);
  const [offers, setOffers] = useState<OfferOption[]>([]);
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [integrationTokens, setIntegrationTokens] = useState<IntegrationTokenStatus[]>([]);
  const [integrationTokenError, setIntegrationTokenError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resourceError, setResourceError] = useState<string | null>(null);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/zapier-create-client`;
  const callTranscriptWebhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-call-transcript`;
  const clientCallSummaryWebhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-client-call-summary`;
  const clientUpdateWebhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-update-client`;
  const courseCompletionWebhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-course-completion`;
  const zapierClientCreateWebhookUrl = effectiveCompanyId
    ? `${webhookUrl}?company_id=${encodeURIComponent(effectiveCompanyId)}`
    : `${webhookUrl}?company_id={{company_id}}`;
  const selectedResource = resources.find((resource) => resource.id === selectedResourceId);
  const retainOsHelpResources = resources.filter(
    (resource) => resourceScope(resource) === "retainos_help",
  );
  const companyResources = resources.filter(
    (resource) => resourceScope(resource) === "company",
  );
  const retainOsCategoryCounts = retainOsResourceCategories.reduce(
    (counts, category) => {
      if (category === "all") {
        counts[category] = retainOsHelpResources.length;
        return counts;
      }
      counts[category] = retainOsHelpResources.filter(
        (resource) => retainOsResourceCategory(resource) === category,
      ).length;
      return counts;
    },
    {} as Record<ResourceCategory, number>,
  );
  const filteredRetainOsHelpResources =
    activeRetainOsCategory === "all"
      ? retainOsHelpResources
      : retainOsHelpResources.filter(
          (resource) => retainOsResourceCategory(resource) === activeRetainOsCategory,
        );
  const visibleResources =
    activeLibrary === "company" ? companyResources : filteredRetainOsHelpResources;

  const bodyTemplate = useMemo(
    () =>
      JSON.stringify(
        {
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

  const callTranscriptBodyTemplate = useMemo(
    () =>
      JSON.stringify(
        {
          companyId: effectiveCompanyId || "{{companyId}}",
          title: "{{meeting_title}}",
          attendeeEmails: "{{attendee_emails}}",
          transcript: "{{full_transcript}}",
          timestamp: "{{call_timestamp}}",
          url: "{{recording_or_transcript_url}}",
        },
        null,
        2,
      ),
    [effectiveCompanyId],
  );

  const clientCallSummaryBodyTemplate = useMemo(
    () =>
      JSON.stringify(
        {
          company_id: effectiveCompanyId || "{{company_id}}",
          provider: "fathom",
          external_call_id: "{{provider_call_id}}",
          client_email: "{{client_email}}",
          summary: "{{call_summary_or_next_steps}}",
          started_at: "{{call_started_at}}",
          recording_url: "{{recording_url}}",
          title: "{{meeting_title}}",
        },
        null,
        2,
      ),
    [effectiveCompanyId],
  );

  const clientUpdateBodyTemplate = useMemo(
    () =>
      JSON.stringify(
        {
          company_id: effectiveCompanyId || "{{company_id}}",
          provider: "zapier",
          external_event_id: "{{external_event_id}}",
          client_email: "{{client_email}}",
          next_steps: "{{next_steps}}",
          next_contact: "{{next_contact}}",
          notes: "{{notes}}",
        },
        null,
        2,
      ),
    [effectiveCompanyId],
  );

  const courseCompletionBodyTemplate = useMemo(
    () =>
      JSON.stringify(
        {
          company_id: effectiveCompanyId || "{{company_id}}",
          provider: "lms",
          external_event_id: "{{external_event_id}}",
          client_email: "{{client_email}}",
          course_id: "{{course_id}}",
          course_name: "{{course_name}}",
          completion_percentage: "{{completion_percentage}}",
          completed_at: "{{completed_at}}",
        },
        null,
        2,
      ),
    [effectiveCompanyId],
  );

  async function loadResources() {
    const query = supabase
      .from("resources")
      .select(
        "id, slug, title, type, description, content, loom_embed_url, status, is_dynamic, dynamic_key, sort_order, scope, company_legacy_id",
      )
      .neq("status", "archived")
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true });
    const { data, error } = await query;
    let resourceRows = (data ?? []) as ResourceRow[];
    let loadError = error;

    if (error && /scope|company_legacy_id/i.test(error.message)) {
      const fallback = await supabase
        .from("resources")
        .select(
          "id, slug, title, type, description, content, loom_embed_url, status, is_dynamic, dynamic_key, sort_order",
        )
        .neq("status", "archived")
        .order("sort_order", { ascending: true })
        .order("title", { ascending: true });
      resourceRows = (fallback.data ?? []) as ResourceRow[];
      loadError = fallback.error;
    }

    if (loadError) {
      setResourceError(loadError.message);
      return;
    }

    const visibleRows = resourceRows.filter((resource) => {
      if (!isSuperAdmin && resource.status !== "published") return false;
      const scope = resourceScope(resource);
      if (scope === "retainos_help") return true;
      return resource.company_legacy_id === effectiveCompanyId;
    });
    setResources(visibleRows);
    setResourceError(null);
  }

  useEffect(() => {
    void loadResources();
  }, [effectiveCompanyId, isSuperAdmin]);

  useEffect(() => {
    let cancelled = false;

    async function loadIntegrationTokens() {
      setIntegrationTokens([]);
      setIntegrationTokenError(null);

      if (!isSuperAdmin || !company?.id || company.migration_status === "glide_mirror") {
        return;
      }

      const { data, error } = await supabase.functions.invoke("manage-integration-token", {
        body: {
          action: "list",
          companyId: company.id,
        },
      });

      if (cancelled) return;
      if (error) {
        setIntegrationTokenError(error.message);
        return;
      }
      if (data?.error) {
        setIntegrationTokenError(data.error);
        return;
      }
      setIntegrationTokens((data?.tokens ?? []) as IntegrationTokenStatus[]);
    }

    void loadIntegrationTokens();
    return () => {
      cancelled = true;
    };
  }, [company?.id, company?.migration_status, isSuperAdmin]);

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
    const isCallTranscriptGuide = selectedResource.dynamic_key === "call_transcript_webhook";
    const isClientCallSummaryGuide =
      selectedResource.dynamic_key === "client_call_summary_webhook";
    const isClientUpdateGuide = selectedResource.dynamic_key === "client_update_webhook";
    const isCourseCompletionGuide =
      selectedResource.dynamic_key === "course_completion_webhook";

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
            <IntegrationTokenPanel
              integrationType="client_create"
              tokens={integrationTokens}
              error={integrationTokenError}
              isSuperAdmin={isSuperAdmin}
            />

            <Section
              title="1. Copy the Zapier Webhook URL"
              action={<CopyButton value={zapierClientCreateWebhookUrl} />}
            >
              <p className="mb-3 text-sm text-[#586273]">
                In Zapier, use Webhooks by Zapier and send a POST request to this
                URL. The company ID is included in the URL because Zapier can nest
                body fields in a few different ways.
              </p>
              <div className="break-all rounded-lg border border-[#e4e9f0] bg-[#f7f9fc] p-4 text-sm font-semibold text-[#162b3e]">
                {zapierClientCreateWebhookUrl}
              </div>
            </Section>

            <Section
              title="2. Confirm Your Company ID"
              action={<CopyButton value={effectiveCompanyId} />}
            >
              <p className="mb-3 text-sm text-[#586273]">
                This ID is unique for the selected company. It is already included
                in the webhook URL above, and RetainOS uses it to route the client
                to the right account.
              </p>
              <div className="break-all rounded-lg border border-[#d6eafb] bg-[#eaf4fe] p-4 text-sm font-semibold text-[#162b3e]">
                {effectiveCompanyId}
              </div>
            </Section>

            <Section
              title="3. Configure Headers"
              action={
                <CopyButton value={"Authorization: Bearer YOUR_COMPANY_INTEGRATION_TOKEN\nContent-Type: application/json"} />
              }
            >
              <p className="mb-3 text-sm text-[#586273]">
                Use the company-specific New Client Webhook token. Do not paste
                this token into public docs or reuse it across other companies.
              </p>
              <CodeBlock value={"Authorization: Bearer YOUR_COMPANY_INTEGRATION_TOKEN\nContent-Type: application/json"} />
            </Section>

            <Section
              title="4. Add Client Information"
              action={<CopyButton value={bodyTemplate} />}
            >
              <p className="mb-3 text-sm text-[#586273]">
                Copy this JSON body into Zapier and map the dynamic fields from your
                CRM, checkout, form, or automation tool. Leave company routing in
                the webhook URL and keep client-specific values in the body.
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
                    Check the company_id in the URL, client_name, client_email, the
                    company integration token, and the Zapier request history.
                    Archetype must be doer, controller, worrier, or follower when
                    included.
                  </p>
                </div>
              </div>
            </Section>
          </>
        ) : isCallTranscriptGuide ? (
          <CallTranscriptWebhookGuide
            endpointUrl={callTranscriptWebhookUrl}
            companyId={effectiveCompanyId}
            bodyTemplate={callTranscriptBodyTemplate}
            tokenStatus={integrationTokens}
            tokenError={integrationTokenError}
            isSuperAdmin={isSuperAdmin}
          />
        ) : isClientCallSummaryGuide ? (
          <ClientCallSummaryWebhookGuide
            endpointUrl={clientCallSummaryWebhookUrl}
            companyId={effectiveCompanyId}
            bodyTemplate={clientCallSummaryBodyTemplate}
            tokenStatus={integrationTokens}
            tokenError={integrationTokenError}
            isSuperAdmin={isSuperAdmin}
          />
        ) : isClientUpdateGuide ? (
          <ClientUpdateWebhookGuide
            endpointUrl={clientUpdateWebhookUrl}
            companyId={effectiveCompanyId}
            bodyTemplate={clientUpdateBodyTemplate}
            tokenStatus={integrationTokens}
            tokenError={integrationTokenError}
            isSuperAdmin={isSuperAdmin}
          />
        ) : isCourseCompletionGuide ? (
          <CourseCompletionWebhookGuide
            endpointUrl={courseCompletionWebhookUrl}
            companyId={effectiveCompanyId}
            bodyTemplate={courseCompletionBodyTemplate}
            tokenStatus={integrationTokens}
            tokenError={integrationTokenError}
            isSuperAdmin={isSuperAdmin}
          />
        ) : (
          <GenericResourceDetail resource={selectedResource} />
        )}

        {editingResource && (
          <ResourceEditModal
            resource={editingResource}
            companyLegacyId={effectiveCompanyId}
            defaultScope={activeLibrary}
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
            Guides, templates, walkthroughs, SOPs, and client-team links. RetainOS
            Help is shared across companies; Company Resources stay scoped to the
            selected company.
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

      <div className="flex flex-wrap gap-2 rounded-lg border border-[#e4e9f0] bg-white p-2 shadow-sm">
        <button
          type="button"
          onClick={() => {
            setActiveLibrary("retainos_help");
          }}
          className={`retainos-focus rounded-full px-4 py-2 text-sm font-semibold ${
            activeLibrary === "retainos_help"
              ? "bg-[#162b3e] text-white"
              : "text-[#586273] hover:bg-[#f7f9fc]"
          }`}
        >
          RetainOS Help ({retainOsHelpResources.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveLibrary("company");
          }}
          className={`retainos-focus rounded-full px-4 py-2 text-sm font-semibold ${
            activeLibrary === "company"
              ? "bg-[#162b3e] text-white"
              : "text-[#586273] hover:bg-[#f7f9fc]"
          }`}
        >
          Company Resources ({companyResources.length})
        </button>
      </div>

      {activeLibrary === "retainos_help" ? (
        <div className="flex flex-wrap gap-2">
          {retainOsResourceCategories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setActiveRetainOsCategory(category)}
              className={`retainos-focus rounded-full border px-4 py-2 text-sm font-semibold ${
                activeRetainOsCategory === category
                  ? "border-[#162b3e] bg-[#162b3e] text-white"
                  : "border-[#d5dce8] bg-white text-[#586273] hover:border-[#59abf0] hover:text-[#2b79c4]"
              }`}
            >
              {resourceCategoryLabels[category]} ({retainOsCategoryCounts[category]})
            </button>
          ))}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visibleResources.map((resource) => (
          <ResourceCard
            key={resource.id}
            resource={resource}
            isSuperAdmin={isSuperAdmin}
            onEdit={setEditingResource}
            onOpen={(item) => setSelectedResourceId(item.id)}
          />
        ))}
      </section>

      {visibleResources.length === 0 && !resourceError && (
        <div className="rounded-lg border border-[#e4e9f0] bg-white p-8 text-center text-sm text-[#6b7686]">
          {activeLibrary === "company"
            ? "No company resources found yet. Add SOP links, Loom walkthroughs, or Google Drive folders for this company."
            : activeRetainOsCategory === "all"
              ? "No RetainOS Help resources found yet."
              : `No RetainOS Help resources found for ${resourceCategoryLabels[activeRetainOsCategory]}. Try All or add a resource for this category.`}
        </div>
      )}

      {(editingResource || isCreatingResource) && (
        <ResourceEditModal
          resource={editingResource}
          companyLegacyId={effectiveCompanyId}
          defaultScope={activeLibrary}
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
