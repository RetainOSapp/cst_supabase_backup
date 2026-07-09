import {
  advocacyDefinitions,
  advocacySummaryFromClient,
  type AdvocacyDraft,
  type AdvocacyType,
} from "../lib/clientAdvocacy.ts";

function formatDate(value: string | null) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusLabel(status: string, askedCount: number, receivedCount: number) {
  if (receivedCount > 0) return `Received x${receivedCount}`;
  if (askedCount > 0) return `Asked x${askedCount}`;
  if (status === "asked") return "Asked";
  if (status === "received") return "Received";
  return "Not asked";
}

function statusClass(status: string) {
  if (status === "received") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "asked") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-[#dbe3ee] bg-white text-[#586273]";
}

function pendingLabel(asked: number, received: number) {
  const parts = [];
  if (asked > 0) parts.push(`${asked} ask${asked === 1 ? "" : "s"}`);
  if (received > 0) {
    parts.push(`${received} received win${received === 1 ? "" : "s"}`);
  }
  return parts.join(" and ");
}

export function ClientAdvocacyPanel({
  client,
  drafts,
  disabled,
  onChange,
}: {
  client: Record<string, unknown>;
  drafts: Record<AdvocacyType, AdvocacyDraft>;
  disabled?: boolean;
  onChange: (type: AdvocacyType, draft: AdvocacyDraft) => void;
}) {
  const updateDraft = (
    type: AdvocacyType,
    updater: (draft: AdvocacyDraft) => AdvocacyDraft,
  ) => {
    onChange(type, updater(drafts[type]));
  };

  return (
    <section className="retainos-section overflow-hidden">
      <div className="border-b border-[#e4e9f0] bg-[#f7f9fc] px-4 py-3">
        <h3 className="retainos-section-title">Advocacy & Growth</h3>
        <p className="retainos-section-copy mt-1">
          Track asks and received wins for reviews, testimonials, referrals, and renewal or upsell opportunities.
        </p>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-2">
        {advocacyDefinitions.map((definition) => {
          const summary = advocacySummaryFromClient(client, definition.type);
          const draft = drafts[definition.type];
          const pendingTotal = draft.asked + draft.received;

          return (
            <div
              key={definition.type}
              className="rounded-lg border border-[#dbe3ee] bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[#162b3e]">
                    {definition.label}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-[#6c7684]">
                    <span>Asked x{summary.askedCount}</span>
                    <span>Received x{summary.receivedCount}</span>
                  </div>
                </div>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass(
                    summary.status,
                  )}`}
                >
                  {statusLabel(
                    summary.status,
                    summary.askedCount,
                    summary.receivedCount,
                  )}
                </span>
              </div>

              <div className="mt-3 grid gap-2 text-xs text-[#6c7684] sm:grid-cols-2">
                <div>
                  <span className="font-semibold text-[#586273]">Last asked</span>
                  <div>{formatDate(summary.lastAskedAt)}</div>
                </div>
                <div>
                  <span className="font-semibold text-[#586273]">Last received</span>
                  <div>{formatDate(summary.lastReceivedAt)}</div>
                </div>
              </div>

              {summary.lastNote ? (
                <div className="mt-3 rounded-md border border-[#e4e9f0] bg-[#f8fafc] px-3 py-2 text-xs text-[#586273]">
                  {summary.lastNote}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    updateDraft(definition.type, (current) => ({
                      ...current,
                      asked: current.asked + 1,
                    }))
                  }
                  className="rounded-full border border-[#cbd2dc] bg-[#f7f9fc] px-3 py-1.5 text-xs font-semibold text-[#364152] hover:bg-white disabled:opacity-50"
                >
                  Mark asked
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    updateDraft(definition.type, (current) => ({
                      ...current,
                      received: current.received + 1,
                    }))
                  }
                  className="rounded-full border border-[#34b389] bg-[#e7f6f0] px-3 py-1.5 text-xs font-semibold text-[#2a9272] hover:bg-white disabled:opacity-50"
                >
                  Mark received
                </button>
                {draft.asked > 0 ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      updateDraft(definition.type, (current) => ({
                        ...current,
                        asked: Math.max(0, current.asked - 1),
                      }))
                    }
                    className="rounded-full border border-[#e4e9f0] bg-white px-3 py-1.5 text-xs font-semibold text-[#6c7684] hover:bg-[#f7f9fc] disabled:opacity-50"
                  >
                    Undo asked
                  </button>
                ) : null}
                {draft.received > 0 ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      updateDraft(definition.type, (current) => ({
                        ...current,
                        received: Math.max(0, current.received - 1),
                      }))
                    }
                    className="rounded-full border border-[#e4e9f0] bg-white px-3 py-1.5 text-xs font-semibold text-[#6c7684] hover:bg-[#f7f9fc] disabled:opacity-50"
                  >
                    Undo received
                  </button>
                ) : null}
              </div>

              {pendingTotal > 0 ? (
                <div className="mt-3 rounded-md border border-[#dbe3ee] bg-[#f8fafc] px-3 py-2 text-xs font-semibold text-[#364152]">
                  Will save: {pendingLabel(draft.asked, draft.received)}
                </div>
              ) : null}

              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#586273]">
                  Note
                </span>
                <textarea
                  value={draft.notes}
                  disabled={disabled}
                  rows={2}
                  onChange={(event) =>
                    updateDraft(definition.type, (current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  placeholder={
                    definition.type === "referral"
                      ? "Referral name, context, or next step"
                      : "Optional context or link"
                  }
                  className="block w-full rounded-md border border-[#cbd2dc] bg-white px-3 py-2 text-sm text-[#162b3e] placeholder:text-[#7b8494] disabled:bg-[#f1f4f8]"
                />
              </label>
            </div>
          );
        })}
      </div>
    </section>
  );
}
