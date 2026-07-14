import {
  ALLOWANCE_STATUSES,
  BEACON_FEATURE_KEY,
  BEACON_ROLES,
  FEATURE_STATUSES,
  GLOBAL_FEATURE_STATUSES,
  LIMITS,
  RELEASE_VERSION,
  SQL_CONTRACT,
} from "./contracts.mjs";
import { BeaconError } from "./errors.mjs";
import { isUuid } from "./validation.mjs";

function firstRow(data) {
  return Array.isArray(data) ? data[0] ?? null : data ?? null;
}

async function rpc(client, name, args, message = "Beacon is temporarily unavailable.") {
  const { data, error } = await client.rpc(name, args);
  if (error) {
    throw new BeaconError("server_unavailable", 503, message, {
      category: `rpc_${name}_failed`,
    });
  }
  return data;
}

export async function resolveAccessContext({
  serviceClient,
  actor,
  companySelector,
  registeredSuperAdmin,
}) {
  const data = await rpc(
    serviceClient,
    SQL_CONTRACT.serviceRpcs.resolveAccessContext,
    {
      p_actor_auth_user_id: actor.id,
      p_actor_email: actor.email,
      p_company_selector: companySelector,
    },
    "Beacon access could not be verified.",
  );
  const row = firstRow(data);
  if (!row || !isUuid(row.company_id) || !BEACON_ROLES.includes(row.role)) {
    throw new BeaconError(
      "access_denied",
      403,
      "Beacon access is not available for this company.",
    );
  }
  if (row.membership_active !== true) {
    throw new BeaconError(
      "access_denied",
      403,
      "Beacon access is not available for this account.",
    );
  }
  if (row.role === "super_admin" && registeredSuperAdmin !== true) {
    throw new BeaconError("access_denied", 403, "Beacon access is not available.");
  }
  if (registeredSuperAdmin === true && row.role !== "super_admin") {
    throw new BeaconError("access_denied", 403, "Beacon access is not available.");
  }
  if (row.role !== "super_admin" && !isUuid(row.member_id)) {
    throw new BeaconError("access_denied", 403, "Beacon access is not available.");
  }

  return {
    companyId: row.company_id,
    companyLegacyId:
      typeof row.company_legacy_id === "string" ? row.company_legacy_id : null,
    role: row.role,
    memberId: isUuid(row.member_id) ? row.member_id : null,
    csmAssignmentLedgerReady: row.csm_assignment_ledger_ready === true,
  };
}

export async function loadFeatureGate(serviceClient, context) {
  const data = await rpc(
    serviceClient,
    SQL_CONTRACT.serviceRpcs.featureGate,
    {
      p_company_id: context.companyId,
      p_feature_key: BEACON_FEATURE_KEY,
    },
    "Beacon feature status could not be verified.",
  );
  const row = firstRow(data);
  if (
    !row ||
    !GLOBAL_FEATURE_STATUSES.includes(row.global_status) ||
    !FEATURE_STATUSES.includes(row.feature_status) ||
    !ALLOWANCE_STATUSES.includes(row.allowance_status)
  ) {
    throw new BeaconError(
      "feature_status_unavailable",
      503,
      "Beacon feature status could not be verified.",
    );
  }
  return {
    globalStatus: row.global_status,
    featureStatus: row.feature_status,
    allowanceStatus: row.allowance_status,
    limits:
      row.limits && typeof row.limits === "object" && !Array.isArray(row.limits)
        ? row.limits
        : null,
  };
}

export function accessDecision(context, gate) {
  const authorization = authorizationDecision(context);
  if (!authorization.allowed) return authorization;
  if (!gate) {
    return { allowed: false, reasonCode: "feature_status_unavailable" };
  }
  if (gate.globalStatus !== "active") {
    return { allowed: false, reasonCode: "global_unavailable" };
  }
  if (gate.featureStatus === "disabled") {
    return { allowed: false, reasonCode: "feature_disabled" };
  }
  if (gate.featureStatus === "paused") {
    return { allowed: false, reasonCode: "feature_paused" };
  }
  if (gate.allowanceStatus === "missing") {
    return { allowed: false, reasonCode: "allowance_missing" };
  }
  if (gate.allowanceStatus === "paused") {
    return { allowed: false, reasonCode: "allowance_paused" };
  }
  if (gate.allowanceStatus === "exhausted") {
    return { allowed: false, reasonCode: "allowance_exhausted" };
  }
  return { allowed: true, reasonCode: null };
}

export function authorizationDecision(context) {
  if (context.role === "viewer") {
    return { allowed: false, reasonCode: "role_not_allowed" };
  }
  if (context.role === "csm" && !context.csmAssignmentLedgerReady) {
    return { allowed: false, reasonCode: "assignment_ledger_unavailable" };
  }
  return { allowed: true, reasonCode: null };
}

export async function reserveUsage({
  serviceClient,
  requestId,
  actor,
  context,
  inputChars,
}) {
  const data = await rpc(
    serviceClient,
    SQL_CONTRACT.serviceRpcs.reserveUsage,
    {
      p_request_id: requestId,
      p_feature_key: BEACON_FEATURE_KEY,
      p_company_id: context.companyId,
      p_actor_auth_user_id: actor.id,
      p_actor_member_id: context.memberId,
      p_actor_role: context.role,
      p_reserved_cost_micros: LIMITS.maxReservedCostMicros,
      p_input_chars: inputChars,
      p_release_version: RELEASE_VERSION,
    },
    "Beacon usage limits could not be verified.",
  );
  const row = firstRow(data);
  if (!row || typeof row.accepted !== "boolean") {
    throw new BeaconError(
      "quota_unavailable",
      503,
      "Beacon usage limits could not be verified.",
    );
  }
  if (!row.accepted) {
    const reason = typeof row.reason_code === "string"
      ? row.reason_code
      : "quota_unavailable";
    const retryAfter = Number.isInteger(row.retry_after_seconds)
      ? Math.max(1, Math.min(300, row.retry_after_seconds))
      : 60;
    if ([
      "company_unavailable",
      "role_not_allowed",
      "assignment_ledger_unavailable",
      "feature_disabled",
      "feature_paused",
    ].includes(reason)) {
      throw new BeaconError(
        "access_denied",
        403,
        "Beacon access is not available for this account or company.",
        { category: `reserve_${reason}` },
      );
    }
    if (reason === "global_unavailable") {
      throw new BeaconError(
        reason,
        503,
        "Beacon is temporarily unavailable for all companies.",
        { category: "reserve_global_unavailable" },
      );
    }
    const quotaReasons = [
      "actor_concurrency_limited",
      "actor_minute_limited",
      "actor_daily_limited",
      "company_minute_limited",
      "company_daily_limited",
      "allowance_missing",
      "allowance_exhausted",
      "reservation_cost_too_large",
    ];
    if (!quotaReasons.includes(reason)) {
      throw new BeaconError(
        "quota_unavailable",
        503,
        "Beacon usage limits could not be verified.",
        { category: `reserve_${reason}` },
      );
    }
    throw new BeaconError(
      reason,
      429,
      "Beacon's current usage limit has been reached. Please try again later.",
      { retryAfterSeconds: retryAfter, category: "quota_denied" },
    );
  }
  if (!isUuid(row.reservation_id)) {
    throw new BeaconError(
      "quota_unavailable",
      503,
      "Beacon usage limits could not be verified.",
    );
  }
  return { reservationId: row.reservation_id };
}

export async function finalizeUsage({
  serviceClient,
  reservationId,
  requestId,
  outcome,
  usage,
  toolActivity,
  latencyMs,
  providerResponseId,
  truncated,
  costUncertain,
}) {
  const toolNames = [...new Set(toolActivity.map((entry) => entry.tool))];
  const toolRowCount = toolActivity.reduce(
    (total, entry) => total + (Number.isInteger(entry.rowCount) ? entry.rowCount : 0),
    0,
  );
  const data = await rpc(
    serviceClient,
    SQL_CONTRACT.serviceRpcs.finalizeUsage,
    {
      p_reservation_id: reservationId,
      p_request_id: requestId,
      p_outcome: outcome,
      p_model: usage.model,
      p_input_tokens: usage.inputTokens,
      p_cached_input_tokens: usage.cachedInputTokens,
      p_output_tokens: usage.outputTokens,
      p_reasoning_tokens: usage.reasoningTokens,
      p_estimated_cost_micros: usage.estimatedCostMicros,
      p_tool_names: toolNames,
      p_tool_call_count: toolActivity.length,
      p_tool_row_count: toolRowCount,
      p_latency_ms: Math.max(0, Math.round(latencyMs)),
      p_provider_response_id: providerResponseId,
      p_truncated: truncated === true,
      p_cost_uncertain: costUncertain === true,
      p_release_version: RELEASE_VERSION,
    },
    "Beacon usage could not be finalized.",
  );
  const row = firstRow(data);
  if (!row || row.finalized !== true) {
    throw new BeaconError(
      "usage_finalize_failed",
      503,
      "Beacon usage could not be finalized.",
      { category: "usage_finalize_invariant" },
    );
  }
}

export async function listFeatureCards(serviceClient, context, actor) {
  return rpc(
    serviceClient,
    SQL_CONTRACT.serviceRpcs.adminListFeatures,
    {
      p_company_id: context.companyId,
      p_actor_auth_user_id: actor.id,
    },
    "AI feature settings could not be loaded.",
  );
}

export async function updateFeatureCard(serviceClient, context, actor, request) {
  return rpc(
    serviceClient,
    SQL_CONTRACT.serviceRpcs.adminUpdateFeature,
    {
      p_company_id: context.companyId,
      p_actor_auth_user_id: actor.id,
      p_feature_key: request.featureKey,
      p_status: request.status,
      p_allowances: request.allowances.map((allowance) => ({
        meter_type: allowance.meterType,
        limit_value: allowance.limitValue,
        period_type: allowance.periodType,
        warning_thresholds: allowance.warningThresholds,
      })),
    },
    "AI feature settings could not be updated.",
  );
}
