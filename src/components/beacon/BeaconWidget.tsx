import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import { useAccountContext } from "../../lib/accountContext.tsx";
import {
  BeaconApiError,
  loadBeaconAccess,
  sendBeaconMessage,
  type BeaconAccessResponse,
  type BeaconHistoryMessage,
  type BeaconSafeLink,
  type BeaconToolActivity,
} from "../../lib/beaconApi.ts";

const CLIENT_INPUT_LIMIT = 2_000;
const CLIENT_HISTORY_LIMIT = 10;
const CLIENT_HISTORY_CONTENT_LIMIT = 2_000;

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolActivity?: BeaconToolActivity[];
  links?: BeaconSafeLink[];
  truncated?: boolean;
}

const ROLE_PROMPTS = {
  super_admin: [
    "Which clients need attention right now?",
    "Show me upcoming renewals.",
    "Which clients have contract gaps?",
  ],
  director: [
    "Which clients need attention right now?",
    "Show me upcoming renewals.",
    "How are our CSM books distributed?",
  ],
  support: [
    "Which clients need a follow-up?",
    "Show me upcoming renewals.",
    "Which clients have contract gaps?",
  ],
  csm: [
    "Which of my clients need attention?",
    "Show my upcoming renewals.",
    "Which of my clients are referral ready?",
  ],
} as const;

function messageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function safeClientLink(link: BeaconSafeLink) {
  return (
    typeof link.label === "string" &&
    link.label.trim().length > 0 &&
    typeof link.path === "string" &&
    /^\/clients\/[A-Za-z0-9_-]+$/.test(link.path)
  );
}

function toolActivityLabel(activity: BeaconToolActivity) {
  const knownTools: Record<string, string> = {
    company_metrics: "Checked company metrics",
    list_clients: "Checked the client list",
    list_renewals: "Checked upcoming renewals",
    list_contract_gaps: "Checked contract coverage",
    list_health_signals: "Checked client health signals",
    list_referral_ready: "Checked referral readiness",
    list_csm_books: "Checked CSM books",
    get_client_brief: "Checked the client brief",
  };
  return knownTools[activity.tool] ?? "Checked approved RetainOS data";
}

function userFacingError(error: unknown) {
  if (!(error instanceof BeaconApiError)) {
    return "Beacon could not complete that request. Please try again.";
  }
  if (error.code === "rate_limited") {
    return error.retryAfterSeconds
      ? `Beacon is receiving a lot of requests. Try again in ${error.retryAfterSeconds} seconds.`
      : "Beacon is receiving a lot of requests. Please try again shortly.";
  }
  if (error.code === "budget_exhausted") {
    return "This company's Beacon allowance has been reached. A RetainOS SuperAdmin can review it.";
  }
  if (["feature_disabled", "feature_paused", "not_entitled"].includes(error.code)) {
    return "Beacon is not available for this company right now.";
  }
  if (error.code === "unauthenticated") return error.message;
  return "Beacon could not complete that request. Please try again.";
}

function remainingLabel(access: BeaconAccessResponse) {
  const requests = access.limits?.remainingRequests;
  const cents = access.limits?.remainingBudgetCents;
  if (requests === 0) return "Request allowance reached";
  if (cents === 0) return "Company budget reached";
  if (typeof requests === "number" && requests <= 5) {
    return `${requests} request${requests === 1 ? "" : "s"} remaining`;
  }
  if (typeof cents === "number" && cents <= 2_500) {
    return `$${(cents / 100).toFixed(2)} company budget remaining`;
  }
  return null;
}

export function BeaconWidget() {
  const { effectiveCompanyId, email, role, status } = useAccountContext();
  const [access, setAccess] = useState<BeaconAccessResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accessGeneration = useRef(0);
  const requestGeneration = useRef(0);
  const submittingRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const generation = ++accessGeneration.current;
    requestGeneration.current += 1;
    setAccess(null);
    setOpen(false);
    setMessages([]);
    setInput("");
    setError(null);
    setSubmitting(false);
    submittingRef.current = false;

    if (
      status !== "ready" ||
      !email ||
      !effectiveCompanyId ||
      !role ||
      role === "viewer"
    ) {
      return;
    }

    loadBeaconAccess(effectiveCompanyId)
      .then((result) => {
        if (generation !== accessGeneration.current) return;
        if (
          result.allowed &&
          result.enabled &&
          (result.featureStatus === "pilot" || result.featureStatus === "enabled")
        ) {
          setAccess(result);
        }
      })
      .catch(() => {
        // Beacon stays hidden unless the server affirmatively authorizes access.
        if (generation === accessGeneration.current) setAccess(null);
      });
  }, [effectiveCompanyId, email, role, status]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, submitting]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        window.requestAnimationFrame(() => launcherRef.current?.focus());
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const inputLimit = Math.max(
    1,
    Math.min(access?.limits?.maxInputCharacters ?? CLIENT_INPUT_LIMIT, CLIENT_INPUT_LIMIT),
  );
  const historyLimit = Math.max(
    0,
    Math.min(access?.limits?.maxHistoryMessages ?? CLIENT_HISTORY_LIMIT, CLIENT_HISTORY_LIMIT),
  );
  const allowanceMessage = access ? remainingLabel(access) : null;
  const limitReached =
    access?.limits?.remainingRequests === 0 ||
    access?.limits?.remainingBudgetCents === 0;

  const suggestedPrompts = useMemo(() => {
    const serverPrompts = access?.suggestedPrompts
      ?.filter((prompt) => typeof prompt === "string" && prompt.trim())
      .map((prompt) => prompt.trim().slice(0, inputLimit))
      .slice(0, 4);
    if (serverPrompts?.length) return serverPrompts;
    return access?.role && access.role !== "viewer"
      ? [...ROLE_PROMPTS[access.role]]
      : [];
  }, [access, inputLimit]);

  function handleNewChat() {
    if (submittingRef.current) return;
    requestGeneration.current += 1;
    setMessages([]);
    setInput("");
    setError(null);
    setSubmitting(false);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function submitMessage(rawMessage: string) {
    if (!access || submittingRef.current || limitReached) return;
    const message = rawMessage.trim().slice(0, inputLimit);
    if (!message) return;

    const historySource = historyLimit === 0 ? [] : messages.slice(-historyLimit);
    const history: BeaconHistoryMessage[] = historySource
      .map(({ role: messageRole, content }) => ({
        role: messageRole,
        content: content.slice(0, CLIENT_HISTORY_CONTENT_LIMIT),
      }));
    const generation = ++requestGeneration.current;
    setMessages((current) => [
      ...current,
      { id: messageId(), role: "user", content: message },
    ]);
    setInput("");
    setError(null);
    submittingRef.current = true;
    setSubmitting(true);

    try {
      const response = await sendBeaconMessage({
        companyId: effectiveCompanyId,
        message,
        history,
      });
      if (generation !== requestGeneration.current) return;
      const safeLinks = (response.links ?? []).filter(safeClientLink).slice(0, 8);
      setMessages((current) => [
        ...current,
        {
          id: response.requestId || messageId(),
          role: "assistant",
          content: response.answer,
          toolActivity: response.toolActivity,
          links: safeLinks,
          truncated: response.truncated,
        },
      ]);
      if (response.usage) {
        setAccess((current) =>
          current
            ? {
                ...current,
                limits: { ...current.limits, ...response.usage },
              }
            : current,
        );
      }
    } catch (caughtError) {
      if (generation === requestGeneration.current) {
        setError(userFacingError(caughtError));
      }
    } finally {
      if (generation === requestGeneration.current) {
        submittingRef.current = false;
        setSubmitting(false);
      }
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void submitMessage(input);
  }

  if (!access) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6">
      {open ? (
        <section
          role="dialog"
          aria-modal="false"
          aria-labelledby="beacon-title"
          className="flex h-[min(680px,calc(100vh-2rem))] w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[#d6eafb] bg-white shadow-[0_18px_55px_rgba(14,27,41,0.24)]"
        >
          <header className="flex items-center gap-3 border-b border-[#e4e9f0] bg-[#162b3e] px-4 py-3 text-white">
            <div className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[#59abf0] font-bold text-[#162b3e]" aria-hidden="true">
              B
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="beacon-title" className="text-sm font-bold">Beacon beta</h2>
              <p className="text-[11px] text-[#b8c7d6]">Read-only RetainOS assistant</p>
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={handleNewChat}
              className="retainos-focus rounded-md px-2 py-1.5 text-xs font-semibold text-[#d6eafb] hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              New Chat
            </button>
            <button
              type="button"
              aria-label="Close Beacon"
              onClick={() => {
                setOpen(false);
                window.requestAnimationFrame(() => launcherRef.current?.focus());
              }}
              className="retainos-focus rounded-md p-1.5 text-[#d6eafb] hover:bg-white/10"
            >
              <span aria-hidden="true">×</span>
            </button>
          </header>

          <div
            ref={transcriptRef}
            className="flex-1 space-y-4 overflow-y-auto bg-[#f7f9fc] px-4 py-4"
            aria-live="polite"
            aria-busy={submitting}
          >
            {messages.length === 0 ? (
              <div>
                <div className="rounded-xl border border-[#d6eafb] bg-white p-4 text-sm leading-6 text-[#586273]">
                  Ask about approved client, renewal, contract, health, or CSM-book data. Beacon checks your access on every request.
                </div>
                {suggestedPrompts.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[#98a2b3]">Try asking</p>
                    {suggestedPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        disabled={submitting || limitReached}
                        onClick={() => void submitMessage(prompt)}
                        className="retainos-focus block w-full rounded-lg border border-[#e4e9f0] bg-white px-3 py-2.5 text-left text-xs font-semibold leading-5 text-[#2b79c4] hover:border-[#59abf0] hover:bg-[#eaf4fe] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              messages.map((message) => (
                <article
                  key={message.id}
                  className={message.role === "user" ? "ml-9" : "mr-3"}
                >
                  <div
                    className={`rounded-xl px-3.5 py-3 text-sm leading-6 ${
                      message.role === "user"
                        ? "bg-[#2b79c4] text-white"
                        : "border border-[#e4e9f0] bg-white text-[#162b3e]"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    {message.truncated ? (
                      <p className="mt-2 border-t border-[#e4e9f0] pt-2 text-[11px] font-semibold text-[#c77c1e]">
                        This answer was shortened to stay within the response limit.
                      </p>
                    ) : null}
                  </div>
                  {message.toolActivity?.length ? (
                    <ul className="mt-1.5 space-y-1 px-1 text-[10px] text-[#667085]">
                      {message.toolActivity.map((activity, index) => (
                        <li key={`${activity.tool}-${index}`}>
                          {toolActivityLabel(activity)} · {activity.status}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {message.links?.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {message.links.map((link) => (
                        <Link
                          key={`${message.id}-${link.path}`}
                          to={link.path}
                          className="retainos-focus rounded-full border border-[#d6eafb] bg-[#eaf4fe] px-3 py-1.5 text-[11px] font-bold text-[#2b79c4] hover:border-[#59abf0]"
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))
            )}

            {submitting ? (
              <div className="mr-3 rounded-xl border border-[#d6eafb] bg-white px-3.5 py-3 text-sm text-[#586273]">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#59abf0]" aria-hidden="true" />
                  Checking approved RetainOS data…
                </div>
              </div>
            ) : null}

            {error ? (
              <div role="alert" className="rounded-xl border border-[#f2b8b5] bg-[#fcebea] px-3.5 py-3 text-xs leading-5 text-[#9f2f2a]">
                {error}
              </div>
            ) : null}
          </div>

          <form onSubmit={handleSubmit} className="border-t border-[#e4e9f0] bg-white p-3">
            {allowanceMessage ? (
              <p className={`mb-2 text-[11px] font-semibold ${limitReached ? "text-[#c13a33]" : "text-[#c77c1e]"}`} role={limitReached ? "alert" : undefined}>
                {allowanceMessage}
              </p>
            ) : null}
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <label htmlFor="beacon-message" className="sr-only">Message Beacon</label>
                <textarea
                  ref={inputRef}
                  id="beacon-message"
                  rows={2}
                  maxLength={inputLimit}
                  value={input}
                  disabled={submitting || limitReached}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (input.trim()) void submitMessage(input);
                    }
                  }}
                  placeholder={limitReached ? "Allowance reached" : "Ask Beacon…"}
                  className="retainos-input min-h-[58px] resize-none py-2.5 text-xs"
                />
              </div>
              <button
                type="submit"
                aria-label="Send message"
                disabled={submitting || limitReached || !input.trim()}
                className="retainos-focus grid h-10 w-10 flex-none place-items-center rounded-full bg-[#59abf0] text-[#162b3e] hover:bg-[#3b8fd9] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span aria-hidden="true">↑</span>
              </button>
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-[#98a2b3]">
              <span>Enter to send · Shift+Enter for a new line</span>
              <span>{input.length}/{inputLimit}</span>
            </div>
          </form>
        </section>
      ) : (
        <button
          ref={launcherRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open Beacon beta"
          className="retainos-focus flex h-14 items-center gap-2 rounded-full bg-[#162b3e] px-4 text-sm font-bold text-white shadow-[0_12px_32px_rgba(14,27,41,0.28)] transition hover:-translate-y-0.5 hover:bg-[#1e3a52]"
        >
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[#59abf0] text-[#162b3e]" aria-hidden="true">B</span>
          Beacon <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#d6eafb]">Beta</span>
        </button>
      )}
    </div>
  );
}
