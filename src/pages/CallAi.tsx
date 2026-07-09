import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAccountContext } from "../lib/accountContext.tsx";
import { supabase } from "../lib/supabase.ts";

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

const CALL_AI_INTEGRATION_TYPES = [
  "call_summary_next_steps",
  "call_ai_transcript",
];

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

function integrationValue(event: IntegrationIntakeEventRow, keys: string[]) {
  for (const source of [event.metadata, event.payload]) {
    for (const key of keys) {
      const value = source?.[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}

function integrationSearchTerm(value: string) {
  return value.trim().replace(/[,%]/g, " ");
}

function normalizeClientStatus(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

function isMatchableClient(client: IntegrationReviewClientOption) {
  const status = normalizeClientStatus(client.program_status_value);
  return status !== "off-boarded" && status !== "offboarded";
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
  return detail ? `${label} - ${detail}` : label;
}

export function CallAi() {
  const { effectiveCompanyId, capabilities, role } = useAccountContext();
  const [companyAppId, setCompanyAppId] = useState("");
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<IntegrationIntakeEventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [reviewAction, setReviewAction] = useState<string | null>(null);
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

  const canReview = capabilities.canAccessCallAi && role !== "csm";

  useEffect(() => {
    let cancelled = false;

    async function loadEvents() {
      if (!effectiveCompanyId || !canReview) {
        setLoading(false);
        setCompanyAppId("");
        setEvents([]);
        return;
      }

      setLoading(true);
      setError(null);

      const { data: company, error: companyError } = await supabase
        .from("companies")
        .select("id, migration_status")
        .eq("legacy_glide_row_id", effectiveCompanyId)
        .in("migration_status", ["pilot", "migrated"])
        .maybeSingle();

      if (cancelled) return;

      if (companyError) {
        setError(companyError.message);
        setCompanyAppId("");
        setEvents([]);
        setLoading(false);
        return;
      }

      if (!company?.id) {
        setCompanyAppId("");
        setEvents([]);
        setLoading(false);
        return;
      }

      setCompanyAppId(company.id);

      const { data, error: eventsError } = await supabase
        .from("integration_intake_events")
        .select(
          "id, integration_type, provider, external_event_id, status, match_status, error_message, payload, metadata, created_at, updated_at",
        )
        .eq("company_id", company.id)
        .in("integration_type", CALL_AI_INTEGRATION_TYPES)
        .in("status", ["needs_review", "failed"])
        .order("created_at", { ascending: false })
        .limit(100);

      if (cancelled) return;

      if (eventsError) {
        setError(eventsError.message);
        setEvents([]);
      } else {
        setEvents((data ?? []) as IntegrationIntakeEventRow[]);
      }
      setLoading(false);
    }

    void loadEvents();
    return () => {
      cancelled = true;
    };
  }, [canReview, effectiveCompanyId, reloadKey]);

  const stats = useMemo(() => {
    const unmatched = events.filter((event) => event.match_status === "unmatched")
      .length;
    const ambiguous = events.filter((event) => event.match_status === "ambiguous")
      .length;
    const failed = events.filter((event) => event.status === "failed").length;
    return { unmatched, ambiguous, failed };
  }, [events]);

  async function handleClientSearch(eventId: string) {
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
      .eq("company_glide_row_id", effectiveCompanyId)
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
      isMatchableClient,
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

  async function handleReviewAction(
    eventId: string,
    action: "match" | "retry" | "ignore",
  ) {
    if (!canReview || reviewAction) return;
    const selectedClientId = eventClientSelections[eventId] ?? "";
    if (action === "match" && !selectedClientId) {
      setError("Choose a client before matching this event.");
      setSuccess(null);
      return;
    }

    setReviewAction(`${eventId}:${action}`);
    setError(null);
    setSuccess(null);
    const { data, error: invokeError } = await supabase.functions.invoke(
      "manage-integration-review",
      {
        body: {
          action,
          companyLegacyId: effectiveCompanyId,
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

    setSuccess("Call AI event updated.");
    setEventClientSelections((current) => {
      const next = { ...current };
      delete next[eventId];
      return next;
    });
    setReloadKey((key) => key + 1);
  }

  if (!canReview) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">You do not have access here</h1>
        <p className="mt-2 text-sm text-gray-600">
          Call AI review is available for Directors, Support, and Super Admins.
        </p>
      </div>
    );
  }

  if (!effectiveCompanyId) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center text-amber-900">
        Select a company before opening Call AI.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#2b79c4]">
            Operations
          </p>
          <h1 className="mt-1 text-3xl font-bold text-[#162b3e]">Call AI</h1>
          <p className="mt-2 max-w-3xl text-sm text-[#667085]">
            Reconcile unmatched Fathom and call-summary recordings so the right
            client profile receives the notes, recording, and next steps.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setReloadKey((key) => key + 1)}
          className="retainos-button-secondary w-fit px-4 py-2 text-sm"
        >
          Refresh queue
        </button>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-[#e4e9f0] bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">
            Open events
          </p>
          <p className="mt-2 text-3xl font-bold text-[#162b3e]">{events.length}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-amber-800">
            Unmatched
          </p>
          <p className="mt-2 text-3xl font-bold text-amber-900">{stats.unmatched}</p>
        </div>
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-orange-800">
            Ambiguous
          </p>
          <p className="mt-2 text-3xl font-bold text-orange-900">{stats.ambiguous}</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-red-800">
            Failed
          </p>
          <p className="mt-2 text-3xl font-bold text-red-900">{stats.failed}</p>
        </div>
      </section>

      <section className="rounded-lg border border-[#d6eafb] bg-[#f7fbff] p-4">
        <h2 className="text-sm font-semibold text-[#162b3e]">
          More Call AI functions will be available shortly.
        </h2>
        <p className="mt-1 text-sm text-[#667085]">
          For now, this page is focused on unmatched call recordings and summary
          webhooks that need human reconciliation.
        </p>
      </section>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      {!companyAppId && !loading ? (
        <div className="rounded-lg border border-[#e4e9f0] bg-white p-6 text-sm text-[#667085]">
          Call AI reconciliation is available once this company is running on
          RetainOS app-owned data.
        </div>
      ) : (
        <section className="overflow-hidden rounded-lg border border-[#e4e9f0] bg-white shadow-sm">
          <div className="border-b border-[#e4e9f0] px-5 py-4">
            <h2 className="text-base font-semibold text-[#101828]">
              Unmatched recordings
            </h2>
            <p className="mt-1 text-sm text-[#667085]">
              Match each event to the correct client, retry automatic matching,
              or ignore duplicate/noise events.
            </p>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#59abf0]" />
            </div>
          ) : events.length === 0 ? (
            <div className="px-5 py-8 text-sm text-[#667085]">
              No unmatched or ambiguous Call AI events need review.
            </div>
          ) : (
            <div className="divide-y divide-[#e4e9f0]">
              {events.map((event) => {
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
                  <article key={event.id} className="px-5 py-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-[#101828]">
                            {title || clientEmail || "Call AI event"}
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
                        <p className="mt-2 text-sm text-[#344054]">
                          {event.error_message ||
                            "Needs manual review before writing."}
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

                    <dl className="mt-4 grid gap-3 md:grid-cols-3">
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
                                  void handleClientSearch(event.id);
                                }
                              }}
                              className="block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#101828] shadow-sm disabled:bg-[#f7f9fc] disabled:text-[#667085]"
                            />
                            <button
                              type="button"
                              disabled={actionBusy || clientSearchLoading}
                              onClick={() => void handleClientSearch(event.id)}
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
                              handleReviewAction(event.id, "match")
                            }
                            className="retainos-button-secondary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Match to client
                          </button>
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() =>
                              handleReviewAction(event.id, "retry")
                            }
                            className="retainos-button-secondary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Retry apply
                          </button>
                        </div>
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => handleReviewAction(event.id, "ignore")}
                          className="w-fit rounded-full border border-[#d0d5dd] bg-white px-4 py-2 text-sm font-semibold text-[#586273] shadow-sm transition hover:border-[#98a2b3] hover:text-[#101828] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Ignore
                        </button>
                      </div>
                    </div>

                    {selectedClientId ? (
                      <Link
                        to={`/clients/${selectedClientId}`}
                        className="mt-3 inline-flex text-sm font-semibold text-[#2b79c4] hover:text-[#162b3e]"
                      >
                        Open selected client
                      </Link>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
