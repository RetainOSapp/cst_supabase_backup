import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase.ts";

type Sentiment =
  | "positive"
  | "neutral"
  | "negative"
  | "insufficient_evidence";

interface AnalysisSummary {
  schemaVersion: string | null;
  callType: string | null;
  titleLabel: string | null;
  summary: string | null;
  clientSentiment: Sentiment | null;
  teamMemberSentiment: Sentiment | null;
  callScore: number | null;
}

interface CallRow {
  id: string;
  client_id: string | null;
  assigned_member_id: string | null;
  provider: string;
  title: string;
  occurred_at: string;
  duration_seconds: number | null;
  recording_url: string | null;
  share_url: string | null;
  match_status: string;
  processing_status: string;
  match_reason: string | null;
  last_error_category: string | null;
  client: {
    id: string;
    client_name: string | null;
    client_business: string | null;
    client_email: string | null;
  } | null;
  assignedMember: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  analysis: AnalysisSummary | null;
}

interface Metrics {
  totalCalls: number;
  averageScore: number | null;
  clientSentiment: Record<Sentiment, number>;
  teamMemberSentiment: Record<Sentiment, number>;
  needsReconciliation: number;
}

interface StructuredAnalysis {
  schema_version: string;
  call_type: string;
  title_label: string;
  summary: string;
  client_sentiment: {
    label: Sentiment;
    confidence: string;
    evidence: Evidence[];
  };
  team_member_sentiment: {
    label: Sentiment;
    confidence: string;
    evidence: Evidence[];
  };
  negative_signals: Signal[];
  positive_signals: Signal[];
  client_pain_points: Array<{ summary: string; evidence: Evidence[] }>;
  next_steps: Array<{
    owner: string;
    action: string;
    due_date: string;
    evidence: Evidence[];
  }>;
  call_score: {
    total: number;
    agenda: ScoreDimension;
    team_member_energy: ScoreDimension;
    recap: ScoreDimension;
    action_plan: ScoreDimension;
  };
  archetype: {
    label: string;
    confidence: string;
    evidence: Evidence[];
  };
}

interface Evidence {
  timestamp: string;
  speaker_role: string;
  quote: string;
}

interface Signal {
  label: string;
  summary: string;
  emotions: string[];
  evidence: Evidence[];
}

interface ScoreDimension {
  score: number;
  rationale: string;
  evidence: Evidence[];
}

interface DetailResponse {
  call: CallRow;
  transcript: {
    transcript_text: string;
    character_count: number;
    source_format: string;
  } | null;
  participants: Array<{
    id: string;
    name: string | null;
    email_normalized: string | null;
    participant_kind: string;
    provider_role: string;
  }>;
  runs: Array<{
    id: string;
    prompt_definition_id: string;
    prompt_version: string;
    run_kind: string;
    status: string;
    model: string | null;
    result_schema_version: string | null;
    result_json: StructuredAnalysis | null;
    result_text: string | null;
    error_category: string | null;
    created_at: string;
    completed_at: string | null;
  }>;
  onDemandPrompts: Array<{
    id: string;
    prompt_key: string;
    name: string;
    version: string;
    scope: string;
  }>;
}

interface Access {
  role: string;
  canReconcile: boolean;
  canUpload: boolean;
  canRun: boolean;
}

interface UploadOptions {
  clients: Array<{
    id: string;
    client_name: string | null;
    client_business: string | null;
    client_email: string | null;
    program_status_value: string | null;
  }>;
  members: Array<{
    id: string;
    name: string | null;
    email: string | null;
    role: string | null;
  }>;
}

export interface CallIntelligenceDevelopmentFixture {
  calls: CallRow[];
  metrics: Metrics;
  access: Access;
  uploadOptions?: UploadOptions;
  details: Record<string, DetailResponse>;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function currentLocalDateTime() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDuration(seconds: number | null) {
  if (seconds == null) return "--";
  return `${Math.round(seconds / 60)} min`;
}

function clientLabel(call: CallRow) {
  return (
    call.client?.client_name ||
    call.client?.client_business ||
    call.client?.client_email ||
    "Unmatched client"
  );
}

function clientDescriptor(call: CallRow) {
  const person = call.client?.client_name || call.client?.client_email;
  const company = call.client?.client_business;
  if (person && company && person !== company) return `${person} · ${company}`;
  return person || company || "Unmatched client";
}

function formatCallType(value: string | null | undefined) {
  if (!value) return "Call Intelligence";
  const labels: Record<string, string> = {
    sales_discovery: "Sales / Discovery",
    quarterly_review: "Quarterly review",
    onboarding: "Onboarding",
  };
  return labels[value] || value.replaceAll("_", " ");
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "--";
}

const sentimentStyles: Record<Sentiment, string> = {
  positive: "border-emerald-200 bg-emerald-50 text-emerald-700",
  neutral: "border-amber-200 bg-amber-50 text-amber-700",
  negative: "border-red-200 bg-red-50 text-red-700",
  insufficient_evidence: "border-slate-200 bg-slate-50 text-slate-600",
};

function SentimentBadge({ value }: { value: Sentiment | null | undefined }) {
  if (!value) return <span className="text-sm text-[#98a2b3]">Pending</span>;
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${sentimentStyles[value]}`}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}

function StatusBadge({ value }: { value: string }) {
  const style =
    value === "completed" || value === "succeeded"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : value === "failed" || value === "cancelled"
        ? "border-red-200 bg-red-50 text-red-700"
        : value === "needs_reconciliation"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-blue-200 bg-blue-50 text-blue-700";
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${style}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}

function EvidenceList({
  evidence,
  onSelect,
}: {
  evidence: Evidence[];
  onSelect?: (evidence: Evidence) => void;
}) {
  if (!evidence?.length) return null;
  return (
    <ul className="mt-2 space-y-1 text-xs text-[#667085]">
      {evidence.map((item, index) => (
        <li key={`${item.timestamp}-${index}`}>
          <button
            type="button"
            onClick={() => onSelect?.(item)}
            className="rounded text-left leading-5 transition hover:bg-[#eef7ff] hover:text-[#1f5f96] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#59abf0]"
            title="Show this evidence in the transcript"
          >
            {item.timestamp ? `${item.timestamp} · ` : ""}
            <span className="capitalize">{item.speaker_role.replaceAll("_", " ")}</span>
            {item.quote ? ` — “${item.quote}”` : ""}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function CallIntelligence({
  companyId,
  onShowReconciliation,
  developmentFixture,
}: {
  companyId: string;
  onShowReconciliation: () => void;
  developmentFixture?: CallIntelligenceDevelopmentFixture;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCallId = searchParams.get("call");
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [uploadOptions, setUploadOptions] = useState<UploadOptions>({
    clients: [],
    members: [],
  });
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [clientFilter, setClientFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [sentimentFilter, setSentimentFilter] = useState("all");
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    title: "",
    occurredAt: currentLocalDateTime(),
    durationMinutes: "",
    clientId: "",
    assignedMemberId: "",
    transcript: "",
  });
  const transcriptRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      if (developmentFixture) {
        setCalls(developmentFixture.calls);
        setMetrics(developmentFixture.metrics);
        setAccess(developmentFixture.access);
        setUploadOptions(
          developmentFixture.uploadOptions ?? { clients: [], members: [] },
        );
        setLoading(false);
        return;
      }
      const { data, error: invokeError } = await supabase.functions.invoke(
        "manage-call-intelligence",
        { body: { action: "list", companyId, limit: 200 } },
      );
      if (cancelled) return;
      if (invokeError || data?.error) {
        setError(
          data?.error ||
            invokeError?.message ||
            "Call Intelligence could not be loaded.",
        );
        setCalls([]);
        setMetrics(null);
        setAccess(null);
        setUploadOptions({ clients: [], members: [] });
      } else {
        setCalls(data.calls ?? []);
        setMetrics(data.metrics ?? null);
        setAccess(data.access ?? null);
        setUploadOptions(data.uploadOptions ?? { clients: [], members: [] });
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [companyId, developmentFixture, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    async function loadDetail() {
      if (!selectedCallId) {
        setDetail(null);
        return;
      }
      setDetailLoading(true);
      setError(null);
      if (developmentFixture) {
        const fixtureDetail = developmentFixture.details[selectedCallId] ?? null;
        setDetail(fixtureDetail);
        setError(
          fixtureDetail
            ? null
            : "The selected development fixture was not found.",
        );
        setDetailLoading(false);
        return;
      }
      const { data, error: invokeError } = await supabase.functions.invoke(
        "manage-call-intelligence",
        {
          body: {
            action: "detail",
            companyId,
            callId: selectedCallId,
          },
        },
      );
      if (cancelled) return;
      if (invokeError || data?.error) {
        setError(data?.error || invokeError?.message || "Call could not be loaded.");
        setDetail(null);
      } else {
        setDetail(data as DetailResponse);
      }
      setDetailLoading(false);
    }
    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [companyId, developmentFixture, selectedCallId, reloadKey]);

  useEffect(() => {
    setSelectedEvidence(null);
    setTranscriptOpen(false);
  }, [selectedCallId]);

  useEffect(() => {
    if (
      developmentFixture ||
      !selectedCallId ||
      !detail?.runs.some((run) =>
        ["queued", "claimed"].includes(run.status),
      )
    ) {
      return;
    }
    const timer = window.setTimeout(
      () => setReloadKey((value) => value + 1),
      2_500,
    );
    return () => window.clearTimeout(timer);
  }, [detail?.runs, developmentFixture, selectedCallId]);

  const months = useMemo(
    () =>
      [...new Set(calls.map((call) => call.occurred_at.slice(0, 7)))]
        .sort()
        .reverse(),
    [calls],
  );
  const teamMembers = useMemo(
    () =>
      [...new Set(calls.map((call) => call.assignedMember?.name).filter(Boolean))]
        .sort() as string[],
    [calls],
  );
  const filteredCalls = useMemo(() => {
    const clientQuery = clientFilter.trim().toLowerCase();
    return calls.filter((call) => {
      if (
        clientQuery &&
        !clientLabel(call).toLowerCase().includes(clientQuery) &&
        !call.title.toLowerCase().includes(clientQuery)
      ) {
        return false;
      }
      if (
        teamFilter !== "all" &&
        call.assignedMember?.name !== teamFilter
      ) {
        return false;
      }
      if (monthFilter !== "all" && !call.occurred_at.startsWith(monthFilter)) {
        return false;
      }
      if (
        sentimentFilter !== "all" &&
        call.analysis?.clientSentiment !== sentimentFilter
      ) {
        return false;
      }
      return true;
    });
  }, [calls, clientFilter, monthFilter, sentimentFilter, teamFilter]);

  function openCall(callId: string) {
    const next = new URLSearchParams(searchParams);
    next.set("tab", "intelligence");
    next.set("call", callId);
    setSearchParams(next);
  }

  function closeCall() {
    const next = new URLSearchParams(searchParams);
    next.delete("call");
    setSearchParams(next);
  }

  async function runAction(action: "reprocess" | "run_on_demand", promptId?: string) {
    if (!selectedCallId || actionBusy) return;
    setActionBusy(promptId || action);
    setError(null);
    setSuccess(null);
    if (developmentFixture) {
      setSuccess(
        action === "reprocess"
          ? "Development preview: a fresh analysis would be queued."
          : "Development preview: the on-demand analysis would be queued.",
      );
      setActionBusy(null);
      return;
    }
    const { data, error: invokeError } = await supabase.functions.invoke(
      "manage-call-intelligence",
      {
        body: {
          action,
          companyId,
          callId: selectedCallId,
          ...(promptId ? { promptId } : {}),
        },
      },
    );
    if (invokeError || data?.error) {
      setError(data?.error || invokeError?.message || "Action failed.");
    } else {
      setSuccess(
        action === "reprocess"
          ? "A fresh analysis was queued."
          : "The on-demand analysis was queued.",
      );
      setReloadKey((value) => value + 1);
    }
    setActionBusy(null);
  }

  function selectEvidence(evidence: Evidence) {
    setSelectedEvidence(evidence);
    setTranscriptOpen(true);
  }

  async function submitManualUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (actionBusy) return;
    setActionBusy("manual_upload");
    setError(null);
    setSuccess(null);
    const durationMinutes = uploadForm.durationMinutes.trim();
    const durationSeconds = durationMinutes
      ? Math.round(Number(durationMinutes) * 60)
      : null;
    const occurredAt = new Date(uploadForm.occurredAt);
    if (
      !uploadForm.title.trim() ||
      !uploadForm.clientId ||
      !uploadForm.assignedMemberId ||
      !uploadForm.transcript.trim()
    ) {
      setError("Complete the title, client, team member, and transcript.");
      setActionBusy(null);
      return;
    }
    if (Number.isNaN(occurredAt.getTime())) {
      setError("Choose a valid call date and time.");
      setActionBusy(null);
      return;
    }
    if (
      durationMinutes &&
      (durationSeconds == null ||
        !Number.isFinite(durationSeconds) ||
        !Number.isInteger(durationSeconds) ||
        durationSeconds < 0 ||
        durationSeconds > 86_400)
    ) {
      setError("Duration must be between 0 and 1440 minutes.");
      setActionBusy(null);
      return;
    }
    if (uploadForm.transcript.trim().length > 500_000) {
      setError("The transcript cannot exceed 500,000 characters.");
      setActionBusy(null);
      return;
    }
    if (developmentFixture) {
      setUploadOpen(false);
      setSuccess(
        "Development preview: this transcript would be securely queued for analysis.",
      );
      setActionBusy(null);
      return;
    }
    const { data, error: invokeError } = await supabase.functions.invoke(
      "manage-call-intelligence",
      {
        body: {
          action: "manual_upload",
          companyId,
          title: uploadForm.title.trim(),
          occurredAt: occurredAt.toISOString(),
          durationSeconds,
          clientId: uploadForm.clientId,
          assignedMemberId: uploadForm.assignedMemberId,
          transcript: uploadForm.transcript.trim(),
        },
      },
    );
    if (invokeError || data?.error) {
      setError(
        data?.error ||
          invokeError?.message ||
          "The transcript could not be uploaded.",
      );
      setActionBusy(null);
      return;
    }
    setUploadOpen(false);
    setUploadForm({
      title: "",
      occurredAt: currentLocalDateTime(),
      durationMinutes: "",
      clientId: "",
      assignedMemberId: "",
      transcript: "",
    });
    setSuccess("Transcript uploaded. The first analysis is queued.");
    setActionBusy(null);
    setReloadKey((value) => value + 1);
    if (data.call?.id) openCall(data.call.id);
  }

  useEffect(() => {
    if (!selectedEvidence || !transcriptOpen) return;
    const timer = window.setTimeout(() => {
      transcriptRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedEvidence, transcriptOpen]);

  if (selectedCallId) {
    const analysisRun = detail?.runs.find(
      (run) => run.status === "succeeded" && run.result_json,
    );
    const analysis = analysisRun?.result_json ?? null;
    const onDemandRuns =
      detail?.runs.filter((run) => run.run_kind === "on_demand") ?? [];

    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={closeCall}
          className="text-sm font-semibold text-[#2b79c4] hover:text-[#162b3e]"
        >
          ← Back to Call Intelligence
        </button>
        {error ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        {success ? (
          <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success}
          </div>
        ) : null}
        {detailLoading || !detail ? (
          <div className="flex justify-center py-20">
            <div className="h-9 w-9 animate-spin rounded-full border-b-2 border-[#5b4cf0]" />
          </div>
        ) : (
          <>
            <header className="rounded-2xl bg-gradient-to-r from-[#17243a] to-[#243956] px-6 py-6 text-white shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9fc7f3]">
                    {formatCallType(analysis?.call_type)}
                  </p>
                  <h1 className="mt-2 text-3xl font-bold">
                    {analysis?.title_label || detail.call.title}
                  </h1>
                  <p className="mt-2 text-sm text-[#d8e3f1]">
                    {clientDescriptor(detail.call)} · {formatDate(detail.call.occurred_at)} · {formatDuration(detail.call.duration_seconds)}
                    {detail.call.assignedMember?.name
                      ? ` · ${detail.call.assignedMember.name}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {detail.call.recording_url ? (
                    <a
                      href={detail.call.recording_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20"
                    >
                      Open recording
                    </a>
                  ) : null}
                  {access?.canReconcile ? (
                    <button
                      type="button"
                      disabled={Boolean(actionBusy)}
                      onClick={() => void runAction("reprocess")}
                      className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#17243a] disabled:opacity-50"
                    >
                      {actionBusy === "reprocess" ? "Queuing…" : "Reprocess"}
                    </button>
                  ) : null}
                </div>
              </div>
            </header>

            <section className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-[#e4e9f0] bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">Client sentiment</p>
                <div className="mt-3"><SentimentBadge value={analysis?.client_sentiment.label} /></div>
                <EvidenceList evidence={analysis?.client_sentiment.evidence ?? []} onSelect={selectEvidence} />
              </div>
              <div className="rounded-xl border border-[#e4e9f0] bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">Team sentiment</p>
                <div className="mt-3"><SentimentBadge value={analysis?.team_member_sentiment.label} /></div>
                <EvidenceList evidence={analysis?.team_member_sentiment.evidence ?? []} onSelect={selectEvidence} />
              </div>
              <div className="rounded-xl border border-[#e4e9f0] bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">Call score</p>
                <p className="mt-2 text-3xl font-bold text-[#17243a]">
                  {analysis ? `${analysis.call_score.total}/28` : "Pending"}
                </p>
              </div>
            </section>

            <section className="rounded-xl border border-[#e4e9f0] bg-white p-6">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-xl font-bold text-[#17243a]">Summary</h2>
                {detail.call.client?.client_name ? (
                  <p className="text-sm font-semibold text-[#2b79c4]">
                    Matched client: {detail.call.client.client_name}
                  </p>
                ) : null}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#344054]">
                {analysis?.summary || "The base analysis has not completed yet."}
              </p>
            </section>

            {analysis ? (
              <>
                <section className="grid gap-5 lg:grid-cols-2">
                  <div className="rounded-xl border border-red-100 bg-white p-6">
                    <h2 className="text-lg font-bold text-[#17243a]">Red flags</h2>
                    {analysis.negative_signals.length === 0 ? (
                      <p className="mt-3 text-sm text-[#667085]">No supported red flags.</p>
                    ) : (
                      <div className="mt-4 space-y-4">
                        {analysis.negative_signals.map((signal, index) => (
                          <div key={`${signal.label}-${index}`}>
                            <p className="font-semibold text-red-700">{signal.label}</p>
                            <p className="mt-1 text-sm text-[#344054]">{signal.summary}</p>
                            <EvidenceList evidence={signal.evidence} onSelect={selectEvidence} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl border border-emerald-100 bg-white p-6">
                    <h2 className="text-lg font-bold text-[#17243a]">Green lights</h2>
                    {analysis.positive_signals.length === 0 ? (
                      <p className="mt-3 text-sm text-[#667085]">No supported green lights.</p>
                    ) : (
                      <div className="mt-4 space-y-4">
                        {analysis.positive_signals.map((signal, index) => (
                          <div key={`${signal.label}-${index}`}>
                            <p className="font-semibold text-emerald-700">{signal.label}</p>
                            <p className="mt-1 text-sm text-[#344054]">{signal.summary}</p>
                            <EvidenceList evidence={signal.evidence} onSelect={selectEvidence} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                <section className="grid gap-5 lg:grid-cols-2">
                  <div className="rounded-xl border border-[#e4e9f0] bg-white p-6">
                    <h2 className="text-lg font-bold text-[#17243a]">Client pain points</h2>
                    <ul className="mt-4 space-y-3 text-sm text-[#344054]">
                      {analysis.client_pain_points.map((item, index) => (
                        <li key={index}>
                          <span className="mr-2 text-[#5b4cf0]">•</span>{item.summary}
                          <EvidenceList evidence={item.evidence} onSelect={selectEvidence} />
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl border border-[#e4e9f0] bg-white p-6">
                    <h2 className="text-lg font-bold text-[#17243a]">Next steps</h2>
                    <ul className="mt-4 space-y-3 text-sm text-[#344054]">
                      {analysis.next_steps.map((item, index) => (
                        <li key={index}>
                          <span className="font-semibold">{item.owner || "Unassigned"}:</span>{" "}
                          {item.action}
                          {item.due_date ? ` · ${item.due_date}` : ""}
                          <EvidenceList evidence={item.evidence} onSelect={selectEvidence} />
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>

                <section className="rounded-xl border border-[#e4e9f0] bg-white p-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-[#17243a]">Call score</h2>
                    <span className="text-2xl font-bold text-[#5b4cf0]">{analysis.call_score.total}/28</span>
                  </div>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    {[
                      ["Agenda", analysis.call_score.agenda],
                      ["Team-member energy", analysis.call_score.team_member_energy],
                      ["Recap", analysis.call_score.recap],
                      ["Action plan", analysis.call_score.action_plan],
                    ].map(([label, dimension]) => {
                      const item = dimension as ScoreDimension;
                      return (
                        <div key={label as string} className="rounded-lg bg-[#f7f8fc] p-4">
                          <div className="flex justify-between gap-3">
                            <p className="font-semibold text-[#17243a]">{label as string}</p>
                            <span className="font-bold text-[#5b4cf0]">{item.score}/7</span>
                          </div>
                          <p className="mt-2 text-sm text-[#667085]">{item.rationale}</p>
                          <EvidenceList evidence={item.evidence} onSelect={selectEvidence} />
                        </div>
                      );
                    })}
                  </div>
                </section>
              </>
            ) : null}

            <section className="rounded-xl border border-[#e4e9f0] bg-white p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#17243a]">On-demand prompts</h2>
                  <p className="mt-1 text-sm text-[#667085]">Run an approved company prompt against this transcript.</p>
                </div>
                {access?.canRun ? (
                  <div className="flex flex-wrap gap-2">
                    {detail.onDemandPrompts.map((prompt) => (
                      <button
                        key={prompt.id}
                        type="button"
                        disabled={Boolean(actionBusy)}
                        onClick={() => void runAction("run_on_demand", prompt.id)}
                        className="rounded-lg border border-[#d0d5dd] bg-white px-3 py-2 text-sm font-semibold text-[#344054] hover:border-[#5b4cf0] disabled:opacity-50"
                      >
                        {actionBusy === prompt.id ? "Queuing…" : prompt.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {onDemandRuns.length > 0 ? (
                <div className="mt-5 space-y-3">
                  {onDemandRuns.map((run) => (
                    <article key={run.id} className="rounded-lg bg-[#f7f8fc] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-[#17243a]">
                          On-demand analysis · {formatDate(run.created_at)}
                        </p>
                        <StatusBadge value={run.status} />
                      </div>
                      {run.result_text ? (
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#344054]">{run.result_text}</p>
                      ) : run.error_category ? (
                        <p className="mt-2 text-sm text-red-700">{run.error_category}</p>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : null}
            </section>

            <details
              ref={transcriptRef}
              open={transcriptOpen}
              onToggle={(event) => setTranscriptOpen((event.target as HTMLDetailsElement).open)}
              className="rounded-xl border border-[#e4e9f0] bg-white p-6"
            >
              <summary className="cursor-pointer text-lg font-bold text-[#17243a]">
                Transcript · {detail.transcript?.character_count.toLocaleString() ?? 0} characters
              </summary>
              {selectedEvidence ? (
                <p className="mt-3 text-xs text-[#2b79c4]">
                  Showing evidence from {selectedEvidence.timestamp || "the transcript"}. Highlighted text is the closest matching utterance.
                </p>
              ) : null}
              <div className="mt-4 max-h-[34rem] overflow-auto rounded-lg bg-[#f7f8fc] p-4 font-sans text-sm leading-6 text-[#344054]">
                {(detail.transcript?.transcript_text || "Transcript unavailable.").split("\n").map((line, index) => {
                  const quote = selectedEvidence?.quote.trim().toLocaleLowerCase();
                  const matchesQuote = Boolean(quote && line.toLocaleLowerCase().includes(quote));
                  const matchesTimestamp = Boolean(selectedEvidence?.timestamp && line.includes(selectedEvidence.timestamp));
                  return (
                    <p
                      key={`${index}-${line.slice(0, 20)}`}
                      className={matchesQuote || matchesTimestamp ? "-mx-1 rounded bg-[#fff4c2] px-1 text-[#4d3b00]" : undefined}
                    >
                      {line || " "}
                    </p>
                  );
                })}
              </div>
            </details>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5b4cf0]">
            Call AI
          </p>
          <h1 className="mt-1 text-3xl font-bold text-[#17243a]">Call Intelligence</h1>
          <p className="mt-2 text-sm text-[#667085]">
            Client sentiment, team performance, call quality, and evidence-backed insights.
          </p>
        </div>
        <div className="flex gap-2">
          {metrics?.needsReconciliation && access?.canReconcile ? (
            <button
              type="button"
              onClick={onShowReconciliation}
              className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800"
            >
              Reconcile {metrics.needsReconciliation}
            </button>
          ) : null}
          {access?.canUpload ? (
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="rounded-lg bg-[#5b4cf0] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#4b3bd9]"
            >
              + Add transcript
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
            className="retainos-button-secondary px-4 py-2 text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {success ? (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      {uploadOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/55 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !actionBusy) {
              setUploadOpen(false);
            }
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="manual-transcript-title"
            onSubmit={submitManualUpload}
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-[#e4e9f0] px-6 py-5">
              <div>
                <h2
                  id="manual-transcript-title"
                  className="text-xl font-bold text-[#17243a]"
                >
                  Add a meeting transcript
                </h2>
                <p className="mt-1 text-sm text-[#667085]">
                  Select the known client and team member before analysis.
                </p>
              </div>
              <button
                type="button"
                disabled={Boolean(actionBusy)}
                onClick={() => setUploadOpen(false)}
                className="rounded-lg px-2 py-1 text-xl text-[#667085] hover:bg-[#f2f4f7] disabled:opacity-50"
                aria-label="Close transcript upload"
              >
                ×
              </button>
            </div>

            <div className="space-y-5 px-6 py-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-semibold text-[#344054]">
                  Call title
                  <input
                    required
                    maxLength={500}
                    value={uploadForm.title}
                    onChange={(event) =>
                      setUploadForm((value) => ({
                        ...value,
                        title: event.target.value,
                      }))
                    }
                    placeholder="Client name — check-in call"
                    className="mt-2 block w-full rounded-lg border border-[#d0d5dd] px-3 py-2.5 font-normal"
                  />
                </label>
                <label className="text-sm font-semibold text-[#344054]">
                  Date and time
                  <input
                    required
                    type="datetime-local"
                    value={uploadForm.occurredAt}
                    onChange={(event) =>
                      setUploadForm((value) => ({
                        ...value,
                        occurredAt: event.target.value,
                      }))
                    }
                    className="mt-2 block w-full rounded-lg border border-[#d0d5dd] px-3 py-2.5 font-normal"
                  />
                </label>
                <label className="text-sm font-semibold text-[#344054]">
                  Client
                  <select
                    required
                    value={uploadForm.clientId}
                    onChange={(event) =>
                      setUploadForm((value) => ({
                        ...value,
                        clientId: event.target.value,
                      }))
                    }
                    className="mt-2 block w-full rounded-lg border border-[#d0d5dd] px-3 py-2.5 font-normal"
                  >
                    <option value="">Choose a client</option>
                    {uploadOptions.clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.client_name ||
                          client.client_business ||
                          client.client_email ||
                          client.id}
                        {client.client_business &&
                        client.client_business !== client.client_name
                          ? ` · ${client.client_business}`
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-semibold text-[#344054]">
                  Team member on the call
                  <select
                    required
                    value={uploadForm.assignedMemberId}
                    onChange={(event) =>
                      setUploadForm((value) => ({
                        ...value,
                        assignedMemberId: event.target.value,
                      }))
                    }
                    className="mt-2 block w-full rounded-lg border border-[#d0d5dd] px-3 py-2.5 font-normal"
                  >
                    <option value="">Choose a team member</option>
                    {uploadOptions.members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name || member.email || member.id}
                        {member.role ? ` · ${member.role}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block text-sm font-semibold text-[#344054]">
                Duration in minutes
                <input
                  type="number"
                  min="0"
                  max="1440"
                  step="1"
                  value={uploadForm.durationMinutes}
                  onChange={(event) =>
                    setUploadForm((value) => ({
                      ...value,
                      durationMinutes: event.target.value,
                    }))
                  }
                  placeholder="Optional"
                  className="mt-2 block w-full rounded-lg border border-[#d0d5dd] px-3 py-2.5 font-normal md:w-48"
                />
              </label>

              <label className="block text-sm font-semibold text-[#344054]">
                Transcript
                <textarea
                  required
                  maxLength={500_000}
                  rows={14}
                  value={uploadForm.transcript}
                  onChange={(event) =>
                    setUploadForm((value) => ({
                      ...value,
                      transcript: event.target.value,
                    }))
                  }
                  placeholder={"00:00:00 — Team member: Welcome…\n00:00:06 — Client: Thanks…"}
                  className="mt-2 block w-full rounded-lg border border-[#d0d5dd] px-3 py-3 font-mono text-sm font-normal leading-6"
                />
                <span className="mt-1 block text-right text-xs font-normal text-[#98a2b3]">
                  {uploadForm.transcript.length.toLocaleString()} / 500,000
                </span>
              </label>

              <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                Pilot retention: this raw transcript is kept until you approve
                the analysis. It will not update Client Notes or Next Steps.
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-[#e4e9f0] px-6 py-4">
              <button
                type="button"
                disabled={Boolean(actionBusy)}
                onClick={() => setUploadOpen(false)}
                className="retainos-button-secondary px-4 py-2 text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={Boolean(actionBusy)}
                className="rounded-lg bg-[#5b4cf0] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {actionBusy === "manual_upload"
                  ? "Uploading…"
                  : "Upload and analyze"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-[#e4e9f0] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">Total calls reviewed</p>
          <p className="mt-2 text-3xl font-bold text-[#17243a]">{metrics?.totalCalls ?? 0}</p>
        </div>
        <div className="rounded-xl border border-[#e4e9f0] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">Average call score</p>
          <p className="mt-2 text-3xl font-bold text-[#17243a]">
            {metrics?.averageScore == null ? "--" : `${metrics.averageScore.toFixed(1)}/28`}
          </p>
        </div>
        <div className="rounded-xl border border-[#e4e9f0] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">Client sentiment</p>
          <div className="mt-3 flex gap-4 text-sm">
            <span className="font-bold text-emerald-600">{metrics?.clientSentiment.positive ?? 0} positive</span>
            <span className="font-bold text-red-600">{metrics?.clientSentiment.negative ?? 0} negative</span>
          </div>
        </div>
        <div className="rounded-xl border border-[#e4e9f0] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">Team sentiment</p>
          <div className="mt-3 flex gap-4 text-sm">
            <span className="font-bold text-emerald-600">{metrics?.teamMemberSentiment.positive ?? 0} positive</span>
            <span className="font-bold text-red-600">{metrics?.teamMemberSentiment.negative ?? 0} negative</span>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-[#e4e9f0] bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">
            Client or title
            <input
              value={clientFilter}
              onChange={(event) => setClientFilter(event.target.value)}
              placeholder="Search calls"
              className="mt-2 block w-full rounded-lg border border-[#d0d5dd] px-3 py-2.5 text-sm normal-case tracking-normal text-[#17243a]"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">
            Team member
            <select
              value={teamFilter}
              onChange={(event) => setTeamFilter(event.target.value)}
              className="mt-2 block w-full rounded-lg border border-[#d0d5dd] px-3 py-2.5 text-sm normal-case tracking-normal text-[#17243a]"
            >
              <option value="all">All</option>
              {teamMembers.map((member) => <option key={member}>{member}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">
            Month
            <select
              value={monthFilter}
              onChange={(event) => setMonthFilter(event.target.value)}
              className="mt-2 block w-full rounded-lg border border-[#d0d5dd] px-3 py-2.5 text-sm normal-case tracking-normal text-[#17243a]"
            >
              <option value="all">All</option>
              {months.map((month) => <option key={month} value={month}>{month}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">
            Client sentiment
            <select
              value={sentimentFilter}
              onChange={(event) => setSentimentFilter(event.target.value)}
              className="mt-2 block w-full rounded-lg border border-[#d0d5dd] px-3 py-2.5 text-sm normal-case tracking-normal text-[#17243a]"
            >
              <option value="all">All</option>
              <option value="positive">Positive</option>
              <option value="neutral">Neutral</option>
              <option value="negative">Negative</option>
            </select>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#e4e9f0] bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-9 w-9 animate-spin rounded-full border-b-2 border-[#5b4cf0]" />
          </div>
        ) : filteredCalls.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <h2 className="text-lg font-semibold text-[#17243a]">No calls found</h2>
            <p className="mt-2 text-sm text-[#667085]">
              New Fathom calls will appear after the Call Intelligence webhook is enabled.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#e4e9f0]">
            {filteredCalls.map((call) => (
              <button
                key={call.id}
                type="button"
                onClick={() => openCall(call.id)}
                className="grid w-full gap-3 px-5 py-4 text-left transition hover:bg-[#f8f9fc] md:grid-cols-[minmax(220px,1.4fr)_minmax(150px,1fr)_130px_130px_90px] md:items-center"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eef0ff] text-sm font-bold text-[#5b4cf0]">
                    {initials(clientLabel(call))}
                  </span>
                  <div>
                    <p className="font-semibold text-[#17243a]">{call.title}</p>
                    <p className="mt-0.5 text-sm text-[#667085]">{clientDescriptor(call)}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#344054]">{call.assignedMember?.name || "Unassigned"}</p>
                  <p className="mt-0.5 text-xs text-[#98a2b3]">{formatDate(call.occurred_at)} · {formatDuration(call.duration_seconds)}</p>
                </div>
                <SentimentBadge value={call.analysis?.clientSentiment} />
                <SentimentBadge value={call.analysis?.teamMemberSentiment} />
                <div className="flex items-center justify-between gap-3 md:justify-end">
                  <span className="font-bold text-[#17243a]">
                    {call.analysis?.callScore == null ? "--" : `${call.analysis.callScore}/28`}
                  </span>
                  {call.processing_status !== "completed" ? <StatusBadge value={call.processing_status} /> : null}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
