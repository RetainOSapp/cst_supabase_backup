import {
  FEATURE_KEYS,
  FEATURE_STATUSES,
  METER_TYPES,
  PERIOD_TYPES,
} from "../beacon-chat/_shared/contracts.mjs";
import {
  listFeatureCards,
  getFeatureRoleAccess,
  resolveAccessContext,
  updateFeatureCard,
  updateFeatureRoleAccess,
} from "../beacon-chat/_shared/database.mjs";
import { BeaconError } from "../beacon-chat/_shared/errors.mjs";
import { parseManageBody, isUuid } from "../beacon-chat/_shared/validation.mjs";

const FEATURE_COPY = Object.freeze({
  beacon: Object.freeze({
    label: "Beacon",
    description: "Read-only operational questions over approved RetainOS data.",
  }),
  call_analysis: Object.freeze({
    label: "Call Intelligence",
    description:
      "Analyze approved customer-call transcripts with company-level cost controls.",
  }),
  sentiment_analysis: Object.freeze({
    label: "Sentiment analysis",
    description: "Surface bounded sentiment signals from approved sources.",
  }),
  automated_summaries: Object.freeze({
    label: "Automated summaries",
    description: "Create summaries from approved RetainOS workflows.",
  }),
  slack_data: Object.freeze({
    label: "Slack data",
    description: "Future controlled AI workflows over approved Slack data.",
  }),
});

function rows(value, key) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray(value[key])) return value[key];
  if (
    value &&
    typeof value === "object" &&
    value[key] &&
    typeof value[key] === "object" &&
    !Array.isArray(value[key])
  ) {
    return [value[key]];
  }
  return value && typeof value === "object" ? [value] : [];
}

function timestamp(value) {
  if (value == null) return null;
  // Postgres serializes an open-ended one-time allowance as `infinity`.
  // Keep database sentinel values out of the browser contract.
  if (value === "infinity" || value === "-infinity") return null;
  if (typeof value !== "string" || value.length > 40 || !Number.isFinite(Date.parse(value))) {
    throw new BeaconError(
      "feature_status_unavailable",
      503,
      "AI feature settings could not be loaded.",
    );
  }
  return value;
}

function integer(value, { positive = false } = {}) {
  if (
    !Number.isSafeInteger(value) ||
    value < (positive ? 1 : 0) ||
    value > 1_000_000_000
  ) {
    throw new BeaconError(
      "feature_status_unavailable",
      503,
      "AI feature settings could not be loaded.",
    );
  }
  return value;
}

function warningThresholds(value) {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 4 ||
    value.some((entry) => !Number.isInteger(entry) || entry < 1 || entry > 99) ||
    value.some((entry, index) => index > 0 && entry <= value[index - 1])
  ) {
    throw new BeaconError(
      "feature_status_unavailable",
      503,
      "AI feature settings could not be loaded.",
    );
  }
  return [...value];
}

function publicAllowance(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new BeaconError(
      "feature_status_unavailable",
      503,
      "AI feature settings could not be loaded.",
    );
  }
  const meterType = raw.meter_type ?? raw.meterType;
  const periodType = raw.period_type ?? raw.periodType;
  if (!METER_TYPES.includes(meterType) || !PERIOD_TYPES.includes(periodType)) {
    throw new BeaconError(
      "feature_status_unavailable",
      503,
      "AI feature settings could not be loaded.",
    );
  }
  const id = raw.id;
  if (id != null && !isUuid(id)) {
    throw new BeaconError(
      "feature_status_unavailable",
      503,
      "AI feature settings could not be loaded.",
    );
  }
  return {
    ...(id ? { id } : {}),
    meterType,
    periodType,
    limitValue: integer(raw.limit_value ?? raw.limitValue, { positive: true }),
    usedValue: integer(raw.used_value ?? raw.usedValue),
    warningThresholds: warningThresholds(
      raw.warning_thresholds ?? raw.warningThresholds,
    ),
    periodStartedAt: timestamp(raw.period_started_at ?? raw.periodStartedAt),
    periodEndsAt: timestamp(raw.period_ends_at ?? raw.periodEndsAt),
  };
}

export function publicFeatureCard(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new BeaconError(
      "feature_status_unavailable",
      503,
      "AI feature settings could not be loaded.",
    );
  }
  const featureKey = raw.feature_key ?? raw.featureKey;
  const status = raw.status;
  if (!FEATURE_KEYS.includes(featureKey) || !FEATURE_STATUSES.includes(status)) {
    throw new BeaconError(
      "feature_status_unavailable",
      503,
      "AI feature settings could not be loaded.",
    );
  }
  const rawAllowances = raw.allowances;
  if (!Array.isArray(rawAllowances) || rawAllowances.length > METER_TYPES.length) {
    throw new BeaconError(
      "feature_status_unavailable",
      503,
      "AI feature settings could not be loaded.",
    );
  }
  const allowances = rawAllowances.map(publicAllowance);
  if (new Set(allowances.map((item) => item.meterType)).size !== allowances.length) {
    throw new BeaconError(
      "feature_status_unavailable",
      503,
      "AI feature settings could not be loaded.",
    );
  }
  if (
    featureKey === "beacon" &&
    allowances.length > 0 &&
    (allowances.length !== 1 || allowances[0].meterType !== "usd_cents")
  ) {
    throw new BeaconError(
      "feature_status_unavailable",
      503,
      "AI feature settings could not be loaded.",
    );
  }
  if ((status === "pilot" || status === "enabled") && allowances.length === 0) {
    throw new BeaconError(
      "feature_status_unavailable",
      503,
      "AI feature settings could not be loaded.",
    );
  }
  const copy = FEATURE_COPY[featureKey];
  return {
    featureKey,
    label: copy.label,
    description: copy.description,
    status,
    allowances,
    enabledAt: timestamp(raw.enabled_at ?? raw.enabledAt),
    pausedAt: timestamp(raw.paused_at ?? raw.pausedAt),
    updatedAt: timestamp(raw.updated_at ?? raw.updatedAt),
  };
}

export async function handleManageAiFeature({
  body,
  token,
  serviceClient,
  authenticateSuperAdmin,
}) {
  const request = parseManageBody(body);
  const actor = await authenticateSuperAdmin(serviceClient, token);
  const context = await resolveAccessContext({
    serviceClient,
    actor,
    companySelector: request.companyId,
    registeredSuperAdmin: true,
  });

  if (request.action === "list") {
    const [data, accessRoles] = await Promise.all([
      listFeatureCards(serviceClient, context, actor),
      getFeatureRoleAccess(serviceClient, context, actor),
    ]);
    if (
      !Array.isArray(accessRoles) ||
      accessRoles.some((role) => !["director", "support", "csm"].includes(role))
    ) {
      throw new BeaconError(
        "feature_status_unavailable",
        503,
        "AI feature settings could not be loaded.",
      );
    }
    const features = rows(data, "features").map(publicFeatureCard).map((feature) =>
      feature.featureKey === "beacon"
        ? { ...feature, allowedRoles: [...accessRoles] }
        : feature
    );
    if (new Set(features.map((item) => item.featureKey)).size !== features.length) {
      throw new BeaconError(
        "feature_status_unavailable",
        503,
        "AI feature settings could not be loaded.",
      );
    }
    return { features };
  }

  if (request.action === "update_access") {
    const allowedRoles = await updateFeatureRoleAccess(
      serviceClient,
      context,
      actor,
      request,
    );
    if (!Array.isArray(allowedRoles)) {
      throw new BeaconError(
        "feature_update_unavailable",
        503,
        "AI feature settings could not be updated.",
      );
    }
    return { featureKey: request.featureKey, allowedRoles };
  }

  const data = await updateFeatureCard(serviceClient, context, actor, request);
  const candidates = rows(data, "feature");
  if (candidates.length !== 1) {
    throw new BeaconError(
      "feature_update_unavailable",
      503,
      "AI feature settings could not be updated.",
    );
  }
  const feature = publicFeatureCard(candidates[0]);
  if (feature.featureKey !== request.featureKey) {
    throw new BeaconError(
      "feature_update_unavailable",
      503,
      "AI feature settings could not be updated.",
    );
  }
  return { feature };
}
