import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAccountContext } from "../lib/accountContext.tsx";
import {
  archivePipelineItem,
  createPipelineItem,
  loadPipelineWorkspace,
  movePipelineItemStage,
  resolvePipelineLost,
  resolvePipelineWon,
  runPipelineRenewalScan,
  updatePipelineItem,
  type ClientPipelineItem,
  type CompanyPipeline,
  type CompanyPipelineStage,
  type PipelineClient,
  type PipelineItemDraft,
  type PipelineLostDraft,
  type PipelineMember,
  type PipelineOffer,
  type PipelineWonDraft,
  type PipelineWorkspace,
} from "../lib/pipeline.ts";

type ViewMode = "board" | "list";
type DateKind = "follow_up" | "renewal" | "expected_close";
type DateWindow =
  | "all"
  | "overdue"
  | "next_30"
  | "this_month"
  | "next_month"
  | "month"
  | "no_date";

const PIPELINE_VIEW_KEY = "retainOS.pipeline.view.v1";
const OUTCOMES = [
  "Offboarded",
  "Downgraded",
  "Decision extended",
  "Moved to another offer",
  "Duplicate",
  "Not applicable",
  "Other",
];

function initialViewMode(): ViewMode {
  try {
    return window.sessionStorage.getItem(PIPELINE_VIEW_KEY) === "list"
      ? "list"
      : "board";
  } catch {
    return "board";
  }
}

function dateKey(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(key: string, days: number) {
  const date = new Date(`${key}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateKey(date.toISOString());
}

function monthFromToday(offset: number) {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(`${dateKey(value)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

function formatMoney(cents: number | null | undefined, currency = "USD") {
  if (cents === null || cents === undefined) return "Not set";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toLocaleString()}`;
  }
}

function formatMoneyTotals(
  items: ClientPipelineItem[],
  value: (item: ClientPipelineItem) => number | null | undefined,
) {
  const totals = new Map<string, number>();
  for (const item of items) {
    const currency = item.currency_code || "USD";
    totals.set(currency, (totals.get(currency) ?? 0) + (value(item) ?? 0));
  }
  if (totals.size === 0) return formatMoney(0, "USD");
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, cents]) => formatMoney(cents, currency))
    .join(" · ");
}

function centsFromInput(value: string) {
  if (!value.trim()) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function trapDialogFocus(event: ReactKeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => element.offsetParent !== null);
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!focusable.includes(document.activeElement as HTMLElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function inputFromCents(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value / 100);
}

function orderedPipelines(workspace: PipelineWorkspace) {
  return workspace.pipelines
    .filter((pipeline) => pipeline.is_enabled && !pipeline.archived_at)
    .sort(
      (left, right) =>
        (left.display_order ?? left.position ?? 0) -
          (right.display_order ?? right.position ?? 0) ||
        left.name.localeCompare(right.name),
    );
}

function orderedStages(
  workspace: PipelineWorkspace,
  visiblePipelineIds: Set<string>,
) {
  return workspace.stages
    .filter(
      (stage) =>
        visiblePipelineIds.has(stage.pipeline_id) &&
        stage.is_enabled !== false &&
        !stage.archived_at,
    )
    .sort(
      (left, right) =>
        (left.display_order ?? left.position ?? 0) -
          (right.display_order ?? right.position ?? 0) ||
        left.name.localeCompare(right.name),
    );
}

function lookupClient(clients: PipelineClient[], clientId: string) {
  return clients.find(
    (client) => client.id === clientId || client.glide_row_id === clientId,
  );
}

function clientOptionLabel(client: PipelineClient) {
  const name = client.client_name?.trim() || client.client_business?.trim() || "Unnamed client";
  const details = [
    client.client_business?.trim() && client.client_business.trim() !== name
      ? client.client_business.trim()
      : null,
    client.pathway_name?.trim() || null,
    client.offer_name?.trim() && client.offer_name.trim() !== client.pathway_name?.trim()
      ? client.offer_name.trim()
      : null,
  ].filter((value): value is string => Boolean(value));

  return details.length ? `${name} — ${details.join(" · ")}` : name;
}

function clientMatchesSearch(client: PipelineClient, search: string) {
  const terms = search.trim().toLowerCase().split(/[\s—·]+/).filter(Boolean);
  if (!terms.length) return true;

  const searchableText = [
    client.client_name,
    client.client_business,
    client.pathway_name,
    client.offer_name,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

  return terms.every((term) => searchableText.includes(term));
}

function lookupMember(members: PipelineMember[], memberId?: string | null) {
  if (!memberId) return null;
  return members.find(
    (member) =>
      member.id === memberId || member.legacy_glide_row_id === memberId,
  );
}

function clientName(item: ClientPipelineItem, clients: PipelineClient[]) {
  const client = lookupClient(clients, item.client_id);
  return client?.client_name || item.client_name_snapshot || "Unnamed client";
}

function pathwayName(item: ClientPipelineItem, clients: PipelineClient[]) {
  const client = lookupClient(clients, item.client_id);
  return (
    client?.pathway_name ||
    client?.offer_name ||
    item.pathway_name_snapshot ||
    "No pathway"
  );
}

function targetOfferName(item: ClientPipelineItem, offers: PipelineOffer[]) {
  if (!item.target_offer_id) return null;
  return offers.find((offer) => offer.glide_row_id === item.target_offer_id)?.name || item.target_offer_id;
}

function stageSurface(stage: CompanyPipelineStage) {
  if (stage.stage_type === "won") return "border-emerald-200 bg-emerald-50/50";
  if (stage.stage_type === "lost") return "border-rose-200 bg-rose-50/50";
  return "border-[#dce5ef] bg-[#f7f9fc]";
}

function stageColor(value: string | null | undefined) {
  const colors: Record<string, string> = {
    slate: "#64748b",
    blue: "#3b82f6",
    violet: "#8b5cf6",
    amber: "#f59e0b",
    emerald: "#10b981",
    rose: "#f43f5e",
  };
  return colors[value ?? ""] || value || "#59abf0";
}

function PipelineCard({
  item,
  stage,
  clients,
  members,
  offers,
  canWrite,
  moving,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  item: ClientPipelineItem;
  stage: CompanyPipelineStage;
  clients: PipelineClient[];
  members: PipelineMember[];
  offers: PipelineOffer[];
  canWrite: boolean;
  moving: boolean;
  onOpen: () => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: (event: DragEvent<HTMLElement>) => void;
}) {
  const client = lookupClient(clients, item.client_id);
  const owner = lookupMember(members, item.owner_member_id);
  const followUp = dateKey(item.follow_up_at);
  const overdue =
    stage.stage_type === "open" && Boolean(followUp) && followUp < todayKey();
  const name = clientName(item, clients);
  const cardValue = stage.stage_type === "won"
    ? item.actual_value_cents ?? item.estimated_value_cents
    : item.estimated_value_cents;
  const valueLabel = stage.stage_type === "won" && item.actual_value_cents !== null && item.actual_value_cents !== undefined
    ? "Won value"
    : "Estimated";

  return (
    <article
      draggable={canWrite}
      tabIndex={0}
      role="button"
      onDragStart={canWrite ? onDragStart : undefined}
      onDragEnd={canWrite ? onDragEnd : undefined}
      onMouseDown={(event) => event.currentTarget.focus()}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className={`cursor-pointer rounded-lg border border-[#e4e9f0] bg-white p-3 shadow-sm transition hover:border-[#9bcdf7] hover:shadow ${
        moving ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        {client?.client_image ? (
          <img
            src={client.client_image}
            alt=""
            className="h-9 w-9 flex-none rounded-full object-cover"
          />
        ) : (
          <div className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[#eaf4fe] text-xs font-bold text-[#2b79c4]">
            {name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-[#162b3e]">{name}</h3>
          <p className="mt-0.5 truncate text-xs text-[#667085]">
            {pathwayName(item, clients)}
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-1.5 text-xs text-[#586273]">
        {targetOfferName(item, offers) ? <div className="flex justify-between gap-2"><span>Target offer</span><span className="truncate font-medium text-[#344054]">{targetOfferName(item, offers)}</span></div> : null}
        <div className="flex justify-between gap-2">
          <span>Assigned to</span>
          <span className="truncate font-medium text-[#344054]">
            {owner?.name || "Unassigned"}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Follow-up</span>
          <span className={overdue ? "font-semibold text-rose-700" : "font-medium text-[#344054]"}>
            {formatDate(item.follow_up_at)}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span>{valueLabel}</span>
          <span className="font-semibold text-[#344054]">
            {formatMoney(cardValue, item.currency_code || "USD")}
          </span>
        </div>
      </div>
      {overdue ? (
        <span className="mt-3 inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
          Follow-up overdue
        </span>
      ) : null}
    </article>
  );
}

interface ItemFormState {
  pipelineId: string;
  stageId: string;
  clientId: string;
  ownerMemberId: string;
  followUpDate: string;
  expectedCloseDate: string;
  renewalDate: string;
  estimatedValue: string;
  currencyCode: string;
  outcome: string;
  note: string;
  targetOfferId: string;
}

function formDraft(form: ItemFormState): PipelineItemDraft {
  return {
    ownerMemberId: form.ownerMemberId || null,
    followUpDate: form.followUpDate || null,
    expectedCloseDate: form.expectedCloseDate || null,
    renewalDate: form.renewalDate || null,
    estimatedValueCents: centsFromInput(form.estimatedValue),
    currencyCode: form.currencyCode.trim().toUpperCase() || "USD",
    outcome: form.outcome || null,
    note: form.note.trim() || null,
    targetOfferId: form.targetOfferId || null,
  };
}

function ManualItemModal({
  pipelines,
  stages,
  clients,
  members,
  offers,
  initialPipelineId,
  initialClientId,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  pipelines: CompanyPipeline[];
  stages: CompanyPipelineStage[];
  clients: PipelineClient[];
  members: PipelineMember[];
  offers: PipelineOffer[];
  initialPipelineId?: string;
  initialClientId?: string;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (form: ItemFormState) => void;
}) {
  const firstPipeline = pipelines.find((pipeline) => pipeline.id === initialPipelineId) ?? pipelines[0];
  const firstStage = stages.find((stage) => stage.pipeline_id === firstPipeline?.id && stage.stage_type === "open");
  const initialClient = initialClientId ? lookupClient(clients, initialClientId) : null;
  const [form, setForm] = useState<ItemFormState>({
    pipelineId: firstPipeline?.id ?? "",
    stageId: firstStage?.id ?? "",
    clientId: initialClient?.id ?? initialClientId ?? "",
    ownerMemberId: "",
    followUpDate: "",
    expectedCloseDate: "",
    renewalDate: "",
    estimatedValue: "",
    currencyCode: firstPipeline?.currency_code || "USD",
    outcome: "",
    note: "",
    targetOfferId: "",
  });
  const [clientSearch, setClientSearch] = useState(
    initialClient ? clientOptionLabel(initialClient) : "",
  );
  const [clientListOpen, setClientListOpen] = useState(false);
  const [activeClientIndex, setActiveClientIndex] = useState(-1);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const clientComboboxRef = useRef<HTMLDivElement>(null);
  const clientInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose, saving]);

  useEffect(() => {
    const closeClientList = (event: PointerEvent) => {
      if (!clientComboboxRef.current?.contains(event.target as Node)) {
        setClientListOpen(false);
        setActiveClientIndex(-1);
      }
    };
    document.addEventListener("pointerdown", closeClientList);
    return () => document.removeEventListener("pointerdown", closeClientList);
  }, []);

  const pipelineStages = stages.filter(
    (stage) => stage.pipeline_id === form.pipelineId && stage.stage_type === "open",
  );
  const selectedPipeline = pipelines.find((pipeline) => pipeline.id === form.pipelineId);
  const matchingClients = useMemo(
    () => clients.filter((client) => clientMatchesSearch(client, clientSearch)),
    [clientSearch, clients],
  );
  const selectedClient = lookupClient(clients, form.clientId);

  function setField<K extends keyof ItemFormState>(key: K, value: ItemFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handlePipeline(value: string) {
    const pipeline = pipelines.find((row) => row.id === value);
    setForm((current) => ({
      ...current,
      pipelineId: value,
      stageId: stages.find((stage) => stage.pipeline_id === value && stage.stage_type === "open")?.id ?? "",
      currencyCode: pipeline?.currency_code || current.currencyCode || "USD",
      targetOfferId: pipeline?.pipeline_type === "expansion" ? current.targetOfferId : "",
    }));
  }

  function selectClient(client: PipelineClient) {
    setField("clientId", client.id);
    setClientSearch(clientOptionLabel(client));
    setClientListOpen(false);
    setActiveClientIndex(-1);
  }

  function handleClientKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (clientListOpen) {
        event.preventDefault();
        event.stopPropagation();
        setClientListOpen(false);
        setActiveClientIndex(-1);
      }
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setClientListOpen(true);
      if (!matchingClients.length) return;
      setActiveClientIndex((current) => {
        if (event.key === "ArrowDown") {
          return current < matchingClients.length - 1 ? current + 1 : 0;
        }
        return current > 0 ? current - 1 : matchingClients.length - 1;
      });
      return;
    }

    if (event.key === "Enter" && clientListOpen && activeClientIndex >= 0) {
      const client = matchingClients[activeClientIndex];
      if (client) {
        event.preventDefault();
        selectClient(client);
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="pipeline-new-title" onKeyDown={trapDialogFocus}>
      <button type="button" aria-label="Close new pipeline item" className="absolute inset-0 bg-slate-950/45" onClick={onClose} />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!form.clientId || !form.pipelineId || !form.stageId) return;
          onSubmit(form);
        }}
        className="retainos-modal relative max-h-[92vh] w-full max-w-2xl overflow-y-auto"
      >
        <div className="retainos-modal-header flex items-start justify-between gap-4 px-6 py-5">
          <div>
            <h2 id="pipeline-new-title" ref={titleRef} tabIndex={-1} className="text-xl font-semibold text-[#162b3e]">
              New pipeline item
            </h2>
            <p className="mt-1 text-sm text-[#667085]">Track a specific renewal or expansion opportunity.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-2 text-[#667085] hover:bg-[#f2f4f7]">×</button>
        </div>
        <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-[#344054]">
            Pipeline
            <select required value={form.pipelineId} onChange={(event) => handlePipeline(event.target.value)} className="retainos-input mt-1">
              {pipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-[#344054]">
            Starting stage
            <select required value={form.stageId} onChange={(event) => setField("stageId", event.target.value)} className="retainos-input mt-1">
              {pipelineStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
            </select>
          </label>
          <div className="sm:col-span-2">
            <label htmlFor="pipeline-client" className="block text-sm font-semibold text-[#344054]">
              Client
            </label>
            <div ref={clientComboboxRef} className="relative mt-1">
              <input
                ref={clientInputRef}
                id="pipeline-client"
                type="text"
                required
                role="combobox"
                aria-autocomplete="list"
                aria-invalid={Boolean(clientSearch && !form.clientId)}
                aria-expanded={clientListOpen}
                aria-controls="pipeline-client-options"
                aria-activedescendant={clientListOpen && activeClientIndex >= 0 ? `pipeline-client-option-${activeClientIndex}` : undefined}
                aria-describedby="pipeline-client-results"
                value={clientSearch}
                onChange={(event) => {
                  setClientSearch(event.target.value);
                  setField("clientId", "");
                  setClientListOpen(true);
                  setActiveClientIndex(-1);
                }}
                onFocus={() => {
                  setClientListOpen(true);
                  setActiveClientIndex(-1);
                }}
                onKeyDown={handleClientKeyDown}
                placeholder="Type a client, business, pathway, or offer"
                className="retainos-input pr-10"
                autoComplete="off"
              />
              {clientSearch ? (
                <button
                  type="button"
                  aria-label="Clear client"
                  onClick={() => {
                    setClientSearch("");
                    setField("clientId", "");
                    setClientListOpen(true);
                    setActiveClientIndex(-1);
                    clientInputRef.current?.focus();
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-sm font-semibold text-[#667085] hover:bg-[#f2f4f7] hover:text-[#344054]"
                >
                  ×
                </button>
              ) : null}
              {clientListOpen ? (
                <div
                  id="pipeline-client-options"
                  role="listbox"
                  aria-label="Client results"
                  className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-[#d0d5dd] bg-white p-1 shadow-lg"
                >
                  {matchingClients.length ? matchingClients.map((client, index) => (
                    <div
                      id={`pipeline-client-option-${index}`}
                      key={client.id}
                      role="option"
                      aria-selected={client.id === form.clientId}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveClientIndex(index)}
                      onClick={() => selectClient(client)}
                      className={`cursor-pointer rounded-md px-3 py-2 text-sm ${
                        index === activeClientIndex
                          ? "bg-[#e9f3ff] text-[#175cd3]"
                          : client.id === form.clientId
                            ? "bg-[#f2f4f7] text-[#344054]"
                            : "text-[#344054] hover:bg-[#f9fafb]"
                      }`}
                    >
                      <span className="block font-semibold">{client.client_name?.trim() || client.client_business?.trim() || "Unnamed client"}</span>
                      {clientOptionLabel(client).includes(" — ") ? (
                        <span className="mt-0.5 block text-xs font-normal text-[#667085]">
                          {clientOptionLabel(client).split(" — ").slice(1).join(" — ")}
                        </span>
                      ) : null}
                    </div>
                  )) : (
                    <div className="px-3 py-4 text-sm text-[#667085]" role="status">
                      {clients.length
                        ? `No clients match “${clientSearch.trim()}”.`
                        : "No clients are available in your current scope."}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
            <p id="pipeline-client-results" className={`mt-1 text-xs ${matchingClients.length ? "text-[#667085]" : "text-amber-700"}`} aria-live="polite">
              {matchingClients.length
                ? selectedClient && clientSearch === clientOptionLabel(selectedClient)
                  ? `${clientOptionLabel(selectedClient)} selected.`
                  : `${matchingClients.length} ${matchingClients.length === 1 ? "client matches" : "clients match"}. Choose one from the results.`
                : clients.length
                  ? `No clients match “${clientSearch.trim()}”.`
                  : "No clients are available in your current scope."}
            </p>
          </div>
          {selectedPipeline?.pipeline_type === "expansion" ? <label className="block text-sm font-semibold text-[#344054] sm:col-span-2">Target offer <span className="font-normal text-[#667085]">(optional until Won)</span><select value={form.targetOfferId} onChange={(event) => setField("targetOfferId", event.target.value)} className="retainos-input mt-1"><option value="">Choose later</option>{offers.map((offer) => <option key={offer.glide_row_id} value={offer.glide_row_id}>{offer.name || offer.glide_row_id}</option>)}</select></label> : null}
          <label className="block text-sm font-semibold text-[#344054]">
            Assigned to
            <select value={form.ownerMemberId} onChange={(event) => setField("ownerMemberId", event.target.value)} className="retainos-input mt-1">
              <option value="">Unassigned</option>
              {members.filter((member) => member.status !== "archived").map((member) => <option key={member.id} value={member.id}>{member.name || "Unnamed member"}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-[#344054]">
            Estimated value
            <div className="mt-1 flex gap-2">
              <input type="number" min="0" step="0.01" value={form.estimatedValue} onChange={(event) => setField("estimatedValue", event.target.value)} className="retainos-input" />
              <input aria-label="Currency" maxLength={3} value={form.currencyCode} onChange={(event) => setField("currencyCode", event.target.value)} className="retainos-input w-24 uppercase" />
            </div>
          </label>
          <DateField label="Follow-up date" value={form.followUpDate} onChange={(value) => setField("followUpDate", value)} />
          <DateField label="Expected close" value={form.expectedCloseDate} onChange={(value) => setField("expectedCloseDate", value)} />
          <DateField label="Renewal date" value={form.renewalDate} onChange={(value) => setField("renewalDate", value)} />
          <label className="block text-sm font-semibold text-[#344054] sm:col-span-2">
            Note
            <textarea rows={3} value={form.note} onChange={(event) => setField("note", event.target.value)} className="retainos-input mt-1 resize-y" />
          </label>
          {error ? <div className="sm:col-span-2 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        </div>
        <div className="retainos-modal-footer flex justify-end gap-3 px-6 py-4">
          <button type="button" onClick={onClose} disabled={saving} className="retainos-button-secondary">Cancel</button>
          <button disabled={saving || !form.clientId || !form.pipelineId || !form.stageId} className="retainos-button-primary">{saving ? "Creating..." : "Create item"}</button>
        </div>
      </form>
    </div>
  );
}

function DateField({ label, value, onChange, disabled = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return (
    <label className="block text-sm font-semibold text-[#344054]">
      {label}
      <input disabled={disabled} type="date" value={value} onChange={(event) => onChange(event.target.value)} className="retainos-input mt-1" />
    </label>
  );
}

function WonResolutionModal({
  item,
  pipeline,
  client,
  offers,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  item: ClientPipelineItem;
  pipeline: CompanyPipeline;
  client: PipelineClient | null;
  offers: PipelineOffer[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (draft: PipelineWonDraft) => void;
}) {
  const [startDate, setStartDate] = useState(dateKey(item.renewal_at) || todayKey());
  const [endDate, setEndDate] = useState("");
  const [contractDays, setContractDays] = useState("");
  const [monthlyValue, setMonthlyValue] = useState("");
  const [totalValue, setTotalValue] = useState(inputFromCents(item.estimated_value_cents));
  const [autoRenew, setAutoRenew] = useState(false);
  const [note, setNote] = useState(item.current_note ?? "");
  const [targetOfferId, setTargetOfferId] = useState(item.target_offer_id ?? "");
  const currentProgramStatus = client?.program_status_value ?? null;
  const [retentionTargetStatus, setRetentionTargetStatus] = useState<"front-end" | "back-end">(
    currentProgramStatus === "back-end" ? "back-end" : "front-end",
  );
  const [programStatusTransition, setProgramStatusTransition] = useState<"immediate" | "on_contract_start">(
    (dateKey(item.renewal_at) || todayKey()) > todayKey() ? "on_contract_start" : "immediate",
  );
  const [markSuccess, setMarkSuccess] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose, saving]);

  const numberOrNull = (value: string) => value.trim() && Number.isFinite(Number(value)) ? Number(value) : null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="pipeline-won-title" onKeyDown={trapDialogFocus}>
      <button type="button" aria-label="Close Won resolution" className="absolute inset-0 bg-slate-950/45" onClick={onClose} />
      <form onSubmit={(event) => { event.preventDefault(); onSubmit({ startDate: startDate || null, endDate: endDate || null, contractDays: numberOrNull(contractDays), monthlyValue: numberOrNull(monthlyValue), totalContractValue: numberOrNull(totalValue), autoRenew, note: note.trim() || null, targetOfferId: pipeline.pipeline_type === "expansion" ? targetOfferId || null : null, retentionTargetStatus: pipeline.pipeline_type === "renewal" ? retentionTargetStatus : null, programStatusTransition: pipeline.pipeline_type === "renewal" ? programStatusTransition : null, markSuccess: pipeline.pipeline_type === "renewal" ? markSuccess : false }); }} className="retainos-modal relative max-h-[92vh] w-full max-w-2xl overflow-y-auto">
        <div className="retainos-modal-header px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Guided Won resolution</p>
          <h2 id="pipeline-won-title" ref={titleRef} tabIndex={-1} className="mt-1 text-xl font-semibold text-[#162b3e]">Confirm {pipeline.pipeline_type === "renewal" ? "renewal" : "expansion"} and contract</h2>
          <p className="mt-1 text-sm text-[#667085]">A Won move creates the linked commercial result and records its actual value.</p>
        </div>
        <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
          {pipeline.pipeline_type === "expansion" ? <label className="block text-sm font-semibold text-[#344054] sm:col-span-2">Target offer{offers.length ? <span className="text-rose-600"> *</span> : null}<select required={offers.length > 0} value={targetOfferId} onChange={(event) => setTargetOfferId(event.target.value)} className="retainos-input mt-1"><option value="">{offers.length ? "Choose the purchased offer" : "No active offers available"}</option>{offers.map((offer) => <option key={offer.glide_row_id} value={offer.glide_row_id}>{offer.name || offer.glide_row_id}</option>)}</select><span className="mt-1 block text-xs font-normal text-[#667085]">Creates an add-on contract for this offer. The client's primary pathway is not replaced.</span></label> : null}
          {pipeline.pipeline_type === "renewal" && currentProgramStatus === "front-end" ? <label className="block text-sm font-semibold text-[#344054] sm:col-span-2">Renewal outcome<select value={retentionTargetStatus} onChange={(event) => { const target = event.target.value as "front-end" | "back-end"; setRetentionTargetStatus(target); if (target === "back-end") setProgramStatusTransition(startDate > todayKey() ? "on_contract_start" : "immediate"); }} className="retainos-input mt-1"><option value="front-end">Continue current Front End program</option><option value="back-end">Move client to Back End</option></select></label> : null}
          <DateField label="Contract start" value={startDate} onChange={setStartDate} />
          <DateField label="Contract end" value={endDate} onChange={setEndDate} />
          {pipeline.pipeline_type === "renewal" && currentProgramStatus === "front-end" && retentionTargetStatus === "back-end" ? <label className="block text-sm font-semibold text-[#344054] sm:col-span-2">Move to Back End<select value={programStatusTransition} onChange={(event) => setProgramStatusTransition(event.target.value as "immediate" | "on_contract_start")} className="retainos-input mt-1"><option value="on_contract_start" disabled={!startDate || startDate <= todayKey()}>On contract start date{startDate > todayKey() ? ` (${startDate})` : ""}</option><option value="immediate">Now</option></select><span className="mt-1 block text-xs font-normal text-[#667085]">For an early renewal, keep the client in Front End until the new contract actually begins.</span></label> : null}
          {pipeline.pipeline_type === "renewal" && startDate > todayKey() ? <div className="sm:col-span-2 rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">The renewal is recorded as Won now. The new contract remains Pending and becomes current automatically on {startDate}.</div> : null}
          <label className="block text-sm font-semibold text-[#344054]">Contract days<input type="number" min="1" step="1" value={contractDays} onChange={(event) => setContractDays(event.target.value)} className="retainos-input mt-1" /></label>
          <label className="block text-sm font-semibold text-[#344054]">Monthly value<input type="number" min="0" step="0.01" value={monthlyValue} onChange={(event) => setMonthlyValue(event.target.value)} className="retainos-input mt-1" /></label>
          <label className="block text-sm font-semibold text-[#344054]">Total contract value<input type="number" min="0" step="0.01" value={totalValue} onChange={(event) => setTotalValue(event.target.value)} className="retainos-input mt-1" /></label>
          <label className="flex items-center gap-3 self-end rounded-md border border-[#dce5ef] px-4 py-2.5 text-sm font-semibold text-[#344054]"><input type="checkbox" checked={autoRenew} onChange={(event) => setAutoRenew(event.target.checked)} /> Auto-renew</label>
          {pipeline.pipeline_type === "renewal" ? <label className="flex items-center gap-3 rounded-md border border-[#dce5ef] px-4 py-2.5 text-sm font-semibold text-[#344054]"><input type="checkbox" checked={markSuccess} onChange={(event) => setMarkSuccess(event.target.checked)} /> Mark success</label> : null}
          <label className="block text-sm font-semibold text-[#344054] sm:col-span-2">Resolution note<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} className="retainos-input mt-1 resize-y" /></label>
          {error ? <div className="sm:col-span-2 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        </div>
        <div className="retainos-modal-footer flex justify-end gap-3 px-6 py-4"><button type="button" onClick={onClose} disabled={saving} className="retainos-button-secondary">Cancel</button><button disabled={saving || (!startDate && !endDate) || (pipeline.pipeline_type === "expansion" && offers.length > 0 && !targetOfferId)} className="retainos-button-primary">{saving ? "Confirming..." : "Confirm Won"}</button></div>
      </form>
    </div>
  );
}

function LostResolutionModal({ saving, error, onClose, onSubmit }: { saving: boolean; error: string | null; onClose: () => void; onSubmit: (draft: PipelineLostDraft) => void }) {
  const [lossReason, setLossReason] = useState("");
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose, saving]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="pipeline-lost-title" onKeyDown={trapDialogFocus}>
      <button type="button" aria-label="Close Lost resolution" className="absolute inset-0 bg-slate-950/45" onClick={onClose} />
      <form onSubmit={(event) => { event.preventDefault(); onSubmit({ lossReason: lossReason.trim(), outcome: outcome || null, note: note.trim() || null }); }} className="retainos-modal relative w-full max-w-xl">
        <div className="retainos-modal-header px-6 py-5"><p className="text-xs font-semibold uppercase tracking-wider text-rose-700">Guided Lost resolution</p><h2 id="pipeline-lost-title" ref={titleRef} tabIndex={-1} className="mt-1 text-xl font-semibold text-[#162b3e]">Record why this was not retained</h2></div>
        <div className="space-y-4 px-6 py-5">
          <label className="block text-sm font-semibold text-[#344054]">Loss reason <span className="text-rose-600">*</span><textarea required rows={3} value={lossReason} onChange={(event) => setLossReason(event.target.value)} className="retainos-input mt-1 resize-y" placeholder="What prevented the renewal or expansion?" /></label>
          <label className="block text-sm font-semibold text-[#344054]">Outcome<select value={outcome} onChange={(event) => setOutcome(event.target.value)} className="retainos-input mt-1"><option value="">No outcome selected</option>{OUTCOMES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="block text-sm font-semibold text-[#344054]">Internal note<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} className="retainos-input mt-1 resize-y" /></label>
          {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        </div>
        <div className="retainos-modal-footer flex justify-end gap-3 px-6 py-4"><button type="button" onClick={onClose} disabled={saving} className="retainos-button-secondary">Cancel</button><button disabled={saving || !lossReason.trim()} className="rounded-full bg-rose-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Recording..." : "Confirm Lost"}</button></div>
      </form>
    </div>
  );
}

function ItemDrawer({
  item,
  pipelines,
  stages,
  clients,
  members,
  offers,
  canWrite,
  saving,
  error,
  onClose,
  onSave,
  onArchive,
}: {
  item: ClientPipelineItem;
  pipelines: CompanyPipeline[];
  stages: CompanyPipelineStage[];
  clients: PipelineClient[];
  members: PipelineMember[];
  offers: PipelineOffer[];
  canWrite: boolean;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (stageId: string, draft: PipelineItemDraft) => void;
  onArchive: () => void;
}) {
  const [form, setForm] = useState<ItemFormState>({
    pipelineId: item.pipeline_id,
    stageId: item.stage_id,
    clientId: item.client_id,
    ownerMemberId: item.owner_member_id ?? "",
    followUpDate: dateKey(item.follow_up_at),
    expectedCloseDate: dateKey(item.expected_close_at),
    renewalDate: dateKey(item.renewal_at),
    estimatedValue: inputFromCents(item.estimated_value_cents),
    currencyCode: item.currency_code || "USD",
    outcome: item.outcome ?? "",
    note: item.current_note ?? "",
    targetOfferId: item.target_offer_id ?? "",
  });
  const closeRef = useRef<HTMLButtonElement>(null);
  const client = lookupClient(clients, item.client_id);
  const pipeline = pipelines.find((row) => row.id === item.pipeline_id);
  const pipelineStages = stages.filter((stage) => stage.pipeline_id === item.pipeline_id);

  useEffect(() => {
    closeRef.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose, saving]);

  function setField<K extends keyof ItemFormState>(key: K, value: ItemFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="pipeline-detail-title" onKeyDown={trapDialogFocus}>
      <button type="button" aria-label="Close pipeline detail" className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px]" onClick={() => { if (!saving) onClose(); }} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col border-l border-[#e4e9f0] bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#e4e9f0] px-6 py-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#667085]">{pipeline?.name || "Pipeline item"}</p>
            <h2 id="pipeline-detail-title" className="mt-1 truncate text-2xl font-semibold text-[#162b3e]">{clientName(item, clients)}</h2>
            <p className="mt-1 text-sm text-[#667085]">{client?.client_business || pathwayName(item, clients)}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="rounded-md p-2 text-[#667085] hover:bg-[#f2f4f7]">×</button>
        </div>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(form.stageId, formDraft(form));
          }}
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <label className="block text-sm font-semibold text-[#344054]">
              Stage
              <select disabled={!canWrite || saving} value={form.stageId} onChange={(event) => setField("stageId", event.target.value)} className="retainos-input mt-1">
                {pipelineStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold text-[#344054]">
              Assigned to
              <select disabled={!canWrite || saving} value={form.ownerMemberId} onChange={(event) => setField("ownerMemberId", event.target.value)} className="retainos-input mt-1">
                <option value="">Unassigned</option>
                {members.filter((member) => member.status !== "archived").map((member) => <option key={member.id} value={member.id}>{member.name || "Unnamed member"}</option>)}
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <DateField disabled={!canWrite || saving} label="Follow-up date" value={form.followUpDate} onChange={(value) => setField("followUpDate", value)} />
              <DateField disabled={!canWrite || saving} label="Expected close" value={form.expectedCloseDate} onChange={(value) => setField("expectedCloseDate", value)} />
              <DateField disabled={!canWrite || saving} label="Renewal date" value={form.renewalDate} onChange={(value) => setField("renewalDate", value)} />
              <label className="block text-sm font-semibold text-[#344054]">
                Estimated value
                <div className="mt-1 flex gap-2">
                  <input disabled={!canWrite || saving} type="number" min="0" step="0.01" value={form.estimatedValue} onChange={(event) => setField("estimatedValue", event.target.value)} className="retainos-input" />
                  <input disabled={!canWrite || saving} aria-label="Currency" maxLength={3} value={form.currencyCode} onChange={(event) => setField("currencyCode", event.target.value)} className="retainos-input w-24 uppercase" />
                </div>
              </label>
            </div>
            <label className="block text-sm font-semibold text-[#344054]">
              Outcome
              <select disabled={!canWrite || saving} value={form.outcome} onChange={(event) => setField("outcome", event.target.value)} className="retainos-input mt-1">
                <option value="">No outcome</option>
                {OUTCOMES.map((outcome) => <option key={outcome} value={outcome}>{outcome}</option>)}
              </select>
            </label>
            {pipeline?.pipeline_type === "expansion" ? <label className="block text-sm font-semibold text-[#344054]">Target offer<select disabled={!canWrite || saving} value={form.targetOfferId} onChange={(event) => setField("targetOfferId", event.target.value)} className="retainos-input mt-1"><option value="">Not selected</option>{offers.map((offer) => <option key={offer.glide_row_id} value={offer.glide_row_id}>{offer.name || offer.glide_row_id}</option>)}</select></label> : null}
            <label className="block text-sm font-semibold text-[#344054]">
              Note
              <textarea disabled={!canWrite || saving} rows={6} value={form.note} onChange={(event) => setField("note", event.target.value)} className="retainos-input mt-1 resize-y" />
            </label>
            {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
            {!canWrite ? <div className="rounded-md border border-[#dce5ef] bg-[#f7f9fc] px-4 py-3 text-sm text-[#586273]">This pipeline is read-only for your account.</div> : null}
          </div>
          <div className="retainos-modal-footer flex flex-wrap items-center justify-between gap-3 px-6 py-4">
            <button type="button" onClick={onArchive} disabled={!canWrite || saving} className="rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Archive</button>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} disabled={saving} className="retainos-button-secondary">Close</button>
              {canWrite ? <button disabled={saving} className="retainos-button-primary">{saving ? "Saving..." : "Save changes"}</button> : null}
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}

export function Pipeline() {
  const { effectiveCompanyId } = useAccountContext();
  const [searchParams] = useSearchParams();
  const linkedItemId = searchParams.get("item");
  const shortcutClientId = searchParams.get("client");
  const requestsExpansion = searchParams.get("new") === "expansion";
  const [workspace, setWorkspace] = useState<PipelineWorkspace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedPipelineIds, setSelectedPipelineIds] = useState<Set<string>>(new Set());
  const [pathwayFilter, setPathwayFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [search, setSearch] = useState("");
  const [dateKind, setDateKind] = useState<DateKind>("follow_up");
  const [dateWindow, setDateWindow] = useState<DateWindow>("all");
  const [selectedMonth, setSelectedMonth] = useState(monthFromToday(0));
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [newItemOpen, setNewItemOpen] = useState(false);
  const [newItemDefaults, setNewItemDefaults] = useState<{ pipelineId?: string; clientId?: string }>({});
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [terminalResolution, setTerminalResolution] = useState<{ itemId: string; type: "won" | "lost" } | null>(null);
  const [lostSuccess, setLostSuccess] = useState<{ clientId: string; name: string } | null>(null);
  const [scanResult, setScanResult] = useState<{ createdCount: number; skippedCount: number } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [movingItemId, setMovingItemId] = useState<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const dragHandledRef = useRef(false);
  const openerRef = useRef<HTMLElement | null>(null);
  const shortcutHandledRef = useRef("");

  useEffect(() => {
    try {
      window.sessionStorage.setItem(PIPELINE_VIEW_KEY, viewMode);
    } catch {
      // View persistence is optional.
    }
  }, [viewMode]);

  useEffect(() => {
    if (!effectiveCompanyId) {
      setWorkspace(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setWorkspace(null);
    loadPipelineWorkspace(effectiveCompanyId)
      .then((result) => {
        if (cancelled) return;
        setWorkspace(result);
        setSelectedPipelineIds(new Set());
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load Pipeline.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveCompanyId, reloadKey]);

  useEffect(() => {
    if (linkedItemId && workspace?.items.some((item) => item.id === linkedItemId)) {
      setSelectedItemId(linkedItemId);
    }
  }, [linkedItemId, workspace]);

  const pipelines = useMemo(
    () => (workspace ? orderedPipelines(workspace) : []),
    [workspace],
  );
  const visiblePipelineIds = useMemo(
    () =>
      new Set(
        selectedPipelineIds.size > 0
          ? [...selectedPipelineIds]
          : pipelines.map((pipeline) => pipeline.id),
      ),
    [pipelines, selectedPipelineIds],
  );
  const visiblePipelineTypes = useMemo(
    () => new Set(pipelines.filter((pipeline) => visiblePipelineIds.has(pipeline.id)).map((pipeline) => pipeline.pipeline_type)),
    [pipelines, visiblePipelineIds],
  );

  useEffect(() => {
    if (dateKind === "renewal" && !visiblePipelineTypes.has("renewal")) setDateKind("follow_up");
    if (dateKind === "expected_close" && !visiblePipelineTypes.has("expansion")) setDateKind("follow_up");
  }, [dateKind, visiblePipelineTypes]);
  const stages = useMemo(
    () => (workspace ? orderedStages(workspace, visiblePipelineIds) : []),
    [visiblePipelineIds, workspace],
  );
  const allStages = useMemo(
    () =>
      workspace
        ? orderedStages(workspace, new Set(pipelines.map((pipeline) => pipeline.id)))
        : [],
    [pipelines, workspace],
  );

  useEffect(() => {
    if (!workspace?.canWrite || !requestsExpansion || !shortcutClientId) return;
    const key = `${effectiveCompanyId}:${shortcutClientId}`;
    if (shortcutHandledRef.current === key) return;
    const pipeline = pipelines.find((row) => row.pipeline_type === "expansion");
    const client = workspace.clients.find((row) => row.id === shortcutClientId || row.glide_row_id === shortcutClientId);
    if (!pipeline || !client) return;
    shortcutHandledRef.current = key;
    setNewItemDefaults({ pipelineId: pipeline.id, clientId: client.id });
    setNewItemOpen(true);
  }, [effectiveCompanyId, pipelines, requestsExpansion, shortcutClientId, workspace]);

  const pathways = useMemo(() => {
    if (!workspace) return [];
    const values = new Map<string, string>();
    workspace.clients.forEach((client) => {
      const id = client.pathway_id || client.offer_id;
      const name = client.pathway_name || client.offer_name;
      if (id && name) values.set(id, name);
    });
    workspace.items.forEach((item) => {
      if (item.pathway_id_snapshot && item.pathway_name_snapshot) {
        values.set(item.pathway_id_snapshot, item.pathway_name_snapshot);
      }
    });
    return [...values.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  }, [workspace]);

  const filteredItems = useMemo(() => {
    if (!workspace) return [];
    const query = search.trim().toLowerCase();
    const today = todayKey();
    const end = addDays(today, 30);
    return workspace.items.filter((item) => {
      if (item.archived_at || item.lifecycle_status === "archived") return false;
      if (!visiblePipelineIds.has(item.pipeline_id)) return false;
      const client = lookupClient(workspace.clients, item.client_id);
      const itemPathwayId = client?.pathway_id || client?.offer_id || item.pathway_id_snapshot;
      if (pathwayFilter && itemPathwayId !== pathwayFilter) return false;
      const ownerIds = [item.owner_member_id, lookupMember(workspace.members, item.owner_member_id)?.legacy_glide_row_id].filter(Boolean);
      if (ownerFilter && !ownerIds.includes(ownerFilter)) return false;
      if (query) {
        const haystack = [
          clientName(item, workspace.clients),
          client?.client_business,
          item.client_business_snapshot,
          pathwayName(item, workspace.clients),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      const value = dateKey(
        dateKind === "follow_up"
          ? item.follow_up_at
          : dateKind === "renewal"
            ? item.renewal_at
            : item.expected_close_at,
      );
      if (dateWindow === "no_date" && value) return false;
      if (dateWindow === "overdue" && (!value || value >= today)) return false;
      if (dateWindow === "next_30" && (!value || value < today || value > end)) return false;
      if (dateWindow === "this_month" && (!value || value.slice(0, 7) !== monthFromToday(0))) return false;
      if (dateWindow === "next_month" && (!value || value.slice(0, 7) !== monthFromToday(1))) return false;
      if (dateWindow === "month" && (!value || value.slice(0, 7) !== selectedMonth)) return false;
      return true;
    });
  }, [dateKind, dateWindow, ownerFilter, pathwayFilter, search, selectedMonth, visiblePipelineIds, workspace]);

  const stageById = useMemo(
    () => new Map((workspace?.stages ?? []).map((stage) => [stage.id, stage])),
    [workspace],
  );
  const pipelineById = useMemo(
    () => new Map(pipelines.map((pipeline) => [pipeline.id, pipeline])),
    [pipelines],
  );
  const selectedItem = workspace?.items.find((item) => item.id === selectedItemId) ?? null;
  const resolutionItem = workspace?.items.find((item) => item.id === terminalResolution?.itemId) ?? null;
  const resolutionPipeline = pipelines.find((pipeline) => pipeline.id === resolutionItem?.pipeline_id) ?? null;
  const resolutionClient = workspace && resolutionItem
    ? lookupClient(workspace.clients, resolutionItem.client_id) ?? null
    : null;
  const canManageRenewalScan = workspace?.canWrite && workspace.actorRole === "super_admin";
  const renewalScanPipeline = pipelines.find(
    (pipeline) =>
      pipeline.pipeline_type === "renewal" &&
      pipeline.auto_create_renewals === true &&
      pipeline.renewal_generation_enabled === true &&
      pipeline.automation_paused !== true,
  );
  const canRunRenewalScan = Boolean(canManageRenewalScan && renewalScanPipeline);
  const openItems = filteredItems.filter((item) => stageById.get(item.stage_id)?.stage_type === "open");
  const wonItems = filteredItems.filter((item) => stageById.get(item.stage_id)?.stage_type === "won");
  const overdueFollowUps = openItems.filter((item) => dateKey(item.follow_up_at) && dateKey(item.follow_up_at) < todayKey());
  const projectedValue = formatMoneyTotals(openItems, (item) => item.estimated_value_cents);
  const wonValue = formatMoneyTotals(
    wonItems,
    (item) => item.actual_value_cents ?? item.estimated_value_cents,
  );

  function replaceItem(item: ClientPipelineItem) {
    setWorkspace((current) =>
      current
        ? {
            ...current,
            items: item.archived_at || item.lifecycle_status === "archived"
              ? current.items.filter((row) => row.id !== item.id)
              : current.items.map((row) => (row.id === item.id ? item : row)),
          }
        : current,
    );
  }

  function openItem(itemId: string, opener?: HTMLElement | null) {
    openerRef.current = opener ?? (document.activeElement as HTMLElement | null);
    setActionError(null);
    setSelectedItemId(itemId);
  }

  function closeItem() {
    setSelectedItemId(null);
    setActionError(null);
    window.setTimeout(() => openerRef.current?.focus(), 0);
  }

  async function moveItem(itemId: string, stageId: string) {
    if (!workspace?.canWrite || !effectiveCompanyId) return;
    const item = workspace.items.find((row) => row.id === itemId);
    const targetStage = workspace.stages.find((stage) => stage.id === stageId);
    if (!item || !targetStage || targetStage.pipeline_id !== item.pipeline_id || item.stage_id === stageId) return;
    if (targetStage.stage_type === "won" || targetStage.stage_type === "lost") {
      setActionError(null);
      setTerminalResolution({ itemId, type: targetStage.stage_type });
      return;
    }
    const note = targetStage.requires_note
      ? window.prompt(`Add the required note before moving to ${targetStage.name}.`)?.trim()
      : null;
    if (targetStage.requires_note && !note) {
      setActionError(`A note is required to move an item to ${targetStage.name}.`);
      return;
    }
    const previous = item;
    setMovingItemId(itemId);
    setActionError(null);
    replaceItem({ ...item, stage_id: stageId });
    try {
      const result = await movePipelineItemStage(effectiveCompanyId, itemId, stageId, note);
      replaceItem(result.item);
    } catch (reason) {
      replaceItem(previous);
      setActionError(reason instanceof Error ? reason.message : "Unable to move item.");
    } finally {
      setMovingItemId(null);
    }
  }

  function handleDragStart(event: DragEvent<HTMLElement>, itemId: string) {
    dragHandledRef.current = false;
    setDraggingItemId(itemId);
    event.dataTransfer.setData("text/plain", itemId);
    event.dataTransfer.effectAllowed = "move";
  }

  async function handleDrop(event: DragEvent<HTMLElement>, stageId: string) {
    event.preventDefault();
    dragHandledRef.current = true;
    const itemId = event.dataTransfer.getData("text/plain") || draggingItemId;
    setDraggingItemId(null);
    setDragOverStageId(null);
    if (itemId) await moveItem(itemId, stageId);
  }

  async function handleDragEnd(event: DragEvent<HTMLElement>) {
    if (dragHandledRef.current) {
      dragHandledRef.current = false;
      return;
    }
    const itemId = draggingItemId;
    setDraggingItemId(null);
    setDragOverStageId(null);
    if (!itemId || !workspace?.canWrite) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-pipeline-stage]");
    if (target?.dataset.pipelineStage) await moveItem(itemId, target.dataset.pipelineStage);
  }

  async function handleCreate(form: ItemFormState) {
    if (!effectiveCompanyId || !workspace) return;
    setSaving(true);
    setActionError(null);
    try {
      const result = await createPipelineItem(effectiveCompanyId, {
        pipelineId: form.pipelineId,
        stageId: form.stageId,
        clientId: form.clientId,
        ...formDraft(form),
      });
      setWorkspace({ ...workspace, items: [result.item, ...workspace.items] });
      setNewItemOpen(false);
      setNewItemDefaults({});
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Unable to create item.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(stageId: string, draft: PipelineItemDraft) {
    if (!effectiveCompanyId || !selectedItem) return;
    const targetStage = workspace?.stages.find((stage) => stage.id === stageId);
    if (stageId !== selectedItem.stage_id && (targetStage?.stage_type === "won" || targetStage?.stage_type === "lost")) {
      setActionError(null);
      setTerminalResolution({ itemId: selectedItem.id, type: targetStage.stage_type });
      return;
    }
    setSaving(true);
    setActionError(null);
    try {
      const { targetOfferId, ...itemDraft } = draft;
      let canonical = (
        await updatePipelineItem(effectiveCompanyId, selectedItem.id, {
          ...itemDraft,
          stageId,
        })
      ).item;
      if (targetOfferId !== undefined && targetOfferId !== (selectedItem.target_offer_id ?? null)) {
        canonical = (
          await updatePipelineItem(effectiveCompanyId, selectedItem.id, {
            targetOfferId,
          })
        ).item;
      }
      replaceItem(canonical);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Unable to save item.");
    } finally {
      setSaving(false);
    }
  }

  async function handleWonResolution(draft: PipelineWonDraft) {
    if (!effectiveCompanyId || !terminalResolution) return;
    setSaving(true);
    setActionError(null);
    try {
      const result = await resolvePipelineWon(effectiveCompanyId, terminalResolution.itemId, draft);
      replaceItem(result.item);
      setTerminalResolution(null);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Unable to resolve item as Won.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLostResolution(draft: PipelineLostDraft) {
    if (!effectiveCompanyId || !terminalResolution || !workspace) return;
    const item = workspace.items.find((row) => row.id === terminalResolution.itemId);
    if (!item) return;
    setSaving(true);
    setActionError(null);
    try {
      const result = await resolvePipelineLost(effectiveCompanyId, item.id, draft);
      replaceItem(result.item);
      const client = lookupClient(workspace.clients, item.client_id);
      setLostSuccess({ clientId: client?.glide_row_id || client?.id || item.client_id, name: clientName(item, workspace.clients) });
      setTerminalResolution(null);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Unable to resolve item as Lost.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRenewalScan() {
    if (!effectiveCompanyId || !workspace || !canRunRenewalScan) return;
    setScanning(true);
    setActionError(null);
    setScanResult(null);
    try {
      const result = await runPipelineRenewalScan(effectiveCompanyId);
      setScanResult({ createdCount: result.createdCount, skippedCount: result.skippedCount });
      if (result.items?.length) {
        setWorkspace((current) => {
          if (!current) return current;
          const ids = new Set(result.items?.map((item) => item.id));
          return { ...current, items: [...(result.items ?? []), ...current.items.filter((item) => !ids.has(item.id))] };
        });
      }
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Unable to run the renewal scan.");
    } finally {
      setScanning(false);
    }
  }

  async function handleArchive() {
    if (!effectiveCompanyId || !selectedItem || !window.confirm(`Archive ${clientName(selectedItem, workspace?.clients ?? [])}?`)) return;
    setSaving(true);
    setActionError(null);
    try {
      const result = await archivePipelineItem(effectiveCompanyId, selectedItem.id);
      replaceItem(result.item);
      closeItem();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Unable to archive item.");
    } finally {
      setSaving(false);
    }
  }

  if (!effectiveCompanyId) {
    return <div className="rounded-lg border border-amber-200 bg-amber-50 p-8 text-center text-amber-900"><h1 className="text-lg font-semibold">Select a company to open Pipeline</h1><p className="mt-2 text-sm">Choose a company from the workspace switcher first.</p></div>;
  }
  if (loading) {
    return <div className="flex items-center justify-center py-24" aria-label="Loading Pipeline"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#59abf0]" /></div>;
  }
  if (error || !workspace) {
    return <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-rose-800"><h1 className="font-semibold">Pipeline could not load</h1><p className="mt-2 text-sm">{error || "The workspace response was unavailable."}</p><button type="button" onClick={() => setReloadKey((key) => key + 1)} className="mt-4 rounded-md border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-800">Retry</button></div>;
  }
  if (!workspace.enabled) {
    return <div className="rounded-lg border border-dashed border-[#cbd2dc] bg-white p-10 text-center"><h1 className="text-xl font-semibold text-[#162b3e]">Pipeline is not enabled</h1><p className="mx-auto mt-2 max-w-xl text-sm text-[#667085]">A Director or Super Admin can configure and enable Pipeline from Admin Hub.</p></div>;
  }
  if (pipelines.length === 0) {
    return <div className="rounded-lg border border-dashed border-[#cbd2dc] bg-white p-10 text-center"><h1 className="text-xl font-semibold text-[#162b3e]">No active pipelines</h1><p className="mt-2 text-sm text-[#667085]">Enable at least one configured pipeline in Admin Hub to begin.</p></div>;
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#162b3e]">Pipeline</h1>
          <p className="mt-1 text-sm text-[#667085]">Manage renewals and expansion opportunities without leaving the workspace.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManageRenewalScan ? (
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <button type="button" onClick={() => void handleRenewalScan()} disabled={!canRunRenewalScan || scanning} aria-describedby={!canRunRenewalScan ? "renewal-scan-unavailable" : undefined} className="retainos-button-secondary disabled:cursor-not-allowed disabled:opacity-50">{scanning ? "Scanning..." : "Run renewal scan"}</button>
              {!canRunRenewalScan ? <p id="renewal-scan-unavailable" className="max-w-xs text-left text-xs text-[#667085] sm:text-right">Automatic renewal entry is off for this pilot. Renewal scanning requires a separate automation approval.</p> : null}
            </div>
          ) : null}
          {workspace.canWrite ? <button type="button" onClick={() => { setActionError(null); setNewItemOpen(true); }} className="retainos-button-primary">New pipeline item</button> : <span className="rounded-full border border-[#dce5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#667085]">Read-only</span>}
        </div>
      </div>

      {scanResult ? <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900"><span>Renewal scan complete: <strong>{scanResult.createdCount}</strong> created · <strong>{scanResult.skippedCount}</strong> already tracked.</span><button type="button" onClick={() => setScanResult(null)} aria-label="Dismiss scan result">×</button></div> : null}
      {lostSuccess ? <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><span><strong>{lostSuccess.name}</strong> was recorded as Lost. Review the client before offboarding.</span><div className="flex items-center gap-3"><Link to={`/clients/${lostSuccess.clientId}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#2b79c4] hover:underline">Open client to offboard</Link><button type="button" onClick={() => setLostSuccess(null)} aria-label="Dismiss Lost result">×</button></div></div> : null}

      <div className="mb-5 overflow-x-auto pb-1">
        <div className="flex min-w-max gap-2" aria-label="Pipeline selection">
          <button type="button" aria-pressed={selectedPipelineIds.size === 0} onClick={() => setSelectedPipelineIds(new Set())} className={`rounded-full border px-4 py-2 text-sm font-semibold ${selectedPipelineIds.size === 0 ? "border-[#59abf0] bg-[#59abf0] text-[#162b3e]" : "border-[#cbd2dc] bg-white text-[#586273]"}`}>All</button>
          {pipelines.map((pipeline) => {
            const active = selectedPipelineIds.has(pipeline.id);
            return <button key={pipeline.id} type="button" aria-pressed={active} onClick={() => setSelectedPipelineIds((current) => { const next = new Set(current); if (next.has(pipeline.id)) next.delete(pipeline.id); else next.add(pipeline.id); return next; })} className={`rounded-full border px-4 py-2 text-sm font-semibold ${active ? "border-[#59abf0] bg-[#eaf4fe] text-[#2b79c4]" : "border-[#cbd2dc] bg-white text-[#586273] hover:border-[#59abf0]"}`}>{pipeline.name}</button>;
          })}
        </div>
      </div>

      <section className="retainos-section mb-5 p-5" aria-label="Pipeline filters">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
          <label className="xl:col-span-2"><span className="retainos-field-label">Pathway</span><select value={pathwayFilter} onChange={(event) => setPathwayFilter(event.target.value)} className="retainos-input"><option value="">All pathways</option>{pathways.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          <label className="xl:col-span-2"><span className="retainos-field-label">Assigned to</span><select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} className="retainos-input"><option value="">All users</option>{workspace.members.filter((member) => member.status !== "archived").map((member) => <option key={member.id} value={member.id}>{member.name || "Unnamed member"}</option>)}</select></label>
          <label className="xl:col-span-3"><span className="retainos-field-label">Search clients</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Client or business name" className="retainos-input" /></label>
          <div className="xl:col-span-3"><span className="retainos-field-label">Timing type</span><div className="flex min-h-10 flex-wrap items-center gap-1 rounded-md border border-[#d0d5dd] bg-white p-1" aria-label="Timing type">{([{ value: "follow_up", label: "Follow-up", visible: true }, { value: "renewal", label: "Renewal", visible: visiblePipelineTypes.has("renewal") }, { value: "expected_close", label: "Expansion close", visible: visiblePipelineTypes.has("expansion") }] as { value: DateKind; label: string; visible: boolean }[]).filter((option) => option.visible).map((option) => <button key={option.value} type="button" aria-pressed={dateKind === option.value} onClick={() => setDateKind(option.value)} className={`rounded px-2.5 py-1.5 text-xs font-semibold ${dateKind === option.value ? "bg-[#162b3e] text-white" : "text-[#586273] hover:bg-[#f2f4f7]"}`}>{option.label}</button>)}</div></div>
          <label className="xl:col-span-2"><span className="retainos-field-label">Time window</span><select value={dateWindow} onChange={(event) => setDateWindow(event.target.value as DateWindow)} className="retainos-input"><option value="all">Any date</option><option value="overdue">Overdue</option><option value="next_30">Next 30 days</option><option value="this_month">This month</option><option value="next_month">Next month</option><option value="month">Choose month…</option><option value="no_date">No date</option></select>{dateWindow === "month" ? <input aria-label={`Selected ${dateKind === "follow_up" ? "follow-up" : dateKind === "renewal" ? "renewal" : "expansion close"} month`} type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} className="retainos-input mt-2" /> : null}</label>
        </div>
        <div className="mt-4 flex justify-end"><div className="inline-flex rounded-lg border border-[#dce5ef] bg-white p-1"><button type="button" onClick={() => setViewMode("board")} className={`rounded-md px-4 py-1.5 text-sm font-semibold ${viewMode === "board" ? "bg-[#162b3e] text-white" : "text-[#586273]"}`}>Board</button><button type="button" onClick={() => setViewMode("list")} className={`rounded-md px-4 py-1.5 text-sm font-semibold ${viewMode === "list" ? "bg-[#162b3e] text-white" : "text-[#586273]"}`}>List</button></div></div>
      </section>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[['Open items', openItems.length.toLocaleString()], ['Follow-ups overdue', overdueFollowUps.length.toLocaleString()], ['Projected value', projectedValue], ['Won value', wonValue]].map(([label, value]) => <div key={label} className="retainos-section px-4 py-3"><div className="text-[11px] font-semibold uppercase tracking-wider text-[#667085]">{label}</div><div className="mt-1 text-base font-semibold text-[#162b3e]">{value}</div></div>)}
      </div>

      {actionError && !selectedItem && !newItemOpen ? <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{actionError}</div> : null}
      {filteredItems.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#cbd2dc] bg-white p-10 text-center text-[#667085]">No pipeline items match this view.</div>
      ) : viewMode === "list" ? (
        <div className="overflow-x-auto rounded-lg border border-[#e4e9f0] bg-white shadow-sm">
          <table className="min-w-full divide-y divide-[#e4e9f0] text-left text-sm">
            <thead className="bg-[#f7f9fc] text-xs uppercase tracking-wider text-[#667085]"><tr><th className="px-4 py-3">Client</th><th className="px-4 py-3">Pipeline</th><th className="px-4 py-3">Stage</th><th className="px-4 py-3">Assigned to</th><th className="px-4 py-3">Follow-up</th><th className="px-4 py-3">Renewal</th><th className="px-4 py-3 text-right">Value</th></tr></thead>
            <tbody className="divide-y divide-[#eef2f6]">{filteredItems.map((item) => { const stage = stageById.get(item.stage_id); const owner = lookupMember(workspace.members, item.owner_member_id); const value = stage?.stage_type === "won" ? item.actual_value_cents ?? item.estimated_value_cents : item.estimated_value_cents; return <tr key={item.id} tabIndex={0} onClick={(event) => openItem(item.id, event.currentTarget)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openItem(item.id, event.currentTarget); } }} className="cursor-pointer hover:bg-[#f8fbfe]"><td className="px-4 py-3 font-semibold text-[#162b3e]">{clientName(item, workspace.clients)}</td><td className="px-4 py-3 text-[#586273]">{pipelineById.get(item.pipeline_id)?.name || "—"}</td><td className="px-4 py-3"><span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stageColor(stage?.color) }} />{stage?.name || "Unknown"}</span></td><td className="px-4 py-3 text-[#586273]">{owner?.name || "Unassigned"}</td><td className="px-4 py-3 text-[#586273]">{formatDate(item.follow_up_at)}</td><td className="px-4 py-3 text-[#586273]">{formatDate(item.renewal_at)}</td><td className="px-4 py-3 text-right font-semibold text-[#344054]">{formatMoney(value, item.currency_code || "USD")}</td></tr>; })}</tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto pb-3">
          <div className="flex min-w-max gap-4">
            {stages.map((stage) => { const stageItems = filteredItems.filter((item) => item.stage_id === stage.id); return <section key={stage.id} data-pipeline-stage={stage.id} onDragOver={(event) => { if (!workspace.canWrite) return; event.preventDefault(); setDragOverStageId(stage.id); }} onDragLeave={() => setDragOverStageId(null)} onDrop={(event) => void handleDrop(event, stage.id)} className={`w-[300px] flex-none rounded-lg border transition ${dragOverStageId === stage.id ? "border-[#59abf0] bg-[#eaf4fe]" : stageSurface(stage)}`}><div className="flex items-start justify-between gap-2 border-b border-inherit px-4 py-3"><div className="min-w-0"><p className="truncate text-[10px] font-semibold uppercase tracking-wider text-[#98a2b3]">{pipelineById.get(stage.pipeline_id)?.name}</p><h2 className="mt-1 flex items-center gap-2 text-sm font-semibold text-[#162b3e]"><span className="h-3 w-3 flex-none rounded-full" style={{ backgroundColor: stageColor(stage.color) }} />{stage.name}</h2></div><span className="rounded-full border border-[#dce5ef] bg-white px-2 py-0.5 text-xs font-semibold text-[#586273]">{stageItems.length}</span></div><div className="min-h-64 space-y-3 p-3">{stageItems.map((item) => <PipelineCard key={item.id} item={item} stage={stage} clients={workspace.clients} members={workspace.members} offers={workspace.offers} canWrite={workspace.canWrite} moving={movingItemId === item.id} onOpen={() => openItem(item.id)} onDragStart={(event) => handleDragStart(event, item.id)} onDragEnd={(event) => void handleDragEnd(event)} />)}{stageItems.length === 0 ? <p className="px-2 py-6 text-center text-xs text-[#98a2b3]">No items</p> : null}</div></section>; })}
          </div>
        </div>
      )}

      {newItemOpen ? <ManualItemModal pipelines={pipelines} stages={allStages} clients={workspace.clients} members={workspace.members} offers={workspace.offers} initialPipelineId={newItemDefaults.pipelineId} initialClientId={newItemDefaults.clientId} saving={saving} error={actionError} onClose={() => { if (!saving) { setNewItemOpen(false); setNewItemDefaults({}); setActionError(null); } }} onSubmit={(form) => void handleCreate(form)} /> : null}
      {selectedItem ? <ItemDrawer key={`${selectedItem.id}:${selectedItem.updated_at ?? ""}`} item={selectedItem} pipelines={pipelines} stages={allStages} clients={workspace.clients} members={workspace.members} offers={workspace.offers} canWrite={workspace.canWrite} saving={saving} error={actionError} onClose={closeItem} onSave={(stageId, draft) => void handleSave(stageId, draft)} onArchive={() => void handleArchive()} /> : null}
      {terminalResolution?.type === "won" && resolutionItem && resolutionPipeline ? <WonResolutionModal key={resolutionItem.id} item={resolutionItem} pipeline={resolutionPipeline} client={resolutionClient} offers={workspace.offers} saving={saving} error={actionError} onClose={() => { if (!saving) { setTerminalResolution(null); setActionError(null); } }} onSubmit={(draft) => void handleWonResolution(draft)} /> : null}
      {terminalResolution?.type === "lost" && resolutionItem ? <LostResolutionModal key={resolutionItem.id} saving={saving} error={actionError} onClose={() => { if (!saving) { setTerminalResolution(null); setActionError(null); } }} onSubmit={(draft) => void handleLostResolution(draft)} /> : null}
      <p className="mt-6 text-xs text-[#98a2b3]">Pipeline items are commercial events. Renewal scans and stage-linked tasks remain controlled by company configuration; Daily Pulse-specific Pipeline views arrive later. <Link to="/admin" className="font-semibold text-[#2b79c4] hover:underline">Open Admin Hub</Link></p>
    </div>
  );
}
