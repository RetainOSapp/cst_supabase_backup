import { supabase } from "./supabase.ts";

export type BeaconAuthorizedRole = "super_admin" | "director" | "support" | "csm";
export type BeaconResolvedRole = BeaconAuthorizedRole | "viewer";
export type BeaconFeatureStatus = "disabled" | "pilot" | "enabled" | "paused";
export type BeaconConfigurableRole = "director" | "support" | "csm";

export interface BeaconAccessLimits {
  maxInputCharacters?: number;
  maxHistoryMessages?: number;
  remainingRequests?: number | null;
  remainingBudgetCents?: number | null;
  retryAfterSeconds?: number | null;
}

export interface BeaconAccessResponse {
  allowed: boolean;
  enabled: boolean;
  featureStatus: BeaconFeatureStatus;
  role?: BeaconResolvedRole;
  companyId?: string;
  reasonCode?: string;
  suggestedPrompts?: string[];
  limits?: BeaconAccessLimits;
}

export interface BeaconHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface BeaconToolActivity {
  tool: string;
  status: "requested" | "completed" | "limited" | "failed";
}

export interface BeaconSafeLink {
  label: string;
  path: string;
}

export interface BeaconChatResponse {
  requestId: string;
  answer: string;
  toolActivity: BeaconToolActivity[];
  truncated?: boolean;
  links?: BeaconSafeLink[];
  usage?: {
    remainingRequests?: number | null;
    remainingBudgetCents?: number | null;
  };
}

export type AiFeatureKey =
  | "beacon"
  | "call_analysis"
  | "sentiment_analysis"
  | "automated_summaries"
  | "slack_data"
  | (string & {});

export type AiFeatureMeterType =
  | "usd_cents"
  | "analysis_count"
  | "token_count"
  | "request_count";

export type AiFeaturePeriodType = "one_time" | "monthly";

export interface AiFeatureAllowance {
  id?: string;
  meterType: AiFeatureMeterType;
  periodType: AiFeaturePeriodType;
  limitValue: number;
  usedValue: number;
  warningThresholds: number[];
  periodStartedAt?: string | null;
  periodEndsAt?: string | null;
}

export interface ManagedAiFeature {
  featureKey: AiFeatureKey;
  label: string;
  description?: string;
  status: BeaconFeatureStatus;
  allowances: AiFeatureAllowance[];
  allowedRoles: BeaconConfigurableRole[];
  enabledAt?: string | null;
  pausedAt?: string | null;
  updatedAt?: string | null;
}

interface AiFeatureListResponse {
  features: ManagedAiFeature[];
}

interface AiFeatureUpdateResponse {
  feature: ManagedAiFeature;
}

export class BeaconApiError extends Error {
  readonly code: string;
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    code = "request_failed",
    retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "BeaconApiError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function responseError(value: unknown) {
  const body = objectValue(value);
  if (!body) return null;
  if (body.ok !== false && typeof body.error !== "string") return null;
  return new BeaconApiError(
    typeof body.error === "string" ? body.error : "The request could not be completed.",
    typeof body.code === "string" ? body.code : "request_failed",
    typeof body.retryAfterSeconds === "number" ? body.retryAfterSeconds : null,
  );
}

function malformedResponse() {
  return new BeaconApiError(
    "Beacon returned an invalid response. Please try again.",
    "invalid_response",
  );
}

function boundedString(value: unknown, maximum: number, required = false) {
  if (typeof value !== "string") {
    if (!required && value == null) return undefined;
    throw malformedResponse();
  }
  if ((required && value.trim().length === 0) || value.length > maximum) {
    throw malformedResponse();
  }
  return value;
}

function optionalNonnegativeNumber(value: unknown) {
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw malformedResponse();
  }
  return value;
}

function nonnegativeInteger(value: unknown, positive = false) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < (positive ? 1 : 0) ||
    value > 1_000_000_000
  ) {
    throw malformedResponse();
  }
  return value;
}

function parseAiFeatureAllowance(value: unknown): AiFeatureAllowance {
  const allowance = objectValue(value);
  if (!allowance) throw malformedResponse();
  const meterType = String(allowance.meterType);
  const periodType = String(allowance.periodType);
  const rawWarningThresholds = allowance.warningThresholds;
  if (
    !["usd_cents", "analysis_count", "token_count", "request_count"].includes(
      meterType,
    ) ||
    !["one_time", "monthly"].includes(periodType) ||
    !Array.isArray(rawWarningThresholds) ||
    rawWarningThresholds.length < 1 ||
    rawWarningThresholds.length > 4
  ) {
    throw malformedResponse();
  }
  const warningThresholds = rawWarningThresholds.map((threshold, index) => {
    const parsed = nonnegativeInteger(threshold, true);
    if (
      parsed > 99 ||
      (index > 0 && parsed <= Number(rawWarningThresholds[index - 1]))
    ) {
      throw malformedResponse();
    }
    return parsed;
  });
  return {
    id: boundedString(allowance.id, 200),
    meterType: meterType as AiFeatureMeterType,
    periodType: periodType as AiFeaturePeriodType,
    limitValue: nonnegativeInteger(allowance.limitValue, true),
    usedValue: nonnegativeInteger(allowance.usedValue),
    warningThresholds,
    periodStartedAt: boundedString(allowance.periodStartedAt, 60) ?? null,
    periodEndsAt: boundedString(allowance.periodEndsAt, 60) ?? null,
  };
}

function parseManagedAiFeature(value: unknown): ManagedAiFeature {
  const feature = objectValue(value);
  if (!feature || !Array.isArray(feature.allowances) || feature.allowances.length > 4) {
    throw malformedResponse();
  }
  const status = String(feature.status);
  if (!["disabled", "pilot", "enabled", "paused"].includes(status)) {
    throw malformedResponse();
  }
  const allowances = feature.allowances.map(parseAiFeatureAllowance);
  if (new Set(allowances.map(({ meterType }) => meterType)).size !== allowances.length) {
    throw malformedResponse();
  }
  const featureKey = boundedString(feature.featureKey, 100, true) as AiFeatureKey;
  const rawAllowedRoles = feature.allowedRoles ?? [];
  if (
    !Array.isArray(rawAllowedRoles) ||
    rawAllowedRoles.length > 3 ||
    new Set(rawAllowedRoles).size !== rawAllowedRoles.length ||
    rawAllowedRoles.some((role) => !["director", "support", "csm"].includes(String(role)))
  ) {
    throw malformedResponse();
  }
  if (
    featureKey === "beacon" &&
    (allowances.length > 1 ||
      (allowances.length === 1 && allowances[0].meterType !== "usd_cents"))
  ) {
    throw malformedResponse();
  }
  return {
    featureKey,
    label: boundedString(feature.label, 120, true) as string,
    description: boundedString(feature.description, 500),
    status: status as BeaconFeatureStatus,
    allowances,
    allowedRoles: rawAllowedRoles as BeaconConfigurableRole[],
    enabledAt: boundedString(feature.enabledAt, 60) ?? null,
    pausedAt: boundedString(feature.pausedAt, 60) ?? null,
    updatedAt: boundedString(feature.updatedAt, 60) ?? null,
  };
}

function parseAiFeatureList(value: unknown): AiFeatureListResponse {
  const body = objectValue(value);
  if (!body || !Array.isArray(body.features) || body.features.length > 20) {
    throw malformedResponse();
  }
  const features = body.features.map(parseManagedAiFeature);
  if (new Set(features.map(({ featureKey }) => featureKey)).size !== features.length) {
    throw malformedResponse();
  }
  return { features };
}

function parseAiFeatureUpdate(value: unknown): AiFeatureUpdateResponse {
  const body = objectValue(value);
  if (!body) throw malformedResponse();
  return { feature: parseManagedAiFeature(body.feature) };
}

function parseBeaconAccess(value: unknown): BeaconAccessResponse {
  const body = objectValue(value);
  if (!body || typeof body.allowed !== "boolean" || typeof body.enabled !== "boolean") {
    throw malformedResponse();
  }
  if (!["disabled", "pilot", "enabled", "paused"].includes(String(body.featureStatus))) {
    throw malformedResponse();
  }
  const role = body.role == null ? undefined : String(body.role);
  if (role && !["super_admin", "director", "support", "csm", "viewer"].includes(role)) {
    throw malformedResponse();
  }
  if (
    body.allowed === true &&
    (
      body.enabled !== true ||
      !role ||
      role === "viewer" ||
      !["pilot", "enabled"].includes(String(body.featureStatus))
    )
  ) {
    throw malformedResponse();
  }
  const rawLimits = body.limits == null ? null : objectValue(body.limits);
  if (body.limits != null && !rawLimits) throw malformedResponse();
  const rawPrompts = body.suggestedPrompts;
  if (rawPrompts != null && !Array.isArray(rawPrompts)) throw malformedResponse();
  const suggestedPrompts = Array.isArray(rawPrompts)
    ? rawPrompts.slice(0, 4).map((prompt) => boundedString(prompt, 200, true) as string)
    : undefined;

  return {
    allowed: body.allowed,
    enabled: body.enabled,
    featureStatus: String(body.featureStatus) as BeaconFeatureStatus,
    role: role as BeaconResolvedRole | undefined,
    companyId: boundedString(body.companyId, 200),
    reasonCode: boundedString(body.reasonCode, 100),
    suggestedPrompts,
    limits: rawLimits
      ? {
          maxInputCharacters: optionalNonnegativeNumber(rawLimits.maxInputCharacters),
          maxHistoryMessages: optionalNonnegativeNumber(rawLimits.maxHistoryMessages),
          remainingRequests: optionalNonnegativeNumber(rawLimits.remainingRequests) ?? null,
          remainingBudgetCents:
            optionalNonnegativeNumber(rawLimits.remainingBudgetCents) ?? null,
          retryAfterSeconds: optionalNonnegativeNumber(rawLimits.retryAfterSeconds) ?? null,
        }
      : undefined,
  };
}

function parseBeaconChat(value: unknown): BeaconChatResponse {
  const body = objectValue(value);
  if (!body) throw malformedResponse();
  const requestId = boundedString(body.requestId, 200, true) as string;
  const answer = boundedString(body.answer, 20_000, true) as string;
  if (!Array.isArray(body.toolActivity) || body.toolActivity.length > 10) {
    throw malformedResponse();
  }
  const toolActivity = body.toolActivity.map((item) => {
    const activity = objectValue(item);
    if (!activity) throw malformedResponse();
    const tool = boundedString(activity.tool, 100, true) as string;
    const status = String(activity.status);
    if (!["requested", "completed", "limited", "failed"].includes(status)) {
      throw malformedResponse();
    }
    return { tool, status: status as BeaconToolActivity["status"] };
  });
  if (body.links != null && (!Array.isArray(body.links) || body.links.length > 8)) {
    throw malformedResponse();
  }
  const links = Array.isArray(body.links)
    ? body.links.map((item) => {
        const link = objectValue(item);
        if (!link) throw malformedResponse();
        return {
          label: boundedString(link.label, 120, true) as string,
          path: boundedString(link.path, 500, true) as string,
        };
      })
    : undefined;
  const rawUsage = body.usage == null ? null : objectValue(body.usage);
  if (body.usage != null && !rawUsage) throw malformedResponse();

  return {
    requestId,
    answer,
    toolActivity,
    truncated: body.truncated === true,
    links,
    usage: rawUsage
      ? {
          remainingRequests:
            optionalNonnegativeNumber(rawUsage.remainingRequests) ?? null,
          remainingBudgetCents:
            optionalNonnegativeNumber(rawUsage.remainingBudgetCents) ?? null,
        }
      : undefined,
  };
}

async function invokeSignedFunction<T>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new BeaconApiError(
      "Your session has ended. Sign in again to continue.",
      "unauthenticated",
    );
  }

  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) {
    const context = "context" in error ? error.context : null;
    let errorBody: unknown = null;
    if (context instanceof Response) {
      try {
        errorBody = await context.clone().json();
      } catch {
        // Non-JSON failures use the generic message below.
      }
    }
    const structuredError = responseError(errorBody);
    if (structuredError) throw structuredError;
    const retryAfterHeader =
      context instanceof Response ? Number(context.headers.get("Retry-After")) : NaN;
    throw new BeaconApiError(
      "The request could not be completed.",
      context instanceof Response && context.status === 429
        ? "rate_limited"
        : "request_failed",
      Number.isFinite(retryAfterHeader) && retryAfterHeader >= 0
        ? retryAfterHeader
        : null,
    );
  }

  const structuredError = responseError(data);
  if (structuredError) throw structuredError;
  return data as T;
}

export async function loadBeaconAccess(companyId: string) {
  const response = await invokeSignedFunction<unknown>("beacon-access", { companyId });
  return parseBeaconAccess(response);
}

export async function sendBeaconMessage(input: {
  companyId: string;
  message: string;
  history: BeaconHistoryMessage[];
}) {
  const response = await invokeSignedFunction<unknown>("beacon-chat", input);
  return parseBeaconChat(response);
}

export async function listManagedAiFeatures(companyId: string) {
  const response = await invokeSignedFunction<unknown>(
    "manage-ai-feature-entitlement",
    { action: "list", companyId },
  );
  return parseAiFeatureList(response);
}

export async function updateManagedAiFeature(input: {
  companyId: string;
  featureKey: AiFeatureKey;
  status: BeaconFeatureStatus;
  allowances: AiFeatureAllowance[];
}) {
  const allowancePolicies = input.allowances.map((allowance) => ({
    meterType: allowance.meterType,
    periodType: allowance.periodType,
    limitValue: allowance.limitValue,
    warningThresholds: allowance.warningThresholds,
  }));
  const response = await invokeSignedFunction<unknown>(
    "manage-ai-feature-entitlement",
    { action: "update", ...input, allowances: allowancePolicies },
  );
  const parsed = parseAiFeatureUpdate(response);
  if (parsed.feature.featureKey !== input.featureKey) throw malformedResponse();
  return parsed;
}

export async function updateManagedAiFeatureAccess(input: {
  companyId: string;
  featureKey: "beacon";
  allowedRoles: BeaconConfigurableRole[];
}) {
  const response = await invokeSignedFunction<unknown>(
    "manage-ai-feature-entitlement",
    { action: "update_access", ...input },
  );
  const body = objectValue(response);
  if (!body || body.featureKey !== "beacon" || !Array.isArray(body.allowedRoles)) {
    throw malformedResponse();
  }
  const allowedRoles = body.allowedRoles.map(String);
  if (
    allowedRoles.length > 3 ||
    new Set(allowedRoles).size !== allowedRoles.length ||
    allowedRoles.some((role) => !["director", "support", "csm"].includes(role))
  ) {
    throw malformedResponse();
  }
  return { featureKey: "beacon" as const, allowedRoles: allowedRoles as BeaconConfigurableRole[] };
}
