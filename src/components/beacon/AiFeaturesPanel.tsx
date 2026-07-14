import { useEffect, useState } from "react";
import {
  BeaconApiError,
  listManagedAiFeatures,
  updateManagedAiFeature,
  updateManagedAiFeatureAccess,
  type AiFeatureAllowance,
  type AiFeatureMeterType,
  type AiFeaturePeriodType,
  type BeaconFeatureStatus,
  type ManagedAiFeature,
  type BeaconConfigurableRole,
} from "../../lib/beaconApi.ts";

const FEATURE_COPY: Record<string, { label: string; description: string }> = {
  beacon: {
    label: "Beacon",
    description: "Read-only operational questions over approved RetainOS data.",
  },
  call_analysis: {
    label: "Call analysis",
    description: "Analyze approved customer-call transcripts and recordings.",
  },
  sentiment_analysis: {
    label: "Sentiment analysis",
    description: "Surface bounded sentiment signals from approved sources.",
  },
  automated_summaries: {
    label: "Automated summaries",
    description: "Create summaries from approved RetainOS workflows.",
  },
  slack_data: {
    label: "Slack data",
    description: "Future controlled AI workflows over approved Slack data.",
  },
};

const METER_OPTIONS: { value: AiFeatureMeterType; label: string }[] = [
  { value: "usd_cents", label: "Currency spend" },
  { value: "analysis_count", label: "Analysis count" },
  { value: "token_count", label: "Token count" },
  { value: "request_count", label: "Request count" },
];

const PERIOD_OPTIONS: { value: AiFeaturePeriodType; label: string }[] = [
  { value: "one_time", label: "One-time pilot" },
  { value: "monthly", label: "Monthly" },
];

const BEACON_ROLE_OPTIONS: {
  value: BeaconConfigurableRole;
  label: string;
  detail: string;
}[] = [
  { value: "director", label: "Director", detail: "All operational company data." },
  { value: "support", label: "Support", detail: "Operational data without sensitive configuration." },
  { value: "csm", label: "CSM", detail: "Only assigned or verified historically assigned clients." },
];

function defaultAllowance(meterType: AiFeatureMeterType): AiFeatureAllowance {
  return {
    meterType,
    periodType: "one_time",
    limitValue: 0,
    usedValue: 0,
    warningThresholds: [75, 90],
  };
}

function featureCopy(feature: ManagedAiFeature) {
  const fallback = FEATURE_COPY[feature.featureKey];
  return {
    label: feature.label || fallback?.label || feature.featureKey.replaceAll("_", " "),
    description:
      feature.description || fallback?.description || "Independently controlled AI feature.",
  };
}

function formatMeterValue(value: number, meterType: AiFeatureMeterType) {
  if (meterType === "usd_cents") return `$${(value / 100).toFixed(2)}`;
  return new Intl.NumberFormat("en-US").format(value);
}

function meterUnit(meterType: AiFeatureMeterType) {
  if (meterType === "usd_cents") return "spend";
  if (meterType === "analysis_count") return "analyses";
  if (meterType === "token_count") return "tokens";
  return "requests";
}

function statusClass(status: BeaconFeatureStatus) {
  if (status === "enabled") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "pilot") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "paused") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-gray-200 bg-gray-50 text-gray-600";
}

function errorMessage(error: unknown) {
  if (error instanceof BeaconApiError && error.code === "unauthenticated") {
    return error.message;
  }
  return "AI Features could not be updated. No setting was changed.";
}

function AllowanceEditor({
  allowance,
  index,
  meterOptions,
  disabled,
  onChange,
  onRemove,
}: {
  allowance: AiFeatureAllowance;
  index: number;
  meterOptions: typeof METER_OPTIONS;
  disabled: boolean;
  onChange: (allowance: AiFeatureAllowance) => void;
  onRemove: () => void;
}) {
  const usagePercent = allowance.limitValue > 0
    ? Math.min(100, Math.round((allowance.usedValue / allowance.limitValue) * 100))
    : 0;
  const firstWarning = allowance.warningThresholds[0] ?? 75;
  const secondWarning = allowance.warningThresholds[1] ?? 90;

  return (
    <fieldset className="rounded-lg border border-[#e4e9f0] bg-[#f7f9fc] p-3">
      <legend className="px-1 text-xs font-bold text-[#162b3e]">Allowance {index + 1}</legend>
      <div className="-mt-5 flex justify-end">
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          className="retainos-focus text-[11px] font-semibold text-[#c13a33] hover:underline disabled:opacity-50"
        >
          Remove
        </button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label>
          <span className="retainos-field-label">Meter</span>
          <select
            value={allowance.meterType}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...allowance,
                meterType: event.target.value as AiFeatureMeterType,
                limitValue: 0,
                usedValue: 0,
              })
            }
            className="retainos-input"
          >
            {meterOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="retainos-field-label">Period</span>
          <select
            value={allowance.periodType}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...allowance,
                periodType: event.target.value as AiFeaturePeriodType,
              })
            }
            className="retainos-input"
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="retainos-field-label">
            {allowance.meterType === "usd_cents" ? "Limit ($)" : "Limit"}
          </span>
          <input
            type="number"
            min="0"
            step={allowance.meterType === "usd_cents" ? "0.01" : "1"}
            value={
              allowance.meterType === "usd_cents"
                ? allowance.limitValue / 100
                : allowance.limitValue
            }
            disabled={disabled}
            onChange={(event) => {
              const value = Math.max(0, Number(event.target.value) || 0);
              onChange({
                ...allowance,
                limitValue:
                  allowance.meterType === "usd_cents"
                    ? Math.round(value * 100)
                    : Math.floor(value),
              });
            }}
            className="retainos-input"
          />
        </label>
        <div>
          <span className="retainos-field-label">Usage</span>
          <p className="pt-2 text-xs font-semibold text-[#586273]">
            {formatMeterValue(allowance.usedValue, allowance.meterType)} of {formatMeterValue(allowance.limitValue, allowance.meterType)} {meterUnit(allowance.meterType)}
          </p>
        </div>
        <label>
          <span className="retainos-field-label">First warning (%)</span>
          <input
            type="number"
            min="1"
            max="99"
            value={firstWarning}
            disabled={disabled}
            onChange={(event) => {
              const next = Math.max(1, Math.min(99, Number(event.target.value) || 1));
              onChange({ ...allowance, warningThresholds: [next, secondWarning].sort((a, b) => a - b) });
            }}
            className="retainos-input"
          />
        </label>
        <label>
          <span className="retainos-field-label">Second warning (%)</span>
          <input
            type="number"
            min="1"
            max="99"
            value={secondWarning}
            disabled={disabled}
            onChange={(event) => {
              const next = Math.max(1, Math.min(99, Number(event.target.value) || 1));
              onChange({ ...allowance, warningThresholds: [firstWarning, next].sort((a, b) => a - b) });
            }}
            className="retainos-input"
          />
        </label>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e4e9f0]" aria-label={`${usagePercent}% used`}>
        <div
          className={`h-full rounded-full ${usagePercent >= 90 ? "bg-[#d6453d]" : usagePercent >= 75 ? "bg-[#e0922f]" : "bg-[#59abf0]"}`}
          style={{ width: `${usagePercent}%` }}
        />
      </div>
    </fieldset>
  );
}

function AiFeatureCard({
  companyId,
  feature,
  onUpdated,
}: {
  companyId: string;
  feature: ManagedAiFeature;
  onUpdated: (feature: ManagedAiFeature) => void;
}) {
  const [allowances, setAllowances] = useState<AiFeatureAllowance[]>(feature.allowances);
  const [allowedRoles, setAllowedRoles] = useState<BeaconConfigurableRole[]>(feature.allowedRoles);
  const [saving, setSaving] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const copy = featureCopy(feature);
  const isReleased = feature.featureKey === "beacon";
  const meterOptions = feature.featureKey === "beacon"
    ? METER_OPTIONS.filter(({ value }) => value === "usd_cents")
    : METER_OPTIONS;
  const meterTypes = allowances.map((allowance) => allowance.meterType);
  const allowancesValid =
    allowances.every((allowance) => allowance.limitValue > 0) &&
    new Set(meterTypes).size === meterTypes.length;
  const canEnable = allowances.length > 0 && allowancesValid;
  const nextMeterType = meterOptions.find(
    ({ value }) => !meterTypes.includes(value),
  )?.value;

  useEffect(() => setAllowances(feature.allowances), [feature]);
  useEffect(() => setAllowedRoles(feature.allowedRoles), [feature]);

  if (!isReleased) {
    return (
      <article className="rounded-xl border border-[#e4e9f0] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-[#162b3e]">{copy.label}</h3>
            <p className="mt-1 text-xs leading-5 text-[#667085]">{copy.description}</p>
          </div>
          <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-600">
            Coming soon
          </span>
        </div>
        <p className="mt-4 border-t border-[#e4e9f0] pt-4 text-xs leading-5 text-[#667085]">
          This independently metered feature is reserved in the control model, but it cannot be configured or enabled until its own security and rollout review ships.
        </p>
      </article>
    );
  }

  async function save(status: BeaconFeatureStatus, confirmation?: string) {
    if (
      (status === "pilot" || status === "enabled") &&
      !canEnable
    ) {
      setSuccess(null);
      setError("Add a positive hard allowance before enabling this feature.");
      return;
    }
    if (confirmation && !window.confirm(confirmation)) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await updateManagedAiFeature({
        companyId,
        featureKey: feature.featureKey,
        status,
        allowances,
      });
      onUpdated({ ...result.feature, allowedRoles: feature.allowedRoles });
      setSuccess(`${copy.label} was updated.`);
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setSaving(false);
    }
  }

  async function saveAccess() {
    setSavingAccess(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await updateManagedAiFeatureAccess({
        companyId,
        featureKey: "beacon",
        allowedRoles,
      });
      onUpdated({ ...feature, allowedRoles: result.allowedRoles });
      setSuccess("Beacon role access was updated.");
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setSavingAccess(false);
    }
  }

  return (
    <article className="rounded-xl border border-[#e4e9f0] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-[#162b3e]">{copy.label}</h3>
          <p className="mt-1 text-xs leading-5 text-[#667085]">{copy.description}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClass(feature.status)}`}>
          {feature.status}
        </span>
      </div>

      <fieldset className="mt-4 rounded-xl border border-[#d6eafb] bg-[#f6fbff] p-4">
        <legend className="px-1 text-xs font-bold text-[#162b3e]">Who can access Beacon</legend>
        <p className="mb-3 text-[11px] leading-5 text-[#667085]">
          RetainOS SuperAdmins always retain access. Viewer access is unavailable.
          These choices are enforced again by the server on every request.
        </p>
        <label className="flex items-start gap-3 rounded-lg border border-[#e4e9f0] bg-white px-3 py-2.5 opacity-70">
          <input type="checkbox" checked disabled className="mt-0.5" />
          <span><span className="block text-xs font-bold text-[#162b3e]">RetainOS SuperAdmin</span><span className="text-[10px] text-[#667085]">Always enabled for rollout and rollback control.</span></span>
        </label>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {BEACON_ROLE_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-start gap-2 rounded-lg border border-[#e4e9f0] bg-white px-3 py-2.5">
              <input
                type="checkbox"
                checked={allowedRoles.includes(option.value)}
                disabled={savingAccess}
                onChange={(event) => setAllowedRoles((current) =>
                  event.target.checked
                    ? [...current, option.value]
                    : current.filter((role) => role !== option.value)
                )}
                className="mt-0.5"
              />
              <span><span className="block text-xs font-bold text-[#162b3e]">{option.label}</span><span className="text-[10px] leading-4 text-[#667085]">{option.detail}</span></span>
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={savingAccess}
          onClick={() => void saveAccess()}
          className="retainos-button-secondary mt-3"
        >
          {savingAccess ? "Saving access…" : "Save role access"}
        </button>
      </fieldset>

      <div className="mt-4 space-y-3">
        {allowances.map((allowance, index) => (
          <AllowanceEditor
            key={allowance.id ?? `${allowance.meterType}-${index}`}
            allowance={allowance}
            index={index}
            meterOptions={meterOptions}
            disabled={saving}
            onChange={(updatedAllowance) =>
              setAllowances((current) =>
                current.map((item, itemIndex) => itemIndex === index ? updatedAllowance : item),
              )
            }
            onRemove={() =>
              setAllowances((current) => current.filter((_, itemIndex) => itemIndex !== index))
            }
          />
        ))}
        <button
          type="button"
          disabled={saving || !nextMeterType}
          onClick={() => {
            if (nextMeterType) {
              setAllowances((current) => [
                ...current,
                defaultAllowance(nextMeterType),
              ]);
            }
          }}
          className="retainos-focus text-xs font-bold text-[#2b79c4] hover:underline disabled:opacity-50"
        >
          + Add allowance
        </button>
      </div>

      {error ? <p role="alert" className="mt-3 text-xs font-semibold text-[#c13a33]">{error}</p> : null}
      {success ? <p role="status" className="mt-3 text-xs font-semibold text-[#2a9272]">{success}</p> : null}
      {!canEnable ? (
        <p className="mt-3 text-[11px] font-semibold text-[#c77c1e]">
          Add at least one positive hard allowance, with each meter used only once,
          before starting or resuming this feature.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-[#e4e9f0] pt-4">
        <button
          type="button"
          disabled={saving || !allowancesValid}
          onClick={() => void save(feature.status)}
          className="retainos-button-secondary"
        >
          {saving ? "Saving…" : "Save allowance"}
        </button>
        {feature.status === "disabled" ? (
          <button type="button" disabled={saving || !canEnable} onClick={() => void save("pilot")} className="retainos-button-primary">
            Start pilot
          </button>
        ) : feature.status === "paused" ? (
          <button type="button" disabled={saving || !canEnable} onClick={() => void save("enabled")} className="retainos-button-primary">
            Resume
          </button>
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={() => void save("paused", `Pause ${copy.label}? New AI work for this company will be blocked.`)}
            className="retainos-button-secondary"
          >
            Pause
          </button>
        )}
        {feature.status !== "disabled" ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void save("disabled", `Disable ${copy.label}? New AI work for this company will be blocked.`)}
            className="retainos-focus ml-auto text-xs font-bold text-[#c13a33] hover:underline disabled:opacity-50"
          >
            Disable
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function AiFeaturesPanel({ companyId }: { companyId: string }) {
  const [features, setFeatures] = useState<ManagedAiFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!companyId) {
      setFeatures([]);
      setLoading(false);
      setError(null);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    setError(null);
    listManagedAiFeatures(companyId)
      .then((result) => {
        if (!cancelled) setFeatures(result.features);
      })
      .catch(() => {
        if (!cancelled) {
          setFeatures([]);
          setError("AI Features could not be loaded. No settings were changed.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, reloadKey]);

  return (
    <section className="rounded-lg border border-[#d6eafb] bg-[#f6fbff] p-5 shadow-sm" aria-labelledby="ai-features-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#2b79c4]">RetainOS SuperAdmin only</p>
          <h2 id="ai-features-title" className="mt-1 text-base font-bold text-[#162b3e]">AI Features</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-[#586273]">
            Enable, pause, and meter each paid AI feature independently for this company. These controls never appear in the customer Admin Hub.
          </p>
        </div>
        <span className="rounded-full border border-[#d6eafb] bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[#2b79c4]">
          Independent controls
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-[#586273]" role="status">
          <span className="h-3 w-3 animate-spin rounded-full border-b-2 border-[#59abf0]" aria-hidden="true" />
          Loading AI feature controls…
        </div>
      ) : error ? (
        <div className="mt-4 rounded-lg border border-[#f2b8b5] bg-[#fcebea] p-4">
          <p role="alert" className="text-xs font-semibold text-[#9f2f2a]">{error}</p>
          <button type="button" onClick={() => setReloadKey((key) => key + 1)} className="retainos-button-secondary mt-3">
            Try again
          </button>
        </div>
      ) : features.length === 0 ? (
        <p className="mt-4 rounded-lg border border-[#e4e9f0] bg-white p-4 text-xs text-[#667085]">
          No AI features are configured for this company.
        </p>
      ) : (
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {features.map((feature) => (
            <AiFeatureCard
              key={feature.featureKey}
              companyId={companyId}
              feature={feature}
              onUpdated={(updatedFeature) =>
                setFeatures((current) =>
                  current.map((item) =>
                    item.featureKey === updatedFeature.featureKey ? updatedFeature : item,
                  ),
                )
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
