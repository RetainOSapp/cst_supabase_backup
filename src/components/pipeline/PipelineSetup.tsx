import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase.ts";
import type {
  PipelineDefinition,
  PipelineStage,
  PipelineStageType,
  PipelineType,
  PipelineValueSource,
} from "../../lib/pipeline.ts";

interface PipelineConfigurationPayload {
  masterEnabled: boolean;
  directorAccessEnabled: boolean;
  supportAccessEnabled: boolean;
  csmAccessEnabled: boolean;
  viewerAccessEnabled: boolean;
  pipelines: PipelineDefinition[];
  stages: PipelineStage[];
}

interface PipelineSetupProps {
  companyLegacyId: string;
  canManage: boolean;
  canManageAccess: boolean;
  isAppOwned: boolean;
}

const STAGE_COLORS = [
  { value: "#64748B", label: "Slate" },
  { value: "#3B82F6", label: "Blue" },
  { value: "#8B5CF6", label: "Violet" },
  { value: "#F59E0B", label: "Amber" },
  { value: "#10B981", label: "Green" },
  { value: "#F43F5E", label: "Red" },
];

function moneyFromCents(value: number | null | undefined) {
  if (value === null || value === undefined) return "";
  return (value / 100).toFixed(2);
}

function centsFromMoney(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
}

async function invokeConfiguration(
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke(
    "manage-company-pipeline",
    { body },
  );
  if (error) {
    const response = (error as { context?: unknown }).context;
    if (response instanceof Response) {
      const responseBody = await response.clone().json().catch(() => null);
      const message = responseBody?.error;
      if (typeof message === "string" && message.trim()) {
        throw new Error(message);
      }
    }
    throw error;
  }
  if (data?.error) throw new Error(String(data.error));
  return (data ?? {}) as Record<string, unknown>;
}

function StageEditor({
  stage,
  disabled,
  isFirst,
  isLast,
  onSave,
  onMove,
  onArchive,
}: {
  stage: PipelineStage;
  disabled: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSave: (stage: PipelineStage) => Promise<void>;
  onMove: (direction: -1 | 1) => Promise<void>;
  onArchive: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(stage);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(stage), [stage]);

  async function run(action: () => Promise<void>) {
    setSaving(true);
    try {
      await action();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-lg border border-[#e4e9f0] bg-white p-3 lg:grid-cols-[minmax(150px,1fr)_130px_130px_150px_auto] lg:items-end">
      <label className="text-xs font-semibold text-[#344054]">
        Stage name
        <input
          value={draft.name}
          disabled={disabled || saving}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          className="mt-1 block w-full rounded-md border border-[#d0d5dd] px-3 py-2 text-sm disabled:bg-[#f2f4f7]"
        />
      </label>
      <label className="text-xs font-semibold text-[#344054]">
        Meaning
        <select
          value={draft.stage_type}
          disabled={disabled || saving}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              stage_type: event.target.value as PipelineStageType,
            }))
          }
          className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm disabled:bg-[#f2f4f7]"
        >
          <option value="open">Open</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
        </select>
      </label>
      <label className="text-xs font-semibold text-[#344054]">
        Color
        <select
          value={draft.color}
          disabled={disabled || saving}
          onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value }))}
          className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm disabled:bg-[#f2f4f7]"
        >
          {STAGE_COLORS.map((color) => (
            <option key={color.value} value={color.value}>{color.label}</option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-xs font-semibold text-[#344054]">
        <input
          type="checkbox"
          checked={draft.requires_note === true}
          disabled={disabled || saving}
          onChange={(event) => setDraft((current) => ({ ...current, requires_note: event.target.checked }))}
        />
        Require note
      </label>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" disabled={disabled || saving || isFirst} onClick={() => void run(() => onMove(-1))} className="rounded border border-[#d0d5dd] px-2.5 py-2 text-xs font-semibold disabled:opacity-40" aria-label={`Move ${stage.name} earlier`}>↑</button>
        <button type="button" disabled={disabled || saving || isLast} onClick={() => void run(() => onMove(1))} className="rounded border border-[#d0d5dd] px-2.5 py-2 text-xs font-semibold disabled:opacity-40" aria-label={`Move ${stage.name} later`}>↓</button>
        <button type="button" disabled={disabled || saving || !draft.name.trim()} onClick={() => void run(() => onSave(draft))} className="rounded bg-[#2b79c4] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Save</button>
        <button type="button" disabled={disabled || saving} onClick={() => { if (window.confirm(`Archive ${stage.name}?`)) void run(onArchive); }} className="rounded border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-40">Archive</button>
      </div>
    </div>
  );
}

function PipelineEditor({
  pipeline,
  stages,
  canManage,
  isFirst,
  isLast,
  onMove,
  companyLegacyId,
  onReload,
  setPageError,
}: {
  pipeline: PipelineDefinition;
  stages: PipelineStage[];
  canManage: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: -1 | 1) => Promise<void>;
  companyLegacyId: string;
  onReload: () => Promise<void>;
  setPageError: (error: string | null) => void;
}) {
  const [draft, setDraft] = useState(pipeline);
  const [defaultValue, setDefaultValue] = useState(moneyFromCents(pipeline.default_estimated_value_cents));
  const [saving, setSaving] = useState(false);
  const [stageName, setStageName] = useState("");
  const [stageType, setStageType] = useState<PipelineStageType>("open");
  const [stageRequiresNote, setStageRequiresNote] = useState(false);
  const [autoCreateRenewals, setAutoCreateRenewals] = useState(pipeline.auto_create_renewals === true);
  const [entryStageId, setEntryStageId] = useState(pipeline.entry_stage_id ?? "");
  const [catchUpDays, setCatchUpDays] = useState(pipeline.catch_up_days ?? 0);
  const [offboardSyncEnabled, setOffboardSyncEnabled] = useState(pipeline.offboard_sync_enabled === true);
  const [stageTaskCreationEnabled, setStageTaskCreationEnabled] = useState(pipeline.stage_task_creation_enabled === true);

  useEffect(() => {
    setDraft(pipeline);
    setDefaultValue(moneyFromCents(pipeline.default_estimated_value_cents));
    setAutoCreateRenewals(pipeline.auto_create_renewals === true);
    setEntryStageId(pipeline.entry_stage_id ?? "");
    setCatchUpDays(pipeline.catch_up_days ?? 0);
    setOffboardSyncEnabled(pipeline.offboard_sync_enabled === true);
    setStageTaskCreationEnabled(pipeline.stage_task_creation_enabled === true);
  }, [pipeline]);

  const openStages = stages.filter(
    (stage) => stage.stage_type === "open" && stage.is_enabled !== false && !stage.archived_at,
  );

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setSaving(true);
    setPageError(null);
    try {
      await invokeConfiguration({ action, companyLegacyId, pipelineId: pipeline.id, ...extra });
      await onReload();
      return true;
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Pipeline update failed.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function moveStage(stage: PipelineStage, direction: -1 | 1) {
    const currentIndex = stages.findIndex((candidate) => candidate.id === stage.id);
    const next = [...stages];
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= next.length) return;
    [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]];
    await act("reorder_stages", { stageIds: next.map((candidate) => candidate.id) });
  }

  return (
    <section className="rounded-xl border border-[#dfe5ec] bg-[#f8fafc] shadow-sm">
      <div className="border-b border-[#dfe5ec] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-[#162b3e]">{pipeline.name}</h3>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#667085]">{pipeline.pipeline_type}</span>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${pipeline.is_enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>{pipeline.is_enabled ? "Enabled" : "Disabled"}</span>
            </div>
            <p className="mt-1 text-sm text-[#667085]">Configure the workflow and default projection used when a new item is created.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!canManage || saving || isFirst} onClick={() => void onMove(-1)} className="rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm font-semibold text-[#344054] disabled:opacity-40" aria-label={`Move ${pipeline.name} earlier`}>↑</button>
            <button type="button" disabled={!canManage || saving || isLast} onClick={() => void onMove(1)} className="rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm font-semibold text-[#344054] disabled:opacity-40" aria-label={`Move ${pipeline.name} later`}>↓</button>
            <button type="button" disabled={!canManage || saving} onClick={() => { if (window.confirm(`Archive ${pipeline.name}?`)) void act("archive_pipeline"); }} className="rounded-md border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-40">Archive pipeline</button>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-3">
            <h4 className="text-sm font-semibold text-[#162b3e]">Pipeline settings</h4>
            <p className="mt-1 text-xs text-[#667085]">Name the pipeline, choose its value source, and control whether it is available in the workspace.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="text-xs font-semibold text-[#344054] xl:col-span-2">Name<input value={draft.name} disabled={!canManage || saving} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className="mt-1 block w-full rounded-md border border-[#d0d5dd] px-3 py-2 text-sm disabled:bg-[#f2f4f7]" /></label>
          <label className="text-xs font-semibold text-[#344054]">Type<select value={draft.pipeline_type} disabled={!canManage || saving} onChange={(event) => setDraft((current) => ({ ...current, pipeline_type: event.target.value as PipelineType }))} className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm disabled:bg-[#f2f4f7]"><option value="renewal">Renewal</option><option value="expansion">Expansion</option></select></label>
          <label className="text-xs font-semibold text-[#344054]">Value source<select value={draft.value_source} disabled={!canManage || saving} onChange={(event) => setDraft((current) => ({ ...current, value_source: event.target.value as PipelineValueSource }))} className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm disabled:bg-[#f2f4f7]"><option value="current_contract">Current contract</option><option value="fixed">Fixed default</option><option value="none">No value</option></select></label>
          <label className="text-xs font-semibold text-[#344054]">Default value<input type="number" min="0" step="0.01" value={defaultValue} disabled={!canManage || saving || draft.value_source !== "fixed"} onChange={(event) => setDefaultValue(event.target.value)} className="mt-1 block w-full rounded-md border border-[#d0d5dd] px-3 py-2 text-sm disabled:bg-[#f2f4f7]" /></label>
          <label className="text-xs font-semibold text-[#344054]">Currency<input maxLength={3} value={draft.currency_code} disabled={!canManage || saving || draft.value_source === "none"} onChange={(event) => setDraft((current) => ({ ...current, currency_code: event.target.value.toUpperCase() }))} className="mt-1 block w-full rounded-md border border-[#d0d5dd] px-3 py-2 text-sm uppercase disabled:bg-[#f2f4f7]" /></label>
          <label className="flex min-h-[62px] items-center gap-2 rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm font-semibold text-[#344054]"><input type="checkbox" checked={draft.is_enabled} disabled={!canManage || saving} onChange={(event) => setDraft((current) => ({ ...current, is_enabled: event.target.checked }))} /> Enabled</label>
          <label className="text-xs font-semibold text-[#344054]">Follow-up days<input type="number" min="0" max="365" value={draft.default_follow_up_days ?? ""} disabled={!canManage || saving} onChange={(event) => setDraft((current) => ({ ...current, default_follow_up_days: event.target.value === "" ? null : Number(event.target.value) }))} className="mt-1 block w-full rounded-md border border-[#d0d5dd] px-3 py-2 text-sm disabled:bg-[#f2f4f7]" /></label>
          </div>

          {draft.pipeline_type === "renewal" ? (
            <section className="mt-4 rounded-lg border border-[#dce5ef] bg-white p-4" aria-label="Renewal eligibility">
              <div>
                <h5 className="text-sm font-semibold text-[#162b3e]">Renewal eligibility</h5>
                <p className="mt-1 text-xs leading-5 text-[#667085]">Define which contracts qualify and how many days before the contract end date they become eligible. This does not turn automatic entry on.</p>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="text-xs font-semibold text-[#344054]">Eligible before contract end<input type="number" min="0" max="365" value={draft.renewal_lead_days ?? ""} disabled={!canManage || saving} onChange={(event) => setDraft((current) => ({ ...current, renewal_lead_days: event.target.value === "" ? null : Number(event.target.value) }))} className="mt-1 block w-full rounded-md border border-[#d0d5dd] px-3 py-2 text-sm disabled:bg-[#f2f4f7]" /><span className="mt-1 block font-normal text-[#667085]">Days before the fixed contract end date.</span></label>
                <label className="flex min-h-[72px] items-center gap-2 rounded-md border border-[#d0d5dd] bg-[#f8fafc] px-3 py-3 text-xs font-semibold text-[#344054]"><input type="checkbox" checked={draft.include_auto_renew} disabled={!canManage || saving} onChange={(event) => setDraft((current) => ({ ...current, include_auto_renew: event.target.checked }))} /> Include auto-renewing contracts</label>
                <label className="flex min-h-[72px] items-center gap-2 rounded-md border border-[#d0d5dd] bg-[#f8fafc] px-3 py-3 text-xs font-semibold text-[#344054]"><input type="checkbox" checked={draft.include_month_to_month} disabled={!canManage || saving} onChange={(event) => setDraft((current) => ({ ...current, include_month_to_month: event.target.checked }))} /> Include month-to-month contracts</label>
              </div>
              <p className="mt-3 text-xs leading-5 text-[#667085]">Auto-renewing fixed-term contracts extend automatically, while month-to-month agreements have no fixed renewal decision. Most teams will leave both excluded.</p>
            </section>
          ) : null}

          <div className="mt-4 flex justify-end"><button type="button" disabled={!canManage || saving || !draft.name.trim()} onClick={() => void act("update_pipeline", { name: draft.name, pipelineType: draft.pipeline_type, isEnabled: draft.is_enabled, valueSource: draft.value_source, defaultEstimatedValueCents: centsFromMoney(defaultValue), currencyCode: draft.currency_code, renewalLeadDays: draft.renewal_lead_days, defaultFollowUpDays: draft.default_follow_up_days, includeAutoRenew: draft.include_auto_renew, includeMonthToMonth: draft.include_month_to_month })} className="rounded-md bg-[#2b79c4] px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">Save pipeline settings</button></div>
        </div>

        <section className="mt-5 rounded-lg border border-sky-200 bg-sky-50/60 p-4" aria-labelledby={`pipeline-automation-${pipeline.id}`}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h4 id={`pipeline-automation-${pipeline.id}`} className="text-sm font-semibold text-[#162b3e]">{pipeline.pipeline_type === "renewal" ? "Renewal execution" : "Pipeline automation"}</h4>
              <p className="mt-1 text-xs leading-5 text-[#586273]">{pipeline.pipeline_type === "renewal" ? "Turn the eligibility rules above into pipeline items, choose their starting stage, and control linked actions." : "Control automatic actions for this pipeline."} Changes remain off until you choose Save automation.</p>
            </div>
            <span className="w-fit rounded-full border border-sky-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-800">Explicit save required</span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {pipeline.pipeline_type === "renewal" ? <>
              <label className="flex min-h-[72px] items-center gap-2 rounded-md border border-[#d0d5dd] bg-white px-3 py-3 text-xs font-semibold text-[#344054]"><input type="checkbox" checked={autoCreateRenewals} disabled={!canManage || saving} onChange={(event) => setAutoCreateRenewals(event.target.checked)} /> Automatically add eligible renewals</label>
              <label className="text-xs font-semibold text-[#344054]">Active Open entry stage<select value={entryStageId} disabled={!canManage || saving} onChange={(event) => setEntryStageId(event.target.value)} className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm disabled:bg-[#f2f4f7]"><option value="">Choose an Open stage</option>{openStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label>
              <label className="text-xs font-semibold text-[#344054]">Catch-up days<input type="number" min="0" max="365" value={catchUpDays} disabled={!canManage || saving} onChange={(event) => setCatchUpDays(Math.max(0, Math.min(365, Number(event.target.value) || 0)))} className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm disabled:bg-[#f2f4f7]" /><span className="mt-1 block font-normal text-[#667085]">Include eligible contracts missed by up to this many days.</span></label>
              <label className="flex min-h-[72px] items-center gap-2 rounded-md border border-[#d0d5dd] bg-white px-3 py-3 text-xs font-semibold text-[#344054]"><input type="checkbox" checked={offboardSyncEnabled} disabled={!canManage || saving} onChange={(event) => setOffboardSyncEnabled(event.target.checked)} /> Sync offboarding to Lost</label>
            </> : null}
            <label className="flex min-h-[72px] items-center gap-2 rounded-md border border-[#d0d5dd] bg-white px-3 py-3 text-xs font-semibold text-[#344054]"><input type="checkbox" checked={stageTaskCreationEnabled} disabled={!canManage || saving} onChange={(event) => setStageTaskCreationEnabled(event.target.checked)} /> Enable stage-task templates</label>
          </div>
          {autoCreateRenewals && !entryStageId ? <p className="mt-3 text-xs font-semibold text-rose-700">Choose an active Open entry stage before enabling automatic renewal entry.</p> : null}
          {!pipeline.is_enabled ? <p className="mt-3 text-xs font-semibold text-amber-800">Enable and save this pipeline before saving automation settings.</p> : null}
          <div className="mt-4 flex justify-end"><button type="button" disabled={!canManage || saving || !pipeline.is_enabled || (pipeline.pipeline_type === "renewal" && autoCreateRenewals && !entryStageId)} onClick={() => void act("update_pipeline_automation", { autoCreateRenewals: pipeline.pipeline_type === "renewal" && autoCreateRenewals, entryStageId: pipeline.pipeline_type === "renewal" ? entryStageId || null : null, catchUpDays: pipeline.pipeline_type === "renewal" ? catchUpDays : 0, renewalGenerationEnabled: pipeline.pipeline_type === "renewal" && autoCreateRenewals, offboardSyncEnabled: pipeline.pipeline_type === "renewal" && offboardSyncEnabled, stageTaskCreationEnabled, automationPaused: !((pipeline.pipeline_type === "renewal" && (autoCreateRenewals || offboardSyncEnabled)) || stageTaskCreationEnabled) })} className="rounded-md bg-[#162b3e] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{saving ? "Saving..." : "Save automation"}</button></div>
        </section>
      </div>

      <div className="space-y-3 p-5">
        <div>
          <h4 className="text-sm font-semibold text-[#162b3e]">Stages</h4>
          <p className="mt-1 text-xs text-[#667085]">Open stages describe work in progress. Won and Lost are terminal outcomes.</p>
        </div>
        {stages.map((stage, index) => (
          <StageEditor key={stage.id} stage={stage} disabled={!canManage || saving} isFirst={index === 0} isLast={index === stages.length - 1} onMove={(direction) => moveStage(stage, direction)} onSave={async (next) => { await act("update_stage", { stageId: stage.id, name: next.name, stageType: next.stage_type, color: next.color, requiresNote: next.requires_note === true }); }} onArchive={async () => { await act("archive_stage", { stageId: stage.id }); }} />
        ))}
        {stages.length === 0 ? <p className="rounded-md border border-dashed border-[#cbd5e1] bg-white p-4 text-sm text-[#667085]">Add the first stage to make this pipeline usable.</p> : null}
        <div className="grid gap-3 rounded-lg border border-dashed border-[#b8c5d3] bg-white p-3 md:grid-cols-[minmax(180px,1fr)_150px_150px_auto] md:items-end">
          <label className="text-xs font-semibold text-[#344054]">New stage<input value={stageName} disabled={!canManage || saving} onChange={(event) => setStageName(event.target.value)} placeholder="Stage name" className="mt-1 block w-full rounded-md border border-[#d0d5dd] px-3 py-2 text-sm" /></label>
          <label className="text-xs font-semibold text-[#344054]">Meaning<select value={stageType} disabled={!canManage || saving} onChange={(event) => setStageType(event.target.value as PipelineStageType)} className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm"><option value="open">Open</option><option value="won">Won</option><option value="lost">Lost</option></select></label>
          <label className="flex items-center gap-2 rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-xs font-semibold text-[#344054]"><input type="checkbox" checked={stageRequiresNote} disabled={!canManage || saving} onChange={(event) => setStageRequiresNote(event.target.checked)} /> Require note</label>
          <button type="button" disabled={!canManage || saving || !stageName.trim()} onClick={() => void (async () => { const saved = await act("create_stage", { name: stageName, stageType, requiresNote: stageRequiresNote, color: stageType === "won" ? "#10B981" : stageType === "lost" ? "#F43F5E" : "#3B82F6" }); if (saved) { setStageName(""); setStageRequiresNote(false); } })()} className="rounded-md border border-[#2b79c4] px-4 py-2 text-sm font-semibold text-[#2b79c4] disabled:opacity-40">Add stage</button>
        </div>
      </div>
    </section>
  );
}

export function PipelineSetup({ companyLegacyId, canManage, canManageAccess, isAppOwned }: PipelineSetupProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [payload, setPayload] = useState<PipelineConfigurationPayload>({
    masterEnabled: false,
    directorAccessEnabled: true,
    supportAccessEnabled: true,
    csmAccessEnabled: true,
    viewerAccessEnabled: false,
    pipelines: [],
    stages: [],
  });
  const [roleAccessDraft, setRoleAccessDraft] = useState({
    director: true,
    support: true,
    csm: true,
    viewer: false,
  });
  const [selectedPipelineId, setSelectedPipelineId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("Expansion");
  const [newType, setNewType] = useState<PipelineType>("expansion");

  const load = useCallback(async () => {
    if (!companyLegacyId || !isAppOwned) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await invokeConfiguration({ action: "list_configuration", companyLegacyId });
      setPayload({
        masterEnabled: data.masterEnabled === true,
        directorAccessEnabled: data.directorAccessEnabled !== false,
        supportAccessEnabled: data.supportAccessEnabled !== false,
        csmAccessEnabled: data.csmAccessEnabled !== false,
        viewerAccessEnabled: data.viewerAccessEnabled === true,
        pipelines: (data.pipelines ?? []) as PipelineDefinition[],
        stages: (data.stages ?? []) as PipelineStage[],
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Pipeline configuration failed to load.");
    } finally {
      setLoading(false);
    }
  }, [companyLegacyId, isAppOwned]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    setRoleAccessDraft({
      director: payload.directorAccessEnabled,
      support: payload.supportAccessEnabled,
      csm: payload.csmAccessEnabled,
      viewer: payload.viewerAccessEnabled,
    });
  }, [
    payload.csmAccessEnabled,
    payload.directorAccessEnabled,
    payload.supportAccessEnabled,
    payload.viewerAccessEnabled,
  ]);

  useEffect(() => {
    if (payload.pipelines.length === 0) {
      setSelectedPipelineId("");
      return;
    }
    if (!payload.pipelines.some((pipeline) => pipeline.id === selectedPipelineId)) {
      setSelectedPipelineId(payload.pipelines[0].id);
    }
  }, [payload.pipelines, selectedPipelineId]);

  const stagesByPipeline = useMemo(() => {
    const grouped = new Map<string, PipelineStage[]>();
    for (const stage of payload.stages) {
      const current = grouped.get(stage.pipeline_id) ?? [];
      current.push(stage);
      grouped.set(stage.pipeline_id, current);
    }
    for (const stages of grouped.values()) stages.sort((left, right) => left.position - right.position);
    return grouped;
  }, [payload.stages]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await invokeConfiguration({ action, companyLegacyId, ...extra });
      await load();
      if (action === "create_starters") {
        const created = Array.isArray(result.created) ? result.created : [];
        setNotice(created.length > 0
          ? `${created.length} starter pipeline${created.length === 1 ? " was" : "s were"} added.`
          : "All starter pipelines already exist.");
      }
      return result;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Pipeline configuration failed.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function movePipeline(pipeline: PipelineDefinition, direction: -1 | 1) {
    const currentIndex = payload.pipelines.findIndex((candidate) => candidate.id === pipeline.id);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= payload.pipelines.length) return;
    const next = [...payload.pipelines];
    [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]];
    await act("reorder_pipelines", { pipelineIds: next.map((candidate) => candidate.id) });
  }

  const selectedPipeline = payload.pipelines.find((pipeline) => pipeline.id === selectedPipelineId) ?? payload.pipelines[0];
  const selectedPipelineIndex = selectedPipeline ? payload.pipelines.findIndex((pipeline) => pipeline.id === selectedPipeline.id) : -1;
  const missingStarterTypes = (["renewal", "expansion"] as PipelineType[]).filter(
    (type) => !payload.pipelines.some((pipeline) => pipeline.pipeline_type === type),
  );
  const starterButtonLabel = missingStarterTypes.length === 1
    ? `Add ${missingStarterTypes[0] === "renewal" ? "Renewal" : "Expansion"} starter`
    : "Add starter pipelines";

  if (!isAppOwned) {
    return <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">Pipeline is unavailable until this company is moved to RetainOS app-owned write mode.</div>;
  }
  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#59abf0]" /></div>;

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">RetainOS pipelines</span>
          <h2 className="mt-3 text-xl font-semibold text-[#162b3e]">Pipelines</h2>
          <p className="mt-1 max-w-3xl text-sm text-[#667085]">Create renewal and expansion workflows. Configuration is safe while the Company Settings master gate remains off.</p>
        </div>
        {canManage ? <div className="flex flex-wrap gap-2">{missingStarterTypes.length > 0 ? <button type="button" disabled={saving} onClick={() => void act("create_starters")} className="rounded-md border border-[#2b79c4] bg-white px-4 py-2 text-sm font-semibold text-[#2b79c4] disabled:opacity-40">{starterButtonLabel}</button> : null}<button type="button" disabled={saving} onClick={() => setShowCreate((current) => !current)} className="rounded-md bg-[#2b79c4] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">+ New pipeline</button></div> : null}
      </div>

      <div className={`rounded-lg border px-4 py-3 text-sm ${payload.masterEnabled ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
        <strong>{payload.masterEnabled ? "Pipeline is enabled for this company." : "Pipeline is disabled for this company."}</strong>{" "}
        The master feature gate is controlled in Company Settings.
      </div>

      {error ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button type="button" onClick={() => void load()} disabled={loading || saving} className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-40">Retry</button></div> : null}
      {notice ? <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}

      <section className="rounded-xl border border-[#dfe5ec] bg-white p-5 shadow-sm" aria-labelledby="pipeline-role-access">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 id="pipeline-role-access" className="text-base font-semibold text-[#162b3e]">Workspace access by role</h3>
            <p className="mt-1 max-w-3xl text-sm text-[#667085]">Choose which company roles can see and use Pipeline. Super Admin access is always retained. CSM assignment scoping still applies when CSM access is enabled.</p>
          </div>
          {!canManageAccess ? <span className="w-fit rounded-full border border-[#d0d5dd] bg-[#f8fafc] px-3 py-1 text-xs font-semibold text-[#667085]">Super Admin controlled</span> : null}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {([
            ["director", "Directors", "Company-wide operational access"],
            ["support", "Support", "Company-wide operational access"],
            ["csm", "CSMs", "Assigned clients only"],
            ["viewer", "Viewers", "Read-only company access"],
          ] as const).map(([key, label, description]) => (
            <label key={key} className="flex min-h-[76px] items-start gap-3 rounded-lg border border-[#d0d5dd] bg-[#f8fafc] px-4 py-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={roleAccessDraft[key]}
                disabled={!canManageAccess || saving}
                onChange={(event) => setRoleAccessDraft((current) => ({ ...current, [key]: event.target.checked }))}
              />
              <span><span className="block text-sm font-semibold text-[#344054]">{label}</span><span className="mt-1 block text-xs text-[#667085]">{description}</span></span>
            </label>
          ))}
        </div>
        {canManageAccess ? (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={() => void act("update_role_access", {
                directorAccessEnabled: roleAccessDraft.director,
                supportAccessEnabled: roleAccessDraft.support,
                csmAccessEnabled: roleAccessDraft.csm,
                viewerAccessEnabled: roleAccessDraft.viewer,
              }).then((result) => {
                if (result) {
                  setNotice("Pipeline role access was saved.");
                  window.dispatchEvent(new CustomEvent("retainos:pipeline-visibility-changed", { detail: { companyLegacyId } }));
                }
              })}
              className="rounded-md bg-[#162b3e] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {saving ? "Saving..." : "Save role access"}
            </button>
          </div>
        ) : null}
      </section>

      {showCreate ? (
        <section className="rounded-lg border border-[#dfe5ec] bg-white p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(180px,1fr)_180px_auto] md:items-end">
            <label className="text-xs font-semibold text-[#344054]">Pipeline name<input value={newName} onChange={(event) => setNewName(event.target.value)} className="mt-1 block w-full rounded-md border border-[#d0d5dd] px-3 py-2 text-sm" /></label>
            <label className="text-xs font-semibold text-[#344054]">Type<select value={newType} onChange={(event) => setNewType(event.target.value as PipelineType)} className="mt-1 block w-full rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm"><option value="renewal">Renewal</option><option value="expansion">Expansion</option></select></label>
            <button type="button" disabled={saving || !newName.trim()} onClick={() => void (async () => { const result = await act("create_pipeline", { name: newName, pipelineType: newType }); if (result) { const created = result.pipeline as PipelineDefinition | undefined; if (created?.id) setSelectedPipelineId(created.id); setShowCreate(false); } })()} className="rounded-md bg-[#162b3e] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Create</button>
          </div>
        </section>
      ) : null}

      {payload.pipelines.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#b8c5d3] bg-[#f8fafc] p-10 text-center">
          <h3 className="text-base font-semibold text-[#162b3e]">No pipelines configured</h3>
          <p className="mt-2 text-sm text-[#667085]">Add the Renewal and Expansion starters, or create a pipeline from scratch.</p>
        </div>
      ) : (
        <>
          <section className="rounded-xl border border-[#dfe5ec] bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">Choose a pipeline to configure</p>
            <div aria-label="Pipeline configuration selection" className="mt-3 flex flex-wrap gap-2">
              {payload.pipelines.map((pipeline) => {
                const selected = pipeline.id === selectedPipeline?.id;
                return <button key={pipeline.id} type="button" aria-pressed={selected} onClick={() => { setSelectedPipelineId(pipeline.id); setNotice(null); }} className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${selected ? "border-[#2b79c4] bg-[#eaf4fd] text-[#185b96]" : "border-[#d0d5dd] bg-white text-[#475467] hover:border-[#98a2b3]"}`}>{pipeline.name}</button>;
              })}
            </div>
          </section>
          {selectedPipeline ? <PipelineEditor key={selectedPipeline.id} pipeline={selectedPipeline} stages={stagesByPipeline.get(selectedPipeline.id) ?? []} canManage={canManage} isFirst={selectedPipelineIndex === 0} isLast={selectedPipelineIndex === payload.pipelines.length - 1} onMove={(direction) => movePipeline(selectedPipeline, direction)} companyLegacyId={companyLegacyId} onReload={load} setPageError={setError} /> : null}
        </>
      )}
    </div>
  );
}
