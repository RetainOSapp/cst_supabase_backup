import { LIMITS } from "../beacon-chat/_shared/contracts.mjs";
import { resolveBeaconAccess } from "../beacon-chat/_shared/access.mjs";
import { parseAccessBody } from "../beacon-chat/_shared/validation.mjs";

function nonnegativeNumber(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function publicLimits(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    maxInputCharacters: LIMITS.maxUserMessageChars,
    maxHistoryMessages: LIMITS.maxHistoryItems,
    remainingRequests: nonnegativeNumber(
      source.remainingRequests ?? source.remaining_requests,
    ),
    remainingBudgetCents: nonnegativeNumber(
      source.remainingBudgetCents ?? source.remaining_budget_cents,
    ),
    retryAfterSeconds: nonnegativeNumber(
      source.retryAfterSeconds ?? source.retry_after_seconds,
    ),
  };
}

function entitlementEnabled(gate) {
  return gate.globalStatus === "active" &&
    (gate.featureStatus === "pilot" || gate.featureStatus === "enabled") &&
    gate.allowanceStatus === "active";
}

export async function handleBeaconAccess({
  body,
  token,
  serviceClient,
  authenticate,
  checkRegisteredSuperAdmin,
}) {
  const request = parseAccessBody(body);
  const access = await resolveBeaconAccess({
    serviceClient,
    token,
    companyId: request.companyId,
    authenticate,
    checkRegisteredSuperAdmin,
  });

  if (!access.gate) {
    return {
      allowed: false,
      enabled: false,
      featureStatus: "disabled",
      role: access.context.role,
      reasonCode: access.decision.reasonCode ?? "access_denied",
    };
  }

  return {
    allowed: access.decision.allowed,
    enabled: entitlementEnabled(access.gate),
    featureStatus: access.gate.featureStatus,
    role: access.context.role,
    companyId: access.context.companyId,
    ...(access.decision.reasonCode
      ? { reasonCode: access.decision.reasonCode }
      : {}),
    limits: publicLimits(access.gate.limits),
  };
}
